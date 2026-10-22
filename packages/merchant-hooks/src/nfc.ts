import { HooksError } from './errors.js';
import { assertPaymentLink, type LinkOptions } from './link.js';

export const DEFAULT_NDEF_MAX_BYTES = 888;
export const HARD_NDEF_MAX_BYTES = 8192;

const TAGS = [
  { name: 'NTAG213', bytes: 144 },
  { name: 'NTAG215', bytes: 504 },
  { name: 'NTAG216', bytes: 888 },
] as const;

/** Which common NTAG tags can hold a message of this size. */
export function tagFit(messageBytes: number): string[] {
  return TAGS.filter((t) => messageBytes <= t.bytes).map((t) => t.name);
}

const PREFIX = 'https://';

/**
 * Encode a payment link as a single NDEF URI record message.
 *
 * @param link Payment link: https, no query, fragment `#gpi=v1.`.
 * @param options `maxBytes` (default 888, hard cap 8192).
 * @returns NDEF message bytes.
 * @throws {HooksError} `bad-link`, `too-large`.
 * @security A tag is readable by anyone in range and the fragment carries the invoice key: treat the tag as the invoice itself. Secrets only in the fragment, never in path or query.
 */
export function encodeNdefUri(link: string, options: LinkOptions & { maxBytes?: number } = {}): Uint8Array {
  const { base, fragment } = assertPaymentLink(link, options);
  if (!base.startsWith(PREFIX)) throw new HooksError('bad-link');
  const rest = new TextEncoder().encode(base.slice(PREFIX.length) + fragment);
  const payloadLen = 1 + rest.length;
  const max = Math.min(options.maxBytes ?? DEFAULT_NDEF_MAX_BYTES, HARD_NDEF_MAX_BYTES);
  const short = payloadLen < 256;
  const total = (short ? 3 : 6) + 1 + payloadLen;
  if (total > max) throw new HooksError('too-large');
  const out = new Uint8Array(total);
  let o = 0;
  out[o++] = short ? 0xd1 : 0xc1; // MB ME [SR] TNF=1
  out[o++] = 1; // type length
  if (short) out[o++] = payloadLen;
  else {
    new DataView(out.buffer).setUint32(o, payloadLen);
    o += 4;
  }
  out[o++] = 0x55; // 'U'
  out[o++] = 0x04; // https://
  out.set(rest, o);
  return out;
}

/**
 * Decode an NDEF message holding exactly one URI record into a validated payment link.
 *
 * @param bytes Raw NDEF message from a tag (untrusted).
 * @returns Link string.
 * @throws {HooksError} `bad-ndef` or `bad-link` for anything unexpected.
 * @security Strict: single record, no chunking or IDs, bounded size, valid UTF-8, link re-validated.
 */
export function decodeNdefUri(bytes: Uint8Array, options: LinkOptions = {}): string {
  const bad = (): never => {
    throw new HooksError('bad-ndef');
  };
  if (bytes.length < 5 || bytes.length > HARD_NDEF_MAX_BYTES) return bad();
  const h = bytes[0] as number;
  const sr = (h & 0x10) !== 0;
  // require MB, ME, no chunk(CF), no IL, TNF=1; SR free
  if ((h & 0x80) === 0 || (h & 0x40) === 0 || (h & 0x20) !== 0 || (h & 0x08) !== 0 || (h & 0x07) !== 1) return bad();
  if (bytes[1] !== 1) return bad();
  let o = 2;
  let len: number;
  if (sr) len = bytes[o++] as number;
  else {
    if (bytes.length < 7) return bad();
    len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(o);
    o += 4;
  }
  if (bytes[o++] !== 0x55) return bad();
  if (bytes.length !== o + len || len < 2) return bad();
  const code = bytes[o] as number;
  const prefix = code === 0x04 ? 'https://' : code === 0x03 ? 'http://' : code === 0x00 ? '' : undefined;
  if (prefix === undefined) return bad();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(o + 1));
  } catch {
    return bad();
  }
  const link = prefix + text;
  assertPaymentLink(link, options);
  return link;
}
