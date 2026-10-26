import { bytesToNumberBE } from '@noble/curves/utils.js';
import { decodeSilentPaymentAddress, type SilentPaymentNetwork } from './address.js';
import {
  compress,
  hasEvenY,
  K_MAX,
  modN,
  mulG,
  pointFromCompressed,
  scalarBytes,
  ser32,
  strictScalar,
  taggedHash,
  toHex,
  xOnly,
} from './ecc.js';
import { fail } from './errors.js';
import { CURVE_ORDER, parseCompressedPoint, wrapSecret, zeroize, type CompressedPoint, type SecretScalar } from './secret.js';
import { smallestOutpoint, type Outpoint } from './tx.js';

/** A private key of an input that is eligible for shared secret derivation. */
export interface SenderKey {
  /**
   * For P2WPKH, P2SH-P2WPKH and P2PKH: the key behind the spent key hash. For P2TR: the
   * private key of the taproot OUTPUT key (the tweaked key), not the internal key.
   */
  readonly privateKey: SecretScalar;
  /** True for P2TR inputs: the key is negated here if its public key has odd y. */
  readonly isTaproot: boolean;
}

/** Per-transaction sender values shared by every recipient group. */
export interface SenderContext {
  /** `a = a_1 + ... + a_n` after taproot negation. */
  readonly inputPrivateKeySum: SecretScalar;
  /** `A = a * G`. */
  readonly inputPublicKey: CompressedPoint;
  /** `input_hash = hash_BIP0352/Inputs(outpoint_L || A)`. */
  readonly inputHash: SecretScalar;
}

/**
 * Builds the sender context: key sum with taproot parity handling and `input_hash`.
 *
 * @param keys Private keys of the transaction inputs that are eligible (at least one).
 * @param outpoints ALL inputs of the transaction (eligible or not): `outpoint_L` is the smallest of these.
 * @returns The context.
 * @throws {SilentPaymentError} `NO_ELIGIBLE_INPUTS`, `INPUT_SUM_ZERO`, `INPUT_HASH_INVALID`, `INVALID_INPUT`.
 * @security Returns the summed input private key. No constant-time guarantee in JavaScript;
 * intermediates are zeroized best-effort.
 */
export function buildSenderContext(
  keys: readonly SenderKey[],
  outpoints: readonly Outpoint[],
): SenderContext {
  if (keys.length === 0) return fail('NO_ELIGIBLE_INPUTS');
  const outpointL = smallestOutpoint(outpoints);
  let sum = 0n;
  for (const k of keys) {
    let d = bytesToNumberBE(k.privateKey);
    if (k.isTaproot && !hasEvenY(mulG(d))) d = CURVE_ORDER - d;
    sum = modN(sum + d);
  }
  if (sum === 0n) return fail('INPUT_SUM_ZERO');
  const sumBytes = scalarBytes(sum);
  const pub = compress(mulG(sum));
  const h = taggedHash('BIP0352/Inputs', outpointL, pub);
  try {
    if (strictScalar(h) === null) return fail('INPUT_HASH_INVALID');
    return { inputPrivateKeySum: wrapSecret(sumBytes), inputPublicKey: pub, inputHash: wrapSecret(h) };
  } finally {
    zeroize(sumBytes, h);
  }
}

/**
 * `ecdh_shared_secret = input_hash * a * B_scan`, compressed.
 *
 * @security Anyone holding this value can find the payment outputs of this transaction for this
 * recipient; treat as confidential. Not constant-time.
 */
export function senderEcdhSharedSecret(ctx: SenderContext, scanPublicKey: Uint8Array): CompressedPoint {
  const scalar = modN(bytesToNumberBE(ctx.inputHash) * bytesToNumberBE(ctx.inputPrivateKeySum));
  return compress(pointFromCompressed(scanPublicKey).multiply(scalar));
}

/** A derived taproot output for one requested recipient. */
export interface SilentPaymentOutput {
  /** Index into the `recipients` list given to {@link createSilentPaymentOutputs}. */
  readonly recipientIndex: number;
  /** 32-byte x-only output key `P = B_m + t_k * G`. */
  readonly xOnlyPublicKey: Uint8Array;
  /** Counter `k` used within the recipient's `B_scan` group. */
  readonly k: number;
}

/** Parameters of {@link createSilentPaymentOutputs}. */
export interface CreateOutputsParams {
  /** Eligible input keys (see {@link SenderKey}). */
  readonly inputs: readonly SenderKey[];
  /** Every outpoint spent by the transaction, eligible or not. */
  readonly outpoints: readonly Outpoint[];
  /** Silent payment addresses; repeat an address to create several outputs for it. */
  readonly recipients: readonly string[];
  /** Network every recipient address must belong to (chain-mismatch protection). */
  readonly network: SilentPaymentNetwork;
}

/**
 * Sender-side output derivation (BIP-352 "Creating outputs").
 *
 * @remarks Recipients are grouped by `B_scan`; inside a group the counter `k` increases in the
 * order the recipients were given (so labeled addresses of one receiver get distinct outputs).
 * All returned outputs MUST be present in the final transaction or the receiver cannot find the
 * later ones. A fresh derivation is required if inputs change (RBF). Fails closed: a group above
 * `K_max` (2323), a zero key sum, or an invalid hash/tweak aborts everything.
 *
 * @param params Inputs, outpoints, recipients and network.
 * @returns One output per recipient entry, in recipient order.
 * @throws {SilentPaymentError} `INVALID_ADDRESS`, `NETWORK_MISMATCH`, `UNSUPPORTED_VERSION`,
 * `GROUP_LIMIT_EXCEEDED`, `TWEAK_INVALID`, `DERIVED_KEY_INVALID`, plus those of {@link buildSenderContext}.
 * @security Handles the summed input private key; JavaScript offers no constant-time or
 * guaranteed-erasure behaviour. Run only in the sender's own signing environment.
 */
export function createSilentPaymentOutputs(params: CreateOutputsParams): SilentPaymentOutput[] {
  const decoded = params.recipients.map((r) => decodeSilentPaymentAddress(r, params.network));
  const ctx = buildSenderContext(params.inputs, params.outpoints);
  try {
    return deriveOutputs(decoded, (scan) => senderEcdhSharedSecret(ctx, scan));
  } finally {
    zeroize(ctx.inputPrivateKeySum, ctx.inputHash);
  }
}

/**
 * Sender-side output derivation from ECDH shares computed elsewhere (for example by a hardware signer that
 * holds the input keys): `shareFor(B_scan)` must return `input_hash * a * B_scan` for this transaction.
 * Grouping, `k` order and `K_max` are exactly as in {@link createSilentPaymentOutputs}.
 *
 * @throws {SilentPaymentError} `INVALID_ADDRESS`, `NETWORK_MISMATCH`, `UNSUPPORTED_VERSION`,
 * `GROUP_LIMIT_EXCEEDED`, `TWEAK_INVALID`, `DERIVED_KEY_INVALID`, `INVALID_POINT`.
 * @security Each share is confidential (it reveals the recipient's outputs of this transaction).
 */
export function silentPaymentOutputsFromShares(
  recipients: readonly string[],
  network: SilentPaymentNetwork,
  shareFor: (scanPublicKey: Uint8Array) => Uint8Array,
): SilentPaymentOutput[] {
  const decoded = recipients.map((r) => decodeSilentPaymentAddress(r, network));
  return deriveOutputs(decoded, (scan) => parseCompressedPoint(shareFor(scan)));
}

function deriveOutputs(
  decoded: readonly { readonly scanPublicKey: Uint8Array; readonly spendPublicKey: Uint8Array }[],
  shareFor: (scanPublicKey: Uint8Array) => CompressedPoint,
): SilentPaymentOutput[] {
  const groups = new Map<string, number[]>();
  decoded.forEach((d, i) => {
    const key = toHex(d.scanPublicKey);
    const g = groups.get(key);
    if (g === undefined) groups.set(key, [i]);
    else g.push(i);
  });
  for (const g of groups.values()) if (g.length > K_MAX) return fail('GROUP_LIMIT_EXCEEDED');

  const result: SilentPaymentOutput[] = new Array<SilentPaymentOutput>(decoded.length);
  for (const indices of groups.values()) {
    const first = decoded[indices[0] as number];
    if (first === undefined) return fail('INVALID_INPUT');
    const shared = shareFor(first.scanPublicKey);
    try {
      indices.forEach((recipientIndex, k) => {
        const t = taggedHash('BIP0352/SharedSecret', shared, ser32(k));
        const tk = strictScalar(t);
        zeroize(t);
        if (tk === null) return fail('TWEAK_INVALID');
        const dest = decoded[recipientIndex];
        if (dest === undefined) return fail('INVALID_INPUT');
        const p = pointFromCompressed(dest.spendPublicKey).add(mulG(tk));
        if (p.is0()) return fail('DERIVED_KEY_INVALID');
        result[recipientIndex] = { recipientIndex, xOnlyPublicKey: xOnly(p), k };
      });
    } finally {
      zeroize(shared);
    }
  }
  return result;
}
