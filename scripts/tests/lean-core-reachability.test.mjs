// Lean-core reachability proof (docs/handoffs/LEAN_RELEASE_SCOPE.md: deferred paths are "excluded-with-proof" only
// with source/artifact reachability evidence). Two locks:
//   1. The workspace dependency closure of apps/web and apps/relayer equals a reviewed allowlist, so no other deferred
//      package (pools, PIR, policy, fiat, merchant, confidential, ...) can enter either build without this test failing.
//   2. Inside apps/web, the core flow sources (views + lib) never import the deferred BTC / Solana / TRON / registry
//      features or their packages. Only the app shell (App.tsx) mounts those views, as separate routes.
// This proves source isolation of the core path. It does NOT remove the deferred views from the web artifact.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readPkg(dir) {
  return JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'));
}

function workspaceIndex() {
  const byName = new Map();
  for (const base of ['apps', 'packages']) {
    for (const d of readdirSync(join(ROOT, base))) {
      const dir = `${base}/${d}`;
      if (!existsSync(join(ROOT, dir, 'package.json'))) continue;
      byName.set(readPkg(dir).name, dir);
    }
  }
  return byName;
}

function closure(start, byName) {
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const deps = readPkg(stack.pop()).dependencies ?? {};
    for (const name of Object.keys(deps)) {
      const dir = byName.get(name);
      if (dir === undefined || seen.has(name)) continue;
      seen.add(name);
      stack.push(dir);
    }
  }
  return [...seen].sort();
}

// Deferred (later-preserved) packages that the web build still links for its separate BTC/Solana/TRON views.
const WEB_DEFERRED = ['@ghostpay/btc-silent-payments', '@ghostpay/solana-stealth', '@ghostpay/tron-adapter'];

test('apps/web workspace dependency closure is the reviewed allowlist', () => {
  assert.deepEqual(closure('apps/web', workspaceIndex()), [
    '@ghostpay/address-safety',
    '@ghostpay/btc-silent-payments',
    '@ghostpay/chain-adapters',
    '@ghostpay/core-crypto',
    '@ghostpay/invoice-schema',
    '@ghostpay/qr-exchange',
    '@ghostpay/secret-box',
    '@ghostpay/solana-stealth',
    '@ghostpay/tron-adapter',
    '@ghostpay/tx-review',
  ]);
});

test('apps/relayer workspace dependency closure is the reviewed allowlist', () => {
  assert.deepEqual(closure('apps/relayer', workspaceIndex()), [
    '@ghostpay/chain-adapters',
    '@ghostpay/core-crypto',
    '@ghostpay/invoice-schema',
    '@ghostpay/relayer-guard',
  ]);
});

const SRC = join(ROOT, 'apps/web/src');
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function sourceFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(e) && !/\.(test|testutil|nocov\.test)\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

function resolveLocal(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return undefined;
}

function importsOf(file) {
  const text = readFileSync(file, 'utf8');
  const specs = [];
  for (const m of text.matchAll(IMPORT_RE)) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

function isDeferred(file) {
  const rel = relative(SRC, file).split('\\').join('/');
  return /^features\/(btc|solana|tron|registry)\//.test(rel);
}

test('core web flow sources never reach deferred BTC/Solana/TRON/registry code', () => {
  const coreRoots = sourceFiles(SRC).filter((f) => {
    const rel = relative(SRC, f).split('\\').join('/');
    return rel.startsWith('views/') || rel.startsWith('lib/') || rel.startsWith('components/');
  });
  assert.ok(coreRoots.length > 20, 'expected the core view/lib/component sources');
  const violations = [];
  const seen = new Set();
  const stack = coreRoots.map((f) => [f, [relative(SRC, f)]]);
  while (stack.length > 0) {
    const [file, path] = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (WEB_DEFERRED.some((p) => spec === p || spec.startsWith(`${p}/`))) {
        violations.push(`${path.join(' -> ')} -> ${spec}`);
        continue;
      }
      if (!spec.startsWith('.')) continue;
      const target = resolveLocal(file, spec);
      if (target === undefined) continue;
      if (isDeferred(target)) {
        violations.push(`${path.join(' -> ')} -> ${relative(SRC, target)}`);
        continue;
      }
      stack.push([target, [...path, relative(SRC, target)]]);
    }
  }
  assert.deepEqual(violations, []);
});

test('only the app shell mounts the deferred views', () => {
  const importers = sourceFiles(SRC)
    .filter((f) => !isDeferred(f))
    .filter((f) => importsOf(f).some((s) => /features\/(btc|solana|tron|registry)\//.test(s) || WEB_DEFERRED.includes(s)))
    .map((f) => relative(SRC, f).split('\\').join('/'));
  assert.deepEqual(importers, ['App.tsx']);
});
