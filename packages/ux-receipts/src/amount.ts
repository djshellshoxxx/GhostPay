import { isAmountBase, isDecimals } from './validate.js';
import { ReceiptError } from './errors.js';

/** Exact base-unit to decimal string (BigInt based, no float). `1500000`,6 -> `1.5`. */
export function formatAmount(amountBase: string, decimals: number): string {
  if (!isAmountBase(amountBase) || !isDecimals(decimals)) {
    throw new ReceiptError('INVALID_FIELD', 'amount', 'invalid amount');
  }
  if (decimals === 0) return amountBase;
  const padded = amountBase.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}
