/**
 * EXTRA-05 crypto review: differential tests against a bigint secp256k1 reference that shares no code with
 * @noble/curves (see secp256k1-ref.testutil.ts), plus spec-driven negative cases. The ScopeLift SDK differential
 * (differential.test.ts) and the SDK-generated vectors (vectors.test.ts) remain the primary cross-implementation
 * checks; this file adds a third, curve-library-independent implementation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { describe, expect, it } from 'vitest';
import {
  GhostPayCryptoError,
  checkAnnouncement,
  decodeMetaAddress,
  deriveStealthPayment,
  deriveStealthSecret,
  parseCompressedPoint,
  secretScalarFromBytes,
  unsafeRevealSecret,
  type CompressedPoint,
  type SecretScalar,
} from './index.js';
import { scriptedRng } from './rng.testutil.js';
import {
  G,
  N,
  P,
  add,
  be,
  compress,
  decompress,
  eip55,
  ethAddress,
  fromHex,
  int,
  mod,
  mul,
  onCurve,
  refScheme1,
  toHex,
  uncompress,
} from './secp256k1-ref.testutil.js';

const hex0x = (b: Uint8Array): string => `0x${toHex(b)}`;

/** Deterministic scalar stream in [1, n-1] (sha256 counter, reduced; test-only). */
function scalarStream(seed: string): () => bigint {
  let c = 0;
  return () => {
    for (;;) {
      const v = int(sha256(new TextEncoder().encode(`${seed}:${c++}`)));
      if (v >= 1n && v < N) return v;
    }
  };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof GhostPayCryptoError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

interface Vector {
  readonly id: string;
  readonly spendingPrivateKey: string;
  readonly viewingPrivateKey: string;
  readonly ephemeralPrivateKey: string;
  readonly spendingPublicKey: string;
  readonly viewingPublicKey: string;
  readonly metaAddress: string;
  readonly ephemeralPublicKey: string;
  readonly viewTag: string;
  readonly stealthAddress: string;
  readonly stealthPrivateKey: string;
}
const vectors = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../test-vectors/scheme1.json', import.meta.url)), 'utf8'),
  ) as {
    vectors: Vector[];
  }
).vectors;

describe('bigint reference self-checks (published constants only)', () => {
  it('G is on the curve, n*G is infinity, (n-1)*G = -G', () => {
    expect(onCurve(G)).toBe(true);
    expect(mul(N, G)).toBeNull();
    const m = mul(N - 1n, G);
    expect(m).toEqual({ x: G!.x, y: P - G!.y });
  });
  it('keccak256("") and the well-known address of private key 1', () => {
    expect(toHex(keccak_256(new Uint8Array()))).toBe(
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
    expect(eip55(ethAddress(mul(1n, G)))).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
    expect(eip55(ethAddress(mul(2n, G)))).toBe('0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF');
  });
});

describe('scheme1.json vectors recomputed by the curve-independent reference', () => {
  it.each(vectors.map((v) => [v.id, v] as const))('%s', (_id, v) => {
    const spend = int(fromHex(v.spendingPrivateKey));
    const view = int(fromHex(v.viewingPrivateKey));
    const eph = int(fromHex(v.ephemeralPrivateKey));
    const spendPub = mul(spend, G);
    const viewPub = mul(view, G);
    expect(hex0x(compress(spendPub))).toBe(v.spendingPublicKey);
    expect(hex0x(compress(viewPub))).toBe(v.viewingPublicKey);
    expect(`st:eth:0x${toHex(compress(spendPub))}${toHex(compress(viewPub))}`).toBe(v.metaAddress);
    const ref = refScheme1(spendPub, viewPub, eph);
    expect(hex0x(ref.R)).toBe(v.ephemeralPublicKey);
    expect(`0x${ref.tag.toString(16).padStart(2, '0')}`).toBe(v.viewTag);
    expect(eip55(ref.address)).toBe(v.stealthAddress);
    const stealthPriv = mod(spend + ref.h, N);
    expect(hex0x(be(stealthPriv, 32))).toBe(v.stealthPrivateKey);
    expect(ethAddress(mul(stealthPriv, G))).toBe(ref.address);
  });
});

describe('differential: package vs bigint reference on 150 random key sets', () => {
  it('sender derivation, recipient check and stealth key agree byte for byte', () => {
    const next = scalarStream('extra05-independent');
    for (let i = 0; i < 150; i++) {
      const spend = next();
      const view = next();
      const eph = next();
      const spendPub = mul(spend, G);
      const viewPub = mul(view, G);
      const meta = `st:eth:0x${toHex(compress(spendPub))}${toHex(compress(viewPub))}`;
      const keys = decodeMetaAddress(meta);
      expect(toHex(keys.spendingPublicKey)).toBe(toHex(compress(spendPub)));

      const ref = refScheme1(spendPub, viewPub, eph);
      const out = deriveStealthPayment(meta, scriptedRng([be(eph, 32)]));
      expect(toHex(out.ephemeralPublicKey)).toBe(toHex(ref.R));
      expect(out.viewTag).toEqual(Uint8Array.of(ref.tag));
      expect(out.metadataPrefix).toEqual(Uint8Array.of(ref.tag));
      expect(out.stealthAddress).toBe(eip55(ref.address));

      const viewingSecret = secretScalarFromBytes(be(view, 32));
      const spendingSecret = secretScalarFromBytes(be(spend, 32));
      const ann = {
        stealthAddress: out.stealthAddress,
        ephemeralPublicKey: hex0x(ref.R),
        metadata: `0x${ref.tag.toString(16).padStart(2, '0')}a9059cbb`,
      };
      expect(checkAnnouncement(ann, viewingSecret, keys.spendingPublicKey)).toEqual({
        matches: true,
        stealthAddress: eip55(ref.address),
      });
      const sk = unsafeRevealSecret(deriveStealthSecret(ann, { viewingSecret, spendingSecret }));
      expect(int(sk)).toBe(mod(spend + ref.h, N));
      expect(ethAddress(mul(int(sk), G))).toBe(ref.address);
    }
  });
});

describe('point decoding: package acceptance == SEC1 reference acceptance', () => {
  it('2000 random 33-byte strings with 02/03 prefix', () => {
    let accepted = 0;
    for (let i = 0; i < 2000; i++) {
      const b = new Uint8Array(33);
      b.set(sha256(new TextEncoder().encode(`pt:${i}`)), 1);
      b[0] = i % 2 === 0 ? 0x02 : 0x03;
      const ref = decompress(b);
      const ok = code(() => parseCompressedPoint(b)) === 'NO_THROW';
      expect(ok).toBe(ref !== undefined);
      if (ok) accepted++;
    }
    // Roughly half of all x have a square root; both branches must actually be exercised.
    expect(accepted).toBeGreaterThan(800);
    expect(accepted).toBeLessThan(1200);
  });

  it('edge x values and prefixes', () => {
    const xs = [0n, 1n, 7n, P - 1n, P, P + 1n, (1n << 256n) - 1n, G!.x];
    for (const x of xs) {
      for (const prefix of [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xff]) {
        const b = new Uint8Array(33);
        b[0] = prefix;
        if (x < 1n << 256n) b.set(be(x, 32), 1);
        const ref = decompress(b);
        expect(
          code(() => parseCompressedPoint(b)),
          `prefix ${prefix} x ${x}`,
        ).toBe(ref === undefined ? 'INVALID_POINT' : 'NO_THROW');
      }
    }
    // Infinity (single 0x00 byte and 33 zero bytes) and the uncompressed / hybrid encodings of G.
    expect(code(() => parseCompressedPoint(Uint8Array.of(0)))).toBe('INVALID_POINT');
    expect(code(() => parseCompressedPoint(new Uint8Array(33)))).toBe('INVALID_POINT');
    const u = uncompress(G);
    expect(code(() => parseCompressedPoint(u))).toBe('INVALID_POINT');
    const hybrid = Uint8Array.from(u);
    hybrid[0] = 0x06 | Number(G!.y & 1n);
    expect(code(() => parseCompressedPoint(hybrid))).toBe('INVALID_POINT');
  });
});

describe('spec negatives (EIP-5564 scheme 1)', () => {
  const next = scalarStream('extra05-negatives');
  const spend = next();
  const view = next();
  const eph = next();
  const spendPub = mul(spend, G);
  const viewPub = mul(view, G);
  const ref = refScheme1(spendPub, viewPub, eph);
  const viewingSecret = secretScalarFromBytes(be(view, 32));
  const spendingSecret = secretScalarFromBytes(be(spend, 32));
  const spendC = parseCompressedPoint(compress(spendPub));
  const tagHex = (t: number): string => t.toString(16).padStart(2, '0');
  const good = {
    stealthAddress: eip55(ref.address),
    ephemeralPublicKey: hex0x(ref.R),
    metadata: `0x${tagHex(ref.tag)}`,
  };

  it('every one of the 255 wrong view tags is rejected early; ignoreViewTag still finds it with tagMatches=false', () => {
    expect(checkAnnouncement(good, viewingSecret, spendC).matches).toBe(true);
    for (let t = 0; t < 256; t++) {
      if (t === ref.tag) continue;
      const a = { ...good, metadata: `0x${tagHex(t)}` };
      expect(checkAnnouncement(a, viewingSecret, spendC)).toEqual({ matches: false });
      expect(checkAnnouncement(a, viewingSecret, spendC, { ignoreViewTag: true })).toEqual({
        matches: true,
        stealthAddress: eip55(ref.address),
        tagMatches: false,
      });
      expect(code(() => deriveStealthSecret(a, { viewingSecret, spendingSecret }))).toBe('VIEW_TAG_MISMATCH');
    }
  });

  it('ephemeral key negation (02<->03 prefix swap, i.e. -R) does not alias the payment', () => {
    const neg = Uint8Array.from(ref.R);
    neg[0] = neg[0] === 0x02 ? 0x03 : 0x02;
    // -R is a valid point, and p_view*(-R) = -S, whose compressed form differs from S's.
    expect(decompress(neg)).toBeDefined();
    const a = { ...good, ephemeralPublicKey: hex0x(neg) };
    expect(checkAnnouncement(a, viewingSecret, spendC, { ignoreViewTag: true })).toEqual({ matches: false });
    expect(code(() => deriveStealthSecret(a, { viewingSecret, spendingSecret }))).not.toBe('NO_THROW');
  });

  it('compressed/uncompressed confusion: a 65-byte R or meta-address key is refused, never reinterpreted', () => {
    const R = decompress(ref.R) ?? null;
    const a = { ...good, ephemeralPublicKey: hex0x(uncompress(R)) };
    expect(checkAnnouncement(a, viewingSecret, spendC, { ignoreViewTag: true })).toEqual({ matches: false });
    expect(code(() => deriveStealthSecret(a, { viewingSecret, spendingSecret }))).toBe('INVALID_POINT');
    const metaU = `st:eth:0x${toHex(uncompress(spendPub))}${toHex(uncompress(viewPub))}`;
    expect(code(() => decodeMetaAddress(metaU))).toBe('INVALID_META_ADDRESS');
    expect(code(() => checkAnnouncement(good, viewingSecret, uncompress(spendPub) as CompressedPoint))).toBe(
      'INVALID_POINT',
    );
  });

  it('a different (wrong) shared-secret serialisation would give a different address: ADR-0001 pin is load-bearing', () => {
    // Hashing the uncompressed S (an easy implementation mistake) must not be what the package does.
    const S = mul(eph, viewPub);
    const shU = keccak_256(uncompress(S));
    const wrong = ethAddress(add(spendPub, mul(mod(int(shU), N), G)));
    expect(wrong).not.toBe(ref.address);
    expect(
      deriveStealthPayment(
        `st:eth:0x${toHex(compress(spendPub))}${toHex(compress(viewPub))}`,
        scriptedRng([be(eph, 32)]),
      ).stealthAddress,
    ).toBe(eip55(ref.address));
  });

  it('invalid scalars smuggled past the type system are rejected by the curve layer, never reduced', () => {
    const bad = [
      new Uint8Array(32),
      be(N, 32),
      be(N + 1n, 32),
      new Uint8Array(32).fill(0xff),
      new Uint8Array(31).fill(1),
    ];
    for (const b of bad) {
      expect(code(() => secretScalarFromBytes(b))).toBe('INVALID_SCALAR');
      // Bypass the branded constructor: the check must still throw (not silently match or reduce mod n).
      expect(() => checkAnnouncement(good, b as unknown as SecretScalar, spendC)).toThrow();
      expect(() =>
        deriveStealthSecret(good, { viewingSecret: b as unknown as SecretScalar, spendingSecret }),
      ).toThrow();
    }
    // An injected RNG that only ever yields n is refused (no reduction to 0).
    expect(
      code(() =>
        deriveStealthPayment(
          `st:eth:0x${toHex(compress(spendPub))}${toHex(compress(viewPub))}`,
          scriptedRng([be(N, 32)]),
        ),
      ),
    ).toBe('RNG_FAILURE');
  });
});
