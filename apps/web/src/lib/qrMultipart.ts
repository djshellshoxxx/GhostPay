import { encodeMultipart } from '@ghostpay/qr-exchange';
import { makeQr } from './qr';

/**
 * Display-side multipart helpers. GPQ1 parts are only readable by GhostPay's own importer (CameraImporter with
 * `multipart`); ordinary phone camera apps cannot assemble them, so callers split only when one QR cannot hold the
 * text, or when the user explicitly asks for smaller codes. Payload limits are those of `encodeMultipart`
 * (1 B..32 KiB, at most 64 parts); oversized or empty input throws instead of producing a partial transfer.
 */
export function fitsSingleQr(text: string): boolean {
  try {
    makeQr(text);
    return true;
  } catch {
    return false;
  }
}

/** Splits text (as UTF-8) into GPQ1 parts with the default part size (each part fits a mid-size QR). */
export function toMultipart(text: string): readonly string[] {
  // Copy into this realm's Uint8Array: encodeMultipart checks `instanceof`, and TextEncoder may belong to another
  // realm (an embedding frame, or jsdom in tests).
  return encodeMultipart(Uint8Array.from(new TextEncoder().encode(text)));
}

/** Parts when they are needed (or `force`d by an explicit user choice), otherwise `undefined` for a single code. */
export function multipartIfNeeded(text: string, options: { readonly force?: boolean } = {}): readonly string[] | undefined {
  if (options.force !== true && fitsSingleQr(text)) return undefined;
  const parts = toMultipart(text);
  return parts.length > 1 ? parts : undefined;
}
