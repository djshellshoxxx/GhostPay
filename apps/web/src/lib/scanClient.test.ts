import { CHAINS, ChainAdapterError, ghostPayRouterAbi, grossForNet, type Hex, type Address, type LogFilter, type RpcLog } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, parseMetadata, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { checkpointKeyId, localCheckpointStore, runScan, type CheckpointStore, type ScanProgress } from './scanClient';
import { ReconciliationVault } from './reconciliationVault';
import type { ToWorker } from './scannerCore';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const manifest = fakeManifest(84532);
const KEY = checkpointKeyId('02aa', '03bb');
const blockHash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function chainWith(head: number, logs: RpcLog[]) {
  // Real token transfers precede the announcement; reserve earlier indexes for them.
  logs = logs.map((log) => ({ ...log, logIndex: `0x${(BigInt(log.logIndex) + 100n).toString(16)}` }));
  const payer = '0x2222222222222222222222222222222222222222' as Address;
  const transfers: RpcLog[] = logs.flatMap((log) => {
    const sender = log.topics?.[3];
    const recipient = log.topics?.[2];
    if (sender?.toLowerCase() !== `0x${FAKE_ROUTER.slice(2).toLowerCase().padStart(64, '0')}` || recipient === undefined) return [];
    return [{
      address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      blockNumber: log.blockNumber,
      topics: [TRANSFER_TOPIC, `0x${payer.slice(2).padStart(64, '0')}`, recipient],
      data: `0x${1_000_000n.toString(16).padStart(64, '0')}`,
      blockHash: log.blockHash,
      ...(log.transactionHash === undefined ? {} : { transactionHash: log.transactionHash }),
      logIndex: `0x${(Number(BigInt(log.logIndex)) - 1).toString(16)}`,
    }];
  });
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: blockHash(n), parentHash: blockHash(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { address?: string; fromBlock: bigint; toBlock: bigint; topics?: readonly (string | null)[] };
      const source = f.address?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e' ? transfers : logs;
      const caller = f.topics?.[3];
      return source.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock && (caller == null || l.topics[3] === caller));
    }
    if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') {
      const log = logs.find((item) => item.transactionHash?.toLowerCase() === String(params[0]).toLowerCase());
      if (log === undefined) return null;
      const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log.data as Hex);
      const parsed = parseMetadata(metadata);
      if (parsed.kind !== 'erc20') throw new Error('fixture requires ERC20');
      const stealth = `0x${log.topics[2]!.slice(-40)}` as const;
      const common = { to: FAKE_ROUTER, from: payer, blockHash: log.blockHash, blockNumber: log.blockNumber };
      if (method === 'eth_getTransactionReceipt') return {
        ...common, status: '0x1', transactionHash: log.transactionHash,
        logs: [...transfers.filter((item) => item.transactionHash === log.transactionHash), log],
      };
      return { ...common, hash: log.transactionHash, value: '0x0', input: encodeFunctionData({
        abi: ghostPayRouterAbi, functionName: 'payERC20',
        args: [parsed.token, stealth, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata],
      }) };
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

  it('awaits persistent reorg invalidation before processing replacement logs', async () => {
    const s = setup();
    let release!: () => void;
    const invalidation = new Promise<void>((resolve) => { release = resolve; });
    let invalidating = false;
    const worker = new InlineWorker();
    const task = runScan({
      chain, manifest, client: chainWith(150, [s.mine.log]),
      cursor: { nextBlock: 100n, last: { number: 99n, hash: blockHash(9_999) as `0x${string}` } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => worker,
      signal: new AbortController().signal,
      onReorg: async () => { invalidating = true; await invalidation; },
    });
    await vi.waitFor(() => expect(invalidating).toBe(true));
    expect(worker.received.filter((message) => message.type === 'batch')).toEqual([]);
    release();
    expect((await task).matches).toHaveLength(1);
  });
  it('stops and wipes keys if persistent reorg invalidation fails', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    await expect(runScan({
      chain, manifest, client: chainWith(150, [s.mine.log]),
      cursor: { nextBlock: 100n, last: { number: 99n, hash: blockHash(9_999) as `0x${string}` } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey, createWorker: () => worker, signal: new AbortController().signal,
      onReorg: () => Promise.reject(new Error('reorg invalidation failed')),
    })).rejects.toThrow('reorg invalidation failed');
    expect(worker.received.filter((message) => message.type === 'batch')).toEqual([]);
    expect(worker.terminated).toBe(true);
    expect(viewingKey.every((byte) => byte === 0)).toBe(true);
  });
  it('quarantines an unconfirmed primary fork without permanently invalidating canonical history', async () => {
    const s = setup();
    const sellerKeyId = checkpointKeyId(hexOf(s.keys.spendingPublicKey), hexOf(s.keys.viewingPublicKey));
    const data = new Map<string, string>();
    const vault = new ReconciliationVault({
      read: (key) => Promise.resolve(data.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => { guard(); if ((data.get(key) ?? null) !== expected) return Promise.resolve(false); data.set(key, next); return Promise.resolve(true); },
    }, { chainId: chain.chainId, sellerKeyId }, () => undefined);
    await vault.unlock(unsafeRevealSecret(s.keys.viewingSecret).slice());
    const record = {
      version: 1 as const, sellerKeyId, chainId: chain.chainId, transactionHash: blockHash(999),
      blockHash: blockHash(120), blockNumber: '120', stealthAddress: `0x${'a'.repeat(40)}`, logIndex: 1,
      asset: 'native', amountMinorUnits: '1', viewTagMatched: true, recordedAt: 1800000000000,
      evidenceStatus: 'verified-at-scan' as const, evidenceSource: 'verified-router-scan' as const,
      id: `${sellerKeyId}:${chain.chainId}:${blockHash(999)}:0x${'a'.repeat(40)}:${blockHash(120)}:1`,
    };
    await vault.save(record);
    const primary = chainWith(300, []);
    const invalidated = vi.fn((from: bigint) => vault.invalidateFrom(from));
    const quarantined = vi.fn(); const emitted = vi.fn(); const saved = vi.fn();
    const result = await runScan({
      chain, manifest, client: { ...primary, getBlock: (n) => Promise.resolve({ number: n, hash: blockHash(Number(n) + 10000) as Hex, parentHash: blockHash(Number(n) + 9999) as Hex }) },
      secondaryClient: chainWith(300, []), cursor: { nextBlock: 201n, last: { number: 200n, hash: blockHash(200) as Hex } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: sellerKeyId,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
      onReorg: invalidated, onQuarantine: quarantined, onMatch: emitted,
      checkpoints: { load: () => undefined, save: saved, clear: () => undefined },
    });
    expect(result.discrepancies.length).toBeGreaterThan(0);
    expect(quarantined).toHaveBeenCalledExactlyOnceWith(0n);
    expect(invalidated).not.toHaveBeenCalled(); expect(emitted).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
    expect(result.matches).toEqual([]);
    expect((await vault.read())[0]?.evidenceStatus).toBe('verified-at-scan');
    await expect(vault.save(record)).resolves.toBeUndefined();
    vault.lock();
  });
  it('requires stable independent rollback anchors even when the replacement page end agrees', async () => {
    for (const equivocate of [false, true]) {
      const s = setup(); const primary = chainWith(300, []); const secondary = chainWith(300, []);
      let checkpointReads = 0;
      const invalidated = vi.fn(); const quarantined = vi.fn();
      const result = await runScan({
        chain, manifest, client: { ...primary, getBlock: (n) => {
          if (n === 200n && (!equivocate || checkpointReads++ === 0)) return Promise.resolve({ number: n, hash: blockHash(10200) as Hex, parentHash: blockHash(10199) as Hex });
          return primary.getBlock(n);
        } },
        secondaryClient: secondary, cursor: { nextBlock: 201n, last: { number: 200n, hash: blockHash(200) as Hex } },
        spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
        viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
        onReorg: invalidated, onQuarantine: quarantined,
      });
      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(invalidated).not.toHaveBeenCalled(); expect(quarantined).toHaveBeenCalledExactlyOnceWith(0n);
    }
  });
  it('confirms a genuine rollback with both providers before awaiting durable invalidation', async () => {
    const s = setup(); const primary = chainWith(300, []); const secondary = chainWith(300, []);
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = []; const worker = new InlineWorker();
    const task = runScan({
      chain, manifest, client: primary, secondaryClient: secondary,
      cursor: { nextBlock: 201n, last: { number: 200n, hash: blockHash(10200) as Hex } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => worker, signal: new AbortController().signal,
      onQuarantine: () => { order.push('quarantine'); },
      onReorg: async () => {
        order.push('invalidate'); await gate;
      },
    });
    await vi.waitFor(() => expect(order).toEqual(['quarantine', 'invalidate']));
    expect(secondary.calls.some((call) => call.method === 'eth_getBlockByNumber' && call.params[0] === 200n)).toBe(true);
    expect(worker.received.filter((message) => message.type === 'batch')).toEqual([]);
    release(); expect((await task).discrepancies).toEqual([]);
  });
  it('cannot persist a rollback after cancellation while independent confirmation is pending', async () => {
    const s = setup(); const primary = chainWith(300, []); const secondary = chainWith(300, []);
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let waiting = false;
    const ctl = new AbortController(); const invalidated = vi.fn(); const key = unsafeRevealSecret(s.keys.viewingSecret);
    const task = runScan({
      chain, manifest, client: primary, secondaryClient: { ...secondary, getBlock: async (n) => {
        if (n === 200n) { waiting = true; await gate; }
        return secondary.getBlock(n);
      } },
      cursor: { nextBlock: 201n, last: { number: 200n, hash: blockHash(10200) as Hex } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: key,
      createWorker: () => new InlineWorker(), signal: ctl.signal, onReorg: invalidated,
    });
    await vi.waitFor(() => expect(waiting).toBe(true)); ctl.abort();
    expect(key.every((b) => b === 0)).toBe(true); release(); await task;
    expect(invalidated).not.toHaveBeenCalled();
  });
  it('rejects missing, failing, drifting or inconsistent canonical rollback anchors', async () => {
    for (const mode of ['missing', 'error', 'wrong-chain', 'rollback-disagreement', 'drift', 'replacement-drift'] as const) {
      const s = setup(); const primary = chainWith(300, []); const secondary = chainWith(300, []);
      let primaryCheckpointReads = 0; let secondaryCheckpointReads = 0; let primaryEndReads = 0;
      const invalidated = vi.fn(); const emitted = vi.fn();
      const result = await runScan({
        chain, manifest,
        client: { ...primary, getBlock: (n) => {
          if (n === 200n && ++primaryCheckpointReads > 2 && mode === 'drift') return Promise.resolve({ number: n, hash: blockHash(10200) as Hex, parentHash: blockHash(10199) as Hex });
          if (n === 300n && ++primaryEndReads > 2 && mode === 'replacement-drift') return Promise.resolve({ number: n, hash: blockHash(10300) as Hex, parentHash: blockHash(10299) as Hex });
          return primary.getBlock(n);
        } },
        secondaryClient: { ...secondary, ...(mode === 'wrong-chain' ? { chainId: 1 } : {}), getBlock: (n) => {
          if (n === 200n) {
            if (mode === 'missing') return Promise.resolve(null);
            if (mode === 'error') return Promise.reject(new Error('private RPC detail'));
            if (++secondaryCheckpointReads > 1 && mode === 'drift') return Promise.resolve({ number: n, hash: blockHash(10200) as Hex, parentHash: blockHash(10199) as Hex });
          }
          if (n === 0n && mode === 'rollback-disagreement') return Promise.resolve({ number: n, hash: blockHash(10000) as Hex, parentHash: blockHash(9999) as Hex });
          return secondary.getBlock(n);
        } },
        cursor: { nextBlock: 201n, last: { number: 200n, hash: blockHash(10200) as Hex } },
        spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
        viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
        onReorg: invalidated, onMatch: emitted,
      });
      expect(result.discrepancies.length, mode).toBeGreaterThan(0);
      expect(JSON.stringify(result.discrepancies)).not.toContain('private RPC detail');
      expect(invalidated, mode).not.toHaveBeenCalled(); expect(emitted, mode).not.toHaveBeenCalled();
      expect(result.matches, mode).toEqual([]);
    }
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

  it('never defers the first page of a run, so a low non-router budget cannot hold the cursor for good (L3-F4)', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const spam = Array.from({ length: 6 }, (_, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 100, index: i, caller: '0x9999999999999999999999999999999999999999' }).log);
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block: 60_000, index: 0, caller: FAKE_ROUTER });
    const res = await runScan({
      chain, manifest, client: chainWith(70_000, [...spam, mine.log]), cursor: { nextBlock: 0n }, openLaneBudget: 5,
      spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([mine.stealthAddress]);
    expect(res.backlog).toBe(0);
    expect(res.cursor.nextBlock).toBe(70_001n);
  });

  it('keeps waiting for a worker that reports progress on a long batch, and still stops one that stalls (L3-F3)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (const advancing of [true, false]) {
        const s = setup();
        const worker = new InlineWorker();
        const deliver = worker.postMessage.bind(worker);
        let held: Extract<ToWorker, { type: 'batch' }> | undefined;
        worker.postMessage = (m): void => { if (m.type === 'batch') held = m; else deliver(m); };
        const task = runScan({
          chain, manifest, client: chainWith(2500, s.logs), cursor: { nextBlock: 0n },
          spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
          createWorker: () => worker, signal: new AbortController().signal, replyTimeoutMs: 50,
        });
        const outcome = task.then(() => 'done', (e: unknown) => (e instanceof Error ? e.message : 'error'));
        for (let i = 0; i < 10_000 && held === undefined; i++) await Promise.resolve();
        const batch = held!;
        // 200 ms in total, never 50 ms without progress: a slow device scanning a full page.
        for (let i = 1; i <= 5; i++) {
          await vi.advanceTimersByTimeAsync(40);
          worker.onmessage?.({ data: { type: 'progress', batchId: batch.batchId, scanned: advancing ? i * 128 : 128 } });
        }
        deliver(batch);
        await vi.advanceTimersByTimeAsync(0);
        expect(await outcome).toBe(advancing ? 'done' : 'The scanner did not answer in time and was stopped.');
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('announcement spam and a second RPC (L4-01, L3-F2)', () => {
  const OTHER = '0x9999999999999999999999999999999999999999' as Address;
  const tooBig = (): Error => new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
  /** Any announcer query without a caller filter that covers `dense` (or spans more than `maxBlocks`) exceeds the cap. */
  const capped = (base: ReturnType<typeof chainWith>, dense: bigint | undefined, maxBlocks = 1000n): ReturnType<typeof chainWith> => ({
    ...base,
    getLogs: (f: LogFilter) => (f.topics.length === 2 && (f.toBlock - f.fromBlock + 1n > maxBlocks || (dense !== undefined && f.fromBlock <= dense && f.toBlock >= dense))
      ? Promise.reject(tooBig())
      : base.getLogs(f)),
  });
  const scan = (s: ReturnType<typeof setup>, extra: Partial<Parameters<typeof runScan>[0]> & Pick<Parameters<typeof runScan>[0], 'client'>) => runScan({
    chain, manifest, cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
    createWorker: () => new InlineWorker(), signal: new AbortController().signal, ...extra,
  });

  it('scans the router lane of a block too large for one response, reports it, and compares it the same way', async () => {
    const s = setup();
    const stranger = encodeMetaAddress(generateKeySet());
    const spam = Array.from({ length: 5 }, (_, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 120, index: 10 + i, caller: OTHER }).log);
    const logs = [...s.logs, ...spam];
    const single = await scan(s, { client: capped(chainWith(2500, logs), 120n) });
    expect(single.routerOnlyBlocks).toEqual([120n]);
    expect(single.matches.map((m) => m.stealthAddress)).toEqual([s.mine.stealthAddress, s.mine2.stealthAddress]);
    expect(single.matches[0]?.receipt).toBe('verified');
    const both = await scan(s, { client: capped(chainWith(2500, logs), 120n), secondaryClient: capped(chainWith(2500, logs), 120n) });
    expect(both.discrepancies).toEqual([]);
    expect(both.routerOnlyBlocks).toEqual([120n]);
    expect(both.matches).toHaveLength(2);
  });

  it('splits dense ranges on the second RPC instead of withholding the page (L3-F2)', async () => {
    const s = setup();
    const res = await scan(s, { client: chainWith(2500, s.logs), secondaryClient: capped(chainWith(2500, s.logs), undefined, 100n) });
    expect(res.discrepancies).toEqual([]);
    expect(res.matches).toHaveLength(2);
    expect(res.cursor.nextBlock).toBe(2501n);
  });

  it('ends each two-provider page at the lower head, so a second RPC a few blocks behind does not stall the scan (L3-F2)', async () => {
    const s = setup();
    const pay = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(s.keys), block: 1200, index: 0, caller: FAKE_ROUTER });
    const upTo = (head: number) => { const base = chainWith(head, [pay.log]); return { ...base, getBlock: (n: bigint) => (n > BigInt(head) ? Promise.resolve(null) : base.getBlock(n)) }; };
    const res = await scan(s, { client: upTo(30_000), secondaryClient: upTo(29_998), cursor: { nextBlock: 1000n } });
    expect(res.discrepancies).toEqual([]);
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([pay.stealthAddress]);
    expect(res.cursor.nextBlock).toBe(29_999n);
    // A second RPC that cannot even report its head fails closed as before.
    const dead = { ...upTo(29_998), blockNumber: () => Promise.reject(new Error('down')) };
    const failed = await scan(s, { client: upTo(30_000), secondaryClient: dead, cursor: { nextBlock: 1000n } });
    expect(failed.discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    expect(failed.matches).toEqual([]);
    expect(failed.cursor.nextBlock).toBe(1000n);
  });
});

describe('runScan robustness (S3-15)', () => {
  it('destroys the worker immediately when cancelled during an outstanding RPC read', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const ctl = new AbortController();
    let release!: (value: bigint) => void;
    let reading = false;
    const gate = new Promise<bigint>((resolve) => { release = resolve; });
    const client = { ...chainWith(150, []), blockNumber: async () => { reading = true; return gate; } };
    const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
    const task = runScan({ chain, manifest, client, cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey, createWorker: () => worker, signal: ctl.signal });
    await vi.waitFor(() => expect(reading).toBe(true));
    ctl.abort();
    expect(worker.terminated).toBe(true);
    expect(viewingKey.every((byte) => byte === 0)).toBe(true);
    release(150n);
    expect((await task).matches).toEqual([]);
  });
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
      onReorg: (to) => { dropped.push(to); },
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
        if (method === 'eth_getTransactionReceipt') return base.request(method, params).then((raw) => ({ ...(raw as object), logs: ((raw as { logs: RpcLog[] }).logs).filter((log) => log.topics[0] !== TRANSFER_TOPIC) }));
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

describe('spec 05: spam lanes, backlog and local telemetry', () => {
  const OTHER = '0x9999999999999999999999999999999999999999' as Address;
  const spamAt = (stranger: string, block: number, count: number): RpcLog[] => {
    const one = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block, index: 0, caller: OTHER, wrongTag: true }).log;
    return Array.from({ length: count }, (_, i) => ({ ...one, logIndex: `0x${i.toString(16)}` }));
  };

  it('sends router (trusted lane) announcements to the worker before open-lane ones', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const open = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 100, index: 0, caller: OTHER });
    const routed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 200, index: 1, caller: FAKE_ROUTER });
    const worker = new InlineWorker();
    await runScan({
      chain, manifest, client: chainWith(2500, [open.log, routed.log]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
      createWorker: () => worker, signal: new AbortController().signal,
    });
    const batch = worker.received.find((m) => m.type === 'batch');
    const ids = batch?.type === 'batch' ? batch.logs.map((l) => l.id.split(':')[0]) : [];
    expect(ids).toEqual([routed.log.blockHash, open.log.blockHash]);
  });

  it('defers open-lane logs past the per-scan budget as backlog, keeps finding router payments, and resumes without a gap', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const stranger = encodeMetaAddress(generateKeySet());
    const routerPay = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 60_000, index: 40, caller: FAKE_ROUTER });
    const direct = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 60_010, index: 41, caller: OTHER });
    const client = chainWith(120_000, [...spamAt(stranger, 100, 30), ...spamAt(stranger, 60_001, 30), routerPay.log, direct.log]);
    const progress: ScanProgress[] = [];
    const run = (cursor: { nextBlock: bigint }) => runScan({
      chain, manifest, client, cursor,
      spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, openLaneBudget: 40,
      onProgress: (p) => progress.push(p),
    });
    const first = await run({ nextBlock: 0n });
    expect(first.matches.map((m) => m.stealthAddress)).toEqual([routerPay.stealthAddress]);
    expect(first.backlog).toBe(31);
    // The deferred page is not checkpointed past: the cursor stays at the start of that page.
    expect(first.cursor.nextBlock).toBe(50_000n);
    expect(progress.at(-1)).toMatchObject({ backlog: 31, caughtUp: false });
    expect(first.telemetry).toMatchObject({ trusted: 1, open: 30, suspected: 60 });
    const second = await run(first.cursor);
    expect(second.matches.map((m) => m.stealthAddress).sort()).toEqual([routerPay.stealthAddress, direct.stealthAddress].sort());
    expect(second.backlog).toBe(0);
  });

  it('reports a local privacy-set estimate from router announcements it scanned', async () => {
    const s = setup();
    const res = await runScan({
      chain, manifest, client: chainWith(2500, s.logs), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.telemetry?.anonymity).toMatchObject({ level: 'low', count7d: 2, partial: false });
  });
});

describe('two-provider replay-tail checkpoint anchor', () => {
  const TAIL = 2400n; // head 2500 - finalityDepth 100: the anchor block of the saved replay tail
  const fake = (n: bigint) => Promise.resolve({ number: n, hash: blockHash(Number(n) + 50_000) as Hex, parentHash: blockHash(Number(n) + 49_999) as Hex });
  const memStore = () => {
    const map = new Map<string, string>();
    const saves: unknown[] = [];
    const store = localCheckpointStore({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) });
    const recording: CheckpointStore = { ...store, save: (id, key, cursor) => { saves.push(cursor); store.save(id, key, cursor); } };
    return { map, saves, store: recording };
  };
  async function vaultWithVerifiedRecord(s: ReturnType<typeof setup>, sellerKeyId: string) {
    const data = new Map<string, string>();
    const vault = new ReconciliationVault({
      read: (key) => Promise.resolve(data.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => { guard(); if ((data.get(key) ?? null) !== expected) return Promise.resolve(false); data.set(key, next); return Promise.resolve(true); },
    }, { chainId: chain.chainId, sellerKeyId }, () => undefined);
    await vault.unlock(unsafeRevealSecret(s.keys.viewingSecret).slice());
    const record = {
      version: 1 as const, sellerKeyId, chainId: chain.chainId, transactionHash: blockHash(999),
      blockHash: blockHash(120), blockNumber: '120', stealthAddress: `0x${'a'.repeat(40)}`, logIndex: 1,
      asset: 'native', amountMinorUnits: '1', viewTagMatched: true, recordedAt: 1800000000000,
      evidenceStatus: 'verified-at-scan' as const, evidenceSource: 'verified-router-scan' as const,
      id: `${sellerKeyId}:${chain.chainId}:${blockHash(999)}:0x${'a'.repeat(40)}:${blockHash(120)}:1`,
    };
    await vault.save(record);
    return vault;
  }
  type Params = Parameters<typeof runScan>[0];
  const scan = (s: ReturnType<typeof setup>, keyId: string, extra: Partial<Params> & Pick<Params, 'client'>) => runScan({
    chain, manifest, cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId,
    viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    ...extra,
  });

  it('withholds a primary-only fabricated tail anchor so a truthful resume never invalidates canonical history', async () => {
    const s = setup();
    const sellerKeyId = checkpointKeyId(hexOf(s.keys.spendingPublicKey), hexOf(s.keys.viewingPublicKey));
    const cp = memStore();
    const primary = chainWith(2500, [s.mine.log]);
    const seen: string[] = [];
    // The primary lies only about the replay-tail anchor block; payment block 120 and window ends are truthful.
    const first = await scan(s, sellerKeyId, {
      client: { ...primary, getBlock: (n) => (n === TAIL ? fake(n) : primary.getBlock(n)) },
      secondaryClient: chainWith(2500, [s.mine.log]), checkpoints: cp.store,
      onDiscrepancy: (d) => seen.push(...d.map((x) => `${x.kind}@${x.ref}`)),
    });
    expect.soft(cp.saves.some((c) => (c as { last?: { hash: string } }).last?.hash === blockHash(Number(TAIL) + 50_000))).toBe(false);
    expect.soft(first.discrepancies).toEqual([{ kind: 'block_hash_differs', ref: TAIL.toString() }]);
    expect.soft(seen).toEqual([`block_hash_differs@${TAIL.toString()}`]);

    const vault = await vaultWithVerifiedRecord(s, sellerKeyId);
    const invalidated = vi.fn((from: bigint) => vault.invalidateFrom(from));
    const resumed = await scan(s, sellerKeyId, {
      client: chainWith(2500, [s.mine.log]), secondaryClient: chainWith(2500, [s.mine.log]),
      cursor: cp.store.load(chain.chainId, sellerKeyId) ?? { nextBlock: 0n }, checkpoints: cp.store, onReorg: invalidated,
    });
    expect.soft(invalidated).not.toHaveBeenCalled();
    expect.soft((await vault.read())[0]?.evidenceStatus).toBe('verified-at-scan');
    expect.soft(resumed.discrepancies).toEqual([]);
    vault.lock();
  });

  it('advances a corroborated tail anchor when both providers agree at its exact height', async () => {
    const s = setup(); const cp = memStore(); const secondary = chainWith(2500, s.logs);
    const res = await scan(s, KEY, { client: chainWith(2500, s.logs), secondaryClient: secondary, checkpoints: cp.store });
    expect(res.discrepancies).toEqual([]);
    expect(cp.store.load(chain.chainId, KEY)).toEqual({ nextBlock: TAIL + 1n, last: { number: TAIL, hash: blockHash(Number(TAIL)) } });
    expect(secondary.calls.some((c) => c.method === 'eth_getBlockByNumber' && c.params[0] === TAIL)).toBe(true);
  });

  it('fails closed when the secondary is missing, erroring, wrong-height or wrong-chain at the tail', async () => {
    for (const mode of ['missing', 'error', 'wrong-height', 'wrong-chain'] as const) {
      const s = setup(); const cp = memStore(); const secondary = chainWith(2500, [s.mine.log]);
      const res = await scan(s, KEY, {
        client: chainWith(2500, [s.mine.log]), checkpoints: cp.store,
        secondaryClient: { ...secondary, ...(mode === 'wrong-chain' ? { chainId: 1 } : {}), getBlock: (n) => {
          if (n === TAIL && mode === 'missing') return Promise.resolve(null);
          if (n === TAIL && mode === 'error') return Promise.reject(new Error('private RPC detail'));
          if (n === TAIL && mode === 'wrong-height') return Promise.resolve({ number: n + 1n, hash: blockHash(Number(n)) as Hex, parentHash: blockHash(Number(n) - 1) as Hex });
          return secondary.getBlock(n);
        } },
      });
      expect(res.discrepancies.length, mode).toBeGreaterThan(0);
      expect(JSON.stringify(res.discrepancies)).not.toContain('private RPC detail');
      expect(cp.saves, mode).toEqual([]);
      expect(cp.map.size, mode).toBe(0);
    }
  });

  it('rejects a primary that changes its tail answer during the check', async () => {
    const s = setup(); const cp = memStore(); const primary = chainWith(2500, [s.mine.log]);
    let reads = 0;
    const res = await scan(s, KEY, {
      client: { ...primary, getBlock: (n) => (n === TAIL && reads++ > 0 ? fake(n) : primary.getBlock(n)) },
      secondaryClient: chainWith(2500, [s.mine.log]), checkpoints: cp.store,
    });
    expect(cp.saves).toEqual([]);
    expect(reads).toBeGreaterThan(1);
    expect(res.discrepancies).toEqual([{ kind: 'block_hash_differs', ref: TAIL.toString() }]);
  });

  it('writes nothing when cancelled while the tail corroboration is pending', async () => {
    const s = setup(); const cp = memStore(); const secondary = chainWith(2500, [s.mine.log]);
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let waiting = false;
    const ctl = new AbortController(); const key = unsafeRevealSecret(s.keys.viewingSecret);
    const task = scan(s, KEY, {
      client: chainWith(2500, [s.mine.log]), checkpoints: cp.store, signal: ctl.signal, viewingKey: key,
      secondaryClient: { ...secondary, getBlock: async (n) => { if (n === TAIL) { waiting = true; await gate; } return secondary.getBlock(n); } },
    });
    await vi.waitFor(() => expect(waiting).toBe(true)); ctl.abort();
    expect(key.every((b) => b === 0)).toBe(true); release(); await task;
    expect(cp.saves).toEqual([]);
  });

  it('still invalidates through the confirmed path after a genuine two-provider reorg of the saved anchor', async () => {
    const s = setup();
    const sellerKeyId = checkpointKeyId(hexOf(s.keys.spendingPublicKey), hexOf(s.keys.viewingPublicKey));
    const cp = memStore();
    await scan(s, sellerKeyId, { client: chainWith(2500, [s.mine.log]), secondaryClient: chainWith(2500, [s.mine.log]), checkpoints: cp.store });
    const saved = cp.store.load(chain.chainId, sellerKeyId);
    expect(saved?.last).toEqual({ number: TAIL, hash: blockHash(Number(TAIL)) });
    const forked = () => { const base = chainWith(2600, [s.mine.log]); return { ...base, getBlock: (n: bigint) => (n >= TAIL ? fake(n) : base.getBlock(n)) }; };
    const vault = await vaultWithVerifiedRecord(s, sellerKeyId);
    const invalidated = vi.fn((from: bigint) => vault.invalidateFrom(from));
    const res = await scan(s, sellerKeyId, { client: forked(), secondaryClient: forked(), cursor: saved!, checkpoints: cp.store, onReorg: invalidated });
    expect(res.discrepancies).toEqual([]);
    expect(invalidated).toHaveBeenCalledExactlyOnceWith(0n);
    expect((await vault.read())[0]?.evidenceStatus).toBe('invalidated-after-reorg');
    vault.lock();
  });
});
