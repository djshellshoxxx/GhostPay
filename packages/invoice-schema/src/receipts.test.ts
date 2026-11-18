import { describe, expect, it } from 'vitest';
import { canonicalReceiptPayload, bindReceiptToInvoice, MAX_RECEIPT_JSON_BYTES, parseVerifiedReceipt, receiptDigest, receiptJson, signReceipt, SignedReceiptError, validateReceiptPayload, verifyReceipt, type ReceiptInvoiceBinding, type ReceiptPayload } from './receipts.js';

const KEY = Uint8Array.from([...new Array<number>(31).fill(0), 7]);
const FIELDS = {
  invoiceDigest: `0x${'a'.repeat(64)}`, chainId: 84532, txHash: `0x${'b'.repeat(64)}`,
  stealthAddress: `0x${'c'.repeat(40)}`, asset: 'native', amountMinorUnits: '1000', issuedAt: 1_800_000_000,
};
const PUB = '025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc';
const PAYLOAD: ReceiptPayload = { ...FIELDS, version: 1, signerPublicKey: PUB };
const SIGNATURE = '33c27dbe8230bd04cd9f7e8600beda1988d90cc5d0835311eaeb7a5861f5e9285ad3990d797a9942c58be0505a94cd43ea650f4629569cb098fc61c038085a3b';
const SIGNED = { ...PAYLOAD, signature: SIGNATURE };

describe('shared seller receipt protocol', () => {
  it('matches the fixed protocol signature vector and retains canonical round trips', () => {
    expect(signReceipt(FIELDS, KEY)).toEqual(SIGNED);
    expect(verifyReceipt(SIGNED)).toBe(true);
    expect(parseVerifiedReceipt(receiptJson(SIGNED))).toEqual(SIGNED);
    expect(canonicalReceiptPayload(PAYLOAD)).toBe('{"amountMinorUnits":"1000","asset":"native","chainId":84532,"invoiceDigest":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","issuedAt":1800000000,"signerPublicKey":"025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc","stealthAddress":"0xcccccccccccccccccccccccccccccccccccccccc","txHash":"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","version":1}');
    expect(receiptDigest(PAYLOAD)).toHaveLength(32);
  });

  it.each([null, 1, [], new Date(), Object.create({ inherited: true }) as object, { ...PAYLOAD, extra: true }, { ...PAYLOAD, [Symbol('unknown')]: true }, {}])('rejects non-schema public records', (value) => {
    expect(() => validateReceiptPayload(value)).toThrow(SignedReceiptError);
    expect(verifyReceipt(value)).toBe(false);
  });

  it('accepts a schema-only record with a null prototype', () => {
    expect(validateReceiptPayload(Object.assign(Object.create(null) as Record<string, unknown>, PAYLOAD))).toEqual(PAYLOAD);
  });

  it.each([
    ['version', 2, 'VERSION'], ['invoiceDigest', '0x00', 'DIGEST'], ['invoiceDigest', 2, 'DIGEST'],
    ['chainId', 0, 'CHAIN'], ['chainId', 1.5, 'CHAIN'], ['chainId', Number.NaN, 'CHAIN'],
    ['txHash', 'wrong', 'TX_HASH'], ['txHash', 1, 'TX_HASH'],
    ['stealthAddress', 'wrong', 'STEALTH_ADDRESS'], ['stealthAddress', 1, 'STEALTH_ADDRESS'],
    ['asset', 'ETH', 'ASSET'], ['asset', 1, 'ASSET'],
    ['amountMinorUnits', '01', 'AMOUNT'], ['amountMinorUnits', 1000, 'AMOUNT'],
    ['amountMinorUnits', (1n << 256n).toString(), 'AMOUNT_RANGE'],
    ['issuedAt', 0, 'ISSUE_TIME'], ['issuedAt', 1.5, 'ISSUE_TIME'],
    ['signerPublicKey', 'bad', 'SIGNER_KEY'], ['signerPublicKey', 1, 'SIGNER_KEY'],
  ])('refuses malformed %s with a stable non-secret failure', (field, value, code) => {
    expect(() => validateReceiptPayload({ ...PAYLOAD, [field]: value })).toThrow(expect.objectContaining({ code }));
    expect(verifyReceipt({ ...SIGNED, [field]: value })).toBe(false);
  });

  it('accepts canonical token assets, rejects invalid curve points and never normalizes signed fields', () => {
    expect(validateReceiptPayload({ ...PAYLOAD, asset: `0x${'d'.repeat(40)}` }).asset).toBe(`0x${'d'.repeat(40)}`);
    expect(() => validateReceiptPayload({ ...PAYLOAD, signerPublicKey: `02${'f'.repeat(64)}` })).toThrow();
    expect(verifyReceipt({ ...SIGNED, signerPublicKey: `02${'f'.repeat(64)}` })).toBe(false);
    expect(verifyReceipt({ ...SIGNED, stealthAddress: `0x${'C'.repeat(40)}` })).toBe(false);
  });

  it.each([undefined, 1, '00', '0'.repeat(128), SIGNATURE.toUpperCase()])('rejects malformed or invalid signature %s', (signature) => {
    expect(verifyReceipt({ ...SIGNED, signature })).toBe(false);
  });

  it('detects altered data, unsupported versions, ambiguous JSON and truncated files', () => {
    expect(verifyReceipt({ ...SIGNED, amountMinorUnits: '1001' })).toBe(false);
    expect(() => parseVerifiedReceipt(JSON.stringify({ ...SIGNED, signature: '0'.repeat(128) }))).toThrow(expect.objectContaining({ code: 'MALFORMED' }));
    expect(() => parseVerifiedReceipt('{"version":1,"version":2}')).toThrow();
    expect(() => parseVerifiedReceipt(receiptJson(SIGNED).slice(0, -1))).toThrow();
    expect(() => parseVerifiedReceipt(' '.repeat(MAX_RECEIPT_JSON_BYTES + 1))).toThrow(expect.objectContaining({ code: 'FILE_LARGE' }));
    expect(() => receiptJson({ ...SIGNED, version: 2 } as unknown as typeof SIGNED)).toThrow(expect.objectContaining({ code: 'EXPORT_INVALID' }));
  });
});

describe('receipt field binding is not payment evidence', () => {
  const binding: ReceiptInvoiceBinding = { invoiceDigest: FIELDS.invoiceDigest, chainId: FIELDS.chainId, asset: 'native', amountMinorUnits: '1000', invoiceSignerPublicKey: PUB, invoiceSignatureValid: true };

  it('binds the invoice key or a separately supplied trusted key and optional transaction facts', () => {
    expect(bindReceiptToInvoice(SIGNED, binding).signerMatch).toBe('invoice-signing-key');
    expect(bindReceiptToInvoice(SIGNED, { ...binding, txHash: FIELDS.txHash, stealthAddress: FIELDS.stealthAddress }).receipt).toEqual(SIGNED);
    expect(bindReceiptToInvoice(SIGNED, { ...binding, invoiceSignatureValid: false, trustedSignerPublicKey: ` ${PUB.toUpperCase()} ` }).signerMatch).toBe('explicitly-trusted-key');
  });

  it.each([
    ['invoiceDigest', `0x${'f'.repeat(64)}`, 'OTHER_INVOICE'], ['chainId', 1, 'RECEIPT_CHAIN_MISMATCH'],
    ['asset', `0x${'e'.repeat(40)}`, 'RECEIPT_ASSET_MISMATCH'], ['amountMinorUnits', '1001', 'RECEIPT_AMOUNT_MISMATCH'],
    ['txHash', `0x${'f'.repeat(64)}`, 'RECEIPT_TX_MISMATCH'], ['stealthAddress', `0x${'f'.repeat(40)}`, 'RECEIPT_RECIPIENT_MISMATCH'],
    ['trustedSignerPublicKey', 'bad', 'TRUSTED_KEY'], ['invoiceSignatureValid', false, 'SIGNER_MISMATCH'],
    ['invoiceSignerPublicKey', 'different', 'SIGNER_MISMATCH'],
  ])('refuses mismatched %s', (field, value, code) => {
    expect(() => bindReceiptToInvoice(SIGNED, { ...binding, [field]: value })).toThrow(expect.objectContaining({ code }));
  });

  it('treats an explicitly supplied trusted key as a requirement and never falls back to the invoice key', () => {
    const otherPub = signReceipt(FIELDS, Uint8Array.from([...new Array<number>(31).fill(0), 9])).signerPublicKey;
    expect(otherPub).not.toBe(PUB);
    // The receipt is validly signed by the invoice key, but the payer pinned a different key out of band.
    expect(() => bindReceiptToInvoice(SIGNED, { ...binding, trustedSignerPublicKey: otherPub })).toThrow(expect.objectContaining({ code: 'SIGNER_MISMATCH' }));
    expect(() => bindReceiptToInvoice(SIGNED, { ...binding, invoiceSignatureValid: false, trustedSignerPublicKey: otherPub })).toThrow(expect.objectContaining({ code: 'SIGNER_MISMATCH' }));
    // A matching pin is reported as the explicitly trusted key whether or not the invoice key also matches.
    expect(bindReceiptToInvoice(SIGNED, { ...binding, trustedSignerPublicKey: PUB }).signerMatch).toBe('explicitly-trusted-key');
  });

  it('requires a valid receipt signature before checking any binding', () => {
    expect(() => bindReceiptToInvoice({ ...SIGNED, signature: '0'.repeat(128) }, binding)).toThrow(expect.objectContaining({ code: 'SIGNATURE' }));
  });
});
