/** Seller-side verdict on a confidential payment after (or before) decryption (CT-PAY-6). */
export type PaymentStatus = 'unconfirmed' | 'confirmed' | 'underpaid' | 'failed_insufficient_balance';

/**
 * Classifies a confidential payment.
 * @param expectedNet Invoice net amount in base units.
 * @param decrypted Decrypted amount, or `undefined` while the seller has not decrypted yet.
 * @returns `unconfirmed` until decrypted; `failed_insufficient_balance` for a decrypted 0 (silent zero
 * transfer); `confirmed` for `>= expectedNet`; `underpaid` otherwise.
 * @security Never mark a payment paid from the announcement alone: the handle may decrypt to 0.
 */
export function classifyPayment(expectedNet: bigint, decrypted: bigint | undefined): PaymentStatus {
  if (decrypted === undefined) return 'unconfirmed';
  if (decrypted === 0n) return 'failed_insufficient_balance';
  return decrypted >= expectedNet ? 'confirmed' : 'underpaid';
}

/** Warning keys for a public wrap amount (CT-UX-2, CT-UX-4). */
export type WrapWarning = 'CT_WRAP_PUBLIC' | 'CT_WRAP_EQUALS_GROSS' | 'CT_WRAP_NOT_ROUND';

/**
 * Warnings to show before a wrap, whose amount is public on-chain.
 * @param wrapAmount Amount to wrap (base units).
 * @param invoiceGross Gross amount of the invoice about to be paid, if known.
 * @param roundUnit Denomination considered "round" (default 10^6 = 1 whole 6-decimal token).
 */
export function wrapWarnings(wrapAmount: bigint, invoiceGross?: bigint, roundUnit = 1_000_000n): WrapWarning[] {
  const out: WrapWarning[] = ['CT_WRAP_PUBLIC'];
  if (invoiceGross !== undefined && wrapAmount === invoiceGross) out.push('CT_WRAP_EQUALS_GROSS');
  if (roundUnit > 0n && wrapAmount % roundUnit !== 0n) out.push('CT_WRAP_NOT_ROUND');
  return out;
}
