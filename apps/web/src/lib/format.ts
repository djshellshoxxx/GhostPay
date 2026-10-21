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

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF']);

/** Minor-unit exponent for an ISO-4217 code (the invoice format stores minor units). */
export function fiatDecimals(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

/** Renders fiat minor units, for example `12345` USD -> `USD 123.45`. */
export function formatFiat(minorUnits: bigint, currency: string): string {
  const d = fiatDecimals(currency);
  const base = 10n ** BigInt(d);
  const whole = minorUnits / base;
  const frac = (minorUnits % base).toString().padStart(d, '0');
  return `${currency} ${whole.toString()}${d === 0 ? '' : `.${frac}`}`;
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

/** UTC timestamp for a unix-seconds value, locale independent. */
export function formatUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** Rounds `subtotal * rateBps / 10_000` half-up. */
export function taxFor(subtotalMinor: bigint, rateBps: number): bigint {
  return (subtotalMinor * BigInt(rateBps) + 5_000n) / 10_000n;
}

/** Seconds as minutes for display: whole minutes plainly, otherwise one decimal (never rounds 90 s to "2"). */
export function minutesLabel(seconds: number): string {
  const m = seconds / 60;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

/**
 * Makes untrusted invoice text safe to show: control, bidirectional-override and other invisible format characters
 * (Unicode categories Cc, Cf, Zl, Zp, except newline and the joiners ZWNJ/ZWJ that legitimate scripts and emoji need)
 * are replaced by a visible `⟦U+XXXX⟧` marker, so text can neither reorder the surrounding display nor hide content.
 * Single linear pass; render-layer only, the invoice data and its signature are untouched.
 */
export function visibleText(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    const risky = cp !== 0x0a && cp !== 0x200c && cp !== 0x200d && /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u.test(ch);
    out += risky ? `⟦U+${cp.toString(16).toUpperCase().padStart(4, '0')}⟧` : ch;
  }
  return out;
}
