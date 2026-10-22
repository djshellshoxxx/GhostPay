/**
 * Redaction helpers for notification text.
 *
 * @security Notification text can end up on lock screens, in OS notification
 * centres and in screenshots. These helpers detect and mask addresses and
 * amounts. They are defence in depth: discreet/lock-screen variants are built
 * from static templates and then re-checked with {@link containsSensitive}.
 */

const ADDRESS_PATTERNS: readonly RegExp[] = [
  /0x[0-9a-fA-F]{8,}/,
  /\b(?:bc1|tb1|bcrt1|sp1|tsp1)[0-9a-z]{8,}\b/i,
  /\b[1-9A-HJ-NP-Za-km-z]{26,64}\b/,
  /\b[0-9a-fA-F]{16,}\b/,
];

const AMOUNT_PATTERNS: readonly RegExp[] = [
  /[$€£¥₿]\s?\d/,
  /\d\s?[$€£¥₿]/,
  /\d[\d,_ ]*[.,]\d/,
  /\d\s?(?:[A-Za-z]{2,6})\b/,
  /\b\d{3,}\b/,
];

/** True if `text` contains an address-like token (0x…, bech32, base58, long hex). */
export function containsAddress(text: string): boolean {
  return ADDRESS_PATTERNS.some((p) => p.test(text));
}

/** True if `text` looks like it contains an address-like or amount-like token. */
export function containsSensitive(text: string): boolean {
  return containsAddress(text) || AMOUNT_PATTERNS.some((p) => p.test(text));
}

/**
 * Mask an address as first6…last4. Short or malformed input yields a fixed
 * placeholder so nothing partial leaks.
 *
 * @security Never returns the full address, even for short input.
 */
export function maskAddress(address: string): string {
  if (!/^[A-Za-z0-9]{12,128}$/.test(address)) return '••••';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Strip control/bidi characters, collapse whitespace, cap length. */
export function sanitizeLabel(label: string, max = 40): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = label.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, max);
}
