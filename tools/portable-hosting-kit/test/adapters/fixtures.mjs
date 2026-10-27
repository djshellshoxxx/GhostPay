// @ts-check
// Shared test fixtures for the transport adapters (not a test file itself).
import assert from 'node:assert/strict';
import { isKitError } from '../../src/errors.mjs';

/** @typedef {import('../../src/types.mjs').HostConfig} HostConfig */

/**
 * @param {Partial<HostConfig>} [over]
 * @returns {HostConfig}
 */
export function onionHost(over = {}) {
  return {
    schemaVersion: 1,
    transport: 'onion',
    publicOrigin: null,
    basePath: '/',
    listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 },
    mirrorLabel: 'GhostPay onion mirror',
    onionLocation: null,
    ...over,
  };
}

export const B32 = `${'b'.repeat(52)}.b32.i2p`;

/**
 * @param {Partial<HostConfig>} [over]
 * @returns {HostConfig}
 */
export function i2pHost(over = {}) {
  return {
    schemaVersion: 1,
    transport: 'i2p',
    publicOrigin: `http://${B32}`,
    basePath: '/',
    listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 },
    mirrorLabel: 'GhostPay I2P mirror',
    onionLocation: null,
    ...over,
  };
}

/**
 * @param {{ name: string, data: Uint8Array }[]} files
 * @param {string} name
 */
export function text(files, name) {
  const f = files.find((x) => x.name === name);
  assert.ok(f, `missing ${name}; have ${files.map((x) => x.name).join(', ')}`);
  assert.ok(f.data instanceof Uint8Array);
  return new TextDecoder().decode(f.data);
}

/**
 * Non-empty, non-comment lines.
 * @param {string} t
 */
export function directives(t) {
  return t.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
}

/**
 * @param {() => unknown} fn
 * @param {string} code
 * @param {RegExp} [msg]
 */
export function throwsCode(fn, code, msg) {
  assert.throws(fn, (e) => {
    assert.ok(isKitError(e), `expected KitError, got ${String(e)}`);
    assert.equal(e.code, code, e.message);
    if (msg) assert.match(e.message, msg);
    return true;
  });
}
