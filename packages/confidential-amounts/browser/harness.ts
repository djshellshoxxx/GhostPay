/**
 * P13 browser qualification harness (test-only; bundled by browser/run.mjs, never shipped). Exercises the P13 core in
 * a real browser: WebCrypto AES-GCM with a non-extractable key persisted in IndexedDB, an IndexedDB compare-and-set
 * port, reload reconciliation, ciphertext-only storage, wrong-key refusal and backup restore into a fresh database.
 */
import { createAesGcmSealer, generateRecordKey } from '../src/future/p13/cipher.js';
import { buildDisclosure, disclosureDigest } from '../src/future/p13/disclosure.js';
import { toResultAsync } from '../src/future/p13/errors.js';
import { CTM_ASSET, NOW, sampleInvoice } from '../src/future/p13/fixtures.testutil.js';
import { decideOperation } from '../src/future/p13/gate.js';
import { prepareConfidentialPlan, reviewPlan, type PlanDeps } from '../src/future/p13/plan.js';
import { ConfidentialRecordStore, type KvPort } from '../src/future/p13/store.js';

const DB = 'ghostpay-p13-qualification';
const RESTORE_DB = 'ghostpay-p13-qualification-restore';
const NS = 'p13:qual-profile:eip155-31337';
const GATE = {
  enabled: true,
  protocolId: 'ctm-cleartext',
  allowFixture: true,
  consentDigest: disclosureDigest(buildDisclosure('ctm-cleartext')),
};
const NEEDLES = ['15000000', '14962500', '37500', 'amounts', CTM_ASSET.asset.asset.slice(2)];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error('idb request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('idb transaction failed'));
    tx.onabort = () => reject(new Error('idb transaction aborted'));
  });
}

async function openDb(name: string): Promise<IDBDatabase> {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('kv');
    r.result.createObjectStore('keys');
  };
  return req(r);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** IndexedDB port: the read and the conditional write share one readwrite transaction, so CAS is atomic across tabs. */
function idbKv(db: IDBDatabase): KvPort {
  return {
    async get(key) {
      const tx = db.transaction('kv', 'readonly');
      const v = (await req(tx.objectStore('kv').get(key))) as Uint8Array | undefined;
      return v === undefined ? undefined : new Uint8Array(v);
    },
    async compareAndSet(key, expected, next) {
      const tx = db.transaction('kv', 'readwrite');
      const os = tx.objectStore('kv');
      const cur = (await req(os.get(key))) as Uint8Array | undefined;
      const same = cur === undefined ? expected === undefined : expected !== undefined && sameBytes(new Uint8Array(cur), expected);
      if (same) os.put(Uint8Array.from(next), key);
      await done(tx);
      return same;
    },
    async keys(prefix) {
      const tx = db.transaction('kv', 'readonly');
      const all = (await req(tx.objectStore('kv').getAllKeys())) as string[];
      return all.filter((k) => k.startsWith(prefix));
    },
  };
}

async function storedKey(db: IDBDatabase): Promise<CryptoKey | undefined> {
  const tx = db.transaction('keys', 'readonly');
  return (await req(tx.objectStore('keys').get('record-key'))) as CryptoKey | undefined;
}

async function saveKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  const tx = db.transaction('keys', 'readwrite');
  tx.objectStore('keys').put(key, 'record-key');
  await done(tx);
}

function deps(store: ConfidentialRecordStore, epoch: number): PlanDeps {
  return {
    store,
    epoch: { current: () => epoch },
    clockMs: () => NOW * 1000,
    rng: (n) => crypto.getRandomValues(new Uint8Array(n)),
  };
}

const ctx = (epoch: number) => ({ operationId: 'qual', sessionEpoch: epoch, signal: new AbortController().signal, deadlineMs: NOW * 1000 + 60_000 });

/** Phase 1 (session epoch 1): prepare + review one plan; prepare a second and drive it to `submitted` (simulated interruption). */
async function phase1(): Promise<{ reviewedId: string; submittedId: string; settlementGate: string }> {
  await req(indexedDB.deleteDatabase(DB));
  await req(indexedDB.deleteDatabase(RESTORE_DB));
  const db = await openDb(DB);
  const key = await generateRecordKey();
  await saveKey(db, key);
  const store = new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(key), NS);
  const input = { invoice: sampleInvoice(), asset: structuredClone(CTM_ASSET), approved: [CTM_ASSET], gate: GATE, payer: `0x${'0a'.repeat(20)}`, stealth: `0x${'0b'.repeat(20)}`, ctx: ctx(1) };
  const a = await prepareConfidentialPlan(input, deps(store, 1));
  const b = await prepareConfidentialPlan(input, deps(store, 1));
  if (!a.ok || !b.ok) throw new Error('prepare failed');
  const reviewedId = a.value.recoveryRef.slice('p13-record:'.length);
  const submittedId = b.value.recoveryRef.slice('p13-record:'.length);
  const rv = await reviewPlan(reviewedId, 1, GATE, ctx(1), deps(store, 1));
  if (!rv.ok) throw new Error('review failed');
  // Settlement is not reachable through the gate; the store is driven directly to simulate a future interrupted submit.
  await store.update(submittedId, 1, { state: 'reviewed', updatedAt: NOW });
  await store.update(submittedId, 2, { state: 'authorized', updatedAt: NOW });
  await store.update(submittedId, 3, { state: 'submitted', updatedAt: NOW, evidence: { txHash: `0x${'77'.repeat(32)}` } });
  const gate = decideOperation('submit', GATE, 31337);
  db.close();
  return { reviewedId, submittedId, settlementGate: gate.ok ? 'allowed' : gate.code };
}

/** Phase 2 (after a page reload, session epoch 2). */
async function phase2(ids: { reviewedId: string; submittedId: string }): Promise<Record<string, unknown>> {
  const db = await openDb(DB);
  const key = await storedKey(db);
  if (key === undefined) throw new Error('record key not persisted');
  const exportable = await crypto.subtle.exportKey('raw', key).then(() => true, () => false);
  const store = new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(key), NS);
  const report = await store.reconcileAfterReload(2, NOW + 60);
  const reviewed = await store.load(ids.reviewedId);
  const submitted = await store.load(ids.submittedId);
  const grossMatches = reviewed?.amounts.gross.reveal((v) => v === 15_000_000n) ?? false;

  // Raw IndexedDB scan: every stored value, as bytes and as text.
  const tx = db.transaction('kv', 'readonly');
  const values = (await req(tx.objectStore('kv').getAll())) as Uint8Array[];
  const decoder = new TextDecoder('latin1');
  const leaks = NEEDLES.filter((n) => values.some((v) => decoder.decode(new Uint8Array(v)).includes(n)));

  const wrong = new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(await generateRecordKey()), NS);
  const wrongKey = await toResultAsync(() => wrong.load(ids.reviewedId));

  const backup = await store.exportBackup();
  const backupLeaks = NEEDLES.filter((n) => JSON.stringify(backup).includes(n));
  const restoreDb = await openDb(RESTORE_DB);
  const restored = new ConfidentialRecordStore(idbKv(restoreDb), createAesGcmSealer(key), NS);
  const imported = await restored.importBackup(JSON.parse(JSON.stringify(backup)));
  const restoredGross = (await restored.load(ids.reviewedId))?.amounts.gross.reveal((v) => v === 15_000_000n) ?? false;
  db.close();
  restoreDb.close();
  return {
    exportable,
    keyType: `${key.algorithm.name}/${(key.algorithm as AesKeyAlgorithm).length}/${String(key.extractable)}`,
    report,
    reviewedState: reviewed?.state,
    submittedState: submitted?.state,
    submittedReason: submitted?.evidence?.reason,
    grossMatches,
    storedValues: values.length,
    leaks,
    backupLeaks,
    wrongKey: wrongKey.ok ? 'opened' : wrongKey.code,
    imported,
    restoredGross,
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
  };
}

const RACE_DB = 'ghostpay-p13-qualification-race';
const RACE_NS = 'p13:qual-race:eip155-31337';

/** Race setup (one tab): fresh database, persisted key, `n` prepared records. Returns their ids. */
async function raceSetup(n: number): Promise<string[]> {
  await req(indexedDB.deleteDatabase(RACE_DB));
  const db = await openDb(RACE_DB);
  const key = await generateRecordKey();
  await saveKey(db, key);
  const store = new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(key), RACE_NS);
  const input = { invoice: sampleInvoice(), asset: structuredClone(CTM_ASSET), approved: [CTM_ASSET], gate: GATE, payer: `0x${'0a'.repeat(20)}`, stealth: `0x${'0b'.repeat(20)}`, ctx: ctx(1) };
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await prepareConfidentialPlan(input, deps(store, 1));
    if (!p.ok) throw new Error('prepare failed');
    ids.push(p.value.recoveryRef.slice('p13-record:'.length));
  }
  db.close();
  return ids;
}

/** One tab's attempt to review record `id` at revision 1; resolves to 'ok' or the P13 code. */
async function raceReview(id: string): Promise<string> {
  const db = await openDb(RACE_DB);
  try {
    const key = await storedKey(db);
    if (key === undefined) return 'no-key';
    const store = new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(key), RACE_NS);
    const r = await reviewPlan(id, 1, GATE, ctx(1), deps(store, 1));
    return r.ok ? 'ok' : r.code;
  } finally {
    db.close();
  }
}

/** Final state of record `id` as this tab reads it. */
async function raceState(id: string): Promise<{ state: string; revision: number } | null> {
  const db = await openDb(RACE_DB);
  try {
    const key = await storedKey(db);
    if (key === undefined) return null;
    const r = await new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(key), RACE_NS).load(id);
    return r === undefined ? null : { state: r.state, revision: r.revision };
  } finally {
    db.close();
  }
}

/** Browser stress: `n` plans prepared into IndexedDB, exported and restored into a fresh database; timings in ms. */
async function stress(n: number): Promise<Record<string, number>> {
  const SDB = 'ghostpay-p13-qualification-stress';
  const RDB = 'ghostpay-p13-qualification-stress-restore';
  await req(indexedDB.deleteDatabase(SDB));
  await req(indexedDB.deleteDatabase(RDB));
  const db = await openDb(SDB);
  const key = await generateRecordKey();
  const ns = 'p13:qual-stress:eip155-31337';
  const store = new ConfidentialRecordStore(idbKv(db), createAesGcmSealer(key), ns);
  const input = { invoice: sampleInvoice(), asset: structuredClone(CTM_ASSET), approved: [CTM_ASSET], gate: GATE, payer: `0x${'0a'.repeat(20)}`, stealth: `0x${'0b'.repeat(20)}`, ctx: ctx(1) };
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const p = await prepareConfidentialPlan(input, deps(store, 1));
    if (!p.ok) throw new Error('prepare failed');
  }
  const t1 = performance.now();
  const listed = (await store.list()).filter((e) => e.status === 'ok').length;
  const backup = await store.exportBackup();
  const t2 = performance.now();
  const rdb = await openDb(RDB);
  const restored = new ConfidentialRecordStore(idbKv(rdb), createAesGcmSealer(key), ns);
  const report = await restored.importBackup(JSON.parse(JSON.stringify(backup)));
  const t3 = performance.now();
  const reconciled = await new ConfidentialRecordStore(idbKv(rdb), createAesGcmSealer(key), ns).reconcileAfterReload(2, NOW + 60);
  const t4 = performance.now();
  db.close();
  rdb.close();
  return {
    prepared: n,
    listed,
    exported: backup.records.length,
    inserted: report.inserted,
    stalePlans: reconciled.stalePlans,
    prepareMs: Math.round(t1 - t0),
    listExportMs: Math.round(t2 - t1),
    importMs: Math.round(t3 - t2),
    reconcileMs: Math.round(t4 - t3),
  };
}

Object.assign(globalThis, { p13: { phase1, phase2, raceSetup, raceReview, raceState, stress }, p13Ready: true });
