import { isSmallInt, parseUnsignedDecimal, pow10 } from './decimal.js';
import { err, ok, type ParsedRate, type RateQuote, type Result } from './types.js';

/** Max fractional digits accepted in a rate string. */
export const MAX_RATE_FRAC_DIGITS = 18;
/** Max integer digits accepted in a rate string. */
export const MAX_RATE_INT_DIGITS = 30;

/** Sanity and staleness policy. All durations in ms. */
export interface RatePolicy {
  /** Age at or below which a rate is "fresh". Default 60_000. */
  readonly freshMs: number;
  /** Age above which a rate is "stale". Default 600_000. Must be >= freshMs. */
  readonly staleMs: number;
  /** Tolerated clock skew for quotes dated in the future. Default 30_000. */
  readonly maxFutureSkewMs: number;
  /** Largest plausible rate (fiat per whole token), decimal string. Default 1e12. */
  readonly maxRate: string;
  /** Smallest plausible rate, decimal string. Default 0.000000000001. */
  readonly minRate: string;
}

export const DEFAULT_RATE_POLICY: RatePolicy = {
  freshMs: 60_000,
  staleMs: 600_000,
  maxFutureSkewMs: 30_000,
  maxRate: '1000000000000',
  minRate: '0.000000000001',
};

const CODE_RE = /^[A-Z]{3}$/;
// Control (Cc) and format/bidi (Cf) chars are rejected in untrusted labels.
const BAD_TEXT_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Validate an untrusted display label (source / asset id). */
export function isSafeLabel(s: unknown, maxLen: number): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= maxLen && !BAD_TEXT_RE.test(s);
}

/** Validate a RatePolicy (numbers sane, ordering). */
export function checkPolicy(p: RatePolicy): Result<{ min: bigint; max: bigint; scale: number }> {
  if (
    !isSmallInt(p.freshMs, Number.MAX_SAFE_INTEGER) ||
    !isSmallInt(p.staleMs, Number.MAX_SAFE_INTEGER) ||
    !isSmallInt(p.maxFutureSkewMs, Number.MAX_SAFE_INTEGER) ||
    p.staleMs < p.freshMs
  ) {
    return err('bad-policy', 'durations must be non-negative integers with staleMs >= freshMs');
  }
  const mn = parseUnsignedDecimal(p.minRate, MAX_RATE_INT_DIGITS, MAX_RATE_FRAC_DIGITS);
  const mx = parseUnsignedDecimal(p.maxRate, MAX_RATE_INT_DIGITS, MAX_RATE_FRAC_DIGITS);
  if (!mn.ok || !mx.ok) return err('bad-policy', 'min/maxRate must be plain decimals');
  const s = MAX_RATE_FRAC_DIGITS;
  const min = mn.value.num * pow10(s - mn.value.scale);
  const max = mx.value.num * pow10(s - mx.value.scale);
  if (min <= 0n || max < min) return err('bad-policy', 'need 0 < minRate <= maxRate');
  return ok({ min, max, scale: s });
}

/**
 * Validate an injected quote into a ParsedRate: strict format, rejects
 * zero / negative / out-of-range rates, bad timestamps, unsafe labels.
 * @security Quote contents are untrusted (may come from a cache or API).
 */
export function parseRate(
  q: RateQuote,
  policy: RatePolicy = DEFAULT_RATE_POLICY,
): Result<ParsedRate> {
  const pol = checkPolicy(policy);
  if (!pol.ok) return pol;
  if (q === null || typeof q !== 'object') return err('bad-rate-format', 'quote missing');
  if (!isSafeLabel(q.asset, 64)) return err('bad-asset', 'bad asset id');
  if (typeof q.fiat !== 'string' || !CODE_RE.test(q.fiat)) return err('bad-fiat', 'bad fiat code');
  if (!isSafeLabel(q.source, 64)) return err('bad-source', 'bad source label');
  if (!Number.isSafeInteger(q.timestampMs) || q.timestampMs <= 0) {
    return err('bad-timestamp', 'timestamp must be a positive safe integer (ms)');
  }
  if (typeof q.rate === 'string' && /^-/.test(q.rate)) {
    return err('rate-negative', 'rate must not be negative');
  }
  const p = parseUnsignedDecimal(q.rate, MAX_RATE_INT_DIGITS, MAX_RATE_FRAC_DIGITS);
  if (!p.ok) {
    return p.error.code === 'overflow'
      ? err('rate-too-large', 'rate has too many integer digits')
      : err('bad-rate-format', 'rate must be a plain decimal string');
  }
  if (p.value.num === 0n) return err('rate-zero', 'rate must be positive');
  const norm = p.value.num * pow10(pol.value.scale - p.value.scale);
  if (norm > pol.value.max) return err('rate-too-large', 'rate above sanity ceiling');
  if (norm < pol.value.min) return err('rate-too-small', 'rate below sanity floor');
  return ok({
    num: p.value.num,
    scale: p.value.scale,
    asset: q.asset,
    fiat: q.fiat,
    timestampMs: q.timestampMs,
    source: q.source,
  });
}

export type Freshness = 'fresh' | 'aging' | 'stale' | 'future';

/**
 * Classify quote age against an injected clock.
 * fresh: age <= freshMs; aging: <= staleMs; stale: older; future: dated beyond skew
 * (treated as untrustworthy by callers).
 */
export function classifyAge(
  timestampMs: number,
  nowMs: number,
  policy: RatePolicy = DEFAULT_RATE_POLICY,
): Result<{ freshness: Freshness; ageMs: number }> {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) return err('bad-timestamp', 'bad now');
  if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) {
    return err('bad-timestamp', 'bad timestamp');
  }
  const pol = checkPolicy(policy);
  if (!pol.ok) return pol;
  const ageMs = nowMs - timestampMs;
  if (ageMs < 0) {
    return ok({ freshness: -ageMs > policy.maxFutureSkewMs ? 'future' : 'fresh', ageMs: 0 });
  }
  if (ageMs <= policy.freshMs) return ok({ freshness: 'fresh', ageMs });
  if (ageMs <= policy.staleMs) return ok({ freshness: 'aging', ageMs });
  return ok({ freshness: 'stale', ageMs });
}

/**
 * Compare a new rate with the previous one; reject moves larger than maxJumpBps
 * (basis points, integer). Guards against a poisoned/garbled quote.
 */
export function checkRateJump(prev: ParsedRate, next: ParsedRate, maxJumpBps: number): Result<true> {
  if (!isSmallInt(maxJumpBps, 10_000_000)) return err('bad-policy', 'bad maxJumpBps');
  if (prev.asset !== next.asset || prev.fiat !== next.fiat) {
    return err('rate-mismatch', 'quotes are for different pairs');
  }
  const s = Math.max(prev.scale, next.scale);
  const a = prev.num * pow10(s - prev.scale);
  const b = next.num * pow10(s - next.scale);
  const diff = a > b ? a - b : b - a;
  if (diff * 10_000n > a * BigInt(maxJumpBps)) return err('rate-jump', 'rate moved too far');
  return ok(true);
}
