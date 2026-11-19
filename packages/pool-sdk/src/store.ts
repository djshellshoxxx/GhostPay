import { hkdf } from '@noble/hashes/hkdf.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { SecretBox, type RandomSource } from '@ghostpay/secret-box';
import { createKeystoreApi } from '@ghostpay/ux-vault/portable';
import { getAddress, type Address } from 'viem';
import { assertPoolChain } from './chain.js';
import { fail } from './errors.js';
import { deriveNoteSecrets, type Note, type WithSeed } from './notes.js';

/** Persistable note metadata. Contains NO secrets: nullifier and secret are re-derived from the seed. */
export interface NoteRecord {
  readonly chainId: number;
  readonly pool: Address;
  readonly index: number;
  readonly value: string;
  readonly label: string;
  readonly leafIndex?: number;
  readonly spent: boolean;
}

/** Strips secrets from a note. */
export function toRecord(n: Note): NoteRecord {
  return { chainId: n.chainId, pool: n.pool, index: n.index, value: n.value.toString(), label: n.label.toString(), ...(n.leafIndex === undefined ? {} : { leafIndex: n.leafIndex }), spent: n.spent === true };
}

/** Re-derives secrets for stored records (SP-SDK-1). */
export function restoreNotes(withSeed: WithSeed, records: readonly NoteRecord[]): Note[] {
  return records.map((r) => {
    const s = deriveNoteSecrets(withSeed, r.chainId, r.pool, r.index);
    return { chainId: r.chainId, pool: r.pool, index: r.index, value: BigInt(r.value), label: BigInt(r.label), nullifier: s.nullifier, secret: s.secret, ...(r.leafIndex === undefined ? {} : { leafIndex: r.leafIndex }), spent: r.spent };
  });
}

const STORE_SALT = new TextEncoder().encode('ghostpay/shielded-pool/store/v1');
const AAD = new TextEncoder().encode('ghostpay/pool-notes/v1');

const b64 = (u: Uint8Array): string => Buffer.from(u).toString('base64');
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const b = Buffer.from(s, 'base64');
  const out = new Uint8Array(b.length);
  out.set(b);
  return out;
};

async function storeKey(withSeed: WithSeed, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = withSeed((seed) => hkdf(sha256, seed, STORE_SALT, new Uint8Array(0), 32));
  try {
    return await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage);
  } finally {
    raw.fill(0);
  }
}

/**
 * Encrypts note records (AES-256-GCM, key = HKDF of the seed) for storage (SP-SDK-2).
 *
 * @param withSeed Scoped seed accessor, e.g. `(f) => box.use(f)`.
 * @param rng Test-only RNG override for the nonce.
 * @returns A JSON string safe to put in IndexedDB or a file.
 * @security Confidentiality of note metadata (values, labels) at rest; secrets are never stored.
 */
export async function sealNotes(withSeed: WithSeed, records: readonly NoteRecord[], rng: RandomSource = globalThis.crypto): Promise<string> {
  const key = await storeKey(withSeed, ['encrypt']);
  const iv = new Uint8Array(12);
  rng.getRandomValues(iv);
  const pt = new TextEncoder().encode(JSON.stringify({ v: 1, records }));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, pt));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}

/**
 * Decrypts and validates a blob from {@link sealNotes}.
 *
 * @throws PoolSdkError `STORE_CORRUPT` on a wrong seed, tampering or malformed content.
 */
export async function openNotes(withSeed: WithSeed, blob: string): Promise<NoteRecord[]> {
  try {
    const o = JSON.parse(blob) as { v?: unknown; iv?: unknown; ct?: unknown };
    if (o.v !== 1 || typeof o.iv !== 'string' || typeof o.ct !== 'string') throw new Error('shape');
    const key = await storeKey(withSeed, ['decrypt']);
    const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: AAD }, key, unb64(o.ct));
    const inner = JSON.parse(new TextDecoder().decode(pt)) as { v?: unknown; records?: unknown };
    if (inner.v !== 1 || !Array.isArray(inner.records)) throw new Error('shape');
    return (inner.records as unknown[]).map(validateRecord);
  } catch {
    return fail('STORE_CORRUPT', 'note store could not be opened');
  }
}

function validateRecord(r: unknown): NoteRecord {
  if (typeof r !== 'object' || r === null) throw new Error('record');
  const o = r as Record<string, unknown>;
  const { chainId, pool, index, value, label, leafIndex, spent } = o;
  if (typeof chainId !== 'number' || typeof pool !== 'string' || typeof index !== 'number' || typeof value !== 'string' || typeof label !== 'string' || typeof spent !== 'boolean') throw new Error('record');
  if (leafIndex !== undefined && typeof leafIndex !== 'number') throw new Error('record');
  assertPoolChain(chainId);
  BigInt(value);
  BigInt(label);
  return { chainId, pool: getAddress(pool), index, value, label, ...(leafIndex === undefined ? {} : { leafIndex }), spent };
}

/** Fresh random 32-byte pool seed for an SP-PAY payer without GhostPay keys. Caller disposes the box. */
export function createPoolSeed(rng?: RandomSource): SecretBox {
  return SecretBox.random(32, { label: 'pool-seed', ...(rng === undefined ? {} : { rng }) });
}

const SEED_BACKUP_MAX_BYTES = 1024;
const SEED_PASSWORD_MAX_CHARS = 1024;
// deriveNoteSecrets accepts seeds of at least 16 bytes. Keep legacy non-32-byte seeds recoverable within a small cap.
const MIN_SEED_BYTES = 16;
const MAX_SEED_BYTES = 512;
const { passphraseProblemMessage } = createKeystoreApi();

interface SeedEnvelope {
  readonly v: 1 | 2;
  readonly logN: number;
  readonly salt: string;
  readonly iv: string;
  readonly ct: string;
}

function seedAad(header: Pick<SeedEnvelope, 'v' | 'logN' | 'salt' | 'iv'>): Uint8Array<ArrayBuffer> {
  // Version 1 must retain its exact original domain. Only version 2 authenticates the seed-specific header.
  return header.v === 1 ? AAD : new TextEncoder().encode(JSON.stringify(['ghostpay/pool-seed/v2', header.logN, header.salt, header.iv]));
}

function seedPassword(passphrase: string, version: 1 | 2): string {
  if (typeof passphrase !== 'string' || passphrase.length > SEED_PASSWORD_MAX_CHARS) throw new Error('password bounds');
  const password = version === 1 ? passphrase : passphrase.normalize('NFKC');
  if (password.length > SEED_PASSWORD_MAX_CHARS) throw new Error('password bounds');
  return password;
}

async function seedKey(passphrase: string, salt: Uint8Array, logN: number, usage: KeyUsage): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(passphrase);
  let raw: Uint8Array<ArrayBuffer> | undefined;
  try {
    raw = await scryptAsync(passwordBytes, salt, { N: 2 ** logN, r: 8, p: 1, dkLen: 32, maxmem: 2 ** 29 });
    return await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
  } finally {
    passwordBytes.fill(0);
    raw?.fill(0);
  }
}

function seedField(value: unknown, minLength: number, maxLength = minLength): string {
  if (typeof value !== 'string' || value.length < 4 * Math.ceil(minLength / 3) || value.length > 4 * Math.ceil(maxLength / 3)) throw new Error('field bounds');
  const bytes = unb64(value);
  if (bytes.length < minLength || bytes.length > maxLength || b64(bytes) !== value) throw new Error('noncanonical field');
  return value;
}

function seedEnvelope(blob: string): SeedEnvelope {
  if (typeof blob !== 'string' || blob.length > SEED_BACKUP_MAX_BYTES) throw new Error('backup bounds');
  const parsed: unknown = JSON.parse(blob);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
  const o = parsed as Record<string, unknown>;
  if (Object.keys(o).length !== 5 || !['v', 'logN', 'salt', 'iv', 'ct'].every((key) => Object.hasOwn(o, key))) throw new Error('shape');
  if (o['v'] !== 1 && o['v'] !== 2) throw new Error('version');
  const minCost = o['v'] === 1 ? 10 : 14;
  if (typeof o['logN'] !== 'number' || !Number.isInteger(o['logN']) || o['logN'] < minCost || o['logN'] > 18) throw new Error('cost');
  return { v: o['v'], logN: o['logN'], salt: seedField(o['salt'], 16), iv: seedField(o['iv'], 12), ct: seedField(o['ct'], MIN_SEED_BYTES + 16, MAX_SEED_BYTES + 16) };
}

/** scrypt log2 cost, 14..18; defaults to 17. Lower test costs must not be used for real seed backups. */
export interface SeedExportOptions {
  readonly logN?: number;
  readonly rng?: RandomSource;
}

/**
 * Passphrase-encrypts a 16..512-byte seed in a v2 backup (scrypt + AES-256-GCM). Generated pool seeds have 32 bytes.
 *
 * @security Strength is bounded by the passphrase. The output is a bearer secret for all notes.
 */
export async function exportSeedEncrypted(withSeed: WithSeed, passphrase: string, o: SeedExportOptions = {}): Promise<string> {
  let password: string;
  try { password = seedPassword(passphrase, 2); } catch { return fail('INVALID_INPUT', 'passphrase out of bounds'); }
  if (passphraseProblemMessage(password) !== undefined) return fail('INVALID_INPUT', 'passphrase too short or weak');
  const logN = o.logN === undefined ? 17 : o.logN;
  if (!Number.isInteger(logN) || logN < 14 || logN > 18) return fail('INVALID_INPUT', 'scrypt cost out of bounds');
  const rng = o.rng ?? globalThis.crypto;
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  rng.getRandomValues(salt);
  rng.getRandomValues(iv);
  const header = { v: 2 as const, logN, salt: b64(salt), iv: b64(iv) };
  const key = await seedKey(password, salt, logN, 'encrypt');
  const copy = withSeed((seed) => seed.slice());
  let ct: ArrayBuffer;
  try {
    if (copy.length < MIN_SEED_BYTES || copy.length > MAX_SEED_BYTES) return fail('INVALID_INPUT', 'pool seed length out of bounds');
    ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: seedAad(header) }, key, copy);
  } finally {
    copy.fill(0);
  }
  return JSON.stringify({ ...header, ct: b64(new Uint8Array(ct)) });
}

/** Restores a seed from {@link exportSeedEncrypted}. @throws PoolSdkError `STORE_CORRUPT` on a wrong passphrase or tampering. */
export async function importSeedEncrypted(blob: string, passphrase: string): Promise<SecretBox> {
  let pt: Uint8Array<ArrayBuffer> | undefined;
  try {
    const o = seedEnvelope(blob);
    const key = await seedKey(seedPassword(passphrase, o.v), unb64(o.salt), o.logN, 'decrypt');
    pt = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: seedAad(o) }, key, unb64(o.ct)));
    if (pt.length < MIN_SEED_BYTES || pt.length > MAX_SEED_BYTES) throw new Error('seed length');
    return SecretBox.copyOf(pt, { label: 'pool-seed', wipeSource: true });
  } catch {
    return fail('STORE_CORRUPT', 'seed backup could not be opened');
  } finally {
    pt?.fill(0);
  }
}
