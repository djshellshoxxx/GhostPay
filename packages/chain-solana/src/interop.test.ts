/**
 * TB-08: chain-solana (imported by the CLI) must emit and parse exactly the Solana formats the web app ships through
 * `@ghostpay/solana-stealth`: the ADR-0017 `st:sol:` meta-address, the ADR-0017 derivation and the `gpst1:` + base58
 * memo. Both sides are checked against the same vectors (test-vectors/meta-address-sol-tron-v1.json, generated from
 * the web package only) and against each other, encode-in-one / decode-in-the-other.
 */
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeAnnouncementMemo, encodeAnnouncementMemo } from './announcement.js';
import { decodeMetaAddress, encodeMetaAddress, stealthKeysFromSecrets, type SolanaCluster } from './keys.js';
import { L, scalarFromValue, secretScalarFromBytes, unsafeRevealSecret } from './secret.js';
import { checkAnnouncement, deriveStealthSpendScalar, deriveWithEphemeral } from './stealth.js';

interface Named {
  readonly name: string;
  readonly input: string;
  readonly legacy?: boolean;
}
interface SolVectors {
  readonly metaAddresses: readonly {
    name: string;
    cluster: SolanaCluster;
    spendPublicKey: string;
    viewPublicKey: string;
    metaAddress: string;
  }[];
  readonly invalidMetaAddresses: readonly Named[];
  readonly networkMismatch: readonly (Named & { expectedCluster: SolanaCluster })[];
  readonly stricterInCli: readonly Named[];
  readonly payments: readonly {
    name: string;
    metaAddress: string;
    spendSecret: string;
    viewSecret: string;
    ephemeralSecret: string;
    ephemeralPublicKey: string;
    viewTag: number;
    tweak: string;
    stealthPublicKey: string;
    stealthAddress: string;
    spendKey: string;
    memo: string;
  }[];
  readonly invalidMemos: readonly Named[];
}

const json = (rel: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const V = (json('../../../test-vectors/meta-address-sol-tron-v1.json') as { solana: SolVectors }).solana;
/** The web package's own vectors (ADR-0017 section 8; independently recomputed in Python by that package). */
const WEB = json('../../../test-vectors/solana-stealth.json') as { cases: Record<string, string | number>[] };

const code = (c: string): unknown => expect.objectContaining({ code: c });
const hex = (b: Uint8Array): string => bytesToHex(b);
const scalar = (h: string) => secretScalarFromBytes(hexToBytes(h));

/** Web (canonical) API surface used here, loaded from the sibling package's source as a differential oracle. */
interface WebSolana {
  encodeMetaAddress(cluster: SolanaCluster, S: Uint8Array, V: Uint8Array): string;
  decodeMetaAddress(
    input: string,
    expectedCluster?: SolanaCluster,
  ): { cluster: SolanaCluster; spendPublicKey: Uint8Array; viewPublicKey: Uint8Array };
  encodeAnnouncementMemo(R: Uint8Array, viewTag: number): string;
  parseAnnouncementMemo(memo: string): { ephemeralPublicKey: Uint8Array; viewTag: number } | null;
  deriveStealthPaymentWithEphemeral(
    S: Uint8Array,
    V: Uint8Array,
    r: Uint8Array,
  ): {
    ephemeralPublicKey: Uint8Array;
    viewTag: number;
    stealthPublicKey: Uint8Array;
    stealthAddress: string;
  };
  checkAnnouncement(
    v: Uint8Array,
    S: Uint8Array,
    R: Uint8Array,
    viewTag: number | undefined,
    P?: Uint8Array,
  ): { stealthAddress: string } | null;
  secretScalarFromBytes(b: Uint8Array): Uint8Array;
}
let web: WebSolana;
beforeAll(async () => {
  // Computed specifiers keep the sibling package out of this package's typecheck program: test-only, never a
  // runtime dependency of chain-solana (and no lockfile entry).
  const load = async (file: string): Promise<object> =>
    (await import(
      /* @vite-ignore */ new URL(`../../solana-stealth/src/${file}`, import.meta.url).href
    )) as object;
  web = Object.assign(
    {},
    await load('meta-address.ts'),
    await load('announcement.ts'),
    await load('stealth.ts'),
    await load('secret.ts'),
  ) as WebSolana;
});

function rejectedByWeb(input: string, expectedCluster?: SolanaCluster): boolean {
  try {
    web.decodeMetaAddress(input, expectedCluster);
    return false;
  } catch {
    return true;
  }
}

describe('shared vectors: web side (solana-stealth source)', () => {
  it('encodes and decodes every valid meta-address', () => {
    for (const m of V.metaAddresses) {
      expect(
        web.encodeMetaAddress(m.cluster, hexToBytes(m.spendPublicKey), hexToBytes(m.viewPublicKey)),
      ).toBe(m.metaAddress);
      expect(hex(web.decodeMetaAddress(m.metaAddress, m.cluster).viewPublicKey)).toBe(m.viewPublicKey);
    }
  });

  it('rejects every invalid meta-address and cluster mismatch; accepts the documented S == V case', () => {
    for (const b of V.invalidMetaAddresses) expect(rejectedByWeb(b.input), b.name).toBe(true);
    for (const b of V.networkMismatch) expect(rejectedByWeb(b.input, b.expectedCluster), b.name).toBe(true);
    for (const b of V.stricterInCli) expect(rejectedByWeb(b.input), b.name).toBe(false);
  });

  it('derives every payment and memo', () => {
    for (const p of V.payments) {
      const m = web.decodeMetaAddress(p.metaAddress);
      const pay = web.deriveStealthPaymentWithEphemeral(
        m.spendPublicKey,
        m.viewPublicKey,
        web.secretScalarFromBytes(hexToBytes(p.ephemeralSecret)),
      );
      expect([hex(pay.ephemeralPublicKey), pay.viewTag, pay.stealthAddress]).toEqual([
        p.ephemeralPublicKey,
        p.viewTag,
        p.stealthAddress,
      ]);
      expect(web.encodeAnnouncementMemo(pay.ephemeralPublicKey, pay.viewTag)).toBe(p.memo);
    }
    for (const b of V.invalidMemos) {
      let rejected: boolean;
      try {
        rejected = web.parseAnnouncementMemo(b.input) === null;
      } catch {
        rejected = true;
      }
      expect(rejected, b.name).toBe(true);
    }
  });
});

describe('shared vectors: CLI side (chain-solana)', () => {
  it('encodes every valid meta-address byte for byte and decodes it back', () => {
    for (const m of V.metaAddresses) {
      const meta = {
        cluster: m.cluster,
        spendPublicKey: hexToBytes(m.spendPublicKey),
        viewPublicKey: hexToBytes(m.viewPublicKey),
      } as Parameters<typeof encodeMetaAddress>[0];
      expect(encodeMetaAddress(meta), m.name).toBe(m.metaAddress);
      const d = decodeMetaAddress(m.metaAddress, m.cluster);
      expect([d.cluster, hex(d.spendPublicKey), hex(d.viewPublicKey)]).toEqual([
        m.cluster,
        m.spendPublicKey,
        m.viewPublicKey,
      ]);
      expect(encodeMetaAddress(d)).toBe(m.metaAddress);
    }
  });

  it('rejects the retired gpsol: form with LEGACY_META_ADDRESS and every other invalid input', () => {
    for (const b of V.invalidMetaAddresses) {
      expect(() => decodeMetaAddress(b.input), b.name).toThrow(
        code(b.legacy === true ? 'LEGACY_META_ADDRESS' : 'INVALID_META_ADDRESS'),
      );
    }
    expect(V.invalidMetaAddresses.filter((b) => b.legacy === true)).toHaveLength(2);
  });

  it('binds the cluster: a meta-address for another cluster fails with NETWORK_MISMATCH', () => {
    for (const b of V.networkMismatch) {
      expect(() => decodeMetaAddress(b.input, b.expectedCluster), b.name).toThrow(code('NETWORK_MISMATCH'));
    }
  });

  it('stays stricter than the web decoder only where documented (S == V)', () => {
    for (const b of V.stricterInCli)
      expect(() => decodeMetaAddress(b.input), b.name).toThrow(code('KEY_REUSE'));
  });

  it('derives the same one-time address, view tag and memo as the web package, and detects and spends it', () => {
    for (const p of V.payments) {
      const meta = decodeMetaAddress(p.metaAddress, 'devnet');
      const pay = deriveWithEphemeral(meta, scalar(p.ephemeralSecret));
      expect([
        hex(pay.ephemeralPublicKey),
        pay.viewTag,
        hex(pay.stealthPublicKey),
        pay.stealthAddress,
      ]).toEqual([p.ephemeralPublicKey, p.viewTag, p.stealthPublicKey, p.stealthAddress]);
      expect(encodeAnnouncementMemo(pay)).toBe(p.memo);
      const ann = decodeAnnouncementMemo(p.memo);
      expect([hex(ann.ephemeralPublicKey), ann.viewTag, ann.metadata.length]).toEqual([
        p.ephemeralPublicKey,
        p.viewTag,
        0,
      ]);
      const found = checkAnnouncement(ann, scalar(p.viewSecret), meta.spendPublicKey, p.stealthAddress);
      expect(found).not.toBeNull();
      expect(hex(unsafeRevealSecret(found!.tweak))).toBe(p.tweak);
      const x = deriveStealthSpendScalar(scalar(p.spendSecret), found!.tweak, hexToBytes(p.stealthPublicKey));
      expect(hex(unsafeRevealSecret(x))).toBe(p.spendKey);
    }
  });

  it('rejects every invalid memo, including the retired base64url form', () => {
    for (const b of V.invalidMemos)
      expect(() => decodeAnnouncementMemo(b.input), b.name).toThrow(code('INVALID_ANNOUNCEMENT'));
  });

  it('reproduces the web package vectors (test-vectors/solana-stealth.json) field by field', () => {
    expect(WEB.cases).toHaveLength(6);
    for (const c of WEB.cases) {
      const keys = stealthKeysFromSecrets(
        scalar(c['spendSecret'] as string),
        scalar(c['viewSecret'] as string),
      );
      expect(hex(keys.spendPublicKey)).toBe(c['spendPublicKey']);
      expect(encodeMetaAddress({ ...keys, cluster: 'devnet' })).toBe(c['metaAddressDevnet']);
      expect(encodeMetaAddress({ ...keys, cluster: 'mainnet' })).toBe(c['metaAddressMainnet']);
      const pay = deriveWithEphemeral(keys, scalar(c['ephemeralSecret'] as string));
      expect(hex(pay.ephemeralPublicKey)).toBe(c['ephemeralPublicKey']);
      expect(pay.viewTag).toBe(c['viewTag']);
      expect(hex(pay.stealthPublicKey)).toBe(c['stealthPublicKey']);
      expect(pay.stealthAddress).toBe(c['stealthAddress']);
      expect(encodeAnnouncementMemo(pay)).toBe(c['memo']);
      const found = checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, pay.stealthAddress);
      expect(hex(unsafeRevealSecret(found!.tweak))).toBe(c['tweak']);
      const x = deriveStealthSpendScalar(keys.spendSecret, found!.tweak, pay.stealthPublicKey);
      expect(hex(unsafeRevealSecret(x))).toBe(c['spendKey']);
    }
  });
});

describe('round trip across implementations (random keys)', () => {
  const s = fc.bigInt({ min: 1n, max: L - 1n });
  const cluster = fc.constantFrom<SolanaCluster>('mainnet', 'devnet', 'testnet', 'localnet');

  it('web encode -> chain-solana decode, chain-solana encode -> web decode, same payment either way', () => {
    fc.assert(
      fc.property(s, s, s, cluster, (sv, vv, rv, cl) => {
        fc.pre(sv !== vv);
        const keys = stealthKeysFromSecrets(scalarFromValue(sv), scalarFromValue(vv));
        const fromWeb = web.encodeMetaAddress(cl, keys.spendPublicKey, keys.viewPublicKey);
        const cli = decodeMetaAddress(fromWeb, cl);
        expect(encodeMetaAddress(cli)).toBe(fromWeb);
        const back = web.decodeMetaAddress(encodeMetaAddress({ ...keys, cluster: cl }), cl);
        expect(hex(back.spendPublicKey) + hex(back.viewPublicKey)).toBe(
          hex(keys.spendPublicKey) + hex(keys.viewPublicKey),
        );
        const r = scalarFromValue(rv);
        const mine = deriveWithEphemeral(cli, r);
        const theirs = web.deriveStealthPaymentWithEphemeral(keys.spendPublicKey, keys.viewPublicKey, r);
        expect([mine.stealthAddress, mine.viewTag]).toEqual([theirs.stealthAddress, theirs.viewTag]);
        // A CLI-side payer's memo is detected by the web scanner.
        const parsed = web.parseAnnouncementMemo(encodeAnnouncementMemo(mine));
        expect(parsed).not.toBeNull();
        const hit = web.checkAnnouncement(
          keys.viewSecret,
          keys.spendPublicKey,
          parsed!.ephemeralPublicKey,
          parsed!.viewTag,
          mine.stealthPublicKey,
        );
        expect(hit?.stealthAddress).toBe(mine.stealthAddress);
      }),
      { numRuns: 25 },
    );
  });
});
