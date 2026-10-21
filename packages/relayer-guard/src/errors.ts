/** Stable error codes thrown by this package. Messages never contain IPs, keys or request data. */
export type GuardErrorCode = 'BREAKER_OPEN' | 'INVALID_CONFIG' | 'INVALID_ADDRESS';

/** Error carrying a stable {@link GuardErrorCode}. */
export class GuardError extends Error {
  /** Machine-readable code. */
  public readonly code: GuardErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: GuardErrorCode, message: string) {
    super(message);
    this.name = 'GuardError';
    this.code = code;
  }
}

/** Thrown by {@link GuardedBreaker.run} when no permit is available. */
export class BreakerOpenError extends GuardError {
  /** Milliseconds until a probe may be admitted (0 while a probe is in flight). */
  public readonly retryAfterMs: number;

  /** @param retryAfterMs See {@link BreakerOpenError.retryAfterMs}. */
  public constructor(retryAfterMs: number) {
    super('BREAKER_OPEN', 'circuit breaker is not admitting requests');
    this.name = 'BreakerOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** @internal Throws an INVALID_CONFIG error unless `ok`. */
export function requireConfig(ok: boolean, message: string): void {
  if (!ok) throw new GuardError('INVALID_CONFIG', message);
}

/** Monotonic millisecond clock. */
export type Clock = () => number;

/**
 * Default clock: `performance.now()`, which is monotonic, unlike `Date.now()` (haiku audit L6: a
 * backwards wall-clock step could drain buckets).
 */
export const monotonicNow: Clock = () => performance.now();
