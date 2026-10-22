import { canonicalize } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { canonicalReceiptPayload, parseVerifiedReceipt, receiptJson, signReceipt, validateReceiptPayload, verifyReceipt } from './receipts';

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
  });

  it('uses the native asset marker and requires lowercase canonical addresses', () => {
    const receipt = signReceipt({ ...fields, asset: 'native' }, KEY);
    expect(verifyReceipt(receipt)).toBe(true);
    expect(() => validateReceiptPayload({ ...fields, version: 1, signerPublicKey: receipt.signerPublicKey, asset: 'native', stealthAddress: `0x${'C'.repeat(40)}` })).toThrow(/stealth address is invalid/);
  });
});
