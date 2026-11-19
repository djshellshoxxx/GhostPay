import { describe, expect, it } from 'vitest';
import { InvoiceError, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { invoiceVerificationFailure, invoiceVerificationStatus, unrecognizedInvoiceFragmentStatus } from './invoiceVerification';

const parsed = (valid: boolean, pinned: boolean): ParsedInvoice => ({
  invoice: { signer: 'selected-key' } as ParsedInvoice['invoice'],
  signature: '', encrypted: false, passphraseProtected: false,
  verification: { signatureValid: valid, signerPinned: pinned },
  trust: pinned ? 'trusted-seller' : valid ? 'valid-signature' : 'invalid-signature',
});

describe('invoice verification outcomes', () => {
  it('does not upgrade an invalid signature even if other trust flags or selected keys match', () => {
    expect(invoiceVerificationStatus(parsed(false, true), 'selected-key')).toBe('invalid-signature');
    expect(invoiceVerificationStatus(parsed(false, true))).toBe('invalid-signature');
  });
  it('distinguishes a valid signature without a pin, an exact pin, and an unavailable selected pin', () => {
    expect(invoiceVerificationStatus(parsed(true, false))).toBe('valid-unpinned');
    expect(invoiceVerificationStatus(parsed(true, false), 'selected-key')).toBe('valid-pinned');
    expect(invoiceVerificationStatus(parsed(true, false), '')).toBe('unavailable');
    expect(invoiceVerificationStatus(parsed(true, true))).toBe('valid-pinned');
  });
  it('does not accept another saved key when a specific identity has been selected', () => {
    expect(invoiceVerificationStatus(parsed(true, true), 'other-selected-key')).toBe('pin-mismatch');
  });
  it.each([
    ['MISSING_SIGNATURE', undefined, 'missing-signature'],
    ['INVALID_SIGNATURE', undefined, 'invalid-signature'],
    ['UNTRUSTED_SIGNER', undefined, 'pin-mismatch'],
    ['UNSUPPORTED', undefined, 'unsupported-format'],
    ['VERIFICATION_UNAVAILABLE', undefined, 'unavailable'],
    ['PASSPHRASE_REQUIRED', undefined, 'unavailable'],
    ['PASSPHRASE', undefined, 'unavailable'],
    ['SCHEMA', 'sig', 'invalid-signature'],
    ['SCHEMA', 'signer', 'malformed-invoice'],
    ['JSON', undefined, 'malformed-invoice'],
    ['NON_CANONICAL', undefined, 'malformed-invoice'],
  ] as const)('classifies %s without exposing exception details', (code, path, outcome) => {
    expect(invoiceVerificationFailure(new InvoiceError(code, 'secret-bearing diagnostic', path))).toBe(outcome);
  });
  it('treats an unknown or interrupted error as unavailable, never trusted', () => {
    expect(invoiceVerificationFailure(new Error('secret input'))).toBe('unavailable');
    expect(invoiceVerificationFailure(undefined)).toBe('unavailable');
  });
  it.each([
    ['#gpi=v1.ab cd', 'malformed-invoice'],
    ['#gpi=v2.abc', 'unsupported-format'],
    ['https://example.test/#gpi=v2.abc', 'unsupported-format'],
    ['#gpi=v0.abc', 'malformed-invoice'],
    ['not an invoice', 'malformed-invoice'],
  ] as const)('classifies rejected pasted fragment %s consistently', (input, expected) => {
    expect(unrecognizedInvoiceFragmentStatus(input)).toBe(expected);
  });
});
