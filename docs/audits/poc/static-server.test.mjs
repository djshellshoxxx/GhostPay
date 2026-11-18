// Regression tests for the PoC static server (SonarCloud jssecurity:S2083 / S6549 triage, 2026-11-18).
// Run: node --test docs/audits/poc/static-server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './static-server.mjs';

async function withServer(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gp-poc-static-'));
  const dist = join(root, 'dist');
  mkdirSync(dist);
  // A sibling whose name starts with the served directory's name: a bare startsWith(dist) check admits it.
  mkdirSync(join(root, 'dist-secret'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ok</title>');
  writeFileSync(join(root, 'dist-secret', 'secret.txt'), 'SECRET');
  writeFileSync(join(root, 'outside.txt'), 'OUTSIDE');
  const { srv, port } = await startServer(dist, 'meta');
  try {
    await fn(`http://127.0.0.1:${String(port)}`);
  } finally {
    await new Promise((r) => srv.close(r));
    rmSync(root, { recursive: true, force: true });
  }
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
