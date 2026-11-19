/**
 * TB-08: chain-tron (a dependency of the CLI) must emit and parse exactly the TRON meta-address the web app ships
 * through `@ghostpay/tron-adapter` (ADR-0019 section 2: `st:trx:0x<spend33><view33>`), and a payment derived here
 * must be the one the web scanner detects (same address, ephemeral key, view tag and `GPT1` memo). Both sides are
 * checked against test-vectors/meta-address-sol-tron-v1.json (generated from the web package only) and against
 * each other.
 */
import {
  generateKeySet,
  type CompressedPoint,
  type RandomSource,
  type SecretScalar,
} from '@ghostpay/core-crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkTronAnnouncement, deriveTronStealthPayment } from './stealth.js';
import { decodeTronMetaAddress, encodeTronMetaAddress, parseTronAnnouncementMemo } from './meta.js';
import { seededRng } from './testutil.testutil.js';

interface Named {
  readonly name: string;
  readonly input: string;
  readonly legacy?: boolean;
}
interface TronVectors {
  readonly metaAddresses: readonly {
    name: string;
    spendingPublicKey: string;
    viewingPublicKey: string;
    metaAddress: string;
  }[];
  readonly nonCanonicalAccepted: readonly (Named & { canonical: string })[];
  readonly invalidMetaAddresses: readonly Named[];
  readonly payments: readonly {
    name: string;
    metaAddress: string;
    ephemeralSecret: string;
    ephemeralPublicKey: string;
    viewTag: number;
    stealthAddress: string;
    memoHex: string;
  }[];
}

const V = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../test-vectors/meta-address-sol-tron-v1.json', import.meta.url)),
      'utf8',
    ),
  ) as { tron: TronVectors }
).tron;
/** The web package's own vector (independently re-derived in Python by that package). */
const WEB = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../tron-adapter/test-vectors/tron.json', import.meta.url)),
      'utf8',
    ),
  ) as {
    stealth: {
      meta: string;
      ephemeralSecret: string;
      ephemeralPublicKey: string;
      viewTag: number;
      stealthAddress: string;
      memoHex: string;
    };
  }
).stealth;

const code = (c: string): unknown => expect.objectContaining({ code: c });
/** RNG that returns the same 32 bytes on every call (core-crypto keeps the first draw in [1, n-1]). */
const fixedRng = (h: string): RandomSource => ({
  getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(hexToBytes(h));
    return array;
  },
});

/** Web (canonical) API surface, loaded from the sibling package's source as a differential oracle. */
interface WebTron {
  encodeTronMetaAddress(keys: { spendingPublicKey: Uint8Array; viewingPublicKey: Uint8Array }): string;
  decodeTronMetaAddress(input: string): {
    spendingPublicKey: CompressedPoint;
    viewingPublicKey: CompressedPoint;
  };
  deriveTronStealth(
    meta: string,
    rng?: RandomSource,
  ): { stealthAddress: string; ephemeralPublicKey: Uint8Array; viewTag: number; memo: Uint8Array };
  checkTronAnnouncement(
    a: { stealthAddress: string; memo: Uint8Array },
    viewingSecret: SecretScalar,
    spendingPublicKey: CompressedPoint,
  ): boolean;
}
let web: WebTron;
beforeAll(async () => {
  // Computed specifier: keeps the sibling package out of this package's typecheck program. Test-only, never a
  // runtime dependency of chain-tron (and no lockfile entry).
  web = (await import(
    /* @vite-ignore */ new URL('../../tron-adapter/src/meta.ts', import.meta.url).href
  )) as WebTron;
});

function rejectedByWeb(input: string): boolean {
  try {
    web.decodeTronMetaAddress(input);
    return false;
  } catch {
    return true;
  }
}

describe('shared vectors: web side (tron-adapter source)', () => {
  it('encodes, decodes and canonicalises every vector and rejects every invalid one', () => {
    for (const m of V.metaAddresses) {
      const keys = {
        spendingPublicKey: hexToBytes(m.spendingPublicKey),
        viewingPublicKey: hexToBytes(m.viewingPublicKey),
      };
      expect(web.encodeTronMetaAddress(keys)).toBe(m.metaAddress);
      expect(bytesToHex(web.decodeTronMetaAddress(m.metaAddress).viewingPublicKey)).toBe(m.viewingPublicKey);
    }
    for (const n of V.nonCanonicalAccepted)
      expect(web.encodeTronMetaAddress(web.decodeTronMetaAddress(n.input))).toBe(n.canonical);
    for (const b of V.invalidMetaAddresses) expect(rejectedByWeb(b.input), b.name).toBe(true);
  });

  it('derives every payment', () => {
    for (const p of V.payments) {
      const s = web.deriveTronStealth(p.metaAddress, fixedRng(p.ephemeralSecret));
      expect([s.stealthAddress, bytesToHex(s.ephemeralPublicKey), s.viewTag, bytesToHex(s.memo)]).toEqual([
        p.stealthAddress,
        p.ephemeralPublicKey,
        p.viewTag,
        p.memoHex,
      ]);
    }
  });
});

describe('shared vectors: CLI side (chain-tron)', () => {
  it('encodes every meta-address byte for byte and decodes it back', () => {
    for (const m of V.metaAddresses) {
      const keys = {
        spendingPublicKey: hexToBytes(m.spendingPublicKey) as CompressedPoint,
        viewingPublicKey: hexToBytes(m.viewingPublicKey) as CompressedPoint,
      };
      expect(encodeTronMetaAddress(keys), m.name).toBe(m.metaAddress);
      const d = decodeTronMetaAddress(m.metaAddress);
      expect([bytesToHex(d.spendingPublicKey), bytesToHex(d.viewingPublicKey)]).toEqual([
        m.spendingPublicKey,
        m.viewingPublicKey,
      ]);
    }
    for (const n of V.nonCanonicalAccepted)
      expect(encodeTronMetaAddress(decodeTronMetaAddress(n.input))).toBe(n.canonical);
  });

  it('rejects the EVM st:eth:0x form with LEGACY_META_ADDRESS and every other invalid input', () => {
    for (const b of V.invalidMetaAddresses) {
      expect(() => decodeTronMetaAddress(b.input), b.name).toThrow(
        code(b.legacy === true ? 'LEGACY_META_ADDRESS' : 'INVALID_META_ADDRESS'),
      );
      expect(() => deriveTronStealthPayment(b.input), b.name).toThrow();
    }
    expect(V.invalidMetaAddresses.filter((b) => b.legacy === true)).toHaveLength(1);
  });

  it('derives the same address, ephemeral key, view tag and GPT1 memo as the web package', () => {
    for (const p of [...V.payments, { ...WEB, name: 'tron.json', metaAddress: WEB.meta }]) {
      const s = deriveTronStealthPayment(p.metaAddress, fixedRng(p.ephemeralSecret));
      expect(
        [s.stealthAddress, bytesToHex(s.ephemeralPublicKey), s.viewTag[0], bytesToHex(s.memo)],
        p.name,
      ).toEqual([p.stealthAddress, p.ephemeralPublicKey, p.viewTag, p.memoHex]);
      expect(parseTronAnnouncementMemo(s.memo)).toEqual({
        ephemeralPublicKey: s.ephemeralPublicKey,
        viewTag: p.viewTag,
      });
    }
  });
});

describe('round trip across implementations (random keys)', () => {
  it('web encode -> chain-tron decode and back; a chain-tron payment is detected by the web scanner and vice versa', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 30 }), fc.integer({ min: 1, max: 2 ** 30 }), (k, e) => {
        const keys = generateKeySet(seededRng(k));
        const fromWeb = web.encodeTronMetaAddress(keys);
        expect(encodeTronMetaAddress(decodeTronMetaAddress(fromWeb))).toBe(fromWeb);
        const mine = encodeTronMetaAddress(keys);
        expect(mine).toBe(fromWeb);
        expect(bytesToHex(web.decodeTronMetaAddress(mine).spendingPublicKey)).toBe(
          bytesToHex(keys.spendingPublicKey),
        );
        const pay = deriveTronStealthPayment(mine, seededRng(e));
        expect(
          web.checkTronAnnouncement(
            { stealthAddress: pay.stealthAddress, memo: pay.memo },
            keys.viewingSecret,
            keys.spendingPublicKey,
          ),
        ).toBe(true);
        const theirs = web.deriveTronStealth(fromWeb, seededRng(e));
        expect(theirs.stealthAddress).toBe(pay.stealthAddress);
        const parsed = parseTronAnnouncementMemo(theirs.memo);
        expect(parsed).toBeDefined();
        const hit = checkTronAnnouncement(
          {
            stealthAddress: theirs.stealthAddress,
            ephemeralPublicKey: `0x${bytesToHex(parsed!.ephemeralPublicKey)}`,
            metadata: `0x${parsed!.viewTag.toString(16).padStart(2, '0')}`,
          },
          keys.viewingSecret,
          keys.spendingPublicKey,
        );
        expect(hit).toEqual({ matches: true, stealthAddress: theirs.stealthAddress });
      }),
      { numRuns: 25 },
    );
  });
});
