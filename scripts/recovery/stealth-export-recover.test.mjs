// node --test scripts/recovery/stealth-export-recover.test.mjs
// Checks the independent reference decoder against test-vectors/stealth-export.json (spec 18). The vectors and the
// generator are TEST-ONLY; the decoder itself imports no GhostPay package (asserted below). One cross-implementation
// test also decrypts fresh files written by the built @ghostpay/ux-vault codec (needs `npm run build:libs`).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canonical,
  decryptKeypairFile,
  decryptMasterFile,
  deriveFromAnnouncement,
  detectFormat,
  inspectKeypairFile,
  inspectMasterFile,
  LIMITS,
  main,
  parsePublicRecord,
  parseRawPrivateKeyText,
  serializePublicRecord,
} from './stealth-export-recover.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, 'stealth-export-recover.mjs');
const V = JSON.parse(readFileSync(resolve(here, '../../test-vectors/stealth-export.json'), 'utf8'));
const PASS = V.passphrase;
const byId = (id) => V.announcements.find((a) => a.id === id);
const hex = (b) => `0x${Buffer.from(b).toString('hex')}`;
const files = V.files;

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

/** Edits the parsed file object and re-serializes it the way an exporter writes it. */
const edit = (text, mutate) => {
  const o = JSON.parse(text);
  mutate(o);
  return JSON.stringify(o, null, 2);
};

test('independence: the decoder imports only node: built-ins and @noble/curves + @noble/hashes', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const specifiers = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.ok(specifiers.length > 0);
  for (const s of specifiers) assert.match(s, /^(?:node:[a-z/]+|@noble\/curves\/[a-z0-9]+\.js|@noble\/hashes\/[a-z0-9]+\.js)$/, `forbidden import ${s}`);
  assert.doesNotMatch(src, /@ghostpay\/|from ['"]\.\.?\//);
});

test('canonical() matches format section 1.5 (sorted keys, no whitespace, integers, JSON.stringify strings)', () => {
  assert.equal(canonical({ b: [1, 'x"y'], a: { d: 0, c: 'z' } }), '{"a":{"c":"z","d":0},"b":[1,"x\\"y"]}');
  assert.throws(() => canonical({ a: 1.5 }));
  assert.throws(() => canonical({ a: -1 }));
});

test('public record: validates, binds publicKey to stealthAddress and re-serializes byte for byte', () => {
  const record = parsePublicRecord(files.public.text);
  const a1 = byId(files.public.announcement);
  assert.equal(record.stealthAddress, a1.expected.stealthAddress);
  assert.equal(record.publicKey.value, a1.expected.publicKey);
  assert.equal(record.ephemeralPublicKey, a1.announcement.ephemeralPublicKey);
  assert.equal(record.viewTag, a1.expected.announcedViewTag);
  assert.equal(serializePublicRecord(record), files.public.text);
  assert.equal(detectFormat(files.public.text), 'public');
  assert.doesNotMatch(files.public.text, new RegExp(a1.expected.privateKey.slice(2), 'i'));
});

test('public record: tampered or malformed records are refused', async () => {
  const t = files.public.text;
  const other = byId('a2').expected;
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.publicKey.value = other.publicKey; })), 'keyDoesNotMatch');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.stealthAddress = o.stealthAddress.toLowerCase(); })), 'invalidFile');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.extra = 1; })), 'invalidFile');
  await refuses(() => parsePublicRecord(edit(t, (o) => { delete o.exportedAt; })), 'invalidFile');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.version = 2; })), 'unsupportedVersion');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.format = 'ghostpay-stealth-public-v2'; })), 'unsupportedVersion');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.schemeId = 2; })), 'unsupportedScheme');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.announcement.blockNumber = '18446744073709551616'; })), 'invalidFile');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.announcement.blockNumber = '01'; })), 'invalidFile');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.exportedAt = '2026-02-30T00:00:00Z'; })), 'invalidFile');
  await refuses(() => parsePublicRecord(edit(t, (o) => { o.viewTag = '0x2'; })), 'invalidFile');
  await refuses(() => parsePublicRecord(t.replace('"version": 1,', '"version": 1,\n  "version": 1,')), 'invalidFile');
  await refuses(() => parsePublicRecord(t.replace('"version": 1', '"version": 1.0')), 'invalidFile');
  await refuses(() => parsePublicRecord(t.replace('2026', '²026')), 'invalidFile');
  await refuses(() => parsePublicRecord(t + ' '.repeat(LIMITS.publicRecordBytes)), 'tooLarge');
});

test('single keypair file: decrypts the a1 key and re-serializes byte for byte', async () => {
  const { header, payments } = await decryptKeypairFile(files.single.text, PASS, { expectedChainId: V.chainId });
  assert.equal(header.scope, 'single');
  assert.equal(header.count, 1);
  assert.equal(JSON.stringify({ ...inspectKeypairFile(files.single.text).header, ciphertext: JSON.parse(files.single.text).ciphertext }, null, 2), files.single.text);
  const a1 = byId(files.single.announcements[0]);
  assert.equal(payments[0].record.stealthAddress, a1.expected.stealthAddress);
  assert.ok(hex(payments[0].privateKey) === a1.expected.privateKey, 'single: decrypted key differs from the vector');
});

test('archive: three keys in address order, each matching its vector; a3 is not in it', async () => {
  const { header, payments } = await decryptKeypairFile(files.archive.text, PASS);
  assert.equal(header.scope, files.archive.scope);
  assert.equal(header.count, files.archive.announcements.length);
  const expected = files.archive.announcements.map((id) => byId(id).expected).sort((x, y) => (x.stealthAddress.toLowerCase() < y.stealthAddress.toLowerCase() ? -1 : 1));
  assert.deepEqual(payments.map((p) => p.record.stealthAddress), expected.map((e) => e.stealthAddress));
  payments.forEach((p, i) => {
    assert.equal(p.record.publicKey.value, expected[i].publicKey);
    assert.ok(hex(p.privateKey) === expected[i].privateKey, `archive entry ${i}: decrypted key differs from the vector`);
  });
  const archived = new Set(payments.map((p) => p.record.stealthAddress));
  for (const id of files.archive.omitted) assert.ok(!archived.has(byId(id).expected.stealthAddress));
  assert.ok(byId('a4').expected.tagMatches === false && archived.has(byId('a4').expected.stealthAddress), 'deep-scan payment is archived');
});

test('master backup: recovers the seller pair and every vector announcement, including one omitted from the archive', async () => {
  const master = await decryptMasterFile(files.master.text, PASS);
  assert.equal(master.header.metaAddress, V.seller.metaAddress);
  assert.equal(master.header.spendingPublicKey, V.seller.spendingPublicKey);
  assert.equal(master.header.viewingPublicKey, V.seller.viewingPublicKey);
  assert.ok(hex(master.spendingKey) === V.seller.spendingPrivateKey, 'spending key differs from the vector');
  assert.ok(hex(master.viewingKey) === V.seller.viewingPrivateKey, 'viewing key differs from the vector');
  assert.ok(files.archive.omitted.length > 0, 'vectors must include an announcement left out of the archive');
  for (const a of V.announcements) {
    const d = deriveFromAnnouncement(master, a.announcement);
    assert.equal(d.owned, true, `${a.id} not recovered`);
    assert.equal(d.stealthAddress, a.expected.stealthAddress);
    assert.equal(d.publicKey, a.expected.publicKey);
    assert.equal(d.derivedViewTag, a.expected.derivedViewTag);
    assert.equal(d.announcedViewTag, a.expected.announcedViewTag);
    assert.ok(hex(d.privateKey) === a.expected.privateKey, `${a.id}: derived key differs from the vector`);
  }
  const foreign = deriveFromAnnouncement(master, { ...byId('a1').announcement, stealthAddress: byId('a2').expected.stealthAddress });
  assert.equal(foreign.owned, false);
  assert.equal(foreign.privateKey, undefined);
  assert.throws(() => deriveFromAnnouncement(master, { ...byId('a1').announcement, schemeId: '2' }), { code: 'unsupportedScheme' });
  assert.throws(() => deriveFromAnnouncement(master, { ...byId('a1').announcement, ephemeralPublicKey: '0x04' }), { code: 'invalidAnnouncement' });
});

test('raw private-key text: exact section 6 layout and the key controls the address', async () => {
  const raw = parseRawPrivateKeyText(files.rawPrivateKey.text);
  const a1 = byId(files.rawPrivateKey.announcement).expected;
  assert.equal(raw.chainId, V.chainId);
  assert.equal(raw.stealthAddress, a1.stealthAddress);
  assert.ok(hex(raw.privateKey) === a1.privateKey, 'raw key differs from the vector');
  assert.equal(detectFormat(files.rawPrivateKey.text), 'rawPrivateKey');
  await refuses(() => parseRawPrivateKeyText(files.rawPrivateKey.text.replace(/\n/g, '\r\n')), 'invalidFile');
  await refuses(() => parseRawPrivateKeyText(files.rawPrivateKey.text.slice(0, -1)), 'invalidFile');
  await refuses(() => parseRawPrivateKeyText(files.rawPrivateKey.text.replace(/Private key: 0x([0-9a-f]+)/, (_, k) => `Private key: 0x${k.toUpperCase()}`)), 'invalidFile');
  await refuses(() => parseRawPrivateKeyText(files.rawPrivateKey.text.replace(a1.stealthAddress, byId('a2').expected.stealthAddress)), 'keyDoesNotMatch');
});

test('every invalid[] vector is refused with its documented error code', async () => {
  assert.ok(V.invalid.length >= 10);
  for (const bad of V.invalid) {
    const pass = bad.passphrase ?? PASS;
    const run = bad.format === 'keypair' ? () => decryptKeypairFile(bad.text, pass) : () => decryptMasterFile(bad.text, pass);
    await refuses(run, bad.error);
  }
});

test('tampering, wrong passphrase, wrong chain and bounds fail closed', async () => {
  const s = files.single.text;
  await refuses(() => decryptKeypairFile(s, `${PASS}x`), 'wrongPassphraseOrModified');
  await refuses(() => decryptKeypairFile(s, PASS.toUpperCase()), 'wrongPassphraseOrModified');
  await refuses(() => decryptKeypairFile(s, PASS, { expectedChainId: 1 }), 'wrongChain');
  // Every header field is AAD: a valid but different header must not decrypt.
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.payments[0].announcement.logIndex += 1; }), PASS), 'wrongPassphraseOrModified');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.payments[0].exportedAt = '2026-11-18T00:00:01Z'; }), PASS), 'wrongPassphraseOrModified');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.kdf.r = 4; }), PASS), 'wrongPassphraseOrModified');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.scope = 'selected'; }), PASS), 'wrongPassphraseOrModified');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.chainId = 1; o.payments[0].chainId = 1; }), PASS), 'wrongPassphraseOrModified');
  for (const at of [2, 40, -2]) {
    await refuses(() => decryptKeypairFile(edit(s, (o) => {
      const c = o.ciphertext;
      const i = at < 0 ? c.length + at : at;
      o.ciphertext = c.slice(0, i) + (c[i] === '0' ? '1' : '0') + c.slice(i + 1);
    }), PASS), 'wrongPassphraseOrModified');
  }
  // Structural refusals happen before the KDF.
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.ciphertext = o.ciphertext.slice(0, -2); }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.kdf.N = 2 ** 19; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.kdf.N = 3 * 2 ** 14; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.kdf.p = 3; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.kdf.salt = '0x0101'; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.cipher.tagLength = 96; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.count = 2; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.payments[0].chainId = 1; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.version = 2; }), PASS), 'unsupportedVersion');
  await refuses(() => decryptKeypairFile(edit(s, (o) => { o.format = 'ghostpay-stealth-master-v1'; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(s + ' '.repeat(LIMITS.keypairFileBytes), PASS), 'tooLarge');
  const arc = files.archive.text;
  await refuses(() => decryptKeypairFile(edit(arc, (o) => { o.payments = [o.payments[1], o.payments[0], o.payments[2]]; }), PASS), 'invalidFile');
  await refuses(() => decryptKeypairFile(edit(arc, (o) => { o.payments[1] = o.payments[0]; }), PASS), 'duplicate');
  const m = files.master.text;
  await refuses(() => decryptMasterFile(m, `${PASS}x`), 'wrongPassphraseOrModified');
  await refuses(() => decryptMasterFile(edit(m, (o) => { o.exportedAt = '2026-11-18T00:00:01Z'; }), PASS), 'wrongPassphraseOrModified');
  await refuses(() => decryptMasterFile(edit(m, (o) => { o.metaAddress = o.metaAddress.toUpperCase(); }), PASS), 'invalidFile');
  await refuses(() => decryptMasterFile(edit(m, (o) => { o.derivation = 'eip5564-scheme1'; }), PASS), 'invalidFile');
  await refuses(() => decryptMasterFile(edit(m, (o) => { o.signingKey = '0x00'; }), PASS), 'invalidFile');
  await refuses(() => decryptMasterFile(m + ' '.repeat(LIMITS.masterFileBytes), PASS), 'tooLarge');
  assert.doesNotThrow(() => inspectMasterFile(m));
});

test('master header rejects the same key in spending and viewing roles before decryption', () => {
  const sameKeys = edit(files.master.text, (o) => {
    o.viewingPublicKey = o.spendingPublicKey;
    o.metaAddress = `st:eth:0x${o.spendingPublicKey.slice(2)}${o.spendingPublicKey.slice(2)}`;
  });
  assert.throws(() => inspectMasterFile(sameKeys), { code: 'invalidFile' });
});

test('cross-implementation: files freshly written by the built @ghostpay/ux-vault codec decrypt here', async () => {
  const portable = await import('@ghostpay/ux-vault/portable');
  const api = portable.createStealthExportApi();
  const keys = { spendingSecret: Buffer.from(V.seller.spendingPrivateKey.slice(2), 'hex'), viewingSecret: Buffer.from(V.seller.viewingPrivateKey.slice(2), 'hex') };
  const exportedAt = new Date('2026-11-18T12:34:56.789Z');
  const items = V.announcements.map((a) => api.buildVerifiedPayment({
    chainId: V.chainId,
    announcement: { ...a.announcement, schemeId: BigInt(a.announcement.schemeId), blockNumber: BigInt(a.announcement.blockNumber) },
    keys: { spendingSecret: new Uint8Array(keys.spendingSecret), viewingSecret: new Uint8Array(keys.viewingSecret) },
    exportedAt,
  }));
  // Production cost (N = 2^17 default) for one file; the bulk file uses the test cost to keep the suite fast.
  const single = await api.encryptPaymentKeys([items[0]], { scope: 'single', passphrase: PASS });
  const bulk = await api.encryptPaymentKeys([...items, items[1]], { scope: 'all-discovered', passphrase: PASS, N: 2 ** 14 });
  const master = await api.encryptMasterBackup({ spendingSecret: new Uint8Array(keys.spendingSecret), viewingSecret: new Uint8Array(keys.viewingSecret) }, { passphrase: PASS, exportedAt });
  const one = await decryptKeypairFile(single, PASS);
  assert.equal(one.header.kdf.N, 2 ** 17);
  assert.ok(hex(one.payments[0].privateKey) === byId('a1').expected.privateKey, 'codec single file: key differs');
  const all = await decryptKeypairFile(bulk, PASS, { expectedChainId: V.chainId });
  assert.equal(all.header.count, V.announcements.length);
  const want = new Map(V.announcements.map((a) => [a.expected.stealthAddress, a.expected.privateKey]));
  for (const p of all.payments) {
    assert.equal(p.record.exportedAt, '2026-11-18T12:34:56Z');
    assert.ok(hex(p.privateKey) === want.get(p.record.stealthAddress), 'codec bulk file: key differs');
  }
  const mb = await decryptMasterFile(master, PASS);
  assert.equal(mb.header.kdf.N, 2 ** 17);
  assert.ok(hex(mb.spendingKey) === V.seller.spendingPrivateKey && hex(mb.viewingKey) === V.seller.viewingPrivateKey, 'codec master file: keys differ');
  const record = items[2].record;
  assert.deepEqual(parsePublicRecord(api.serializePublicRecord(record)), record);
  for (const item of items) item.secret.fill(0);
});

// --- CLI ------------------------------------------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'gp-recover-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const fileOf = (name, text) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};
const cli = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], { input: input ?? '', encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
const allKeys = [V.seller.spendingPrivateKey, V.seller.viewingPrivateKey, ...V.announcements.map((a) => a.expected.privateKey)].map((k) => k.slice(2));
const leaks = (text) => allKeys.some((k) => text.toLowerCase().includes(k));

test('CLI: archive decrypts with the passphrase on stdin and prints no private key without the flag', () => {
  const path = fileOf('ghostpay-stealth-keypairs.json', files.archive.text);
  const r = cli([path], `${PASS}\n`);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.count, 3);
  assert.deepEqual(out.payments.map((p) => p.stealthAddress).sort(), files.archive.announcements.map((id) => byId(id).expected.stealthAddress).sort());
  assert.ok(!leaks(r.stdout) && !leaks(r.stderr), 'a private key was printed without --reveal-private-keys');
  const revealed = cli([path, '--reveal-private-keys'], PASS);
  assert.equal(revealed.status, 0, revealed.stderr);
  for (const p of JSON.parse(revealed.stdout).payments) assert.ok(p.privateKey === V.announcements.find((a) => a.expected.stealthAddress === p.stealthAddress).expected.privateKey, 'revealed key differs');
  assert.ok(!leaks(revealed.stderr));
});

test('CLI: wrong passphrase, wrong chain, tampering and argv/env passphrases are refused without echoing input', () => {
  const path = fileOf('ghostpay-stealth-keypair.json', files.single.text);
  const wrong = cli([path], 'not-the-passphrase-at-all\n');
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /^error: wrongPassphraseOrModified:/);
  assert.equal(wrong.stdout, '');
  assert.doesNotMatch(wrong.stderr, /not-the-passphrase/);
  const chain = cli([path, '--expected-chain', '1'], PASS);
  assert.equal(chain.status, 1);
  assert.match(chain.stderr, /wrongChain/);
  const tampered = cli([fileOf('t.json', edit(files.single.text, (o) => { o.payments[0].announcement.logIndex = 9; }))], PASS);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /wrongPassphraseOrModified/);
  const argvPass = cli([path, '--passphrase', PASS], '');
  assert.equal(argvPass.status, 2);
  assert.doesNotMatch(argvPass.stderr, new RegExp(PASS));
  const envOnly = spawnSync(process.execPath, [SCRIPT, path], { input: '', encoding: 'utf8', env: { PATH: process.env.PATH ?? '', PASSPHRASE: PASS, GHOSTPAY_PASSPHRASE: PASS } });
  assert.equal(envOnly.status, 2, 'an environment passphrase must not be used');
  assert.match(envOnly.stderr, /no passphrase on standard input/);
  const inspect = cli([path, '--inspect']);
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).header.count, 1);
  assert.ok(!leaks(inspect.stdout));
});

test('CLI: master --scan-announcement recovers the archive-omitted a3 address; keys only with the flag, never master keys', () => {
  const path = fileOf('ghostpay-stealth-master.json', files.master.text);
  const a3 = byId(files.archive.omitted[0]);
  const ann = JSON.stringify({ ephemeralPublicKey: a3.announcement.ephemeralPublicKey, stealthAddress: a3.announcement.stealthAddress });
  const r = cli([path, '--scan-announcement', ann], PASS);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.metaAddress, V.seller.metaAddress);
  assert.equal(out.announcements[0].owned, true);
  assert.equal(out.announcements[0].stealthAddress, a3.expected.stealthAddress);
  assert.ok(!leaks(r.stdout), 'a key was printed without --reveal-private-keys');
  const revealed = cli([path, '--scan-announcement', `@${fileOf('a3.json', JSON.stringify(a3))}`, '--reveal-private-keys'], PASS);
  assert.equal(revealed.status, 0, revealed.stderr);
  const got = JSON.parse(revealed.stdout).announcements[0];
  assert.ok(got.privateKey === a3.expected.privateKey, 'revealed a3 key differs');
  const master = [V.seller.spendingPrivateKey, V.seller.viewingPrivateKey].map((k) => k.slice(2));
  assert.ok(!master.some((k) => revealed.stdout.includes(k)), 'master keys must never be printed');
  const foreign = cli([path, '--scan-announcement', JSON.stringify({ ...JSON.parse(ann), stealthAddress: byId('a2').expected.stealthAddress })], PASS);
  assert.equal(foreign.status, 1);
  assert.equal(JSON.parse(foreign.stdout).announcements[0].owned, false);
});

test('CLI: public record and raw-key files need no passphrase; the raw key prints only with the flag', () => {
  const pub = cli([fileOf('ghostpay-stealth-public.json', files.public.text)]);
  assert.equal(pub.status, 0, pub.stderr);
  assert.equal(JSON.parse(pub.stdout).record.stealthAddress, byId('a1').expected.stealthAddress);
  const rawPath = fileOf('ghostpay-stealth-private-key.txt', files.rawPrivateKey.text);
  const raw = cli([rawPath]);
  assert.equal(raw.status, 0, raw.stderr);
  assert.ok(!leaks(raw.stdout));
  const shown = cli([rawPath, '--reveal-private-keys']);
  assert.ok(JSON.parse(shown.stdout).privateKey === byId('a1').expected.privateKey, 'raw key differs');
  const unknown = cli([fileOf('x.json', '{"format":"ghostpay-stealth-keypair-v2","version":2}')]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unsupportedVersion/);
  const big = cli([fileOf('big.json', ' '.repeat(LIMITS.keypairFileBytes + 1))]);
  assert.equal(big.status, 1);
  assert.match(big.stderr, /tooLarge/);
});

test('CLI: header inspection refuses private-key display in either argument order', () => {
  const raw = fileOf('inspect-raw.txt', files.rawPrivateKey.text);
  const encrypted = fileOf('inspect-encrypted.json', files.single.text);
  for (const path of [raw, encrypted]) {
    for (const flags of [['--inspect', '--reveal-private-keys'], ['--reveal-private-keys', '--inspect']]) {
      const result = cli([path, ...flags]);
      assert.ok(result.stdout.length === 0, 'conflicting flags produced output');
      assert.ok(!leaks(result.stderr), 'error output contained key material');
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^error: .*--inspect.*--reveal-private-keys/);
    }
  }
});

test('CLI: expected chain is enforced for raw keys, public records and header-only inspection', () => {
  for (const [name, text, flags] of [
    ['chain-raw.txt', files.rawPrivateKey.text, ['--reveal-private-keys']],
    ['chain-public.json', files.public.text, []],
    ['chain-inspect.json', files.single.text, ['--inspect']],
  ]) {
    const path = fileOf(name, text);
    const wrong = cli([path, ...flags, '--expected-chain', '1']);
    assert.equal(wrong.status, 1, `${name}: mismatched chain accepted`);
    assert.match(wrong.stderr, /wrongChain/);
    assert.equal(wrong.stdout, '');
    const right = cli([path, ...flags, '--expected-chain', String(V.chainId)]);
    assert.equal(right.status, 0, right.stderr);
  }
});

test('CLI: a chain-neutral master backup never silently accepts an expected-chain assertion', () => {
  const path = fileOf('chain-master.json', files.master.text);
  for (const flags of [[], ['--inspect']]) {
    const result = cli([path, ...flags, '--expected-chain', String(V.chainId)], PASS);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /chain-neutral/);
  }
});

test('CLI: unknown options never echo their untrusted contents', () => {
  const path = fileOf('options.json', files.single.text);
  const marker = 'untrusted-secret-marker';
  const result = cli([path, `--${marker}`]);
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, new RegExp(marker));
  assert.match(result.stderr, /unknown option/);
});

test('CLI: failed passphrase input wipes previously received chunks and never prints their contents', async () => {
  const marker = 'synthetic-passphrase-stream-marker';
  const chunk = Buffer.from(marker, 'utf8');
  const output = [];
  const errors = [];
  const stdin = {
    isTTY: false,
    async *[Symbol.asyncIterator]() {
      yield chunk;
      throw new Error(marker);
    },
  };
  const code = await main([fileOf('interrupted-passphrase.json', files.single.text)], {
    stdin,
    stdout: { write: (text) => output.push(text) },
    stderr: { write: (text) => errors.push(text) },
  });
  assert.equal(code, 1);
  assert.equal(output.join(''), '');
  assert.ok(!errors.join('').includes(marker), 'input failure disclosed passphrase data');
  assert.ok(chunk.every((byte) => byte === 0), 'input failure retained passphrase bytes');
});

test('CLI: raw-file read buffers are wiped after successful recovery and oversized-input refusal', async (t) => {
  const captured = new Set();
  const original = fs.readSync;
  t.mock.method(fs, 'readSync', (fd, buffer, ...rest) => {
    captured.add(buffer);
    return original(fd, buffer, ...rest);
  });
  syncBuiltinESMExports();
  try {
    const output = [];
    const io = { stdout: { write: (text) => output.push(text) }, stderr: { write: () => {} } };
    const raw = fileOf('wipe-raw.txt', files.rawPrivateKey.text);
    assert.equal(await main([raw], io), 0);
    assert.ok(!leaks(output.join('')), 'raw-file verification revealed private material');
    const big = fileOf('wipe-oversized.txt', files.rawPrivateKey.text + ' '.repeat(LIMITS.keypairFileBytes));
    assert.equal(await main([big], io), 1);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
  assert.equal(captured.size, 2);
  for (const buffer of captured) assert.ok(buffer.every((byte) => byte === 0), 'owned file buffer retained plaintext');
});

test('offline recovery works in a fresh directory with no GhostPay packages or repository access', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'gp-independent-recovery-'));
  try {
    const script = join(isolated, 'stealth-export-recover.mjs');
    cpSync(SCRIPT, script);
    const vendor = join(isolated, 'node_modules', '@noble');
    mkdirSync(vendor, { recursive: true });
    for (const [name, entry] of [['curves', '@noble/curves/secp256k1.js'], ['hashes', '@noble/hashes/sha3.js']]) {
      const source = dirname(fileURLToPath(import.meta.resolve(entry)));
      cpSync(source, join(vendor, name), { recursive: true, dereference: true });
    }
    // Node 22 accepts the former experimental name; newer supported runtimes expose only the stable flag.
    // Choose a supported spelling without ever running the independence check without permission enforcement.
    const permissionFlag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
    const denied = spawnSync(process.execPath, [permissionFlag, `--allow-fs-read=${isolated}`, '-e',
      "try { require('node:fs').readFileSync(process.argv[1]); process.exitCode = 1; } catch (error) { if (error.code !== 'ERR_ACCESS_DENIED') throw error; }", SCRIPT,
    ], { cwd: isolated, encoding: 'utf8', env: { PATH: '' } });
    assert.equal(denied.status, 0, `repository access was not refused: ${denied.stderr}`);
    const run = (name, text, flags = [], input = '') => {
      const path = join(isolated, name);
      writeFileSync(path, text);
      return spawnSync(process.execPath, [
        permissionFlag, `--allow-fs-read=${isolated}`, script, path, ...flags,
      ], { cwd: isolated, input, encoding: 'utf8', env: { PATH: '' } });
    };
    // Each invocation starts a new process, with only the export, script and two noble packages readable.
    // No browser, original storage, GhostPay package, website, hosted recovery service or downloaded metadata exists.
    for (const [name, text] of [
      ['public.json', files.public.text], ['single.json', files.single.text],
      ['archive.json', files.archive.text], ['master.json', files.master.text], ['raw.txt', files.rawPrivateKey.text],
    ]) {
      const result = run(name, text, [], PASS);
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
      assert.ok(!leaks(result.stdout) && !leaks(result.stderr), 'verification revealed private keys');
    }
    const archive = run('archive.json', files.archive.text, ['--reveal-private-keys', '--expected-chain', String(V.chainId)], PASS);
    assert.equal(archive.status, 0, archive.stderr);
    const restored = JSON.parse(archive.stdout);
    assert.equal(restored.count, files.archive.announcements.length);
    for (const payment of restored.payments) {
      const expected = V.announcements.find((a) => a.expected.stealthAddress === payment.stealthAddress);
      assert.ok(payment.privateKey === expected.expected.privateKey, 'isolated recovery changed spending authority');
    }
    for (const omitted of files.archive.omitted) {
      assert.ok(!restored.payments.some((p) => p.stealthAddress === byId(omitted).expected.stealthAddress), 'archive exposed an unrelated payment');
    }
    const omitted = byId(files.archive.omitted[0]);
    const master = run('master.json', files.master.text, [
      '--scan-announcement', JSON.stringify(omitted.announcement), '--reveal-private-keys',
    ], PASS);
    assert.equal(master.status, 0, master.stderr);
    const derived = JSON.parse(master.stdout).announcements[0];
    assert.equal(derived.owned, true);
    assert.ok(derived.privateKey === omitted.expected.privateKey, 'isolated master recovery changed spending authority');
    for (const key of [V.seller.spendingPrivateKey, V.seller.viewingPrivateKey]) {
      assert.ok(!master.stdout.includes(key.slice(2)), 'isolated recovery exposed master keys');
    }
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
});
