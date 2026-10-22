import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { TlvEncoder, U256_MAX, U64_MAX } from './encoding.js';
import { MultisigError } from './errors.js';
import { encodePolicyBody, validatePolicyBody, type PolicyBody } from './policy.js';
import {
  ACCOUNT_ID_RE,
  ASSET_RE,
  DEST_RE,
  HEX32_RE,
  INVOICE_ID_RE,
  asRecord,
  decimalString,
  int,
  readExact,
  str,
} from './validate.js';

/** Domain separation prefix of proposal digests (what signers sign). */
export const PROPOSAL_DOMAIN = 'GhostPay.MerchantMultisig.Proposal.v1\0';
/** Maximum `expiresAt - createdAt`: 60 days (must cover the longest timelock plus collection time). */
export const MAX_PROPOSAL_LIFETIME_SECONDS = 60 * 24 * 60 * 60;
/** Largest accepted unix timestamp (year 2286); keeps arithmetic far from 2^53. */
export const MAX_TIMESTAMP = 9_999_999_999;

/** Proposal kinds. `cancel` is executed immediately when it reaches threshold. */
export type ProposalKind = 'payout' | 'refund' | 'config' | 'cancel';

/** Fields every proposal carries; they bind it to one account, chain, policy and nonce. */
export interface ProposalBase {
  readonly kind: ProposalKind;
  readonly accountId: string;
  /** Canonical decimal chain id. */
  readonly chainId: string;
  /** {@link policyHash} of the policy in force when the proposal was created. */
  readonly policyHash: string;
  /** Canonical decimal u64; must equal the account's next nonce when queued. */
  readonly nonce: string;
  /** Unix seconds. */
  readonly createdAt: number;
  /** Unix seconds; the proposal cannot be queued or executed at or after this time. */
  readonly expiresAt: number;
}

/** Send funds out of the merchant account. */
export interface PayoutProposal extends ProposalBase {
  readonly kind: 'payout';
  readonly asset: string;
  readonly to: string;
  /** Base units, canonical decimal string, 1..2^256-1. */
  readonly amount: string;
}

/** Refund a specific invoice. */
export interface RefundProposal extends ProposalBase {
  readonly kind: 'refund';
  readonly asset: string;
  readonly to: string;
  readonly amount: string;
  readonly invoiceId: string;
}

/** Replace signers / threshold / timelocks (signer rotation). */
export interface ConfigProposal extends ProposalBase {
  readonly kind: 'config';
  readonly newPolicy: PolicyBody;
}

/** Cancel a queued proposal (by digest) before it executes. */
export interface CancelProposal extends ProposalBase {
  readonly kind: 'cancel';
  readonly targetDigest: string;
}

/** Any proposal. */
export type Proposal = PayoutProposal | RefundProposal | ConfigProposal | CancelProposal;

const BASE_KEYS = ['kind', 'accountId', 'chainId', 'policyHash', 'nonce', 'createdAt', 'expiresAt'] as const;
const KIND_KEYS: Readonly<Record<ProposalKind, readonly string[]>> = {
  payout: ['asset', 'to', 'amount'],
  refund: ['asset', 'to', 'amount', 'invoiceId'],
  config: ['newPolicy'],
  cancel: ['targetDigest'],
};
const KIND_TAG: Readonly<Record<ProposalKind, number>> = { payout: 1, refund: 2, config: 3, cancel: 4 };

/**
 * Validates an untrusted proposal.
 *
 * @param value Untrusted input.
 * @returns Frozen canonical copy.
 * @throws {MultisigError} `PROPOSAL` (or `POLICY` for a bad `newPolicy`).
 * @security Trust boundary: exact keys only, no accessors, amounts as canonical
 * decimal strings (never floats), bounded lifetimes.
 */
export function validateProposal(value: unknown): Proposal {
  const rec = asRecord(value, 'PROPOSAL', '');
  const kind = rec.kind;
  if (kind !== 'payout' && kind !== 'refund' && kind !== 'config' && kind !== 'cancel') {
    throw new MultisigError('PROPOSAL', 'kind');
  }
  const r = readExact(rec, [...BASE_KEYS, ...KIND_KEYS[kind]], 'PROPOSAL', '');
  const base = {
    accountId: str(r.accountId, ACCOUNT_ID_RE, 'PROPOSAL', 'accountId'),
    chainId: decimalString(r.chainId, 1n, U64_MAX, 'PROPOSAL', 'chainId'),
    policyHash: str(r.policyHash, HEX32_RE, 'PROPOSAL', 'policyHash'),
    nonce: decimalString(r.nonce, 0n, U64_MAX, 'PROPOSAL', 'nonce'),
    createdAt: int(r.createdAt, 0, MAX_TIMESTAMP, 'PROPOSAL', 'createdAt'),
    expiresAt: int(r.expiresAt, 1, MAX_TIMESTAMP, 'PROPOSAL', 'expiresAt'),
  };
  const life = base.expiresAt - base.createdAt;
  if (life <= 0 || life > MAX_PROPOSAL_LIFETIME_SECONDS) throw new MultisigError('PROPOSAL', 'expiresAt');
  switch (kind) {
    case 'payout':
      return Object.freeze({
        kind,
        ...base,
        asset: str(r.asset, ASSET_RE, 'PROPOSAL', 'asset'),
        to: str(r.to, DEST_RE, 'PROPOSAL', 'to'),
        amount: decimalString(r.amount, 1n, U256_MAX, 'PROPOSAL', 'amount'),
      });
    case 'refund':
      return Object.freeze({
        kind,
        ...base,
        asset: str(r.asset, ASSET_RE, 'PROPOSAL', 'asset'),
        to: str(r.to, DEST_RE, 'PROPOSAL', 'to'),
        amount: decimalString(r.amount, 1n, U256_MAX, 'PROPOSAL', 'amount'),
        invoiceId: str(r.invoiceId, INVOICE_ID_RE, 'PROPOSAL', 'invoiceId'),
      });
    case 'config':
      return Object.freeze({ kind, ...base, newPolicy: validatePolicyBody(r.newPolicy, 'newPolicy') });
    case 'cancel':
      return Object.freeze({
        kind,
        ...base,
        targetDigest: str(r.targetDigest, HEX32_RE, 'PROPOSAL', 'targetDigest'),
      });
  }
}

/**
 * Canonical bytes of a proposal (TLV, fixed field order, kind-tagged).
 *
 * @param proposal Proposal (re-validated).
 * @returns Encoded bytes (without the domain prefix).
 * @throws {MultisigError} If invalid.
 */
export function canonicalProposalBytes(proposal: Proposal): Uint8Array {
  const p = validateProposal(proposal);
  const enc = new TlvEncoder()
    .u64(0x01, BigInt(KIND_TAG[p.kind]))
    .str(0x02, p.accountId)
    .u64(0x03, BigInt(p.chainId))
    .bytes(0x04, hexToBytes(p.policyHash))
    .u64(0x05, BigInt(p.nonce))
    .u64(0x06, BigInt(p.createdAt))
    .u64(0x07, BigInt(p.expiresAt));
  switch (p.kind) {
    case 'payout':
    case 'refund':
      enc.str(0x30, p.asset).str(0x31, p.to).u256(0x32, BigInt(p.amount));
      if (p.kind === 'refund') enc.str(0x33, p.invoiceId);
      break;
    case 'config':
      encodePolicyBody(enc, p.newPolicy);
      break;
    case 'cancel':
      enc.bytes(0x40, hexToBytes(p.targetDigest));
      break;
  }
  return enc.finish();
}

/**
 * Signing digest: `keccak256("GhostPay.MerchantMultisig.Proposal.v1\0" || canonicalBytes)`.
 *
 * @param proposal Proposal (re-validated).
 * @returns 32-byte digest.
 * @throws {MultisigError} If invalid.
 * @security The domain prefix makes these signatures unusable as invoice
 * signatures (`GhostPay.Invoice.v1\0`) or Ethereum personal-sign / EIP-712
 * messages, and vice versa.
 */
export function proposalDigest(proposal: Proposal): Uint8Array {
  return keccak_256(concatBytes(utf8ToBytes(PROPOSAL_DOMAIN), canonicalProposalBytes(proposal)));
}

/** {@link proposalDigest} as lowercase hex. */
export function proposalDigestHex(proposal: Proposal): string {
  return bytesToHex(proposalDigest(proposal));
}
