import { openFragment, parseFragment, type Invoice, type RandomSource } from '@ghostpay/invoice-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildInvoiceLink, type InvoiceForm } from './invoiceCreate';
import { clearSession, generateSession } from './session';
import { BASE_FORM, NOW } from '../test/invoiceFixtures';

const DESCRIPTION = 'Private client project';
const MEMO = 'Merchant account reference 4832';
const FORM: InvoiceForm = {
  ...BASE_FORM,
  lineItems: [
    { description: DESCRIPTION, quantity: '2', unitPrice: '12.50' },
    { description: 'Second private item', quantity: '3', unitPrice: '7.25' },
  ],
  memo: MEMO,
  taxRatePercent: '5',
};

/** Test-only source: a stable nonce makes required-field comparisons exact. */
function rng(): RandomSource {
  let next = 1;
  return { getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (array !== null) {
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < view.length; i++) view[i] = next++ % 256;
    }
    return array;
  } };
}

function requiredFields(invoice: Invoice): Omit<Invoice, 'lineItems' | 'memo'> {
  const { lineItems, memo, ...required } = invoice;
  void lineItems; void memo;
  return required;
}

beforeEach(() => { generateSession(); });
afterEach(() => { clearSession(); });

describe('required v1.1 invoice metadata minimization', () => {
  it.each([false, true])('removes descriptive metadata before signing (encrypted: %s), preserving all required fields', async (encrypt) => {
    const standard = await buildInvoiceLink({ ...FORM, encrypt }, 'https://app.test/', NOW, rng());
    const minimalForm = { ...FORM, encrypt, metadataMode: 'minimal' as const };
    const minimal = await buildInvoiceLink(minimalForm, 'https://app.test/', NOW, rng());
    const parsed = await parseFragment(minimal.fragment);
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.invoice).toEqual(minimal.invoice);
    expect(parsed.encrypted).toBe(encrypt);
    expect(parsed.invoice.lineItems).toEqual(FORM.lineItems.map((item, index) => ({
      description: 'Item', quantity: item.quantity, unitMinorUnits: index === 0 ? '1250' : '725',
    })));
    expect(Object.hasOwn(parsed.invoice, 'memo')).toBe(false);
    expect(requiredFields(minimal.invoice)).toEqual(requiredFields(standard.invoice));
    expect(FORM.lineItems[0]?.description).toBe(DESCRIPTION);
    expect(FORM.memo).toBe(MEMO);
    expect(JSON.stringify(parsed.invoice)).not.toContain(DESCRIPTION);
    expect(JSON.stringify(parsed.invoice)).not.toContain(MEMO);
  });

  it('keeps the ordinary default byte-identical to explicit standard mode for a fixed nonce', async () => {
    const implicit = await buildInvoiceLink(FORM, 'https://app.test/', NOW, rng());
    const explicitForm = { ...FORM, metadataMode: 'standard' as const };
    const explicit = await buildInvoiceLink(explicitForm, 'https://app.test/', NOW, rng());
    expect(explicit.fragment).toBe(implicit.fragment);
    expect(explicit.invoice.memo).toBe(MEMO);
    expect(explicit.invoice.lineItems[0]?.description).toBe(DESCRIPTION);
  });

  it('keeps exact template expiry and gas-buffer policy while minimizing an unsigned v2 invoice', async () => {
    const form = { ...FORM, expirySeconds: 1800, bufferPolicy: { accepted: true, minWei: '100', maxWei: '200', refund: 'none' as const } };
    const standard = await buildInvoiceLink(form, 'https://app.test/', NOW, rng());
    const minimalForm = { ...form, metadataMode: 'minimal' as const };
    const minimal = await buildInvoiceLink(minimalForm, 'https://app.test/', NOW, rng());
    expect(minimal.invoice.v).toBe(2);
    expect(requiredFields(minimal.invoice)).toEqual(requiredFields(standard.invoice));
    expect(minimal.invoice.expiresAt).toBe(NOW + 1800);
    expect((await parseFragment(minimal.fragment)).verification.signatureValid).toBe(true);
    expect(minimal.invoice.lineItems.every((item) => item.description === 'Item')).toBe(true);
    expect(Object.hasOwn(minimal.invoice, 'memo')).toBe(false);
  });

  it.each(['unknown', '', null, false, 1, {}])('rejects an unsupported runtime metadata mode without reflecting its value', async (metadataMode) => {
    const form = { ...FORM, metadataMode } as InvoiceForm;
    await expect(buildInvoiceLink(form, 'https://app.test/', NOW)).rejects.toThrow('Choose a supported invoice metadata mode.');
  });

  it('does not bypass required quantity validation when descriptions are omitted', async () => {
    const form = { ...FORM, metadataMode: 'minimal' as const, lineItems: [{ description: DESCRIPTION, quantity: '0', unitPrice: '1' }] };
    await expect(buildInvoiceLink(form, 'https://app.test/', NOW)).rejects.toThrow(/quantity/);
  });

  it('still protects the complete minimized invoice with an out-of-band passphrase', async () => {
    const passphrase = 'cedar orbit velvet lantern meadow';
    const form = { ...FORM, metadataMode: 'minimal' as const, passphrase, encrypt: false };
    const created = await buildInvoiceLink(form, 'https://app.test/', NOW);
    expect(created.encrypted).toBe(true);
    expect(created.passphraseProtected).toBe(true);
    expect((await openFragment(created.fragment)).status).toBe('needsPassphrase');
    const opened = await openFragment(created.fragment, { passphrase });
    expect(opened.status).toBe('ok');
    if (opened.status !== 'ok') throw new Error('Expected the correct passphrase to open this invoice.');
    expect(opened.parsed.verification.signatureValid).toBe(true);
    expect(Object.hasOwn(opened.parsed.invoice, 'memo')).toBe(false);
    expect(opened.parsed.invoice.lineItems.every((item) => item.description === 'Item')).toBe(true);
  }, 300_000);
});
