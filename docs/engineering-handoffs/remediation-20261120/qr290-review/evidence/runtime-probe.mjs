// Run with Node 22 against an exact git-show copy of qrKinds.ts.
// Imports the actual TypeScript module; no source rewriting or API shim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const path = resolve(process.argv[2]);
const source = await import(pathToFileURL(path).href);
const observations = [];
const make = [
  ['callable with conversion hook', (first, second, hit) => Object.assign(() => undefined, { [Symbol.toPrimitive]: () => { hit(); return first; } })],
  ['proxy conversion lookup', (first, second, hit) => new Proxy({}, { get(_target, key) { hit(); return key === Symbol.toPrimitive ? () => first : undefined; } })],
  ['revoked proxy', () => { const r = Proxy.revocable({}, {}); r.revoke(); return r.proxy; }],
  ['throwing conversion getter', (first, second, hit) => Object.defineProperty({}, Symbol.toPrimitive, { get() { hit(); throw new RangeError('conversion getter ran'); } })],
  ['stateful conversion', (first, second, hit) => { let calls = 0; return { [Symbol.toPrimitive]() { hit(); return calls++ === 0 ? first : second; } }; }],
  ['array conversion getter', (first, second, hit) => Object.defineProperty([], 'toString', { get() { hit(); return () => first; } })],
  ['boxed string', (first) => Object(first)],
  ['valueOf fallback', (first, second, hit) => ({ toString: undefined, valueOf() { hit(); return first; } })],
];

for (const [name, factory] of make) {
  for (const [boundary, first, second, expectedMessage] of [
    ['kindForPayload', 'keystore-backup', 'invoice-link', 'unknown QR payload type'],
    ['qrKindClass', 'secret', 'shareable', 'unknown QR kind'],
  ]) {
    let hooks = 0;
    const input = factory(first, second, () => { hooks++; });
    let returned, error;
    try { returned = source[boundary](input); }
    catch (e) { error = { name: e?.name, message: e?.message }; }
    observations.push({ name, boundary, hooks, returned, error,
      passed: error?.name === 'TypeError' && error?.message === expectedMessage && hooks === 0 });
  }
}

const payloads = {
  'keystore-backup': 'secret', 'recovery-data': 'secret', 'spend-key': 'secret',
  'invoice-link': 'shareable', 'invoice-link-passphrase': 'shareable', 'stealth-meta-address': 'shareable',
  'payment-request': 'shareable', 'registry-entry': 'shareable', 'invoice-link-with-key': 'bearer',
  settings: 'device', 'rpc-list': 'device', 'pinned-signers': 'device',
  receipt: 'proof', 'payment-proof': 'proof', 'signed-manifest': 'proof', fingerprint: 'proof',
};
let controlCount = 0;
for (const [payload, kind] of Object.entries(payloads)) {
  for (let bits = 0; bits < 8; bits++) {
    const flags = { testnet: (bits & 1) !== 0, unsigned: (bits & 2) !== 0, unverified: (bits & 4) !== 0 };
    const expected = kind === 'secret' || kind === 'bearer' || bits === 0 ? kind : 'caution';
    assert.equal(source.kindForPayload(payload, flags), expected);
    controlCount++;
  }
}
for (const kind of ['secret', 'shareable', 'bearer', 'device', 'proof', 'caution']) {
  assert.equal(source.qrKindClass(kind), `qr-kind-${kind}`);
  controlCount++;
}
for (const key of ['', '__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'undefined']) {
  assert.throws(() => source.kindForPayload(key), { name: 'TypeError', message: 'unknown QR payload type' });
  assert.throws(() => source.qrKindClass(key), { name: 'TypeError', message: 'unknown QR kind' });
  controlCount += 2;
}
const result = {
  node: process.version,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  controls_passed: controlCount,
  adversarial_passed: observations.filter((x) => x.passed).length,
  adversarial_failed: observations.filter((x) => !x.passed).length,
  observations,
};
console.log(JSON.stringify(result, null, 2));
if (result.adversarial_failed > 0) process.exitCode = 1;
