/**
 * Internal runtime-type validators. NOT re-exported from `index.ts`.
 *
 * The public API is typed, but callers cross a trust boundary (persisted settings, JSON from a
 * peer, a wallet bridge), so every entry point re-checks the runtime type and fails with a typed
 * {@link MetadataHardeningError}. Messages are fixed text: they never include caller data.
 */
import { MetadataHardeningError } from './errors.js';

/** Throws `INVALID_INPUT` with fixed text. */
export function fail(message: string): never {
  throw new MetadataHardeningError('INVALID_INPUT', message);
}

/**
 * True for a `Uint8Array` including one from another realm (iframe, `vm` context).
 * `ArrayBuffer.isView` cannot be spoofed with a `Symbol.toStringTag`.
 */
export function isBytes(v: unknown): v is Uint8Array {
  return v instanceof Uint8Array || (ArrayBuffer.isView(v) && Object.prototype.toString.call(v) === '[object Uint8Array]');
}

/** Asserts `v` is a `Uint8Array` of `min..max` bytes. */
export function requireBytes(v: unknown, what: string, min: number, max: number): asserts v is Uint8Array {
  if (!isBytes(v)) fail(`${what} must be a Uint8Array`);
  if (v.length < min || v.length > max) fail(`${what} length out of range`);
}

/** Asserts `v` is a bigint. */
export function requireBigint(v: unknown, what: string): asserts v is bigint {
  if (typeof v !== 'bigint') fail(`${what} must be a bigint`);
}

/** True for a non-null, non-array object (cross-realm safe; excludes Map, Date, typed arrays). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === '[object Object]';
}

/** Asserts `v` is a plain-object-like record (not null, not an array). */
export function requireRecord(v: unknown, what: string): asserts v is Record<string, unknown> {
  if (!isRecord(v)) fail(`${what} must be an object`);
}

/** Like {@link requireRecord} but does not narrow the static type (for already-typed option bags). */
export function checkRecord(v: unknown, what: string): void {
  if (!isRecord(v)) fail(`${what} must be an object`);
}

/**
 * Asserts `v` is an array of at most `max` items.
 *
 * @param overflow Error code for an over-long array (`LIMIT_EXCEEDED`, or `INVALID_INPUT` where an
 * older entry point already reported size that way).
 */
export function requireArray(
  v: unknown,
  what: string,
  max: number,
  overflow: 'LIMIT_EXCEEDED' | 'INVALID_INPUT' = 'LIMIT_EXCEEDED',
): asserts v is readonly unknown[] {
  if (!Array.isArray(v)) fail(`${what} must be an array`);
  if (v.length > max) throw new MetadataHardeningError(overflow, `${what} has too many entries`);
}

/** Asserts `v` is a function. */
export function requireFunction(v: unknown, what: string): asserts v is (...args: never[]) => unknown {
  if (typeof v !== 'function') fail(`${what} must be a function`);
}

/** Loopback hosts for which plain `http`/`ws` is permitted (local anvil). `URL.hostname` is lowercase. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Largest `uint256` value (EVM amount ceiling). */
export const UINT256_MAX = (1n << 256n) - 1n;

/** ASCII-only lowercase: HTML attribute and token matching is ASCII case-insensitive, never locale-aware. */
export function asciiLower(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}
