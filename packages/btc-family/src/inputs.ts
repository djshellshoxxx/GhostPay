import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { compress, liftX, parseHex } from './ecc.js';
import { parseCompressedPoint, type CompressedPoint } from './secret.js';
import type { InputType, ChainParams } from './params.js';
import type { TxInput } from './tx.js';

/** The key a transaction input contributes to the shared secret. */
export interface EligibleInputKey {
  /** Compressed key; for taproot the even-y lift of the output key. */
  readonly publicKey: CompressedPoint;
  /** True for P2TR inputs, whose private key must be parity-normalized by the sender. */
  readonly isTaproot: boolean;
  /** The classified input type. */
  readonly type: InputType;
}

/** BIP-341 NUMS point H x-coordinate (BIP-352 "P2TR"). */
const NUMS_H = parseHex('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0', 32);

function hash160(b: Uint8Array): Uint8Array {
  return ripemd160(sha256(b));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function isP2PKH(s: Uint8Array): boolean {
  return (
    s.length === 25 && s[0] === 0x76 && s[1] === 0xa9 && s[2] === 0x14 && s[23] === 0x88 && s[24] === 0xac
  );
}
function isP2SH(s: Uint8Array): boolean {
  return s.length === 23 && s[0] === 0xa9 && s[1] === 0x14 && s[22] === 0x87;
}
function isP2WPKH(s: Uint8Array): boolean {
  return s.length === 22 && s[0] === 0x00 && s[1] === 0x14;
}
function isP2TR(s: Uint8Array): boolean {
  return s.length === 34 && s[0] === 0x51 && s[1] === 0x20;
}

function compressedKeyOrNull(bytes: Uint8Array | undefined): CompressedPoint | null {
  if (bytes === undefined || bytes.length !== 33) return null;
  try {
    return parseCompressedPoint(bytes);
  } catch {
    return null;
  }
}

/**
 * Classifies a spent `scriptPubKey` into a BIP-352 input type (before key extraction).
 *
 * @returns The type, or `null` for any other script.
 * @security Public data only.
 */
export function classifyInput(input: TxInput): InputType | null {
  const s = input.prevoutScriptPubKey;
  if (isP2PKH(s)) return 'p2pkh';
  if (isP2SH(s)) return 'p2sh-p2wpkh';
  if (isP2WPKH(s)) return 'p2wpkh';
  if (isP2TR(s)) return 'p2tr';
  return null;
}

/**
 * True when the spent output is a SegWit program of version 2 to 16. BIP-352 says a transaction
 * that spends such an output MUST NOT be scanned (clean upgrade path for future versions).
 */
export function spendsFutureSegwit(input: TxInput): boolean {
  const s = input.prevoutScriptPubKey;
  return (
    s.length >= 4 &&
    s.length <= 42 &&
    s[0] !== undefined &&
    s[0] >= 0x52 &&
    s[0] <= 0x60 &&
    s[1] === s.length - 2
  );
}

/**
 * Extracts the public key an input contributes to silent payment shared-secret derivation.
 *
 * @remarks Only P2TR, P2WPKH, P2SH-P2WPKH and P2PKH inputs with compressed or x-only keys are
 * eligible (BIP-352 "Inputs For Shared Secret Derivation"). P2PKH keys are located by scanning the
 * scriptSig backwards for a 33-byte window whose HASH160 matches the spent script, so malleated
 * scriptSigs still work. P2TR uses the output key (key path or script path), skipping script-path
 * spends whose internal key is the NUMS point H; a trailing annex is ignored. The P2SH redeem
 * script hash is additionally checked against the spent script (stricter than the BIP reference
 * code; always true for confirmed transactions).
 *
 * @param params Chain parameters: input types not listed in `eligibleInputTypes` return `null`.
 * @param input Input with the spent output's script.
 * @returns The key, or `null` when the input is not eligible.
 * @security Public data only.
 */
export function extractInputPublicKey(params: ChainParams, input: TxInput): EligibleInputKey | null {
  const spk = input.prevoutScriptPubKey;
  const type = classifyInput(input);
  if (type === null || !params.eligibleInputTypes.includes(type)) return null;
  if (type === 'p2pkh') {
    const want = spk.subarray(3, 23);
    const sig = input.scriptSig;
    for (let end = sig.length; end >= 33; end--) {
      const window = sig.subarray(end - 33, end);
      if (!equalBytes(hash160(window), want)) continue;
      const key = compressedKeyOrNull(window);
      if (key !== null) return { publicKey: key, type: 'p2pkh', isTaproot: false };
    }
    return null;
  }
  if (type === 'p2sh-p2wpkh') {
    const sig = input.scriptSig;
    if (sig.length !== 23 || sig[0] !== 0x16) return null;
    const redeem = sig.subarray(1);
    if (!isP2WPKH(redeem) || !equalBytes(hash160(redeem), spk.subarray(2, 22))) return null;
    const key = compressedKeyOrNull(input.witness[input.witness.length - 1]);
    return key === null ? null : { publicKey: key, type: 'p2sh-p2wpkh', isTaproot: false };
  }
  if (type === 'p2wpkh') {
    const key = compressedKeyOrNull(input.witness[input.witness.length - 1]);
    return key === null ? null : { publicKey: key, type: 'p2wpkh', isTaproot: false };
  }
  // type === 'p2tr'
  const stack = [...input.witness];
  if (stack.length === 0) return null;
  const last = stack[stack.length - 1] as Uint8Array;
  if (stack.length > 1 && last.length > 0 && last[0] === 0x50) stack.pop();
  if (stack.length > 1) {
    const controlBlock = stack[stack.length - 1] as Uint8Array;
    if (equalBytes(controlBlock.subarray(1, 33), NUMS_H)) return null;
  }
  const point = liftX(spk.subarray(2));
  return point === null ? null : { publicKey: compress(point), type: 'p2tr', isTaproot: true };
}
