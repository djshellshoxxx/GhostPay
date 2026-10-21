import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TrustedProxies, bucketKey, resolveClientIp } from '@ghostpay/relayer-guard';
import type { RelayerConfig } from './config.js';
import { RelayerError, invalid } from './errors.js';
import { nullLogger, type Logger } from './log.js';
import type { PoolRelayerService } from './service.js';
import { parseQuoteRequest, parseRelayRequest } from './validate.js';

/** Maximum accepted request body (16 KiB). */
export const MAX_BODY_BYTES = 16 * 1024;

/** Dependencies of {@link PoolRelayerHttpServer}. */
export interface HttpDeps {
  readonly config: RelayerConfig;
  readonly service: PoolRelayerService;
  readonly logger?: Logger;
  readonly newRequestId?: () => string;
}

type Route = '/healthz' | '/v1/info' | '/v1/quote' | '/v1/relay';
const ROUTES: Readonly<Record<Route, 'GET' | 'POST'>> = { '/healthz': 'GET', '/v1/info': 'GET', '/v1/quote': 'POST', '/v1/relay': 'POST' };
const JSON_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
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

function readBody(req: IncomingMessage, cap: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) > cap) return reject(new RelayerError(413, 'body_too_large'));
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const finish = (fn: () => void): void => {
      if (done) return;
      done = true;
      fn();
    };
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > cap) finish(() => reject(new RelayerError(413, 'body_too_large')));
      else chunks.push(c);
    });
    req.once('end', () => finish(() => resolve(Buffer.concat(chunks))));
    req.once('error', () => finish(() => reject(invalid('body'))));
    req.once('close', () => finish(() => reject(invalid('body'))));
  });
}

function parseJson(buf: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)) as unknown;
  } catch {
    throw invalid('json');
  }
}

/**
 * node:http front end: routing, CORS allowlist, security headers, body limits, client address
 * resolution. All business rules live in {@link PoolRelayerService}.
 *
 * @security Request bodies are never logged or stored. The client address is used only as an
 *   in-memory rate-limit key (masked by `bucketKey`).
 */
export class PoolRelayerHttpServer {
  private readonly server: Server;
  private readonly origins: ReadonlySet<string>;
  private readonly trusted: TrustedProxies;
  private readonly logger: Logger;
  private draining = false;

  public constructor(private readonly d: HttpDeps) {
    this.origins = new Set(d.config.allowedOrigins);
    this.trusted = new TrustedProxies(d.config.trustedProxies);
    this.logger = d.logger ?? nullLogger;
    this.server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
      void this.handle(req, res);
    });
    this.server.headersTimeout = 10_000;
    this.server.requestTimeout = 120_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxConnections = 1024;
  }

  /** Starts listening on the configured host and port (port 0 binds an ephemeral one). */
  public listen(): Promise<AddressInfo> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.d.config.port, this.d.config.host, () => {
        this.server.removeListener('error', reject);
        resolve(this.server.address() as AddressInfo);
      });
    });
  }

  /** Stops accepting, answers 503 while draining, closes all connections. */
  public async close(): Promise<void> {
    this.draining = true;
    const closed = new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
    this.server.closeIdleConnections();
    await new Promise((r) => setTimeout(r, 10));
    this.server.closeAllConnections();
    await closed;
  }

  private send(c: Ctx, status: number, body: unknown, extra: Readonly<Record<string, string>> = {}): void {
    if (c.res.headersSent) return;
    const payload = JSON.stringify(body, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
    c.status = status;
    c.res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), ...extra });
    c.res.end(payload);
  }

  private clientKey(req: IncomingMessage): string {
    const r = resolveClientIp({ peer: req.socket.remoteAddress, forwardedFor: req.headers['x-forwarded-for'], trusted: this.trusted });
    if (r === null) throw invalid('bad_client');
    return bucketKey(r.ip);
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
    this.logger.log(c.status >= 500 ? 'error' : 'info', 'request', { requestId: c.requestId, route: c.route, status: c.status, ...(c.errorClass === undefined ? {} : { errorClass: c.errorClass }) });
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
      case '/v1/relay': {
        const ctx = { clientKey: this.clientKey(req), requestId: c.requestId };
        const ct = req.headers['content-type'];
        if (ct === undefined || !JSON_TYPE.test(ct)) throw new RelayerError(415, 'unsupported_media_type');
        const body = parseJson(await readBody(req, MAX_BODY_BYTES));
        if (path === '/v1/quote') this.send(c, 200, await this.d.service.quote(parseQuoteRequest(body), ctx));
        else this.send(c, 200, await this.d.service.relay(parseRelayRequest(body), ctx));
      }
    }
  }
}
