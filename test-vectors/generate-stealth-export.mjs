// Generates stealth-export.json: ghostpay-stealth-{public,keypair,master}-v1 vectors (spec 18,
// docs/specs/18-stealth-keypair-export-formats.md). Run from the repo root:
//   node test-vectors/generate-stealth-export.mjs
// Built ONLY with node:crypto (scrypt, AES-256-GCM), @noble/curves (secp256k1), @noble/hashes (keccak256) and viem
// (EIP-55) from the documented formats; no @ghostpay package is imported, so the consumer tests are a
// cross-implementation check of packages/ux-vault/src/stealth-export-portable.ts.
// TEST-ONLY: the seller keys are the public scheme1-001 keys from scheme1.json, and the passphrase, salts, IVs,
// ephemeral keys and the low scrypt cost N=2^14 are fixed test values. Never reuse any of them.
import { createCipheriv, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getAddress } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const scheme1 = JSON.parse(readFileSync(resolve(here, 'scheme1.json'), 'utf8'));
const seed = scheme1.vectors.find((v) => v.id === 'scheme1-001');
if (seed === undefined) throw new Error('scheme1-001 missing');

const n = secp256k1.Point.Fn.ORDER;
const CHAIN_ID = 11155111;
const EXPORTED_AT = '2026-11-18T00:00:00Z';
const PASSPHRASE = 'quasar-tangelo-wombat-ferry-oboe-kiln';
const KDF = { N: 2 ** 14, r: 8, p: 1 };
const PUBLIC_FORMAT = 'ghostpay-stealth-public-v1';
const KEYPAIR_FORMAT = 'ghostpay-stealth-keypair-v1';
const MASTER_FORMAT = 'ghostpay-stealth-master-v1';
const KEYPAIR_DOMAIN = 'GhostPay.stealth-keypair.v1';
const MASTER_DOMAIN = 'GhostPay.stealth-master.v1';

const strip = (h) => h.replace(/^0x/, '');
const scalarHex = (k) => k.toString(16).padStart(64, '0');
const fill = (byte, length) => Buffer.alloc(length, byte);

/** Format section 1.5: sorted keys, no whitespace, decimal integers, JSON.stringify strings. */
function canonical(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error('non-canonical number');
    return String(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  throw new Error('unsupported canonical value');
}

const addressOf = (uncompressed) => getAddress(`0x${bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(12))}`);

/** ADR-0001 scheme 1, computed on both sides: S = r*P_view = p_view*R, s_h = keccak256(S), k = (p_spend + s_h) mod n. */
function derive(ephemeralPrivateKey) {
  const spend = hexToBytes(strip(seed.spendingPrivateKey));
  const view = hexToBytes(strip(seed.viewingPrivateKey));
  const eph = hexToBytes(strip(ephemeralPrivateKey));
  const R = secp256k1.getPublicKey(eph, true);
  const senderShared = secp256k1.getSharedSecret(eph, secp256k1.getPublicKey(view, true), true);
  const shared = secp256k1.getSharedSecret(view, R, true);
  if (bytesToHex(senderShared) !== bytesToHex(shared)) throw new Error('ECDH mismatch');
  const sh = keccak_256(shared);
  const k = (BigInt(seed.spendingPrivateKey) + (BigInt(`0x${bytesToHex(sh)}`) % n)) % n;
  if (k === 0n) throw new Error('zero stealth key');
  const key = hexToBytes(scalarHex(k));
  return {
    ephemeralPublicKey: `0x${bytesToHex(R)}`,
    derivedViewTag: sh[0],
    privateKey: `0x${scalarHex(k)}`,
    publicKey: `0x${bytesToHex(secp256k1.getPublicKey(key, true))}`,
    stealthAddress: addressOf(secp256k1.getPublicKey(key, false)),
  };
}

// metadata = view-tag byte || the native-coin GhostPay layout of scheme1-001 (selector, marker, amount).
const tail = strip(seed.metadata.native).slice(2);
const specs = [
  { id: 'a1', note: 'scheme1-001 announcement (exact scheme1.json vector)', eph: seed.ephemeralPrivateKey, wrongTag: false, block: '6000001', logIndex: 3, tx: true },
  { id: 'a2', note: 'second payment to the scheme1-001 seller', eph: `0x${'44'.repeat(32)}`, wrongTag: false, block: '6000002', logIndex: 0, tx: true },
  { id: 'a3', note: 'third payment, deliberately omitted from the archive (recoverable from the master backup only)', eph: `0x${'55'.repeat(32)}`, wrongTag: false, block: '6000003', logIndex: 7, tx: true },
  { id: 'a4', note: 'deep-scan payment: announced view tag differs from the derived tag; no transaction hash', eph: `0x${'66'.repeat(32)}`, wrongTag: true, block: '6000004', logIndex: 1, tx: false },
];
const announcements = specs.map((s, i) => {
  const d = derive(s.eph);
  const announcedTag = s.wrongTag ? d.derivedViewTag ^ 0xff : d.derivedViewTag;
  const metadata = `0x${announcedTag.toString(16).padStart(2, '0')}${tail}`;
  return {
    id: s.id,
    note: s.note,
    ephemeralPrivateKey: s.eph,
    announcement: {
      schemeId: '1',
      stealthAddress: d.stealthAddress,
      ephemeralPublicKey: d.ephemeralPublicKey,
      metadata,
      blockHash: `0x${(0xa1 + i).toString(16).repeat(32)}`,
      blockNumber: s.block,
      logIndex: s.logIndex,
      ...(s.tx ? { transactionHash: `0x${(0xb1 + i).toString(16).repeat(32)}` } : {}),
    },
    expected: {
      stealthAddress: d.stealthAddress,
      publicKey: d.publicKey,
      privateKey: d.privateKey,
      announcedViewTag: `0x${announcedTag.toString(16).padStart(2, '0')}`,
      derivedViewTag: `0x${d.derivedViewTag.toString(16).padStart(2, '0')}`,
      tagMatches: !s.wrongTag,
    },
  };
});
const a1 = announcements[0];
if (a1.expected.stealthAddress !== seed.stealthAddress || a1.expected.privateKey !== seed.stealthPrivateKey || a1.announcement.ephemeralPublicKey !== seed.ephemeralPublicKey || a1.expected.announcedViewTag !== seed.viewTag) {
  throw new Error('generator disagrees with scheme1.json scheme1-001');
}

const record = (a) => ({
  format: PUBLIC_FORMAT,
  version: 1,
  schemeId: 1,
  chainId: CHAIN_ID,
  stealthAddress: a.expected.stealthAddress,
  publicKey: { encoding: 'secp256k1-compressed', value: a.expected.publicKey },
  ephemeralPublicKey: a.announcement.ephemeralPublicKey,
  viewTag: a.expected.announcedViewTag,
  announcement: {
    blockHash: a.announcement.blockHash,
    blockNumber: a.announcement.blockNumber,
    logIndex: a.announcement.logIndex,
    ...(a.announcement.transactionHash === undefined ? {} : { transactionHash: a.announcement.transactionHash }),
  },
  exportedAt: EXPORTED_AT,
});

const envelope = (salt, iv, N = KDF.N) => ({
  kdf: { name: 'scrypt', N, r: KDF.r, p: KDF.p, dkLen: 32, salt: `0x${salt.toString('hex')}` },
  cipher: { name: 'AES-256-GCM', iv: `0x${iv.toString('hex')}`, tagLength: 128 },
});

/** Section 3: AAD = UTF-8(DOMAIN "\n" canonical(header)); plaintext = the given body bytes (canonical(body) unless a refusal says otherwise). */
function seal(domain, header, plaintext, { passphrase = PASSPHRASE } = {}) {
  const salt = Buffer.from(strip(header.kdf.salt), 'hex');
  const iv = Buffer.from(strip(header.cipher.iv), 'hex');
  const key = scryptSync(passphrase.normalize('NFKC'), salt, 32, { N: header.kdf.N, r: header.kdf.r, p: header.kdf.p, maxmem: 2 ** 29 });
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`${domain}\n${canonical(header)}`, 'utf8'));
  const ct = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final(), c.getAuthTag()]);
  return JSON.stringify({ ...header, ciphertext: `0x${ct.toString('hex')}` }, null, 2);
}

const byAddress = (x, y) => (x.expected.stealthAddress.toLowerCase() < y.expected.stealthAddress.toLowerCase() ? -1 : 1);
const keypairHeader = (scope, entries, salt, iv) => ({
  format: KEYPAIR_FORMAT,
  version: 1,
  scope,
  chainId: CHAIN_ID,
  count: entries.length,
  payments: entries.map(record),
  ...envelope(salt, iv),
});
const keypairBody = (keys) => canonical({ privateKeys: keys });

const singleHeader = keypairHeader('single', [a1], fill(0x01, 16), fill(0x02, 12));
const archiveEntries = [announcements[0], announcements[1], announcements[3]].sort(byAddress);
const archiveHeader = keypairHeader('selected', archiveEntries, Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'), Buffer.from('f0f1f2f3f4f5f6f7f8f9fafb', 'hex'));
const masterHeader = {
  format: MASTER_FORMAT,
  version: 1,
  schemeId: 1,
  derivation: 'eip5564-scheme1-adr0001',
  metaAddress: `st:eth:0x${strip(seed.spendingPublicKey)}${strip(seed.viewingPublicKey)}`,
  spendingPublicKey: seed.spendingPublicKey,
  viewingPublicKey: seed.viewingPublicKey,
  exportedAt: EXPORTED_AT,
  ...envelope(fill(0x03, 16), fill(0x04, 12)),
};
if (masterHeader.metaAddress !== seed.metaAddress) throw new Error('meta-address disagrees with scheme1.json');
const masterBody = (over = {}) => canonical({ spendingKey: seed.spendingPrivateKey, viewingKey: seed.viewingPrivateKey, ...over });

const raw = (a) => [
  'GhostPay one-time payment private key',
  'This is a single EVM private key, not a seed phrase or recovery phrase.',
  'It controls only the address below, including any future deposits to it.',
  'Anyone who has this key can spend funds at this address.',
  '',
  `Chain ID: ${String(CHAIN_ID)}`,
  `Address: ${a.expected.stealthAddress}`,
  `Private key: ${a.expected.privateKey}`,
  '',
].join('\n');

const files = {
  public: { announcement: 'a1', text: JSON.stringify(record(a1), null, 2) },
  single: { scope: 'single', announcements: ['a1'], salt: singleHeader.kdf.salt, iv: singleHeader.cipher.iv, text: seal(KEYPAIR_DOMAIN, singleHeader, keypairBody([a1.expected.privateKey])) },
  archive: {
    scope: 'selected',
    announcements: archiveEntries.map((a) => a.id),
    omitted: ['a3'],
    salt: archiveHeader.kdf.salt,
    iv: archiveHeader.cipher.iv,
    text: seal(KEYPAIR_DOMAIN, archiveHeader, keypairBody(archiveEntries.map((a) => a.expected.privateKey))),
  },
  master: { salt: masterHeader.kdf.salt, iv: masterHeader.cipher.iv, text: seal(MASTER_DOMAIN, masterHeader, masterBody()) },
  rawPrivateKey: { announcement: 'a1', text: raw(a1) },
};

const nHex = `0x${scalarHex(n)}`;
const zero = `0x${'00'.repeat(32)}`;
const invalid = [
  { id: 'keypair-bad-001', note: 'wrong passphrase', format: 'keypair', passphrase: 'quasar-tangelo-wombat-ferry-oboe-kilns', text: files.single.text, error: 'wrongPassphraseOrModified' },
  { id: 'keypair-bad-002', note: 'authentic file whose body key belongs to another payment', format: 'keypair', text: seal(KEYPAIR_DOMAIN, singleHeader, keypairBody([announcements[1].expected.privateKey])), error: 'keyDoesNotMatch' },
  { id: 'keypair-bad-003', note: 'authentic file with body scalar 0', format: 'keypair', text: seal(KEYPAIR_DOMAIN, singleHeader, keypairBody([zero])), error: 'invalidFile' },
  { id: 'keypair-bad-004', note: 'authentic file with body scalar n (secp256k1 order)', format: 'keypair', text: seal(KEYPAIR_DOMAIN, singleHeader, keypairBody([nHex])), error: 'invalidFile' },
  { id: 'keypair-bad-005', note: 'authentic file with a non-canonical body (uppercase hex, same length)', format: 'keypair', text: seal(KEYPAIR_DOMAIN, singleHeader, keypairBody([`0x${strip(a1.expected.privateKey).toUpperCase()}`])), error: 'invalidFile' },
  { id: 'keypair-bad-006', note: 'authentic file whose body holds two keys for count 1', format: 'keypair', text: seal(KEYPAIR_DOMAIN, singleHeader, keypairBody([a1.expected.privateKey, announcements[1].expected.privateKey])), error: 'invalidFile' },
  { id: 'keypair-bad-007', note: 'keypair header and body sealed under the master AAD domain', format: 'keypair', text: seal(MASTER_DOMAIN, singleHeader, keypairBody([a1.expected.privateKey])), error: 'wrongPassphraseOrModified' },
  { id: 'master-bad-001', note: 'authentic master backup whose body also carries a signingKey', format: 'master', text: seal(MASTER_DOMAIN, masterHeader, masterBody({ signingKey: `0x${'77'.repeat(32)}` })), error: 'invalidFile' },
  { id: 'master-bad-002', note: 'authentic master backup with spending and viewing keys swapped in the body', format: 'master', text: seal(MASTER_DOMAIN, masterHeader, masterBody({ spendingKey: seed.viewingPrivateKey, viewingKey: seed.spendingPrivateKey })), error: 'masterKeysDoNotMatch' },
  { id: 'master-bad-003', note: 'master header and body sealed under the keypair AAD domain', format: 'master', text: seal(KEYPAIR_DOMAIN, masterHeader, masterBody()), error: 'wrongPassphraseOrModified' },
];

const out = {
  description: 'GhostPay spec 18 stealth key export vectors (ghostpay-stealth-public-v1, -keypair-v1, -master-v1). TEST-ONLY keys, passphrase, salts, IVs and scrypt cost N=2^14. Generated with node:crypto, @noble/curves, @noble/hashes and viem only.',
  provenance: { generator: 'test-vectors/generate-stealth-export.mjs', source: 'test-vectors/scheme1.json scheme1-001', node: process.version },
  generatedAt: new Date().toISOString().slice(0, 10),
  chainId: CHAIN_ID,
  exportedAt: EXPORTED_AT,
  passphrase: PASSPHRASE,
  kdf: { name: 'scrypt', ...KDF, dkLen: 32 },
  seller: {
    spendingPrivateKey: seed.spendingPrivateKey,
    viewingPrivateKey: seed.viewingPrivateKey,
    spendingPublicKey: seed.spendingPublicKey,
    viewingPublicKey: seed.viewingPublicKey,
    metaAddress: seed.metaAddress,
  },
  announcements,
  files,
  invalid,
};
writeFileSync(resolve(here, 'stealth-export.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${String(announcements.length)} announcements, ${String(Object.keys(files).length)} files and ${String(invalid.length)} refusals`);
