import type * as btc from '@scure/btc-signer';
import { fail } from '../errors.js';
import type { PayjoinParams } from '../params.js';
import {
  estimateInputVsize,
  inputHasKeypaths,
  inputHasPartialSigs,
  inputOutpoint,
  inputPrevOut,
  isInputFinalized,
  outputHasKeypaths,
  outputInfo,
  psbtFee,
  sameBytes,
  type PrevOut,
} from '../psbt.js';

/** Context for {@link verifyProposal}. */
export interface VerifyContext {
  /** scriptPubKey of the invoice address (the payment output in the Original). */
  readonly paymentScript: Uint8Array;
}

/** What {@link verifyProposal} learned. */
export interface VerifiedProposal {
  /** Number of inputs the receiver added (0 means "not a real payjoin"). */
  readonly addedInputs: number;
  readonly originalFee: bigint;
  readonly proposalFee: bigint;
  /** Amount subtracted from the fee output (0n if none). */
  readonly feeContribution: bigint;
}

/** Sender-input prevouts keyed by outpoint, as the sender knows them from its own Original. */
export function senderPrevOuts(original: btc.Transaction): Map<string, PrevOut> {
  const m = new Map<string, PrevOut>();
  for (let i = 0; i < original.inputsLength; i++) m.set(inputOutpoint(original, i), inputPrevOut(original, i));
  return m;
}

/**
 * Sender's payjoin proposal checklist (BIP-78 "Sender's payjoin proposal
 * checklist", raw BIP retrieved 2026-10-21), run BEFORE signing.
 *
 * @remarks Order-preserving and fail-closed. Sender input amounts and scripts
 * are taken from the sender's own `original`, never from the proposal, so a
 * hostile receiver cannot lie about them. Receiver input amounts come from the
 * proposal (verified against `non_witness_utxo` hash when present).
 * @param original The sender's own fully signed, finalized Original.
 * @param proposal The receiver's Payjoin proposal as parsed.
 * @param params The parameters the sender actually sent.
 * @security Funds-critical. Any deviation throws; callers must not sign on throw.
 * @throws {PayjoinError} one code per violated check.
 */
export function verifyProposal(
  original: btc.Transaction,
  proposal: btc.Transaction,
  params: PayjoinParams,
  ctx: VerifyContext,
): VerifiedProposal {
  if (!original.isFinal) fail('psbt_not_finalized', 'original must be finalized');
  // Transaction version and nLockTime unchanged.
  if (proposal.version !== original.version || proposal.lockTime !== original.lockTime) {
    fail('version_or_locktime_changed');
  }

  const orig = senderPrevOuts(original);
  const origOrder: string[] = [];
  const origSeq = new Map<string, number>();
  for (let i = 0; i < original.inputsLength; i++) {
    const op = inputOutpoint(original, i);
    origOrder.push(op);
    origSeq.set(op, original.getInput(i).sequence ?? 0xffffffff);
  }

  // Inputs.
  const sequences = new Set<number>();
  const seenOutpoints = new Set<string>();
  const proposalSenderOrder: string[] = [];
  const prevOuts = new Map<string, PrevOut>();
  let added = 0;
  for (let i = 0; i < proposal.inputsLength; i++) {
    const op = inputOutpoint(proposal, i);
    if (seenOutpoints.has(op)) fail('psbt_invalid', 'duplicate input');
    seenOutpoints.add(op);
    const inp = proposal.getInput(i);
    const seq = inp.sequence ?? 0xffffffff;
    sequences.add(seq);
    if (inputHasKeypaths(proposal, i)) fail('keypaths_present');
    if (inputHasPartialSigs(proposal, i)) fail('partial_sigs_present');
    if (origSeq.has(op)) {
      if (seq !== origSeq.get(op)) fail('sequence_changed');
      if (isInputFinalized(proposal, i)) fail('sender_input_finalized');
      proposalSenderOrder.push(op);
      prevOuts.set(op, orig.get(op) as PrevOut);
    } else {
      if (!isInputFinalized(proposal, i)) fail('receiver_input_not_finalized');
      // inputPrevOut throws psbt_invalid when both utxo fields are missing or inconsistent.
      prevOuts.set(op, inputPrevOut(proposal, i));
      added++;
    }
  }
  if (sequences.size > 1) fail('sequence_changed', 'mixed sequence values');
  // All sender inputs present, in the original relative order.
  for (const op of origOrder) if (!seenOutpoints.has(op)) fail('input_missing');
  if (proposalSenderOrder.some((op, i) => op !== origOrder[i])) fail('order_changed');

  // Absolute fee not lower.
  const originalFee = psbtFee(original);
  const proposalFee = psbtFee(proposal, prevOuts);
  if (proposalFee < originalFee) fail('fee_decreased');
  const additionalFee = proposalFee - originalFee;

  // Outputs.
  let paymentIdx = -1;
  for (let j = 0; j < original.outputsLength; j++) {
    if (sameBytes(outputInfo(original, j).script, ctx.paymentScript)) {
      paymentIdx = j;
      break;
    }
  }
  if (paymentIdx < 0) fail('output_missing', 'invoice script not in original');
  const allowSubstitution = !params.disableOutputSubstitution;

  let feeIdx: number | undefined;
  if (
    params.additionalFeeOutputIndex !== undefined &&
    params.maxAdditionalFeeContributionSats !== undefined &&
    params.maxAdditionalFeeContributionSats >= 0n &&
    params.additionalFeeOutputIndex < original.outputsLength &&
    params.additionalFeeOutputIndex !== paymentIdx
  ) {
    feeIdx = params.additionalFeeOutputIndex;
  }

  for (let k = 0; k < proposal.outputsLength; k++) {
    if (outputHasKeypaths(proposal, k)) fail('keypaths_present');
  }

  const propOut: PrevOut[] = [];
  for (let k = 0; k < proposal.outputsLength; k++) propOut.push(outputInfo(proposal, k));
  const used = new Set<number>();
  let cursor = 0;
  let feeContribution = 0n;
  let maxSenderVsize = 0;
  for (const po of orig.values()) maxSenderVsize = Math.max(maxSenderVsize, estimateInputVsize(po.script));
  const originalVsize = BigInt(original.vsize);

  for (let j = 0; j < original.outputsLength; j++) {
    const o = outputInfo(original, j);
    const isPayment = j === paymentIdx;
    if (isPayment && allowSubstitution) continue; // "Do not make any check" on the payment output.
    let found = -1;
    for (let k = cursor; k < propOut.length; k++) {
      const cand = propOut[k] as PrevOut;
      if (!used.has(k) && sameBytes(cand.script, o.script)) {
        found = k;
        break;
      }
    }
    if (found < 0) {
      for (let k = 0; k < cursor; k++) {
        if (!used.has(k) && sameBytes((propOut[k] as PrevOut).script, o.script)) fail('order_changed');
      }
      fail(isPayment ? 'output_substitution_forbidden' : 'output_missing');
    }
    used.add(found);
    cursor = found + 1;
    const now = (propOut[found] as PrevOut).amount;
    if (now >= o.amount) continue;
    if (j !== feeIdx) fail('output_decreased');
    const contribution = o.amount - now;
    feeContribution = contribution;
    if (contribution > (params.maxAdditionalFeeContributionSats as bigint)) fail('fee_over_cap', 'above maxadditionalfeecontribution');
    if (contribution > additionalFee) fail('fee_over_cap', 'contribution is not only fee');
    // contribution <= originalFeeRate * vsize(sender input type) * added  (integer form)
    if (contribution * originalVsize > originalFee * BigInt(maxSenderVsize) * BigInt(added)) {
      fail('fee_over_cap', 'contribution exceeds added-input cost');
    }
  }
  return { addedInputs: added, originalFee, proposalFee, feeContribution };
}

/**
 * Post-signing check: "if `minfeerate` was specified, check that the fee rate
 * of the payjoin transaction is not less than this value" (BIP-78).
 *
 * @throws {PayjoinError} `feerate_below_min`.
 */
export function checkFinalFeeRate(finalTx: btc.Transaction, params: PayjoinParams): void {
  if (params.minFeeRateSatPerVb === undefined) return;
  if (!finalTx.isFinal) fail('psbt_not_finalized');
  const fee = psbtFee(finalTx);
  // fee / vsize >= minfeerate, compared in micro-units to avoid float drift.
  const lhs = fee * 1_000_000n;
  const rhs = BigInt(Math.ceil(params.minFeeRateSatPerVb * 1_000_000)) * BigInt(finalTx.vsize);
  if (lhs < rhs) fail('feerate_below_min');
}
