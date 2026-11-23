/**
 * Durable, evidence-gated refund lifecycle for GhostPay merchants.
 *
 * Purpose: track a merchant refund from request to verified on-chain settlement so that interrupted sessions,
 * uncertain wallet calls, reorganizations and storage corruption can never produce a second refund of the same
 * funds or report a refund that did not settle. Pure logic: no network, clock or storage access.
 *
 * Authority model (see docs/refunds/REFUND_AUTHORITY_MODEL.md): GhostPay router payments are final transfers to a
 * recipient-controlled one-time address. A refund is a NEW transfer that the merchant voluntarily signs with a wallet
 * it controls. Nothing here can reverse a payment, and invoice expiry grants the payer no unilateral recovery.
 *
 * Invariants enforced here and re-checked on every load ({@link validateRefundLedger}):
 * - refunds bind to a payment outcome minted by a capability holder ({@link createOutcomeAuthority}), never to a
 *   caller-built object; persisted snapshots must be re-verified before a transaction is prepared;
 * - every refund that may have reached a wallet or chain reserves its amount, and the reserved total per payment
 *   never exceeds the verified amount received;
 * - a broadcast leaves the reserved set only on chain evidence: a finalized block later than the router deadline
 *   with no matching transfer, so an uncertain submission is never retried blindly;
 * - `finalized` requires a verified transfer at finality depth; a confirmed refund that disappears in a reorg goes
 *   back to `submitted`; contradictory evidence becomes `recovery-required` and stays reserved;
 * - authorization is explicit, bound to one refund's exact parameters, time-limited and single-use.
 *
 * Author: GhostPay. Licence: UNLICENSED (repository licence).
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseMetaAddress } from './address.js';
import { BillingError } from './errors.js';
import { planRefund, refundIdFor, type OriginalPayment, type RefundPlan } from './refunds.js';

// ---------------------------------------------------------------------------------------------------------------
// Limits and formats
// ---------------------------------------------------------------------------------------------------------------

/** Largest value of an EVM uint256. */
export const MAX_UINT256: bigint = (1n << 256n) - 1n;
/** Longest router deadline a refund attempt may use, so an uncertain broadcast resolves within this window. */
export const MAX_REFUND_DEADLINE_SECONDS = 3600;
/** A signature request is refused when fewer seconds than this remain before the attempt deadline. */
export const MIN_SUBMIT_MARGIN_SECONDS = 60;
/** Longest lifetime of a refund authorization. */
export const MAX_AUTHORIZATION_SECONDS = 7 * 24 * 3600;
/** Accepted forward clock skew for authorization timestamps. */
export const MAX_CLOCK_SKEW_SECONDS = 300;
/** Upper bound on persisted records; new requests fail closed beyond it (records are never evicted). */
export const MAX_REFUND_RECORDS = 512;
/** Upper bound on remembered replacement transaction hashes per attempt. */
export const MAX_REPLACEMENT_HASHES = 8;
/** Upper bound on serialized ledger size in UTF-16 code units. */
export const MAX_LEDGER_TEXT = 2 * 1024 * 1024;
/** Upper bound on router calldata stored for an attempt, in hex characters after `0x`. */
const MAX_CALLDATA_HEX = 8192;

const HASH_RE = /^0x[0-9a-f]{64}$/;
const ADDR_RE = /^0x[0-9a-f]{40}$/;
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const ID64_RE = /^[0-9a-f]{64}$/;
const POINT_RE = /^0x0[23][0-9a-f]{64}$/;
const LABEL_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const APPROVER_RE = /^[A-Za-z0-9._:-]{1,130}$/;
const EVIDENCE_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/;
const INVOICE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const CALLDATA_RE = /^0x(?:[0-9a-f]{2})*$/;
const DEC_RE = /^(?:0|[1-9][0-9]{0,77})$/;

const fail = (code: 'EVIDENCE' | 'STATE' | 'REFUND' | 'AUTHORIZATION' | 'IDEMPOTENCY', message: string): never => {
  throw new BillingError(code, message);
};

const isSafeSeconds = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

// ---------------------------------------------------------------------------------------------------------------
// Verified payment outcome boundary
// ---------------------------------------------------------------------------------------------------------------

/** How settled the evidence is: `finalized` means at least the chain's configured finality depth. */
export type SettlementStatus = 'confirmed' | 'finalized';

/**
 * Plain facts about one received payment, as established by a chain verifier.
 *
 * @remarks A value of this type proves nothing: it may come from storage or any caller. Only a
 * {@link VerifiedPaymentOutcome} minted by an {@link OutcomeMinter} is accepted as current evidence.
 */
export interface PaymentEvidence {
  /** `evm:<chainId>:<transactionHash>`. One direct router transaction carries exactly one payment. */
  readonly paymentId: string;
  /** Seller-ledger invoice attribution, or null. Not chain evidence: router payments carry no invoice id. */
  readonly invoiceId: string | null;
  readonly chainId: number;
  /** Lowercase token address, or `native`. */
  readonly assetId: string;
  /** Net base units received by the one-time address. */
  readonly amount: bigint;
  readonly transactionHash: string;
  /** Announcement log index within its block. */
  readonly logIndex: number;
  /** Lowercase transaction sender (the payer's account). Never a refund destination. */
  readonly senderAddress: string;
  /** Lowercase one-time address that received the funds. */
  readonly recipientAddress: string;
  readonly status: SettlementStatus;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  /** Canonical block-header timestamp, Unix seconds. */
  readonly blockTimestamp: number;
  readonly confirmations: bigint;
  /** Stable identity of the supporting transfer evidence reported by the verifier. */
  readonly evidenceId: string;
  /** Verifier label, e.g. `evm-router-v1`. */
  readonly verifier: string;
  /** Local clock reading when verified, Unix seconds (informational). */
  readonly verifiedAt: number;
}

declare const verifiedBrand: unique symbol;

/** {@link PaymentEvidence} minted by a capability holder during this process lifetime. */
export type VerifiedPaymentOutcome = PaymentEvidence & { readonly [verifiedBrand]: true };

/** Capability that turns verifier output into accepted evidence. Give it only to trusted chain verifiers. */
export interface OutcomeMinter {
  readonly label: string;
  mint(evidence: PaymentEvidence): VerifiedPaymentOutcome;
}

/** Capability that recognizes evidence minted by the paired {@link OutcomeMinter}. */
export interface OutcomeChecker {
  readonly label: string;
  isVerified(value: unknown): value is VerifiedPaymentOutcome;
}

/**
 * Creates a paired minter and checker.
 *
 * @remarks In-process object capability, not a cryptographic proof: the wiring code decides which verifier receives
 * the minter. Structurally identical objects, deserialized records and outcomes of other authorities are rejected.
 *
 * @param label Verifier label recorded in minted evidence.
 * @returns The capability pair.
 * @throws {BillingError} `EVIDENCE` for an invalid label.
 */
export function createOutcomeAuthority(label: string): { readonly minter: OutcomeMinter; readonly checker: OutcomeChecker } {
  if (typeof label !== 'string' || !LABEL_RE.test(label)) fail('EVIDENCE', 'invalid verifier label');
  const minted = new WeakSet<object>();
  const minter: OutcomeMinter = Object.freeze({
    label,
    mint(evidence: PaymentEvidence): VerifiedPaymentOutcome {
      const copy = checkEvidence(evidence, 'EVIDENCE');
      if (copy.verifier !== label) fail('EVIDENCE', 'verifier label mismatch');
      const frozen = Object.freeze(copy) as VerifiedPaymentOutcome;
      minted.add(frozen);
      return frozen;
    },
  });
  const checker: OutcomeChecker = Object.freeze({
    label,
    isVerified(value: unknown): value is VerifiedPaymentOutcome {
      return typeof value === 'object' && value !== null && minted.has(value);
    },
  });
  return Object.freeze({ minter, checker });
}

/**
 * Builds the payment id used for an EVM router payment.
 *
 * @param chainId Chain id.
 * @param transactionHash Router transaction hash.
 * @returns `evm:<chainId>:<lowercase hash>`.
 */
export function evmPaymentId(chainId: number, transactionHash: string): string {
  return `evm:${String(chainId)}:${transactionHash.toLowerCase()}`;
}

function checkEvidence(e: PaymentEvidence, code: 'EVIDENCE' | 'STATE'): PaymentEvidence {
  if (typeof e !== 'object' || e === null) fail(code, 'payment evidence');
  const chainOk = Number.isSafeInteger(e.chainId) && e.chainId > 0;
  if (!chainOk) fail(code, 'payment chain');
  if (typeof e.transactionHash !== 'string' || !HASH_RE.test(e.transactionHash)) fail(code, 'payment transaction');
  if (e.paymentId !== evmPaymentId(e.chainId, e.transactionHash)) fail(code, 'payment id');
  if (e.invoiceId !== null && (typeof e.invoiceId !== 'string' || !INVOICE_ID_RE.test(e.invoiceId))) fail(code, 'payment invoice');
  if (e.assetId !== 'native' && (typeof e.assetId !== 'string' || !ADDR_RE.test(e.assetId))) fail(code, 'payment asset');
  if (typeof e.amount !== 'bigint' || e.amount < 1n || e.amount > MAX_UINT256) fail(code, 'payment amount');
  if (!Number.isSafeInteger(e.logIndex) || e.logIndex < 0) fail(code, 'payment log');
  if (typeof e.senderAddress !== 'string' || !ADDR_RE.test(e.senderAddress)) fail(code, 'payment sender');
  if (typeof e.recipientAddress !== 'string' || !ADDR_RE.test(e.recipientAddress)) fail(code, 'payment recipient');
  if (e.senderAddress === e.recipientAddress) fail(code, 'payment sender');
  if (e.status !== 'confirmed' && e.status !== 'finalized') fail(code, 'payment status');
  if (typeof e.blockNumber !== 'bigint' || e.blockNumber < 0n) fail(code, 'payment block');
  if (typeof e.blockHash !== 'string' || !HASH_RE.test(e.blockHash)) fail(code, 'payment block');
  if (!isSafeSeconds(e.blockTimestamp)) fail(code, 'payment time');
  if (typeof e.confirmations !== 'bigint' || e.confirmations < 1n) fail(code, 'payment confirmations');
  if (typeof e.evidenceId !== 'string' || !EVIDENCE_ID_RE.test(e.evidenceId)) fail(code, 'payment evidence id');
  if (typeof e.verifier !== 'string' || !LABEL_RE.test(e.verifier)) fail(code, 'payment verifier');
  if (!isSafeSeconds(e.verifiedAt)) fail(code, 'payment verified time');
  return {
    paymentId: e.paymentId, invoiceId: e.invoiceId, chainId: e.chainId, assetId: e.assetId, amount: e.amount,
    transactionHash: e.transactionHash, logIndex: e.logIndex, senderAddress: e.senderAddress,
    recipientAddress: e.recipientAddress, status: e.status, blockNumber: e.blockNumber, blockHash: e.blockHash,
    blockTimestamp: e.blockTimestamp, confirmations: e.confirmations, evidenceId: e.evidenceId, verifier: e.verifier,
    verifiedAt: e.verifiedAt,
  };
}

/**
 * True when two evidence values describe the same transfer. Block position, depth and timestamps may differ
 * (a reorganized payment re-included elsewhere keeps its identity); amounts, parties and asset may not.
 */
export function sameTransfer(a: PaymentEvidence, b: PaymentEvidence): boolean {
  return a.paymentId === b.paymentId && a.chainId === b.chainId && a.assetId === b.assetId && a.amount === b.amount &&
    a.transactionHash === b.transactionHash && a.senderAddress === b.senderAddress &&
    a.recipientAddress === b.recipientAddress && a.invoiceId === b.invoiceId;
}

// ---------------------------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------------------------

/**
 * Persisted refund states. `authorization-required` is the requested state (eligibility is computed, not stored).
 * Reserving states: everything except `definitively-failed` and `cancelled`.
 */
export type RefundState =
  | 'authorization-required'
  | 'authorized'
  | 'prepared'
  | 'awaiting-signature'
  | 'submission-uncertain'
  | 'submitted'
  | 'confirmed'
  | 'finalized'
  | 'definitively-failed'
  | 'recovery-required'
  | 'cancelled';

/** All states, in lifecycle order. */
export const REFUND_STATES: readonly RefundState[] = Object.freeze([
  'authorization-required', 'authorized', 'prepared', 'awaiting-signature', 'submission-uncertain', 'submitted',
  'confirmed', 'finalized', 'definitively-failed', 'recovery-required', 'cancelled',
]);

/** Why a refund is made. Informational except that it is bound into the authorization digest. */
export type RefundReason =
  | 'merchant-initiated'
  | 'overpayment'
  | 'duplicate-payment'
  | 'late-payment'
  | 'expired-partial'
  | 'order-cancelled';

const REASONS: readonly RefundReason[] = ['merchant-initiated', 'overpayment', 'duplicate-payment', 'late-payment', 'expired-partial', 'order-cancelled'];

/** Last noteworthy observation, as a fixed code. */
export type RefundNote =
  | 'wallet-outcome-unknown'
  | 'reverted-observed'
  | 'deadline-passed-without-transfer'
  | 'evidence-mismatch'
  | 'reorged-out'
  | 'rpc-unavailable'
  | 'contradicts-failure';

const NOTES: readonly RefundNote[] = ['wallet-outcome-unknown', 'reverted-observed', 'deadline-passed-without-transfer', 'evidence-mismatch', 'reorged-out', 'rpc-unavailable', 'contradicts-failure'];

/** Explicit, single-use approval by the party controlling the refund funds. */
export interface RefundAuthorization {
  /** `operator-confirmation`: an operator approved in the app; `multisig`: m-of-n off-chain approvals. */
  readonly method: 'operator-confirmation' | 'multisig';
  /** Must equal {@link refundAuthorizationDigest} of the record it authorizes. */
  readonly digest: string;
  /** Approver labels or public keys, 1..16, unique. */
  readonly approvers: readonly string[];
  readonly authorizedAt: number;
  readonly expiresAt: number;
}

/** One prepared router transaction. Only public data: no keys, ephemeral secrets or wallet credentials. */
export interface RefundAttempt {
  readonly chainId: number;
  /** Lowercase account that signs and pays. */
  readonly from: string;
  /** Lowercase router address. */
  readonly to: string;
  readonly data: string;
  readonly value: bigint;
  /** Amount the paying wallet spends (router fee included). */
  readonly gross: bigint;
  /** Amount delivered to the payer's one-time address; equals the refund amount. */
  readonly netAmount: bigint;
  readonly assetId: string;
  /** Lowercase one-time address derived from the payer's refund meta-address; unique per attempt. */
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: string;
  /** Router deadline, Unix seconds. After a finalized block past it, this transaction can never transfer. */
  readonly deadline: number;
  /** Lower bound of the evidence search (head minus finality depth when prepared). */
  readonly startBlock: bigint;
  /** {@link attemptDigest} of this attempt: what the operator reviewed and confirmed. */
  readonly txDigest: string;
  readonly preparedAt: number;
  /** When `awaiting-signature` was persisted, i.e. just before the wallet request. */
  readonly requestedAt: number | null;
  /** First transaction hash reported by the wallet. Never overwritten. */
  readonly transactionHash: string | null;
  /** Later, different hashes (speed-up or cancel replacements), first-seen order. */
  readonly replacementHashes: readonly string[];
}

/** Verified on-chain refund transfer. */
export interface RefundSettlement {
  readonly transactionHash: string;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly confirmations: bigint;
  readonly final: boolean;
  readonly observedAt: number;
}

/** One durable refund. */
export interface RefundRecord {
  readonly v: 1;
  readonly refundId: string;
  readonly idempotencyKey: string;
  /** Snapshot of the verified original payment at request time. Re-verified before preparing. */
  readonly original: PaymentEvidence;
  readonly amount: bigint;
  readonly destinationMeta: string;
  readonly reason: RefundReason;
  readonly state: RefundState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly authorization: RefundAuthorization | null;
  readonly attempt: RefundAttempt | null;
  readonly settlement: RefundSettlement | null;
  readonly note: RefundNote | null;
}

/** All refunds known to one merchant store. */
export type RefundLedger = readonly RefundRecord[];

/** States whose amount counts against the refundable balance. */
export function reservesFunds(state: RefundState): boolean {
  return state !== 'definitively-failed' && state !== 'cancelled';
}

/** States in which a wallet may already have been asked to sign (never cancellable, never blindly retried). */
export function walletMayHaveSigned(state: RefundState): boolean {
  return state === 'awaiting-signature' || state === 'submission-uncertain' || state === 'submitted' ||
    state === 'confirmed' || state === 'finalized' || state === 'recovery-required';
}

const lines = (...parts: readonly (string | number | bigint)[]): Uint8Array => utf8ToBytes(parts.map(String).join('\n'));

/**
 * Digest an authorization must carry: binds the refund id, original transfer, chain, asset, amount, destination
 * and reason. A different refund (even of the same payment) has a different digest, so approvals cannot be replayed.
 */
export function refundAuthorizationDigest(r: Pick<RefundRecord, 'refundId' | 'original' | 'amount' | 'destinationMeta' | 'reason'>): string {
  return bytesToHex(sha256(lines('ghostpay-refund-authorization-v1', r.refundId, r.original.paymentId, r.original.chainId,
    r.original.assetId, r.original.amount, r.original.recipientAddress, r.amount, r.destinationMeta, r.reason)));
}

/** Fields of an attempt that the operator reviews before signing. */
export type AttemptInput = Pick<RefundAttempt, 'chainId' | 'from' | 'to' | 'data' | 'value' | 'gross' | 'netAmount' |
  'assetId' | 'stealthAddress' | 'ephemeralPublicKey' | 'deadline' | 'startBlock'>;

/** Digest of exactly what the wallet will be asked to sign, plus the refund it belongs to. */
export function attemptDigest(refundId: string, a: AttemptInput): string {
  return bytesToHex(sha256(lines('ghostpay-refund-attempt-v1', refundId, a.chainId, a.from, a.to, a.data, a.value, a.gross,
    a.netAmount, a.assetId, a.stealthAddress, a.ephemeralPublicKey, a.deadline, a.startBlock)));
}

// ---------------------------------------------------------------------------------------------------------------
// Observations supplied by a chain reconciler
// ---------------------------------------------------------------------------------------------------------------

/**
 * What a reconciler established about an attempt. Produced by verifying chain data (see `@ghostpay/merchant-refunds`).
 *
 * - `transfer-verified`: a router announcement for the attempt's one-time address, sent by the attempt's account,
 *   whose transfer was independently verified on canonical blocks;
 * - `reverted`: a known hash of this attempt reverted (informational: only the deadline rule proves failure);
 * - `absent-after-deadline`: no such transfer in `[scannedFromBlock, finalizedBlock]`, and that finalized block is
 *   later than the attempt deadline;
 * - `not-found`: no transfer yet; `unavailable`: the RPC could not answer.
 */
export type RefundObservation =
  | {
    readonly kind: 'transfer-verified';
    readonly transactionHash: string;
    readonly from: string;
    readonly stealthAddress: string;
    readonly ephemeralPublicKey: string;
    readonly assetId: string;
    readonly netAmount: bigint;
    readonly blockNumber: bigint;
    readonly blockHash: string;
    readonly confirmations: bigint;
    readonly final: boolean;
  }
  | { readonly kind: 'reverted'; readonly transactionHash: string }
  | { readonly kind: 'absent-after-deadline'; readonly scannedFromBlock: bigint; readonly finalizedBlock: bigint; readonly finalizedTimestamp: number }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' };

// ---------------------------------------------------------------------------------------------------------------
// Ledger validation
// ---------------------------------------------------------------------------------------------------------------

function checkAuthorization(a: RefundAuthorization, code: 'STATE' | 'AUTHORIZATION'): RefundAuthorization {
  if (typeof a !== 'object' || a === null) fail(code, 'authorization');
  if (a.method !== 'operator-confirmation' && a.method !== 'multisig') fail(code, 'authorization method');
  if (typeof a.digest !== 'string' || !ID64_RE.test(a.digest)) fail(code, 'authorization digest');
  if (!Array.isArray(a.approvers) || a.approvers.length < 1 || a.approvers.length > 16) fail(code, 'authorization approvers');
  const seen = new Set<string>();
  for (const who of a.approvers as readonly unknown[]) {
    if (typeof who !== 'string' || !APPROVER_RE.test(who) || seen.has(who)) fail(code, 'authorization approvers');
    seen.add(who as string);
  }
  if (!isSafeSeconds(a.authorizedAt) || !isSafeSeconds(a.expiresAt) || a.expiresAt <= a.authorizedAt ||
      a.expiresAt - a.authorizedAt > MAX_AUTHORIZATION_SECONDS) fail(code, 'authorization lifetime');
  return { method: a.method, digest: a.digest, approvers: Object.freeze([...a.approvers]), authorizedAt: a.authorizedAt, expiresAt: a.expiresAt };
}

function checkAttemptInput(a: AttemptInput, code: 'STATE' | 'REFUND'): void {
  if (typeof a !== 'object' || a === null) fail(code, 'attempt');
  if (!Number.isSafeInteger(a.chainId) || a.chainId < 1) fail(code, 'attempt chain');
  for (const v of [a.from, a.to, a.stealthAddress]) if (typeof v !== 'string' || !ADDR_RE.test(v)) fail(code, 'attempt address');
  if (a.from === a.to || a.from === a.stealthAddress || a.to === a.stealthAddress) fail(code, 'attempt address');
  if (typeof a.data !== 'string' || !CALLDATA_RE.test(a.data) || a.data.length < 10 || a.data.length - 2 > MAX_CALLDATA_HEX) fail(code, 'attempt data');
  for (const v of [a.value, a.gross, a.netAmount]) if (typeof v !== 'bigint' || v < 0n || v > MAX_UINT256) fail(code, 'attempt amount');
  if (a.netAmount < 1n || a.gross < a.netAmount) fail(code, 'attempt amount');
  if (a.assetId !== 'native' && (typeof a.assetId !== 'string' || !ADDR_RE.test(a.assetId))) fail(code, 'attempt asset');
  if (a.assetId === 'native' ? a.value !== a.gross : a.value !== 0n) fail(code, 'attempt value');
  if (typeof a.ephemeralPublicKey !== 'string' || !POINT_RE.test(a.ephemeralPublicKey)) fail(code, 'attempt ephemeral key');
  if (!isSafeSeconds(a.deadline) || a.deadline < 1) fail(code, 'attempt deadline');
  if (typeof a.startBlock !== 'bigint' || a.startBlock < 0n) fail(code, 'attempt start block');
}

function checkHashList(list: readonly string[]): void {
  if (!Array.isArray(list) || list.length > MAX_REPLACEMENT_HASHES) fail('STATE', 'replacement hashes');
  const seen = new Set<string>();
  for (const h of list as readonly unknown[]) {
    if (typeof h !== 'string' || !HASH_RE.test(h) || seen.has(h)) fail('STATE', 'replacement hashes');
    seen.add(h as string);
  }
}

const ATTEMPT_STATES = new Set<RefundState>(['prepared', 'awaiting-signature', 'submission-uncertain', 'submitted', 'confirmed', 'finalized', 'definitively-failed', 'recovery-required']);
const AUTHORIZED_STATES = new Set<RefundState>([...ATTEMPT_STATES, 'authorized']);

function checkRecord(r: RefundRecord): void {
  if (typeof r !== 'object' || r === null || r.v !== 1) fail('STATE', 'record version');
  if (!REFUND_STATES.includes(r.state)) fail('STATE', 'record state');
  if (typeof r.idempotencyKey !== 'string' || !KEY_RE.test(r.idempotencyKey)) fail('STATE', 'record key');
  checkEvidence(r.original, 'STATE');
  if (r.refundId !== refundIdFor(r.original.paymentId, r.idempotencyKey)) fail('STATE', 'record id');
  if (typeof r.amount !== 'bigint' || r.amount < 1n || r.amount > r.original.amount) fail('STATE', 'record amount');
  let meta: string;
  try {
    meta = parseMetaAddress(r.destinationMeta);
  } catch {
    return fail('STATE', 'record destination');
  }
  if (meta !== r.destinationMeta) fail('STATE', 'record destination');
  if (!REASONS.includes(r.reason)) fail('STATE', 'record reason');
  if (!isSafeSeconds(r.createdAt) || !isSafeSeconds(r.updatedAt) || r.updatedAt < r.createdAt) fail('STATE', 'record time');
  if (r.note !== null && !NOTES.includes(r.note)) fail('STATE', 'record note');

  if (r.authorization === null) {
    if (AUTHORIZED_STATES.has(r.state)) fail('STATE', 'authorization missing');
  } else {
    checkAuthorization(r.authorization, 'STATE');
    if (r.authorization.digest !== refundAuthorizationDigest(r)) fail('STATE', 'authorization binding');
  }

  const a = r.attempt;
  if (a === null) {
    if (ATTEMPT_STATES.has(r.state)) fail('STATE', 'attempt missing');
  } else {
    checkAttemptInput(a, 'STATE');
    if (a.chainId !== r.original.chainId || a.assetId !== r.original.assetId || a.netAmount !== r.amount) fail('STATE', 'attempt binding');
    if (a.stealthAddress === r.original.recipientAddress || a.stealthAddress === r.original.senderAddress) fail('STATE', 'attempt destination');
    if (a.txDigest !== attemptDigest(r.refundId, a)) fail('STATE', 'attempt digest');
    if (!isSafeSeconds(a.preparedAt)) fail('STATE', 'attempt time');
    if (a.requestedAt !== null && (!isSafeSeconds(a.requestedAt) || a.requestedAt < a.preparedAt)) fail('STATE', 'attempt time');
    if (a.transactionHash !== null && (typeof a.transactionHash !== 'string' || !HASH_RE.test(a.transactionHash))) fail('STATE', 'attempt hash');
    checkHashList(a.replacementHashes);
    if (a.transactionHash === null && a.replacementHashes.length > 0) fail('STATE', 'attempt hash');
    if (a.transactionHash !== null && a.replacementHashes.includes(a.transactionHash)) fail('STATE', 'attempt hash');
    const requested = walletMayHaveSigned(r.state) || r.state === 'definitively-failed';
    if (requested !== (a.requestedAt !== null)) fail('STATE', 'attempt request');
    if (a.transactionHash !== null && !requested) fail('STATE', 'attempt hash');
    if (r.state === 'submitted' && a.transactionHash === null) fail('STATE', 'attempt hash');
  }

  const s = r.settlement;
  if (s === null) {
    if (r.state === 'confirmed' || r.state === 'finalized') fail('STATE', 'settlement missing');
  } else {
    if (r.state !== 'confirmed' && r.state !== 'finalized' && r.state !== 'recovery-required') fail('STATE', 'settlement state');
    if (typeof s.transactionHash !== 'string' || !HASH_RE.test(s.transactionHash)) fail('STATE', 'settlement hash');
    if (typeof s.blockHash !== 'string' || !HASH_RE.test(s.blockHash)) fail('STATE', 'settlement block');
    if (typeof s.blockNumber !== 'bigint' || s.blockNumber < 0n || typeof s.confirmations !== 'bigint' || s.confirmations < 1n) fail('STATE', 'settlement block');
    if (typeof s.final !== 'boolean') fail('STATE', 'settlement finality');
    if ((r.state === 'finalized' && !s.final) || (r.state === 'confirmed' && s.final)) fail('STATE', 'settlement finality');
    if (!isSafeSeconds(s.observedAt)) fail('STATE', 'settlement time');
    if (a !== null && s.transactionHash !== a.transactionHash && !a.replacementHashes.includes(s.transactionHash)) fail('STATE', 'settlement hash');
  }
}

/**
 * Validates a whole ledger. Call on every load and before every commit.
 *
 * @param ledger Records, possibly from untrusted storage.
 * @returns The same ledger.
 * @throws {BillingError} `STATE` on any shape, binding, uniqueness or accounting violation (fail closed).
 */
export function validateRefundLedger(ledger: RefundLedger): RefundLedger {
  if (!Array.isArray(ledger) || ledger.length > MAX_REFUND_RECORDS) fail('STATE', 'ledger size');
  const ids = new Set<string>();
  const keys = new Set<string>();
  const digests = new Set<string>();
  const stealth = new Set<string>();
  const hashes = new Set<string>();
  const originals = new Map<string, PaymentEvidence>();
  const reserved = new Map<string, bigint>();
  const contradicted = new Set<string>();
  for (const r of ledger) {
    checkRecord(r);
    if (ids.has(r.refundId)) fail('STATE', 'duplicate refund');
    ids.add(r.refundId);
    const key = `${r.original.paymentId}\n${r.idempotencyKey}`;
    if (keys.has(key)) fail('STATE', 'duplicate idempotency key');
    keys.add(key);
    if (r.authorization !== null) {
      if (digests.has(r.authorization.digest)) fail('STATE', 'authorization reused');
      digests.add(r.authorization.digest);
    }
    if (r.attempt !== null) {
      if (stealth.has(r.attempt.stealthAddress)) fail('STATE', 'destination reused');
      stealth.add(r.attempt.stealthAddress);
      for (const h of [r.attempt.transactionHash, ...r.attempt.replacementHashes]) {
        if (h === null) continue;
        if (hashes.has(h)) fail('STATE', 'transaction reused');
        hashes.add(h);
      }
    }
    const known = originals.get(r.original.paymentId);
    if (known === undefined) originals.set(r.original.paymentId, r.original);
    else if (!sameTransfer(known, r.original)) fail('STATE', 'conflicting payment evidence');
    if (reservesFunds(r.state)) reserved.set(r.original.paymentId, (reserved.get(r.original.paymentId) ?? 0n) + r.amount);
    if (r.state === 'recovery-required' && r.note === 'contradicts-failure') contradicted.add(r.original.paymentId);
  }
  for (const [paymentId, total] of reserved) {
    // A transfer observed after proven failure must still be recordable (it is the evidence of an over-refund);
    // the negative remaining balance then blocks every new refund of that payment.
    if (total > (originals.get(paymentId) as PaymentEvidence).amount && !contradicted.has(paymentId)) fail('STATE', 'refunds exceed payment');
  }
  return ledger;
}

// ---------------------------------------------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------------------------------------------

/** Refund totals for one payment. */
export interface RefundBalance {
  readonly paymentId: string;
  readonly verifiedAmount: bigint;
  /** Every reserving refund (pending, uncertain, confirmed, finalized, recovery-required). */
  readonly reserved: bigint;
  /** Verified final refunds only. */
  readonly finalized: bigint;
  /** Reserved minus finalized. */
  readonly pending: bigint;
  /** Verified amount minus reserved. */
  readonly remaining: bigint;
}

/**
 * Refund totals for one verified payment.
 *
 * @param ledger Validated ledger.
 * @param payment The payment's evidence.
 * @returns Totals; `remaining` is what a new refund may still use.
 */
export function refundBalance(ledger: RefundLedger, payment: PaymentEvidence): RefundBalance {
  let reserved = 0n;
  let finalized = 0n;
  for (const r of ledger) {
    if (r.original.paymentId !== payment.paymentId || !reservesFunds(r.state)) continue;
    reserved += r.amount;
    if (r.state === 'finalized') finalized += r.amount;
  }
  return { paymentId: payment.paymentId, verifiedAmount: payment.amount, reserved, finalized, pending: reserved - finalized, remaining: payment.amount - reserved };
}

// ---------------------------------------------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------------------------------------------

/** Input of {@link RefundBook.request}. */
export interface RefundRequestInput {
  readonly idempotencyKey: string;
  /** Net amount to deliver to the payer. */
  readonly amount: bigint;
  /** Payer-provided fresh stealth meta-address. */
  readonly destinationMeta: string;
  readonly reason: RefundReason;
  /** Meta-addresses already associated with the payer (e.g. the one used to pay). */
  readonly linkedMetas?: readonly string[];
  /**
   * Optional per-reason ceiling, e.g. `refundableUpTo` from settlement classification for an overpayment.
   * The verified payment amount always caps the total regardless.
   */
  readonly limit?: bigint;
}

/** Result of a ledger mutation. */
export interface RefundChange {
  readonly ledger: RefundLedger;
  readonly record: RefundRecord;
  /** True when the call returned an existing record without change. */
  readonly unchanged: boolean;
}

function findRecord(ledger: RefundLedger, refundId: string): { index: number; record: RefundRecord } {
  const index = ledger.findIndex((r) => r.refundId === refundId);
  const record = ledger[index];
  if (record === undefined) return fail('REFUND', 'unknown refund');
  return { index, record };
}

function commit(ledger: RefundLedger, index: number, record: RefundRecord): RefundChange {
  const next = [...ledger];
  next[index] = Object.freeze(record);
  validateRefundLedger(next);
  return { ledger: Object.freeze(next), record: next[index], unchanged: false };
}

const keep = (ledger: RefundLedger, record: RefundRecord): RefundChange => ({ ledger, record, unchanged: true });

function checkNow(now: number): void {
  if (!isSafeSeconds(now)) fail('REFUND', 'invalid clock');
}

function checkHash(hash: unknown): string {
  if (typeof hash !== 'string') return fail('EVIDENCE', 'transaction hash');
  const h = hash.toLowerCase();
  if (!HASH_RE.test(h)) fail('EVIDENCE', 'transaction hash');
  return h;
}

/**
 * Refund state machine bound to one evidence authority.
 *
 * @remarks Every method takes the current ledger snapshot and returns a validated new snapshot; callers persist it
 * atomically (compare-and-set or an exclusive lock) before acting on it. The wallet request must happen only after
 * the `awaiting-signature` snapshot from {@link RefundBook.beginSignature} has been durably stored.
 */
export class RefundBook {
  readonly #checker: OutcomeChecker;

  /** @param checker Recognizes outcomes minted by the trusted verifier. */
  public constructor(checker: OutcomeChecker) {
    if (typeof checker !== 'object' || checker === null || typeof checker.isVerified !== 'function') fail('EVIDENCE', 'outcome checker');
    this.#checker = checker;
  }

  #verified(outcome: unknown): VerifiedPaymentOutcome {
    if (!this.#checker.isVerified(outcome)) return fail('EVIDENCE', 'payment outcome is not verified');
    return outcome;
  }

  /**
   * Records a refund request (state `authorization-required`) or replays an existing one.
   *
   * @throws {BillingError} `EVIDENCE` (unverified or conflicting outcome), `REFUND` (cap, limit, amount, ledger full),
   * `IDEMPOTENCY` (key reused with other parameters), `META_ADDRESS` (destination).
   */
  public request(ledger: RefundLedger, outcome: VerifiedPaymentOutcome, input: RefundRequestInput, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const payment = this.#verified(outcome);
    if (!REASONS.includes(input.reason)) fail('REFUND', 'invalid reason');
    const mine = ledger.filter((r) => r.original.paymentId === payment.paymentId);
    for (const r of mine) if (!sameTransfer(r.original, payment)) fail('EVIDENCE', 'payment evidence conflicts with recorded refunds');
    const original: OriginalPayment = {
      paymentId: payment.paymentId, invoiceNonce: payment.invoiceId ?? '', chainId: payment.chainId, token: payment.assetId,
      paidAmount: payment.amount, senderAddress: payment.senderAddress,
    };
    const prior: RefundPlan[] = mine.map((r) => ({
      refundId: r.refundId, idempotencyKey: r.idempotencyKey, paymentId: r.original.paymentId,
      invoiceNonce: original.invoiceNonce, chainId: r.original.chainId, token: r.original.assetId, amount: r.amount,
      destinationMeta: r.destinationMeta, status: reservesFunds(r.state) ? 'planned' : 'failed',
    }));
    const planned = planRefund(original, prior, { idempotencyKey: input.idempotencyKey, amount: input.amount, destinationMeta: input.destinationMeta }, input.linkedMetas ?? []);
    if (planned.replayed) {
      const existing = mine.find((r) => r.refundId === planned.plan.refundId) as RefundRecord;
      if (existing.reason !== input.reason) fail('IDEMPOTENCY', 'key reused with different parameters');
      return keep(ledger, existing);
    }
    if (input.limit !== undefined && (typeof input.limit !== 'bigint' || input.amount > input.limit)) fail('REFUND', 'exceeds refundable limit');
    if (ledger.length >= MAX_REFUND_RECORDS) fail('REFUND', 'refund ledger full');
    const record: RefundRecord = {
      v: 1, refundId: planned.plan.refundId, idempotencyKey: input.idempotencyKey, original: Object.freeze(checkEvidence(payment, 'EVIDENCE')),
      amount: input.amount, destinationMeta: planned.plan.destinationMeta, reason: input.reason, state: 'authorization-required',
      createdAt: now, updatedAt: now, authorization: null, attempt: null, settlement: null, note: null,
    };
    return commit(ledger, ledger.length, record);
  }

  /**
   * Records explicit authorization by the controlling party.
   *
   * @throws {BillingError} `AUTHORIZATION` when the digest does not bind this refund, the lifetime is invalid or
   * already over, or a different authorization exists; `REFUND` for other states.
   */
  public authorize(ledger: RefundLedger, refundId: string, authorization: RefundAuthorization, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const { index, record } = findRecord(ledger, refundId);
    const auth = checkAuthorization(authorization, 'AUTHORIZATION');
    if (auth.digest !== refundAuthorizationDigest(record)) fail('AUTHORIZATION', 'authorization does not bind this refund');
    const prior = record.authorization;
    if (record.state === 'authorized' && prior !== null && prior.method === auth.method && prior.authorizedAt === auth.authorizedAt &&
        prior.expiresAt === auth.expiresAt && prior.approvers.join('\n') === auth.approvers.join('\n')) return keep(ledger, record);
    if (record.state !== 'authorization-required') fail('REFUND', 'illegal transition');
    if (auth.authorizedAt > now + MAX_CLOCK_SKEW_SECONDS || auth.expiresAt <= now) fail('AUTHORIZATION', 'authorization not current');
    return commit(ledger, index, { ...record, state: 'authorized', authorization: auth, updatedAt: Math.max(now, record.updatedAt) });
  }

  /**
   * Stores a prepared transaction after re-verifying the original payment at finality.
   *
   * @param fresh Outcome re-verified now; must be finalized and describe the same transfer.
   * @throws {BillingError} `EVIDENCE`, `AUTHORIZATION` (expired), `REFUND` (state, binding, deadline window).
   */
  public prepare(ledger: RefundLedger, refundId: string, fresh: VerifiedPaymentOutcome, input: AttemptInput, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const { index, record } = findRecord(ledger, refundId);
    if (record.state !== 'authorized' && record.state !== 'prepared') fail('REFUND', 'illegal transition');
    const auth = record.authorization as RefundAuthorization;
    if (now >= auth.expiresAt) fail('AUTHORIZATION', 'authorization expired');
    const payment = this.#verified(fresh);
    if (payment.status !== 'finalized') fail('EVIDENCE', 'original payment is not final');
    if (!sameTransfer(payment, record.original)) fail('EVIDENCE', 'original payment changed');
    checkAttemptInput(input, 'REFUND');
    if (input.chainId !== record.original.chainId) fail('REFUND', 'wrong chain');
    if (input.assetId !== record.original.assetId) fail('REFUND', 'wrong asset');
    if (input.netAmount !== record.amount) fail('REFUND', 'wrong amount');
    if (input.stealthAddress === record.original.recipientAddress || input.stealthAddress === record.original.senderAddress) fail('REFUND', 'destination is not fresh');
    if (input.deadline <= now + MIN_SUBMIT_MARGIN_SECONDS || input.deadline > now + MAX_REFUND_DEADLINE_SECONDS) fail('REFUND', 'deadline outside window');
    const attempt: RefundAttempt = {
      chainId: input.chainId, from: input.from, to: input.to, data: input.data, value: input.value, gross: input.gross,
      netAmount: input.netAmount, assetId: input.assetId, stealthAddress: input.stealthAddress,
      ephemeralPublicKey: input.ephemeralPublicKey, deadline: input.deadline, startBlock: input.startBlock,
      txDigest: attemptDigest(refundId, input), preparedAt: now, requestedAt: null, transactionHash: null,
      replacementHashes: Object.freeze([]),
    };
    return commit(ledger, index, { ...record, state: 'prepared', attempt, updatedAt: Math.max(now, record.updatedAt) });
  }

  /**
   * Marks the moment before the wallet request. Persist the result BEFORE calling the wallet.
   *
   * @param txDigest The digest the operator confirmed; must equal the prepared attempt's digest.
   * @throws {BillingError} `REFUND` (state, digest, too close to the deadline), `AUTHORIZATION` (expired).
   */
  public beginSignature(ledger: RefundLedger, refundId: string, txDigest: string, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const { index, record } = findRecord(ledger, refundId);
    if (record.state !== 'prepared') fail('REFUND', 'illegal transition');
    const attempt = record.attempt as RefundAttempt;
    if (txDigest !== attempt.txDigest) fail('REFUND', 'confirmation does not match the prepared transaction');
    if (now >= (record.authorization as RefundAuthorization).expiresAt) fail('AUTHORIZATION', 'authorization expired');
    if (now + MIN_SUBMIT_MARGIN_SECONDS >= attempt.deadline) fail('REFUND', 'deadline too close; prepare again');
    return commit(ledger, index, { ...record, state: 'awaiting-signature', attempt: { ...attempt, requestedAt: now }, updatedAt: Math.max(now, record.updatedAt) });
  }

  /**
   * Records a wallet-returned transaction hash. The first hash is never replaced; later different hashes are kept as
   * replacements (bounded). Safe to call again after a crash.
   *
   * @throws {BillingError} `EVIDENCE` (malformed hash), `REFUND` (no wallet request recorded, too many replacements).
   */
  public recordSubmission(ledger: RefundLedger, refundId: string, hash: string, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const h = checkHash(hash);
    const { index, record } = findRecord(ledger, refundId);
    const attempt = record.attempt;
    if (attempt === null || attempt.requestedAt === null) return fail('REFUND', 'no wallet request recorded');
    const updatedAt = Math.max(now, record.updatedAt);
    if (attempt.transactionHash === null) {
      const state: RefundState = record.state === 'awaiting-signature' || record.state === 'submission-uncertain' ? 'submitted' : record.state;
      return commit(ledger, index, { ...record, state, attempt: { ...attempt, transactionHash: h }, updatedAt });
    }
    if (attempt.transactionHash === h || attempt.replacementHashes.includes(h)) return keep(ledger, record);
    if (attempt.replacementHashes.length >= MAX_REPLACEMENT_HASHES) fail('REFUND', 'too many replacement transactions');
    return commit(ledger, index, { ...record, attempt: { ...attempt, replacementHashes: Object.freeze([...attempt.replacementHashes, h]) }, updatedAt });
  }

  /**
   * Records that the wallet call ended without a usable hash (error, rejection, closed tab). The refund stays
   * reserved until chain evidence resolves it; it must not be signed again.
   */
  public recordSubmissionUncertain(ledger: RefundLedger, refundId: string, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const { index, record } = findRecord(ledger, refundId);
    if (record.state === 'submission-uncertain') return keep(ledger, record);
    if (record.state !== 'awaiting-signature') fail('REFUND', 'illegal transition');
    return commit(ledger, index, { ...record, state: 'submission-uncertain', note: 'wallet-outcome-unknown', updatedAt: Math.max(now, record.updatedAt) });
  }

  /**
   * Applies chain evidence to an attempt that may have been broadcast.
   *
   * @throws {BillingError} `EVIDENCE` when the observation is malformed or does not concern this attempt;
   * `REFUND` for states without a wallet request.
   */
  public observe(ledger: RefundLedger, refundId: string, obs: RefundObservation, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const { index, record } = findRecord(ledger, refundId);
    const attempt = record.attempt;
    if (attempt === null || attempt.requestedAt === null || record.state === 'cancelled') return fail('REFUND', 'no wallet request recorded');
    const updatedAt = Math.max(now, record.updatedAt);
    const settledTerminal = record.state === 'finalized' || record.state === 'recovery-required';
    switch (obs.kind) {
      case 'transfer-verified': {
        const h = checkHash(obs.transactionHash);
        if (typeof obs.stealthAddress !== 'string' || obs.stealthAddress.toLowerCase() !== attempt.stealthAddress) fail('EVIDENCE', 'observation is for another destination');
        if (typeof obs.blockHash !== 'string' || !HASH_RE.test(obs.blockHash.toLowerCase()) || typeof obs.blockNumber !== 'bigint' || obs.blockNumber < 0n ||
            typeof obs.confirmations !== 'bigint' || obs.confirmations < 1n || typeof obs.final !== 'boolean') fail('EVIDENCE', 'observation block');
        if (record.state === 'finalized') return keep(ledger, record);
        const matches = typeof obs.from === 'string' && obs.from.toLowerCase() === attempt.from &&
          typeof obs.ephemeralPublicKey === 'string' && obs.ephemeralPublicKey.toLowerCase() === attempt.ephemeralPublicKey &&
          obs.assetId === attempt.assetId && obs.netAmount === record.amount;
        const known = h === attempt.transactionHash || attempt.replacementHashes.includes(h);
        let nextAttempt = attempt;
        if (!known) {
          if (attempt.transactionHash === null) nextAttempt = { ...attempt, transactionHash: h };
          else if (attempt.replacementHashes.length < MAX_REPLACEMENT_HASHES) nextAttempt = { ...attempt, replacementHashes: Object.freeze([...attempt.replacementHashes, h]) };
          else return commit(ledger, index, { ...record, state: 'recovery-required', settlement: null, note: 'evidence-mismatch', updatedAt });
        }
        const settlement: RefundSettlement = {
          transactionHash: h, blockNumber: obs.blockNumber, blockHash: obs.blockHash.toLowerCase(), confirmations: obs.confirmations, final: obs.final, observedAt: now,
        };
        if (!matches || record.state === 'definitively-failed' || record.state === 'recovery-required') {
          const note: RefundNote = record.state === 'definitively-failed' ? 'contradicts-failure' : !matches ? 'evidence-mismatch' : record.note ?? 'evidence-mismatch';
          return commit(ledger, index, { ...record, state: 'recovery-required', attempt: nextAttempt, settlement, note, updatedAt });
        }
        return commit(ledger, index, { ...record, state: obs.final ? 'finalized' : 'confirmed', attempt: nextAttempt, settlement, note: null, updatedAt });
      }
      case 'reverted': {
        const h = checkHash(obs.transactionHash);
        if (h !== attempt.transactionHash && !attempt.replacementHashes.includes(h)) fail('EVIDENCE', 'unknown transaction');
        if (settledTerminal || record.state === 'definitively-failed') return keep(ledger, record);
        // A revert alone is not proof: a replacement or resubmission of the same calldata could still transfer.
        return commit(ledger, index, { ...record, note: 'reverted-observed', updatedAt });
      }
      case 'absent-after-deadline': {
        if (typeof obs.scannedFromBlock !== 'bigint' || typeof obs.finalizedBlock !== 'bigint' || !isSafeSeconds(obs.finalizedTimestamp) ||
            obs.scannedFromBlock > attempt.startBlock || obs.finalizedBlock < attempt.startBlock || obs.finalizedTimestamp <= attempt.deadline) {
          fail('EVIDENCE', 'absence is not proven past the deadline');
        }
        if (settledTerminal || record.state === 'definitively-failed') {
          if (record.state === 'finalized') return commit(ledger, index, { ...record, state: 'recovery-required', note: 'contradicts-failure', updatedAt });
          return keep(ledger, record);
        }
        const note: RefundNote = record.state === 'confirmed' ? 'reorged-out' : 'deadline-passed-without-transfer';
        return commit(ledger, index, { ...record, state: 'definitively-failed', settlement: null, note, updatedAt });
      }
      case 'not-found': {
        if (record.state === 'confirmed') return commit(ledger, index, { ...record, state: 'submitted', settlement: null, note: 'reorged-out', updatedAt });
        return keep(ledger, record);
      }
      case 'unavailable': {
        if (settledTerminal || record.state === 'definitively-failed' || record.note === 'rpc-unavailable') return keep(ledger, record);
        return commit(ledger, index, { ...record, note: 'rpc-unavailable', updatedAt });
      }
      default:
        return fail('EVIDENCE', 'unknown observation');
    }
  }

  /**
   * Cancels a refund that was never sent to a wallet, releasing its reservation.
   *
   * @throws {BillingError} `REFUND` once a wallet may have been asked to sign.
   */
  public cancel(ledger: RefundLedger, refundId: string, now: number): RefundChange {
    validateRefundLedger(ledger);
    checkNow(now);
    const { index, record } = findRecord(ledger, refundId);
    if (record.state === 'cancelled') return keep(ledger, record);
    if (record.state !== 'authorization-required' && record.state !== 'authorized' && record.state !== 'prepared') fail('REFUND', 'cannot cancel after a wallet request');
    // A prepared attempt was never requested; drop it so its one-time address is not mistaken for a broadcast.
    return commit(ledger, index, { ...record, state: 'cancelled', attempt: null, updatedAt: Math.max(now, record.updatedAt) });
  }
}

/**
 * Builds an operator-confirmation authorization for a record. Call only from an explicit, user-visible approval.
 *
 * @param record The refund being approved.
 * @param operator Operator label.
 * @param now Current Unix seconds.
 * @param lifetimeSeconds Validity, 1..{@link MAX_AUTHORIZATION_SECONDS}.
 */
export function operatorAuthorization(record: RefundRecord, operator: string, now: number, lifetimeSeconds: number): RefundAuthorization {
  checkNow(now);
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > MAX_AUTHORIZATION_SECONDS) fail('AUTHORIZATION', 'authorization lifetime');
  return checkAuthorization({ method: 'operator-confirmation', digest: refundAuthorizationDigest(record), approvers: [operator], authorizedAt: now, expiresAt: now + lifetimeSeconds }, 'AUTHORIZATION');
}

// ---------------------------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------------------------

/** Serialized ledger format tag. */
export const REFUND_LEDGER_FORMAT = 'ghostpay-refund-ledger/1';

const big = (v: bigint): string => v.toString();

/** Serializes a validated ledger to JSON (bigint as decimal strings). */
export function serializeRefundLedger(ledger: RefundLedger): string {
  validateRefundLedger(ledger);
  const records = ledger.map((r) => ({
    ...r,
    original: { ...r.original, amount: big(r.original.amount), blockNumber: big(r.original.blockNumber), confirmations: big(r.original.confirmations) },
    amount: big(r.amount),
    attempt: r.attempt === null ? null : { ...r.attempt, value: big(r.attempt.value), gross: big(r.attempt.gross), netAmount: big(r.attempt.netAmount), startBlock: big(r.attempt.startBlock) },
    settlement: r.settlement === null ? null : { ...r.settlement, blockNumber: big(r.settlement.blockNumber), confirmations: big(r.settlement.confirmations) },
  }));
  return JSON.stringify({ format: REFUND_LEDGER_FORMAT, records });
}

type Obj = Record<string, unknown>;

function exact(v: unknown, keys: readonly string[]): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('STATE', 'malformed ledger');
  const own = Object.keys(v);
  if (own.length !== keys.length || !keys.every((k) => Object.prototype.hasOwnProperty.call(v, k))) fail('STATE', 'malformed ledger');
  return v as Obj;
}

function dec(v: unknown): bigint {
  if (typeof v !== 'string' || !DEC_RE.test(v)) return fail('STATE', 'malformed ledger number');
  const n = BigInt(v);
  if (n > MAX_UINT256) fail('STATE', 'malformed ledger number');
  return n;
}

const EVIDENCE_KEYS = ['paymentId', 'invoiceId', 'chainId', 'assetId', 'amount', 'transactionHash', 'logIndex', 'senderAddress',
  'recipientAddress', 'status', 'blockNumber', 'blockHash', 'blockTimestamp', 'confirmations', 'evidenceId', 'verifier', 'verifiedAt'];
const RECORD_KEYS = ['v', 'refundId', 'idempotencyKey', 'original', 'amount', 'destinationMeta', 'reason', 'state', 'createdAt',
  'updatedAt', 'authorization', 'attempt', 'settlement', 'note'];
const AUTH_KEYS = ['method', 'digest', 'approvers', 'authorizedAt', 'expiresAt'];
const ATTEMPT_KEYS = ['chainId', 'from', 'to', 'data', 'value', 'gross', 'netAmount', 'assetId', 'stealthAddress', 'ephemeralPublicKey',
  'deadline', 'startBlock', 'txDigest', 'preparedAt', 'requestedAt', 'transactionHash', 'replacementHashes'];
const SETTLEMENT_KEYS = ['transactionHash', 'blockNumber', 'blockHash', 'confirmations', 'final', 'observedAt'];

/**
 * Parses and validates a serialized ledger. Anything unexpected fails closed: callers must not start new refunds
 * from a store that does not parse.
 *
 * @throws {BillingError} `STATE`.
 */
export function parseRefundLedger(text: string): RefundLedger {
  if (typeof text !== 'string' || text.length > MAX_LEDGER_TEXT) fail('STATE', 'ledger too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('STATE', 'malformed ledger');
  }
  const top = exact(raw, ['format', 'records']);
  if (top['format'] !== REFUND_LEDGER_FORMAT || !Array.isArray(top['records'])) fail('STATE', 'malformed ledger');
  const records = (top['records'] as unknown[]).map((item): RefundRecord => {
    const r = exact(item, RECORD_KEYS);
    const o = exact(r['original'], EVIDENCE_KEYS);
    const original = { ...o, amount: dec(o['amount']), blockNumber: dec(o['blockNumber']), confirmations: dec(o['confirmations']) } as unknown as PaymentEvidence;
    const authorization = r['authorization'] === null ? null : exact(r['authorization'], AUTH_KEYS) as unknown as RefundAuthorization;
    let attempt: RefundAttempt | null = null;
    if (r['attempt'] !== null) {
      const a = exact(r['attempt'], ATTEMPT_KEYS);
      attempt = { ...a, value: dec(a['value']), gross: dec(a['gross']), netAmount: dec(a['netAmount']), startBlock: dec(a['startBlock']) } as unknown as RefundAttempt;
    }
    let settlement: RefundSettlement | null = null;
    if (r['settlement'] !== null) {
      const s = exact(r['settlement'], SETTLEMENT_KEYS);
      settlement = { ...s, blockNumber: dec(s['blockNumber']), confirmations: dec(s['confirmations']) } as unknown as RefundSettlement;
    }
    return Object.freeze({ ...r, original, amount: dec(r['amount']), authorization, attempt, settlement } as unknown as RefundRecord);
  });
  return Object.freeze(validateRefundLedger(records));
}

// ---------------------------------------------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------------------------------------------

/** User-facing refund category. */
export type RefundDisplayCategory =
  | 'requires-authorization'
  | 'available'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'needs-attention'
  | 'cancelled';

/** Fixed guidance codes for UI copy (translate in the app; never echo record data into them). */
export type RefundGuidance =
  | 'approve-refund'
  | 'authorization-expired'
  | 'review-and-sign'
  | 'prepare-again'
  | 'confirm-in-wallet-once'
  | 'wallet-outcome-unknown-do-not-resend'
  | 'awaiting-confirmation'
  | 'awaiting-finality'
  | 'reorged-awaiting-reinclusion'
  | 'completed-verified'
  | 'not-sent-funds-unchanged'
  | 'evidence-conflict-review-manually'
  | 'cancelled';

/** Presentation of one record. */
export interface RefundDisplay {
  readonly category: RefundDisplayCategory;
  readonly guidance: RefundGuidance;
  /** True only while no wallet request was ever made. */
  readonly canCancel: boolean;
  /** True when the amount still counts against the payment. */
  readonly reservesFunds: boolean;
  /** Seconds until the attempt deadline (0 when passed), for pending attempts. */
  readonly secondsUntilDeadline: number | null;
}

/**
 * Maps a record to an honest status. `completed` is shown only for a verified final transfer.
 *
 * @param record Validated record.
 * @param now Current Unix seconds.
 */
export function describeRefund(record: RefundRecord, now: number): RefundDisplay {
  checkNow(now);
  const a = record.attempt;
  const left = a === null ? null : Math.max(0, a.deadline - now);
  const out = (category: RefundDisplayCategory, guidance: RefundGuidance, secondsUntilDeadline: number | null = null): RefundDisplay => ({
    category, guidance, canCancel: !walletMayHaveSigned(record.state) && record.state !== 'definitively-failed' && record.state !== 'cancelled',
    reservesFunds: reservesFunds(record.state), secondsUntilDeadline,
  });
  switch (record.state) {
    case 'authorization-required': return out('requires-authorization', 'approve-refund');
    case 'authorized': return now >= (record.authorization as RefundAuthorization).expiresAt ? out('requires-authorization', 'authorization-expired') : out('available', 'review-and-sign');
    case 'prepared': return now + MIN_SUBMIT_MARGIN_SECONDS >= (a as RefundAttempt).deadline || now >= (record.authorization as RefundAuthorization).expiresAt
      ? out('available', 'prepare-again', left) : out('available', 'review-and-sign', left);
    case 'awaiting-signature': return out('pending', 'confirm-in-wallet-once', left);
    case 'submission-uncertain': return out('pending', 'wallet-outcome-unknown-do-not-resend', left);
    case 'submitted': return out('pending', record.note === 'reorged-out' ? 'reorged-awaiting-reinclusion' : 'awaiting-confirmation', left);
    case 'confirmed': return out('pending', 'awaiting-finality', left);
    case 'finalized': return out('completed', 'completed-verified');
    case 'definitively-failed': return out('failed', 'not-sent-funds-unchanged');
    case 'recovery-required': return out('needs-attention', 'evidence-conflict-review-manually');
    case 'cancelled': return out('cancelled', 'cancelled');
    default: return fail('STATE', 'record state');
  }
}
