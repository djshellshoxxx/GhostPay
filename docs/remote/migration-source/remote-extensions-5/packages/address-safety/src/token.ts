import type { Address } from 'viem';
import { reject, type Reason } from './errors.js';
import { parseStrictAddress } from './address.js';

/**
 * ERC-7528 placeholder used by some UIs and aggregators to mean "the chain's native currency".
 * It is not a contract and holds no code.
 */
export const NATIVE_TOKEN_PLACEHOLDER: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Tells whether `s` is the ERC-7528 native-token placeholder (case-insensitive).
 * @param s Candidate value.
 * @returns True only for that address.
 * @security Use for display decisions only; never to select native-vs-ERC-20 handling of untrusted input.
 */
export function isNativeTokenPlaceholder(s: unknown): boolean {
  return typeof s === 'string' && s.toLowerCase() === NATIVE_TOKEN_PLACEHOLDER.toLowerCase();
}

/**
 * Parses a token address coming from an invoice, sweep input or user paste.
 * @param s Candidate text.
 * @returns The checksummed address, or a {@link Reason}; the ERC-7528 placeholder and the zero
 * address are rejected.
 * @security The placeholder is a display label only (safety-user-protection R6d): native currency is
 * decided by the allowlist, never by an address supplied in untrusted input.
 */
export function parseTokenAddress(s: string): Address | Reason {
  const a = parseStrictAddress(s);
  if (typeof a !== 'string') return a;
  if (isNativeTokenPlaceholder(a)) return reject('native_placeholder');
  if (/^0x0{40}$/.test(a)) return reject('zero_address');
  return a;
}

/**
 * Fixed label for showing native currency in a review screen.
 * @param symbol Optional chain symbol; `[A-Za-z0-9]{1,8}` only, otherwise ignored.
 * @returns Text that cannot be mistaken for a token contract.
 */
export function nativeTokenLabel(symbol?: string): string {
  const sym = symbol !== undefined && /^[A-Za-z0-9]{1,8}$/.test(symbol) ? `${symbol} ` : '';
  return sym === '' ? 'native currency (not a token contract)' : `${sym.trim()} (native, not a token contract)`;
}
