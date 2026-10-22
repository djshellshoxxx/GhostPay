import type { Address } from '@ghostpay/chain-adapters';
import type { SecretScalar } from '@ghostpay/core-crypto';
import { assertTestnet } from './guard.js';
import { POOL_NOTE } from './labels.js';
import { HopError, type HopAddressSource, type HopPlan } from './types.js';

/** Terminal address handed to the pool stage. */
export interface HandoffInfo {
  readonly terminal: Address;
  /** Always 0: hop delays are never credited to pool dwell time or anonymity estimates (HOP-POOL-2). */
  readonly creditedDelayMs: 0;
  /** Sum of drawn hop delays, informational only. */
  readonly hopDelayMs: number;
  readonly notes: readonly string[];
  withSecret<T>(fn: (secret: SecretScalar) => Promise<T>): Promise<T>;
}

/**
 * Pool-exit handoff: the address that will deposit into the pool and a scoped key accessor.
 *
 * @param plan Plan with `handoff === 'pool-exit'`.
 * @param addrs Address source.
 * @returns Handoff info.
 * @throws {HopError} `HANDOFF_REJECTED` if the plan is not a pool-exit plan, or the terminal key index is unknown (external destination).
 */
export function handoffInfo(plan: HopPlan, addrs: HopAddressSource): HandoffInfo {
  assertTestnet(plan.chainId);
  if (plan.handoff !== 'pool-exit') throw new HopError('HANDOFF_REJECTED', 'plan has no pool handoff');
  const last = plan.legs[plan.legs.length - 1];
  const terminal = last === undefined ? plan.source : last.to;
  const index = last === undefined ? plan.sourceIndex : last.toIndex;
  if (index === null) throw new HopError('HANDOFF_REJECTED', 'terminal key is not self-derived');
  return {
    terminal,
    creditedDelayMs: 0,
    hopDelayMs: plan.legs.reduce((a, l) => a + l.delayMs, 0),
    notes: [POOL_NOTE],
    withSecret: (fn) => addrs.withSecretAt(index, fn),
  };
}

/**
 * Rejects forwarding after a pool withdrawal (HOP-POOL-3).
 *
 * @param stage Where the caller wants to hop.
 * @throws {HopError} `HANDOFF_REJECTED` for `post-exit`.
 */
export function assertHopsAllowed(stage: 'pre-pool' | 'post-exit'): void {
  if (stage === 'post-exit') throw new HopError('HANDOFF_REJECTED', 'forwarding after a pool exit is rejected');
}
