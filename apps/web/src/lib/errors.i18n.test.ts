import { InvoiceError } from '@ghostpay/invoice-schema';
import { SolanaStealthError } from '@ghostpay/solana-stealth';
import { TronAdapterError } from '@ghostpay/tron-adapter';
import { describe, expect, it, vi } from 'vitest';
import { SOURCE_CATALOG, type MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR } from '../i18n/source';
import { SECURITY_KEYS } from '../i18n/securityKeys';
import { createTranslator } from '../i18n/translator';
import { solErrorMessage, SolViewError } from '../features/solana/rpc';
import { tronErrorMessage, TronViewError } from '../features/tron/rpc';
import { LocalizedTypeError, UserFacingError, captureUserMessage, displayMessage, userMessage } from './errors';
import { receiptInvoiceFragment } from './receipts';

describe('catalog-backed errors', () => {
  it('captures only safe structured diagnostics, never an arbitrary exception or its sensitive cause', () => {
    const failure = new Error('RPC secret token', { cause: { bearer: 'secret' } });
    const captured = captureUserMessage(failure);
    expect(captured).toEqual({ key: 'error.unknown' });
    expect(JSON.stringify(captured)).not.toContain('secret');
    expect(displayMessage(captured)).toBe('Something went wrong. Nothing was sent.');
    const known = captureUserMessage(new UserFacingError({ key: 'error.wallet.invoiceChainMismatch', values: { chain: '1', expected: '84532' } }));
    const t = vi.fn(SOURCE_TRANSLATOR.t);
    expect(displayMessage(known, t)).toContain('chain 84532');
    expect(t).toHaveBeenCalledWith('error.wallet.invoiceChainMismatch', { chain: '1', expected: '84532' });
  });


  it('resolves safe descriptors when displayed, preserving source Error.message and TypeError identity', () => {
    const error = new UserFacingError({ key: 'sol.error.network', values: { network: 'Devnet' } });
    expect(error.message).toBe('This server is not on the network you selected (Devnet).');
    const t = vi.fn(SOURCE_TRANSLATOR.t);
    expect(userMessage(error, t)).toBe(error.message);
    expect(t).toHaveBeenCalledWith('sol.error.network', { network: 'Devnet' });
    const parserError = new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' });
    expect(parserError).toBeInstanceOf(TypeError);
    expect(userMessage(parserError, t)).toBe('Use a signed invoice HTTP link or fragment.');
    expect(t).toHaveBeenLastCalledWith('receipt.validation.invoiceLink', undefined);
    expect(() => receiptInvoiceFragment('not a link')).toThrow(LocalizedTypeError);
  });

  it('keeps every invoice code on a source catalog key, including encoding errors', () => {
    const t = vi.fn(SOURCE_TRANSLATOR.t);
    for (const code of ['FRAGMENT_FORMAT', 'FRAGMENT_TOO_LARGE', 'BASE64URL', 'UTF8', 'JSON', 'SCHEMA', 'NON_CANONICAL', 'DECRYPT', 'SIGNING', 'RANDOMNESS', 'UNSUPPORTED', 'PASSPHRASE', 'PASSPHRASE_REQUIRED', 'PASSPHRASE_UNEXPECTED', 'PASSPHRASE_POLICY'] as const) {
      const result = userMessage(new InvoiceError(code, 'private details'), t);
      const key = t.mock.lastCall?.[0];
      expect(key).toMatch(/^error\.invoice\./);
      expect(SECURITY_KEYS.has(key as MessageKey)).toBe(true);
      expect(result).not.toBe(key);
    }
  });

  it('never echoes a mutated library exception message, including previously unmapped codes', () => {
    const sol = new SolanaStealthError('DERIVED_KEY_INVALID');
    const tron = new TronAdapterError('INVALID_MEMO');
    sol.message = 'private seed SHOULD NOT DISPLAY';
    tron.message = 'private backup SHOULD NOT DISPLAY';
    expect(solErrorMessage(sol)).toBe('derived key or tweak is invalid');
    expect(tronErrorMessage(tron)).toBe('invalid stealth announcement memo');
    expect(solErrorMessage(Object.assign(sol, { code: 'UNKNOWN_FUTURE_CODE' }))).toBe(userMessage(undefined));
    expect(tronErrorMessage(Object.assign(tron, { code: 'UNKNOWN_FUTURE_CODE' }))).toBe(userMessage(undefined));
  });

  it.each(['es', 'ja', 'ar'])('keeps error, receipt and sweep disclosures in reviewed English for %s drafts', (locale) => {
    const keys = [...SECURITY_KEYS].filter((key) => /^(error\.|receipt\.|sol\.error\.|tron\.error\.|(?:sol|tron|chainView)\.sweep\.|tagArchive\.msg\.listFailed)/.test(key));
    expect(keys.length).toBeGreaterThan(150);
    const draft = Object.fromEntries(keys.map((key) => [key, 'UNREVIEWED TRANSLATION']));
    const tr = createTranslator(locale, [{ locale, messages: draft }, { locale: 'en', messages: SOURCE_CATALOG.messages }]);
    for (const key of keys) expect(tr.t(key)).toBe(SOURCE_TRANSLATOR.t(key));
    expect(solErrorMessage(new SolViewError({ key: 'sol.error.mainnet' }), tr.t)).toContain('Mainnet is disabled');
    expect(tronErrorMessage(new TronViewError({ key: 'tron.error.mainnet' }), tr.t)).toContain('Mainnet is disabled');
  });
});
