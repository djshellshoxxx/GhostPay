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
  it('wipes the viewing key even when the worker factory throws', async () => {
    const s = setup();
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey, createWorker: () => { throw new Error('no worker'); }, signal: new AbortController().signal }),
    ).rejects.toThrow(/no worker/);
    expect(viewingKey.every((b) => b === 0)).toBe(true);
  });

  it('stops a worker that never answers and wipes the key', async () => {
    const s = setup();
    const hung = new InlineWorker();
    hung.postMessage = (): void => undefined;
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey, createWorker: () => hung, signal: new AbortController().signal, replyTimeoutMs: 20 }),
    ).rejects.toThrow(/did not answer in time/);
    expect(hung.terminated).toBe(true);
    expect(viewingKey.every((b) => b === 0)).toBe(true);
  });

  it('Cancel unblocks a hung worker reply and returns the partial result', async () => {
    const s = setup();
    const hung = new InlineWorker();
    hung.postMessage = (): void => undefined;
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 20);
    const res = await runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => hung, signal: ctl.signal, replyTimeoutMs: 60_000 });
    expect(res.matches).toEqual([]);
    expect(hung.terminated).toBe(true);
  });

  it('binds every match to the chain it was found on', async () => {
    const s = setup();
    const res = await runScan({ chain, manifest, client: chainWith(2500, s.logs), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal });
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.matches.every((m) => m.chainId === 84532)).toBe(true);
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

  describe('receipt verification and second provider', () => {
    const run = async (s: ReturnType<typeof setup>, client: ReturnType<typeof chainWith>, extra: Partial<Parameters<typeof runScan>[0]> = {}) => {
      const cp = new Map<number, unknown>();
      const res = await runScan({
        chain, manifest, client, cursor: { nextBlock: 0n },
        spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
        createWorker: () => new InlineWorker(), signal: new AbortController().signal,
        checkpoints: { load: () => undefined, save: (id, c) => cp.set(id, c), clear: () => undefined }, ...extra,
      });
      return { res, cp };
    };
    const withBalance = (base: ReturnType<typeof chainWith>, balance: bigint) => ({
      ...base,
      request: (m: string, p: readonly unknown[]) =>
        m === 'eth_call' || m === 'eth_getBalance' ? Promise.resolve(`0x${balance.toString(16)}`) : base.request(m, p),
    });

    it('labels a forged direct announcement "claimed" (no funds) but trusts the router one', async () => {
      const s = setup();
      const { res } = await run(s, chainWith(2500, s.logs));
      void res;
      const byRouter = res.matches.find((m) => m.viaRouter);
      const direct = res.matches.find((m) => !m.viaRouter);
      expect(byRouter?.receipt).toBe('verified');
      expect(direct?.receipt).toBe('claimed');
    });
    it('verifies a direct announcement only when the stealth address holds the announced amount', async () => {
      const s = setup();
      const base = chainWith(2500, s.logs);
      const rich = await run(s, withBalance(base, 10n ** 30n));
      expect(rich.res.matches.find((m) => !m.viaRouter)?.receipt).toBe('verified');
      const poor = await run(s, withBalance(base, 1n));
      expect(poor.res.matches.find((m) => !m.viaRouter)?.receipt).toBe('claimed');
    });
    it('marks matches inside finalityDepth as pending', async () => {
      const s = setup();
      const { res } = await run(s, chainWith(2150, s.logs));
      expect(res.matches.find((m) => !m.viaRouter)?.receipt).toBe('pending');
    });
    it('records no discrepancy and advances the checkpoint when providers agree', async () => {
      const s = setup();
      const { res, cp } = await run(s, chainWith(2500, s.logs), { secondaryClient: chainWith(2500, s.logs) });
      expect(res.discrepancies).toEqual([]);
      expect(cp.get(84532)).toBeDefined();
    });
    it('surfaces a hidden/forged log disagreement and withholds the checkpoint', async () => {
      const s = setup();
      const seen: string[] = [];
      const { res, cp } = await run(s, chainWith(2500, s.logs), { secondaryClient: chainWith(2500, [s.mine.log]), onDiscrepancy: (d) => seen.push(...d.map((x) => x.kind)) });
      expect(res.discrepancies.map((d) => d.kind)).toEqual(['missing_in_secondary', 'missing_in_secondary']);
      expect(seen).toHaveLength(2);
      expect(cp.get(84532)).toBeUndefined();
    });
  });
});
