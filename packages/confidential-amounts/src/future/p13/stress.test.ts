/**
 * P13 stress and concurrency tests: batch limits at full size, many concurrent writers on one record (simulated tabs
 * with real async interleaving), reload reconciliation over large mixed stores, and coarse timing budgets.
 * Budgets are generous upper bounds to catch pathological (e.g. quadratic) behaviour, not benchmarks.
 */
import { describe, expect, it } from 'vitest';
import { toResultAsync } from './errors.js';
import { assetDigest } from './asset.js';
import { createAesGcmSealer, generateRecordKey, type RecordSealer } from './cipher.js';
import { buildDisclosure, disclosureDigest } from './disclosure.js';
import { CTM_ASSET, NOW, sampleInvoice } from './fixtures.testutil.js';
import { prepareConfidentialPlan, reviewPlan, type PlanDeps } from './plan.js';
import { amountsFromGross, type ConfidentialRecordV1 } from './record.js';
import { ConfidentialRecordStore, MAX_BACKUP_RECORDS, createMemoryKv, type KvPort } from './store.js';

const NS = 'p13:stress:eip155-31337';
const idOf = (i: number): string => i.toString(16).padStart(32, '0');

function record(i: number, overrides: Partial<ConfidentialRecordV1> = {}): ConfidentialRecordV1 {
  return {
    schema: 'ghostpay.confidential-record/v1',
    recordId: idOf(i + 1),
    revision: 1,
    state: 'prepared',
    protocolId: 'ctm-cleartext',
    asset: CTM_ASSET,
    assetDigest: assetDigest(CTM_ASSET),
    invoiceDigest: `keccak256:${'ab'.repeat(32)}`,
    planDigest: `sha256:${'cd'.repeat(32)}`,
    feePolicy: 'seller_pays',
    amounts: amountsFromGross(1_000_000n + BigInt(i)),
    sessionEpoch: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** KV wrapper that yields to the event loop before every operation, so concurrent callers really interleave. */
function interleaving(kv: KvPort): KvPort {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  return {
    get: async (k) => (await tick(), kv.get(k)),
    compareAndSet: async (k, e, n) => (await tick(), kv.compareAndSet(k, e, n)),
    keys: async (p) => (await tick(), kv.keys(p)),
  };
}

async function sealer(): Promise<RecordSealer> {
  return createAesGcmSealer(await generateRecordKey());
}

describe('stress: full-size batches', () => {
  it(`creates, lists, exports and restores ${MAX_BACKUP_RECORDS} records within budget`, async () => {
    const s = await sealer();
    const store = new ConfidentialRecordStore(createMemoryKv(), s, NS);
    const t0 = performance.now();
    for (let i = 0; i < MAX_BACKUP_RECORDS; i++) await store.create(record(i));
    const tCreate = performance.now() - t0;
    const list = await store.list();
    expect(list).toHaveLength(MAX_BACKUP_RECORDS);
    expect(list.every((e) => e.status === 'ok')).toBe(true);
    const backup = await store.exportBackup();
    expect(backup.records).toHaveLength(MAX_BACKUP_RECORDS);
    const restored = new ConfidentialRecordStore(createMemoryKv(), s, NS);
    const t1 = performance.now();
    expect(await restored.importBackup(JSON.parse(JSON.stringify(backup)))).toEqual({
      inserted: MAX_BACKUP_RECORDS,
      replacedOlder: 0,
      keptNewerOrEqual: 0,
      conflicts: 0,
    });
    const tImport = performance.now() - t1;
    expect((await restored.load(idOf(MAX_BACKUP_RECORDS)))?.amounts.gross.reveal((v) => v)).toBe(1_000_000n + BigInt(MAX_BACKUP_RECORDS - 1));
    expect(tCreate).toBeLessThan(30_000);
    expect(tImport).toBeLessThan(30_000);
  }, 120_000);

  it('one record over the batch limit makes list/export/reconcile refuse (P13_RECORD_LIMIT) without data loss', async () => {
    const kv = createMemoryKv();
    const store = new ConfidentialRecordStore(kv, await sealer(), NS);
    for (let i = 0; i <= MAX_BACKUP_RECORDS; i++) await store.create(record(i));
    const ops: (() => Promise<unknown>)[] = [() => store.list(), () => store.exportBackup(), () => store.reconcileAfterReload(2, NOW)];
    for (const op of ops) {
      expect(await toResultAsync(op)).toMatchObject({ ok: false, code: 'P13_RECORD_LIMIT' });
    }
    expect(kv.raw.size).toBe(MAX_BACKUP_RECORDS + 1);
    expect((await store.load(idOf(1)))?.state).toBe('prepared');
  }, 120_000);
});

describe('stress: concurrent writers (simulated tabs)', () => {
  it('N tabs racing the same transition: exactly one commit per revision, losers get a retryable conflict', async () => {
    const base = createMemoryKv();
    const s = await sealer();
    await new ConfidentialRecordStore(base, s, NS).create(record(0));
    const id = idOf(1);
    for (const tabs of [2, 8, 32]) {
      const fresh = new ConfidentialRecordStore(base, s, NS);
      const cur = await fresh.load(id);
      if (cur === undefined) throw new Error('missing');
      const target = cur.state === 'prepared' ? 'reviewed' : 'prepared';
      const results = await Promise.all(
        Array.from({ length: tabs }, () =>
          toResultAsync(() => new ConfidentialRecordStore(interleaving(base), s, NS).update(id, cur.revision, { state: target, updatedAt: NOW + cur.revision })),
        ),
      );
      const wins = results.filter((r) => r.ok);
      const losses = results.filter((r) => !r.ok);
      expect(wins).toHaveLength(1);
      for (const l of losses) expect(l).toEqual({ ok: false, code: 'P13_RECORD_CONFLICT', retryable: true });
      const after = await new ConfidentialRecordStore(base, s, NS).load(id);
      expect(after?.revision).toBe(cur.revision + 1);
      expect(after?.state).toBe(target);
    }
  });

  it('N tabs creating the same record id: exactly one wins, the stored record is intact', async () => {
    const base = createMemoryKv();
    const s = await sealer();
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => toResultAsync(() => new ConfidentialRecordStore(interleaving(base), s, NS).create(record(0, { amounts: amountsFromGross(BigInt(1000 + i)) })))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === 'P13_RECORD_CONFLICT')).toBe(true);
    const r = await new ConfidentialRecordStore(base, s, NS).load(idOf(1));
    expect(r?.revision).toBe(1);
    const gross = r?.amounts.gross.reveal((v) => v) ?? 0n;
    expect(gross >= 1000n && gross < 1016n).toBe(true);
  });

  it('retrying losers converge: 20 tabs each advance a counter-like chain without lost updates', async () => {
    // reviewed <-> prepared toggles stand in for independent edits; each tab retries on conflict.
    const base = createMemoryKv();
    const s = await sealer();
    await new ConfidentialRecordStore(base, s, NS).create(record(0));
    const id = idOf(1);
    let commits = 0;
    await Promise.all(
      Array.from({ length: 20 }, async () => {
        const tab = new ConfidentialRecordStore(interleaving(base), s, NS);
        for (;;) {
          const cur = await tab.load(id);
          if (cur === undefined) throw new Error('missing');
          const r = await toResultAsync(() => tab.update(id, cur.revision, { state: cur.state === 'prepared' ? 'reviewed' : 'prepared', updatedAt: NOW + cur.revision }));
          if (r.ok) {
            commits += 1;
            return;
          }
          expect(r).toEqual({ ok: false, code: 'P13_RECORD_CONFLICT', retryable: true });
        }
      }),
    );
    expect(commits).toBe(20);
    expect((await new ConfidentialRecordStore(base, s, NS).load(id))?.revision).toBe(21);
  });
});

describe('stress: reload reconciliation over a large mixed store', () => {
  it('is correct and idempotent over 600 records in mixed states', async () => {
    const kv = createMemoryKv();
    const s = await sealer();
    const store = new ConfidentialRecordStore(kv, s, NS);
    const chains: Record<string, readonly ('reviewed' | 'authorized' | 'submitted' | 'cancelled')[]> = {
      prepared: [],
      reviewed: ['reviewed'],
      authorized: ['reviewed', 'authorized'],
      submitted: ['reviewed', 'authorized', 'submitted'],
      cancelled: ['cancelled'],
    };
    const kinds = Object.keys(chains);
    for (let i = 0; i < 600; i++) {
      await store.create(record(i));
      let rev = 1;
      for (const st of chains[kinds[i % kinds.length] ?? 'prepared'] ?? []) {
        await store.update(idOf(i + 1), rev, { state: st, updatedAt: NOW });
        rev += 1;
      }
    }
    const reloaded = new ConfidentialRecordStore(kv, s, NS);
    const t0 = performance.now();
    const first = await reloaded.reconcileAfterReload(2, NOW + 60);
    const elapsed = performance.now() - t0;
    // 120 of each kind: reviewed -> prepared (stale), prepared stale, submitted -> unknown, authorized flagged.
    expect(first).toEqual({ total: 600, invalidatedReviews: 120, stalePlans: 240, needsReconciliation: 240, corrupt: 0 });
    const second = await reloaded.reconcileAfterReload(2, NOW + 61);
    expect(second).toEqual({ total: 600, invalidatedReviews: 0, stalePlans: 240, needsReconciliation: 240, corrupt: 0 });
    expect(elapsed).toBeLessThan(60_000);
  }, 180_000);
});

describe('stress: plan preparation throughput', () => {
  it('prepares and reviews 200 fixture plans within budget, each with a unique record and digest', async () => {
    const kv = createMemoryKv();
    const store = new ConfidentialRecordStore(kv, await sealer(), NS);
    const gate = { enabled: true, protocolId: 'ctm-cleartext', allowFixture: true, consentDigest: disclosureDigest(buildDisclosure('ctm-cleartext')) };
    const deps: PlanDeps = { store, epoch: { current: () => 1 }, clockMs: () => NOW * 1000, rng: (n) => crypto.getRandomValues(new Uint8Array(n)) };
    const ctx = { operationId: 'stress', sessionEpoch: 1, signal: new AbortController().signal, deadlineMs: NOW * 1000 + 60_000 };
    const invoice = sampleInvoice();
    const digests = new Set<string>();
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      const p = await prepareConfidentialPlan(
        { invoice, asset: structuredClone(CTM_ASSET), approved: [CTM_ASSET], gate, payer: `0x${'0a'.repeat(20)}`, stealth: `0x${'0b'.repeat(20)}`, ctx },
        deps,
      );
      if (!p.ok) throw new Error(p.code);
      digests.add(p.value.planDigest);
      const v = await reviewPlan(p.value.recoveryRef.slice('p13-record:'.length), 1, gate, ctx, deps);
      if (!v.ok) throw new Error(v.code);
    }
    const elapsed = performance.now() - t0;
    expect(digests.size).toBe(200);
    expect(kv.raw.size).toBe(200);
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);
});
