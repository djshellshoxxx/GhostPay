import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToNumberLE, numberToBytesLE } from '@noble/curves/utils.js';
import { fail } from './errors.js';

declare const secretBrand: unique symbol;

/** ed25519 prime subgroup order L = 2^252 + 27742317777372353535851937790883648493. */
export const L: bigint = ed25519.Point.Fn.ORDER;

/**
 * A 32-byte little-endian ed25519 scalar in [1, L-1]. Instances throw on `JSON.stringify`,
 * `String()`, template interpolation and `util.inspect` / `console.log`.
 *
 * @remarks This is a RAW scalar, not an RFC 8032 32-byte seed: it must never be handed to a
 * standard ed25519 `sign(seed, msg)` API (that would hash and clamp it into a different key).
 */
export type SecretScalar = Uint8Array & { readonly [secretBrand]: 'Ed25519SecretScalar' };

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

/** @internal Wrap a scalar already known to be in [1, L-1]. */
export function wrapScalar(v: bigint): SecretScalar {
  const raw = numberToBytesLE(v, 32);
  const s = new SecretBytes(32);
  s.set(raw);
  raw.fill(0);
  return s as unknown as SecretScalar;
}

/** @internal Scalar value of a secret (caller must not leak it). */
export function scalarValue(secret: SecretScalar): bigint {
  return bytesToNumberLE(secret);
}

/**
 * Wraps 32 little-endian bytes as a {@link SecretScalar} after range validation.
 *
 * @remarks Zero and values >= L are rejected, never silently reduced. The input is copied.
 * @param bytes Exactly 32 LE bytes.
 * @returns Redacting secret wrapper.
 * @throws {SolanaStealthError} `INVALID_SCALAR`.
 * @security Never log, serialize or transmit the result.
 */
export function secretScalarFromBytes(bytes: Uint8Array): SecretScalar {
  if (bytes.length !== 32) return fail('INVALID_SCALAR');
  const v = bytesToNumberLE(bytes);
  if (v < 1n || v >= L) return fail('INVALID_SCALAR');
  return wrapScalar(v);
}

/**
 * Returns a plain, non-redacting copy of the secret bytes (explicit export boundary only).
 *
 * @param secret Secret to expose.
 * @returns Fresh plain copy; zeroize it after use.
 * @security The copy is unprotected.
 */
export function unsafeRevealSecret(secret: SecretScalar): Uint8Array {
  return new Uint8Array(secret);
}

/**
 * Best-effort overwrite of byte buffers with zeros.
 *
 * @remarks JS engines may have copied the data (JIT, GC, bigint intermediates); this reduces
 * but cannot eliminate residue.
 * @param buffers Buffers to overwrite in place.
 */
export function zeroize(...buffers: readonly Uint8Array[]): void {
  for (const b of buffers) b.fill(0);
}
