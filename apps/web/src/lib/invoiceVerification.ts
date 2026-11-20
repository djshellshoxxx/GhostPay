import { InvoiceError, type ParsedInvoice } from '@ghostpay/invoice-schema';
import type { MessageKey } from '../i18n/catalog';

export type InvoiceVerificationStatus = 'checking' | 'valid-pinned' | 'valid-unpinned' | 'pin-mismatch'
  | 'invalid-signature' | 'missing-signature' | 'unsupported-format' | 'malformed-invoice' | 'unavailable';

export const INVOICE_VERIFICATION_MESSAGES: Readonly<Record<InvoiceVerificationStatus, MessageKey>> = {
  checking: 'pay.signer.status.checking',
  'valid-pinned': 'pay.signer.status.pinned',
  'valid-unpinned': 'pay.signer.status.unpinned',
  'pin-mismatch': 'pay.signer.status.mismatch',
  'invalid-signature': 'pay.signer.status.invalid',
  'missing-signature': 'pay.signer.status.missing',
  'unsupported-format': 'pay.signer.status.unsupported',
  'malformed-invoice': 'pay.signer.status.malformed',
  unavailable: 'pay.signer.status.unavailable',
};

/** Diagnostics are fixed classifications, never exception text or unauthenticated invoice fields. */
export function invoiceVerificationFailure(error: unknown): InvoiceVerificationStatus {
  if (!(error instanceof InvoiceError)) return 'unavailable';
  switch (error.code) {
    case 'MISSING_SIGNATURE': return 'missing-signature';
    case 'INVALID_SIGNATURE': return 'invalid-signature';
    case 'UNTRUSTED_SIGNER': return 'pin-mismatch';
    case 'UNSUPPORTED': return 'unsupported-format';
    case 'VERIFICATION_UNAVAILABLE':
    case 'PASSPHRASE_REQUIRED':
    case 'PASSPHRASE': return 'unavailable';
    case 'SCHEMA': return error.path === 'sig' ? 'invalid-signature' : 'malformed-invoice';
    default: return 'malformed-invoice';
  }
}

/** A rejected paste can still name a well-formed future version, in a bare fragment or a full link. */
export function unrecognizedInvoiceFragmentStatus(input: string): InvoiceVerificationStatus {
  const version = /#gpi=v([1-9][0-9]*)\.[A-Za-z0-9_-]+$/.exec(input.trim())?.[1];
  return version !== undefined && version !== '1' ? 'unsupported-format' : 'malformed-invoice';
}

/** undefined means no identity was selected; an empty key means a selected pin is no longer available. */
export function invoiceVerificationStatus(parsed: ParsedInvoice, requiredSigner?: string): InvoiceVerificationStatus {
  if (!parsed.verification.signatureValid) return 'invalid-signature';
  if (requiredSigner === '') return 'unavailable';
  if (requiredSigner !== undefined) return parsed.invoice.signer === requiredSigner ? 'valid-pinned' : 'pin-mismatch';
  return parsed.verification.signerPinned ? 'valid-pinned' : 'valid-unpinned';
}

// i18n-use: pay.signer.status.checking pay.signer.status.pinned pay.signer.status.unpinned pay.signer.status.mismatch pay.signer.status.invalid pay.signer.status.missing pay.signer.status.unsupported pay.signer.status.malformed pay.signer.status.unavailable
