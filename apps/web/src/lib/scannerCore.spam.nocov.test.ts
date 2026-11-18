import { CHAINS, ghostPayRouterAbi, grossForNet, validateAnnouncementLog, type Address, type FetchOptions, type FetchResult, type Hex, type RpcLog, type ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { buildErc20Metadata, deriveStealthPayment, encodeMetaAddress, generateKeySet, parseMetadata, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog, TOKEN_84532 } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { checkpointKeyId, localCheckpointStore, runScan } from './scanClient';

/*
 * Spec 05 section 4 acceptance: one million open-lane spam announcements plus ten real router payments, driven through
 * `runScan` (lanes, open-lane budget, backlog, held cursor, checkpoint resume) and the real worker protocol (`ScanProtocol`
 * through `InlineWorker`, so every announcement is checked by core-crypto). Runs WITHOUT v8 coverage (vitest.nocov.config.ts),
 * as the other heavy corpora do; the deadline is the one tagArchive.fuzz.nocov.test.ts already uses.
 *
 * Only the log fetch is replaced: pages are generated instead of read from an RPC, because chain-adapters validates every
 * log before the scanner sees it (an on-curve decode per log, about 115 us on the development container, so 1M logs would
 * spend about two minutes there alone). That validation is pinned by the chain-adapters tests and by the smaller A5 floods
 * in scanClient.test.ts, which run the real fetch. Receipts, block hashes and checkpoints use a real mock RPC.
 *
 * The spam is replay spam (the cheapest to post: copies of 64 announcements with wrong tags, posted by other callers):
 * distinct-key spam costs one ECDH each in the worker (about 2.2 ms here), so a million of it would run for the better part
 * of an hour on this container. The spec records the measured numbers.
 */
vi.mock('@ghostpay/chain-adapters', async (importOriginal) => {
  const real = await importOriginal<typeof import('@ghostpay/chain-adapters')>();
  return { ...real, fetchAnnouncements: (o: FetchOptions): Promise<FetchResult> => Promise.resolve(fakeFetch(o)) };
});

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const manifest = fakeManifest(84532);
const KEY = checkpointKeyId('02aa', '03bb');
// Blocks 0..HEAD: 100,000 blocks of 10 spam announcements each.
const HEAD = 99_999n;
const PAGE = 1000n;
const SPAM_PER_BLOCK = 10;
const SPAM_TOTAL = (Number(HEAD) + 1) * SPAM_PER_BLOCK;
const DISTINCT = 64;
const REAL_BLOCKS = Array.from({ length: 10 }, (_, i) => 5_000 + 10_000 * i);
const REAL_INDEX = 50;
const CALLERS = ['0x5555555555555555555555555555555555555555', '0x6666666666666666666666666666666666666666', '0x7777777777777777777777777777777777777777'] as const;
const blockHash = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface Fixture {
  readonly spam: readonly { readonly stealthAddress: Address; readonly ephemeralPublicKey: string; readonly metadata: string }[];
  readonly real: readonly { readonly log: RpcLog; readonly stealthAddress: string; readonly announcement: ScannedAnnouncement }[];
}
let fixture: Fixture | undefined;

function fakeFetch(o: FetchOptions): FetchResult {
  const f = fixture!;
  if (o.cursor.last !== undefined && o.cursor.last.hash.toLowerCase() !== blockHash(o.cursor.last.number)) throw new Error('checkpoint hash does not match the chain');
  const from = o.cursor.nextBlock;
  const to = from + PAGE - 1n > HEAD ? HEAD : from + PAGE - 1n;
  const announcements: ScannedAnnouncement[] = [];
  for (let b = from; b <= to; b++) {
    const base = Number(b) * SPAM_PER_BLOCK;
    const hash = blockHash(b);
    for (let i = 0; i < SPAM_PER_BLOCK; i++) {
      const s = f.spam[(base + i) % DISTINCT]!;
      announcements.push({
        schemeId: 1n, stealthAddress: s.stealthAddress, ephemeralPublicKey: s.ephemeralPublicKey, metadata: s.metadata,
        caller: CALLERS[(base + i) % CALLERS.length]!, blockNumber: b, blockHash: hash, logIndex: i, id: `${hash}:${String(i)}`,
      });
    }
    const real = f.real.find((r) => r.announcement.blockNumber === b);
    if (real !== undefined) announcements.push(real.announcement);
  }
  return { announcements, cursor: { nextBlock: to + 1n, last: { number: to, hash: blockHash(to) } }, truncated: to < HEAD, skipped: 0, head: HEAD };
}

/** Receipts, transactions and block hashes for the ten router payments; nothing else is served. */
function receiptsClient(real: Fixture['real']) {
  const payer = '0x2222222222222222222222222222222222222222';
  const transferFor = (log: RpcLog): RpcLog => ({
    address: TOKEN_84532.toLowerCase(), blockNumber: log.blockNumber, blockHash: log.blockHash, transactionHash: log.transactionHash!,
    topics: [TRANSFER_TOPIC, word(payer), log.topics[2]!], data: `0x${1_000_000n.toString(16).padStart(64, '0')}`, logIndex: `0x${(REAL_INDEX - 1).toString(16)}`,
  });
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${HEAD.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = BigInt(params[0] as bigint);
      return { hash: blockHash(n), parentHash: blockHash(n - 1n), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const q = params[0] as { address: string; fromBlock: bigint; toBlock: bigint };
      if (q.address.toLowerCase() !== TOKEN_84532.toLowerCase()) throw new Error('announcer logs are generated, not fetched');
      return real.map((r) => transferFor(r.log)).filter((l) => BigInt(l.blockNumber) >= q.fromBlock && BigInt(l.blockNumber) <= q.toBlock);
    }
    if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') {
      const r = real.find((item) => item.log.transactionHash?.toLowerCase() === String(params[0]).toLowerCase());
      if (r === undefined) return null;
      const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], r.log.data as Hex);
      const parsed = parseMetadata(metadata);
      if (parsed.kind !== 'erc20') throw new Error('fixture requires ERC20');
      const common = { to: FAKE_ROUTER, from: payer, blockHash: r.log.blockHash, blockNumber: r.log.blockNumber };
      if (method === 'eth_getTransactionReceipt') return { ...common, status: '0x1', transactionHash: r.log.transactionHash, logs: [transferFor(r.log), r.log] };
      return { ...common, hash: r.log.transactionHash, value: '0x0', input: encodeFunctionData({
        abi: ghostPayRouterAbi, functionName: 'payERC20',
        args: [parsed.token, r.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata],
      }) };
    }
    if (method === 'eth_call' || method === 'eth_getBalance') return '0x0';
    throw new Error(`unexpected ${method}`);
  });
}

describe('spec 05 acceptance: 1M spam + 10 real router payments through the lanes and the budget', () => {
  it('finds all ten, defers spam past the budget as backlog with the cursor held, and drains it on resume without losing or duplicating a payment', async () => {
    const keys = generateKeySet();
    const stranger = encodeMetaAddress(generateKeySet());
    const spam = Array.from({ length: DISTINCT }, () => {
      const p = deriveStealthPayment(stranger);
      return { stealthAddress: p.stealthAddress, ephemeralPublicKey: `0x${hexOf(p.ephemeralPublicKey)}`, metadata: `0x${hexOf(buildErc20Metadata(p.viewTag[0]! ^ 0x5a, TOKEN_84532, 1_000_000n))}` };
    });
    const real = REAL_BLOCKS.map((block) => {
      const made = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(keys), block, index: REAL_INDEX, caller: FAKE_ROUTER });
      return { ...made, announcement: validateAnnouncementLog(made.log, FAKE_ANNOUNCER, 1n, BigInt(block), BigInt(block))! };
    });
    fixture = { spam, real };
    const client = receiptsClient(real);
    const store = (() => {
      const m = new Map<string, string>();
      return localCheckpointStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
    })();
    // Each open-lane log, by (block, index), and each real payment id: counted when it reaches the worker.
    const spamSeen = new Uint8Array(SPAM_TOTAL);
    const realSeen = new Map<string, number>(real.map((r) => [r.announcement.id, 0]));
    const found = new Map<string, number>();
    let backlogRuns = 0;
    let heldCursorOk = true;
    let runs = 0;
    let finished = false;
    for (; runs < 60 && !finished; runs++) {
      // As the Scan view resumes: the cursor comes from the checkpoint store, never from the previous result.
      const cursor = store.load(84532, KEY) ?? { nextBlock: 0n };
      const worker = new InlineWorker();
      const res = await runScan({
        chain, manifest, client, cursor, checkpoints: store, openLaneBudget: 20_000,
        spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: KEY, viewingKey: unsafeRevealSecret(keys.viewingSecret),
        createWorker: () => worker, signal: new AbortController().signal,
      });
      const keysThisRun = new Set<string>();
      for (const m of res.matches) {
        const key = `${m.stealthAddress.toLowerCase()}|${m.announcement.ephemeralPublicKey.toLowerCase()}`;
        expect(keysThisRun.has(key), 'a payment listed twice in one run').toBe(false);
        keysThisRun.add(key);
        expect(m.viaRouter).toBe(true);
        expect(m.receipt).toBe('verified');
        found.set(m.announcement.id, (found.get(m.announcement.id) ?? 0) + 1);
      }
      for (const msg of worker.received) if (msg.type === 'batch') for (const l of msg.logs) {
        const prior = realSeen.get(l.id);
        if (prior !== undefined) { realSeen.set(l.id, prior + 1); continue; }
        const [hash, index] = l.id.split(':');
        const slot = Number(BigInt(hash ?? '0')) * SPAM_PER_BLOCK + Number(index);
        spamSeen[slot] = (spamSeen[slot] ?? 0) + 1;
      }
      if ((res.backlog ?? 0) > 0) {
        backlogRuns++;
        // The deferred page is the one after the budget: the cursor is held at its first block and the checkpoint never passes it.
        if (res.cursor.nextBlock % PAGE !== 0n || (store.load(84532, KEY)?.nextBlock ?? 0n) > res.cursor.nextBlock) heldCursorOk = false;
        expect(res.backlog).toBe(SPAM_PER_BLOCK * Number(PAGE));
      }
      finished = (res.backlog ?? 0) === 0 && !res.limitReached && res.cursor.nextBlock === HEAD + 1n;
    }
    expect(finished).toBe(true);
    expect(heldCursorOk).toBe(true);
    // 100 pages of 10,000 open-lane logs at a 20,000 budget: two pages per run, the third deferred.
    expect(runs).toBe(50);
    expect(backlogRuns).toBe(49);
    // All ten found, each reported from exactly one run, and each reached the worker exactly once.
    expect([...found.keys()].sort()).toEqual(real.map((r) => r.announcement.id).sort());
    expect([...found.values()].every((n) => n === 1)).toBe(true);
    expect([...realSeen.values()].every((n) => n === 1)).toBe(true);
    // Every one of the million spam logs reached the worker exactly once: deferred, never skipped, never repeated.
    let once = 0;
    let other = 0;
    for (const n of spamSeen) if (n === 1) once++; else other++;
    expect(once).toBe(SPAM_TOTAL);
    expect(other).toBe(0);
    expect(store.load(84532, KEY)?.nextBlock).toBe(HEAD + 1n - BigInt(chain.finalityDepth));
  }, 120_000);
});
