// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { KitError } from '../../src/errors.mjs';
import { KIT_DEFAULT_HEADERS_FILE } from '../../src/policy.mjs';
import { parseHeadersFile } from '../../src/serve/headers.mjs';
import { exportStatic } from '../../src/profiles/static-export.mjs';
import { makeFixtureSite, tempDir, writeTree } from '../serve/helpers.mjs';

/** @typedef {import('../../src/types.mjs').HostConfig} HostConfig */
/** @typedef {import('../../src/types.mjs').HeaderPolicy} HeaderPolicy */

/** @type {HeaderPolicy} */
const POLICY = { rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE), source: 'kit-default' };

/**
 * @param {string} basePath
 * @returns {HostConfig}
 */
function hc(basePath) {
  return { schemaVersion: 1, transport: 'onion', publicOrigin: null, basePath, listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'x', onionLocation: null };
}

/**
 * @param {unknown} e
 * @param {string} code
 */
const isKit = (e, code) => e instanceof KitError && e.code === code;

/**
 * @param {string} dir
 * @returns {Promise<string[]>} relative POSIX paths of regular files
 */
async function listFiles(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (e.isFile()) out.push(path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  }
  return out.sort();
}

for (const basePath of ['/', '/mirror/app/']) {
  test(`exports byte-identical servable files under www${basePath} with source mtimes`, async () => {
    const { siteDir, files } = await makeFixtureSite();
    const outDir = await tempDir('exp');
    try {
      const old = new Date('2001-02-03T04:05:06Z');
      await fs.utimes(path.join(siteDir, 'index.html'), old, old);
      const res = await exportStatic({ siteDir, files, entrypoint: 'index.html', hostConfig: hc(basePath), policy: POLICY, outDir });
      assert.equal(res.wwwRoot, path.join(await fs.realpath(outDir), 'www'));
      const expected = files.filter((f) => f !== '_headers' && !f.startsWith('.hidden/'));
      assert.deepEqual(res.files, expected);
      const siteRoot = path.join(res.wwwRoot, ...basePath.split('/').filter(Boolean));
      assert.deepEqual(await listFiles(res.wwwRoot), expected.map((f) => path.posix.join(basePath.slice(1), f)).sort());
      for (const f of expected) {
        assert.ok((await fs.readFile(path.join(siteRoot, f))).equals(await fs.readFile(path.join(siteDir, f))), f);
      }
      assert.equal((await fs.stat(path.join(siteRoot, 'index.html'))).mtimeMs, old.getTime());
      assert.deepEqual((await fs.readdir(outDir)).sort(), ['www'], 'no temporary directory left');
      // Never overwrite an existing export (stale files would be served by nginx but not by the preview).
      await assert.rejects(exportStatic({ siteDir, files, entrypoint: 'index.html', hostConfig: hc(basePath), policy: POLICY, outDir }), (e) => isKit(e, 'E_USAGE'));
    } finally {
      await fs.rm(siteDir, { recursive: true, force: true });
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });
}

test('refuses symlinks without leaving a partial export', async () => {
  const siteDir = await tempDir('exs');
  const outDir = await tempDir('exo');
  try {
    await writeTree(siteDir, { 'index.html': '<p>x</p>', 'real/a.js': 'a', 'outside.txt': 'secret' });
    await fs.symlink(path.join(siteDir, 'outside.txt'), path.join(siteDir, 'link.txt'));
    await fs.symlink(path.join(siteDir, 'real'), path.join(siteDir, 'dirlink'));
    for (const listed of ['link.txt', 'dirlink/a.js']) {
      await assert.rejects(exportStatic({ siteDir, files: ['index.html', listed], entrypoint: 'index.html', hostConfig: hc('/'), policy: POLICY, outDir }), (e) => isKit(e, 'E_SYMLINK'), listed);
      assert.deepEqual(await fs.readdir(outDir), [], 'nothing left behind');
    }
    await assert.rejects(exportStatic({ siteDir, files: ['index.html', 'missing.js'], entrypoint: 'index.html', hostConfig: hc('/'), policy: POLICY, outDir }), (e) => isKit(e, 'E_IO'));
    assert.deepEqual(await fs.readdir(outDir), []);
  } finally {
    await fs.rm(siteDir, { recursive: true, force: true });
    await fs.rm(outDir, { recursive: true, force: true });
  }
});

test('refuses nested site/output directories and weak headers', async () => {
  const siteDir = await tempDir('exn');
  try {
    await writeTree(siteDir, { 'index.html': '<p>x</p>' });
    const args = { siteDir, files: ['index.html'], entrypoint: 'index.html', hostConfig: hc('/'), policy: POLICY };
    await assert.rejects(exportStatic({ ...args, outDir: path.join(siteDir, 'out') }), (e) => isKit(e, 'E_USAGE'));
    await assert.rejects(exportStatic({ ...args, outDir: path.dirname(siteDir) }), (e) => isKit(e, 'E_USAGE'));
    const weak = { rules: parseHeadersFile('/*\n  X-A: b\n'), source: /** @type {const} */ ('site') };
    await assert.rejects(exportStatic({ ...args, policy: weak, outDir: path.join(path.dirname(siteDir), 'never') }), (e) => isKit(e, 'E_HEADERS'));
  } finally {
    await fs.rm(siteDir, { recursive: true, force: true });
  }
});

test('overlay files are added when servable and not colliding', async () => {
  const siteDir = await tempDir('exv');
  const outDir = await tempDir('exw');
  try {
    await writeTree(siteDir, { 'index.html': '<p>x</p>' });
    const args = { siteDir, files: ['index.html'], entrypoint: 'index.html', hostConfig: hc('/m/'), policy: POLICY };
    const data = new TextEncoder().encode('{"mirror":"x"}\n');
    await assert.rejects(exportStatic({ ...args, outDir, overlayFiles: [{ path: 'index.html', data }] }), (e) => isKit(e, 'E_COLLISION'));
    await assert.rejects(exportStatic({ ...args, outDir, overlayFiles: [{ path: '.mirror.json', data }] }), (e) => isKit(e, 'E_POLICY'));
    await assert.rejects(exportStatic({ ...args, outDir, overlayFiles: [{ path: 'x.php', data }] }), (e) => isKit(e, 'E_POLICY'));
    await assert.rejects(exportStatic({ ...args, outDir, overlayFiles: [{ path: '../x.json', data }] }), (e) => isKit(e, 'E_PATH'));
    const res = await exportStatic({ ...args, outDir, overlayFiles: [{ path: '.well-known/mirror.json', data }] });
    assert.deepEqual(res.files, ['.well-known/mirror.json', 'index.html']);
    assert.deepEqual(await fs.readFile(path.join(res.wwwRoot, 'm', '.well-known', 'mirror.json')), Buffer.from(data));
  } finally {
    await fs.rm(siteDir, { recursive: true, force: true });
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
