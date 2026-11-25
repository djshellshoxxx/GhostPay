import { describe, expect, it, vi } from 'vitest';
import { ANNOUNCER, FakeChain, encodeAnnouncementData, fakeAnn, hx } from './fake.testutil.js';
import { IngestError, Indexer, type IndexerOptions } from './ingest.js';
import { LogStore } from './store.js';

const every3 = (n: bigint) => (n % 3n === 0n ? [fakeAnn(Number(n)), fakeAnn(Number(n) + 100)] : []);
const setup = (o: Partial<IndexerOptions> & { from?: bigint } = {}) => {
  const chain = new FakeChain();
  const store = LogStore.open(':memory:', { chainId: 31337, announcer: ANNOUNCER, indexedFrom: o.from ?? 0n });
  const ix = new Indexer({ store, reader: chain, chainId: 31337, announcer: ANNOUNCER, batchBlocks: 10, ...o });
  return { chain, store, ix };
};
const drain = async (ix: Indexer): Promise<string[]> => {
  const kinds: string[] = [];
  for (let i = 0; i < 100; i++) {
    const r = await ix.syncOnce();
    kinds.push(r.kind);
    if (r.kind === 'idle' || r.kind === 'halted') return kinds;
  }
  throw new Error('did not settle');
};
/** Stored chain equals the fake chain's canonical blocks and announcements. */
const matches = (chain: FakeChain, store: LogStore): void => {
  const tip = store.tip();
  expect(tip?.hash).toBe(chain.head.hash);
  for (const b of chain.blocks.filter((x) => x.number >= store.indexedFrom)) expect(store.header(b.number)?.hash).toBe(b.hash);
  const want = chain.blocks.filter((x) => x.number >= store.indexedFrom).flatMap((b) => b.logs.map((l) => `${l.blockHash}:${String(l.logIndex)}`));
  expect(store.announcements(store.indexedFrom, chain.head.number, 10_000).map((a) => `${a.blockHash}:${String(a.logIndex)}`)).toEqual(want);
};

describe('Indexer', () => {
  it('indexes announcer logs in batches from the aligned start and goes idle at the head', async () => {
    const { chain, store, ix } = setup({ from: 0n });
    chain.mine(25, every3);
    expect(await drain(ix)).toEqual(['advanced', 'advanced', 'advanced', 'idle']);
    matches(chain, store);
    expect(ix.counters()).toMatchObject({ blocks: 26, rollbacks: 0, errors: 0 });
    chain.mine(3, every3);
    expect(await ix.syncOnce()).toEqual({ kind: 'advanced', from: 26n, to: 28n });
  });
  it('keeps `confirmations` blocks behind the head', async () => {
    const { chain, store, ix } = setup({ confirmations: 5 });
    chain.mine(9);
    await drain(ix);
    expect(store.tip()?.number).toBe(4n);
    const late = setup({ confirmations: 5, from: 1000n });
    expect(await late.ix.syncOnce()).toEqual({ kind: 'idle' });
  });
  it('reorg fixture: same-height fork rolls back to the common ancestor and reindexes', async () => {
    const { chain, store, ix } = setup();
    chain.mine(20, every3);
    await drain(ix);
    const ancestor = chain.blocks[14]?.hash;
    chain.reorg(6, 6, (n) => [fakeAnn(Number(n) + 50)]); // blocks 15..20 replaced
    expect(store.header(15n)?.hash).not.toBe(chain.blocks[15]?.hash);
    expect(await ix.syncOnce()).toEqual({ kind: 'rolledBack', ancestor: 14n });
    expect(store.tip()?.hash).toBe(ancestor);
    expect(store.announcements(15n, 20n, 100)).toEqual([]);
    await drain(ix);
    matches(chain, store);
    expect(ix.counters().rollbacks).toBe(1);
  });
  it('reorg fixture: longer replacement chain and a chain that became shorter', async () => {
    const { chain, store, ix } = setup();
    chain.mine(12, every3);
    await drain(ix);
    chain.reorg(3, 8, every3, 'longer');
    await drain(ix);
    matches(chain, store);
    chain.blocks.length -= 4; // head now below the stored tip
    expect(await ix.syncOnce()).toMatchObject({ kind: 'rolledBack' });
    await drain(ix);
    matches(chain, store);
  });
  it('a fork of every stored block restarts the index from its first block', async () => {
    const { chain, store, ix } = setup({ from: 0n });
    chain.mine(4);
    await drain(ix);
    chain.blocks.length = 0;
    const fresh = new FakeChain(31337, 'other-genesis');
    fresh.mine(6);
    chain.blocks.push(...fresh.blocks);
    expect(await ix.syncOnce()).toEqual({ kind: 'rolledBack', ancestor: -1n });
    expect(store.tip()).toBeUndefined();
    await drain(ix);
    matches(chain, store);
  });
  it('a reorg deeper than maxReorgDepth halts and stays halted', async () => {
    const { chain, store, ix } = setup({ maxReorgDepth: 4 });
    chain.mine(12);
    await drain(ix);
    chain.reorg(8, 8);
    expect(await ix.syncOnce()).toEqual({ kind: 'halted' });
    expect(store.halted).toBe(true);
    expect(await ix.syncOnce()).toEqual({ kind: 'halted' });
    const all = setup({ maxReorgDepth: 2 });
    all.chain.mine(3);
    await drain(all.ix);
    all.chain.blocks.length = 0;
    const fresh = new FakeChain(31337, 'x');
    fresh.mine(3);
    all.chain.blocks.push(...fresh.blocks);
    expect(await all.ix.syncOnce()).toEqual({ kind: 'halted' });
  });
  it('discards a batch when the chain moves during the read (header gone, parent link, log hash, removed log)', async () => {
    const { chain, store, ix } = setup();
    chain.mine(5, every3);
    await drain(ix);
    chain.mine(5, every3);
    chain.onHeader = (n) => {
      if (n === 8n) chain.blocks.length = 8; // block 8 disappears mid-batch
    };
    expect(await ix.syncOnce()).toEqual({ kind: 'retry' });
    expect(store.tip()?.number).toBe(5n);
    chain.onHeader = undefined;
    chain.mine(4, every3, 'n2');
    chain.onHeader = (n) => {
      if (n === 8n) {
        chain.onHeader = undefined;
        chain.blocks.length = 7; // blocks 7.. change while 8 is read: 8's parent no longer matches the 7 already read
        chain.mine(5, every3, 'mid');
      }
    };
    expect(await ix.syncOnce()).toEqual({ kind: 'retry' });
    chain.logFilter = (logs) => logs.map((l, i) => (i === 0 ? { ...l, blockHash: hx(0xee, 32) } : l));
    expect(await ix.syncOnce()).toEqual({ kind: 'retry' });
    chain.logFilter = (logs) => logs.map((l, i) => (i === 0 ? { ...l, removed: true } : l));
    expect(await ix.syncOnce()).toEqual({ kind: 'retry' });
    chain.logFilter = (logs) => [...logs, { ...(logs[0] as (typeof logs)[0]), blockNumber: 99n }];
    expect(await ix.syncOnce()).toEqual({ kind: 'retry' });
    chain.logFilter = undefined;
    expect(store.tip()?.number).toBe(5n);
    await drain(ix);
    matches(chain, store);
    expect(ix.counters().retries).toBe(5);
  });
  it('fails on logs outside the filter or duplicated by the RPC', async () => {
    const { chain, ix } = setup();
    chain.mine(4, every3);
    chain.logFilter = (logs) => [...logs, { ...(logs[0] as (typeof logs)[0]), address: hx(1, 20) }];
    await expect(ix.syncOnce()).rejects.toThrow(IngestError);
    chain.logFilter = (logs) => [...logs, logs[0] as (typeof logs)[0]];
    await expect(ix.syncOnce()).rejects.toThrow(/duplicate/);
    chain.logFilter = (logs) => logs.map((l) => ({ ...l, topics: [hx(2, 32), ...l.topics.slice(1)] }));
    await expect(ix.syncOnce()).rejects.toThrow(/outside the filter/);
  });
  it('counts records outside the v1 limits as omitted per block instead of storing them', async () => {
    const { chain, store, ix } = setup();
    chain.mine(2, (n) => (n === 2n ? [fakeAnn(1), { ...fakeAnn(2), data: encodeAnnouncementData(`0x02${'11'.repeat(32)}`, hx(1, 5000)) }, { ...fakeAnn(3), data: '0x' }] : []));
    await drain(ix);
    expect(store.header(2n)?.omitted).toBe(2);
    expect(store.announcements(0n, 2n, 10)).toHaveLength(1);
    expect(ix.counters().omitted).toBe(2);
  });
  it('verifies the upstream chain id and validates options', async () => {
    const { chain, ix } = setup();
    await expect(ix.verifyChain()).resolves.toBeUndefined();
    const other = new Indexer({ store: LogStore.open(':memory:', { chainId: 84532, announcer: ANNOUNCER, indexedFrom: 0n }), reader: chain, chainId: 84532, announcer: ANNOUNCER });
    await expect(other.verifyChain()).rejects.toThrow(IngestError);
    for (const bad of [{ confirmations: -1 }, { batchBlocks: 0 }, { maxReorgDepth: 0.5 }]) expect(() => setup(bad)).toThrow(RangeError);
  });
  it('run() loops until aborted, pauses when idle or after errors, and returns when halted', async () => {
    const { chain, store, ix } = setup();
    chain.mine(30, every3);
    const ctl = new AbortController();
    const errors: unknown[] = [];
    let fail = true;
    const orig = chain.blockNumber.bind(chain);
    vi.spyOn(chain, 'blockNumber').mockImplementation(() => {
      if (fail) {
        fail = false;
        return Promise.reject(new Error('rpc down'));
      }
      return orig();
    });
    const done = ix.run({ intervalMs: 5, signal: ctl.signal, onError: (e) => errors.push(e) });
    await vi.waitFor(() => expect(store.tip()?.number).toBe(30n));
    ctl.abort();
    await done;
    expect(errors).toHaveLength(1);
    expect(ix.counters().errors).toBe(1);

    const h = setup({ maxReorgDepth: 1 });
    h.chain.mine(5);
    await drain(h.ix);
    h.chain.reorg(4, 4);
    await h.ix.run({ intervalMs: 5, signal: new AbortController().signal });
    expect(h.store.halted).toBe(true);

    const a = setup();
    const ctl2 = new AbortController();
    vi.spyOn(a.chain, 'blockNumber').mockImplementation(() => {
      ctl2.abort();
      return Promise.reject(new Error('aborted'));
    });
    await a.ix.run({ intervalMs: 5, signal: ctl2.signal });
    expect(a.ix.counters().errors).toBe(0);
  });
});
