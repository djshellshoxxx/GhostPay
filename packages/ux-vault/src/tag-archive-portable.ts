import { parseStrictJson } from '@ghostpay/invoice-schema';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { PortableVaultError, type PortableErrorConstructor, type PortableMessageDescriptor as MessageDescriptor } from './portable-errors.js';
import { createKeystoreApi } from './keystore-portable.js';


/**
 * Feature 4: encrypted local client tags.
 *
 * - Keys: HKDF-SHA-256 over the viewing key with a random per-profile salt and distinct `info` strings produce a
 *   non-extractable AES-256-GCM key and a separate non-extractable HMAC-SHA-256 key. The viewing key is never used as a
 *   key directly.
 * - Records: AES-GCM with a fresh 96-bit IV per write; the AAD binds the schema version, chain id, record id AND lookup
 *   token, so ciphertext cannot be spliced from one record into another (S3-16), and `find` also checks that the decrypted
 *   address is the one asked for. METADATA IS IN THE CLEAR: record count, chain id, record id, lookup token, IV and the
 *   created/updated times are readable by anything that can read this origin's IndexedDB; only the payload is encrypted. The lookup token is
 *   HMAC(chainId || stealth address), so no raw address or unkeyed hash is stored.
 * - The unlocked CryptoKeys live in this object only; `lock()` drops them. Nothing is sent over the network.
 * - Unlocked keys belong to the seller keys that were loaded when `unlock` started (L1-04): once those are wiped or
 *   replaced the vault reads as locked, drops its keys on the next use, and refuses to commit a pending write.
 */
export interface TagPayload {
  readonly stealthAddress: string;
  /** `blockHash:logIndex` of the announcement (the scanner does not retain transaction hashes). */
  readonly announcementId: string;
  readonly logIndex: number;
  readonly clientLabel: string;
  readonly invoiceLabel?: string;
  readonly notes?: string;
}


/** A decrypted tag with the (non-secret) timestamps needed for backup and merge. */
export interface TagSnapshotEntry {
  readonly chainId: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly payload: TagPayload;
}


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
/** Existing GPA1 codec; the same validation and authentication path is used in the browser and CLI. */
export function createTagArchiveApi(UserFacingError: PortableErrorConstructor = PortableVaultError) {
const {DEFAULT_SCRYPT,passphraseProblemMessage}=createKeystoreApi(UserFacingError);

const MAX_LABEL = 200;

const MAX_NOTES = 2000;


/** An optional text field: absent, or a string that is trimmed and bounded like the client label (I-3); blank means absent. */
function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new UserFacingError({ key: 'error.tags.invoiceLabelAndNotesMustBeText' });
  const clean = value.trim();
  if (clean.length > max) throw new UserFacingError({ key: 'error.tags.labelOrNotesTooLong' });
  return clean === '' ? undefined : clean;
}


/** Validates a payload from the UI, storage or an archive; every field is checked by type, since archives are untrusted JSON. */
function validatePayload(p: TagPayload): TagPayload {
  const label = typeof p.clientLabel === 'string' ? p.clientLabel.trim() : '';
  if (label === '' || label.length > MAX_LABEL) throw new UserFacingError({ key: 'error.tags.labelLength', values: { maximum: String(MAX_LABEL) } });
  if (typeof p.stealthAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(p.stealthAddress)) throw new UserFacingError({ key: 'error.tags.invalidStealthAddress' });
  if (typeof p.announcementId !== 'string' || !/^0x[0-9a-fA-F]{64}:\d{1,9}$/.test(p.announcementId)) throw new UserFacingError({ key: 'error.tags.invalidAnnouncementId' });
  if (!Number.isInteger(p.logIndex) || p.logIndex < 0) throw new UserFacingError({ key: 'error.tags.invalidLogIndex' });
  const invoiceLabel = optionalText(p.invoiceLabel, MAX_LABEL);
  const notes = optionalText(p.notes, MAX_NOTES);
  return {
    stealthAddress: p.stealthAddress.toLowerCase(),
    announcementId: p.announcementId.toLowerCase(),
    logIndex: p.logIndex,
    clientLabel: label,
    ...(invoiceLabel === undefined ? {} : { invoiceLabel }),
    ...(notes === undefined ? {} : { notes }),
  };
}


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
const ARCHIVE_MAGIC = 'GPA1';

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;

const MAX_ARCHIVE_RECORDS = 100_000;

const KDF_SCRYPT = 1;

const HEADER = 4 + 1 + 3 + 16;

const IV_LEN = 12;

const MIN_N = 1 << 14;

const MAX_N = 1 << 18;

const MAX_R = 8;

const MAX_P = 2;

const BAD: MessageDescriptor = { key: 'error.tagArchive.invalidFile' };

const AUTH: MessageDescriptor = { key: 'error.tagArchive.authentication' };


function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) throw new UserFacingError({ key: 'error.tagArchive.thisBrowserHasNoWebCryptoSupport' });
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
async function encodeArchive(contents: ArchiveContents, passphrase: string, options: ArchiveOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const problem = passphraseProblemMessage(passphrase);
  if (problem !== undefined) throw new UserFacingError(problem);
  const N = options.N ?? DEFAULT_SCRYPT.N;
  if (!Number.isInteger(N) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) throw new UserFacingError({ key: 'error.tagArchive.invalidScryptCost' });
  if (contents.records.length > MAX_ARCHIVE_RECORDS) throw new UserFacingError({ key: 'error.tagArchive.capacity', values: { maximum: String(MAX_ARCHIVE_RECORDS) } });
  const body = utf8ToBytes(JSON.stringify({
    version: 1,
    createdAt: contents.createdAt,
    keyVersion: contents.keyVersion,
    records: contents.records.map((e) => ({ chainId: e.chainId, createdAt: e.createdAt, updatedAt: e.updatedAt, payload: e.payload })),
    history: contents.history,
  })) as Uint8Array<ArrayBuffer>;
  try {
    if (body.byteLength + HEADER + IV_LEN + 16 > MAX_ARCHIVE_BYTES) throw new UserFacingError({ key: 'error.tagArchive.thisArchiveWouldExceedThe20MBLimit' });
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
async function decodeArchive(bytes: Uint8Array, passphrase: string, signal?: AbortSignal): Promise<ArchiveContents> {
  const h = parseHeader(bytes);
  const key = await derive(passphrase, h.salt, h.N, h.r, h.p);
  if (signal?.aborted === true) throw new UserFacingError({ key: 'error.tagArchive.importCancelled' });
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: h.iv as Uint8Array<ArrayBuffer>, additionalData: bytes.slice(0, HEADER), tagLength: 128 }, key, h.ct as Uint8Array<ArrayBuffer>));
  } catch {
    throw new UserFacingError(AUTH);
  }
  try {
    const doc = rec(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(plain)), ['version', 'createdAt', 'keyVersion', 'records', 'history']);
    if (doc['version'] !== 1) throw new UserFacingError({ key: 'error.tagArchive.thisArchiveWasMadeByANewerGhostPayAndCannot' });
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
  function inspectArchive(bytes: Uint8Array) { const { N, r, p } = parseHeader(bytes); return { version: 1, bytes: bytes.byteLength, kdf: 'scrypt', N, r, p, cipher: 'AES-256-GCM' }; }
  return { ARCHIVE_MAGIC, MAX_ARCHIVE_BYTES, MAX_ARCHIVE_RECORDS, validatePayload, encodeArchive, decodeArchive, inspectArchive };
}
