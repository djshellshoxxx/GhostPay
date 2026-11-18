#!/usr/bin/env node
// Postbuild step (runs before scan-bundle): applies GHOSTPAY_CONNECT_ORIGINS to dist/_headers and to the meta CSP in
// dist/index.html, then checks the result. Hosted builds should set the list (tight connect-src); with no list the broad
// `https: wss:` default stays, unless GHOSTPAY_REQUIRE_TIGHT_CSP=1, which turns an empty list into a build failure.
// Tradeoff: origins a user adds in Settings are blocked by the browser until they are added to the list and rebuilt.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROAD, applyConnectSrc, connectSrc, parseOrigins } from './csp.mjs';

const FILES = ['_headers', 'index.html'];

/** Rewrites connect-src in the dist files. Returns the files that changed. */
export function applyCspToDist(distDir, origins) {
  const changed = [];
  if (origins.length === 0) return changed;
  for (const name of FILES) {
    const path = join(distDir, name);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = applyConnectSrc(before, origins);
    if (after !== before) {
      writeFileSync(path, after);
      changed.push(name);
    }
  }
  return changed;
}

/** Problems with the dist CSP given the intended origins. `requireTight` fails an empty list. */
export function checkCspDist(distDir, origins, { requireTight = false } = {}) {
  const problems = [];
  if (origins.length === 0) {
    if (requireTight) problems.push('GHOSTPAY_CONNECT_ORIGINS is empty but a tight connect-src is required (GHOSTPAY_REQUIRE_TIGHT_CSP=1)');
    return problems;
  }
  const want = connectSrc(origins);
  for (const name of FILES) {
    const path = join(distDir, name);
    if (!existsSync(path)) {
      if (name === '_headers') problems.push('_headers missing');
      continue;
    }
    // Comment lines (`#` in _headers) may describe connect-src; only directive lines count.
    const text = readFileSync(path, 'utf8').split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
    if (text.includes(BROAD)) problems.push(`${name}: still has the broad connect-src`);
    const found = [...text.matchAll(/connect-src[^;\n]*/g)].map((m) => m[0].trim());
    if (found.length === 0) problems.push(`${name}: no connect-src directive`);
    for (const f of found) if (f !== want) problems.push(`${name}: connect-src is "${f}", expected "${want}"`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  const origins = parseOrigins(process.env['GHOSTPAY_CONNECT_ORIGINS']);
  const requireTight = process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'] === '1';
  const changed = applyCspToDist(dist, origins);
  const problems = checkCspDist(dist, origins, { requireTight });
  if (problems.length > 0) {
    console.error(`apply-csp: ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log(origins.length === 0 ? 'apply-csp: broad connect-src (GHOSTPAY_CONNECT_ORIGINS not set)' : `apply-csp: connect-src limited to ${origins.length} origin(s); updated ${changed.join(', ') || 'nothing'}`);
}
