import type { Hex } from 'viem';

/**
 * The ONLY fields that can ever appear in a log line. There is deliberately no free-form field and
 * no place for a destination, owner, signature, amount, IP or request body: redaction is by construction.
 */
export interface LogFields {
  readonly requestId?: string;
  readonly route?: string;
  readonly status?: number;
  readonly chainId?: number;
  readonly txHash?: Hex;
  readonly errorClass?: string;
}

/** Log severity. */
export type LogLevel = 'info' | 'warn' | 'error';

/** Structured logger. */
export interface Logger {
  /**
   * Emits one JSON line.
   *
   * @param level Severity.
   * @param event Fixed lowercase snake_case event name.
   * @param fields Allowlisted fields; values failing their format check are dropped.
   */
  log(level: LogLevel, event: string, fields?: LogFields): void;
}

const EVENT = /^[a-z][a-z0-9_]{0,47}$/;
const REQUEST_ID = /^[0-9a-f-]{8,36}$/;
const ROUTE = new Set(['/healthz', '/metrics', '/v1/info', '/v1/quote', '/v1/sweep', 'other']);
const ERROR_CLASS = /^[a-z][a-z0-9_]{0,63}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;

/**
 * Builds the sanitized field record: every value is re-validated against a strict shape.
 *
 * @param fields Candidate fields.
 * @returns A fresh record with only well-formed allowlisted values.
 */
export function sanitizeFields(fields: LogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (fields.requestId !== undefined && REQUEST_ID.test(fields.requestId)) out['requestId'] = fields.requestId;
  if (fields.route !== undefined && ROUTE.has(fields.route)) out['route'] = fields.route;
  if (fields.status !== undefined && Number.isInteger(fields.status) && fields.status >= 100 && fields.status <= 599) {
    out['status'] = fields.status;
  }
  if (fields.chainId !== undefined && Number.isSafeInteger(fields.chainId) && fields.chainId > 0) out['chainId'] = fields.chainId;
  if (fields.txHash !== undefined && TX_HASH.test(fields.txHash)) out['txHash'] = fields.txHash;
  if (fields.errorClass !== undefined && ERROR_CLASS.test(fields.errorClass)) out['errorClass'] = fields.errorClass;
  return out;
}

/**
 * Creates the JSON-lines logger.
 *
 * @param sink Receives one complete line (without newline).
 * @param now Clock in ms (injected for tests).
 * @returns Logger.
 */
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
