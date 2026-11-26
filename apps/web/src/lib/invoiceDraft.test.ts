import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankDraft, draftForForm, draftSlot, openDraft, sealDraft, validDraft, type InvoiceDraft } from './invoiceDraft';
import { clearSession, importSession } from './session';
import { generateWaivedSession } from '../test/keys';

beforeEach(() => { clearSession(); });
afterEach(() => { clearSession(); });

const filled: InvoiceDraft = {
  ...blankDraft(84532), tokenAmount: '0.75001', memo: 'private fixture memo', protectWithPassphrase: true,
  items: [{ description: 'Offline fixture service', quantity: '1', unitPrice: '41.90' }],
};

describe('invoice draft codec', () => {
  it('round-trips under the loaded seller and stores no form text in clear', async () => {
    const session = generateWaivedSession();
    const slot = draftSlot(session);
    const raw = await sealDraft(slot, filled);
    for (const text of ['private fixture memo', 'Offline fixture service', '0.75001', '41.90']) expect(raw).not.toContain(text);
    expect(raw).toMatch(/^[a-f0-9]{32}\.[A-Za-z0-9_-]+$/);
    expect(await openDraft(slot, raw)).toEqual(filled);
    // A random salt and nonce per record.
    expect(await sealDraft(slot, filled)).not.toBe(raw);
  });

  it('binds the record to its slot and to the seller keys that sealed it', async () => {
    const hex = (n: number): string => n.toString(16).padStart(64, '0');
    const first = importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(2), signingKeyHex: hex(3) });
    const slot = draftSlot(first);
    const raw = await sealDraft(slot, filled);
    // The same spending and viewing keys with another signing key are another seller slot.
    const other = importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(2), signingKeyHex: hex(9) });
    expect(draftSlot(other)).not.toBe(slot);
    await expect(openDraft(slot, raw)).rejects.toThrow();
    await expect(openDraft(draftSlot(other), raw)).rejects.toThrow();
    importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(2), signingKeyHex: hex(3) });
    expect(await openDraft(slot, raw)).toEqual(filled);
  });

  it('refuses to seal or open without loaded seller keys', async () => {
    const session = generateWaivedSession();
    const slot = draftSlot(session);
    const raw = await sealDraft(slot, filled);
    clearSession();
    await expect(sealDraft(slot, filled)).rejects.toThrow();
    await expect(openDraft(slot, raw)).rejects.toThrow();
  });

  it('rejects malformed records before decrypting', async () => {
    const session = generateWaivedSession();
    const slot = draftSlot(session);
    for (const raw of ['', 'not a record', `${'a'.repeat(32)}.`, `${'A'.repeat(32)}.AAAA`, `${'a'.repeat(32)}.AAAA`, `${'a'.repeat(32)}.${'A'.repeat(300_000)}`]) {
      await expect(openDraft(slot, raw)).rejects.toThrow();
    }
  });
});

describe('invoice draft validation', () => {
  const variants: [string, Record<string, unknown>][] = [
    ['an invoice passphrase', { ...filled, passphrase: 'only in the original form' }],
    ['a generated link', { ...filled, link: 'https://example.invalid/#gpi=v1.x' }],
    ['a missing field', Object.fromEntries(Object.entries(filled).filter(([key]) => key !== 'memo'))],
    ['a wrong type', { ...filled, encrypt: 'yes' }],
    ['an unknown choice', { ...filled, amountMode: 'floating' }],
    ['a non-integer chain', { ...filled, chainId: 1.5 }],
    ['a non-finite number', { ...filled, expiryHours: Number.POSITIVE_INFINITY }],
    ['an unknown token form', { ...filled, token: `0x${'A'.repeat(40)}` }],
    ['an over-long memo', { ...filled, memo: 'm'.repeat(501) }],
    ['no line items', { ...filled, items: [] }],
    ['too many line items', { ...filled, items: Array.from({ length: 51 }, () => ({ description: '', quantity: '1', unitPrice: '' })) }],
    ['an extra item field', { ...filled, items: [{ description: '', quantity: '1', unitPrice: '', secret: 'x' }] }],
    ['a minimal draft with a memo', { ...filled, minimalMetadata: true, items: [{ description: '', quantity: '1', unitPrice: '1' }] }],
    ['a minimal draft with a line description', { ...filled, minimalMetadata: true, memo: '' }],
  ];
  it.each(variants)('rejects %s', async (_name, value) => {
    expect(validDraft(value)).toBe(false);
    const session = generateWaivedSession();
    await expect(sealDraft(draftSlot(session), value as unknown as InvoiceDraft)).rejects.toThrow();
  });

  it('accepts the blank draft and a filled ERC-20 draft', () => {
    expect(validDraft(blankDraft(84532))).toBe(true);
    expect(validDraft({ ...filled, token: `0x${'a'.repeat(40)}`, amountMode: 'fiat_quote', bufferMode: 'range' })).toBe(true);
  });
});

describe('draftForForm', () => {
  const fiat: InvoiceDraft = {
    ...filled, amountMode: 'fiat_quote', quoteMinutes: 90, slippage: 300, bufferMode: 'range', bufferMin: '1', bufferMax: '2',
  };
  it('keeps full-profile pricing in the full profile', () => {
    expect(draftForForm(fiat, false)).toEqual(fiat);
  });
  it('forces fixed-token defaults and no buffer policy in lean', () => {
    expect(draftForForm(fiat, true)).toEqual({
      ...fiat, amountMode: 'fixed_token', quoteMinutes: 15, slippage: 50, bufferMode: 'off', bufferMin: '', bufferMax: '',
    });
  });
  it('drops the memo and line descriptions of a minimal-metadata draft', () => {
    const minimal = draftForForm({ ...filled, minimalMetadata: true }, false);
    expect(minimal.memo).toBe('');
    expect(minimal.items).toEqual([{ description: '', quantity: '1', unitPrice: '41.90' }]);
    expect(validDraft(minimal)).toBe(true);
  });
});
