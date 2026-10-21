import type { Address } from 'viem';

/** What a {@link PolicyGate} sees about one sweep. Executed in-process only; never logged. */
export interface PolicyContext {
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly destination: Address;
  readonly amount: bigint;
}

/** Outcome of a policy check. */
export type PolicyDecision = { readonly allow: true } | { readonly allow: false; readonly reasonClass: string };

/**
 * Compliance hook (ADR-0006) executed after validation and before the transaction is sent.
 * Operators may supply a sanctions screen. The default allows everything.
 */
export interface PolicyGate {
  check(ctx: PolicyContext): Promise<PolicyDecision>;
}

/** Default gate: allow all. */
export const allowAllPolicy: PolicyGate = { check: () => Promise.resolve({ allow: true }) };
