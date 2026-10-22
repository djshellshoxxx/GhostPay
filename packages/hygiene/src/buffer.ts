import { fail } from './errors.js';

/** Buffer rounding modes. */
export type BufferRounding = 'grid125' | 'sig2' | 'off';

/**
 * Throws `INVALID_INPUT` if `rounded > 3 * raw` (HY-BUF-3).
 * @internal Exposed for tests; the 1-2-5 grid itself never exceeds 2.5x.
 */
export function assertWithinCap(rounded: bigint, raw: bigint): void {
  if (rounded > 3n * raw) fail('INVALID_INPUT', 'rounded buffer exceeds 3x raw');
}

function pow10(e: number): bigint {
  return 10n ** BigInt(e);
}

/**
 * Rounds a gas-buffer wei value UP onto a coarse shared grid (HY-BUF).
 *
 * @remarks `grid125`: smallest m*10^e, m in {1,2,5}, that is >= raw (worst overshoot 2.5x, e.g. 2.01 -> 5).
 * `sig2`: round up to 2 significant figures (overshoot < 10% for raw >= 100). `off`: raw, which
 * fingerprints this client and the quote moment. The payer picks the buffer, so a payer client that ignores
 * the hint still leaks; the on-chain `maxBufferWei` must equal the rounded value.
 *
 * @param raw Exact buffer in wei, > 0.
 * @param mode Rounding mode.
 * @returns Rounded value >= raw and <= 3 * raw.
 * @throws {HygieneError} `INVALID_INPUT` for raw <= 0, a non-bigint, unknown mode, or a cap breach.
 */
export function roundBuffer(raw: bigint, mode: BufferRounding): bigint {
  if (typeof raw !== 'bigint' || raw <= 0n) fail('INVALID_INPUT', 'raw buffer must be > 0');
  let out: bigint;
  if (mode === 'off') {
    out = raw;
  } else if (mode === 'grid125') {
    const e = raw.toString().length - 1;
    const base = pow10(e);
    out = [base, 2n * base, 5n * base, 10n * base].find((c) => c >= raw) as bigint;
  } else if (mode === 'sig2') {
    const d = raw.toString().length;
    if (d <= 2) {
      out = raw;
    } else {
      const unit = pow10(d - 2);
      out = ((raw + unit - 1n) / unit) * unit;
    }
  } else {
    return fail('INVALID_INPUT', 'unknown rounding mode');
  }
  assertWithinCap(out, raw);
  return out;
}

/** What the Pay view shows and passes on-chain (HY-BUF-4/5). */
export interface BufferPlan {
  readonly raw: bigint;
  readonly rounded: bigint;
  /** Value for `payERC20WithBuffer`'s `maxBufferWei` and the buffer itself: equals `rounded`. */
  readonly maxBufferWei: bigint;
  /** Extra cost over exact, paid by the payer. */
  readonly extra: bigint;
}

/**
 * Builds the display and on-chain values for a buffer.
 * @throws {HygieneError} as {@link roundBuffer}.
 */
export function planBuffer(raw: bigint, mode: BufferRounding): BufferPlan {
  const rounded = roundBuffer(raw, mode);
  return { raw, rounded, maxBufferWei: rounded, extra: rounded - raw };
}

/**
 * Native dust left in the stealth address after a sweep, computed locally (no balance read): `paid - gasUsed * effectiveGasPrice`, floored at 0.
 * @throws {HygieneError} `INVALID_INPUT` for negative inputs.
 */
export function bufferDust(paid: bigint, gasUsed: bigint, effectiveGasPrice: bigint): bigint {
  if (paid < 0n || gasUsed < 0n || effectiveGasPrice < 0n) fail('INVALID_INPUT', 'negative amount');
  const spent = gasUsed * effectiveGasPrice;
  return paid > spent ? paid - spent : 0n;
}

/**
 * True when `dust` exceeds `thresholdPercent` of one sweep's gas cost (HY-DUST-1; default 20%).
 * A positive answer means "offer a native sweep to the SAME destination", never a new one.
 * @throws {HygieneError} `INVALID_INPUT`.
 */
export function dustWorthSweeping(dust: bigint, oneSweepGasCost: bigint, thresholdPercent = 20n): boolean {
  if (dust < 0n || oneSweepGasCost < 0n || thresholdPercent < 0n) fail('INVALID_INPUT', 'negative amount');
  return dust * 100n > oneSweepGasCost * thresholdPercent;
}
