import type { Address } from 'viem';

/** Linter finding. */
export interface LintWarning {
  readonly code: 'AMOUNT_LINKAGE' | 'TOO_SOON' | 'DESTINATION_LINKED' | 'DESTINATION_IS_GHOSTPAY' | 'DESTINATION_REUSED';
  readonly severity: 'warn' | 'high';
  readonly message: string;
}

export interface LintInput {
  readonly depositedAmount: bigint;
  readonly exitAmount: bigint;
  /** Unix seconds. */
  readonly depositedAt: number;
  readonly now: number;
  readonly destination: Address;
  /** Addresses that have interacted with S1 or the seller wallet W (caller-supplied history). */
  readonly linkedAddresses?: readonly Address[];
  /** Known GhostPay addresses (router, fee recipient, relayers). */
  readonly ghostpayAddresses?: readonly Address[];
  /** Destinations already used by other notes. */
  readonly usedDestinations?: readonly Address[];
  /** Default 3600 s. */
  readonly minDelaySec?: number;
}

const has = (list: readonly Address[] | undefined, a: Address): boolean =>
  list?.some((x) => x.toLowerCase() === a.toLowerCase()) ?? false;

/**
 * EP-LINT-1: flags exit choices that make the deposit and the exit easy to match.
 *
 * @param i Inputs.
 * @returns Warnings (empty when nothing was found; that is not a privacy guarantee).
 * @security Heuristics only. Amount match is "within 1 %", checked in integer arithmetic.
 */
export function lintExit(i: LintInput): readonly LintWarning[] {
  const out: LintWarning[] = [];
  const dep = i.depositedAmount;
  const diff = i.exitAmount > dep ? i.exitAmount - dep : dep - i.exitAmount;
  if (dep > 0n && diff * 100n <= dep) {
    out.push({
      code: 'AMOUNT_LINKAGE',
      severity: 'high',
      message: 'The exit amount is within 1% of the deposit amount, so the two are easy to match by amount.',
    });
  }
  const minDelay = i.minDelaySec ?? 3600;
  if (i.now - i.depositedAt < minDelay) {
    out.push({ code: 'TOO_SOON', severity: 'high', message: 'The exit is soon after the deposit, so the two are easy to match by timing.' });
  }
  if (has(i.linkedAddresses, i.destination)) {
    out.push({ code: 'DESTINATION_LINKED', severity: 'high', message: 'The destination has interacted with the one-time address or your wallet before.' });
  }
  if (has(i.ghostpayAddresses, i.destination)) {
    out.push({ code: 'DESTINATION_IS_GHOSTPAY', severity: 'warn', message: 'The destination is a known GhostPay address.' });
  }
  if (has(i.usedDestinations, i.destination)) {
    out.push({ code: 'DESTINATION_REUSED', severity: 'high', message: 'The same destination is used for more than one exit.' });
  }
  return out;
}
