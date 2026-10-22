import type { SyncedPool } from './sync.js';

/** Crowd estimate label; thresholds are cosmetic and MUST be shown with the raw count. */
export type CrowdLabel = 'none' | 'tiny' | 'small' | 'larger';

/** Options for {@link estimatePoolCrowd}. */
export interface CrowdOptions {
  /** Seconds per block of the chain (default 12). */
  readonly blockTimeSec?: number;
}

/**
 * Counts deposits that could plausibly be the source of a withdrawal of `value` in the last
 * `windowSec` seconds (deposits with `deposit.value >= value`).
 *
 * @remarks This is a mechanism estimate, not an anonymity measure (N1, N3). A testnet pool with a few
 * users is effectively no crowd.
 */
export function estimatePoolCrowd(
  synced: SyncedPool,
  value: bigint,
  windowSec: number,
  opts: CrowdOptions = {},
): { deposits: number; label: CrowdLabel } {
  const bt = opts.blockTimeSec ?? 12;
  const windowBlocks = BigInt(Math.max(0, Math.ceil(windowSec / bt)));
  const from = synced.lastBlock - windowBlocks;
  const deposits = synced.deposits.filter((d) => d.value >= value && d.blockNumber > from).length;
  const label: CrowdLabel = deposits === 0 ? 'none' : deposits < 10 ? 'tiny' : deposits < 50 ? 'small' : 'larger';
  return { deposits, label };
}
