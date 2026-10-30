import { parseFragment } from '@ghostpay/invoice-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoiceLink, computeTotals, tokenChoices, tokenDecimals, type InvoiceForm } from './invoiceCreate';
import { clearSession, generateSession } from './session';

// Records the signing key each invoice was signed with, to check how long that copy stays readable (L1-07).
const signingKeys = vi.hoisted(() => [] as Uint8Array[]);
vi.mock('@ghostpay/invoice-schema', async (original) => {
  const actual = await original<typeof import('@ghostpay/invoice-schema')>();
  return { ...actual, signInvoice: (invoice: Parameters<typeof actual.signInvoice>[0], key: Uint8Array) => { signingKeys.push(key); return actual.signInvoice(invoice, key); } };
});

const NOW = 1_800_000_000;
const FORM: InvoiceForm = {
  chainId: 84532,
  token: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  currency: 'USD',
  lineItems: [
    { description: 'Consulting', quantity: '2', unitPrice: '50.00' },
    { description: 'Café — état', quantity: '1', unitPrice: '20.50' },
  ],
  taxRatePercent: '5',
  feePolicy: 'seller_pays',
  amountMode: 'fixed_token',
  tokenAmount: '126.00',
  expiryHours: 24,
  quoteTtlMinutes: 15,
  maxSlippageBps: 50,
  memo: 'Thanks',
  encrypt: false,
};

beforeEach(() => {
  generateSession();
});
afterEach(() => {
  clearSession();
});

describe('buildInvoiceLink', () => {
  it('builds a signed link that parses back with a valid, unpinned signature', async () => {
    const c = await buildInvoiceLink(FORM, 'https://app.test/', NOW);
    expect(c.link.startsWith('https://app.test/#gpi=v1.')).toBe(true);
    const parsed = await parseFragment(c.fragment);
    expect(parsed.verification).toEqual({ signatureValid: true, signerPinned: false });
    expect(parsed.invoice.fiat).toEqual({ currency: 'USD', minorUnits: '12653' });
    expect(parsed.invoice.tax).toEqual({ rateBps: 500, minorUnits: '603' });
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '126000000' });
    expect(parsed.encrypted).toBe(false);
  });

  it('can encrypt the private part', async () => {
    const c = await buildInvoiceLink({ ...FORM, encrypt: true }, 'https://app.test/', NOW);
    expect(c.encrypted).toBe(true);
    const parsed = await parseFragment(c.fragment);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.invoice.lineItems[0]?.description).toBe('Consulting');
  });

  it('supports native and fiat-quote invoices', async () => {
    const native = await buildInvoiceLink({ ...FORM, token: 'native', tokenAmount: '0.01' }, 'https://a/', NOW);
    expect(native.invoice.token).toBe('native');
    expect(native.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '10000000000000000' });
    const fiat = await buildInvoiceLink({ ...FORM, amountMode: 'fiat_quote' }, 'https://a/', NOW);
    expect(fiat.invoice.amountPolicy).toEqual({ mode: 'fiat_quote' });
    expect(fiat.invoice.quote.source).toBe('chainlink:usdc-usd');
    const fiatNative = await buildInvoiceLink({ ...FORM, token: 'native', amountMode: 'fiat_quote' }, 'https://a/', NOW);
    expect(fiatNative.invoice.quote.source).toBe('chainlink:eth-usd');
  });

  it('omits an empty memo', async () => {
    const c = await buildInvoiceLink({ ...FORM, memo: '   ' }, 'https://a/', NOW);
    expect(c.invoice.memo).toBeUndefined();
  });

  it('validates every input', async () => {
    const bad = (patch: Partial<InvoiceForm>): Promise<unknown> => buildInvoiceLink({ ...FORM, ...patch }, 'https://a/', NOW);
    await expect(bad({ chainId: 999 })).rejects.toThrow(/Unknown chain/);
    await expect(bad({ currency: 'usd' })).rejects.toThrow(/ISO/);
    await expect(bad({ lineItems: [{ description: 'x', quantity: '1', unitPrice: '1.234' }] })).rejects.toThrow(/Line 1: price/);
    await expect(bad({ lineItems: [{ description: 'x', quantity: '0', unitPrice: '1' }] })).rejects.toThrow(/quantity/);
    await expect(bad({ taxRatePercent: 'abc' })).rejects.toThrow(/Tax rate/);
    await expect(bad({ taxRatePercent: '101' })).rejects.toThrow(/Tax rate/);
    await expect(bad({ tokenAmount: '' })).rejects.toThrow(/positive token amount/);
    await expect(bad({ tokenAmount: '0' })).rejects.toThrow(/positive token amount/);
    await expect(bad({ tokenAmount: '1.1234567' })).rejects.toThrow(/positive token amount/);
    await expect(bad({ token: '0x0000000000000000000000000000000000000001' })).rejects.toThrow(/allowlist/);
    await expect(bad({ amountMode: 'fiat_quote', lineItems: [] })).rejects.toThrow(/line item/);
    await expect(bad({ expiryHours: 0 })).rejects.toThrow(/Expiry/);
    await expect(bad({ quoteTtlMinutes: 0 })).rejects.toThrow(/Quote validity/);
    await expect(bad({ maxSlippageBps: 10_001 })).rejects.toThrow(/Slippage/);
    await expect(bad({ lineItems: [{ description: '', quantity: '1', unitPrice: '1' }] })).rejects.toThrow();
  });

  it('refuses without keys', async () => {
    clearSession();
    await expect(buildInvoiceLink(FORM, 'https://a/', NOW)).rejects.toThrow(/Load or generate/);
  });

  it('L1-07: borrows only a temporary signing key, wiped before the link is returned', async () => {
    signingKeys.length = 0;
    const c = await buildInvoiceLink(FORM, 'https://a/', NOW);
    expect((await parseFragment(c.fragment)).verification.signatureValid).toBe(true);
    expect(signingKeys).toHaveLength(1);
    expect(signingKeys[0]?.every((b) => b === 0)).toBe(true);
  });

  it('treats an empty tax rate as zero and handles zero-decimal currencies', async () => {
    const c = await buildInvoiceLink({ ...FORM, currency: 'JPY', taxRatePercent: '', lineItems: [{ description: 'x', quantity: '3', unitPrice: '500' }] }, 'https://a/', NOW);
    expect(c.invoice.fiat).toEqual({ currency: 'JPY', minorUnits: '1500' });
  });
});

describe('helpers', () => {
  it('computes totals with an optional exact tax', () => {
    const items = [{ description: 'a', quantity: '3', unitMinorUnits: '1000' }];
    expect(computeTotals(items, 1000)).toEqual({ subtotal: 3000n, tax: 300n, total: 3300n });
    expect(computeTotals(items, 1000, 7n)).toEqual({ subtotal: 3000n, tax: 7n, total: 3007n });
  });
  it('lists native plus allowlisted tokens', () => {
    const c = tokenChoices(84532);
    expect(c[0]).toEqual({ value: 'native', label: 'ETH' });
    expect(c.some((t) => t.label === 'USDC')).toBe(true);
    expect(tokenChoices(999)[0]?.label).toBe('native');
    expect(tokenDecimals(84532, 'native')).toBe(18);
    expect(tokenDecimals(84532, '0x036cbd53842c5426634e7929541ec2318f3dcf7e')).toBe(6);
    expect(() => tokenDecimals(84532, '0x0000000000000000000000000000000000000001')).toThrow(/allowlist/);
  });
});
