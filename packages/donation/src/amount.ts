import { DonationError } from './errors.js';
import { DONATION_DUST_FLOOR, PPM_DENOMINATOR, validatePpm } from './rate.js';

/** Input of {@link computeDonation}. */
export interface ComputeInput {
  /** Gross payment in token base units. */
  gross: bigint;
  /** Token decimals (0..77). */
  decimals: number;
  /** Rate in ppm. */
  ppm: number;
  /** Override of the dust floor in base units (default 10^(decimals-2), minimum 1). */
  minUnits?: bigint | undefined;
}

/** Result of {@link computeDonation}. */
export interface DonationAmount {
  /** Donation in base units; 0 when none is to be sent. */
  amount: bigint;
  /** Rate used. */
  ppm: number;
  /** True when ppm > 0 but the amount fell under the dust floor (so amount is 0). */
  belowDust: boolean;
}

/**
 * Default dust floor for a token.
 * @security Pure.
 * @param decimals Token decimals (0..77).
 */
export function defaultMinUnits(decimals: number): bigint {
  assertDecimals(decimals);
  const e = decimals - DONATION_DUST_FLOOR.exponentOffset;
  return e <= 0 ? 1n : 10n ** BigInt(e);
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new DonationError('INVALID_DECIMALS', 'decimals must be an integer in 0..77');
  }
}

/**
 * Computes the donation: `floor(gross * ppm / 1e6)`, zero below the dust floor, never above `gross`.
 * @security Pure bigint math (no floats); safe for any uint256 gross. Throws typed errors on bad input.
 * @param input See {@link ComputeInput}.
 */
export function computeDonation(input: ComputeInput): DonationAmount {
  const { gross, decimals, ppm } = input;
  if (typeof gross !== 'bigint' || gross < 0n)
    throw new DonationError('INVALID_AMOUNT', 'gross must be a non-negative bigint');
  if (!validatePpm(ppm).ok) throw new DonationError('INVALID_PPM', 'rate must be an integer within the cap');
  const min = input.minUnits ?? defaultMinUnits(decimals);
  if (typeof min !== 'bigint' || min < 0n)
    throw new DonationError('INVALID_AMOUNT', 'minUnits must be a non-negative bigint');
  assertDecimals(decimals);
  const raw = (gross * BigInt(ppm)) / PPM_DENOMINATOR;
  if (ppm === 0) return { amount: 0n, ppm, belowDust: false };
  if (raw === 0n || raw < min) return { amount: 0n, ppm, belowDust: true };
  return { amount: raw, ppm, belowDust: false };
}
