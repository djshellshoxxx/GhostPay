import { assertTestnetChain, randomBelow, requireInput, MetadataHardeningError, type RandomSource } from './guard.js';

/** Result of an amount adjustment. All values in token base units. */
export interface AdjustedAmount {
  readonly amount: bigint;
  /** `amount - input`, always >= 0. */
  readonly surplus: bigint;
  /** Significant figures actually used (rounding only). */
  readonly sigFigsUsed?: number;
}

/** Options for {@link roundGross}. */
export interface RoundOptions {
  readonly chainId: number;
  /** `fixed_token` amounts are never altered. */
  readonly amountPolicyMode: 'fiat_quote' | 'fixed_token';
  /** Significant figures, 1..18; default 3. */
  readonly sigFigs?: number;
  /** Invoice `maxSlippageBps`: surplus may not exceed this share of the input. */
  readonly maxSlippageBps: number;
}

/**
 * MH-AMT-1: rounds a quote-derived amount UP to `sigFigs` significant figures.
 *
 * @remarks Result >= input and < input * (1 + 10^(1-sigFigs)). If the surplus would exceed
 * `maxSlippageBps`, finer grids are tried until it fits (worst case the exact input).
 * `fixed_token` returns the input unchanged.
 *
 * Hides: client/quote-moment fingerprint in 18-decimal amounts. Does NOT hide the amount itself.
 * Cost: payer overpays up to one grid step.
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT`, `UNSUPPORTED_CHAIN`.
 */
export function roundGross(amount: bigint, opts: RoundOptions): AdjustedAmount {
  assertTestnetChain(opts.chainId);
  requireInput(amount > 0n, 'amount must be positive');
  requireInput(Number.isInteger(opts.maxSlippageBps) && opts.maxSlippageBps >= 0 && opts.maxSlippageBps <= 10_000, 'slippage out of range');
  const sig = opts.sigFigs ?? 3;
  requireInput(Number.isInteger(sig) && sig >= 1 && sig <= 18, 'sigFigs out of range');
  if (opts.amountPolicyMode === 'fixed_token') return { amount, surplus: 0n };
  const digits = amount.toString().length;
  for (let s = sig; s <= digits; s++) {
    if (digits <= s) return { amount, surplus: 0n, sigFigsUsed: s };
    const step = 10n ** BigInt(digits - s);
    const rounded = ((amount + step - 1n) / step) * step;
    const surplus = rounded - amount;
    if (surplus * 10_000n <= amount * BigInt(opts.maxSlippageBps)) {
      return { amount: rounded, surplus, sigFigsUsed: s };
    }
  }
  return { amount, surplus: 0n, sigFigsUsed: digits };
}

/** Options for {@link addAmountNoise}. */
export interface NoiseOptions {
  readonly chainId: number;
  /** Maximum overpayment in basis points; hard cap 100 (1 %). */
  readonly maxBps: number;
}

/**
 * MH-AMT-2: adds CSPRNG overpayment uniformly in [0, amount*maxBps/10000].
 *
 * Hides: exact match between invoice amount and chain amount. Does NOT hide the amount or the
 * in/out amount match across a sweep. Cost: direct loss to the payer (shown exactly).
 * Conflicts with MH-AMT-1 (use one).
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT` when `maxBps` is outside 0..100.
 */
export function addAmountNoise(amount: bigint, opts: NoiseOptions, rng?: RandomSource): AdjustedAmount {
  assertTestnetChain(opts.chainId);
  requireInput(amount > 0n, 'amount must be positive');
  requireInput(Number.isInteger(opts.maxBps) && opts.maxBps >= 0 && opts.maxBps <= 100, 'noise bound must be 0..100 bps');
  const max = (amount * BigInt(opts.maxBps)) / 10_000n;
  const surplus = randomBelow(max + 1n, rng);
  return { amount: amount + surplus, surplus };
}

/** MH-AMT-2 R2: an invoice is paid when `net >= required` (noise only ever overpays). */
export function isPaid(net: bigint, required: bigint): boolean {
  requireInput(net >= 0n && required >= 0n, 'amounts must be non-negative');
  return net >= required;
}

/** MH-AMT-1 vs MH-AMT-2: pick one. */
export function assertSingleAmountMode(opts: { rounding: boolean; noise: boolean }): void {
  if (opts.rounding && opts.noise) {
    throw new MetadataHardeningError('CONFLICT', 'amount rounding and amount noise cannot both be on');
  }
}
