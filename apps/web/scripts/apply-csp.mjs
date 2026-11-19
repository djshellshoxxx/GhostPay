#!/usr/bin/env node
// Postbuild step (runs before scan-bundle): applies GHOSTPAY_CONNECT_ORIGINS to dist/_headers and to the meta CSP in
// dist/index.html, then checks the result. Hosted builds should set the list (tight connect-src); with no list the broad
// `https: wss:` default stays, unless GHOSTPAY_REQUIRE_TIGHT_CSP=1, which turns an empty list into a build failure.
// Tradeoff: origins a user adds in Settings are blocked by the browser until they are added to the list and rebuilt.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { applyConnectSrc, checkConnectSrc, connectSrc, parseOrigins } from './csp.mjs';

const FILES = ['_headers', 'index.html'];

/** Rewrites connect-src in the dist files. Returns the files that changed. */
export function applyCspToDist(distDir, origins) {
  connectSrc(origins); // Validate direct callers before writing any artifact.
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

/** Parse generated HTML inertly using the existing web dev dependency, with no scripts or resources enabled. */
function metaPolicies(text) {
  // HTML parsing semantics matter: first duplicate attributes win and malformed head content can move a meta
  // to the body. A text match cannot prove that a browser will enforce the claimed policy.
  const dom = new JSDOM(text, { virtualConsole: new VirtualConsole() });
  try {
    const policies = [];
    const head = dom.window.document.head;
    for (const meta of head.querySelectorAll('meta[http-equiv]')) {
      if (meta.getAttribute('http-equiv')?.toLowerCase() !== 'content-security-policy') continue;
      // In the JavaScript-enabled app, noscript/template contents are inert. Only direct head children count.
      if (meta.parentElement !== head) continue;
      let earlier = meta.previousElementSibling;
      let beforeResources = true;
      while (earlier !== null) {
        if (earlier.tagName !== 'META') { beforeResources = false; break; }
        earlier = earlier.previousElementSibling;
      }
      const policy = meta.getAttribute('content');
      if (beforeResources && policy !== null) policies.push(policy);
    }
    return policies;
  } finally {
    dom.window.close();
  }
}

/** Problems with effective artifacts. Pages uses metaOnly after dropping unsupported _headers. */
export function checkCspDist(distDir, origins, { requireTight = false, metaOnly = false } = {}) {
  const problems = [];
  connectSrc(origins);
  if (origins.length === 0 && requireTight) problems.push('GHOSTPAY_CONNECT_ORIGINS is empty but a tight connect-src is required (GHOSTPAY_REQUIRE_TIGHT_CSP=1)');
  for (const name of metaOnly ? ['index.html'] : FILES) {
    const path = join(distDir, name);
    if (!existsSync(path)) {
      problems.push(`${name}: missing artifact`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const policies = name === 'index.html' ? metaPolicies(text)
      : [...text.matchAll(/^\s+Content-Security-Policy\s*:\s*(.+)$/gmi)].map((m) => m[1]);
    if (policies.length !== 1) problems.push(`${name}: expected exactly one enforced ${name === 'index.html' ? 'head meta' : 'HTTP header'} CSP`);
    if (name === '_headers') {
      let scope = '';
      let globalPolicy = false;
      for (const line of text.split('\n')) {
        if (line.trimStart().startsWith('#') || line.trim() === '') continue;
        if (/^\S/.test(line)) scope = line.trim();
        else if (/^\s+Content-Security-Policy\s*:/i.test(line) && scope === '/*') globalPolicy = true;
      }
      if (!globalPolicy) problems.push('_headers: missing globally enforced CSP rule');
    }
    for (const policy of policies) problems.push(...checkConnectSrc(policy, origins).map((problem) => `${name}: ${problem}`));
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('usage: apply-csp.mjs [dist directory]');
    const dist = process.argv[2] === undefined ? fileURLToPath(new URL('../dist', import.meta.url)) : resolve(process.argv[2]);
    const origins = parseOrigins(process.env['GHOSTPAY_CONNECT_ORIGINS']);
    const setting = process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'] ?? '0';
    if (setting !== '0' && setting !== '1') throw new Error('GHOSTPAY_REQUIRE_TIGHT_CSP must be 0 or 1');
    const changed = applyCspToDist(dist, origins);
    const problems = checkCspDist(dist, origins, { requireTight: setting === '1' });
    if (problems.length > 0) throw new Error(problems.join('; '));
    console.log(origins.length === 0 ? 'apply-csp: broad connect-src (GHOSTPAY_CONNECT_ORIGINS not set)' : `apply-csp: connect-src limited to ${origins.length} origin(s); updated ${changed.join(', ') || 'nothing'}`);
  } catch (error) {
    console.error(`apply-csp: ${error.message}`);
    process.exit(1);
  }
}
