import { bytesToNumberBE } from '@noble/curves/utils.js';
import { bip32Derive, HARDENED_OFFSET } from './bip32.js';
import { compress, mulG } from './ecc.js';
import { fail } from './errors.js';
import type { ChainParams } from './params.js';
import { randomScalar, type RandomSource } from './rng.js';
import { wrapSecret, zeroize, type CompressedPoint, type SecretScalar } from './secret.js';

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

/** Builds {@link SilentPaymentKeys} from two existing secrets (they must differ). */
export function keysFromSecrets(scanSecret: SecretScalar, spendSecret: SecretScalar): SilentPaymentKeys {
  if (bytesToNumberBE(scanSecret) === bytesToNumberBE(spendSecret)) return fail('INVALID_SCALAR');
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
 * keys are independent and never equal. Keys are chain-agnostic; the chain only matters when
 * an address is encoded.
 *
 * @param rng Optional injected randomness (tests only).
 * @returns New keys.
 * @throws {BtcFamilyError} `RNG_UNAVAILABLE`, `RNG_FAILURE`.
 * @security The result holds secrets; persist them only encrypted. No constant-time guarantee.
 */
export function generateKeys(rng?: RandomSource): SilentPaymentKeys {
  const scan = randomScalar(rng);
  for (let i = 0; i < 4; i++) {
    const spend = randomScalar(rng);
    if (bytesToNumberBE(spend) !== bytesToNumberBE(scan)) return keysFromSecrets(scan, spend);
  }
  return fail('RNG_FAILURE');
}

/**
 * Derives keys by BIP-32 from a seed using the BIP-352 paths
 * `m/352'/coinType'/account'/1'/0` (scan) and `m/352'/coinType'/account'/0'/0` (spend), where
 * `coinType` is `params.coinType`.
 *
 * @remarks Only the final `/0` step is non-hardened, exactly as BIP-352 specifies. For chains
 * other than Bitcoin the path is this package's extrapolation (BIP-352 fixes it for Bitcoin only).
 *
 * @param params Chain parameters (coin type).
 * @param seed 16 to 64 byte BIP-32 seed.
 * @param account Hardened account index, 0 to 2^31-1. Default 0.
 * @returns Keys.
 * @throws {BtcFamilyError} `INVALID_SEED`, `INVALID_INPUT`, `DERIVATION_FAILED`.
 * @security The seed is the root secret; zeroize it after use. No constant-time guarantee.
 */
export function keysFromSeed(params: ChainParams, seed: Uint8Array, account = 0): SilentPaymentKeys {
  if (!Number.isInteger(account) || account < 0 || account >= HARDENED_OFFSET) return fail('INVALID_INPUT');
  const base = [352 + HARDENED_OFFSET, params.coinType + HARDENED_OFFSET, account + HARDENED_OFFSET];
  const scan = bip32Derive(seed, [...base, 1 + HARDENED_OFFSET, 0]);
  const spend = bip32Derive(seed, [...base, HARDENED_OFFSET, 0]);
  try {
    return keysFromSecrets(wrapSecret(scan.privateKey), wrapSecret(spend.privateKey));
  } finally {
    zeroize(scan.privateKey, scan.chainCode, spend.privateKey, spend.chainCode);
  }
}
