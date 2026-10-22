import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { MultisigError } from './errors.js';
import { policyHash, validatePolicy, type MultisigPolicy } from './policy.js';
import { proposalDigest, validateProposal, type Proposal } from './proposal.js';
import { PUBKEY_RE, SIG_RE } from './validate.js';

/** Hard cap on approvals evaluated per call (DoS bound). */
export const MAX_APPROVALS = 64;

/** One signer's approval of a proposal digest. */
export interface Approval {
  /** Compressed public key of the signer, lowercase hex. */
  readonly signer: string;
  /** 64-byte compact low-s ECDSA signature, lowercase hex. */
  readonly signature: string;
}

/** Why an approval did not count. */
export type ApprovalRejection = 'MALFORMED' | 'UNKNOWN_SIGNER' | 'DUPLICATE_SIGNER' | 'BAD_SIGNATURE';

/** Result of {@link evaluateApprovals}. */
export interface ApprovalEvaluation {
  /** Proposal digest, lowercase hex. */
  readonly digest: string;
  /** Distinct policy signers with a valid signature, sorted. */
  readonly approvedBy: readonly string[];
  /** Approvals that did not count, by input index. */
  readonly rejected: readonly { readonly index: number; readonly reason: ApprovalRejection }[];
  readonly threshold: number;
  readonly thresholdMet: boolean;
}

/**
 * Signs a proposal digest with one signer's key (ECDSA secp256k1, RFC 6979, low-s).
 *
 * @param proposal Proposal (re-validated).
 * @param secretKey 32-byte secret key. The caller owns and should wipe it.
 * @returns The approval.
 * @throws {MultisigError} `SIGNING` for an invalid key, `PROPOSAL` for an invalid proposal.
 * @security Use a dedicated merchant-approval key, never spend/view/invoice keys.
 * Signing only proves the holder approved these exact bytes; it is not executed
 * on-chain by this package.
 */
export function signProposal(proposal: Proposal, secretKey: Uint8Array): Approval {
  const digest = proposalDigest(proposal);
  let signer: string;
  try {
    signer = bytesToHex(secp256k1.getPublicKey(secretKey, true));
  } catch {
    throw new MultisigError('SIGNING');
  }
  const signature = bytesToHex(secp256k1.sign(digest, secretKey, { prehash: false, lowS: true }));
  return Object.freeze({ signer, signature });
}

function verifyRaw(digest: Uint8Array, signer: string, signature: string): boolean {
  try {
    return secp256k1.verify(hexToBytes(signature), digest, hexToBytes(signer), {
      prehash: false,
      lowS: true,
    });
  } catch {
    return false;
  }
}

/**
 * Checks that the proposal is bound to this policy (account, chain, policy hash).
 *
 * @throws {MultisigError} `BINDING` on mismatch.
 * @security Prevents replay across accounts, chains and signer-set versions.
 */
export function assertBound(policy: MultisigPolicy, proposal: Proposal): void {
  if (proposal.accountId !== policy.accountId || proposal.chainId !== policy.chainId) {
    throw new MultisigError('BINDING');
  }
  if (proposal.policyHash !== policyHash(policy)) throw new MultisigError('BINDING', 'policyHash');
}

/**
 * Counts distinct valid approvals from policy signers.
 *
 * @remarks Each signer counts at most once regardless of how many (possibly
 * differently-encoded) signatures they submit. Signatures must be low-s, so the
 * (r, n-s) malleated twin is rejected. Invalid entries are reported, not thrown,
 * so a single bad approval cannot block an otherwise valid quorum.
 *
 * @param policy Current policy (re-validated).
 * @param proposal Proposal (re-validated and binding-checked).
 * @param approvals Untrusted approvals.
 * @returns Evaluation; `thresholdMet` iff distinct valid signers >= threshold.
 * @throws {MultisigError} `BINDING`, `PROPOSAL`, `POLICY`, or `LIMIT` (> {@link MAX_APPROVALS}).
 * @security Trust boundary. The only function that decides whether a quorum exists.
 */
export function evaluateApprovals(
  policy: MultisigPolicy,
  proposal: Proposal,
  approvals: readonly Approval[],
): ApprovalEvaluation {
  const pol = validatePolicy(policy);
  const prop = validateProposal(proposal);
  assertBound(pol, prop);
  if (!Array.isArray(approvals)) throw new MultisigError('PROPOSAL', 'approvals');
  if (approvals.length > MAX_APPROVALS) throw new MultisigError('LIMIT', 'approvals');
  const digest = proposalDigest(prop);
  const members = new Set(pol.signers.map((s) => s.publicKey));
  const approved = new Set<string>();
  const rejected: { index: number; reason: ApprovalRejection }[] = [];
  approvals.forEach((a: unknown, index) => {
    const rec = a as { signer?: unknown; signature?: unknown } | null;
    const signer = typeof rec === 'object' && rec !== null ? rec.signer : undefined;
    const signature = typeof rec === 'object' && rec !== null ? rec.signature : undefined;
    if (
      typeof signer !== 'string' ||
      typeof signature !== 'string' ||
      !PUBKEY_RE.test(signer) ||
      !SIG_RE.test(signature)
    ) {
      rejected.push({ index, reason: 'MALFORMED' });
    } else if (!members.has(signer)) {
      rejected.push({ index, reason: 'UNKNOWN_SIGNER' });
    } else if (approved.has(signer)) {
      rejected.push({ index, reason: 'DUPLICATE_SIGNER' });
    } else if (!verifyRaw(digest, signer, signature)) {
      rejected.push({ index, reason: 'BAD_SIGNATURE' });
    } else {
      approved.add(signer);
    }
  });
  const approvedBy = [...approved].sort();
  return Object.freeze({
    digest: bytesToHex(digest),
    approvedBy: Object.freeze(approvedBy),
    rejected: Object.freeze(rejected.map((r) => Object.freeze(r))),
    threshold: pol.threshold,
    thresholdMet: approvedBy.length >= pol.threshold,
  });
}
