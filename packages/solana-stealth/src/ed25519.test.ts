import { describe, expect, it } from 'vitest';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  dst,
  hashToScalar,
  parsePublicPoint,
  publicFromSecret,
  randomScalar,
  resolveRng,
  signWithScalar,
  verifySignature,
} from './ed25519.js';
import { SolanaStealthError } from './errors.js';
import { L, secretScalarFromBytes, unsafeRevealSecret, wrapScalar, zeroize } from './secret.js';
import { hexToBytes, loadVectors, opensslVerify, seededRng, zeroRng } from './testutil.testutil.js';

const V = loadVectors();
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as SolanaStealthError).code;
  }
  return 'NO_THROW';
};

describe('point validation', () => {
  it.each(Object.entries(V.invalidPoints).flatMap(([k, list]) => list.map((h) => [k, h])))(
    'rejects %s point %s',
    (_k, h) => {
      expect(code(() => parsePublicPoint(hexToBytes(h)))).toBe('INVALID_POINT');
    },
  );
  it('rejects wrong lengths and non-Uint8Array', () => {
    expect(code(() => parsePublicPoint(new Uint8Array(31)))).toBe('INVALID_POINT');
    expect(code(() => parsePublicPoint([1, 2] as unknown as Uint8Array))).toBe('INVALID_POINT');
  });
  it('rejects the x=0 sign-bit alias of the identity (non-canonical)', () => {
    const b = new Uint8Array(32);
    b[0] = 1;
    b[31] = 0x80;
    expect(code(() => parsePublicPoint(b))).toBe('INVALID_POINT');
  });
  it('accepts valid points and copies them', () => {
    const h = V.cases[0]?.['spendPublicKey'] as string;
    const src = hexToBytes(h);
    const p = parsePublicPoint(src);
    src.fill(0);
    expect(Buffer.from(p).toString('hex')).toBe(h);
  });
});

describe('scalars', () => {
  it('secretScalarFromBytes enforces [1, L-1] and 32 bytes', () => {
    expect(code(() => secretScalarFromBytes(new Uint8Array(32)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(new Uint8Array(31)))).toBe('INVALID_SCALAR');
    const lBytes = new Uint8Array(32);
    let x = L;
    for (let i = 0; i < 32; i++) {
      lBytes[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    expect(code(() => secretScalarFromBytes(lBytes))).toBe('INVALID_SCALAR');
    lBytes[0] = (lBytes[0] as number) - 1;
    expect(unsafeRevealSecret(secretScalarFromBytes(lBytes))).toEqual(lBytes);
  });
  it('secrets refuse every serialization path', () => {
    const s = wrapScalar(5n);
    expect(() => JSON.stringify({ s })).toThrow(TypeError);
    expect(() => String(s)).toThrow(TypeError);
    expect(() => `${s as unknown as string}`).toThrow(TypeError);
    expect(() => s.toLocaleString()).toThrow(TypeError);
    expect(() =>
      (s as unknown as Record<symbol, () => void>)[Symbol.for('nodejs.util.inspect.custom')]?.(),
    ).toThrow(TypeError);
    expect(s.slice(0, 2)).toBeInstanceOf(Uint8Array);
  });
  it('zeroize clears buffers', () => {
    const a = Uint8Array.of(1, 2);
    zeroize(a);
    expect([...a]).toEqual([0, 0]);
  });
  it('randomScalar is in range and depends on rng', () => {
    const a = randomScalar(seededRng('a'));
    const b = randomScalar(seededRng('b'));
    expect(unsafeRevealSecret(a)).not.toEqual(unsafeRevealSecret(b));
    expect(randomScalar()).toHaveLength(32);
  });
  it('randomScalar detects a stuck RNG and a missing RNG', () => {
    expect(code(() => randomScalar(zeroRng))).toBe('RNG_FAILURE');
    expect(code(() => resolveRng({} as never))).toBe('RNG_UNAVAILABLE');
  });
  it('hash domains are distinct and length-prefixed', () => {
    expect(dst('shared')[0]).toBe('GhostPay/solana-stealth/v1/shared'.length);
    expect(hashToScalar('shared', Uint8Array.of(1))).not.toBe(hashToScalar('nonce', Uint8Array.of(1)));
  });
});

describe('signWithScalar', () => {
  const sk = wrapScalar(123456789n);
  const pub = publicFromSecret(sk);
  const msg = utf8ToBytes('hello solana');
  it('verifies under noble and OpenSSL (node:crypto)', () => {
    const sig = signWithScalar(sk, msg);
    expect(verifySignature(sig, msg, pub)).toBe(true);
    expect(opensslVerify(sig, msg, pub)).toBe(true);
    expect(opensslVerify(sig, utf8ToBytes('other'), pub)).toBe(false);
  });
  it('is deterministic with fixed aux and hedged by default', () => {
    const aux = new Uint8Array(32);
    expect(signWithScalar(sk, msg, aux)).toEqual(signWithScalar(sk, msg, aux));
    expect(signWithScalar(sk, msg)).not.toEqual(signWithScalar(sk, msg));
  });
  it('rejects bad aux length', () => {
    expect(code(() => signWithScalar(sk, msg, new Uint8Array(31)))).toBe('INVALID_INPUT');
  });
  it('verifySignature returns false on malformed input', () => {
    expect(verifySignature(new Uint8Array(3), msg, pub)).toBe(false);
  });
});
