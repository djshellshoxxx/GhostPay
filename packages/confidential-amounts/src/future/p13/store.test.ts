import { describe, expect, it } from 'vitest';
import { toResult, toResultAsync } from './errors.js';
import { assetDigest } from './asset.js';
import { createAesGcmSealer, generateRecordKey } from './cipher.js';
import { CTM_ASSET, NOW, seededBytes } from './fixtures.testutil.js';
import { amountsFromGross, decodeRecord, encodeRecord, summarize, type ConfidentialRecordV1 } from './record.js';
import { ConfidentialRecordStore, createMemoryKv, type BackupV1 } from './store.js';

const GROSS = 15_000_037n; // fee 37500, net 14962537: distinctive digits for leak scans
const NS = 'p13:profile-1:eip155-31337';

function record(overrides: Partial<ConfidentialRecordV1> = {}): ConfidentialRecordV1 {
  return {
    schema: 'ghostpay.confidential-record/v1',
    recordId: '0123456789abcdef0123456789abcdef',
    revision: 1,
    state: 'prepared',
    protocolId: 'ctm-cleartext',
    asset: CTM_ASSET,
    assetDigest: assetDigest(CTM_ASSET),
    invoiceDigest: `keccak256:${'ab'.repeat(32)}`,
    planDigest: `sha256:${'cd'.repeat(32)}`,
    feePolicy: 'seller_pays',
    amounts: amountsFromGross(GROSS),
    sessionEpoch: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function setup(seed = 1) {
  const key = await generateRecordKey();
  const sealer = createAesGcmSealer(key, { subtle: globalThis.crypto.subtle, rng: seededBytes(seed) });
  const kv = createMemoryKv();
  return { key, sealer, kv, store: new ConfidentialRecordStore(kv, sealer, NS) };
}

const codeOfAsync = async (fn: () => Promise<unknown>): Promise<string> => {
  const r = await toResultAsync(fn);
  return r.ok ? 'ok' : r.code;
};
const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};
const containsAscii = (bytes: Uint8Array, s: string): boolean => Buffer.from(bytes).includes(Buffer.from(s, 'utf8'));

describe('record codec', () => {
  it('round-trips canonically and keeps amounts in SecretAmounts', () => {
    const bytes = encodeRecord(record({ evidence: { txHash: `0x${'12'.repeat(32)}`, reason: 'not-decrypted' } }));
    const back = decodeRecord(bytes);
    expect(back.amounts.gross.reveal((v) => v)).toBe(GROSS);
    expect(back.amounts.fee.reveal((v) => v)).toBe(GROSS / 400n);
    expect(encodeRecord(back)).toEqual(bytes);
    expect(() => JSON.stringify(back)).toThrow();
  });

  it('summaries carry no amount', () => {
    const s = summarize(record());
    expect(JSON.stringify(s)).not.toContain(GROSS.toString());
    expect(Object.keys(s)).not.toContain('amounts');
  });

  const mutate = (f: (o: Record<string, unknown>) => void): Uint8Array => {
    const o = JSON.parse(new TextDecoder().decode(encodeRecord(record()))) as Record<string, unknown>;
    f(o);
    return new TextEncoder().encode(JSON.stringify(o));
  };

  it.each<[string, (o: Record<string, unknown>) => void, string]>([
    ['fee/net not matching the router split (inflation)', (o) => ((o['amounts'] as Record<string, string>)['net'] = '15000037'), 'P13_CONSERVATION'],
    ['zero gross', (o) => (o['amounts'] = { gross: '0', fee: '0', net: '0' }), 'P13_AMOUNT_RANGE'],
    ['gross above 2^64-1', (o) => (o['amounts'] = { gross: '18446744073709551616', fee: '0', net: '0' }), 'P13_AMOUNT_RANGE'],
    ['negative amount', (o) => ((o['amounts'] as Record<string, string>)['fee'] = '-1'), 'P13_INVALID_AMOUNT'],
    ['unknown state', (o) => (o['state'] = 'paid'), 'P13_RECORD_INVALID'],
    ['protocol mismatch', (o) => (o['protocolId'] = 'ct1-zama'), 'P13_RECORD_INVALID'],
    ['asset digest mismatch', (o) => (o['assetDigest'] = `sha256:${'00'.repeat(32)}`), 'P13_RECORD_INVALID'],
    ['updatedAt before createdAt', (o) => (o['updatedAt'] = NOW - 1), 'P13_RECORD_INVALID'],
    ['revision 0', (o) => (o['revision'] = 0), 'P13_RECORD_INVALID'],
    ['bad record id', (o) => (o['recordId'] = 'XYZ'), 'P13_RECORD_INVALID'],
    ['unknown key', (o) => (o['note'] = 'x'), 'P13_RECORD_INVALID'],
    ['bad evidence reason', (o) => (o['evidence'] = { reason: 'trust-me' }), 'P13_RECORD_INVALID'],
    ['bad tx hash', (o) => (o['evidence'] = { txHash: '0x12' }), 'P13_RECORD_INVALID'],
    ['wrong fee policy', (o) => (o['feePolicy'] = 'nobody_pays'), 'P13_RECORD_INVALID'],
    ['sha256 used for invoice digest', (o) => (o['invoiceDigest'] = `sha256:${'ab'.repeat(32)}`), 'P13_RECORD_INVALID'],
  ])('rejects %s', (_name, f, code) => {
    expect(codeOf(() => decodeRecord(mutate(f)))).toBe(code);
  });

  it('rejects non-canonical, duplicate-key, non-UTF-8 and oversized input', () => {
    const canonical = new TextDecoder().decode(encodeRecord(record()));
    expect(codeOf(() => decodeRecord(new TextEncoder().encode(` ${canonical}`)))).toBe('P13_RECORD_INVALID');
    const dup = canonical.replace('{"amounts"', '{"revision":1,"amounts"');
    expect(codeOf(() => decodeRecord(new TextEncoder().encode(dup)))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => decodeRecord(Uint8Array.from([0xff, 0xfe, 0x7b])))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => decodeRecord(new Uint8Array(64 * 1024 + 1)))).toBe('P13_RECORD_LIMIT');
  });
});

describe('encrypted store', () => {
  it('stores only ciphertext: no amount, asset address or record JSON in the stored bytes', async () => {
    const { kv, store } = await setup();
    await store.create(record());
    const [stored] = [...kv.raw.values()];
    if (!stored) throw new Error('nothing stored');
    for (const needle of [GROSS.toString(), (GROSS / 400n).toString(), CTM_ASSET.asset.asset.slice(2), 'amounts', 'prepared']) {
      expect(containsAscii(stored, needle), needle).toBe(false);
    }
    const loaded = await store.load(record().recordId);
    expect(loaded?.amounts.net.reveal((v) => v)).toBe(GROSS - GROSS / 400n);
  });

  it('fails closed on a wrong key (incorrect credentials) with a uniform error', async () => {
    const a = await setup();
    await a.store.create(record());
    const other = createAesGcmSealer(await generateRecordKey());
    const wrong = new ConfidentialRecordStore(a.kv, other, NS);
    expect(await codeOfAsync(() => wrong.load(record().recordId))).toBe('P13_RECORD_AUTH');
  });

  it('detects every single-bit corruption of ciphertext or tag', async () => {
    const { kv, store } = await setup();
    await store.create(record());
    const key = [...kv.raw.keys()][0] ?? '';
    const original = kv.raw.get(key) ?? new Uint8Array();
    const positions = [25, 30, 40, original.length - 17, original.length - 1];
    for (const pos of positions) {
      const bad = Uint8Array.from(original);
      bad[pos] = (bad[pos] ?? 0) ^ 0x01;
      kv.raw.set(key, bad);
      expect(await codeOfAsync(() => store.load(record().recordId)), `byte ${pos}`).toBe('P13_RECORD_AUTH');
    }
  });

  it('binds envelopes to record id, revision header and namespace', async () => {
    const { kv, store, sealer } = await setup();
    await store.create(record());
    const env = kv.raw.get(`${NS}/${record().recordId}`) ?? new Uint8Array();
    // Moved under another id.
    const otherId = 'ffffffffffffffffffffffffffffffff';
    kv.raw.set(`${NS}/${otherId}`, env);
    expect(await codeOfAsync(() => store.load(otherId))).toBe('P13_RECORD_INVALID');
    // Header revision edited (AAD mismatch).
    const edited = Uint8Array.from(env);
    edited[24] = 9;
    kv.raw.set(`${NS}/${record().recordId}`, edited);
    expect(await codeOfAsync(() => store.load(record().recordId))).toBe('P13_RECORD_AUTH');
    // Same key, another profile namespace.
    kv.raw.set(`${NS}/${record().recordId}`, env);
    const other = new ConfidentialRecordStore(kv, sealer, 'p13:profile-2:eip155-31337');
    kv.raw.set(`p13:profile-2:eip155-31337/${record().recordId}`, env);
    expect(await codeOfAsync(() => other.load(record().recordId))).toBe('P13_RECORD_AUTH');
    // Truncated and foreign envelopes.
    kv.raw.set(`${NS}/${record().recordId}`, env.subarray(0, 20));
    expect(await codeOfAsync(() => store.load(record().recordId))).toBe('P13_RECORD_INVALID');
    kv.raw.set(`${NS}/${record().recordId}`, Uint8Array.from([0x47, 0x50, 0x49, 0x31, ...env.subarray(4)]));
    expect(await codeOfAsync(() => store.load(record().recordId))).toBe('P13_RECORD_INVALID');
  });

  it('refuses invalid keys and namespaces', async () => {
    const extractable = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    expect(codeOf(() => createAesGcmSealer(extractable))).toBe('P13_RECORD_AUTH');
    const short = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);
    expect(codeOf(() => createAesGcmSealer(short))).toBe('P13_RECORD_AUTH');
    const { sealer, kv } = await setup();
    expect(codeOf(() => new ConfidentialRecordStore(kv, sealer, '../etc'))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => new ConfidentialRecordStore(kv, sealer, 'P13'))).toBe('P13_RECORD_INVALID');
    const badRng = createAesGcmSealer(await generateRecordKey(), { subtle: globalThis.crypto.subtle, rng: () => new Uint8Array(4) });
    expect(await codeOfAsync(() => badRng.seal(new Uint8Array(), new Uint8Array(1)))).toBe('P13_INTERNAL');
  });

  it('create refuses duplicates and non-initial records', async () => {
    const { store } = await setup();
    await store.create(record());
    expect(await codeOfAsync(() => store.create(record()))).toBe('P13_RECORD_CONFLICT');
    expect(await codeOfAsync(() => store.create(record({ recordId: 'aa'.repeat(16), revision: 2 })))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => store.create(record({ recordId: 'bb'.repeat(16), state: 'submitted' })))).toBe('P13_RECORD_INVALID');
    expect(await store.load('cc'.repeat(16))).toBeUndefined();
    expect(await codeOfAsync(() => store.load('../x'))).toBe('P13_RECORD_INVALID');
  });

  it('update enforces lifecycle, revision CAS (two tabs) and monotonic time', async () => {
    const { kv, sealer, store } = await setup();
    await store.create(record());
    const id = record().recordId;
    const tab2 = new ConfidentialRecordStore(kv, sealer, NS);
    const r2 = await store.update(id, 1, { state: 'reviewed', updatedAt: NOW + 1 });
    expect(r2.revision).toBe(2);
    expect(await codeOfAsync(() => tab2.update(id, 1, { state: 'cancelled', updatedAt: NOW + 2 }))).toBe('P13_RECORD_CONFLICT');
    expect(await codeOfAsync(() => store.update(id, 2, { state: 'verified', updatedAt: NOW + 2 }))).toBe('P13_TRANSITION');
    expect(await codeOfAsync(() => store.update(id, 2, { state: 'prepared', updatedAt: NOW }))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => store.update('dd'.repeat(16), 1, { state: 'reviewed', updatedAt: NOW }))).toBe('P13_RECORD_INVALID');
    const r3 = await tab2.update(id, 2, { state: 'cancelled', updatedAt: NOW + 3 });
    expect(r3.state).toBe('cancelled');
    // Immutable fields survive updates.
    expect(r3.amounts.gross.reveal((v) => v)).toBe(GROSS);
    expect(r3.planDigest).toBe(record().planDigest);
  });

  it('detects a storage rollback to an older valid envelope within the session', async () => {
    const { kv, store } = await setup();
    await store.create(record());
    const id = record().recordId;
    const key = `${NS}/${id}`;
    const v1 = kv.raw.get(key) ?? new Uint8Array();
    await store.update(id, 1, { state: 'reviewed', updatedAt: NOW + 1 });
    kv.raw.set(key, v1);
    expect(await codeOfAsync(() => store.load(id))).toBe('P13_RECORD_ROLLBACK');
  });

  it('lists summaries and reports corrupt envelopes without deleting them', async () => {
    const { kv, store } = await setup();
    await store.create(record());
    await store.create(record({ recordId: 'ee'.repeat(16) }));
    kv.raw.set(`${NS}/${'ee'.repeat(16)}`, Uint8Array.from([1, 2, 3]));
    const list = await store.list();
    expect(list.map((e) => e.status)).toEqual(['ok', 'corrupt']);
    expect(kv.raw.has(`${NS}/${'ee'.repeat(16)}`)).toBe(true);
    expect(JSON.stringify(list)).not.toContain(GROSS.toString());
  });
});

describe('reload and interrupted operations', () => {
  it('invalidates reviews from an older session and never resends submitted or authorized work', async () => {
    const { kv, sealer, store } = await setup();
    const ids = { reviewed: '10'.repeat(16), submitted: '20'.repeat(16), authorized: '30'.repeat(16), prepared: '40'.repeat(16) };
    for (const id of Object.values(ids)) await store.create(record({ recordId: id }));
    await store.update(ids.reviewed, 1, { state: 'reviewed', updatedAt: NOW });
    await store.update(ids.submitted, 1, { state: 'reviewed', updatedAt: NOW });
    await store.update(ids.submitted, 2, { state: 'authorized', updatedAt: NOW });
    await store.update(ids.submitted, 3, { state: 'submitted', updatedAt: NOW, evidence: { txHash: `0x${'77'.repeat(32)}` } });
    await store.update(ids.authorized, 1, { state: 'reviewed', updatedAt: NOW });
    await store.update(ids.authorized, 2, { state: 'authorized', updatedAt: NOW });

    // Simulated reload: a new store instance over the same persisted bytes, new session epoch.
    const reloaded = new ConfidentialRecordStore(kv, sealer, NS);
    const report = await reloaded.reconcileAfterReload(2, NOW + 60);
    expect(report).toEqual({ total: 4, invalidatedReviews: 1, needsReconciliation: 2, corrupt: 0 });
    expect((await reloaded.load(ids.reviewed))?.state).toBe('prepared');
    const sub = await reloaded.load(ids.submitted);
    expect(sub?.state).toBe('unknown');
    expect(sub?.evidence).toEqual({ txHash: `0x${'77'.repeat(32)}`, reason: 'reloaded' });
    expect((await reloaded.load(ids.authorized))?.state).toBe('authorized');
    expect((await reloaded.load(ids.prepared))?.state).toBe('prepared');
    // Idempotent: a second pass changes nothing further.
    const again = await reloaded.reconcileAfterReload(2, NOW + 61);
    expect(again.invalidatedReviews).toBe(0);
  });

  it('counts corrupt envelopes during reconciliation and leaves them in place', async () => {
    const { kv, sealer, store } = await setup();
    await store.create(record());
    kv.raw.set(`${NS}/${'5a'.repeat(16)}`, Uint8Array.from([0x47, 0x50, 0x43, 0x31, 1]));
    const report = await new ConfidentialRecordStore(kv, sealer, NS).reconcileAfterReload(1, NOW);
    expect(report).toEqual({ total: 2, invalidatedReviews: 0, needsReconciliation: 0, corrupt: 1 });
    expect(kv.raw.size).toBe(2);
  });

  it('an interrupted write (crash between seal and CAS) leaves the previous revision intact', async () => {
    const { kv, sealer, store } = await setup();
    await store.create(record());
    const failingKv = { ...kv, compareAndSet: () => Promise.reject(new Error('tab closed')) };
    const crashing = new ConfidentialRecordStore(failingKv, sealer, NS);
    expect(await codeOfAsync(() => crashing.update(record().recordId, 1, { state: 'reviewed', updatedAt: NOW + 1 }))).toBe('P13_INTERNAL');
    const r = await new ConfidentialRecordStore(kv, sealer, NS).load(record().recordId);
    expect(r?.revision).toBe(1);
    expect(r?.state).toBe('prepared');
  });
});

describe('backup export and recovery', () => {
  it('exports ciphertext only and restores into a fresh store with the same key', async () => {
    const { key, store } = await setup();
    await store.create(record());
    await store.update(record().recordId, 1, { state: 'reviewed', updatedAt: NOW + 1 });
    const backup = await store.exportBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain(GROSS.toString());
    expect(text).not.toContain('reviewed');

    const fresh = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(key), NS);
    expect(await fresh.importBackup(JSON.parse(text))).toEqual({ inserted: 1, replacedOlder: 0, keptNewerOrEqual: 0, conflicts: 0 });
    const r = await fresh.load(record().recordId);
    expect(r?.state).toBe('reviewed');
    expect(r?.amounts.gross.reveal((v) => v)).toBe(GROSS);
    // Re-import is a no-op.
    expect((await fresh.importBackup(backup)).keptNewerOrEqual).toBe(1);
  });

  it('never replaces a newer local record with an older backup, but upgrades an older one', async () => {
    const { key, store } = await setup();
    await store.create(record());
    const old = await store.exportBackup();
    await store.update(record().recordId, 1, { state: 'reviewed', updatedAt: NOW + 1 });
    expect((await store.importBackup(old)).keptNewerOrEqual).toBe(1);
    expect((await store.load(record().recordId))?.revision).toBe(2);

    const newer = await store.exportBackup();
    const other = new ConfidentialRecordStore(createMemoryKv(), createAesGcmSealer(key), NS);
    await other.importBackup(old);
    expect((await other.importBackup(newer)).replacedOlder).toBe(1);
  });

  it('rejects the whole backup (writes nothing) if any entry is wrong-key, corrupt or malformed', async () => {
    const a = await setup(1);
    await a.store.create(record());
    const good = await a.store.exportBackup();
    const b = await setup(2);
    await b.store.create(record({ recordId: '99'.repeat(16) }));
    const foreign = await b.store.exportBackup();
    const mixed: BackupV1 = { ...good, records: [...foreign.records, ...good.records] };
    const target = new ConfidentialRecordStore(createMemoryKv(), a.sealer, NS);
    expect(await codeOfAsync(() => target.importBackup(mixed))).toBe('P13_RECORD_AUTH');
    expect(await target.list()).toEqual([]);

    const flipped = good.records[0] ?? '';
    const corrupt = { ...good, records: [`${flipped.slice(0, -2)}${flipped.endsWith('A') ? 'B' : 'A'}${flipped.slice(-1)}`] };
    expect(await codeOfAsync(() => target.importBackup(corrupt))).not.toBe('ok');
    expect(await codeOfAsync(() => target.importBackup({ ...good, records: ['***'] }))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => target.importBackup({ ...good, namespace: 'p13:other' }))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => target.importBackup({ ...good, schema: 'x' }))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => target.importBackup({ ...good, records: [...good.records, ...good.records] }))).toBe('P13_RECORD_INVALID');
    expect(await codeOfAsync(() => target.importBackup({ ...good, records: Array.from({ length: 1001 }, () => 'AA') }))).toBe('P13_RECORD_LIMIT');
    expect(await target.list()).toEqual([]);
  });

  it('keeps an unreadable local copy instead of overwriting it during import', async () => {
    const { kv, store } = await setup();
    await store.create(record());
    const backup = await store.exportBackup();
    kv.raw.set(`${NS}/${record().recordId}`, Uint8Array.from([9, 9, 9]));
    expect((await store.importBackup(backup)).conflicts).toBe(1);
    expect(kv.raw.get(`${NS}/${record().recordId}`)).toEqual(Uint8Array.from([9, 9, 9]));
  });
});
