// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readFileExact, readPrefix, sha256File, sha256Hex } from '../../src/core/hash.mjs';
import { writeFileAtomic } from '../../src/core/atomic.mjs';
import { rejectsCode, tmpDir } from './helpers.mjs';

test('sha256Hex and sha256File agree with a known vector', async (t) => {
  const dir = await tmpDir(t);
  const f = path.join(dir, 'abc.txt');
  await fsp.writeFile(f, 'abc');
  const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.equal(sha256Hex(Buffer.from('abc')), abc);
  assert.equal(await sha256File(f), abc);
  const big = path.join(dir, 'big.bin');
  const bytes = Buffer.alloc(3 * 1024 * 1024 + 7, 0x5a);
  await fsp.writeFile(big, bytes);
  assert.equal(await sha256File(big), sha256Hex(bytes));
});

test('reads refuse symlinks and special files, and detect size changes', async (t) => {
  const dir = await tmpDir(t);
  const f = path.join(dir, 'f.txt');
  await fsp.writeFile(f, 'hello');
  await fsp.symlink(f, path.join(dir, 'link.txt'));
  await rejectsCode(sha256File(path.join(dir, 'link.txt')), 'E_SYMLINK');
  await rejectsCode(readFileExact(path.join(dir, 'link.txt'), 5), 'E_SYMLINK');
  await rejectsCode(readPrefix(dir, 4), 'E_SYMLINK', /not a regular file/);
  assert.equal((await readFileExact(f, 5)).toString(), 'hello');
  await rejectsCode(readFileExact(f, 4), 'E_VERIFY', /changed/);
  await rejectsCode(readFileExact(f, 6), 'E_VERIFY', /changed/);
  assert.equal((await readPrefix(f, 3)).toString(), 'hel');
  assert.equal((await readPrefix(f, 99)).toString(), 'hello');
});

test('writeFileAtomic falls back to copying the backup where hard links are unsupported', async (t) => {
  const dir = await tmpDir(t);
  const f = path.join(dir, 'a.bin');
  await fsp.writeFile(f, 'old');
  /** @type {typeof import('node:fs/promises')} */
  const noLinks = { ...fsp, link: async () => { throw Object.assign(new Error('no links here'), { code: 'EPERM' }); } };
  await writeFileAtomic(f, Buffer.from('new'), { fs: noLinks });
  assert.equal(await fsp.readFile(f, 'utf8'), 'new');
  assert.deepEqual(await fsp.readdir(dir), ['a.bin']);
  /** @type {typeof import('node:fs/promises')} */
  const failingRename = { ...noLinks, rename: async () => { throw new Error('rename failed'); } };
  await assert.rejects(writeFileAtomic(f, Buffer.from('newer'), { fs: failingRename }), /rename failed/);
  assert.equal(await fsp.readFile(f, 'utf8'), 'new');
  assert.deepEqual(await fsp.readdir(dir), ['a.bin']);
});
