import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
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
  readonly logger?: Logger;
  /** Request id generator (tests). */
  readonly newRequestId?: () => string;
  /** Overrides the connection timeouts (tests); production uses {@link DEFAULT_TIMEOUTS}. */
  readonly timeouts?: Partial<HttpTimeouts>;
}

/** Slow-client protections, in milliseconds. */
export interface HttpTimeouts {
  readonly headersTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly keepAliveTimeoutMs: number;
  /** How often Node checks connections against the two timeouts above (its default of 30 s makes them late). */
  readonly checkIntervalMs: number;
}

/** Production connection timeouts. */
export const DEFAULT_TIMEOUTS: HttpTimeouts = { headersTimeoutMs: 10_000, requestTimeoutMs: 15_000, keepAliveTimeoutMs: 5_000, checkIntervalMs: 1_000 };

/**
 * Canonical textual form of an IP literal for rate-limit keying, or `undefined` when `raw` is not one
 * (no zone ids, no hostnames, no junk). IPv4-mapped IPv6 maps to the IPv4 form.
 */
function normalizeIp(raw: string): string | undefined {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  const ip = mapped?.[1] ?? raw;
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind === 6 && !ip.includes('%')) return new URL(`http://[${ip}]`).hostname.slice(1, -1);
  return undefined;
}

/**
 * The rate-limit identity of a request: with `hops` trusted proxies, the `hops`-th entry from the RIGHT
 * of `X-Forwarded-For` (what the nearest trusted proxy appended; everything left of it is client
 * supplied). Anything that is not a plain IP literal, or a list shorter than `hops`, falls back to the
 * socket address so garbage values cannot mint new buckets.
 *
 * @param xff Raw header value(s).
 * @param peer Socket address.
 * @param hops Number of trusted proxies in front (0 ignores the header).
 * @returns Key material for the IP limiter.
 */
export function resolveClientIp(xff: string | readonly string[] | undefined, peer: string | undefined, hops: number): string {
  if (hops > 0 && xff !== undefined) {
    const parts = (typeof xff === 'string' ? xff : xff.join(',')).split(',');
    const hit = parts[parts.length - hops]?.trim();
    const ip = hit === undefined ? undefined : normalizeIp(hit);
    if (ip !== undefined) return ip;
  }
  return peer ?? 'unknown';
}

type Route = '/healthz' | '/v1/info' | '/v1/quote' | '/v1/sweep';
const ROUTES: Readonly<Record<Route, 'GET' | 'POST'>> = {
  '/healthz': 'GET',
  '/v1/info': 'GET',
  '/v1/quote': 'POST',
  '/v1/sweep': 'POST',
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
function readBody(req: IncomingMessage, cap: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = req.headers['content-length'];
    if (declared !== undefined) {
      // Node's HTTP parser already guarantees a numeric Content-Length.
      if (Number(declared) > cap) return reject(new RelayerError(413, 'body_too_large'));
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const finish = (fn: () => void): void => {
      if (done) return;
      done = true;
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

  public constructor(private readonly d: HttpDeps) {
    this.origins = new Set(d.config.allowedOrigins);
    this.logger = d.logger ?? nullLogger;
    const tm = { ...DEFAULT_TIMEOUTS, ...d.timeouts };
    this.server = createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: tm.checkIntervalMs }, (req, res) => {
      void this.handle(req, res);
    });
    this.server.headersTimeout = tm.headersTimeoutMs;
    this.server.requestTimeout = tm.requestTimeoutMs;
    this.server.keepAliveTimeout = tm.keepAliveTimeoutMs;
    this.server.maxConnections = 1024;
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

  private clientIp(req: IncomingMessage): string {
    return resolveClientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, this.d.config.trustProxyHops);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const c: Ctx = { req, res, requestId: this.d.newRequestId?.() ?? randomUUID(), route: 'other', status: 500, errorClass: undefined };
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.setHeader('Vary', 'Origin');
    try {
      await this.dispatch(c);
    } catch (e) {
      if (e instanceof RelayerError) {
        c.errorClass = e.code;
        const extra: Record<string, string> = {};
        if (e.retryAfterSeconds !== undefined) extra['Retry-After'] = String(e.retryAfterSeconds);
        if (e.status === 413 || e.status === 503) extra['Connection'] = 'close';
        this.send(c, e.status, { error: { code: e.code } }, extra);
        if (e.status === 413) res.once('finish', () => req.destroy());
      } else {
        c.errorClass = 'internal_error';
        this.send(c, 500, { error: { code: 'internal_error' } });
      }
    }
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
    if (this.draining) throw new RelayerError(503, 'shutting_down');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      c.status = 204;
      res.writeHead(204);
      res.end();
      return;
    }
    if (!isRoute(path)) throw new RelayerError(404, 'not_found');
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
      case '/v1/quote':
      case '/v1/sweep': {
        const ip = this.clientIp(req);
        const limit = this.d.ipLimiter.take(ip);
        if (!limit.ok) throw new RelayerError(429, 'rate_limited_ip', limit.retryAfterSeconds);
        const ct = req.headers['content-type'];
        if (ct === undefined || !JSON_TYPE.test(ct)) throw new RelayerError(415, 'unsupported_media_type');
        const body = parseJson(await readBody(req, MAX_BODY_BYTES));
        if (path === '/v1/quote') {
          this.send(c, 200, await this.d.service.quote(parseQuoteRequest(body)));
        } else {
          this.send(c, 200, await this.d.service.sweep(parseSweepRequest(body), { requestId: c.requestId, clientKey: this.d.ipLimiter.fingerprint(ip) }));
        }
        return;
      }
    }
  }
}
