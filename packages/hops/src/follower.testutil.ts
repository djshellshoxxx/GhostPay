import type { Address } from '@ghostpay/chain-adapters';
import type { Transfer } from './stub.testutil.js';

/** Result of a forward trace. */
export interface TraceResult {
  readonly path: Address[];
  readonly end: Address;
  readonly steps: number;
  /** True if at any step more than one outgoing transfer matched. */
  readonly ambiguous: boolean;
}

/**
 * The "analyst": follows funds forward from a known start address using only the public transfer
 * list. At each step it takes the outgoing transfer of the token whose amount is within the fee
 * bounds (0.5 %..3 % below the current amount) and inside the time window. No keys, no relayer logs.
 */
export function traceForward(
  ledger: readonly Transfer[],
  token: Address,
  start: Address,
  startAmount: bigint,
  startMs: number,
  maxTotalMs: number,
  feeMinBps = 50n,
  feeMaxBps = 300n,
): TraceResult {
  const path: Address[] = [start];
  let cur = start;
  let amt = startAmount;
  let ambiguous = false;
  for (;;) {
    const hi = (amt * (10_000n - feeMinBps)) / 10_000n + 1n; // +1: fees are floor-rounded
    const lo = (amt * (10_000n - feeMaxBps)) / 10_000n - 1n;
    const out = ledger.filter(
      (t) => t.token === token && t.from === cur && t.amount >= lo && t.amount <= hi && t.timeMs >= startMs && t.timeMs <= startMs + maxTotalMs,
    );
    if (out.length === 0) break;
    if (out.length > 1) ambiguous = true;
    const t = out[0] as Transfer;
    path.push(t.to);
    cur = t.to;
    amt = t.amount;
  }
  return { path, end: cur, steps: path.length - 1, ambiguous };
}

/**
 * Blind tracer: knows only the origin amount (not the start address). Counts addresses that hold
 * exactly that amount at the start; success probability by uniform guess is `1 / count`.
 */
export function blindStartCandidates(ledger: readonly Transfer[], token: Address, amount: bigint): number {
  return new Set(ledger.filter((t) => t.token === token && t.amount === amount && t.from.endsWith('fade1')).map((t) => t.to)).size;
}
