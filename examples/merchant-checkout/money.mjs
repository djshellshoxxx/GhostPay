// Fiat amount -> invoice minor units, with the exponent the GhostPay app uses to read `fiat.minorUnits`
// (apps/web/src/lib/format.ts fiatDecimals; the WooCommerce and PrestaShop plugins use the same table).
// String math only: money is never a float.

/** ISO-4217 codes the GhostPay app treats as having no minor units. */
export const ZERO_DECIMAL_CURRENCIES = Object.freeze(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF']);

/** 0 for ZERO_DECIMAL_CURRENCIES, 2 for every other code (three-decimal currencies such as KWD included). */
export function fiatDecimals(currency) {
  return ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2;
}

/**
 * "12.50" USD -> "1250", "1500" JPY -> "1500". Returns undefined for a malformed code or amount, and when the amount
 * needs more decimals than the currency has ("1500.5" JPY, "12.345" KWD): never rounds, never rescales.
 */
export function toMinorUnits(amount, currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const m = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,8}))?$/.exec(typeof amount === 'string' ? amount : '');
  if (m === null) return undefined;
  const d = fiatDecimals(currency);
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > d) return undefined;
  return (BigInt(m[1]) * 10n ** BigInt(d) + BigInt(frac.padEnd(d, '0') || '0')).toString();
}
