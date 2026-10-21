import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { TrustedProxies, bucketIp } from './clientip.js';
import type { RelayerConfig } from './config.js';
import { RelayerError, invalid } from './errors.js';
import type { RateLimiter } from './limiter.js';
import { nullLogger, type Logger } from './log.js';
import type { RelayerService } from './service.js';
import { parseQuoteRequest, parseSweepRequest } from './validate.js';

/** Maximum accepted request body in bytes (16 KiB). */
export const MAX_BODY_BYTES = 16 * 1024;

/** Dependencies of {@link RelayerHttpServer}. */
export interface HttpDeps {
  readonly config: RelayerConfig;
  readonly service: RelayerService;
  readonly ipLimiter: RateLimiter;
  /** Global budget shared by every `/v1/quote` caller (each quote may cost an RPC call). */
  readonly quoteLimiter: RateLimiter;
  readonly logger?: Logger;
  /** Request id generator (tests). */
  readonly newRequestId?: () => string;
}

type Route = '/healthz' | '/v1/info' | '/v1/quote' | '/v1/sweep' | '/metrics';
const ROUTES: Readonly<Record<Route, 'GET' | 'POST'>> = {
  '/healthz': 'GET',
  '/v1/info': 'GET',
  '/v1/quote': 'POST',
  '/v1/sweep': 'POST',
  '/metrics': 'GET',
};

const JSON_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Permissions-Policy': 'interest-cohort=()',
};

interface Ctx {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly requestId: string;
  route: string;
  status: number;
  errorClass: string | undefined;
}

function isRoute(p: string): p is Route {
  return Object.hasOwn(ROUTES, p);
}

/** Reads the body with a hard byte cap, rejecting early on an oversized `Content-Length`. */
function readBody(req: IncomingMessage, cap: number, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = req.headers['content-length'];
    if (declared !== undefined) {
      // Node's HTTP parser already guarantees a numeric Content-Length.
      if (Number(declared) > cap) return reject(new RelayerError(413, 'body_too_large'));
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    // A client that trickles bytes (slowloris) must not hold the slot beyond the body deadline.
    const timer = setTimeout(() => {
      finish(() => reject(new RelayerError(408, 'request_timeout')));
    }, timeoutMs);
    const finish = (fn: () => void): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req.removeListener('data', onData);
      fn();
    };
    const onData = (c: Buffer): void => {
      total += c.length;
      if (total > cap) finish(() => reject(new RelayerError(413, 'body_too_large')));
      else chunks.push(c);
    };
    req.on('data', onData);
    req.once('end', () => finish(() => resolve(Buffer.concat(chunks))));
    req.once('error', () => finish(() => reject(invalid('body'))));
    req.once('close', () => finish(() => reject(invalid('body'))));
  });
}

function parseJson(buf: Buffer): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return JSON.parse(text) as unknown;
  } catch {
    throw invalid('json');
  }
}

/**
 * The HTTP front end: routing, CORS allowlist, security headers, body limits, IP rate limit and
 * graceful shutdown. All business rules live in {@link RelayerService}.
 */
export class RelayerHttpServer {
  private readonly server: Server;
  private readonly origins: ReadonlySet<string>;
  private readonly logger: Logger;
  private draining = false;
  private readonly proxies: TrustedProxies;
  private readonly connections = new Map<string, number>();
  private readonly metricsTokenDigest: Buffer | undefined;

  public constructor(private readonly d: HttpDeps) {
    this.origins = new Set(d.config.allowedOrigins);
    this.logger = d.logger ?? nullLogger;
    this.proxies = new TrustedProxies(d.config.trustProxy);
    const tok = d.config.metrics.bearerToken;
    this.metricsTokenDigest = tok === undefined ? undefined : createHash('sha256').update(tok).digest();
    const sv = d.config.server;
    this.server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
      void this.handle(req, res);
    });
    this.server.headersTimeout = sv.headersTimeoutMs;
    this.server.requestTimeout = sv.requestTimeoutMs;
    this.server.keepAliveTimeout = sv.keepAliveTimeoutMs;
    this.server.maxConnections = sv.maxConnections;
    this.server.maxHeadersCount = sv.maxHeadersCount;
    this.server.on('connection', (sock: Socket) => {
      this.admitConnection(sock);
    });
  }

  /** Per-peer connection cap (IPv6 by /64). Trusted proxies are exempt: they multiplex many clients. */
  private admitConnection(sock: Socket): void {
    const peer = sock.remoteAddress;
    if (peer === undefined || this.proxies.contains(peer)) return;
    const key = bucketIp(peer);
    const n = (this.connections.get(key) ?? 0) + 1;
    if (n > this.d.config.server.maxConnectionsPerIp) {
      sock.destroy();
      return;
    }
    this.connections.set(key, n);
    sock.once('close', () => {
      const left = (this.connections.get(key) ?? 1) - 1;
      if (left <= 0) this.connections.delete(key);
      else this.connections.set(key, left);
    });
  }

  /**
   * Starts listening on the configured host/port.
   *
   * @returns The bound address (port 0 binds an ephemeral port).
   */
  public listen(): Promise<AddressInfo> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.d.config.port, this.d.config.host, () => {
        this.server.removeListener('error', reject);
        resolve(this.server.address() as AddressInfo);
      });
    });
  }

  /**
   * Graceful shutdown: stop accepting, answer new requests 503, let queued sweeps settle, then close
   * all connections after the configured grace period at the latest.
   */
  public async close(): Promise<void> {
    this.draining = true;
    const closed = new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
    this.server.closeIdleConnections();
    const grace = new Promise<void>((resolve) => {
      const t = setTimeout(resolve, this.d.config.shutdownGraceSeconds * 1000);
      t.unref();
    });
    await Promise.race([Promise.all([this.d.service.shutdown(), closed]), grace]);
    this.server.closeAllConnections();
    await closed;
  }

  private send(c: Ctx, status: number, body: unknown, extra: Readonly<Record<string, string>> = {}): void {
    if (c.res.headersSent) return;
    const payload = JSON.stringify(body);
    c.status = status;
    c.res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      ...extra,
    });
    c.res.end(payload);
  }

  /** Bucket identity of the caller: `X-Forwarded-For` only counts when the TCP peer is a configured proxy. */
  private clientIp(req: IncomingMessage): string {
    return bucketIp(this.proxies.resolve(req.socket.remoteAddress, req.headers['x-forwarded-for']));
  }

  private authorizedForMetrics(req: IncomingMessage): boolean {
    if (this.metricsTokenDigest === undefined) {
      // No token means loopback-only scraping; a forwarded request came through a proxy and is refused.
      return req.headers['x-forwarded-for'] === undefined;
    }
    const h = req.headers.authorization;
    const m = typeof h === 'string' ? /^Bearer ([^\s]{1,512})$/.exec(h) : null;
    if (m?.[1] === undefined) return false;
    return timingSafeEqual(createHash('sha256').update(m[1]).digest(), this.metricsTokenDigest);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const c: Ctx = { req, res, requestId: this.d.newRequestId?.() ?? randomUUID(), route: 'other', status: 500, errorClass: undefined };
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.setHeader('Vary', 'Origin');
    if (this.draining) res.setHeader('Connection', 'close');
    try {
      await this.dispatch(c);
    } catch (e) {
      if (e instanceof RelayerError) {
        c.errorClass = e.code;
        const extra: Record<string, string> = {};
        if (e.retryAfterSeconds !== undefined) extra['Retry-After'] = String(e.retryAfterSeconds);
        if (e.status === 413 || e.status === 503 || e.status === 408) extra['Connection'] = 'close';
        this.send(c, e.status, { error: { code: e.code } }, extra);
        if (e.status === 413) res.once('finish', () => req.destroy());
      } else {
        c.errorClass = 'internal_error';
        this.send(c, 500, { error: { code: 'internal_error' } });
      }
    }
    this.d.service.metrics.inc('ghostpay_relayer_http_requests_total', { route: c.route, status: c.status });
    if (c.errorClass !== undefined) this.d.service.metrics.inc('ghostpay_relayer_errors_total', { class: c.errorClass });
    this.logger.log(c.status >= 500 ? 'error' : 'info', 'request', {
      requestId: c.requestId,
      route: c.route,
      status: c.status,
      ...(c.errorClass === undefined ? {} : { errorClass: c.errorClass }),
    });
  }

  private async dispatch(c: Ctx): Promise<void> {
    const { req, res } = c;
    const path = new URL(req.url ?? '/', 'http://relayer.invalid').pathname;
    if (isRoute(path)) c.route = path;

    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!this.origins.has(origin)) throw new RelayerError(403, 'origin_not_allowed');
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    // /healthz keeps answering while draining so orchestrators see `shutting_down` rather than a refused request.
    if (this.draining && path !== '/healthz') throw new RelayerError(503, 'shutting_down');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      c.status = 204;
      res.writeHead(204);
      res.end();
      return;
    }
    if (!isRoute(path) || (path === '/metrics' && !this.d.config.metrics.enabled)) throw new RelayerError(404, 'not_found');
    if (req.method !== ROUTES[path]) {
      res.setHeader('Allow', ROUTES[path]);
      throw new RelayerError(405, 'method_not_allowed');
    }

    switch (path) {
      case '/healthz': {
        const h = this.d.service.health();
        this.send(c, h.status === 'ok' ? 200 : 503, h);
        return;
      }
      case '/v1/info':
        this.send(c, 200, this.d.service.info());
        return;
      case '/metrics': {
        const l = this.d.ipLimiter.take(this.clientIp(req));
        if (!l.ok) throw new RelayerError(429, 'rate_limited_ip', l.retryAfterSeconds);
        if (!this.authorizedForMetrics(req)) {
          res.setHeader('WWW-Authenticate', 'Bearer');
          throw new RelayerError(401, 'unauthorized');
        }
        const text = this.d.service.renderMetrics();
        c.status = 200;
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
        return;
      }
      case '/v1/quote':
      case '/v1/sweep': {
        const limit = this.d.ipLimiter.take(this.clientIp(req));
        if (!limit.ok) throw new RelayerError(429, 'rate_limited_ip', limit.retryAfterSeconds);
        if (path === '/v1/quote') {
          const ql = this.d.quoteLimiter.take('quote');
          if (!ql.ok) throw new RelayerError(429, 'rate_limited_quote', ql.retryAfterSeconds);
        }
        const ct = req.headers['content-type'];
        if (ct === undefined || !JSON_TYPE.test(ct)) throw new RelayerError(415, 'unsupported_media_type');
        const body = parseJson(await readBody(req, MAX_BODY_BYTES, this.d.config.server.bodyTimeoutMs));
        if (path === '/v1/quote') {
          this.send(c, 200, await this.d.service.quote(parseQuoteRequest(body)));
        } else {
          this.send(c, 200, await this.d.service.sweep(parseSweepRequest(body), { requestId: c.requestId }));
        }
        return;
      }
    }
  }
}
