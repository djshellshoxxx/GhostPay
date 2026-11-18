import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../check-chain-matrix.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30_000 });

test('checked-in provenance inventory matches all built runtime chains, tokens and feeds', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /14 chains, 9 tokens, 4 feeds/);
});
test('actual release command fails closed while enabled chains lack runtime/deployment acceptance', () => {
  const result = run('--release');
  assert.equal(result.status, 1, result.stderr);
  for (const field of ['announcer', 'registry', 'deployment', 'permit', 'acceptance']) {
    assert.match(result.stderr, new RegExp(`${field}.*required release cell is not verified`));
  }
  assert.doesNotMatch(result.stdout, /passed/);
});
test('unknown flags cannot turn the release command into an inventory-only success', () => {
  for (const args of [['--release=false'], ['--release', '--unknown']]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /usage:/);
  }
});
