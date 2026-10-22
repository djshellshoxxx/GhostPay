import { canonicalize } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { bindReceiptToInvoice, canonicalReceiptPayload, parseVerifiedReceipt, receiptJson, signReceipt, validateReceiptPayload, verifyReceipt } from './receipts';

const KEY = new Uint8Array(32).fill(7);
const fields = {
  invoiceDigest: `0x${'a'.repeat(64)}`,
  chainId: 84532,
  txHash: `0x${'b'.repeat(64)}`,
  stealthAddress: `0x${'c'.repeat(40)}`,
  asset: `0x${'d'.repeat(40)}`,
  amountMinorUnits: '2500000000000000000',
  issuedAt: 1_800_000_000,
};

describe('seller-signed receipts', () => {
  it('signs domain-separated canonical payload bytes and round-trips deterministic JSON', () => {
    const signed = signReceipt(fields, KEY);
    expect(verifyReceipt(signed)).toBe(true);
    expect(parseVerifiedReceipt(receiptJson(signed))).toEqual(signed);
    expect(canonicalReceiptPayload({ ...fields, signerPublicKey: signed.signerPublicKey, version: 1 })).toBe(canonicalize({ ...fields, signerPublicKey: signed.signerPublicKey, version: 1 }));
    expect(receiptJson(signed)).toBe(receiptJson(signReceipt({ ...fields }, KEY)));
  });

  it('rejects changed fields, signatures, unknown fields, and invalid schemas', () => {
    const signed = signReceipt(fields, KEY);
    expect(verifyReceipt({ ...signed, amountMinorUnits: '2500000000000000001' })).toBe(false);
    expect(verifyReceipt({ ...signed, signature: `${'0'.repeat(128)}` })).toBe(false);
    expect(verifyReceipt({ ...signed, extra: true })).toBe(false);
    expect(verifyReceipt({ ...signed, amountMinorUnits: 25 })).toBe(false);
    expect(verifyReceipt({ ...signed, chainId: 1.5 })).toBe(false);
    expect(() => validateReceiptPayload({ ...fields, version: 1, amountMinorUnits: '01', signerPublicKey: signed.signerPublicKey })).toThrow(/positive decimal integer/);
    expect(verifyReceipt({ ...signed, version: 2 })).toBe(false);
    expect(verifyReceipt(Object.fromEntries(Object.entries(signed).filter(([key]) => key !== 'version')))).toBe(false);
    expect(() => validateReceiptPayload({ ...fields, version: 1, amountMinorUnits: ((1n << 256n)).toString(), signerPublicKey: signed.signerPublicKey })).toThrow(/exceeds/);
    expect(() => parseVerifiedReceipt(JSON.stringify({ ...signed, txHash: `0x${'e'.repeat(64)}` }))).toThrow(/signature is invalid/);
    expect(() => parseVerifiedReceipt(' '.repeat(65_537))).toThrow(/64 KiB/);
  });

  it('uses the native asset marker and requires lowercase canonical addresses', () => {
    const receipt = signReceipt({ ...fields, asset: 'native' }, KEY);
    expect(verifyReceipt(receipt)).toBe(true);
    expect(() => validateReceiptPayload({ ...fields, version: 1, signerPublicKey: receipt.signerPublicKey, asset: 'native', stealthAddress: `0x${'C'.repeat(40)}` })).toThrow(/stealth address is invalid/);
  });

  it('binds a valid seller attestation to the exact invoice facts and optional payer transaction', () => {
    const signed = signReceipt(fields, KEY);
    const binding = {
      invoiceDigest: fields.invoiceDigest,
      chainId: fields.chainId,
      asset: fields.asset,
      amountMinorUnits: fields.amountMinorUnits,
      invoiceSignerPublicKey: signed.signerPublicKey,
      invoiceSignatureValid: true,
      txHash: fields.txHash,
      stealthAddress: fields.stealthAddress,
    };
    expect(bindReceiptToInvoice(signed, binding).signerMatch).toBe('invoice-signing-key');
    expect(() => bindReceiptToInvoice(signed, { ...binding, invoiceDigest: `0x${'e'.repeat(64)}` })).toThrow(/different invoice/);
    expect(() => bindReceiptToInvoice(signed, { ...binding, chainId: 1 })).toThrow(/chain does not match/);
    expect(() => bindReceiptToInvoice(signed, { ...binding, asset: 'native' })).toThrow(/asset does not match/);
    expect(() => bindReceiptToInvoice(signed, { ...binding, amountMinorUnits: '1' })).toThrow(/amount does not match/);
    expect(() => bindReceiptToInvoice(signed, { ...binding, txHash: `0x${'e'.repeat(64)}` })).toThrow(/transaction hash/);
    expect(() => bindReceiptToInvoice(signed, { ...binding, stealthAddress: `0x${'e'.repeat(40)}` })).toThrow(/recipient/);
    expect(() => bindReceiptToInvoice(signed, { ...binding, invoiceSignatureValid: false })).toThrow(/not the valid invoice signer/);
    expect(bindReceiptToInvoice(signed, { ...binding, invoiceSignatureValid: false, trustedSignerPublicKey: signed.signerPublicKey }).signerMatch).toBe('explicitly-trusted-key');
  });
});
