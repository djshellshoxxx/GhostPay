import type { ChainConfig } from './config/chains.js';
import { ChainAdapterError } from './errors.js';
import { ANNOUNCEMENT_TOPIC, validateAnnouncementLog, type ScannedAnnouncement } from './logs.js';
import type { RpcClient, RpcLog } from './rpc.js';
import type { Address, Hex } from './types.js';

/**
 * Receipt status shown to the seller:
 * - `verified`: attested by the manifest-verified router after moving funds, once the block is `finalityDepth` deep;
 * - `claimed`: announcement metadata only; the transfer could not be confirmed (anyone can announce anything);
 * - `pending`: the announcing block is not yet `finalityDepth` deep.
 */
export type ReceiptStatus = 'verified' | 'claimed' | 'pending';

/** What an announcement asserts. */
export interface ReceiptClaim {
  readonly stealthAddress: Address;
  /** `true` for the native coin; `token` is then ignored. */
  readonly native: boolean;
  readonly token: Address;
  readonly amount: bigint;
  readonly blockNumber: bigint;
  /** Announced by the manifest's router. */
  readonly viaRouter: boolean;
}

/**
 * Decides how much to trust one matched announcement (G-04). Never throws: any RPC failure degrades to `claimed`.
 *
 * @remarks Router announcements are trusted once final (the caller is the manifest-verified router). Direct
 * announcements remain claims: pre-existing or later balances cannot prove an incoming transfer tied to an announcement.
 * Use transaction-bound evidence before describing any direct announcement as a payment received.
 *
 * @param client Verified RPC client.
 * @param chain Chain config (supplies `finalityDepth`).
 * @param claim The announced claim.
 * @returns Receipt status.
 */
export async function verifyReceipt(client: RpcClient, chain: ChainConfig, claim: ReceiptClaim): Promise<ReceiptStatus> {
  if (client.chainId !== chain.chainId || claim.amount <= 0n || claim.blockNumber < 0n) return 'claimed';
  let head: bigint;
  try {
    head = await client.blockNumber();
  } catch {
    return 'claimed';
  }
  const depth = BigInt(chain.finalityDepth);
  if (head < claim.blockNumber + depth) return 'pending';
  if (claim.viaRouter) return 'verified';
  return 'claimed';
}

/** One disagreement between two providers. */
export interface ProviderDiscrepancy {
  readonly kind: 'missing_in_secondary' | 'missing_in_primary' | 'content_differs' | 'block_hash_differs' | 'skipped_count_differs' | 'secondary_behind' | 'secondary_error';
  /** `blockHash:logIndex` or block number; no raw payloads. */
  readonly ref: string;
}

/** Result of {@link compareProviders}. */
export interface ProviderComparison {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly discrepancies: readonly ProviderDiscrepancy[];
}

const key = (a: ScannedAnnouncement): string => [a.stealthAddress, a.ephemeralPublicKey, a.metadata, a.caller, a.blockHash].join('|').toLowerCase();

/**
 * Re-fetches `[fromBlock, toBlock]` from a second, independent provider and compares it with what the primary
 * returned (G-21). Call at each checkpoint. Never throws: failures become discrepancies, the scan decides what to do.
 *
 * @param o `primary`/`secondary` must target the same chain; `primaryAnnouncements` and `primarySkipped` are what
 * the primary produced for exactly this range; `schemeId` defaults to 1.
 * @returns Discrepancies (empty = the providers agree).
 */
export async function compareProviders(o: {
  readonly chain: ChainConfig;
  readonly secondary: RpcClient;
  readonly announcer: Address;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly primaryAnnouncements: readonly ScannedAnnouncement[];
  readonly primarySkipped: number;
  readonly primaryBlockHash?: Hex;
  readonly schemeId?: bigint;
}): Promise<ProviderComparison> {
  const out: ProviderDiscrepancy[] = [];
  const base = { fromBlock: o.fromBlock, toBlock: o.toBlock };
  const schemeId = o.schemeId ?? 1n;
  try {
    if (o.secondary.chainId !== o.chain.chainId) throw new ChainAdapterError('CHAIN_MISMATCH', 'secondary chain');
    if ((await o.secondary.blockNumber()) < o.toBlock) return { ...base, discrepancies: [{ kind: 'secondary_behind', ref: o.toBlock.toString() }] };
    const cap = BigInt(Math.max(1, o.chain.getLogsMaxRange));
    const theirs = new Map<string, ScannedAnnouncement>();
    let skipped = 0;
    const topic1: Hex = `0x${schemeId.toString(16).padStart(64, "0")}`;
    for (let from = o.fromBlock; from <= o.toBlock; from += cap) {
      const to = from + cap - 1n > o.toBlock ? o.toBlock : from + cap - 1n;
      const logs: readonly RpcLog[] = await o.secondary.getLogs({ address: o.announcer, topics: [ANNOUNCEMENT_TOPIC, topic1], fromBlock: from, toBlock: to });
      for (const l of logs) {
        const a = validateAnnouncementLog(l, o.announcer, schemeId, from, to);
        if (a === undefined) skipped++;
        else theirs.set(a.id, a);
      }
    }
    // Ids are keyed by block hash, so a fork on either side shows up as missing on both.
    const mine = new Map(o.primaryAnnouncements.map((a) => [a.id, a] as const));
    for (const [id, a] of mine) {
      const t = theirs.get(id);
      if (t === undefined) out.push({ kind: 'missing_in_secondary', ref: id });
      else if (key(t) !== key(a)) out.push({ kind: 'content_differs', ref: id });
    }
    for (const id of theirs.keys()) if (!mine.has(id)) out.push({ kind: 'missing_in_primary', ref: id });
    if (skipped !== o.primarySkipped) out.push({ kind: 'skipped_count_differs', ref: `${String(o.primarySkipped)}/${String(skipped)}` });
    if (o.primaryBlockHash !== undefined) {
      const b = await o.secondary.getBlock(o.toBlock);
      if (b === null || b.hash.toLowerCase() !== o.primaryBlockHash.toLowerCase()) out.push({ kind: 'block_hash_differs', ref: o.toBlock.toString() });
    }
  } catch {
    out.push({ kind: 'secondary_error', ref: o.toBlock.toString() });
  }
  return { ...base, discrepancies: out };
}
