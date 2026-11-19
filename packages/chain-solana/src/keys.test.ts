import { ED25519_TORSION_SUBGROUP } from '@noble/curves/ed25519.js';
import { concatBytes, hexToBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58, createBase58check } from '@scure/base';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  decodeMetaAddress,
  encodeMetaAddress,
  generateStealthKeys,
  LEGACY_META_ADDRESS_PREFIX,
  META_ADDRESS_PREFIX,
  publicKeyOf,
  SOLANA_CLUSTER_BYTES,
  type SolanaCluster,
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

const code = (c: string): unknown => expect.objectContaining({ code: c });
const rng = seededRng('keys.test');
const CHECKSUM_TAG = utf8ToBytes('GhostPay/solana-stealth/v1/checksum');

/** Independent ADR-0017 builder (no package code): st:sol: + base58(payload || SHA-256(dst || payload)[0..4]). */
function rawMeta(
  version: number,
  cluster: number,
  S: Uint8Array,
  V: Uint8Array,
  extra = new Uint8Array(0),
): string {
  const payload = concatBytes(Uint8Array.of(version, cluster), S, V, extra);
  const sum = sha256(concatBytes(Uint8Array.of(CHECKSUM_TAG.length), CHECKSUM_TAG, payload)).subarray(0, 4);
  return META_ADDRESS_PREFIX + base58.encode(concatBytes(payload, sum));
}

describe('meta-address', () => {
  it('round-trips and is canonical for every cluster', () => {
    const k = generateStealthKeys(rng);
    for (const cluster of Object.keys(SOLANA_CLUSTER_BYTES) as SolanaCluster[]) {
      const text = encodeMetaAddress({ ...k, cluster });
      expect(text.startsWith('st:sol:')).toBe(true);
      const m = decodeMetaAddress(text);
      expect(m.cluster).toBe(cluster);
      expect(m.spendPublicKey).toEqual(k.spendPublicKey);
      expect(m.viewPublicKey).toEqual(k.viewPublicKey);
      expect(decodeMetaAddress(text, cluster)).toEqual(m);
      expect(encodeMetaAddress(m)).toBe(text);
      expect(rawMeta(1, SOLANA_CLUSTER_BYTES[cluster], k.spendPublicKey, k.viewPublicKey)).toBe(text);
    }
  });

  it('rejects malformed strings', () => {
    const k = generateStealthKeys(rng);
    const text = encodeMetaAddress({ ...k, cluster: 'devnet' });
    const S = k.spendPublicKey;
    const V = k.viewPublicKey;
    const torsion = hexToBytes(ED25519_TORSION_SUBGROUP[1] as string);
    const mixed = Point.fromBytes(S).add(Point.fromBytes(torsion)).toBytes();
    const nonCanon = numberToBytesLE(2n ** 255n - 19n + 1n, 32);
    const bad: unknown[] = [
      'ST:SOL:' + text.slice(7),
      text.slice(7),
      ' ' + text,
      text + '\n',
      text.slice(0, -1),
      text + '1',
      text.slice(0, -1) + (text.endsWith('2') ? '3' : '2'),
      'st:sol:' + '1'.repeat(200),
      'st:sol:0OIl',
      'st:sol:',
      rawMeta(2, 1, S, V),
      rawMeta(0, 1, S, V),
      rawMeta(1, 4, S, V),
      rawMeta(1, 0xff, S, V),
      rawMeta(1, 1, S, V, Uint8Array.of(0)),
      rawMeta(1, 1, S, V.subarray(0, 31)),
      rawMeta(1, 1, torsion, V),
      rawMeta(1, 1, S, mixed),
      rawMeta(1, 1, Point.ZERO.toBytes(), V),
      rawMeta(1, 1, nonCanon, V),
      42,
    ];
    for (const b of bad) expect(() => decodeMetaAddress(b as string)).toThrow(code('INVALID_META_ADDRESS'));
  });

  it('rejects the retired gpsol: form with a dedicated code, valid checksum or not', () => {
    const k = generateStealthKeys(rng);
    const legacy =
      LEGACY_META_ADDRESS_PREFIX +
      createBase58check(sha256).encode(concatBytes(Uint8Array.of(1), k.spendPublicKey, k.viewPublicKey));
    expect(legacy.startsWith('gpsol:')).toBe(true);
    for (const b of [legacy, legacy.slice(0, -1), 'gpsol:']) {
      expect(() => decodeMetaAddress(b)).toThrow(code('LEGACY_META_ADDRESS'));
    }
    expect(() => decodeMetaAddress(legacy)).toThrow(/st:sol:/);
    expect(() => decodeMetaAddress('GPSOL:' + legacy.slice(6))).toThrow(code('INVALID_META_ADDRESS'));
  });

  it('binds the cluster and rejects S == V', () => {
    const k = generateStealthKeys(rng);
    expect(() => decodeMetaAddress(encodeMetaAddress({ ...k, cluster: 'devnet' }), 'testnet')).toThrow(
      code('NETWORK_MISMATCH'),
    );
    expect(() => decodeMetaAddress(encodeMetaAddress({ ...k, cluster: 'mainnet' }), 'devnet')).toThrow(
      code('NETWORK_MISMATCH'),
    );
    expect(() => decodeMetaAddress(rawMeta(1, 1, k.spendPublicKey, k.spendPublicKey))).toThrow(
      code('KEY_REUSE'),
    );
  });

  it('encode validates the cluster and points and rejects S == V', () => {
    const k = generateStealthKeys(rng);
    expect(() =>
      encodeMetaAddress({
        spendPublicKey: k.spendPublicKey,
        viewPublicKey: k.spendPublicKey,
        cluster: 'devnet',
      }),
    ).toThrow(code('KEY_REUSE'));
    const bad = {
      spendPublicKey: Point.ZERO.toBytes(),
      viewPublicKey: k.viewPublicKey,
      cluster: 'devnet',
    } as unknown as SolanaMetaAddress;
    expect(() => encodeMetaAddress(bad)).toThrow(code('INVALID_POINT'));
    for (const cluster of [undefined, 'toString', 'Devnet', 'sol-devnet']) {
      expect(() => encodeMetaAddress({ ...k, cluster } as unknown as SolanaMetaAddress)).toThrow(
        code('INVALID_META_ADDRESS'),
      );
    }
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
