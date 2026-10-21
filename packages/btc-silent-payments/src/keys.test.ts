import fc from 'fast-check';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { toHex } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { generateSilentPaymentKeys, publicKeyOf, silentPaymentKeysFromSecrets } from './keys.js';
import { randomScalar } from './rng.js';
import { constantRng, scriptedRng, seededRng } from './rng.testutil.js';
import {
  CURVE_ORDER,
  parseCompressedPoint,
  secretScalarFromBytes,
  unsafeRevealSecret,
  zeroize,
} from './secret.js';

function n32(v: bigint): Uint8Array {
  return Uint8Array.from(Buffer.from(v.toString(16).padStart(64, '0'), 'hex'));
}

describe('key generation', () => {
  it('is deterministic under an injected RNG and yields valid distinct keys', () => {
    const a = generateSilentPaymentKeys(seededRng('k'));
    const b = generateSilentPaymentKeys(seededRng('k'));
    expect(toHex(a.scanPublicKey)).toBe(toHex(b.scanPublicKey));
    expect(toHex(a.scanPublicKey)).not.toBe(toHex(a.spendPublicKey));
    expect(a.scanPublicKey).toHaveLength(33);
    expect(toHex(publicKeyOf(a.spendSecret))).toBe(toHex(a.spendPublicKey));
  });

  it('works with the real CSPRNG and gives different keys each time', () => {
    const a = generateSilentPaymentKeys();
    const b = generateSilentPaymentKeys();
    expect(toHex(a.scanPublicKey)).not.toBe(toHex(b.scanPublicKey));
  });

  it('rejection-samples: skips zero and values >= n, never reduces', () => {
    const good = n32(5n);
    const rng = scriptedRng([new Uint8Array(32), n32(CURVE_ORDER), new Uint8Array(32).fill(0xff), good]);
    expect(toHex(unsafeRevealSecret(randomScalar(rng)))).toBe(toHex(good));
    expect(toHex(unsafeRevealSecret(randomScalar(scriptedRng([n32(CURVE_ORDER - 1n)]))))).toBe(
      toHex(n32(CURVE_ORDER - 1n)),
    );
  });

  it('fails closed on a stuck RNG and when no RNG exists', () => {
    expect(() => randomScalar(constantRng(0))).toThrow(SilentPaymentError);
    expect(() => randomScalar(constantRng(0xff))).toThrow(SilentPaymentError);
    expect(() => generateSilentPaymentKeys(constantRng(0x07))).toThrow(SilentPaymentError);
    expect(() => randomScalar({} as unknown as Crypto)).toThrow(SilentPaymentError);
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => randomScalar()).toThrow(SilentPaymentError);
    } finally {
      if (saved !== undefined) Object.defineProperty(globalThis, 'crypto', saved);
    }
  });

  it('rejects identical scan and spend secrets', () => {
    const s = secretScalarFromBytes(n32(9n));
    expect(() => silentPaymentKeysFromSecrets(s, s)).toThrow(SilentPaymentError);
  });
});

describe('secret handling', () => {
  const secret = secretScalarFromBytes(n32(0x1234567n));

  it('never serializes, stringifies or inspects secret bytes', () => {
    expect(() => JSON.stringify(secret)).toThrow(TypeError);
    expect(() => JSON.stringify({ nested: { secret } })).toThrow(TypeError);
    expect(() => String(secret)).toThrow(TypeError);
    expect(() => `${secret as unknown as string}`).toThrow(TypeError);
    expect(() => secret.toLocaleString()).toThrow(TypeError);
    expect(() => inspect(secret)).toThrow(TypeError);
    expect(() => Number(secret)).toThrow(TypeError);
  });

  it('keys object cannot be logged or serialized either', () => {
    const keys = generateSilentPaymentKeys(seededRng('redact'));
    expect(() => JSON.stringify(keys)).toThrow(TypeError);
    expect(() => inspect(keys)).toThrow(TypeError);
  });

  it('validates scalar range and length', () => {
    for (const bad of [
      new Uint8Array(32),
      n32(CURVE_ORDER),
      new Uint8Array(31).fill(1),
      new Uint8Array(33).fill(1),
    ]) {
      expect(() => secretScalarFromBytes(bad)).toThrow(SilentPaymentError);
    }
    expect(() => secretScalarFromBytes(n32(CURVE_ORDER - 1n))).not.toThrow();
    expect(() => secretScalarFromBytes(n32(1n))).not.toThrow();
  });

  it('copies on wrap and supports best-effort zeroize', () => {
    const raw = n32(77n);
    const s = secretScalarFromBytes(raw);
    zeroize(raw);
    expect(toHex(unsafeRevealSecret(s))).toBe(toHex(n32(77n)));
    const copy = unsafeRevealSecret(s);
    zeroize(copy, s);
    expect(copy.every((b) => b === 0)).toBe(true);
    expect(s.every((b) => b === 0)).toBe(true);
  });

  it('parseCompressedPoint rejects infinity, uncompressed, hybrid, wrong length and off-curve', () => {
    const k = generateSilentPaymentKeys(seededRng('pt')).scanPublicKey;
    expect(parseCompressedPoint(k)).toHaveLength(33);
    for (const bad of [
      new Uint8Array(33),
      new Uint8Array(1),
      Uint8Array.of(4, ...k.slice(1)),
      Uint8Array.of(6, ...k.slice(1)),
      k.slice(0, 32),
    ]) {
      expect(() => parseCompressedPoint(bad)).toThrow(SilentPaymentError);
    }
  });

  it('property: random scalars in range always produce valid public keys', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: CURVE_ORDER - 1n }), (v) => {
        const pub = publicKeyOf(secretScalarFromBytes(n32(v)));
        expect(parseCompressedPoint(pub)).toHaveLength(33);
      }),
      { numRuns: 50 },
    );
  });
});
