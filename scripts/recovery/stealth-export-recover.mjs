#!/usr/bin/env node
// Independent reference decoder for the spec 18 stealth key export formats
// (docs/specs/18-stealth-keypair-export-formats.md): ghostpay-stealth-public-v1, ghostpay-stealth-keypair-v1,
// ghostpay-stealth-master-v1 and the raw private-key text. Built only on node:crypto (scrypt, AES-256-GCM) and
// @noble/curves + @noble/hashes; it imports no GhostPay package or repository source, so a successful decode proves
// the files are recoverable without GhostPay. Every rule below is reimplemented from the format document.
//
// Usage (the passphrase is read from stdin or a no-echo prompt, never from argv or the environment):
//   node scripts/recovery/stealth-export-recover.mjs <file> [--inspect] [--expected-chain <id>]
//        [--scan-announcement <json>|@<path>]... [--reveal-private-keys]
// Exit status: 0 success, 1 refused (fixed error code on stderr), 2 usage error.
import { createDecipheriv, scrypt } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export const PUBLIC_FORMAT = 'ghostpay-stealth-public-v1';
export const KEYPAIR_FORMAT = 'ghostpay-stealth-keypair-v1';
export const MASTER_FORMAT = 'ghostpay-stealth-master-v1';
export const KEYPAIR_DOMAIN = 'GhostPay.stealth-keypair.v1';
export const MASTER_DOMAIN = 'GhostPay.stealth-master.v1';
export const DERIVATION = 'eip5564-scheme1-adr0001';
/** Format section 1.6: bytes of the file text, checked before JSON parsing. */
export const LIMITS = Object.freeze({ publicRecordBytes: 4096, keypairFileBytes: 1_048_576, masterFileBytes: 8192, maxPayments: 1024 });

const N_ORDER = secp256k1.Point.Fn.ORDER;
const MAX_BLOCK_NUMBER = (1n << 64n) - 1n;
const TAG_BYTES = 16;
const SCOPES = ['single', 'selected', 'all-discovered'];
const RECORD_KEYS = ['format', 'version', 'schemeId', 'chainId', 'stealthAddress', 'publicKey', 'ephemeralPublicKey', 'viewTag', 'announcement', 'exportedAt'];
const LOCATOR_KEYS = ['blockHash', 'blockNumber', 'logIndex'];
const KEYPAIR_KEYS = ['format', 'version', 'scope', 'chainId', 'count', 'payments', 'kdf', 'cipher', 'ciphertext'];
const MASTER_KEYS = ['format', 'version', 'schemeId', 'derivation', 'metaAddress', 'spendingPublicKey', 'viewingPublicKey', 'exportedAt', 'kdf', 'cipher', 'ciphertext'];
const ASCII = /^[\t\n\r\x20-\x7e]*$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const MESSAGES = {
  conflict: 'two records share an address with different ephemeral keys',
  duplicate: 'the file repeats a stealth address',
  invalidAnnouncement: 'the announcement is malformed',
  invalidFile: 'the file is not a valid stealth export',
  keyDoesNotMatch: 'a private key does not control its recorded address',
  masterKeysDoNotMatch: 'the master keys do not match the header public keys',
  notOwned: 'the announcement does not belong to this master key pair',
  tooLarge: 'the file is larger than the format allows',
  unsupportedScheme: 'only ERC-5564 scheme 1 is supported',
  unsupportedVersion: 'this format version is not supported by this reader',
  wrongChain: 'the file is for a different chain',
  wrongPassphraseOrModified: 'wrong passphrase, or the file was modified',
};

/** Fixed-code refusal; the message never contains input or secret material. */
export class RecoveryError extends Error {
  constructor(code) {
    super(MESSAGES[code] ?? code);
    this.name = 'RecoveryError';
    this.code = code;
  }
}

const fail = (code) => {
  throw new RecoveryError(code);
};

/** Best-effort in-memory wipe; JS strings cannot be wiped, so secrets stay in byte arrays wherever possible. */
export function wipe(...buffers) {
  for (const b of buffers) if (b instanceof Uint8Array) b.fill(0);
}

// --- strict JSON (format section 1.1): duplicate keys rejected; every number is a non-negative safe integer -------

function parseStrictJson(s) {
  let i = 0;
  const ws = () => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
  };
  const value = (depth) => {
    if (depth > 8) fail('invalidFile');
    const c = s[i];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    for (const [word, v] of [['true', true], ['false', false], ['null', null]]) {
      if (s.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    const m = /^(?:0|[1-9][0-9]*)(?![-+.0-9eE])/.exec(s.slice(i, i + 32));
    if (m === null) fail('invalidFile');
    const n = Number(m[0]);
    if (!Number.isSafeInteger(n)) fail('invalidFile');
    i += m[0].length;
    return n;
  };
  const string = () => {
    i++;
    let out = '';
    for (;;) {
      if (i >= s.length) fail('invalidFile');
      const c = s[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c.charCodeAt(0) < 0x20) fail('invalidFile');
      if (c !== '\\') {
        out += c;
        i++;
        continue;
      }
      const e = s[i + 1];
      i += 2;
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (e !== undefined && Object.hasOwn(simple, e)) out += simple[e];
      else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i, i + 4))) {
        out += String.fromCharCode(Number.parseInt(s.slice(i, i + 4), 16));
        i += 4;
      } else fail('invalidFile');
    }
  };
  const array = (depth) => {
    i++;
    const out = [];
    ws();
    if (s[i] === ']') {
      i++;
      return out;
    }
    for (;;) {
      ws();
      out.push(value(depth + 1));
      ws();
      const c = s[i++];
      if (c === ']') return out;
      if (c !== ',') fail('invalidFile');
    }
  };
  const object = (depth) => {
    i++;
    const out = Object.create(null);
    ws();
    if (s[i] === '}') {
      i++;
      return out;
    }
    for (;;) {
      ws();
      if (s[i] !== '"') fail('invalidFile');
      const key = string();
      if (Object.hasOwn(out, key)) fail('invalidFile');
      ws();
      if (s[i++] !== ':') fail('invalidFile');
      ws();
      out[key] = value(depth + 1);
      ws();
      const c = s[i++];
      if (c === '}') return out;
      if (c !== ',') fail('invalidFile');
    }
  };
  ws();
  const v = value(0);
  ws();
  if (i !== s.length) fail('invalidFile');
  return v;
}

/** Format section 1.5: keys sorted by code point, no whitespace, decimal integers, JSON.stringify strings. */
export function canonical(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0) throw new TypeError('canonical: integers only');
    return String(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  throw new TypeError('canonical: unsupported value');
}

/** Size bound first, then the character set, then strict JSON; the ASCII rule makes characters equal bytes. */
function parseText(text, maxBytes) {
  if (typeof text !== 'string') fail('invalidFile');
  if (text.length > maxBytes) fail('tooLarge');
  if (!ASCII.test(text)) fail('invalidFile');
  try {
    return parseStrictJson(text);
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    return fail('invalidFile');
  }
}

// --- field validators: each returns the exact accepted value or throws `bad` ---------------------------------------

function exactObject(v, keys, bad) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(bad);
  const actual = Object.keys(v).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) fail(bad);
  return v;
}

function integer(v, min, max, bad) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(bad);
  return v;
}

function lowerHex(v, minBytes, maxBytes, bad) {
  if (typeof v !== 'string' || v.length < 2 + 2 * minBytes || v.length > 2 + 2 * maxBytes || !/^0x(?:[0-9a-f]{2})+$/.test(v)) fail(bad);
  return v;
}

function compressedPoint(v, bad) {
  if (typeof v !== 'string' || !/^0x0[23][0-9a-f]{64}$/.test(v)) fail(bad);
  try {
    secp256k1.Point.fromBytes(hexToBytes(v.slice(2))).assertValidity();
  } catch {
    fail(bad);
  }
  return v;
}

/** EIP-55 checksum of 40 lowercase hex digits (keccak256 of their ASCII). */
export function checksumAddress(lower40) {
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower40)));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += Number.parseInt(hash[i], 16) >= 8 ? lower40[i].toUpperCase() : lower40[i];
  return out;
}

function eip55(v, bad) {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v) || checksumAddress(v.slice(2).toLowerCase()) !== v) fail(bad);
  return v;
}

/** keccak256(uncompressed(P)[1:])[12:], EIP-55. */
export function addressOfPoint(pointBytes) {
  const xy = secp256k1.Point.fromBytes(pointBytes).toBytes(false).subarray(1);
  return checksumAddress(bytesToHex(keccak_256(xy).subarray(12)));
}

function timestamp(v, bad) {
  if (typeof v !== 'string' || !TIME.test(v)) fail(bad);
  const ms = Date.parse(v);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== `${v.slice(0, 19)}.000Z`) fail(bad);
  return v;
}

function blockNumber(v, bad) {
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(v) || BigInt(v) > MAX_BLOCK_NUMBER) fail(bad);
  return v;
}

/** A later version of the same format family is reported as unsupported; another identifier is never reinterpreted. */
function shaped(v, format, keys, bad) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(bad);
  const family = format.slice(0, format.lastIndexOf('-v') + 2);
  const claimed = v.format;
  if (typeof claimed === 'string' && claimed !== format && claimed.startsWith(family) && /^[0-9]+$/.test(claimed.slice(family.length))) fail('unsupportedVersion');
  if (claimed !== format) fail(bad);
  if (typeof v.version === 'number' && Number.isSafeInteger(v.version) && v.version !== 1) fail('unsupportedVersion');
  if (v.version !== 1) fail(bad);
  return exactObject(v, keys, bad);
}

function schemeOne(v, bad) {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v !== 1) fail('unsupportedScheme');
  if (v !== 1) fail(bad);
  return 1;
}

/** Format section 2. Returns a fresh record in the documented key order. */
function validateRecord(v, bad) {
  const r = shaped(v, PUBLIC_FORMAT, RECORD_KEYS, bad);
  const schemeId = schemeOne(r.schemeId, bad);
  const chainId = integer(r.chainId, 1, Number.MAX_SAFE_INTEGER, bad);
  const stealthAddress = eip55(r.stealthAddress, bad);
  const pk = exactObject(r.publicKey, ['encoding', 'value'], bad);
  if (pk.encoding !== 'secp256k1-compressed') fail(bad);
  const value = compressedPoint(pk.value, bad);
  const ephemeralPublicKey = compressedPoint(r.ephemeralPublicKey, bad);
  const viewTag = lowerHex(r.viewTag, 1, 1, bad);
  const hasTx = typeof r.announcement === 'object' && r.announcement !== null && Object.hasOwn(r.announcement, 'transactionHash');
  const a = exactObject(r.announcement, hasTx ? [...LOCATOR_KEYS, 'transactionHash'] : LOCATOR_KEYS, bad);
  const announcement = {
    blockHash: lowerHex(a.blockHash, 32, 32, bad),
    blockNumber: blockNumber(a.blockNumber, bad),
    logIndex: integer(a.logIndex, 0, Number.MAX_SAFE_INTEGER, bad),
  };
  if (hasTx) announcement.transactionHash = lowerHex(a.transactionHash, 32, 32, bad);
  const exportedAt = timestamp(r.exportedAt, bad);
  if (addressOfPoint(hexToBytes(value.slice(2))) !== stealthAddress) fail('keyDoesNotMatch');
  return {
    format: PUBLIC_FORMAT, version: 1, schemeId, chainId, stealthAddress,
    publicKey: { encoding: 'secp256k1-compressed', value }, ephemeralPublicKey, viewTag, announcement, exportedAt,
  };
}

/** Format section 3 import bounds, all checked before any KDF work. */
function kdfParams(v) {
  const k = exactObject(v, ['name', 'N', 'r', 'p', 'dkLen', 'salt'], 'invalidFile');
  if (k.name !== 'scrypt' || k.dkLen !== 32) fail('invalidFile');
  const N = integer(k.N, 1 << 14, 1 << 18, 'invalidFile');
  if ((N & (N - 1)) !== 0) fail('invalidFile');
  return { name: 'scrypt', N, r: integer(k.r, 1, 8, 'invalidFile'), p: integer(k.p, 1, 2, 'invalidFile'), dkLen: 32, salt: lowerHex(k.salt, 16, 64, 'invalidFile') };
}

function cipherParams(v) {
  const c = exactObject(v, ['name', 'iv', 'tagLength'], 'invalidFile');
  if (c.name !== 'AES-256-GCM' || c.tagLength !== 128) fail('invalidFile');
  return { name: 'AES-256-GCM', iv: lowerHex(c.iv, 12, 12, 'invalidFile'), tagLength: 128 };
}

// --- canonical bodies (format sections 4 and 5): fixed literals around 64-hex-digit scalars -----------------------

const keypairLiterals = (count) => ['{"privateKeys":["0x', ...Array(count - 1).fill('","0x'), '"]}'];
const MASTER_LITERALS = ['{"spendingKey":"0x', '","viewingKey":"0x', '"}'];
const sealedLength = (literals) => literals.reduce((sum, l) => sum + l.length, 0) + 64 * (literals.length - 1) + TAG_BYTES;

/** The plaintext must be exactly the canonical body; returns the 32-byte scalars or undefined (all wiped). */
function decodeBody(plain, literals) {
  const enc = literals.map((l) => Buffer.from(l, 'ascii'));
  if (plain.length !== enc.reduce((sum, p) => sum + p.length, 0) + 64 * (enc.length - 1)) return undefined;
  const keys = [];
  let at = 0;
  const nibble = (c) => (c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x61 && c <= 0x66 ? c - 0x57 : -1);
  for (let i = 0; i < enc.length; i++) {
    for (const byte of enc[i]) {
      if (plain[at++] !== byte) {
        wipe(...keys);
        return undefined;
      }
    }
    if (i === enc.length - 1) break;
    const key = new Uint8Array(32);
    keys.push(key);
    for (let j = 0; j < 32; j++) {
      const hi = nibble(plain[at++]);
      const lo = nibble(plain[at++]);
      if (hi < 0 || lo < 0) {
        wipe(...keys);
        return undefined;
      }
      key[j] = (hi << 4) | lo;
    }
  }
  return keys;
}

/** A scalar k with 1 <= k < n (secp256k1 order). */
function inRange(key) {
  const k = BigInt(`0x${bytesToHex(key)}`);
  return k >= 1n && k < N_ORDER;
}

const compressedOf = (key) => `0x${bytesToHex(secp256k1.getPublicKey(key, true))}`;

/** True only when `key` is the private key of exactly this record's public key and address. */
function controls(key, record) {
  const pub = secp256k1.getPublicKey(key, true);
  return `0x${bytesToHex(pub)}` === record.publicKey.value && addressOfPoint(pub) === record.stealthAddress;
}

// --- envelope (format section 3) ----------------------------------------------------------------------------------

const scryptAsync = (pass, salt, N, r, p) => new Promise((ok, reject) => {
  scrypt(pass, salt, 32, { N, r, p, maxmem: 2 ** 29 }, (error, key) => (error ? reject(error) : ok(key)));
});

/** AAD = UTF-8(DOMAIN + "\n" + canonical(header)); wrong passphrase and tampering are one error by design. */
async function openEnvelope(domain, header, ciphertextHex, passphrase) {
  if (typeof passphrase !== 'string') fail('wrongPassphraseOrModified');
  const pass = Buffer.from(passphrase.normalize('NFKC'), 'utf8');
  let key;
  try {
    key = await scryptAsync(pass, Buffer.from(header.kdf.salt.slice(2), 'hex'), header.kdf.N, header.kdf.r, header.kdf.p);
  } finally {
    wipe(pass);
  }
  const sealed = Buffer.from(ciphertextHex.slice(2), 'hex');
  const parts = [];
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(header.cipher.iv.slice(2), 'hex'), { authTagLength: TAG_BYTES });
    d.setAAD(Buffer.from(`${domain}\n${canonical(header)}`, 'utf8'));
    d.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    parts.push(d.update(sealed.subarray(0, sealed.length - TAG_BYTES)));
    parts.push(d.final());
    return Buffer.concat(parts);
  } catch {
    return fail('wrongPassphraseOrModified');
  } finally {
    wipe(key, ...parts);
  }
}

// --- public API -----------------------------------------------------------------------------------------------------

/** Validates a `ghostpay-stealth-public-v1` record (format section 2). It is not authenticated: it holds no MAC. */
export function parsePublicRecord(text) {
  return validateRecord(parseText(text, LIMITS.publicRecordBytes), 'invalidFile');
}

/** Pretty JSON in the documented key order, no trailing newline: what a conforming exporter writes. */
export function serializePublicRecord(record) {
  return JSON.stringify(validateRecord(record, 'invalidFile'), null, 2);
}

/** Validates the full `ghostpay-stealth-keypair-v1` header (format section 4) without any KDF work. */
export function inspectKeypairFile(text) {
  const f = shaped(parseText(text, LIMITS.keypairFileBytes), KEYPAIR_FORMAT, KEYPAIR_KEYS, 'invalidFile');
  const scope = f.scope;
  if (typeof scope !== 'string' || !SCOPES.includes(scope)) fail('invalidFile');
  const chainId = integer(f.chainId, 1, Number.MAX_SAFE_INTEGER, 'invalidFile');
  const count = integer(f.count, 1, LIMITS.maxPayments, 'invalidFile');
  if ((scope === 'single' && count !== 1) || !Array.isArray(f.payments) || f.payments.length !== count) fail('invalidFile');
  const kdf = kdfParams(f.kdf);
  const cipher = cipherParams(f.cipher);
  const sealed = sealedLength(keypairLiterals(count));
  const ciphertext = lowerHex(f.ciphertext, sealed, sealed, 'invalidFile');
  const payments = f.payments.map((entry) => validateRecord(entry, 'invalidFile'));
  if (payments.some((p) => p.chainId !== chainId)) fail('invalidFile');
  const addresses = payments.map((p) => p.stealthAddress.toLowerCase());
  if (new Set(addresses).size !== addresses.length) fail('duplicate');
  if (addresses.some((a, i) => i > 0 && addresses[i - 1] >= a)) fail('invalidFile');
  return { header: { format: KEYPAIR_FORMAT, version: 1, scope, chainId, count, payments, kdf, cipher }, ciphertext };
}

/**
 * Atomic decryption of a keypair file: either every key is in range and controls its record, or nothing is returned
 * and every decrypted byte is wiped. The caller owns and wipes the returned `privateKey` arrays.
 */
export async function decryptKeypairFile(text, passphrase, { expectedChainId } = {}) {
  const { header, ciphertext } = inspectKeypairFile(text);
  if (expectedChainId !== undefined && expectedChainId !== header.chainId) fail('wrongChain');
  const plain = await openEnvelope(KEYPAIR_DOMAIN, header, ciphertext, passphrase);
  let keys;
  try {
    keys = decodeBody(plain, keypairLiterals(header.count));
    if (keys === undefined || !keys.every(inRange)) fail('invalidFile');
    if (header.payments.some((record, i) => !controls(keys[i], record))) fail('keyDoesNotMatch');
    return { header, payments: header.payments.map((record, i) => ({ record, privateKey: keys[i] })) };
  } catch (error) {
    if (keys !== undefined) wipe(...keys);
    throw error;
  } finally {
    wipe(plain);
  }
}

/** `st:eth:0x` + compressed spending key hex + compressed viewing key hex. */
export const metaAddressOf = (spendingPublicKey, viewingPublicKey) => `st:eth:0x${spendingPublicKey.slice(2)}${viewingPublicKey.slice(2)}`;

/** Validates the full `ghostpay-stealth-master-v1` header (format section 5) without any KDF work. */
export function inspectMasterFile(text) {
  const f = shaped(parseText(text, LIMITS.masterFileBytes), MASTER_FORMAT, MASTER_KEYS, 'invalidFile');
  const schemeId = schemeOne(f.schemeId, 'invalidFile');
  if (f.derivation !== DERIVATION) fail('invalidFile');
  const spendingPublicKey = compressedPoint(f.spendingPublicKey, 'invalidFile');
  const viewingPublicKey = compressedPoint(f.viewingPublicKey, 'invalidFile');
  if (spendingPublicKey === viewingPublicKey) fail('invalidFile');
  const metaAddress = metaAddressOf(spendingPublicKey, viewingPublicKey);
  if (f.metaAddress !== metaAddress) fail('invalidFile');
  const exportedAt = timestamp(f.exportedAt, 'invalidFile');
  const kdf = kdfParams(f.kdf);
  const cipher = cipherParams(f.cipher);
  const sealed = sealedLength(MASTER_LITERALS);
  const ciphertext = lowerHex(f.ciphertext, sealed, sealed, 'invalidFile');
  return { header: { format: MASTER_FORMAT, version: 1, schemeId, derivation: DERIVATION, metaAddress, spendingPublicKey, viewingPublicKey, exportedAt, kdf, cipher }, ciphertext };
}

/** Atomic decryption of a master backup; the caller owns and wipes `spendingKey` and `viewingKey`. */
export async function decryptMasterFile(text, passphrase) {
  const { header, ciphertext } = inspectMasterFile(text);
  const plain = await openEnvelope(MASTER_DOMAIN, header, ciphertext, passphrase);
  let keys;
  try {
    keys = decodeBody(plain, MASTER_LITERALS);
    if (keys === undefined || !keys.every(inRange)) fail('invalidFile');
    const [spendingKey, viewingKey] = keys;
    if (compressedOf(spendingKey) !== header.spendingPublicKey || compressedOf(viewingKey) !== header.viewingPublicKey) fail('masterKeysDoNotMatch');
    return { header, spendingKey, viewingKey };
  } catch (error) {
    if (keys !== undefined) wipe(...keys);
    throw error;
  } finally {
    wipe(plain);
  }
}

/**
 * ADR-0001 scheme 1 from the master pair (format section 5): S = p_view*R, s_h = keccak256(S), view tag = s_h[0],
 * p_stealth = (p_spend + s_h) mod n. Ownership is decided only by the address comparison, so a deep-scan payment
 * whose announced view tag differs is still recovered. A match is ownership, not payment confirmation or finality.
 * Returns `privateKey` (caller wipes) only when the announcement belongs to this pair.
 */
export function deriveFromAnnouncement({ spendingKey, viewingKey }, announcement) {
  if (typeof announcement !== 'object' || announcement === null || Array.isArray(announcement)) fail('invalidAnnouncement');
  const scheme = announcement.schemeId;
  if (scheme !== undefined && String(scheme) !== '1') fail('unsupportedScheme');
  const eph = typeof announcement.ephemeralPublicKey === 'string' ? announcement.ephemeralPublicKey.toLowerCase() : undefined;
  compressedPoint(eph, 'invalidAnnouncement');
  const announced = announcement.stealthAddress;
  if (typeof announced !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(announced)) fail('invalidAnnouncement');
  const metadata = announcement.metadata;
  if (metadata !== undefined && (typeof metadata !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(metadata))) fail('invalidAnnouncement');
  const shared = secp256k1.getSharedSecret(viewingKey, hexToBytes(eph.slice(2)), true);
  const sh = keccak_256(shared);
  wipe(shared);
  const k = (BigInt(`0x${bytesToHex(spendingKey)}`) + BigInt(`0x${bytesToHex(sh)}`)) % N_ORDER;
  const derivedViewTag = `0x${bytesToHex(sh.subarray(0, 1))}`;
  wipe(sh);
  if (k === 0n) fail('notOwned');
  const privateKey = hexToBytes(k.toString(16).padStart(64, '0'));
  const pub = secp256k1.getPublicKey(privateKey, true);
  const stealthAddress = addressOfPoint(pub);
  const owned = stealthAddress.toLowerCase() === announced.toLowerCase();
  const result = {
    owned,
    stealthAddress,
    publicKey: `0x${bytesToHex(pub)}`,
    ephemeralPublicKey: eph,
    derivedViewTag,
    ...(metadata === undefined ? {} : { announcedViewTag: `0x${metadata.slice(2, 4).toLowerCase()}` }),
  };
  if (!owned) {
    wipe(privateKey);
    return result;
  }
  return { ...result, privateKey };
}

const RAW_LINES = [
  'GhostPay one-time payment private key',
  'This is a single EVM private key, not a seed phrase or recovery phrase.',
  'It controls only the address below, including any future deposits to it.',
  'Anyone who has this key can spend funds at this address.',
  '',
];

/**
 * Parses `ghostpay-stealth-private-key.txt` (format section 6): exact lines, LF endings, final LF, and a key that
 * controls the stated address. The caller owns and wipes `privateKey`.
 */
export function parseRawPrivateKeyText(text) {
  if (typeof text !== 'string' || text.length > LIMITS.publicRecordBytes || !ASCII.test(text) || !text.endsWith('\n')) fail('invalidFile');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== 8 || RAW_LINES.some((l, i) => lines[i] !== l)) fail('invalidFile');
  const chain = /^Chain ID: ([1-9][0-9]*)$/.exec(lines[5]);
  const addr = /^Address: (0x[0-9a-fA-F]{40})$/.exec(lines[6]);
  const key = /^Private key: 0x([0-9a-f]{64})$/.exec(lines[7]);
  if (chain === null || addr === null || key === null) fail('invalidFile');
  const chainId = integer(Number(chain[1]), 1, Number.MAX_SAFE_INTEGER, 'invalidFile');
  const stealthAddress = eip55(addr[1], 'invalidFile');
  const privateKey = hexToBytes(key[1]);
  if (!inRange(privateKey)) {
    wipe(privateKey);
    fail('invalidFile');
  }
  if (addressOfPoint(secp256k1.getPublicKey(privateKey, true)) !== stealthAddress) {
    wipe(privateKey);
    fail('keyDoesNotMatch');
  }
  return { chainId, stealthAddress, privateKey };
}

/** Routes a text to its parser by its claimed `format`, or by the raw-key text heading. */
export function detectFormat(text) {
  if (typeof text !== 'string') return undefined;
  if (text.startsWith(`${RAW_LINES[0]}\n`)) return 'rawPrivateKey';
  if (text.length > LIMITS.keypairFileBytes || !ASCII.test(text)) return undefined;
  let v;
  try {
    v = parseStrictJson(text);
  } catch {
    return undefined;
  }
  const format = typeof v === 'object' && v !== null && !Array.isArray(v) ? v.format : undefined;
  if (format === PUBLIC_FORMAT) return 'public';
  if (format === KEYPAIR_FORMAT) return 'keypair';
  if (format === MASTER_FORMAT) return 'master';
  if (typeof format === 'string' && /^ghostpay-stealth-(?:public|keypair|master)-v[0-9]+$/.test(format)) return 'unsupported';
  return undefined;
}

// --- CLI ------------------------------------------------------------------------------------------------------------

const USAGE = `usage: node scripts/recovery/stealth-export-recover.mjs <file> [options]
  --inspect                  validate and print public information only (incompatible with --reveal-private-keys)
  --expected-chain <id>      require this chain in a payment, public or raw-key file (also with --inspect)
                             a master backup is chain-neutral and refuses this option
  --scan-announcement <json> master backup only: derive the one-time address for an announcement given as JSON
                             ({"ephemeralPublicKey","stealthAddress"[,"metadata"]}) or @<path>; repeatable
  --reveal-private-keys      also print one-time payment private keys (never the master keys) to stdout
The passphrase is read from standard input, or from a no-echo prompt on a terminal. It is never accepted as an
argument or environment variable.
Keep payment private keys away from a holder of your private viewing key: together with the public announcement,
they allow reconstruction of the master spending key and spending of your other discoverable scheme-1 payments.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { file: undefined, inspect: false, reveal: false, expectedChainId: undefined, announcements: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--inspect') opts.inspect = true;
    else if (a === '--reveal-private-keys') opts.reveal = true;
    else if (a === '--expected-chain') {
      const v = argv[++i];
      if (v === undefined || !/^[1-9][0-9]{0,15}$/.test(v) || !Number.isSafeInteger(Number(v))) throw new UsageError('--expected-chain needs a positive chain id');
      opts.expectedChainId = Number(v);
    } else if (a === '--scan-announcement') {
      const v = argv[++i];
      if (v === undefined) throw new UsageError('--scan-announcement needs a JSON value or @<path>');
      opts.announcements.push(v);
    } else if (a === '-h' || a === '--help') throw new UsageError('');
    else if (a.startsWith('-')) throw new UsageError('unknown option');
    else if (opts.file === undefined) opts.file = a;
    else throw new UsageError('only one file may be given');
  }
  if (opts.inspect && opts.reveal) throw new UsageError('--inspect and --reveal-private-keys cannot be used together');
  if (opts.file === undefined) throw new UsageError('a file is required');
  return opts;
}

/** Reads at most `max + 1` bytes so an oversized file is refused without loading it whole. */
function readBounded(path, max) {
  const fd = openSync(path, 'r');
  let buf;
  try {
    buf = Buffer.alloc(max + 1);
    let total = 0;
    while (total < buf.length) {
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    if (total > max) fail('tooLarge');
    return buf.subarray(0, total).toString('latin1');
  } finally {
    wipe(buf);
    closeSync(fd);
  }
}

function announcementsFrom(values) {
  const out = [];
  for (const v of values) {
    let parsed;
    try {
      parsed = JSON.parse(v.startsWith('@') ? readBounded(v.slice(1), LIMITS.publicRecordBytes) : v);
    } catch (error) {
      if (error instanceof RecoveryError) throw error;
      throw new UsageError('--scan-announcement is not valid JSON');
    }
    // Accepts a bare announcement, a public record, or an object wrapping an announcement (as in the vectors).
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) out.push(item?.ephemeralPublicKey === undefined && item?.announcement?.ephemeralPublicKey !== undefined ? item.announcement : item);
  }
  return out;
}

/** Passphrase from stdin (one trailing newline removed) or a raw-mode terminal prompt that echoes nothing. */
async function readPassphrase(stdin, stderr) {
  if (!stdin.isTTY) {
    const chunks = [];
    let all;
    try {
      for await (const c of stdin) chunks.push(c);
      all = Buffer.concat(chunks);
      const text = all.toString('utf8').replace(/\r?\n$/, '');
      if (text === '') throw new UsageError('no passphrase on standard input');
      return text;
    } finally {
      // A failed or cancelled pipe must erase chunks already received as well as the complete input buffer.
      wipe(all);
      for (const chunk of chunks) wipe(chunk);
    }
  }
  stderr.write('Passphrase (not echoed): ');
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  try {
    return await new Promise((ok, reject) => {
      let pass = '';
      const onData = (chunk) => {
        for (const ch of chunk) {
          if (ch === '\r' || ch === '\n') {
            stdin.off('data', onData);
            ok(pass);
            return;
          }
          if (ch === '\u0003' || ch === '\u0004') {
            stdin.off('data', onData);
            reject(new UsageError('cancelled'));
            return;
          }
          if (ch === '\u007f' || ch === '\b') pass = pass.slice(0, -1);
          else pass += ch;
        }
      };
      stdin.on('data', onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stderr.write('\n');
  }
}

const hex = (bytes) => `0x${bytesToHex(bytes)}`;
const OWNERSHIP_NOTE = 'A key/address match proves key ownership only; it is not payment confirmation or finality.';

/** Runs the CLI; returns the exit status. Secrets reach `stdout` only with --reveal-private-keys. */
export async function main(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  let opts;
  const secrets = [];
  try {
    opts = parseArgs(argv);
    const text = readBounded(opts.file, LIMITS.keypairFileBytes);
    const kind = detectFormat(text);
    if (kind === 'unsupported') fail('unsupportedVersion');
    if (kind === undefined) fail('invalidFile');
    if (kind === 'master' && opts.expectedChainId !== undefined) throw new UsageError('--expected-chain cannot verify a chain-neutral master backup');
    if (opts.announcements.length > 0 && kind !== 'master') throw new UsageError('--scan-announcement needs a master backup file');
    const out = { format: kind };
    if (kind === 'public') {
      out.record = parsePublicRecord(text);
      if (opts.expectedChainId !== undefined && opts.expectedChainId !== out.record.chainId) fail('wrongChain');
      out.note = 'Public record only: it holds no secret and is not authenticated. ' + OWNERSHIP_NOTE;
    } else if (kind === 'rawPrivateKey') {
      const raw = parseRawPrivateKeyText(text);
      secrets.push(raw.privateKey);
      if (opts.expectedChainId !== undefined && opts.expectedChainId !== raw.chainId) fail('wrongChain');
      out.chainId = raw.chainId;
      out.stealthAddress = raw.stealthAddress;
      if (opts.reveal) out.privateKey = hex(raw.privateKey);
      out.note = 'Plaintext private-key file: delete it once the key is imported.';
    } else if (kind === 'keypair') {
      const header = inspectKeypairFile(text).header;
      if (opts.expectedChainId !== undefined && opts.expectedChainId !== header.chainId) fail('wrongChain');
      if (opts.inspect) out.header = header;
      else {
        const passphrase = await readPassphrase(stdin, stderr);
        const { header, payments } = await decryptKeypairFile(text, passphrase, { expectedChainId: opts.expectedChainId });
        for (const p of payments) secrets.push(p.privateKey);
        out.scope = header.scope;
        out.chainId = header.chainId;
        out.count = header.count;
        out.payments = payments.map(({ record, privateKey }) => ({
          stealthAddress: record.stealthAddress,
          publicKey: record.publicKey.value,
          announcement: record.announcement,
          ...(opts.reveal ? { privateKey: hex(privateKey) } : {}),
        }));
        out.verified = 'every key decrypted, is in range and controls its recorded public key and address';
        out.note = OWNERSHIP_NOTE;
      }
    } else {
      if (opts.inspect) out.header = inspectMasterFile(text).header;
      else {
        const announcements = announcementsFrom(opts.announcements);
        const passphrase = await readPassphrase(stdin, stderr);
        const master = await decryptMasterFile(text, passphrase);
        secrets.push(master.spendingKey, master.viewingKey);
        out.metaAddress = master.header.metaAddress;
        out.spendingPublicKey = master.header.spendingPublicKey;
        out.viewingPublicKey = master.header.viewingPublicKey;
        out.verified = 'both master keys decrypted, are in range and match the header public keys';
        out.announcements = announcements.map((a) => {
          const d = deriveFromAnnouncement(master, a);
          if (d.privateKey !== undefined) secrets.push(d.privateKey);
          const { privateKey, ...pub } = d;
          return opts.reveal && privateKey !== undefined ? { ...pub, privateKey: hex(privateKey) } : pub;
        });
        out.note = 'Master keys are never printed. ' + OWNERSHIP_NOTE + ' The view tag is a scan filter only.';
      }
    }
    stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return out.announcements?.some((a) => !a.owned) ? 1 : 0;
  } catch (error) {
    if (error instanceof UsageError) {
      if (error.message !== '') stderr.write(`error: ${error.message}\n`);
      stderr.write(`${USAGE}\n`);
      return 2;
    }
    if (error instanceof RecoveryError) {
      stderr.write(`error: ${error.code}: ${error.message}\n`);
      return 1;
    }
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR' || error?.code === 'EACCES') {
      stderr.write(`error: cannot read the file (${error.code})\n`);
      return 2;
    }
    stderr.write('error: unexpected failure\n');
    return 1;
  } finally {
    wipe(...secrets);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
