import { ReceiptError } from './errors.js';
import type { AddressForm } from './types.js';
import { isAddress } from './validate.js';

/** Default truncation: first 6 and last 4 characters. */
export const TRUNCATED: AddressForm = { head: 6, tail: 4 };

/**
 * Render an address in the chosen form. Returns undefined for 'hidden'.
 * Truncation may reveal at most half of the characters.
 * @security Truncated addresses are still matchable against candidate lists.
 */
export function redactAddress(address: string, form: AddressForm, path = 'address'): string | undefined {
  if (!isAddress(address)) throw new ReceiptError('INVALID_FIELD', path, 'invalid address');
  if (form === 'hidden') return undefined;
  if (form === 'full') return address;
  const { head, tail } = form;
  if (
    !Number.isInteger(head) ||
    !Number.isInteger(tail) ||
    head < 1 ||
    tail < 1 ||
    head > 16 ||
    tail > 16 ||
    head + tail > Math.floor(address.length / 2)
  ) {
    throw new ReceiptError('INVALID_POLICY', path, 'invalid truncation');
  }
  return `${address.slice(0, head)}...${address.slice(address.length - tail)}`;
}

const norm = (s: string): string => (s.startsWith('0x') || s.startsWith('0X') ? s.toLowerCase() : s);

/**
 * Does a revealed (full or truncated) address correspond to a full address from a chain?
 * 0x-addresses compare case-insensitively; others exactly.
 */
export function matchesAddress(revealed: string, actual: string): boolean {
  const i = revealed.indexOf('...');
  if (i < 0) return norm(revealed) === norm(actual);
  const head = revealed.slice(0, i);
  const tail = revealed.slice(i + 3);
  const a = norm(actual);
  return a.length > head.length + tail.length && a.startsWith(norm(head)) && a.endsWith(norm(tail));
}
