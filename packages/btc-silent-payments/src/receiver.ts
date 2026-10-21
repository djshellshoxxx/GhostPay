import { bytesToNumberBE } from '@noble/curves/utils.js';
import { createLabelTable, type LabelTable } from './labels.js';
import {
  compress,
  hasEvenY,
  K_MAX,
  modN,
  mulG,
  parseHex,
  pointFromCompressed,
  scalarBytes,
  ser32,
  strictScalar,
  taggedHash,
  toHex,
  xOnly,
} from './ecc.js';
import { fail } from './errors.js';
import { extractInputPublicKey, spendsFutureSegwit } from './inputs.js';
import { CURVE_ORDER, wrapSecret, zeroize, type CompressedPoint, type SecretScalar } from './secret.js';
import { smallestOutpoint, taprootOutputKey, type TxInput } from './tx.js';

/** Keys a scanner needs. The spend SECRET is not needed to find payments. */
export interface ScanKeys {
  /** `b_scan`. Used locally only; never passed to a transport. */
  readonly scanSecret: SecretScalar;
  /** `B_spend`. */
  readonly spendPublicKey: CompressedPoint;
  /** Precomputed labels (always includes the change label). Defaults to change only. */
  readonly labels?: LabelTable;
}

/** An output found by the scanner. */
export interface FoundOutput {
  /** 32-byte x-only output key. */
  readonly xOnlyPublicKey: Uint8Array;
  /** Counter `k` that matched. */
  readonly k: number;
  /** Matching label index, or `null` for the unlabeled spend key. */
  readonly label: number | null;
  /**
   * Private key tweak `t_k (+ label tweak) mod n`. The output's private key is
   * `b_spend + tweak`, parity-normalized by {@link spendPrivateKey}.
   */
  readonly spendTweak: SecretScalar;
}

/** Result of {@link computeTransactionTweak}. */
export interface TransactionTweak {
  /** `A = A_1 + ... + A_n`. */
  readonly inputPublicKeySum: CompressedPoint;
  /** `input_hash * A`: the tweak data light-client oracles publish; contains no secret. */
  readonly tweak: CompressedPoint;
}

/**
 * Receiver-side tweak data for a transaction (`input_hash * A`).
 *
 * @remarks Returns `null` (skip the transaction) when no input is eligible, when any input
 * spends a SegWit output of version above 1, or when the eligible keys sum to infinity.
 *
 * @param inputs All inputs of the transaction with the spent scripts.
 * @returns The tweak data or `null`.
 * @throws {SilentPaymentError} `INPUT_HASH_INVALID` when `input_hash` is not a valid scalar.
 * @security Public data only (this is what an indexer would publish).
 */
export function computeTransactionTweak(inputs: readonly TxInput[]): TransactionTweak | null {
  if (inputs.length === 0 || inputs.some(spendsFutureSegwit)) return null;
  let sum: ReturnType<typeof pointFromCompressed> | undefined;
  for (const input of inputs) {
    const key = extractInputPublicKey(input);
    if (key === null) continue;
    const p = pointFromCompressed(key.publicKey);
    sum = sum === undefined ? p : sum.add(p);
  }
  if (sum === undefined || sum.is0()) return null;
  const A = compress(sum);
  const h = taggedHash('BIP0352/Inputs', smallestOutpoint(inputs), A);
  const scalar = strictScalar(h);
  if (scalar === null) return fail('INPUT_HASH_INVALID');
  return { inputPublicKeySum: A, tweak: compress(sum.multiply(scalar)) };
}

/** `ecdh_shared_secret = b_scan * (input_hash * A)`. @security Confidential per transaction. */
export function receiverEcdhSharedSecret(scanSecret: SecretScalar, tweak: Uint8Array): CompressedPoint {
  return compress(pointFromCompressed(tweak).multiply(bytesToNumberBE(scanSecret)));
}

/**
 * Finds the outputs paid to this receiver given a transaction's (or a block's) tweak data.
 *
 * @remarks Implements BIP-352 "Scanning": for `k = 0, 1, ...` computes
 * `P_k = B_spend + t_k * G` and checks it, then `P_k + label * G` for every known label (always
 * including the change label), against the supplied x-only keys. Matching `P_k + label * G` by
 * x coordinate covers both output parities. The loop continues with `k + 1` after EVERY
 * cryptographic match regardless of wallet policy, stops at the first `k` without a match and
 * never goes beyond `K_max` = 2323.
 *
 * @param keys Scan secret, spend public key and optional label table.
 * @param tweak `input_hash * A` (33-byte compressed).
 * @param outputKeys 32-byte x-only keys of candidate taproot outputs.
 * @param labelTable Optional precomputed labels overriding `keys.labels`.
 * @returns Found outputs in increasing `k`.
 * @throws {SilentPaymentError} `INVALID_POINT`, `TWEAK_INVALID`, `DERIVED_KEY_INVALID`, `INVALID_INPUT`.
 * @security Uses the scan secret locally. Not constant-time.
 */
export function scanOutputsForTweak(
  keys: ScanKeys,
  tweak: Uint8Array,
  outputKeys: readonly Uint8Array[],
  labelTable?: LabelTable,
): FoundOutput[] {
  const candidates = new Set<string>();
  for (const o of outputKeys) {
    if (o.length !== 32) return fail('INVALID_INPUT');
    candidates.add(toHex(o));
  }
  return scanTweakAgainstSet(keys, tweak, candidates, labelTable);
}

/**
 * Same as {@link scanOutputsForTweak} but against a prebuilt set of lowercase-hex x-only keys,
 * so a block scanner can reuse one set for thousands of tweaks. The set is not modified.
 *
 * @param keys Scan keys.
 * @param tweak `input_hash * A`.
 * @param candidates Lowercase hex of 32-byte x-only output keys.
 * @param labelTable Optional precomputed labels overriding `keys.labels`.
 * @returns Found outputs in increasing `k`.
 * @throws {SilentPaymentError} See {@link scanOutputsForTweak}.
 * @security See {@link scanOutputsForTweak}.
 */
export function scanTweakAgainstSet(
  keys: ScanKeys,
  tweak: Uint8Array,
  candidates: ReadonlySet<string>,
  labelTable?: LabelTable,
): FoundOutput[] {
  const labels = labelTable ?? keys.labels ?? createLabelTable(keys.scanSecret);
  const spendPoint = pointFromCompressed(keys.spendPublicKey);
  const ecdh = receiverEcdhSharedSecret(keys.scanSecret, tweak);
  const consumed = new Set<string>();
  const found: FoundOutput[] = [];
  try {
    for (let k = 0; k < K_MAX && consumed.size < candidates.size; k++) {
      const t = taggedHash('BIP0352/SharedSecret', ecdh, ser32(k));
      const tk = strictScalar(t);
      zeroize(t);
      if (tk === null) return fail('TWEAK_INVALID');
      const pk = spendPoint.add(mulG(tk));
      if (pk.is0()) return fail('DERIVED_KEY_INVALID');
      let hit: { x: string; label: number | null; tweak: bigint } | undefined;
      const x0 = toHex(xOnly(pk));
      if (candidates.has(x0) && !consumed.has(x0)) hit = { x: x0, label: null, tweak: tk };
      else {
        for (const entry of labels.entries) {
          const q = pk.add(entry.point);
          if (q.is0()) continue;
          const xq = toHex(xOnly(q));
          if (candidates.has(xq) && !consumed.has(xq)) {
            hit = { x: xq, label: entry.m, tweak: modN(tk + bytesToNumberBE(entry.tweak)) };
            break;
          }
        }
      }
      if (hit === undefined) break;
      if (hit.tweak === 0n) return fail('DERIVED_KEY_INVALID');
      consumed.add(hit.x);
      const tweakBytes = scalarBytes(hit.tweak);
      found.push({
        xOnlyPublicKey: parseHex(hit.x, 32),
        k,
        label: hit.label,
        spendTweak: wrapSecret(tweakBytes),
      });
      zeroize(tweakBytes);
    }
  } finally {
    zeroize(ecdh);
  }
  return found;
}

/**
 * Scans a whole transaction from its raw inputs and output scripts.
 *
 * @param keys Scan keys.
 * @param inputs All inputs with spent scripts.
 * @param outputScripts `scriptPubKey` of every output; non-taproot scripts are ignored.
 * @returns Found outputs; empty when the transaction is not eligible.
 * @throws {SilentPaymentError} See {@link computeTransactionTweak} and {@link scanOutputsForTweak}.
 * @security See {@link scanOutputsForTweak}.
 */
export function scanTransaction(
  keys: ScanKeys,
  inputs: readonly TxInput[],
  outputScripts: readonly Uint8Array[],
): FoundOutput[] {
  const tweak = computeTransactionTweak(inputs);
  if (tweak === null) return [];
  const taproot: Uint8Array[] = [];
  for (const s of outputScripts) {
    const key = taprootOutputKey(s);
    if (key !== undefined) taproot.push(key);
  }
  return scanOutputsForTweak(keys, tweak.tweak, taproot);
}

/** Spend key material for a found output. */
export interface SpendKey {
  /** `(b_spend + tweak) mod n`, negated when its public key has odd y (BIP-340 even-y form). */
  readonly privateKey: SecretScalar;
  /** The 32-byte x-only output key this private key controls. */
  readonly xOnlyPublicKey: Uint8Array;
}

/**
 * Computes the private key that spends a BIP-341 key-path output found by the scanner.
 *
 * @remarks `d = b_spend + t_k [+ label]`; because outputs are x-only, `d` is negated when
 * `d * G` has odd y so that the key matches the even-y lift of the output key.
 *
 * @param spendSecret `b_spend`.
 * @param spendTweak {@link FoundOutput.spendTweak}.
 * @returns Parity-normalized key and its x-only public key.
 * @throws {SilentPaymentError} `DERIVED_KEY_INVALID` when the sum is zero.
 * @security Output is a spending secret. Spending/PSBT signing is out of scope for this package.
 */
export function spendPrivateKey(spendSecret: SecretScalar, spendTweak: SecretScalar): SpendKey {
  let d = modN(bytesToNumberBE(spendSecret) + bytesToNumberBE(spendTweak));
  if (d === 0n) return fail('DERIVED_KEY_INVALID');
  const p = mulG(d);
  if (!hasEvenY(p)) d = CURVE_ORDER - d;
  const bytes = scalarBytes(d);
  try {
    return { privateKey: wrapSecret(bytes), xOnlyPublicKey: xOnly(p) };
  } finally {
    zeroize(bytes);
  }
}
