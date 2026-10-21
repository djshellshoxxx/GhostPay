import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { keccak256, type Hex } from 'viem';
import { assertAccounting, feeFloor } from './accounting.js';
import { assertArtifactHashes, verifyCodeHashes } from './codehash.js';
import { ExternalPoolError } from './errors.js';
import { ALLOWED_CHAIN_IDS, assertChainAllowed, isChainAllowed } from './guard.js';
import { EXIT_ROUTE_INFO, LIMIT_TEXT, limitTexts } from './info.js';
import { lintExit } from './linter.js';
import { assertSameAddress, findEntry, parseManifest } from './manifest.js';
import { TESTNET_MANIFEST } from './manifest-data.js';
import { adviseExit } from './timing.js';
import { D1, D2, S1, fakeChainReader } from './testkit.js';

const code = '0x6001600055' as Hex;
const goodEntry = {
  route: 'railgun',
  chainId: 11155111,
  status: 'verified',
  contracts: { proxy: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea' },
  codeHashes: { proxy: keccak256(code) },
  artifactSha256: { 'a.zkey': 'a'.repeat(64) },
  relayers: ['https://relay.example.org', 'http://127.0.0.1:3000'],
  deploymentBlock: 5,
  sources: ['https://example.org/x'],
  notes: 'n',
};
const doc = (e: unknown[]): unknown => ({ schema: 1, retrieved: '2026-10-21', entries: e });
const code_ = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof ExternalPoolError ? e.code : 'other';
  }
  return undefined;
};

describe('chain guard (EP-GEN-1)', () => {
  it('allows only the three testnets', () => {
    for (const id of ALLOWED_CHAIN_IDS) expect(() => assertChainAllowed(id)).not.toThrow();
    for (const id of [1, 8453, 100, 0, -1, 1.5, NaN]) {
      expect(code_(() => assertChainAllowed(id))).toBe('CHAIN_NOT_ALLOWED');
      expect(isChainAllowed(id)).toBe(false);
    }
    expect(isChainAllowed(84532)).toBe(true);
  });
});

describe('manifest (EP-GEN-3)', () => {
  it('parses the shipped testnet manifest and keeps entries unverified', () => {
    expect(TESTNET_MANIFEST.entries.every((e) => e.status === 'unverified')).toBe(true);
    expect(findEntry(TESTNET_MANIFEST, 'railgun', 11155111)?.contracts['proxy']).toBe('0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea');
    expect(findEntry(TESTNET_MANIFEST, 'railgun', 84532)).toBeUndefined();
    expect(findEntry(TESTNET_MANIFEST, 'privacy-pools', 11155111)?.artifactSha256?.['withdraw.zkey']).toHaveLength(64);
  });
  it('normalises lowercase addresses to checksum form', () => {
    const m = parseManifest(doc([{ ...goodEntry, contracts: { proxy: goodEntry.contracts.proxy.toLowerCase() } }]));
    expect(m.entries[0]?.contracts['proxy']).toBe(goodEntry.contracts.proxy);
  });
  it('accepts a good entry', () => {
    const m = parseManifest(doc([goodEntry]));
    expect(m.entries[0]?.relayers).toHaveLength(2);
    expect(m.entries[0]?.deploymentBlock).toBe(5);
  });
  it.each([
    ['not object', 5, 'MANIFEST_INVALID'],
    ['bad schema', { schema: 2, retrieved: '2026-10-21', entries: [] }, 'MANIFEST_INVALID'],
    ['bad date', { schema: 1, retrieved: 'x', entries: [] }, 'MANIFEST_INVALID'],
    ['entries not array', { schema: 1, retrieved: '2026-10-21', entries: 1 }, 'MANIFEST_INVALID'],
    ['retrieved not string', { schema: 1, retrieved: 1, entries: [] }, 'MANIFEST_INVALID'],
  ])('rejects %s', (_n, raw, c) => expect(code_(() => parseManifest(raw))).toBe(c));
  it.each([
    ['unknown field', { ...goodEntry, extra: 1 }, 'MANIFEST_INVALID'],
    ['bad route', { ...goodEntry, route: 'x' }, 'MANIFEST_INVALID'],
    ['mainnet', { ...goodEntry, chainId: 1 }, 'CHAIN_NOT_ALLOWED'],
    ['chain not number', { ...goodEntry, chainId: '1' }, 'CHAIN_NOT_ALLOWED'],
    ['bad status', { ...goodEntry, status: 'x' }, 'MANIFEST_INVALID'],
    ['bad address', { ...goodEntry, contracts: { proxy: '0x12' } }, 'MANIFEST_INVALID'],
    ['bad checksum', { ...goodEntry, contracts: { proxy: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543feA' } }, 'MANIFEST_INVALID'],
    ['bad key', { ...goodEntry, contracts: { 'bad key!': goodEntry.contracts.proxy } }, 'MANIFEST_INVALID'],
    ['address not string', { ...goodEntry, contracts: { proxy: 5 } }, 'MANIFEST_INVALID'],
    ['bad hash', { ...goodEntry, codeHashes: { proxy: '0x12' } }, 'MANIFEST_INVALID'],
    ['no sources', { ...goodEntry, sources: [] }, 'MANIFEST_INVALID'],
    ['verified without contracts', { ...goodEntry, contracts: {}, codeHashes: {} }, 'MANIFEST_INVALID'],
    ['verified without hash', { ...goodEntry, codeHashes: {} }, 'MANIFEST_INVALID'],
    ['relayers not array', { ...goodEntry, relayers: 'x' }, 'MANIFEST_INVALID'],
    ['relayer not url', { ...goodEntry, relayers: ['nope'] }, 'MANIFEST_INVALID'],
    ['relayer http remote', { ...goodEntry, relayers: ['http://relay.example.org'] }, 'MANIFEST_INVALID'],
    ['relayer creds', { ...goodEntry, relayers: ['https://u:p@relay.example.org'] }, 'MANIFEST_INVALID'],
    ['bad artifact hash', { ...goodEntry, artifactSha256: { f: 'zz' } }, 'MANIFEST_INVALID'],
    ['bad block', { ...goodEntry, deploymentBlock: -1 }, 'MANIFEST_INVALID'],
    ['bad notes', { ...goodEntry, notes: 1 }, 'MANIFEST_INVALID'],
    ['entry not object', 5, 'MANIFEST_INVALID'],
  ])('rejects entry: %s', (_n, e, c) => expect(code_(() => parseManifest(doc([e])))).toBe(c));
  it('rejects duplicates', () => expect(code_(() => parseManifest(doc([goodEntry, goodEntry])))).toBe('MANIFEST_INVALID'));
  it('assertSameAddress is case-insensitive and throws on difference', () => {
    expect(() => assertSameAddress('x', S1, S1.toUpperCase().replace('0X', '0x'))).not.toThrow();
    expect(code_(() => assertSameAddress('x', S1, D1))).toBe('MANIFEST_MISMATCH');
  });
});

describe('code hashes (EP-GEN-4)', () => {
  const entry = parseManifest(doc([goodEntry])).entries[0]!;
  const addr = goodEntry.contracts.proxy.toLowerCase();
  it('accepts matching code', async () => {
    await expect(verifyCodeHashes(fakeChainReader({ codes: { [addr]: code } }), entry)).resolves.toBeUndefined();
  });
  it('refuses wrong code, empty code, unverified entries and bad chains', async () => {
    await expect(verifyCodeHashes(fakeChainReader({ codes: { [addr]: '0x00' } }), entry)).rejects.toMatchObject({ code: 'CODE_HASH_MISMATCH' });
    await expect(verifyCodeHashes(fakeChainReader(), entry)).rejects.toMatchObject({ code: 'CODE_HASH_MISMATCH' });
    const unv = TESTNET_MANIFEST.entries[1]!;
    await expect(verifyCodeHashes(fakeChainReader(), unv)).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
    await expect(verifyCodeHashes(fakeChainReader(), { ...entry, chainId: 1 })).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
    await expect(verifyCodeHashes(fakeChainReader(), { ...entry, codeHashes: {} })).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
  });
  it('checks artifact digests (EP-PP-6 / EP-RG-3)', () => {
    expect(() => assertArtifactHashes(entry, { 'a.zkey': 'A'.repeat(64) })).not.toThrow();
    expect(code_(() => assertArtifactHashes(entry, { 'a.zkey': 'b'.repeat(64) }))).toBe('ARTIFACT_HASH_MISMATCH');
    expect(code_(() => assertArtifactHashes(entry, {}))).toBe('ARTIFACT_HASH_MISMATCH');
    expect(code_(() => assertArtifactHashes({ ...entry, artifactSha256: undefined } as never, {}))).toBe('ARTIFACT_HASH_MISMATCH');
  });
});

describe('accounting (EP-GEN-8)', () => {
  it('requires exact sums, bigint and non-negative', () => {
    expect(() => assertAccounting(100n, 90n, 10n)).not.toThrow();
    expect(code_(() => assertAccounting(100n, 90n, 9n))).toBe('ACCOUNTING_MISMATCH');
    expect(() => assertAccounting(100n, 90n, 9n, 1n)).not.toThrow();
    expect(code_(() => assertAccounting(100n, -1n, 101n))).toBe('ACCOUNTING_MISMATCH');
    expect(code_(() => assertAccounting(100n, 90n, 10n, -1n))).toBe('ACCOUNTING_MISMATCH');
    expect(code_(() => assertAccounting(100 as never, 90n, 10n))).toBe('ACCOUNTING_MISMATCH');
  });
  it('feeFloor rounds down and validates bps', () => {
    expect(feeFloor(999n, 50)).toBe(4n);
    expect(code_(() => feeFloor(1n, 10_001))).toBe('INVALID_INPUT');
    expect(code_(() => feeFloor(1n, 1.5))).toBe('INVALID_INPUT');
  });
  it('property: fee + net == amount for every bps', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 2n ** 120n }), fc.integer({ min: 0, max: 10_000 }), (a, bps) => {
        const fee = feeFloor(a, bps);
        expect(() => assertAccounting(a, a - fee, fee)).not.toThrow();
      }),
    );
  });
});

describe('route info', () => {
  it('limits use no anonymity claims and tornado/aztec are unavailable', () => {
    const all = JSON.stringify([EXIT_ROUTE_INFO, LIMIT_TEXT]).toLowerCase();
    for (const w of ['anonymous', 'untraceable', 'mix', 'anonymity']) expect(all).not.toContain(w);
    expect(EXIT_ROUTE_INFO['tornado-fixed'].available).toBe(false);
    expect(EXIT_ROUTE_INFO['aztec'].available).toBe(false);
    expect(EXIT_ROUTE_INFO['privacy-pools'].whatItDoesNotHide).toHaveLength(6);
    expect(limitTexts(['N1'])).toEqual([LIMIT_TEXT.N1]);
  });
});

describe('linter (EP-LINT-1)', () => {
  const base = { depositedAmount: 1000n, exitAmount: 500n, depositedAt: 0, now: 100_000, destination: D1 };
  it('is quiet for a clean exit', () => expect(lintExit(base)).toEqual([]));
  it.each([
    ['AMOUNT_LINKAGE', { exitAmount: 995n }],
    ['AMOUNT_LINKAGE', { exitAmount: 1005n }],
    ['TOO_SOON', { now: 100 }],
    ['DESTINATION_LINKED', { linkedAddresses: [D1] }],
    ['DESTINATION_IS_GHOSTPAY', { ghostpayAddresses: [D1] }],
    ['DESTINATION_REUSED', { usedDestinations: [D1] }],
  ] as const)('flags %s', (c, over) => {
    expect(lintExit({ ...base, ...over }).map((w) => w.code)).toContain(c);
  });
  it('does not flag other destinations or exactly >1% differences', () => {
    expect(lintExit({ ...base, linkedAddresses: [D2], exitAmount: 989n })).toEqual([]);
    expect(lintExit({ ...base, depositedAmount: 0n, exitAmount: 0n })).toEqual([]);
    expect(lintExit({ ...base, now: 10, minDelaySec: 5 })).toEqual([]);
  });
});

describe('timing (EP-UX-2/3)', () => {
  it('advises with counts only and never blocks', () => {
    const a = adviseExit(3, 100);
    expect(a.ready).toBe(false);
    expect(a.missingDeposits).toBe(17);
    expect(a.text).toContain('Observed same-asset deposits since yours: 3');
    expect(a.text).toContain('never blocked');
    expect(adviseExit(25, 90_000).ready).toBe(true);
    expect(adviseExit(-5, -5, { minDeposits: 0, minElapsedSec: 0 }).ready).toBe(true);
    expect(adviseExit(2.9, 0, { minDeposits: 2, minElapsedSec: 10 }).remainingSec).toBe(10);
  });
});
