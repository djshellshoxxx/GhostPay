import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateChainMatrix } from '../lib/chain-matrix.mjs';

const address = `0x${'12'.repeat(20)}`;
const codehash = `0x${'34'.repeat(32)}`;
const source = 'https://example.org/primary-evidence';
const cell = (value) => ({ status: 'verified', value, source, retrieved: '2026-11-16', reason: null });
const pending = (value) => ({ status: 'unverified', value, source: null, retrieved: null, reason: 'Runtime evidence pending.' });
const fixture = () => ({
  schemaVersion: 1,
  chains: [{
    chainId: 1, enabled: true,
    gasToken: cell('ETH'), finalityDepth: cell(64), getLogsMaxRange: cell(1000),
    announcer: cell({ address, codehash }), registry: cell({ address, codehash }),
    deployment: cell({ manifest: 'deployments/1.json', sha256: 'ab'.repeat(32), readback: 'https://example.org/readback' }),
    tokens: [{ symbol: 'USDC', address: cell(address), decimals: cell(6), permit: cell('erc2612'), blacklist: cell(true), eip3009: cell(true) }],
    feeds: [{ base: 'ETH', quote: 'USD', address: cell(address), decimals: cell(8), heartbeatSec: cell(3600), acceptance: cell('https://example.org/fork-acceptance') }],
  }],
});
const config = {
  chains: [{ chainId: 1, enabled: true, nativeSymbol: 'ETH', finalityDepth: 64, getLogsMaxRange: 1000 }],
  tokens: [{ chainId: 1, symbol: 'USDC', address, decimals: 6, permit: true, blacklistCapable: true }],
  feeds: [{ chainId: 1, base: 'ETH', quote: 'USD', address, decimals: 8, heartbeatSec: 3600 }],
};
const run = (matrix, release = false, configured = config) => validateChainMatrix(matrix, configured, { release });

test('complete evidence and exact config parity qualifies release', () => {
  assert.deepEqual(run(fixture(), true), []);
});
test('unverified evidence is valid inventory but never qualifies an enabled release chain', () => {
  const matrix = fixture(); matrix.chains[0].announcer = pending({ address, codehash: null });
  assert.deepEqual(run(matrix), []);
  assert.match(run(matrix, true).join('\n'), /announcer.*not verified/);
});
test('disabled chain can carry unresolved evidence but cannot lie about enabled config', () => {
  const matrix = fixture(); matrix.chains[0].enabled = false; matrix.chains[0].announcer = pending(null);
  assert.match(run(matrix, true).join('\n'), /enabled.*configuration/);
  assert.deepEqual(run(matrix, true, { ...config, chains: [{ ...config.chains[0], enabled: false }] }), []);
});
test('missing, duplicate and unknown chain rows fail closed', () => {
  for (const rows of [[], [...fixture().chains, ...fixture().chains], [{ ...fixture().chains[0], chainId: 2 }]]) {
    assert.ok(run({ ...fixture(), chains: rows }).length);
  }
});
test('every verified cell needs real-shaped HTTPS provenance and a calendar date', () => {
  for (const patch of [
    { source: null }, { source: 'http://example.org/source' }, { source: 'https://user:secret@example.org/source' },
    { source: 'garbage' }, { retrieved: null }, { retrieved: '2026-02-30' }, { retrieved: '2026-1-01' },
    { value: null }, { status: 'VERIFIED' }, { extra: true },
  ]) {
    const matrix = fixture(); Object.assign(matrix.chains[0].gasToken, patch);
    assert.ok(run(matrix).length, JSON.stringify(patch));
  }
});
test('unverified and n/a cells need a reason; n/a cannot satisfy required cells', () => {
  const matrix = fixture(); matrix.chains[0].announcer = pending(null);
  matrix.chains[0].announcer.reason = '';
  assert.match(run(matrix).join('\n'), /reason/);
  matrix.chains[0].announcer = { ...pending(null), status: 'n/a' };
  assert.match(run(matrix, true).join('\n'), /announcer.*not verified/);
});
test('contract verification requires nonzero valid address and runtime hash', () => {
  for (const value of [{ address, codehash: null }, { address: `0x${'00'.repeat(20)}`, codehash }, { address, codehash: `0x${'00'.repeat(32)}` }, { address, codehash: '0x11' }, { address, codehash, extra: true }]) {
    const matrix = fixture(); matrix.chains[0].registry.value = value;
    assert.match(run(matrix).join('\n'), /registry/);
  }
});
test('numeric, token capability and field-set mismatches fail', () => {
  for (const mutate of [
    (m) => m.chains[0].finalityDepth.value = -1,
    (m) => m.chains[0].getLogsMaxRange.value = 1.5,
    (m) => m.chains[0].tokens[0].decimals.value = 31,
    (m) => m.chains[0].tokens[0].permit.value = 'dai',
    (m) => m.chains[0].tokens[0].blacklist.value = false,
    (m) => m.chains[0].tokens[0].eip3009.value = 'yes',
    (m) => m.chains[0].feeds[0].heartbeatSec.value = 0,
    (m) => m.chains[0].feeds[0].address.value = `0x${'56'.repeat(20)}`,
    (m) => m.chains[0].feeds[0].acceptance.value = 'passed',
    (m) => m.chains[0].extra = true,
  ]) { const matrix = fixture(); mutate(matrix); assert.ok(run(matrix).length); }
});
test('omitted or duplicated token and feed cannot bypass release gate', () => {
  for (const field of ['tokens', 'feeds']) {
    for (const value of [[], [...fixture().chains[0][field], ...fixture().chains[0][field]], null]) {
      const matrix = fixture(); matrix.chains[0][field] = value;
      assert.ok(run(matrix, true).length);
    }
  }
});
test('root schema rejects malformed input and unknown keys without throwing', () => {
  for (const input of [null, [], 1, {}, { schemaVersion: 2, chains: [] }, { ...fixture(), extra: true }, { schemaVersion: 1, chains: [null] }]) {
    assert.ok(run(input).length);
  }
});
test('release requires token capabilities and feed acceptance, not source metadata alone', () => {
  const matrix = fixture(); matrix.chains[0].tokens[0].permit = pending('erc2612'); matrix.chains[0].feeds[0].acceptance = pending(null);
  assert.deepEqual(run(matrix), []);
  const errors = run(matrix, true).join('\n');
  assert.match(errors, /permit.*not verified/); assert.match(errors, /acceptance.*not verified/);
});

test('a verified unknown capability is not evidence', () => {
  const matrix = fixture(); matrix.chains[0].tokens[0].permit.value = 'unknown';
  const configured = { ...config, tokens: [{ ...config.tokens[0], permit: false }] };
  assert.match(run(matrix, true, configured).join('\n'), /permit.*invalid value/);
});
test('canonical references and deployment chain are bound to configuration', () => {
  const matrix = fixture(); matrix.chains[0].deployment.value.manifest = 'deployments/2.json';
  assert.match(run(matrix).join('\n'), /manifest path differs/);
  assert.match(run(fixture(), false, { ...config, announcer: `0x${'56'.repeat(20)}` }).join('\n'), /announcer.address.*configuration/);
});
