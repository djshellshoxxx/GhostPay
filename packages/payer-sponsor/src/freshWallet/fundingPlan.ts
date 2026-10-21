import { isAddressEqual, type Address } from 'viem';
import { assertTestnet } from '../chainGuard.js';
import { ensure } from '../errors.js';
import { roundUpSigFigs } from '../util.js';
import type { FundingStep, FundingWarning } from './types.js';

/** Default minimum delay between funding and payment on testnet (10 minutes). */
export const DEFAULT_MIN_DELAY_MS = 600_000;

/** Inputs of {@link planFunding}. */
export interface FundingPlanInput {
  /** The one-time payer wallet. */
  readonly payer: Address;
  /** Wallet that would send the native gas funding. */
  readonly funder: Address;
  /** Where the payment tokens come from (omit when the payer already holds them). */
  readonly tokenSource?: Address | undefined;
  readonly neededToken: bigint;
  readonly neededGasWei: bigint;
  /** Wallets the user controls (any of them as a funder links the payer to the user). */
  readonly knownMine: readonly Address[];
  /** Destinations of the seller or of earlier payments that must not fund the payer. */
  readonly sellerDestinations: readonly Address[];
  readonly chainId: number;
  readonly minDelayMs?: number;
}

/** A funding plan. `ok` is false when it refuses (PH-1-REQ-2). */
export interface FundingPlan {
  readonly ok: boolean;
  readonly steps: readonly FundingStep[];
  readonly warnings: readonly FundingWarning[];
  /** Random wait before funding, uniform in `[minDelayMs, 3 * minDelayMs]`. */
  readonly delayMs: number;
  /** Native funding amount rounded UP to 2 significant figures. */
  readonly roundedGasWei: bigint;
}

/** Text of the token-funding warning (PH-1-REQ-6, N2). Shown whatever else the plan says. */
export const TOKEN_FUNDING_WARNING: FundingWarning = {
  code: 'TOKEN_FUNDING_LINK',
  message:
    'The payment tokens must reach the new payer wallet from somewhere, and that transfer links the payer wallet to its source. Nothing here removes that link.',
};

function inList(list: readonly Address[], a: Address): boolean {
  return list.some((x) => isAddressEqual(x, a));
}

/**
 * Plans native gas funding (and optional token funding) of a one-time payer without linking it to
 * the user's own wallets (PH-1-REQ-2, -4, -6). Pure: no network I/O (PH-1-REQ-5).
 *
 * The gas amount is rounded up to 2 significant figures and a random delay in
 * `[minDelayMs, 3 * minDelayMs]` is drawn from the injected `rng`.
 *
 * @param input Plan inputs.
 * @param rng Uniform `[0, 1)` source (injected for tests; use a CSPRNG in production).
 * @returns The plan; `ok = false` with a `FUNDER_IS_KNOWN` warning and no steps when the funder or the
 *   token source is one of the user's own or the seller's addresses.
 * @throws PayerSponsorError `MAINNET_FORBIDDEN`, `INVALID_ARGUMENT`.
 * @security Does not make the payer private: it only avoids the obvious links and says so.
 */
export function planFunding(input: FundingPlanInput, rng: () => number): FundingPlan {
  assertTestnet(input.chainId);
  const minDelay = input.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  ensure(Number.isFinite(minDelay) && minDelay >= 0, 'minDelayMs must be >= 0');
  ensure(input.neededGasWei >= 0n && input.neededToken >= 0n, 'amounts must be >= 0');
  const r = rng();
  ensure(r >= 0 && r < 1, 'rng must return a value in [0, 1)');
  const delayMs = Math.floor(minDelay + r * 2 * minDelay);
  const roundedGasWei = roundUpSigFigs(input.neededGasWei, 2);
  const warnings: FundingWarning[] = [TOKEN_FUNDING_WARNING];

  const known = [...input.knownMine, ...input.sellerDestinations];
  const sources = input.tokenSource === undefined ? [input.funder] : [input.funder, input.tokenSource];
  if (sources.some((s) => inList(known, s))) {
    warnings.unshift({
      code: 'FUNDER_IS_KNOWN',
      message: 'A funding source is one of your own wallets or a known destination; funding from it would link them to the payer wallet.',
    });
    return { ok: false, steps: [], warnings, delayMs, roundedGasWei };
  }

  const steps: FundingStep[] = [];
  if (roundedGasWei > 0n) {
    steps.push({ kind: 'native', from: input.funder, to: input.payer, value: roundedGasWei, afterMs: delayMs });
  }
  if (input.tokenSource !== undefined && input.neededToken > 0n) {
    steps.push({ kind: 'token', from: input.tokenSource, to: input.payer, value: input.neededToken, afterMs: delayMs });
  }
  return { ok: true, steps, warnings, delayMs, roundedGasWei };
}
