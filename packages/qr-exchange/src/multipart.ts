import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { b64urlEncode } from './base64url.js';
import { QrExchangeError } from './errors.js';

/** Hard limits (all enforced on encode and decode). */
export const MAX_PAYLOAD_BYTES = 32 * 1024;
export const MAX_CHUNKS = 64;
export const MIN_CHUNK_CHARS = 32;
export const MAX_CHUNK_CHARS = 700;
/** Default payload characters per QR (about 436 bytes of QR text, see README capacity table). */
export const DEFAULT_CHUNK_CHARS = 400;
/** Session id = first 8 bytes of SHA-256(payload), lowercase hex. */
export const SESSION_HEX_LEN = 16;
/** Longest valid chunk text: 'GPQ1/' + 16 + '/63/64/' + 8 + '/' + 700. */
export const MAX_CHUNK_TEXT_LEN = 4 + 1 + SESSION_HEX_LEN + 1 + 2 + 1 + 2 + 1 + 8 + 1 + MAX_CHUNK_CHARS;

const CHUNK_RE = /^GPQ1\/([0-9a-f]{16})\/(0|[1-9][0-9]?)\/([1-9][0-9]?)\/([0-9a-f]{8})\/([A-Za-z0-9_-]+)$/;

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) over the ASCII characters of `s`. Detects scan corruption; it is NOT authentication. */
export function crc32Ascii(s: string): number {
  let c = 0xffffffff;
  for (let i = 0; i < s.length; i++) c = (CRC_TABLE[(c ^ s.charCodeAt(i)) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function sessionIdOf(payload: Uint8Array): string {
  return bytesToHex(sha256(payload).subarray(0, SESSION_HEX_LEN / 2));
}

function crcHex(session: string, index: number, total: number, data: string): string {
  return crc32Ascii(`${session}/${String(index)}/${String(total)}/${data}`).toString(16).padStart(8, '0');
}

export interface ParsedChunk {
  readonly session: string;
  readonly index: number;
  readonly total: number;
  readonly data: string;
}

/** Strict parse of one chunk text. Throws BAD_CHUNK on any deviation (length, charset, numbers, crc). */
export function parseChunk(text: unknown): ParsedChunk {
  if (typeof text !== 'string' || text.length > MAX_CHUNK_TEXT_LEN) throw new QrExchangeError('BAD_CHUNK');
  const m = CHUNK_RE.exec(text);
  if (m === null) throw new QrExchangeError('BAD_CHUNK');
  const session = m[1]!;
  const index = Number(m[2]);
  const total = Number(m[3]);
  const crc = m[4]!;
  const data = m[5]!;
  if (total > MAX_CHUNKS || index >= total || data.length > MAX_CHUNK_CHARS) throw new QrExchangeError('BAD_CHUNK');
  if (crcHex(session, index, total, data) !== crc) throw new QrExchangeError('BAD_CHUNK');
  return { session, index, total, data };
}

export interface EncodeOptions {
  /** Payload characters (base64url) per chunk, MIN_CHUNK_CHARS..MAX_CHUNK_CHARS. */
  readonly chunkChars?: number;
}

/**
 * Splits `payload` (1..32 KiB) into chunk texts `GPQ1/<session>/<i>/<n>/<crc32>/<base64url>`.
 * Without `chunkChars` the default is used and grown automatically (max 700) so that n <= 64.
 * With an explicit `chunkChars` that would need more than 64 chunks, throws TOO_MANY_CHUNKS.
 */
export function encodeMultipart(payload: Uint8Array, options: EncodeOptions = {}): string[] {
  if (!(payload instanceof Uint8Array) || payload.length === 0) throw new QrExchangeError('BAD_INPUT');
  if (payload.length > MAX_PAYLOAD_BYTES) throw new QrExchangeError('TOO_LARGE');
  const explicit = options.chunkChars;
  if (explicit !== undefined && (!Number.isInteger(explicit) || explicit < MIN_CHUNK_CHARS || explicit > MAX_CHUNK_CHARS)) {
    throw new QrExchangeError('BAD_INPUT');
  }
  const body = b64urlEncode(payload);
  let size = explicit ?? DEFAULT_CHUNK_CHARS;
  if (Math.ceil(body.length / size) > MAX_CHUNKS) {
    if (explicit !== undefined) throw new QrExchangeError('TOO_MANY_CHUNKS');
    size = Math.ceil(body.length / MAX_CHUNKS);
  }
  const total = Math.ceil(body.length / size);
  const session = sessionIdOf(payload);
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const data = body.slice(i * size, (i + 1) * size);
    out.push(`GPQ1/${session}/${String(i)}/${String(total)}/${crcHex(session, i, total, data)}/${data}`);
  }
  return out;
}
