import { bytesToNumberBE } from '@noble/curves/utils.js';
import { encodeSilentPaymentAddress, type SilentPaymentNetwork } from './address.js';
import { compress, mulG, pointFromCompressed, ser32, strictScalar, taggedHash, type Pt } from './ecc.js';
import { fail } from './errors.js';
import { wrapSecret, zeroize, type CompressedPoint, type SecretScalar } from './secret.js';

/** Label index reserved for change outputs (BIP-352 "Creating outputs" and "Scanning"). */
export const CHANGE_LABEL = 0;

/** @internal Validates a label index. */
export function checkLabel(m: number): number {
  if (!Number.isInteger(m) || m < 0 || m > 0xffffffff) return fail('INVALID_LABEL');
  return m;
}

/**
 * Label tweak `hash_BIP0352/Label(ser_256(b_scan) || ser_32(m))`.
 *
 * @param scanSecret `b_scan`.
 * @param m Label index in [0, 2^32-1].
 * @returns The tweak as a secret scalar.
 * @throws {SilentPaymentError} `INVALID_LABEL`, `TWEAK_INVALID` (hash is 0 or >= n).
 * @security Derived from the scan secret: treat as secret.
 */
export function labelTweak(scanSecret: SecretScalar, m: number): SecretScalar {
  checkLabel(m);
  const h = taggedHash('BIP0352/Label', scanSecret, ser32(m));
  try {
    if (strictScalar(h) === null) return fail('TWEAK_INVALID');
    return wrapSecret(h);
  } finally {
    zeroize(h);
  }
}

/**
 * `B_m = B_spend + label * G`.
 *
 * @param spendPublicKey `B_spend`.
 * @param scanSecret `b_scan`.
 * @param m Label index (0 is the change label; see {@link changeAddress}).
 * @returns `B_m`.
 * @throws {SilentPaymentError} `INVALID_LABEL`, `TWEAK_INVALID`, `INVALID_POINT`, `DERIVED_KEY_INVALID`.
 * @security Public output; the input scan secret must stay private.
 */
export function labeledSpendPublicKey(
  spendPublicKey: Uint8Array,
  scanSecret: SecretScalar,
  m: number,
): CompressedPoint {
  const tweak = labelTweak(scanSecret, m);
  try {
    const p = pointFromCompressed(spendPublicKey).add(mulG(bytesToNumberBE(tweak)));
    if (p.is0()) return fail('DERIVED_KEY_INVALID');
    return compress(p);
  } finally {
    zeroize(tweak);
  }
}

/** Keys needed to produce addresses. */
export interface AddressKeys {
  readonly scanSecret: SecretScalar;
  readonly scanPublicKey: Uint8Array;
  readonly spendPublicKey: Uint8Array;
}

/** The unlabeled silent payment address (`B_scan`, `B_spend`). */
export function silentPaymentAddress(
  keys: Pick<AddressKeys, 'scanPublicKey' | 'spendPublicKey'>,
  network: SilentPaymentNetwork,
): string {
  return encodeSilentPaymentAddress(network, keys.scanPublicKey, keys.spendPublicKey);
}

/**
 * A labeled address for index `m >= 1`.
 *
 * @remarks `m = 0` is reserved for change and rejected here; use {@link changeAddress}.
 *
 * @throws {SilentPaymentError} `RESERVED_LABEL`, `INVALID_LABEL`.
 */
export function labeledAddress(keys: AddressKeys, network: SilentPaymentNetwork, m: number): string {
  checkLabel(m);
  if (m === CHANGE_LABEL) return fail('RESERVED_LABEL');
  return encodeSilentPaymentAddress(
    network,
    keys.scanPublicKey,
    labeledSpendPublicKey(keys.spendPublicKey, keys.scanSecret, m),
  );
}

/** The address carrying the reserved change label (`m = 0`), for a wallet paying its own change. */
export function changeAddress(keys: AddressKeys, network: SilentPaymentNetwork): string {
  return encodeSilentPaymentAddress(
    network,
    keys.scanPublicKey,
    labeledSpendPublicKey(keys.spendPublicKey, keys.scanSecret, CHANGE_LABEL),
  );
}

/** One precomputed label. */
export interface LabelEntry {
  readonly m: number;
  readonly tweak: SecretScalar;
  /** `label * G`. */
  readonly point: Pt;
}

/** Precomputed labels used by the receiver scan. Always contains the change label. */
export interface LabelTable {
  readonly entries: readonly LabelEntry[];
  /** Lookup by index. */
  get(m: number): LabelEntry | undefined;
}

/**
 * Precomputes label tweaks. The change label `m = 0` is always included, as BIP-352 requires
 * receivers to always check it.
 *
 * @param scanSecret `b_scan`.
 * @param labels Label indices in use (duplicates ignored).
 * @returns A table for {@link scanOutputsForTweak}.
 * @throws {SilentPaymentError} `INVALID_LABEL`, `TWEAK_INVALID`.
 * @security Holds label tweaks (derived from the scan secret).
 */
export function createLabelTable(scanSecret: SecretScalar, labels: readonly number[] = []): LabelTable {
  const byIndex = new Map<number, LabelEntry>();
  for (const m of [CHANGE_LABEL, ...labels]) {
    checkLabel(m);
    if (byIndex.has(m)) continue;
    const tweak = labelTweak(scanSecret, m);
    byIndex.set(m, { m, tweak, point: mulG(bytesToNumberBE(tweak)) });
  }
  return { entries: [...byIndex.values()], get: (m) => byIndex.get(m) };
}
