/** Success branch of {@link Result}. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
/** Failure branch of {@link Result}. `code` is a stable machine code, never user-supplied text. */
export interface Err<C extends string> {
  readonly ok: false;
  readonly code: C;
}
/** Non-throwing result used by every parser in this package (untrusted input never throws). */
export type Result<T, C extends string = string> = Ok<T> | Err<C>;

/** Builds an {@link Ok}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}
/** Builds an {@link Err}. */
export function err<C extends string>(code: C): Err<C> {
  return { ok: false, code };
}
/** i18n key for any error code in this package: `intake.error.<code>`. */
export function errorKey(code: string): string {
  return `intake.error.${code}`;
}
