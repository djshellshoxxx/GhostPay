/** Error produced by validation or a state transition. */
export interface ScheduleError {
  readonly code: string;
  readonly message: string;
}

/** Discriminated result; no exceptions for expected failures. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ScheduleError };

/** Injected clock returning UTC epoch milliseconds. */
export type Clock = () => number;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

/**
 * Read the clock and make sure it is a sane integer instant.
 * @security A broken/NaN clock must never make a payment look due or valid.
 */
export function readClock(clock: Clock): number {
  const t = clock();
  if (!Number.isSafeInteger(t) || t < 0 || t > 8_640_000_000_000_000) {
    throw new RangeError('clock returned an invalid epoch ms value');
  }
  return t;
}
