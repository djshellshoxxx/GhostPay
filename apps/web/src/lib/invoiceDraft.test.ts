import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankDraft, draftForForm, draftSlot, formCanShow, openDraft, readableDraftSlot, sealDraft, validDraft, type DraftForm, type InvoiceDraft } from './invoiceDraft';
import type { ViewingKeyLender } from './scanCursorSlot';
import { clearSession, importSession, suspendSession } from './session';
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

describe('draftForForm and formCanShow', () => {
  const full: DraftForm = { supportedOnly: false, quoteAvailable: () => true };
  const lean: DraftForm = { supportedOnly: true, quoteAvailable: () => true };
  const noFeed: DraftForm = { supportedOnly: false, quoteAvailable: () => false };
  const fiat: InvoiceDraft = {
    ...filled, token: `0x${'a'.repeat(40)}`, amountMode: 'fiat_quote', quoteMinutes: 90, slippage: 300,
    bufferMode: 'range', bufferMin: '1', bufferMax: '2',
  };
  it('keeps full-profile pricing the form shows', () => {
    expect(draftForForm(fiat, full)).toEqual(fiat);
    expect(formCanShow(fiat, full)).toBe(true);
  });
  it('never writes fiat pricing or a buffer policy from lean, and keeps the quote terms lean shows', () => {
    expect(draftForForm(fiat, lean)).toEqual({
      ...fiat, amountMode: 'fixed_token', bufferMode: 'off', bufferMin: '', bufferMax: '',
    });
  });
  it('writes only the terms the form shows: no quote without a feed, no buffer on the native coin', () => {
    expect(draftForForm(fiat, noFeed).amountMode).toBe('fixed_token');
    expect(draftForForm({ ...fiat, token: 'native' }, full)).toMatchObject({ bufferMode: 'off', bufferMin: '', bufferMax: '' });
  });
  it('refuses saved terms the form would change', () => {
    expect(formCanShow(fiat, noFeed)).toBe(false);
    expect(formCanShow({ ...fiat, token: 'native' }, full)).toBe(false);
    expect(formCanShow(filled, lean)).toBe(true);
    for (const terms of [{ amountMode: 'fiat_quote' }, { bufferMode: 'declined' }, { bufferMode: 'range' }] as const) {
      expect(formCanShow({ ...fiat, amountMode: 'fixed_token', bufferMode: 'off', ...terms }, lean)).toBe(false);
    }
  });
  it('keeps the v3 slot apart from the v2 public-key slot and the unmerged v1 format', () => {
    expect(draftSlot(generateWaivedSession())).toMatch(/^ghostpay\.invoice-draft\.v3\.[0-9a-f]{64}$/);
  });
  it('drops the memo and line descriptions of a minimal-metadata draft', () => {
    const minimal = draftForForm({ ...filled, minimalMetadata: true }, full);
    expect(minimal.memo).toBe('');
    expect(minimal.items).toEqual([{ description: '', quantity: '1', unitPrice: '41.90' }]);
    expect(validDraft(minimal)).toBe(true);
  });
});

/** D1: the tab storage slot name of a draft must not tell anyone holding only a seller's public keys that a draft exists. */
describe('invoice draft slot name', () => {
  const lenderOf = (key: Uint8Array): ViewingKeyLender =>
    (<T,>(_keyId: string, use: (viewingKey: Uint8Array) => T): T | undefined => use(key.slice()));
  const publicNames = (pub: { metaAddress: string; signerPublicKey: string; spendingPublicKey: string; viewingPublicKey: string }): string[] => {
    const parts = [pub.metaAddress, pub.signerPublicKey, pub.spendingPublicKey, pub.viewingPublicKey].map((p) => p.toLowerCase());
    const joined = [`${pub.metaAddress}|${pub.signerPublicKey}`, `${pub.spendingPublicKey}|${pub.viewingPublicKey}`, `${pub.metaAddress}${pub.signerPublicKey}`];
    return [
      checkpointKeyId(pub.metaAddress, pub.signerPublicKey), checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey),
      ...parts, ...[...parts, ...joined].map((text) => bytesToHex(sha256(utf8ToBytes(text)))),
    ];
  };

  it('is not derivable from the public keys alone', () => {
    const pub = generateWaivedSession();
    const slot = draftSlot(pub);
    expect(slot).not.toBe('ghostpay.invoice-draft.v2.' + checkpointKeyId(pub.metaAddress, pub.signerPublicKey));
    for (const name of publicNames(pub)) expect(slot.toLowerCase()).not.toContain(name.toLowerCase());
  });

  it('differs per viewing key for the same public identity and is stable for the same viewing key', () => {
    const pub = generateWaivedSession();
    const a = lenderOf(new Uint8Array(32).fill(7));
    const b = lenderOf(new Uint8Array(32).fill(8));
    expect(draftSlot(pub, a)).toBe(draftSlot(pub, a));
    expect(draftSlot(pub, a)).not.toBe(draftSlot(pub, b));
    // The same keys restored name the same slot again.
    expect(draftSlot(pub)).toBe(draftSlot(pub));
  });

  it('keeps the seller identity: another invoice-signing key is another slot', () => {
    const hex = (n: number): string => n.toString(16).padStart(64, '0');
    const first = importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(2), signingKeyHex: hex(3) });
    const second = importSession({ spendingKeyHex: hex(1), viewingKeyHex: hex(2), signingKeyHex: hex(9) });
    expect(draftSlot(first)).not.toBe(draftSlot(second));
  });

  it('is unavailable without the unlocked keys: no slot while suspended, wiped or not the loaded seller', () => {
    const pub = generateWaivedSession();
    expect(readableDraftSlot(pub)).toBe(draftSlot(pub));
    suspendSession();
    expect(readableDraftSlot(pub)).toBeUndefined();
    expect(() => draftSlot(pub)).toThrow();
    clearSession();
    expect(readableDraftSlot(pub)).toBeUndefined();
    const other = generateWaivedSession();
    expect(readableDraftSlot(pub)).toBeUndefined();
    expect(readableDraftSlot(other)).toBeDefined();
  });

  it('refuses to open a record under a slot named for another viewing key', async () => {
    const pub = generateWaivedSession();
    const raw = await sealDraft(draftSlot(pub), filled);
    const foreign = draftSlot(pub, lenderOf(new Uint8Array(32).fill(5)));
    await expect(openDraft(foreign, raw)).rejects.toThrow();
  });
});
