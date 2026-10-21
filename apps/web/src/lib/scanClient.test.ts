import { CHAINS, type RpcLog } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { localCheckpointStore, runScan, type CheckpointStore, type ScanProgress } from './scanClient';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const manifest = fakeManifest(84532);
const blockHash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

function chainWith(head: number, logs: RpcLog[]) {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: blockHash(n), parentHash: blockHash(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { fromBlock: bigint; toBlock: bigint };
      return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    throw new Error(`unexpected ${method}`);
  });
}

function setup() {
  const keys = generateKeySet();
  const meta = encodeMetaAddress(keys);
  const stranger = encodeMetaAddress(generateKeySet());
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 120, index: 0, caller: FAKE_ROUTER });
  const mine2 = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 2100, index: 3, caller: '0x9999999999999999999999999999999999999999' });
  const other = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 130, index: 1, caller: FAKE_ROUTER });
  return { keys, mine, mine2, other, logs: [mine.log, other.log, mine2.log] };
}

describe('runScan', () => {
  it('fetches public logs in the main thread and finds only my payments through the worker', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const progress: ScanProgress[] = [];
    const cp = new Map<number, unknown>();
    const checkpoints: CheckpointStore = { load: () => undefined, save: (id, c) => cp.set(id, c), clear: () => undefined };
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    const found: string[] = [];
    const res = await runScan({
      chain,
      manifest,
      client: chainWith(2500, s.logs),
      cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey),
      viewingKey,
      createWorker: () => worker,
      signal: new AbortController().signal,
      checkpoints,
      onProgress: (p) => progress.push(p),
      onMatch: (m) => found.push(m.stealthAddress),
    });
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([s.mine.stealthAddress, s.mine2.stealthAddress]);
    expect(found).toHaveLength(2);
    expect(res.matches[0]?.viaRouter).toBe(true);
    expect(res.matches[1]?.viaRouter).toBe(false);
    expect(res.matches[0]?.metadata?.kind).toBe('erc20');
    expect(res.scanned).toBe(3);
    expect(progress.at(-1)).toMatchObject({ caughtUp: true, matches: 2 });
    expect(cp.get(84532)).toBeDefined();
    expect(res.cursor.nextBlock).toBe(2501n);
    // The worker saw the viewing key once, then only public logs; it was ended and terminated; the local copy is wiped.
    expect(worker.received.filter((m) => m.type === 'start')).toHaveLength(1);
    expect(worker.received.at(-1)).toEqual({ type: 'end' });
    expect(worker.terminated).toBe(true);
    expect(viewingKey.every((b) => b === 0)).toBe(true);
    const batches = worker.received.filter((m) => m.type === 'batch');
    expect(JSON.stringify(batches, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(hexOf(s.keys.viewingSecret));
  });

  it('can be cancelled between pages and says so to the worker', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const ctl = new AbortController();
    const res = await runScan({
      chain,
      manifest,
      client: chainWith(500_000, s.logs),
      cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey),
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => worker,
      signal: ctl.signal,
      onProgress: () => ctl.abort(),
    });
    expect(res.cursor.nextBlock).toBeLessThan(500_000n);
    expect(worker.received.some((m) => m.type === 'cancel')).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it('pages through truncated results (maxRequests per fetch) until caught up', async () => {
    const s = setup();
    const client = chainWith(120_000, s.logs); // 120 windows of 1000 blocks > 50 requests per fetch
    const progress: ScanProgress[] = [];
    await runScan({
      chain,
      manifest,
      client,
      cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey),
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(),
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });
    expect(progress.length).toBeGreaterThanOrEqual(3);
    expect(progress[0]?.caughtUp).toBe(false);
    expect(progress.at(-1)?.caughtUp).toBe(true);
  });

  it('respects maxPages', async () => {
    const s = setup();
    const progress: ScanProgress[] = [];
    await runScan({ chain, manifest, client: chainWith(120_000, s.logs), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal, onProgress: (p) => progress.push(p), maxPages: 1 });
    expect(progress).toHaveLength(1);
  });

  it('reports a worker that rejects the keys, and worker crashes', async () => {
    const s = setup();
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: 'zz', viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal }),
    ).rejects.toThrow(/rejected the keys/);
    const crashing = new InlineWorker();
    crashing.postMessage = (): void => {
      queueMicrotask(() => crashing.onerror?.(new Error('boom')));
    };
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => crashing, signal: new AbortController().signal }),
    ).rejects.toThrow(/worker failed/);
  });

  it('propagates RPC failures and still shuts the worker down', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const bad = mockRpc(84532, () => {
      throw new Error('rpc down');
    });
    await expect(runScan({ chain, manifest, client: bad, cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => worker, signal: new AbortController().signal })).rejects.toThrow();
    expect(worker.terminated).toBe(true);
  });
});

describe('runScan robustness (S3-15)', () => {
  const base = (s: ReturnType<typeof setup>) => ({
    chain,
    manifest,
    cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey),
    viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
  });

  it('stamps each match with the chain it was found on', async () => {
    const s = setup();
    const res = await runScan({ ...base(s), client: chainWith(500, s.logs), createWorker: () => new InlineWorker(), signal: new AbortController().signal });
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.matches.every((m) => m.chainId === 84532)).toBe(true);
  });

  it('times out a worker that never answers, terminates it and zeroizes the key', async () => {
    const s = setup();
    const hung = new InlineWorker();
    hung.postMessage = (): void => undefined; // never replies
    const b = base(s);
    await expect(runScan({ ...b, client: chainWith(10, []), createWorker: () => hung, signal: new AbortController().signal, replyTimeoutMs: 20 })).rejects.toThrow(/did not answer in time/);
    expect(hung.terminated).toBe(true);
    expect(Array.from(b.viewingKey).every((x) => x === 0)).toBe(true);
  });

  it('Cancel unblocks a worker that never answers a batch', async () => {
    const s = setup();
    const hung = new InlineWorker();
    const original = hung.postMessage.bind(hung);
    hung.postMessage = (m): void => {
      if (m.type !== 'batch') original(m); // answers start, ignores batches
    };
    const ctl = new AbortController();
    setTimeout(() => { ctl.abort(); }, 20);
    const res = await runScan({ ...base(s), client: chainWith(500, s.logs), createWorker: () => hung, signal: ctl.signal, replyTimeoutMs: 10_000 });
    expect(res.matches).toEqual([]);
    expect(hung.terminated).toBe(true);
    expect(hung.received.some((m) => m.type === 'cancel')).toBe(true);
  });

  it('zeroizes the viewing key even when creating the worker throws', async () => {
    const s = setup();
    const b = base(s);
    await expect(
      runScan({ ...b, client: chainWith(10, []), createWorker: () => { throw new Error('no worker'); }, signal: new AbortController().signal }),
    ).rejects.toThrow('no worker');
    expect(Array.from(b.viewingKey).every((x) => x === 0)).toBe(true);
  });

  it('deep scan flags only router announcements for tag-free checking and reports a wrong tag', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const wrong = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 120, index: 0, caller: FAKE_ROUTER, wrongTag: true });
    const wrongStranger = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 121, index: 1, caller: '0x9999999999999999999999999999999999999999', wrongTag: true });
    const common = { chain, manifest, cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(keys.spendingPublicKey), client: chainWith(500, [wrong.log, wrongStranger.log]), signal: new AbortController().signal };
    const off = await runScan({ ...common, viewingKey: unsafeRevealSecret(keys.viewingSecret), createWorker: () => new InlineWorker() });
    expect(off.matches).toEqual([]);
    const worker = new InlineWorker();
    const on = await runScan({ ...common, viewingKey: unsafeRevealSecret(keys.viewingSecret), deep: true, createWorker: () => worker });
    expect(on.matches).toHaveLength(1);
    expect(on.matches[0]).toMatchObject({ tagMatches: false, viaRouter: true });
    const batch = worker.received.find((m) => m.type === 'batch');
    expect(batch?.type === 'batch' && batch.logs.filter((l) => l.skipTag === true)).toHaveLength(1);
  });
});

describe('localCheckpointStore', () => {
  interface MemStorage {
    map: Map<string, string>;
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  }
  function mem(): MemStorage {
    const map = new Map<string, string>();
    return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  }
  it('round-trips a cursor with a block hash', () => {
    const st = mem();
    const cp = localCheckpointStore(st);
    expect(cp.load(1)).toBeUndefined();
    cp.save(1, { nextBlock: 77n, last: { number: 76n, hash: `0x${'a'.repeat(64)}` } });
    expect(cp.load(1)).toEqual({ nextBlock: 77n, last: { number: 76n, hash: `0x${'a'.repeat(64)}` } });
    cp.save(2, { nextBlock: 5n });
    expect(cp.load(2)).toEqual({ nextBlock: 5n });
    cp.clear(1);
    expect(cp.load(1)).toBeUndefined();
    expect([...st.map.values()].join('')).not.toMatch(/secret|key/i);
  });
  it('ignores corrupt data and tolerates missing or failing storage', () => {
    const st = mem();
    st.setItem('ghostpay.scan.checkpoint.v1.1', 'not json');
    st.setItem('ghostpay.scan.checkpoint.v1.2', JSON.stringify({ nextBlock: 'abc' }));
    st.setItem('ghostpay.scan.checkpoint.v1.3', JSON.stringify({ nextBlock: '5', last: { number: 'x', hash: 'y' } }));
    const cp = localCheckpointStore(st);
    expect(cp.load(1)).toBeUndefined();
    expect(cp.load(2)).toBeUndefined();
    expect(cp.load(3)).toEqual({ nextBlock: 5n });
    const none = localCheckpointStore(undefined);
    expect(none.load(1)).toBeUndefined();
    none.save(1, { nextBlock: 1n });
    none.clear(1);
    const throwing = localCheckpointStore({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } });
    expect(throwing.load(1)).toBeUndefined();
    expect(() => { throwing.save(1, { nextBlock: 1n }); throwing.clear(1); }).not.toThrow();
    void vi;
  });
});
