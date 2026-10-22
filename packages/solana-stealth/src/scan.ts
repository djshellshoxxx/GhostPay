import { base58 } from '@scure/base';
import { parseAnnouncementMemo, type Announcement } from './announcement.js';
import type { PublicPoint } from './ed25519.js';
import { fail, SolanaStealthError } from './errors.js';
import { MEMO_PROGRAM, SCANNED_MEMO_PROGRAMS } from './programs.js';
import {
  getSignaturesForAddress,
  getSlot,
  getTransaction,
  type RpcTransaction,
  type SolanaRpc,
} from './rpc.js';
import type { SecretScalar } from './secret.js';
import { checkAnnouncement } from './stealth.js';

/** An announcement found in a confirmed, successful transaction. */
export interface AnnouncementRecord {
  readonly signature: string;
  readonly slot: bigint;
  readonly announcement: Announcement;
  readonly tx: RpcTransaction;
}

/** Options of {@link fetchAnnouncements}. */
export interface FetchAnnouncementsOptions {
  readonly fromSlot: bigint;
  /** Inclusive; defaults to the finalized head. */
  readonly toSlot?: bigint;
  /** Address whose history is paged (default: the SPL memo program). */
  readonly indexAddress?: string;
  readonly pageLimit?: number;
  readonly maxPages?: number;
  readonly signal?: AbortSignal;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted === true) fail('ABORTED');
}

/** Memo texts of the transaction's top-level memo instructions (inner CPI memos are ignored). */
export function memosOf(tx: RpcTransaction): string[] {
  const out: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const ix of tx.instructions) {
    const program = tx.accountKeys[ix.programIdIndex];
    if (program === undefined || !SCANNED_MEMO_PROGRAMS.includes(program as never)) continue;
    try {
      out.push(decoder.decode(base58.decode(ix.data)));
    } catch {
      // not valid base58 / UTF-8: not an announcement
    }
  }
  return out;
}

/**
 * Pages `getSignaturesForAddress(indexAddress)` from the head back to `fromSlot` and yields every
 * well-formed GhostPay announcement in successful transactions, newest first.
 *
 * @remarks PoC indexing strategy: paging the global memo program is O(all memos) and leaks the
 * scanner's interest only as "a GhostPay scanner", but it is slow on mainnet. ADR-0017 specifies
 * a dedicated announcer program (out of scope) whose id would be passed as `indexAddress`.
 * Malformed announcements are skipped, never thrown, so one bad memo cannot stop a scan.
 */
export async function* fetchAnnouncements(
  rpc: SolanaRpc,
  opts: FetchAnnouncementsOptions,
): AsyncGenerator<AnnouncementRecord> {
  const { signal } = opts;
  const indexAddress: string = opts.indexAddress ?? MEMO_PROGRAM;
  const limit = opts.pageLimit ?? 1000;
  const maxPages = opts.maxPages ?? 10_000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) fail('INVALID_INPUT');
  if (opts.fromSlot < 0n) fail('INVALID_INPUT');
  const toSlot = opts.toSlot ?? (await getSlot(rpc, 'finalized', signal));
  if (toSlot < opts.fromSlot) fail('INVALID_INPUT');
  let before: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    checkAbort(signal);
    const sigs = await getSignaturesForAddress(
      rpc,
      indexAddress,
      before === undefined ? { limit } : { limit, before },
      signal,
    );
    for (const s of sigs) {
      checkAbort(signal);
      if (s.slot > toSlot || s.failed) continue;
      if (s.slot < opts.fromSlot) return;
      const tx = await getTransaction(rpc, s.signature, 'finalized', signal);
      if (tx === null || tx.failed) continue;
      if (tx.slot !== s.slot) fail('INVALID_RESPONSE');
      for (const memo of memosOf(tx)) {
        let announcement: Announcement | null;
        try {
          announcement = parseAnnouncementMemo(memo);
        } catch (e) {
          if (e instanceof SolanaStealthError) continue;
          throw e;
        }
        if (announcement !== null) yield { signature: s.signature, slot: s.slot, announcement, tx };
      }
    }
    if (sigs.length < limit) return;
    before = sigs[sigs.length - 1]?.signature;
  }
  fail('UNSUPPORTED'); // page cap reached: refuse to report a silently truncated scan
}

/** Token amount credited to accounts owned by the stealth address in one transaction. */
export interface TokenReceipt {
  readonly mint: string;
  readonly tokenAccount: string;
  readonly amount: bigint;
}

/** A payment that matches the view key. */
export interface DetectedSolanaPayment {
  readonly family: 'solana';
  readonly signature: string;
  readonly slot: bigint;
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: PublicPoint;
  readonly viewTag: number;
  /** Net lamports credited to the stealth address in this transaction. */
  readonly lamportsReceived: bigint;
  readonly tokenReceipts: readonly TokenReceipt[];
  /** Add the spend secret to get the spend key (`deriveSpendKey`). Secret. */
  readonly tweak: SecretScalar;
}

/** Credits observed for `owner` in `tx`. */
export function creditsFor(tx: RpcTransaction, owner: string): { lamports: bigint; tokens: TokenReceipt[] } {
  let lamports = 0n;
  const i = tx.accountKeys.indexOf(owner);
  if (i >= 0) {
    const pre = tx.preBalances[i] ?? 0n;
    const post = tx.postBalances[i] ?? 0n;
    if (post > pre) lamports = post - pre;
  }
  const tokens: TokenReceipt[] = [];
  for (const post of tx.postTokenBalances) {
    if (post.owner !== owner) continue;
    const pre = tx.preTokenBalances.find((p) => p.accountIndex === post.accountIndex);
    const delta = post.amount - (pre?.amount ?? 0n);
    const account = tx.accountKeys[post.accountIndex];
    if (delta > 0n && account !== undefined) {
      tokens.push({ mint: post.mint, tokenAccount: account, amount: delta });
    }
  }
  return { lamports, tokens };
}

/**
 * Filters announcements down to payments for `(v, S)`.
 *
 * @remarks Announcements whose derived stealth address received nothing in the same
 * transaction are dropped: anyone who knows `V` can publish a matching memo without paying.
 * Detections are deduplicated by `(signature, stealthAddress)` (records of one tx are contiguous).
 */
export async function* scanAnnouncements(
  records: AsyncIterable<AnnouncementRecord>,
  viewSecret: SecretScalar,
  spendPublicKey: Uint8Array,
  signal?: AbortSignal,
): AsyncGenerator<DetectedSolanaPayment> {
  // Repeated memos in one tx re-derive the same P and the same whole-tx credit: report once.
  let seenSignature: string | undefined;
  let seenAddresses = new Set<string>();
  for await (const rec of records) {
    checkAbort(signal);
    const { ephemeralPublicKey, viewTag } = rec.announcement;
    const m = checkAnnouncement(viewSecret, spendPublicKey, ephemeralPublicKey, viewTag);
    if (m === null) continue;
    if (rec.signature !== seenSignature) {
      seenSignature = rec.signature;
      seenAddresses = new Set();
    }
    if (seenAddresses.has(m.stealthAddress)) continue;
    seenAddresses.add(m.stealthAddress);
    const credits = creditsFor(rec.tx, m.stealthAddress);
    if (credits.lamports === 0n && credits.tokens.length === 0) continue;
    yield {
      family: 'solana',
      signature: rec.signature,
      slot: rec.slot,
      stealthAddress: m.stealthAddress,
      ephemeralPublicKey,
      viewTag,
      lamportsReceived: credits.lamports,
      tokenReceipts: credits.tokens,
      tweak: m.tweak,
    };
  }
}
