import { hex } from '@scure/base';
import type * as btc from '@scure/btc-signer';
import { fail } from '../errors.js';
import { addressToScript, assertNetwork, type BtcNetwork } from '../network.js';
import {
  inputHasKeypaths,
  inputHasPartialSigs,
  inputOutpoint,
  inputPrevOut,
  isInputFinalized,
  outputHasKeypaths,
  outputInfo,
  parsePsbt,
  psbtFee,
  sameBytes,
  type PrevOut,
} from '../psbt.js';
import type { ReceiverWallet } from '../signers.js';
import type { SeenInputs } from './seen.js';

/** Receiver configuration shared by checks and proposal building. */
export interface ReceiverContext {
  readonly wallet: ReceiverWallet;
  readonly seen: SeenInputs;
  readonly network: BtcNetwork;
  /** Invoice address (payment output). */
  readonly address: string;
  readonly amountSats?: bigint;
  readonly mode: 'interactive' | 'non-interactive';
  /** Allow contributing a detected silent-payment output as the extra input (BPJ-RCV-9). */
  readonly contributeFromSp?: boolean;
  /** Minimum feerate (sat/vB) the Original must pay; default 1. */
  readonly minOriginalFeeRate?: number;
  /**
   * Hard cap (sat/vB of the added input's vsize) on the fee the receiver pays
   * out of its own funds; default {@link DEFAULT_MAX_CONTRIBUTION_FEE_RATE}.
   * Bounds the loss when the sender lies about its input amounts (BITCOIN-01).
   */
  readonly maxContributionFeeRate?: number;
  /** Allow replying with the Original unchanged when no input can be added (default false). */
  readonly allowNoop?: boolean;
  /** Fresh own address of the same script type to substitute for the payment output (if the sender allows). */
  readonly substituteAddress?: string;
  /** Injected randomness 0..1 (BPJ-GEN-4). */
  readonly random?: () => number;
  readonly now?: () => number;
}

/** Default for {@link ReceiverContext.maxContributionFeeRate} (sat/vB). */
export const DEFAULT_MAX_CONTRIBUTION_FEE_RATE = 100;

/** A validated Original. */
export interface CheckedOriginal {
  readonly tx: btc.Transaction;
  readonly prevOuts: ReadonlyMap<string, PrevOut>;
  readonly outpoints: readonly string[];
  readonly fee: bigint;
  readonly vsize: number;
  readonly paymentIndex: number;
  readonly sequence: number;
}

/**
 * Receiver's Original PSBT checklist (BIP-78 "Receiver's original PSBT
 * checklist" and "The original PSBT MUST"; BPJ-RCV-1..5).
 *
 * @remarks Does not record the outpoints; the session records them only after a
 * proposal was built, and holds an in-flight lock meanwhile.
 * @security Rejects: unfinalized or incomplete inputs, leaked keypaths, inputs
 * owned by this wallet, inputs seen before (anti-probing and anti-reentrancy),
 * and, in non-interactive mode, an Original the node would not accept.
 * @throws {PayjoinError}
 */
export async function checkOriginal(psbtB64: string, ctx: ReceiverContext): Promise<CheckedOriginal> {
  assertNetwork(ctx.network);
  const payScript = addressToScript(ctx.address, ctx.network);
  const tx = parsePsbt(psbtB64);
  if (tx.inputsLength === 0 || tx.outputsLength === 0) fail('psbt_invalid');
  const prevOuts = new Map<string, PrevOut>();
  const outpoints: string[] = [];
  const sequences = new Set<number>();
  for (let i = 0; i < tx.inputsLength; i++) {
    const op = inputOutpoint(tx, i);
    if (prevOuts.has(op)) fail('psbt_invalid', 'duplicate input');
    outpoints.push(op);
    if (!isInputFinalized(tx, i)) fail('psbt_not_finalized');
    if (inputHasKeypaths(tx, i) || inputHasPartialSigs(tx, i)) fail('keypaths_present');
    const prev = inputPrevOut(tx, i);
    if (ctx.wallet.isMine(prev.script)) fail('input_owned_by_receiver');
    prevOuts.set(op, prev);
    sequences.add(tx.getInput(i).sequence ?? 0xffffffff);
  }
  if (ctx.wallet.getPrevOut !== undefined) {
    // Sender-claimed amounts drive the fee maths; check them against the chain (BITCOIN-01).
    for (let i = 0; i < tx.inputsLength; i++) {
      const inp = tx.getInput(i);
      const claimed = prevOuts.get(outpoints[i] as string) as PrevOut;
      const real = await ctx.wallet.getPrevOut(hex.encode(inp.txid as Uint8Array), inp.index as number).catch(() => undefined);
      if (real === undefined || real.amount !== claimed.amount || !sameBytes(real.script, claimed.script)) fail('psbt_invalid', 'prevout does not match chain');
    }
  }
  for (let k = 0; k < tx.outputsLength; k++) if (outputHasKeypaths(tx, k)) fail('keypaths_present');
  if (sequences.size !== 1) fail('sequence_changed', 'original inputs use mixed sequences');
  if (!tx.isFinal) fail('psbt_not_finalized');
  const fee = psbtFee(tx);
  const vsize = tx.vsize;
  const minRate = ctx.minOriginalFeeRate ?? 1;
  if (fee * 1_000_000n < BigInt(Math.ceil(minRate * 1_000_000)) * BigInt(vsize)) fail('feerate_below_min');

  let paymentIndex = -1;
  for (let k = 0; k < tx.outputsLength; k++) {
    if (sameBytes(outputInfo(tx, k).script, payScript)) {
      paymentIndex = k;
      break;
    }
  }
  if (paymentIndex < 0) fail('output_missing');
  if (ctx.amountSats !== undefined && outputInfo(tx, paymentIndex).amount < ctx.amountSats) fail('output_decreased');

  for (const op of outpoints) if (await ctx.seen.has(op)) fail('input_seen');

  if (ctx.mode === 'non-interactive') {
    if (ctx.wallet.testMempoolAccept === undefined) fail('not_broadcastable', 'wallet cannot test mempool acceptance');
    const ok = await ctx.wallet.testMempoolAccept(tx.hex).catch(() => false);
    if (!ok) fail('not_broadcastable');
  }
  return { tx, prevOuts, outpoints, fee, vsize, paymentIndex, sequence: [...sequences][0] as number };
}
