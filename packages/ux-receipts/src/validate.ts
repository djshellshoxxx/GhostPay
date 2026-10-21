const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_MEMO_LENGTH = 140;

export function isIsoInstant(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_INSTANT.test(s)) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString() === s;
}

export function isIsoDay(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00.000Z');
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(s);
}

/** CAIP-2 chain id. */
export function isChainId(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}$/.test(s);
}

export function isAssetSymbol(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9]{1,12}$/.test(s);
}

export function isDecimals(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 36;
}

/** Positive integer, no leading zeros, at most 78 digits (uint256 range). */
export function isAmountBase(s: unknown): s is string {
  return typeof s === 'string' && /^[1-9][0-9]{0,77}$/.test(s);
}

/** Lowercase 32-byte hex with optional 0x. */
export function isTxHash(s: unknown): s is string {
  return typeof s === 'string' && /^(0x)?[0-9a-f]{64}$/.test(s);
}

export function isDigestHex(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

/** Full address: alphanumeric, 20..128 chars (covers hex/bech32/base58). */
export function isAddress(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9]{20,128}$/.test(s);
}

/** Truncated address `head...tail`. */
export function isRedactedAddress(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9]{1,16}\.\.\.[A-Za-z0-9]{1,16}$/.test(s);
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const BIDI_AND_INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

/** Memo text rule: 1..140 UTF-16 units, no control, bidi-override or zero-width chars. */
export function isSafeMemo(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    s.length >= 1 &&
    s.length <= MAX_MEMO_LENGTH &&
    !CONTROL.test(s) &&
    !BIDI_AND_INVISIBLE.test(s)
  );
}

/** Strip control/bidi/zero-width characters for display of untrusted text. */
export function sanitizeForDisplay(s: string): string {
  return s.replace(new RegExp(CONTROL.source + '|' + BIDI_AND_INVISIBLE.source, 'g'), '�');
}

const FORBIDDEN_NAME = /key|seed|mnemonic|secret|viewing|spending|private|stealthmeta|scan/i;

/** True if a property name looks like key material. */
export function isForbiddenFieldName(name: string): boolean {
  return FORBIDDEN_NAME.test(name.replace(/[-_ ]/g, ''));
}
