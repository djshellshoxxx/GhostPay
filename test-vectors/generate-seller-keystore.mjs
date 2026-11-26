// Generates seller-keystore-v1.json: vectors for the legacy seller keystore v1 (`ghostpay-keystore.json`), described in
// docs/specs/18-seller-keystore-v1-format.md. Run from the repo root:
//   node test-vectors/generate-seller-keystore.mjs
// Built ONLY with node:crypto (scrypt, AES-256-GCM), @noble/curves (secp256k1) and @noble/hashes; no @ghostpay package
// is imported, so the consumer tests are a cross-implementation check of packages/ux-vault/src/keystore-portable.ts and
// scripts/recovery/stealth-export-recover.mjs.
// TEST-ONLY: the spending and viewing keys are the public scheme1-001 keys (the seller of stealth-export.json). The
// invoice-signing key, the second seller, the passphrase, salt, IV and the low scrypt cost N=2^14 are fixed test values.
// Never reuse any of them.
import { createCipheriv, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const here = dirname(fileURLToPath(import.meta.url));
const scheme1 = JSON.parse(readFileSync(resolve(here, 'scheme1.json'), 'utf8'));
const exportVectors = JSON.parse(readFileSync(resolve(here, 'stealth-export.json'), 'utf8'));
const seed = scheme1.vectors.find((v) => v.id === 'scheme1-001');
if (seed === undefined) throw new Error('scheme1-001 missing');

const n = secp256k1.Point.Fn.ORDER;
const PASSPHRASE = 'quasar-tangelo-wombat-ferry-oboe-kiln';
/** Fullwidth "quasar": NFKC maps it to PASSPHRASE, so it opens the same files. */
const NFKC_SPELLING = 'ｑｕａｓａｒ-tangelo-wombat-ferry-oboe-kiln';
const WRONG = 'quasar-tangelo-wombat-ferry-oboe-kilm';
const KDF = { N: 2 ** 14, r: 8, p: 1 };
const DOMAIN = 'GhostPay.keystore.v1';
const SALT = Buffer.alloc(16, 0x5b);
const IV = Buffer.alloc(12, 0x5c);
const MAX_BYTES = 8192;

const strip = (h) => h.replace(/^0x/, '');
const scalarHex = (k) => k.toString(16).padStart(64, '0');
const pub = (privateKeyHex) => bytesToHex(secp256k1.getPublicKey(hexToBytes(strip(privateKeyHex)), true));
const metaOf = (spend, view) => `st:eth:0x${pub(spend)}${pub(view)}`;

function seller(spendingPrivateKey, viewingPrivateKey, signingPrivateKey) {
  return { spendingPrivateKey, viewingPrivateKey, signingPrivateKey, metaAddress: metaOf(spendingPrivateKey, viewingPrivateKey), signer: pub(signingPrivateKey) };
}

const A = seller(seed.spendingPrivateKey, seed.viewingPrivateKey, `0x${'55'.repeat(32)}`);
const B = seller(`0x${'66'.repeat(32)}`, `0x${'77'.repeat(32)}`, `0x${'88'.repeat(32)}`);
if (A.metaAddress !== seed.metaAddress || A.metaAddress !== exportVectors.seller.metaAddress) throw new Error('seller A differs from scheme1-001 / stealth-export.json');
for (const s of [A, B]) if (new Set([pub(s.spendingPrivateKey), pub(s.viewingPrivateKey), s.signer]).size !== 3) throw new Error('seller keys must be distinct');

/** The plaintext keystore-portable.ts writes: JSON.stringify in this key order, lowercase hex without 0x. */
const body = (spendingKey, viewingKey, signingKey) => JSON.stringify({ spendingKey: strip(spendingKey), viewingKey: strip(viewingKey), signingKey: strip(signingKey) });
const bodyOf = (s) => body(s.spendingPrivateKey, s.viewingPrivateKey, s.signingPrivateKey);
const aad = (meta, k) => Buffer.from(`${DOMAIN}|${meta.metaAddress}|${meta.signer}|${k.N}|${k.r}|${k.p}`, 'utf8');

/** Writes the file exactly as keystore-portable.ts `encryptKeystore` does: pretty JSON in this key order, no newline. */
function keystore({ meta, plaintext, kdf = KDF }) {
  const key = scryptSync(Buffer.from(PASSPHRASE.normalize('NFKC'), 'utf8'), SALT, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 2 ** 29 });
  const c = createCipheriv('aes-256-gcm', key, IV, { authTagLength: 16 });
  c.setAAD(aad(meta, kdf));
  const sealed = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final(), c.getAuthTag()]);
  return JSON.stringify({
    v: 1,
    kdf: 'scrypt',
    kdfParams: { N: kdf.N, r: kdf.r, p: kdf.p, salt: SALT.toString('hex') },
    cipher: 'AES-256-GCM',
    iv: IV.toString('hex'),
    meta: { metaAddress: meta.metaAddress, signer: meta.signer },
    ciphertext: sealed.toString('hex'),
  }, null, 2);
}

const edit = (text, mutate) => {
  const o = JSON.parse(text);
  mutate(o);
  return JSON.stringify(o, null, 2);
};
/** Changes one hex digit at `at` (negative counts from the end) to a different digit. */
const flipDigit = (hexText, at) => {
  const i = at < 0 ? hexText.length + at : at;
  return hexText.slice(0, i) + (hexText[i] === '0' ? '1' : '0') + hexText.slice(i + 1);
};

const valid = keystore({ meta: A, plaintext: bodyOf(A) });
const other = keystore({ meta: B, plaintext: bodyOf(B) });
if (bodyOf(A).length !== 242 || JSON.parse(valid).ciphertext.length !== 2 * 258) throw new Error('unexpected canonical body length');

// `reference` is the fixed code scripts/recovery/stealth-export-recover.mjs reports. `ghostpayCodec` is what
// keystore-portable.ts does with the same input: every entry is refused there too, except the one documented
// non-canonical body, which only the reference reader refuses (GhostPay has never written such a body).
const invalid = [
  { id: 'wrong-passphrase', note: 'one changed character', passphrase: WRONG, text: valid, reference: 'wrongPassphraseOrModified' },
  { id: 'flipped-ciphertext', note: 'first ciphertext digit', text: edit(valid, (o) => { o.ciphertext = flipDigit(o.ciphertext, 0); }), reference: 'wrongPassphraseOrModified' },
  { id: 'flipped-tag', note: 'last authentication-tag digit', text: edit(valid, (o) => { o.ciphertext = flipDigit(o.ciphertext, -1); }), reference: 'wrongPassphraseOrModified' },
  { id: 'flipped-iv', note: 'first IV digit', text: edit(valid, (o) => { o.iv = flipDigit(o.iv, 0); }), reference: 'wrongPassphraseOrModified' },
  { id: 'flipped-salt', note: 'first salt digit', text: edit(valid, (o) => { o.kdfParams.salt = flipDigit(o.kdfParams.salt, 0); }), reference: 'wrongPassphraseOrModified' },
  { id: 'aad-r-changed', note: 'r is bound into the AAD and the KDF', text: edit(valid, (o) => { o.kdfParams.r = 4; }), reference: 'wrongPassphraseOrModified' },
  { id: 'aad-n-changed', note: 'N is bound into the AAD and the KDF', text: edit(valid, (o) => { o.kdfParams.N = 2 ** 15; }), reference: 'wrongPassphraseOrModified' },
  { id: 'header-names-another-seller', note: "seller B's public identity over seller A's ciphertext", text: edit(valid, (o) => { o.meta = { metaAddress: B.metaAddress, signer: B.signer }; }), reference: 'wrongPassphraseOrModified' },
  { id: 'authentic-foreign-body', note: "authentic encryption of seller B's keys under seller A's header", text: keystore({ meta: A, plaintext: bodyOf(B) }), reference: 'sellerKeysDoNotMatch' },
  { id: 'authentic-signer-is-spending-key', note: 'the invoice-signing key equals the spending key', text: keystore({ meta: { metaAddress: A.metaAddress, signer: pub(A.spendingPrivateKey) }, plaintext: body(A.spendingPrivateKey, A.viewingPrivateKey, A.spendingPrivateKey) }), reference: 'sellerKeysDoNotMatch' },
  { id: 'authentic-scalar-zero', note: 'spending key 0', text: keystore({ meta: A, plaintext: body('00'.repeat(32), A.viewingPrivateKey, A.signingPrivateKey) }), reference: 'invalidFile' },
  { id: 'authentic-scalar-n', note: 'spending key equal to the curve order', text: keystore({ meta: A, plaintext: body(scalarHex(n), A.viewingPrivateKey, A.signingPrivateKey) }), reference: 'invalidFile' },
  {
    id: 'authentic-noncanonical-body',
    note: 'same keys in another key order; GhostPay never writes it and its codec accepts it, the reference reader does not',
    text: keystore({ meta: A, plaintext: JSON.stringify({ viewingKey: strip(A.viewingPrivateKey), spendingKey: strip(A.spendingPrivateKey), signingKey: strip(A.signingPrivateKey) }) }),
    reference: 'invalidFile',
    ghostpayCodec: 'accepts',
  },
  { id: 'unsupported-version', note: 'v 2', text: edit(valid, (o) => { o.v = 2; }), reference: 'unsupportedVersion' },
  { id: 'extra-key', note: 'unknown top-level key', text: edit(valid, (o) => { o.comment = 'x'; }), reference: 'invalidFile' },
  { id: 'missing-key', note: 'no iv', text: edit(valid, (o) => { delete o.iv; }), reference: 'invalidFile' },
  { id: 'kdf-n-too-large', note: 'N = 2^19 is above the import bound', text: edit(valid, (o) => { o.kdfParams.N = 2 ** 19; }), reference: 'invalidFile' },
  { id: 'kdf-n-not-power-of-two', note: 'N = 3 * 2^14', text: edit(valid, (o) => { o.kdfParams.N = 3 * 2 ** 14; }), reference: 'invalidFile' },
  { id: 'kdf-p-too-large', note: 'p = 3', text: edit(valid, (o) => { o.kdfParams.p = 3; }), reference: 'invalidFile' },
  { id: 'meta-uppercase', note: 'meta-address must be canonical lowercase', text: edit(valid, (o) => { o.meta.metaAddress = `st:eth:0x${o.meta.metaAddress.slice(9).toUpperCase()}`; }), reference: 'invalidFile' },
  { id: 'meta-same-keys', note: 'the same key in the spending and viewing roles', text: edit(valid, (o) => { o.meta.metaAddress = `st:eth:0x${pub(A.spendingPrivateKey)}${pub(A.spendingPrivateKey)}`; }), reference: 'invalidFile' },
  { id: 'signer-with-prefix', note: 'signer is bare hex', text: edit(valid, (o) => { o.meta.signer = `0x${o.meta.signer}`; }), reference: 'invalidFile' },
  { id: 'ciphertext-too-short', note: '16 bytes cannot hold a tag and a body', text: edit(valid, (o) => { o.ciphertext = o.ciphertext.slice(0, 32); }), reference: 'invalidFile' },
  { id: 'truncated', note: 'download cut short', text: valid.slice(0, -40), reference: 'invalidFile' },
  { id: 'duplicate-key', note: 'strict JSON rejects a repeated key', text: valid.replace('"v": 1,', '"v": 1,\n  "v": 1,'), reference: 'invalidFile' },
  { id: 'oversized', note: `${MAX_BYTES + 1} bytes`, text: valid + ' '.repeat(MAX_BYTES + 1 - valid.length), reference: 'tooLarge' },
];
for (const v of invalid) if (v.text === valid && v.passphrase === undefined) throw new Error(`${v.id}: mutation did not change the file`);

const out = {
  description: 'Legacy GhostPay seller keystore v1 (ghostpay-keystore.json) vectors. TEST-ONLY keys, passphrase, salt, IV and scrypt cost N=2^14. Generated with node:crypto, @noble/curves and @noble/hashes only.',
  provenance: { generator: 'test-vectors/generate-seller-keystore.mjs', source: 'test-vectors/scheme1.json scheme1-001; seller of test-vectors/stealth-export.json', node: process.version },
  generatedAt: new Date().toISOString().slice(0, 10),
  passphrase: PASSPHRASE,
  nfkcSpelling: NFKC_SPELLING,
  kdf: KDF,
  seller: A,
  otherSeller: B,
  files: { valid: { text: valid }, otherSeller: { text: other } },
  invalid,
};
writeFileSync(resolve(here, 'seller-keystore-v1.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`seller-keystore-v1.json: 2 valid files, ${invalid.length} refusals`);
