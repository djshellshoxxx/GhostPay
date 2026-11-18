// Unit tests for the agent workspace-graph helpers. Run: node --test scripts/agent/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { affectedSet, buildsNeeded, classifyChanges, loadRepo, topoOrder } from './workspaces.mjs';
import { cell, render } from './package-map.mjs';

test('table cells escape backslashes before pipes and collapse whitespace', () => {
  assert.equal(cell('a | b'), 'a \\| b');
  assert.equal(cell('x\\|y'), 'x\\\\\\|y'); // \| -> \\\| : escaped backslash, then escaped pipe
  assert.equal(cell(' one\n two\t'), 'one two');
});

// Synthetic graph: a <- b <- c, a <- d (d has no build script), e isolated, plus apps/web and chain-adapters.
const ws = (location, deps = [], scripts = ['build', 'test']) => ({
  location,
  name: `@ghostpay/${location.split('/').pop()}`,
  description: '',
  license: 'UNLICENSED',
  scripts,
  deps: deps.map((d) => `@ghostpay/${d}`).concat(['viem']),
});
const repo = {
  workspaces: [
    ws('packages/a'),
    ws('packages/b', ['a']),
    ws('packages/c', ['b']),
    ws('packages/d', ['a'], ['test']),
    ws('packages/e'),
    ws('packages/chain-adapters'),
    ws('apps/web', ['c']),
  ],
  forge: ['packages/contracts', 'packages/pool-contracts'],
};

test('a library change reaches every transitive dependent', () => {
  const c = classifyChanges(['packages/a/src/x.ts'], repo);
  assert.deepEqual([...c.direct], ['packages/a']);
  assert.deepEqual(affectedSet(repo.workspaces, c.direct), [
    'apps/web',
    'packages/a',
    'packages/b',
    'packages/c',
    'packages/d',
  ]);
});

test('a leaf change affects only itself', () => {
  const c = classifyChanges(['packages/e/src/x.ts'], repo);
  assert.deepEqual(affectedSet(repo.workspaces, c.direct), ['packages/e']);
});

test('docs and markdown changes trigger nothing', () => {
  const c = classifyChanges(
    ['docs/x.md', 'packages/a/README.md', 'README.md', 'packages/a/DEVIATIONS.md'],
    repo,
  );
  assert.equal(c.global, false);
  assert.equal(c.direct.size, 0);
  assert.equal(c.forge.size, 0);
  assert.deepEqual(c.unmapped, []);
});

test('root config forces the full suite', () => {
  for (const f of ['package-lock.json', 'tsconfig.base.json', '.github/actions/setup-node-libs/action.yml']) {
    assert.equal(classifyChanges([f], repo).global, true, f);
  }
  assert.equal(classifyChanges(['.github/workflows/ci.yml'], repo).global, false);
});

test('contracts change adds forge project and its TS consumers that exist', () => {
  const c = classifyChanges(['packages/contracts/src/GhostPayRouter.sol'], repo);
  assert.deepEqual([...c.forge], ['packages/contracts']);
  assert.deepEqual([...c.direct].sort(), ['apps/web', 'packages/chain-adapters']); // policy-scheme absent here
});

test('other forge projects do not pull in contract consumers', () => {
  const c = classifyChanges(['packages/pool-contracts/src/Pool.sol'], repo);
  assert.deepEqual([...c.forge], ['packages/pool-contracts']);
  assert.equal(c.direct.size, 0);
});

test('prefix match does not confuse similarly named workspaces', () => {
  const r = { workspaces: [ws('packages/chain-tron'), ws('packages/chain')], forge: [] };
  assert.deepEqual([...classifyChanges(['packages/chain-tron/src/x.ts'], r).direct], ['packages/chain-tron']);
});

test('node script tests and unmapped paths are reported', () => {
  const c = classifyChanges(
    ['scripts/agent/affected.mjs', 'infra/web/nginx.conf', './packages/e/src/y.ts'],
    repo,
  );
  assert.equal(c.nodeScripts, true);
  assert.deepEqual(c.unmapped, ['infra/web/nginx.conf']);
  assert.deepEqual([...c.direct], ['packages/e']);
});

test('buildsNeeded lists built dependencies in dependency order, skipping ones without build', () => {
  assert.deepEqual(buildsNeeded(repo.workspaces, ['apps/web']), ['packages/a', 'packages/b', 'packages/c']);
  assert.deepEqual(buildsNeeded(repo.workspaces, ['packages/a', 'packages/b']), ['packages/a']);
  assert.deepEqual(buildsNeeded(repo.workspaces, ['packages/e']), []);
});

test('topoOrder detects cycles', () => {
  const cyc = [ws('packages/x', ['y']), ws('packages/y', ['x'])];
  assert.throws(() => topoOrder(cyc, ['packages/x']), /cycle/);
});

test('real repo: graph loads, is acyclic, and the committed package map is current', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const real = loadRepo(root);
  assert.ok(real.workspaces.length > 10);
  assert.ok(real.forge.includes('packages/contracts'));
  topoOrder(
    real.workspaces,
    real.workspaces.map((w) => w.location),
  );
  const { readFileSync } = await import('node:fs');
  const committed = readFileSync(
    new URL('../../.claude/skills/ghostpay-package-map/PACKAGE_MAP.md', import.meta.url),
    'utf8',
  );
  assert.equal(committed, render(real), 'PACKAGE_MAP.md is stale: run node scripts/agent/package-map.mjs');
});
