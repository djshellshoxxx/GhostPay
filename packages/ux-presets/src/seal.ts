import { err, ok, type Result } from './types.js';

/** Minimal WebCrypto surface; `globalThis.crypto` satisfies it. Injectable for tests. */
export interface CryptoLike {
  readonly subtle: SubtleCrypto;
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

/** Caller-supplied key: an AES-256-GCM CryptoKey, or exactly 32 derived key bytes. */
export type KeyMaterial = CryptoKey | Uint8Array;

export const FORMAT_VERSION = 1;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
/** Upper bound on an encoded blob accepted for decryption (DoS guard). */
export const MAX_BLOB_CHARS = 2 * 1024 * 1024;

/** The single message used for every open failure (wrong key, tamper, truncation, bad plaintext). */
export const DECRYPT_FAILED_MESSAGE = 'preset store could not be opened';

const AAD_PREFIX = 'ghostpay/ux-presets|';

/**
 * Versioned additional authenticated data. Binds the ciphertext to the format
 * version and to the storage slot so blobs cannot be swapped between slots or
 * replayed under another format version.
 */
export function buildAad(version: number, slot: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(`${AAD_PREFIX}v${version}|${slot}`));
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out;
}

/** Strict, canonical, unpadded base64url decode; null on any irregularity. */
export function fromBase64Url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    const chunk = Math.min(4, s.length - i);
    for (let j = 0; j < 4; j++) {
      const v = j < chunk ? REVERSE.get(s.charAt(i + j)) : 0;
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    out[o++] = (n >> 16) & 255;
    if (chunk > 2) out[o++] = (n >> 8) & 255;
    if (chunk > 3) out[o++] = n & 255;
    // Non-canonical trailing bits must be zero.
    if (chunk === 2 && (n & 0xffff) !== 0) return null;
    if (chunk === 3 && (n & 0xff) !== 0) return null;
  }
  return out;
}

const keyBad = () => err<CryptoKey>('bad-key', 'key must be an AES-256-GCM CryptoKey or 32 bytes');

/**
 * Normalize caller key material into a non-extractable AES-GCM CryptoKey.
 * @security Raw bytes are copied before import; the caller keeps ownership of
 * (and should wipe) its own buffer. No KDF is applied: the key must already be
 * uniformly random / derived (e.g. HKDF output).
 */
export async function resolveKey(material: KeyMaterial, c: CryptoLike): Promise<Result<CryptoKey>> {
  try {
    if (material instanceof Uint8Array) {
      if (material.length !== KEY_BYTES) return keyBad();
      return ok(
        await c.subtle.importKey('raw', new Uint8Array(material), 'AES-GCM', false, ['encrypt', 'decrypt']),
      );
    }
    const k = material as Partial<CryptoKey> | null;
    const alg = k?.algorithm as Partial<AesKeyAlgorithm> | undefined;
    if (
      k === null ||
      typeof k !== 'object' ||
      k.type !== 'secret' ||
      alg?.name !== 'AES-GCM' ||
      alg.length !== 256 ||
      !Array.isArray(k.usages) ||
      !k.usages.includes('encrypt') ||
      !k.usages.includes('decrypt')
    ) {
      return keyBad();
    }
    return ok(material);
  } catch {
    return keyBad();
  }
}

/**
 * Encrypt `plaintext` into a self-describing base64url blob:
 * `version(1) || iv(12) || ciphertext || tag(16)`, with versioned slot-bound AAD.
 * @security Fresh random 96-bit IV per call from the injected CSPRNG.
 */
export async function seal(
  key: CryptoKey,
  c: CryptoLike,
  slot: string,
  plaintext: Uint8Array,
): Promise<string> {
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await c.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: buildAad(FORMAT_VERSION, slot), tagLength: TAG_BYTES * 8 },
      key,
      new Uint8Array(plaintext),
    ),
  );
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return toBase64Url(out);
}

/**
 * Authenticate and decrypt a blob produced by {@link seal}.
 * @security Every failure mode (bad encoding, size, version, wrong key, wrong
 * slot, tamper, truncation) returns the SAME error code and message, so callers
 * and observers cannot build a decryption oracle from error differences.
 */
export async function open(
  key: CryptoKey,
  c: CryptoLike,
  slot: string,
  blob: string,
): Promise<Result<Uint8Array>> {
  const fail = () => err<Uint8Array>('decrypt-failed', DECRYPT_FAILED_MESSAGE);
  try {
    if (typeof blob !== 'string' || blob.length > MAX_BLOB_CHARS) return fail();
    const raw = fromBase64Url(blob);
    if (raw === null || raw.length < 1 + IV_BYTES + TAG_BYTES || raw[0] !== FORMAT_VERSION) return fail();
    const iv = raw.slice(1, 1 + IV_BYTES);
    const ct = raw.slice(1 + IV_BYTES);
    const pt = await c.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: buildAad(FORMAT_VERSION, slot), tagLength: TAG_BYTES * 8 },
      key,
      ct,
    );
    return ok(new Uint8Array(pt));
  } catch {
    return fail();
  }
}
