// Killer tests for surviving Stryker mutants in packages/core-crypto. Drop into packages/core-crypto/src/.
import { describe, expect, it } from 'vitest';
import { GhostPayCryptoError, buildNativeMetadata, generateKeySet, parseCompressedPoint, randomScalar, unsafeRevealSecret, CURVE_ORDER } from './index.js';
import { strictHexToBytes, assertAddress } from './hex.js';
import { numberToBytesBE } from '@noble/curves/utils.js';
import { secretScalarFromBytes } from './secret.js';

const codeOf = (f: () => unknown): string => {
  try { f(); } catch (e) { return e instanceof GhostPayCryptoError ? e.code : `other:${(e as Error).name}`; }
  return 'no error';
};
/** RNG that replays the given 32-byte values, then keeps returning the last one; records the buffers it was given. */
const replay = (values: bigint[]) => {
  const seen: Uint8Array[] = [];
  let i = 0;
  return {
    seen,
    getRandomValues<T extends ArrayBufferView | null>(a: T): T {
      const v = values[Math.min(i++, values.length - 1)]!;
      (a as unknown as Uint8Array).set(numberToBytesBE(v, 32));
      seen.push(a as unknown as Uint8Array);
      return a;
    },
  };
};

describe('killers: rng.ts', () => {
  it('scalar 1 and n-1 are accepted; 0 and n are rejected (rng.ts:38)', () => {
    expect(unsafeRevealSecret(randomScalar(replay([1n])))[31]).toBe(1);
    expect(randomScalar(replay([CURVE_ORDER - 1n]))).toBeDefined();
    expect(codeOf(() => randomScalar(replay([0n])))).toBe('RNG_FAILURE');
    expect(codeOf(() => randomScalar(replay([CURVE_ORDER])))).toBe('RNG_FAILURE');
  });
  it('exactly 64 attempts are made (rng.ts:35)', () => {
    const bad = (n: number) => replay([...Array<bigint>(n).fill(0n), 1n]);
    const r63 = bad(63); expect(randomScalar(r63)).toBeDefined(); expect(r63.seen.length).toBe(64);
    const r64 = bad(64); expect(codeOf(() => randomScalar(r64))).toBe('RNG_FAILURE'); expect(r64.seen.length).toBe(64);
  });
  it('the draw buffer is wiped on success and on failure (rng.ts:41-42)', () => {
    const ok = replay([5n]); randomScalar(ok);
    expect(ok.seen[0]!.every((b) => b === 0)).toBe(true);
    const bad = replay([0n]); codeOf(() => randomScalar(bad));
    expect(bad.seen[0]!.every((b) => b === 0)).toBe(true);
  });
  it('an RNG without getRandomValues is RNG_UNAVAILABLE, not a TypeError (rng.ts:13)', () => {
    expect(codeOf(() => randomScalar({} as never))).toBe('RNG_UNAVAILABLE');
    expect(codeOf(() => generateKeySet({ getRandomValues: 5 } as never))).toBe('RNG_UNAVAILABLE');
  });
  it('generateKeySet refuses a source that repeats a scalar (keys.ts:49 precondition)', () => {
    expect(codeOf(() => generateKeySet(replay([7n])))).toBe('KEY_REUSE');
  });
});

describe('killers: secret.ts parseCompressedPoint (secret.ts:120)', () => {
  const G = Uint8Array.from(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'));
  it('accepts a valid point', () => expect(parseCompressedPoint(G)).toEqual(G));
  it('rejects wrong length and wrong prefix with INVALID_POINT', () => {
    const ext = (n: number) => { const o = new Uint8Array(n); o.set(G.subarray(0, Math.min(n, 33))); return o; };
    for (const bad of [ext(32), ext(34), ext(65), new Uint8Array(0)]) expect(codeOf(() => parseCompressedPoint(bad))).toBe('INVALID_POINT');
    for (const prefix of [0x00, 0x01, 0x04, 0x05, 0x06, 0x07, 0xff]) {
      const p = G.slice(); p[0] = prefix;
      expect(codeOf(() => parseCompressedPoint(p)), String(prefix)).toBe('INVALID_POINT');
    }
  });
});

describe('killers: metadata.ts / hex.ts', () => {
  it('view tag 255 is valid, 256 / -1 / 1.5 / 2-byte arrays are not (metadata.ts:29)', () => {
    expect(buildNativeMetadata(255, 1n)[0]).toBe(0xff);
    expect(buildNativeMetadata(0, 1n)[0]).toBe(0);
    for (const t of [256, -1, 1.5, NaN, new Uint8Array(2), new Uint8Array(0)]) expect(codeOf(() => buildNativeMetadata(t as never, 1n)), String(t)).toBe('INVALID_VIEW_TAG');
    expect(buildNativeMetadata(Uint8Array.of(0xab), 1n)[0]).toBe(0xab);
  });
  it('strictHexToBytes is anchored and type-checked (hex.ts:10,14)', () => {
    expect(codeOf(() => strictHexToBytes('zz0xab', 'INVALID_METADATA'))).toBe('INVALID_METADATA');
    expect(codeOf(() => strictHexToBytes('0xabzz', 'INVALID_METADATA'))).toBe('INVALID_METADATA');
    expect(codeOf(() => strictHexToBytes(['0xab'], 'INVALID_METADATA'))).toBe('INVALID_METADATA');
    expect(codeOf(() => strictHexToBytes('0xabc', 'INVALID_METADATA'))).toBe('INVALID_METADATA');
    expect(strictHexToBytes('0xabcd', 'INVALID_METADATA')).toEqual(Uint8Array.of(0xab, 0xcd));
  });
  it('assertAddress rejects non-strings that coerce to an address (hex.ts:20)', () => {
    const a = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    expect(assertAddress(a, 'INVALID_ADDRESS')).toBe(a);
    expect(codeOf(() => assertAddress([a], 'INVALID_ADDRESS'))).toBe('INVALID_ADDRESS');
    expect(codeOf(() => assertAddress(a.toLowerCase().replace('5f', '5F'), 'INVALID_ADDRESS'))).toBe('INVALID_ADDRESS'); // bad checksum
  });
});

describe('killers: secret.ts species (secret.ts:28)', () => {
  it('derived views of a secret are plain Uint8Array, not redacting SecretBytes', () => {
    const s = secretScalarFromBytes(numberToBytesBE(5n, 32));
    const sl = s.slice(0, 4);
    expect(Object.getPrototypeOf(sl)).toBe(Uint8Array.prototype);
    expect(() => JSON.stringify(sl)).not.toThrow();
  });
});
