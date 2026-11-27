/**
 * PRIV-06 scan coverage and checkpoint safety regressions (Phase 7).
 *
 * Every case asserts on exact CheckpointStore calls (save/clear and the cursors saved), not on the final cursor alone:
 * a checkpoint that is saved and later superseded is still a checkpoint a crash could leave behind. Synthetic chain only.
 *
 * Geometry (all cases): `small` chain, 100-block `eth_getLogs` ranges, so one runScan page is 50 requests = 5,000 blocks.
 * Head 12,000 gives pages [0..4999], [5000..9999], [10000..12000]; finalityDepth 10 puts the last saved anchor at 11,990.
 */
import {
  CHAINS, ChainAdapterError, RpcHttpError, createClient, ghostPayRouterAbi, grossForNet,
  type Address, type Hex, type LogFilter, type RpcClient, type RpcLog, type ScanCursor,
} from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, parseMetadata, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { checkpointKeyId, localCheckpointStore as secretKeyedStore, runScan, type CheckpointStore, type ScanMatch, type ScanProgress } from './scanClient';
import type { ToWorker } from './scannerCore';

const base = CHAINS.find((c) => c.chainId === 84532)!;
const small = { ...base, getLogsMaxRange: 100, finalityDepth: 10 };
const manifest = fakeManifest(84532);
const KEY = checkpointKeyId('02aa', '03bb');
const CHAIN_ID = 84532;
const HEAD = 12_000;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const canonicalHash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
/** A different, equally well-formed history for every block: what a node on another fork reports. */
const forkHash = (n: number): string => canonicalHash(n + 5_000_000);

/** Copy of scanClient.test.ts `chainWith` (not exported there), with the block hash function made a parameter. */
function chainWith(head: number, logs: RpcLog[], hashOf: (n: number) => string = canonicalHash): MockRpc {
  logs = logs.map((log) => ({ ...log, logIndex: `0x${(BigInt(log.logIndex) + 100n).toString(16)}` }));
  const payer = '0x2222222222222222222222222222222222222222' as Address;
  const transfers: RpcLog[] = logs.flatMap((log) => {
    const sender = log.topics[3];
    const recipient = log.topics[2];
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
  return mockRpc(CHAIN_ID, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: hashOf(n), parentHash: hashOf(n - 1), number: `0x${n.toString(16)}` };
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

interface Hooks {
  getLogs?(f: LogFilter): void | Promise<void>;
  getBlock?(n: bigint): void | Promise<void>;
  blockNumber?(): void | Promise<void>;
  request?(method: string, params: readonly unknown[]): void | Promise<void>;
}

/** A client that runs a hook before every call (the hook may throw, await a gate or abort a signal). Calls it lets through are in `calls`. */
function hooked(inner: MockRpc, h: Hooks): MockRpc {
  return {
    ...inner,
    getLogs: async (f) => { await h.getLogs?.(f); return inner.getLogs(f); },
    getBlock: async (n) => { await h.getBlock?.(n); return inner.getBlock(n); },
    blockNumber: async () => { await h.blockNumber?.(); return inner.blockNumber(); },
    request: async (m, p) => { await h.request?.(m, p); return inner.request(m, p); },
  };
}

/** Announcer log windows the client actually served, in request order (router-lane and token queries excluded). */
function windowsOf(client: MockRpc): { from: bigint; to: bigint }[] {
  return client.calls.flatMap((c) => {
    const f = c.params[0] as { address?: string; topics?: readonly (string | null)[]; fromBlock: bigint; toBlock: bigint } | undefined;
    if (c.method !== 'eth_getLogs' || f?.address?.toLowerCase() !== FAKE_ANNOUNCER.toLowerCase() || f.topics?.[3] != null) return [];
    return [{ from: f.fromBlock, to: f.toBlock }];
  });
}

/** CheckpointStore with real in-memory behaviour and exact call spies. */
function spyStore(initial?: ScanCursor) {
  let current = initial;
  const history: ScanCursor[] = [];
  const save = vi.fn<CheckpointStore['save']>((_chainId, _keyId, cursor) => { current = cursor; history.push(cursor); });
  const clear = vi.fn(() => { current = undefined; });
  const load = vi.fn<CheckpointStore['load']>(() => current);
  const store: CheckpointStore = { load, save, clear };
  return { store, save, clear, load, history, get current() { return current; } };
}

const cursorAt = (next: number, lastHash: (n: number) => string = canonicalHash): ScanCursor => ({ nextBlock: BigInt(next), last: { number: BigInt(next - 1), hash: lastHash(next - 1) as Hex } });
const P1 = cursorAt(5000);
const P2 = cursorAt(10_000);
/** Final page: nextBlock 12,001 less finalityDepth 10: the unfinalised tail is rescanned on resume. */
const P3 = cursorAt(11_991, canonicalHash);

function fixture() {
  const keys = generateKeySet();
  const meta = encodeMetaAddress(keys);
  const mine = (block: number, caller: Address = FAKE_ROUTER) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block, index: 0, caller });
  const blocks = [100, 4999, 5000, 7500, 9999, 10_000, 11_000];
  const made = blocks.map((b) => mine(b));
  const logs = made.map((m) => m.log);
  /** Ground truth: ids the scanner must report, as fetchAnnouncements derives them (blockHash:logIndex, chainWith shifts index by 100). */
  const truth = logs.map((l) => `${l.blockHash}:${Number(BigInt(l.logIndex)) + 100}`);
  return { keys, meta, mine, made, logs, truth };
}
type Fixture = ReturnType<typeof fixture>;
type Params = Parameters<typeof runScan>[0];

class SpyWorker extends InlineWorker {
  public batchCount = 0;
  public constructor(private readonly onPost?: (m: ToWorker, batch: number) => void) { super(); }
  public override postMessage(m: ToWorker): void {
    if (m.type === 'batch') { this.batchCount++; this.onPost?.(m, this.batchCount); }
    super.postMessage(m);
  }
  public batchIds(): string[] {
    return this.received.flatMap((m) => (m.type === 'batch' ? m.logs.map((l) => l.id) : []));
  }
}

interface Outcome {
  readonly result?: Awaited<ReturnType<typeof runScan>>;
  readonly error?: unknown;
  readonly progress: ScanProgress[];
  readonly matches: ScanMatch[];
  readonly worker: SpyWorker;
  readonly discrepancyCalls: string[][];
  readonly viewingKey: Uint8Array;
}

function params(f: Fixture, o: Partial<Params> & { readonly client: RpcClient }, worker: SpyWorker = new SpyWorker()): { p: Params; worker: SpyWorker; progress: ScanProgress[]; matches: ScanMatch[]; discrepancyCalls: string[][]; viewingKey: Uint8Array } {
  const progress: ScanProgress[] = [];
  const matches: ScanMatch[] = [];
  const discrepancyCalls: string[][] = [];
  const viewingKey = unsafeRevealSecret(f.keys.viewingSecret).slice();
  const p: Params = {
    chain: small, manifest, cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(f.keys.spendingPublicKey), keyId: KEY, viewingKey,
    createWorker: () => worker, signal: new AbortController().signal,
    onProgress: (x) => { progress.push(x); },
    onMatch: (m) => { matches.push(m); },
    onDiscrepancy: (d) => { discrepancyCalls.push(d.map((x) => x.kind)); },
    ...o,
  };
  return { p, worker, progress, matches, discrepancyCalls, viewingKey };
}

/** Runs a scan and never throws: the failure, if any, is in `error`. */
async function attempt(f: Fixture, o: Partial<Params> & { readonly client: RpcClient }, worker?: SpyWorker): Promise<Outcome> {
  const r = params(f, o, worker);
  try {
    const result = await runScan(r.p);
    return { result, progress: r.progress, matches: r.matches, worker: r.worker, discrepancyCalls: r.discrepancyCalls, viewingKey: r.viewingKey };
  } catch (error) {
    return { error, progress: r.progress, matches: r.matches, worker: r.worker, discrepancyCalls: r.discrepancyCalls, viewingKey: r.viewingKey };
  }
}

const savedCalls = (s: ReturnType<typeof spyStore>): unknown[] => s.save.mock.calls.map((c) => c[2]);
const idsOf = (ms: readonly ScanMatch[]): string[] => ms.map((m) => m.announcement.id);

/** The honesty rule for ScanProgress.caughtUp: only a run that reached the head with nothing held back may say so. */
function expectHonestCaughtUp(progress: readonly ScanProgress[], head: number): void {
  for (const p of progress) {
    if (!p.caughtUp) continue;
    expect(p.nextBlock).toBe(BigInt(head) + 1n);
    expect(p.limitReached).toBeUndefined();
    expect(p.backlog).toBeUndefined();
    expect(p.discrepancies ?? 0).toBe(0);
  }
}

/**
 * A real createClient over a fake transport that answers from `inner`. `fault` may replace the raw response text of a call
 * (to model a truncated body, an oversized body or a malformed result) or throw (a transport failure).
 */
async function wire(inner: MockRpc, fault?: (c: { id: number; method: string; from?: bigint; to?: bigint; routerLane: boolean; attempt: number }) => string | undefined): Promise<RpcClient> {
  const attempts = new Map<string, number>();
  return createClient(base, 'https://rpc.test', {
    retries: 2, sleep: () => Promise.resolve(), baseDelayMs: 0, maxResponseBytes: 65_536, chainRecheckMs: 0,
    transport: { send: async (_url, body) => {
      const req = JSON.parse(body) as { id: number; method: string; params: unknown[] };
      let params = req.params;
      let from: bigint | undefined;
      let to: bigint | undefined;
      let routerLane = false;
      if (req.method === 'eth_getBlockByNumber') params = [BigInt(req.params[0] as string)];
      if (req.method === 'eth_getLogs') {
        const f = req.params[0] as { address: string; topics: (string | null)[]; fromBlock: string; toBlock: string };
        from = BigInt(f.fromBlock); to = BigInt(f.toBlock);
        routerLane = f.topics[3] != null;
        params = [{ ...f, fromBlock: from, toBlock: to }];
      }
      const key = `${req.method}:${String(from)}:${String(to)}:${String(routerLane)}`;
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      const forced = fault?.({ id: req.id, method: req.method, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }), routerLane, attempt: n });
      if (forced !== undefined) return forced;
      const result = req.method === 'eth_chainId' ? '0x14a34' : await inner.request(req.method, params);
      return JSON.stringify({ jsonrpc: '2.0', id: req.id, result });
    } },
  });
}

describe('PRIV-06: failed RPC requests never advance the checkpoint past the failed page', () => {
  it.each([5000n, 7500n, 9900n])('a request failing at %s in page 2 leaves page 1 as the only saved checkpoint', async (failFrom) => {
    const f = fixture();
    const inner = chainWith(HEAD, f.logs);
    const store = spyStore();
    const out = await attempt(f, { client: hooked(inner, { getLogs: (q) => { if (q.fromBlock >= failFrom) throw new ChainAdapterError('RPC_FAILURE', 'provider down'); } }), checkpoints: store.store });
    expect(String(out.error)).toMatch(/provider down/);
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.save.mock.calls[0]?.slice(0, 2)).toEqual([CHAIN_ID, KEY]);
    expect(store.clear).not.toHaveBeenCalled();
    expect(store.current).toEqual(P1);
    expect(out.progress.map((p) => p.caughtUp)).toEqual([false]);
    // The run's own failure also tore the worker down and wiped the key.
    expect(out.worker.terminated).toBe(true);
    expect(out.viewingKey.every((b) => b === 0)).toBe(true);
  });

  it('a failure inside page 1 saves nothing and clears nothing', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: hooked(chainWith(HEAD, f.logs), { getLogs: (q) => { if (q.fromBlock >= 3000n) throw new Error('socket reset'); } }), checkpoints: store.store });
    expect(String(out.error)).toMatch(/socket reset/);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.progress).toEqual([]);
  });

  it('a missing boundary block (provider cannot return the page-2 end block) fails the page without saving it', async () => {
    const f = fixture();
    const store = spyStore();
    const inner = chainWith(HEAD, f.logs);
    const client: MockRpc = { ...inner, getBlock: (n) => (n === 9999n ? Promise.resolve(null) : inner.getBlock(n)) };
    const out = await attempt(f, { client, checkpoints: store.store });
    expect(String(out.error)).toMatch(/window boundary block unavailable/);
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('a failure while loading the second page of a two-provider scan does not save past the failed page', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, {
      client: hooked(chainWith(HEAD, f.logs), { getLogs: (q) => { if (q.fromBlock >= 5000n) throw new Error('primary 502'); } }),
      secondaryClient: chainWith(HEAD, f.logs), checkpoints: store.store,
    });
    expect(String(out.error)).toMatch(/primary 502/);
    expect(savedCalls(store)).toEqual([P1]);
  });
});

describe('PRIV-06: truncated or oversized provider responses do not advance the checkpoint', () => {
  const fromPage2 = (c: { from?: bigint }): boolean => c.from !== undefined && c.from >= 5000n;

  it('a body over the response cap (RESPONSE_TOO_LARGE) at every size down to one block and its router lane stops at the last completed range', async () => {
    const f = fixture();
    const inner = chainWith(HEAD, f.logs);
    const client = await wire(inner, (c) => (c.method === 'eth_getLogs' && c.from !== undefined && c.from >= 7000n ? 'x'.repeat(70_000) : undefined));
    const store = spyStore();
    const out = await attempt(f, { client, checkpoints: store.store });
    // Page 2 completed 5000..6999 and then hit blocks no response size can fetch: the cursor stops there, never at 10,000.
    expect(String(out.error)).toMatch(/RESPONSE_TOO_LARGE/);
    expect(savedCalls(store)).toEqual([P1, cursorAt(7000)]);
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([[5000n, false], [7000n, false]]);
    // Not one saved cursor covers the refused block 7,000 or anything above it.
    expect(store.history.every((h) => h.nextBlock <= 7000n)).toBe(true);
    // The unreachable payment at 7,500 was never reported: nothing past the refused block was accepted.
    expect(idsOf(out.matches)).toEqual([f.truth[0], f.truth[1], f.truth[2]]);
  });

  it('a result that is not an array (RPC_FAILURE) in page 2 saves only page 1', async () => {
    const f = fixture();
    const client = await wire(chainWith(HEAD, f.logs), (c) => (c.method === 'eth_getLogs' && fromPage2(c) ? JSON.stringify({ jsonrpc: '2.0', id: c.id, result: { logs: [] } }) : undefined));
    const store = spyStore();
    const out = await attempt(f, { client, checkpoints: store.store });
    expect(String(out.error)).toMatch(/logs not an array/);
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('a JSON body cut off mid-stream (RPC_FAILURE, retried then given up) saves only page 1', async () => {
    const f = fixture();
    const client = await wire(chainWith(HEAD, f.logs), (c) => (c.method === 'eth_getLogs' && fromPage2(c) ? '{"jsonrpc":"2.0","id":' + String(c.id) + ',"result":[{"address":' : undefined));
    const store = spyStore();
    const out = await attempt(f, { client, checkpoints: store.store });
    expect(out.error).toBeInstanceOf(ChainAdapterError);
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('a provider that answers with a log from outside the requested range is rejected, not saved', async () => {
    const f = fixture();
    const inner = chainWith(HEAD, f.logs);
    const stray = f.mine(11_000).log;
    const client: MockRpc = { ...inner, getLogs: async (q) => { const logs = await inner.getLogs(q); return q.fromBlock >= 5000n && q.fromBlock < 5100n ? [...logs, stray] : logs; } };
    const store = spyStore();
    const out = await attempt(f, { client, checkpoints: store.store });
    expect(String(out.error)).toMatch(/INVALID_LOG|outside the requested range/);
    expect(savedCalls(store)).toEqual([P1]);
  });
});

describe('PRIV-06: caughtUp is only true for a scan that reached the head with nothing held back', () => {
  it('a clean scan reports caughtUp exactly once, on the page that ends at head + 1', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store.store });
    expect(out.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([[5000n, false], [10_000n, false], [12_001n, true]]);
    expectHonestCaughtUp(out.progress, HEAD);
    expect(out.result?.cursor.nextBlock).toBe(12_001n);
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
    expect(savedCalls(store)).toEqual([P1, P2, P3]);
  });

  it('maxPages stops a run early without ever saying caughtUp', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store.store, maxPages: 1 });
    expect(out.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([[5000n, false]]);
    expect(savedCalls(store)).toEqual([P1]);
  });

  it('the per-run announcement limit says limitReached, never caughtUp, and saves nothing for the unprocessed page', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store.store, maxAnnouncementsPerScan: 1 });
    expect(out.result?.limitReached).toBe(true);
    expect(out.progress).toEqual([{ nextBlock: 0n, scanned: 0, matches: 0, skipped: 0, caughtUp: false, discrepancies: 0, limitReached: true }]);
    expect(out.result?.cursor).toEqual({ nextBlock: 0n });
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('the per-run match limit says limitReached, never caughtUp, and saves nothing for the unprocessed page', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store.store, maxMatchesPerScan: 1 });
    expect(out.result?.limitReached).toBe(true);
    expect(out.progress.every((p) => !p.caughtUp)).toBe(true);
    expect(out.result?.cursor).toEqual({ nextBlock: 0n });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('a deferred open-lane page reports backlog and holds the cursor at the page start', async () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const direct = '0x9999999999999999999999999999999999999999' as Address;
    const logs = [100, 200, 6000].map((b) => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: b, index: 0, caller: direct }).log);
    const f = { ...fixture(), keys, meta, logs };
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, logs), checkpoints: store.store, openLaneBudget: 1 });
    expect(out.progress.map((p) => [p.nextBlock, p.caughtUp, p.backlog])).toEqual([[5000n, false, undefined], [5000n, false, 1]]);
    expect(out.result?.backlog).toBe(1);
    expect(out.result?.cursor).toEqual(P1);
    expect(savedCalls(store)).toEqual([P1]);
  });

  it('a provider disagreement never reports caughtUp and carries the discrepancy count', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), secondaryClient: chainWith(HEAD, f.logs.filter((_l, i) => i !== 3)), checkpoints: store.store });
    expect(out.progress.map((p) => p.caughtUp)).toEqual([false, false]);
    expect(out.progress.at(-1)?.discrepancies).toBe(out.result?.discrepancies.length);
    expect(out.progress.at(-1)?.discrepancies).toBeGreaterThan(0);
    expectHonestCaughtUp(out.progress, HEAD);
  });

  it('a second provider that cannot report its head fails closed: no pages, no checkpoint, caughtUp false', async () => {
    const f = fixture();
    const store = spyStore();
    const secondary = hooked(chainWith(HEAD, f.logs), { blockNumber: () => { throw new Error('down'); } });
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), secondaryClient: secondary, checkpoints: store.store });
    expect(out.result?.discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    expect(out.progress).toEqual([{ nextBlock: 0n, scanned: 0, matches: 0, skipped: 0, caughtUp: false, discrepancies: 1 }]);
    expect(out.discrepancyCalls).toEqual([['secondary_error']]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it.each([HEAD - 1, HEAD - small.finalityDepth, 11_000])('a second provider at block %i stops the scan without claiming the primary head was reached', async (secondaryHead) => {
    const f = fixture();
    const store = spyStore();
    const primary = chainWith(HEAD, f.logs);
    const secondaryInner = chainWith(secondaryHead, f.logs);
    const secondary: MockRpc = { ...secondaryInner, getBlock: (n) => (n > BigInt(secondaryHead) ? Promise.resolve(null) : secondaryInner.getBlock(n)) };
    // Four pages bound this fixture even if the terminal break is accidentally changed to depend on caughtUp.
    const out = await attempt(f, { client: primary, secondaryClient: secondary, checkpoints: store.store, maxPages: 4 });
    expect(out.error).toBeUndefined();
    expect(out.result?.discrepancies).toEqual([]);
    expect(out.result?.cursor.nextBlock).toBe(BigInt(secondaryHead) + 1n);
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
    expect(idsOf(out.matches)).toEqual(f.truth);
    expect(out.result?.secondaryLag).toEqual(HEAD - secondaryHead > small.finalityDepth
      ? { secondaryHead: BigInt(secondaryHead), head: BigInt(HEAD) } : undefined);
    // Preserve the lower fetch boundary and finality replay tail even though the completion label is now false.
    const windows = windowsOf(primary);
    expect(Math.max(...windows.map((w) => Number(w.to)))).toBe(secondaryHead);
    expect(windows).toEqual(Array.from({ length: Math.ceil((secondaryHead + 1) / 100) }, (_, i) => ({
      from: BigInt(i * 100), to: BigInt(Math.min(i * 100 + 99, secondaryHead)),
    })));
    const tail = cursorAt(secondaryHead + 1 - small.finalityDepth);
    expect(store.history.at(-1)).toEqual(tail);
    expect(savedCalls(store)).toEqual([P1, P2, tail]);
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([
      [5000n, false], [10_000n, false], [BigInt(secondaryHead) + 1n, false],
    ]);
    expectHonestCaughtUp(out.progress, HEAD);
  });

  it.each([HEAD, HEAD + 1])('reports caughtUp at the primary head when the second provider is at block %i', async (secondaryHead) => {
    const f = fixture();
    const store = spyStore();
    const primary = chainWith(HEAD, f.logs);
    const out = await attempt(f, {
      client: primary, secondaryClient: chainWith(secondaryHead, f.logs), checkpoints: store.store, maxPages: 4,
    });
    expect(out.error).toBeUndefined();
    expect(out.result?.discrepancies).toEqual([]);
    expect(out.result?.secondaryLag).toBeUndefined();
    expect(out.result?.cursor).toEqual(cursorAt(HEAD + 1));
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
    expect(out.result?.matches.every((match) => match.receipt === 'verified')).toBe(true);
    expect(savedCalls(store)).toEqual([P1, P2, P3]);
    expect(store.clear).not.toHaveBeenCalled();
    expect(windowsOf(primary)).toHaveLength(121);
    expect(windowsOf(primary).at(-1)?.to).toBe(BigInt(HEAD));
    expect(out.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([[5000n, false], [10_000n, false], [12_001n, true]]);
    expectHonestCaughtUp(out.progress, HEAD);
  });

  it('resumes a lagged scan from its replay tail, verifies retained evidence and discovers the remaining payment', async () => {
    const f = fixture();
    const later = f.mine(11_500);
    const laterId = `${later.log.blockHash}:${Number(BigInt(later.log.logIndex)) + 100}`;
    const full = { ...f, logs: [...f.logs, later.log], truth: [...f.truth, laterId] };
    const store = spyStore();
    const primary = chainWith(HEAD, full.logs);
    const secondaryInner = chainWith(11_000, full.logs);
    const secondary: MockRpc = { ...secondaryInner, getBlock: (n) => (n > 11_000n ? Promise.resolve(null) : secondaryInner.getBlock(n)) };
    const first = await attempt(full, { client: primary, secondaryClient: secondary, checkpoints: store.store, maxPages: 4 });
    expect(first.error).toBeUndefined();
    expect(first.result?.discrepancies).toEqual([]);
    expect(first.result?.secondaryLag).toEqual({ secondaryHead: 11_000n, head: BigInt(HEAD) });
    expect(first.result?.cursor).toEqual(cursorAt(11_001));
    expect(idsOf(first.result?.matches ?? [])).toEqual(f.truth);
    // The providers disagree about this tip payment's finality; retain its claim until both can verify it.
    expect(first.result?.matches.at(-1)?.receipt).toBe('claimed');
    expect(windowsOf(primary)).toHaveLength(111);
    expect(windowsOf(primary).at(-1)?.to).toBe(11_000n);
    const resumeAt = store.load(CHAIN_ID, KEY)!;
    expect(resumeAt).toEqual(cursorAt(10_991));
    expect(savedCalls(store)).toEqual([P1, P2, resumeAt]);

    const recoveredPrimary = chainWith(HEAD, full.logs);
    const second = await attempt(full, {
      client: recoveredPrimary, secondaryClient: chainWith(HEAD, full.logs), cursor: resumeAt,
      checkpoints: store.store, maxPages: 2,
    });
    expect(second.error).toBeUndefined();
    expect(second.result?.discrepancies).toEqual([]);
    expect(second.result?.secondaryLag).toBeUndefined();
    expect(second.result?.cursor).toEqual(cursorAt(HEAD + 1));
    expect(idsOf(second.result?.matches ?? [])).toEqual([f.truth.at(-1), laterId]);
    expect(second.result?.matches.every((match) => match.receipt === 'verified')).toBe(true);
    expect(windowsOf(recoveredPrimary)).toEqual(Array.from({ length: 11 }, (_, i) => ({
      from: 10_991n + BigInt(i * 100), to: BigInt(Math.min(10_991 + i * 100 + 99, HEAD)),
    })));
    expect(savedCalls(store)).toEqual([P1, P2, resumeAt, P3]);
    expect(store.clear).not.toHaveBeenCalled();
    const recovered = new Map(first.matches.map((match) => [match.announcement.id, match] as const));
    for (const match of second.matches) recovered.set(match.announcement.id, match);
    expect(idsOf([...recovered.values()])).toEqual(full.truth);
    expect([...recovered.values()].every((match) => match.receipt === 'verified')).toBe(true);
    expect(second.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([[12_001n, true]]);
    expectHonestCaughtUp(second.progress, HEAD);
    expect(first.progress.map((p) => [p.nextBlock, p.caughtUp])).toEqual([[5000n, false], [10_000n, false], [11_001n, false]]);
  });
});

describe('PRIV-06: reorg under a saved checkpoint', () => {
  const stale: ScanCursor = { nextBlock: 8001n, last: { number: 8000n, hash: canonicalHash(8000) as Hex } };

  it('quarantines, then awaits onReorg, and only then accepts replacement matches and saves the replacement checkpoint', async () => {
    const f = fixture();
    // Replacement history: the same payment now sits in a block of the forked chain.
    const replacement = f.mine(100);
    const forkedLog: RpcLog = { ...replacement.log, blockHash: forkHash(100) };
    const store = spyStore(stale);
    const events: string[] = [];
    store.save.mockImplementation((_c: number, _k: string, cursor: ScanCursor) => { events.push(`save:${cursor.nextBlock}`); store.history.push(cursor); });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hashesAsked: bigint[] = [];
    const worker = new SpyWorker();
    const task = attempt(f, {
      client: chainWith(HEAD, [forkedLog], forkHash), cursor: stale, checkpoints: store.store,
      onQuarantine: (to) => { events.push(`quarantine:${to}`); },
      onReorg: async (to, canonical) => {
        events.push(`reorg:${to}`);
        await gate;
        hashesAsked.push(100n);
        events.push(`canonical100:${await canonical(100n)}`);
      },
      onMatch: (m) => { events.push(`match:${m.announcement.blockNumber}`); },
    }, worker);
    await vi.waitFor(() => expect(events).toEqual(['quarantine:0', 'reorg:0']));
    // While invalidation is pending nothing from the replacement chain was processed, matched or saved.
    expect(worker.batchCount).toBe(0);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    release();
    const out = await task;
    expect(out.error).toBeUndefined();
    expect(events.slice(0, 3)).toEqual(['quarantine:0', 'reorg:0', `canonical100:${forkHash(100)}`]);
    expect(events.slice(3)).toEqual(['match:100', 'save:5000', 'save:10000', 'save:11991']);
    expect(hashesAsked).toEqual([100n]);
    // Every saved checkpoint belongs to the replacement chain: none keeps the orphaned block 8,000 hash.
    expect(savedCalls(store)).toEqual([cursorAt(5000, forkHash), cursorAt(10_000, forkHash), cursorAt(11_991, forkHash)]);
    expect(store.history.some((c) => c.last?.hash === stale.last?.hash)).toBe(false);
    expect(store.clear).not.toHaveBeenCalled();
    expect(idsOf(out.result?.matches ?? [])).toEqual([`${forkHash(100)}:100`]);
  });

  it('a failing durable invalidation stops the run: no matches, no saves, no clear', async () => {
    const f = fixture();
    const store = spyStore(stale);
    const out = await attempt(f, {
      client: chainWith(HEAD, [], forkHash), cursor: stale, checkpoints: store.store,
      onReorg: () => Promise.reject(new Error('vault locked')),
    });
    expect(String(out.error)).toMatch(/vault locked/);
    expect(out.worker.batchCount).toBe(0);
    expect(out.matches).toEqual([]);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    // The stale checkpoint is untouched, so the next run sees the same reorg and retries the invalidation.
    expect(store.current).toEqual(stale);
  });

  it('a rollback that is held by the announcement budget clears the orphaned checkpoint exactly once and saves nothing', async () => {
    const f = fixture();
    const forkedLogs = [f.mine(100).log, f.mine(4999).log].map((l) => ({ ...l, blockHash: forkHash(Number(BigInt(l.blockNumber))) }));
    const store = spyStore(stale);
    const order: string[] = [];
    store.clear.mockImplementation(() => { order.push('clear'); });
    const out = await attempt(f, {
      client: chainWith(HEAD, forkedLogs, forkHash), cursor: stale, checkpoints: store.store, maxAnnouncementsPerScan: 1,
      onQuarantine: () => { order.push('quarantine'); },
      onReorg: () => { order.push('reorg'); },
    });
    expect(order).toEqual(['quarantine', 'reorg', 'clear']);
    expect(store.clear).toHaveBeenCalledExactlyOnceWith(CHAIN_ID, KEY);
    expect(store.save).not.toHaveBeenCalled();
    expect(out.result?.limitReached).toBe(true);
    expect(out.result?.cursor).toEqual({ nextBlock: 0n });
    expect(out.progress).toEqual([{ nextBlock: 0n, scanned: 0, matches: 0, skipped: 0, caughtUp: false, discrepancies: 0, limitReached: true }]);
  });

  it('a fork the second provider does not confirm quarantines but never invalidates, saves or clears', async () => {
    const f = fixture();
    const store = spyStore(stale);
    const quarantined = vi.fn();
    const reorged = vi.fn();
    const out = await attempt(f, {
      client: chainWith(HEAD, [], forkHash), secondaryClient: chainWith(HEAD, []), cursor: stale, checkpoints: store.store,
      onQuarantine: quarantined, onReorg: reorged,
    });
    expect(quarantined).toHaveBeenCalledExactlyOnceWith(0n);
    expect(reorged).not.toHaveBeenCalled();
    expect(out.result?.discrepancies.length).toBeGreaterThan(0);
    expect(out.discrepancyCalls.length).toBe(1);
    expect(out.progress.at(-1)).toMatchObject({ nextBlock: 8001n, caughtUp: false });
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(store.current).toEqual(stale);
  });

  it('a reorg confirmed by both providers invalidates before any replacement result and then saves', async () => {
    const f = fixture();
    const store = spyStore(stale);
    const order: string[] = [];
    store.save.mockImplementation((_c: number, _k: string, cursor: ScanCursor) => { order.push(`save:${cursor.nextBlock}`); store.history.push(cursor); });
    const out = await attempt(f, {
      client: chainWith(HEAD, [], forkHash), secondaryClient: chainWith(HEAD, [], forkHash), cursor: stale, checkpoints: store.store,
      onQuarantine: () => { order.push('quarantine'); },
      onReorg: () => { order.push('reorg'); },
    });
    expect(out.result?.discrepancies).toEqual([]);
    expect(order).toEqual(['quarantine', 'reorg', 'save:5000', 'save:10000', 'save:11991']);
    expect(store.clear).not.toHaveBeenCalled();
    expect(store.history.every((c) => c.last?.hash === forkHash(Number(c.last?.number)))).toBe(true);
  });
});

describe('PRIV-06: cancellation persists nothing beyond verified pages', () => {
  const cases: readonly [string, (ctl: AbortController, f: Fixture) => { hooks?: Hooks; worker?: () => SpyWorker; onMatch?: (m: ScanMatch) => void }][] = [
    ['during the first request of page 2', (ctl) => ({ hooks: { getLogs: (q) => { if (q.fromBlock === 5000n) ctl.abort(); } } })],
    ['in the middle of page 2', (ctl) => ({ hooks: { getLogs: (q) => { if (q.fromBlock === 7500n) ctl.abort(); } } })],
    ['while the worker holds page 2', (ctl) => ({ worker: () => new SpyWorker((_m, n) => { if (n === 2) ctl.abort(); }) })],
    ['on the first match of page 2', (ctl) => ({ onMatch: (m) => { if (m.announcement.blockNumber >= 5000n) ctl.abort(); } })],
  ];
  it.each(cases)('cancelled %s: only the verified page 1 is saved', async (_name, make) => {
    const f = fixture();
    const ctl = new AbortController();
    const spec = make(ctl, f);
    const store = spyStore();
    const out = await attempt(f, {
      client: hooked(chainWith(HEAD, f.logs), spec.hooks ?? {}), checkpoints: store.store, signal: ctl.signal,
      ...(spec.onMatch === undefined ? {} : { onMatch: spec.onMatch }),
    }, spec.worker?.());
    expect(ctl.signal.aborted).toBe(true);
    expect(out.error).toBeUndefined();
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.progress.every((p) => !p.caughtUp)).toBe(true);
    expect(out.worker.terminated).toBe(true);
    expect(out.viewingKey.every((b) => b === 0)).toBe(true);
  });

  it('cancelled by the first RPC call that follows the page-2 worker batch (verification or anchor read): still only page 1', async () => {
    const f = fixture();
    const ctl = new AbortController();
    let posted = false;
    const abortOnce = (): void => { if (posted && !ctl.signal.aborted) ctl.abort(); };
    const store = spyStore();
    await attempt(f, {
      client: hooked(chainWith(HEAD, f.logs), { getLogs: abortOnce, getBlock: abortOnce, blockNumber: abortOnce, request: abortOnce }),
      checkpoints: store.store, signal: ctl.signal,
    }, new SpyWorker((_m, n) => { if (n === 2) posted = true; }));
    expect(ctl.signal.aborted).toBe(true);
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('cancelled during page 1 saves nothing at all', async () => {
    const f = fixture();
    const ctl = new AbortController();
    const store = spyStore();
    const out = await attempt(f, { client: hooked(chainWith(HEAD, f.logs), { getLogs: (q) => { if (q.fromBlock === 2000n) ctl.abort(); } }), checkpoints: store.store, signal: ctl.signal });
    expect(out.error).toBeUndefined();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.result?.cursor).toEqual({ nextBlock: 0n });
  });

  it('cancelled while a second-provider anchor check is pending: the page is not saved', async () => {
    const f = fixture();
    const ctl = new AbortController();
    const store = spyStore();
    const inner = chainWith(HEAD, f.logs);
    // Abort when the second provider is asked for the page-2 end block (the comparison / anchor corroboration).
    const secondary = hooked(chainWith(HEAD, f.logs), { getBlock: (n) => { if (n === 9999n) ctl.abort(); } });
    await attempt(f, { client: inner, secondaryClient: secondary, checkpoints: store.store, signal: ctl.signal });
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
  });
});

describe('PRIV-06: provider disagreement is surfaced and the page checkpoint is withheld', () => {
  it('a log the second provider does not have: onDiscrepancy fires, nothing is saved, the scan stops on that page', async () => {
    const f = fixture();
    const store = spyStore();
    const primary = chainWith(HEAD, f.logs);
    const out = await attempt(f, { client: primary, secondaryClient: chainWith(HEAD, f.logs.filter((_l, i) => i !== 1)), checkpoints: store.store });
    expect(out.discrepancyCalls.length).toBe(1);
    expect(out.discrepancyCalls[0]?.length).toBeGreaterThan(0);
    expect(out.discrepancyCalls[0]?.every((k) => k === 'missing_in_secondary')).toBe(true);
    expect(out.result?.discrepancies.map((d) => d.kind)).toEqual(out.discrepancyCalls.flat());
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.result?.cursor).toEqual({ nextBlock: 0n });
    expect(out.matches).toEqual([]);
    expect(out.result?.matches).toEqual([]);
    // No later page was fetched, so a later agreeing page cannot checkpoint past the gap.
    expect(Math.max(...windowsOf(primary).map((w) => Number(w.to)))).toBe(4999);
  });

  it('a disagreement on page 2 keeps page 1 as the last checkpoint and does not expose the page-2 matches', async () => {
    const f = fixture();
    const store = spyStore();
    const primary = chainWith(HEAD, f.logs);
    const out = await attempt(f, { client: primary, secondaryClient: chainWith(HEAD, f.logs.filter((_l, i) => i !== 3)), checkpoints: store.store });
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.result?.cursor).toEqual(P1);
    expect(idsOf(out.matches)).toEqual([f.truth[0], f.truth[1]]);
    expect(out.discrepancyCalls.length).toBe(1);
    expect(Math.max(...windowsOf(primary).map((w) => Number(w.to)))).toBe(9999);
  });

  it('a second provider that reports another hash for the page-end block is a discrepancy and the page is withheld', async () => {
    const f = fixture();
    const store = spyStore();
    const inner = chainWith(HEAD, f.logs);
    const secondary: MockRpc = { ...inner, getBlock: async (n) => { const b = await inner.getBlock(n); return n === 4999n && b !== null ? { ...b, hash: forkHash(4999) as Hex } : b; } };
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), secondaryClient: secondary, checkpoints: store.store });
    expect(out.discrepancyCalls.length).toBeGreaterThan(0);
    expect(out.result?.discrepancies.some((d) => d.kind === 'block_hash_differs' && d.ref === '4999')).toBe(true);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.progress.every((p) => !p.caughtUp)).toBe(true);
  });

  it('a primary that changes its answer for the anchor after the second provider spoke is caught and the page is withheld', async () => {
    const f = fixture();
    // Calibrate on a clean one-page run: how many times does the primary serve block 4,999?
    const clean = chainWith(HEAD, f.logs);
    await attempt(f, { client: clean, secondaryClient: chainWith(HEAD, f.logs), checkpoints: spyStore().store, maxPages: 1 });
    const reads = clean.calls.filter((c) => c.method === 'eth_getBlockByNumber' && c.params[0] === 4999n).length;
    expect(reads).toBe(6);
    // Now answer the LAST of those reads (the anchor re-read after the independent provider) with another hash.
    const inner = chainWith(HEAD, f.logs);
    let seen = 0;
    const flipping: MockRpc = { ...inner, getBlock: async (n) => {
      const b = await inner.getBlock(n);
      if (n === 4999n && b !== null && ++seen === reads) return { ...b, hash: forkHash(4999) as Hex };
      return b;
    } };
    const store = spyStore();
    const out = await attempt(f, { client: flipping, secondaryClient: chainWith(HEAD, f.logs), checkpoints: store.store, maxPages: 1 });
    expect(out.result?.discrepancies.map((d) => [d.kind, d.ref])).toEqual([['block_hash_differs', '4999']]);
    expect(out.discrepancyCalls).toEqual([['block_hash_differs']]);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(out.progress.at(-1)).toMatchObject({ nextBlock: 5000n, caughtUp: false, discrepancies: 1 });
  });

  it('agreeing providers record no discrepancy and checkpoint every page', async () => {
    const f = fixture();
    const store = spyStore();
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), secondaryClient: chainWith(HEAD, f.logs), checkpoints: store.store });
    expect(out.discrepancyCalls).toEqual([]);
    expect(out.result?.discrepancies).toEqual([]);
    expect(savedCalls(store)).toEqual([P1, P2, P3]);
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
  });
});

describe('PRIV-06: scan-window bounds', () => {
  it('windows start at the cursor, end at the head, and neither gap nor overlap across page boundaries', async () => {
    const f = fixture();
    const primary = chainWith(HEAD, f.logs);
    const store = spyStore();
    const out = await attempt(f, { client: primary, checkpoints: store.store });
    const w = windowsOf(primary);
    expect(w[0]?.from).toBe(0n);
    expect(w.at(-1)?.to).toBe(BigInt(HEAD));
    for (let i = 1; i < w.length; i++) expect(w[i]!.from, `window ${i}`).toBe(w[i - 1]!.to + 1n);
    expect(w.every((x) => x.to - x.from + 1n <= 100n && x.to >= x.from)).toBe(true);
    // Page boundaries: each page is 50 windows, the saved checkpoint is the next page's first block.
    expect(w[49]?.to).toBe(4999n);
    expect(w[50]?.from).toBe(savedCursor(store, 0).nextBlock);
    expect(w[99]?.to).toBe(9999n);
    expect(w[100]?.from).toBe(savedCursor(store, 1).nextBlock);
    expect(w).toHaveLength(121);
    expect(out.result?.cursor.nextBlock).toBe(BigInt(HEAD) + 1n);
    // Blocks on both sides of every boundary are scanned exactly once.
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
    expect(out.worker.batchIds()).toEqual(f.truth);
  });

  it('a resumed run starts exactly at the saved nextBlock', async () => {
    const f = fixture();
    const primary = chainWith(HEAD, f.logs);
    const resume = cursorAt(5000);
    const store = spyStore(resume);
    const out = await attempt(f, { client: primary, cursor: store.load(CHAIN_ID, KEY)!, checkpoints: store.store });
    const w = windowsOf(primary);
    expect(w[0]?.from).toBe(5000n);
    expect(w.at(-1)?.to).toBe(BigInt(HEAD));
    for (let i = 1; i < w.length; i++) expect(w[i]!.from).toBe(w[i - 1]!.to + 1n);
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth.slice(2));
    expect(savedCalls(store)).toEqual([P2, P3]);
  });

  it('with a second provider the primary window ends at the lower head, not past it', async () => {
    const f = fixture();
    const primary = chainWith(HEAD, f.logs);
    const secondaryInner = chainWith(HEAD, f.logs);
    const secondary: MockRpc = { ...secondaryInner, blockNumber: () => Promise.resolve(10_500n), getBlock: (n) => (n > 10_500n ? Promise.resolve(null) : secondaryInner.getBlock(n)) };
    const out = await attempt(f, { client: primary, secondaryClient: secondary });
    const w = windowsOf(primary);
    expect(w.at(-1)?.to).toBe(10_500n);
    for (let i = 1; i < w.length; i++) expect(w[i]!.from).toBe(w[i - 1]!.to + 1n);
    expect(out.result?.cursor.nextBlock).toBe(10_501n);
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth.slice(0, 6));
  });
});

function savedCursor(s: ReturnType<typeof spyStore>, index: number): ScanCursor {
  const c = s.save.mock.calls[index]?.[2];
  if (c === undefined) throw new Error(`no save #${String(index)}`);
  return c;
}

describe('PRIV-06: retries do not skip an interval', () => {
  it('a response-too-large refusal retried with a smaller window serves every block once and finds every announcement', async () => {
    const f = fixture();
    let refused = 0;
    const primary = chainWith(HEAD, f.logs);
    const client = hooked(primary, { getLogs: (q) => { if (q.fromBlock === 5000n && refused++ === 0) throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap'); } });
    const store = spyStore();
    const out = await attempt(f, { client, checkpoints: store.store });
    expect(refused).toBe(2);
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
    expect(out.worker.batchIds()).toEqual(f.truth);
    const w = windowsOf(primary);
    for (let i = 1; i < w.length; i++) expect(w[i]!.from).toBe(w[i - 1]!.to + 1n);
    expect(w[0]?.from).toBe(0n);
    expect(w.at(-1)?.to).toBe(BigInt(HEAD));
    // The refused request left a hole in the page only until it was re-asked smaller: the saved cursors are page ends.
    expect(store.history.map((c) => c.nextBlock).every((n, i) => n > (store.history[i - 1]?.nextBlock ?? 0n))).toBe(true);
    expect(store.history.at(-1)).toEqual(P3);
  });

  it('a transport failure retried by the RPC client (503 once) yields exactly the clean run\'s ids and checkpoints', async () => {
    const f = fixture();
    const inner = chainWith(HEAD, f.logs);
    const client = await wire(inner, (c) => {
      if (c.method === 'eth_getLogs' && c.from === 7500n && c.attempt === 1) throw new RpcHttpError(503);
      return undefined;
    });
    const store = spyStore();
    const out = await attempt(f, { client, checkpoints: store.store });
    expect(out.error).toBeUndefined();
    expect(idsOf(out.result?.matches ?? [])).toEqual(f.truth);
    expect(savedCalls(store)).toEqual([P1, P2, P3]);
    const w = windowsOf(inner);
    for (let i = 1; i < w.length; i++) expect(w[i]!.from).toBe(w[i - 1]!.to + 1n);
  });

  it('a run that fails once and is simply run again from the stored checkpoint finds exactly the ground-truth set', async () => {
    const f = fixture();
    const store = spyStore();
    let failed = false;
    const flaky = hooked(chainWith(HEAD, f.logs), { getLogs: (q) => { if (q.fromBlock >= 7000n && !failed) { failed = true; throw new ChainAdapterError('RPC_FAILURE', 'flaky provider'); } } });
    const first = await attempt(f, { client: flaky, checkpoints: store.store });
    expect(String(first.error)).toMatch(/flaky provider/);
    expect(store.current).toEqual(P1);
    const resumeAt = store.load(CHAIN_ID, KEY)!;
    const healthy = chainWith(HEAD, f.logs);
    const second = await attempt(f, { client: healthy, cursor: resumeAt, checkpoints: store.store });
    expect(second.error).toBeUndefined();
    // The retry started where the failed run last saved, not after the failed page and not before the saved page.
    expect(windowsOf(healthy)[0]?.from).toBe(5000n);
    // Union of both runs, in chain order, equals ground truth: nothing skipped, nothing counted twice.
    expect([...idsOf(first.matches), ...idsOf(second.result?.matches ?? [])]).toEqual(f.truth);
    expect(savedCalls(store)).toEqual([P1, P2, P3]);
  });
});

describe('PRIV-06: a stale or late run cannot overwrite a newer checkpoint', () => {
  async function overlap() {
    const f = fixture();
    const store = spyStore();
    let entered = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    // Run A is an older, budget-limited run (one page) whose first request is slow.
    const slow = hooked(chainWith(HEAD, f.logs), { getLogs: async (q) => { if (q.fromBlock === 0n && !entered) { entered = true; await gate; } } });
    const a = attempt(f, { client: slow, checkpoints: store.store, maxPages: 1 });
    await vi.waitFor(() => expect(entered).toBe(true));
    // Run B starts later, completes first, and saves the head-most checkpoint.
    const b = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store.store });
    const afterB = store.current;
    release();
    const aOut = await a;
    return { store, aOut, b, afterB };
  }

  it('run B completes first and stores the final checkpoint', async () => {
    const { store, b, afterB } = await overlap();
    expect(b.error).toBeUndefined();
    expect(afterB).toEqual(P3);
    expect(store.history.slice(0, 3)).toEqual([P1, P2, P3]);
  });

  // F1 (was `it.fails`), within one document: runScan re-reads the slot before each save and yields it once another scan has written there,
  // so run A, resolving late, no longer overwrites run B's newer checkpoint (11,991) with its own page-1 cursor (5,000).
  it('a late older run does not overwrite the newer checkpoint (final stored cursor is not older than B\'s)', async () => {
    const { store, afterB, aOut } = await overlap();
    expect(aOut.error).toBeUndefined();
    expect(store.current!.nextBlock).toBeGreaterThanOrEqual(afterB!.nextBlock);
    expect(store.current).toEqual(P3);
    // A yielded: B's three pages are the only saves.
    expect(savedCalls(store)).toEqual([P1, P2, P3]);
  });

  // F1 (was `it.fails`): a plain save to localCheckpointStore is forward-only.
  it('localCheckpointStore.save refuses an older cursor over a newer one for the same chain and key', () => {
    const key = new Uint8Array(32).fill(7);
    const map = new Map<string, string>();
    const store = secretKeyedStore({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, (_id, use) => use(key));
    const valid = checkpointKeyId('02aa', '03bb');
    store.save(CHAIN_ID, valid, P3);
    store.save(CHAIN_ID, valid, P1);
    expect(store.load(CHAIN_ID, valid)?.nextBlock).toBe(P3.nextBlock);
  });

  it('a run also yields to a foreign cursor that is older than its own (another scan\'s rollback stands)', async () => {
    const f = fixture();
    const store = spyStore();
    let entered = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = hooked(chainWith(HEAD, f.logs), { getLogs: async (q) => { if (q.fromBlock === 0n && !entered) { entered = true; await gate; } } });
    const pages: bigint[] = [];
    const a = attempt(f, { client: slow, checkpoints: store.store, onPageMatches: (_m, page) => { pages.push(page.from); return Promise.resolve(true); } });
    await vi.waitFor(() => expect(entered).toBe(true));
    // Another scan writes an older position meanwhile (for example after it rolled back over a reorg).
    const foreign = cursorAt(100);
    store.store.save(CHAIN_ID, KEY, foreign);
    release();
    const out = await a;
    expect(out.error).toBeUndefined();
    // The run still scanned everything, reported every payment and handed every page to onPageMatches (the durable
    // invoice record); it only stopped writing the checkpoint slot.
    expect(idsOf(out.matches)).toEqual(f.truth);
    expect(pages).toEqual([0n, 5000n, 10_000n]);
    expect(savedCalls(store)).toEqual([foreign]);
    expect(store.current).toEqual(foreign);
  });

  it('a run yields to another scan\'s clear: the slot stays empty and every page still reaches onPageMatches', async () => {
    const f = fixture();
    const store = spyStore();
    let cleared = false;
    // Another tab clears the slot (Start over, or its own reorg reset) while this run fetches page 2.
    const client = hooked(chainWith(HEAD, f.logs), { getLogs: (q) => { if (q.fromBlock === 5000n && !cleared) { cleared = true; store.store.clear(CHAIN_ID, KEY); } } });
    const pages: bigint[] = [];
    const out = await attempt(f, { client, checkpoints: store.store, onPageMatches: (_m, page) => { pages.push(page.from); return Promise.resolve(true); } });
    expect(out.error).toBeUndefined();
    expect(cleared).toBe(true);
    expect(idsOf(out.matches)).toEqual(f.truth);
    expect(pages).toEqual([0n, 5000n, 10_000n]);
    expect(savedCalls(store)).toEqual([P1]);
    expect(store.current).toBeUndefined();
  });

  it('an owning run keeps saving page after page when no other scan writes (each save expects its previous one)', async () => {
    const f = fixture();
    const store = spyStore(P1);
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), cursor: P1, checkpoints: store.store });
    expect(out.error).toBeUndefined();
    expect(savedCalls(store)).toEqual([P2, P3]);
    expect(store.save.mock.calls.map((c) => c[3])).toEqual([P1, P2]);
  });

  it('a save lost to a failing storage is retried at the next page, not mistaken for another scan\'s write', async () => {
    const f = fixture();
    const key = new Uint8Array(32).fill(8);
    const map = new Map<string, string>();
    let writes = 0;
    // The second write (page 2) hits a full storage; the first and third succeed.
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { if (++writes === 2) throw new Error('quota'); map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
    const store = secretKeyedStore(storage, (_id, use) => use(key));
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store });
    expect(out.error).toBeUndefined();
    expect(writes).toBe(3);
    expect(store.load(CHAIN_ID, KEY)).toEqual(P3);
  });

  describe('checkpointSeen: ownership starts at the snapshot the caller chose its cursor against', () => {
    const recordPages = () => {
      const pages: bigint[] = [];
      return { pages, onPageMatches: (_m: readonly ScanMatch[], page: { readonly from: bigint }) => { pages.push(page.from); return Promise.resolve(true); } };
    };

    it('a foreign save between the caller\'s read and the run\'s start is not adopted: no overwrite, every page recorded', async () => {
      const f = fixture();
      const store = spyStore(P3); // another tab advanced the slot after the caller read P1
      const rec = recordPages();
      const out = await attempt(f, { client: chainWith(HEAD, f.logs), cursor: P1, checkpointSeen: P1, checkpoints: store.store, onPageMatches: rec.onPageMatches });
      expect(out.error).toBeUndefined();
      expect(store.save).not.toHaveBeenCalled();
      expect(store.current).toEqual(P3);
      expect(rec.pages).toEqual([5000n, 10_000n]);
      expect(idsOf(out.matches)).toEqual(f.truth.slice(2));
    });

    it('a foreign clear between the caller\'s read and the run\'s start is not undone', async () => {
      const f = fixture();
      const store = spyStore(); // cleared by another tab after the caller read P1
      const rec = recordPages();
      const out = await attempt(f, { client: chainWith(HEAD, f.logs), cursor: P1, checkpointSeen: P1, checkpoints: store.store, onPageMatches: rec.onPageMatches });
      expect(out.error).toBeUndefined();
      expect(store.save).not.toHaveBeenCalled();
      expect(store.current).toBeUndefined();
      expect(rec.pages).toEqual([5000n, 10_000n]);
    });

    it('a deliberate restart from an earlier block still rewinds the slot the user saw', async () => {
      const f = fixture();
      const store = spyStore(P3);
      const out = await attempt(f, { client: chainWith(HEAD, f.logs), cursor: { nextBlock: 0n }, checkpointSeen: P3, checkpoints: store.store });
      expect(out.error).toBeUndefined();
      expect(savedCalls(store)).toEqual([P1, P2, P3]);
      expect(store.save.mock.calls.map((c) => c[3])).toEqual([P3, P1, P2]);
    });

    it('`null` (no checkpoint was shown) owns an empty slot and saves normally', async () => {
      const f = fixture();
      const store = spyStore();
      const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpointSeen: null, checkpoints: store.store });
      expect(out.error).toBeUndefined();
      expect(savedCalls(store)).toEqual([P1, P2, P3]);
      expect(store.save.mock.calls[0]?.[3]).toBeNull();
    });
  });

  it('a newer stored cursor survives a run during which localStorage reads fail while writes work', async () => {
    const f = fixture();
    const key = new Uint8Array(32).fill(6);
    const map = new Map<string, string>();
    let failGet = false;
    let writes = 0;
    const storage = {
      getItem: (k: string) => { if (failGet) throw new Error('storage read denied'); return map.get(k) ?? null; },
      setItem: (k: string, v: string) => { writes++; map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
    const store = secretKeyedStore(storage, (_id, use) => use(key));
    store.save(CHAIN_ID, KEY, P3);
    writes = 0;
    failGet = true;
    const pages: bigint[] = [];
    const out = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: store, onPageMatches: (_m, page) => { pages.push(page.from); return Promise.resolve(true); } });
    failGet = false;
    expect(out.error).toBeUndefined();
    expect(idsOf(out.matches)).toEqual(f.truth);
    expect(pages).toEqual([0n, 5000n, 10_000n]);
    expect(writes).toBe(0);
    expect(store.load(CHAIN_ID, KEY)).toEqual(P3);
  });

  it('two tabs sharing one localStorage: the late older run leaves the newer checkpoint in place', async () => {
    const f = fixture();
    const key = new Uint8Array(32).fill(9);
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
    const tabA = secretKeyedStore(storage, (_id, use) => use(key));
    const tabB = secretKeyedStore(storage, (_id, use) => use(key));
    let entered = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = hooked(chainWith(HEAD, f.logs), { getLogs: async (q) => { if (q.fromBlock === 0n && !entered) { entered = true; await gate; } } });
    const a = attempt(f, { client: slow, checkpoints: tabA, maxPages: 1 });
    await vi.waitFor(() => expect(entered).toBe(true));
    const b = await attempt(f, { client: chainWith(HEAD, f.logs), checkpoints: tabB });
    expect(b.error).toBeUndefined();
    expect(tabA.load(CHAIN_ID, KEY)).toEqual(P3);
    release();
    expect((await a).error).toBeUndefined();
    expect(tabA.load(CHAIN_ID, KEY)).toEqual(P3);
    expect(tabB.load(CHAIN_ID, KEY)).toEqual(P3);
  });
});
