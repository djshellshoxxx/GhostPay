const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT256_DIGITS = 78;
const MAX_QUOTE_LIFETIME_MS = 5 * 60 * 1000;
const MAX_FIAT_DECIMALS = 18;

interface QuoteTerms {
  fiatCurrency: unknown;
  fiatDecimals: unknown;
  fiatMinor: unknown;
  cryptoBase: unknown;
  issuedAtMs: unknown;
  expiresAtMs: unknown;
}

interface SelectedCurrency {
  code: string;
  decimals: number;
}

type QuoteTermsResult =
  | { ok: true; value: { fiatMinor: bigint; cryptoBase: bigint; expiresAtMs: number } }
  | { ok: false; code: 'invalid-amount' | 'invalid-currency' | 'invalid-window' | 'stale-quote' };

function parseBaseUnits(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || value.length > MAX_UINT256_DIGITS || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return undefined;
  }
  const amount = BigInt(value);
  return amount <= MAX_UINT256 ? amount : undefined;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Validate projected quote fields against locally selected currency metadata and clock. */
export function validateQuoteTerms(
  terms: QuoteTerms,
  currency: SelectedCurrency,
  nowMs: number,
): QuoteTermsResult {
  const { fiatCurrency, fiatDecimals, fiatMinor, cryptoBase, issuedAtMs, expiresAtMs } = terms;
  if (
    !/^[A-Z]{3}$/.test(currency.code) ||
    !Number.isInteger(currency.decimals) ||
    currency.decimals < 0 ||
    currency.decimals > MAX_FIAT_DECIMALS ||
    fiatCurrency !== currency.code ||
    fiatDecimals !== currency.decimals
  ) {
    return { ok: false, code: 'invalid-currency' };
  }
  if (
    !isTimestamp(nowMs) ||
    !isTimestamp(issuedAtMs) ||
    !isTimestamp(expiresAtMs) ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > MAX_QUOTE_LIFETIME_MS
  ) {
    return { ok: false, code: 'invalid-window' };
  }
  if (nowMs < issuedAtMs || nowMs >= expiresAtMs) {
    return { ok: false, code: 'stale-quote' };
  }
  const fiat = parseBaseUnits(fiatMinor);
  const crypto = parseBaseUnits(cryptoBase);
  if (fiat === undefined || crypto === undefined) {
    return { ok: false, code: 'invalid-amount' };
  }
  return { ok: true, value: { fiatMinor: fiat, cryptoBase: crypto, expiresAtMs } };
}
