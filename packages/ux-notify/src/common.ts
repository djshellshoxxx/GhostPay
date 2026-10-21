/** Shared tiny helpers (pure). */

/** Result type used by all validators; never throws on untrusted input. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** @internal */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
/** @internal */
export const fail = (error: string): { readonly ok: false; readonly error: string } => ({ ok: false, error });

/** True for plain non-array, non-null objects. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True when every own key of `o` is in `allowed` (rejects smuggled members). */
export function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

/** True for a safe integer within [min,max]. */
export function intIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
}
