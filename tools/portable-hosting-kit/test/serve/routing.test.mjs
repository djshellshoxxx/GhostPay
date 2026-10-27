// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { KitError } from '../../src/errors.mjs';
import {
  checkBasePath, createRouter, decodeRequestPath, encodePath, isRejectedByUriParser, isServableRelPath, nginxRequestUri, rawPathOf,
  requestHeaderPath, servableFiles,
} from '../../src/serve/routing.mjs';
import { PCT_VALID_UNIT } from '../../src/profiles/nginx.mjs';

const FILES = ['index.html', 'about/index.html', 'assets/app.js', 'LICENSE', '_headers', '.well-known/security.txt',
  '.well-known/index.html', '.git/config.txt', 'caf\u00e9/men\u00fc.html', 'caf\u00e9/index.html', 'a.b/index.html'];

/** @param {string} basePath */
const router = (basePath) => createRouter({ files: FILES, entrypoint: 'index.html', basePath });

test('normative routing at the root', () => {
  const r = router('/');
  assert.deepEqual(r('/'), { kind: 'file', path: 'index.html' });
  assert.deepEqual(r('/index.html'), { kind: 'file', path: 'index.html' });
  assert.deepEqual(r('/about'), { kind: 'redirect', location: '/about/' });
  assert.deepEqual(r('/about/'), { kind: 'file', path: 'about/index.html' });
  assert.deepEqual(r('/about?x=1'), { kind: 'redirect', location: '/about/' });
  assert.deepEqual(r('/assets/app.js?v=2#x'), { kind: 'file', path: 'assets/app.js' });
  assert.deepEqual(r('/LICENSE'), { kind: 'file', path: 'LICENSE' });
  // SPA deep links vs missing files
  assert.deepEqual(r('/users/42'), { kind: 'fallback', path: 'index.html' });
  assert.deepEqual(r('/users/42/'), { kind: 'fallback', path: 'index.html' });
  assert.deepEqual(r('/assets'), { kind: 'fallback', path: 'index.html' });
  assert.deepEqual(r('/assets/missing.js'), { kind: 'not-found' });
  assert.deepEqual(r('/x.y/'), { kind: 'not-found' });
  assert.deepEqual(r('/index.html/'), { kind: 'not-found' });
  assert.deepEqual(r('/a.b'), { kind: 'redirect', location: '/a.b/' }, 'directory redirect wins over the dotted-name 404');
  // hidden and never served
  assert.deepEqual(r('/_headers'), { kind: 'forbidden' });
  assert.deepEqual(r('/assets/_headers'), { kind: 'forbidden' });
  assert.deepEqual(r('/.git/config.txt'), { kind: 'forbidden' });
  assert.deepEqual(r('/.git'), { kind: 'forbidden' });
  assert.deepEqual(r('/.well-known/security.txt'), { kind: 'file', path: '.well-known/security.txt' });
  assert.deepEqual(r('/.well-known'), { kind: 'redirect', location: '/.well-known/' });
  assert.deepEqual(r('/about/.well-known/x'), { kind: 'forbidden' });
  // encodings
  assert.deepEqual(r('/caf%C3%A9/men%C3%BC.html'), { kind: 'file', path: 'caf\u00e9/men\u00fc.html' });
  assert.deepEqual(r('/caf%C3%A9'), { kind: 'redirect', location: '/caf%C3%A9/' });
  assert.deepEqual(r('/assets%2Fapp.js'), { kind: 'file', path: 'assets/app.js' });
  for (const bad of ['/%zz', '/%E9', '/%C0%AF', '/%ED%A0%80', '/a%00b', '/a%0Ab', '/a%7Fb', '/a%5Cb', '/a\\b', '/x/../index.html',
    '/%2e%2e/index.html', '/./index.html', '//index.html', '/assets//app.js', '/assets%2F%2Fapp.js', 'index.html', '', '*']) {
    assert.deepEqual(r(bad), { kind: 'not-found' }, bad);
  }
  // absolute-form
  assert.deepEqual(r('http://example.test/assets/app.js'), { kind: 'file', path: 'assets/app.js' });
  assert.deepEqual(r('http://example.test'), { kind: 'file', path: 'index.html' });
});

test('normative routing at a subpath', () => {
  const r = router('/mirror/app/');
  assert.deepEqual(r('/mirror/app'), { kind: 'redirect', location: '/mirror/app/' });
  assert.deepEqual(r('/mirror/app/'), { kind: 'file', path: 'index.html' });
  assert.deepEqual(r('/mirror/app/about'), { kind: 'redirect', location: '/mirror/app/about/' });
  assert.deepEqual(r('/mirror/app/deep/link'), { kind: 'fallback', path: 'index.html' });
  for (const out of ['/', '/index.html', '/mirror', '/mirror/', '/mirror/appx', '/mirror/appx/', '/other/deep']) {
    assert.deepEqual(r(out), { kind: 'not-found' }, out);
  }
  assert.equal(requestHeaderPath('/mirror/app/assets/x.js', '/mirror/app/'), '/assets/x.js');
  assert.equal(requestHeaderPath('/mirror/app', '/mirror/app/'), '/');
  assert.equal(requestHeaderPath('/other', '/mirror/app/'), '/');
  assert.equal(requestHeaderPath('/mirror/app/%zz', '/mirror/app/'), '/');
});

test('entrypoint other than index.html: "/" falls back to it', () => {
  const r = createRouter({ files: ['app.html', 'a.js'], entrypoint: 'app.html', basePath: '/' });
  assert.deepEqual(r('/'), { kind: 'fallback', path: 'app.html' });
  assert.deepEqual(r('/x'), { kind: 'fallback', path: 'app.html' });
});

test('router construction validates base path, entrypoint and file list', () => {
  for (const bad of ['', 'mirror/', '/mirror', '/a//b/', '/./', '/../', '/.x/', '/a b/', '/a"/', '/a$/']) {
    assert.throws(() => checkBasePath(bad), (e) => e instanceof KitError && e.code === 'E_CONFIG', bad);
  }
  assert.equal(checkBasePath('/a.b/c-d_e~/'), '/a.b/c-d_e~/');
  const E = (/** @type {string} */ code) => (/** @type {unknown} */ e) => e instanceof KitError && e.code === code;
  assert.throws(() => createRouter({ files: ['a.js'], entrypoint: 'index.html', basePath: '/' }), E('E_ENTRYPOINT'));
  assert.throws(() => createRouter({ files: ['index.txt'], entrypoint: 'index.txt', basePath: '/' }), E('E_ENTRYPOINT'));
  assert.throws(() => createRouter({ files: ['_headers'], entrypoint: '_headers', basePath: '/' }), E('E_ENTRYPOINT'));
  assert.throws(() => servableFiles(['index.html', 'run.php']), E('E_POLICY'));
  for (const bad of ['/abs.html', 'a//b.html', 'a/../b.html', './a.html', 'dir/', 'a\\b.html', 'a\nb.html']) {
    assert.throws(() => servableFiles([bad]), E('E_PATH'), bad);
  }
  assert.deepEqual(servableFiles(['b.js', '_headers', '.env', 'x/.DS_Store', '.well-known/a.txt', 'a.js']), ['.well-known/a.txt', 'a.js', 'b.js']);
  assert.equal(isServableRelPath('.well-known/'), true);
  assert.equal(isServableRelPath('a/.well-known/x'), false);
});

test('request-target helpers', () => {
  assert.equal(rawPathOf('/a/b?x#y'), '/a/b');
  assert.equal(rawPathOf('https://h:1/a?x'), '/a');
  assert.equal(rawPathOf('http://h'), '/');
  assert.equal(nginxRequestUri('http://h/a?b'), '/a?b');
  assert.equal(nginxRequestUri('http://h'), '/');
  assert.equal(nginxRequestUri('/x?y'), '/x?y');
  assert.equal(decodeRequestPath('/caf%C3%A9'), '/caf\u00e9');
  assert.equal(decodeRequestPath('/a%3Fb'), '/a?b');
  assert.equal(encodePath('/caf\u00e9/a b/'), '/caf%C3%A9/a%20b/');
  // nginx request-line parser rejections (400)
  for (const t of ['/%zz', '/a%', '/a%0', '/a%00b', '/..', '/%2e%2e/x', '/a/../../x', '/a/%2E%2E%2F%2E%2E/x']) assert.equal(isRejectedByUriParser(t), true, t);
  for (const t of ['/a/../x', '/a/./b', '/%E9', '/x?%zz', '/a%2Fb']) assert.equal(isRejectedByUriParser(t), false, t);
});

test('nginx UTF-8 validity regex agrees with decodeURIComponent', () => {
  const valid = new RegExp(`^(?:${PCT_VALID_UNIT})*$`);
  const hex = (/** @type {number} */ b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  const decodes = (/** @type {string} */ s) => {
    try {
      decodeURIComponent(s);
      return true;
    } catch {
      return false;
    }
  };
  // Every 1- and 2-byte sequence exhaustively, mixed-case hex for a sample.
  for (let a = 0; a < 256; a++) {
    assert.equal(valid.test(hex(a)), decodes(hex(a)), hex(a));
    for (let b = 0; b < 256; b++) {
      const s = hex(a) + hex(b);
      assert.equal(valid.test(s), decodes(s), s);
    }
  }
  // Boundary 3- and 4-byte sequences plus random ones.
  const edge = ['%E0%A0%80', '%E0%9F%BF', '%ED%9F%BF', '%ED%A0%80', '%EF%BF%BF', '%F0%90%80%80', '%F0%8F%BF%BF', '%F4%8F%BF%BF', '%F4%90%80%80', '%F5%80%80%80', '%e2%82%ac', '%C2%80a%2F'];
  for (const s of edge) assert.equal(valid.test(s), decodes(s), s);
  const rnd = randomBytes(40000);
  for (let i = 0; i + 4 <= rnd.length; i += 4) {
    const bytes = [...rnd.subarray(i, i + 4)].map((x, k) => (k === 0 ? 0xc0 | x : 0x80 | (x & 0x3f) | (x & 0x40)));
    for (const len of [3, 4]) {
      const s = bytes.slice(0, len).map(hex).join('');
      assert.equal(valid.test(s), decodes(s), s);
    }
  }
});
