import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';

/** Versioned, encrypted seller key backup. The passphrase never leaves the page and is never stored. */
export interface KeystoreFile {
  readonly v: 1;
  readonly kdf: 'scrypt';
  readonly kdfParams: { readonly N: number; readonly r: number; readonly p: number; readonly salt: string };
  readonly cipher: 'AES-256-GCM';
  readonly iv: string;
  /** Public identifiers, bound into the AEAD as additional data so they cannot be swapped. */
  readonly meta: { readonly metaAddress: string; readonly signer: string };
  readonly ciphertext: string;
}

export interface KeystoreSecrets {
  readonly spendingKey: Uint8Array;
  readonly viewingKey: Uint8Array;
  readonly signingKey: Uint8Array;
}

export interface KeystoreOptions {
  /** scrypt cost; production uses 2^17. Only tests lower it. */
  readonly N?: number;
}

/** scrypt N=2^17, r=8, p=1 (APP_AND_RELAYER_SPEC section 1). */
export const DEFAULT_SCRYPT = { N: 1 << 17, r: 8, p: 1 } as const;
const MIN_N = 1 << 14;
/** Import ceilings sit just above the export profile (N=2^17, r=8, p=1): a crafted file cannot make the tab allocate gigabytes (S3-13). */
const MAX_N = 1 << 18;
const MAX_R = 8;
const MAX_P = 2;
const MAX_KEYSTORE_BYTES = 8 * 1024;
const MIN_PASSPHRASE = 14;
const HEX64 = /^[0-9a-f]{64}$/;

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) throw new UserFacingError('This browser has no Web Crypto support.');
  return s;
}

async function derive(pass: string, salt: Uint8Array, N: number, r: number, p: number): Promise<CryptoKey> {
  const raw = await scryptAsync(utf8ToBytes(pass.normalize('NFKC')), salt, { N, r, p, dkLen: 32, maxmem: 2 ** 29 });
  try {
    return await subtle().importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

function aad(meta: KeystoreFile['meta'], N: number, r: number, p: number): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`GhostPay.keystore.v1|${meta.metaAddress}|${meta.signer}|${String(N)}|${String(r)}|${String(p)}`);
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const COMMON = ['password', 'passw0rd', 'qwerty', 'asdfgh', '123456', '111111', 'letmein', 'admin', 'iloveyou', 'welcome', 'abcdef', 'monkey', 'dragon'];

export interface PassphraseStrength {
  /** 0 (reject) to 4 (strong). */
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: 'too short' | 'weak' | 'fair' | 'good' | 'strong';
  /** Rough entropy estimate in bits. An estimate of effort for a random guesser, not a guarantee. */
  readonly bits: number;
}

/**
 * Crude strength estimate: character-pool size times an effective length that discounts repeated characters, minus a
 * penalty for very common words. It rejects the obvious (short, repetitive, "password...") and is shown as an estimate.
 */
export function passphraseStrength(pass: string): PassphraseStrength {
  const chars = Array.from(pass);
  if (chars.length < MIN_PASSPHRASE) return { score: 0, label: 'too short', bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(pass)) pool += 26;
  if (/[A-Z]/.test(pass)) pool += 26;
  if (/[0-9]/.test(pass)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pass)) pool += 33;
  const distinct = new Set(chars).size;
  const effective = distinct + (chars.length - distinct) * 0.25;
  let bits = effective * Math.log2(Math.max(pool, 2));
  const lower = pass.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) bits -= 30;
  bits = Math.max(0, Math.round(bits));
  if (bits < 45) return { score: 1, label: 'weak', bits };
  if (bits < 60) return { score: 2, label: 'fair', bits };
  if (bits < 80) return { score: 3, label: 'good', bits };
  return { score: 4, label: 'strong', bits };
}

export function passphraseProblem(pass: string): string | undefined {
  if (Array.from(pass).length < MIN_PASSPHRASE) return `Use a passphrase of at least ${String(MIN_PASSPHRASE)} characters (four random words work well).`;
  if (passphraseStrength(pass).score < 2) return 'That passphrase is too easy to guess (short variety, repeated characters or a common word). Use several unrelated words.';
  return undefined;
}

/** Encrypts the three seller secrets. Returns pretty JSON text for download. */
export async function encryptKeystore(
  secrets: KeystoreSecrets,
  meta: KeystoreFile['meta'],
  passphrase: string,
  options: KeystoreOptions = {},
): Promise<string> {
  const problem = passphraseProblem(passphrase);
  if (problem !== undefined) throw new UserFacingError(problem);
  const { r, p } = DEFAULT_SCRYPT;
  const N = options.N ?? DEFAULT_SCRYPT.N;
  if (!Number.isInteger(N) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) throw new UserFacingError('Invalid scrypt cost.');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await derive(passphrase, salt, N, r, p);
  const plain = utf8ToBytes(
    JSON.stringify({
      spendingKey: bytesToHex(secrets.spendingKey),
      viewingKey: bytesToHex(secrets.viewingKey),
      signingKey: bytesToHex(secrets.signingKey),
    }),
  ) as Uint8Array<ArrayBuffer>;
  try {
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(meta, N, r, p), tagLength: 128 }, key, plain));
    const file: KeystoreFile = {
      v: 1,
      kdf: 'scrypt',
      kdfParams: { N, r, p, salt: bytesToHex(salt) },
      cipher: 'AES-256-GCM',
      iv: bytesToHex(iv),
      meta,
      ciphertext: bytesToHex(ct),
    };
    return JSON.stringify(file, null, 2);
  } finally {
    plain.fill(0);
  }
}

const BAD = 'This is not a valid GhostPay keystore file.';

function rec(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new UserFacingError(BAD);
  return v as Record<string, unknown>;
}
function hex(v: unknown, min: number, max: number): Uint8Array {
  if (typeof v !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(v) || v.length < min * 2 || v.length > max * 2) throw new UserFacingError(BAD);
  return hexToBytes(v);
}

/** Strictly parses and decrypts a keystore. Wrong passphrase and tampering are indistinguishable by design. */
export async function decryptKeystore(text: string, passphrase: string): Promise<KeystoreSecrets> {
  if (typeof text !== 'string' || text.length > MAX_KEYSTORE_BYTES) throw new UserFacingError(BAD);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UserFacingError(BAD);
  }
  const f = rec(parsed);
  if (f['v'] !== 1 || f['kdf'] !== 'scrypt' || f['cipher'] !== 'AES-256-GCM') throw new UserFacingError(BAD);
  const kp = rec(f['kdfParams']);
  const N = kp['N'];
  const r = kp['r'];
  const p = kp['p'];
  if (typeof N !== 'number' || !Number.isInteger(N) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) throw new UserFacingError(BAD);
  if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > MAX_R) throw new UserFacingError(BAD);
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > MAX_P) throw new UserFacingError(BAD);
  const salt = hex(kp['salt'], 16, 64);
  const iv = hex(f['iv'], 12, 12);
  const ct = hex(f['ciphertext'], 17, 1024);
  const m = rec(f['meta']);
  const metaAddress = m['metaAddress'];
  const signer = m['signer'];
  if (typeof metaAddress !== 'string' || typeof signer !== 'string' || metaAddress.length > 200 || signer.length > 80) throw new UserFacingError(BAD);
  const key = await derive(passphrase, salt, N, r, p);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer>, additionalData: aad({ metaAddress, signer }, N, r, p), tagLength: 128 },
        key,
        ct as Uint8Array<ArrayBuffer>,
      ),
    );
  } catch {
    throw new UserFacingError('Wrong passphrase, or the keystore was modified.');
  }
  try {
    const body = rec(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)));
    const out: Record<string, Uint8Array> = {};
    for (const k of ['spendingKey', 'viewingKey', 'signingKey']) {
      const v = body[k];
      if (typeof v !== 'string' || !HEX64.test(v)) throw new UserFacingError(BAD);
      out[k] = hexToBytes(v);
    }
    return { spendingKey: out['spendingKey'] as Uint8Array, viewingKey: out['viewingKey'] as Uint8Array, signingKey: out['signingKey'] as Uint8Array };
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError(BAD);
  } finally {
    plain.fill(0);
  }
}
