import { parseMetadata, type CompressedPoint, type ParsedMetadata, type SecretScalar } from '@ghostpay/core-crypto';
import { encodeFunctionData, getAddress, keccak256, toBytes } from 'viem/utils';
import { erc20Abi } from './abi/erc20.js';
import type { ChainConfig } from './config/chains.js';
import { findToken } from './config/tokens.js';
import { checkAnnouncementDeep } from './deepscan.js';
import { ChainAdapterError, fail } from './errors.js';
import { ANNOUNCEMENT_TOPIC, validateAnnouncementLog, type ScannedAnnouncement } from './logs.js';
import { decodePaymentCalldata } from './router.js';
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
  /** Domain-separated digest of the direct transaction facts compared across providers. */
  readonly evidenceBinding?: Hex;
}

const TRANSFER_TOPIC: Hex = keccak256(toBytes('Transfer(address,address,uint256)'));
const pad = (a: string): Hex => `0x${'0'.repeat(24)}${a.slice(2).toLowerCase()}`;
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
 * `Transfer(payer -> oneTimeAddress, net)` in the successful direct router transaction receipt, bound to its calldata; for the native coin a successful
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
    if (secondary.status !== 'received' || secondary.evidenceId !== primary.evidenceId || secondary.evidenceBinding !== primary.evidenceBinding || secondary.final !== primary.final || secondary.evidence.join('|') !== primary.evidence.join('|')) {
      return withoutEvidenceId(primary, 'The two RPC providers did not agree on the payment evidence.');
    }
  }
  if (primary.evidenceId !== undefined && i.consumedTransfers?.has(primary.evidenceId) === true) {
    return withoutEvidenceId(primary, 'This transfer evidence has already been credited to another announcement in this scan.');
  }
  if (primary.evidenceId !== undefined) i.consumedTransfers?.add(primary.evidenceId);
  return primary;
}

function withoutEvidenceId(result: PaymentVerification, reason: string): PaymentVerification {
  return {
    status: 'unverified-claim',
    reason,
    confirmations: result.confirmations,
    final: result.final,
    ...(result.observedBalance === undefined ? {} : { observedBalance: result.observedBalance }),
    evidence: result.evidence,
  };
}

async function verifyClaimedPaymentOnClient(i: VerifyClaimInput): Promise<PaymentVerification> {
  const { claim, client, chain } = i;
  const a = claim.announcement;
  const evidence: Evidence[] = [];
  let evidenceId: string | undefined;
  let evidenceBinding: Hex | undefined;
  let confirmations = 0n;
  const done = (status: PaymentVerification['status'], reason: string | undefined, observed: bigint | undefined): PaymentVerification => ({
    status,
    ...(reason === undefined ? {} : { reason }),
    confirmations,
    final: confirmations >= BigInt(chain.finalityDepth),
    ...(observed === undefined ? {} : { observedBalance: observed }),
    evidence,
    ...(evidenceId === undefined ? {} : { evidenceId }),
    ...(evidenceBinding === undefined ? {} : { evidenceBinding }),
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
    const direct = await directRouterEvidence(client, chain.chainId, i.router, i.announcer, claim);
    if (direct === undefined) return done('unverified-claim', 'A successful direct router transaction bound to this exact announcement and calldata was not found. Indirect smart-wallet calls remain unverified.', observed);
    evidence.push('receipt');
    let supportingId: string | undefined;
    if (meta.kind === 'erc20') {
      const hit = direct.logs.find((log) => transferMatches(log, meta.token, direct.payer, claim.stealthAddress, a, meta.netAmount));
      if (hit === undefined) return done('unverified-claim', 'No matching token Transfer from the transaction payer to the one-time address was found in its receipt.', observed);
      supportingId = transferEvidenceId(meta.token, a.blockNumber, hit);
      if (supportingId === undefined) return done('unverified-claim', 'The token Transfer log omitted its canonical transaction or position.', observed);
      if (i.consumedTransfers?.has(supportingId) === true) return done('unverified-claim', 'This transfer evidence has already been credited to another announcement in this scan.', observed);
      evidence.push('transfer-log');
    } else {
      // Credit one native value-bearing transaction at most once.
      supportingId = `native:${a.blockNumber.toString()}:${a.transactionHash!.toLowerCase()}:${a.blockHash.toLowerCase()}`;
    }
    // A reorg may happen while the receipt and transaction were being read. Never release stale evidence.
    const confirmedBlock = await client.getBlock(a.blockNumber);
    if (confirmedBlock === null || confirmedBlock.hash.toLowerCase() !== a.blockHash.toLowerCase()) {
      return done('unverified-claim', 'The payment block changed while its evidence was being checked. Rescan before relying on it.', observed);
    }
    evidenceId = supportingId;
    evidenceBinding = direct.binding;
  } catch {
    // Providers are replaceable interfaces; even an unexpected transport exception must not expose URLs or payloads.
    return done('unverified-claim', 'Your RPC could not confirm this payment.', observed);
  }
  return done('received', undefined, observed);
}

function transferMatches(l: RpcLog, token: Address, payer: Address, stealth: Address, a: ScannedAnnouncement, net: bigint): boolean {
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
    typeof l.topics[0] === 'string' && l.topics[0].toLowerCase() === TRANSFER_TOPIC.toLowerCase() &&
    typeof l.topics[1] === 'string' && l.topics[1].toLowerCase() === pad(payer).toLowerCase() &&
    typeof l.topics[2] === 'string' && l.topics[2].toLowerCase() === pad(stealth).toLowerCase() &&
    typeof l.transactionHash === 'string' && HASH32.test(l.transactionHash) &&
    a.transactionHash !== undefined && l.transactionHash.toLowerCase() === a.transactionHash.toLowerCase() &&
    l.logIndex !== undefined && parseQuantity(l.logIndex) < BigInt(a.logIndex) && parseQuantity(l.logIndex) <= 0xffffffn &&
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

/** The bounded canonical receipt of a directly submitted router call; indirect calls need a separate proof. */
async function directRouterEvidence(client: RpcClient, chainId: number, router: Address, announcer: Address, claim: ClaimedPayment): Promise<{ readonly logs: readonly RpcLog[]; readonly payer: Address; readonly binding: Hex } | undefined> {
  const a = claim.announcement;
  if (a.transactionHash === undefined || !HASH32.test(a.transactionHash) || !HASH32.test(a.blockHash) ||
      !Number.isSafeInteger(a.logIndex) || a.logIndex < 0 || a.logIndex > 0xffffff ||
      claim.stealthAddress.toLowerCase() !== a.stealthAddress.toLowerCase()) return undefined;
  const [rc, tx] = await Promise.all([
    client.request('eth_getTransactionReceipt', [a.transactionHash]),
    client.request('eth_getTransactionByHash', [a.transactionHash]),
  ]);
  if (typeof rc !== 'object' || rc === null || typeof tx !== 'object' || tx === null) return undefined;
  const r = rc as Record<string, unknown>;
  const t = tx as Record<string, unknown>;
  const same = (left: unknown, right: string): boolean => typeof left === 'string' && left.toLowerCase() === right.toLowerCase();
  if (r['status'] !== '0x1' || !same(r['blockHash'], a.blockHash) || parseQuantity(r['blockNumber']) !== a.blockNumber || !same(r['transactionHash'], a.transactionHash)) return undefined;
  if (!same(t['to'], router) || !same(t['hash'], a.transactionHash) || !same(t['blockHash'], a.blockHash) || parseQuantity(t['blockNumber']) !== a.blockNumber ||
      typeof t['from'] !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(t['from']) ||
      typeof t['input'] !== 'string' || t['input'].length > 8194) return undefined;
  if (!same(r['from'], t['from']) || !same(r['to'], router) ||
      (t['chainId'] !== undefined && parseQuantity(t['chainId']) !== BigInt(chainId))) return undefined;
  const preview = decodePaymentCalldata({ to: router, data: t['input'] as Hex, value: parseQuantity(t['value']) }, chainId);
  const meta = claim.metadata;
  if (meta === undefined || !same(preview.stealth, claim.stealthAddress) || preview.net !== meta.netAmount ||
      !same(preview.ephemeralPublicKey, a.ephemeralPublicKey) || !same(preview.metadata, a.metadata) ||
      (meta.kind === 'native' ? preview.token !== 'native' : !same(preview.token, meta.token))) return undefined;
  const rawLogs = r['logs'];
  if (!Array.isArray(rawLogs) || rawLogs.length > 2000) return undefined;
  const logs = rawLogs.filter((raw): raw is RpcLog => typeof raw === 'object' && raw !== null);
  const exactAnnouncement = logs.some((raw) => {
    try {
      if (!same(raw.transactionHash, a.transactionHash!) || !same(raw.blockHash, a.blockHash)) return false;
      const event = validateAnnouncementLog(raw, announcer, 1n, a.blockNumber, a.blockNumber);
      return event !== undefined && event.logIndex === a.logIndex && same(event.caller, router) &&
        same(event.stealthAddress, a.stealthAddress) && same(event.ephemeralPublicKey, a.ephemeralPublicKey) && same(event.metadata, a.metadata);
    } catch { return false; }
  });
  if (!exactAnnouncement) return undefined;
  const binding = keccak256(toBytes(JSON.stringify([
    'GhostPay/direct-router-evidence/v1', chainId, a.blockHash.toLowerCase(),
    a.transactionHash.toLowerCase(), t['from'].toLowerCase(), router.toLowerCase(),
    t['input'].toLowerCase(), parseQuantity(t['value']).toString(),
  ])));
  return { logs, payer: t['from'] as Address, binding };
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
  const rpcRead = async <T>(read: () => Promise<T>): Promise<T> => {
    try { return await read(); } catch { return fail('RPC_FAILURE', 'your RPC could not verify this transaction'); }
  };
  const rc = await rpcRead(() => i.client.request('eth_getTransactionReceipt', [txHash]));
  if (rc === null) return fail('PAYMENT_UNVERIFIED', 'your RPC does not know this transaction');
  if (typeof rc !== 'object') return fail('RPC_FAILURE', 'malformed receipt');
  const r = rc as Record<string, unknown>;
  if (r['status'] !== '0x1') return fail('PAYMENT_UNVERIFIED', 'the transaction did not succeed');
  if (typeof r['transactionHash'] !== 'string' || r['transactionHash'].toLowerCase() !== txHash) {
    return fail('PAYMENT_UNVERIFIED', 'receipt transaction hash does not match the requested transaction');
  }
  const blockNumber = parseQuantity(r['blockNumber']);
  if (typeof r['blockHash'] !== 'string' || !HASH32.test(r['blockHash'])) return fail('RPC_FAILURE', 'malformed receipt block hash');
  const receiptBlock = await rpcRead(() => i.client.getBlock(blockNumber));
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
