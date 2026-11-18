// Regression tests for the PoC static server (SonarCloud jssecurity:S2083 / S6549 triage, 2026-11-18).
// Run: node --test docs/audits/poc/static-server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './static-server.mjs';

async function withFixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gp-poc-static-'));
  const dist = join(root, 'dist');
  mkdirSync(dist);
  // A sibling whose name starts with the served directory's name: a bare startsWith(dist) check admits it.
  mkdirSync(join(root, 'dist-secret'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ok</title>');
  writeFileSync(join(root, 'dist-secret', 'secret.txt'), 'SECRET');
  writeFileSync(join(root, 'outside.txt'), 'OUTSIDE');
  try {
    await fn(dist);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function withServer(fn) {
  await withFixture(async (dist) => {
    const { srv, port } = await startServer(dist, 'meta');
    try { await fn(`http://127.0.0.1:${String(port)}`, dist); }
    finally { await new Promise((r) => srv.close(r)); }
  });
}

const get = async (base, path) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.text() };
};

test('serves files inside the bundle', async () => {
  await withServer(async (base) => {
    const r = await get(base, '/');
    assert.equal(r.status, 200);
    assert.match(r.body, /<title>ok<\/title>/);
  });
});

test('refuses a sibling directory that shares the bundle directory name as a prefix', async () => {
  await withServer(async (base) => {
    const r = await get(base, '/..%2Fdist-secret%2Fsecret.txt');
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body, /SECRET/);
  });
});

test('refuses encoded parent-directory traversal', async () => {
  await withServer(async (base) => {
    const r = await get(base, '/..%2Foutside.txt');
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body, /OUTSIDE/);
  });
});

test('answers a malformed percent-encoding with 400 and keeps serving', async () => {
  await withServer(async (base) => {
    const bad = await get(base, '/%E0%A4%A');
    assert.equal(bad.status, 400);
    assert.equal((await get(base, '/')).status, 200);
  });
});

test('refuses file and directory symlinks that escape the bundle', async () => {
  await withServer(async (base, dist) => {
    symlinkSync(join(dist, '..', 'outside.txt'), join(dist, 'linked.txt'));
    symlinkSync(join(dist, '..', 'dist-secret'), join(dist, 'linked-directory'), 'dir');
    for (const path of ['/linked.txt', '/linked-directory/secret.txt']) {
      const result = await get(base, path);
      assert.equal(result.status, 404, path);
      assert.doesNotMatch(result.body, /OUTSIDE|SECRET/);
    }
  });
});

test('serves a symlink whose resolved file remains inside the bundle', async () => {
  await withServer(async (base, dist) => {
    symlinkSync(join(dist, 'index.html'), join(dist, 'alias.html'));
    const result = await get(base, '/alias.html');
    assert.equal(result.status, 200);
    assert.match(result.body, /<title>ok<\/title>/);
  });
});

// Run crash regressions in child processes so the pre-fix uncaught exception cannot abort the test harness.
const serverModule = new URL('./static-server.mjs', import.meta.url).href;

test('answers a malformed raw URL with 400 instead of terminating the server', async () => {
  await withFixture((dist) => {
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import http from 'node:http';
      import { startServer } from ${JSON.stringify(serverModule)};
      const { srv, port } = await startServer(process.argv[1], 'meta');
      const status = await new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path: '//[' }, (response) => {
          response.resume(); response.on('end', () => resolve(response.statusCode));
        }).on('error', reject);
      });
      const healthy = await fetch('http://127.0.0.1:' + port + '/');
      await healthy.arrayBuffer();
      await new Promise((resolve) => srv.close(resolve));
      console.log(JSON.stringify({ status, healthy: healthy.status }));
    `, dist], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    assert.deepEqual(JSON.parse(child.stdout), { status: 400, healthy: 200 });
  });
});

test('filesystem lookup and read failures return 404 without stopping the server', async () => {
  await withFixture((dist) => {
    writeFileSync(join(dist, 'blocked.txt'), 'UNREADABLE_FIXTURE');
    for (const operation of ['statSync', 'readFileSync', 'realpathSync']) {
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import fs from 'node:fs';
        import { startServer } from ${JSON.stringify(serverModule)};
        const operation = process.argv[2];
        const original = fs[operation];
        fs[operation] = function(file, ...args) {
          if (String(file).endsWith('/blocked.txt')) throw Object.assign(new Error('fixture failure'), { code: 'EACCES' });
          return original.call(this, file, ...args);
        };
        const { srv, port } = await startServer(process.argv[1], 'meta');
        const rejected = await fetch('http://127.0.0.1:' + port + '/blocked.txt');
        const body = await rejected.text();
        const healthy = await fetch('http://127.0.0.1:' + port + '/');
        await healthy.arrayBuffer();
        await new Promise((resolve) => srv.close(resolve));
        console.log(JSON.stringify({ status: rejected.status, body, healthy: healthy.status }));
      `, dist, operation], { encoding: 'utf8', timeout: 10_000 });
      assert.equal(child.status, 0, `${operation}: ${child.stderr || String(child.error)}`);
      assert.deepEqual(JSON.parse(child.stdout), { status: 404, body: 'nf', healthy: 200 }, operation);
    }
  });
});
