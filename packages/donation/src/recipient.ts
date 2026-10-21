import { isAddress, type Address } from 'viem';
import { DEFAULT_DONATION_PPM, validatePpm } from './rate.js';

/** User-changeable donation settings. */
export interface DonationSettings {
  /** Master switch. */
  enabled: boolean;
  /** Rate in ppm. */
  ppm: number;
}

/** Defaults: on, {@link DEFAULT_DONATION_PPM}. */
export const DEFAULT_SETTINGS: Readonly<DonationSettings> = Object.freeze({
  enabled: true,
  ppm: DEFAULT_DONATION_PPM,
});

/** Config/manifest subset read by this package. The recipient comes only from here. */
export interface DonationConfig {
  /** Optional developer address (strictly validated; never hardcoded in this package). */
  donationRecipient?: unknown;
}

/** Outcome of {@link resolveDonation}. */
export type ResolvedDonation =
  | { status: 'active'; ppm: number; recipient: Address }
  | { status: 'disabled'; ppm: number; recipient: Address }
  | { status: 'unavailable'; reason: 'no_recipient' | 'invalid_recipient' | 'invalid_ppm' };

/**
 * Strict address check: `0x` + 40 hex, EIP-55 when mixed case, zero address rejected.
 * @security Pure; guards against checksum typos and the burn address.
 * @param v Candidate.
 */
export function isUsableRecipient(v: unknown): v is Address {
  if (typeof v !== 'string') return false;
  if (!isAddress(v, { strict: true })) return false;
  return !/^0x0{40}$/i.test(v);
}

/**
 * Decides whether a donation exists at all.
 * @security No valid configured recipient means `unavailable`: callers must show no row and send nothing.
 * @param settings User settings.
 * @param config Manifest/config.
 */
export function resolveDonation(settings: DonationSettings, config: DonationConfig): ResolvedDonation {
  const r = config.donationRecipient;
  if (r === undefined || r === null || r === '') return { status: 'unavailable', reason: 'no_recipient' };
  if (!isUsableRecipient(r)) return { status: 'unavailable', reason: 'invalid_recipient' };
  if (!validatePpm(settings.ppm).ok) return { status: 'unavailable', reason: 'invalid_ppm' };
  return { status: settings.enabled ? 'active' : 'disabled', ppm: settings.ppm, recipient: r };
}
