/** Pure formatting and parsing helpers. All amounts are bigint; no floating point touches money. */

const DECIMAL_RE = /^(0|[1-9][0-9]{0,29})(?:\.([0-9]{1,36}))?$/;

/** Formats base units as a decimal string with trailing zeros trimmed (at least one fractional digit is dropped when zero). */
export function formatUnits(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new RangeError('decimals');
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${frac === '' ? '' : `.${frac}`}`;
}

/** Strictly parses a decimal string into base units. Returns undefined for anything unexpected (never rounds). */
export function parseUnits(text: string, decimals: number): bigint | undefined {
  const m = DECIMAL_RE.exec(text.trim());
  if (m === null) return undefined;
  const whole = m[1] as string;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return undefined;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

// ISO 4217 List One, 2026-09-17 (SIX Group). Keep exception tables explicit and offline:
// invoice creation converts entered prices into signed integer minor units via this function.
// Unknown 3-letter codes retain the existing 2-decimal fallback until a separate currency-policy decision.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
const FOUR_DECIMAL_UNITS = new Set(['CLF', 'UYW']);

/** ISO-4217 minor-unit exponent used to sign and display fiat amounts in invoices. */
export function fiatDecimals(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  if (FOUR_DECIMAL_UNITS.has(currency)) return 4;
  return 2;
}

/** Renders fiat minor units, for example `12345` USD -> `USD 123.45`. */
export function formatFiat(minorUnits: bigint, currency: string): string {
  const d = fiatDecimals(currency);
  const base = 10n ** BigInt(d);
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(d, '0');
  return `${currency} ${negative ? '-' : ''}${whole.toString()}${d === 0 ? '' : `.${frac}`}`;
}

/** Shortens a long hex string for display; the full value is always available elsewhere in the UI. */
export function shortHex(value: string, head = 8, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** `mm:ss` or `h:mm:ss` countdown label from milliseconds (never negative). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * UTC timestamp for a unix-seconds value, locale independent. Total: a value outside the Date range (or not a number)
 * renders as `invalid time` instead of throwing, so an untrusted time can never take down a render (G1-01).
 */
export function formatUnix(seconds: number): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return 'invalid time';
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** Rounds `subtotal * rateBps / 10_000` half-up. */
export function taxFor(subtotalMinor: bigint, rateBps: number): bigint {
  return (subtotalMinor * BigInt(rateBps) + 5_000n) / 10_000n;
}
