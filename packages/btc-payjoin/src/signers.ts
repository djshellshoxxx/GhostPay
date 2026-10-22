import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { fail } from './errors.js';
import { inputPrevOut, outputInfo, type PrevOut, type Utxo } from './psbt.js';

/**
 * Sender-side signer. Signs exactly one input of a mutable transaction.
 *
 * @security The session only ever asks for indices of the sender's own inputs
 * (those present in the Original); it never asks to sign receiver inputs.
 */
export interface PsbtSigner {
  signInput(tx: btc.Transaction, index: number): void;
}

/** Receiver wallet surface used by the policy core. */
export interface ReceiverWallet {
  /** True when `scriptPubKey` belongs to this wallet. */
  isMine(scriptPubKey: Uint8Array): boolean;
  /** Spendable confirmed UTXOs (the policy core picks at most one). */
  listSpendable(): Promise<readonly Utxo[]>;
  /** Signs input `index` of `tx` (which carries the UTXO data) for `utxo`; core finalizes. */
  signInput(tx: btc.Transaction, index: number, utxo: Utxo): void;
  /** Required in non-interactive mode (BPJ-RCV-4): can this Original be broadcast? */
  testMempoolAccept?(txHex: string): Promise<boolean>;
  /**
   * Optional chain lookup (e.g. the receiver's node `gettxout`) of an Original
   * input's prevout; `undefined` when unknown or spent. When present, every
   * sender-claimed `witness_utxo`/`non_witness_utxo` must match it (BITCOIN-01).
   */
  getPrevOut?(txid: string, index: number): Promise<PrevOut | undefined>;
}

/**
 * Software signer from a script-to-secret-key resolver. Key material stays
 * inside the resolver closure.
 *
 * @security Test and PoC use. Production wallets supply their own signer.
 */
export function softwareSigner(resolve: (script: Uint8Array) => Uint8Array | undefined): PsbtSigner {
  return {
    signInput(tx, index) {
      const prev = inputPrevOut(tx, index);
      const key = resolve(prev.script);
      if (key === undefined) fail('psbt_unsigned', 'no key for input');
      tx.signIdx(key, index);
    },
  };
}

/**
 * Verifies the (single) final signature of a P2WPKH or P2TR key-path input
 * against the transaction's own sighash (BPJ-RCV-9: signature MUST verify
 * before the proposal is released).
 *
 * @returns `true` verified, `false` invalid, `'unsupported'` for other script types.
 */
export function verifyKeyPathInput(tx: btc.Transaction, index: number): boolean | 'unsupported' {
  const inp = tx.getInput(index);
  const prev = inputPrevOut(tx, index);
  const w = inp.finalScriptWitness;
  const prevAmounts: bigint[] = [];
  const prevScripts: Uint8Array[] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const p = inputPrevOut(tx, i);
    prevAmounts.push(p.amount);
    prevScripts.push(p.script);
  }
  const s = prev.script;
  if (s.length === 34 && s[0] === 0x51 && s[1] === 0x20) {
    if (w === undefined || w.length !== 1) return false;
    const sig = w[0] as Uint8Array;
    if (sig.length !== 64 && sig.length !== 65) return false;
    const hashType = sig.length === 65 ? (sig[64] as number) : 0;
    const msg = tx.preimageWitnessV1(index, prevScripts, hashType, prevAmounts);
    return schnorr.verify(sig.slice(0, 64), msg, s.slice(2));
  }
  if (s.length === 22 && s[0] === 0x00 && s[1] === 0x14) {
    if (w === undefined || w.length !== 2) return false;
    const sigDer = w[0] as Uint8Array;
    const pub = w[1] as Uint8Array;
    const hashType = sigDer[sigDer.length - 1] as number;
    const scriptCode = btc.p2pkh(pub).script;
    const msg = tx.preimageWitnessV0(index, scriptCode, hashType, prev.amount);
    return secp256k1.verify(sigDer.slice(0, -1), msg, pub, { format: 'der', prehash: false, lowS: false });
  }
  return 'unsupported';
}

/** @internal convenience for tests/debug: hex of a script. */
export function scriptHex(tx: btc.Transaction, outIndex: number): string {
  return hex.encode(outputInfo(tx, outIndex).script);
}
