import { MAX_ROUTER_GROSS } from '@ghostpay/chain-adapters';
import { assertTestnetChain, fail, requireInt } from './errors.js';

/** Ascending list of positive step sizes in token base units. */
export interface Grid {
  readonly stepsBase: readonly bigint[];
}

/** Result of {@link snapUp}. */
export interface SnapResult {
  readonly value: bigint;
  readonly rounded: boolean;
  readonly reason?: 'ROUND_CAP';
}

const MANTISSAS = [1n, 2n, 5n] as const;

/**
 * Denomination set `D(d)`: `{1,2,5} x 10^e` base units for `e` in `[max(0,d-2), d+4]` by default.
 * This 1-2-5 series is a proposal (spec Q1), not a standard.
 *
 * @param decimals Token decimals, integer 0..36.
 * @param opts Optional exponent range override (`0 <= minExp <= maxExp <= 80`).
 * @returns Strictly ascending set.
 * @throws {AmountBlurError} `INVALID_INPUT` for bad inputs.
 */
export function denominationSet(decimals: number, opts?: { readonly minExp?: number; readonly maxExp?: number }): Grid {
  requireInt(decimals, 0, 36, 'decimals');
  const minExp = opts?.minExp === undefined ? Math.max(0, decimals - 2) : requireInt(opts.minExp, 0, 80, 'minExp');
  const maxExp = opts?.maxExp === undefined ? decimals + 4 : requireInt(opts.maxExp, 0, 80, 'maxExp');
  if (maxExp < minExp) fail('INVALID_INPUT', 'maxExp below minExp');
  const steps: bigint[] = [];
  for (let e = minExp; e <= maxExp; e += 1) {
    for (const m of MANTISSAS) steps.push(m * 10n ** BigInt(e));
  }
  return Object.freeze({ stepsBase: Object.freeze(steps) });
}

/**
 * Rounding grid for a token: the same 1-2-5 series as {@link denominationSet}.
 * It always contains `10^decimals` (one whole token).
 *
 * @param decimals Token decimals, integer 0..36.
 * @returns Strictly ascending grid of step sizes.
 */
export function gridFor(decimals: number): Grid {
  return denominationSet(decimals);
}

function assertGrid(grid: Grid): void {
  const s = grid.stepsBase;
  if (s.length === 0) fail('INVALID_INPUT', 'grid empty');
  let prev = 0n;
  for (const v of s) {
    if (typeof v !== 'bigint' || v <= prev) fail('INVALID_INPUT', 'grid must be ascending and positive');
    prev = v;
  }
}

/**
 * Rounds `gross` UP to a multiple of the coarsest grid step whose increase stays within `maxBps`.
 *
 * @remarks Never rounds down (the seller must receive at least the invoiced net). If no step fits the
 * cap the input is returned unchanged with `reason: 'ROUND_CAP'`. Re-applying is not guaranteed to be
 * the identity: a larger base can admit a coarser step (tested: never lowers, stays on the grid of the
 * first result when the cap is 0).
 * @security Pure function of public inputs; an observer who knows the grid can invert it to a bucket.
 * @param gross Gross amount, `1 <= gross <= MAX_ROUTER_GROSS`.
 * @param grid Step sizes.
 * @param maxBps Maximum increase in bps of gross, integer 0..500.
 * @param chainId Chain id (testnet guard).
 * @returns Rounded value.
 * @throws {AmountBlurError} `CHAIN_NOT_ALLOWED`, `INVALID_INPUT`.
 */
export function snapUp(gross: bigint, grid: Grid, maxBps: number, chainId: number): SnapResult {
  assertTestnetChain(chainId);
  if (typeof gross !== 'bigint' || gross < 1n || gross > MAX_ROUTER_GROSS) fail('INVALID_INPUT', 'gross out of range');
  requireInt(maxBps, 0, 500, 'maxBps');
  assertGrid(grid);
  const cap = (gross * BigInt(maxBps)) / 10_000n;
  for (let i = grid.stepsBase.length - 1; i >= 0; i -= 1) {
    const s = grid.stepsBase[i] as bigint;
    const v = ((gross + s - 1n) / s) * s;
    if (v - gross <= cap && v <= MAX_ROUTER_GROSS) return { value: v, rounded: v !== gross };
  }
  return { value: gross, rounded: false, reason: 'ROUND_CAP' };
}
