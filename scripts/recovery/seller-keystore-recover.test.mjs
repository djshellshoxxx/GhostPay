// Reference reader for the legacy seller keystore v1 (`ghostpay-keystore.json`, docs/specs/18-seller-keystore-v1-format.md),
// checked against test-vectors/seller-keystore-v1.json, the Spec 18 vectors in test-vectors/stealth-export.json and files
// freshly written by the built @ghostpay/ux-vault codec. Every key and passphrase here is TEST-ONLY.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCipheriv, scryptSync } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  addressOfPoint,
  decryptMasterFile,
  decryptSellerKeystore,
  deriveFromAnnouncement,
  detectFormat,
  inspectSellerKeystore,
  LIMITS,
  wipe,
} from './stealth-export-recover.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, 'stealth-export-recover.mjs');
const K = JSON.parse(readFileSync(resolve(here, '../../test-vectors/seller-keystore-v1.json'), 'utf8'));
const S = JSON.parse(readFileSync(resolve(here, '../../test-vectors/stealth-export.json'), 'utf8'));
const PASS = K.passphrase;
const VALID = K.files.valid.text;
const OTHER = K.files.otherSeller.text;
const hex = (b) => `0x${Buffer.from(b).toString('hex')}`;
const bytes = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const byId = (id) => S.announcements.find((a) => a.id === id);
const sellerSecrets = (s) => [s.spendingPrivateKey, s.viewingPrivateKey, s.signingPrivateKey];
const SECRETS = [...sellerSecrets(K.seller), ...sellerSecrets(K.otherSeller), ...S.announcements.map((a) => a.expected.privateKey)]
  .map((k) => k.slice(2).toLowerCase());
/** True when any TEST-ONLY secret other than `allowed` (0x-prefixed keys) appears in `text`. */
const leaks = (text, allowed = []) => {
  const keep = new Set(allowed.map((k) => k.slice(2).toLowerCase()));
  return SECRETS.some((k) => !keep.has(k) && text.toLowerCase().includes(k));
};

/** Asserts a refusal by fixed code; never prints the rejected value. */
async function refuses(fn, code) {
  let caught;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught !== undefined, `expected refusal ${code}, got success`);
  assert.equal(caught.name, 'RecoveryError', 'unexpected error type');
  assert.equal(caught.code, code);
}

const edit = (text, mutate) => {
  const o = JSON.parse(text);
  mutate(o);
  return JSON.stringify(o, null, 2);
};

test('vector: decrypts to the scheme1-001 seller; the invoice-signing key is checked but never returned', async () => {
  const r = await decryptSellerKeystore(VALID, PASS);
  try {
    assert.deepEqual(Object.keys(r).sort(), ['header', 'spendingKey', 'viewingKey']);
    assert.equal(r.header.metaAddress, K.seller.metaAddress);
    assert.equal(r.header.metaAddress, S.seller.metaAddress);
    assert.equal(r.header.spendingPublicKey, S.seller.spendingPublicKey);
    assert.equal(r.header.viewingPublicKey, S.seller.viewingPublicKey);
    assert.equal(r.header.signer, K.seller.signer);
    assert.ok(hex(r.spendingKey) === K.seller.spendingPrivateKey && hex(r.viewingKey) === K.seller.viewingPrivateKey, 'restored keys differ');
    assert.ok(!leaks(JSON.stringify(r.header)), 'the header carries a secret');
  } finally {
    wipe(r.spendingKey, r.viewingKey);
  }
});

test('restored keys equal the Spec 18 master backup and recover every vector payment, including archive-omitted and deep-scan ones', async () => {
  const r = await decryptSellerKeystore(VALID, PASS);
  const m = await decryptMasterFile(S.files.master.text, S.passphrase);
  const other = await decryptSellerKeystore(OTHER, PASS);
  try {
    assert.ok(hex(r.spendingKey) === hex(m.spendingKey) && hex(r.viewingKey) === hex(m.viewingKey), 'keystore and master backup disagree');
    for (const a of S.announcements) {
      const d = deriveFromAnnouncement(r, a.announcement);
      try {
        assert.equal(d.owned, true, a.id);
        assert.equal(d.stealthAddress, a.expected.stealthAddress);
        assert.ok(hex(d.privateKey) === a.expected.privateKey, `${a.id}: one-time key differs`);
        assert.equal(addressOfPoint(secp256k1.getPublicKey(d.privateKey, true)), a.expected.stealthAddress);
      } finally {
        wipe(d.privateKey);
      }
      // Another seller's restored keys never claim this payment.
      const foreign = deriveFromAnnouncement(other, a.announcement);
      assert.equal(foreign.owned, false, `${a.id}: claimed by another seller`);
      assert.equal(foreign.privateKey, undefined);
    }
  } finally {
    wipe(r.spendingKey, r.viewingKey, m.spendingKey, m.viewingKey, other.spendingKey, other.viewingKey);
  }
});

test('NFKC: a compatibility spelling of the passphrase opens the same file', async () => {
  assert.notEqual(K.nfkcSpelling, PASS);
  assert.equal(K.nfkcSpelling.normalize('NFKC'), PASS);
  const r = await decryptSellerKeystore(VALID, K.nfkcSpelling);
  assert.ok(hex(r.spendingKey) === K.seller.spendingPrivateKey, 'NFKC spelling restored other keys');
  wipe(r.spendingKey, r.viewingKey);
});

test('inspect validates the complete header without a passphrase or KDF work', () => {
  const { header, ciphertext } = inspectSellerKeystore(VALID);
  const file = JSON.parse(VALID);
  assert.deepEqual(header, {
    version: 1,
    metaAddress: K.seller.metaAddress,
    spendingPublicKey: S.seller.spendingPublicKey,
    viewingPublicKey: S.seller.viewingPublicKey,
    signer: K.seller.signer,
    kdf: { name: 'scrypt', N: K.kdf.N, r: K.kdf.r, p: K.kdf.p, salt: file.kdfParams.salt },
    cipher: { name: 'AES-256-GCM', iv: file.iv, tagLength: 128 },
  });
  assert.equal(ciphertext, file.ciphertext);
  assert.equal(LIMITS.sellerKeystoreBytes, 8192);
});

test('every invalid vector is refused with its documented code', async () => {
  for (const v of K.invalid) await refuses(() => decryptSellerKeystore(v.text, v.passphrase ?? PASS), v.reference);
});

test('header defects are refused by inspect, before any passphrase is needed', async () => {
  const headerOnly = K.invalid.filter((v) => v.reference !== 'wrongPassphraseOrModified' && v.reference !== 'sellerKeysDoNotMatch' && !v.id.startsWith('authentic-'));
  assert.ok(headerOnly.length >= 10);
  for (const v of headerOnly) await refuses(() => inspectSellerKeystore(v.text), v.reference);
});

test('other malformed input is refused with fixed codes', async () => {
  await refuses(() => inspectSellerKeystore(`﻿${VALID}`), 'invalidFile');
  await refuses(() => inspectSellerKeystore(VALID.replace('"scrypt"', '"scrypté"')), 'invalidFile');
  await refuses(() => inspectSellerKeystore('null'), 'invalidFile');
  await refuses(() => inspectSellerKeystore('[]'), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.v = '1'; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.kdf = 'pbkdf2'; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.cipher = 'AES-128-GCM'; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.kdfParams.r = 9; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.kdfParams.N = 2 ** 13; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.kdfParams.salt = o.kdfParams.salt.slice(0, 30); })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.iv = `${o.iv}00`; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.meta.extra = 'x'; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.meta.signer = `04${o.meta.signer.slice(2)}`; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.meta.metaAddress = o.meta.metaAddress.replace('st:eth:', 'st:btc:'); })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.ciphertext = `${o.ciphertext}00`; })), 'invalidFile');
  // Hex is lowercase without a prefix everywhere, as GhostPay's codec requires.
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.kdfParams.salt = o.kdfParams.salt.toUpperCase(); })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.iv = o.iv.toUpperCase(); })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.ciphertext = o.ciphertext.toUpperCase(); })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.iv = `0x${o.iv}`; })), 'invalidFile');
  await refuses(() => inspectSellerKeystore(edit(VALID, (o) => { o.kdfParams.salt = `0x${o.kdfParams.salt}`; })), 'invalidFile');
  await refuses(() => decryptSellerKeystore(VALID, undefined), 'wrongPassphraseOrModified');
  await refuses(() => decryptSellerKeystore(VALID, ''), 'wrongPassphraseOrModified');
});

test('format detection routes v1 keystores and reports other keystore versions as unsupported', () => {
  assert.equal(detectFormat(VALID), 'sellerKeystore');
  assert.equal(detectFormat(OTHER), 'sellerKeystore');
  assert.equal(detectFormat(edit(VALID, (o) => { o.v = 2; })), 'unsupported');
  assert.equal(detectFormat(edit(VALID, (o) => { o.v = '1'; })), undefined);
  assert.equal(detectFormat(S.files.master.text), 'master');
  assert.equal(detectFormat(S.files.single.text), 'keypair');
});

test('cross-implementation: the built @ghostpay/ux-vault codec and this reader accept the same keystores', async () => {
  const { createKeystoreApi } = await import('@ghostpay/ux-vault/portable');
  const api = createKeystoreApi();
  // GhostPay's codec opens the independently generated vector with the same keys...
  const fromCodec = await api.decryptKeystore(VALID, PASS);
  assert.ok(hex(fromCodec.spendingKey) === K.seller.spendingPrivateKey && hex(fromCodec.viewingKey) === K.seller.viewingPrivateKey
    && hex(fromCodec.signingKey) === K.seller.signingPrivateKey, 'codec restored other keys');
  wipe(fromCodec.spendingKey, fromCodec.viewingKey, fromCodec.signingKey);
  // ...and refuses every invalid vector, except the documented body GhostPay never writes.
  for (const v of K.invalid) {
    let accepted = false;
    try {
      const s = await api.decryptKeystore(v.text, v.passphrase ?? PASS);
      wipe(s.spendingKey, s.viewingKey, s.signingKey);
      accepted = true;
    } catch {
      accepted = false;
    }
    assert.equal(accepted, v.ghostpayCodec === 'accepts', `${v.id}: codec behaviour changed`);
  }
  // Files the codec writes open here: the vector seller at the test cost and at the production default, and a
  // freshly random seller (as a browser generates one).
  const random = () => secp256k1.utils.randomSecretKey();
  const pub = (k) => Buffer.from(secp256k1.getPublicKey(k, true)).toString('hex');
  const fresh = { spendingKey: random(), viewingKey: random(), signingKey: random() };
  const cases = [
    { keys: { spendingKey: bytes(K.seller.spendingPrivateKey), viewingKey: bytes(K.seller.viewingPrivateKey), signingKey: bytes(K.seller.signingPrivateKey) }, N: 2 ** 14 },
    { keys: { spendingKey: bytes(K.seller.spendingPrivateKey), viewingKey: bytes(K.seller.viewingPrivateKey), signingKey: bytes(K.seller.signingPrivateKey) }, N: undefined },
    { keys: fresh, N: 2 ** 14 },
  ];
  for (const { keys, N } of cases) {
    const meta = { metaAddress: `st:eth:0x${pub(keys.spendingKey)}${pub(keys.viewingKey)}`, signer: pub(keys.signingKey) };
    const text = await api.encryptKeystore(keys, meta, PASS, N === undefined ? {} : { N });
    const r = await decryptSellerKeystore(text, PASS);
    try {
      assert.equal(r.header.kdf.N, N ?? 2 ** 17);
      assert.equal(r.header.metaAddress, meta.metaAddress);
      assert.equal(r.header.signer, meta.signer);
      assert.ok(hex(r.spendingKey) === hex(keys.spendingKey) && hex(r.viewingKey) === hex(keys.viewingKey), 'reader restored other keys');
    } finally {
      wipe(r.spendingKey, r.viewingKey);
    }
  }
  wipe(fresh.spendingKey, fresh.viewingKey, fresh.signingKey);
});

test('the largest import bounds GhostPay accepts (N=2^18, r=8, p=2, 64-byte salt) open in both readers', async () => {
  // Written here with node:crypto only, because GhostPay's writer never uses these parameters.
  const kdf = { N: 2 ** 18, r: 8, p: 2 };
  const salt = Buffer.alloc(64, 0x6d);
  const iv = Buffer.alloc(12, 0x6e);
  const { metaAddress, signer } = K.seller;
  const key = scryptSync(Buffer.from(PASS, 'utf8'), salt, 32, { ...kdf, maxmem: 2 ** 29 });
  const c = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  c.setAAD(Buffer.from(`GhostPay.keystore.v1|${metaAddress}|${signer}|${kdf.N}|${kdf.r}|${kdf.p}`, 'utf8'));
  const body = JSON.stringify({ spendingKey: K.seller.spendingPrivateKey.slice(2), viewingKey: K.seller.viewingPrivateKey.slice(2), signingKey: K.seller.signingPrivateKey.slice(2) });
  const sealed = Buffer.concat([c.update(body, 'utf8'), c.final(), c.getAuthTag()]);
  key.fill(0);
  const text = JSON.stringify({
    v: 1, kdf: 'scrypt', kdfParams: { ...kdf, salt: salt.toString('hex') }, cipher: 'AES-256-GCM', iv: iv.toString('hex'),
    meta: { metaAddress, signer }, ciphertext: sealed.toString('hex'),
  }, null, 2);
  const r = await decryptSellerKeystore(text, PASS);
  assert.deepEqual({ N: r.header.kdf.N, r: r.header.kdf.r, p: r.header.kdf.p }, kdf);
  assert.ok(hex(r.spendingKey) === K.seller.spendingPrivateKey, 'reader restored other keys');
  wipe(r.spendingKey, r.viewingKey);
  const { createKeystoreApi } = await import('@ghostpay/ux-vault/portable');
  const s = await createKeystoreApi().decryptKeystore(text, PASS);
  assert.ok(hex(s.spendingKey) === K.seller.spendingPrivateKey, 'codec restored other keys');
  wipe(s.spendingKey, s.viewingKey, s.signingKey);
});

// --- CLI ------------------------------------------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'gp-keystore-recover-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const fileOf = (name, text) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};
const cli = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], { input: input ?? '', encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
const announcementArg = (a) => JSON.stringify({ ephemeralPublicKey: a.announcement.ephemeralPublicKey, stealthAddress: a.announcement.stealthAddress });

test('CLI: verifies a keystore with the passphrase on stdin and never prints a seller secret', () => {
  const path = fileOf('ghostpay-keystore.json', VALID);
  for (const flags of [[], ['--reveal-private-keys']]) {
    const r = cli([path, ...flags], `${PASS}\n`);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.format, 'sellerKeystore');
    assert.equal(out.metaAddress, K.seller.metaAddress);
    assert.equal(out.spendingPublicKey, S.seller.spendingPublicKey);
    assert.equal(out.viewingPublicKey, S.seller.viewingPublicKey);
    assert.equal(out.signer, K.seller.signer);
    assert.match(out.verified, /three seller keys/);
    assert.deepEqual(out.announcements, []);
    assert.ok(!leaks(r.stdout) && !leaks(r.stderr), 'a secret was printed');
  }
});

test('CLI: --scan-announcement recovers a payment; its one-time key only with the flag, never the seller keys', () => {
  const path = fileOf('ghostpay-keystore.json', VALID);
  const a3 = byId('a3');
  const quiet = cli([path, '--scan-announcement', announcementArg(a3)], PASS);
  assert.equal(quiet.status, 0, quiet.stderr);
  const derived = JSON.parse(quiet.stdout).announcements[0];
  assert.equal(derived.owned, true);
  assert.equal(derived.stealthAddress, a3.expected.stealthAddress);
  assert.equal(derived.privateKey, undefined);
  assert.ok(!leaks(quiet.stdout) && !leaks(quiet.stderr));
  const revealed = cli([path, '--scan-announcement', announcementArg(a3), '--reveal-private-keys'], PASS);
  assert.equal(revealed.status, 0, revealed.stderr);
  assert.ok(JSON.parse(revealed.stdout).announcements[0].privateKey === a3.expected.privateKey, 'revealed key differs');
  assert.ok(!leaks(revealed.stdout, [a3.expected.privateKey]) && !leaks(revealed.stderr), 'a seller key or another payment key was printed');
  // A payment that belongs to someone else is reported as not owned, with a failing status.
  const foreign = cli([fileOf('other.json', OTHER), '--scan-announcement', announcementArg(a3), '--reveal-private-keys'], PASS);
  assert.equal(foreign.status, 1);
  const notOwned = JSON.parse(foreign.stdout).announcements[0];
  assert.equal(notOwned.owned, false);
  assert.equal(notOwned.privateKey, undefined);
  assert.ok(!leaks(foreign.stdout) && !leaks(foreign.stderr));
});

test("CLI: --expected-meta-address accepts the seller's backup and refuses another seller's before reading a passphrase", () => {
  const mine = fileOf('ghostpay-keystore.json', VALID);
  const theirs = fileOf('other-keystore.json', OTHER);
  const master = fileOf('ghostpay-stealth-master.json', S.files.master.text);
  assert.equal(cli([mine, '--expected-meta-address', K.seller.metaAddress], PASS).status, 0);
  // Hex case in the argument does not matter; the comparison is on the canonical lowercase form.
  assert.equal(cli([mine, '--expected-meta-address', `st:eth:0x${K.seller.metaAddress.slice(9).toUpperCase()}`], PASS).status, 0);
  // No passphrase is supplied: a refusal with this code proves the identity was checked first.
  for (const [file, expected] of [[theirs, K.seller.metaAddress], [master, K.otherSeller.metaAddress]]) {
    for (const extra of [[], ['--inspect']]) {
      const r = cli([file, ...extra, '--expected-meta-address', expected], '');
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, /^error: wrongMetaAddress:/);
      assert.equal(r.stdout, '');
    }
  }
  assert.equal(cli([master, '--expected-meta-address', S.seller.metaAddress], S.passphrase).status, 0);
  // Malformed values and files without a meta-address are usage errors.
  for (const args of [[mine, '--expected-meta-address', 'st:eth:0x1234'], [mine, '--expected-meta-address'],
    [fileOf('ghostpay-stealth-keypair.json', S.files.single.text), '--expected-meta-address', S.seller.metaAddress]]) {
    assert.equal(cli(args, PASS).status, 2);
  }
});

test('CLI: inspect, wrong passphrase, tampering, unsupported versions and chain options', () => {
  const path = fileOf('ghostpay-keystore.json', VALID);
  const inspect = cli([path, '--inspect']);
  assert.equal(inspect.status, 0, inspect.stderr);
  const header = JSON.parse(inspect.stdout);
  assert.equal(header.format, 'sellerKeystore');
  assert.equal(header.header.metaAddress, K.seller.metaAddress);
  assert.match(header.note, /not authenticated until/);
  const wrong = cli([path], 'not-the-passphrase-at-all\n');
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /^error: wrongPassphraseOrModified:/);
  assert.equal(wrong.stdout, '');
  assert.doesNotMatch(wrong.stderr, /not-the-passphrase/);
  for (const id of ['authentic-foreign-body', 'header-names-another-seller', 'unsupported-version', 'oversized', 'truncated']) {
    const v = K.invalid.find((x) => x.id === id);
    const r = cli([fileOf(`${id}.json`, v.text)], PASS);
    assert.equal(r.status, 1, `${id}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(`^error: ${v.reference}:`));
    assert.equal(r.stdout, '');
  }
  const chain = cli([path, '--expected-chain', '1'], PASS);
  assert.equal(chain.status, 2);
  assert.match(chain.stderr, /chain-neutral/);
  // A master backup header is no more authenticated than a keystore header under --inspect.
  const masterInspect = cli([fileOf('ghostpay-stealth-master.json', S.files.master.text), '--inspect']);
  assert.equal(masterInspect.status, 0, masterInspect.stderr);
  assert.match(JSON.parse(masterInspect.stdout).note, /not authenticated until/);
  const argvPass = cli([path, '--passphrase', PASS], '');
  assert.equal(argvPass.status, 2);
  assert.doesNotMatch(argvPass.stderr, new RegExp(PASS));
});

test('CLI: one leading UTF-8 byte-order mark is dropped for a keystore, as the app does; Spec 18 files are unchanged', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const keystore = join(dir, 'bom-keystore.json');
  writeFileSync(keystore, Buffer.concat([bom, Buffer.from(VALID, 'utf8')]));
  const r = cli([keystore, '--expected-meta-address', K.seller.metaAddress], PASS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).metaAddress, K.seller.metaAddress);
  const twice = join(dir, 'bom2-keystore.json');
  writeFileSync(twice, Buffer.concat([bom, bom, Buffer.from(VALID, 'utf8')]));
  assert.match(cli([twice], PASS).stderr, /^error: invalidFile:/);
  // The Spec 18 formats forbid any non-ASCII character (18a section 1), so their behaviour does not change.
  const single = join(dir, 'bom-single.json');
  writeFileSync(single, Buffer.concat([bom, Buffer.from(S.files.single.text, 'utf8')]));
  const spec18 = cli([single], S.passphrase);
  assert.equal(spec18.status, 1);
  assert.match(spec18.stderr, /^error: invalidFile:/);
});

test('offline recovery of a seller keystore in a fresh directory with no GhostPay packages or repository access', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'gp-independent-keystore-'));
  try {
    const script = join(isolated, 'stealth-export-recover.mjs');
    cpSync(SCRIPT, script);
    const vendor = join(isolated, 'node_modules', '@noble');
    mkdirSync(vendor, { recursive: true });
    for (const [name, entry] of [['curves', '@noble/curves/secp256k1.js'], ['hashes', '@noble/hashes/sha3.js']]) {
      cpSync(dirname(fileURLToPath(import.meta.resolve(entry))), join(vendor, name), { recursive: true, dereference: true });
    }
    const permissionFlag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
    const denied = spawnSync(process.execPath, [permissionFlag, `--allow-fs-read=${isolated}`, '-e',
      "try { require('node:fs').readFileSync(process.argv[1]); process.exitCode = 1; } catch (error) { if (error.code !== 'ERR_ACCESS_DENIED') throw error; }", SCRIPT,
    ], { cwd: isolated, encoding: 'utf8', env: { PATH: '' } });
    assert.equal(denied.status, 0, `repository access was not refused: ${denied.stderr}`);
    const path = join(isolated, 'ghostpay-keystore.json');
    writeFileSync(path, VALID);
    // Only the backup, the script and two noble packages are readable: no browser, profile storage, GhostPay package,
    // website or hosted service exists for this process.
    const a4 = byId('a4');
    const r = spawnSync(process.execPath, [permissionFlag, `--allow-fs-read=${isolated}`, script, path,
      '--expected-meta-address', K.seller.metaAddress, '--scan-announcement', announcementArg(a4), '--reveal-private-keys',
    ], { cwd: isolated, input: PASS, encoding: 'utf8', env: { PATH: '' } });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.metaAddress, K.seller.metaAddress);
    assert.equal(out.announcements[0].owned, true);
    assert.ok(out.announcements[0].privateKey === a4.expected.privateKey, 'isolated recovery changed spending authority');
    assert.ok(!leaks(r.stdout, [a4.expected.privateKey]) && !leaks(r.stderr), 'isolated recovery exposed seller keys');
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
});
