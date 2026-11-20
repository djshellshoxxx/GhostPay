import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const source = '/workspace/scratch/fc8b0b472d30/GhostPay-qr-independent/apps/web/src/lib/qrKinds.ts';
const bytes = readFileSync(source);
const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
assert.equal(blob, 'a85e1011cdface74c87683146ff7428654b7830d');
const { kindForPayload, qrKindClass } = await import(pathToFileURL(source).href);
const map = {
  'keystore-backup': 'secret', 'recovery-data': 'secret', 'spend-key': 'secret',
  'invoice-link': 'shareable', 'invoice-link-passphrase': 'shareable',
  'stealth-meta-address': 'shareable', 'payment-request': 'shareable', 'registry-entry': 'shareable',
  'invoice-link-with-key': 'bearer', settings: 'device', 'rpc-list': 'device', 'pinned-signers': 'device',
  receipt: 'proof', 'payment-proof': 'proof', 'signed-manifest': 'proof', fingerprint: 'proof',
};
let validMappings = 0;
for (const [key, base] of Object.entries(map)) {
  assert.equal(kindForPayload(key), base);
  validMappings++;
  for (let bits = 0; bits < 8; bits++) {
    const flags = { testnet: (bits & 1) !== 0, unsigned: (bits & 2) !== 0, unverified: (bits & 4) !== 0 };
    const expected = base === 'secret' || base === 'bearer' || bits === 0 ? base : 'caution';
    assert.equal(kindForPayload(key, flags), expected, `${key}/${bits}`);
    validMappings++;
  }
}
let validFrames = 0;
for (const kind of ['secret', 'shareable', 'bearer', 'device', 'proof', 'caution']) {
  assert.equal(qrKindClass(kind), `qr-kind-${kind}`);
  validFrames++;
}
let malformedRejections = 0;
function reject(value) {
  for (const flags of [undefined, { unverified: true }]) {
    assert.throws(() => kindForPayload(value, flags), { name: 'TypeError', message: 'unknown QR payload type' });
    malformedRejections++;
  }
  assert.throws(() => qrKindClass(value), { name: 'TypeError', message: 'unknown QR kind' });
  malformedRejections++;
}
for (const value of [0, NaN, Infinity, false, true, 1n, Symbol('invoice-link'), null, undefined,
  [], ['invoice-link'], ['secret'], Object('invoice-link'), Object('secret'),
  { 0: 'invoice-link', length: 1 }, Object.create(null), () => 'invoice-link',
  'unknown', '', '__proto__', 'constructor', 'toString']) reject(value);
let hooksInvoked = 0;
const failHook = () => { hooksInvoked++; throw new Error('conversion hook executed'); };
const hooks = [
  { [Symbol.toPrimitive]: failHook },
  { toString: failHook },
  { valueOf: failHook },
  Object.defineProperty({}, Symbol.toPrimitive, { get: failHook }),
  Object.defineProperty({}, 'toString', { get: failHook }),
  new Proxy({}, { get: failHook, has: failHook, ownKeys: failHook, getOwnPropertyDescriptor: failHook }),
];
const revoked = Proxy.revocable({}, {});
revoked.revoke();
hooks.push(revoked.proxy);
for (const value of hooks) reject(value);
assert.equal(hooksInvoked, 0);
console.log(JSON.stringify({ node: process.version, sourceBlob: blob, validMappings, validFrames,
  malformedRejections, hookCases: hooks.length, hooksInvoked, result: 'PASS' }, null, 2));
