import * as btc from '@scure/btc-signer';
import { fail } from '../errors.js';
import { addressToScript, assertNetwork, netParams } from '../network.js';
import { encodePsbt, estimateInputVsize, inputHasKeypaths, inputHasPartialSigs, outputHasKeypaths, type Utxo } from '../psbt.js';
import { secureUnit } from '../rng.js';
import type { PsbtSigner } from '../signers.js';
import type { PayjoinUri } from '../uri.js';

/** Sequence used for every input (RBF-signalling, identical across inputs as BIP-78 requires). */
export const ORIGINAL_SEQUENCE = 0xfffffffd;
/** Output below this value is folded into the fee instead of becoming change. */
export const DUST_LIMIT_SATS = 546n;

/** Everything needed to build the Original PSBT. */
export interface OriginalInputs {
  readonly uri: PayjoinUri;
  /** Amount to pay; falls back to `uri.amountSats`. */
  readonly amountSats?: bigint;
  /** All UTXOs to spend (the caller selects; every one is spent). */
  readonly utxos: readonly Utxo[];
  readonly feeRateSatPerVb: number;
  /** Change address on the same network (omit to burn the remainder into fee: not recommended). */
  readonly changeAddress: string;
  readonly signer: PsbtSigner;
  /** 0..1 source of randomness for output order (injected, BPJ-GEN-4). */
  readonly random?: () => number;
}

/** A built Original. */
export interface BuiltOriginal {
  /** Fully signed, finalized transaction object (the Original). */
  readonly tx: btc.Transaction;
  readonly psbt: string;
  readonly fee: bigint;
  /** Index of the change output, if any (a valid `additionalfeeoutputindex`). */
  readonly changeIndex?: number;
  readonly paymentIndex: number;
  /** Sender-private signing data per input outpoint, re-applied to the proposal before signing. */
  readonly signingData: ReadonlyMap<string, Utxo>;
}

function buildOnce(i: OriginalInputs, amount: bigint, fee: bigint, paymentFirst: boolean): { tx: btc.Transaction; changeIndex?: number; paymentIndex: number } {
  const net = netParams(i.uri.network);
  const tx = new btc.Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true });
  let total = 0n;
  for (const u of i.utxos) {
    total += u.amount;
    tx.addInput({
      txid: u.txid,
      index: u.index,
      sequence: ORIGINAL_SEQUENCE,
      witnessUtxo: { script: u.script, amount: u.amount },
      ...(u.signing?.redeemScript !== undefined ? { redeemScript: u.signing.redeemScript } : {}),
      ...(u.signing?.witnessScript !== undefined ? { witnessScript: u.signing.witnessScript } : {}),
      ...(u.signing?.tapInternalKey !== undefined ? { tapInternalKey: u.signing.tapInternalKey } : {}),
    });
  }
  const change = total - amount - fee;
  if (change < 0n) fail('not_enough_money', 'inputs do not cover amount and fee');
  const hasChange = change >= DUST_LIMIT_SATS;
  const pay = (): number => tx.addOutputAddress(i.uri.address, amount, net);
  const chg = (): number => tx.addOutputAddress(i.changeAddress, change, net);
  let paymentIndex: number;
  let changeIndex: number | undefined;
  if (paymentFirst || !hasChange) {
    paymentIndex = pay();
    if (hasChange) changeIndex = chg();
  } else {
    changeIndex = chg();
    paymentIndex = pay();
  }
  return { tx, ...(changeIndex !== undefined ? { changeIndex } : {}), paymentIndex };
}

/**
 * Builds, signs and finalizes the Original PSBT (BIP-78 "The original PSBT MUST").
 *
 * @remarks Two passes: the fee is re-derived from the signed vsize so the
 * requested feerate is met. The output PSBT has `witness_utxo` on every input,
 * is finalized, and carries no keypaths or partial signatures (asserted).
 * Silent-payment inputs/outputs are never created here (BPJ-SP-1/-SND-3).
 * @security Chain guard via {@link assertNetwork}.
 * @throws {PayjoinError} `not_enough_money`, `uri_invalid`, `network_not_allowed`.
 */
export function buildOriginalPsbt(i: OriginalInputs): BuiltOriginal {
  assertNetwork(i.uri.network);
  addressToScript(i.uri.address, i.uri.network);
  addressToScript(i.changeAddress, i.uri.network);
  const amount = i.amountSats ?? i.uri.amountSats;
  if (amount === undefined || amount <= 0n) fail('uri_invalid', 'no amount');
  if (i.utxos.length === 0) fail('not_enough_money', 'no utxos');
  if (!Number.isFinite(i.feeRateSatPerVb) || i.feeRateSatPerVb < 1) fail('feerate_below_min');
  const paymentFirst = (i.random ?? secureUnit)() < 0.5;
  // Pass 1: estimate; pass 2: exact from signed size.
  let est = 11 + 2 * 31;
  for (const u of i.utxos) est += u.inputVsize ?? estimateInputVsize(u.script);
  let fee = BigInt(Math.ceil(est * i.feeRateSatPerVb));
  let built = buildOnce(i, amount, fee, paymentFirst);
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < i.utxos.length; k++) i.signer.signInput(built.tx, k);
    built.tx.finalize();
    const exact = BigInt(Math.ceil(built.tx.vsize * i.feeRateSatPerVb));
    if (exact <= fee) break;
    fee = exact;
    built = buildOnce(i, amount, fee, paymentFirst);
  }
  if (!built.tx.isFinal) built.tx.finalize();
  // Re-parse from the serialised PSBT so what we hold is exactly what we send.
  const psbt = encodePsbt(built.tx);
  const reparsed = btc.Transaction.fromPSBT(built.tx.toPSBT(0), { allowUnknownInputs: true, allowUnknownOutputs: true });
  for (let k = 0; k < reparsed.inputsLength; k++) {
    if (inputHasKeypaths(reparsed, k) || inputHasPartialSigs(reparsed, k)) fail('keypaths_present', 'original leaks data');
  }
  for (let k = 0; k < reparsed.outputsLength; k++) if (outputHasKeypaths(reparsed, k)) fail('keypaths_present');
  const signingData = new Map<string, Utxo>();
  for (const u of i.utxos) signingData.set(`${u.txid.toLowerCase()}:${String(u.index)}`, u);
  return {
    tx: reparsed,
    psbt,
    fee: reparsed.fee,
    ...(built.changeIndex !== undefined ? { changeIndex: built.changeIndex } : {}),
    paymentIndex: built.paymentIndex,
    signingData,
  };
}
