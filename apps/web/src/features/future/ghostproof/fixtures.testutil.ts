import { signReceipt, receiptJson, type ReceiptInvoiceBinding, type SignedReceipt } from '@ghostpay/invoice-schema';
import { createReceipt, PRESETS, renderJson, type PaymentRecord } from '@ghostpay/ux-receipts';
import type { ReceiptReview, ReceiptReviewOptions, ReceiptReviewResult } from './review';

export const NOW = 1_800_000_000_000;
const KEY = Uint8Array.from([...new Array<number>(31).fill(0), 7]);
const FIELDS = {
  invoiceDigest: `0x${'a'.repeat(64)}`, chainId: 84532, txHash: `0x${'b'.repeat(64)}`,
  stealthAddress: `0x${'c'.repeat(40)}`, asset: 'native', amountMinorUnits: '1000', issuedAt: NOW / 1000,
};
export const SIGNED = signReceipt(FIELDS, KEY);
export const OTHER_SIGNER = signReceipt(FIELDS, Uint8Array.from([...new Array<number>(31).fill(0), 9])).signerPublicKey;
export const SIGNED_TEXT = receiptJson(SIGNED);
export const BINDING: ReceiptInvoiceBinding = {
  invoiceDigest: SIGNED.invoiceDigest, chainId: SIGNED.chainId, asset: SIGNED.asset,
  amountMinorUnits: SIGNED.amountMinorUnits, invoiceSignerPublicKey: SIGNED.signerPublicKey,
  invoiceSignatureValid: true,
};
const RECORD: PaymentRecord = {
  createdAt: '2026-03-04T05:06:07.089Z', chain: 'eip155:8453', asset: { symbol: 'USDC', decimals: 6 },
  amountBase: '1500000', memo: 'Lunch split', txHash: SIGNED.txHash,
  sender: `0x${'1'.repeat(40)}`, recipient: `0x${'2'.repeat(40)}`, recipientKind: 'stealth',
};
export async function digestText(preset: 'minimal' | 'standard' | 'full' = 'full'): Promise<string> {
  return renderJson(await createReceipt(RECORD, PRESETS[preset]));
}
export function signedText(changes: Partial<SignedReceipt>): string {
  return JSON.stringify({ ...SIGNED, ...changes });
}
export function options(changes: Partial<ReceiptReviewOptions> = {}): ReceiptReviewOptions {
  return { nowMs: NOW, signal: new AbortController().signal, ...changes };
}
export function successful(result: ReceiptReviewResult): ReceiptReview {
  if (!result.ok) throw new Error(`Unexpected review error: ${result.code}`);
  return result.review;
}
