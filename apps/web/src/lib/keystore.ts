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
/**
 * Import cost cap (KL-13, audit S3-13, fuzz F9): the file chooses N before it can be authenticated, so only
 * N in {2^14 .. 2^18} with the shipped r=8, p=1 is accepted (at most 2x the default work, 256 MiB).
 */
const MAX_N = 1 << 18;
const R = 8;
const P = 1;
/** noble's own accounting is 128*r*(N+p+1); this is the exact maximum for the allowlist. */
const MAXMEM = 128 * R * (MAX_N + P + 1);
const MAX_KEYSTORE_BYTES = 8 * 1024;
/** Unicode code points after NFKC (KL-14). Applies to new exports only; older files still import. */
const MIN_PASSPHRASE = 12;
const MIN_DISTINCT = 5;
const HEX64 = /^[0-9a-f]{64}$/;
const SIGNER_RE = /^0[23][0-9a-f]{64}$/;
const META_ADDRESS_RE = /^st:[a-z0-9]{1,16}:0x[0-9a-f]{1,180}$/;
const TOP_KEYS = ['v', 'kdf', 'kdfParams', 'cipher', 'iv', 'meta', 'ciphertext'] as const;
const KDF_KEYS = ['N', 'r', 'p', 'salt'] as const;
const META_KEYS = ['metaAddress', 'signer'] as const;

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) throw new UserFacingError('This browser has no Web Crypto support.');
  return s;
}

function validCost(N: unknown, r: unknown, p: unknown): N is number {
  return typeof N === 'number' && Number.isInteger(N) && N >= MIN_N && N <= MAX_N && (N & (N - 1)) === 0 && r === R && p === P;
}

async function derive(pass: string, salt: Uint8Array, N: number, r: number, p: number): Promise<CryptoKey> {
  const pw = utf8ToBytes(pass.normalize('NFKC'));
  let raw: Uint8Array;
  try {
    raw = await scryptAsync(pw, salt, { N, r, p, dkLen: 32, maxmem: MAXMEM });
  } finally {
    // The JS string cannot be wiped; its UTF-8 copy can.
    pw.fill(0);
  }
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

/** Strength rule for new backups: >= 12 code points (KL-14) and not a short repeated pattern. */
export function passphraseProblem(pass: string): string | undefined {
  const points = [...pass.normalize('NFKC')];
  if (points.length < MIN_PASSPHRASE) return `Use a passphrase of at least ${String(MIN_PASSPHRASE)} characters.`;
  if (new Set(points).size < MIN_DISTINCT) return 'This passphrase is too repetitive. Use several unrelated words.';
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
  if (!validCost(N, r, p)) throw new UserFacingError('Invalid scrypt cost.');
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

function rec(v: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new UserFacingError(BAD);
  if (allowed !== undefined) {
    const keys = Object.keys(v);
    if (keys.length !== allowed.length || !keys.every((k) => allowed.includes(k))) throw new UserFacingError(BAD);
  }
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
  // Allowlist: exactly the fields version 1 writes, at every level; anything else is rejected before scrypt runs.
  const f = rec(parsed, TOP_KEYS);
  if (f['v'] !== 1 || f['kdf'] !== 'scrypt' || f['cipher'] !== 'AES-256-GCM') throw new UserFacingError(BAD);
  const kp = rec(f['kdfParams'], KDF_KEYS);
  const N = kp['N'];
  const r = kp['r'];
  const p = kp['p'];
  if (!validCost(N, r, p)) throw new UserFacingError(BAD);
  const salt = hex(kp['salt'], 16, 64);
  const iv = hex(f['iv'], 12, 12);
  const ct = hex(f['ciphertext'], 17, 1024);
  const m = rec(f['meta'], META_KEYS);
  const metaAddress = m['metaAddress'];
  const signer = m['signer'];
  if (typeof metaAddress !== 'string' || typeof signer !== 'string' || !META_ADDRESS_RE.test(metaAddress) || !SIGNER_RE.test(signer)) throw new UserFacingError(BAD);
  if (typeof passphrase !== 'string') throw new UserFacingError(BAD);
  const key = await derive(passphrase, salt, N, R, P);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer>, additionalData: aad({ metaAddress, signer }, N, R, P), tagLength: 128 },
        key,
        ct as Uint8Array<ArrayBuffer>,
      ),
    );
  } catch {
    throw new UserFacingError('Wrong passphrase, or the keystore was modified.');
  }
  const out: Record<string, Uint8Array> = {};
  try {
    const body = rec(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)));
    for (const k of ['spendingKey', 'viewingKey', 'signingKey']) {
      const v = body[k];
      if (typeof v !== 'string' || !HEX64.test(v)) throw new UserFacingError(BAD);
      out[k] = hexToBytes(v);
    }
    return { spendingKey: out['spendingKey'] as Uint8Array, viewingKey: out['viewingKey'] as Uint8Array, signingKey: out['signingKey'] as Uint8Array };
  } catch (e) {
    // Error path: keys decoded before the failure must not outlive it.
    for (const b of Object.values(out)) b.fill(0);
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError(BAD);
  } finally {
    plain.fill(0);
  }
}
