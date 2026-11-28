import { addressOfSecret } from '@ghostpay/chain-adapters';
import {
  deriveStealthSecret,
  encodeMetaAddress,
  GhostPayCryptoError,
  parseCompressedPoint,
  secretScalarFromBytes,
  unsafeRevealSecret,
  zeroize,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { canonicalize, parseStrictJson, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { createKeystoreApi } from './keystore-portable.js';
import { PortableVaultError, type PortableErrorConstructor, type PortableMessageDescriptor as MessageDescriptor, type PortableMessageKey } from './portable-errors.js';


/**
 * Spec 18 stealth key export codecs. The normative byte formats are docs/specs/18-stealth-keypair-export-formats.md;
 * the reference vectors are test-vectors/stealth-export.json. These formats never reuse the legacy keystore schema,
 * and no invoice-signing key ever enters them.
 */
export type StealthExportScope = 'single' | 'selected' | 'all-discovered';

export type StealthExportFormat = 'public' | 'keypair' | 'master';

/** Stable on-chain locator of the announcement (`blockHash` + `logIndex`); the transaction hash is omitted when unknown. */
export interface StealthAnnouncementLocator {
  readonly blockHash: string;
  /** Decimal, no leading zeros: block numbers are 64-bit. */
  readonly blockNumber: string;
  readonly logIndex: number;
  readonly transactionHash?: string;
}

/** `ghostpay-stealth-public-v1`: a public payment record. It holds no secret; key ownership is not payment confirmation. */
export interface StealthPublicRecord {
  readonly format: 'ghostpay-stealth-public-v1';
  readonly version: 1;
  readonly schemeId: 1;
  readonly chainId: number;
  /** EIP-55. */
  readonly stealthAddress: string;
  readonly publicKey: { readonly encoding: 'secp256k1-compressed'; readonly value: string };
  readonly ephemeralPublicKey: string;
  /** The announced `metadata[0]`; a scan filter only (a deep-scan payment may carry a tag that differs from the derived one). */
  readonly viewTag: string;
  readonly announcement: StealthAnnouncementLocator;
  /** RFC 3339 UTC, whole seconds. */
  readonly exportedAt: string;
}

export interface StealthKdfParams {
  readonly name: 'scrypt';
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly dkLen: 32;
  readonly salt: string;
}

export interface StealthCipherParams {
  readonly name: 'AES-256-GCM';
  readonly iv: string;
  readonly tagLength: 128;
}

/** Public header of `ghostpay-stealth-keypair-v1`: everything except the ciphertext, all of it authenticated as AAD. */
export interface StealthKeypairHeader {
  readonly format: 'ghostpay-stealth-keypair-v1';
  readonly version: 1;
  readonly scope: StealthExportScope;
  readonly chainId: number;
  readonly count: number;
  readonly payments: readonly StealthPublicRecord[];
  readonly kdf: StealthKdfParams;
  readonly cipher: StealthCipherParams;
}

/** Public header of `ghostpay-stealth-master-v1`. */
export interface StealthMasterHeader {
  readonly format: 'ghostpay-stealth-master-v1';
  readonly version: 1;
  readonly schemeId: 1;
  readonly derivation: 'eip5564-scheme1-adr0001';
  readonly metaAddress: string;
  readonly spendingPublicKey: string;
  readonly viewingPublicKey: string;
  readonly exportedAt: string;
  readonly kdf: StealthKdfParams;
  readonly cipher: StealthCipherParams;
}

/** The announcement fields the exporter needs; a chain-adapters `ScannedAnnouncement` is assignable. */
export interface StealthExportAnnouncement {
  readonly schemeId: bigint;
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: string;
  readonly metadata: string;
  readonly blockHash: string;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash?: string;
}

/** A public record and the one-time key that was independently verified to control it. The caller owns and wipes `secret`. */
export interface VerifiedStealthPayment {
  readonly record: StealthPublicRecord;
  readonly secret: SecretScalar;
}

export interface VerifiedPaymentInput {
  /** The chain the scan found the announcement on; never relabelled. */
  readonly chainId: number;
  readonly announcement: StealthExportAnnouncement;
  readonly keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>;
  readonly exportedAt: Date;
}

export interface PaymentKeysOptions {
  readonly scope: StealthExportScope;
  readonly passphrase: string;
  /** scrypt cost; production uses 2^17 (the default). Only tests lower it. */
  readonly N?: number;
}

export interface PaymentKeysDecryptOptions {
  /** When set, a file for any other chain is refused before the KDF. */
  readonly expectedChainId?: number;
}

export interface DecryptedPaymentKeys {
  readonly header: StealthKeypairHeader;
  readonly payments: readonly VerifiedStealthPayment[];
}

export interface MasterSecrets {
  readonly spendingSecret: SecretScalar;
  readonly viewingSecret: SecretScalar;
}

export interface MasterBackupOptions {
  readonly passphrase: string;
  readonly exportedAt: Date;
  /** scrypt cost; production uses 2^17 (the default). Only tests lower it. */
  readonly N?: number;
}

export interface DecryptedMasterBackup extends MasterSecrets {
  readonly header: StealthMasterHeader;
}


/** Same stealth export codec for browser and CLI; the caller controls presentation of fixed diagnostics. */
export function createStealthExportApi(
  UserFacingError: PortableErrorConstructor = PortableVaultError,
  displayMessage: (message: MessageDescriptor) => string = (message) => message.key,
) {
const { DEFAULT_SCRYPT, passphraseProblemMessage } = createKeystoreApi(UserFacingError, displayMessage);

const PUBLIC_FORMAT = 'ghostpay-stealth-public-v1';

const KEYPAIR_FORMAT = 'ghostpay-stealth-keypair-v1';

const MASTER_FORMAT = 'ghostpay-stealth-master-v1';

/** Any version of the three format families, as the reference decoder routes them (format section 9). */
const FAMILY_FORMAT = /^ghostpay-stealth-(?:public|keypair|master)-v[0-9]+$/;

/** AAD domains; a new format version gets a new domain, so a file can never be opened as another format. */
const KEYPAIR_DOMAIN = 'GhostPay.stealth-keypair.v1';

const MASTER_DOMAIN = 'GhostPay.stealth-master.v1';

const DERIVATION = 'eip5564-scheme1-adr0001';

const LIMITS = { publicRecordBytes: 4096, keypairFileBytes: 1_048_576, masterFileBytes: 8192, maxPayments: 1024 } as const;

/** Fixed, secret-free download names (format section 1.7). */
const FILENAMES = {
  public: 'ghostpay-stealth-public.json',
  keypair: 'ghostpay-stealth-keypair.json',
  keypairs: 'ghostpay-stealth-keypairs.json',
  master: 'ghostpay-stealth-master.json',
  privateKey: 'ghostpay-stealth-private-key.txt',
} as const;

/** Import bounds (format section 3), validated before any KDF work. */
const MIN_N = 1 << 14;

const MAX_N = 1 << 18;

const MAX_R = 8;

const MAX_P = 2;

const TAG_BYTES = 16;

const MAX_BLOCK_NUMBER = (1n << 64n) - 1n;

const SCOPES: readonly StealthExportScope[] = ['single', 'selected', 'all-discovered'];

const RECORD_KEYS = ['format', 'version', 'schemeId', 'chainId', 'stealthAddress', 'publicKey', 'ephemeralPublicKey', 'viewTag', 'announcement', 'exportedAt'];

const LOCATOR_KEYS = ['blockHash', 'blockNumber', 'logIndex'];

const KEYPAIR_KEYS = ['format', 'version', 'scope', 'chainId', 'count', 'payments', 'kdf', 'cipher', 'ciphertext'];

const MASTER_KEYS = ['format', 'version', 'schemeId', 'derivation', 'metaAddress', 'spendingPublicKey', 'viewingPublicKey', 'exportedAt', 'kdf', 'cipher', 'ciphertext'];

/** Printable ASCII plus the three JSON whitespace characters; anything else anywhere in a file is refused. */
const ASCII = /^[\t\n\r\x20-\x7e]*$/;

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const INVALID_FILE: MessageDescriptor = { key: 'error.stealthExport.invalidFile' };

const INVALID_RECORD: MessageDescriptor = { key: 'error.stealthExport.invalidRecord' };


function refuse(key: PortableMessageKey, values?: Readonly<Record<string, string>>): never {
  throw new UserFacingError(values === undefined ? { key } : { key, values });
}

function invalid(bad: MessageDescriptor): never {
  throw new UserFacingError(bad);
}

/** Runs `body`; any failure that is not already a public diagnostic becomes `fallback`, so no foreign message escapes. */
function guarded<T>(fallback: MessageDescriptor, body: () => T): T {
  try {
    return body();
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError(fallback);
  }
}


function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) return refuse('error.stealthExport.noWebCrypto');
  return s;
}

/** The keystore KDF profile: scrypt over the NFKC passphrase, imported as a non-extractable AES-GCM key; the raw key is wiped. */
async function derive(pass: string, salt: Uint8Array, N: number, r: number, p: number): Promise<CryptoKey> {
  const webCrypto = subtle();
  const passwordBytes = utf8ToBytes(pass.normalize('NFKC'));
  let raw: Uint8Array | undefined;
  try {
    raw = await scryptAsync(passwordBytes, salt, { N, r, p, dkLen: 32, maxmem: 2 ** 29 });
    return await webCrypto.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    passwordBytes.fill(0);
    raw?.fill(0);
  }
}

function randomSource(): Pick<Crypto, 'getRandomValues'> {
  const source = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (typeof source?.getRandomValues !== 'function') return refuse('error.stealthExport.noWebCrypto');
  return source as Pick<Crypto, 'getRandomValues'>;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  randomSource().getRandomValues(b);
  return b;
}

/** Exports need AES-GCM and a secure random source; check both before any key handling so the refusal is specific. */
function requireWebCrypto(): void {
  subtle();
  randomSource();
}

/** Binds every public header field (format section 3); the header never contains the ciphertext. */
function aad(domain: string, header: object): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`${domain}\n${canonicalize(header)}`);
}

function exportCost(N: number | undefined): number {
  const cost = N ?? DEFAULT_SCRYPT.N;
  if (!Number.isInteger(cost) || cost < MIN_N || cost > MAX_N || (cost & (cost - 1)) !== 0) return refuse('error.stealthExport.invalidScryptCost');
  return cost;
}

function checkPassphrase(passphrase: unknown): string {
  const problem = passphraseProblemMessage(typeof passphrase === 'string' ? passphrase : '');
  if (problem !== undefined) throw new UserFacingError(problem);
  return passphrase as string;
}


// --- strict field validators: every one either returns the exact accepted value or throws `bad` ---------------------

function object(v: unknown, keys: readonly string[], bad: MessageDescriptor): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return invalid(bad);
  const actual = Object.keys(v).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) return invalid(bad);
  return v as Record<string, unknown>;
}

function integer(v: unknown, min: number, max: number, bad: MessageDescriptor): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return invalid(bad);
  return v;
}

function lowerHex(v: unknown, minBytes: number, maxBytes: number, bad: MessageDescriptor): string {
  if (typeof v !== 'string' || v.length < 2 + 2 * minBytes || v.length > 2 + 2 * maxBytes || !/^0x(?:[0-9a-f]{2})+$/.test(v)) return invalid(bad);
  return v;
}

function point(v: unknown, bad: MessageDescriptor): string {
  if (typeof v !== 'string' || !/^0x0[23][0-9a-f]{64}$/.test(v)) return invalid(bad);
  guarded(bad, () => parseCompressedPoint(hexToBytes(v.slice(2))));
  return v;
}

/** EIP-55 checksum of 40 lowercase hex digits. */
function checksumAddress(lower: string): string {
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const c = lower[i] as string;
    out += Number.parseInt(hash[i] as string, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

function eip55(v: unknown, bad: MessageDescriptor): string {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v) || checksumAddress(v.slice(2).toLowerCase()) !== v) return invalid(bad);
  return v;
}

/** keccak256(uncompressed(point)[1:])[12:], EIP-55; `point` is already validated. */
function addressOfPublicKey(pointHex: string): string {
  const xy = secp256k1.Point.fromBytes(hexToBytes(pointHex.slice(2))).toBytes(false).subarray(1);
  return checksumAddress(bytesToHex(keccak_256(xy).subarray(12)));
}

function timestamp(v: unknown, bad: MessageDescriptor): string {
  if (typeof v !== 'string' || !TIME.test(v)) return invalid(bad);
  const ms = Date.parse(v);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== `${v.slice(0, 19)}.000Z`) return invalid(bad);
  return v;
}

/** RFC 3339 UTC with whole seconds (sub-second precision is dropped, never rounded up). */
function formatTime(date: unknown): string {
  if (!(date instanceof Date)) return refuse('error.stealthExport.invalidTime');
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return refuse('error.stealthExport.invalidTime');
  const iso = new Date(ms - (((ms % 1000) + 1000) % 1000)).toISOString();
  return guarded({ key: 'error.stealthExport.invalidTime' }, () => timestamp(`${iso.slice(0, 19)}Z`, { key: 'error.stealthExport.invalidTime' }));
}

function blockNumber(v: unknown, bad: MessageDescriptor): string {
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(v) || BigInt(v) > MAX_BLOCK_NUMBER) return invalid(bad);
  return v;
}

function locator(v: unknown, bad: MessageDescriptor): StealthAnnouncementLocator {
  const withTx = typeof v === 'object' && v !== null && Object.keys(v).includes('transactionHash');
  const a = object(v, withTx ? [...LOCATOR_KEYS, 'transactionHash'] : LOCATOR_KEYS, bad);
  const base = {
    blockHash: lowerHex(a['blockHash'], 32, 32, bad),
    blockNumber: blockNumber(a['blockNumber'], bad),
    logIndex: integer(a['logIndex'], 0, Number.MAX_SAFE_INTEGER, bad),
  };
  return withTx ? { ...base, transactionHash: lowerHex(a['transactionHash'], 32, 32, bad) } : base;
}

/**
 * An object of `format` version 1 with exactly `keys`. A later version of the same format family is reported as such
 * (before the key set, which a later version may change); readers never reinterpret another identifier.
 */
function shaped(v: unknown, format: string, keys: readonly string[], bad: MessageDescriptor): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return invalid(bad);
  const f = v as Record<string, unknown>;
  const family = format.slice(0, format.lastIndexOf('-v') + 2);
  const claimed = f['format'];
  if (typeof claimed === 'string' && claimed !== format && claimed.startsWith(family) && /^[0-9]+$/.test(claimed.slice(family.length))) refuse('error.stealthExport.unsupportedVersion');
  if (claimed !== format) invalid(bad);
  const version = f['version'];
  if (typeof version === 'number' && Number.isSafeInteger(version) && version !== 1) refuse('error.stealthExport.unsupportedVersion');
  if (version !== 1) invalid(bad);
  return object(f, keys, bad);
}

function schemeOne(v: unknown, bad: MessageDescriptor): 1 {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v !== 1) refuse('error.stealthExport.unsupportedScheme');
  if (v !== 1) invalid(bad);
  return 1;
}

/**
 * Validates one public record exactly (format section 2), including that its public key is a curve point whose address
 * is `stealthAddress`. Returns a fresh object in the documented key order, built only from values read once.
 */
function validateRecord(v: unknown, bad: MessageDescriptor): StealthPublicRecord {
  const r = shaped(v, PUBLIC_FORMAT, RECORD_KEYS, bad);
  const schemeId = schemeOne(r['schemeId'], bad);
  const chainId = integer(r['chainId'], 1, Number.MAX_SAFE_INTEGER, bad);
  const stealthAddress = eip55(r['stealthAddress'], bad);
  const pk = object(r['publicKey'], ['encoding', 'value'], bad);
  if (pk['encoding'] !== 'secp256k1-compressed') invalid(bad);
  const value = point(pk['value'], bad);
  const ephemeralPublicKey = point(r['ephemeralPublicKey'], bad);
  const viewTag = lowerHex(r['viewTag'], 1, 1, bad);
  const announcement = locator(r['announcement'], bad);
  const exportedAt = timestamp(r['exportedAt'], bad);
  if (addressOfPublicKey(value) !== stealthAddress) refuse('error.stealthExport.keyDoesNotMatch');
  return {
    format: PUBLIC_FORMAT, version: 1, schemeId, chainId, stealthAddress,
    publicKey: { encoding: 'secp256k1-compressed', value }, ephemeralPublicKey, viewTag, announcement, exportedAt,
  };
}

function kdfParams(v: unknown, bad: MessageDescriptor): StealthKdfParams {
  const k = object(v, ['name', 'N', 'r', 'p', 'dkLen', 'salt'], bad);
  if (k['name'] !== 'scrypt' || k['dkLen'] !== 32) invalid(bad);
  const N = integer(k['N'], MIN_N, MAX_N, bad);
  if ((N & (N - 1)) !== 0) invalid(bad);
  return { name: 'scrypt', N, r: integer(k['r'], 1, MAX_R, bad), p: integer(k['p'], 1, MAX_P, bad), dkLen: 32, salt: lowerHex(k['salt'], 16, 64, bad) };
}

function cipherParams(v: unknown, bad: MessageDescriptor): StealthCipherParams {
  const c = object(v, ['name', 'iv', 'tagLength'], bad);
  if (c['name'] !== 'AES-256-GCM' || c['tagLength'] !== 128) invalid(bad);
  return { name: 'AES-256-GCM', iv: lowerHex(c['iv'], 12, 12, bad), tagLength: 128 };
}

/**
 * Bounds, then the character set, then strict JSON (duplicate keys rejected): nothing is parsed before the size check.
 * Only ASCII passes, so the UTF-16 length checked first is also the byte length.
 */
function parseText(text: unknown, maxBytes: number): unknown {
  if (typeof text !== 'string') return invalid(INVALID_FILE);
  if (text.length > maxBytes) return refuse('error.stealthExport.tooLarge');
  if (!ASCII.test(text)) return invalid(INVALID_FILE);
  return guarded(INVALID_FILE, () => parseStrictJson(text));
}

/** True only when `secret` is a key whose compressed public key and address are exactly the record's. */
function sameKey(secret: unknown, record: StealthPublicRecord): boolean {
  if (!(secret instanceof Uint8Array)) return false;
  try {
    return `0x${signerPublicKeyHex(secret)}` === record.publicKey.value && addressOfSecret(secret as SecretScalar) === record.stealthAddress;
  } catch {
    return false;
  }
}


// --- fixed canonical bodies, written and read as bytes so no secret ever becomes a JS string ------------------------

const HEX_DIGITS = utf8ToBytes('0123456789abcdef');

/** canonical(body) for a body whose only values are 32-byte keys: `literals[0] key0 literals[1] ... key(n-1) literals[n]`. */
function encodeBody(literals: readonly string[], keys: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const parts = literals.map((l) => utf8ToBytes(l));
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0) + 64 * keys.length);
  let at = 0;
  parts.forEach((part, i) => {
    out.set(part, at);
    at += part.length;
    const key = keys[i];
    if (key === undefined) return;
    for (const byte of key) {
      out[at++] = HEX_DIGITS[byte >> 4] as number;
      out[at++] = HEX_DIGITS[byte & 15] as number;
    }
  });
  return out;
}

function nibble(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x61 && c <= 0x66) return c - 0x57;
  return -1;
}

/** Inverse of {@link encodeBody}: the plaintext must be exactly the canonical body, or nothing is returned. */
function decodeBody(plain: Uint8Array, literals: readonly string[]): Uint8Array[] | undefined {
  const parts = literals.map((l) => utf8ToBytes(l));
  const count = parts.length - 1;
  if (plain.length !== parts.reduce((sum, p) => sum + p.length, 0) + 64 * count) return undefined;
  const keys: Uint8Array[] = [];
  let at = 0;
  for (let i = 0; i <= count; i++) {
    const part = parts[i] as Uint8Array;
    for (const byte of part) if (plain[at++] !== byte) { zeroize(...keys); return undefined; }
    if (i === count) break;
    const key = new Uint8Array(32);
    keys.push(key);
    for (let j = 0; j < 32; j++) {
      const hi = nibble(plain[at++] as number);
      const lo = nibble(plain[at++] as number);
      if (hi < 0 || lo < 0) { zeroize(...keys); return undefined; }
      key[j] = (hi << 4) | lo;
    }
  }
  return keys;
}

const keypairLiterals = (count: number): string[] => ['{"privateKeys":["0x', ...Array<string>(count - 1).fill('","0x'), '"]}'];

const MASTER_LITERALS = ['{"spendingKey":"0x', '","viewingKey":"0x', '"}'];

/** Exact ciphertext length (canonical body plus the GCM tag), checked before the KDF. */
const sealedLength = (literals: readonly string[]): number => literals.reduce((sum, l) => sum + l.length, 0) + 64 * (literals.length - 1) + TAG_BYTES;

/** Reveals each secret only into the body buffer; the revealed copies are wiped before returning. */
function bodyOf(literals: readonly string[], secrets: readonly SecretScalar[]): Uint8Array<ArrayBuffer> {
  const revealed = secrets.map((s) => unsafeRevealSecret(s));
  try {
    return encodeBody(literals, revealed);
  } finally {
    zeroize(...revealed);
  }
}

async function seal(domain: string, header: object, kdf: StealthKdfParams, cipher: StealthCipherParams, passphrase: string, plain: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    const key = await derive(passphrase, hexToBytes(kdf.salt.slice(2)), kdf.N, kdf.r, kdf.p);
    const iv = hexToBytes(cipher.iv.slice(2)) as Uint8Array<ArrayBuffer>;
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(domain, header), tagLength: 128 }, key, plain));
    return `0x${bytesToHex(ct)}`;
  } finally {
    plain.fill(0);
  }
}

/** Wrong passphrase and any header/ciphertext tampering are one error by design. */
async function open(domain: string, header: object, kdf: StealthKdfParams, cipher: StealthCipherParams, ciphertext: string, passphrase: unknown): Promise<Uint8Array> {
  if (typeof passphrase !== 'string') return refuse('error.stealthExport.wrongPassphraseOrModified');
  const key = await derive(passphrase, hexToBytes(kdf.salt.slice(2)), kdf.N, kdf.r, kdf.p);
  try {
    const iv = hexToBytes(cipher.iv.slice(2)) as Uint8Array<ArrayBuffer>;
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aad(domain, header), tagLength: 128 }, key, hexToBytes(ciphertext.slice(2))));
  } catch {
    return refuse('error.stealthExport.wrongPassphraseOrModified');
  }
}

/** A fresh 16-byte salt and 12-byte IV, drawn together as one 28-byte request (salt first). */
function freshEnvelope(N: number): { kdf: StealthKdfParams; cipher: StealthCipherParams } {
  const fresh = randomBytes(28);
  return {
    kdf: { name: 'scrypt', N, r: DEFAULT_SCRYPT.r, p: DEFAULT_SCRYPT.p, dkLen: 32, salt: `0x${bytesToHex(fresh.subarray(0, 16))}` },
    cipher: { name: 'AES-256-GCM', iv: `0x${bytesToHex(fresh.subarray(16))}`, tagLength: 128 },
  };
}


// --- K01: verified derivation and the public record ------------------------------------------------------------------

/**
 * Derives the one-time key of a scanned scheme-1 announcement and builds its public record. Deep-scan payments
 * (announced view tag differs from the derived tag) are eligible: only the address comparison decides ownership. The
 * address is then recomputed independently from the derived key and compared with the announced one.
 */
function buildVerifiedPayment(input: VerifiedPaymentInput): VerifiedStealthPayment {
  const { chainId, announcement: a, keys } = input;
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId < 1) return refuse('error.stealthExport.invalidChain');
  if (a.schemeId !== 1n) return refuse('error.stealthExport.unsupportedScheme');
  const exportedAt = formatTime(input.exportedAt);
  const bad: MessageDescriptor = { key: 'error.stealthExport.invalidAnnouncement' };
  const fields = guarded(bad, () => {
    if (typeof a.blockNumber !== 'bigint' || a.blockNumber < 0n || a.blockNumber > MAX_BLOCK_NUMBER) invalid(bad);
    if (typeof a.metadata !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(a.metadata)) invalid(bad);
    if (typeof a.stealthAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(a.stealthAddress)) invalid(bad);
    const tx = a.transactionHash;
    if (tx !== undefined && (typeof tx !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(tx))) invalid(bad);
    if (typeof a.blockHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(a.blockHash)) invalid(bad);
    const base = { blockHash: a.blockHash.toLowerCase(), blockNumber: a.blockNumber.toString(), logIndex: integer(a.logIndex, 0, Number.MAX_SAFE_INTEGER, bad) };
    return {
      ephemeralPublicKey: point(typeof a.ephemeralPublicKey === 'string' ? a.ephemeralPublicKey.toLowerCase() : undefined, bad),
      viewTag: `0x${a.metadata.slice(2, 4).toLowerCase()}`,
      announcement: tx === undefined ? base : { ...base, transactionHash: tx.toLowerCase() },
    };
  });
  let secret: SecretScalar;
  try {
    secret = deriveStealthSecret({ schemeId: 1n, stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata }, keys, { ignoreViewTag: true });
  } catch (error) {
    if (error instanceof GhostPayCryptoError && error.code === 'INVALID_ANNOUNCEMENT') return invalid(bad);
    return refuse('error.stealthExport.keyDoesNotMatch');
  }
  try {
    const record = guarded({ key: 'error.stealthExport.keyDoesNotMatch' }, () => {
      const stealthAddress = addressOfSecret(secret);
      if (stealthAddress.toLowerCase() !== a.stealthAddress.toLowerCase()) refuse('error.stealthExport.keyDoesNotMatch');
      return validateRecord({
        format: PUBLIC_FORMAT, version: 1, schemeId: 1, chainId, stealthAddress,
        publicKey: { encoding: 'secp256k1-compressed', value: `0x${signerPublicKeyHex(secret)}` },
        ...fields, exportedAt,
      }, INVALID_RECORD);
    });
    return { record, secret };
  } catch (error) {
    zeroize(secret);
    throw error;
  }
}

/** Pretty JSON (2-space indent) of a validated public record; it contains no secret by construction. */
function serializePublicRecord(record: StealthPublicRecord): string {
  return JSON.stringify(validateRecord(record, INVALID_RECORD), null, 2);
}

function parsePublicRecord(text: string): StealthPublicRecord {
  return validateRecord(parseText(text, LIMITS.publicRecordBytes), INVALID_FILE);
}


// --- K02/K05: encrypted payment keys (single file or bulk archive) -------------------------------------------------

/** Locator order for export-time deduplication: lowest (blockNumber, logIndex), then blockHash, then the canonical record. */
function earlier(x: StealthPublicRecord, y: StealthPublicRecord): boolean {
  const bx = BigInt(x.announcement.blockNumber);
  const by = BigInt(y.announcement.blockNumber);
  if (bx !== by) return bx < by;
  if (x.announcement.logIndex !== y.announcement.logIndex) return x.announcement.logIndex < y.announcement.logIndex;
  if (x.announcement.blockHash !== y.announcement.blockHash) return x.announcement.blockHash < y.announcement.blockHash;
  return canonicalize(x) < canonicalize(y);
}

function parseKeypairFile(text: unknown): { header: StealthKeypairHeader; ciphertext: string } {
  const f = shaped(parseText(text, LIMITS.keypairFileBytes), KEYPAIR_FORMAT, KEYPAIR_KEYS, INVALID_FILE);
  const scope = f['scope'];
  if (typeof scope !== 'string' || !(SCOPES as readonly string[]).includes(scope)) return invalid(INVALID_FILE);
  const chainId = integer(f['chainId'], 1, Number.MAX_SAFE_INTEGER, INVALID_FILE);
  const count = integer(f['count'], 1, LIMITS.maxPayments, INVALID_FILE);
  const list = f['payments'];
  if ((scope === 'single' && count !== 1) || !Array.isArray(list) || list.length !== count) return invalid(INVALID_FILE);
  const kdf = kdfParams(f['kdf'], INVALID_FILE);
  const cipher = cipherParams(f['cipher'], INVALID_FILE);
  const sealed = sealedLength(keypairLiterals(count));
  const ciphertext = lowerHex(f['ciphertext'], sealed, sealed, INVALID_FILE);
  const payments = list.map((entry) => validateRecord(entry, INVALID_FILE));
  if (payments.some((p) => p.chainId !== chainId)) return invalid(INVALID_FILE);
  const addresses = payments.map((p) => p.stealthAddress.toLowerCase());
  if (new Set(addresses).size !== addresses.length) return refuse('error.stealthExport.duplicate');
  if (addresses.some((a, i) => i > 0 && (addresses[i - 1] as string) >= a)) return invalid(INVALID_FILE);
  return { header: { format: KEYPAIR_FORMAT, version: 1, scope: scope as StealthExportScope, chainId, count, payments, kdf, cipher }, ciphertext };
}

/**
 * Encrypts verified payment keys as one `ghostpay-stealth-keypair-v1` file (pretty JSON text). Every input key is
 * checked against its own record first, so a mismatched pair refuses the export even where deduplication would drop
 * it. Entries for one address then collapse to the earliest locator; the same address with a different ephemeral key
 * is a conflict and nothing is exported. The caller keeps ownership of the input secrets.
 */
async function encryptPaymentKeys(items: readonly VerifiedStealthPayment[], options: PaymentKeysOptions): Promise<string> {
  requireWebCrypto();
  const passphrase = checkPassphrase(options.passphrase);
  const N = exportCost(options.N);
  const scope = options.scope;
  const list: unknown = items;
  if (!SCOPES.includes(scope) || !Array.isArray(list) || items.length === 0) return refuse('error.stealthExport.scopeMismatch');
  const entries = items.map((item) => ({ record: validateRecord(item.record, INVALID_RECORD), secret: item.secret }));
  const chainId = (entries[0] as (typeof entries)[number]).record.chainId;
  if (entries.some((e) => e.record.chainId !== chainId)) return refuse('error.stealthExport.mixedChains');
  // Before deduplication, which keeps one entry per address and would never look at a dropped duplicate's key.
  if (entries.some((e) => !sameKey(e.secret, e.record))) return refuse('error.stealthExport.keyDoesNotMatch');
  const kept = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const address = entry.record.stealthAddress.toLowerCase();
    const other = kept.get(address);
    if (other === undefined) kept.set(address, entry);
    else if (other.record.ephemeralPublicKey !== entry.record.ephemeralPublicKey) return refuse('error.stealthExport.conflict');
    else if (earlier(entry.record, other.record)) kept.set(address, entry);
  }
  const count = kept.size;
  if (count > LIMITS.maxPayments) return refuse('error.stealthExport.tooMany', { maximum: String(LIMITS.maxPayments) });
  if (scope === 'single' && count !== 1) return refuse('error.stealthExport.scopeMismatch');
  const sorted = [...kept.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([, entry]) => entry);
  const { kdf, cipher } = freshEnvelope(N);
  const header: StealthKeypairHeader = { format: KEYPAIR_FORMAT, version: 1, scope, chainId, count, payments: sorted.map((e) => e.record), kdf, cipher };
  const ciphertext = await seal(KEYPAIR_DOMAIN, header, kdf, cipher, passphrase, bodyOf(keypairLiterals(count), sorted.map((e) => e.secret)));
  return JSON.stringify({ ...header, ciphertext }, null, 2);
}

/** Validates the complete public header (bounds, records, order, KDF and cipher parameters) without any KDF work. */
function inspectPaymentKeys(text: string): StealthKeypairHeader {
  return parseKeypairFile(text).header;
}

/** Atomic import: every key is checked against its record, or nothing is returned and every decrypted secret is wiped. */
async function decryptPaymentKeys(text: string, passphrase: string, options: PaymentKeysDecryptOptions = {}): Promise<DecryptedPaymentKeys> {
  const { header, ciphertext } = parseKeypairFile(text);
  const expected = options.expectedChainId;
  if (expected !== undefined) {
    if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 1) return refuse('error.stealthExport.invalidChain');
    if (expected !== header.chainId) return refuse('error.stealthExport.wrongChain');
  }
  const plain = await open(KEYPAIR_DOMAIN, header, header.kdf, header.cipher, ciphertext, passphrase);
  const secrets: SecretScalar[] = [];
  try {
    const raw = decodeBody(plain, keypairLiterals(header.count));
    if (raw === undefined) return invalid(INVALID_FILE);
    try {
      for (const bytes of raw) secrets.push(guarded(INVALID_FILE, () => secretScalarFromBytes(bytes)));
    } finally {
      zeroize(...raw);
    }
    if (header.payments.some((record, i) => !sameKey(secrets[i], record))) return refuse('error.stealthExport.keyDoesNotMatch');
    return { header, payments: header.payments.map((record, i) => ({ record, secret: secrets[i] as SecretScalar })) };
  } catch (error) {
    zeroize(...secrets);
    throw error;
  } finally {
    plain.fill(0);
  }
}


// --- K06: master spending and viewing backup -----------------------------------------------------------------------

function parseMasterFile(text: unknown): { header: StealthMasterHeader; ciphertext: string } {
  const f = shaped(parseText(text, LIMITS.masterFileBytes), MASTER_FORMAT, MASTER_KEYS, INVALID_FILE);
  const schemeId = schemeOne(f['schemeId'], INVALID_FILE);
  if (f['derivation'] !== DERIVATION) return invalid(INVALID_FILE);
  const spendingPublicKey = point(f['spendingPublicKey'], INVALID_FILE);
  const viewingPublicKey = point(f['viewingPublicKey'], INVALID_FILE);
  const metaAddress = f['metaAddress'];
  const encoded = guarded(INVALID_FILE, () => encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(hexToBytes(spendingPublicKey.slice(2))), viewingPublicKey: parseCompressedPoint(hexToBytes(viewingPublicKey.slice(2))) }));
  if (metaAddress !== encoded) return invalid(INVALID_FILE);
  const exportedAt = timestamp(f['exportedAt'], INVALID_FILE);
  const kdf = kdfParams(f['kdf'], INVALID_FILE);
  const cipher = cipherParams(f['cipher'], INVALID_FILE);
  const sealed = sealedLength(MASTER_LITERALS);
  const ciphertext = lowerHex(f['ciphertext'], sealed, sealed, INVALID_FILE);
  return { header: { format: MASTER_FORMAT, version: 1, schemeId, derivation: DERIVATION, metaAddress: encoded, spendingPublicKey, viewingPublicKey, exportedAt, kdf, cipher }, ciphertext };
}

function masterPublicKey(secret: unknown): string {
  return guarded({ key: 'error.stealthExport.masterKeysDoNotMatch' }, () => {
    if (!(secret instanceof Uint8Array)) throw new Error();
    const copy = unsafeRevealSecret(secret as SecretScalar);
    try {
      zeroize(secretScalarFromBytes(copy));
      return `0x${signerPublicKeyHex(copy)}`;
    } finally {
      zeroize(copy);
    }
  });
}

/** Encrypts the master spending and viewing secrets as `ghostpay-stealth-master-v1`. Only these two keys are ever read. */
async function encryptMasterBackup(keys: MasterSecrets, options: MasterBackupOptions): Promise<string> {
  requireWebCrypto();
  const passphrase = checkPassphrase(options.passphrase);
  const N = exportCost(options.N);
  const exportedAt = formatTime(options.exportedAt);
  const spendingPublicKey = masterPublicKey(keys.spendingSecret);
  const viewingPublicKey = masterPublicKey(keys.viewingSecret);
  const metaAddress = guarded({ key: 'error.stealthExport.masterKeysDoNotMatch' }, () => encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(hexToBytes(spendingPublicKey.slice(2))), viewingPublicKey: parseCompressedPoint(hexToBytes(viewingPublicKey.slice(2))) }));
  const { kdf, cipher } = freshEnvelope(N);
  const header: StealthMasterHeader = { format: MASTER_FORMAT, version: 1, schemeId: 1, derivation: DERIVATION, metaAddress, spendingPublicKey, viewingPublicKey, exportedAt, kdf, cipher };
  const ciphertext = await seal(MASTER_DOMAIN, header, kdf, cipher, passphrase, bodyOf(MASTER_LITERALS, [keys.spendingSecret, keys.viewingSecret]));
  return JSON.stringify({ ...header, ciphertext }, null, 2);
}

function inspectMasterBackup(text: string): StealthMasterHeader {
  return parseMasterFile(text).header;
}

async function decryptMasterBackup(text: string, passphrase: string): Promise<DecryptedMasterBackup> {
  const { header, ciphertext } = parseMasterFile(text);
  const plain = await open(MASTER_DOMAIN, header, header.kdf, header.cipher, ciphertext, passphrase);
  const secrets: SecretScalar[] = [];
  try {
    const raw = decodeBody(plain, MASTER_LITERALS);
    if (raw === undefined) return invalid(INVALID_FILE);
    try {
      for (const bytes of raw) secrets.push(guarded(INVALID_FILE, () => secretScalarFromBytes(bytes)));
    } finally {
      zeroize(...raw);
    }
    const [spendingSecret, viewingSecret] = secrets as [SecretScalar, SecretScalar];
    if (masterPublicKey(spendingSecret) !== header.spendingPublicKey || masterPublicKey(viewingSecret) !== header.viewingPublicKey) return refuse('error.stealthExport.masterKeysDoNotMatch');
    return { header, spendingSecret, viewingSecret };
  } catch (error) {
    zeroize(...secrets);
    throw error;
  } finally {
    plain.fill(0);
  }
}


// --- K04 and format routing ------------------------------------------------------------------------------------------

/** Exact text of `ghostpay-stealth-private-key.txt` (format section 6) after checking the key controls the record. */
function formatRawPrivateKey(record: StealthPublicRecord, secret: SecretScalar): string {
  const r = validateRecord(record, INVALID_RECORD);
  if (!sameKey(secret, r)) return refuse('error.stealthExport.keyDoesNotMatch');
  const copy = unsafeRevealSecret(secret);
  try {
    return [
      'GhostPay one-time payment private key',
      'This is a single EVM private key, not a seed phrase or recovery phrase.',
      'It controls only the address below, including any future deposits to it.',
      'Anyone who has this key can spend funds at this address.',
      '',
      `Chain ID: ${String(r.chainId)}`,
      `Address: ${r.stealthAddress}`,
      `Private key: 0x${bytesToHex(copy)}`,
      '',
    ].join('\n');
  } finally {
    zeroize(copy);
  }
}

/** The `format` member of a bounded, ASCII-only, strict-JSON object text; undefined for anything else. Never throws. */
function claimedFormat(text: unknown): unknown {
  if (typeof text !== 'string' || text.length > LIMITS.keypairFileBytes || !ASCII.test(text)) return undefined;
  let value: unknown;
  try { value = parseStrictJson(text); } catch { return undefined; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)['format'];
}

/** Which stealth export a text claims to be; undefined for anything else. Bounded and never throws. */
function detectStealthExportFormat(text: unknown): StealthExportFormat | undefined {
  const format = claimedFormat(text);
  if (format === PUBLIC_FORMAT) return 'public';
  if (format === KEYPAIR_FORMAT) return 'keypair';
  if (format === MASTER_FORMAT) return 'master';
  return undefined;
}

/**
 * True when a text, under the same bounds as {@link detectStealthExportFormat}, claims another version of a spec 18
 * export family (`ghostpay-stealth-{public,keypair,master}-v<digits>` other than the v1 identifiers; format section 9),
 * so a reader reports an unsupported version instead of an invalid file and never reinterprets it. Never throws.
 */
function isUnsupportedStealthExportVersion(text: unknown): boolean {
  const format = claimedFormat(text);
  return typeof format === 'string' && FAMILY_FORMAT.test(format) && format !== PUBLIC_FORMAT && format !== KEYPAIR_FORMAT && format !== MASTER_FORMAT;
}

  return {
    STEALTH_PUBLIC_FORMAT: PUBLIC_FORMAT,
    STEALTH_KEYPAIR_FORMAT: KEYPAIR_FORMAT,
    STEALTH_MASTER_FORMAT: MASTER_FORMAT,
    STEALTH_KEYPAIR_DOMAIN: KEYPAIR_DOMAIN,
    STEALTH_MASTER_DOMAIN: MASTER_DOMAIN,
    STEALTH_DERIVATION: DERIVATION,
    STEALTH_EXPORT_LIMITS: LIMITS,
    STEALTH_EXPORT_FILENAMES: FILENAMES,
    STEALTH_EXPORT_SCRYPT: DEFAULT_SCRYPT,
    buildVerifiedPayment,
    serializePublicRecord,
    parsePublicRecord,
    encryptPaymentKeys,
    inspectPaymentKeys,
    decryptPaymentKeys,
    encryptMasterBackup,
    inspectMasterBackup,
    decryptMasterBackup,
    formatRawPrivateKey,
    detectStealthExportFormat,
    isUnsupportedStealthExportVersion,
  };
}
