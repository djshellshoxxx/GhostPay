import { scryptAsync } from '@noble/hashes/scrypt.js';
import { concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { PassphrasePolicyError, UnsupportedError } from './errors.js';

/** Envelope `alg` of a passphrase-protected invoice link (ADR-0020). */
export const PASSPHRASE_ALG = 'A256GCM-PW';
/** Minimum passphrase length in Unicode code points after NFKC. Same value as the web keystore. */
export const MIN_PASSPHRASE_CHARS = 10;
/** Maximum passphrase size in UTF-8 bytes after NFKC. Bounds work done before the KDF. */
export const MAX_PASSPHRASE_BYTES = 1024;
/** The only scrypt costs a parser accepts: 2^15, 2^16, 2^17 (a crafted link cannot request more). */
export const SCRYPT_ALLOWED_N: readonly number[] = Object.freeze([1 << 15, 1 << 16, 1 << 17]);
/** Default scrypt cost for new links. Same as the web keystore (2^17). */
export const SCRYPT_DEFAULT_N = 1 << 17;
/** Fixed scrypt block size. */
export const SCRYPT_R = 8;
/** Fixed scrypt parallelism. */
export const SCRYPT_P = 1;
/** Salt length in bytes (random per envelope). */
export const SALT_BYTES = 16;

const AAD_MAGIC_PW = utf8ToBytes('GPI1-PW\0');
const LONE_SURROGATE = /\p{Cs}/u;

/** Public scrypt parameters as carried in the envelope. */
export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/**
 * Checks scrypt parameters against the allow-list.
 *
 * @param params Candidate parameters.
 * @returns Whether N is in {@link SCRYPT_ALLOWED_N}, r = 8 and p = 1.
 * @security Called before any KDF work so a link cannot force an expensive derivation.
 */
export function isAllowedScrypt(params: { readonly N: unknown; readonly r: unknown; readonly p: unknown }): boolean {
  return (
    typeof params.N === 'number' &&
    SCRYPT_ALLOWED_N.includes(params.N) &&
    params.r === SCRYPT_R &&
    params.p === SCRYPT_P
  );
}

/**
 * Validates and normalizes a passphrase to bytes: rejects non-strings and lone surrogates,
 * applies NFKC, requires >= {@link MIN_PASSPHRASE_CHARS} code points and <= {@link MAX_PASSPHRASE_BYTES} bytes.
 *
 * @param passphrase Candidate passphrase.
 * @returns Fresh UTF-8 bytes of the NFKC form. Caller must `fill(0)` them when done.
 * @throws {PassphrasePolicyError} On any violation.
 * @security The JS string itself cannot be zeroized; only the returned buffer can.
 */
export function passphraseToBytes(passphrase: unknown): Uint8Array {
  if (typeof passphrase !== 'string') throw new PassphrasePolicyError();
  // Bound work before normalizing: NFKC expands at most ~18x per code unit, so cap the input too.
  if (passphrase.length > MAX_PASSPHRASE_BYTES) throw new PassphrasePolicyError();
  // Lone surrogates would be replaced by U+FFFD on encoding, so two different strings would derive one key.
  if (LONE_SURROGATE.test(passphrase)) throw new PassphrasePolicyError();
  const normalized = passphrase.normalize('NFKC');
  if (Array.from(normalized).length < MIN_PASSPHRASE_CHARS) throw new PassphrasePolicyError();
  const bytes = utf8ToBytes(normalized);
  if (bytes.length > MAX_PASSPHRASE_BYTES) {
    bytes.fill(0);
    throw new PassphrasePolicyError();
  }
  return bytes;
}

/**
 * Derives the 256-bit AES key: scrypt(NFKC passphrase bytes, salt, N, r=8, p=1, dkLen=32).
 *
 * @param passBytes Output of {@link passphraseToBytes}. Not zeroized here; the caller owns it.
 * @param salt 16 random bytes from the envelope.
 * @param params Must pass {@link isAllowedScrypt}.
 * @returns Fresh 32-byte key. Caller must `fill(0)` it.
 * @throws {UnsupportedError} If the parameters are not allowed (defence in depth).
 */
export async function derivePassphraseKey(
  passBytes: Uint8Array,
  salt: Uint8Array,
  params: ScryptParams,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!isAllowedScrypt(params) || salt.length !== SALT_BYTES) throw new UnsupportedError();
  const { N, r, p } = params;
  return scryptAsync(passBytes, salt, { N, r, p, dkLen: 32, maxmem: 128 * r * (N + p + 1) });
}

/**
 * AAD for `A256GCM-PW`:
 * `"GPI1-PW\0" || chainId (u64 BE) || signer (33) || N (u32 BE) || r (u32 BE) || p (u32 BE) || salt (16)`.
 * Binding N/r/p/salt makes any parameter swap fail authentication even if the key were somehow reused.
 *
 * @param chainId Header chain id.
 * @param signerHex Header compressed signer key (66 lowercase hex).
 * @param params scrypt parameters.
 * @param salt 16-byte salt.
 * @returns AAD bytes.
 */
export function buildPassphraseAad(
  chainId: number,
  signerHex: string,
  params: ScryptParams,
  salt: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const chain = new Uint8Array(8);
  new DataView(chain.buffer).setBigUint64(0, BigInt(chainId));
  const kdf = new Uint8Array(12);
  const dv = new DataView(kdf.buffer);
  dv.setUint32(0, params.N);
  dv.setUint32(4, params.r);
  dv.setUint32(8, params.p);
  return concatBytes(AAD_MAGIC_PW, chain, hexToBytes(signerHex), kdf, salt);
}
