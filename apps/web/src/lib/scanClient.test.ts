import { CHAINS, ChainAdapterError, ghostPayRouterAbi, grossForNet, type Hex, type Address, type LogFilter, type RpcLog, type ScanCursor } from '@ghostpay/chain-adapters';
import { buildErc20Metadata, encodeMetaAddress, generateKeySet, parseMetadata, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog, TOKEN_84532 } from '../test/announcements';
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
      data: `0x${parseMetadata(decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log.data as Hex)[1]).netAmount.toString(16).padStart(64, '0')}`,
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
    const invalidated = vi.fn((from: bigint, canonical: (height: bigint) => Promise<Hex>) => vault.invalidateFrom(from, [], canonical));
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
    // A free replay: the same announcement posted again directly at the announcer, by a caller that is not the router.
    const replayTopics = [...s.mine.log.topics];
    replayTopics[3] = `0x${'99'.repeat(20).padStart(64, '0')}`;
    const replay: RpcLog = { ...s.mine.log, topics: replayTopics, blockNumber: '0x79', blockHash: blockHash(121), logIndex: '0x5' };
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
    const replayTopics = [...s.mine.log.topics];
    replayTopics[3] = `0x${'99'.repeat(20).padStart(64, '0')}`;
    const replay: RpcLog = { ...s.mine.log, topics: replayTopics, blockNumber: '0x458', blockHash: blockHash(1112), logIndex: '0x5', transactionHash: `0x${'ab'.repeat(32)}` };
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, replay]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.receipt).toBe('verified');
  });
  it('lists a router replay of one address and ephemeral key separately, and does not verify a copy naming another block\'s transaction (F1)', async () => {
    const s = setup();
    const replay: RpcLog = { ...s.mine.log, blockNumber: '0x79', blockHash: blockHash(121), logIndex: '0x5' };
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, replay]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    // Both router records are kept and verified on their own; the copy names a transaction from another block.
    expect(res.matches.map((m) => m.receipt)).toEqual(['verified', 'claimed']);
  });
  it('keeps every router record of one address and ephemeral key across log pages, each with its own evidence (F1)', async () => {
    const s = setup();
    const replay: RpcLog = { ...s.mine.log, blockNumber: '0x458', blockHash: blockHash(1112), logIndex: '0x5', transactionHash: `0x${'ab'.repeat(32)}` };
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, replay]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.matches.map((m) => [m.announcement.transactionHash, m.receipt])).toEqual([[s.mine.log.transactionHash, 'verified'], [replay.transactionHash, 'verified']]);
  });
  it('F1: a front-run 1-unit router announcement with a copied address and ephemeral key does not hide the genuine router payment', async () => {
    const s = setup();
    const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], s.mine.log.data as Hex);
    const dustMetadata = buildErc20Metadata(parseMetadata(metadata).viewTag, parseMetadata(metadata).token, 1n);
    // Mined first (earlier block), from its own router transaction moving 1 unit to the copied one-time address.
    const dust: RpcLog = {
      ...s.mine.log,
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, `0x${hexOf(dustMetadata)}`]),
      blockNumber: '0x77', blockHash: blockHash(119), logIndex: '0x2', transactionHash: `0x${'ee'.repeat(32)}`,
    };
    const emitted: import('./scanClient').ScanMatch[] = [];
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [dust, s.mine.log]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, onMatch: (m) => emitted.push(m),
    });
    expect(res.matches.map((m) => [m.announcement.transactionHash, m.metadata?.netAmount, m.receipt])).toEqual([
      [dust.transactionHash, 1n, 'verified'],
      [s.mine.log.transactionHash, 1_000_000n, 'verified'],
    ]);
    expect(new Set(res.matches.map((m) => `${m.stealthAddress}|${m.announcement.ephemeralPublicKey}`)).size).toBe(1);
    expect(emitted.map((m) => m.announcement.id)).toEqual(res.matches.map((m) => m.announcement.id));
  });
  it.each([
    ['in the same log page', '0x79', 121],
    ['on a later log page', '0x458', 1112],
  ])('lists a second router payment to the same address and ephemeral key %s instead of dropping it', async (_where, blockNumber, block) => {
    // The router moves funds in the transaction that announces, so this is another transfer, not a replay. Anyone
    // can copy a pending payment's address and ephemeral key; collapsing the pair let a cheap payment mined first
    // hide the genuine one from the seller.
    const s = setup();
    const second: RpcLog = { ...s.mine.log, blockNumber, blockHash: blockHash(block), logIndex: '0x5', transactionHash: `0x${'ab'.repeat(32)}` };
    const emitted: import('./scanClient').ScanMatch[] = [];
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, second]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, onMatch: (m) => emitted.push(m),
    });
    expect(res.matches.map((m) => m.announcement.transactionHash)).toEqual([s.mine.log.transactionHash, second.transactionHash]);
    expect(res.matches.map((m) => m.receipt)).toEqual(['verified', 'verified']);
    expect(res.matches.every((m) => m.viaRouter)).toBe(true);
    expect(emitted.map((m) => m.announcement.id)).toEqual(res.matches.map((m) => m.announcement.id));
  });
  it('still drops a free replay once a router payment for the pair is listed, on a later page too', async () => {
    const s = setup();
    const second: RpcLog = { ...s.mine.log, blockNumber: '0x79', blockHash: blockHash(121), logIndex: '0x5', transactionHash: `0x${'ab'.repeat(32)}` };
    const replayTopics = [...s.mine.log.topics];
    replayTopics[3] = `0x${'99'.repeat(20).padStart(64, '0')}`;
    const replay: RpcLog = { ...s.mine.log, topics: replayTopics, blockNumber: '0x458', blockHash: blockHash(1112), logIndex: '0x7', transactionHash: `0x${'cc'.repeat(32)}` };
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [s.mine.log, second, replay]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    });
    expect(res.matches).toHaveLength(2);
    expect(res.matches.every((m) => m.viaRouter && m.receipt === 'verified')).toBe(true);
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

  it('skips a later third-party (non-router) replay of an already listed router payment across pages (F1 keeps only router records separate)', async () => {
    const s = setup();
    const router: RpcLog = { ...s.mine.log, blockNumber: '0x78', blockHash: blockHash(120), logIndex: '0x1', transactionHash: `0x${'bb'.repeat(32)}` };
    const directTopics = [...router.topics];
    directTopics[3] = `0x${'99'.repeat(20).padStart(64, '0')}`;
    const direct: RpcLog = { ...router, topics: directTopics, blockNumber: '0xc7a8', blockHash: blockHash(51_112), logIndex: '0x0', transactionHash: `0x${'aa'.repeat(32)}` };
    const emitted: import('./scanClient').ScanMatch[] = [];
    const res = await runScan({
      chain, manifest, client: chainWith(52_000, [router, direct]), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, onMatch: (m) => emitted.push(m),
    });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.viaRouter).toBe(true);
    expect(res.matches[0]?.announcement.transactionHash).toBe(router.transactionHash);
    expect(emitted).toHaveLength(1);
  });

  describe('claim ledger rebuild after a reorg on a later page', () => {
    // Page 1 is blocks 0..49999 (fifty 1000-block windows); the replacement logs below sit on page 2 / the re-read.
    const HEAD = 52_000;
    const NO_ROUTER = `0x${'99'.repeat(20).padStart(64, '0')}`;
    function fixture() {
      const s = setup();
      const meta = encodeMetaAddress(s.keys);
      const q = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 130, index: 1, caller: FAKE_ROUTER });
      const asDirect = (log: RpcLog, over: Partial<RpcLog>): RpcLog => ({ ...log, topics: [log.topics[0]!, log.topics[1]!, log.topics[2]!, NO_ROUTER], ...over });
      const at = (block: number): Partial<RpcLog> => ({ blockNumber: `0x${block.toString(16)}`, blockHash: blockHash(block) });
      // Kept before the reorg: P (router, index 0) and Q (public direct post, index 1).
      const qDirect = asDirect(q.log, { ...at(130), logIndex: '0x1', transactionHash: `0x${'d1'.repeat(32)}` });
      const kept = [s.mine.log, qDirect];
      // Seen only after the reorg point.
      const replayP = asDirect(s.mine.log, { ...at(50_500), logIndex: '0x2', transactionHash: `0x${'aa'.repeat(32)}` });
      const replayQ = asDirect(q.log, { ...at(50_600), logIndex: '0x3', transactionHash: `0x${'ab'.repeat(32)}` });
      const routerQ: RpcLog = { ...q.log, ...at(50_700), logIndex: '0x4', transactionHash: `0x${'bb'.repeat(32)}` };
      const routerP2: RpcLog = { ...s.mine.log, ...at(50_800), logIndex: '0x5', transactionHash: `0x${'cc'.repeat(32)}` };
      return { s, kept, replayP, replayQ, routerQ, routerP2, all: [...kept, replayP, replayQ, routerQ, routerP2] };
    }
    /** Serves `block`'s hash differently on exactly the given (1-based) reads, as a fork would. */
    function forking(client: ReturnType<typeof chainWith>, block: bigint, readsToFork: readonly number[]) {
      let reads = 0;
      return { ...client, getBlock: async (n: bigint) => {
        const real = await client.getBlock(n);
        if (n !== block || real === null || !readsToFork.includes(++reads)) return real;
        return { ...real, hash: blockHash(Number(n) + 10_000) as Hex };
      } };
    }
    const run = (f: ReturnType<typeof fixture>, client: ReturnType<typeof forking>, extra: { onMatch?: (m: import('./scanClient').ScanMatch) => void; onReorg?: (to: bigint) => void } = {}) => runScan({
      chain, manifest, client, cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(f.s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(f.s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, ...extra,
    });
    const txs = (ms: readonly import('./scanClient').ScanMatch[]): (string | undefined)[] => ms.map((m) => m.announcement.transactionHash);

    it('after a rollback above genesis, drops replays of kept pairs, replaces a kept replay in place, and appends a distinct router record', async () => {
      const f = fixture();
      // Window 50000..50999 ends at block 50999: its hash changes between the window read and the end-of-page check,
      // so page 2 reports a reorg at block 50000 (above genesis) with page 1's records kept.
      const rolledBack: bigint[] = [];
      const emitted: import('./scanClient').ScanMatch[] = [];
      const res = await run(f, forking(chainWith(HEAD, f.all), 50_999n, [2]), { onMatch: (m) => emitted.push(m), onReorg: (to) => { rolledBack.push(to); } });
      expect(rolledBack).toEqual([50_000n]);
      // Emissions follow the page's processing order (P's second router record before Q's replacement).
      // (a) both free replays are dropped, (b) Q's public post is replaced IN PLACE by its router record (index 1,
      // not P's index 0, and not appended), (c) P's second router record is appended after it.
      expect(txs(res.matches)).toEqual([f.s.mine.log.transactionHash, f.routerQ.transactionHash, f.routerP2.transactionHash]);
      expect(res.matches.map((m) => m.viaRouter)).toEqual([true, true, true]);
      expect(res.matches.map((m) => m.receipt)).toEqual(['verified', 'verified', 'verified']);
      expect(res.matches[0]?.stealthAddress).toBe(res.matches[2]?.stealthAddress);
      expect(res.matches[1]?.stealthAddress).not.toBe(res.matches[0]?.stealthAddress);
      expect(txs(emitted)).toEqual([f.s.mine.log.transactionHash, f.kept[1]!.transactionHash, f.routerP2.transactionHash, f.routerQ.transactionHash]);
      expect(res.cursor.nextBlock).toBe(BigInt(HEAD) + 1n);
    });

    it('after a rollback to genesis, every pair is new again and indexes restart from the empty list', async () => {
      const f = fixture();
      // Page 2 re-reads page 1's last block (the checkpoint) and finds it replaced: roll back to genesis and rescan.
      // Block 49999 is read twice on page 1 (window end, page end), so read 3 is page 2's checkpoint check.
      const rolledBack: bigint[] = [];
      const emitted: import('./scanClient').ScanMatch[] = [];
      const res = await run(f, forking(chainWith(HEAD, f.all), 49_999n, [3]), { onMatch: (m) => emitted.push(m), onReorg: (to) => { rolledBack.push(to); } });
      expect(rolledBack).toEqual([0n]);
      expect(txs(res.matches)).toEqual([f.s.mine.log.transactionHash, f.routerQ.transactionHash, f.routerP2.transactionHash]);
      expect(res.matches.map((m) => m.viaRouter)).toEqual([true, true, true]);
      // P and Q's public post were listed once before the rollback and again after it (treated as new, not as replays).
      expect(txs(emitted)).toEqual([
        f.s.mine.log.transactionHash, f.kept[1]!.transactionHash,
        f.s.mine.log.transactionHash, f.kept[1]!.transactionHash, f.routerP2.transactionHash, f.routerQ.transactionHash,
      ]);
    });
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

  it('fails at once when the worker posts an error while a batch is pending, without waiting for the reply timeout', async () => {
    const s = setup();
    const w = new InlineWorker();
    const forward = w.postMessage.bind(w);
    let batches = 0;
    w.postMessage = (m): void => {
      if (m.type === 'batch') { batches += 1; queueMicrotask(() => w.onmessage?.({ data: { type: 'error', code: 'BOOM' } } as never)); }
      else forward(m);
    };
    const run = runScan({
      chain, manifest, client: chainWith(2500, s.logs), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => w, signal: new AbortController().signal,
    });
    run.catch(() => undefined);
    // The default reply timeout is 60 s; the error must end the scan long before that.
    await expect(Promise.race([run, new Promise((_resolve, reject) => { setTimeout(() => { reject(new Error('still waiting')); }, 2_000); })])).rejects.toThrow(/worker failed/);
    expect(batches).toBe(1);
    expect(w.terminated).toBe(true);
  }, 15_000);

  it('propagates RPC failures and still shuts the worker down', async () => {
    const s = setup();
    const worker = new InlineWorker();
    const bad = mockRpc(84532, () => {
      throw new Error('rpc down');
    });
    await expect(runScan({ chain, manifest, client: bad, cursor: { nextBlock: 0n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => worker, signal: new AbortController().signal })).rejects.toThrow();
    expect(worker.terminated).toBe(true);
  });

  it('treats a checkpoint block the only RPC cannot return as unavailable: no rollback, no invalidation (L3-F1)', async () => {
    const s = setup();
    const base = chainWith(5000, []);
    let nulled = false;
    const flaky = { ...base, getBlock: (n: bigint) => { if (n === 200n && !nulled) { nulled = true; return Promise.resolve(null); } return base.getBlock(n); } };
    const reorged = vi.fn(); const quarantined = vi.fn(); const cleared = vi.fn(); const saved = vi.fn();
    await expect(runScan({
      chain, manifest, client: flaky, cursor: { nextBlock: 201n, last: { number: 200n, hash: blockHash(200) as Hex } },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, onReorg: reorged, onQuarantine: quarantined,
      checkpoints: { load: () => undefined, save: saved, clear: cleared },
    })).rejects.toThrow(/checkpoint block unavailable/);
    expect(reorged).not.toHaveBeenCalled(); expect(quarantined).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
  });

  it('keeps the saved checkpoint when the second RPC does not confirm the primary\'s fork report (L3-F1)', async () => {
    const s = setup(); const primary = chainWith(300, []);
    const cleared = vi.fn(); const saved = vi.fn();
    const cursor = { nextBlock: 201n, last: { number: 200n, hash: blockHash(200) as Hex } };
    const result = await runScan({
      chain, manifest, client: { ...primary, getBlock: (n) => Promise.resolve({ number: n, hash: blockHash(Number(n) + 10000) as Hex, parentHash: blockHash(Number(n) + 9999) as Hex }) },
      secondaryClient: chainWith(300, []), cursor,
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
      checkpoints: { load: () => undefined, save: saved, clear: cleared },
    });
    expect(result.discrepancies.length).toBeGreaterThan(0);
    expect(cleared).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
    expect(result.cursor).toEqual(cursor);
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
    const progress: ScanProgress[] = [];
    const single = await scan(s, { client: capped(chainWith(2500, logs), 120n), onProgress: (x) => progress.push(x) });
    expect(single.routerOnlyBlocks).toEqual([120n]);
    // Reported with the committed page, not only in the final result.
    expect(progress.at(-1)?.routerOnlyBlocks).toEqual([120n]);
    expect(single.matches.map((m) => m.stealthAddress)).toEqual([s.mine.stealthAddress, s.mine2.stealthAddress]);
    expect(single.matches[0]?.receipt).toBe('verified');
    const both = await scan(s, { client: capped(chainWith(2500, logs), 120n), secondaryClient: capped(chainWith(2500, logs), 120n) });
    expect(both.discrepancies).toEqual([]);
    expect(both.routerOnlyBlocks).toEqual([120n]);
    expect(both.matches).toHaveLength(2);
  });

  it('scans a block whole after a -32005 rate-limit burst, so its direct payment is found and no block is reported narrowed (A-R1)', async () => {
    const s = setup();
    const base = chainWith(2500, s.logs);
    // Ten refusals take the first window down to block 2100 alone, which holds the direct (non-router) payment.
    let burst = 10;
    const client = {
      ...base,
      getLogs: (f: LogFilter) => (f.topics.length === 2 && burst-- > 0 ? Promise.reject(new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32005')) : base.getLogs(f)),
    };
    const progress: ScanProgress[] = [];
    const res = await scan(s, { client, cursor: { nextBlock: 2100n }, onProgress: (x) => progress.push(x) });
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([s.mine2.stealthAddress]);
    // The narrowed-block warning is shown from these; nothing was narrowed.
    expect(res.routerOnlyBlocks).toEqual([]);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((p) => p.routerOnlyBlocks === undefined)).toBe(true);
  });

  it('withholds the page when the primary hid a direct payment while the second RPC was briefly rate-limited (A-R6)', async () => {
    const s = setup();
    // The primary hides the direct (non-router) payment in block 2100.
    const primary = chainWith(2500, [s.mine.log, s.other.log]);
    const base = chainWith(2500, s.logs);
    // Nine -32005 refusals take the second RPC's comparison of [2100, 2500] down to block 2100 alone.
    let burst = 9;
    const secondaryClient = {
      ...base,
      getLogs: (f: LogFilter) => (f.topics.length === 2 && burst-- > 0 ? Promise.reject(new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32005')) : base.getLogs(f)),
    };
    const res = await scan(s, { client: primary, secondaryClient, cursor: { nextBlock: 2100n } });
    // Asked for whole again after its router lane, block 2100 shows what the primary hid: the page is withheld there.
    expect(res.discrepancies.map((d) => d.kind)).toEqual(['missing_in_primary']);
    expect(res.matches).toEqual([]);
    expect(res.cursor.nextBlock).toBe(2100n);
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
    expect(res.secondaryLag).toBeUndefined();
    // Far behind (more than finalityDepth): the scan still advances to its head, and says why it stopped there.
    const far = await scan(s, { client: upTo(30_000), secondaryClient: upTo(29_000), cursor: { nextBlock: 1000n } });
    expect(far.discrepancies).toEqual([]);
    expect(far.cursor.nextBlock).toBe(29_001n);
    expect(far.secondaryLag).toEqual({ secondaryHead: 29_000n, head: 30_000n });
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

  it('does not save the checkpoint past a pending payment when a reorg is reported above the page start', async () => {
    const keys = generateKeySet();
    const small = { ...chain, getLogsMaxRange: 10, finalityDepth: 20 };
    const pay = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block: 585, index: 0, caller: FAKE_ROUTER });
    const base = chainWith(600, [pay.log]);
    let reads = 0;
    // Block 599, the end of the last window read (not the head), changes hash between its boundary read and the re-read,
    // so the rollback point (590) is above the page start (100).
    const client = {
      ...base,
      getBlock: async (n: bigint) => {
        const b = await base.getBlock(n);
        return n === 599n && b !== null && ++reads > 1 ? { ...b, hash: blockHash(5_000_599) as Hex } : b;
      },
    };
    const saved: ScanCursor[] = [];
    const res = await runScan({
      chain: small, manifest, client, cursor: { nextBlock: 100n },
      spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal,
      checkpoints: { load: () => saved.at(-1), save: (_id, _k, c) => { saved.push(c); }, clear: () => undefined },
    });
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([pay.stealthAddress]);
    expect(res.matches[0]?.receipt).toBe('pending');
    expect(saved.length).toBeGreaterThan(0);
    // head 600 + 1 - finalityDepth 20 = 581, below the pending payment at block 585.
    expect(saved.every((c) => c.nextBlock <= 581n)).toBe(true);
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
    // 0b213bd: a router claim whose verification degraded to "claimed" is re-scanned on resume (its transfer may
    // only have been unreadable), but only from the page it was found on, so an old claim cannot pin the checkpoint.
    const dropTransfers = (base: ReturnType<typeof chainWith>) => ({ ...base, request: (method: string, params: readonly unknown[]) => {
      if (method === 'eth_getTransactionReceipt') return base.request(method, params).then((raw) => ({ ...(raw as object), logs: ((raw as { logs: RpcLog[] }).logs).filter((log) => log.topics[0] !== TRANSFER_TOPIC) }));
      return base.request(method, params);
    } });
    it('saves the checkpoint at an unverified router claim found on the last page so a resume re-verifies it', async () => {
      const s = setup();
      const { res, cp } = await run(s, dropTransfers(chainWith(2500, [s.mine.log])));
      expect(res.matches[0]?.receipt).toBe('claimed');
      const saved = cp.get(84532) as { nextBlock: bigint } | undefined;
      expect(saved?.nextBlock).toBe(120n);
    });
    it('does not let an unverified router claim on an earlier page pin later checkpoints', async () => {
      const s = setup();
      const { res, cp } = await run(s, dropTransfers(chainWith(400_000, [s.mine.log])));
      expect(res.matches[0]?.receipt).toBe('claimed');
      const saved = cp.get(84532) as { nextBlock: bigint } | undefined;
      expect(saved?.nextBlock).toBeGreaterThan(120n);
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

  // A5 adversarial matrix: flood starvation, resumable budget cursor, reorg replay, honest counts.
  /** One open-lane spam log (same ephemeral key, wrong view tag) in each of `blocks`. */
  const spamBlocks = (stranger: string, blocks: readonly number[]): RpcLog[] => {
    const one = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: blocks[0] ?? 0, index: 0, caller: OTHER, wrongTag: true }).log;
    return blocks.map((b) => ({ ...one, blockNumber: `0x${b.toString(16)}`, blockHash: blockHash(b), transactionHash: `0x${(BigInt(b) * 4096n + 77n).toString(16).padStart(64, '0')}` }));
  };
  /** A provider whose eth_getLogs on the announcer refuses ranges wider than `maxBlocks` (-32614, a fixed range limit). */
  const rangeLimited = (base: ReturnType<typeof chainWith>, maxBlocks: bigint): ReturnType<typeof chainWith> => ({
    ...base,
    getLogs: (f: LogFilter) => (f.address.toLowerCase() === FAKE_ANNOUNCER.toLowerCase() && f.toBlock - f.fromBlock + 1n > maxBlocks
      ? Promise.reject(new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32614'))
      : base.getLogs(f)),
  });
  const memoryStore = (): CheckpointStore => {
    const m = new Map<string, string>();
    return localCheckpointStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
  };

  /** The seller-key, worker and abort arguments every A5 run shares. */
  const keyArgs = (keys: ReturnType<typeof generateKeySet>, worker: InlineWorker = new InlineWorker()) => ({
    spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
    createWorker: () => worker, signal: new AbortController().signal,
  });
  /**
   * A 120,000-block chain whose block hashes all change once progress passes block 49,999 (`forkPastBlock`, a deep reorg). `logsIn` returns the
   * announcer logs inside a filter range; each is re-stamped with the current (pre- or post-fork) hash of its block.
   */
  const forkingClient = (logsIn: (from: bigint, to: bigint) => RpcLog[]) => {
    let forked = false;
    const hashAt = (n: number): string => (forked ? blockHash(n + 5_000_000) : blockHash(n));
    const client = mockRpc(84532, (method, params) => {
      if (method === 'eth_blockNumber') return `0x${(120_000).toString(16)}`;
      if (method === 'eth_getBlockByNumber') {
        const n = Number(params[0]);
        return { hash: hashAt(n), parentHash: hashAt(n - 1), number: `0x${n.toString(16)}` };
      }
      if (method === 'eth_getLogs') {
        const f = params[0] as { fromBlock: bigint; toBlock: bigint };
        return logsIn(f.fromBlock, f.toBlock).map((l) => ({ ...l, blockHash: hashAt(Number(BigInt(l.blockNumber))) }));
      }
      throw new Error(`unexpected ${method}`);
    });
    return { client, forkPastBlock: (p: { nextBlock: bigint }) => { if (p.nextBlock > 49_999n) forked = true; } };
  };

  it('keeps a flooding caller from starving router and honest direct payments in the same page: nothing dropped, flood ordered last (A5)', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const stranger = encodeMetaAddress(generateKeySet());
    const FLOODER = '0x5555555555555555555555555555555555555555' as Address;
    const flood = Array.from({ length: 40 }, (_, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 500, index: i, caller: FLOODER, wrongTag: true }).log);
    const direct = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 500, index: 60, caller: OTHER });
    const routed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 501, index: 0, caller: FAKE_ROUTER });
    const worker = new InlineWorker();
    // The budget is far below the flood, but the first page of a run is never deferred.
    const res = await runScan({
      chain, manifest, client: chainWith(2500, [...flood, direct.log, routed.log]), cursor: { nextBlock: 0n }, openLaneBudget: 1,
      ...keyArgs(keys, worker),
    });
    expect(res.matches.map((m) => m.stealthAddress).sort()).toEqual([direct.stealthAddress, routed.stealthAddress].sort());
    expect(res.backlog).toBe(0);
    expect(res.scanned).toBe(42);
    const batch = worker.received.find((m) => m.type === 'batch');
    const ids = batch?.type === 'batch' ? batch.logs.map((l) => l.id) : [];
    expect(ids).toHaveLength(42);
    // Trusted lane first, then the clean open lane, then the flood.
    expect(ids[0]?.startsWith(routed.log.blockHash)).toBe(true);
    expect(ids[1]).toBe(`${direct.log.blockHash}:${String(Number(BigInt(direct.log.logIndex)) + 100)}`);
    expect(res.telemetry).toMatchObject({ trusted: 1, open: 41, suspected: 40 });
  });

  it.each([
    ['open-lane budget (backlog)', { openLaneBudget: 1 }],
    ['per-run announcement budget (limitReached)', { maxAnnouncementsPerScan: 100 }],
  ] as const)('resuming from the saved checkpoint always gets past a flood that stops every run at the %s, processing each open-lane log once (A5)', async (_name, budget) => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const stranger = encodeMetaAddress(generateKeySet());
    // Spam in every block of [10, 400]; a provider range limit keeps each page well under finalityDepth (100) blocks wide.
    const spamRange = Array.from({ length: 391 }, (_, i) => 10 + i);
    const direct = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 300, index: 5, caller: OTHER });
    const routed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 350, index: 6, caller: FAKE_ROUTER });
    const client = rangeLimited(chainWith(1000, [...spamBlocks(stranger, spamRange), direct.log, routed.log]), 2n);
    const store = memoryStore();
    const openIds = new Map<string, number>();
    const found = new Set<string>();
    let finished = false;
    let runs = 0;
    for (; runs < 40 && !finished; runs++) {
      // As the Scan view does on "resume": the cursor comes from the checkpoint store, never from the previous result.
      const cursor = store.load(84532, KEY) ?? { nextBlock: 0n };
      const worker = new InlineWorker();
      const res = await runScan({
        chain, manifest, client, cursor, ...budget, checkpoints: store,
      ...keyArgs(keys, worker),
      });
      for (const m of res.matches) found.add(m.stealthAddress);
      for (const msg of worker.received) if (msg.type === 'batch') for (const l of msg.logs) {
        if (l.id !== `${blockHash(350)}:106`) openIds.set(l.id, (openIds.get(l.id) ?? 0) + 1);
      }
      finished = (res.backlog ?? 0) === 0 && !res.limitReached && res.cursor.nextBlock === 1001n;
    }
    expect(finished).toBe(true);
    expect([...found].sort()).toEqual([direct.stealthAddress, routed.stealthAddress].sort());
    // Every spam log and the direct payment reached the worker, none twice: all of them are final, so no finality tail is replayed.
    expect(openIds.size).toBe(392);
    expect([...openIds.values()].every((count) => count === 1)).toBe(true);
    // The finished run keeps the finality tail for pending payments near the head.
    expect(store.load(84532, KEY)?.nextBlock).toBe(901n);
  });

  it('never saves a checkpoint past a pending payment, even when the fetch head says its block is final (A5)', async () => {
    const keys = generateKeySet();
    const near = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block: 2495, index: 0, caller: FAKE_ROUTER });
    const base = chainWith(2500, [near.log]);
    // The log fetch sees head 5000; the payment check right after sees 2500 (a lagging, load-balanced backend).
    let heads = 0;
    const client = { ...base, blockNumber: () => Promise.resolve(heads++ === 0 ? 5000n : 2500n) };
    const store = memoryStore();
    const res = await runScan({
      chain, manifest, client, cursor: { nextBlock: 2000n }, checkpoints: store,
      ...keyArgs(keys),
    });
    expect(res.cursor.nextBlock).toBe(5001n);
    expect(res.matches[0]?.receipt).toBe('pending');
    // Not 4901 (head 5000 minus finalityDepth): the next session must re-scan block 2495 and re-verify it.
    expect(store.load(84532, KEY)?.nextBlock).toBe(2495n);
  });

  it('reports the privacy set against the chain head, marked partial, when the budget stops the run early (A5)', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const routerOld = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 1000, index: 0, caller: FAKE_ROUTER });
    const res = await runScan({
      chain, manifest, client: chainWith(400_000, [routerOld.log, ...spamAt(stranger, 100, 3), ...spamAt(stranger, 60_000, 3)]), cursor: { nextBlock: 0n }, openLaneBudget: 2,
      ...keyArgs(keys),
    });
    expect(res.backlog).toBe(3);
    expect(res.cursor.nextBlock).toBe(50_000n);
    // Block 1000 is ~16 days before the chain head (400,000 at 2 s): it is not "in about the last 7 days", and the
    // real last 7 days were never scanned, so the count is a lower bound.
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 0, count30d: 1, partial: true });
  });

  it('counts a router announcement once in the privacy set when a mid-run reorg replays its block (A5)', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const routed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 100, index: 0, caller: FAKE_ROUTER });
    const { client, forkPastBlock } = forkingClient((from, to) => (from <= 100n && to >= 100n ? [routed.log] : []));
    const res = await runScan({
      chain, manifest, client, cursor: { nextBlock: 0n }, ...keyArgs(keys), onProgress: forkPastBlock,
    });
    expect(res.cursor.nextBlock).toBe(120_001n);
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 1, count30d: 1, partial: false });
  });

  it('ends the privacy window at the latest reachable head when a later page reports a lower head', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const routed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 1000, index: 0, caller: FAKE_ROUTER });
    let head = 400_000n;
    const client = { ...chainWith(400_000, [routed.log]), blockNumber: () => Promise.resolve(head) };
    const res = await runScan({
      chain, manifest, client, cursor: { nextBlock: 0n }, ...keyArgs(keys),
      onProgress: () => { head = 250_000n; },
    });
    expect(res.cursor.nextBlock).toBe(250_001n);
    // Block 1000 is in the seven-day window of the latest head, and this run reached that head.
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 1, count30d: 1, partial: false });
  });

  it('excludes blocks above a lowered secondary head from the privacy window', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const routed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 49_975, index: 0, caller: FAKE_ROUTER });
    const client = chainWith(400_000, [routed.log]);
    let head = 400_000n;
    const secondaryClient = { ...chainWith(400_000, [routed.log]), blockNumber: () => Promise.resolve(head) };
    const res = await runScan({
      chain, manifest, client, secondaryClient, cursor: { nextBlock: 0n }, ...keyArgs(keys),
      onProgress: () => { head = 49_950n; },
    });
    expect(res.cursor.nextBlock).toBe(50_000n);
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 0, count30d: 0, partial: false });
  });

  it('holds the cursor at the rollback and clears the orphaned checkpoint when a reorg page is deferred by the budget (A5)', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const spam = [...spamAt(stranger, 10, 2), ...spamAt(stranger, 60_000, 2)];
    const { client, forkPastBlock } = forkingClient((from, to) =>
      spam.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to));
    const cleared: number[] = [];
    const saved: bigint[] = [];
    const reorgs: bigint[] = [];
    const res = await runScan({
      // The first page is never deferred; its replay after the fork is, because it no longer fits the budget.
      chain, manifest, client, openLaneBudget: 1, cursor: { nextBlock: 0n },
      checkpoints: { load: () => undefined, save: (_c, _k, c) => void saved.push(c.nextBlock), clear: (c) => void cleared.push(c) },
      ...keyArgs(keys),
      onProgress: forkPastBlock,
      onReorg: (to) => { reorgs.push(to); },
    });
    expect(reorgs).toEqual([0n]);
    expect(res.backlog).toBe(2);
    expect(res.cursor).toEqual({ nextBlock: 0n });
    expect(cleared).toEqual([84532]);
  });

  // An unverifiable router claim (e.g. paid through a smart wallet, so no direct router evidence) is replayed once on
  // resume, never forever: a resume that starts at the claim's own block has already retried it and must be able to
  // save past it even when the next page is held back by the open-lane budget or the match limit.
  const noTransfers = (base: ReturnType<typeof chainWith>) => ({ ...base, request: (method: string, params: readonly unknown[]) => {
    if (method === 'eth_getTransactionReceipt') return base.request(method, params).then((raw) => ({ ...(raw as object), logs: ((raw as { logs: RpcLog[] }).logs).filter((log) => log.topics[0] !== TRANSFER_TOPIC) }));
    return base.request(method, params);
  } });
  const resumeRuns = async (runs: number, run: (cursor: { nextBlock: bigint }) => Promise<unknown>, store: CheckpointStore): Promise<bigint[]> => {
    const saved: bigint[] = [];
    let cursor: { nextBlock: bigint } = { nextBlock: 0n };
    for (let i = 0; i < runs; i++) {
      await run(cursor);
      cursor = store.load(84532, KEY) ?? cursor;
      saved.push(cursor.nextBlock);
    }
    return saved;
  };

  it('replays an unverifiable router claim once, then resumes past it when the budget holds the next page (A5 liveness)', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const claim = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block: 100, index: 0, caller: FAKE_ROUTER });
    const client = noTransfers(chainWith(400_000, [claim.log, ...spamAt(stranger, 200, 1), ...spamAt(stranger, 60_000, 3), ...spamAt(stranger, 120_000, 3)]));
    const store = memoryStore();
    const saved = await resumeRuns(3, (cursor) => runScan({ chain, manifest, client, cursor, openLaneBudget: 2, checkpoints: store, ...keyArgs(keys) }), store);
    expect(saved[0]).toBe(100n); // first sighting: the claim's block is kept so the next session re-verifies it
    expect(saved[1]).toBeGreaterThan(100n); // that session retried it at its floor and moves on
    expect(saved[2]).toBeGreaterThan(saved[1] ?? 0n);
  });

  it('replays an unverifiable router claim once, then resumes past it when the match limit stops the run (A5 liveness)', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const OTHER_CALLER = '0x9999999999999999999999999999999999999999' as Address;
    const logs = [
      makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 100, index: 0, caller: FAKE_ROUTER }).log,
      makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 200, index: 1, caller: OTHER_CALLER }).log,
      makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 60_000, index: 2, caller: OTHER_CALLER }).log,
    ];
    const client = noTransfers(chainWith(400_000, logs));
    const store = memoryStore();
    const saved = await resumeRuns(3, (cursor) => runScan({ chain, manifest, client, cursor, maxMatchesPerScan: 2, checkpoints: store, ...keyArgs(keys) }), store);
    expect(saved[0]).toBe(100n);
    expect(saved[1]).toBeGreaterThan(100n);
  });
});

describe('spec 05 D3/D4: same-token transfer estimate and lane options', () => {
  const OTHER = '0x9999999999999999999999999999999999999999' as Address;
  const run = (keys: ReturnType<typeof generateKeySet>, client: ReturnType<typeof chainWith>, extra: Partial<Parameters<typeof runScan>[0]> = {}, worker = new InlineWorker()) => runScan({
    chain, manifest, client, cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
    createWorker: () => worker, signal: new AbortController().signal, ...extra,
  });
  const tokenQueries = (client: ReturnType<typeof chainWith>) => client.calls.filter((c) => {
    const f = c.params[0] as { address?: string; topics?: readonly unknown[] } | undefined;
    return c.method === 'eth_getLogs' && f?.address?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e' && f.topics?.length === 1;
  });

  it('estimates transfers of the paid token at similar amounts only when opted in, from the latest router payment, with no address filter', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const early = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 120, index: 0, caller: FAKE_ROUTER });
    const late = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 2100, index: 1, caller: FAKE_ROUTER });
    const off = chainWith(2500, [early.log, late.log]);
    const plain = await run(keys, off);
    expect(plain.telemetry?.anonymity?.transfers).toBeUndefined();
    expect(tokenQueries(off)).toHaveLength(0);
    const on = chainWith(2500, [early.log, late.log]);
    const res = await run(keys, on, { privacySetTransfers: true });
    expect(res.matches).toHaveLength(2);
    // The router transfer for the late payment (block 2100) is inside the 2000-block window; the early one (120) is not.
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 2, transfers: { status: 'estimate', token: TOKEN_84532, count: 1, windowBlocks: 2000 } });
    const queries = tokenQueries(on);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const f = q.params[0] as { fromBlock: bigint; toBlock: bigint; topics: readonly unknown[] };
      expect(f.fromBlock).toBeGreaterThanOrEqual(501n);
      expect(f.toBlock).toBeLessThanOrEqual(2500n);
    }
  });

  it('fails closed to an unknown estimate on a lookup error or limit and keeps the router count', async () => {
    const keys = generateKeySet();
    const paid = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block: 2100, index: 1, caller: FAKE_ROUTER });
    const base = chainWith(2500, [paid.log]);
    const failing = { ...base, getLogs: (f: LogFilter) => (f.topics.length === 1 ? Promise.reject(new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32005')) : base.getLogs(f)) };
    const res = await run(keys, failing, { privacySetTransfers: true });
    expect(res.matches).toHaveLength(1);
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 1, level: 'low', transfers: { status: 'unknown', reason: 'limit' } });
  });

  it('reports the estimate as unknown when opted in but no token payment of mine was found', async () => {
    const keys = generateKeySet();
    const stranger = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(generateKeySet()), block: 2100, index: 1, caller: FAKE_ROUTER });
    const client = chainWith(2500, [stranger.log]);
    const res = await run(keys, client, { privacySetTransfers: true });
    expect(res.matches).toHaveLength(0);
    expect(res.telemetry?.anonymity).toMatchObject({ count7d: 1, transfers: { status: 'unknown', reason: 'noPayment' } });
    expect(tokenQueries(client)).toHaveLength(0);
  });

  it('passes the flood threshold and the spam-score switch to the lanes', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const FLOODER = '0x5555555555555555555555555555555555555555' as Address;
    const three = Array.from({ length: 3 }, (_, i) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 500, index: i, caller: FLOODER }).log);
    const honest = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: stranger, block: 501, index: 0, caller: OTHER }).log;
    const byDefault = await run(keys, chainWith(2500, [...three, honest]));
    expect(byDefault.telemetry).toMatchObject({ open: 4, suspected: 0 });
    const strict = new InlineWorker();
    const low = await run(keys, chainWith(2500, [...three, honest]), { floodPerBlock: 2 }, strict);
    expect(low.telemetry).toMatchObject({ open: 4, suspected: 3 });
    const strictBatch = strict.received.find((m) => m.type === 'batch');
    expect(strictBatch?.type === 'batch' ? strictBatch.logs[0]?.id.startsWith(honest.blockHash) : false).toBe(true);
    const plain = new InlineWorker();
    const unscored = await run(keys, chainWith(2500, [...three, honest]), { floodPerBlock: 2, spamScoring: false }, plain);
    expect(unscored.telemetry).toMatchObject({ open: 4, suspected: 0 });
    const plainBatch = plain.received.find((m) => m.type === 'batch');
    expect(plainBatch?.type === 'batch' ? plainBatch.logs.map((l) => l.id.split(':')[0]) : []).toEqual([three[0]?.blockHash, three[0]?.blockHash, three[0]?.blockHash, honest.blockHash]);
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
    const invalidated = vi.fn((from: bigint, canonical: (height: bigint) => Promise<Hex>) => vault.invalidateFrom(from, [], canonical));
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

  describe('page-end anchor far below the head (persistable shortcut)', () => {
    // Head 120,000 with one page: page 1 ends at 49,999, far more than finalityDepth below the head, so the
    // checkpoint is the page-end cursor itself rather than a replay-tail anchor.
    const HEAD = 120_000;
    const END = 49_999n;
    const shortcut = (s: ReturnType<typeof setup>, extra: Partial<Params> & Pick<Params, 'client'>) => scan(s, KEY, { maxPages: 1, ...extra });

    it('withholds a page end the primary fabricates on every read', async () => {
      const s = setup(); const cp = memStore(); const primary = chainWith(HEAD, s.logs);
      const res = await shortcut(s, {
        client: { ...primary, getBlock: (n) => (n === END ? fake(n) : primary.getBlock(n)) },
        secondaryClient: chainWith(HEAD, s.logs), checkpoints: cp.store,
      });
      expect(cp.saves).toEqual([]);
      expect(res.discrepancies).toEqual([{ kind: 'block_hash_differs', ref: END.toString() }]);
    });

    it('withholds a page end the primary changes on its re-read after the provider comparison', async () => {
      const s = setup(); const cp = memStore(); const primary = chainWith(HEAD, s.logs); const secondary = chainWith(HEAD, s.logs);
      // Honest for the page fetch and compareProviders (whose last step reads END from the secondary); lies afterwards.
      const compared = () => secondary.calls.some((c) => c.method === 'eth_getBlockByNumber' && c.params[0] === END);
      let lies = 0;
      const res = await shortcut(s, {
        client: { ...primary, getBlock: (n) => (n === END && compared() ? (lies++, fake(n)) : primary.getBlock(n)) },
        secondaryClient: secondary, checkpoints: cp.store,
      });
      expect(cp.saves).toEqual([]);
      expect(lies).toBeGreaterThan(0);
      expect(res.discrepancies).toEqual([{ kind: 'block_hash_differs', ref: END.toString() }]);
    });

    it('saves the corroborated page end when both providers agree', async () => {
      const s = setup(); const cp = memStore();
      const res = await shortcut(s, { client: chainWith(HEAD, s.logs), secondaryClient: chainWith(HEAD, s.logs), checkpoints: cp.store });
      expect(res.discrepancies).toEqual([]);
      expect(cp.saves).toEqual([{ nextBlock: END + 1n, last: { number: END, hash: blockHash(Number(END)) } }]);
    });

    it('saves the page end unchanged with a single provider', async () => {
      const s = setup(); const cp = memStore();
      const res = await shortcut(s, { client: chainWith(HEAD, s.logs), checkpoints: cp.store });
      expect(res.discrepancies).toEqual([]);
      expect(cp.saves).toEqual([{ nextBlock: END + 1n, last: { number: END, hash: blockHash(Number(END)) } }]);
    });
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

  it('after a genuine two-provider reorg invalidates only records whose block both providers replaced (L3-F1, L1-03)', async () => {
    const s = setup();
    const sellerKeyId = checkpointKeyId(hexOf(s.keys.spendingPublicKey), hexOf(s.keys.viewingPublicKey));
    const cp = memStore();
    await scan(s, sellerKeyId, { client: chainWith(2500, [s.mine.log]), secondaryClient: chainWith(2500, [s.mine.log]), checkpoints: cp.store });
    const saved = cp.store.load(chain.chainId, sellerKeyId);
    expect(saved?.last).toEqual({ number: TAIL, hash: blockHash(Number(TAIL)) });
    const forked = () => { const base = chainWith(2600, [s.mine.log]); return { ...base, getBlock: (n: bigint) => (n >= TAIL ? fake(n) : base.getBlock(n)) }; };
    const vault = await vaultWithVerifiedRecord(s, sellerKeyId);
    // A second observation in a block the reorg replaced (old hash at height TAIL + 50).
    const replaced = (await vault.read())[0]!;
    const orphanHash = blockHash(Number(TAIL) + 50);
    const { provenance, ...orphanBase } = { ...replaced, blockNumber: String(TAIL + 50n), blockHash: orphanHash, id: replaced.id.replace(replaced.blockHash, orphanHash) };
    void provenance;
    await vault.save(orphanBase);
    const invalidated = vi.fn((from: bigint, canonical: (height: bigint) => Promise<Hex>) => vault.invalidateFrom(from, [], canonical));
    const res = await scan(s, sellerKeyId, { client: forked(), secondaryClient: forked(), cursor: saved!, checkpoints: cp.store, onReorg: invalidated });
    expect(res.discrepancies).toEqual([]);
    expect(invalidated).toHaveBeenCalledOnce();
    expect(invalidated.mock.calls[0]?.[0]).toBe(0n);
    const after = await vault.read();
    // Block 120 kept its hash on both providers: canonical history is not invalidated.
    expect(after.find((r) => r.blockNumber === '120')?.evidenceStatus).toBe('verified-at-scan');
    expect(after.find((r) => r.id === orphanBase.id)?.evidenceStatus).toBe('invalidated-after-reorg');
    vault.lock();
  });

  it('fails closed, writing nothing, when the two providers disagree about a stored record\'s block during invalidation', async () => {
    const s = setup();
    const sellerKeyId = checkpointKeyId(hexOf(s.keys.spendingPublicKey), hexOf(s.keys.viewingPublicKey));
    const vault = await vaultWithVerifiedRecord(s, sellerKeyId);
    const forked = (lieAt120: boolean) => { const base = chainWith(2600, []); return { ...base, getBlock: (n: bigint) => (n >= TAIL || (lieAt120 && n === 120n) ? fake(n) : base.getBlock(n)) }; };
    const invalidated = vi.fn((from: bigint, canonical: (height: bigint) => Promise<Hex>) => vault.invalidateFrom(from, [], canonical));
    await expect(scan(s, sellerKeyId, { client: forked(false), secondaryClient: forked(true), cursor: { nextBlock: TAIL + 1n, last: { number: TAIL, hash: blockHash(Number(TAIL)) as Hex } }, onReorg: invalidated })).rejects.toThrow(/canonical block hash unavailable/);
    expect(invalidated).toHaveBeenCalledOnce();
    expect((await vault.read())[0]?.evidenceStatus).toBe('verified-at-scan');
    vault.lock();
  });
});
