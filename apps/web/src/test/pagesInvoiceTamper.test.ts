import { canonicalize, decodeBase64Url, encodeBase64Url, FRAGMENT_PREFIX, parseFragment } from '@ghostpay/invoice-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { tamperInvoiceLink } from '../../e2e/devnet/invoiceTamper';
import { clearSession } from '../lib/session';
import { makeParsed } from './invoiceFixtures';

afterEach(() => { clearSession(); });

function envelope(link: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(new URL(link).hash.slice(FRAGMENT_PREFIX.length)))) as Record<string, unknown>;
}

describe('Pages amount-tamper fixture', () => {
  it.each([false, true])('retains encryption=%s and private facts but invalidates the real signature after changing the amount', async (encrypt) => {
    const { link, parsed: original } = await makeParsed({ encrypt, memo: 'Private fixture memo' });
    expect(original.verification.signatureValid).toBe(true);
    expect(original.encrypted).toBe(encrypt);
    const forged = tamperInvoiceLink(link);
    const changed = await parseFragment(new URL(forged).hash);
    expect(changed.verification.signatureValid).toBe(false);
    expect(changed.encrypted).toBe(encrypt);
    expect(changed.signature).toBe(original.signature);
    expect(changed.invoice.amountPolicy).toMatchObject({ mode: 'fixed_token', tokenAmount: '10000000' });
    expect({ ...changed.invoice, amountPolicy: original.invoice.amountPolicy }).toEqual(original.invoice);
    const before = envelope(link);
    const after = envelope(forged);
    expect(after['alg']).toBe(encrypt ? 'A256GCM' : 'none');
    expect(after['enc']).toEqual(before['enc']);
    expect(after['sig']).toBe(before['sig']);
    expect(new URL(forged).origin).toBe(new URL(link).origin);
    expect(new URL(forged).pathname).toBe(new URL(link).pathname);
    expect((await parseFragment(new URL(link).hash)).verification.signatureValid).toBe(true);
  });

  it('refuses unsupported passphrase envelopes instead of falling back to an invoice field', async () => {
    const { link } = await makeParsed();
    const unsupported = { ...envelope(link), alg: 'A256GCM-PW' };
    const url = new URL(link);
    url.hash = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(canonicalize(unsupported)));
    expect(() => tamperInvoiceLink(url.toString())).toThrow('Expected a plain or A256GCM invoice fixture');
  });
});
