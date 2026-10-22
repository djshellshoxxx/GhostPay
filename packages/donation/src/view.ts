import type { Address } from 'viem';
import { computeDonation } from './amount.js';
import { formatPercent, MAX_DONATION_PPM } from './rate.js';
import { resolveDonation, type DonationConfig, type DonationSettings } from './recipient.js';

/** All text keys (copy lives in the i18n catalog, not here). */
export const DONATION_TEXT_KEYS = {
  title: 'donation.line.title',
  amount: 'donation.line.amount',
  rate: 'donation.line.rate',
  toggle: 'donation.toggle.label',
  rateLabel: 'donation.rate.label',
  zero: 'donation.action.zero',
  belowDust: 'donation.belowDust',
  publicLink: 'donation.warning.publicLink',
  notBundled: 'donation.notBundledWithRouterFee',
} as const;

/** Input of {@link buildDonationLines}. */
export interface DonationPlan {
  /** User settings. */
  settings: DonationSettings;
  /** Manifest/config. */
  config: DonationConfig;
  /** Gross payment in base units. */
  gross: bigint;
  /** Token decimals. */
  decimals: number;
  /** Dust override. */
  minUnits?: bigint | undefined;
}

/** Separate review row for the donation. */
export interface DonationLine {
  titleKey: typeof DONATION_TEXT_KEYS.title;
  /** Whether the toggle is on. */
  enabled: boolean;
  /** Donation in base units (0 when disabled or below dust). */
  amount: bigint;
  ppm: number;
  /** Canonical percent text of the rate, e.g. '0.0965'. */
  percentText: string;
  belowDust: boolean;
  recipient: Address;
  /** Editable-rate bounds. */
  editableRate: { ppm: number; minPpm: 0; maxPpm: number };
  /** The 'zero it' action. */
  zeroAction: { key: typeof DONATION_TEXT_KEYS.zero; setsPpm: 0 };
  /** Always false: the donation is not part of the router fee. */
  includedInRouterFee: false;
  /** Always false: the donation is not deducted from the payment net. */
  includedInNet: false;
  /** Warning and disclosure keys, always present. */
  warningKeys: readonly [typeof DONATION_TEXT_KEYS.publicLink, typeof DONATION_TEXT_KEYS.notBundled];
}

/**
 * Builds the pay-review donation row (text keys only).
 * @security Returns `null` when no valid recipient is configured, so no row appears and nothing can
 * be sent. Never merges the donation into fee or net.
 * @param plan See {@link DonationPlan}.
 */
export function buildDonationLines(plan: DonationPlan): DonationLine | null {
  const res = resolveDonation(plan.settings, plan.config);
  if (res.status === 'unavailable') return null;
  const enabled = res.status === 'active';
  const calc = enabled
    ? computeDonation({ gross: plan.gross, decimals: plan.decimals, ppm: res.ppm, minUnits: plan.minUnits })
    : { amount: 0n, ppm: res.ppm, belowDust: false };
  return {
    titleKey: DONATION_TEXT_KEYS.title,
    enabled,
    amount: calc.amount,
    ppm: res.ppm,
    percentText: formatPercent(res.ppm),
    belowDust: calc.belowDust,
    recipient: res.recipient,
    editableRate: { ppm: res.ppm, minPpm: 0, maxPpm: MAX_DONATION_PPM },
    zeroAction: { key: DONATION_TEXT_KEYS.zero, setsPpm: 0 },
    includedInRouterFee: false,
    includedInNet: false,
    warningKeys: [DONATION_TEXT_KEYS.publicLink, DONATION_TEXT_KEYS.notBundled],
  };
}
