// node --test scripts/pages/serve-pages.test.mjs
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIME_TYPES, createPagesServer, normalizeBase, resolveRequest } from './serve-pages.mjs';

const SECURITY_HEADERS = [
  'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'x-content-type-options',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy', 'referrer-policy',
  'permissions-policy', 'strict-transport-security', 'x-xss-protection',
];

/** Raw request (no URL normalization by a client library), so traversal attempts reach the server verbatim. */
function raw(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, buf, body: buf.toString('utf8') }); });
    });
    req.on('error', reject);
    req.end();
  });
}

let work;
let site;
let outside;
let server;
let port;

before(async () => {
  work = mkdtempSync(join(tmpdir(), 'serve-pages-test-'));
  site = join(work, 'site');
  outside = join(work, 'secret.txt');
  mkdirSync(join(site, 'assets'), { recursive: true });
  mkdirSync(join(site, 'docs'));
  writeFileSync(outside, 'TOP SECRET outside the site\n');
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>root</title>');
  writeFileSync(join(site, 'help.html'), '<!doctype html><title>help</title>');
  writeFileSync(join(site, 'docs', 'index.html'), '<!doctype html><title>docs</title>');
  writeFileSync(join(site, 'build-info.json'), '{"app":"ghostpay-web"}');
  writeFileSync(join(site, 'assets', 'app.js'), 'export const x = 1;');
  writeFileSync(join(site, 'assets', 'app.css'), 'body{}');
  writeFileSync(join(site, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(site, 'assets', 'font.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
  writeFileSync(join(site, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(site, 'favicon.ico'), Buffer.from([0, 0, 1, 0]));
  writeFileSync(join(site, 'robots.txt'), 'User-agent: *\n');
  writeFileSync(join(site, 'assets', 'app.js.map'), '{}');
  writeFileSync(join(site, 'assets', 'module.mjs'), 'export {}');
  writeFileSync(join(site, '.nojekyll'), '');
  writeFileSync(join(site, 'Makefile'), 'all:\n');
  symlinkSync(outside, join(site, 'link.txt'));
  symlinkSync(work, join(site, 'linkdir'));
  server = createPagesServer({ siteDir: site, base: '/GhostPay/' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});

after(async () => {
  await new Promise((r) => server.close(r));
  rmSync(work, { recursive: true, force: true });
});

describe('base handling', () => {
  test('the base serves index.html', async () => {
    const r = await raw(port, '/GhostPay/');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], MIME_TYPES['.html']);
    assert.match(r.body, /<title>root<\/title>/);
  });

  test('the base without its trailing slash redirects to it (like Pages)', async () => {
    const r = await raw(port, '/GhostPay');
    assert.equal(r.status, 301);
    assert.equal(r.headers.location, '/GhostPay/');
  });

  test('a directory serves its index.html, and redirects without its slash', async () => {
    const r = await raw(port, '/GhostPay/docs/');
    assert.equal(r.status, 200);
    assert.match(r.body, /<title>docs<\/title>/);
    const redirect = await raw(port, '/GhostPay/docs');
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, '/GhostPay/docs/');
  });

  test('a query string never selects another file', async () => {
    const r = await raw(port, '/GhostPay/help.html?x=../../secret.txt');
    assert.equal(r.status, 200);
    assert.match(r.body, /<title>help<\/title>/);
  });

  for (const path of ['/', '/index.html', '/help.html', '/build-info.json', '/assets/app.js', '/ghostpay/', '/GhostPayX/', '/GhostPay.html', '/other/GhostPay/index.html']) {
    test(`outside the base is 404: ${path}`, async () => {
      const r = await raw(port, path);
      assert.equal(r.status, 404);
      assert.doesNotMatch(r.body, /<title>/);
    });
  }

  test('normalizeBase', () => {
    assert.equal(normalizeBase('GhostPay'), '/GhostPay/');
    assert.equal(normalizeBase('/GhostPay'), '/GhostPay/');
    assert.equal(normalizeBase('/a/b/'), '/a/b/');
    assert.equal(normalizeBase('/'), '/');
    for (const bad of ['/../', '/a/../b/', '/a b/', '/a?b/', '/%2e%2e/']) assert.throws(() => normalizeBase(bad));
  });

  test('a root base serves the site at /', async () => {
    const s = createPagesServer({ siteDir: site, base: '/' });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    try {
      const r = await raw(s.address().port, '/');
      assert.equal(r.status, 200);
      assert.match(r.body, /<title>root<\/title>/);
    } finally {
      await new Promise((r) => s.close(r));
    }
  });
});

describe('MIME types and allowlist', () => {
  const cases = [
    ['/GhostPay/index.html', 'text/html; charset=utf-8'],
    ['/GhostPay/assets/app.js', 'text/javascript; charset=utf-8'],
    ['/GhostPay/assets/app.css', 'text/css; charset=utf-8'],
    ['/GhostPay/assets/logo.svg', 'image/svg+xml'],
    ['/GhostPay/build-info.json', 'application/json; charset=utf-8'],
    ['/GhostPay/assets/font.woff2', 'font/woff2'],
    ['/GhostPay/robots.txt', 'text/plain; charset=utf-8'],
    ['/GhostPay/assets/icon.png', 'image/png'],
    ['/GhostPay/favicon.ico', 'image/x-icon'],
  ];
  for (const [path, type] of cases) {
    test(`${path} -> ${type}`, async () => {
      const r = await raw(port, path);
      assert.equal(r.status, 200);
      assert.equal(r.headers['content-type'], type);
      assert.equal(r.headers['content-length'], String(r.buf.length));
    });
  }

  test('the extension is matched case-insensitively, the file name exactly', async () => {
    assert.equal((await raw(port, '/GhostPay/INDEX.HTML')).status, 404);
  });

  for (const path of ['/GhostPay/assets/app.js.map', '/GhostPay/assets/module.mjs', '/GhostPay/.nojekyll', '/GhostPay/Makefile', '/GhostPay/missing.html', '/GhostPay/assets/']) {
    test(`not an allowlisted published file -> 404: ${path}`, async () => {
      assert.equal((await raw(port, path)).status, 404);
    });
  }

  test('HEAD answers like GET without a body; other methods are 405', async () => {
    const head = await raw(port, '/GhostPay/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-type'], MIME_TYPES['.html']);
    const post = await raw(port, '/GhostPay/', 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
  });

  test('no security headers are sent (GitHub Pages cannot send them)', async () => {
    for (const path of ['/GhostPay/', '/GhostPay/assets/app.js', '/nope', '/GhostPay/missing.js']) {
      const r = await raw(port, path);
      for (const h of SECURITY_HEADERS) assert.equal(r.headers[h], undefined, `${path}: ${h}`);
    }
  });
});

describe('path traversal and symlinks', () => {
  const attempts = [
    '/GhostPay/../secret.txt',
    '/GhostPay/%2e%2e/secret.txt',
    '/GhostPay/%2E%2E/secret.txt',
    '/GhostPay/..%2fsecret.txt',
    '/GhostPay/..%2Fsecret.txt',
    '/GhostPay/assets/..%2f..%2fsecret.txt',
    '/GhostPay/%2e%2e%2fsecret.txt',
    '/GhostPay/..%5csecret.txt',
    '/GhostPay/assets%5c..%5c..%5csecret.txt',
    '/GhostPay/%00index.html',
    '/GhostPay/index.html%00.js',
    '/GhostPay/%',
    '/GhostPay/%zz',
    '/GhostPay//etc/passwd',
    '/GhostPay/%2fetc%2fpasswd',
    '/GhostPay/assets/../../secret.txt',
  ];
  for (const path of attempts) {
    test(`refused: ${path}`, async () => {
      const r = await raw(port, path);
      assert.ok(r.status === 404 || r.status === 400, `${path} -> ${String(r.status)}`);
      assert.doesNotMatch(r.body, /TOP SECRET|root:/);
    });
  }

  test('a symlinked file is refused, even to an allowlisted extension', async () => {
    const r = await raw(port, '/GhostPay/link.txt');
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body, /TOP SECRET/);
  });

  test('a symlinked directory is never followed', async () => {
    for (const path of ['/GhostPay/linkdir/secret.txt', '/GhostPay/linkdir/site/index.html', '/GhostPay/linkdir/']) {
      const r = await raw(port, path);
      assert.equal(r.status, 404, path);
      assert.doesNotMatch(r.body, /TOP SECRET|<title>root/);
    }
  });

  test('resolveRequest keeps every decision inside the root', () => {
    const root = '/srv/site';
    assert.deepEqual(resolveRequest(root, '/GhostPay/', '/GhostPay/%2e%2e/x.js'), { status: 404 });
    assert.equal(resolveRequest(root, '/GhostPay/', '/GhostPay/a%00.js').status, 400);
    assert.equal(resolveRequest(root, '/GhostPay/', '/GhostPay/a%5c..%5cb.js').status, 400);
    assert.equal(resolveRequest(root, '/GhostPay/', '/elsewhere/x.js').status, 404);
  });

  test('the site directory itself may not be a dangling or non-directory path', () => {
    assert.throws(() => createPagesServer({ siteDir: join(work, 'missing') }));
    assert.throws(() => createPagesServer({ siteDir: outside }));
  });
});

describe('404 page', () => {
  test('a site 404.html is served with status 404 inside the base only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'serve-pages-404-'));
    try {
      writeFileSync(join(dir, 'index.html'), '<title>i</title>');
      writeFileSync(join(dir, '404.html'), '<title>custom 404</title>');
      const s = createPagesServer({ siteDir: dir, base: '/GhostPay/' });
      await new Promise((r) => s.listen(0, '127.0.0.1', r));
      try {
        const p = s.address().port;
        const inside = await raw(p, '/GhostPay/nope.js');
        assert.equal(inside.status, 404);
        assert.match(inside.body, /custom 404/);
        assert.equal(inside.headers['content-type'], MIME_TYPES['.html']);
        const out = await raw(p, '/nope.js');
        assert.equal(out.status, 404);
        assert.doesNotMatch(out.body, /custom 404/);
      } finally {
        await new Promise((r) => s.close(r));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
