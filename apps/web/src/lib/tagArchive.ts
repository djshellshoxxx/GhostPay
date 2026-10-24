import { parseStrictJson } from '@ghostpay/invoice-schema';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';
import { DEFAULT_SCRYPT, passphraseProblem } from './keystore';
import { validatePayload, type TagImportPreview, type TagPayload, type TagSnapshotEntry, type TagVault } from './tags';

/**
 * Feature 4: encrypted tag archive (`.gpa`).
 *
 *   "GPA1" | u8 kdf (1 = scrypt) | u8 log2(N) | u8 r | u8 p | salt(16) | iv(12) | AES-256-GCM ciphertext || tag(16)
 *   AAD = everything before the iv (magic, kdf id, kdf parameters, salt).
 *
 * The key is derived from a passphrase with the same scrypt profile as the seller keystore (N=2^17, r=8, p=1), a fresh
 * random salt and IV per archive, so each archive has its own key and IV. The archive holds decrypted tag payloads
 * (re-encrypted under the archive key); it never holds the viewing key, and lookup tokens are regenerated on import.
 * An optional `history` map carries the already-encrypted reconciliation (scan history) vault texts, one per chain id.
 * No compression is used, so there is no decompression amplification; file size and record count are capped.
 */
export const ARCHIVE_MAGIC = 'GPA1';
export const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_RECORDS = 100_000;
const KDF_SCRYPT = 1;
const HEADER = 4 + 1 + 3 + 16;
const IV_LEN = 12;
const MIN_N = 1 << 14;
const MAX_N = 1 << 18;
const MAX_R = 8;
const MAX_P = 2;
const BAD = 'This is not a valid GhostPay tag archive.';
const AUTH = 'Wrong passphrase, or the archive was modified.';

export interface ArchiveContents {
  readonly createdAt: number;
  readonly keyVersion: number;
  readonly records: readonly TagSnapshotEntry[];
  /** chain id -> encrypted reconciliation vault text (opaque here). */
  readonly history: Readonly<Record<string, string>>;
}

export interface ArchiveOptions {
  /** scrypt cost; production uses 2^17 (the default). Only tests lower it. */
  readonly N?: number;
}

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

function header(N: number, r: number, p: number, salt: Uint8Array): Uint8Array<ArrayBuffer> {
  const h = new Uint8Array(HEADER);
  h.set(utf8ToBytes(ARCHIVE_MAGIC), 0);
  h[4] = KDF_SCRYPT; h[5] = Math.log2(N); h[6] = r; h[7] = p;
  h.set(salt, 8);
  return h;
}

/** Encrypts archive contents under a passphrase. Throws on a weak passphrase or out-of-cap contents. */
export async function encodeArchive(contents: ArchiveContents, passphrase: string, options: ArchiveOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const problem = passphraseProblem(passphrase);
  if (problem !== undefined) throw new UserFacingError(problem);
  const N = options.N ?? DEFAULT_SCRYPT.N;
  if (!Number.isInteger(N) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) throw new UserFacingError('Invalid scrypt cost.');
  if (contents.records.length > MAX_ARCHIVE_RECORDS) throw new UserFacingError(`An archive holds at most ${String(MAX_ARCHIVE_RECORDS)} tags.`);
  const body = utf8ToBytes(JSON.stringify({
    version: 1,
    createdAt: contents.createdAt,
    keyVersion: contents.keyVersion,
    records: contents.records.map((e) => ({ chainId: e.chainId, createdAt: e.createdAt, updatedAt: e.updatedAt, payload: e.payload })),
    history: contents.history,
  })) as Uint8Array<ArrayBuffer>;
  try {
    if (body.byteLength + HEADER + IV_LEN + 16 > MAX_ARCHIVE_BYTES) throw new UserFacingError('This archive would exceed the 20 MB limit.');
    const salt = new Uint8Array(16); crypto.getRandomValues(salt);
    const iv = new Uint8Array(IV_LEN); crypto.getRandomValues(iv);
    const h = header(N, DEFAULT_SCRYPT.r, DEFAULT_SCRYPT.p, salt);
    const key = await derive(passphrase, salt, N, DEFAULT_SCRYPT.r, DEFAULT_SCRYPT.p);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: h, tagLength: 128 }, key, body));
    const out = new Uint8Array(HEADER + IV_LEN + ct.byteLength);
    out.set(h, 0); out.set(iv, HEADER); out.set(ct, HEADER + IV_LEN);
    return out;
  } finally {
    body.fill(0);
  }
}

function rec(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new UserFacingError(BAD);
  if (Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) throw new UserFacingError(BAD);
  return v as Record<string, unknown>;
}
function time(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new UserFacingError(BAD);
  return v;
}

/** Validates the header (every length and parameter bounded) BEFORE any key derivation or allocation. */
function parseHeader(bytes: Uint8Array): { N: number; r: number; p: number; salt: Uint8Array; iv: Uint8Array; ct: Uint8Array } {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES || bytes.byteLength < HEADER + IV_LEN + 16) throw new UserFacingError(BAD);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== ARCHIVE_MAGIC || bytes[4] !== KDF_SCRYPT) throw new UserFacingError(BAD);
  const log2N = bytes[5] as number; const r = bytes[6] as number; const p = bytes[7] as number;
  if (log2N < Math.log2(MIN_N) || log2N > Math.log2(MAX_N) || r < 1 || r > MAX_R || p < 1 || p > MAX_P) throw new UserFacingError(BAD);
  return { N: 2 ** log2N, r, p, salt: bytes.slice(8, 24), iv: bytes.slice(HEADER, HEADER + IV_LEN), ct: bytes.slice(HEADER + IV_LEN) };
}

/** Parses and decrypts an archive with a strict schema. Wrong passphrase and any modified byte are indistinguishable. */
export async function decodeArchive(bytes: Uint8Array, passphrase: string, signal?: AbortSignal): Promise<ArchiveContents> {
  const h = parseHeader(bytes);
  const key = await derive(passphrase, h.salt, h.N, h.r, h.p);
  if (signal?.aborted === true) throw new UserFacingError('Import cancelled.');
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: h.iv as Uint8Array<ArrayBuffer>, additionalData: bytes.slice(0, HEADER), tagLength: 128 }, key, h.ct as Uint8Array<ArrayBuffer>));
  } catch {
    throw new UserFacingError(AUTH);
  }
  try {
    const doc = rec(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(plain)), ['version', 'createdAt', 'keyVersion', 'records', 'history']);
    if (doc['version'] !== 1) throw new UserFacingError('This archive was made by a newer GhostPay and cannot be read.');
    const list = doc['records'];
    if (!Array.isArray(list) || list.length > MAX_ARCHIVE_RECORDS) throw new UserFacingError(BAD);
    const records: TagSnapshotEntry[] = list.map((raw: unknown) => {
      const e = rec(raw, ['chainId', 'createdAt', 'updatedAt', 'payload']);
      const chainId = time(e['chainId']);
      const pay = e['payload'];
      if (typeof pay !== 'object' || pay === null || Array.isArray(pay)) throw new UserFacingError(BAD);
      const allowed = new Set(['stealthAddress', 'announcementId', 'logIndex', 'clientLabel', 'invoiceLabel', 'notes']);
      if (Object.keys(pay).some((k) => !allowed.has(k))) throw new UserFacingError(BAD);
      let payload: TagPayload;
      try { payload = validatePayload(pay as TagPayload); } catch { throw new UserFacingError(BAD); }
      return { chainId, createdAt: time(e['createdAt']), updatedAt: time(e['updatedAt']), payload };
    });
    const hist = doc['history'];
    if (typeof hist !== 'object' || hist === null || Array.isArray(hist)) throw new UserFacingError(BAD);
    const history: Record<string, string> = {};
    for (const [k, v] of Object.entries(hist)) {
      if (!/^\d{1,10}$/.test(k) || typeof v !== 'string') throw new UserFacingError(BAD);
      history[k] = v;
    }
    return { createdAt: time(doc['createdAt']), keyVersion: time(doc['keyVersion']), records, history };
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError(BAD);
  } finally {
    plain.fill(0);
  }
}

export interface ExportedArchive {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Fixed pattern; never contains labels or addresses. */
  readonly filename: string;
  readonly recordCount: number;
  /** SHA-256 of the whole file, for the user to compare after copying it. */
  readonly sha256: string;
}

/**
 * Exports every tag (and optional scan-history vault texts) as an encrypted archive. Requires an unlocked vault and
 * re-authentication with the viewing key (consumed and zeroized), which must be the profile's key.
 */
export async function exportArchive(
  vault: TagVault,
  viewingKey: Uint8Array,
  passphrase: string,
  options: ArchiveOptions & { readonly history?: Readonly<Record<string, string>>; readonly now?: () => number } = {},
): Promise<ExportedArchive> {
  try {
    if (!vault.unlocked) throw new UserFacingError('Tags are locked. Unlock them first.');
    const problem = passphraseProblem(passphrase);
    if (problem !== undefined) throw new UserFacingError(problem);
    if (!(await vault.verifyKey(viewingKey.slice()))) throw new UserFacingError('Re-authentication failed: that is not the viewing key of these tags.');
    const records = await vault.snapshot();
    const createdAt = (options.now ?? Date.now)();
    const bytes = await encodeArchive({ createdAt, keyVersion: await vault.keyVersion(), records, history: options.history ?? {} }, passphrase, options);
    const d = new Date(createdAt);
    const ymd = `${String(d.getUTCFullYear())}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    return { bytes, filename: `ghostpay-tags-${ymd}.gpa`, recordCount: records.length, sha256: bytesToHex(sha256(bytes)) };
  } finally {
    viewingKey.fill(0);
  }
}

export interface ArchiveImportPreview {
  readonly tags: TagImportPreview;
  readonly keyVersion: number;
  readonly createdAt: number;
  /** Chain ids that carry scan history in this archive. */
  readonly historyChains: readonly string[];
  /** The decoded contents, for applying history; not for display. */
  readonly contents: ArchiveContents;
}

/**
 * Decrypts an archive and dry-runs the import. Nothing is written; commit with `vault.applyImport(preview.tags)`, which
 * rejects the preview if anything changed in between.
 */
export async function previewArchiveImport(vault: TagVault, bytes: Uint8Array, passphrase: string, mode: 'merge' | 'replace', signal?: AbortSignal): Promise<ArchiveImportPreview> {
  if (!vault.unlocked) throw new UserFacingError('Tags are locked. Unlock them first.');
  const contents = await decodeArchive(bytes, passphrase, signal);
  const tags = await vault.previewImport(contents.records, mode);
  return { tags, keyVersion: contents.keyVersion, createdAt: contents.createdAt, historyChains: Object.keys(contents.history), contents };
}
