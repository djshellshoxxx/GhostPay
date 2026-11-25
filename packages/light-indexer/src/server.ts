import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { buildPage } from './page.js';
import type { LogStore } from './store.js';
import { LOGS_PATH, MAX_REQUEST_TARGET_BYTES, STATUS_PATH, WIRE_ERRORS, WIRE_VERSION, assertQueryLimits, parseLogsQuery, type Hex, type QueryLimits, type WireErrorCode } from './wire.js';

/** Options for {@link createLogsHandler}. Limits default to the wire contract's reference values. */
export interface ServiceOptions {
  readonly store: LogStore;
  readonly chainId: number;
  readonly announcer: Hex;
  readonly alignBlocks?: number;
  readonly maxWindowBlocks?: number;
  readonly maxPageSize?: number;
  readonly defaultPageSize?: number;
  readonly maxResponseBytes?: number;
  /** Exact origins allowed to read responses from a browser (CORS). Empty: no CORS headers. */
  readonly allowedOrigins?: readonly string[];
}

/**
 * Aggregate counters. Deliberately no per-request records, timestamps, client addresses, query values or user agents.
 */
export interface ServiceCounters {
  requests: number;
  byStatus: Record<string, number>;
  pages: number;
  announcements: number;
}

/** Reference defaults (wire contract section "Limits"). */
export const DEFAULT_LIMITS = Object.freeze({
  alignBlocks: 1000,
  maxWindowBlocks: 2000,
  maxPageSize: 1000,
  defaultPageSize: 1000,
  maxResponseBytes: 8 * 1024 * 1024,
});

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

/**
 * HTTP request handler for `GET /v1/logs` and `GET /v1/status`.
 *
 * @security The handler reads only the method, the request target and the `Origin` header (for the CORS allow-list).
 * It never reads the socket's remote address, forwarding headers, cookies or the body, and it writes no log line. The
 * only retained state is {@link ServiceCounters}. What the operator (and its host, TLS terminator or reverse proxy)
 * can still observe is listed in `docs/threat-model/light-indexer-delta.md`.
 */
export function createLogsHandler(o: ServiceOptions): { readonly handle: (req: IncomingMessage, res: ServerResponse) => void; readonly counters: () => ServiceCounters } {
  const limits: QueryLimits = {
    chainId: o.chainId,
    alignBlocks: o.alignBlocks ?? DEFAULT_LIMITS.alignBlocks,
    maxWindowBlocks: o.maxWindowBlocks ?? DEFAULT_LIMITS.maxWindowBlocks,
    maxPageSize: o.maxPageSize ?? DEFAULT_LIMITS.maxPageSize,
    defaultPageSize: o.defaultPageSize ?? Math.min(DEFAULT_LIMITS.defaultPageSize, o.maxPageSize ?? DEFAULT_LIMITS.maxPageSize),
    maxResponseBytes: o.maxResponseBytes ?? DEFAULT_LIMITS.maxResponseBytes,
  };
  assertQueryLimits(limits);
  const origins = new Set(o.allowedOrigins ?? []);
  for (const origin of origins) {
    if (new URL(origin).origin !== origin) throw new RangeError('allowed origin must be an exact origin');
  }
  const announcer = o.announcer.toLowerCase() as Hex;
  const stats: ServiceCounters = { requests: 0, byStatus: {}, pages: 0, announcements: 0 };

  const send = (req: IncomingMessage, res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}): void => {
    stats.byStatus[String(status)] = (stats.byStatus[String(status)] ?? 0) + 1;
    const origin = req.headers.origin;
    const cors: Record<string, string> = typeof origin === 'string' && origins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : origins.size > 0 ? { vary: 'Origin' } : {};
    res.sendDate = false;
    res.writeHead(status, { ...BASE_HEADERS, ...cors, ...extra, 'content-length': String(Buffer.byteLength(body, 'utf8')) });
    res.end(body);
  };
  const error = (req: IncomingMessage, res: ServerResponse, code: WireErrorCode, extra: Record<string, string> = {}): void => {
    const e = WIRE_ERRORS[code];
    send(req, res, e.status, JSON.stringify({ version: WIRE_VERSION, error: { code, message: e.message } }), extra);
  };

  const status = (): string => {
    const tip = o.store.tip();
    return JSON.stringify({
      version: WIRE_VERSION,
      chainId: o.chainId,
      announcer,
      indexedFrom: o.store.indexedFrom.toString(),
      head: tip === undefined ? null : { number: tip.number.toString(), hash: tip.hash },
      halted: o.store.halted,
      limits: {
        alignBlocks: limits.alignBlocks,
        maxWindowBlocks: limits.maxWindowBlocks,
        maxPageSize: limits.maxPageSize,
        defaultPageSize: limits.defaultPageSize,
        maxResponseBytes: limits.maxResponseBytes,
      },
    });
  };

  function handle(req: IncomingMessage, res: ServerResponse): void {
    stats.requests++;
    req.resume(); // never read a body
    try {
      const target = req.url ?? '';
      if (Buffer.byteLength(target, 'utf8') > MAX_REQUEST_TARGET_BYTES) return error(req, res, 'URI_TOO_LONG');
      const q = target.indexOf('?');
      const path = q < 0 ? target : target.slice(0, q);
      const search = q < 0 ? '' : target.slice(q + 1);
      if (path !== LOGS_PATH && path !== STATUS_PATH) return error(req, res, 'NOT_FOUND');
      if (req.method === 'OPTIONS') {
        return send(req, res, 204, '', { 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' });
      }
      if (req.method !== 'GET') return error(req, res, 'METHOD_NOT_ALLOWED', { allow: 'GET, OPTIONS' });
      if (path === STATUS_PATH) return search === '' ? send(req, res, 200, status()) : error(req, res, 'UNKNOWN_PARAMETER');
      const parsed = parseLogsQuery(search, limits);
      if (!parsed.ok) return error(req, res, parsed.code);
      const page = buildPage(o.store, parsed.query, { announcer, maxResponseBytes: limits.maxResponseBytes });
      if (!page.ok) return error(req, res, page.code);
      stats.pages++;
      stats.announcements += page.page.announcements.length;
      return send(req, res, 200, page.body);
    } catch {
      return error(req, res, 'INTERNAL');
    }
  }

  return {
    handle,
    counters: () => ({ ...stats, byStatus: { ...stats.byStatus } }),
  };
}

/** A `node:http` server around {@link createLogsHandler} with conservative timeouts. Call `listen` yourself. */
export function createLogsServer(o: ServiceOptions): { readonly server: Server; readonly counters: () => ServiceCounters } {
  const h = createLogsHandler(o);
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5_000, maxHeaderSize: 8 * 1024 }, h.handle);
  server.maxHeadersCount = 64;
  return { server, counters: h.counters };
}
