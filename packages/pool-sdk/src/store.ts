import { hkdf } from '@noble/hashes/hkdf.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { SecretBox, type RandomSource } from '@ghostpay/secret-box';
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

/** scrypt cost for seed export; tests may lower it. */
export interface SeedExportOptions {
  readonly logN?: number;
  readonly rng?: RandomSource;
}

/**
 * Passphrase-encrypts a seed for backup (scrypt + AES-256-GCM).
 *
 * @security Strength is bounded by the passphrase. The output is a bearer secret for all notes.
 */
export async function exportSeedEncrypted(withSeed: WithSeed, passphrase: string, o: SeedExportOptions = {}): Promise<string> {
  if (passphrase.length < 8) fail('INVALID_INPUT', 'passphrase too short');
  const rng = o.rng ?? globalThis.crypto;
  const logN = o.logN ?? 15;
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  rng.getRandomValues(salt);
  rng.getRandomValues(iv);
  const raw = scrypt(new TextEncoder().encode(passphrase), salt, { N: 2 ** logN, r: 8, p: 1, dkLen: 32 });
  const key = await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  raw.fill(0);
  const copy = withSeed((seed) => seed.slice());
  let ct: ArrayBuffer;
  try {
    ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, copy);
  } finally {
    copy.fill(0);
  }
  return JSON.stringify({ v: 1, logN, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) });
}

/** Restores a seed from {@link exportSeedEncrypted}. @throws PoolSdkError `STORE_CORRUPT` on a wrong passphrase or tampering. */
export async function importSeedEncrypted(blob: string, passphrase: string): Promise<SecretBox> {
  try {
    const o = JSON.parse(blob) as { v?: unknown; logN?: unknown; salt?: unknown; iv?: unknown; ct?: unknown };
    if (o.v !== 1 || typeof o.logN !== 'number' || o.logN < 10 || o.logN > 20 || typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.ct !== 'string') throw new Error('shape');
    const raw = scrypt(new TextEncoder().encode(passphrase), unb64(o.salt), { N: 2 ** o.logN, r: 8, p: 1, dkLen: 32 });
    const key = await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    raw.fill(0);
    const pt = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: AAD }, key, unb64(o.ct)));
    return SecretBox.copyOf(pt, { label: 'pool-seed', wipeSource: true });
  } catch {
    return fail('STORE_CORRUPT', 'seed backup could not be opened');
  }
}
