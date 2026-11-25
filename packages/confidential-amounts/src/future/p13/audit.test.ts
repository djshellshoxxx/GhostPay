/**
 * Regression tests for the 2026-11-25 P13 audit (docs/audits/P13_CONFIDENTIAL_AMOUNTS_QA_20261125.md). Each case was
 * written to fail on the pre-fix sources (commit 6b0a4980) and pass after the fix.
 */
import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, getAddress, type Hex } from 'viem';
import { NOT_PROTECTED_KEYS } from '../../copy.js';
import { ROUTER_ABI, TOKEN_ABI } from '../../abi.js';
import type { PaymentLog } from '../../payment.js';
import { toResult, toResultAsync } from './errors.js';
import { assetDigest, decodeConfidentialAsset } from './asset.js';
import { createAesGcmSealer, generateRecordKey } from './cipher.js';
import { buildDisclosure, classifyRoute, disclosureDigest, type RouteKind } from './disclosure.js';
import { CT1_ASSET, CTM_ASSET, NOW, mutable, sampleInvoice } from './fixtures.testutil.js';
import { checkFeeRequest } from './gate.js';
import { assertTransition, interpretEvidence, type EvidenceInput } from './lifecycle.js';
import { cancelPlan, prepareConfidentialPlan, type PlanDeps } from './plan.js';
import { amountsFromGross, decodeRecord, encodeRecord, type ConfidentialRecordV1 } from './record.js';
import { SecretAmount } from './secret.js';
import { exactRecord } from './strict.js';
import { ConfidentialRecordStore, MAX_ENVELOPE_BYTES, createMemoryKv } from './store.js';

const NS = 'p13:audit:eip155-31337';
const ID = '0123456789abcdef0123456789abcdef';
const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};
const codeOfAsync = async (fn: () => Promise<unknown>): Promise<string> => {
  const r = await toResultAsync(fn);
  return r.ok ? 'ok' : r.code;
};

function record(overrides: Partial<ConfidentialRecordV1> = {}): ConfidentialRecordV1 {
  return {
    schema: 'ghostpay.confidential-record/v1',
    recordId: ID,
    revision: 1,
    state: 'prepared',
    protocolId: 'ctm-cleartext',
    asset: CTM_ASSET,
    assetDigest: assetDigest(CTM_ASSET),
    invoiceDigest: `keccak256:${'ab'.repeat(32)}`,
    planDigest: `sha256:${'cd'.repeat(32)}`,
    feePolicy: 'seller_pays',
    amounts: amountsFromGross(15_000_037n),
    sessionEpoch: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function walk(store: ConfidentialRecordStore, id: string, states: readonly ConfidentialRecordV1['state'][], from = 1, evidence?: ConfidentialRecordV1['evidence']): Promise<number> {
  let rev = from;
  for (const state of states) {
    await store.update(id, rev, { state, updatedAt: NOW, ...(state === 'submitted' && evidence ? { evidence } : {}) });
    rev += 1;
  }
  return rev;
}

describe('A1: backup import never replaces an effect-bearing record with a divergent copy', () => {
  it('keeps a submitted record (with tx hash) when the backup has a higher-revision cancelled branch', async () => {
    const sealer = createAesGcmSealer(await generateRecordKey());
    const a = new ConfidentialRecordStore(createMemoryKv(), sealer, NS);
    await a.create(record());
    const atRev1 = await a.exportBackup();
    await walk(a, ID, ['reviewed', 'authorized', 'submitted'], 1, { txHash: `0x${'77'.repeat(32)}` });
    const b = new ConfidentialRecordStore(createMemoryKv(), sealer, NS);
    await b.importBackup(atRev1);
    await walk(b, ID, ['reviewed', 'prepared', 'reviewed', 'cancelled']);
    const report = await a.importBackup(await b.exportBackup());
    expect(report).toMatchObject({ replacedOlder: 0, conflicts: 1 });
    const kept = await a.load(ID);
    expect(kept?.state).toBe('submitted');
    expect(kept?.evidence?.txHash).toBe(`0x${'77'.repeat(32)}`);
  });

  it('refuses a higher-revision copy whose immutable fields differ (another plan under the same id)', async () => {
    const sealer = createAesGcmSealer(await generateRecordKey());
    const a = new ConfidentialRecordStore(createMemoryKv(), sealer, NS);
    await a.create(record());
    const b = new ConfidentialRecordStore(createMemoryKv(), sealer, NS);
    await b.create(record({ amounts: amountsFromGross(99n), planDigest: `sha256:${'ee'.repeat(32)}` }));
    await walk(b, ID, ['reviewed', 'prepared']);
    expect(await a.importBackup(await b.exportBackup())).toMatchObject({ replacedOlder: 0, conflicts: 1 });
    expect((await a.load(ID))?.amounts.gross.reveal((v) => v)).toBe(15_000_037n);
  });

  it('still upgrades a genuine older copy of the same plan', async () => {
    const sealer = createAesGcmSealer(await generateRecordKey());
    const a = new ConfidentialRecordStore(createMemoryKv(), sealer, NS);
    await a.create(record());
    const b = new ConfidentialRecordStore(createMemoryKv(), sealer, NS);
    await b.importBackup(await a.exportBackup());
    await walk(b, ID, ['reviewed', 'authorized', 'submitted'], 1, { txHash: `0x${'77'.repeat(32)}` });
    expect(await a.importBackup(await b.exportBackup())).toMatchObject({ replacedOlder: 1, conflicts: 0 });
    expect((await a.load(ID))?.state).toBe('submitted');
  });
});

describe('A2: the record cap is enforced on writes; reads, export and reconcile never lock out', () => {
  it('create and import refuse past maxRecords; list, paged export and reconcile still work', async () => {
    const sealer = createAesGcmSealer(await generateRecordKey());
    const kv = createMemoryKv();
    const store = new ConfidentialRecordStore(kv, sealer, NS, { maxRecords: 3 });
    for (let i = 1; i <= 3; i++) await store.create(record({ recordId: i.toString(16).padStart(32, '0') }));
    expect(await codeOfAsync(() => store.create(record({ recordId: 'ff'.repeat(16) })))).toBe('P13_RECORD_LIMIT');
    // Two tabs racing past the cap (or older data) must not make the store unreadable.
    const other = new ConfidentialRecordStore(kv, sealer, NS);
    await other.create(record({ recordId: 'ee'.repeat(16) }));
    expect(await store.list()).toHaveLength(4);
    expect((await store.reconcileAfterReload(1, NOW)).total).toBe(4);
    const pages = await store.exportBackupPages(2);
    expect(pages.map((p) => p.records.length)).toEqual([2, 2]);
    const restored = new ConfidentialRecordStore(createMemoryKv(), sealer, NS, { maxRecords: 3 });
    await restored.importBackup(pages[0]);
    expect(await codeOfAsync(() => restored.importBackup(pages[1]))).toBe('P13_RECORD_LIMIT');
    expect(await restored.list()).toHaveLength(2);
    expect(codeOf(() => new ConfidentialRecordStore(kv, sealer, NS, { maxRecords: 0 }))).toBe('P13_RECORD_LIMIT');
    expect(await codeOfAsync(() => store.exportBackupPages(0))).toBe('P13_RECORD_LIMIT');
  });
});

describe('A3: the cleartext fixture disclosure never says it hides anything', () => {
  it('fixture consent lines exclude FHE claims; CT-1 keeps every not-protected line', () => {
    const ctm = buildDisclosure('ctm-cleartext');
    for (const k of ['CT_NP_EDGES_PUBLIC', 'CT_NP_OPERATOR_TRUST', 'CT_NP_DECRYPTORS', 'CT_HIDES_AMOUNT_ONLY', 'CT_TRUST_ZAMA', 'P13_NO_FEE_ADDON']) {
      expect(ctm.doesNotHide).not.toContain(k);
      expect(ctm.hides).not.toContain(k);
    }
    expect(ctm.doesNotHide).toEqual(expect.arrayContaining(['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY', 'P13_SETTLEMENT_OFF']));
    const ct1 = buildDisclosure('ct1-zama');
    for (const k of NOT_PROTECTED_KEYS) expect(ct1.doesNotHide).toContain(k);
  });

  it('assets may carry only the trust statements of their own protocol', () => {
    const ctm = mutable(CTM_ASSET);
    ctm['trustStatementIds'] = [...CTM_ASSET.trustStatementIds, 'CT_TRUST_ZAMA'];
    expect(codeOf(() => decodeConfidentialAsset(ctm))).toBe('P13_INVALID_ASSET');
    const hides = mutable(CTM_ASSET);
    hides['trustStatementIds'] = [...CTM_ASSET.trustStatementIds, 'CT_HIDES_AMOUNT_ONLY'];
    expect(codeOf(() => decodeConfidentialAsset(hides))).toBe('P13_INVALID_ASSET');
    const ct1 = mutable(CT1_ASSET);
    ct1['trustStatementIds'] = [...CT1_ASSET.trustStatementIds, 'CT_M_NO_PRIVACY'];
    expect(codeOf(() => decodeConfidentialAsset(ct1))).toBe('P13_INVALID_ASSET');
  });
});

describe('A4: caller inputs are read once and type-checked', () => {
  it('store.update rejects accessor-backed or unknown patch fields (no read-twice state switch)', async () => {
    const store = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(await generateRecordKey()), NS);
    await store.create(record());
    let n = 0;
    const tricky = { updatedAt: NOW, get state() { return n++ === 0 ? 'reviewed' : 'submitted'; } };
    expect(await codeOfAsync(() => store.update(ID, 1, tricky as never))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => store.update(ID, 1, { state: 'reviewed', updatedAt: NOW, sessionEpoch: 9 } as never))).toBe('P13_RECORD_INVALID');
    expect((await store.load(ID))?.state).toBe('prepared');
  });

  it('store.create validates a snapshot, so a state getter cannot store verified at revision 1', async () => {
    const kv = createMemoryKv();
    const store = new ConfidentialRecordStore(kv, createAesGcmSealer(await generateRecordKey()), NS);
    let n = 0;
    const base = record();
    const tricky = Object.defineProperty({ ...base }, 'state', { get: () => (n++ === 0 ? 'prepared' : 'verified'), enumerable: true });
    const r = await codeOfAsync(() => store.create(tricky));
    const stored = await store.load(ID);
    expect(r === 'P13_RECORD_INVALID' || stored?.state === 'prepared').toBe(true);
    if (stored !== undefined) expect(stored.state).toBe('prepared');
  });

  it('interpretEvidence refuses forged SecretAmount-like objects and accessor fields', () => {
    const base = {
      receipt: 'success',
      confirmations: 3,
      minConfirmations: 2,
      expectedNet: SecretAmount.from(1000n),
      logs: [],
      pinned: { router: `0x${'a1'.repeat(20)}`, token: `0x${'b2'.repeat(20)}`, stealth: `0x${'c3'.repeat(20)}`, handle: `0x${'7d'.repeat(32)}` },
    } as const;
    const fake = { reveal: () => 'confirmed' } as unknown as SecretAmount;
    expect(codeOf(() => interpretEvidence({ ...base, delivered: fake }))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => interpretEvidence({ ...base, expectedNet: fake }))).toBe('P13_RECORD_INVALID');
    let n = 0;
    const tricky = Object.defineProperty({ ...base, delivered: SecretAmount.from(1000n) }, 'confirmations', { get: () => (n++ === 0 ? 5 : 0), enumerable: true });
    expect(codeOf(() => interpretEvidence(tricky as EvidenceInput))).toBe('P13_RECORD_INVALID');
  });

  it('checkFeeRequest accepts only an absent or empty real array', () => {
    expect(checkFeeRequest({ moduleFees: { length: 0, 0: 'fee' } as unknown as unknown[] })).toMatchObject({ ok: false });
    expect(checkFeeRequest({ moduleFees: '' as unknown as unknown[] })).toMatchObject({ ok: false });
    const getter = Object.defineProperty({}, 'moduleFees', { get: () => [], enumerable: true });
    expect(checkFeeRequest(getter)).toMatchObject({ ok: false });
    expect(checkFeeRequest({ moduleFees: [] })).toEqual({ ok: true, value: 'router-fee-only' });
  });

  it('prepare refuses non-string payer/stealth values that coerce to an address', async () => {
    const store = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(await generateRecordKey()), NS);
    const deps: PlanDeps = { store, epoch: { current: () => 1 }, clockMs: () => NOW * 1000, rng: (n) => crypto.getRandomValues(new Uint8Array(n)) };
    const gate = { enabled: true, protocolId: 'ctm-cleartext', allowFixture: true, consentDigest: disclosureDigest(buildDisclosure('ctm-cleartext')) };
    const ctx = { operationId: 'a4', sessionEpoch: 1, signal: new AbortController().signal, deadlineMs: NOW * 1000 + 60_000 };
    const r = await prepareConfidentialPlan(
      { invoice: sampleInvoice(), asset: mutable(CTM_ASSET), approved: [CTM_ASSET], gate, payer: [`0x${'0a'.repeat(20)}`] as unknown as string, stealth: `0x${'0b'.repeat(20)}`, ctx },
      deps,
    );
    expect(r).toMatchObject({ ok: false, code: 'P13_INVALID_ASSET' });
  });
});

describe('A5: authorized work is never cancelled locally', () => {
  it('lifecycle and cancelPlan refuse authorized -> cancelled', async () => {
    expect(codeOf(() => assertTransition('authorized', 'cancelled'))).toBe('P13_TRANSITION');
    const store = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(await generateRecordKey()), NS);
    await store.create(record());
    await walk(store, ID, ['reviewed', 'authorized']);
    const deps: PlanDeps = { store, epoch: { current: () => 1 }, clockMs: () => NOW * 1000, rng: (n) => crypto.getRandomValues(new Uint8Array(n)) };
    const ctx = { operationId: 'a5', sessionEpoch: 1, signal: new AbortController().signal, deadlineMs: NOW * 1000 + 60_000 };
    expect(await cancelPlan(ID, 3, ctx, deps)).toMatchObject({ ok: false, code: 'P13_TRANSITION' });
    expect((await store.load(ID))?.state).toBe('authorized');
  });
});

describe('A6: size checks run before per-element work', () => {
  it('a huge records array is refused quickly with P13_RECORD_LIMIT', async () => {
    const store = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(await generateRecordKey()), NS);
    const huge = new Array<string>(2_000_000).fill('AA');
    const t0 = performance.now();
    expect(await codeOfAsync(() => store.importBackup({ schema: 'ghostpay.confidential-backup/v1', namespace: NS, records: huge }))).toBe('P13_RECORD_LIMIT');
    expect(performance.now() - t0).toBeLessThan(250);
  });

  it('an object with many extra keys is refused before descriptors are built', () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 200_000; i++) big[`k${i}`] = i;
    const t0 = performance.now();
    expect(codeOf(() => exactRecord(big, ['a'], [], 'P13_RECORD_INVALID'))).toBe('P13_RECORD_INVALID');
    expect(performance.now() - t0).toBeLessThan(250);
  });
});

describe('A7, A8, A9: strict edges', () => {
  it('A7: a BOM-prefixed record is not canonical', () => {
    const bytes = encodeRecord(record());
    expect(codeOf(() => decodeRecord(Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes])))).toBe('P13_RECORD_INVALID');
  });

  it('A8: prototype keys are not routes', () => {
    for (const k of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      expect(codeOf(() => classifyRoute(k as RouteKind))).toBe('P13_UNSUPPORTED');
    }
  });

  it('A9: encodeRecord reports invalid fields as P13_RECORD_INVALID, not P13_INTERNAL', () => {
    expect(codeOf(() => encodeRecord(record({ sessionEpoch: -1 })))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => encodeRecord(record({ evidence: { txHash: undefined } as never })))).toBe('P13_RECORD_INVALID');
  });
});

describe('A10: envelope bound and nonce sanity', () => {
  it('caps envelopes at the largest valid size and refuses repeated or all-zero nonces', async () => {
    expect(MAX_ENVELOPE_BYTES).toBe(25 + 12 + 64 * 1024 + 16);
    const key = await generateRecordKey();
    const fixed = createAesGcmSealer(key, { subtle: crypto.subtle, rng: (n) => new Uint8Array(n).fill(7) });
    await fixed.seal(new Uint8Array(1), new Uint8Array(1));
    expect(await codeOfAsync(() => fixed.seal(new Uint8Array(1), new Uint8Array(1)))).toBe('P13_INTERNAL');
    const zero = createAesGcmSealer(key, { subtle: crypto.subtle, rng: (n) => new Uint8Array(n) });
    expect(await codeOfAsync(() => zero.seal(new Uint8Array(1), new Uint8Array(1)))).toBe('P13_INTERNAL');
  });
});

describe('B1 in P13: verified needs on-chain provenance from the pinned router and token', () => {
  const ROUTER = getAddress(`0x${'a1'.repeat(20)}`);
  const TOKEN = getAddress(`0x${'b2'.repeat(20)}`);
  const STEALTH = getAddress(`0x${'c3'.repeat(20)}`);
  const HANDLE: Hex = `0x${'7d'.repeat(32)}`;
  const pinned = { router: ROUTER, token: TOKEN, stealth: STEALTH, handle: HANDLE };
  const genuine: PaymentLog[] = [
    { address: TOKEN, topics: encodeEventTopics({ abi: TOKEN_ABI, eventName: 'ConfidentialTransfer', args: { from: ROUTER, to: STEALTH, amount: HANDLE } }) as Hex[], data: '0x' },
    { address: ROUTER, topics: encodeEventTopics({ abi: ROUTER_ABI, eventName: 'ConfidentialPayment', args: { token: TOKEN } }) as Hex[], data: encodeAbiParameters([{ type: 'bytes32' }], [HANDLE]) },
  ];
  const base = { receipt: 'success', confirmations: 3, minConfirmations: 2, expectedNet: SecretAmount.from(1000n), delivered: SecretAmount.from(1000n), pinned } as const;

  it('a decrypted handle without the router and token events stays unknown', () => {
    expect(interpretEvidence({ ...base, logs: [] })).toEqual({ state: 'unknown', reason: 'unverified-source' });
    expect(interpretEvidence({ ...base, logs: genuine })).toEqual({ state: 'verified', reason: 'delivered' });
  });
});

describe('A11: the store cannot rebind a plan to another session epoch', () => {
  it('RecordPatch has no sessionEpoch field', async () => {
    const store = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(await generateRecordKey()), NS);
    await store.create(record());
    expect(await codeOfAsync(() => store.update(ID, 1, { state: 'reviewed', updatedAt: NOW, sessionEpoch: 2 } as never))).toBe('P13_RECORD_INVALID');
    expect((await store.load(ID))?.sessionEpoch).toBe(1);
  });
});
