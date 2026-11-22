import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReconciliationVaultStore } from '@ghostpay/ux-vault/portable';
import { RecurringPreparationController, transitionRecurringPlan } from './index';
import { JAN31, snapshotFixture } from './fixtures.testutil';
import { RecurringEncryptedVault, RecurringVaultError } from './vault';

class TransactionalMemoryStore implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  beforeCommit: (() => void) | undefined;
  failAfterCommit = false;

  async read(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async compareAndSwap(
    key: string, expected: string | null, next: string, guard: () => void,
  ): Promise<boolean> {
    guard();
    this.beforeCommit?.();
    guard();
    if ((this.data.get(key) ?? null) !== expected) return false;
    this.data.set(key, next);
    if (this.failAfterCommit) throw new Error('simulated lost commit acknowledgement');
    return true;
  }
}

const profile = 'profile-1';
const keyMaterial = new Uint8Array(32).fill(37);

async function testKey(bytes: Uint8Array = keyMaterial): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function vault(store: TransactionalMemoryStore, key = keyMaterial): Promise<RecurringEncryptedVault> {
  const instance = new RecurringEncryptedVault(store, profile, () => undefined);
  instance.unlock(await testKey(key));
  return instance;
}

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('F10 M4 — encrypted, revision-safe recurring snapshots', () => {
  it('commits an initially paused plan as ciphertext, then reloads it', async () => {
    const store = new TransactionalMemoryStore();
    const first = await vault(store);
    const saved = await first.commit(null, snapshotFixture({ status: 'paused' }));
    expect(saved.snapshot.plans[0]!.plan.status).toBe('paused');
    expect(saved.snapshot.revision).toBe('snapshot-1');
    const raw = [...store.data.values()].join('');
    expect(raw).not.toContain('plan-1');
    expect(raw).not.toContain('template-1');
    expect(raw).not.toContain('1000000000000000001');
    const second = await vault(store);
    const loaded = await second.load();
    expect(loaded?.snapshot).toEqual(saved.snapshot);
  });

  it('does not accept an unreviewed active plan or an outbox on first creation', async () => {
    const store = new TransactionalMemoryStore();
    const instance = await vault(store);
    await expect(instance.commit(null, snapshotFixture())).rejects.toMatchObject({ code: 'UNREVIEWED' });
    const draft = snapshotFixture({ status: 'paused' });
    draft.plans[0]!.nextPeriodIndex = 1;
    draft.outbox.push({
      eventId: 'plan-1:period:0:invoice', planId: 'plan-1', planRevision: 'terms-1',
      periodIndex: 0, kind: 'invoice', artifactRef: 'artifact-0', status: 'prepared',
    });
    await expect(instance.commit(null, draft)).rejects.toMatchObject({ code: 'UNREVIEWED' });
    expect(store.data.size).toBe(0);
  });

  it('rejects ciphertext modification, wrong keys and cross-profile backup restore', async () => {
    const store = new TransactionalMemoryStore();
    const instance = await vault(store);
    await instance.commit(null, snapshotFixture({ status: 'paused' }));
    const backup = await instance.exportEncrypted();
    expect(backup).not.toBeNull();
    const wrong = await vault(store, new Uint8Array(32).fill(19));
    await expect(wrong.load()).rejects.toMatchObject({ code: 'CORRUPT' });
    const another = new RecurringEncryptedVault(new TransactionalMemoryStore(), 'profile-2', () => undefined);
    another.unlock(await testKey());
    await expect(another.restoreToEmpty(backup!, 'restored-1')).rejects.toMatchObject({ code: 'CORRUPT' });
    const key = [...store.data.keys()][0]!;
    const payload = JSON.parse(store.data.get(key)!) as { ciphertext: string };
    payload.ciphertext = `${payload.ciphertext.slice(0, -2)}00`;
    store.data.set(key, JSON.stringify(payload));
    await expect(instance.load()).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('rejects duplicated envelope keys without mutating the encrypted store', async () => {
    const store = new TransactionalMemoryStore();
    const instance = await vault(store);
    await instance.commit(null, snapshotFixture({ status: 'paused' }));
    const key = [...store.data.keys()][0]!;
    const raw = store.data.get(key)!;
    store.data.set(key, raw.replace('"iv":', '"iv":"000000000000000000000000","iv":'));
    await expect(instance.load()).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('only one tab wins a same-revision CAS, and stale handles cannot roll state back', async () => {
    const store = new TransactionalMemoryStore();
    const first = await vault(store);
    const second = await vault(store);
    await first.commit(null, snapshotFixture({ status: 'paused' }));
    const a = (await first.load())!;
    const b = (await second.load())!;
    const nextA = { ...a.snapshot, revision: 'snapshot-2' };
    const nextB = { ...b.snapshot, revision: 'snapshot-3' };
    const results = await Promise.allSettled([first.commit(a, nextA), second.commit(b, nextB)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter(result => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });
    const loaded = await first.load();
    expect(['snapshot-2', 'snapshot-3']).toContain(loaded?.snapshot.revision);
    await expect(first.commit(a, { ...a.snapshot, revision: 'snapshot-4' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('durably reserves only one reviewed due period from two tabs', async () => {
    const store = new TransactionalMemoryStore();
    const first = await vault(store);
    const second = await vault(store);
    const initial = await first.commit(null, snapshotFixture({ status: 'paused' }));
    const active = transitionRecurringPlan(initial.snapshot, 'plan-1', 'resume', 'terms-1', 'terms-2', {
      profileRef: profile, expectedSnapshotRevision: 'snapshot-1',
      nextSnapshotRevision: 'snapshot-2', nowSeconds: JAN31 - 1,
    });
    await first.commit(initial, active);
    const a = (await first.load())!;
    const b = (await second.load())!;
    const ctx = { operationId: 'issue-1', sessionEpoch: 1,
      nowSeconds: JAN31, signal: new AbortController().signal };
    const reviewerA = new RecurringPreparationController();
    const reviewerB = new RecurringPreparationController();
    const viewA = reviewerA.preview(a.snapshot, 'plan-1', ctx);
    const viewB = reviewerB.preview(b.snapshot, 'plan-1', ctx);
    const attempts = await Promise.allSettled([
      first.reserveReviewed(reviewerA, viewA, a, ctx, 'local-reservation-a', 'snapshot-3a'),
      second.reserveReviewed(reviewerB, viewB, b, ctx, 'local-reservation-b', 'snapshot-3b'),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
    const recovered = (await second.load())!;
    expect(recovered.snapshot.outbox).toHaveLength(1);
    expect(recovered.snapshot.outbox[0]?.status).toBe('prepared');
    expect(recovered.snapshot.plans[0]?.nextPeriodIndex).toBe(1);
  });

  it('never deletes committed references or reverses period cursors', async () => {
    const store = new TransactionalMemoryStore();
    const instance = await vault(store);
    const first = await instance.commit(null, snapshotFixture({ status: 'paused' }));
    const active = transitionRecurringPlan(first.snapshot, 'plan-1', 'resume', 'terms-1', 'terms-2', {
      profileRef: profile, expectedSnapshotRevision: 'snapshot-1',
      nextSnapshotRevision: 'snapshot-2', nowSeconds: JAN31 - 1,
    });
    const saved = await instance.commit(first, active);
    const ctx = { operationId: 'issue-1', sessionEpoch: 1, nowSeconds: JAN31,
      signal: new AbortController().signal };
    const reviewer = new RecurringPreparationController();
    const view = reviewer.preview(saved.snapshot, 'plan-1', ctx);
    const prepared = await instance.reserveReviewed(reviewer, view, saved, ctx, 'local-ref-0', 'snapshot-3');
    await expect(instance.commit(prepared, { ...prepared.snapshot, revision: 'snapshot-4', outbox: [] }))
      .rejects.toMatchObject({ code: 'HISTORY' });
    await expect(instance.commit(prepared, { ...prepared.snapshot, revision: 'snapshot-4', plans: [
      { ...prepared.snapshot.plans[0]!, nextPeriodIndex: 0 },
    ] })).rejects.toMatchObject({ code: 'HISTORY' });
    expect((await instance.load())?.snapshot.outbox).toHaveLength(1);
  });

  it('reports ambiguous storage acknowledgement as an error and requires reload', async () => {
    const store = new TransactionalMemoryStore();
    const instance = await vault(store);
    const first = await instance.commit(null, snapshotFixture({ status: 'paused' }));
    store.failAfterCommit = true;
    await expect(instance.commit(first, { ...first.snapshot, revision: 'snapshot-2' }))
      .rejects.toMatchObject({ code: 'STORAGE' });
    store.failAfterCommit = false;
    expect((await instance.load())?.snapshot.revision).toBe('snapshot-2');
    await expect(instance.commit(first, { ...first.snapshot, revision: 'snapshot-3' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('aborts writes on lock/revoked authority rather than signalling success', async () => {
    const store = new TransactionalMemoryStore();
    const instance = await vault(store);
    const first = await instance.commit(null, snapshotFixture({ status: 'paused' }));
    store.beforeCommit = () => instance.lock();
    await expect(instance.commit(first, { ...first.snapshot, revision: 'snapshot-2' }))
      .rejects.toMatchObject({ code: 'LOCKED' });
    store.beforeCommit = undefined;
    instance.unlock(await testKey());
    expect((await instance.load())?.snapshot.revision).toBe('snapshot-1');
  });

  it('can restore a reviewed encrypted backup only into empty storage and pauses active plans', async () => {
    const sourceStore = new TransactionalMemoryStore();
    const source = await vault(sourceStore);
    const draft = await source.commit(null, snapshotFixture({ status: 'paused' }));
    const active = transitionRecurringPlan(draft.snapshot, 'plan-1', 'resume', 'terms-1', 'terms-2', {
      profileRef: profile, expectedSnapshotRevision: 'snapshot-1',
      nextSnapshotRevision: 'snapshot-2', nowSeconds: JAN31 - 1,
    });
    await source.commit(draft, active);
    const backup = (await source.exportEncrypted())!;
    const destination = await vault(new TransactionalMemoryStore());
    const restored = await destination.restoreToEmpty(backup, 'restored-1');
    expect(restored.snapshot.revision).toBe('restored-1');
    expect(restored.snapshot.plans[0]?.plan.status).toBe('paused');
    await expect(destination.restoreToEmpty(backup, 'restored-2'))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses extractable or non-AES256 keys and rejects operations while locked', async () => {
    const store = new TransactionalMemoryStore();
    const instance = new RecurringEncryptedVault(store, profile, () => undefined);
    await expect(instance.load()).rejects.toMatchObject({ code: 'LOCKED' });
    const extractable = await globalThis.crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', true, ['encrypt', 'decrypt']);
    expect(() => instance.unlock(extractable)).toThrowError(new RecurringVaultError('KEY'));
    const aes128 = await testKey(new Uint8Array(16));
    expect(() => instance.unlock(aes128)).toThrowError(new RecurringVaultError('KEY'));
    expect(store.data.size).toBe(0);
  });
});
