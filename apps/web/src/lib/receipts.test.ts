import { canonicalize, invoiceDigest } from '@ghostpay/invoice-schema';
import { buildErc20Metadata, deriveStealthPayment, parseMetadata } from '@ghostpay/core-crypto';
import { grossForNet, routerSplit } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { bindReceiptToInvoice, canonicalReceiptPayload, parseVerifiedReceipt, receiptBindingForInvoice, receiptInvoiceFragment, receiptJson, signReceipt, validateReceiptPayload, verifyReceipt } from './receipts';
import { makeParsed, NOW } from '../test/invoiceFixtures';
import { getSessionPublic, withSessionSecrets } from './session';
import type { ScanMatch } from './scanClient';

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

describe('invoice-bound receipt creation', () => {
  async function fixture(feePolicy: 'payer_pays' | 'seller_pays' = 'payer_pays') {
    const { parsed, fragment, link } = await makeParsed({ feePolicy });
    const payment = deriveStealthPayment(parsed.invoice.metaAddress);
    const wanted = BigInt(parsed.invoice.amountPolicy.mode === 'fixed_token' ? parsed.invoice.amountPolicy.tokenAmount : '0');
    const net = routerSplit(feePolicy === 'payer_pays' ? grossForNet(wanted) : wanted).net;
    const metadata = `0x${bytesToHex(buildErc20Metadata(payment.viewTag, parsed.invoice.token, net))}`;
    const match = {
      chainId: parsed.invoice.chainId, stealthAddress: payment.stealthAddress, viaRouter: true, receipt: 'verified', tagMatches: true,
      announcement: { schemeId: 1n, stealthAddress: payment.stealthAddress, ephemeralPublicKey: `0x${bytesToHex(payment.ephemeralPublicKey)}`, metadata, transactionHash: fields.txHash },
      metadata: parseMetadata(metadata),
    } as unknown as ScanMatch;
    const seller = getSessionPublic()!;
    const bind = (m = match, p = parsed, now = NOW) => withSessionSecrets((s) => receiptBindingForInvoice(p, m, seller.signerPublicKey, s.keys, now));
    return { parsed, fragment, link, match, seller, net, bind };
  }

  it.each(['payer_pays', 'seller_pays'] as const)('matches exact existing %s fee arithmetic, recipient and actual signed digest', async (feePolicy) => {
    const { parsed, match, seller, net, bind } = await fixture(feePolicy);
    const binding = bind();
    expect(binding).toMatchObject({ invoiceDigest: `0x${bytesToHex(invoiceDigest(parsed.invoice))}`, amountMinorUnits: net.toString(), stealthAddress: match.stealthAddress.toLowerCase(), invoiceSignerPublicKey: seller.signerPublicKey });
    const receipt = withSessionSecrets((s) => signReceipt({ ...fields, invoiceDigest: binding.invoiceDigest, chainId: binding.chainId, asset: binding.asset, amountMinorUnits: binding.amountMinorUnits, stealthAddress: match.stealthAddress.toLowerCase() }, s.signingKey));
    expect(bindReceiptToInvoice(receipt, binding).signerMatch).toBe('invoice-signing-key');
  });

  it('accepts only bounded local invoice fragments or HTTP links without following them', async () => {
    const { fragment, link } = await fixture();
    expect(receiptInvoiceFragment(fragment)).toBe(fragment);
    expect(receiptInvoiceFragment(link)).toBe(fragment);
    expect(() => receiptInvoiceFragment(`javascript:alert(1)${fragment}`)).toThrow(/link or fragment/);
    expect(() => receiptInvoiceFragment(`https://name:password@app.test/${fragment}`)).toThrow(/link or fragment/);
    expect(() => receiptInvoiceFragment('x'.repeat(200_000))).toThrow(/too large/);
  });

  it('refuses expired or tampered invoices even if a caller supplies an optimistic verification flag', async () => {
    const { parsed, bind } = await fixture();
    expect(() => bind(undefined, undefined, parsed.invoice.expiresAt)).toThrow(/expired/);
    expect(() => bind(undefined, { ...parsed, invoice: { ...parsed.invoice, chainId: 1 } })).toThrow(/signature/);
    expect(() => bind(undefined, { ...parsed, verification: { signatureValid: false, signerPinned: false } })).toThrow(/signature/);
  });

  it.each(['claimed', 'pending'] as const)('refuses %s scan evidence', async (receipt) => {
    const { bind, match } = await fixture();
    expect(() => bind({ ...match, receipt })).toThrow(/verified router/);
  });

  it('refuses wrong chain, asset, amount, relabeled or unrelated recipient and a different seller', async () => {
    const { bind, match, parsed } = await fixture();
    expect(() => bind({ ...match, chainId: 1 })).toThrow(/chain/);
    expect(() => bind({ ...match, viaRouter: false })).toThrow(/verified router/);
    expect(() => bind({ ...match, metadata: undefined })).toThrow(/verified router/);
    const metadata = match.metadata;
    if (metadata === undefined || metadata.kind !== 'erc20') throw new Error('ERC20 fixture required');
    expect(() => bind({ ...match, metadata: { ...metadata, token: fields.asset as `0x${string}` } })).toThrow(/asset/);
    expect(() => bind({ ...match, metadata: { ...metadata, netAmount: metadata.netAmount + 1n } })).toThrow(/amount/);
    expect(() => bind({ ...match, stealthAddress: fields.stealthAddress as ScanMatch['stealthAddress'] })).toThrow(/recipient/);
    expect(() => bind({ ...match, announcement: { ...match.announcement, ephemeralPublicKey: `0x02${'f'.repeat(64)}` } })).toThrow(/recipient/);
    expect(() => withSessionSecrets((s) => receiptBindingForInvoice(parsed, match, 'different', s.keys, NOW))).toThrow(/signer/);
  });
});
