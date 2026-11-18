import { LocalizedTypeError } from './errors';
import type { MessageKey } from '../i18n/catalog';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  FRAGMENT_PREFIX, MAX_DECODED_BYTES, checkExpiry, invoiceDigest, verifyInvoiceSignature,
  SignedReceiptError, type SignedReceiptErrorCode, type ParsedInvoice, type ReceiptInvoiceBinding,
  validateReceiptPayload as sharedValidateReceiptPayload,
  canonicalReceiptPayload as sharedCanonicalReceiptPayload,
  receiptDigest as sharedReceiptDigest,
  signReceipt as sharedSignReceipt,
  bindReceiptToInvoice as sharedBindReceiptToInvoice,
  parseVerifiedReceipt as sharedParseVerifiedReceipt,
  receiptJson as sharedReceiptJson,
} from '@ghostpay/invoice-schema';
import { checkAnnouncement, encodeMetaAddress, type StealthKeySet } from '@ghostpay/core-crypto';
import { grossForNet, routerSplit } from '@ghostpay/chain-adapters';
import type { ScanMatch } from './scanClient';

export {
  RECEIPT_DOMAIN, MAX_RECEIPT_JSON_BYTES, verifyReceipt,
  type ReceiptPayload, type SignedReceipt, type ReceiptInvoiceBinding, type BoundReceipt,
} from '@ghostpay/invoice-schema';

/** Bound the encoded envelope and a reasonable URL wrapper before parsing or file allocation. */
export const MAX_RECEIPT_INVOICE_BYTES = Math.ceil(MAX_DECODED_BYTES * 4 / 3) + 2048;

const RECEIPT_MESSAGES: Readonly<Record<SignedReceiptErrorCode, MessageKey>> = {
  OBJECT: 'receipt.error.object',
  PLAIN_OBJECT: 'receipt.error.plainObject',
  SCHEMA: 'receipt.error.schema',
  VERSION: 'receipt.validation.version',
  DIGEST: 'receipt.validation.digest',
  CHAIN: 'receipt.validation.chain',
  TX_HASH: 'receipt.validation.txHash',
  STEALTH_ADDRESS: 'receipt.validation.stealthAddress',
  ASSET: 'receipt.validation.asset',
  AMOUNT: 'receipt.validation.amount',
  AMOUNT_RANGE: 'receipt.validation.amountRange',
  ISSUE_TIME: 'receipt.validation.issueTime',
  SIGNER_KEY: 'receipt.validation.signerKey',
  LOWERCASE: 'receipt.validation.lowercase',
  SIGNATURE: 'receipt.validation.signature',
  OTHER_INVOICE: 'receipt.validation.otherInvoice',
  RECEIPT_CHAIN_MISMATCH: 'receipt.validation.receiptChainMismatch',
  RECEIPT_ASSET_MISMATCH: 'receipt.validation.receiptAssetMismatch',
  RECEIPT_AMOUNT_MISMATCH: 'receipt.validation.receiptAmountMismatch',
  RECEIPT_TX_MISMATCH: 'receipt.validation.receiptTxMismatch',
  RECEIPT_RECIPIENT_MISMATCH: 'receipt.validation.receiptRecipientMismatch',
  TRUSTED_KEY: 'receipt.validation.trustedKey',
  SIGNER_MISMATCH: 'receipt.validation.signerMismatch',
  FILE_LARGE: 'receipt.validation.fileLarge',
  MALFORMED: 'receipt.validation.malformed',
  EXPORT_INVALID: 'receipt.validation.exportInvalid',
};

/** Keep the GUI's catalog-backed errors while the shared codec remains framework independent. */
function localized<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof SignedReceiptError)
      throw new LocalizedTypeError({ key: RECEIPT_MESSAGES[error.code], ...(error.values === undefined ? {} : { values: error.values }) });
    throw error;
  }
}

export const validateReceiptPayload: typeof sharedValidateReceiptPayload = (...args) => localized(() => sharedValidateReceiptPayload(...args));
export const canonicalReceiptPayload: typeof sharedCanonicalReceiptPayload = (...args) => localized(() => sharedCanonicalReceiptPayload(...args));
export const receiptDigest: typeof sharedReceiptDigest = (...args) => localized(() => sharedReceiptDigest(...args));
export const signReceipt: typeof sharedSignReceipt = (...args) => localized(() => sharedSignReceipt(...args));
export const bindReceiptToInvoice: typeof sharedBindReceiptToInvoice = (...args) => localized(() => sharedBindReceiptToInvoice(...args));
export const parseVerifiedReceipt: typeof sharedParseVerifiedReceipt = (...args) => localized(() => sharedParseVerifiedReceipt(...args));
export const receiptJson: typeof sharedReceiptJson = (...args) => localized(() => sharedReceiptJson(...args));

/** Read a signed invoice locally. A URL is never opened or fetched. */
export function receiptInvoiceFragment(text: string): string {
  if (text.length > MAX_RECEIPT_INVOICE_BYTES || new TextEncoder().encode(text).byteLength > MAX_RECEIPT_INVOICE_BYTES) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLarge' });
  const input = text.trim();
  let fragment = input;
  if (!input.startsWith(FRAGMENT_PREFIX)) {
    let url: URL;
    try { url = new URL(input); } catch { throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' }); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' });
    fragment = url.hash;
  }
  if (!fragment.startsWith(FRAGMENT_PREFIX) || /\s/.test(fragment)) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' });
  return fragment;
}

/** Match an actual signed fixed-token invoice to verified scan facts without storing borrowed secrets. */
export function receiptBindingForInvoice(parsed: ParsedInvoice, match: ScanMatch, signerPublicKey: string, keys: StealthKeySet, nowSeconds: number): ReceiptInvoiceBinding {
  const invoice = parsed.invoice;
  if (!parsed.verification.signatureValid || !verifyInvoiceSignature(parsed)) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceSignature' });
  if (invoice.signer !== signerPublicKey) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceSignerMismatch' });
  if (invoice.metaAddress.toLowerCase() !== encodeMetaAddress(keys).toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceRecipientMismatch' });
  if (checkExpiry(invoice, nowSeconds).invoiceExpired) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceExpired' });
  if (match.receipt !== 'verified' || !match.viaRouter || match.metadata === undefined || match.announcement.transactionHash === undefined) throw new LocalizedTypeError({ key: 'receipt.validation.completePayment' });
  if (invoice.chainId !== match.chainId) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceChainMismatch' });
  const asset = match.metadata.kind === 'native' ? 'native' : match.metadata.token.toLowerCase();
  if (invoice.token.toLowerCase() !== asset) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceAssetMismatch' });
  if (invoice.amountPolicy.mode !== 'fixed_token') throw new LocalizedTypeError({ key: 'receipt.validation.fixedToken' });
  const wanted = BigInt(invoice.amountPolicy.tokenAmount);
  const expected = routerSplit(invoice.feePolicy === 'payer_pays' ? grossForNet(wanted) : wanted).net;
  if (match.metadata.netAmount !== expected) throw new LocalizedTypeError({ key: 'receipt.validation.sellerAmountMismatch' });
  if (match.announcement.stealthAddress?.toLowerCase() !== match.stealthAddress.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.scanRecipientInconsistent' });
  const recipient = checkAnnouncement(match.announcement, keys.viewingSecret, keys.spendingPublicKey, { ignoreViewTag: !match.tagMatches });
  if (!recipient.matches || recipient.stealthAddress.toLowerCase() !== match.stealthAddress.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.scanRecipientMismatch' });
  return {
    invoiceDigest: `0x${bytesToHex(invoiceDigest(invoice))}`,
    chainId: invoice.chainId,
    asset,
    amountMinorUnits: expected.toString(),
    invoiceSignerPublicKey: invoice.signer,
    invoiceSignatureValid: true,
    txHash: match.announcement.transactionHash.toLowerCase(),
    stealthAddress: match.stealthAddress.toLowerCase(),
  };
}

// i18n-use: receipt.validation.invoiceLarge receipt.validation.invoiceLink receipt.validation.invoiceSignature receipt.validation.invoiceSignerMismatch receipt.validation.invoiceRecipientMismatch receipt.validation.invoiceExpired receipt.validation.completePayment receipt.validation.invoiceChainMismatch receipt.validation.invoiceAssetMismatch receipt.validation.fixedToken receipt.validation.sellerAmountMismatch receipt.validation.scanRecipientInconsistent receipt.validation.scanRecipientMismatch receipt.error.object receipt.error.plainObject receipt.error.schema receipt.validation.version receipt.validation.digest receipt.validation.chain receipt.validation.txHash receipt.validation.stealthAddress receipt.validation.asset receipt.validation.amount receipt.validation.amountRange receipt.validation.issueTime receipt.validation.signerKey receipt.validation.lowercase receipt.validation.signature receipt.validation.otherInvoice receipt.validation.receiptChainMismatch receipt.validation.receiptAssetMismatch receipt.validation.receiptAmountMismatch receipt.validation.receiptTxMismatch receipt.validation.receiptRecipientMismatch receipt.validation.trustedKey receipt.validation.signerMismatch receipt.validation.fileLarge receipt.validation.malformed receipt.validation.exportInvalid
