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
const ROUTE = new Set(['/healthz', '/v1/info', '/v1/quote', '/v1/sweep', 'other']);
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
      // Logging is best effort: a full disk or a closed pipe must never take the relayer down.
      try {
        sink(JSON.stringify({ ts: new Date(now()).toISOString(), level, event: name, ...sanitizeFields(fields) }));
      } catch {
        // dropped
      }
    },
  };
}

/** The part of a writable stream the stdout sink needs. */
export interface LineStream {
  write(chunk: string): unknown;
  on(event: 'error', listener: () => void): unknown;
}

/**
 * Sink that writes lines to a stream and survives its failures (ENOSPC, EPIPE, destroyed stream):
 * stream `'error'` events are swallowed (an unhandled one would crash the process) and so are
 * synchronous write errors. Lost lines are not retried.
 *
 * @param stream Usually `process.stdout`.
 * @returns Line sink for {@link createLogger}.
 */
export function createStdoutSink(stream: LineStream): (line: string) => void {
  stream.on('error', () => undefined);
  return (line) => {
    try {
      stream.write(`${line}\n`);
    } catch {
      // dropped
    }
  };
}

/** Logger that discards everything. */
export const nullLogger: Logger = { log: () => undefined };
