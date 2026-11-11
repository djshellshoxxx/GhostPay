// @ts-check
// Generic static export: byte-identical copies of every servable file under `<outDir>/www/<basePath>/`, so any
// static server (and the nginx profile's `root`) maps request paths to files without alias rules. `_headers` and
// hidden paths (except .well-known) are not exported at all, so no server can serve them.

import * as nodeFs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { KitError, ERROR_CODES } from '../errors.mjs';
import { assertServableHeaders } from '../serve/headers.mjs';
import { checkBasePath, createRouter, isServableRelPath, servableFiles } from '../serve/routing.mjs';

/** @typedef {import('../types.mjs').HeaderPolicy} HeaderPolicy */
/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {Pick<typeof nodeFs, 'lstat' | 'open' | 'realpath' | 'mkdir' | 'writeFile' | 'rename' | 'rm' | 'utimes'>} ExportFs */

/**
 * @param {string} parent
 * @param {string} child
 * @returns {boolean} child is parent or below it
 */
function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * @param {ExportFs} fs
 * @param {string} p
 * @returns {Promise<string>} realpath of p, or of its nearest existing ancestor joined with the rest
 */
async function resolveExisting(fs, p) {
  const abs = path.resolve(p);
  try {
    return await fs.realpath(abs);
  } catch {
    const parent = path.dirname(abs);
    return parent === abs ? abs : path.join(await resolveExisting(fs, parent), path.basename(abs));
  }
}

/**
 * Read a regular file below root without following symlinks at any level.
 * @param {ExportFs} fs
 * @param {string} root realpath
 * @param {string} rel
 * @returns {Promise<{ data: Uint8Array, mtime: Date }>}
 */
async function readNoFollow(fs, root, rel) {
  const segs = rel.split('/');
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    cur = path.join(cur, /** @type {string} */ (segs[i]));
    const st = await fs.lstat(cur);
    if (!st.isDirectory()) throw new KitError(ERROR_CODES.SYMLINK, `${rel}: ${segs.slice(0, i + 1).join('/')} is not a plain directory`, { path: rel });
  }
  const abs = path.join(root, ...segs);
  if (!(await fs.lstat(abs)).isFile()) throw new KitError(ERROR_CODES.SYMLINK, `${rel} is not a regular file`, { path: rel });
  const handle = await fs.open(abs, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const st = await handle.stat();
    if (!st.isFile()) throw new KitError(ERROR_CODES.SYMLINK, `${rel} is not a regular file`, { path: rel });
    return { data: await handle.readFile(), mtime: st.mtime };
  } finally {
    await handle.close();
  }
}

/**
 * @param {unknown} overlayFiles
 * @param {Set<string>} existing
 * @returns {Array<{ path: string, data: Uint8Array }>}
 */
function checkOverlay(overlayFiles, existing) {
  if (overlayFiles === undefined) return [];
  if (!Array.isArray(overlayFiles)) throw new KitError(ERROR_CODES.USAGE, 'overlayFiles must be an array of { path, data }');
  return overlayFiles.map((o) => {
    const p = o?.path;
    if (typeof p !== 'string' || !(o.data instanceof Uint8Array)) throw new KitError(ERROR_CODES.USAGE, 'overlayFiles entries need { path: string, data: Uint8Array }');
    if (servableFiles([p]).length !== 1 || !isServableRelPath(p)) {
      throw new KitError(ERROR_CODES.POLICY, `overlay file ${p} would not be served (hidden or never-served name)`, { path: p });
    }
    if (existing.has(p)) throw new KitError(ERROR_CODES.COLLISION, `overlay file ${p} collides with a site file`, { path: p });
    existing.add(p);
    return { path: p, data: o.data };
  });
}

/**
 * Export the servable files. Refuses an existing `<outDir>/www` (stale files would be served by nginx but not by
 * the preview), an outDir inside the site or a site inside outDir, and header policies weaker than required.
 * Writes into a temporary sibling directory and renames it into place.
 * @param {{ siteDir: string, files: string[], entrypoint: string, hostConfig: HostConfig, policy: HeaderPolicy, outDir: string, overlayFiles?: Array<{ path: string, data: Uint8Array }>, fs?: ExportFs }} a
 * @returns {Promise<{ wwwRoot: string, files: string[] }>} files: site-relative paths written (site + overlay), sorted
 */
export async function exportStatic({ siteDir, files, entrypoint, hostConfig, policy, outDir, overlayFiles, fs = nodeFs }) {
  const basePath = checkBasePath(hostConfig.basePath);
  createRouter({ files, entrypoint, basePath });
  const servable = servableFiles(files);
  const overlay = checkOverlay(overlayFiles, new Set(servable));
  const written = [...servable, ...overlay.map((o) => o.path)].sort();
  assertServableHeaders(policy, written);

  let siteRoot;
  try {
    siteRoot = await fs.realpath(siteDir);
  } catch (e) {
    throw new KitError(ERROR_CODES.IO, `cannot open site directory ${siteDir}: ${/** @type {Error} */ (e).message}`);
  }
  const outReal = await resolveExisting(fs, outDir);
  if (within(siteRoot, outReal) || within(outReal, siteRoot)) {
    throw new KitError(ERROR_CODES.USAGE, `outDir ${outDir} and siteDir ${siteDir} must not contain each other`);
  }
  const wwwRoot = path.join(outReal, 'www');
  const exists = await fs.lstat(wwwRoot).then(() => true, () => false);
  if (exists) throw new KitError(ERROR_CODES.USAGE, `${wwwRoot} already exists; export into a fresh directory`);

  await fs.mkdir(outReal, { recursive: true });
  const tmp = path.join(outReal, `.www.tmp-${randomBytes(6).toString('hex')}`);
  const baseSegs = basePath.split('/').filter((s) => s !== '');
  try {
    await fs.mkdir(tmp, { mode: 0o755 });
    /** @param {string} rel @param {Uint8Array} data @param {Date | null} mtime */
    const put = async (rel, data, mtime) => {
      const dest = path.join(tmp, ...baseSegs, ...rel.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o755 });
      await fs.writeFile(dest, data, { flag: 'wx', mode: 0o644 });
      // Same mtime as the source, so nginx's ETag/Last-Modified equal the preview's (which reads the site).
      if (mtime) await fs.utimes(dest, mtime, mtime);
    };
    for (const rel of servable) {
      const { data, mtime } = await readNoFollow(fs, siteRoot, rel);
      await put(rel, data, mtime);
    }
    for (const o of overlay) await put(o.path, o.data, null);
    await fs.rename(tmp, wwwRoot);
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true });
    if (e instanceof KitError) throw e;
    throw new KitError(ERROR_CODES.IO, `export failed: ${/** @type {Error} */ (e).message}`);
  }
  return { wwwRoot, files: written };
}
