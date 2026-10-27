// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { parseHostConfig, defaultHostConfig, serializeHostConfig, isValidOnionV3Label } from '../../src/config/host-config.mjs';
import { KitError } from '../../src/errors.mjs';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** @param {Buffer} buf */
function b32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
/** Builds a syntactically valid v3 onion label from a random public key (rend-spec-v3 encoding). */
function makeOnion() {
  const pub = randomBytes(32);
  const ver = Buffer.from([3]);
  const sum = createHash('sha3-256').update('.onion checksum').update(pub).update(ver).digest().subarray(0, 2);
  return b32(Buffer.concat([pub, sum, ver]));
}

/** @param {Record<string, unknown>} over */
const base = (over) => ({ schemaVersion: 1, transport: 'clearnet', publicOrigin: 'https://example.org', basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'main', onionLocation: null, ...over });

/** @param {() => unknown} fn @param {string} code @param {RegExp} [re] */
function throwsCode(fn, code, re) {
  assert.throws(fn, (e) => e instanceof KitError && e.code === code && (re === undefined || re.test(e.message)));
}

test('accepts a clearnet config and round-trips deterministically', () => {
  const c = parseHostConfig(base({}));
  assert.equal(c.publicOrigin, 'https://example.org');
  assert.deepEqual(parseHostConfig(JSON.parse(serializeHostConfig(c))), c);
});

test('validates real and generated v3 onion addresses, rejects bad checksums', () => {
  assert.equal(isValidOnionV3Label('2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid'), true); // torproject.org onion
  const label = makeOnion();
  assert.equal(isValidOnionV3Label(label), true);
  const flipped = label.slice(0, 10) + (label[10] === 'a' ? 'b' : 'a') + label.slice(11);
  assert.equal(isValidOnionV3Label(flipped), false);
  const c = parseHostConfig(base({ transport: 'onion', publicOrigin: `http://${label}.onion` }));
  assert.equal(c.publicOrigin, `http://${label}.onion`);
  throwsCode(() => parseHostConfig(base({ transport: 'onion', publicOrigin: `http://${flipped}.onion` })), 'E_CONFIG', /checksum/);
  throwsCode(() => parseHostConfig(base({ transport: 'onion', publicOrigin: 'http://abc.onion' })), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ transport: 'onion', publicOrigin: `https://${label}.onion` })), 'E_CONFIG', /https onions/);
});

test('i2p origins: plain http b32 only (b33 and https unsupported by the generated profiles)', () => {
  const b32addr = 'a'.repeat(52);
  assert.equal(parseHostConfig(base({ transport: 'i2p', publicOrigin: `http://${b32addr}.b32.i2p` })).transport, 'i2p');
  throwsCode(() => parseHostConfig(base({ transport: 'i2p', publicOrigin: `http://${'b'.repeat(60)}.b32.i2p` })), 'E_CONFIG', /b33/);
  throwsCode(() => parseHostConfig(base({ transport: 'i2p', publicOrigin: `https://${b32addr}.b32.i2p` })), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ transport: 'i2p', publicOrigin: 'http://short.b32.i2p' })), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ transport: 'i2p', publicOrigin: 'https://example.org' })), 'E_CONFIG');
});

test('rejects plain-http clearnet, paths, credentials and onion hosts on clearnet', () => {
  throwsCode(() => parseHostConfig(base({ publicOrigin: 'http://example.org' })), 'E_CONFIG', /https/);
  throwsCode(() => parseHostConfig(base({ publicOrigin: 'https://example.org/app' })), 'E_CONFIG', /basePath/);
  throwsCode(() => parseHostConfig(base({ publicOrigin: 'https://u:p@example.org' })), 'E_CONFIG', /credentials/);
  throwsCode(() => parseHostConfig(base({ publicOrigin: `https://${makeOnion()}.onion` })), 'E_CONFIG');
});

test('listeners must stay on loopback or a unix socket', () => {
  throwsCode(() => parseHostConfig(base({ listen: { kind: 'tcp', host: '0.0.0.0', port: 8080 } })), 'E_NETWORK_SCOPE');
  throwsCode(() => parseHostConfig(base({ listen: { kind: 'tcp', host: '192.168.1.5', port: 8080 } })), 'E_NETWORK_SCOPE');
  throwsCode(() => parseHostConfig(base({ listen: { kind: 'tcp', host: '127.0.0.1', port: 80 } })), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ listen: { kind: 'unix', path: 'relative.sock' } })), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ listen: { kind: 'unix', path: '/run/../etc/x.sock' } })), 'E_CONFIG');
  assert.equal(parseHostConfig(base({ listen: { kind: 'unix', path: '/run/ghostpay/web.sock' } })).listen.kind, 'unix');
  assert.equal(parseHostConfig(base({ listen: { kind: 'tcp', host: '::1', port: 8443 } })).listen.kind, 'tcp');
});

test('base paths', () => {
  assert.equal(parseHostConfig(base({ basePath: '/mirror/app/' })).basePath, '/mirror/app/');
  for (const bad of ['mirror/', '/mirror', '/../', '/a//b/', '/.hidden/', '/a b/', '/%2e%2e/']) {
    throwsCode(() => parseHostConfig(base({ basePath: bad })), 'E_CONFIG', undefined);
  }
});

test('secrets and application trust settings are refused with a specific reason', () => {
  throwsCode(() => parseHostConfig(base({ privateKey: '00' })), 'E_CONFIG', /secret/);
  throwsCode(() => parseHostConfig(base({ apiToken: 'x' })), 'E_CONFIG', /secret/);
  throwsCode(() => parseHostConfig(base({ chainId: 1 })), 'E_CONFIG', /trust configuration/);
  throwsCode(() => parseHostConfig(base({ rpcUrl: 'https://rpc' })), 'E_CONFIG', /trust configuration/);
  throwsCode(() => parseHostConfig(base({ routerAddress: '0x' + '1'.repeat(40) })), 'E_CONFIG', /trust configuration/);
  throwsCode(() => parseHostConfig(base({ colour: 'blue' })), 'E_CONFIG', /unknown field/);
  throwsCode(() => parseHostConfig([]), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ schemaVersion: 2 })), 'E_CONFIG');
});

test('onionLocation only for clearnet and must be a valid onion', () => {
  const onion = `http://${makeOnion()}.onion`;
  assert.equal(parseHostConfig(base({ onionLocation: onion })).onionLocation, onion);
  throwsCode(() => parseHostConfig(base({ onionLocation: 'https://example.net' })), 'E_CONFIG');
  throwsCode(() => parseHostConfig(base({ transport: 'onion', publicOrigin: null, onionLocation: onion })), 'E_CONFIG');
});

test('defaults are valid for every transport', () => {
  for (const t of /** @type {const} */ (['clearnet', 'onion', 'i2p'])) assert.equal(defaultHostConfig(t).transport, t);
});
