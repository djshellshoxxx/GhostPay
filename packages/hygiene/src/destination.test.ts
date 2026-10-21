import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addressOfSecret } from '@ghostpay/chain-adapters';
import { deriveStealthSecret, randomScalar, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { HygieneError } from './errors.js';
import { deriveFreshDestination, hkdfRng, recoverDestinationKey } from './destination.js';
import { IKM_BYTES, META, testKeys, withSeedOf } from './fixtures.testutil.js';

describe('hkdfRng', () => {
  it('is deterministic and advances the counter across calls', () => {
    const seed = new Uint8Array(32).fill(7);
    const a = hkdfRng(seed);
    const b = hkdfRng(seed);
    const a1 = a.getRandomValues(new Uint8Array(32));
    const a2 = a.getRandomValues(new Uint8Array(32));
    expect(a1).toEqual(b.getRandomValues(new Uint8Array(32)));
    expect(a2).toEqual(b.getRandomValues(new Uint8Array(32)));
    expect(a1).not.toEqual(a2);
  });
  it('fills lengths that are not a multiple of 32 from consecutive blocks', () => {
    const seed = new Uint8Array(32).fill(9);
    const x = hkdfRng(seed).getRandomValues(new Uint8Array(70));
    const r = hkdfRng(seed);
    const p = new Uint8Array(70);
    p.set(r.getRandomValues(new Uint8Array(32)), 0);
    p.set(r.getRandomValues(new Uint8Array(32)), 32);
    p.set(r.getRandomValues(new Uint8Array(32)).subarray(0, 6), 64);
    expect(x).toEqual(p);
  });
  it('rejects bad seeds and views', () => {
    expect(() => hkdfRng(new Uint8Array(31))).toThrow(HygieneError);
    expect(() => hkdfRng('x' as unknown as Uint8Array)).toThrow(HygieneError);
    const r = hkdfRng(new Uint8Array(32));
    expect(() => r.getRandomValues(new Uint32Array(2))).toThrow(HygieneError);
    expect(() => r.getRandomValues(new Uint8Array(65_537))).toThrow(HygieneError);
  });
  it('randomScalar rejection path consumes next block (out-of-range first block via wrapper)', () => {
    const inner = hkdfRng(new Uint8Array(32).fill(3));
    let first = true;
    const wrapped = {
      getRandomValues<T extends ArrayBufferView | null>(a: T): T {
        if (first && a instanceof Uint8Array) {
          first = false;
          a.fill(0xff); // >= curve order: rejected
          return a;
        }
        return inner.getRandomValues(a as ArrayBufferView) as T;
      },
    };
    const s = randomScalar(wrapped);
    const ref = randomScalar(hkdfRng(new Uint8Array(32).fill(3)));
    expect(unsafeRevealSecret(s)).toEqual(unsafeRevealSecret(ref));
  });
  it('zero-length request is a no-op', () => {
    const r = hkdfRng(new Uint8Array(32).fill(1));
    expect(r.getRandomValues(new Uint8Array(0)).length).toBe(0);
  });
});

describe('deriveFreshDestination (AT-HY-1)', () => {
  const keys = testKeys();
  it('is deterministic; different index gives a different address; five fixed indices', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const a = deriveFreshDestination(META, withSeedOf(), i);
      const b = deriveFreshDestination(META, withSeedOf(), i);
      expect(a).toEqual(b);
      expect(a.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(a.ephemeralPublicKey).toMatch(/^0x0[23][0-9a-f]{64}$/);
      expect(a.viewTag).toMatch(/^0x[0-9a-f]{2}$/);
      seen.add(a.address);
    }
    expect(seen.size).toBe(5);
  });
  it('different key material gives different addresses', () => {
    const a = deriveFreshDestination(META, withSeedOf(), 0);
    const b = deriveFreshDestination(META, withSeedOf(new Uint8Array(32).fill(5)), 0);
    expect(a.address).not.toBe(b.address);
  });
  it('recovers the key: address matches, view tag valid via deriveStealthSecret', () => {
    for (const i of [0, 1, 2, 199, 200, 0xffff_ffff]) {
      const d = deriveFreshDestination(META, withSeedOf(), i);
      const secret = recoverDestinationKey(keys, d);
      expect(addressOfSecret(secret)).toBe(d.address);
      const direct = deriveStealthSecret(
        { stealthAddress: d.address, ephemeralPublicKey: d.ephemeralPublicKey, metadata: d.viewTag },
        keys,
      );
      expect(unsafeRevealSecret(direct)).toEqual(unsafeRevealSecret(secret));
    }
  });
  it('rejects a tampered destination record', () => {
    const d = deriveFreshDestination(META, withSeedOf(), 3);
    const other = deriveFreshDestination(META, withSeedOf(), 4);
    expect(() => recoverDestinationKey(keys, { ...d, address: other.address })).toThrow();
    const tag = d.viewTag === '0x00' ? '0x01' : '0x00';
    expect(() => recoverDestinationKey(keys, { ...d, viewTag: tag })).toThrow();
  });
  it('1000 indices are all distinct (property: pairs)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(deriveFreshDestination(META, withSeedOf(), i).address);
    expect(set.size).toBe(1000);
  });
  it('property: determinism for random index and key material', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff_ffff }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (i, k) => {
          const a = deriveFreshDestination(META, withSeedOf(k), i);
          const b = deriveFreshDestination(META, withSeedOf(k), i);
          return a.address === b.address;
        },
      ),
      { numRuns: 25 },
    );
  });
  it('rejects bad index and bad input', () => {
    for (const i of [-1, 1.5, 0x1_0000_0000, Number.NaN]) {
      expect(() => deriveFreshDestination(META, withSeedOf(), i)).toThrow(HygieneError);
    }
    expect(() => deriveFreshDestination(META, undefined as never, 0)).toThrow(HygieneError);
    expect(() => deriveFreshDestination(META, withSeedOf(new Uint8Array(0)), 0)).toThrow(HygieneError);
    expect(() => deriveFreshDestination(META, <T>(f: (i: Uint8Array) => T) => f('x' as never), 0)).toThrow(
      HygieneError,
    );
    expect(() => deriveFreshDestination('st:eth:0xbad', withSeedOf(), 0)).toThrow();
  });
});

describe('zeroization (AT-HY-2)', () => {
  it('zeroizes the key material copy after return', () => {
    let seen: Uint8Array | undefined;
    deriveFreshDestination(
      META,
      <T>(f: (i: Uint8Array) => T): T => {
        seen = Uint8Array.from(IKM_BYTES);
        return f(seen);
      },
      1,
    );
    expect(seen?.every((b) => b === 0)).toBe(true);
  });
  it('zeroizes the key material copy when derivation throws', () => {
    let seen: Uint8Array | undefined;
    expect(() =>
      deriveFreshDestination(
        'not-a-meta',
        <T>(f: (i: Uint8Array) => T): T => {
          seen = Uint8Array.from(IKM_BYTES);
          return f(seen);
        },
        1,
      ),
    ).toThrow();
    expect(seen?.every((b) => b === 0)).toBe(true);
  });
  it('type-level: FreshDestination holds no secret fields', () => {
    const d = deriveFreshDestination(META, withSeedOf(), 0);
    expect(Object.keys(d).sort()).toEqual(['address', 'ephemeralPublicKey', 'index', 'viewTag']);
  });
});
