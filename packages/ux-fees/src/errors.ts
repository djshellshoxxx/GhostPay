/** Error codes thrown by this package (programmer / structural input errors only). */
export type UxFeesErrorCode = 'INVALID_INPUT';

/**
 * Thrown for structurally invalid input (wrong types, out-of-range numbers).
 *
 * @remarks Business outcomes (stale quote, disabled chain, unsafe fee recipient) are NOT thrown: they are
 * reported as data (`excluded`, `warnings`) so the UI can always render something honest.
 * @security `detail` never contains secrets; it only names the offending field.
 */
export class UxFeesError extends Error {
  public readonly code: UxFeesErrorCode;
  public constructor(code: UxFeesErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'UxFeesError';
    this.code = code;
  }
}

/**
 * Throws an {@link UxFeesError}.
 *
 * @param detail Field description.
 * @returns never
 */
export function fail(detail: string): never {
  throw new UxFeesError('INVALID_INPUT', detail);
}
