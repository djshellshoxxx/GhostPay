import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';
import { fail } from './errors.js';

declare const secretBrand: unique symbol;
declare const pointBrand: unique symbol;

/** secp256k1 group order n. */
export const CURVE_ORDER: bigint = secp256k1.Point.Fn.ORDER;

/**
 * A 32-byte secret scalar in [1, n-1]. Instances throw on `JSON.stringify`,
 * `String()`, template interpolation and `util.inspect`/`console.log`.
 */
export type SecretScalar = Uint8Array & { readonly [secretBrand]: 'SecretScalar' };

/** A validated 33-byte compressed SEC1 secp256k1 public key (not infinity). */
export type CompressedPoint = Uint8Array & { readonly [pointBrand]: 'CompressedPoint' };

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

/** @internal True when `bytes` is a canonical scalar encoding in [1, n-1]. */
export function isScalarBytes(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const v = bytesToNumberBE(bytes);
  return v >= 1n && v < CURVE_ORDER;
}

/**
 * Wraps 32 raw bytes as a {@link SecretScalar} after range validation.
 *
 * @remarks Big-endian, must be in [1, n-1]; zero and values >= n are rejected
 * (never silently reduced). The input is copied; zeroize your own copy.
 *
 * @param bytes Exactly 32 big-endian bytes.
 * @returns A redacting secret wrapper.
 * @throws {BtcFamilyError} `INVALID_SCALAR` on wrong length or range.
 * @security Never log, serialize or send the result anywhere. JavaScript gives no
 * constant-time guarantee for any operation in this package.
 */
export function secretScalarFromBytes(bytes: Uint8Array): SecretScalar {
  if (!isScalarBytes(bytes)) fail('INVALID_SCALAR');
  return wrapSecret(bytes);
}

/**
 * Returns a plain, non-redacting copy of the secret bytes.
 *
 * @remarks Deliberately awkward name: use only at an explicit export boundary
 * (for example an encrypted backup), then {@link zeroize} the copy.
 *
 * @param secret Secret to expose.
 * @returns A fresh plain `Uint8Array` copy.
 * @security The copy is unprotected; callers own its confidentiality.
 */
export function unsafeRevealSecret(secret: SecretScalar): Uint8Array {
  return new Uint8Array(secret);
}

/**
 * Best-effort overwrite of byte buffers with zeros.
 *
 * @remarks JavaScript engines may have copied the data (JIT, GC compaction,
 * structured clone, bigint intermediates), so this reduces but cannot eliminate residue.
 *
 * @param buffers Buffers to overwrite in place.
 * @security Not a guarantee of erasure.
 */
export function zeroize(...buffers: readonly Uint8Array[]): void {
  for (const b of buffers) b.fill(0);
}

/**
 * Validates and copies a 33-byte compressed secp256k1 public key.
 *
 * @remarks Accepts only prefix 02/03 with an on-curve x. Uncompressed, hybrid,
 * infinity and wrong-length encodings are rejected.
 *
 * @param bytes Candidate SEC1 compressed encoding.
 * @returns Branded copy.
 * @throws {BtcFamilyError} `INVALID_POINT`.
 * @security Public data only.
 */
export function parseCompressedPoint(bytes: Uint8Array): CompressedPoint {
  if (bytes.length !== 33 || (bytes[0] !== 0x02 && bytes[0] !== 0x03)) fail('INVALID_POINT');
  try {
    secp256k1.Point.fromBytes(bytes);
  } catch {
    return fail('INVALID_POINT');
  }
  return Uint8Array.from(bytes) as CompressedPoint;
}
