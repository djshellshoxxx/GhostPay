import { describe, expect, it } from 'vitest';
import { canonicalInvoiceBytes, validateInvoice, type Invoice } from '@ghostpay/invoice-schema';
import { toResult } from './errors.js';
import { CTM_ASSET, CT1_ASSET, NOW, invoiceInput, sampleInvoice } from './fixtures.testutil.js';
import { mapInvoiceAmounts } from './invoice.js';
import { confidentialGrossForNet, confidentialRouterSplit } from './units.js';

const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};

describe('existing invoice compatibility', () => {
  it('uses an unchanged v1 invoice: schema validation and canonical bytes are untouched', () => {
    const inv = sampleInvoice();
    expect(inv.v).toBe(1);
    expect(validateInvoice(JSON.parse(JSON.stringify(inv)))).toEqual(inv);
    const before = canonicalInvoiceBytes(inv);
    mapInvoiceAmounts(inv, CTM_ASSET, NOW);
    expect(canonicalInvoiceBytes(inv)).toEqual(before);
  });

  it('seller_pays: gross is the invoice amount in confidential units, fee comes out of it', () => {
    const m = mapInvoiceAmounts(sampleInvoice(), CTM_ASSET, NOW);
    const expected = confidentialRouterSplit(15_000_000n); // 15 tokens at 6 confidential decimals
    expect(m.amounts.gross.reveal((v) => v)).toBe(expected.gross);
    expect(m.amounts.fee.reveal((v) => v)).toBe(expected.fee);
    expect(m.amounts.net.reveal((v) => v)).toBe(expected.net);
    expect(m.feePolicy).toBe('seller_pays');
    expect(m.invoiceDigest).toMatch(/^keccak256:[0-9a-f]{64}$/);
  });

  it('payer_pays: the seller receives at least the invoice amount', () => {
    const m = mapInvoiceAmounts(sampleInvoice({ feePolicy: 'payer_pays' }), CTM_ASSET, NOW);
    expect(m.amounts.gross.reveal((v) => v)).toBe(confidentialGrossForNet(15_000_000n));
    expect(m.amounts.net.reveal((v) => v)).toBeGreaterThanOrEqual(15_000_000n);
  });

  it('accepts a v2 invoice with a buffer policy (buffer stays a public ETH amount)', () => {
    const inv = sampleInvoice({ bufferPolicy: { accepted: true, minWei: '1', maxWei: '1000000000000000', refund: 'none' } });
    expect(inv.v).toBe(2);
    expect(codeOf(() => mapInvoiceAmounts(inv, CTM_ASSET, NOW))).toBe('ok');
  });

  it.each<[string, Invoice | (() => Invoice), string]>([
    ['fiat-quoted invoice', () => sampleInvoice({ amountPolicy: { mode: 'fiat_quote' } }), 'P13_INVOICE_INCOMPATIBLE'],
    ['native ETH invoice', () => sampleInvoice({ token: 'native' }), 'P13_INVOICE_INCOMPATIBLE'],
    ['another token', () => sampleInvoice({ token: `0x${'99'.repeat(20)}` }), 'P13_INVOICE_INCOMPATIBLE'],
    ['the confidential token itself', () => sampleInvoice({ token: CTM_ASSET.asset.asset }), 'P13_INVOICE_INCOMPATIBLE'],
    ['another network', () => sampleInvoice({ chainId: 11155111 }), 'P13_INVOICE_INCOMPATIBLE'],
    ['expired invoice', () => sampleInvoice({ expiresAt: NOW }), 'P13_INVOICE_INCOMPATIBLE'],
    ['sub-unit remainder (precision)', () => sampleInvoice({ amountPolicy: { mode: 'fixed_token', tokenAmount: '15000000000000000001' } }), 'P13_PRECISION'],
    ['below one confidential unit', () => sampleInvoice({ amountPolicy: { mode: 'fixed_token', tokenAmount: '999999999999' } }), 'P13_PRECISION'],
    ['above euint64', () => sampleInvoice({ amountPolicy: { mode: 'fixed_token', tokenAmount: `${(1n << 64n) * 10n ** 12n}` } }), 'P13_AMOUNT_RANGE'],
    ['payer_pays at the euint64 ceiling', () => sampleInvoice({ feePolicy: 'payer_pays', amountPolicy: { mode: 'fixed_token', tokenAmount: `${((1n << 64n) - 1n) * 10n ** 12n}` } }), 'P13_AMOUNT_RANGE'],
  ])('refuses %s', (_name, make, code) => {
    const inv = typeof make === 'function' ? make() : make;
    expect(codeOf(() => mapInvoiceAmounts(inv, CTM_ASSET, NOW))).toBe(code);
  });

  it('refuses forged invoice objects and invalid clocks', () => {
    const forged = { ...sampleInvoice(), amountPolicy: { mode: 'fixed_token', tokenAmount: '0' } } as Invoice;
    expect(codeOf(() => mapInvoiceAmounts(forged, CTM_ASSET, NOW))).toBe('P13_INVOICE_INCOMPATIBLE');
    expect(codeOf(() => mapInvoiceAmounts({ ...sampleInvoice(), extra: 1 } as Invoice, CTM_ASSET, NOW))).toBe('P13_INVOICE_INCOMPATIBLE');
    expect(codeOf(() => mapInvoiceAmounts(sampleInvoice(), CTM_ASSET, -1))).toBe('P13_INVOICE_INCOMPATIBLE');
    expect(codeOf(() => mapInvoiceAmounts(sampleInvoice(), CTM_ASSET, Number.NaN))).toBe('P13_INVOICE_INCOMPATIBLE');
  });

  it('maps Sepolia invoices to a CT-1 asset with rate 1 (mapping only; preparation stays gated)', () => {
    const inv = sampleInvoice({ chainId: 11155111, token: CT1_ASSET.underlying.asset, amountPolicy: { mode: 'fixed_token', tokenAmount: '2500000' } });
    expect(mapInvoiceAmounts(inv, CT1_ASSET, NOW).amounts.gross.reveal((v) => v)).toBe(2_500_000n);
    expect(invoiceInput().chainId).toBe(31337);
  });
});
