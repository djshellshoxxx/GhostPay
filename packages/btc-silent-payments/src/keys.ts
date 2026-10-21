import { bytesToNumberBE } from '@noble/curves/utils.js';
import { bip32Derive, HARDENED_OFFSET } from './bip32.js';
import { compress, mulG } from './ecc.js';
import { fail } from './errors.js';
import { randomScalar, type RandomSource } from './rng.js';
import { wrapSecret, zeroize, type CompressedPoint, type SecretScalar } from './secret.js';
import type { SilentPaymentNetwork } from './address.js';

/** Scan and spend key pairs of a silent payment receiver. */
export interface SilentPaymentKeys {
  /** `b_scan`: may be given to a scanning service only by explicit, labelled user choice. */
  readonly scanSecret: SecretScalar;
  /** `b_spend`: never leaves the signing device. */
  readonly spendSecret: SecretScalar;
  /** `B_scan`. */
  readonly scanPublicKey: CompressedPoint;
  /** `B_spend`. */
  readonly spendPublicKey: CompressedPoint;
}

/** @internal Public key of a validated secret. */
export function publicKeyOf(secret: SecretScalar): CompressedPoint {
  return compress(mulG(bytesToNumberBE(secret)));
}

/** Builds {@link SilentPaymentKeys} from two existing secrets. */
export function silentPaymentKeysFromSecrets(
  scanSecret: SecretScalar,
  spendSecret: SecretScalar,
): SilentPaymentKeys {
  const a = bytesToNumberBE(scanSecret);
  const b = bytesToNumberBE(spendSecret);
  if (a === b) return fail('INVALID_SCALAR');
  return {
    scanSecret,
    spendSecret,
    scanPublicKey: publicKeyOf(scanSecret),
    spendPublicKey: publicKeyOf(spendSecret),
  };
}

/**
 * Generates fresh scan and spend keys from the CSPRNG.
 *
 * @remarks Both scalars come from rejection sampling in [1, n-1] (no modular bias). The two
 * keys are independent and never equal.
 *
 * @param rng Optional injected randomness (tests only).
 * @returns New keys.
 * @throws {SilentPaymentError} `RNG_UNAVAILABLE`, `RNG_FAILURE`.
 * @security The result holds secrets; persist them only encrypted. No constant-time guarantee.
 */
export function generateSilentPaymentKeys(rng?: RandomSource): SilentPaymentKeys {
  const scan = randomScalar(rng);
  for (let i = 0; i < 4; i++) {
    const spend = randomScalar(rng);
    if (bytesToNumberBE(spend) !== bytesToNumberBE(scan)) return silentPaymentKeysFromSecrets(scan, spend);
  }
  return fail('RNG_FAILURE');
}

/** Options for {@link silentPaymentKeysFromSeed}. */
export interface SeedDerivationOptions {
  /** `mainnet` -> coin type 0', `testnet` -> 1' (BIP-44 convention; BIP-352 does not fix coin types). */
  readonly network: SilentPaymentNetwork;
  /** Hardened account index, 0 to 2^31-1. Default 0. */
  readonly account?: number;
}

/**
 * Derives keys by BIP-32 from a seed using the BIP-352 paths
 * `m/352'/coin'/account'/1'/0` (scan) and `m/352'/coin'/account'/0'/0` (spend).
 *
 * @remarks Only the final `/0` step is non-hardened, exactly as BIP-352 specifies; the scan
 * key can be exported without exposing the master key or the spend key.
 *
 * @param seed 16 to 64 byte BIP-32 seed (for example a BIP-39 seed).
 * @param options Network and account.
 * @returns Keys.
 * @throws {SilentPaymentError} `INVALID_SEED`, `INVALID_INPUT`, `DERIVATION_FAILED`.
 * @security The seed is the root secret; zeroize it after use. No constant-time guarantee.
 */
export function silentPaymentKeysFromSeed(
  seed: Uint8Array,
  options: SeedDerivationOptions,
): SilentPaymentKeys {
  const account = options.account ?? 0;
  if (!Number.isInteger(account) || account < 0 || account >= HARDENED_OFFSET) return fail('INVALID_INPUT');
  const coin = options.network === 'mainnet' ? 0 : 1;
  const base = [352 + HARDENED_OFFSET, coin + HARDENED_OFFSET, account + HARDENED_OFFSET];
  const scan = bip32Derive(seed, [...base, 1 + HARDENED_OFFSET, 0]);
  const spend = bip32Derive(seed, [...base, HARDENED_OFFSET, 0]);
  try {
    return silentPaymentKeysFromSecrets(wrapSecret(scan.privateKey), wrapSecret(spend.privateKey));
  } finally {
    zeroize(scan.privateKey, scan.chainCode, spend.privateKey, spend.chainCode);
  }
}
