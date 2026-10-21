import { canonicalJson } from './canonical.js';
import { ReceiptError } from './errors.js';

/** SHA-256 of UTF-8 text as lowercase hex via WebCrypto. */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new ReceiptError('NO_WEBCRYPTO', '', 'WebCrypto SubtleCrypto is unavailable');
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Digest of a receipt body (the receipt without its `digest` member).
 * @security Integrity checksum only; not authenticated.
 */
export async function digestBody(body: Record<string, unknown>): Promise<string> {
  return sha256Hex(canonicalJson(body));
}
