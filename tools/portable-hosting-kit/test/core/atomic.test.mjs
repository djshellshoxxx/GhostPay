// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { commitFilesAtomic, replaceDirAtomic, writeFileAtomic } from '../../src/core/atomic.mjs';
import { faultyFs, rejectsCode, snapshot, tmpDir } from './helpers.mjs';

test('writeFileAtomic creates and replaces files and leaves no temporaries', async (t) => {
  const dir = await tmpDir(t);
  const f = path.join(dir, 'out.bin');
  await writeFileAtomic(f, Buffer.from('one'));
  assert.equal(await fsp.readFile(f, 'utf8'), 'one');
  await writeFileAtomic(f, Buffer.from('two'));
  assert.equal(await fsp.readFile(f, 'utf8'), 'two');
  assert.deepEqual(await fsp.readdir(dir), ['out.bin']);
});

test('commitFilesAtomic: a failure at any fs call leaves previous files byte-identical and no temporaries', async (t) => {
  const dir = await tmpDir(t);
  const a = path.join(dir, 'a.zip');
  const b = path.join(dir, 'a.zip.sha256');
  const files = [{ target: a, bytes: Buffer.from('new archive') }, { target: b, bytes: Buffer.from('new sum') }];
  const probe = faultyFs();
  await fsp.writeFile(a, 'old archive');
  await fsp.writeFile(b, 'old sum');
  await commitFilesAtomic(files, { fs: probe.fs });
  const total = probe.calls.length;
  assert.ok(total > 10, `calls: ${probe.calls.join(',')}`);
  let failures = 0;
  for (let k = 1; k <= total; k++) {
    await fsp.writeFile(a, 'old archive');
    await fsp.writeFile(b, 'old sum');
    const faulty = faultyFs(k);
    let threw = false;
    try {
      await commitFilesAtomic(files, { fs: faulty.fs });
    } catch {
      threw = true;
      failures++;
    }
    const op = faulty.failed();
    if (threw) {
      assert.equal(await fsp.readFile(a, 'utf8'), 'old archive', `after failing ${op} (#${k})`);
      assert.equal(await fsp.readFile(b, 'utf8'), 'old sum', `after failing ${op} (#${k})`);
    } else {
      assert.equal(await fsp.readFile(a, 'utf8'), 'new archive', `after failing ${op} (#${k})`);
      assert.equal(await fsp.readFile(b, 'utf8'), 'new sum', `after failing ${op} (#${k})`);
    }
    // Only a failed best-effort cleanup (rm) may leave a hidden temporary/backup behind.
    if (op !== 'rm') assert.deepEqual((await fsp.readdir(dir)).sort(), ['a.zip', 'a.zip.sha256'], `after failing ${op} (#${k})`);
    else for (const n of await fsp.readdir(dir)) if (n.startsWith('.')) await fsp.rm(path.join(dir, n));
  }
  assert.ok(failures > 5);
});

test('commitFilesAtomic: when no previous files existed, a failure leaves nothing behind', async (t) => {
  const dir = await tmpDir(t);
  const files = [{ target: path.join(dir, 'x'), bytes: Buffer.from('1') }, { target: path.join(dir, 'y'), bytes: Buffer.from('2') }];
  const probe = faultyFs();
  await commitFilesAtomic(files, { fs: probe.fs });
  const total = probe.calls.length;
  for (let k = 1; k <= total; k++) {
    await fsp.rm(path.join(dir, 'x'), { force: true });
    await fsp.rm(path.join(dir, 'y'), { force: true });
    const faulty = faultyFs(k);
    try {
      await commitFilesAtomic(files, { fs: faulty.fs });
      assert.deepEqual((await fsp.readdir(dir)).filter((n) => !n.startsWith('.')).sort(), ['x', 'y']);
    } catch {
      assert.deepEqual(await fsp.readdir(dir), [], `after failing ${faulty.failed()} (#${k})`);
    }
  }
});

test('commitFilesAtomic refuses to replace a directory', async (t) => {
  const dir = await tmpDir(t);
  await fsp.mkdir(path.join(dir, 'd'));
  await rejectsCode(writeFileAtomic(path.join(dir, 'd'), Buffer.from('x')), 'E_USAGE');
  assert.deepEqual(await fsp.readdir(dir), ['d']);
});

test('replaceDirAtomic swaps a built directory into place; failures restore the old one', async (t) => {
  const parent = await tmpDir(t);
  const target = path.join(parent, 'out');
  /** @param {string} content */
  const build = (content) => async (/** @type {string} */ tmp) => {
    await fsp.mkdir(path.join(tmp, 'sub'));
    await fsp.writeFile(path.join(tmp, 'sub', 'f.txt'), content);
  };
  await replaceDirAtomic(target, build('v1'));
  assert.equal(await fsp.readFile(path.join(target, 'sub', 'f.txt'), 'utf8'), 'v1');
  await replaceDirAtomic(target, build('v2'));
  assert.equal(await fsp.readFile(path.join(target, 'sub', 'f.txt'), 'utf8'), 'v2');
  assert.deepEqual(await fsp.readdir(parent), ['out']);

  await assert.rejects(replaceDirAtomic(target, async () => { throw new Error('build failed'); }), /build failed/);
  assert.equal(await fsp.readFile(path.join(target, 'sub', 'f.txt'), 'utf8'), 'v2');
  assert.deepEqual(await fsp.readdir(parent), ['out']);

  const before = await snapshot(parent);
  const probe = faultyFs();
  await replaceDirAtomic(target, build('v2'), { fs: probe.fs });
  const total = probe.calls.length;
  for (let k = 1; k <= total; k++) {
    const faulty = faultyFs(k);
    try {
      await replaceDirAtomic(target, build('v3'), { fs: faulty.fs });
      assert.equal(await fsp.readFile(path.join(target, 'sub', 'f.txt'), 'utf8'), 'v3');
      await replaceDirAtomic(target, build('v2'));
    } catch {
      assert.equal(await fsp.readFile(path.join(target, 'sub', 'f.txt'), 'utf8'), 'v2', `after failing ${faulty.failed()} (#${k})`);
    }
    if (faulty.failed() !== 'rm') assert.deepEqual(await fsp.readdir(parent), ['out'], `after failing ${faulty.failed()} (#${k})`);
    else for (const n of await fsp.readdir(parent)) if (n.startsWith('.')) await fsp.rm(path.join(parent, n), { recursive: true });
  }
  assert.equal((await snapshot(parent)).length, before.length);
});

test('replaceDirAtomic refuses to replace a file', async (t) => {
  const parent = await tmpDir(t);
  await fsp.writeFile(path.join(parent, 'f'), 'x');
  await rejectsCode(replaceDirAtomic(path.join(parent, 'f'), async () => {}), 'E_USAGE');
  assert.deepEqual(await fsp.readdir(parent), ['f']);
});
