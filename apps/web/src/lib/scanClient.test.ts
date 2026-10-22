import { CHAINS, type RpcLog } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { checkpointKeyId, localCheckpointStore, runScan, type CheckpointStore, type ScanProgress } from './scanClient';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const manifest = fakeManifest(84532);
const KEY = checkpointKeyId('02aa', '03bb');
const blockHash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function chainWith(head: number, logs: RpcLog[]) {
  const transfers: RpcLog[] = logs.flatMap((log) => {
    const sender = log.topics?.[3];
    const recipient = log.topics?.[2];
    if (sender?.toLowerCase() !== `0x${FAKE_ROUTER.slice(2).toLowerCase().padStart(64, '0')}` || recipient === undefined) return [];
    return [{
      address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      blockNumber: log.blockNumber,
      topics: [TRANSFER_TOPIC, sender, recipient],
      data: `0x${1_000_000n.toString(16).padStart(64, '0')}`,
      blockHash: log.blockHash,
      ...(log.transactionHash === undefined ? {} : { transactionHash: log.transactionHash }),
      logIndex: `0x${(Number(BigInt(log.logIndex)) + 100).toString(16)}`,
    }];
  });
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: blockHash(n), parentHash: blockHash(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { address?: string; fromBlock: bigint; toBlock: bigint };
      const source = f.address?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e' ? transfers : logs;
      return source.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    if (method === 'eth_call' || method === 'eth_getBalance') return '0x0';
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
    const client = chainWith(2500, s.logs);
    const progress: ScanProgress[] = [];
    const cp = new Map<number, unknown>();
    const checkpoints: CheckpointStore = { load: () => undefined, save: (id, _k, c) => cp.set(id, c), clear: () => undefined };
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    const found: string[] = [];
    const res = await runScan({
      chain,
      manifest,
      client,
      cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
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
    expect(client.calls.some((c) => c.method === 'eth_getBalance' || (c.method === 'eth_call' && (c.params[0] as { data?: string }).data?.startsWith('0x70a08231') === true))).toBe(false);
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
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => worker,
      signal: ctl.signal,
      onProgress: () => ctl.abort(),
    });
    expect(res.cursor.nextBlock).toBeLessThan(500_000n);
    expect(worker.received.some((m) => m.type === 'cancel')).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it('persists only the finalized replay tail after a deep reorg behind the old checkpoint', async () => {
    const s = setup();
    const saved: unknown[] = [];
    const res = await runScan({
      chain, manifest, client: chainWith(150, []), cursor: { nextBlock: 100n, last: { number: 99n, hash: blockHash(9_999) as `0x${string}` } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(),
      signal: new AbortController().signal,
      checkpoints: { load: () => undefined, save: (_id, _key, cursor) => saved.push(cursor), clear: () => undefined },
    });
    expect(res.cursor.nextBlock).toBe(151n);
    expect(saved.at(-1)).toMatchObject({ nextBlock: 51n, last: { number: 50n, hash: blockHash(50) } });
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
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
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
    await runScan({ chain, manifest, client: chainWith(120_000, s.logs), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal, onProgress: (p) => progress.push(p), maxPages: 1 });
    expect(progress).toHaveLength(1);
  });

  it('enforces per-run announcement and match budgets without advancing over an unprocessed page', async () => {
    const s = setup();
    for (const limits of [{ maxAnnouncementsPerScan: 2 }, { maxMatchesPerScan: 1 }]) {
      const worker = new InlineWorker();
      const res = await runScan({
        chain, manifest, client: chainWith(2500, s.logs), cursor: { nextBlock: 0n },
        spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
        viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => worker,
        signal: new AbortController().signal, ...limits,
      });
      expect(res.limitReached).toBe(true);
      expect(res.cursor.nextBlock).toBe(0n);
      expect(res.matches).toEqual([]);
      expect(worker.received.filter((m) => m.type === 'batch')).toHaveLength(limits.maxAnnouncementsPerScan === undefined ? 1 : 0);
    }
  });

  it('deduplicates replay announcements for one address and ephemeral key before crediting', async () => {
    const s = setup();
    const replay: RpcLog = { ...s.mine.log, blockNumber: '0x79', blockHash: blockHash(121), logIndex: '0x5' };
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, replay]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.receipt).toBe('verified');
  });
  it('keeps a per-scan replay ledger across log pages', async () => {
    const s = setup();
    const replay: RpcLog = { ...s.mine.log, blockNumber: '0x458', blockHash: blockHash(1112), logIndex: '0x5', transactionHash: `0x${'ab'.repeat(32)}` };
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, replay]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.receipt).toBe('verified');
  });
  it('replaces an earlier direct replay with a later genuine router record across pages', async () => {
    const s = setup();
    const directTopics = [...s.mine.log.topics];
    directTopics[3] = `0x${'99'.repeat(20).padStart(64, '0')}`;
    const direct: RpcLog = { ...s.mine.log, topics: directTopics, blockNumber: '0x78', blockHash: blockHash(120), logIndex: '0x0', transactionHash: `0x${'aa'.repeat(32)}` };
    const router: RpcLog = { ...s.mine.log, blockNumber: '0xc7a8', blockHash: blockHash(51_112), logIndex: '0x1', transactionHash: `0x${'bb'.repeat(32)}` };
    const emitted: import('./scanClient').ScanMatch[] = [];
    const res = await runScan({
      chain, manifest, client: chainWith(52_000, [direct, router]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, onMatch: (m) => emitted.push(m),
    });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.viaRouter).toBe(true);
    expect(res.matches[0]?.receipt).toBe('verified');
    expect(emitted).toHaveLength(2); // append, then replacement; UI consumers upsert by payment identity
    expect(emitted.at(-1)?.viaRouter).toBe(true);
  });

  it('reports a worker that rejects the keys, and worker crashes', async () => {
    const s = setup();
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: 'zz', keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal }),
    ).rejects.toThrow(/rejected the keys/);
    const crashing = new InlineWorker();
    crashing.postMessage = (): void => {
      queueMicrotask(() => crashing.onerror?.(new Error('boom')));
    };
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => crashing, signal: new AbortController().signal }),
    ).rejects.toThrow(/worker failed/);
  });

  it('propagates RPC failures and still shuts the worker down', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const bad = mockRpc(84532, () => {
      throw new Error('rpc down');
    });
    await expect(runScan({ chain, manifest, client: bad, cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => worker, signal: new AbortController().signal })).rejects.toThrow();
    expect(worker.terminated).toBe(true);
  });
});

describe('runScan robustness (S3-15)', () => {
  it('wipes the viewing key even when the worker factory throws', async () => {
    const s = setup();
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey, createWorker: () => { throw new Error('no worker'); }, signal: new AbortController().signal }),
    ).rejects.toThrow(/no worker/);
    expect(viewingKey.every((b) => b === 0)).toBe(true);
  });

  it('stops a worker that never answers and wipes the key', async () => {
    const s = setup();
    const hung = new InlineWorker();
    hung.postMessage = (): void => undefined;
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    await expect(
      runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey, createWorker: () => hung, signal: new AbortController().signal, replyTimeoutMs: 20 }),
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
    const res = await runScan({ chain, manifest, client: chainWith(10, []), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => hung, signal: ctl.signal, replyTimeoutMs: 60_000 });
    expect(res.matches).toEqual([]);
    expect(hung.terminated).toBe(true);
  });

  it('binds every match to the chain it was found on', async () => {
    const s = setup();
    const res = await runScan({ chain, manifest, client: chainWith(2500, s.logs), cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal });
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.matches.every((m) => m.chainId === 84532)).toBe(true);
  });
});

describe('WEB-APP-04 / CHAIN-ADAPTERS-03: checkpoints', () => {
  it('are bound to the key set: another key (or the old key-less v1 entry) never inherits a position', () => {
    const map = new Map<string, string>();
    const st = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    const cp = localCheckpointStore(st);
    const A = checkpointKeyId('02aa', '03bb');
    const B = checkpointKeyId('02cc', '03dd');
    expect(A).not.toBe(B);
    cp.save(84532, A, { nextBlock: 9000n });
    expect(cp.load(84532, A)).toEqual({ nextBlock: 9000n });
    expect(cp.load(84532, B)).toBeUndefined();
    expect(cp.load(1, A)).toBeUndefined();
    map.set('ghostpay.scan.checkpoint.v1.84532', JSON.stringify({ nextBlock: '9000' }));
    expect(cp.load(84532, B)).toBeUndefined();
    cp.clear(84532, B);
    expect(cp.load(84532, A)).toEqual({ nextBlock: 9000n });
    cp.save(84532, 'not-a-key-id', { nextBlock: 1n });
    expect(map.size).toBe(2);
  });

  it('persist finalityDepth behind the head so pending payments are re-listed on resume', async () => {
    const s = setup();
    const near = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(s.keys), block: 2495, index: 0, caller: FAKE_ROUTER });
    const saved = new Map<number, import('@ghostpay/chain-adapters').ScanCursor>();
    const base = {
      chain, manifest, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
      checkpoints: { load: () => undefined, save: (id: number, _k: string, c: import('@ghostpay/chain-adapters').ScanCursor) => void saved.set(id, c), clear: () => undefined },
    };
    const first = await runScan({ ...base, client: chainWith(2500, [near.log]), cursor: { nextBlock: 2000n }, viewingKey: unsafeRevealSecret(s.keys.viewingSecret) });
    expect(first.matches).toHaveLength(1);
    expect(first.matches[0]?.receipt).toBe('pending');
    const cp = saved.get(84532)!;
    expect(cp.nextBlock).toBe(2401n); // 2501 - finalityDepth(100)
    expect(cp.last?.number).toBe(2400n);
    // Next session resumes from the checkpoint: the payment is found again, and by then (head far ahead) it is verified.
    const second = await runScan({ ...base, client: chainWith(2700, [near.log]), cursor: cp, viewingKey: unsafeRevealSecret(s.keys.viewingSecret) });
    expect(second.matches.map((m) => m.stealthAddress)).toEqual([near.stealthAddress]);
    expect(second.matches[0]?.receipt).toBe('verified');
  });

  it('drop matches from orphaned blocks when a reorg is detected mid-scan', async () => {
    const s = setup();
    const orphan = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(s.keys), block: 49_950, index: 0, caller: FAKE_ROUTER });
    let forked = false;
    const client = mockRpc(84532, (method, params) => {
      if (method === 'eth_blockNumber') return '0xea60'; // 60 000
      if (method === 'eth_getBlockByNumber') {
        const n = Number(params[0]);
        return { hash: forked ? blockHash(n + 5_000_000) : blockHash(n), parentHash: blockHash(n - 1), number: `0x${n.toString(16)}` };
      }
      if (method === 'eth_getLogs') {
        const f = params[0] as { fromBlock: bigint; toBlock: bigint };
        const live = !forked && BigInt(orphan.log.blockNumber) >= f.fromBlock && BigInt(orphan.log.blockNumber) <= f.toBlock;
        return live ? [orphan.log] : [];
      }
      throw new Error(`unexpected ${method}`);
    });
    const dropped: bigint[] = [];
    const res = await runScan({
      chain, manifest, client, cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
      onProgress: (p) => { if (p.nextBlock > 49_999n) forked = true; },
      onReorg: (to) => dropped.push(to),
    });
    expect(dropped).toEqual([0n]); // a deep reorg resets to genesis because one checkpoint cannot locate the fork safely
    expect(res.matches).toEqual([]);
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
    expect(cp.load(1, KEY)).toBeUndefined();
    cp.save(1, KEY, { nextBlock: 77n, last: { number: 76n, hash: `0x${'a'.repeat(64)}` } });
    expect(cp.load(1, KEY)).toEqual({ nextBlock: 77n, last: { number: 76n, hash: `0x${'a'.repeat(64)}` } });
    cp.save(2, KEY, { nextBlock: 5n });
    expect(cp.load(2, KEY)).toEqual({ nextBlock: 5n });
    cp.clear(1, KEY);
    expect(cp.load(1, KEY)).toBeUndefined();
    expect([...st.map.values()].join('')).not.toMatch(/secret|key/i);
  });
  it('ignores corrupt data and tolerates missing or failing storage', () => {
    const st = mem();
    st.setItem(`ghostpay.scan.checkpoint.v2.1.${KEY}`, 'not json');
    st.setItem(`ghostpay.scan.checkpoint.v2.2.${KEY}`, JSON.stringify({ nextBlock: 'abc' }));
    st.setItem(`ghostpay.scan.checkpoint.v2.3.${KEY}`, JSON.stringify({ nextBlock: '5', last: { number: 'x', hash: 'y' } }));
    const cp = localCheckpointStore(st);
    expect(cp.load(1, KEY)).toBeUndefined();
    expect(cp.load(2, KEY)).toBeUndefined();
    expect(cp.load(3, KEY)).toEqual({ nextBlock: 5n });
    const none = localCheckpointStore(undefined);
    expect(none.load(1, KEY)).toBeUndefined();
    none.save(1, KEY, { nextBlock: 1n });
    none.clear(1, KEY);
    const throwing = localCheckpointStore({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } });
    expect(throwing.load(1, KEY)).toBeUndefined();
    expect(() => { throwing.save(1, KEY, { nextBlock: 1n }); throwing.clear(1, KEY); }).not.toThrow();
    void vi;
  });

  describe('receipt verification and second provider', () => {
    const run = async (s: ReturnType<typeof setup>, client: ReturnType<typeof chainWith>, extra: Partial<Parameters<typeof runScan>[0]> = {}) => {
      const cp = new Map<number, unknown>();
      const res = await runScan({
        chain, manifest, client, cursor: { nextBlock: 0n },
        spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
        createWorker: () => new InlineWorker(), signal: new AbortController().signal,
        checkpoints: { load: () => undefined, save: (id, _k, c) => cp.set(id, c), clear: () => undefined }, ...extra,
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
    it('does not treat a direct announcement plus an existing balance as proof of payment', async () => {
      const s = setup();
      const base = chainWith(2500, s.logs);
      const rich = await run(s, withBalance(base, 10n ** 30n));
      expect(rich.res.matches.find((m) => !m.viaRouter)?.receipt).toBe('claimed');
      const poor = await run(s, withBalance(base, 1n));
      expect(poor.res.matches.find((m) => !m.viaRouter)?.receipt).toBe('claimed');
    });
    it('does not label a pre-final direct announcement as a payment', async () => {
      const s = setup();
      const { res } = await run(s, chainWith(2150, s.logs));
      expect(res.matches.find((m) => !m.viaRouter)?.receipt).toBe('claimed');
    });
    it('marks evidence-backed router transfers inside finalityDepth as pending', async () => {
      const s = setup();
      const near = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(s.keys), block: 2100, index: 2, caller: FAKE_ROUTER });
      const { res } = await run(s, chainWith(2150, [near.log]));
      expect(res.matches[0]?.receipt).toBe('pending');
    });
    it('requires a matching token transfer for router metadata before showing received', async () => {
      const s = setup();
      const base = chainWith(2500, [s.mine.log]);
      const badTransfer = { ...base, request: (method: string, params: readonly unknown[]) => {
        if (method === 'eth_getLogs' && (params[0] as { address?: string }).address?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e') return Promise.resolve([]);
        return base.request(method, params);
      } };
      const { res } = await run(s, badTransfer);
      expect(res.matches[0]?.viaRouter).toBe(true);
      expect(res.matches[0]?.receipt).toBe('claimed');
    });
    it('records no discrepancy and advances the checkpoint when providers agree', async () => {
      const s = setup();
      const { res, cp } = await run(s, chainWith(2500, s.logs), { secondaryClient: chainWith(2500, s.logs) });
      expect(res.discrepancies).toEqual([]);
      expect(cp.get(84532)).toBeDefined();
    });
    it('surfaces a hidden/forged log disagreement and withholds the checkpoint', async () => {
      const s = setup();
      const primaryOnlyRouterLog = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(s.keys), block: 2300, index: 5, caller: FAKE_ROUTER });
      const seen: string[] = [];
      const emitted: string[] = [];
      const { res, cp } = await run(s, chainWith(2500, s.logs), {
        // This forged router-attributed record exists only on primary and would otherwise be labeled verified.
        client: chainWith(2500, [...s.logs, primaryOnlyRouterLog.log]),
        secondaryClient: chainWith(2500, [s.mine.log]),
        onDiscrepancy: (d) => seen.push(...d.map((x) => x.kind)),
        onMatch: (m) => emitted.push(m.announcement.id),
      });
      expect(res.discrepancies.map((d) => d.kind)).toEqual(['missing_in_secondary', 'missing_in_secondary', 'missing_in_secondary']);
      expect(seen).toHaveLength(3);
      // In particular, a primary-only router log must not become an actionable verified card.
      expect(res.matches).toEqual([]);
      expect(emitted).toEqual([]);
      expect(cp.get(84532)).toBeUndefined();
    });
    it('stops at a discrepant page so a later agreeing page cannot checkpoint past it', async () => {
      const s = setup();
      const disputed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(s.keys), block: 2300, index: 5, caller: FAKE_ROUTER });
      const primary = chainWith(100_000, [...s.logs, disputed.log]);
      const secondary = chainWith(100_000, s.logs);
      const cp = new Map<number, unknown>();
      const res = await runScan({
        chain, manifest, client: primary, cursor: { nextBlock: 0n },
        spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
        viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(),
        signal: new AbortController().signal, secondaryClient: secondary,
        checkpoints: { load: () => undefined, save: (id, _key, value) => cp.set(id, value), clear: () => undefined },
      });
      expect(res.discrepancies.length).toBeGreaterThan(0);
      expect(res.cursor.nextBlock).toBe(0n);
      expect(cp.size).toBe(0);
      // The only primary log query must be the first bounded page. The runner must not
      // continue to a later agreeing page and accidentally persist a cursor past the gap.
      expect(primary.calls.filter((c) => c.method === 'eth_getLogs' && (c.params[0] as { address?: string }).address?.toLowerCase() === FAKE_ANNOUNCER.toLowerCase())).toHaveLength(50);
    });
  });
});
