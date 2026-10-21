import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { checksum, isHash32, normAddress, parseQty, toQty, type Address, type Hex } from './addr.js';
import { fail } from './errors.js';
import { assertTestnetChain } from './testnet.js';

/** topic0 of ERC-20 `Transfer(address,address,uint256)`. */
export const TRANSFER_TOPIC: Hex = `0x${bytesToHex(keccak_256(new TextEncoder().encode('Transfer(address,address,uint256)')))}`;

/** Default number of decoy addresses (unmeasured guess, spec Q2). */
export const DEFAULT_DECOYS = 7;
/** Default spent-check block cap (unmeasured guess, spec Q2). */
export const DEFAULT_SPENT_CAP = 20_000;

/** Client surface needed here. `chainId` is read for the testnet guard. */
export type VerifyRpc = Pick<RpcClient, 'request' | 'chainId'>;
/** A client that can send one JSON-RPC batch (not in chain-adapters yet; see wiring doc). */
export type BatchRpc = VerifyRpc & {
  batch?(calls: readonly { method: string; params: readonly unknown[] }[]): Promise<readonly unknown[]>;
};

/** Parsed, validated ERC-20 Transfer log. */
export interface TransferLog {
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
}

const DATA_RE = /^0x[0-9a-fA-F]{64}$/;
const PAD_ADDR_RE = /^0x0{24}[0-9a-fA-F]{40}$/;

/**
 * Strict parse of raw `eth_getLogs` output (HY-VER-7).
 *
 * @remarks Keeps only entries with topic0 = Transfer, exactly 3 topics (address topics zero-padded),
 * 32-byte data, a 32-byte transaction hash and a valid block quantity, and `removed !== true`.
 * Everything else (including non-array input) is dropped silently; nothing here throws.
 * Addresses in the output are lowercase.
 *
 * @param raw Untrusted RPC result.
 * @returns Validated logs.
 */
export function parseTransferLogs(raw: unknown): TransferLog[] {
  if (!Array.isArray(raw)) return [];
  const out: TransferLog[] = [];
  for (const e of raw as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const o = e as Record<string, unknown>;
    const topics = o['topics'];
    if (!Array.isArray(topics) || topics.length !== 3) continue;
    const [t0, t1, t2] = topics as unknown[];
    if (typeof t0 !== 'string' || t0.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (typeof t1 !== 'string' || typeof t2 !== 'string' || !PAD_ADDR_RE.test(t1) || !PAD_ADDR_RE.test(t2))
      continue;
    const data = o['data'];
    if (typeof data !== 'string' || !DATA_RE.test(data)) continue;
    const tx = o['transactionHash'];
    if (!isHash32(tx)) continue;
    const bn = parseQty(o['blockNumber']);
    if (bn === undefined) continue;
    if (o['removed'] === true) continue;
    out.push({
      transactionHash: tx.toLowerCase() as Hex,
      blockNumber: bn,
      from: `0x${t1.slice(26)}`.toLowerCase() as Address,
      to: `0x${t2.slice(26)}`.toLowerCase() as Address,
      value: BigInt(data),
    });
  }
  return out;
}

/**
 * Defence in depth for HY-VER-1: throws if serialized params contain any forbidden address, in plain or 32-byte padded form, any case.
 * @throws {HygieneError} `ADDRESS_LEAK`.
 */
export function assertAddressFree(params: readonly unknown[], forbidden: readonly string[]): void {
  const s = JSON.stringify(params).toLowerCase();
  for (const f of forbidden) {
    if (s.includes(normAddress(f).slice(2))) fail('ADDRESS_LEAK', 'request would name a protected address');
  }
}

async function transferLogs(
  rpc: VerifyRpc,
  token: Address,
  from: bigint,
  to: bigint,
  protectedAddrs: readonly string[],
): Promise<TransferLog[]> {
  const params = [
    { address: checksum(token), fromBlock: toQty(from), toBlock: toQty(to), topics: [TRANSFER_TOPIC] },
  ];
  assertAddressFree(params, protectedAddrs);
  const res = await rpc.request('eth_getLogs', params);
  if (!Array.isArray(res)) return fail('RPC_MALFORMED', 'eth_getLogs result is not an array');
  return parseTransferLogs(res);
}

function requireBig(n: bigint, positive: boolean): void {
  if (typeof n !== 'bigint' || n < 0n || (positive && n === 0n)) fail('INVALID_INPUT', 'bad bigint');
}

/**
 * Address-free payment receipt check (HY-VER-1/2): reads Transfer logs of `token` in block `block`
 * (topic0 only; the only address in the request is the token) and matches locally.
 *
 * @returns `confirmed` (a log in `txHash` has `to == stealth` and `value == net`), `mismatch` (the tx has Transfer logs but none match), `absent` (no log of that tx in the block).
 * @throws {HygieneError} `CHAIN_NOT_ALLOWED`, `INVALID_INPUT`, `INVALID_ADDRESS`, `RPC_MALFORMED`.
 * @security The RPC learns that someone read Transfers of `token` in `block`; it does not learn the stealth address. Hides nothing from a global observer. UNVERIFIED against a live RPC.
 */
export async function addressFreeReceipt(
  rpc: VerifyRpc,
  a: { token: Address; block: bigint; txHash: Hex; stealth: Address; net: bigint },
): Promise<'confirmed' | 'mismatch' | 'absent'> {
  assertTestnetChain(rpc.chainId);
  const token = normAddress(a.token);
  const stealth = normAddress(a.stealth);
  if (token === stealth) fail('INVALID_INPUT', 'token equals stealth');
  if (!isHash32(a.txHash)) fail('INVALID_INPUT', 'bad tx hash');
  requireBig(a.block, false);
  requireBig(a.net, true);
  const logs = await transferLogs(rpc, token, a.block, a.block, [stealth]);
  const mine = logs.filter((l) => l.transactionHash === a.txHash.toLowerCase());
  if (mine.length === 0) return 'absent';
  return mine.some((l) => l.to === stealth && l.value === a.net) ? 'confirmed' : 'mismatch';
}

/**
 * Address-free post-sweep confirmation: reads `[head-lookback, head]` Transfer logs of `token` (topic0 only)
 * and matches `(from, to, value)` locally. Does NOT call `eth_getTransactionReceipt`.
 *
 * @param a.lookback Blocks behind head, integer 0..64, default 3.
 * @throws {HygieneError} as {@link addressFreeReceipt}.
 * @security UNVERIFIED against a live RPC. A reorg or a slow inclusion past the window yields `false`: retry, do not assume failure.
 */
export async function sweepConfirmed(
  rpc: VerifyRpc,
  a: { token: Address; from: Address; to: Address; net: bigint; head: bigint; lookback?: number },
): Promise<boolean> {
  assertTestnetChain(rpc.chainId);
  const token = normAddress(a.token);
  const from = normAddress(a.from);
  const to = normAddress(a.to);
  requireBig(a.head, false);
  requireBig(a.net, true);
  const lb = a.lookback ?? 3;
  if (!Number.isInteger(lb) || lb < 0 || lb > 64) fail('INVALID_INPUT', 'lookback out of range');
  const start = a.head >= BigInt(lb) ? a.head - BigInt(lb) : 0n;
  const logs = await transferLogs(rpc, token, start, a.head, [from, to]);
  return logs.some((l) => l.from === from && l.to === to && l.value === a.net);
}

/** Result of {@link spentCheck}. */
export interface SpentCheck {
  /** Sum of Transfer values with `from == stealth` seen in the scanned range. */
  readonly outflow: bigint;
  readonly spent: boolean;
  /** `net - outflow`, floored at 0; excludes direct (non-router) inflows. */
  readonly balanceEstimate: bigint;
  /** True if the range was capped or direct non-router inflows/outflows are possible: UI shows "may be incomplete". */
  readonly mayBeIncomplete: boolean;
  readonly scannedTo: bigint;
}

/**
 * Spent-check by Transfer logs (HY-VER-3): topic0-only reads from `fromBlock` forward in chunks, filtered locally for `from == stealth`.
 *
 * @param a.cap Max blocks scanned, default 20 000. If `head` is further, the scan stops at `fromBlock + cap - 1` and `mayBeIncomplete` is true.
 * @param a.chunk Blocks per request, default 2 000.
 * @param a.routerOnly Set true only if every inflow came through the router; otherwise `mayBeIncomplete` is always true.
 * @security Bandwidth grows with token activity. UNVERIFIED: cap and chunk are unmeasured guesses. Native balances have no log: not supported here.
 */
export async function spentCheck(
  rpc: VerifyRpc,
  a: {
    token: Address;
    stealth: Address;
    fromBlock: bigint;
    head: bigint;
    net: bigint;
    cap?: number;
    chunk?: number;
    routerOnly?: boolean;
  },
): Promise<SpentCheck> {
  assertTestnetChain(rpc.chainId);
  const token = normAddress(a.token);
  const stealth = normAddress(a.stealth);
  requireBig(a.fromBlock, false);
  requireBig(a.head, false);
  requireBig(a.net, true);
  const cap = a.cap ?? DEFAULT_SPENT_CAP;
  const chunk = a.chunk ?? 2_000;
  if (!Number.isInteger(cap) || cap < 1 || !Number.isInteger(chunk) || chunk < 1)
    fail('INVALID_INPUT', 'bad cap or chunk');
  if (a.head < a.fromBlock) fail('INVALID_INPUT', 'head before fromBlock');
  const capEnd = a.fromBlock + BigInt(cap) - 1n;
  const end = a.head < capEnd ? a.head : capEnd;
  const capped = end < a.head;
  let outflow = 0n;
  for (let s = a.fromBlock; s <= end; s += BigInt(chunk)) {
    const e = s + BigInt(chunk) - 1n < end ? s + BigInt(chunk) - 1n : end;
    for (const l of await transferLogs(rpc, token, s, e, [stealth]))
      if (l.from === stealth) outflow += l.value;
  }
  return {
    outflow,
    spent: outflow > 0n,
    balanceEstimate: a.net > outflow ? a.net - outflow : 0n,
    mayBeIncomplete: capped || a.routerOnly !== true,
    scannedTo: end,
  };
}

/** Uniform integer in [0, n) by rejection sampling. */
function uniform(n: number, rng: Pick<Crypto, 'getRandomValues'>): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (;;) {
    rng.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return v % n;
  }
}

function shuffle<T>(xs: T[], rng: Pick<Crypto, 'getRandomValues'>): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = uniform(i + 1, rng);
    const t = xs[i] as T;
    xs[i] = xs[j] as T;
    xs[j] = t;
  }
  return xs;
}

function defaultRng(): Pick<Crypto, 'getRandomValues'> {
  const c = (globalThis as { crypto?: Pick<Crypto, 'getRandomValues'> }).crypto;
  if (c === undefined) return fail('INVALID_INPUT', 'no secure random source');
  return c;
}

/**
 * Picks `k` distinct decoy addresses from `pool`, never one in `exclude` (HY-VER-4).
 *
 * @param pool Candidate addresses, e.g. `stealthAddress` of other announcements in the scanned range.
 * @param exclude Addresses the user owns (all of them) and the real target.
 * @throws {HygieneError} `DECOY_SHORTAGE` if fewer than `k` eligible distinct addresses; `INVALID_ADDRESS`; `INVALID_INPUT`.
 * @security Anonymity of decoys is unmeasured and weak against an RPC that sees repeated sessions from one IP.
 */
export function pickDecoys(
  pool: readonly string[],
  exclude: readonly string[],
  k: number,
  rng?: Pick<Crypto, 'getRandomValues'>,
): Address[] {
  if (!Number.isInteger(k) || k < 1 || k > 64) fail('INVALID_INPUT', 'bad k');
  const ex = new Set(exclude.map((x) => normAddress(x)));
  const eligible = [...new Set(pool.map((x) => normAddress(x)))].filter((x) => !ex.has(x));
  if (eligible.length < k) fail('DECOY_SHORTAGE', 'not enough eligible decoys');
  return shuffle(eligible, rng ?? defaultRng())
    .slice(0, k)
    .map((a) => checksum(a));
}

/** A per-address read that cannot be made address-free. */
export interface ReadCall {
  readonly method: 'eth_getBalance' | 'eth_getTransactionCount' | 'eth_getCode';
  readonly address: Address;
}

/**
 * Sends `real` with decoys as one JSON-RPC batch in shuffled order and returns only the real answer (HY-VER-4).
 *
 * @param opts.minDecoys Minimum decoys, default 7.
 * @param opts.allowUnbatched If the client has no `batch`, fail closed unless true; then the calls are sent concurrently as separate requests (weaker: the RPC can still see them as one burst).
 * @throws {HygieneError} `CHAIN_NOT_ALLOWED`, `DECOY_SHORTAGE` (fewer than minDecoys, duplicates, or decoy equal to real), `BATCH_UNSUPPORTED`, `RPC_MALFORMED`.
 * @security Tells the RPC "one of these 8 is mine". UNVERIFIED against a live RPC; effect depends on decoys looking unrelated.
 */
export async function batchedRead(
  rpc: BatchRpc,
  real: ReadCall,
  decoys: readonly string[],
  opts: { minDecoys?: number; allowUnbatched?: boolean; rng?: Pick<Crypto, 'getRandomValues'> } = {},
): Promise<unknown> {
  assertTestnetChain(rpc.chainId);
  const realAddr = normAddress(real.address);
  const ds = decoys.map((d) => normAddress(d));
  if (new Set(ds).size !== ds.length || ds.includes(realAddr))
    fail('DECOY_SHORTAGE', 'decoys must be distinct and differ from the target');
  if (ds.length < (opts.minDecoys ?? DEFAULT_DECOYS)) fail('DECOY_SHORTAGE', 'too few decoys');
  const entries = [{ real: true, a: realAddr }, ...ds.map((a) => ({ real: false, a }))];
  shuffle(entries, opts.rng ?? defaultRng());
  const calls = entries.map((e) => ({ method: real.method, params: [checksum(e.a), 'latest'] as const }));
  let results: readonly unknown[];
  if (rpc.batch !== undefined) {
    results = await rpc.batch(calls);
  } else if (opts.allowUnbatched === true) {
    results = await Promise.all(calls.map((c) => rpc.request(c.method, c.params)));
  } else {
    return fail('BATCH_UNSUPPORTED', 'client has no batch support');
  }
  if (!Array.isArray(results) || results.length !== calls.length)
    return fail('RPC_MALFORMED', 'batch size mismatch');
  return results[entries.findIndex((e) => e.real)];
}
