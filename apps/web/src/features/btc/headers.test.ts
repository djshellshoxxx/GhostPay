import { CHAIN_PARAMS, HeaderChain, DEFAULT_FORK_HEADERS, MAX_FORK_HEADERS, parseHeader, SilentPaymentError, wrapSecret, type HeaderSource } from '@ghostpay/btc-silent-payments';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { blockSummary, coinbase, fakeIdb, forkChain, mineHeader, mockChain, walletA, type MockChain } from './fixtures.testutil';
import {
  EsploraHeaderSource,
  GENESIS_HEADERS,
  genesisCheckpoint,
  HEADERS_PER_ROUND,
  HeaderSyncError,
  idbHeaderStore,
  invalidateReorged,
  loadHeaderChain,
  memoryHeaderStore,
  MemoryHeaderStore,
  MAX_HEADERS,
  MAX_ROUNDS_PER_CALL,
  SAVE_EVERY_ROUNDS,
  syncHeaders,
  type HeaderStore,
} from './headers';
import { BTC_NETWORKS, btcNetwork } from './network';
import type { FoundPayment, ScanResult } from './scan';

const BASE = 'https://esplora.test/api';
const NOW = (): number => 2_000_000_000;
const regtest = btcNetwork('regtest');

function codeOf(p: Promise<unknown>): Promise<string> {
  return p.then(
    () => 'none',
    (e: unknown) => (e instanceof SilentPaymentError ? e.code : 'other'),
  );
}

const sourceOf = (chain: MockChain): EsploraHeaderSource => new EsploraHeaderSource(new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }));

async function synced(chain: MockChain, store = new MemoryHeaderStore()): Promise<HeaderChain> {
  const { chain: headers } = await loadHeaderChain(regtest, store, { now: NOW });
  await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store });
  return headers;
}

describe('pinned genesis headers', () => {
  it('hash to the genesis hashes pinned for every enabled network; mainnet has none', () => {
    for (const net of BTC_NETWORKS.filter((n) => n.enabled)) {
      const cp = genesisCheckpoint(net);
      expect(parseHeader(cp.headerHex).hash).toBe(net.genesisHash);
      // The header meets its own network's proof-of-work limit, so the chain accepts it as its anchor.
      expect(HeaderChain.create({ params: CHAIN_PARAMS[net.id], checkpoint: cp }).tipHash).toBe(net.genesisHash);
    }
    expect(Object.keys(GENESIS_HEADERS)).not.toContain('mainnet');
    expect(() => genesisCheckpoint(btcNetwork('mainnet'))).toThrow(SilentPaymentError);
  });
});

describe('Esplora header source', () => {
  it('rebuilds headers from /blocks summaries, ten per request', async () => {
    const chain = mockChain('regtest', walletA());
    const got = await sourceOf(chain).getHeaders(0, 5);
    expect(got).toEqual([GENESIS_HEADERS.regtest, ...chain.blocks.slice(1).map((b) => b.header)]);
    expect(chain.requests).toEqual(['GET /blocks/4']);
  });

  it('refuses a summary whose fields do not hash to its id, or that is malformed', async () => {
    const chain = mockChain('regtest', walletA());
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    chain.summaryEdit = (s) => (s['height'] === 3 ? { ...s, nonce: (s['nonce'] as number) + 1 } : s);
    expect(await codeOf(client.headersBelow(4))).toBe('INVALID_RESPONSE');
    for (const edit of [
      (s: Record<string, unknown>) => ({ ...s, version: 1.5 }),
      (s: Record<string, unknown>) => ({ ...s, timestamp: 2 ** 32 }),
      (s: Record<string, unknown>) => ({ ...s, previousblockhash: null }),
      (s: Record<string, unknown>) => ({ ...s, merkle_root: 'zz' }),
      (s: Record<string, unknown>) => ({ ...s, height: 1 }),
      () => 'not an object' as unknown as Record<string, unknown>,
    ]) {
      chain.summaryEdit = (s) => (s['height'] === 3 ? edit(s) : s);
      expect(await codeOf(client.headersBelow(4))).toBe('INVALID_RESPONSE');
    }
    delete chain.summaryEdit;
    expect(await codeOf(client.headersBelow(-1))).toBe('INVALID_INPUT');
    // A summary list missing a height the source needs.
    chain.summaryEdit = (s) => (s['height'] === 2 ? { ...s, height: 9, id: s['id'] } : s);
    expect(await codeOf(sourceOf(chain).getHeaders(1, 4))).toBe('INVALID_RESPONSE');
  });

  it('reads one header at a time from a server without /blocks/:height, checking each hash', async () => {
    const chain = mockChain('regtest', walletA());
    chain.summaries = false;
    const src = sourceOf(chain);
    expect(await src.getHeaders(1, 4)).toEqual(chain.blocks.slice(1).map((b) => b.header));
    expect(chain.requests.filter((r) => r.startsWith('GET /blocks/'))).toEqual(['GET /blocks/4']);
    expect(chain.requests.filter((r) => r.endsWith('/header'))).toHaveLength(4);
    // A header that does not hash to the hash the server named for that height.
    chain.blocks[2]!.header = chain.blocks[3]!.header!;
    expect(await codeOf(src.getHeaders(1, 4))).toBe('INVALID_RESPONSE');
  });

  it('passes on errors other than a transport failure without falling back', async () => {
    const chain = mockChain('regtest', walletA());
    chain.summaryEdit = () => ({});
    expect(await codeOf(sourceOf(chain).getHeaders(1, 4))).toBe('INVALID_RESPONSE');
    expect(chain.requests.some((r) => r.endsWith('/header'))).toBe(false);
  });
});

/** A store that fails every operation. */
const brokenStore = (): HeaderStore => ({
  load: () => Promise.reject(new Error('x')),
  save: () => Promise.reject(new Error('quota')),
  clear: () => Promise.reject(new Error('x')),
});

describe('loading saved headers', () => {
  it('starts at genesis with nothing saved, and when the store cannot be read', async () => {
    const empty = await loadHeaderChain(regtest, new MemoryHeaderStore(), { now: NOW });
    expect(empty).toMatchObject({ loaded: 'none' });
    expect(empty.chain.tipHash).toBe(regtest.genesisHash);
    expect((await loadHeaderChain(regtest, brokenStore(), { now: NOW })).loaded).toBe('none');
  });

  it('restores a saved chain only after checking it again, and deletes anything that fails', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    const first = await synced(chain, store);
    const saved = store.value ?? '';
    const back = await loadHeaderChain(regtest, store, { now: NOW });
    expect(back.loaded).toBe('restored');
    expect(back.chain.tipHash).toBe(first.tipHash);
    for (const bad of ['', 'null', '[]', '{"network":"regtest"}', saved.replace('"regtest"', '"testnet4"'), saved.replace(/("headersHex":"[0-9a-f]{152})[0-9a-f]{8}/, '$1ffffffff')]) {
      store.value = bad;
      store.work = 1n << 200n;
      const r = await loadHeaderChain(regtest, store, { now: NOW });
      expect(r.loaded, bad.slice(0, 20)).toBe('discarded');
      expect(r.chain.tipHeight).toBe(0);
      // Deleted outright, so a fresh genesis chain can be saved again (the work guard would refuse an overwrite).
      expect(store.value).toBeUndefined();
      expect(store.work).toBeUndefined();
    }
    // A discard is reported even when the record cannot be deleted.
    const r = await loadHeaderChain(regtest, { ...brokenStore(), load: () => Promise.resolve('x') }, { now: NOW });
    expect(r.loaded).toBe('discarded');
  });

  it('never accepts a self-consistent chain on a substituted anchor', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    await synced(chain, store);
    // Another "genesis" with valid regtest proof of work and five valid headers on it.
    const fakeGenesis = mineHeader('11'.repeat(32), [coinbase(900)], 0x207fffff, 1_296_688_602);
    const headers: string[] = [];
    let prev = fakeGenesis;
    for (let i = 1; i <= 5; i++) {
      prev = mineHeader(parseHeader(prev).hash, [coinbase(900 + i)], 0x207fffff, 1_296_688_602 + 600 * i);
      headers.push(prev);
    }
    const forged = { version: 2, network: 'regtest', checkpoint: { height: 0, hash: parseHeader(fakeGenesis).hash, headerHex: fakeGenesis, previousHeaders: [] }, headersHex: headers.join('') };
    store.value = JSON.stringify(forged);
    expect((await loadHeaderChain(regtest, store, { now: NOW })).loaded).toBe('discarded');
  });

  it('re-validates in chunks, yielding and reporting progress, and refuses a chain above the size limit', async () => {
    const chain = mockChain('regtest', walletA());
    forkChain(chain.blocks, 5, 4100, 0);
    const store = new MemoryHeaderStore();
    await synced(chain, store);
    const seen: number[] = [];
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 0);
    const r = await loadHeaderChain(regtest, store, { now: NOW, onProgress: (h) => seen.push(h) });
    clearInterval(timer);
    expect(r.loaded).toBe('restored');
    expect(seen).toEqual([2016, 4032, 4104]);
    // Other work ran while it was checking: the tab was not blocked for the whole chain.
    expect(ticks).toBeGreaterThan(0);
    expect((await loadHeaderChain(regtest, store, { now: NOW, maxHeaders: 4000 })).loaded).toBe('discarded');
    expect(store.value).toBeUndefined();
  });
});

describe('syncing headers', () => {
  const done = { reorgFrom: undefined, lessWork: false, saved: true, refused: false, more: false };
  it('validates and adopts the source chain, then reports nothing new', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    const { chain: headers } = await loadHeaderChain(regtest, store, { now: NOW });
    const seen: number[] = [];
    const out = await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store, onProgress: (h) => seen.push(h) });
    expect(out).toEqual({ ...done, tipHeight: 4 });
    expect(seen).toEqual([4]);
    expect(headers.tipHash).toBe(chain.blocks[4]!.hash);
    expect(store.work).toBe(headers.tipWork);
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toEqual({ ...done, tipHeight: 4 });
  });

  it('works in rounds, saves every few rounds and at the end, and stops at the round limit', async () => {
    const chain = mockChain('regtest', walletA());
    forkChain(chain.blocks, 5, HEADERS_PER_ROUND * 6 + 20, 0);
    const store = new MemoryHeaderStore();
    const { chain: headers } = await loadHeaderChain(regtest, store, { now: NOW });
    const saves: number[] = [];
    const counting: HeaderStore = {
      load: () => store.load(),
      save: (s, w) => { saves.push((JSON.parse(s) as { headersHex: string }).headersHex.length / 160); return store.save(s, w); },
      clear: () => store.clear(),
    };
    const seen: number[] = [];
    const first = await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: counting, onProgress: (h) => seen.push(h), maxRounds: 6 });
    expect(seen).toEqual([1, 2, 3, 4, 5, 6].map((n) => n * HEADERS_PER_ROUND));
    expect(saves).toEqual([SAVE_EVERY_ROUNDS * HEADERS_PER_ROUND, 6 * HEADERS_PER_ROUND]);
    expect(first).toMatchObject({ more: true, tipHeight: 6 * HEADERS_PER_ROUND });
    // The next call resumes from the saved chain and finishes.
    const resumed = (await loadHeaderChain(regtest, store, { now: NOW })).chain;
    expect(await syncHeaders({ chain: resumed, sources: [sourceOf(chain)], store })).toMatchObject({ more: false, tipHeight: chain.blocks.length - 1 });
    expect(MAX_ROUNDS_PER_CALL * HEADERS_PER_ROUND).toBeLessThanOrEqual(MAX_HEADERS);
  });

  it('fails closed on an invalid header, keeping (and having saved) only valid headers', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    const headers = await synced(chain, store);
    const before = store.value;
    // Block 5 claims an unknown parent.
    const txs = [coinbase(5)];
    chain.blocks.push({ hash: '', header: mineHeader('ab'.repeat(32), txs, 0x207fffff, 1_700_100_000), txs });
    chain.blocks[5]!.hash = parseHeader(chain.blocks[5]!.header!).hash;
    expect(await codeOf(syncHeaders({ chain: headers, sources: [sourceOf(chain)], store }))).toBe('INVALID_HEADER');
    expect(headers.tipHeight).toBe(4);
    expect(store.value).toBe(before);
    // A source that cannot be reached fails the check too.
    chain.failPath = '/blocks/tip/height';
    expect(await codeOf(syncHeaders({ chain: headers, sources: [sourceOf(chain)], store }))).toBe('TRANSPORT_FAILURE');
    // So does an abort.
    const ac = new AbortController();
    ac.abort();
    expect(await codeOf(syncHeaders({ chain: headers, sources: [sourceOf(chain)], store, signal: ac.signal }))).toBe('ABORTED');
  });

  it('reports what changed before a failure: a heavier fork adopted in round 1, then round 2 fails (saved first)', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    const headers = await synced(chain, store);
    forkChain(chain.blocks, 3, 3, 2);
    let tips = 0;
    const fetchFn: MockChain['fetchFn'] = (url, init) =>
      url.endsWith('/blocks/tip/height') && ++tips === 2 ? Promise.resolve(new Response('x', { status: 500 })) : chain.fetchFn(url, init);
    const src = new EsploraHeaderSource(new EsploraClient({ baseUrl: BASE, fetchFn }));
    const e = await syncHeaders({ chain: headers, sources: [src], store }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HeaderSyncError);
    expect((e as HeaderSyncError).code).toBe('TRANSPORT_FAILURE');
    expect((e as HeaderSyncError).partial).toMatchObject({ reorgFrom: 2, tipHeight: 5 });
    expect(headers.tipHash).toBe(chain.blocks[5]!.hash);
    expect(store.work).toBe(headers.tipWork);
  });

  it('never grows the chain past the size limit (rounds are capped) and fails closed at it, every time', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    const { chain: headers } = await loadHeaderChain(regtest, store, { now: NOW });
    for (let i = 0; i < 3; i++) {
      const e = await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store, maxHeaders: 3, headersPerRound: 5 }).catch((x: unknown) => x);
      expect((e as HeaderSyncError).code).toBe('UNSUPPORTED');
      expect(headers.tipHeight).toBe(3);
    }
    expect((JSON.parse(store.value ?? '{}') as { headersHex: string }).headersHex.length / 160).toBe(3);
  });

  it('a later successful save clears an earlier failure', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    let fail = true;
    const flaky: HeaderStore = { load: () => store.load(), save: (s, w) => (fail ? ((fail = false), Promise.reject(new Error('x'))) : store.save(s, w)), clear: () => store.clear() };
    const { chain: headers } = await loadHeaderChain(regtest, store, { now: NOW });
    forkChain(chain.blocks, 5, 30, 0);
    const out = await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: flaky, headersPerRound: 5 });
    expect(out).toMatchObject({ saved: true, refused: false, tipHeight: 34 });
  });

  it('a deeper competing branch than the package evaluates is a distinct failure, not "less work"', async () => {
    const chain = mockChain('regtest', walletA());
    forkChain(chain.blocks, 5, DEFAULT_FORK_HEADERS + 100, 0);
    const headers = await synced(chain);
    // Shares blocks 0-2, then claims a branch that would replace more checked headers than the package compares.
    const at = (h: number): string => (h === 0 ? GENESIS_HEADERS.regtest : h <= 2 ? chain.blocks[h]!.header! : GENESIS_HEADERS.signet);
    const deep: HeaderSource = { getTipHeight: () => Promise.resolve(MAX_FORK_HEADERS + 10), getHeaders: (f, n) => Promise.resolve(Array.from({ length: n }, (_, i) => at(f + i))) };
    const e = await syncHeaders({ chain: headers, sources: [deep], store: new MemoryHeaderStore() }).catch((x: unknown) => x);
    expect((e as HeaderSyncError).code).toBe('FORK_TOO_DEEP');
    expect((e as HeaderSyncError).partial.lessWork).toBe(false);
  });

  it('keeps the heavier chain against a fork with less (or equal) work, and follows one with more', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    const headers = await synced(chain, store);
    const tip = headers.tipHash;
    forkChain(chain.blocks, 3, 2, 1); // same length: equal work
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toMatchObject({ lessWork: true, reorgFrom: undefined, tipHeight: 4 });
    expect(headers.tipHash).toBe(tip);
    forkChain(chain.blocks, 2, 4, 2); // longer: more work
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toMatchObject({ lessWork: false, reorgFrom: 1, tipHeight: 5 });
    expect(headers.tipHash).toBe(chain.blocks[5]!.hash);
    expect((await loadHeaderChain(regtest, store, { now: NOW })).chain.tipHash).toBe(chain.blocks[5]!.hash);
  });

  it('reports a store that cannot save, or that holds a heavier chain, without failing the check', async () => {
    const chain = mockChain('regtest', walletA());
    const { chain: headers } = await loadHeaderChain(regtest, new MemoryHeaderStore(), { now: NOW });
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: brokenStore() })).toMatchObject({ tipHeight: 4, saved: false });
    const heavier = new MemoryHeaderStore();
    heavier.value = 'other tab';
    heavier.work = 1n << 200n;
    const { chain: again } = await loadHeaderChain(regtest, new MemoryHeaderStore(), { now: NOW });
    expect(await syncHeaders({ chain: again, sources: [sourceOf(chain)], store: heavier })).toMatchObject({ tipHeight: 4, saved: false });
    expect(heavier.value).toBe('other tab');
  });
});

describe('invalidating scan results after a reorg', () => {
  const pay = (height: number, blockHash: string, tweak = wrapSecret(new Uint8Array(32).fill(height))): FoundPayment => ({
    txid: 'aa'.repeat(32), vout: height, amountSats: 1000n, xOnlyPublicKey: new Uint8Array(32), spendTweak: tweak, height, blockHash, label: null, duplicateKey: false,
  });

  it('treats blocks above the checked tip as not yet checked, not as reorged', async () => {
    const chain = mockChain('regtest', walletA());
    const full = await synced(chain);
    const blocks = chain.blocks.slice(1).map((b, i) => ({ height: i + 1, hash: b.hash }));
    const scan: ScanResult = { fromHeight: 1, toHeight: 4, found: [pay(3, chain.blocks[3]!.hash)], spentCount: 0, blocks, headerAnchored: true };
    expect(full.tipHeight).toBe(4);
    const short = HeaderChain.create({ params: CHAIN_PARAMS.regtest, checkpoint: genesisCheckpoint(regtest), now: NOW });
    short.connect(chain.blocks.slice(1, 3).map((b) => b.header!));
    expect(invalidateReorged(scan, short)).toEqual({ scan, dropped: [] });
    // A real mismatch at or below the checked tip still cuts back.
    forkChain(chain.blocks, 2, 1, 6);
    const other = HeaderChain.create({ params: CHAIN_PARAMS.regtest, checkpoint: genesisCheckpoint(regtest), now: NOW });
    other.connect(chain.blocks.slice(1, 3).map((b) => b.header!));
    expect(invalidateReorged(scan, other)).toMatchObject({ scan: { toHeight: 1, found: [] }, dropped: scan.found });
  });

  it('keeps results whose blocks are still on the chain and cuts back the rest', async () => {
    const chain = mockChain('regtest', walletA());
    const headers = await synced(chain);
    const blocks = chain.blocks.slice(1).map((b, i) => ({ height: i + 1, hash: b.hash }));
    const scan: ScanResult = { fromHeight: 1, toHeight: 4, found: [pay(2, chain.blocks[2]!.hash), pay(3, chain.blocks[3]!.hash)], spentCount: 0, blocks, headerAnchored: true };
    expect(invalidateReorged(scan, headers)).toEqual({ scan, dropped: [] });
    forkChain(chain.blocks, 3, 3, 4);
    await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: new MemoryHeaderStore() });
    const cut = invalidateReorged(scan, headers);
    expect(cut.scan).toMatchObject({ fromHeight: 1, toHeight: 2, found: [scan.found[0]], blocks: blocks.slice(0, 2) });
    expect(cut.dropped).toEqual([scan.found[1]]);
    // A payment whose own block hash is off-chain, even when the recorded blocks are not.
    const odd: ScanResult = { ...scan, blocks: [], found: [pay(2, 'ff'.repeat(32))] };
    expect(invalidateReorged(odd, headers)).toMatchObject({ scan: { toHeight: 1, found: [] } });
    // Nothing left: the whole scan goes.
    const late: ScanResult = { ...scan, fromHeight: 3, blocks: blocks.slice(2) };
    expect(invalidateReorged(late, headers)).toEqual({ scan: undefined, dropped: scan.found });
  });
});

describe('IndexedDB header store', () => {
  it('saves and loads one record per network, opening the database once', async () => {
    const idb = fakeIdb();
    const storeFor = idbHeaderStore(idb);
    expect(await storeFor('regtest').load()).toBeUndefined();
    expect(await storeFor('regtest').save('{"a":1}', 10n)).toBe(true);
    expect(await storeFor('signet').save('{"b":2}', 3n)).toBe(true);
    expect(await storeFor('regtest').load()).toBe('{"a":1}');
    expect(Object.fromEntries(idb.data)).toEqual({
      'headers:v1:regtest': '{"a":1}', 'headers:v1:regtest:work': 'a', 'headers:v1:signet': '{"b":2}', 'headers:v1:signet:work': '3',
    });
    expect(idb.opens).toBe(1);
    // A non-text record reads back as text that fails validation, and the load deletes it.
    idb.data.set('headers:v1:regtest', { not: 'text' });
    expect(await storeFor('regtest').load()).toBe('');
    expect((await loadHeaderChain(regtest, storeFor('regtest'), { now: NOW })).loaded).toBe('discarded');
    expect([...idb.data.keys()]).toEqual(['headers:v1:signet', 'headers:v1:signet:work']);
  });

  it('never overwrites a heavier chain another tab saved (compare-and-swap inside the transaction)', async () => {
    const idb = fakeIdb();
    const tabA = idbHeaderStore(idb)('regtest');
    const tabB = idbHeaderStore(idb)('regtest');
    expect(await tabA.save('heavy', 100n)).toBe(true);
    expect(await tabB.save('light', 99n)).toBe(false);
    expect(await tabB.load()).toBe('heavy');
    expect(await tabB.save('same', 100n)).toBe(true);
    expect(await tabA.save('heavier', 101n)).toBe(true);
    expect(await tabB.load()).toBe('heavier');
    // A corrupt work record does not block a save.
    idb.data.set('headers:v1:regtest:work', 'zz');
    expect(await tabB.save('ok', 1n)).toBe(true);
  });

  it('reports a save only once the transaction commits, and nothing is written when it aborts', async () => {
    const idb = fakeIdb();
    const s = idbHeaderStore(idb)('regtest');
    idb.failCommit = true;
    await expect(s.save('x', 1n)).rejects.toThrow(/IndexedDB transaction (failed|aborted)/);
    expect(idb.data.size).toBe(0);
    expect(await s.save('y', 1n)).toBe(true);
    expect(idb.data.get('headers:v1:regtest')).toBe('y');
    await s.clear();
    expect(idb.data.size).toBe(0);
  });

  it('a sync whose save transaction aborts after the put reports saved=false and keeps nothing', async () => {
    const chain = mockChain('regtest', walletA());
    const idb = fakeIdb();
    const store = idbHeaderStore(idb)('regtest');
    const { chain: headers } = await loadHeaderChain(regtest, store, { now: NOW });
    idb.failCommit = true;
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toMatchObject({ tipHeight: 4, saved: false });
    expect(idb.data.size).toBe(0);
    expect(await store.load()).toBeUndefined();
  });

  it('two writers: the lower-work sync loses and the record keeps the heavier chain', async () => {
    const chain = mockChain('regtest', walletA());
    const idb = fakeIdb();
    const tabA = idbHeaderStore(idb)('regtest');
    const tabB = idbHeaderStore(idb)('regtest');
    const heavy = (await loadHeaderChain(regtest, tabA, { now: NOW })).chain;
    expect(await syncHeaders({ chain: heavy, sources: [sourceOf(chain)], store: tabA })).toMatchObject({ saved: true, tipHeight: 4 });
    // Tab B holds a shorter chain (its server is behind) and saves after A.
    const light = HeaderChain.create({ params: CHAIN_PARAMS.regtest, checkpoint: genesisCheckpoint(regtest), now: NOW });
    light.connect(chain.blocks.slice(1, 3).map((b) => b.header!));
    const behind = mockChain('regtest', walletA());
    behind.blocks.length = 3;
    expect(await syncHeaders({ chain: light, sources: [sourceOf(behind)], store: tabB, maxRounds: 1 })).toMatchObject({ tipHeight: 2 });
    expect(await tabB.save(JSON.stringify(light.toJSON()), light.tipWork)).toBe(false);
    const kept = await loadHeaderChain(regtest, tabB, { now: NOW });
    expect(kept.loaded).toBe('restored');
    expect(kept.chain.tipHash).toBe(heavy.tipHash);
  });

  it('rejects when the database or a request fails, and retries opening later', async () => {
    const idb = fakeIdb();
    const s = idbHeaderStore(idb)('regtest');
    idb.failOpen = true;
    await expect(s.load()).rejects.toThrow('IndexedDB unavailable');
    expect(await s.save('x', 1n)).toBe(true);
    expect(idb.opens).toBe(2);
    idb.failGet = true;
    await expect(s.load()).rejects.toThrow(/IndexedDB transaction/);
  });

  it('memory stores are per network and per instance, and guard on work too', async () => {
    const a = memoryHeaderStore();
    expect(await a('regtest').save('r', 5n)).toBe(true);
    expect(await a('regtest').save('lighter', 4n)).toBe(false);
    expect(await a('regtest').load()).toBe('r');
    expect(await a('signet').load()).toBeUndefined();
    expect(await memoryHeaderStore()('regtest').load()).toBeUndefined();
    await a('regtest').clear();
    expect(await a('regtest').load()).toBeUndefined();
  });
});


describe('fixtures', () => {
  it('serve the genesis summary with no previous hash', () => {
    expect(blockSummary(0, GENESIS_HEADERS.regtest)).toMatchObject({ id: regtest.genesisHash, previousblockhash: null });
  });
});
