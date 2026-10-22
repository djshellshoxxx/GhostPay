import { describe, expect, it } from 'vitest';
import { buildInvoice, encodeInvoiceLink, invoiceBuilder, parseInvoiceLink, signInvoiceWith } from './builder.js';
import { SdkInputError, SdkInvoiceError } from './errors.js';
import { SIGNER, SIGNING_KEY, input, key, testRng } from './fixtures.testutil.js';

describe('builder', () => {
  it('builds, signs, links and parses back identically (plain and encrypted)', async () => {
    const inv = buildInvoice(input(), testRng());
    expect(inv.nonce).toMatch(/^[0-9a-f]{32}$/);
    const signed = signInvoiceWith(inv, SIGNING_KEY);
    for (const encrypt of [false, true]) {
      const link = await encodeInvoiceLink(signed, { baseUrl: 'https://pay.example.test/p', encrypt, rng: testRng() });
      expect(link.startsWith('https://pay.example.test/p#gpi=v1.')).toBe(true);
      const parsed = await parseInvoiceLink(link, { pinnedSigners: [SIGNER] });
      expect(parsed.invoice).toEqual(inv);
      expect(parsed.trust).toBe('trusted-seller');
      expect(parsed.encrypted).toBe(encrypt);
    }
  });
  it('bare fragment when no baseUrl, and bare fragment parses', async () => {
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    const frag = await encodeInvoiceLink(signed);
    expect(frag.startsWith('#gpi=v1.')).toBe(true);
    expect((await parseInvoiceLink(frag)).trust).toBe('valid-signature');
  });
  it('schema violations surface as SdkInvoiceError with a path and no input echo', () => {
    const bad = input({ fiat: { currency: 'usd', minorUnits: '12.5' } });
    try {
      buildInvoice(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SdkInvoiceError);
      const err = e as SdkInvoiceError;
      expect(err.invoiceCode).toBe('SCHEMA');
      expect(err.path).toBe('fiat.currency');
      expect(err.message).not.toContain('usd');
    }
    expect(() => buildInvoice(input({ expiresAt: -1 }))).toThrow(SdkInvoiceError);
    expect(() => buildInvoice(input({ fiat: { currency: 'USD', minorUnits: '1.5' } }))).toThrow(SdkInvoiceError);
  });
  it('signing with the wrong key fails typed', () => {
    const inv = buildInvoice(input(), testRng());
    expect(() => signInvoiceWith(inv, key(8))).toThrow(SdkInvoiceError);
    expect(() => signInvoiceWith(inv, new Uint8Array(5))).toThrow(SdkInvoiceError);
  });
  it('rejects unsafe baseUrl values', async () => {
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    for (const baseUrl of ['not a url', 'javascript:alert(1)', 'ftp://x.test', 'https://u:p@x.test/', 'https://x.test/?a=1', 'https://x.test/#h'])
      await expect(encodeInvoiceLink(signed, { baseUrl })).rejects.toBeInstanceOf(SdkInputError);
  });
  it('refuses to link an invalid signature', async () => {
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    const bad = { ...signed, signature: '0'.repeat(128) };
    await expect(encodeInvoiceLink(bad)).rejects.toBeInstanceOf(SdkInvoiceError);
  });
  it('parseInvoiceLink input errors', async () => {
    await expect(parseInvoiceLink('https://x.test/no-fragment')).rejects.toBeInstanceOf(SdkInputError);
    await expect(parseInvoiceLink('https://x.test/#other=1')).rejects.toBeInstanceOf(SdkInputError);
    await expect(parseInvoiceLink(42 as unknown as string)).rejects.toBeInstanceOf(SdkInputError);
    await expect(parseInvoiceLink('#gpi=v1.@@@')).rejects.toBeInstanceOf(SdkInvoiceError);
  });
  it('immutable invoiceBuilder', () => {
    const base = invoiceBuilder(input());
    const other = base.with({ memo: 'Other' });
    expect(base.build(testRng()).memo).toBe('Ref #42');
    expect(other.build(testRng()).memo).toBe('Other');
    expect(() => invoiceBuilder().build()).toThrow(SdkInvoiceError);
  });
});
