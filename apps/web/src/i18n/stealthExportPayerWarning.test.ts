import { describe, expect, it } from 'vitest';
import { defaultCatalogLoader, shippedCatalogs, SOURCE_CATALOG } from './catalog';

// In scheme 1 the payer chose the payment's ephemeral secret, so the payer knows its tweak h without the viewing key.
// A revealed one-time key k then gives the master spending key: p_spend = (k - h) mod n (proved from vectors in
// scripts/recovery/seller-keystore-recover.test.mjs). Every surface that warns about exported payment keys must say so.
const KEYS = ['stealthExport.details.futureDeposits', 'stealthExport.raw.confirm.body'] as const;

describe('payment-key export warnings name the payer', () => {
  it('warns in the source catalog that the payer can rebuild the spending key, and not to send the key to the payer', () => {
    for (const key of KEYS) {
      const text = SOURCE_CATALOG.messages[key];
      expect(text, key).toMatch(/viewing key/);
      expect(text, key).toMatch(/payer who made this payment can do the same without your viewing key/);
      expect(text, key).toMatch(/never send/i);
      expect(text, key).toMatch(/refund/);
    }
  });

  it('leaves no shipped catalog with an outdated English copy that lacks the payer warning', async () => {
    for (const locale of shippedCatalogs()) {
      const catalog = await defaultCatalogLoader(locale);
      expect(catalog, locale).toBeDefined();
      for (const key of KEYS) {
        const text = catalog?.messages[key] ?? '';
        const source = SOURCE_CATALOG.messages[key] ?? '';
        // A translation may differ freely; an untranslated copy of the English text must be the current one.
        if (text.startsWith(source.slice(0, 40))) expect(text, `${locale} ${key}`).toBe(source);
      }
    }
  });
});
