// @ts-check
// Shared request matrix and comparison used by the nginx differential test and the opt-in container test.

import { buildRequest, rawRequest } from '../serve/helpers.mjs';

/** @typedef {[string, string, Record<string, string>?, { host?: boolean, version?: string }?]} Case */

/**
 * Request cases relative to a base path B: files, nested indexes, directory redirects, deep links, missing files,
 * dotfiles, `_headers`, `.well-known`, encodings, methods, HEAD, conditionals, ranges and malformed requests.
 * @param {string} B base path
 * @returns {Case[]}
 */
export function requestCases(B) {
  const bare = B.slice(0, -1);
  /** @type {Case[]} */
  const c = [];
  const get = [
    // files, nested index, directory redirects
    '', 'index.html', 'about', 'about/', 'about/index.html', 'docs', 'docs/', 'docs/guide.html', 'a.b', 'a.b/',
    'assets/app-1a2b.js', 'assets/style-3c4d.css', 'assets/LOGO.PNG', 'assets/font.woff2', 'assets/data.wasm',
    'deployments/31337.json', 'ghostpay-embed-v1.js', 'manifest.webmanifest', 'LICENSE', 'robots.txt',
    'unicode/caf%C3%A9.txt', 'unicode/caf%c3%a9.txt', 'space%20dir/my%20file.txt', 'INDEX.HTML',
    // deep links (SPA fallback) and missing files
    'deep/link', 'deep/link/', 'users/42', 'assets', 'assets/', 'assets/missing.js', 'missing.png', 'missing.dir.d/',
    'index.html/', 'about/missing', 'docs/missing.html', 'nope/index.html', 'deep/%3Fq.js', 'deep/%3Fq', 'a%23b.js',
    'a%25b.js', 'docs/guide.html%3Fx',
    // .well-known, dotfiles, _headers
    '.well-known/security.txt', '.well-known/', '.well-known', '.well-known/missing', '.hidden/secret.txt', '.hidden',
    '.hidden/', 'assets/.env', '_headers', 'assets/_headers', '_headers/x', 'about/.well-known/x',
    // encodings
    '%2e%2e/index.html', 'x/../index.html', 'x/%2E%2E/index.html', './index.html', '%2E/index.html', '/index.html',
    'assets//app-1a2b.js', 'assets%2Fapp-1a2b.js', 'assets%2F%2Fapp-1a2b.js', '%61bout/', 'a%00b', 'a%5Cb', 'a\\b',
    'a%0Ab', '%7F', '%zz', 'index.html%', '%E9', '%C3%A9', '%C0%AF', '%ED%A0%80', '%F4%90%80%80', '%F0%9F%98%80',
    'caf\u00c3\u00a9', 'index.html?x=1', 'index.html?x=%zz&y=..//', 'deep?q=a/../b', 'index.html#frag', 'about#x',
    'a"b<c>', 'x/../../../index.html', '%2e%2e/%2e%2e/%2e%2e/x',
  ];
  for (const g of get) c.push(['GET', `${B}${g}`]);
  // outside the base path
  for (const t of ['/', '/other', '/index.html', `${bare}`, `${bare}/../index.html`, `${bare}%2F`, '/.well-known/security.txt', '/../x']) {
    c.push(['GET', t]);
  }
  if (B !== '/') c.push(['GET', `${bare}x/`]);
  // methods
  for (const m of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'PROPFIND', 'TRACE', 'FOO', 'X-Y_Z', 'CONNECT', 'get']) {
    c.push([m, `${B}index.html`]);
  }
  for (const t of ['', 'about', 'missing.png', 'deep/link', 'assets/app-1a2b.js', '.hidden/secret.txt', '%E9']) c.push(['HEAD', `${B}${t}`]);
  c.push(['POST', `${B}%zz`], ['FOO', `${B}%zz`], ['POST', `${B}%E9`], ['DELETE', bare || '/'], ['OPTIONS', '*']);
  c.push(['CONNECT', 'example.org:443'], ['CONNECT', `${B}about`], ['CONNECT', `${B}%zz`]);
  // absolute-form
  c.push(['GET', `http://example.test${B}assets/app-1a2b.js`], ['GET', `http://example.test${B}nope.js`], ['GET', 'http://example.test']);
  // conditional requests (nginx's not-modified rules; validators from mtimes) and ranges (disabled -> full 200)
  const idx = `${B}index.html`;
  /** @type {Array<Record<string, string>>} */
  const conditionals = [
    { 'If-None-Match': '*' }, { 'If-None-Match': '"nope"' }, { 'If-None-Match': 'W/"nope", *' },
    { 'If-Modified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT' }, { 'If-Modified-Since': 'garbage' },
    { 'If-Match': '*' }, { 'If-Match': '"nope"' }, { 'If-Unmodified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' },
    { 'If-Unmodified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT' }, { 'If-Unmodified-Since': 'Friday, 01-Jan-99 00:00:00 GMT' },
    { 'If-Unmodified-Since': 'Fri Jan  1 00:00:00 2100' }, { 'If-Unmodified-Since': 'nonsense' },
    { Range: 'bytes=0-3' }, { Range: 'bytes=0-3', 'If-Range': '"x"' },
  ];
  for (const h of conditionals) c.push(['GET', idx, h], ['HEAD', idx, h], ['GET', `${B}deep/link`, h]);
  c.push(['POST', idx, { 'If-None-Match': '*' }], ['GET', `${B}missing.png`, { 'If-None-Match': '*' }]);
  // Host validation (nginx: 400 for a missing HTTP/1.1, duplicate, empty or malformed Host) and Expect handling
  c.push(['GET', idx, {}, { host: false }], ['GET', idx, {}, { host: false, version: 'HTTP/1.0' }]);
  for (const h of ['a..b', 'a/b', 'a\\b', '', '.', 'Example.ORG.', '[::1]:8080', 'x:1:2', 'a b', '.a', 'x:', 'x:00080', 'x:65536', 'x:abc',
    '[::1', '[v1.x]', '[::1%25e]', "a!$&'()*+,;=b", 'a%zz', 'a"b', 'a@b', 'a#b', 'a{b', 'caf\u00e9', 'xn--caf-dma.example:443']) {
    c.push(['GET', `${B}deep`, { Host: h }, { host: false }]);
  }
  c.push(['GET', `${B}deep`, { Host: 'a' }], ['GET', `${B}deep`, { Host: 'a..b' }, { host: false, version: 'HTTP/1.0' }]);
  c.push(['GET', idx, { Expect: 'something-else' }], ['POST', idx, { Expect: '100-continue' }]);
  for (const t of ['index.html', '', 'about', 'about/', 'deep/link', 'missing.png', '_headers', '%E9', '%zz', 'index.html/']) {
    c.push(['GET', `${B}${t}`, { Expect: '100-continue' }], ['HEAD', `${B}${t}`, { Expect: '100-continue' }]);
  }
  c.push(['GET', '/outside/x.js', { Expect: '100-continue' }], ['GET', idx, { Expect: '100-continue', 'If-None-Match': '*' }]);
  c.push(['GET', idx, { Expect: '100-continue', 'If-Match': '"x"' }], ['GET', idx, { Expect: '100-Continue' }]);
  c.push(['GET', idx, { Expect: '100-continue' }, { version: 'HTTP/1.0' }]);
  return c;
}

/**
 * Send every case to both servers and list every difference in status, the given headers, and 200 bodies.
 * Also requires the security headers on every nginx response.
 * @param {{ previewPort: number, otherPort: number, names: string[], cases: Case[], requireOnEvery?: string[] }} a
 * @returns {Promise<{ mismatches: string[], statuses: Set<number> }>}
 */
export async function compareServers({ previewPort, otherPort, names, cases, requireOnEvery = ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'cache-control'] }) {
  /** @type {string[]} */
  const mismatches = [];
  const statuses = new Set();
  for (const [method, target, extra, opts] of cases) {
    const req = buildRequest(method, target, extra, opts);
    const id = `${method} ${JSON.stringify(target)} ${JSON.stringify(extra ?? {})}${opts ? JSON.stringify(opts) : ''}`;
    const [p, n] = await Promise.all([rawRequest({ port: previewPort }, req), rawRequest({ port: otherPort }, req)])
      .catch((e) => { throw new Error(`${id}: ${e.message}`); });
    statuses.add(n.status);
    for (const name of requireOnEvery) {
      if (!n.headers.has(name)) mismatches.push(`${id}: nginx response (${n.status}) lacks ${name}`);
      if (!p.headers.has(name)) mismatches.push(`${id}: preview response (${p.status}) lacks ${name}`);
    }
    if (method === 'CONNECT') {
      // nginx answers CONNECT natively, before configuration: 1.24 rejects authority-form while parsing (400) and
      // origin-form with 405; 1.30 does the opposite. Guarantee: refused, with the security headers; preview 405.
      if (p.status !== 405 || ![400, 405].includes(n.status)) mismatches.push(`${id}: CONNECT preview=${p.status} nginx=${n.status}`);
      continue;
    }
    if (p.status !== n.status) mismatches.push(`${id}: status preview=${p.status} nginx=${n.status}`);
    if (p.interim.join() !== n.interim.join()) mismatches.push(`${id}: interim responses preview=${p.interim} nginx=${n.interim}`);
    for (const name of names) {
      if (p.headers.get(name) !== n.headers.get(name)) {
        mismatches.push(`${id}: ${name} preview=${JSON.stringify(p.headers.get(name))} nginx=${JSON.stringify(n.headers.get(name))}`);
      }
    }
    if (n.status === 200) {
      if (method === 'GET' && !p.body.equals(n.body)) mismatches.push(`${id}: 200 bodies differ`);
      if (p.headers.get('content-length') !== n.headers.get('content-length')) mismatches.push(`${id}: content-length differs`);
      if (method === 'HEAD' && (p.body.length !== 0 || n.body.length !== 0)) mismatches.push(`${id}: HEAD with body`);
    }
  }
  return { mismatches, statuses };
}
