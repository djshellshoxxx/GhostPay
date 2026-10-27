// @ts-check
// Bounded inventory of an input directory. Never follows symlinks (lstat only); global bounds abort immediately.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ERROR_CODES, KitError } from '../errors.mjs';
import { collisionKey, compareUtf8, pathRuleCode, validateRelativePath } from './paths.mjs';

/** @typedef {typeof import('node:fs/promises')} Fs */
/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {import('../types.mjs').InventoryEntry} InventoryEntry */
/** @typedef {import('../types.mjs').Finding} Finding */

/**
 * @param {import('../errors.mjs').ErrorCode} code
 * @param {string} rule
 * @param {string} message
 * @param {string} relPath
 * @returns {Finding}
 */
export function errorFinding(code, rule, message, relPath) {
  return { code, rule, severity: 'error', message, path: relPath };
}

/**
 * Counts every visited directory entry and aborts as soon as the bound is exceeded.
 */
class Budget {
  /** @param {Limits} limits */
  constructor(limits) {
    this.limits = limits;
    this.entries = 0;
    this.files = 0;
    this.bytes = 0;
  }

  visit() {
    if (++this.entries > this.limits.maxDirEntries) {
      throw new KitError(ERROR_CODES.LIMIT, `more than ${this.limits.maxDirEntries} directory entries`, { limit: 'maxDirEntries' });
    }
  }

  file() {
    if (++this.files > this.limits.maxFiles) {
      throw new KitError(ERROR_CODES.LIMIT, `more than ${this.limits.maxFiles} files`, { limit: 'maxFiles' });
    }
  }

  /** @param {number} size */
  addBytes(size) {
    this.bytes += size;
    if (this.bytes > this.limits.maxTotalBytes) {
      throw new KitError(ERROR_CODES.LIMIT, `total size exceeds ${this.limits.maxTotalBytes} bytes`, { limit: 'maxTotalBytes' });
    }
  }
}

/**
 * List a directory's names, charging each against the budget while iterating (a huge hostile directory is not
 * read in full before the bound triggers).
 * @param {Fs} fs
 * @param {string} dirAbs
 * @param {Budget} budget
 * @returns {Promise<string[]>}
 */
async function listDir(fs, dirAbs, budget) {
  const dir = await fs.opendir(dirAbs);
  /** @type {string[]} */
  const names = [];
  try {
    for (let d = await dir.read(); d !== null; d = await dir.read()) {
      budget.visit();
      names.push(d.name);
    }
  } finally {
    await dir.close();
  }
  return names.sort(compareUtf8);
}

/**
 * Error findings for siblings whose names collide on case-insensitive or normalizing hosts.
 * @param {string[]} names
 * @param {string} relDir
 * @returns {Finding[]}
 */
function siblingCollisions(names, relDir) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const n of names) {
    const k = collisionKey(n);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  /** @type {Finding[]} */
  const out = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const n of group) {
      const rel = relDir ? `${relDir}/${n}` : n;
      out.push(errorFinding(ERROR_CODES.COLLISION, 'case-or-unicode-collision', `"${rel}" collides with ${group.filter((x) => x !== n).map((x) => JSON.stringify(x)).join(', ')} on case-insensitive or Unicode-normalizing hosts`, rel));
    }
  }
  return out;
}

/**
 * Walk `siteDir` (resolved once with realpath; the input may itself be given via a symlink) without following
 * symlinks. Returns accepted regular files sorted by UTF-8 path, and findings for everything rejected.
 * Global bounds (maxDirEntries, maxFiles, maxTotalBytes) throw KitError(E_LIMIT) as soon as they are exceeded.
 * Files larger than maxFileBytes are findings and do not count towards maxTotalBytes (they are never read).
 * @param {string} siteDir
 * @param {{ limits: Limits, fs?: Fs }} opts
 * @returns {Promise<{ root: string, files: InventoryEntry[], findings: Finding[] }>}
 */
export async function walkSite(siteDir, opts) {
  const fs = opts.fs ?? fsp;
  const { limits } = opts;
  const root = await fs.realpath(path.resolve(siteDir));
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory()) throw new KitError(ERROR_CODES.USAGE, `not a directory: ${siteDir}`, { path: siteDir });
  const budget = new Budget(limits);
  /** @type {InventoryEntry[]} */
  const files = [];
  /** @type {Finding[]} */
  const findings = [];
  /** @type {{ abs: string, rel: string }[]} */
  const stack = [{ abs: root, rel: '' }];
  while (stack.length > 0) {
    const dir = /** @type {{ abs: string, rel: string }} */ (stack.pop());
    const names = await listDir(fs, dir.abs, budget);
    findings.push(...siblingCollisions(names, dir.rel));
    /** @type {{ abs: string, rel: string }[]} */
    const subdirs = [];
    for (const name of names) {
      const rel = dir.rel ? `${dir.rel}/${name}` : name;
      const abs = path.join(dir.abs, name);
      const { kind, size } = await classify(fs, abs, rel, findings);
      if (kind === 'dir') {
        const check = validateRelativePath(rel, limits);
        if (!check.ok) findings.push(errorFinding(pathRuleCode(check.rule), check.rule, `directory: ${check.reason}`, rel));
        else if (rel.split('/').length >= limits.maxDepth) findings.push(errorFinding(ERROR_CODES.LIMIT, 'too-deep', `directory at depth ${limits.maxDepth} cannot contain valid files; not descended`, rel));
        else subdirs.push({ abs, rel });
      } else if (kind === 'file') {
        budget.file();
        const entry = acceptFile(abs, rel, size, limits, budget, findings);
        if (entry) files.push(entry);
      }
    }
    for (let i = subdirs.length - 1; i >= 0; i--) stack.push(/** @type {{ abs: string, rel: string }} */ (subdirs[i]));
  }
  files.sort((a, b) => compareUtf8(a.path, b.path));
  return { root, files, findings };
}

const REJECTED = Object.freeze({ kind: /** @type {const} */ ('rejected'), size: 0 });

/**
 * lstat one entry; records findings for symlinks, special files, undecodable names and vanished entries.
 * @param {Fs} fs
 * @param {string} abs
 * @param {string} rel
 * @param {Finding[]} findings
 * @returns {Promise<{ kind: 'dir' | 'file' | 'rejected', size: number }>}
 */
async function classify(fs, abs, rel, findings) {
  if (rel.includes('\ufffd')) {
    // The name was not valid UTF-8; the decoded string may not even name this entry, so do not touch it.
    findings.push(errorFinding(ERROR_CODES.PATH, 'replacement-char', 'name is not valid UTF-8 (decoded with U+FFFD)', rel));
    return REJECTED;
  }
  let st;
  try {
    st = await fs.lstat(abs);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e;
    findings.push(errorFinding(ERROR_CODES.IO, 'vanished', 'entry disappeared during the walk', rel));
    return REJECTED;
  }
  if (st.isSymbolicLink()) {
    findings.push(errorFinding(ERROR_CODES.SYMLINK, 'symlink', 'symbolic link (never followed or packaged)', rel));
    return REJECTED;
  }
  if (st.isDirectory()) return { kind: 'dir', size: 0 };
  if (st.isFile()) return { kind: 'file', size: st.size };
  findings.push(errorFinding(ERROR_CODES.SYMLINK, 'special-file', 'special file (fifo, socket or device)', rel));
  return REJECTED;
}

/**
 * Path rules and per-file size bound for a regular file.
 * @param {string} abs
 * @param {string} rel
 * @param {number} size
 * @param {Limits} limits
 * @param {Budget} budget
 * @param {Finding[]} findings
 * @returns {InventoryEntry | null}
 */
function acceptFile(abs, rel, size, limits, budget, findings) {
  const check = validateRelativePath(rel, limits);
  if (!check.ok) {
    findings.push(errorFinding(pathRuleCode(check.rule), check.rule, check.reason, rel));
    return null;
  }
  if (size > limits.maxFileBytes) {
    findings.push(errorFinding(ERROR_CODES.LIMIT, 'file-too-large', `file exceeds ${limits.maxFileBytes} bytes`, rel));
    return null;
  }
  budget.addBytes(size);
  return { path: rel, size, absPath: abs };
}
