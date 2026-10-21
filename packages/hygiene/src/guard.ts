import { normAddress, type Address } from './addr.js';

/** ERC-5564 Security Considerations text shown when funding is blocked. */
export const FUNDING_GUARD_MESSAGE =
  'Blocked: ERC-5564 says the wallet that funds a stealth address "MUST NOT have any physical connection to the stealth address owner". ' +
  'Funding this address from a wallet you use links it to you. Use the payer gas buffer or the relayer instead.';

/**
 * Funding guard (HY-FUND-1): refuse a native top-up whose sender is a known wallet or a ledger destination.
 *
 * @param from Funding transaction sender (e.g. pasted tx's `from`).
 * @param known Connected wallet addresses and ledger/saved destinations.
 * @returns `allow: false` plus the ERC-5564 text for a known sender; `allow: true` otherwise. `allow: true` does NOT make funding private: an unknown sender is merely not known to this app.
 * @throws {HygieneError} `INVALID_ADDRESS` for malformed addresses (fail closed).
 */
export function fundingGuard(
  from: Address,
  known: { wallets: readonly Address[]; destinations: readonly Address[] },
): { allow: boolean; message?: string } {
  const f = normAddress(from);
  const set = new Set([...known.wallets, ...known.destinations].map((a) => normAddress(a)));
  return set.has(f) ? { allow: false, message: FUNDING_GUARD_MESSAGE } : { allow: true };
}
