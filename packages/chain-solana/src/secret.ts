import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToNumberLE, numberToBytesLE } from '@noble/curves/utils.js';
import { fail } from './errors.js';

declare const secretBrand: unique symbol;

/** ed25519 prime subgroup order L = 2^252 + 27742317777372353535851937790883648493. */
export const L: bigint = ed25519.Point.Fn.ORDER;

/**
 * A 32-byte little-endian ed25519 scalar in [1, L-1]. Instances throw on
 * `JSON.stringify`, `String()`, template interpolation and `util.inspect`.
 */
export type SecretScalar = Uint8Array & { readonly [secretBrand]: 'SolanaSecretScalar' };

const INSPECT = Symbol.for('nodejs.util.inspect.custom');
const REDACTED = 'GhostPay secret value must not be serialized, logged or stringified';

/** @internal Uint8Array whose every textual/serialization path throws. */
class SecretBytes extends Uint8Array<ArrayBuffer> {
  public constructor(length: number) {
    super(new ArrayBuffer(length));
  }
  public static get [Symbol.species](): Uint8ArrayConstructor {
    return Uint8Array;
  }
  public toJSON(): never {
    throw new TypeError(REDACTED);
  }
  public override toString(): never {
    throw new TypeError(REDACTED);
  }
  public override toLocaleString(): never {
    throw new TypeError(REDACTED);
  }
  public [INSPECT](): never {
    throw new TypeError(REDACTED);
  }
  public [Symbol.toPrimitive](): never {
    throw new TypeError(REDACTED);
  }
}

/** @internal Wrap raw bytes (already validated) as a redacting secret. Copies. */
export function wrapSecret(bytes: Uint8Array): SecretScalar {
  const s = new SecretBytes(bytes.length);
  s.set(bytes);
  return s as unknown as SecretScalar;
}

/** @internal Canonical LE scalar encoding check: 32 bytes, value in [1, L-1]. */
export function isScalarBytes(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const v = bytesToNumberLE(bytes);
  return v >= 1n && v < L;
}

/** @internal Secret -> bigint (caller must not log the result). */
export function scalarValue(secret: SecretScalar): bigint {
  if (!isScalarBytes(secret)) fail('INVALID_SCALAR');
  return bytesToNumberLE(secret);
}

/** @internal bigint in [1, L-1] -> redacting secret. */
export function scalarFromValue(v: bigint): SecretScalar {
  if (v < 1n || v >= L) fail('INVALID_SCALAR');
  const b = numberToBytesLE(v, 32);
  try {
    return wrapSecret(b);
  } finally {
    zeroize(b);
  }
}

/**
 * Wraps 32 raw little-endian bytes as a {@link SecretScalar} after range validation.
 *
 * @remarks Must be a canonical scalar in [1, L-1]. Zero and values >= L are
 * rejected, never silently reduced. This is a RAW scalar, not an RFC 8032 seed:
 * no SHA-512 expansion or clamping is applied. The input is copied.
 *
 * @param bytes Exactly 32 little-endian bytes.
 * @returns A redacting secret wrapper.
 * @throws {SolanaStealthError} `INVALID_SCALAR`.
 * @security Never log, serialize or send the returned value.
 */
export function secretScalarFromBytes(bytes: Uint8Array): SecretScalar {
  if (!isScalarBytes(bytes)) fail('INVALID_SCALAR');
  return wrapSecret(bytes);
}

/**
 * Returns a plain, non-redacting copy of the secret bytes (explicit export boundary only).
 *
 * @param secret Secret to expose.
 * @returns A fresh plain `Uint8Array` copy; the caller owns its confidentiality.
 */
export function unsafeRevealSecret(secret: SecretScalar): Uint8Array {
  return new Uint8Array(secret);
}

/**
 * Best-effort overwrite of byte buffers with zeros.
 *
 * @remarks JavaScript engines may keep copies (JIT, GC, bigint conversions), so
 * this reduces but cannot eliminate residue.
 *
 * @param buffers Buffers to overwrite in place.
 */
export function zeroize(...buffers: readonly Uint8Array[]): void {
  for (const b of buffers) b.fill(0);
}
