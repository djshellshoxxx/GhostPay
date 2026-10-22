import { parseMetadata, type CompressedPoint, type ParsedMetadata, type SecretScalar } from '@ghostpay/core-crypto';
import { encodeFunctionData, getAddress, keccak256, toBytes } from 'viem/utils';
import { erc20Abi } from './abi/erc20.js';
import type { ChainConfig } from './config/chains.js';
import { findToken } from './config/tokens.js';
import { checkAnnouncementDeep } from './deepscan.js';
import { ChainAdapterError, fail } from './errors.js';
import { ANNOUNCEMENT_TOPIC, validateAnnouncementLog, type ScannedAnnouncement } from './logs.js';
import { parseQuantity, type RpcClient, type RpcLog } from './rpc.js';
import type { Address, Hex } from './types.js';

/** Announcement that matched a viewing key, before any on-chain verification. */
export interface ClaimedPayment {
  readonly stealthAddress: Address;
  readonly announcement: ScannedAnnouncement;
  /** Parsed router-layout metadata. EVERYTHING in it is a claim made by whoever called the announcer. */
  readonly metadata: ParsedMetadata | undefined;
  /** True when the announcement's caller is this chain's router. */
  readonly viaRouter: boolean;
}

/** Evidence collected for a claim. */
export type Evidence = 'router-caller' | 'block-hash' | 'transfer-log' | 'balance' | 'receipt';

/** Verification outcome shown to the seller. Only `received` may be described as money received. */
export interface PaymentVerification {
  /**
   * - `received`: router announcement, canonical block, and an independent on-chain trace of the claimed net amount;
   * - `unverified-announcement`: not from the router; anyone can post such announcements with any token and amount;
   * - `unverified-claim`: from the router but the evidence could not be established (reason given).
   */
  readonly status: 'received' | 'unverified-announcement' | 'unverified-claim';
  readonly reason?: string;
  /** `head - block + 1`; 0n when unknown. */
  readonly confirmations: bigint;
  /** `confirmations >= chain.finalityDepth`. */
  readonly final: boolean;
  /** Current balance of the claimed asset at the one-time address, only when explicitly requested. */
  readonly observedBalance?: bigint;
  readonly evidence: readonly Evidence[];
  /** Stable identity of the exact event/transaction supporting this payment. */
  readonly evidenceId?: string;
}

const TRANSFER_TOPIC: Hex = keccak256(toBytes('Transfer(address,address,uint256)'));
const pad = (a: string): Hex => `0x${'0'.repeat(24)}${a.slice(2).toLowerCase()}`;
const q = (n: bigint): string => `0x${n.toString(16)}`;
const HASH32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Collapses duplicate announcements for the same one-time address and ephemeral key (replays by third parties).
 *
 * @remarks Within a group the genuine router announcement is preferred, then the earliest `(block, logIndex)`. The
 * result keeps the order of first appearance. `duplicates` counts what was dropped, so the UI can say so.
 *
 * @param items Matches.
 * @returns Unique matches plus the number of dropped duplicates.
 */
export function dedupeClaims<T extends ClaimedPayment>(items: readonly T[]): { readonly items: readonly T[]; readonly duplicates: number } {
  const best = new Map<string, T>();
  const order: string[] = [];
  const better = (a: T, b: T): boolean => {
    if (a.viaRouter !== b.viaRouter) return a.viaRouter;
    if (a.announcement.blockNumber !== b.announcement.blockNumber) return a.announcement.blockNumber < b.announcement.blockNumber;
    return a.announcement.logIndex < b.announcement.logIndex;
  };
  for (const it of items) {
    const key = `${it.stealthAddress.toLowerCase()}|${it.announcement.ephemeralPublicKey.toLowerCase()}`;
    const cur = best.get(key);
    if (cur === undefined) {
      best.set(key, it);
      order.push(key);
    } else if (better(it, cur)) best.set(key, it);
  }
  return { items: order.map((k) => best.get(k) as T), duplicates: items.length - order.length };
}

async function readBalanceOf(client: RpcClient, owner: Address, asset: Address | 'native'): Promise<bigint | undefined> {
  try {
    if (asset === 'native') return parseQuantity(await client.request('eth_getBalance', [owner, 'latest']));
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
    const r = await client.request('eth_call', [{ to: asset, data }, 'latest']);
    return typeof r === 'string' && /^0x[0-9a-fA-F]{64}$/.test(r) ? BigInt(r) : undefined;
  } catch {
    return undefined;
  }
}

/** Input of {@link verifyClaimedPayment}. */
export interface VerifyClaimInput {
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  /** Router and announcer from the verified deployment. */
  readonly router: Address;
  readonly announcer: Address;
  readonly claim: ClaimedPayment;
  /** Optional independent provider; evidence must match before a claim can be called received. */
  readonly secondaryClient?: RpcClient;
  /** Opt into a per-address read. Disabled by default because it reveals the match to the RPC provider. */
  readonly observeBalance?: boolean;
  /** Per-scan set of already credited transfer IDs. Updated only when verification succeeds. */
  readonly consumedTransfers?: Set<string>;
}

/**
 * Establishes what can honestly be said about an announcement that matched the seller's viewing key (S3-02, G-04).
 *
 * @remarks Announcement metadata (token, amount, "net") is a CLAIM: anyone may call the announcer with any bytes.
 * A claim is `received` only when ALL of these hold: the caller is the router; the log's block hash is the canonical
 * hash of that block on the user's RPC; and the transfer is independently traced: for ERC-20 the token emitted
 * `Transfer(router -> oneTimeAddress, net)` in that same transaction and block, for the native coin a successful
 * canonical receipt and transaction show the exact announcement and a router call carrying at least that value.
 * A balance alone is never evidence of this payment. A lying RPC can fake all of it; configure a second provider to
 * compare evidence. Reads never throw: RPC
 * failures degrade to `unverified-claim`.
 *
 * @param i Input.
 * @returns Verification result with confirmation depth against `chain.finalityDepth`.
 */
export async function verifyClaimedPayment(i: VerifyClaimInput): Promise<PaymentVerification> {
  const primary = await verifyClaimedPaymentOnClient(i);
  if (primary.status !== 'received') return primary;
  if (i.secondaryClient !== undefined) {
    const secondary = await verifyClaimedPaymentOnClient({ chain: i.chain, client: i.secondaryClient, router: i.router, announcer: i.announcer, claim: i.claim });
    if (secondary.status !== 'received' || secondary.evidenceId !== primary.evidenceId || secondary.final !== primary.final || secondary.evidence.join('|') !== primary.evidence.join('|')) {
      const { evidenceId: _evidenceId, ...withoutEvidenceId } = primary;
      return { ...withoutEvidenceId, status: 'unverified-claim', reason: 'The two RPC providers did not agree on the payment evidence.' };
    }
  }
  if (primary.evidenceId !== undefined && i.consumedTransfers?.has(primary.evidenceId) === true) {
    const { evidenceId: _evidenceId, ...withoutEvidenceId } = primary;
    return { ...withoutEvidenceId, status: 'unverified-claim', reason: 'This transfer evidence has already been credited to another announcement in this scan.' };
  }
  if (primary.evidenceId !== undefined) i.consumedTransfers?.add(primary.evidenceId);
  return primary;
}

async function verifyClaimedPaymentOnClient(i: VerifyClaimInput): Promise<PaymentVerification> {
  const { claim, client, chain } = i;
  const a = claim.announcement;
  const evidence: Evidence[] = [];
  let evidenceId: string | undefined;
  let confirmations = 0n;
  const done = (status: PaymentVerification['status'], reason: string | undefined, observed: bigint | undefined): PaymentVerification => ({
    status,
    ...(reason === undefined ? {} : { reason }),
    confirmations,
    final: confirmations >= BigInt(chain.finalityDepth),
    ...(observed === undefined ? {} : { observedBalance: observed }),
    evidence,
    ...(evidenceId === undefined ? {} : { evidenceId }),
  });
  const meta = claim.metadata;
  const asset: Address | 'native' | undefined = meta === undefined ? undefined : meta.kind === 'native' ? 'native' : meta.token;
  // Only look at assets we know: reading an arbitrary attacker-named contract adds nothing a seller can act on.
  const readable = i.observeBalance === true && (asset === 'native' || (asset !== undefined && findToken(chain.chainId, asset) !== undefined));
  if (!claim.viaRouter) {
    const observed = client.chainId === chain.chainId && readable && asset !== undefined ? await readBalanceOf(client, claim.stealthAddress, asset) : undefined;
    return done('unverified-announcement', 'Not posted by the GhostPay router. Anyone can post an announcement with any token and amount.', observed);
  }
  if (client.chainId !== chain.chainId || claim.announcement.caller.toLowerCase() !== i.router.toLowerCase()) {
    return done('unverified-claim', 'The RPC chain or announcing caller does not match the verified deployment.', undefined);
  }
  const observed = readable && asset !== undefined ? await readBalanceOf(client, claim.stealthAddress, asset) : undefined;
  evidence.push('router-caller');
  if (meta === undefined || asset === undefined) return done('unverified-claim', 'The announcement metadata is not in the router layout.', observed);
  if (a.blockNumber < 0n || meta.netAmount <= 0n || (meta.kind === 'erc20' && findToken(chain.chainId, meta.token) === undefined)) return done('unverified-claim', 'The announcement position or metadata is invalid or names an unsupported asset.', observed);
  try {
    const head = await client.blockNumber();
    confirmations = head >= a.blockNumber ? head - a.blockNumber + 1n : 0n;
    const block = await client.getBlock(a.blockNumber);
    if (block === null || block.hash.toLowerCase() !== a.blockHash.toLowerCase()) {
      return done('unverified-claim', 'The announcement’s block hash is not the canonical hash of that block on your RPC.', observed);
    }
    evidence.push('block-hash');
    if (meta.kind === 'erc20') {
      const logs = await client.request('eth_getLogs', [
        { address: meta.token, fromBlock: q(a.blockNumber), toBlock: q(a.blockNumber), topics: [TRANSFER_TOPIC, pad(i.router), pad(claim.stealthAddress)] },
      ]);
      const hit = Array.isArray(logs) ? (logs as RpcLog[]).find((l) => transferMatches(l, meta.token, i.router, claim.stealthAddress, a, meta.netAmount)) : undefined;
      if (hit === undefined) return done('unverified-claim', 'No matching token Transfer from the router to the one-time address was found in that block.', observed);
      evidenceId = transferEvidenceId(meta.token, a.blockNumber, hit);
      if (evidenceId === undefined) return done('unverified-claim', 'The token Transfer log omitted its canonical transaction or position.', observed);
      if (i.consumedTransfers?.has(evidenceId) === true) return done('unverified-claim', 'This transfer evidence has already been credited to another announcement in this scan.', observed);
      evidence.push('transfer-log');
    } else if (await receiptCarries(client, i.router, i.announcer, a, meta.netAmount)) {
      evidence.push('receipt');
      // A native transaction is one indivisible value transfer. Do not let multiple announcement
      // logs in the same transaction spend its receipt evidence more than once.
      evidenceId = `native:${a.blockNumber.toString()}:${a.transactionHash?.toLowerCase() ?? ''}:${a.blockHash.toLowerCase()}`;
    } else {
      return done('unverified-claim', 'A successful canonical router transaction tied to this announcement was not found.', observed);
    }
  } catch (e) {
    if (e instanceof ChainAdapterError) return done('unverified-claim', 'Your RPC could not confirm this payment.', observed);
    throw e;
  }
  return done('received', undefined, observed);
}

function transferMatches(l: RpcLog, token: Address, router: Address, stealth: Address, a: ScannedAnnouncement, net: bigint): boolean {
  return (
    typeof l === 'object' &&
    l !== null &&
    l.removed !== true &&
    typeof l.address === 'string' &&
    l.address.toLowerCase() === token.toLowerCase() &&
    typeof l.blockHash === 'string' &&
    l.blockHash.toLowerCase() === a.blockHash.toLowerCase() &&
    l.blockNumber !== undefined && parseQuantity(l.blockNumber) === a.blockNumber &&
    Array.isArray(l.topics) && l.topics.length === 3 &&
    l.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase() &&
    l.topics[1]?.toLowerCase() === pad(router).toLowerCase() &&
    l.topics[2]?.toLowerCase() === pad(stealth).toLowerCase() &&
    typeof l.transactionHash === 'string' && HASH32.test(l.transactionHash) &&
    a.transactionHash !== undefined && l.transactionHash.toLowerCase() === a.transactionHash.toLowerCase() &&
    l.logIndex !== undefined && parseQuantity(l.logIndex) <= 0xffffffn &&
    typeof l.data === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(l.data) &&
    BigInt(l.data) === net
  );
}

function transferEvidenceId(token: Address, block: bigint, l: RpcLog): string | undefined {
  if (typeof l.transactionHash !== 'string' || l.logIndex === undefined) return undefined;
  try {
    return `erc20:${token.toLowerCase()}:${block.toString()}:${l.blockHash?.toLowerCase() ?? ''}:${l.transactionHash.toLowerCase()}:${parseQuantity(l.logIndex).toString()}`;
  } catch {
    return undefined;
  }
}

async function receiptCarries(client: RpcClient, router: Address, announcer: Address, a: ScannedAnnouncement, net: bigint): Promise<boolean> {
  if (a.transactionHash === undefined) return false;
  const [rc, tx] = await Promise.all([
    client.request('eth_getTransactionReceipt', [a.transactionHash]),
    client.request('eth_getTransactionByHash', [a.transactionHash]),
  ]);
  if (typeof rc !== 'object' || rc === null || typeof tx !== 'object' || tx === null) return false;
  const r = rc as Record<string, unknown>;
  const t = tx as Record<string, unknown>;
  if (r['status'] !== '0x1' || typeof r['blockHash'] !== 'string' || r['blockHash'].toLowerCase() !== a.blockHash.toLowerCase() || r['blockNumber'] === undefined || parseQuantity(r['blockNumber']) !== a.blockNumber || typeof r['transactionHash'] !== 'string' || r['transactionHash'].toLowerCase() !== a.transactionHash.toLowerCase()) return false;
  const logs = r['logs'];
  const inReceipt =
    Array.isArray(logs) &&
    (logs as unknown[]).some((x) => {
      const l = x as Record<string, unknown>;
      return typeof l['address'] === 'string' && l['address'].toLowerCase() === announcer.toLowerCase() && typeof l['logIndex'] === 'string' && Number(parseQuantity(l['logIndex'])) === a.logIndex && typeof l['blockHash'] === 'string' && l['blockHash'].toLowerCase() === a.blockHash.toLowerCase() && l['blockNumber'] !== undefined && parseQuantity(l['blockNumber']) === a.blockNumber && typeof l['transactionHash'] === 'string' && l['transactionHash'].toLowerCase() === a.transactionHash!.toLowerCase();
    });
  if (!inReceipt) return false;
  if (typeof t['to'] !== 'string' || t['to'].toLowerCase() !== router.toLowerCase() || typeof t['hash'] !== 'string' || t['hash'].toLowerCase() !== a.transactionHash.toLowerCase() || t['blockNumber'] === undefined || parseQuantity(t['blockNumber']) !== a.blockNumber) return false;
  return parseQuantity(t['value']) >= net;
}

/** One payment found in a transaction by {@link verifyPaymentByTxHash}. */
export interface TxPaymentResult {
  readonly claim: ClaimedPayment;
  readonly verification: PaymentVerification;
  /** False when the payer published a wrong view tag: only a deep scan can find such a payment. */
  readonly tagMatches: boolean;
}

/** Input of {@link verifyPaymentByTxHash}. */
export interface VerifyByTxInput {
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  readonly router: Address;
  readonly announcer: Address;
  readonly txHash: string;
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: CompressedPoint;
}

/**
 * "Did this transaction pay me?" helper (D4 mitigation 2). Fetches the receipt from the user's RPC, takes every
 * announcement the announcer emitted in it, keeps those called by the router, checks each against the seller's keys
 * WITHOUT the view-tag shortcut and verifies each match with {@link verifyClaimedPayment}.
 *
 * @param i Input; `txHash` is user-supplied text and is validated here.
 * @returns Zero or more verified payments (empty when nothing in that transaction is for this seller).
 * @throws {ChainAdapterError} `INVALID_INPUT` (bad hash), `PAYMENT_UNVERIFIED` (no successful receipt), `RPC_FAILURE`.
 */
export async function verifyPaymentByTxHash(i: VerifyByTxInput): Promise<readonly TxPaymentResult[]> {
  if (!HASH32.test(i.txHash)) return fail('INVALID_INPUT', 'a transaction hash is 0x followed by 64 hex digits');
  const txHash = i.txHash.toLowerCase() as Hex;
  const rc = await i.client.request('eth_getTransactionReceipt', [txHash]);
  if (rc === null) return fail('PAYMENT_UNVERIFIED', 'your RPC does not know this transaction');
  if (typeof rc !== 'object') return fail('RPC_FAILURE', 'malformed receipt');
  const r = rc as Record<string, unknown>;
  if (r['status'] !== '0x1') return fail('PAYMENT_UNVERIFIED', 'the transaction did not succeed');
  if (typeof r['transactionHash'] !== 'string' || r['transactionHash'].toLowerCase() !== txHash) {
    return fail('PAYMENT_UNVERIFIED', 'receipt transaction hash does not match the requested transaction');
  }
  const blockNumber = parseQuantity(r['blockNumber']);
  if (typeof r['blockHash'] !== 'string' || !HASH32.test(r['blockHash'])) return fail('RPC_FAILURE', 'malformed receipt block hash');
  const receiptBlock = await i.client.getBlock(blockNumber);
  if (receiptBlock === null || receiptBlock.hash.toLowerCase() !== r['blockHash'].toLowerCase()) {
    return fail('PAYMENT_UNVERIFIED', 'receipt block is not canonical');
  }
  const logs = r['logs'];
  if (!Array.isArray(logs) || logs.length > 2000) return fail('RPC_FAILURE', 'malformed receipt logs');
  const out: TxPaymentResult[] = [];
  const consumedTransfers = new Set<string>();
  for (const raw of logs as RpcLog[]) {
    if (typeof raw !== 'object' || raw === null || typeof raw.address !== 'string' || raw.address.toLowerCase() !== i.announcer.toLowerCase()) continue;
    if (typeof raw.transactionHash !== 'string' || raw.transactionHash.toLowerCase() !== txHash ||
        typeof raw.blockHash !== 'string' || raw.blockHash.toLowerCase() !== r['blockHash'].toLowerCase()) continue;
    if (!Array.isArray(raw.topics) || raw.topics[0] !== ANNOUNCEMENT_TOPIC) continue;
    let a: ScannedAnnouncement | undefined;
    try {
      a = validateAnnouncementLog(raw, i.announcer, 1n, blockNumber, blockNumber);
    } catch (e) {
      if (e instanceof ChainAdapterError) continue;
      throw e;
    }
    if (a === undefined || a.caller.toLowerCase() !== i.router.toLowerCase()) continue;
    const hit = checkAnnouncementDeep(a, i.viewingSecret, i.spendingPublicKey);
    if (!hit.matches) continue;
    let metadata: ParsedMetadata | undefined;
    try {
      metadata = parseMetadata(a.metadata);
    } catch {
      metadata = undefined;
    }
    const claim: ClaimedPayment = { stealthAddress: getAddress(hit.stealthAddress), announcement: a, metadata, viaRouter: true };
    out.push({ claim, tagMatches: hit.tagMatches, verification: await verifyClaimedPayment({ chain: i.chain, client: i.client, router: i.router, announcer: i.announcer, claim, consumedTransfers }) });
  }
  return out;
}
