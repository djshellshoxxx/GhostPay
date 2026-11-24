import { describe, expect, it } from 'vitest';

import { validateQuoteTerms } from './quote-terms';

const currency = { code: 'CAD', decimals: 2 };
const maxUint256 = (1n << 256n) - 1n;
const terms = {
  fiatCurrency: 'CAD',
  fiatDecimals: 2,
  fiatMinor: '12345',
  cryptoBase: maxUint256.toString(),
  issuedAtMs: 1_000,
  expiresAtMs: 301_000,
};

describe('validateQuoteTerms', () => {
  it('preserves exact base units through the uint256 limit', () => {
    expect(validateQuoteTerms(terms, currency, 1_000)).toEqual({
      ok: true,
      value: { fiatMinor: 12_345n, cryptoBase: maxUint256, expiresAtMs: 301_000 },
    });
  });

  it.each(['', '01', '-1', '+1', '1e3', '1.0', '1\n', '١', '9'.repeat(79), (maxUint256 + 1n).toString(), 1])(
    'rejects noncanonical or out-of-range amounts (%j)',
    (amount) => {
      const failure = { ok: false, code: 'invalid-amount' };
      expect(validateQuoteTerms({ ...terms, fiatMinor: amount }, currency, 1_000)).toEqual(failure);
      expect(validateQuoteTerms({ ...terms, cryptoBase: amount }, currency, 1_000)).toEqual(failure);
    },
  );

  it('requires the selected currency and locally configured precision', () => {
    const failure = { ok: false, code: 'invalid-currency' };
    expect(validateQuoteTerms({ ...terms, fiatCurrency: 'USD' }, currency, 1_000)).toEqual(failure);
    expect(validateQuoteTerms({ ...terms, fiatDecimals: 3 }, currency, 1_000)).toEqual(failure);
    expect(validateQuoteTerms(terms, { code: 'CAD', decimals: 19 }, 1_000)).toEqual(failure);
    expect(
      validateQuoteTerms(
        { ...terms, fiatCurrency: 'JPY', fiatDecimals: 0 },
        { code: 'JPY', decimals: 0 },
        1_000,
      ).ok,
    ).toBe(true);
  });

  it('accepts the last millisecond and rejects future or expired terms', () => {
    expect(validateQuoteTerms(terms, currency, 300_999).ok).toBe(true);
    for (const nowMs of [999, 301_000, 301_001]) {
      expect(validateQuoteTerms(terms, currency, nowMs)).toEqual({ ok: false, code: 'stale-quote' });
    }
  });

  it.each([999, 1_000, 301_001, 301_000.5, Infinity, NaN])(
    'rejects invalid quote windows (%s)',
    (expiresAtMs) => {
      expect(validateQuoteTerms({ ...terms, expiresAtMs }, currency, 1_000)).toEqual({
        ok: false,
        code: 'invalid-window',
      });
    },
  );
});
