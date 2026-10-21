#!/usr/bin/env node
// Generates the dependency register tables in THIRD_PARTY.md from package-lock.json.
//
// Usage (from the repository root):
//   node docs/tools/third-party-table.mjs --write    rewrite the generated block in THIRD_PARTY.md
//   node docs/tools/third-party-table.mjs --check    exit 1 if THIRD_PARTY.md is out of date
//   node docs/tools/third-party-table.mjs --verify   compare each licence in the lockfile with the installed
//                                                    package.json (needs `npm ci`); exit 1 on a mismatch
//   node docs/tools/third-party-table.mjs            print the generated block to stdout
//
// Inputs: package-lock.json (lockfileVersion 3), the workspace package.json files, and the curated NOTES
// below. Nothing is fetched from the network. The curated NOTES hold the human judgement (purpose and review
// note); everything else (version, licence, scope, who pulls it in) is derived from the lockfile.
// Node >= 22, no dependencies.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BEGIN = '<!-- BEGIN GENERATED: docs/tools/third-party-table.mjs -->';
const END = '<!-- END GENERATED -->';

/** Curated purpose / review notes for direct dependencies and for packages that need a warning. */
const NOTES = {
  viem: ['EVM client: ABI coding, EIP-712 hashing, transaction building, RPC transport.', 'Pinned exactly. Brings its own `@noble/*` 1.x copies (see ADR-0004 contradiction below).'],
  '@noble/curves': ['secp256k1 / ECDH / ECDSA / Schnorr primitives for stealth derivation, invoice signatures and BIP-352.', 'Direct dependency is 2.x per ADR-0004. Independently audited upstream; GhostPay code has not audited it.'],
  '@noble/hashes': ['keccak-256, SHA-256, HMAC, HKDF and scrypt (keystore).', 'Direct dependency is 2.x per ADR-0004.'],
  '@noble/ciphers': ['Test-only: independent AES-GCM cross-check of the invoice envelope.', 'Dev only; not in any shipped bundle. Production AES uses Web Crypto.'],
  '@noble/secp256k1': ['Transitive of the ScopeLift SDK, used only by the test-vector generator.', 'Dev only.'],
  '@scure/base': ['Bech32m encoding for BIP-352 `sp1` addresses.', 'Same author as noble. Runtime of `btc-silent-payments`; that package is not used by the web app or relayer yet.'],
  '@scure/bip32': ['BIP-32 derivation: dev dependency of `btc-silent-payments` (tests); also a runtime dependency of viem.', 'viem pins its own 1.7.0 -> noble 1.9.x chain.'],
  '@scure/bip39': ['Mnemonic support inside viem (`viem/accounts`).', 'Pulled in by viem; GhostPay does not call it. Bundled only if tree-shaking keeps it (not measured).'],
  abitype: ['Type-level ABI helpers used by viem.', 'Transitive of viem.'],
  ox: ['Low-level Ethereum utilities used by viem.', 'Transitive of viem. Carries its own `@noble/curves` 1.9.1, `@noble/hashes` 1.8.0 and `@noble/ciphers` 1.3.0.'],
  isows: ['Isomorphic WebSocket shim used by viem.', 'Transitive of viem.'],
  ws: ['Node WebSocket client used by `isows` on Node (relayer, tests).', 'Transitive of viem. Browsers use the native WebSocket.'],
  eventemitter3: ['Event emitter used by `ox`.', 'Transitive of viem.'],
  '@adraffy/ens-normalize': ['ENS name normalisation used by `ox`.', 'Transitive of viem.'],
  react: ['UI library for `apps/web`.', 'Pinned exactly (ADR-0004: 19.x).'],
  'react-dom': ['DOM renderer for `apps/web`.', 'Contains inert `innerHTML` strings that `apps/web/scripts/scan-bundle.mjs` allows by exact fingerprint (see web DEVIATIONS item 21).'],
  scheduler: ['React scheduler.', 'Transitive of react-dom.'],
  'qrcode-generator': ['Local QR-code generation for invoice links (no network).', 'Single-purpose, no dependencies. Output is rendered as SVG React elements.'],
  typescript: ['Compiler and type checker.', 'Build tool. The lockfile does not mark it `dev` because viem / ox / abitype list it as an optional peer dependency; it is never shipped.'],
  '@scopelift/stealth-address-sdk': ['Dev only: reference implementation used to generate and cross-check `test-vectors/scheme1.json` (ADR-0001).', 'No `license` field in the lockfile entry; the installed package ships an MIT LICENSE file (Copyright 2024 ScopeLift). Not shipped.'],
  vite: ['Bundler and dev server for `apps/web`.', 'Build tool; output is scanned by `scan-bundle.mjs`.'],
  vitest: ['Unit test runner.', 'Dev only.'],
  '@vitest/coverage-v8': ['Coverage provider for vitest.', 'Dev only.'],
  '@vitejs/plugin-react': ['React plugin for vite.', 'Dev only.'],
  jsdom: ['DOM implementation for web unit tests.', 'Dev only.'],
  '@playwright/test': ['Browser end-to-end tests for `apps/web` (Chromium only so far).', 'Dev only. Downloads browsers outside npm (not part of the lockfile).'],
  '@testing-library/react': ['React component test helpers.', 'Dev only.'],
  '@testing-library/user-event': ['User interaction simulation in tests.', 'Dev only.'],
  'fast-check': ['Property-based testing.', 'Dev only.'],
  eslint: ['Linter (bans eval, innerHTML, Math.random etc. by rule).', 'Dev only.'],
  '@eslint/js': ['ESLint recommended rule set.', 'Dev only.'],
  'typescript-eslint': ['TypeScript parser and rules for ESLint.', 'Dev only.'],
  prettier: ['Formatter (`.prettierrc`).', 'Dev only. No `format:check` script exists yet (audit 01 O-02).'],
  '@types/node': ['Node type declarations.', 'Dev only. Workspaces pin different majors (22 and 26).'],
  '@types/react': ['React type declarations.', 'Dev only.'],
  '@types/react-dom': ['React DOM type declarations.', 'Dev only.'],
  fsevents: ['macOS file watcher, optional.', 'Only lockfile entry with an install script; skipped by `npm ci --ignore-scripts` and absent on Linux.'],
  lightningcss: ['CSS transformer used by vite (and its platform binaries).', 'MPL-2.0 (file-level copyleft). Build tool only; nothing is copied into shipped output.'],
};

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const lock = read(join(ROOT, 'package-lock.json'));
const rootPkg = read(join(ROOT, 'package.json'));
const packages = lock.packages;

/** name of an entry from its lockfile path */
const nameOf = (path) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

/** workspace roots: path -> package.json */
const workspaces = new Map();
for (const [path, entry] of Object.entries(packages)) {
  if (path && !path.includes('node_modules') && !entry.link) workspaces.set(path, entry);
}

/** Node-style resolution inside the lockfile tree. */
function resolveDep(fromPath, dep) {
  let base = fromPath;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${dep}` : `node_modules/${dep}`;
    if (packages[candidate]) {
      const e = packages[candidate];
      return e.link ? e.resolved : candidate;
    }
    if (!base) return null;
    const idx = base.lastIndexOf('/node_modules/');
    base = idx >= 0 ? base.slice(0, idx) : base.startsWith('node_modules/') ? '' : '';
  }
}

/** closure of dependencies reachable from a start path; includeDev adds devDependencies of the start only. */
function closure(startPath, includeDev) {
  const seen = new Set();
  const stack = [];
  const entry = packages[startPath];
  const first = { ...(entry.dependencies ?? {}), ...(includeDev ? entry.devDependencies ?? {} : {}) };
  for (const d of Object.keys(first)) stack.push([startPath, d]);
  while (stack.length) {
    const [from, dep] = stack.pop();
    const r = resolveDep(from, dep);
    if (!r || seen.has(r)) continue;
    seen.add(r);
    const e = packages[r];
    for (const d of Object.keys({ ...(e.dependencies ?? {}), ...(e.optionalDependencies ?? {}) })) stack.push([r, d]);
  }
  return seen;
}

const wsShort = (p) => p.replace(/^(packages|apps)\//, '');
const runtimeUsers = new Map(); // path -> Set(ws)
const devUsers = new Map();
const viaDirect = new Map(); // path -> Set(direct dep name), any dependency kind
const viaRuntime = new Map(); // path -> Set(direct runtime dep name)
for (const [wsPath, wsEntry] of workspaces) {
  for (const p of closure(wsPath, false)) (runtimeUsers.get(p) ?? runtimeUsers.set(p, new Set()).get(p)).add(wsShort(wsPath));
  for (const p of closure(wsPath, true)) (devUsers.get(p) ?? devUsers.set(p, new Set()).get(p)).add(wsShort(wsPath));
  for (const [map, deps] of [[viaRuntime, wsEntry.dependencies], [viaDirect, { ...(wsEntry.dependencies ?? {}), ...(wsEntry.devDependencies ?? {}) }]]) {
    for (const d of Object.keys(deps ?? {})) {
      const dp = resolveDep(wsPath, d);
      if (!dp || workspaces.has(dp)) continue; // first-party links are not "via" candidates
      for (const p of new Set([dp, ...closure(dp, false)])) (map.get(p) ?? map.set(p, new Set()).get(p)).add(d);
    }
  }
}
const directUsers = new Map(); // path -> [{ws, kind}]
for (const [wsPath, wsEntry] of workspaces) {
  for (const [kind, deps] of [['runtime', wsEntry.dependencies], ['dev', wsEntry.devDependencies]]) {
    for (const d of Object.keys(deps ?? {})) {
      const dp = resolveDep(wsPath, d);
      if (dp) (directUsers.get(dp) ?? directUsers.set(dp, []).get(dp)).push(`${wsShort(wsPath)} (${kind})`);
    }
  }
}

/** licence from lockfile, falling back to the installed package.json */
function licenceOf(path, entry) {
  if (entry.license) return { value: entry.license, source: 'lock' };
  const f = join(ROOT, path, 'package.json');
  if (existsSync(f)) {
    const j = read(f);
    const l = typeof j.license === 'string' ? j.license : j.license?.type;
    if (l) return { value: l, source: 'installed' };
  }
  return { value: 'NOT DECLARED', source: 'none' };
}

const esc = (s) => String(s).replaceAll('|', '\\|');
const rows = [];
for (const [path, entry] of Object.entries(packages)) {
  if (!path || entry.link || workspaces.has(path)) continue;
  const name = nameOf(path);
  const lic = licenceOf(path, entry);
  const nested = path.split('node_modules/').length > 2;
  const runtime = runtimeUsers.has(path);
  const direct = directUsers.get(path);
  const users = [...(runtime ? runtimeUsers.get(path) : devUsers.get(path) ?? [])].sort().join(', ');
  const via = [...((runtime ? viaRuntime : viaDirect).get(path) ?? [])].filter((d) => d !== name).sort();
  // Curated notes describe the top-level copy only; a nested copy is a different version of the same name.
  const note = nested ? undefined : NOTES[name];
  const owner = nested ? nameOf(path.slice(0, path.lastIndexOf('/node_modules/'))) : '';
  const flags = [];
  if (nested) flags.push(`nested copy at \`${path}\``);
  if (entry.optional) flags.push('optional');
  if (entry.hasInstallScript) flags.push('has install script');
  if (lic.source !== 'lock') flags.push(lic.source === 'installed' ? 'licence read from installed package.json' : 'no licence declared: check manually');
  if (/MPL|GPL|AGPL|LGPL|SSPL|BUSL/i.test(lic.value)) flags.push(`${lic.value} copyleft: confirm it stays build-time only`);
  rows.push({
    path, name, label: nested ? `\`${name}\` (nested in \`${owner}\`)` : `\`${name}\``, version: entry.version, licence: lic.value, runtime, nested,
    used: users || '-',
    how: direct ? `direct: ${[...new Set(direct)].join(', ')}` : via.length ? `via ${via.slice(0, 3).join(', ')}${via.length > 3 ? ', ...' : ''}` : 'transitive',
    purpose: note ? note[0] : nested ? `Nested copy of ${name} required by ${owner} (different version from the top-level copy).` : via.length ? `Transitive dependency of ${via.slice(0, 3).join(', ')}.` : 'Transitive dependency.',
    review: [note?.[1], ...flags].filter(Boolean).join(' '),
  });
}
rows.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

function table(list, withPurpose) {
  const head = withPurpose
    ? '| Package | Version | Licence | Used by | Purpose | Review note |\n|---|---|---|---|---|---|'
    : '| Package | Version | Licence | Used by | Note |\n|---|---|---|---|---|';
  const lines = list.map((r) => withPurpose
    ? `| ${r.label} | ${r.version} | ${esc(r.licence)} | ${esc(r.used)}; ${esc(r.how)} | ${esc(r.purpose)} | ${esc(r.review || '-')} |`
    : `| ${r.label} | ${r.version} | ${esc(r.licence)} | ${esc(r.used)}; ${esc(r.how)} | ${esc(r.review || r.purpose)} |`);
  return [head, ...lines].join('\n');
}

const runtimeRows = rows.filter((r) => r.runtime);
const devRows = rows.filter((r) => !r.runtime);
const wsRows = [...workspaces].map(([p, e]) => `| \`${e.name}\` | ${e.version} | ${esc(e.license ?? 'NOT DECLARED')} | \`${p}\` |`);
const licCounts = {};
for (const r of rows) licCounts[r.licence] = (licCounts[r.licence] ?? 0) + 1;
const missingNotes = rows.filter((r) => directUsers.has(r.path) && !NOTES[r.name]).map((r) => r.name);

const out = [
  BEGIN,
  '',
  `_Generated from \`package-lock.json\` (lockfileVersion ${lock.lockfileVersion}, ${rows.length} third-party entries, ${workspaces.size} workspace packages) by \`docs/tools/third-party-table.mjs\`. Do not edit this block by hand; run \`node docs/tools/third-party-table.mjs --write\`._`,
  '',
  `Licence summary (entries): ${Object.entries(licCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  '',
  `Root \`package.json\` declares no dependencies of its own (${Object.keys(rootPkg.dependencies ?? {}).length} dependencies, ${Object.keys(rootPkg.devDependencies ?? {}).length} devDependencies).`,
  '',
  '### Workspace packages (first party)',
  '',
  '| Package | Version | Licence | Path |\n|---|---|---|---|',
  ...wsRows,
  '',
  `### Runtime closure (${runtimeRows.length} entries)`,
  '',
  'Reachable from a workspace package through `dependencies` (and optional dependencies). Not every entry is bundled into the browser app or loaded by the relayer: whether tree-shaking drops an entry has not been measured.',
  '',
  table(runtimeRows, true),
  '',
  `### Build, test and tooling (${devRows.length} entries)`,
  '',
  'Reachable only through `devDependencies`. None of these is shipped in `apps/web/dist`; the relayer Dockerfile runs `npm prune --omit=dev` before copying `node_modules` (that image has not been built in the authoring sandbox).',
  '',
  table(devRows, false),
  '',
  END,
].join('\n');

const mode = process.argv[2];
const target = join(ROOT, 'THIRD_PARTY.md');

if (missingNotes.length) {
  console.error(`warning: direct dependencies without a curated note: ${missingNotes.join(', ')}`);
}

if (mode === '--verify') {
  let bad = 0;
  for (const [path, entry] of Object.entries(packages)) {
    if (!path || entry.link || workspaces.has(path)) continue;
    const f = join(ROOT, path, 'package.json');
    if (!existsSync(f)) continue; // optional platform packages are not installed
    const j = read(f);
    const installed = typeof j.license === 'string' ? j.license : j.license?.type ?? '(none)';
    const locked = entry.license ?? '(none)';
    if (installed !== locked || j.version !== entry.version) {
      bad++;
      console.log(`MISMATCH ${path}: lock ${entry.version} ${locked} / installed ${j.version} ${installed}`);
    }
  }
  console.log(bad ? `${bad} mismatches` : 'all installed licences and versions match the lockfile');
  process.exit(bad ? 1 : 0);
} else if (mode === '--write' || mode === '--check') {
  const cur = readFileSync(target, 'utf8');
  const a = cur.indexOf(BEGIN);
  const b = cur.indexOf(END);
  if (a < 0 || b < 0) { console.error('markers not found in THIRD_PARTY.md'); process.exit(2); }
  const next = cur.slice(0, a) + out + cur.slice(b + END.length);
  if (mode === '--check') {
    if (next !== cur) { console.error('THIRD_PARTY.md is out of date: run node docs/tools/third-party-table.mjs --write'); process.exit(1); }
    console.log('THIRD_PARTY.md is up to date');
  } else {
    writeFileSync(target, next);
    console.log(`wrote ${rows.length} rows to THIRD_PARTY.md`);
  }
} else {
  console.log(out);
}
