import { createServer, type Server } from 'node:http';
import { bucketKey, resolveClientIp, type BucketPrefixes, type TrustedProxies } from '@ghostpay/relayer-guard';
import { PayerSponsorError, type PayerSponsorErrorCode } from '../errors.js';
import type { SponsorService } from './service.js';
import {
  bigintReplacer,
  obj,
  parseEip7702Submit,
  parseQuoteRequest,
  parseRelaySubmit,
  parseUserOpRequest,
  sponsoredMode,
} from './wire.js';

/** Transport-neutral request (one `node:http` request reduced to what the handler needs). */
export interface HttpRequestLike {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** `req.socket.remoteAddress`. */
  readonly peer: string | undefined;
  readonly body: string;
}

/** Transport-neutral response. */
export interface HttpResponseLike {
  readonly status: number;
  readonly body: string;
}

/** Handler options. */
export interface HttpHandlerOptions {
  readonly service: SponsorService;
  /** Reverse proxies whose `X-Forwarded-For` is honoured (S3-07); empty = none. */
  readonly trusted: TrustedProxies;
  readonly maxBodyBytes: number;
  readonly bucketPrefixes?: BucketPrefixes;
}

const STATUS: Readonly<Record<PayerSponsorErrorCode, number>> = {
  MAINNET_FORBIDDEN: 403,
  INVALID_ARGUMENT: 400,
  PAYLOAD_MISMATCH: 422,
  MANIFEST_MISMATCH: 500,
  ENTRYPOINT_MISMATCH: 500,
  FUNDER_IS_KNOWN: 422,
  NO_7702: 501,
  MODE_UNAVAILABLE: 501,
  RATE_LIMITED: 429,
  BREAKER_OPEN: 503,
  BUDGET_EXCEEDED: 429,
  SIMULATION_FAILED: 422,
  QUOTE_UNKNOWN: 404,
  QUOTE_EXPIRED: 410,
  FEE_TOO_LOW: 422,
  BAD_REQUEST: 400,
  UNAVAILABLE: 503,
};

const json = (status: number, v: unknown): HttpResponseLike => ({ status, body: JSON.stringify(v, bigintReplacer) });

/**
 * Builds the HTTP-agnostic handler for `POST /v1/quote`, `POST /v1/submit`, `POST /v1/sponsor-userop`
 * and `GET /v1/health`. JSON only, no cookies, no authentication headers; errors carry a stable code
 * and no detail (PO-COR style). The client network bucket is resolved from the socket peer and, only
 * behind a trusted proxy, `X-Forwarded-For`.
 *
 * @param o Options.
 * @returns A request handler that never throws.
 */
export function createHttpHandler(o: HttpHandlerOptions): (req: HttpRequestLike) => Promise<HttpResponseLike> {
  return async (req) => {
    try {
      if (req.method === 'GET' && req.path === '/v1/health') return json(200, o.service.health());
      if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
      if (Buffer.byteLength(req.body, 'utf8') > o.maxBodyBytes) return json(413, { error: 'BODY_TOO_LARGE' });
      const client = resolveClientIp({ peer: req.peer, forwardedFor: req.headers['x-forwarded-for'], trusted: o.trusted });
      if (client === null) return json(400, { error: 'BAD_REQUEST' });
      const ctx = { bucket: bucketKey(client.ip, o.bucketPrefixes) };
      let body: unknown;
      try {
        body = JSON.parse(req.body);
      } catch {
        throw new PayerSponsorError('BAD_REQUEST', 'body is not JSON');
      }
      switch (req.path) {
        case '/v1/quote':
          return json(200, await o.service.quote(ctx, parseQuoteRequest(body)));
        case '/v1/sponsor-userop':
          return json(200, await o.service.sponsorUserOp(ctx, parseUserOpRequest(body)));
        case '/v1/submit': {
          const mode = sponsoredMode(obj(body, 'body')['mode']);
          if (mode === 'permit-relay') return json(200, await o.service.submitRelay(ctx, parseRelaySubmit(body)));
          if (mode === 'eip7702-sponsored') return json(200, await o.service.submitEip7702(ctx, parseEip7702Submit(body)));
          return json(200, await o.service.submitUserOp(ctx, parseUserOpRequest(body)));
        }
        default:
          return json(404, { error: 'NOT_FOUND' });
      }
    } catch (e) {
      if (e instanceof PayerSponsorError) return json(STATUS[e.code], { error: e.code });
      return json(500, { error: 'INTERNAL' });
    }
  };
}

/**
 * Starts a `node:http` server around a handler (testnet PoC; put it behind a TLS-terminating proxy).
 *
 * @param handler Handler from {@link createHttpHandler}.
 * @param port Port (0 = ephemeral).
 * @param host Bind address (default loopback).
 * @param maxBodyBytes Hard read limit; larger bodies are cut off.
 * @returns The listening server.
 */
export function startHttpServer(
  handler: (req: HttpRequestLike) => Promise<HttpResponseLike>,
  port: number,
  host = '127.0.0.1',
  maxBodyBytes = 64 * 1024,
): Promise<Server> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBodyBytes) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      const body = tooBig ? '0'.repeat(maxBodyBytes + 1) : Buffer.concat(chunks).toString('utf8');
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      void handler({ method: req.method ?? 'GET', path, headers: req.headers, peer: req.socket.remoteAddress, body }).then((r) => {
        res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(r.body);
      });
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
