import { ED25519_TORSION_SUBGROUP } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { describe, expect, it } from 'vitest';
import {
  decodeAddress,
  decodePrimeOrderPoint,
  encodeAddress,
  isOnCurve,
  parsePrimeOrderPoint,
  Point,
} from './point.js';

const P_FIELD = 2n ** 255n - 19n;
const code = (c: string): unknown => expect.objectContaining({ code: c });

describe('decodePrimeOrderPoint', () => {
  it('accepts prime-order points and round-trips', () => {
    const b = Point.BASE.multiply(42n).toBytes();
    expect(decodePrimeOrderPoint(b).toBytes()).toEqual(b);
    const copy = parsePrimeOrderPoint(b);
    expect(copy).toEqual(b);
    expect(copy).not.toBe(b);
  });

  it.each(ED25519_TORSION_SUBGROUP.map((h) => [h]))('rejects small-order point %s', (hex) => {
    expect(() => decodePrimeOrderPoint(hexToBytes(hex))).toThrow(code('INVALID_POINT'));
  });

  it('rejects mixed-order points P + T for every non-trivial torsion T', () => {
    const P = Point.BASE.multiply(1234n);
    for (const hex of ED25519_TORSION_SUBGROUP.slice(1)) {
      const T = Point.fromBytes(hexToBytes(hex), true);
      if (T.is0()) continue;
      const mixed = P.add(T).toBytes();
      expect(() => decodePrimeOrderPoint(mixed)).toThrow(code('INVALID_POINT'));
    }
  });

  it('rejects the identity, wrong lengths and non-Uint8Array input', () => {
    expect(() => decodePrimeOrderPoint(Point.ZERO.toBytes())).toThrow(code('INVALID_POINT'));
    expect(() => decodePrimeOrderPoint(new Uint8Array(31))).toThrow(code('INVALID_POINT'));
    expect(() => decodePrimeOrderPoint(new Uint8Array(33))).toThrow(code('INVALID_POINT'));
    expect(() => decodePrimeOrderPoint([1, 2] as unknown as Uint8Array)).toThrow(code('INVALID_POINT'));
  });

  it('rejects non-canonical y >= p', () => {
    // y = p + 1 encodes the identity non-canonically; y = p + 3 etc. are other non-canonical encodings.
    for (const k of [0n, 1n, 2n, 3n, 4n, 18n]) {
      const enc = numberToBytesLE(P_FIELD + k, 32);
      expect(() => decodePrimeOrderPoint(enc)).toThrow(code('INVALID_POINT'));
    }
  });

  it('rejects x = 0 with the sign bit set', () => {
    const enc = Point.ZERO.toBytes();
    enc[31] = (enc[31] as number) | 0x80;
    expect(() => decodePrimeOrderPoint(enc)).toThrow(code('INVALID_POINT'));
  });

  it('accepts -B (sign-bit flip of a valid point is another valid point)', () => {
    const b = Point.BASE.toBytes();
    b[31] = (b[31] as number) ^ 0x80; // this is -B: a valid prime-order point
    expect(decodePrimeOrderPoint(b).equals(Point.BASE.negate())).toBe(true);
  });

  it('rejects encodings whose y is not on the curve', () => {
    let found = 0;
    for (let y = 2n; found < 5; y++) {
      const enc = numberToBytesLE(y, 32);
      if (isOnCurve(enc)) continue;
      found++;
      expect(() => decodePrimeOrderPoint(enc)).toThrow(code('INVALID_POINT'));
    }
  });
});

describe('isOnCurve (Solana / dalek semantics)', () => {
  it('accepts curve points including small-order and non-canonical encodings', () => {
    expect(isOnCurve(Point.BASE.toBytes())).toBe(true);
    for (const hex of ED25519_TORSION_SUBGROUP) expect(isOnCurve(hexToBytes(hex))).toBe(true);
    expect(isOnCurve(numberToBytesLE(P_FIELD + 1n, 32))).toBe(true); // y = p+1 == 1 mod p
    const negZero = Point.ZERO.toBytes();
    negZero[31] = (negZero[31] as number) | 0x80;
    expect(isOnCurve(negZero)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isOnCurve(new Uint8Array(31))).toBe(false);
  });

  it('finds off-curve values', () => {
    expect(isOnCurve(numberToBytesLE(2n, 32))).toBe(false);
  });
});

describe('base58 addresses', () => {
  it('round-trips 32 bytes', () => {
    const b = Point.BASE.toBytes();
    expect(decodeAddress(encodeAddress(b))).toEqual(b);
    expect(encodeAddress(new Uint8Array(32))).toBe('11111111111111111111111111111111');
    expect(bytesToHex(decodeAddress('11111111111111111111111111111111'))).toBe('00'.repeat(32));
  });

  it('rejects bad input', () => {
    expect(() => encodeAddress(new Uint8Array(31))).toThrow(code('INVALID_ADDRESS'));
    for (const bad of [
      '',
      '1'.repeat(31),
      '1'.repeat(45),
      '0'.repeat(40),
      'l'.repeat(40),
      '1'.repeat(33),
      5 as unknown as string,
    ]) {
      expect(() => decodeAddress(bad)).toThrow(code('INVALID_ADDRESS'));
    }
    // 31-byte value encoded in 43 chars
    const short = encodeAddress(Point.BASE.toBytes()).slice(0, 40);
    expect(() => decodeAddress(short)).toThrow(code('INVALID_ADDRESS'));
  });
});
