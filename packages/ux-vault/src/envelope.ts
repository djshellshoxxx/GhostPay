import { concat, fromHex, toBuf, u32be, utf8Encode } from './bytes.js';
import { AUTH_FAILURE_MESSAGE, fail } from './errors.js';

/** PBKDF2 cost policy. */
export interface KdfPolicy {
  /** Iterations used when creating new envelopes. */
  readonly iterations: number;
  /** Envelopes whose header iterations fall below this are rejected (downgrade guard). */
  readonly minIterations: number;
}

/** Production defaults (OWASP 2023 PBKDF2-HMAC-SHA256 guidance is 600k). */
export const DEFAULT_KDF: KdfPolicy = { iterations: 600_000, minIterations: 210_000 };
/** Upper bound so a tampered header cannot force an unbounded KDF (DoS). */
export const MAX_ITERATIONS = 10_000_000;
/** Hard cap on accepted blob size (bytes). */
export const MAX_BLOB_BYTES = 16 * 1024 * 1024;

/** Random byte source. Must return exactly `n` cryptographically secure bytes. */
export type Rng = (n: number) => Uint8Array;

/** Dependencies for envelope operations. */
export interface CryptoDeps {
  readonly rng: Rng;
  readonly subtle: SubtleCrypto;
  readonly kdf: KdfPolicy;
}

/** Envelope purposes (bound into AAD). */
export type Purpose = 'profile' | 'backup';
const PURPOSE_BYTE: Record<Purpose, number> = { profile: 1, backup: 2 };

const MAGIC = utf8Encode('GPVT');
const FORMAT_VERSION = 1;
const SALT_LEN = 16;
const NONCE_LEN = 12;
const ID_LEN = 16;
// magic(4) version(1) purpose(1) iterations(4) profileId(16) salt(16) | nonce(12)
const AAD_LEN = 4 + 1 + 1 + 4 + ID_LEN + SALT_LEN;
const HEADER_LEN = AAD_LEN + NONCE_LEN;
const TAG_LEN = 16;
/** Minimum possible blob length. */
export const MIN_BLOB_BYTES = HEADER_LEN + TAG_LEN;

/** Passwords: min code points on creation, absolute max. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 1024;

/** Default deps backed by `globalThis.crypto`. */
export function defaultCryptoDeps(kdf: KdfPolicy = DEFAULT_KDF): CryptoDeps {
  return {
    rng: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
    subtle: globalThis.crypto.subtle,
    kdf,
  };
}

/** @internal validate a KDF policy. */
export function checkPolicy(k: KdfPolicy): void {
  const ok = (n: number): boolean => Number.isSafeInteger(n) && n >= 1 && n <= MAX_ITERATIONS;
  if (!ok(k.iterations) || !ok(k.minIterations) || k.minIterations > k.iterations) {
    fail('INVALID_INPUT', 'invalid kdf policy');
  }
}

/** @internal draw exactly n bytes from the injected rng. */
export function randomBytes(deps: CryptoDeps, n: number): Uint8Array<ArrayBuffer> {
  const b = deps.rng(n);
  if (!(b instanceof Uint8Array) || b.length !== n) fail('INVALID_INPUT', 'rng returned wrong length');
  return toBuf(b);
}

/**
 * Validate a password for creating a key. NFKC-normalised so the same password typed on
 * different platforms derives the same key.
 * @security Never logged or stored. Strength policy is length only; the UI should add an
 * entropy meter. Unlock paths use {@link normalizePasswordForUnlock} (no strength errors,
 * so failure stays uniform).
 */
export function normalizeNewPassword(pw: string): string {
  const n = normalizePasswordForUnlock(pw);
  if ([...n].length < MIN_PASSWORD_LENGTH)
    fail('WEAK_PASSWORD', `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  return n;
}

/** @internal */
export function normalizePasswordForUnlock(pw: string): string {
  if (typeof pw !== 'string' || pw.length === 0 || pw.length > MAX_PASSWORD_LENGTH) {
    return fail('INVALID_INPUT', 'password has invalid length');
  }
  return pw.normalize('NFKC');
}

/**
 * Derived key plus the (public) parameters needed to seal further envelopes.
 * @security Holds a non-extractable CryptoKey; the password itself is not retained.
 */
export interface KeyContext {
  readonly key: CryptoKey;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly iterations: number;
  readonly profileId: string;
  readonly purpose: Purpose;
}

/**
 * Derive an AES-256-GCM key via PBKDF2-HMAC-SHA256.
 * @security The password byte buffer is zeroed immediately after import.
 */
export async function deriveKey(
  deps: CryptoDeps,
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const pwBytes = utf8Encode(password);
  try {
    const base = await deps.subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveKey']);
    return await deps.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: toBuf(salt), iterations },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    pwBytes.fill(0);
  }
}

/** Fresh key context (new random salt) from a password. @security password must already be normalised. */
export async function newKeyContext(
  deps: CryptoDeps,
  password: string,
  profileId: string,
  purpose: Purpose,
): Promise<KeyContext> {
  checkPolicy(deps.kdf);
  fromHex(profileId);
  const salt = randomBytes(deps, SALT_LEN);
  const key = await deriveKey(deps, password, salt, deps.kdf.iterations);
  return { key, salt, iterations: deps.kdf.iterations, profileId, purpose };
}

function headerAad(ctx: KeyContext): Uint8Array<ArrayBuffer> {
  return concat(
    MAGIC,
    new Uint8Array([FORMAT_VERSION, PURPOSE_BYTE[ctx.purpose]]),
    u32be(ctx.iterations),
    fromHex(ctx.profileId),
    ctx.salt,
  );
}

/**
 * Encrypt `plaintext` into a self-describing envelope with a fresh random 96-bit nonce.
 * AAD = magic | format version | purpose | iterations | profile id | salt, so a blob cannot be
 * re-labelled (other profile, downgraded KDF, backup<->profile swap) without detection.
 * @security Caller-owned plaintext is not mutated; zero it afterwards. An injected rng that
 * repeats nonces under one key would break GCM: tests only.
 */
export async function seal(
  deps: CryptoDeps,
  ctx: KeyContext,
  plaintext: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const aad = headerAad(ctx);
  const nonce = randomBytes(deps, NONCE_LEN);
  const ct = new Uint8Array(
    await deps.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      ctx.key,
      toBuf(plaintext),
    ),
  );
  return concat(aad, nonce, ct);
}

/** Parsed (still unauthenticated) header. */
export interface ParsedHeader {
  readonly purpose: Purpose;
  readonly iterations: number;
  readonly profileId: string;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly nonce: Uint8Array<ArrayBuffer>;
  readonly aad: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
}

/**
 * Parse and structurally validate an envelope header. Throws CORRUPT / UNSUPPORTED_VERSION
 * for structure problems (these reveal nothing about the password).
 */
export function parseHeader(deps: CryptoDeps, blob: Uint8Array, expected: Purpose): ParsedHeader {
  if (!(blob instanceof Uint8Array)) return fail('INVALID_INPUT', 'blob must be bytes');
  if (blob.length > MAX_BLOB_BYTES) return fail('LIMIT', 'blob too large');
  if (blob.length < MIN_BLOB_BYTES) return fail('CORRUPT', 'blob too short');
  for (let i = 0; i < MAGIC.length; i++) if (blob[i] !== MAGIC[i]) return fail('CORRUPT', 'bad magic');
  const version = blob[4];
  if (version !== FORMAT_VERSION) {
    return fail(
      version !== undefined && version > FORMAT_VERSION ? 'UNSUPPORTED_VERSION' : 'CORRUPT',
      'unsupported envelope version',
    );
  }
  const purposeByte = blob[5];
  if (purposeByte !== PURPOSE_BYTE[expected]) return fail('CORRUPT', 'unexpected envelope purpose');
  const iterations = new DataView(blob.buffer, blob.byteOffset + 6, 4).getUint32(0, false);
  if (iterations < deps.kdf.minIterations || iterations > MAX_ITERATIONS) {
    return fail('CORRUPT', 'kdf parameters outside policy');
  }
  const idBytes = blob.slice(10, 10 + ID_LEN);
  let profileId = '';
  for (const x of idBytes) profileId += x.toString(16).padStart(2, '0');
  return {
    purpose: expected,
    iterations,
    profileId,
    salt: toBuf(blob.slice(10 + ID_LEN, AAD_LEN)),
    nonce: toBuf(blob.slice(AAD_LEN, HEADER_LEN)),
    aad: toBuf(blob.slice(0, AAD_LEN)),
    ciphertext: toBuf(blob.slice(HEADER_LEN)),
  };
}

/**
 * Open an envelope with a password. Returns plaintext and a reusable key context.
 * @security Every authentication failure (wrong password, flipped bit anywhere, truncation of
 * ciphertext, swapped header fields) raises the identical `DECRYPT_FAILED` error. The KDF always
 * runs before any password-dependent branch.
 */
export async function open(
  deps: CryptoDeps,
  blob: Uint8Array,
  password: string,
  expected: Purpose,
): Promise<{ plaintext: Uint8Array<ArrayBuffer>; ctx: KeyContext; header: ParsedHeader }> {
  checkPolicy(deps.kdf);
  const h = parseHeader(deps, blob, expected);
  const key = await deriveKey(deps, password, h.salt, h.iterations);
  let pt: ArrayBuffer;
  try {
    pt = await deps.subtle.decrypt(
      { name: 'AES-GCM', iv: h.nonce, additionalData: h.aad, tagLength: 128 },
      key,
      h.ciphertext,
    );
  } catch {
    return fail('DECRYPT_FAILED', AUTH_FAILURE_MESSAGE);
  }
  return {
    plaintext: new Uint8Array(pt),
    ctx: { key, salt: h.salt, iterations: h.iterations, profileId: h.profileId, purpose: expected },
    header: h,
  };
}
