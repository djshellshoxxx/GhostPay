// @ts-check
// Crash- and failure-safe file and directory replacement. Every write goes to a temporary sibling, is fsynced, and
// is renamed into place; on failure previously existing targets are restored byte-identical and temporaries removed.
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ERROR_CODES, KitError } from '../errors.mjs';

/** @typedef {typeof import('node:fs/promises')} Fs */

/**
 * Hidden sibling path for a temporary or backup file.
 * @param {string} target absolute
 * @param {string} kind
 * @returns {string}
 */
function siblingName(target, kind) {
  const base = Array.from(path.basename(target)).slice(0, 64).join('');
  return path.join(path.dirname(target), `.${base}.${kind}-${randomBytes(8).toString('hex')}`);
}

/**
 * @param {unknown} e
 * @returns {string | undefined}
 */
function errCode(e) {
  return /** @type {NodeJS.ErrnoException} */ (e)?.code;
}

/**
 * Remove a path, ignoring "already gone". Other failures are swallowed too: cleanup is best effort and must not
 * mask the original error (a leftover would be a hidden `.<name>.tmp-*` / `.bak-*` sibling).
 * @param {Fs} fs
 * @param {string} p
 */
async function removeQuietly(fs, p) {
  try {
    await fs.rm(p, { force: true, recursive: true });
  } catch {
    // best effort
  }
}

/**
 * Create `file` exclusively, write all bytes, fsync, close.
 * @param {Fs} fs
 * @param {string} file
 * @param {Uint8Array} bytes
 */
async function writeSynced(fs, file, bytes) {
  const fh = await fs.open(file, 'wx', 0o644);
  try {
    await fh.writeFile(bytes);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/**
 * fsync a directory so a rename survives power loss. Best effort: some platforms cannot open/fsync directories.
 * @param {Fs} fs
 * @param {string} dir
 */
async function syncDir(fs, dir) {
  try {
    const fh = await fs.open(dir, 'r');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
  } catch {
    // best effort (e.g. Windows, some network filesystems)
  }
}

/**
 * Preserve an existing target under a backup name without moving it (hard link; copy where links are unsupported).
 * @param {Fs} fs
 * @param {string} target
 * @returns {Promise<string | null>} backup path, or null when the target does not exist
 */
async function backup(fs, target) {
  let st;
  try {
    st = await fs.lstat(target);
  } catch (e) {
    if (errCode(e) === 'ENOENT') return null;
    throw e;
  }
  if (!st.isFile() && !st.isSymbolicLink()) throw new KitError(ERROR_CODES.USAGE, `refusing to replace a non-file: ${target}`, { path: target });
  const bak = siblingName(target, 'bak');
  try {
    await fs.link(target, bak);
  } catch (e) {
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EMLINK', 'ENOSYS'].includes(errCode(e) ?? '')) throw e;
    try {
      await fs.copyFile(target, bak, 1 /* COPYFILE_EXCL */);
    } catch (copyErr) {
      await removeQuietly(fs, bak);
      throw copyErr;
    }
  }
  return bak;
}

/**
 * @typedef {object} Staged
 * @property {string} target
 * @property {string} tmp
 * @property {string | null} bak
 * @property {boolean} replaced
 */

/**
 * Undo renamed targets in reverse order: restore backups (atomic rename) or remove targets that did not exist.
 * @param {Fs} fs
 * @param {Staged[]} staged
 */
async function rollback(fs, staged) {
  for (const s of [...staged].reverse()) {
    if (!s.replaced) continue;
    try {
      if (s.bak !== null) {
        await fs.rename(s.bak, s.target);
        s.bak = null;
      } else {
        await fs.unlink(s.target);
      }
    } catch {
      // a second failure while rolling back cannot be repaired here; the backup (if any) is left in place
    }
  }
}

/**
 * Write several files so that either all are replaced or (on failure) every previously existing target is left
 * byte-identical and no temporary or backup file remains. Targets are renamed in the given order.
 * @param {{ target: string, bytes: Uint8Array }[]} files
 * @param {{ fs?: Fs }} [opts]
 */
export async function commitFilesAtomic(files, opts = {}) {
  const fs = opts.fs ?? fsp;
  /** @type {Staged[]} */
  const staged = [];
  try {
    for (const f of files) {
      const target = path.resolve(f.target);
      const s = { target, tmp: siblingName(target, 'tmp'), bak: /** @type {string | null} */ (null), replaced: false };
      staged.push(s);
      await writeSynced(fs, s.tmp, f.bytes);
    }
    for (const s of staged) s.bak = await backup(fs, s.target);
    for (const s of staged) {
      await fs.rename(s.tmp, s.target);
      s.replaced = true;
    }
  } catch (e) {
    await rollback(fs, staged);
    for (const s of staged) {
      await removeQuietly(fs, s.tmp);
      if (s.bak !== null) await removeQuietly(fs, s.bak);
    }
    throw e;
  }
  for (const s of staged) if (s.bak !== null) await removeQuietly(fs, s.bak);
  for (const dir of new Set(staged.map((s) => path.dirname(s.target)))) await syncDir(fs, dir);
}

/**
 * Atomically replace one file: temp in the same directory + fsync + rename; the old file is intact on failure.
 * @param {string} target
 * @param {Uint8Array} bytes
 * @param {{ fs?: Fs }} [opts]
 */
export async function writeFileAtomic(target, bytes, opts = {}) {
  await commitFilesAtomic([{ target, bytes }], opts);
}

/**
 * Build a directory in a temporary sibling, then swap it into place. On failure the previous directory (if any) is
 * restored and the temporary removed. POSIX cannot rename over a non-empty directory, so the old directory is moved
 * aside first: between the two renames `targetDir` briefly does not exist (a crash there leaves the old copy under
 * a hidden `.<name>.old-*` sibling).
 * @param {string} targetDir
 * @param {(tmpDir: string) => Promise<void>} build
 * @param {{ fs?: Fs }} [opts]
 */
export async function replaceDirAtomic(targetDir, build, opts = {}) {
  const fs = opts.fs ?? fsp;
  const target = path.resolve(targetDir);
  const parent = path.dirname(target);
  const base = Array.from(path.basename(target)).slice(0, 64).join('');
  const tmp = await fs.mkdtemp(path.join(parent, `.${base}.tmp-`));
  /** @type {string | null} */
  let old = null;
  let swapped = false;
  try {
    await build(tmp);
    old = await moveAsideExistingDir(fs, target);
    await fs.rename(tmp, target);
    swapped = true;
  } catch (e) {
    if (!swapped && old !== null) {
      try {
        await fs.rename(old, target);
        old = null;
      } catch {
        // cannot restore; the old copy stays under its hidden name
      }
    }
    await removeQuietly(fs, tmp);
    throw e;
  }
  if (old !== null) await removeQuietly(fs, old);
  await syncDir(fs, parent);
}

/**
 * @param {Fs} fs
 * @param {string} target
 * @returns {Promise<string | null>}
 */
async function moveAsideExistingDir(fs, target) {
  let st;
  try {
    st = await fs.lstat(target);
  } catch (e) {
    if (errCode(e) === 'ENOENT') return null;
    throw e;
  }
  if (!st.isDirectory()) throw new KitError(ERROR_CODES.USAGE, `refusing to replace a non-directory: ${target}`, { path: target });
  const old = siblingName(target, 'old');
  await fs.rename(target, old);
  return old;
}
