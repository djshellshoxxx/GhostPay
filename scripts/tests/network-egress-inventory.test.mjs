import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const inventory = JSON.parse(readFileSync(resolve(root, 'docs/privacy/network-egress-inventory.json'), 'utf8'));
const sources = new Set(inventory.surfaces.flatMap((surface) => surface.sourcePaths));
const NETWORK_NAMES = new Set(['fetch', 'fetchFn', 'fetchImpl', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts']);

// This is a source-inventory maintenance check, not proof of runtime isolation. Runtime-computed names,
// extension traffic and arbitrary third-party package behavior need the separate browser/review evidence.
function referencesNetwork(text) {
  const source = ts.createSourceFile('inventory-probe.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node) => {
    if (found || ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && NETWORK_NAMES.has(node.text)) {
      const p = node.parent;
      const declaration = (ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isPropertySignature(p) ||
        ts.isMethodSignature(p) || ts.isPropertyDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name === node;
      const propertyKey = ts.isPropertyAssignment(p) && p.name === node;
      if (!declaration && !propertyKey) found = true;
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && NETWORK_NAMES.has(node.argumentExpression.text)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function productionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : productionFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.testutil\./.test(entry.name) ? [path] : [];
  });
}

test('network inventory has unique complete records and references existing sources and tests', () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.match(inventory.source.baseCommit, /^[0-9a-f]{40}$/);
  assert.ok(inventory.surfaces.length >= 30, 'expected the full browser surface inventory');
  assert.equal(new Set(inventory.surfaces.map((surface) => surface.id)).size, inventory.surfaces.length);
  for (const surface of inventory.surfaces) {
    assert.match(surface.id, /^[a-z][a-z0-9-]+$/);
    for (const key of ['trigger', 'destination', 'transport', 'authorization', 'privatePath', 'failureBehavior', 'ownership', 'status']) {
      assert.equal(typeof surface[key], 'string', `${surface.id}: ${key}`);
      assert.ok(surface[key].length > 0, `${surface.id}: empty ${key}`);
    }
    assert.equal(typeof surface.automatic, 'boolean', `${surface.id}: automatic`);
    for (const key of ['flows', 'sourcePaths', 'symbols', 'sensitiveData', 'profile']) assert.ok(Array.isArray(surface[key]), `${surface.id}: ${key}`);
    assert.ok(surface.sourcePaths.length > 0, `${surface.id}: no sources`);
    for (const path of [...surface.sourcePaths, ...(surface.testPaths ?? [])]) {
      assert.ok(!path.startsWith('/') && !path.split('/').includes('..'), `${surface.id}: path must be repository-relative`);
      assert.ok(existsSync(resolve(root, path)), `${surface.id}: missing ${path}`);
    }
    assert.ok(surface.profile.length > 0 && surface.profile.every((profile) => ['full', 'lean'].includes(profile)));
  }
});

test('every explicit production web network reference is represented in the inventory', () => {
  const files = productionFiles(resolve(root, 'apps/web/src'));
  assert.ok(files.length > 50, 'source traversal must not be empty');
  const missing = files.filter((path) => referencesNetwork(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path).replaceAll('\\', '/')).filter((path) => !sources.has(path));
  assert.deepEqual(missing, [], 'review and inventory a new network dispatcher before allowing it');
});

test('shipped SDK and transport boundaries are represented, with library-only adapters distinguished', () => {
  for (const path of [
    'packages/net-transport/src/fetchTransport.ts', 'packages/chain-adapters/src/rpc.ts',
    'packages/solana-stealth/src/rpc.ts', 'packages/tron-adapter/src/rpc.ts',
    'packages/btc-silent-payments/src/scan/grpcWebUnary.ts', 'apps/web/src/features/btc/esplora.ts',
  ]) assert.ok(sources.has(path), `missing transport: ${path}`);
  assert.ok(inventory.nonShippedAdapters.some((item) => item.path === 'packages/net-transport/src/fetchAdapter.ts'));
  assert.ok(inventory.policyScopeStatement.includes('does not implement universal private-path enforcement'));
});

test('inventory detector recognizes calls and aliases without flagging type declarations or comments', () => {
  for (const text of ['fetch("/")', 'const send = globalThis.fetch', 'service.fetchFn("/")', 'new WebSocket("wss://invalid")', 'self["fetch"]("/")']) {
    assert.equal(referencesNetwork(text), true, text);
  }
  for (const text of ['type F = typeof fetch;', 'interface Service { fetchFn: typeof fetch; }', '// fetch("/")', 'const text = "fetch";']) {
    assert.equal(referencesNetwork(text), false, text);
  }
});
