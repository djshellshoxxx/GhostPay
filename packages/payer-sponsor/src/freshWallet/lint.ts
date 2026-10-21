import { isAddressEqual, type Address } from 'viem';
import { DEFAULT_MIN_DELAY_MS } from './fundingPlan.js';
import type { FundingTx, FundingWarning } from './types.js';

/** Options of {@link lintFunding}. */
export interface LintOptions {
  /** The payer wallet under review. */
  readonly payer: Address;
  readonly minDelayMs?: number;
  /** Native gas the payment minimally needs; a funding of exactly this to the wei is flagged. */
  readonly requiredGasWei?: bigint;
  /** When the payment is (to be) sent, epoch ms; enables the delay check. */
  readonly paymentAtMs?: number;
  /** Earlier payer wallets of the user (for shared-funder detection). */
  readonly priorPayers?: readonly Address[];
  /** Payers already used for a previous invoice (PH-1-REQ-7). */
  readonly usedPayers?: readonly Address[];
}

const has = (list: readonly Address[], a: Address): boolean => list.some((x) => isAddressEqual(x, a));

/**
 * Lints a list of funding transfers around one payer wallet (PH-1-REQ-3, -5, -7). Pure over the
 * supplied list: no network I/O.
 *
 * Emits `SAME_SENDER_RECEIVER`, `SHARED_FUNDER`, `EXACT_AMOUNT`, `NO_DELAY`, `LEFTOVER_RETURN` and
 * `PAYER_REUSE`. An empty result does not mean the payer is private.
 *
 * @param txs Observed transfers (the caller fetched them; see `fetchFundingHistory`).
 * @param knownMine Wallets the user controls.
 * @param sellerDestinations Destinations of the seller or of earlier payments.
 * @param opts Payer and thresholds.
 * @returns Warnings, in a stable order, without duplicates of the same code.
 */
export function lintFunding(
  txs: readonly FundingTx[],
  knownMine: ReadonlySet<Address> | readonly Address[],
  sellerDestinations: ReadonlySet<Address> | readonly Address[],
  opts: LintOptions,
): readonly FundingWarning[] {
  const mine = [...knownMine];
  const sellers = [...sellerDestinations];
  const minDelay = opts.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const out = new Map<FundingWarning['code'], FundingWarning>();
  const add = (code: FundingWarning['code'], message: string): void => {
    if (!out.has(code)) out.set(code, { code, message });
  };

  const intoPayer = txs.filter((t) => isAddressEqual(t.to, opts.payer));
  const nativeIn = intoPayer.filter((t) => t.token === undefined);
  const funders = intoPayer.map((t) => t.from);

  if (funders.some((f) => has(sellers, f))) {
    add('SAME_SENDER_RECEIVER', 'A funding source is also a seller or payment destination, which ties the payer to the receiving side.');
  }

  const others = [...mine, ...(opts.priorPayers ?? [])];
  if (txs.some((t) => funders.some((f) => isAddressEqual(f, t.from)) && has(others, t.to))) {
    add('SHARED_FUNDER', 'The wallet that funded the payer also funded one of your own or an earlier payer wallet.');
  }

  if (opts.requiredGasWei !== undefined && nativeIn.some((t) => t.value === opts.requiredGasWei)) {
    add('EXACT_AMOUNT', 'The gas funding equals the minimum needed to the wei; round the amount up so it is not an exact fingerprint.');
  }

  if (opts.paymentAtMs !== undefined && nativeIn.length > 0) {
    const last = Math.max(...nativeIn.map((t) => t.atMs));
    if (opts.paymentAtMs - last < minDelay) {
      add('NO_DELAY', 'The payment follows the gas funding too closely; wait before paying.');
    }
  }

  const returned = txs.some(
    (t) => t.token === undefined && isAddressEqual(t.from, opts.payer) && funders.some((f) => isAddressEqual(f, t.to)),
  );
  if (returned) add('LEFTOVER_RETURN', 'Leftover gas was sent back to its funder, which confirms the link between them.');

  if (has(opts.usedPayers ?? [], opts.payer)) {
    add('PAYER_REUSE', 'This payer wallet was already used for another invoice; use a new one for each payment.');
  }
  return [...out.values()];
}
