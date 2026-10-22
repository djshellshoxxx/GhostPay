import { fail } from './errors.js';

/**
 * EP-GEN-8: `exitedAmount + fee` must equal `noteAmount` within the adapter-declared rounding.
 *
 * @param noteAmount Amount the pool credited to the note.
 * @param exited Amount delivered to the destination.
 * @param fee Fee taken on exit.
 * @param roundingTolerance Largest accepted absolute difference (default 0), declared by the adapter.
 * @throws ExternalPoolError ACCOUNTING_MISMATCH.
 * @security Amounts are `bigint` end to end; negative inputs are rejected.
 */
export function assertAccounting(noteAmount: bigint, exited: bigint, fee: bigint, roundingTolerance = 0n): void {
  if (typeof noteAmount !== 'bigint' || typeof exited !== 'bigint' || typeof fee !== 'bigint') fail('ACCOUNTING_MISMATCH', 'amounts must be bigint');
  if (noteAmount < 0n || exited < 0n || fee < 0n || roundingTolerance < 0n) fail('ACCOUNTING_MISMATCH', 'negative amount');
  const diff = noteAmount - (exited + fee);
  const abs = diff < 0n ? -diff : diff;
  if (abs > roundingTolerance) fail('ACCOUNTING_MISMATCH', 'exited amount plus fees does not equal the note amount');
}

/**
 * Basis-point fee, rounded down.
 *
 * @param amount Base amount.
 * @param bps Fee in basis points (0..10000).
 * @returns `floor(amount * bps / 10000)`.
 */
export function feeFloor(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) fail('INVALID_INPUT', 'bps must be an integer in 0..10000');
  return (amount * BigInt(bps)) / 10_000n;
}
