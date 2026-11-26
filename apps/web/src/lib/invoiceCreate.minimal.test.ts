import {
  canonicalize, decodeBase64Url, encodeBase64Url, encodeFragment, FRAGMENT_PREFIX,
  InvalidSignatureError, NonCanonicalError, parseFragment, SchemaError, WrongPassphraseError, type EncodeOptions, type SignedInvoice,
} from '@ghostpay/invoice-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_FORM, NOW } from '../test/invoiceFixtures';
import { buildInvoiceLink } from './invoiceCreate';
import { receiptInvoiceFragment } from './receipts';
import { clearSession, generateSession } from './session';

// Exercise real encryption and signature verification at the lowest supported test KDF cost.
vi.mock('@ghostpay/invoice-schema', async (original) => {
  const schema = await original<typeof import('@ghostpay/invoice-schema')>();
  return {
    ...schema,
    encodeFragment: (signed: SignedInvoice, options: EncodeOptions = {}) => schema.encodeFragment(signed,
      options.passphrase === undefined ? options : { ...options, scryptN: 1 << 15 }),
  };
});

const base = 'https://app.test/GhostPay/';
const form = {
  ...BASE_FORM,
  lineItems: [{ description: 'Merchant A / order 123', quantity: '3', unitPrice: '7.50' }],
  memo: 'Private note 456', taxRatePercent: '5', tokenAmount: '23.63',
};
const passphrase = 'Synthetic invoice passphrase only';
const wrap = (json: string): string => FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(json));

beforeEach(() => { generateSession(); });
afterEach(() => { clearSession(); });

describe('signed invoice sharing', () => {
  for (const minimalMetadata of [false, true]) {
    for (const protection of ['plain', 'bearer', 'passphrase'] as const) {
      it(`round trips ${minimalMetadata ? 'minimal' : 'itemized'} metadata in the ${protection} envelope`, async () => {
        const secret = protection === 'passphrase' ? { passphrase } : {};
        const issued = await buildInvoiceLink({ ...form, minimalMetadata, encrypt: protection === 'bearer', ...secret }, base, NOW);
        const opts = { pinnedSigners: [issued.invoice.signer], requirePinnedSigner: true, ...secret };
        const parsed = await parseFragment(receiptInvoiceFragment(issued.link), opts);
        expect(parsed.trust).toBe('trusted-seller');
        expect(parsed.invoice).toEqual(issued.invoice);
        expect(parsed.encrypted).toBe(protection !== 'plain');
        expect(parsed.passphraseProtected).toBe(protection === 'passphrase');
        expect(parsed.invoice.fiat).toEqual({ currency: 'USD', minorUnits: '2363' });
        expect(parsed.invoice.tax).toEqual({ rateBps: 500, minorUnits: '113' });
        expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '23630000' });
        if (minimalMetadata) {
          expect(parsed.invoice.lineItems).toEqual([]);
          expect(parsed.invoice).not.toHaveProperty('memo');
          expect(canonicalize(parsed.invoice)).not.toMatch(/Merchant A|order 123|Private note 456/);
        } else {
          expect(parsed.invoice.lineItems).toEqual([{ description: form.lineItems[0]!.description, quantity: '3', unitMinorUnits: '750' }]);
          expect(parsed.invoice.memo).toBe(form.memo);
        }
        if (protection === 'plain') {
          expect(await encodeFragment(parsed, { encrypt: false })).toBe(issued.fragment);
        }
        if (protection === 'passphrase' && minimalMetadata) {
          await expect(parseFragment(issued.fragment, { passphrase: 'Different test passphrase' })).rejects.toBeInstanceOf(WrongPassphraseError);
        }
      });
    }

    it(`rejects changed payment terms, missing keys and noncanonical ${minimalMetadata ? 'minimal' : 'itemized'} exports`, async () => {
      const issued = await buildInvoiceLink({ ...form, minimalMetadata }, base, NOW);
      const original = await parseFragment(issued.fragment);
      const envelope = { alg: 'none', inv: original.invoice, sig: original.signature };
      const canonical = canonicalize(envelope);
      expect(new TextDecoder().decode(decodeBase64Url(issued.fragment.slice(FRAGMENT_PREFIX.length)))).toBe(canonical);
      const tampered = wrap(canonicalize({ ...envelope, inv: { ...original.invoice, expiresAt: original.invoice.expiresAt + 1 } }));
      const pins = { pinnedSigners: [original.invoice.signer] };
      expect((await parseFragment(tampered, pins)).trust).toBe('invalid-signature');
      await expect(parseFragment(tampered, { ...pins, requirePinnedSigner: true })).rejects.toBeInstanceOf(InvalidSignatureError);
      const withoutRequiredArray: Record<string, unknown> = { ...original.invoice };
      delete withoutRequiredArray['lineItems'];
      await expect(parseFragment(wrap(canonicalize({ ...envelope, inv: withoutRequiredArray })))).rejects.toBeInstanceOf(SchemaError);
      await expect(parseFragment(wrap(' ' + canonical))).rejects.toBeInstanceOf(NonCanonicalError);
    });
  }

  it('preserves every required v2 fiat-quote field when omitting identifying text', async () => {
    const terms = { ...form, amountMode: 'fiat_quote' as const, bufferPolicy: { accepted: true, minWei: '1', maxWei: '10', refund: 'none' as const } };
    const normal = await buildInvoiceLink(terms, base, NOW);
    const minimal = await buildInvoiceLink({ ...terms, minimalMetadata: true }, base, NOW);
    const required: Record<string, unknown> = { ...normal.invoice };
    delete required['memo'];
    expect(minimal.invoice.nonce).not.toBe(normal.invoice.nonce);
    expect(minimal.invoice).toEqual({ ...required, lineItems: [], nonce: minimal.invoice.nonce });
    expect((await parseFragment(minimal.fragment)).verification.signatureValid).toBe(true);
  });

  it('allows the fixed token amount on its own and still validates entered prices and quantities', async () => {
    const empty = { description: '', quantity: '1', unitPrice: '' };
    const build = (lineItems: typeof empty[]) => buildInvoiceLink({ ...form, minimalMetadata: true, lineItems }, base, NOW);
    expect((await build([empty])).invoice.fiat.minorUnits).toBe('0');
    expect((await build([{ ...empty, description: 'Discarded draft name' }])).invoice.fiat.minorUnits).toBe('0');
    expect((await build([{ ...empty, unitPrice: '7.50' }])).invoice.fiat.minorUnits).toBe('788');
    await expect(build([{ ...empty, unitPrice: 'x' }])).rejects.toThrow();
    await expect(build([{ ...empty, quantity: '0', unitPrice: '7.50' }])).rejects.toThrow();
    await expect(build(Array.from({ length: 51 }, () => ({ ...empty, unitPrice: '1' })))).rejects.toThrow();
    await expect(buildInvoiceLink({ ...form, minimalMetadata: true, amountMode: 'fiat_quote', lineItems: [] }, base, NOW)).rejects.toThrow();
  });
});
