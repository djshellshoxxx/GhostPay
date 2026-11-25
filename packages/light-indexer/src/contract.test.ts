import { ScanSourceError, createIndexerSource, type IndexerSourceOptions } from '@ghostpay/scan-source';
import { afterEach, describe, expect, it } from 'vitest';
import { ANNOUNCER, FakeChain, fakeAnn, fetchTransport, serve } from './fake.testutil.js';
import { Indexer } from './ingest.js';
import { LogStore } from './store.js';
import type { ServiceOptions } from './server.js';

// Contract tests: the existing, unmodified reference client (`createIndexerSource`) against this service over real
// loopback HTTP. The synthetic chain doubles as the client's independent second source (its own RPC). The anvil
// variant with the compiled ERC5564Announcer and real JSON-RPC is contract.anvil.test.ts.

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

const anns = (n: bigint) => (n === 1500n ? [fakeAnn(1), fakeAnn(2), fakeAnn(3)] : n % 47n === 3n ? [fakeAnn(Number(n), 20 + Number(n % 5n))] : []);

async function setup(o: Partial<ServiceOptions> = {}, blocks = 2999) {
  const chain = new FakeChain();
  chain.mine(blocks, anns);
  const store = LogStore.open(':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 0n });
  const ix = new Indexer({ store, reader: chain, chainId: 31337, announcer: ANNOUNCER, batchBlocks: 1000, maxReorgDepth: 1000 });
  const sync = async (): Promise<void> => {
    for (;;) {
      const k = (await ix.syncOnce()).kind;
      if (k === 'idle') return;
      if (k === 'halted') throw new Error('halted');
    }
  };
  await sync();
  const svc = await serve({ store, chainId: 31337, announcer: ANNOUNCER, ...o });
  cleanups.push(() => store.close(), () => svc.close());
  const urls: string[] = [];
  const client = (extra: Partial<IndexerSourceOptions> = {}, rewrite?: (b: Record<string, unknown>) => void) =>
    createIndexerSource({ chainId: 31337, baseUrl: `${svc.url}/`, transport: fetchTransport(urls, rewrite), secondSource: chain.headSource(), ...extra });
  return { chain, store, ix, sync, svc, urls, client };
}
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : `other:${String(e)}`;
  }
};
const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;

describe('contract: scan-source createIndexerSource against the light-indexer service', () => {
  it('returns every announcement of the padded window, with matching coverage, head and ids', async () => {
    const { chain, client, urls } = await setup();
    const r = await client().fetch(REQ);
    expect(urls).toEqual([expect.stringMatching(/\/v1\/logs\?chainId=31337&from=1000&to=1999&pageSize=1000$/)]);
    expect(r.coverage).toEqual({ fromBlock: 1000n, toBlock: 1999n });
    expect(r.head).toEqual({ number: 1999n, hash: chain.blocks[1999]?.hash });
    expect(r.skipped).toBe(0);
    const want = chain.blocks.filter((b) => b.number >= 1000n && b.number <= 1999n).flatMap((b) => b.logs.map((l) => `${l.blockHash}:${String(l.logIndex)}`));
    expect(r.announcements.map((a) => a.id)).toEqual(want);
    expect(r.announcements.every((a) => a.transactionHash !== undefined)).toBe(true);
    const tail = await client().fetch({ chainId: 31337, fromBlock: 2500n, toBlock: 2999n });
    expect(tail.coverage).toEqual({ fromBlock: 2000n, toBlock: 2999n });
  });
  it('reorg fixture: a stale index is rejected by the client cross-check, then served correctly after rollback', async () => {
    const { chain, client, sync, store } = await setup();
    chain.reorg(600, 600, (n) => (n % 10n === 0n ? [fakeAnn(Number(n) + 7)] : []), 'reorg'); // blocks 2400..2999 replaced
    expect(await code(client().fetch({ chainId: 31337, fromBlock: 2000n, toBlock: 2999n }))).toBe('HEAD_MISMATCH');
    await sync();
    expect(store.tip()?.hash).toBe(chain.head.hash);
    const r = await client().fetch({ chainId: 31337, fromBlock: 2000n, toBlock: 2999n });
    const want = chain.blocks.filter((b) => b.number >= 2000n).flatMap((b) => b.logs.map((l) => `${l.blockHash}:${String(l.logIndex)}`));
    expect(r.announcements.map((a) => a.id)).toEqual(want);
    expect(r.announcements.some((a) => a.blockNumber >= 2400n)).toBe(true);
  });
  it('header gap: a response with a missing header fails CONTINUITY in the client', async () => {
    const { client } = await setup();
    const drop = (b: Record<string, unknown>): void => {
      b['headers'] = (b['headers'] as { number: string }[]).filter((h) => h.number !== '1300');
    };
    expect(await code(client({}, drop).fetch(REQ))).toBe('CONTINUITY');
  });
  it('an index behind the client second source fails CONTINUITY (never reported as complete)', async () => {
    const { chain, client } = await setup({}, 1800);
    chain.mine(150, anns);
    expect(await code(client().fetch(REQ))).toBe('CONTINUITY');
  });
  it('a page cut by the record cap fails CONTINUITY in the client: pagination never looks complete', async () => {
    const { client } = await setup({ maxPageSize: 5, defaultPageSize: 5 });
    expect(await code(client({ pageSize: 5 }).fetch(REQ))).toBe('CONTINUITY');
  });
  it('oversized window, oversized page size and off-grid windows are rejected (client sees TRANSPORT)', async () => {
    const { client } = await setup();
    expect(await code(client({ windowBlocks: 3000 }).fetch(REQ))).toBe('TRANSPORT');
    expect(await code(client({ pageSize: 5000 }).fetch(REQ))).toBe('TRANSPORT');
    const other = await setup({ alignBlocks: 500, maxWindowBlocks: 500 });
    expect(await code(other.client().fetch(REQ))).toBe('TRANSPORT'); // 1000-block client window over a 500-block service
    expect(await code(other.client({ windowBlocks: 500 }).fetch({ chainId: 31337, fromBlock: 1200n, toBlock: 1400n }))).toBe('ok');
  });
});
