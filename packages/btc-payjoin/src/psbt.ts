import { sha256 } from '@noble/hashes/sha2.js';
import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { fail } from './errors.js';

/** Upper bound on a base64 PSBT accepted from the wire (about 150 KB decoded). */
export const MAX_PSBT_BASE64 = 200_000;

/** A spendable output as the wallet sees it. */
export interface Utxo {
  /** Transaction id as accepted by `@scure/btc-signer` `addInput`. */
  readonly txid: string;
  readonly index: number;
  readonly amount: bigint;
  readonly script: Uint8Array;
  /** Optional wallet-private data needed to sign (redeem script, taproot internal key, ...). */
  readonly signing?: { readonly redeemScript?: Uint8Array; readonly witnessScript?: Uint8Array; readonly tapInternalKey?: Uint8Array };
  /** Where the UTXO came from; silent-payment UTXOs are contributed only on request. */
  readonly source?: 'wallet' | 'silent-payment';
  /** Override of the estimated vsize of this input once signed. */
  readonly inputVsize?: number;
}

/** `{ script, amount }` of a spent output. */
export interface PrevOut {
  readonly script: Uint8Array;
  readonly amount: bigint;
}

/** @internal Canonical outpoint key. */
export function outpointKey(txid: Uint8Array | string, index: number): string {
  return `${typeof txid === 'string' ? txid.toLowerCase() : hex.encode(txid)}:${String(index)}`;
}

/**
 * Decodes a base64 PSBT into a transaction object.
 *
 * @throws {PayjoinError} `psbt_invalid` on any decoding failure or oversize input.
 */
export function parsePsbt(b64: string): btc.Transaction {
  if (typeof b64 !== 'string' || b64.length === 0 || b64.length > MAX_PSBT_BASE64) fail('psbt_invalid');
  try {
    return btc.Transaction.fromPSBT(base64.decode(b64.trim()), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
    });
  } catch {
    return fail('psbt_invalid');
  }
}

/** Serialises to a base64 PSBT (version 0). */
export function encodePsbt(tx: btc.Transaction): string {
  return base64.encode(tx.toPSBT(0));
}

/** @internal Outpoint of input `i`. */
export function inputOutpoint(tx: btc.Transaction, i: number): string {
  const inp = tx.getInput(i);
  if (inp.txid === undefined || inp.index === undefined) fail('psbt_invalid');
  return outpointKey(inp.txid, inp.index);
}

function txidOf(nonWitnessUtxo: Parameters<typeof btc.RawTx.encode>[0]): string {
  const raw = btc.RawTx.encode(nonWitnessUtxo);
  return hex.encode(sha256(sha256(raw)).reverse());
}

/**
 * Previous output spent by input `i`, from `witness_utxo` or `non_witness_utxo`.
 *
 * @remarks When `non_witness_utxo` is used, its hash is checked against the
 * input's txid so the amount cannot be forged.
 * @throws {PayjoinError} `psbt_invalid` when absent or inconsistent.
 */
export function inputPrevOut(tx: btc.Transaction, i: number): PrevOut {
  const inp = tx.getInput(i);
  if (inp.index === undefined || inp.txid === undefined) fail('psbt_invalid');
  if (inp.nonWitnessUtxo !== undefined) {
    const nw = inp.nonWitnessUtxo;
    const out = nw.outputs[inp.index] as { script: Uint8Array; amount: bigint } | undefined;
    // Defence in depth: `@scure/btc-signer` already rejects these on parse
    // (`nonWitnessUtxo: wrong txid`, `witnessUtxo different from nonWitnessUtxo`),
    // so they are not reachable through `parsePsbt`; kept because the amount
    // here decides fee maths and must never be taken on trust.
    /* v8 ignore start */
    if (out === undefined) fail('psbt_invalid');
    if (txidOf(nw) !== hex.encode(inp.txid)) fail('psbt_invalid', 'non_witness_utxo does not match input txid');
    if (inp.witnessUtxo !== undefined && (inp.witnessUtxo.amount !== out.amount || hex.encode(inp.witnessUtxo.script) !== hex.encode(out.script))) {
      fail('psbt_invalid', 'witness_utxo and non_witness_utxo disagree');
    }
    /* v8 ignore stop */
    return { script: out.script, amount: out.amount };
  }
  if (inp.witnessUtxo !== undefined) return { script: inp.witnessUtxo.script, amount: inp.witnessUtxo.amount };
  return fail('psbt_invalid', 'missing utxo data');
}

/** True when the input carries `final_scriptSig` or `final_scriptWitness`. */
export function isInputFinalized(tx: btc.Transaction, i: number): boolean {
  const inp = tx.getInput(i);
  return inp.finalScriptSig !== undefined || inp.finalScriptWitness !== undefined;
}

/** True when the input has BIP-32 key paths (legacy or taproot). */
export function inputHasKeypaths(tx: btc.Transaction, i: number): boolean {
  const inp = tx.getInput(i);
  return (inp.bip32Derivation?.length ?? 0) > 0 || (inp.tapBip32Derivation?.length ?? 0) > 0;
}

/** True when the input has partial signatures of any kind. */
export function inputHasPartialSigs(tx: btc.Transaction, i: number): boolean {
  const inp = tx.getInput(i);
  return (inp.partialSig?.length ?? 0) > 0 || inp.tapKeySig !== undefined || (inp.tapScriptSig?.length ?? 0) > 0;
}

/** True when the output has BIP-32 key paths (legacy or taproot). */
export function outputHasKeypaths(tx: btc.Transaction, i: number): boolean {
  const o = tx.getOutput(i);
  return (o.bip32Derivation?.length ?? 0) > 0 || (o.tapBip32Derivation?.length ?? 0) > 0;
}

/** @internal Script and amount of output `i`. */
export function outputInfo(tx: btc.Transaction, i: number): PrevOut {
  const o = tx.getOutput(i);
  if (o.script === undefined || o.amount === undefined) fail('psbt_invalid');
  return { script: o.script, amount: o.amount };
}

/** Sum of input amounts minus sum of output amounts, using validated prevouts. */
export function psbtFee(tx: btc.Transaction, prevOuts?: ReadonlyMap<string, PrevOut>): bigint {
  let inSum = 0n;
  for (let i = 0; i < tx.inputsLength; i++) {
    const known = prevOuts?.get(inputOutpoint(tx, i));
    inSum += (known ?? inputPrevOut(tx, i)).amount;
  }
  let outSum = 0n;
  for (let i = 0; i < tx.outputsLength; i++) outSum += outputInfo(tx, i).amount;
  const fee = inSum - outSum;
  if (fee < 0n) fail('psbt_invalid', 'outputs exceed inputs');
  return fee;
}

/**
 * Conservative signed-input vsize by script type (P2WPKH 68, P2TR key-path 58,
 * P2SH-P2WPKH 91, P2PKH 148); 110 for anything else (the figure used by the
 * BIP-78 reference sender).
 */
export function estimateInputVsize(script: Uint8Array): number {
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) return 68;
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) return 58;
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) return 91;
  if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[24] === 0xac) return 148;
  return 110;
}

/** @internal bytes equality as hex compare. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
