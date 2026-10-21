import type { DestLedger } from './ledger.js';
import { fail } from './errors.js';

/**
 * Throws unless `source` may be swept to `destination` (HY-CON-1).
 *
 * @throws {HygieneError} `DEST_REUSE` (message carries the reason code only), `CHAIN_NOT_ALLOWED`, `INVALID_ADDRESS`.
 * @security Client-side enforcement only: it does not stop a different client, and it does not hide the S1 -> D link.
 */
export function assertNoConsolidation(
  ledger: DestLedger,
  chainId: number,
  destination: string,
  source: string,
): void {
  const v = ledger.canUse(chainId, destination, source);
  if (!v.ok) fail('DEST_REUSE', v.reason);
}

/**
 * Same-block gate (HY-CON-3): a second sweep by one session in the block of the previous one must wait.
 *
 * @param lastSweepBlock Block number of this session's previous sweep, if any.
 * @param head Current head block (read without any address).
 * @returns `wait: true` while `head <= lastSweepBlock`; `minBlock` is the first block at which a sweep may go (`lastSweepBlock + 1`). The caller adds jitter (`apps/web/src/lib/jitter.ts`).
 * @throws {HygieneError} `INVALID_INPUT` for negative blocks.
 */
export function sameBlockGate(
  lastSweepBlock: bigint | undefined,
  head: bigint,
): { wait: boolean; minBlock: bigint } {
  if (head < 0n || (lastSweepBlock !== undefined && lastSweepBlock < 0n))
    fail('INVALID_INPUT', 'negative block');
  if (lastSweepBlock === undefined) return { wait: false, minBlock: head };
  const minBlock = lastSweepBlock + 1n;
  return { wait: head < minBlock, minBlock: head < minBlock ? minBlock : head };
}
