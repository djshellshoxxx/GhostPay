// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { KitError } from '../../src/errors.mjs';
import { KIT_DEFAULT_HEADERS_FILE, REQUIRED_CSP_DIRECTIVES, REQUIRED_HEADERS } from '../../src/policy.mjs';
import {
  HSTS_VALUE, assertServableHeaders, canonicalHeaderName, checkRequiredHeaders, cspDirectiveNames, effectiveHeaders, kitHeaderNames, kitResponseHeaders,
  loadHeaderPolicy, parseHeadersFile, patternRegexSource, transportHeaders,
} from '../../src/serve/headers.mjs';
import { GHOSTPAY_HEADERS_PATH } from './helpers.mjs';

/** @typedef {import('../../src/types.mjs').HostConfig} HostConfig */

const ONION = `http://${'b'.repeat(56)}.onion`;

/**
 * @param {Partial<HostConfig>} over
 * @returns {HostConfig}
 */
function host(over) {
  return { schemaVersion: 1, transport: 'clearnet', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'x', onionLocation: null, ...over };
}

/**
 * @param {() => unknown} fn
 * @param {RegExp} [msg]
 */
function throwsHeaders(fn, msg) {
  assert.throws(fn, (e) => e instanceof KitError && e.code === 'E_HEADERS' && (!msg || msg.test(e.message)));
}

/** @param {Array<[string, string]>} h */
const obj = (h) => Object.fromEntries(h);

test("GhostPay's real apps/web/public/_headers parses and satisfies the required headers", async () => {
  const text = await fs.readFile(GHOSTPAY_HEADERS_PATH, 'utf8');
  const rules = parseHeadersFile(text);
  assert.deepEqual(rules.map((r) => r.pattern), ['/*', '/index.html', '/assets/*', '/deployments/*', '/ghostpay-embed-v1.js']);
  assert.deepEqual(checkRequiredHeaders(rules, ['/index.html', '/about/index.html', '/assets/x.html', '/assets/logo.svg', '/assets/app.js',
    '/deployments/1.json', '/ghostpay-embed-v1.js', '/LICENSE', '/sitemap.xml', '/favicon.ico']), []);
  const idx = obj(effectiveHeaders(rules, '/index.html'));
  assert.equal(idx['Cache-Control'], 'no-cache');
  assert.match(idx['Content-Security-Policy'] ?? '', /^default-src 'self'; .*frame-ancestors 'none'/);
  const embed = obj(effectiveHeaders(rules, '/ghostpay-embed-v1.js'));
  assert.equal(embed['Cross-Origin-Resource-Policy'], 'cross-origin');
  assert.equal(embed['Cache-Control'], 'public, max-age=3600');
  assert.equal(obj(effectiveHeaders(rules, '/deployments/1.json'))['Cache-Control'], 'no-store');
});

test('the kit default header file parses and satisfies the required headers', async () => {
  const policy = await loadHeaderPolicy(['index.html'], async () => { throw new Error('must not read'); });
  assert.equal(policy.source, 'kit-default');
  assert.deepEqual(policy.rules, parseHeadersFile(KIT_DEFAULT_HEADERS_FILE));
  assert.deepEqual(checkRequiredHeaders(policy.rules, ['/index.html']), []);
  const site = await loadHeaderPolicy(['_headers', 'index.html'], async (p) => (assert.equal(p, '_headers'), '/*\n  X-A: b\n'));
  assert.equal(site.source, 'site');
  assert.deepEqual(site.rules, [{ pattern: '/*', set: [['X-A', 'b']], detach: [] }]);
});

test('Cloudflare documented example: every matching rule contributes; repeated headers join with ", "', () => {
  // Relative-path part of https://developers.cloudflare.com/pages/configuration/headers/ ("Attach a header").
  const rules = parseHeadersFile(`# This is a comment
/secure/page
\tX-Frame-Options: DENY
\tX-Content-Type-Options: nosniff
\tReferrer-Policy: no-referrer

/static/*
\tAccess-Control-Allow-Origin: *
\tX-Robots-Tag: nosnippet

/*
\tX-Robots-Tag: noindex
`);
  assert.deepEqual(obj(effectiveHeaders(rules, '/secure/page')), {
    'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex',
  });
  assert.deepEqual(obj(effectiveHeaders(rules, '/static/styles.css')), { 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'nosnippet, noindex' });
  assert.deepEqual(obj(effectiveHeaders(rules, '/home')), { 'X-Robots-Tag': 'noindex' });
});

test('detach removes headers set by earlier (more pervasive) rules; detach runs before the same rule sets', () => {
  const rules = parseHeadersFile(`/*
  Content-Security-Policy: default-src 'self'
  X-A: 1
/*.jpg
  ! Content-Security-Policy
/img/*
  X-A: 2
  ! X-A
/late/*
  X-A: 3
`);
  assert.deepEqual(obj(effectiveHeaders(rules, '/a.jpg')), { 'X-A': '1' });
  assert.equal(obj(effectiveHeaders(rules, '/a.png'))['Content-Security-Policy'], "default-src 'self'");
  // "! X-A" written after "X-A: 2" still runs first: the rule's own value survives, the earlier "1" does not.
  assert.equal(obj(effectiveHeaders(rules, '/img/a.png'))['X-A'], '2');
  // A later rule after a detach starts from empty.
  const r2 = parseHeadersFile('/*\n  X-A: 1\n/x/*\n  ! X-A\n/x/y/*\n  X-A: 3\n');
  assert.equal(obj(effectiveHeaders(r2, '/x/y/z'))['X-A'], '3');
  // Same header twice in one rule joins.
  assert.equal(obj(effectiveHeaders(parseHeadersFile('/*\n  X-A: 1\n  x-a: 2\n'), '/'))['X-A'], '1, 2');
});

test('splat matching: greedy, any characters including "/", anchored, at most one', () => {
  const re = (/** @type {string} */ p) => new RegExp(patternRegexSource(p));
  assert.ok(re('/*').test('/'));
  assert.ok(re('/*').test('/a/b/c.js'));
  assert.ok(re('/assets/*').test('/assets/'));
  assert.ok(re('/assets/*').test('/assets/x/y.js'));
  assert.ok(!re('/assets/*').test('/assets'));
  assert.ok(re('/*.css').test('/a/b.css'));
  assert.ok(!re('/a.js').test('/aXjs'));
  assert.ok(!re('/index.html').test('/index.html/x'));
  assert.ok(re("/a(b)+c,d;e=f@g~h!i&j'k").test("/a(b)+c,d;e=f@g~h!i&j'k"));
});

test('unsupported or malformed _headers input fails closed with E_HEADERS', () => {
  throwsHeaders(() => parseHeadersFile('/movies/:title\n  X-A: b\n'), /placeholder/);
  throwsHeaders(() => parseHeadersFile('https://example.org/*\n  X-A: b\n'), /absolute-URL/);
  throwsHeaders(() => parseHeadersFile('https://:project.pages.dev/*\n  X-A: b\n'), /absolute-URL/);
  throwsHeaders(() => parseHeadersFile('/a/*/b/*\n  X-A: b\n'), /one "\*"/);
  throwsHeaders(() => parseHeadersFile('/*\nX-A: b\n'), /indented/);
  throwsHeaders(() => parseHeadersFile('  X-A: b\n/*\n  X-B: c\n'), /before any path/);
  throwsHeaders(() => parseHeadersFile('/*\n  X-A:\n'), /empty value/);
  throwsHeaders(() => parseHeadersFile('/*\n/x\n  X-A: b\n'), /no headers/);
  throwsHeaders(() => parseHeadersFile('/*\n  X-A: b\n/*\n  X-B: c\n'), /duplicate pattern/);
  throwsHeaders(() => parseHeadersFile('/*\n  Content-Type: text/html\n'), /controlled by the server/);
  throwsHeaders(() => parseHeadersFile('/*\n  ! Content-Length\n'), /controlled by the server/);
  throwsHeaders(() => parseHeadersFile('/*\n  !X-A\n'), /"! Name"/);
  throwsHeaders(() => parseHeadersFile('/*\n  ! X-A: b\n'), /"! Name"/);
  throwsHeaders(() => parseHeadersFile('/*\n  Bad Name: b\n'), /invalid header name/);
  throwsHeaders(() => parseHeadersFile('/*\n  X-A b\n'), /Name: value/);
  throwsHeaders(() => parseHeadersFile('/*\n  X-A: caf\u00e9\n'), /printable ASCII/);
  throwsHeaders(() => parseHeadersFile('/static/*\n  X-From: :splat\n'), /:splat/);
  throwsHeaders(() => parseHeadersFile('/a b\n  X-A: b\n'), /characters outside/);
  throwsHeaders(() => parseHeadersFile('/a?x=1\n  X-A: b\n'), /characters outside/);
  throwsHeaders(() => parseHeadersFile('/a%20b\n  X-A: b\n'), /characters outside/);
  throwsHeaders(() => parseHeadersFile('/a/../b\n  X-A: b\n'), /normalized/);
  throwsHeaders(() => parseHeadersFile('//a\n  X-A: b\n'), /normalized/);
  throwsHeaders(() => parseHeadersFile('relative/*\n  X-A: b\n'), /indented|path pattern/);
  throwsHeaders(() => parseHeadersFile(`/*\n  X-A: ${'a'.repeat(2000)}\n`), /2000/);
  throwsHeaders(() => parseHeadersFile(Array.from({ length: 101 }, (_, i) => `/r${i}\n  X-A: b\n`).join('')), /100 rules/);
  // Accepted: CRLF line endings, BOM, comments, tabs, colons in values.
  assert.deepEqual(parseHeadersFile('\uFEFF# c\r\n/*\r\n\tLink: <https://x.example/a>; rel=preload\r\n'), [{ pattern: '/*', set: [['Link', '<https://x.example/a>; rel=preload']], detach: [] }]);
  assert.equal(canonicalHeaderName('content-security-policy'), 'Content-Security-Policy');
});

test('checkRequiredHeaders reports missing headers, CSP directives and a wrong nosniff value', () => {
  const rules = parseHeadersFile(`/*
  Content-Security-Policy: default-src 'self'; object-src 'none'
  X-Content-Type-Options: sniff
/public/*
  ! Content-Security-Policy
`);
  const f = checkRequiredHeaders(rules, ['/index.html', '/public/a.html']);
  assert.ok(f.every((x) => x.code === 'E_HEADERS' && x.severity === 'error'));
  const idx = f.filter((x) => x.path === '/index.html').map((x) => x.rule).sort();
  // base-uri and frame-ancestors missing: reported both as absent directives and as not restricting.
  assert.deepEqual(idx, ['csp-directive', 'csp-directive', 'csp-value', 'csp-value', 'nosniff', 'required-header']);
  assert.ok(f.some((x) => x.rule === 'detach-required' && /\/public\/\*/.test(x.message)));
  assert.ok(f.some((x) => x.path === '/public/a.html' && /Content-Security-Policy/.test(x.message) && x.rule === 'required-header'));
  // A directive present in any of several comma-joined policies counts (all policies are enforced).
  assert.deepEqual([...cspDirectiveNames("default-src 'self', object-src 'none'; base-uri 'none'")].sort(), ['base-uri', 'default-src', 'object-src']);
  assert.ok(REQUIRED_HEADERS.length > 0 && REQUIRED_CSP_DIRECTIVES.length > 0);
});

test('transport headers: HSTS only for clearnet https, Onion-Location only when configured', () => {
  assert.deepEqual(transportHeaders(host({ publicOrigin: 'https://example.org' })), [['Strict-Transport-Security', HSTS_VALUE]]);
  assert.deepEqual(transportHeaders(host({ publicOrigin: 'http://example.org' })), []);
  assert.deepEqual(transportHeaders(host({ publicOrigin: null })), []);
  assert.deepEqual(transportHeaders(host({ onionLocation: ONION, basePath: '/m/' })), [['Onion-Location', `${ONION}/m/`]]);
  assert.deepEqual(transportHeaders(host({ onionLocation: `${ONION}/` }), '/a?b=1'), [['Onion-Location', `${ONION}/a?b=1`]]);
  assert.deepEqual(transportHeaders(host({ transport: 'onion', publicOrigin: `${ONION}`, onionLocation: ONION })), []);
  assert.deepEqual(transportHeaders(host({ transport: 'i2p', publicOrigin: `http://${'c'.repeat(52)}.b32.i2p` })), []);
  assert.throws(() => transportHeaders(host({ onionLocation: 'http://evil.example' })), (e) => e instanceof KitError && e.code === 'E_CONFIG');
});

test('kitResponseHeaders: Cache-Control default, transport headers never override site rules', () => {
  const rules = parseHeadersFile('/*\n  X-A: 1\n/strict/*\n  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\n  Cache-Control: no-store\n');
  const policy = /** @type {import('../../src/types.mjs').HeaderPolicy} */ ({ rules, source: 'site' });
  const hc = host({ publicOrigin: 'https://example.org' });
  assert.deepEqual(obj(kitResponseHeaders({ policy, hostConfig: hc, headerPath: '/a', requestTarget: '/a' })), { 'X-A': '1', 'Cache-Control': 'no-cache', 'Strict-Transport-Security': HSTS_VALUE });
  const strict = obj(kitResponseHeaders({ policy, hostConfig: hc, headerPath: '/strict/a', requestTarget: '/strict/a' }));
  assert.equal(strict['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains; preload');
  assert.equal(strict['Cache-Control'], 'no-store');
  assert.deepEqual(kitHeaderNames(policy, hc), ['allow', 'cache-control', 'content-type', 'location', 'strict-transport-security', 'x-a']);
});

test('profiles also require the security headers on "/" (error responses for invalid or outside requests)', () => {
  const htmlOnly = parseHeadersFile(KIT_DEFAULT_HEADERS_FILE.replace(/^\/\*$/m, '/*.html'));
  assert.deepEqual(checkRequiredHeaders(htmlOnly, ['/index.html']).filter((x) => x.path === '/index.html'), []);
  assert.ok(checkRequiredHeaders(htmlOnly, ['/index.html']).some((x) => x.path === '/' && /Content-Security-Policy/.test(x.message)));
  assert.throws(() => assertServableHeaders({ rules: htmlOnly, source: 'site' }, ['index.html', 'a.js']), (e) => e instanceof KitError && e.code === 'E_HEADERS' && /for \/ lacks/.test(e.message));
  assertServableHeaders({ rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE), source: 'kit-default' }, ['index.html', 'a.js']);
});

// --- review round 2 regressions ---

const BASE = `/*
  Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`;

/**
 * @param {string} text
 * @param {string[]} paths
 */
const rulesOf = (text, paths) => checkRequiredHeaders(parseHeadersFile(text), paths);

test('R2-A: header names are restricted to [A-Za-z0-9-]+ (a quote could break nginx tokenization)', () => {
  for (const bad of ["'a", "D'", 'a"b', 'a$b', 'a{b', 'a;b', 'a_b', 'a.b', 'a#b', 'a|b', 'a~b']) {
    throwsHeaders(() => parseHeadersFile(`${BASE}  ${bad}: 1\n`), /invalid header name/);
    throwsHeaders(() => parseHeadersFile(`${BASE}/x\n  ! ${bad}\n`), /invalid header name/);
  }
  assert.equal(parseHeadersFile(`${BASE}  X-9-ok: 1\n`)[0]?.set.at(-1)?.[0], 'X-9-Ok');
});

test('R2-D: CSP and nosniff cannot be detached, and are required on scriptable types, every path and "/"', () => {
  const detach = rulesOf(`${BASE}/*.svg\n  ! Content-Security-Policy\n  ! X-Content-Type-Options\n/*.xml\n  ! Content-Security-Policy\n`, ['/index.html', '/evil.svg', '/evil.xml']);
  assert.ok(detach.some((f) => f.rule === 'detach-required' && /\/\*\.svg/.test(f.message) && /Content-Security-Policy/.test(f.message)));
  assert.ok(detach.some((f) => f.rule === 'detach-required' && /X-Content-Type-Options/.test(f.message)));
  assert.ok(detach.some((f) => f.path === '/evil.svg' && /Content-Security-Policy/.test(f.message)));
  assert.ok(detach.some((f) => f.path === '/evil.xml' && /Content-Security-Policy/.test(f.message)));
  // Rules only for HTML: non-HTML files, "/" and arbitrary error paths lack nosniff.
  const htmlOnly = `/
  Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/*.html
  Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`;
  const f = rulesOf(htmlOnly, ['/index.html', '/a.svg', '/LICENSE', '/x.js']);
  assert.ok(f.some((x) => x.path === '/a.svg' && /Content-Security-Policy/.test(x.message)));
  assert.ok(f.some((x) => x.path === '/LICENSE' && /X-Content-Type-Options/.test(x.message)));
  assert.ok(f.some((x) => x.path === '/x.js' && /X-Content-Type-Options/.test(x.message)));
  assert.ok(f.some((x) => x.rule === 'nosniff-global'), 'nosniff must come from a "/*" rule so every response (including 404s) has it');
  assert.ok(!f.some((x) => x.path === '/x.js' && /Content-Security-Policy/.test(x.message)), 'CSP is not required on non-scriptable types');
  // "/" is always checked, even when a caller passes only HTML paths.
  assert.ok(rulesOf(`/*.html\n${BASE.split('\n').slice(1).join('\n')}`, ['/index.html']).some((x) => x.path === '/'));
  assert.deepEqual(rulesOf(BASE, ['/index.html', '/a.svg', '/a.xml', '/a.htm', '/LICENSE', '/a.js']), []);
});

test('R2-C: CSP values must actually restrict', () => {
  const csp = (/** @type {string} */ v) => rulesOf(`/*\n  Content-Security-Policy: ${v}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`, ['/index.html']).map((x) => x.rule);
  assert.deepEqual(csp("default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"), []);
  assert.deepEqual(csp("default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"), []);
  assert.deepEqual(csp("default-src 'self'; object-src 'NONE'; base-uri 'None'; frame-ancestors 'none'"), [], 'keywords are case-insensitive');
  assert.ok(csp('default-src *; object-src *; base-uri *; frame-ancestors *').filter((r) => r === 'csp-value').length >= 3);
  assert.ok(csp("default-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'").includes('csp-value'));
  assert.ok(csp("default-src 'self'; object-src 'none'; base-uri https:; frame-ancestors 'none'").includes('csp-value'));
  assert.ok(csp("default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none' https://x.example").includes('csp-value'));
  assert.ok(csp("default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'").includes('csp-unsafe'));
  assert.ok(csp("default-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'").includes('csp-unsafe'));
  assert.deepEqual(csp("default-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"), [], 'default-src only matters for scripts without script-src');
  assert.ok(csp("default-src 'self'; script-src-elem 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'").includes('csp-unsafe'));
  // Two policies (comma-joined): each restricting value may come from either; an unsafe source in any one is refused.
  assert.deepEqual(csp("default-src 'self'; object-src 'none', base-uri 'none'; frame-ancestors 'none'"), []);
});

test('R2-E: "$" in a header value is reported (E_UNSUPPORTED) before any profile is generated', () => {
  const f = rulesOf(`${BASE}/a.js\n  X-Price: $5\n`, ['/index.html']);
  assert.ok(f.some((x) => x.code === 'E_UNSUPPORTED' && x.rule === 'header-value-dollar' && x.severity === 'error'));
  assert.throws(() => assertServableHeaders({ rules: parseHeadersFile(`${BASE}/a.js\n  X-Price: $5\n`), source: 'site' }, ['index.html']), (e) => e instanceof KitError && e.code === 'E_UNSUPPORTED');
});

test('the demo site _headers passes the strengthened checks', async () => {
  const { demoSiteFiles } = await import('../../src/demo/demo-site.mjs').catch(() => ({ demoSiteFiles: undefined }));
  assert.equal(typeof demoSiteFiles, 'function', 'demo-site.mjs must export demoSiteFiles');
  const files = /** @type {Array<{ path: string, data: string }>} */ (/** @type {any} */ (demoSiteFiles)());
  const text = files.find((x) => x.path === '_headers')?.data ?? '';
  assert.deepEqual(checkRequiredHeaders(parseHeadersFile(text), files.map((x) => `/${x.path}`).filter((p) => p !== '/_headers')), []);
});
