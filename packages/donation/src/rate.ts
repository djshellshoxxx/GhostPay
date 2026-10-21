import { DonationError } from './errors.js';

/**
 * ASSUMPTION: the owner said "0.0965". It was interpreted as 0.0965 PERCENT = 965 parts per million
 * (fraction 0.000965). If the owner meant another value, change ONLY this constant.
 */
export const DEFAULT_DONATION_PPM = 965;

/** Cap against fat-finger input: 5% (50 000 ppm). OWNER DECISION, flagged for confirmation. */
export const MAX_DONATION_PPM = 50_000;

/** Parts per million denominator. */
export const PPM_DENOMINATOR = 1_000_000n;

/**
 * Dust floor config: by default a donation smaller than `10^(decimals - DUST_FLOOR_EXPONENT_OFFSET)`
 * base units (0.01 token) is not sent. OWNER DECISION.
 */
export const DONATION_DUST_FLOOR = { exponentOffset: 2 } as const;

/** Why a rate was rejected. */
export type RateReason =
  'not_integer' | 'out_of_range' | 'not_a_string' | 'empty' | 'too_long' | 'bad_format' | 'too_precise';

/** Result of validating or parsing a rate. */
export type RateResult = { ok: true; ppm: number } | { ok: false; reason: RateReason };

/**
 * Validates a rate in parts per million.
 * @security Pure; rejects NaN, fractions, negatives and anything above {@link MAX_DONATION_PPM}.
 * @param x Candidate rate.
 */
export function validatePpm(x: unknown): RateResult {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) return { ok: false, reason: 'not_integer' };
  if (x < 0 || x > MAX_DONATION_PPM) return { ok: false, reason: 'out_of_range' };
  return { ok: true, ppm: x };
}

const MAX_INPUT_LENGTH = 16;
const PERCENT_RE = /^(\d{1,3})(?:\.(\d+))?$/;

/**
 * Parses a user-typed percentage (canonical `.` decimal separator) into ppm. `'0.0965'` gives 965.
 * @security Pure, no floats; rejects signs, exponents, whitespace, more than 4 decimals (sub-ppm),
 * oversized strings and values above the cap.
 * @param input Text from the rate field.
 */
export function parsePercentInput(input: unknown): RateResult {
  if (typeof input !== 'string') return { ok: false, reason: 'not_a_string' };
  if (input.length === 0) return { ok: false, reason: 'empty' };
  if (input.length > MAX_INPUT_LENGTH) return { ok: false, reason: 'too_long' };
  const m = PERCENT_RE.exec(input);
  if (m === null) return { ok: false, reason: 'bad_format' };
  const frac = m[2] ?? '';
  if (frac.length > 4) return { ok: false, reason: 'too_precise' };
  const ppm = Number(m[1]) * 10_000 + Number(frac.padEnd(4, '0'));
  return validatePpm(ppm);
}

/**
 * Formats ppm as a percentage string with up to 4 decimals and no trailing zeros (965 gives '0.0965').
 * @security Pure; throws on an invalid rate rather than formatting it.
 * @param ppm Rate in parts per million.
 */
export function formatPercent(ppm: number): string {
  if (!validatePpm(ppm).ok) throw new DonationError('INVALID_PPM', 'rate must be an integer within the cap');
  const whole = Math.floor(ppm / 10_000);
  const frac = String(ppm % 10_000)
    .padStart(4, '0')
    .replace(/0+$/, '');
  return frac === '' ? String(whole) : `${String(whole)}.${frac}`;
}
