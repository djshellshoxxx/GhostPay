// One private snapshot is the commit authority. outbox.jsonl is a replaceable view.
// Local POSIX filesystems only: directory fsync and atomic same-directory rename are required.
import { randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MAX_BYTES = 16 * 1024 * 1024;
export function assertPrivateParent(path) {
  const parent = dirname(resolve(path));
  const st = lstatSync(parent);
  if (!st.isDirectory() || (st.mode & 0o077) !== 0 || st.uid !== process.getuid?.()) throw new Error('files require an owner-only private directory');
}
function inspect(st) {
  if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) !== 0 || st.uid !== process.getuid?.()) throw new Error('expected an owner-only regular file with one link');
}
export function readPrivate(path, max = MAX_BYTES) {
  assertPrivateParent(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    inspect(fstatSync(fd));
    const chunks = [];
    let size = 0;
    for (;;) {
      const buf = Buffer.alloc(Math.min(64 * 1024, max + 1 - size));
      const n = readSync(fd, buf);
      if (!n) break;
      size += n;
      if (size > max) throw new Error('file exceeds size limit');
      chunks.push(buf.subarray(0, n));
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally { closeSync(fd); }
}
export function checkTarget(path) {
  assertPrivateParent(path);
  try { inspect(lstatSync(path)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
function syncDirectory(path) {
  const fd = openSync(dirname(resolve(path)), constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function writeAtomic(path, text) {
  checkTarget(path);
  const bytes = Buffer.from(text);
  if (bytes.length > MAX_BYTES) throw new Error('snapshot exceeds size limit; archive before continuing');
  const tmp = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  let fd;
  try {
    fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const n = writeSync(fd, bytes, offset, bytes.length - offset);
      if (n <= 0) throw new Error('incomplete write');
      offset += n;
    }
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(tmp, path);
    syncDirectory(path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function withLock(path, fn) {
  assertPrivateParent(path);
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch { throw new Error('state is locked; establish that its owner is stopped before manually removing the lock'); }
  try {
    const body = Buffer.from(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
    let offset = 0;
    while (offset < body.length) offset += writeSync(fd, body, offset, body.length - offset);
    fsyncSync(fd); syncDirectory(lock);
    return await fn();
  } finally { closeSync(fd); unlinkSync(lock); syncDirectory(lock); }
}
