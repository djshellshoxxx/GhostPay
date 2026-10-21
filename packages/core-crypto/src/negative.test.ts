import { secp256k1 } from '@noble/curves/secp256k1.js';
import { numberToBytesBE } from '@noble/curves/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  GhostPayCryptoError,
  NATIVE_TOKEN_ADDRESS,
  buildErc20Metadata,
  buildNativeMetadata,
  checkAnnouncement,
  metadataMatches,
  decodeMetaAddress,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  parseCompressedPoint,
  randomScalar,
  secretScalarFromBytes,
  unsafeRevealSecret,
  zeroize,
  type CompressedPoint,
  type CryptoErrorCode,
} from './index.js';
import { constantRng, scriptedRng, seededRng } from './rng.testutil.js';

const N = secp256k1.Point.Fn.ORDER;
const hex = (b: Uint8Array): string => bytesToHex(b);

function code(fn: () => unknown): CryptoErrorCode | 'NOT_A_CRYPTO_ERROR' | 'NO_THROW' {
  try {
    fn();
  } catch (e) {
    return e instanceof GhostPayCryptoError ? e.code : 'NOT_A_CRYPTO_ERROR';
  }
  return 'NO_THROW';
}

const keys = generateKeySet(seededRng('negative'));
const meta = encodeMetaAddress(keys);
const pay = deriveStealthPayment(meta, seededRng('negative-eph'));
const goodAnn = {
  schemeId: 1n,
  stealthAddress: pay.stealthAddress,
  ephemeralPublicKey: `0x${hex(pay.ephemeralPublicKey)}`,
  metadata: `0x${hex(pay.metadataPrefix)}`,
};
const spendPub = keys.spendingPublicKey;
// x = 5 has no y on secp256k1 (5^3+7 = 132 is a non-residue); find an off-curve compressed x by scanning
function offCurvePoint(): Uint8Array {
  for (let x = 1n; x < 100n; x++) {
    const b = new Uint8Array(33);
    b[0] = 2;
    b.set(numberToBytesBE(x, 32), 1);
    try {
      secp256k1.Point.fromBytes(b);
    } catch {
      return b;
    }
  }
  throw new Error('no off-curve x found');
}

describe('scalars', () => {
  it('rejects zero, >= n, wrong length', () => {
    expect(code(() => secretScalarFromBytes(new Uint8Array(32)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(numberToBytesBE(N, 32)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(new Uint8Array(32).fill(0xff)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(new Uint8Array(31).fill(1)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(new Uint8Array(33).fill(1)))).toBe('INVALID_SCALAR');
  });
  it('accepts 1 and n-1', () => {
    expect(() => secretScalarFromBytes(numberToBytesBE(1n, 32))).not.toThrow();
    expect(() => secretScalarFromBytes(numberToBytesBE(N - 1n, 32))).not.toThrow();
  });
  it('rejection sampling skips 0 and >= n then accepts the next draw', () => {
    const good = numberToBytesBE(12345n, 32);
    const rng = scriptedRng([
      new Uint8Array(32),
      numberToBytesBE(N, 32),
      new Uint8Array(32).fill(0xff),
      good,
    ]);
    expect(unsafeRevealSecret(randomScalar(rng))).toEqual(good);
  });
  it('fails closed when the source is stuck', () => {
    expect(code(() => randomScalar(constantRng(0)))).toBe('RNG_FAILURE');
    expect(code(() => randomScalar(constantRng(0xff)))).toBe('RNG_FAILURE');
  });
  it('throws without a random source', () => {
    const g = globalThis as { crypto?: unknown };
    const saved = g.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(code(() => randomScalar())).toBe('RNG_UNAVAILABLE');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
    }
  });
  it('uses the global CSPRNG by default', () => {
    const a = randomScalar();
    const b = randomScalar();
    expect(unsafeRevealSecret(a)).not.toEqual(unsafeRevealSecret(b));
  });
  it('generateKeySet refuses identical spend and view scalars', () => {
    expect(code(() => generateKeySet(scriptedRng([numberToBytesBE(7n, 32)])))).toBe('KEY_REUSE');
  });
  it('zeroize clears buffers', () => {
    const a = Uint8Array.of(1, 2, 3);
    const b = Uint8Array.of(4, 5);
    zeroize(a, b);
    expect([...a, ...b]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('points', () => {
  it('rejects uncompressed, hybrid, wrong prefix, truncated, off-curve, infinity encodings', () => {
    const uncompressed = secp256k1.getPublicKey(numberToBytesBE(5n, 32), false);
    const hybrid = Uint8Array.from(uncompressed);
    hybrid[0] = 6;
    const badPrefix = Uint8Array.from(spendPub);
    badPrefix[0] = 4;
    const infinity = new Uint8Array(33);
    for (const bad of [
      uncompressed,
      hybrid,
      badPrefix,
      spendPub.subarray(0, 32),
      offCurvePoint(),
      infinity,
      new Uint8Array(0),
      new Uint8Array(1),
    ]) {
      expect(code(() => parseCompressedPoint(bad))).toBe('INVALID_POINT');
    }
  });
  it('x coordinate >= p is rejected', () => {
    const b = new Uint8Array(33).fill(0xff);
    b[0] = 2;
    expect(code(() => parseCompressedPoint(b))).toBe('INVALID_POINT');
  });
});

describe('meta-address', () => {
  const body = meta.slice('st:eth:0x'.length);
  it('rejects malformed strings', () => {
    const cases = [
      '',
      'st:eth:',
      'st:eth:0x',
      `st:btc:0x${body}`,
      `ST:eth:0x${body}`,
      `st:eth:${body}`,
      `st:eth:0x${body.slice(0, 66)}`, // single key form
      `st:eth:0x${body}00`,
      `st:eth:0x${body.slice(0, 131)}`,
      `st:eth:0x${body.slice(0, 130)}zz`,
      ` st:eth:0x${body}`,
      `st:eth:0x${body}\n`,
      `st:eth:0x${hex(secp256k1.getPublicKey(numberToBytesBE(5n, 32), false))}`,
    ];
    for (const c of cases) expect(code(() => decodeMetaAddress(c))).toBe('INVALID_META_ADDRESS');
  });
  it('rejects invalid points inside a well-formed string', () => {
    const bad = `st:eth:0x${hex(offCurvePoint())}${body.slice(66)}`;
    expect(code(() => decodeMetaAddress(bad))).toBe('INVALID_POINT');
    const badPrefix = `st:eth:0x04${body.slice(2)}`;
    expect(code(() => decodeMetaAddress(badPrefix))).toBe('INVALID_POINT');
  });
  it('rejects identical spending and viewing keys', () => {
    expect(code(() => decodeMetaAddress(`st:eth:0x${body.slice(0, 66)}${body.slice(0, 66)}`))).toBe(
      'KEY_REUSE',
    );
    expect(code(() => encodeMetaAddress({ spendingPublicKey: spendPub, viewingPublicKey: spendPub }))).toBe(
      'KEY_REUSE',
    );
  });
  it('encode rejects invalid points', () => {
    expect(
      code(() =>
        encodeMetaAddress({
          spendingPublicKey: new Uint8Array(33) as CompressedPoint,
          viewingPublicKey: keys.viewingPublicKey,
        }),
      ),
    ).toBe('INVALID_POINT');
  });
  it('deriveStealthPayment rejects bad meta-address before touching the RNG', () => {
    const rng = seededRng('unused');
    expect(code(() => deriveStealthPayment('nope', rng))).toBe('INVALID_META_ADDRESS');
    expect(rng.outputs.length).toBe(0);
  });
  it('errors never echo input', () => {
    const secretish = 'st:eth:0xSUPERSECRETINPUT';
    try {
      decodeMetaAddress(secretish);
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SUPERSECRET');
    }
  });
});

describe('announcements', () => {
  it('baseline matches', () => {
    expect(checkAnnouncement(goodAnn, keys.viewingSecret, spendPub).matches).toBe(true);
  });
  it('malformed on-chain data returns matches:false and never throws', () => {
    const bads = [
      { ...goodAnn, schemeId: 2n },
      { ...goodAnn, stealthAddress: '0x1234' },
      { ...goodAnn, stealthAddress: 'not an address' },
      {
        ...goodAnn,
        stealthAddress: pay.stealthAddress.replace(/[a-f]/i, (c) =>
          c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
        ),
      },
      { ...goodAnn, ephemeralPublicKey: '0x04' },
      { ...goodAnn, ephemeralPublicKey: `0x${hex(offCurvePoint())}` },
      { ...goodAnn, ephemeralPublicKey: 'zz' },
      { ...goodAnn, metadata: '0x' },
      { ...goodAnn, metadata: '0xzz' },
      { ...goodAnn, metadata: 'ab' },
    ];
    for (const b of bads)
      expect(checkAnnouncement(b, keys.viewingSecret, spendPub)).toEqual({ matches: false });
    expect(
      checkAnnouncement(
        { ...goodAnn, stealthAddress: 42 as unknown as string },
        keys.viewingSecret,
        spendPub,
      ),
    ).toEqual({ matches: false });
  });
  it('wrong tag and wrong address do not match', () => {
    const tag = (pay.viewTag[0] as number) ^ 1;
    expect(
      checkAnnouncement(
        { ...goodAnn, metadata: `0x${tag.toString(16).padStart(2, '0')}` },
        keys.viewingSecret,
        spendPub,
      ),
    ).toEqual({ matches: false });
    const other = deriveStealthPayment(meta, seededRng('other-eph'));
    expect(
      checkAnnouncement({ ...goodAnn, stealthAddress: other.stealthAddress }, keys.viewingSecret, spendPub),
    ).toEqual({ matches: false });
  });
  it('accepts lowercase/checksummed addresses and extra metadata bytes; all-uppercase fails EIP-55 strictness', () => {
    const lower = pay.stealthAddress.toLowerCase();
    expect(
      checkAnnouncement({ ...goodAnn, stealthAddress: lower }, keys.viewingSecret, spendPub).matches,
    ).toBe(true);
    expect(
      checkAnnouncement(
        { ...goodAnn, stealthAddress: `0x${lower.slice(2).toUpperCase()}` },
        keys.viewingSecret,
        spendPub,
      ).matches,
    ).toBe(false);
    expect(
      checkAnnouncement({ ...goodAnn, metadata: `${goodAnn.metadata}00ff` }, keys.viewingSecret, spendPub)
        .matches,
    ).toBe(true);
  });
  it('invalid key arguments throw', () => {
    expect(
      code(() => checkAnnouncement(goodAnn, keys.viewingSecret, new Uint8Array(33) as CompressedPoint)),
    ).toBe('INVALID_POINT');
    expect(code(() => checkAnnouncement(goodAnn, new Uint8Array(32) as never, spendPub))).toBe(
      'NOT_A_CRYPTO_ERROR',
    );
  });
});

describe('deriveStealthSecret', () => {
  it('rejects malformed announcements', () => {
    expect(code(() => deriveStealthSecret({ ...goodAnn, schemeId: 3n }, keys))).toBe('INVALID_ANNOUNCEMENT');
    expect(code(() => deriveStealthSecret({ ...goodAnn, metadata: '0x' }, keys))).toBe(
      'INVALID_ANNOUNCEMENT',
    );
    expect(code(() => deriveStealthSecret({ ...goodAnn, ephemeralPublicKey: '0x00' }, keys))).toBe(
      'INVALID_POINT',
    );
    expect(code(() => deriveStealthSecret({ ...goodAnn, stealthAddress: '0xabc' }, keys))).toBe(
      'INVALID_ANNOUNCEMENT',
    );
  });
  it('rejects wrong tag and wrong address', () => {
    const tag = ((pay.viewTag[0] as number) + 1) & 0xff;
    expect(
      code(() =>
        deriveStealthSecret({ ...goodAnn, metadata: `0x${tag.toString(16).padStart(2, '0')}` }, keys),
      ),
    ).toBe('VIEW_TAG_MISMATCH');
    const other = deriveStealthPayment(meta, seededRng('other-eph-2'));
    expect(code(() => deriveStealthSecret({ ...goodAnn, stealthAddress: other.stealthAddress }, keys))).toBe(
      'ADDRESS_MISMATCH',
    );
  });
  it('rejects the wrong recipient', () => {
    const stranger = generateKeySet(seededRng('stranger-2'));
    expect(() => deriveStealthSecret(goodAnn, stranger)).toThrow(GhostPayCryptoError);
  });
});

describe('round3b M-1: announcement metadata is not authenticated', () => {
  const ann = (metadata: string) => ({ ...goodAnn, metadata });
  const tag = pay.viewTag;
  const real = `0x${hex(buildNativeMetadata(tag, 5n))}`;
  const forged = `0x${hex(buildErc20Metadata(tag, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 10n ** 30n))}`;
  it('reproduces: a replay with swapped token/amount still matches (protocol limit)', () => {
    expect(checkAnnouncement(ann(real), keys.viewingSecret, spendPub).matches).toBe(true);
    expect(checkAnnouncement(ann(forged), keys.viewingSecret, spendPub).matches).toBe(true);
  });
  it('requireRouterMetadata rejects malformed/padded metadata but keeps default behaviour', () => {
    const strict = { requireRouterMetadata: true };
    expect(checkAnnouncement(ann(real), keys.viewingSecret, spendPub, strict).matches).toBe(true);
    for (const m of [`0x${hex(tag)}`, `${real}00`, `0x${hex(tag)}${'ff'.repeat(56)}`])
      expect(checkAnnouncement(ann(m), keys.viewingSecret, spendPub, strict)).toEqual({ matches: false });
    expect(checkAnnouncement(ann(`0x${hex(tag)}`), keys.viewingSecret, spendPub).matches).toBe(true);
  });
  it('metadataMatches detects swapped token/amount against trusted values', () => {
    const exp = { token: NATIVE_TOKEN_ADDRESS, netAmount: 5n };
    expect(metadataMatches(real, exp)).toBe(true);
    expect(metadataMatches(forged, exp)).toBe(false);
    expect(metadataMatches(real, { ...exp, netAmount: 6n })).toBe(false);
    expect(metadataMatches('0x00', exp)).toBe(false);
  });
});
