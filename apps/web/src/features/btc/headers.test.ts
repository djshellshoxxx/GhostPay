import { CHAIN_PARAMS, HeaderChain, MemoryScanStateStore, parseHeader, SilentPaymentError, wrapSecret } from '@ghostpay/btc-silent-payments';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { blockSummary, coinbase, fakeIdb, forkChain, mineHeader, mockChain, walletA, type MockChain } from './fixtures.testutil';
import {
  EsploraHeaderSource,
  GENESIS_HEADERS,
  genesisCheckpoint,
  HEADERS_PER_ROUND,
  idbHeaderStore,
  invalidateReorged,
  loadHeaderChain,
  memoryHeaderStore,
  syncHeaders,
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

async function synced(chain: MockChain, store = new MemoryScanStateStore()): Promise<HeaderChain> {
  const { chain: headers } = await loadHeaderChain(regtest, store, NOW);
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

describe('loading saved headers', () => {
  it('starts at genesis with nothing saved, and when the store cannot be read', async () => {
    const empty = await loadHeaderChain(regtest, new MemoryScanStateStore(), NOW);
    expect(empty).toMatchObject({ loaded: 'none' });
    expect(empty.chain.tipHash).toBe(regtest.genesisHash);
    const broken = await loadHeaderChain(regtest, { load: () => Promise.reject(new Error('x')), save: () => Promise.resolve() }, NOW);
    expect(broken.loaded).toBe('none');
  });

  it('restores a saved chain only after checking it again, and discards (and overwrites) anything that fails', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryScanStateStore();
    const first = await synced(chain, store);
    const saved = store.value ?? '';
    const back = await loadHeaderChain(regtest, store, NOW);
    expect(back.loaded).toBe('restored');
    expect(back.chain.tipHash).toBe(first.tipHash);
    for (const bad of ['', 'null', '[]', saved.replace('"regtest"', '"testnet4"'), saved.replace(/("headers":\["[0-9a-f]{152})[0-9a-f]{8}/, '$1ffffffff')]) {
      store.value = bad;
      const r = await loadHeaderChain(regtest, store, NOW);
      expect(r.loaded, bad.slice(0, 20)).toBe('discarded');
      expect(r.chain.tipHeight).toBe(0);
      expect(JSON.parse(store.value)).toMatchObject({ network: 'regtest', headers: [] });
    }
    // A discard is reported even when the fresh chain cannot be written back.
    const r = await loadHeaderChain(regtest, { load: () => Promise.resolve('x'), save: () => Promise.reject(new Error('quota')) }, NOW);
    expect(r.loaded).toBe('discarded');
  });
});

describe('syncing headers', () => {
  it('validates and adopts the source chain, then reports nothing new', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryScanStateStore();
    const { chain: headers } = await loadHeaderChain(regtest, store, NOW);
    const seen: number[] = [];
    const out = await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store, onProgress: (h) => seen.push(h) });
    expect(out).toEqual({ tipHeight: 4, reorgFrom: undefined, lessWork: false, saved: true });
    expect(seen).toEqual([4]);
    expect(headers.tipHash).toBe(chain.blocks[4]!.hash);
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toEqual({ tipHeight: 4, reorgFrom: undefined, lessWork: false, saved: true });
  });

  it('works in rounds, saving after each, so a long sync resumes', async () => {
    const chain = mockChain('regtest', walletA());
    forkChain(chain.blocks, 5, HEADERS_PER_ROUND + 20, 0);
    const store = new MemoryScanStateStore();
    const { chain: headers } = await loadHeaderChain(regtest, store, NOW);
    const saves: number[] = [];
    const counting = { load: () => store.load(), save: async (s: string) => { saves.push((JSON.parse(s) as { headers: unknown[] }).headers.length); await store.save(s); } };
    const seen: number[] = [];
    await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: counting, onProgress: (h) => seen.push(h) });
    expect(seen).toEqual([HEADERS_PER_ROUND, chain.blocks.length - 1]);
    expect(saves).toEqual(seen);
    expect((await loadHeaderChain(regtest, store, NOW)).chain.tipHash).toBe(chain.blocks.at(-1)!.hash);
  });

  it('fails closed on an invalid header, keeping (and having saved) only valid headers', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryScanStateStore();
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
  });

  it('keeps the heavier chain against a fork with less (or equal) work, and follows one with more', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryScanStateStore();
    const headers = await synced(chain, store);
    const tip = headers.tipHash;
    forkChain(chain.blocks, 3, 2, 1); // same length: equal work
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toMatchObject({ lessWork: true, reorgFrom: undefined, tipHeight: 4 });
    expect(headers.tipHash).toBe(tip);
    forkChain(chain.blocks, 2, 4, 2); // longer: more work
    expect(await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store })).toMatchObject({ lessWork: false, reorgFrom: 1, tipHeight: 5 });
    expect(headers.tipHash).toBe(chain.blocks[5]!.hash);
    expect((await loadHeaderChain(regtest, store, NOW)).chain.tipHash).toBe(chain.blocks[5]!.hash);
  });

  it('reports a store that cannot save without failing the check', async () => {
    const chain = mockChain('regtest', walletA());
    const { chain: headers } = await loadHeaderChain(regtest, new MemoryScanStateStore(), NOW);
    const out = await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: { load: () => Promise.resolve(undefined), save: () => Promise.reject(new Error('quota')) } });
    expect(out).toMatchObject({ tipHeight: 4, saved: false });
  });
});

describe('invalidating scan results after a reorg', () => {
  const pay = (height: number, blockHash: string, tweak = wrapSecret(new Uint8Array(32).fill(height))): FoundPayment => ({
    txid: 'aa'.repeat(32), vout: height, amountSats: 1000n, xOnlyPublicKey: new Uint8Array(32), spendTweak: tweak, height, blockHash, label: null, duplicateKey: false,
  });

  it('keeps results whose blocks are still on the chain and cuts back the rest', async () => {
    const chain = mockChain('regtest', walletA());
    const headers = await synced(chain);
    const blocks = chain.blocks.slice(1).map((b, i) => ({ height: i + 1, hash: b.hash }));
    const scan: ScanResult = { fromHeight: 1, toHeight: 4, found: [pay(2, chain.blocks[2]!.hash), pay(3, chain.blocks[3]!.hash)], spentCount: 0, blocks, headerAnchored: true };
    expect(invalidateReorged(scan, headers)).toEqual({ scan, dropped: [] });
    forkChain(chain.blocks, 3, 3, 4);
    await syncHeaders({ chain: headers, sources: [sourceOf(chain)], store: new MemoryScanStateStore() });
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
    await storeFor('regtest').save('{"a":1}');
    await storeFor('signet').save('{"b":2}');
    expect(await storeFor('regtest').load()).toBe('{"a":1}');
    expect([...idb.data.keys()]).toEqual(['headers:v1:regtest', 'headers:v1:signet']);
    expect(idb.opens).toBe(1);
    // A non-text record reads back as text that fails validation.
    idb.data.set('headers:v1:regtest', { not: 'text' });
    expect(await storeFor('regtest').load()).toBe('');
    expect((await loadHeaderChain(regtest, storeFor('regtest'), NOW)).loaded).toBe('discarded');
  });

  it('rejects when the database or a request fails, and retries opening later', async () => {
    const closed = fakeIdb({ failOpen: true });
    const s = idbHeaderStore(closed)('regtest');
    await expect(s.load()).rejects.toThrow('IndexedDB unavailable');
    await expect(s.save('x')).rejects.toThrow('IndexedDB unavailable');
    expect(closed.opens).toBe(2);
    await expect(idbHeaderStore(fakeIdb({ failGet: true }))('regtest').load()).rejects.toThrow('IndexedDB request failed');
  });

  it('memory stores are per network and per instance', async () => {
    const a = memoryHeaderStore();
    await a('regtest').save('r');
    expect(await a('regtest').load()).toBe('r');
    expect(await a('signet').load()).toBeUndefined();
    expect(await memoryHeaderStore()('regtest').load()).toBeUndefined();
  });
});

describe('fixtures', () => {
  it('serve the genesis summary with no previous hash', () => {
    expect(blockSummary(0, GENESIS_HEADERS.regtest)).toMatchObject({ id: regtest.genesisHash, previousblockhash: null });
  });
});
