import type { Hex } from 'viem';

/**
 * The ONLY fields that can appear in a log line (PO-LOG-1). There is no field for a recipient,
 * value, fee, proof, IP or request body: redaction is by construction.
 */
export interface LogFields {
  readonly requestId?: string;
  readonly route?: string;
  readonly status?: number;
  readonly chainId?: number;
  readonly txHash?: Hex;
  readonly errorClass?: string;
}

/** Severity. */
export type LogLevel = 'info' | 'warn' | 'error';

/** Structured logger. */
export interface Logger {
  log(level: LogLevel, event: string, fields?: LogFields): void;
}

const EVENT = /^[a-z][a-z0-9_]{0,47}$/;
const REQUEST_ID = /^[0-9a-f-]{8,36}$/;
const ROUTE = new Set(['/healthz', '/v1/info', '/v1/quote', '/v1/relay', 'other']);
const ERROR_CLASS = /^[a-z][a-z0-9_]{0,63}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;

/** Builds the sanitized record: every value is re-validated against a strict shape. */
export function sanitizeFields(f: LogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (f.requestId !== undefined && REQUEST_ID.test(f.requestId)) out['requestId'] = f.requestId;
  if (f.route !== undefined && ROUTE.has(f.route)) out['route'] = f.route;
  if (f.status !== undefined && Number.isInteger(f.status) && f.status >= 100 && f.status <= 599) out['status'] = f.status;
  if (f.chainId !== undefined && Number.isSafeInteger(f.chainId) && f.chainId > 0) out['chainId'] = f.chainId;
  if (f.txHash !== undefined && TX_HASH.test(f.txHash)) out['txHash'] = f.txHash;
  if (f.errorClass !== undefined && ERROR_CLASS.test(f.errorClass)) out['errorClass'] = f.errorClass;
  return out;
}

/** JSON-lines logger writing to `sink` (stdout in production; nothing is persisted by this process). */
export function createLogger(sink: (line: string) => void, now: () => number = Date.now): Logger {
  return {
    log(level, event, fields = {}) {
      const name = EVENT.test(event) ? event : 'invalid_event';
      sink(JSON.stringify({ ts: new Date(now()).toISOString(), level, event: name, ...sanitizeFields(fields) }));
    },
  };
}

/** Logger that discards everything. */
export const nullLogger: Logger = { log: () => undefined };
