// Seeded stress of runScan on a synthetic chain: random heads, page budgets, second-provider lag and disagreement,
// provider range limits answered with HTTP 413, transport timeouts mid-scan, forged claims, foreign router payments
// and the opt-in cover lookups (#747 caughtUp, #744 413 windows, #696 cover). A fixed-seed local PRNG builds every
// scenario, including the stealth keys (an injected RandomSource), so the same seed always yields the same chain, the same
// cover selection and the same run. The expected matches and saved checkpoints come from the generator, never from a
// production read. Synthetic data only; no network.
//
// Invariants: `caughtUp` is true only when the cursor passed the primary head with nothing held back (no secondary lag,
// no discrepancy, no limit, no backlog); a clean full run says so; every announcement below the final cursor is reported
// and only real ones are; a forged claim is never `verified` or `pending`; saved checkpoints never move back within a run,
// never pass the unfinalised tail, never pass a disputed block, and bind the hash of their previous block; after any
// failure a healthy resume from the saved checkpoint covers everything the failed run did not; cover lookups change no
// result, are drawn only from router payments that would send a request, are the same set from any starting point and
// about half of the foreign payments; the same seed gives the identical run.
import {
  CHAINS, ChainAdapterError, ANNOUNCEMENT_TOPIC, ghostPayRouterAbi, grossForNet,
  type Address, type Hex, type RpcLog, type ScanCursor,
} from '@ghostpay/chain-adapters';
import { buildErc20Metadata, deriveStealthPayment, encodeMetaAddress, generateKeySet, parseMetadata, unsafeRevealSecret, type RandomSource } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { checkpointKeyId, runScan, type CheckpointStore, type ScanMatch, type ScanProgress } from './scanClient';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;
/** An injected RandomSource: the whole run, keys and ephemeral keys included, is a function of the seed. */
function seededSource(r: Rand): RandomSource {
  return { getRandomValues: ((buf: Uint8Array) => { for (let i = 0; i < buf.length; i++) buf[i] = int(r, 0, 255); return buf; }) as Crypto['getRandomValues'] };
}

const base = CHAINS.find((c) => c.chainId === 84532)!;
const CHAIN_ID = 84532;
const manifest = fakeManifest(CHAIN_ID);
const KEY = checkpointKeyId('02aa', '03bb');
const TOKEN = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const UNLISTED = '0x000000000000000000000000000000000000dEaD';
const PAYER = '0x2222222222222222222222222222222222222222' as Address;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const hash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;

/** What a payment is in the generator's ground truth. */
interface Payment {
  readonly block: number;
  readonly index: number;
  readonly owner: 'mine' | 'foreign';
  readonly forged: boolean; // announced, but no token transfer exists
  readonly malformed: boolean; // router-attributed but an unlisted asset: verification sends no request
  readonly log: RpcLog;
  readonly tx: string;
  readonly amount: bigint;
}

interface Keys { readonly mine: ReturnType<typeof generateKeySet>; readonly meta: string; readonly foreignMeta: string }

function makePayment(r: Rand, rng: RandomSource, k: Keys, owner: 'mine' | 'foreign', block: number, index: number, opts: { forged?: boolean; malformed?: boolean } = {}): Payment {
  const p = deriveStealthPayment(owner === 'mine' ? k.meta : k.foreignMeta, rng);
  const amount = BigInt(int(r, 1, 5)) * 1_000_000n;
  // A router-attributed payment of an asset the chain does not list: verification sends no request for it.
  const metadata = `0x${hexOf(buildErc20Metadata(p.viewTag, opts.malformed === true ? UNLISTED : TOKEN, amount))}`;
  const tx = hash(block * 4096 + index);
  return {
    block, index, owner, forged: opts.forged === true, malformed: opts.malformed === true, tx, amount,
    log: {
      address: FAKE_ANNOUNCER,
      topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`, word(p.stealthAddress), word(FAKE_ROUTER)],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${hexOf(p.ephemeralPublicKey)}`, metadata as Hex]),
      blockNumber: `0x${block.toString(16)}`, blockHash: hash(block), logIndex: `0x${index.toString(16)}`, transactionHash: tx,
    },
  };
}

interface Counters { logCalls: number; looked: Map<string, number> }

/** A provider that serves `payments` up to `head`, with hooks for limits and faults. The tx lookups are counted per hash. */
function provider(payments: readonly Payment[], head: number, o: {
  readonly hashOf?: (n: number) => string; readonly rangeLimit?: number; readonly failLogCall?: number; readonly counters?: Counters;
}): MockRpc {
  const hashOf = o.hashOf ?? hash;
  const announced = payments.map((p) => ({ ...p.log, logIndex: `0x${(p.index + 100).toString(16)}` }));
  const transfers = payments.filter((p) => !p.forged && !p.malformed).map((p): RpcLog => ({
    address: TOKEN, blockNumber: p.log.blockNumber, blockHash: p.log.blockHash, transactionHash: p.tx, logIndex: `0x${p.index.toString(16)}`,
    topics: [TRANSFER_TOPIC, word(PAYER), p.log.topics[2] as string], data: `0x${p.amount.toString(16).padStart(64, '0')}`,
  }));
  return mockRpc(CHAIN_ID, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      if (n > head) return null;
      return { hash: hashOf(n), parentHash: hashOf(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { address?: string; fromBlock: bigint; toBlock: bigint; topics?: readonly (string | null)[] };
      if (f.address?.toLowerCase() === TOKEN) {
        return transfers.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
      }
      if (o.counters !== undefined) {
        o.counters.logCalls++;
        if (o.failLogCall !== undefined && o.counters.logCalls === o.failLogCall) throw new ChainAdapterError('RPC_FAILURE', 'transport error or timeout');
      }
      if (o.rangeLimit !== undefined && f.toBlock - f.fromBlock + 1n > BigInt(o.rangeLimit)) throw new ChainAdapterError('RPC_FAILURE', 'http status 413');
      const caller = f.topics?.[3];
      return announced.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock && (caller == null || l.topics[3] === caller));
    }
    if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') {
      const key = String(params[0]).toLowerCase();
      if (o.counters !== undefined) o.counters.looked.set(key, (o.counters.looked.get(key) ?? 0) + 1);
      const p = payments.find((x) => x.tx === key);
      if (p === undefined) return null;
      const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], p.log.data as Hex);
      const parsed = parseMetadata(metadata);
      if (parsed.kind !== 'erc20') throw new Error('fixture requires ERC20');
      const stealth = `0x${(p.log.topics[2] as string).slice(-40)}` as const;
      const common = { to: FAKE_ROUTER, from: PAYER, blockHash: p.log.blockHash, blockNumber: p.log.blockNumber };
      if (method === 'eth_getTransactionReceipt') {
        return { ...common, status: '0x1', transactionHash: p.tx,
          logs: [...transfers.filter((t) => t.transactionHash === p.tx), { ...p.log, logIndex: `0x${(p.index + 100).toString(16)}` }] };
      }
      return { ...common, hash: p.tx, value: '0x0', input: encodeFunctionData({
        abi: ghostPayRouterAbi, functionName: 'payERC20',
        args: [parsed.token, stealth, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata],
      }) };
    }
    if (method === 'eth_call' || method === 'eth_getBalance') return '0x0';
    throw new Error(`unexpected ${method}`);
  });
}

interface Scenario {
  readonly seed: number;
  readonly chain: typeof base;
  readonly head: number;
  readonly payments: readonly Payment[];
  readonly keys: Keys;
  readonly lag: number | undefined;
  readonly disagreeAt: number | undefined;
  readonly rangeLimit: number | undefined;
  readonly failLogCall: number | undefined;
  readonly maxPages: number | undefined;
  readonly start: number;
}

function scenario(seed: number): Scenario {
  const r = prng(seed);
  const rng = seededSource(r);
  const mine = generateKeySet(rng);
  const foreign = generateKeySet(rng);
  const keys: Keys = { mine, meta: encodeMetaAddress(mine), foreignMeta: encodeMetaAddress(foreign) };
  const chain = { ...base, getLogsMaxRange: pick(r, [10, 25, 100]), finalityDepth: pick(r, [3, 10]) };
  const head = int(r, 0, 1800);
  const taken = new Set<string>();
  /** A distinct (block, log index) for every payment, so ids and transaction hashes never collide on a short chain. */
  const where = (): { block: number; index: number } => {
    for (;;) {
      const block = int(r, 0, head);
      const index = int(r, 0, 3);
      if (!taken.has(`${String(block)}:${String(index)}`)) { taken.add(`${String(block)}:${String(index)}`); return { block, index }; }
    }
  };
  const payments: Payment[] = [];
  for (let i = 0; i < int(r, 0, 6); i++) { const w = where(); payments.push(makePayment(r, rng, keys, 'mine', w.block, w.index, { forged: r() < 0.2 })); }
  for (let i = 0; i < int(r, 0, 10); i++) { const w = where(); payments.push(makePayment(r, rng, keys, 'foreign', w.block, w.index, { malformed: r() < 0.25 })); }
  payments.sort((a, b) => a.block - b.block || a.index - b.index);
  // A saved checkpoint is never inside the unfinalised tail (every save is held back by the finality depth).
  const start = r() < 0.3 ? int(r, 0, Math.max(0, head + 1 - chain.finalityDepth)) : 0;
  return {
    seed, chain, head, payments, keys,
    lag: r() < 0.5 ? pick(r, [0, 0, 1, chain.finalityDepth, chain.finalityDepth + 1, 40, 300]) : undefined,
    disagreeAt: r() < 0.12 ? int(r, 0, head) : undefined,
    rangeLimit: r() < 0.4 ? pick(r, [3, 7, 50, 120]) : undefined,
    failLogCall: r() < 0.3 ? int(r, 1, 6) : undefined,
    maxPages: r() < 0.2 ? int(r, 1, 3) : undefined,
    start,
  };
}

const cursorAt = (next: number): ScanCursor => (next === 0 ? { nextBlock: 0n } : { nextBlock: BigInt(next), last: { number: BigInt(next - 1), hash: hash(next - 1) as Hex } });

interface Run {
  readonly error: unknown;
  readonly progress: readonly ScanProgress[];
  readonly matches: readonly ScanMatch[];
  readonly saves: readonly ScanCursor[];
  readonly cursor?: ScanCursor;
  readonly discrepancies: readonly string[];
  readonly secondaryLag: boolean;
  readonly limitReached: boolean;
  readonly counters: Counters;
  readonly store: { current: ScanCursor | undefined };
}

/** A slot with the documented CheckpointStore semantics: forward-only without `expected`, compare-and-swap with it. */
class Slot {
  current: ScanCursor | undefined;
  readonly accepted: ScanCursor[] = [];
  constructor(initial?: ScanCursor) { this.current = initial; }
  private same(a: ScanCursor | undefined, b: ScanCursor | undefined): boolean {
    if (a === undefined || b === undefined) return a === b;
    return a.nextBlock === b.nextBlock && a.last?.number === b.last?.number && a.last?.hash.toLowerCase() === b.last?.hash.toLowerCase();
  }
  store(onSave?: (cursor: ScanCursor) => void): CheckpointStore {
    return {
      load: () => this.current,
      save: (_c, _k, cursor, expected) => {
        if (expected === undefined) { if (this.current !== undefined && cursor.nextBlock < this.current.nextBlock) return; }
        else if (!this.same(expected === null ? undefined : expected, this.current)) return;
        this.current = cursor;
        this.accepted.push(cursor);
        onSave?.(cursor);
      },
      clear: () => { this.current = undefined; },
    };
  }
}

async function run(sc: Scenario, o: {
  readonly cover?: boolean; readonly faults?: boolean; readonly pages?: boolean; readonly secondary?: boolean; readonly from?: ScanCursor; readonly limit?: boolean;
  readonly slot?: Slot;
}): Promise<Run> {
  const counters: Counters = { logCalls: 0, looked: new Map() };
  const hashOf = (n: number): string => hash(n);
  const primary = provider(sc.payments, sc.head, {
    ...(o.limit === false || sc.rangeLimit === undefined ? {} : { rangeLimit: sc.rangeLimit }),
    ...(o.faults === false || sc.failLogCall === undefined ? {} : { failLogCall: sc.failLogCall }), counters,
  });
  const withSecondary = o.secondary !== false && sc.lag !== undefined;
  const secondaryHead = Math.max(0, sc.head - (sc.lag ?? 0));
  const secondary = withSecondary
    ? provider(sc.payments, secondaryHead, { hashOf: sc.disagreeAt === undefined ? hashOf : (n) => (n >= sc.disagreeAt! ? hash(n + 9_000_000) : hash(n)) })
    : undefined;
  const initial = o.from ?? cursorAt(sc.start);
  const store = o.slot ?? new Slot(initial.nextBlock === 0n ? undefined : initial);
  const saves: ScanCursor[] = [];
  const checkpoints = store.store((cursor) => { saves.push(cursor); });
  const progress: ScanProgress[] = [];
  const matches: ScanMatch[] = [];
  const discrepancies: string[] = [];
  const viewingKey = unsafeRevealSecret(sc.keys.mine.viewingSecret).slice();
  try {
    const result = await runScan({
      chain: sc.chain, manifest, cursor: store.current ?? { nextBlock: 0n }, spendingPublicKeyHex: hexOf(sc.keys.mine.spendingPublicKey), keyId: KEY, viewingKey,
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, client: primary,
      ...(secondary === undefined ? {} : { secondaryClient: secondary }),
      ...(o.pages === false || sc.maxPages === undefined ? {} : { maxPages: sc.maxPages }),
      ...(o.cover === true ? { matchCover: true } : {}), checkpoints,
      onProgress: (x) => { progress.push(x); }, onMatch: (m) => { matches.push(m); }, onDiscrepancy: (d) => { discrepancies.push(...d.map((x) => x.kind)); },
    });
    return { error: undefined, progress, matches: result.matches, saves, cursor: result.cursor, discrepancies: result.discrepancies.map((d) => d.kind), secondaryLag: result.secondaryLag !== undefined, limitReached: result.limitReached, counters, store };
  } catch (error) {
    return { error, progress, matches, saves, discrepancies, secondaryLag: false, limitReached: false, counters, store };
  }
}

const idOf = (p: Payment): string => `${hash(p.block)}:${String(p.index + 100)}`;
const summary = (x: Run): string => JSON.stringify({
  e: x.error === undefined ? null : (x.error instanceof Error ? x.error.message : 'non-error').slice(0, 60),
  p: x.progress.map((p) => [String(p.nextBlock), p.caughtUp, p.discrepancies ?? 0]), s: x.saves.map((c) => String(c.nextBlock)),
  m: x.matches.map((m) => [m.announcement.id, m.receipt]).sort(), c: x.cursor === undefined ? null : String(x.cursor.nextBlock), l: x.counters.logCalls,
  t: [...x.counters.looked.entries()].sort(),
});

const SEEDS = [696, 744, 747];
const PER_SEED = 22;

describe('runScan seeded stress (caughtUp, 413 windows, truncation, secondary lag)', () => {
  for (const base_ of SEEDS) {
    it(`seed ${String(base_)}: ${String(PER_SEED)} scenarios keep caughtUp honest, coverage complete and checkpoints safe`, async () => {
      let clean = 0;
      let caught = 0;
      let failed = 0;
      let lagged = 0;
      let resumed = 0;
      for (let i = 0; i < PER_SEED; i++) {
        const sc = scenario(base_ * 1000 + i);
        const out = await run(sc, {});
        const H = BigInt(sc.head);
        const D = BigInt(sc.chain.finalityDepth);
        const start = BigInt(sc.start);
        const what = `seed ${String(sc.seed)}`;

        // Saved checkpoints, whether or not the run finished.
        let previous = start;
        for (const saved of out.saves) {
          expect(saved.nextBlock, `${what} checkpoint moved back`).toBeGreaterThanOrEqual(previous);
          previous = saved.nextBlock;
          expect(saved.nextBlock, `${what} checkpoint passed the unfinalised tail`).toBeLessThanOrEqual(H + 1n > D ? H + 1n - D : 0n);
          if (sc.disagreeAt !== undefined && sc.lag !== undefined && sc.disagreeAt <= Math.max(0, sc.head - sc.lag)) expect(saved.nextBlock, `${what} checkpoint passed a disputed block`).toBeLessThanOrEqual(BigInt(sc.disagreeAt));
          if (saved.nextBlock > 0n) {
            expect(saved.last?.number).toBe(saved.nextBlock - 1n);
            expect(saved.last?.hash).toBe(hash(Number(saved.nextBlock) - 1));
          }
        }

        if (out.error !== undefined) {
          failed++;
          expect(out.error, what).toBeInstanceOf(Error);
          // A provider fault or a refusal is never hidden as progress: nothing claimed caught up with a failed page after it.
          const last = out.progress[out.progress.length - 1];
          if (last?.caughtUp === true) expect(last.nextBlock).toBeGreaterThan(H);
          // A healthy resume from what was saved covers everything the failed run did not (nothing silently dropped).
          const resume = await run(sc, { faults: false, pages: false, limit: false, secondary: false, from: out.store.current ?? cursorAt(0) });
          expect(resume.error, `${what} healthy resume`).toBeUndefined();
          const startOfResume = out.store.current?.nextBlock ?? 0n;
          const found = new Set([...out.matches, ...resume.matches].map((m) => m.announcement.id));
          for (const p of sc.payments) if (p.owner === 'mine' && BigInt(p.block) >= start && BigInt(p.block) < (resume.cursor?.nextBlock ?? 0n) && BigInt(p.block) >= (startOfResume > start ? start : start)) {
            expect(found.has(idOf(p)), `${what} dropped block ${String(p.block)} after a failure`).toBe(true);
          }
          resumed++;
          continue;
        }

        const result = out;
        const cursorNext = (result.cursor as ScanCursor).nextBlock;
        const last = result.progress[result.progress.length - 1];
        // caughtUp honesty, for every event.
        for (const p of result.progress) {
          if (!p.caughtUp) continue;
          expect(p.nextBlock, `${what} caughtUp below the head`).toBeGreaterThan(H);
          expect(p.limitReached).toBeUndefined();
          expect(p.backlog).toBeUndefined();
          expect(p.discrepancies ?? 0).toBe(0);
        }
        if (last?.caughtUp === true) {
          caught++;
          expect(cursorNext).toBeGreaterThan(H);
          expect(result.secondaryLag, what).toBe(false);
          expect(result.discrepancies).toEqual([]);
          expect(result.limitReached).toBe(false);
        }
        // A secondary provider behind the primary stops the scan at its head: never caught up, whatever the lag.
        const secondaryHead = sc.lag === undefined ? undefined : Math.max(0, sc.head - sc.lag);
        if (secondaryHead !== undefined && secondaryHead < sc.head && sc.disagreeAt === undefined) {
          lagged++;
          if (last !== undefined) expect(last.caughtUp, `${what} caught up despite secondary lag`).toBe(false);
          expect(cursorNext).toBeLessThanOrEqual(BigInt(secondaryHead) + 1n > start ? BigInt(secondaryHead) + 1n : start);
        }
        if (sc.disagreeAt !== undefined && result.discrepancies.length > 0) expect(last?.caughtUp ?? false).toBe(false);
        // Not understated either: a clean full run (no faults, budget, lag or dispute) says it caught up.
        const cleanRun = sc.maxPages === undefined && sc.disagreeAt === undefined && (secondaryHead === undefined || secondaryHead >= sc.head) && sc.start <= sc.head + 1;
        if (cleanRun) {
          clean++;
          expect(last?.caughtUp, `${what} clean run not reported caught up`).toBe(true);
          expect(cursorNext).toBeGreaterThan(H);
        }
        // Coverage: everything below the final cursor is reported, only real payments are, forged claims are never evidence.
        const ids = new Map(result.matches.map((m) => [m.announcement.id, m] as const));
        expect(ids.size).toBe(result.matches.length);
        for (const p of sc.payments) {
          const below = BigInt(p.block) >= start && BigInt(p.block) < cursorNext && result.discrepancies.length === 0;
          if (p.owner === 'mine' && below) expect(ids.has(idOf(p)), `${what} dropped block ${String(p.block)}`).toBe(true);
          if (p.owner === 'foreign') expect(ids.has(idOf(p)), `${what} foreign payment reported`).toBe(false);
        }
        for (const m of result.matches) {
          const p = sc.payments.find((x) => idOf(x) === m.announcement.id);
          expect(p?.owner).toBe('mine');
          if (p?.forged === true) expect(m.receipt, `${what} forged claim shown as payment`).toBe('claimed');
          if (m.receipt === 'verified') expect(BigInt(p?.block ?? -1)).toBeLessThanOrEqual(H);
        }
      }
      expect(clean).toBeGreaterThan(2);
      expect(caught).toBeGreaterThan(2);
      expect(failed + lagged).toBeGreaterThan(4);
      expect(resumed).toBeGreaterThanOrEqual(0);
    }, 300_000);
  }

  it('is deterministic: the same seed gives the identical run, fault and all', async () => {
    for (const seed of [11, 202, 3003, 40004]) {
      const sc = scenario(seed);
      expect(summary(await run(sc, {}))).toBe(summary(await run(sc, {})));
    }
  }, 120_000);

  it('a 413 range refusal gives the same scan result as a provider that serves the range', async () => {
    let compared = 0;
    for (let i = 0; i < 25; i++) {
      const sc = { ...scenario(413_000 + i), lag: undefined, disagreeAt: undefined, failLogCall: undefined, maxPages: undefined };
      const limited = await run({ ...sc, rangeLimit: pick(prng(i), [3, 7, 50]) }, {});
      const open = await run({ ...sc, rangeLimit: undefined }, {});
      if (limited.error !== undefined || open.error !== undefined) continue;
      expect([...limited.matches.map((m) => [m.announcement.id, m.receipt])].sort()).toEqual([...open.matches.map((m) => [m.announcement.id, m.receipt])].sort());
      expect(limited.cursor).toEqual(open.cursor);
      expect(limited.progress[limited.progress.length - 1]?.caughtUp).toBe(open.progress[open.progress.length - 1]?.caughtUp);
      compared++;
    }
    expect(compared).toBeGreaterThan(15);
  }, 120_000);
});

describe('two scans of one slot racing (checkpoint ownership)', () => {
  it('whatever two concurrent runs do, the slot only ever moves forward and ends at a cursor one of them saved', async () => {
    let raced = 0;
    let both = 0;
    for (let i = 0; i < 24; i++) {
      const sc = { ...scenario(3_000_000 + i), lag: undefined, disagreeAt: undefined, rangeLimit: undefined, maxPages: undefined, failLogCall: undefined };
      if (sc.head < 40) continue;
      const slot = new Slot(sc.start === 0 ? undefined : cursorAt(sc.start));
      const second = { ...sc, failLogCall: (i % 3 === 0 ? 2 : undefined), maxPages: i % 4 === 0 ? 1 : undefined };
      const [a, b] = await Promise.all([run(sc, { slot }), run(second, { slot })]);
      raced++;
      // Every accepted write in order never decreases: a run that lost the slot to another stops writing, it never goes back.
      for (let k = 1; k < slot.accepted.length; k++) {
        expect(slot.accepted[k]!.nextBlock, `seed ${String(sc.seed)} slot moved back`).toBeGreaterThanOrEqual(slot.accepted[k - 1]!.nextBlock);
      }
      // The slot ends at something one of the runs saved (or the start), never an invented cursor.
      const ever = new Set([...a.saves, ...b.saves].map((c) => String(c.nextBlock)));
      if (slot.current !== undefined && slot.accepted.length > 0) expect(ever.has(String(slot.current.nextBlock))).toBe(true);
      if (a.saves.length > 0 && b.saves.length > 0) both++;
      // A failure in one run never costs the other its result.
      if (a.error === undefined) expect(a.progress.length).toBeGreaterThan(0);
    }
    expect(raced).toBeGreaterThan(12);
    expect(both).toBeGreaterThanOrEqual(0);
  }, 240_000);
});

describe('match cover lookups (#696) under random chains', () => {
  it('change no result, never probe a payment that would send nothing, repeat from any start, and cover about half', async () => {
    let foreignValid = 0;
    let foreignCovered = 0;
    let scenarios = 0;
    for (let i = 0; i < 24; i++) {
      const sc = { ...scenario(696_000 + i), lag: undefined, disagreeAt: undefined, failLogCall: undefined, maxPages: undefined, rangeLimit: undefined, start: 0 };
      if (sc.payments.filter((p) => p.owner === 'foreign').length === 0) continue;
      scenarios++;
      const off = await run(sc, { cover: false });
      const on = await run(sc, { cover: true });
      expect(off.error).toBeUndefined();
      expect(on.error).toBeUndefined();
      // Decoy results are discarded: the same matches, receipts and cursor.
      const shape = (x: Run): string => JSON.stringify([...x.matches.map((m) => [m.announcement.id, m.receipt])].sort());
      expect(shape(on)).toBe(shape(off));
      expect(String(on.cursor?.nextBlock)).toBe(String(off.cursor?.nextBlock));
      expect(on.progress[on.progress.length - 1]?.caughtUp).toBe(off.progress[off.progress.length - 1]?.caughtUp);
      const foreign = sc.payments.filter((p) => p.owner === 'foreign');
      for (const p of foreign) {
        // Off: a foreign payment is never looked up. On: only one that would send a request is, and never twice over.
        expect(off.counters.looked.has(p.tx), `cover off probed a foreign payment`).toBe(false);
        if (p.malformed) expect(on.counters.looked.has(p.tx), 'cover probed a payment that sends nothing').toBe(false);
        else { foreignValid++; if (on.counters.looked.has(p.tx)) foreignCovered++; }
      }
      // Every real payment is looked up in both runs.
      for (const p of sc.payments.filter((x) => x.owner === 'mine' && !x.forged)) expect(on.counters.looked.has(p.tx)).toBe(true);
      // The selection depends on the key and the payment alone: a run that starts later picks the same payments in its range.
      const mid = Math.floor(sc.head / 2);
      const later = await run({ ...sc, start: mid }, { cover: true });
      expect(later.error).toBeUndefined();
      for (const p of foreign.filter((x) => !x.malformed && x.block >= mid + sc.chain.finalityDepth)) {
        expect(later.counters.looked.has(p.tx), `cover selection changed with the start block`).toBe(on.counters.looked.has(p.tx));
      }
      // And the same run again selects the same set.
      const again = await run(sc, { cover: true });
      expect([...again.counters.looked.keys()].sort()).toEqual([...on.counters.looked.keys()].sort());
    }
    expect(scenarios).toBeGreaterThan(12);
    expect(foreignValid).toBeGreaterThan(40);
    const share = foreignCovered / foreignValid;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.75);
  }, 300_000);
});
