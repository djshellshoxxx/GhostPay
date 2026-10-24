// Generates tags.json: deterministic Feature 4 tag-archive (.gpa) vectors (spec 08). Run from the repo root:
//   node test-vectors/generate-tag-archive.mjs
// Built ONLY with node:crypto (scrypt + AES-256-GCM) from the documented format in
// apps/web/src/lib/tagArchive.ts, never with the app code, so the consumer test is a cross-implementation check:
//   "GPA1" | u8 kdf=1 | u8 log2(N) | u8 r | u8 p | salt(16) | iv(12) | ciphertext || tag(16); AAD = bytes before iv.
// Salts, IVs and passphrases are fixed TEST-ONLY values. Never reuse them.
import { createCipheriv, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function archive({ pass, log2N, r = 8, p = 1, salt, iv, body }) {
  const head = Buffer.concat([Buffer.from('GPA1'), Buffer.from([1, log2N, r, p]), salt]);
  const key = scryptSync(pass.normalize('NFKC'), salt, 32, { N: 2 ** log2N, r, p, maxmem: 2 ** 29 });
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(head);
  const ct = Buffer.concat([c.update(body, 'utf8'), c.final(), c.getAuthTag()]);
  return Buffer.concat([head, iv, ct]);
}

const PASS = 'correct horse battery staple 7';
const rec = (i, over = {}) => ({
  chainId: 84532,
  createdAt: 1_700_000_000_000 + i,
  updatedAt: 1_700_000_100_000 + i,
  payload: { stealthAddress: `0x${(i + 1).toString(16).padStart(40, '0')}`, announcementId: `0x${'ab'.repeat(32)}:${i}`, logIndex: i, clientLabel: `Client ${i}`, ...over },
});
const doc = (records, history = {}) => JSON.stringify({ version: 1, createdAt: 1_700_000_200_000, keyVersion: 1, records, history });

const valid = [
  { id: 'tags-001', note: 'one record, N=2^14', pass: PASS, log2N: 14, salt: Buffer.alloc(16, 1), iv: Buffer.alloc(12, 2), body: doc([rec(0)]) },
  { id: 'tags-002', note: 'empty archive', pass: PASS, log2N: 14, salt: Buffer.alloc(16, 3), iv: Buffer.alloc(12, 4), body: doc([]) },
  {
    id: 'tags-003', note: 'optional fields, unicode label, scan-history entry, mixed-case hex (normalised on import)', pass: PASS, log2N: 14,
    salt: Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'), iv: Buffer.from('f0f1f2f3f4f5f6f7f8f9fafb', 'hex'),
    body: doc([rec(1, { invoiceLabel: 'Rechnung Nr. 7 – München', notes: '日本語のメモ', stealthAddress: '0xAbCdEf0000000000000000000000000000000001' }), rec(2)], { '84532': 'opaque-history-ciphertext' }),
  },
  // The app normalises passphrases to NFKC; this archive is encrypted under the NFC form and opened with NFD.
  { id: 'tags-004', note: 'passphrase NFKC normalisation (NFC encrypt, NFD decrypt)', pass: 'café crème brûlée 42', openWith: 'café crème brûlée 42', log2N: 14, salt: Buffer.alloc(16, 9), iv: Buffer.alloc(12, 8), body: doc([rec(3)]) },
  { id: 'tags-005', note: 'production cost N=2^17', pass: PASS, log2N: 17, salt: Buffer.alloc(16, 0x17), iv: Buffer.alloc(12, 0x71), body: doc([rec(4)]) },
];

const cases = valid.map((v) => ({
  id: v.id,
  note: v.note,
  passphrase: v.openWith ?? v.pass,
  archiveHex: archive(v).toString('hex'),
  expected: JSON.parse(v.body),
}));

const base = archive(valid[0]);
const flip = (buf, at) => { const b = Buffer.from(buf); b[at] ^= 0x01; return b.toString('hex'); };
const invalid = [
  { id: 'tags-bad-001', note: 'wrong passphrase', passphrase: 'correct horse battery staple 8', archiveHex: base.toString('hex'), error: 'auth' },
  { id: 'tags-bad-002', note: 'flipped ciphertext byte', passphrase: PASS, archiveHex: flip(base, 40), error: 'auth' },
  { id: 'tags-bad-003', note: 'flipped GCM tag byte', passphrase: PASS, archiveHex: flip(base, base.length - 1), error: 'auth' },
  { id: 'tags-bad-004', note: 'flipped salt byte (AAD and key change)', passphrase: PASS, archiveHex: flip(base, 10), error: 'auth' },
  { id: 'tags-bad-005', note: 'r changed 8 -> 4 (AAD-bound parameter)', passphrase: PASS, archiveHex: (() => { const b = Buffer.from(base); b[6] = 4; return b.toString('hex'); })(), error: 'auth' },
  { id: 'tags-bad-006', note: 'N below the 2^14 floor', passphrase: PASS, archiveHex: (() => { const b = Buffer.from(base); b[5] = 13; return b.toString('hex'); })(), error: 'format' },
  { id: 'tags-bad-007', note: 'N above the 2^18 ceiling', passphrase: PASS, archiveHex: (() => { const b = Buffer.from(base); b[5] = 19; return b.toString('hex'); })(), error: 'format' },
  { id: 'tags-bad-008', note: 'wrong magic', passphrase: PASS, archiveHex: `47504132${base.subarray(4).toString('hex')}`, error: 'format' },
  { id: 'tags-bad-009', note: 'truncated below header + iv + tag', passphrase: PASS, archiveHex: base.subarray(0, 50).toString('hex'), error: 'format' },
  { id: 'tags-bad-010', note: 'authentic archive with an unknown top-level key', passphrase: PASS, archiveHex: archive({ ...valid[0], body: JSON.stringify({ ...JSON.parse(valid[0].body), extra: 1 }) }).toString('hex'), error: 'format' },
  { id: 'tags-bad-011', note: 'authentic archive from a newer version', passphrase: PASS, archiveHex: archive({ ...valid[0], body: JSON.stringify({ ...JSON.parse(valid[0].body), version: 2 }) }).toString('hex'), error: 'version' },
  { id: 'tags-bad-012', note: 'authentic archive with an invalid stealth address', passphrase: PASS, archiveHex: archive({ ...valid[0], body: doc([rec(0, { stealthAddress: 'nope' })]) }).toString('hex'), error: 'format' },
];

const out = {
  description: 'GhostPay Feature 4 tag archive (.gpa) vectors. TEST-ONLY passphrases, salts and IVs. Generated with node:crypto only.',
  format: 'GPA1 | kdf=1 | log2N | r | p | salt16 | iv12 | AES-256-GCM(ct||tag16), AAD = bytes before iv; scrypt dkLen 32 over NFKC passphrase',
  provenance: { generator: 'test-vectors/generate-tag-archive.mjs', node: process.version },
  generatedAt: new Date().toISOString().slice(0, 10),
  valid: cases,
  invalid,
};
writeFileSync(resolve(here, 'tags.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${cases.length} valid and ${invalid.length} invalid tag-archive vectors`);
