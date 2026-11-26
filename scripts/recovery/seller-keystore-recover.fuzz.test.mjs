// Light, deterministic fuzzing of the seller keystore reader in stealth-export-recover.mjs. Every case is derived from
// FUZZ_SEED, so a failure message that names the seed and case number replays exactly. FUZZ_SCALE multiplies the case
// counts for a deeper local run (CI uses the default of 1). Every key and passphrase here is TEST-ONLY.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCipheriv, createHash, scryptSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { addressOfPoint, decryptSellerKeystore, deriveFromAnnouncement, detectFormat, inspectSellerKeystore, wipe } from './stealth-export-recover.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, 'stealth-export-recover.mjs');
const K = JSON.parse(readFileSync(resolve(here, '../../test-vectors/seller-keystore-v1.json'), 'utf8'));
const PASS = K.passphrase;
const VALID = K.files.valid.text;
const SEED = process.env.FUZZ_SEED ?? 'ghostpay-p0-keys-fuzz-1';
const SCALE = Math.max(1, Number.parseInt(process.env.FUZZ_SCALE ?? '1', 10) || 1);
const CODES = new Set(['invalidFile', 'tooLarge', 'unsupportedVersion', 'wrongPassphraseOrModified', 'sellerKeysDoNotMatch',
  'invalidAnnouncement', 'unsupportedScheme', 'notOwned']);
const n = secp256k1.Point.Fn.ORDER;
const hex = (b) => `0x${Buffer.from(b).toString('hex')}`;
const strip = (h) => h.replace(/^0x/, '');
const SECRETS = [K.seller.spendingPrivateKey, K.seller.viewingPrivateKey, K.seller.signingPrivateKey].map((k) => strip(k));

/** Deterministic byte stream: sha256(seed:label:counter) blocks. */
function rng(label) {
  let counter = 0;
  let pool = Buffer.alloc(0);
  const bytes = (count) => {
    while (pool.length < count) pool = Buffer.concat([pool, createHash('sha256').update(`${SEED}:${label}:${counter++}`).digest()]);
    const out = pool.subarray(0, count);
    pool = pool.subarray(count);
    return Buffer.from(out);
  };
  const int = (max) => (max <= 1 ? 0 : bytes(4).readUInt32BE(0) % max);
  return { bytes, int, pick: (list) => list[int(list.length)] };
}

/** Runs `fn`, returning 'ok' or the RecoveryError code; any other exception fails the test with the case label. */
async function outcome(label, fn) {
  try {
    await fn();
    return 'ok';
  } catch (error) {
    assert.equal(error?.name, 'RecoveryError', `${label}: unexpected ${error?.name ?? typeof error}: ${error?.message ?? ''}`);
    assert.ok(CODES.has(error.code), `${label}: unknown code ${error.code}`);
    return error.code;
  }
}

const MUTATION_CHARS = ['"', ',', ':', '{', '}', '[', ']', ' ', '\n', '\\', '0', '1', 'a', 'f', 'F', 'x', 'v', '-', '.', 'e', 'é', '\u0000', '﻿'];

/** One random textual mutation: replace, insert, delete, duplicate or truncate. */
function mutate(r, text) {
  const at = r.int(text.length);
  switch (r.int(6)) {
    case 0: return text.slice(0, at) + r.pick(MUTATION_CHARS) + text.slice(at + 1);
    case 1: return text.slice(0, at) + r.pick(MUTATION_CHARS) + text.slice(at);
    case 2: return text.slice(0, at) + text.slice(at + 1 + r.int(8));
    case 3: { const len = 1 + r.int(24); return text.slice(0, at) + text.slice(at, at + len) + text.slice(at); }
    case 4: return text.slice(0, at);
    default: { const len = 1 + r.int(12); const from = r.int(text.length); return text.slice(0, at) + text.slice(from, from + len) + text.slice(at + len); }
  }
}

/** Paths of every header field, for mutations that target one field's value. */
const FIELDS = [['v'], ['kdf'], ['cipher'], ['iv'], ['ciphertext'], ['kdfParams', 'N'], ['kdfParams', 'r'], ['kdfParams', 'p'],
  ['kdfParams', 'salt'], ['meta', 'metaAddress'], ['meta', 'signer'], ['kdfParams'], ['meta']];

/** One mutation aimed at a single field: hex case, `0x` prefix, length, wrong type, removal or an extra key. */
function mutateField(r, text) {
  const f = JSON.parse(text);
  const path = r.pick(FIELDS);
  const parent = path.length === 1 ? f : f[path[0]];
  const key = path[path.length - 1];
  const value = parent[key];
  const hexAt = (s) => { const at = r.int(s.length); return [at, s.slice(0, at), s.slice(at + 1)]; };
  switch (r.int(9)) {
    case 0: if (typeof value === 'string') { const [at, a, b] = hexAt(value); parent[key] = a + value[at].toUpperCase() + b; if (parent[key] === value) parent[key] = a + 'A' + b; } break;
    case 1: if (typeof value === 'string') parent[key] = `0x${value}`; break;
    case 2: if (typeof value === 'string') parent[key] = value.slice(0, -2 * (1 + r.int(2))); break;
    case 3: if (typeof value === 'string') parent[key] = `${value}${'00'.repeat(1 + r.int(2))}`; break;
    case 4: if (typeof value === 'string') { const [, a, b] = hexAt(value); parent[key] = a + r.pick(['g', 'G', ' ', '-', 'é', 'x']) + b; } break;
    case 5: parent[key] = r.pick([null, true, [], {}, 0, 1, 2 ** 53, '1', String(value)]); break;
    case 6: delete parent[key]; break;
    case 7: parent[`${key}x`] = value; break;
    default: if (typeof value === 'number') parent[key] = r.pick([value * 2, value / 2, value + 1, value - 1, 0, 2 ** 18, 2 ** 13, 9, 3]); break;
  }
  return JSON.stringify(f, null, 2);
}

test('fuzz: header mutations only ever give a fixed refusal, and never let the reader accept what GhostPay refuses', async () => {
  const { createKeystoreApi } = await import('@ghostpay/ux-vault/portable');
  const codec = createKeystoreApi();
  const r = rng('header');
  let accepted = 0;
  let codecOnly = 0;
  for (let i = 0; i < 400 * SCALE; i++) {
    const label = `header seed=${SEED} case=${i}`;
    // Half the cases edit the raw text; the other half change one field's value and keep the JSON well formed.
    let text = VALID;
    if (i % 2 === 0) for (let m = 1 + r.int(3); m > 0; m--) text = mutate(r, text);
    else text = mutateField(r, text);
    // Format detection never throws on hostile text.
    detectFormat(text);
    const mine = await outcome(label, () => inspectSellerKeystore(text));
    let theirs = 'ok';
    try { codec.validateKeystoreEnvelope(text); } catch { theirs = 'refused'; }
    if (mine === 'ok') {
      accepted++;
      assert.equal(theirs, 'ok', `${label}: the reader accepted a header GhostPay's codec refuses`);
    } else if (theirs === 'ok') {
      // The one documented difference: the codec accepts 17-1024 ciphertext bytes, the reader only the 258 GhostPay writes.
      codecOnly++;
      const parsed = JSON.parse(text);
      assert.notEqual(parsed.ciphertext.length, 2 * 258, `${label}: undocumented divergence from GhostPay's codec (${mine})`);
    }
  }
  assert.ok(accepted > 0, 'no mutant kept a valid header: the generator is not exploring valid space');
  assert.ok(codecOnly >= 0);
});

/** Encrypts `plaintext` under seller A's header exactly as keystore-portable.ts does (fixed salt, IV and N=2^14). */
const KEY = scryptSync(Buffer.from(PASS, 'utf8'), Buffer.from(JSON.parse(VALID).kdfParams.salt, 'hex'), 32, { N: K.kdf.N, r: K.kdf.r, p: K.kdf.p, maxmem: 2 ** 29 });
function sealUnderA(plaintext) {
  const f = JSON.parse(VALID);
  const c = createCipheriv('aes-256-gcm', KEY, Buffer.from(f.iv, 'hex'), { authTagLength: 16 });
  c.setAAD(Buffer.from(`GhostPay.keystore.v1|${f.meta.metaAddress}|${f.meta.signer}|${f.kdfParams.N}|${f.kdfParams.r}|${f.kdfParams.p}`, 'utf8'));
  f.ciphertext = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final(), c.getAuthTag()]).toString('hex');
  return JSON.stringify(f, null, 2);
}

test('fuzz: tampering with any authenticated field or byte is refused, never accepted', async () => {
  const r = rng('envelope');
  const other = JSON.parse(K.files.otherSeller.text);
  const tamper = [
    (f) => { const at = r.int(f.ciphertext.length); f.ciphertext = f.ciphertext.slice(0, at) + ((Number.parseInt(f.ciphertext[at], 16) + 1 + r.int(15)) % 16).toString(16) + f.ciphertext.slice(at + 1); },
    (f) => { const at = r.int(f.iv.length); f.iv = f.iv.slice(0, at) + ((Number.parseInt(f.iv[at], 16) + 1) % 16).toString(16) + f.iv.slice(at + 1); },
    (f) => { const at = r.int(f.kdfParams.salt.length); f.kdfParams.salt = f.kdfParams.salt.slice(0, at) + ((Number.parseInt(f.kdfParams.salt[at], 16) + 1) % 16).toString(16) + f.kdfParams.salt.slice(at + 1); },
    (f) => { f.kdfParams.r = 1 + r.int(7); },
    (f) => { f.kdfParams.p = 2; },
    (f) => { f.kdfParams.N = 2 ** 15; },
    (f) => { f.meta.signer = other.meta.signer; },
    (f) => { f.meta.metaAddress = other.meta.metaAddress; },
    (f) => { f.meta = other.meta; },
  ];
  for (let i = 0; i < 14 * SCALE; i++) {
    const label = `envelope seed=${SEED} case=${i}`;
    const f = JSON.parse(VALID);
    r.pick(tamper)(f);
    const text = JSON.stringify(f, null, 2);
    if (text === VALID) continue;
    const result = await outcome(label, async () => { const s = await decryptSellerKeystore(text, PASS); wipe(s.spendingKey, s.viewingKey); });
    assert.notEqual(result, 'ok', `${label}: a tampered keystore was accepted`);
  }
});

test('fuzz: authentic but malformed bodies are refused, and an accepted body always yields the true keys', async () => {
  const { createKeystoreApi } = await import('@ghostpay/ux-vault/portable');
  const codec = createKeystoreApi();
  const r = rng('body');
  const canonical = JSON.stringify({ spendingKey: SECRETS[0], viewingKey: SECRETS[1], signingKey: SECRETS[2] });
  const variants = [
    () => mutate(r, canonical),
    () => canonical.replace(/[0-9a-f](?=[0-9a-f]{0,63}")/, (c) => c.toUpperCase()),
    () => canonical.replace(':', ': '),
    () => JSON.stringify({ viewingKey: SECRETS[1], spendingKey: SECRETS[0], signingKey: SECRETS[2] }),
    () => JSON.stringify({ spendingKey: SECRETS[0], viewingKey: SECRETS[1], signingKey: hex(r.bytes(32)).slice(2) }),
    () => JSON.stringify({ spendingKey: hex(r.bytes(32)).slice(2), viewingKey: SECRETS[1], signingKey: SECRETS[2] }),
    () => JSON.stringify({ spendingKey: SECRETS[0], viewingKey: SECRETS[0], signingKey: SECRETS[2] }),
    () => JSON.stringify({ spendingKey: 'f'.repeat(64), viewingKey: SECRETS[1], signingKey: SECRETS[2] }),
    () => JSON.stringify({ spendingKey: n.toString(16), viewingKey: SECRETS[1], signingKey: SECRETS[2] }),
    () => `${canonical} `,
  ];
  // Round-robin, so every variant runs at least twice whatever the seed.
  for (let i = 0; i < 2 * variants.length * SCALE; i++) {
    const label = `body seed=${SEED} case=${i}`;
    const body = variants[i % variants.length]();
    const text = sealUnderA(body);
    let keys;
    const mine = await outcome(label, async () => { keys = await decryptSellerKeystore(text, PASS); });
    if (mine === 'ok') {
      assert.equal(body, canonical, `${label}: a non-canonical body was accepted`);
      assert.ok(hex(keys.spendingKey) === K.seller.spendingPrivateKey && hex(keys.viewingKey) === K.seller.viewingPrivateKey, `${label}: accepted with other keys`);
      wipe(keys.spendingKey, keys.viewingKey);
      const s = await codec.decryptKeystore(text, PASS);
      assert.ok(hex(s.spendingKey) === K.seller.spendingPrivateKey, `${label}: the codec disagrees on an accepted body`);
      wipe(s.spendingKey, s.viewingKey, s.signingKey);
    } else {
      assert.ok(mine === 'invalidFile' || mine === 'sellerKeysDoNotMatch', `${label}: unexpected refusal ${mine}`);
    }
  }
});

test('fuzz: announcements claim exactly the genuine payments and reject malformed input with fixed codes', async () => {
  const pair = await decryptSellerKeystore(VALID, PASS);
  const r = rng('announcement');
  const spend = secp256k1.Point.fromBytes(secp256k1.getPublicKey(pair.spendingKey, true));
  const viewPub = secp256k1.getPublicKey(pair.viewingKey, true);
  const randomPoint = () => hex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(r.bytes(48)), true));
  try {
    for (let i = 0; i < 150 * SCALE; i++) {
      const label = `announcement seed=${SEED} case=${i}`;
      const kind = r.int(4);
      if (kind === 0) {
        // A genuine scheme-1 payment, built from the payer side with noble only.
        const eph = secp256k1.utils.randomSecretKey(r.bytes(48));
        const h = BigInt(hex(keccak_256(secp256k1.getSharedSecret(eph, viewPub, true)))) % n;
        if (h === 0n) continue;
        const stealthAddress = addressOfPoint(spend.add(secp256k1.Point.BASE.multiply(h)).toBytes(true));
        const d = deriveFromAnnouncement(pair, { ephemeralPublicKey: hex(secp256k1.getPublicKey(eph, true)), stealthAddress });
        assert.equal(d.owned, true, `${label}: a genuine payment was not claimed`);
        assert.equal(addressOfPoint(secp256k1.getPublicKey(d.privateKey, true)), stealthAddress, `${label}: key does not control the address`);
        wipe(d.privateKey);
      } else if (kind === 1) {
        const d = deriveFromAnnouncement(pair, { ephemeralPublicKey: randomPoint(), stealthAddress: hex(r.bytes(20)) });
        assert.equal(d.owned, false, `${label}: a random announcement was claimed`);
        assert.equal(d.privateKey, undefined, `${label}: a key was returned for an unowned announcement`);
      } else {
        const junk = [null, 7, 'x', [], {}, { ephemeralPublicKey: hex(r.bytes(33)), stealthAddress: hex(r.bytes(20)) },
          { ephemeralPublicKey: randomPoint(), stealthAddress: hex(r.bytes(r.int(30))) },
          { ephemeralPublicKey: randomPoint().slice(0, 2 + r.int(66)), stealthAddress: hex(r.bytes(20)) },
          { ephemeralPublicKey: randomPoint(), stealthAddress: hex(r.bytes(20)), schemeId: r.pick(['2', 2, '0']) },
          { ephemeralPublicKey: randomPoint(), stealthAddress: hex(r.bytes(20)), metadata: r.pick(['0x', 'zz', 5, '0x1']) }];
        const value = r.pick(junk);
        const result = await outcome(label, () => {
          const d = deriveFromAnnouncement(pair, value);
          assert.equal(d.owned, false, `${label}: junk announcement claimed`);
        });
        assert.ok(result === 'ok' || result === 'invalidAnnouncement' || result === 'unsupportedScheme', `${label}: ${result}`);
      }
    }
  } finally {
    wipe(pair.spendingKey, pair.viewingKey);
  }
});

test('fuzz: random CLI invocations exit 0, 1 or 2, never crash, and never print a seller secret', () => {
  const r = rng('cli');
  const dir = mkdtempSync(join(tmpdir(), 'gp-keystore-fuzz-'));
  try {
    const files = [
      ['ghostpay-keystore.json', VALID],
      ['other.json', K.files.otherSeller.text],
      ['mutated.json', mutate(r, VALID)],
      ['v2.json', VALID.replace('"v": 1', '"v": 2')],
    ].map(([name, text]) => { const p = join(dir, name); writeFileSync(p, text); return p; });
    const ann = JSON.stringify({ ephemeralPublicKey: hex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(r.bytes(48)), true)), stealthAddress: hex(r.bytes(20)) });
    const flags = [['--inspect'], ['--reveal-private-keys'], ['--expected-chain', '1'], ['--expected-chain', 'x'],
      ['--expected-meta-address', K.seller.metaAddress], ['--expected-meta-address', K.otherSeller.metaAddress],
      ['--expected-meta-address', 'st:eth:0x00'], ['--scan-announcement', ann], ['--scan-announcement', '{'], ['--scan-announcement'],
      ['--unknown'], ['-h'], [r.pick(files)]];
    for (let i = 0; i < 12 * SCALE; i++) {
      const label = `cli seed=${SEED} case=${i}`;
      const args = [r.pick(files)];
      for (let k = r.int(4); k > 0; k--) args.push(...r.pick(flags));
      const res = spawnSync(process.execPath, [SCRIPT, ...args], { input: r.pick([`${PASS}\n`, '', 'wrong-passphrase-entirely\n']), encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
      assert.ok([0, 1, 2].includes(res.status), `${label}: exit ${res.status}`);
      assert.doesNotMatch(res.stderr, /unexpected failure/, `${label}: unhandled error`);
      const all = `${res.stdout}${res.stderr}`.toLowerCase();
      assert.ok(!SECRETS.some((s) => all.includes(s)), `${label}: a seller secret was printed`);
      assert.doesNotMatch(res.stderr, new RegExp(PASS), `${label}: the passphrase was echoed`);
      if (res.stdout !== '') JSON.parse(res.stdout);
      if (res.status === 2) assert.equal(res.stdout, '', `${label}: output despite a usage error`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
