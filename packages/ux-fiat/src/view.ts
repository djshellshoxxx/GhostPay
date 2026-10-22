import { toFiatMinor } from './convert.js';
import { formatFiatParts, type FiatFormat, type FormatPart } from './format.js';
import {
  checkPolicy,
  classifyAge,
  DEFAULT_RATE_POLICY,
  parseRate,
  type Freshness,
  type RatePolicy,
} from './rate.js';
import type { AssetInfo, FiatError, FiatInfo, RateQuote, RoundingMode } from './types.js';

export interface FiatViewInput {
  readonly amountBase: bigint;
  readonly asset: AssetInfo;
  readonly fiat: FiatInfo;
  /** Injected quote, or undefined/null when none is available (offline). */
  readonly quote: RateQuote | null | undefined;
  /** Injected clock (ms). */
  readonly nowMs: number;
  readonly format: FiatFormat;
  readonly rounding: RoundingMode;
  readonly policy?: RatePolicy;
  /** If true, stale rates still produce a value (flagged). Default false: withheld. */
  readonly showStale?: boolean;
}

/**
 * Display state for a fiat annotation. Never throws; offline-safe.
 * - ok: value shown, `freshness` is 'fresh' or 'aging' (UI may add a hint)
 * - stale: older than staleMs; value present only if showStale
 * - no-rate: no quote supplied (offline / unsupported asset)
 * - invalid: quote or inputs failed validation (value withheld)
 */
export type FiatView =
  | { readonly state: 'no-rate' }
  | { readonly state: 'invalid'; readonly error: FiatError }
  | {
      readonly state: 'ok' | 'stale';
      readonly freshness: Freshness;
      readonly ageMs: number;
      readonly source: string;
      readonly minor: bigint | null;
      readonly parts: readonly FormatPart[] | null;
    };

/**
 * Compute a fiat display view from a token amount. Never fetches rates.
 * @security Withholds values for future-dated, stale (default), mismatched or
 * insane quotes so a bad quote cannot display a misleading number.
 */
export function computeFiatView(i: FiatViewInput): FiatView {
  if (i.quote === null || i.quote === undefined) return { state: 'no-rate' };
  const policy = i.policy ?? DEFAULT_RATE_POLICY;
  const pol = checkPolicy(policy);
  if (!pol.ok) return { state: 'invalid', error: pol.error };
  const r = parseRate(i.quote, policy);
  if (!r.ok) return { state: 'invalid', error: r.error };
  if (r.value.asset !== i.asset.id || r.value.fiat !== i.fiat.code) {
    return { state: 'invalid', error: { code: 'rate-mismatch', message: 'quote is for another pair' } };
  }
  const age = classifyAge(r.value.timestampMs, i.nowMs, policy);
  if (!age.ok) return { state: 'invalid', error: age.error };
  if (age.value.freshness === 'future') {
    return { state: 'invalid', error: { code: 'bad-timestamp', message: 'quote dated in the future' } };
  }
  const base = { freshness: age.value.freshness, ageMs: age.value.ageMs, source: r.value.source };
  const stale = age.value.freshness === 'stale';
  if (stale && i.showStale !== true) {
    return { state: 'stale', ...base, minor: null, parts: null };
  }
  const m = toFiatMinor(i.amountBase, i.asset.decimals, r.value, i.fiat.decimals, i.rounding);
  if (!m.ok) return { state: 'invalid', error: m.error };
  const p = formatFiatParts(m.value, i.fiat.decimals, i.format);
  if (!p.ok) return { state: 'invalid', error: p.error };
  return { state: stale ? 'stale' : 'ok', ...base, minor: m.value, parts: p.value };
}
