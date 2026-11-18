// @ts-check
// Verification of packaged archives and unpacked top directories, and verified extraction.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ERROR_CODES, KitError, isKitError } from '../errors.mjs';
import { DEFAULT_LIMITS } from '../policy.mjs';
import { createDirAtomic } from './atomic.mjs';
import { readFileExact, sha256Hex } from './hash.mjs';
import { readInventoried, walkSite } from './inventory.mjs';
import { MANIFEST_NAME, SITE_ROOT, SUMS_NAME, archiveTopDir, parseManifest } from './manifest.mjs';
import { compareUtf8, isInside, quote, validateRelativePath } from './paths.mjs';
import { policyFinding } from './validate.mjs';
import { readZip } from './zip.mjs';

/** @typedef {typeof import('node:fs/promises')} Fs */
/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {import('../types.mjs').Finding} Finding */
/** @typedef {import('../types.mjs').HostingManifest} HostingManifest */
/**
 * @typedef {object} VerifyResult
 * @property {boolean} ok
 * @property {HostingManifest | null} manifest
 * @property {string | null} contentDigest   the manifest's content digest (equal to the actual content when ok)
 * @property {string | null} archiveSha256   hex SHA-256 of the archive file (archives only)
 * @property {string[]} changed               paths relative to the top directory
 * @property {string[]} missing
 * @property {string[]} unexpected
 * @property {Finding[]} errors
 * @property {'not-established' | 'content-digest-matches-expected' | 'archive-sha256-matches-expected'} authenticity
 */
/** @typedef {{ expectedContentDigest?: string, expectedArchiveSha256?: string, limits?: Limits, fs?: Fs }} VerifyOptions */

/** Bounds for the top-level metadata files (manifest, SHA256SUMS, operator docs, licenses) beyond the site limits. */
export const METADATA_MAX_FILES = 256;
export const METADATA_MAX_BYTES = 64 * 1024 * 1024;
const HASH_LINE_RE = /^([0-9a-f]{64}) {2}(.+)$/;
const SHA_ARG_RE = /^(?:sha256:)?([0-9a-fA-F]{64})$/;

/**
 * Limits for whole archives / top directories, derived from the site limits: room for `<topDir>/site/` (two more
 * segments) and for the metadata files. Site files are then checked against the site limits themselves.
 * @param {Limits} l
 * @returns {Limits}
 */
export function containerLimits(l) {
  return {
    maxFiles: l.maxFiles + METADATA_MAX_FILES,
    maxTotalBytes: l.maxTotalBytes + METADATA_MAX_BYTES,
    maxFileBytes: Math.max(l.maxFileBytes, METADATA_MAX_BYTES),
    maxPathBytes: l.maxPathBytes + l.maxSegmentBytes + 1 + SITE_ROOT.length,
    maxSegmentBytes: l.maxSegmentBytes,
    maxDepth: l.maxDepth + 2,
    maxDirEntries: l.maxDirEntries + METADATA_MAX_FILES,
  };
}

/**
 * @param {import('../errors.mjs').ErrorCode} code
 * @param {string} rule
 * @param {string} message
 * @param {string} [p]
 * @returns {Finding}
 */
function err(code, rule, message, p) {
  return p === undefined ? { code, rule, severity: 'error', message } : { code, rule, severity: 'error', message, path: p };
}

/**
 * @param {string | undefined} v
 * @param {string} what
 * @returns {string | undefined} lowercase hex
 */
function normalizeSha(v, what) {
  if (v === undefined) return undefined;
  const m = SHA_ARG_RE.exec(v);
  if (!m) throw new KitError(ERROR_CODES.USAGE, `${what} must be 64 hex digits (optionally prefixed "sha256:")`);
  return /** @type {string} */ (m[1]).toLowerCase();
}

/**
 * Strict SHA256SUMS parser: "<64 lowercase hex>  <path>\n" lines, sorted by UTF-8 path, unique, never itself.
 * @param {Uint8Array} bytes
 * @param {Limits} limits container limits
 * @returns {Map<string, string>}
 */
export function parseSums(bytes, limits) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new KitError(ERROR_CODES.VERIFY, `${SUMS_NAME} is not valid UTF-8`);
  }
  if (!text.endsWith('\n')) throw new KitError(ERROR_CODES.VERIFY, `${SUMS_NAME} must end with a newline`);
  /** @type {Map<string, string>} */
  const out = new Map();
  let prev = null;
  for (const line of text.slice(0, -1).split('\n')) {
    const m = HASH_LINE_RE.exec(line);
    if (!m) throw new KitError(ERROR_CODES.VERIFY, `${SUMS_NAME} has a malformed line: ${quote(line.slice(0, 120))}`);
    const p = /** @type {string} */ (m[2]);
    const c = validateRelativePath(p, limits);
    if (!c.ok) throw new KitError(ERROR_CODES.VERIFY, `${SUMS_NAME} lists an unsafe path ${quote(p)}: ${c.reason}`);
    if (p === SUMS_NAME) throw new KitError(ERROR_CODES.VERIFY, `${SUMS_NAME} must not list itself`);
    if (prev !== null && compareUtf8(prev, p) >= 0) throw new KitError(ERROR_CODES.VERIFY, `${SUMS_NAME} must be sorted by UTF-8 path without duplicates`);
    out.set(p, /** @type {string} */ (m[1]));
    prev = p;
  }
  return out;
}

/**
 * Format SHA256SUMS for files given as path -> hex (the caller excludes SHA256SUMS itself).
 * @param {Map<string, string>} hashes
 * @returns {Uint8Array}
 */
export function formatSums(hashes) {
  const lines = [...hashes.keys()].sort(compareUtf8).map((p) => `${hashes.get(p)}  ${p}\n`);
  return new TextEncoder().encode(lines.join(''));
}

/**
 * @typedef {object} TreeInput
 * @property {Map<string, { sha256: string, size: number }>} files  every file, path relative to the top directory
 * @property {Uint8Array | undefined} manifestBytes
 * @property {Uint8Array | undefined} sumsBytes
 */

/**
 * Expected sha256/size per path from the manifest (site files and declared metadata files) and SHA256SUMS, with
 * consistency errors between the two. Falls back to SHA256SUMS alone when the manifest is missing or invalid.
 * @param {HostingManifest | null} manifest
 * @param {Map<string, string> | null} sums
 * @param {Finding[]} errors
 * @returns {Map<string, { sha256: string | null, size: number | null }>}
 */
function expectedFiles(manifest, sums, errors) {
  /** @type {Map<string, { sha256: string | null, size: number | null }>} */
  const expected = new Map([[MANIFEST_NAME, { sha256: null, size: null }]]);
  if (manifest) {
    for (const f of manifest.content.files) expected.set(`${SITE_ROOT}${f.path}`, { sha256: f.sha256, size: f.size });
    for (const m of manifest.metadataFiles) expected.set(m, { sha256: null, size: null });
  }
  if (!sums) return expected;
  for (const [p, h] of sums) {
    const e = expected.get(p);
    if (!manifest) expected.set(p, { sha256: h, size: null });
    else if (!e) errors.push(err(ERROR_CODES.VERIFY, 'sums-manifest-mismatch', `${SUMS_NAME} lists a file the manifest does not declare`, p));
    else if (e.sha256 === null) e.sha256 = h;
    else if (e.sha256 !== h) errors.push(err(ERROR_CODES.VERIFY, 'sums-manifest-mismatch', `${SUMS_NAME} and the manifest disagree on this file's hash`, p));
  }
  if (manifest) {
    for (const p of expected.keys()) if (!sums.has(p)) errors.push(err(ERROR_CODES.VERIFY, 'sums-manifest-mismatch', `${SUMS_NAME} does not list this declared file`, p));
  }
  return expected;
}

/**
 * Re-check manifest-declared site files against the caller's limits and the inclusion policy (a consistent but
 * forged manifest must still not smuggle a disallowed file).
 * @param {HostingManifest} manifest
 * @param {Limits} limits
 * @param {Finding[]} errors
 */
function checkDeclaredContent(manifest, limits, errors) {
  const c = manifest.content;
  if (c.fileCount > limits.maxFiles) errors.push(err(ERROR_CODES.LIMIT, 'too-many-files', `manifest declares ${c.fileCount} files, more than maxFiles ${limits.maxFiles}`));
  if (c.totalBytes > limits.maxTotalBytes) errors.push(err(ERROR_CODES.LIMIT, 'too-many-bytes', `manifest declares ${c.totalBytes} bytes, more than maxTotalBytes ${limits.maxTotalBytes}`));
  for (const f of c.files) {
    const pathCheck = validateRelativePath(f.path, limits);
    if (!pathCheck.ok) errors.push(err(ERROR_CODES.PATH, pathCheck.rule, pathCheck.reason, `${SITE_ROOT}${f.path}`));
    if (f.size > limits.maxFileBytes) errors.push(err(ERROR_CODES.LIMIT, 'file-too-large', `file exceeds maxFileBytes ${limits.maxFileBytes}`, `${SITE_ROOT}${f.path}`));
    const policy = policyFinding(f.path, manifest.policy.allowSourceMaps);
    if (policy) errors.push({ ...policy, path: `${SITE_ROOT}${f.path}` });
  }
}

/**
 * Core comparison shared by archive and directory verification.
 * @param {TreeInput} tree
 * @param {Limits} limits site limits
 * @param {string | undefined} expectedDigest normalized hex or undefined
 * @returns {VerifyResult}
 */
function verifyTree(tree, limits, expectedDigest) {
  /** @type {Finding[]} */
  const errors = [];
  /** @type {HostingManifest | null} */
  let manifest = null;
  if (tree.manifestBytes === undefined) errors.push(err(ERROR_CODES.VERIFY, 'manifest-missing', `${MANIFEST_NAME} is missing`, MANIFEST_NAME));
  else manifest = guard(() => parseManifest(/** @type {Uint8Array} */ (tree.manifestBytes)), errors, 'manifest-invalid', MANIFEST_NAME);
  /** @type {Map<string, string> | null} */
  let sums = null;
  if (tree.sumsBytes === undefined) errors.push(err(ERROR_CODES.VERIFY, 'sums-missing', `${SUMS_NAME} is missing`, SUMS_NAME));
  else sums = guard(() => parseSums(/** @type {Uint8Array} */ (tree.sumsBytes), containerLimits(limits)), errors, 'sums-invalid', SUMS_NAME);
  if (manifest) checkDeclaredContent(manifest, limits, errors);
  const expected = expectedFiles(manifest, sums, errors);
  const changed = [];
  const missing = tree.sumsBytes === undefined ? [SUMS_NAME] : [];
  for (const p of [...expected.keys()].sort(compareUtf8)) {
    const exp = /** @type {{ sha256: string | null, size: number | null }} */ (expected.get(p));
    const actual = tree.files.get(p);
    if (!actual) missing.push(p);
    else if ((exp.sha256 !== null && actual.sha256 !== exp.sha256) || (exp.size !== null && actual.size !== exp.size)) changed.push(p);
  }
  const unexpected = [...tree.files.keys()].filter((p) => p !== SUMS_NAME && !expected.has(p)).sort(compareUtf8);
  const contentDigest = manifest ? manifest.content.digest : null;
  if (expectedDigest !== undefined && contentDigest !== `sha256:${expectedDigest}`) {
    errors.push(err(ERROR_CODES.VERIFY, 'content-digest-mismatch', `content digest ${contentDigest ?? '(unknown)'} does not match the expected sha256:${expectedDigest}`));
  }
  missing.sort(compareUtf8);
  const ok = errors.length === 0 && changed.length === 0 && missing.length === 0 && unexpected.length === 0;
  return {
    ok, manifest, contentDigest, archiveSha256: null, changed, missing, unexpected, errors,
    authenticity: ok && expectedDigest !== undefined ? 'content-digest-matches-expected' : 'not-established',
  };
}

/**
 * Run a parser, turning a KitError into an error finding.
 * @template T
 * @param {() => T} fn
 * @param {Finding[]} errors
 * @param {string} rule
 * @param {string} p
 * @returns {T | null}
 */
function guard(fn, errors, rule, p) {
  try {
    return fn();
  } catch (e) {
    if (!isKitError(e)) throw e;
    errors.push(err(e.code, rule, e.message, p));
    return null;
  }
}

/**
 * @param {Finding[]} errors
 * @param {string | null} archiveSha256
 * @returns {VerifyResult}
 */
function failed(errors, archiveSha256) {
  return { ok: false, manifest: null, contentDigest: null, archiveSha256, changed: [], missing: [], unexpected: [], errors, authenticity: 'not-established' };
}

/**
 * Verify archive bytes held in memory. Also returns the parsed entries so callers (extraction) act on exactly the
 * bytes that were verified.
 * @param {Uint8Array} bytes
 * @param {VerifyOptions} [opts]
 * @returns {{ result: VerifyResult, topDir: string | null, entries: { name: string, data: Uint8Array }[] }}
 */
export function inspectArchiveBytes(bytes, opts = {}) {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const expectedArchive = normalizeSha(opts.expectedArchiveSha256, 'expectedArchiveSha256');
  const expectedDigest = normalizeSha(opts.expectedContentDigest, 'expectedContentDigest');
  const archiveSha256 = sha256Hex(bytes);
  /** @type {Finding[]} */
  const archiveErrors = [];
  if (expectedArchive !== undefined && expectedArchive !== archiveSha256) {
    archiveErrors.push(err(ERROR_CODES.VERIFY, 'archive-sha256-mismatch', `archive sha256 ${archiveSha256} does not match the expected ${expectedArchive}`));
  }
  let entries;
  try {
    entries = readZip(bytes, { limits: containerLimits(limits), singleTopDir: true }).entries;
  } catch (e) {
    if (!isKitError(e)) throw e;
    return { result: failed([...archiveErrors, err(e.code, 'archive-unreadable', e.message)], archiveSha256), topDir: null, entries: [] };
  }
  const first = entries[0];
  if (first === undefined) {
    return { result: failed([...archiveErrors, err(ERROR_CODES.ARCHIVE, 'archive-unreadable', 'archive: contains no files (only directory entries)')], archiveSha256), topDir: null, entries: [] };
  }
  const topDir = /** @type {string} */ (first.name.split('/')[0]);
  /** @type {TreeInput} */
  const tree = { files: new Map(), manifestBytes: undefined, sumsBytes: undefined };
  for (const e of entries) {
    const rel = e.name.slice(topDir.length + 1);
    tree.files.set(rel, { sha256: sha256Hex(e.data), size: e.data.length });
    if (rel === MANIFEST_NAME) tree.manifestBytes = e.data;
    if (rel === SUMS_NAME) tree.sumsBytes = e.data;
  }
  const result = verifyTree(tree, limits, expectedDigest);
  result.archiveSha256 = archiveSha256;
  if (result.manifest && topDir !== archiveTopDir(result.manifest.appId, result.manifest.provenance.label)) {
    archiveErrors.push(err(ERROR_CODES.VERIFY, 'top-dir-mismatch', `top-level directory ${quote(topDir)} is not "<appId>-<label>" from the manifest`));
  }
  result.errors.unshift(...archiveErrors);
  result.ok = result.ok && archiveErrors.length === 0;
  if (!result.ok) result.authenticity = 'not-established';
  else if (expectedArchive !== undefined) result.authenticity = 'archive-sha256-matches-expected';
  return { result, topDir, entries };
}

/**
 * Read an archive file with a size bound derived from the limits.
 * @param {string} archivePath
 * @param {Limits} limits
 * @param {Fs} fs
 * @returns {Promise<Buffer | Finding>}
 */
async function readArchiveFile(archivePath, limits, fs) {
  const real = await fs.realpath(archivePath);
  const st = await fs.stat(real);
  if (!st.isFile()) throw new KitError(ERROR_CODES.USAGE, `not a file: ${quote(archivePath)}`, { path: archivePath });
  const cl = containerLimits(limits);
  const maxBytes = cl.maxTotalBytes + cl.maxDirEntries * (30 + 46 + 2 * cl.maxPathBytes) + 22;
  if (st.size > maxBytes) return err(ERROR_CODES.LIMIT, 'archive-too-large', `archive is ${st.size} bytes, more than the ${maxBytes} the limits allow`);
  return readFileExact(real, st.size, { fs });
}

/**
 * Verify a packaged archive: safe ZIP parse, manifest + SHA256SUMS consistency, every file's hash, and optional
 * expected content digest / archive sha256 (the only way `authenticity` becomes established).
 * @param {string} archivePath
 * @param {VerifyOptions} [opts]
 * @returns {Promise<VerifyResult>}
 */
export async function verifyArchive(archivePath, opts = {}) {
  const bytes = await readArchiveFile(archivePath, opts.limits ?? DEFAULT_LIMITS, opts.fs ?? fsp);
  if (!(bytes instanceof Uint8Array)) return failed([bytes], null);
  return inspectArchiveBytes(bytes, opts).result;
}

/**
 * Verify an unpacked top directory (`<topDir>/`). Symlinks and special files anywhere are errors.
 * @param {string} topDirPath
 * @param {{ expectedContentDigest?: string, limits?: Limits, fs?: Fs }} [opts]
 * @returns {Promise<VerifyResult>}
 */
export async function verifyDirectory(topDirPath, opts = {}) {
  const fs = opts.fs ?? fsp;
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const expectedDigest = normalizeSha(opts.expectedContentDigest, 'expectedContentDigest');
  let walk;
  try {
    walk = await walkSite(topDirPath, { limits: containerLimits(limits), fs });
  } catch (e) {
    if (!isKitError(e) || e.code !== ERROR_CODES.LIMIT) throw e;
    return failed([err(e.code, 'directory-too-large', e.message)], null);
  }
  /** @type {Finding[]} */
  const walkErrors = walk.findings.filter((f) => f.severity === 'error');
  /** @type {TreeInput} */
  const tree = { files: new Map(), manifestBytes: undefined, sumsBytes: undefined };
  for (const f of walk.files) {
    let data;
    try {
      data = await readInventoried(f, { fs });
    } catch (e) {
      if (!isKitError(e)) throw e;
      walkErrors.push(err(e.code, 'changed-during-verification', e.message, f.path));
      continue;
    }
    tree.files.set(f.path, { sha256: sha256Hex(data), size: data.length });
    if (f.path === MANIFEST_NAME) tree.manifestBytes = data;
    if (f.path === SUMS_NAME) tree.sumsBytes = data;
  }
  const result = verifyTree(tree, limits, expectedDigest);
  result.errors.unshift(...walkErrors);
  result.ok = result.ok && walkErrors.length === 0;
  if (!result.ok) result.authenticity = 'not-established';
  return result;
}

/**
 * Verify an archive, then extract exactly the verified bytes into `<destDir>/<topDir>` via createDirAtomic (the
 * extracted tree is re-verified before it is moved into place). Refuses with KitError E_VERIFY (details.result)
 * unless verification is ok, and with E_USAGE when `<destDir>/<topDir>` already exists: the name comes from the
 * (possibly hostile) archive, so an existing directory, file or symlink there is never replaced or deleted.
 * @param {string} archivePath
 * @param {string} destDir parent directory; created if missing
 * @param {{ limits?: Limits, expectedContentDigest?: string, expectedArchiveSha256?: string, fs?: Fs }} [opts]
 * @returns {Promise<{ topDir: string, result: VerifyResult }>} topDir is the absolute path of the extracted directory
 */
export async function extractArchive(archivePath, destDir, opts = {}) {
  const fs = opts.fs ?? fsp;
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const bytes = await readArchiveFile(archivePath, limits, fs);
  if (!(bytes instanceof Uint8Array)) throw new KitError(ERROR_CODES.VERIFY, `refusing to extract: ${bytes.message}`, { result: failed([bytes], null) });
  const { result, topDir, entries } = inspectArchiveBytes(bytes, opts);
  if (!result.ok || topDir === null) throw new KitError(ERROR_CODES.VERIFY, 'refusing to extract: archive failed verification', { result });
  await fs.mkdir(destDir, { recursive: true });
  const target = path.join(await fs.realpath(destDir), topDir);
  await createDirAtomic(target, async (tmp) => {
    for (const e of entries) {
      const out = path.join(tmp, ...e.name.slice(topDir.length + 1).split('/'));
      if (!isInside(tmp, out)) throw new KitError(ERROR_CODES.PATH, `entry escapes the destination: ${quote(e.name)}`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, e.data, { flag: 'wx', mode: 0o644 });
    }
    const check = await verifyDirectory(tmp, { limits, expectedContentDigest: result.contentDigest ?? undefined, fs });
    if (!check.ok) throw new KitError(ERROR_CODES.VERIFY, 'extracted tree failed re-verification', { result: check });
  }, { fs });
  return { topDir: target, result };
}
