import * as btc from '@scure/btc-signer';
import { fail } from '../errors.js';
import { addressToScript } from '../network.js';
import type { PayjoinParams } from '../params.js';
import { encodePsbt, estimateInputVsize, outpointKey, outputInfo, sameBytes, type Utxo } from '../psbt.js';
import { secureUnit } from '../rng.js';
import { verifyKeyPathInput } from '../signers.js';
import { DEFAULT_MAX_CONTRIBUTION_FEE_RATE, type CheckedOriginal, type ReceiverContext } from './checks.js';
import type { ExposedUtxos } from './seen.js';

/** Result of {@link buildProposal}. */
export interface BuiltProposal {
  readonly psbt: string;
  readonly contributedOutpoints: readonly string[];
  /** True when the receiver added an input (a real payjoin). */
  readonly contributed: boolean;
}

function scriptKind(s: Uint8Array): string {
  if (s.length === 22 && s[0] === 0x00 && s[1] === 0x14) return 'wpkh';
  if (s.length === 34 && s[0] === 0x51 && s[1] === 0x20) return 'tr';
  if (s.length === 23 && s[0] === 0xa9) return 'sh';
  if (s.length === 25 && s[0] === 0x76) return 'pkh';
  return 'other';
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

/**
 * Builds the Payjoin proposal (BIP-78 "The payjoin proposal MUST/MAY/MUST NOT";
 * BPJ-RCV-6..11).
 *
 * @remarks Policy, in order:
 * 1. Candidate selection (one UTXO only, BPJ-RCV-10): not an Original input;
 *    value above 3x its own input fee; silent-payment UTXOs only when
 *    `contributeFromSp`; previously exposed UTXOs first, then same script type
 *    as the sender's inputs, then smallest sufficient value.
 * 2. Fee: the receiver must raise the absolute fee by
 *    `max(ceil(F0 * vi / V0), minfeerate shortfall)` where `F0`, `V0` are the
 *    Original fee and vsize and `vi` the added input's vsize. The sender's fee
 *    output pays at most `min(maxadditionalfeecontribution, extra,
 *    floor(F0 * vSenderMax / V0))` and never below dust; the receiver's payment
 *    output pays the rest, at most `ceil(maxContributionFeeRate * vi)` (an
 *    absolute cap, since `F0` comes from sender-claimed amounts). The payment output grows by the contributed value
 *    minus the receiver's share, and never drops below the Original's.
 * 3. The input goes to a random position; senders' inputs/outputs keep their
 *    order; keypaths and partial signatures are absent; the receiver input is
 *    finalized and its signature verified (P2WPKH, P2TR key-path) before release.
 * 4. Optional output substitution only when the sender allows it, to a fresh
 *    own address of the same script type.
 * @param exposed Optional store of already exposed UTXOs (updated on success).
 * @security Funds-critical for the receiver. Never signs a sender input.
 * @throws {PayjoinError} `not_enough_money`, `unavailable`, `psbt_invalid`.
 */
export async function buildProposal(
  c: CheckedOriginal,
  params: PayjoinParams,
  ctx: ReceiverContext,
  exposed?: ExposedUtxos,
): Promise<BuiltProposal> {
  const rnd = ctx.random ?? secureUnit;
  const orig = c.tx;
  const F0 = c.fee;
  const V0 = BigInt(c.vsize);
  const payment = outputInfo(orig, c.paymentIndex);

  const senderKinds = new Set<string>();
  let maxSenderVsize = 0;
  for (const p of c.prevOuts.values()) {
    senderKinds.add(scriptKind(p.script));
    maxSenderVsize = Math.max(maxSenderVsize, estimateInputVsize(p.script));
  }

  const exposedSet = new Set(exposed === undefined ? [] : await exposed.list());
  const all = await ctx.wallet.listSpendable();
  type Cand = { u: Utxo; vi: number; extra: bigint; key: string };
  const cands: Cand[] = [];
  for (const u of all) {
    const key = outpointKey(u.txid, u.index);
    if (c.prevOuts.has(key)) continue;
    if (!ctx.wallet.isMine(u.script)) continue;
    if (u.source === 'silent-payment' && ctx.contributeFromSp !== true) continue;
    const vi = u.inputVsize ?? estimateInputVsize(u.script);
    const extraFeerate = ceilDiv(F0 * BigInt(vi), V0);
    if (u.amount <= 3n * extraFeerate) continue; // BPJ-RCV-10
    let extra = extraFeerate;
    if (params.minFeeRateSatPerVb !== undefined) {
      const need = ceilDiv(BigInt(Math.ceil(params.minFeeRateSatPerVb * 1_000_000)) * (V0 + BigInt(vi)), 1_000_000n);
      if (need - F0 > extra) extra = need - F0;
    }
    cands.push({ u, vi, extra, key });
  }
  cands.sort((a, b) => {
    const ea = exposedSet.has(a.key) ? 0 : 1;
    const eb = exposedSet.has(b.key) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const ka = senderKinds.has(scriptKind(a.u.script)) ? 0 : 1;
    const kb = senderKinds.has(scriptKind(b.u.script)) ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return a.u.amount < b.u.amount ? -1 : a.u.amount > b.u.amount ? 1 : 0;
  });

  const allowSubst = !params.disableOutputSubstitution;
  // Valid fee output (BIP-78: both parameters valid, in range, not the payment output).
  let feeIdx: number | undefined;
  if (
    params.additionalFeeOutputIndex !== undefined &&
    params.maxAdditionalFeeContributionSats !== undefined &&
    params.maxAdditionalFeeContributionSats >= 0n &&
    params.additionalFeeOutputIndex < orig.outputsLength &&
    params.additionalFeeOutputIndex !== c.paymentIndex
  ) {
    feeIdx = params.additionalFeeOutputIndex;
  }

  const capRate = ctx.maxContributionFeeRate ?? DEFAULT_MAX_CONTRIBUTION_FEE_RATE;
  const ownCap = (vi: number): bigint => ceilDiv(BigInt(Math.ceil(capRate * 1_000_000)) * BigInt(vi), 1_000_000n);
  let chosen: { cand: Cand; senderShare: bigint; ownShare: bigint } | undefined;
  for (const cand of cands) {
    let sc = 0n;
    if (feeIdx !== undefined) {
      const feeOut = outputInfo(orig, feeIdx);
      const capByCost = (F0 * BigInt(maxSenderVsize)) / V0;
      sc = cand.extra;
      if (sc > (params.maxAdditionalFeeContributionSats as bigint)) sc = params.maxAdditionalFeeContributionSats as bigint;
      if (sc > capByCost) sc = capByCost;
      if (sc > feeOut.amount) sc = feeOut.amount;
      if (feeOut.amount - sc < 546n) sc = feeOut.amount > 546n ? feeOut.amount - 546n : 0n;
    }
    const own = cand.extra - sc;
    // Absolute cap: never trust the (sender-claimed) F0 or minfeerate for our own spend (BITCOIN-01).
    if (own > ownCap(cand.vi)) continue;
    const newPayment = payment.amount + cand.u.amount - own;
    if (newPayment < payment.amount) continue;
    if (ctx.amountSats !== undefined && newPayment < ctx.amountSats) continue;
    chosen = { cand, senderShare: sc, ownShare: own };
    break;
  }

  if (chosen === undefined) {
    if (ctx.allowNoop === true && cands.length === 0) {
      return { psbt: encodePsbt(orig), contributedOutpoints: [], contributed: false };
    }
    return fail(cands.length === 0 ? 'unavailable' : 'not_enough_money', cands.length === 0 ? 'no suitable utxo' : undefined);
  }

  // Assemble: sender inputs in order, receiver input at a random index.
  const tx = new btc.Transaction({ version: orig.version, lockTime: orig.lockTime, allowUnknownInputs: true, allowUnknownOutputs: true });
  const insertAt = Math.floor(rnd() * (orig.inputsLength + 1)) % (orig.inputsLength + 1);
  const addReceiver = (): number => {
    const u = chosen.cand.u;
    return tx.addInput({
      txid: u.txid,
      index: u.index,
      sequence: c.sequence,
      witnessUtxo: { script: u.script, amount: u.amount },
      ...(u.signing?.redeemScript !== undefined ? { redeemScript: u.signing.redeemScript } : {}),
      ...(u.signing?.witnessScript !== undefined ? { witnessScript: u.signing.witnessScript } : {}),
      ...(u.signing?.tapInternalKey !== undefined ? { tapInternalKey: u.signing.tapInternalKey } : {}),
    });
  };
  let receiverIdx = -1;
  for (let i = 0; i < orig.inputsLength; i++) {
    if (i === insertAt) receiverIdx = addReceiver();
    const inp = orig.getInput(i);
    if (inp.txid === undefined || inp.index === undefined) fail('psbt_invalid');
    tx.addInput({
      txid: inp.txid,
      index: inp.index,
      sequence: c.sequence,
      ...(inp.nonWitnessUtxo !== undefined ? { nonWitnessUtxo: inp.nonWitnessUtxo } : {}),
      ...(inp.witnessUtxo !== undefined ? { witnessUtxo: inp.witnessUtxo } : {}),
    });
  }
  if (receiverIdx < 0) receiverIdx = addReceiver();

  let substScript: Uint8Array | undefined;
  if (allowSubst && ctx.substituteAddress !== undefined) {
    const s = addressToScript(ctx.substituteAddress, ctx.network);
    if (scriptKind(s) === scriptKind(payment.script) && !sameBytes(s, payment.script)) substScript = s;
  }
  for (let k = 0; k < orig.outputsLength; k++) {
    const o = outputInfo(orig, k);
    if (k === c.paymentIndex) {
      tx.addOutput({ script: substScript ?? o.script, amount: o.amount + chosen.cand.u.amount - chosen.ownShare });
    } else if (k === feeIdx) {
      tx.addOutput({ script: o.script, amount: o.amount - chosen.senderShare });
    } else {
      tx.addOutput({ script: o.script, amount: o.amount });
    }
  }

  ctx.wallet.signInput(tx, receiverIdx, chosen.cand.u);
  tx.finalizeIdx(receiverIdx);
  if (verifyKeyPathInput(tx, receiverIdx) === false) fail('psbt_invalid', 'receiver signature failed verification');

  const key = chosen.cand.key;
  if (exposed !== undefined) await exposed.add(key);
  return { psbt: encodePsbt(tx), contributedOutpoints: [key], contributed: true };
}
