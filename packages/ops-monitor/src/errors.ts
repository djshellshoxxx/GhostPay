/** Stable error codes thrown by this package. Messages never contain RPC URLs, keys or chain payloads. */
export type MonitorErrorCode = 'INVALID_CONFIG' | 'FETCH_FAILED';

/** Error carrying a stable {@link MonitorErrorCode}. */
export class MonitorError extends Error {
  /** Machine-readable code. */
  public readonly code: MonitorErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: MonitorErrorCode, message: string) {
    super(message);
    this.name = 'MonitorError';
    this.code = code;
  }
}

/** @internal Throws INVALID_CONFIG unless `ok`. */
export function requireConfig(ok: boolean, message: string): void {
  if (!ok) throw new MonitorError('INVALID_CONFIG', message);
}
