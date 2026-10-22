import { ED25519_TORSION_SUBGROUP } from '@noble/curves/ed25519.js';
import { hexToBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { createBase58check } from '@scure/base';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  decodeMetaAddress,
  encodeMetaAddress,
  generateStealthKeys,
  META_ADDRESS_PREFIX,
  publicKeyOf,
  type SolanaMetaAddress,
} from './keys.js';
import { Point, type PrimeOrderPoint } from './point.js';
import { randomScalar } from './rng.js';
import { constantRng, seededRng } from './rng.testutil.js';
import {
  L,
  scalarFromValue,
  scalarValue,
  secretScalarFromBytes,
  unsafeRevealSecret,
  zeroize,
} from './secret.js';

const b58c = createBase58check(sha256);
const code = (c: string): unknown => expect.objectContaining({ code: c });
const rng = seededRng('keys.test');

function rawMeta(version: number, S: Uint8Array, V: Uint8Array, extra = new Uint8Array(0)): string {
  const p = new Uint8Array(1 + S.length + V.length + extra.length);
  p[0] = version;
  p.set(S, 1);
  p.set(V, 1 + S.length);
  p.set(extra, 1 + S.length + V.length);
  return META_ADDRESS_PREFIX + b58c.encode(p);
}

describe('meta-address', () => {
  it('round-trips and is canonical', () => {
    const k = generateStealthKeys(rng);
    const text = encodeMetaAddress(k);
    expect(text.startsWith('gpsol:')).toBe(true);
    const m = decodeMetaAddress(text);
    expect(m.spendPublicKey).toEqual(k.spendPublicKey);
    expect(m.viewPublicKey).toEqual(k.viewPublicKey);
    expect(encodeMetaAddress(m)).toBe(text);
    expect(rawMeta(1, k.spendPublicKey, k.viewPublicKey)).toBe(text);
  });

  it('rejects malformed strings', () => {
    const k = generateStealthKeys(rng);
    const text = encodeMetaAddress(k);
    const S = k.spendPublicKey;
    const V = k.viewPublicKey;
    const torsion = hexToBytes(ED25519_TORSION_SUBGROUP[1] as string);
    const mixed = Point.fromBytes(S).add(Point.fromBytes(torsion)).toBytes();
    const nonCanon = numberToBytesLE(2n ** 255n - 19n + 1n, 32);
    const bad: unknown[] = [
      'GPSOL:' + text.slice(6),
      text.slice(6),
      text.slice(0, -1),
      text + '1',
      text.slice(0, -1) + (text.endsWith('2') ? '3' : '2'),
      'gpsol:' + '1'.repeat(200),
      'gpsol:0OIl',
      rawMeta(2, S, V),
      rawMeta(0, S, V),
      rawMeta(1, S, V, Uint8Array.of(0)),
      rawMeta(1, S, V.subarray(0, 31)),
      rawMeta(1, S, S),
      rawMeta(1, torsion, V),
      rawMeta(1, S, mixed),
      rawMeta(1, Point.ZERO.toBytes(), V),
      rawMeta(1, nonCanon, V),
      42,
    ];
    for (const b of bad) expect(() => decodeMetaAddress(b as string)).toThrow(code('INVALID_META_ADDRESS'));
  });

  it('encode validates points and rejects S == V', () => {
    const k = generateStealthKeys(rng);
    expect(() =>
      encodeMetaAddress({ spendPublicKey: k.spendPublicKey, viewPublicKey: k.spendPublicKey }),
    ).toThrow(code('KEY_REUSE'));
    const bad = {
      spendPublicKey: Point.ZERO.toBytes(),
      viewPublicKey: k.viewPublicKey,
    } as unknown as SolanaMetaAddress;
    expect(() => encodeMetaAddress(bad)).toThrow(code('INVALID_POINT'));
  });

  it('generateStealthKeys detects a stuck RNG', () => {
    expect(() => generateStealthKeys(constantRng(7))).toThrow(code('RNG_FAILURE'));
  });

  it('publicKeyOf matches s*B', () => {
    expect(publicKeyOf(scalarFromValue(9n))).toEqual(Point.BASE.multiply(9n).toBytes() as PrimeOrderPoint);
  });
});

describe('secrets', () => {
  it('validate range and redact', () => {
    expect(() => secretScalarFromBytes(new Uint8Array(32))).toThrow(code('INVALID_SCALAR'));
    expect(() => secretScalarFromBytes(numberToBytesLE(L, 32))).toThrow(code('INVALID_SCALAR'));
    expect(() => secretScalarFromBytes(new Uint8Array(31).fill(1))).toThrow(code('INVALID_SCALAR'));
    expect(() => scalarFromValue(0n)).toThrow(code('INVALID_SCALAR'));
    expect(() => scalarFromValue(L)).toThrow(code('INVALID_SCALAR'));
    const s = secretScalarFromBytes(numberToBytesLE(L - 1n, 32));
    expect(scalarValue(s)).toBe(L - 1n);
    expect(() => JSON.stringify(s)).toThrow(TypeError);
    expect(() => String(s)).toThrow(TypeError);
    expect(() => `${s as unknown as string}`).toThrow(TypeError);
    expect(() => s.toLocaleString()).toThrow(TypeError);
    expect(() => inspect(s)).toThrow(TypeError);
    expect(s.slice(0, 2)).toBeInstanceOf(Uint8Array);
    const plain = unsafeRevealSecret(s);
    expect(JSON.stringify(Array.from(plain)).length).toBeGreaterThan(2);
    zeroize(plain);
    expect(plain.every((b) => b === 0)).toBe(true);
    const broken = new Uint8Array(32) as unknown as Parameters<typeof scalarValue>[0];
    expect(() => scalarValue(broken)).toThrow(code('INVALID_SCALAR'));
  });

  it('randomScalar samples in range and fails closed', () => {
    for (let i = 0; i < 50; i++) {
      const v = scalarValue(randomScalar(rng));
      expect(v > 0n && v < L).toBe(true);
    }
    expect(scalarValue(randomScalar()) > 0n).toBe(true);
    expect(() => randomScalar(constantRng(0))).toThrow(code('RNG_FAILURE'));
    expect(() => randomScalar(constantRng(0xff))).toThrow(code('RNG_FAILURE'));
    expect(() => randomScalar({} as unknown as Crypto)).toThrow(code('RNG_UNAVAILABLE'));
  });
});
