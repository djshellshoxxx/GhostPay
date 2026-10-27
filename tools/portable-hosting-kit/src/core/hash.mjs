// @ts-check
// Hashing and exact, symlink-refusing file reads.
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fsp from 'node:fs/promises';
import { ERROR_CODES, KitError } from '../errors.mjs';

/** @typedef {typeof import('node:fs/promises')} Fs */

const CHUNK = 1024 * 1024;
// O_NOFOLLOW refuses a symlink in the final path component (POSIX). O_NONBLOCK keeps a FIFO swapped in after the
// inventory from blocking open(); it has no effect on regular files. Neither exists on Windows.
const OPEN_READ_NOFOLLOW = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

/**
 * @param {Uint8Array} bytes
 * @returns {string} lowercase hex SHA-256
 */
export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Stream-hash a regular file (refuses a symlink as the final component).
 * @param {string} absPath
 * @param {{ fs?: Fs }} [opts]
 * @returns {Promise<string>}
 */
export async function sha256File(absPath, opts = {}) {
  const fs = opts.fs ?? fsp;
  const fh = await openRegular(fs, absPath);
  try {
    const hash = createHash('sha256');
    const buf = Buffer.alloc(CHUNK);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      hash.update(buf.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    await fh.close();
  }
}

/**
 * Open a path read-only without following a final symlink and require a regular file.
 * @param {Fs} fs
 * @param {string} absPath
 * @returns {Promise<import('node:fs/promises').FileHandle>}
 */
async function openRegular(fs, absPath) {
  let fh;
  try {
    fh = await fs.open(absPath, OPEN_READ_NOFOLLOW);
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code === 'ELOOP' || code === 'EMLINK') throw new KitError(ERROR_CODES.SYMLINK, `refusing to follow symlink: ${absPath}`, { path: absPath });
    throw e;
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new KitError(ERROR_CODES.SYMLINK, `not a regular file: ${absPath}`, { path: absPath });
    return fh;
  } catch (e) {
    await fh.close();
    throw e;
  }
}

/**
 * Read a regular file whose size must equal `expectedSize` (as inventoried). Reads exactly once into one buffer and
 * confirms end-of-file, so the returned bytes are exactly what the file contained while it was open.
 * @param {string} absPath
 * @param {number} expectedSize
 * @param {{ fs?: Fs }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function readFileExact(absPath, expectedSize, opts = {}) {
  const fs = opts.fs ?? fsp;
  const fh = await openRegular(fs, absPath);
  try {
    const st = await fh.stat();
    if (st.size !== expectedSize) throw changed(absPath, expectedSize, st.size);
    const buf = Buffer.alloc(expectedSize);
    let off = 0;
    while (off < expectedSize) {
      const { bytesRead } = await fh.read(buf, off, expectedSize - off, off);
      if (bytesRead === 0) throw changed(absPath, expectedSize, off);
      off += bytesRead;
    }
    const probe = Buffer.alloc(1);
    const { bytesRead: extra } = await fh.read(probe, 0, 1, expectedSize);
    if (extra !== 0) throw changed(absPath, expectedSize, expectedSize + extra);
    return buf;
  } finally {
    await fh.close();
  }
}

/**
 * Read at most `n` leading bytes of a regular file (refuses symlinks).
 * @param {string} absPath
 * @param {number} n
 * @param {{ fs?: Fs }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function readPrefix(absPath, n, opts = {}) {
  const fs = opts.fs ?? fsp;
  const fh = await openRegular(fs, absPath);
  try {
    const buf = Buffer.alloc(n);
    let off = 0;
    while (off < n) {
      const { bytesRead } = await fh.read(buf, off, n - off, off);
      if (bytesRead === 0) break;
      off += bytesRead;
    }
    return buf.subarray(0, off);
  } finally {
    await fh.close();
  }
}

/**
 * @param {string} absPath
 * @param {number} expected
 * @param {number} actual
 * @returns {KitError}
 */
function changed(absPath, expected, actual) {
  return new KitError(ERROR_CODES.VERIFY, `file changed since it was inventoried (size ${expected} -> ${actual}): ${absPath}`, { path: absPath, expected, actual });
}
