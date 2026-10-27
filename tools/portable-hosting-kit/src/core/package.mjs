// @ts-check
// Packaging: turn a clean ValidationReport into a deterministic, self-verified archive plus `.sha256` sidecar.
// The input directory is only read (once per file, without following symlinks); output is committed atomically.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ERROR_CODES, KitError } from '../errors.mjs';
import { commitFilesAtomic } from './atomic.mjs';
import { readFileExact, sha256Hex } from './hash.mjs';
import { APP_ID_RE, MANIFEST_NAME, SITE_ROOT, SUMS_NAME, archiveTopDir, buildManifest, serializeManifest } from './manifest.mjs';
import { collisionKey, isInside, validateRelativePath } from './paths.mjs';
import { policyFinding } from './validate.mjs';
import { METADATA_MAX_BYTES, METADATA_MAX_FILES, formatSums, inspectArchiveBytes } from './verify.mjs';
import { createZip } from './zip.mjs';

/** @typedef {typeof import('node:fs/promises')} Fs */
/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {import('../types.mjs').ValidationReport} ValidationReport */
/** @typedef {import('../types.mjs').Provenance} Provenance */
/** @typedef {import('../types.mjs').FileRecord} FileRecord */
/** @typedef {import('../types.mjs').HostingManifest} HostingManifest */

// eslint-disable-next-line no-control-regex
const UNSAFE_BASENAME_RE = /[\u0000-\u001f\u007f\\]/;

/**
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {never}
 */
function usage(message, details) {
  throw new KitError(ERROR_CODES.USAGE, message, details);
}

/**
 * Refuse a report with errors and re-check what packaging relies on (the report may be caller-constructed):
 * valid paths under siteDir, inclusion policy, and the limits.
 * @param {ValidationReport} report
 * @param {Limits} limits
 * @param {boolean} allowSourceMaps
 */
function checkReport(report, limits, allowSourceMaps) {
  if (!report.ok || report.findings.some((f) => f.severity === 'error')) {
    throw new KitError(ERROR_CODES.POLICY, 'refusing to package: the validation report has errors', { findings: report.findings.filter((f) => f.severity === 'error') });
  }
  if (report.entries.length > limits.maxFiles) throw new KitError(ERROR_CODES.LIMIT, `more than ${limits.maxFiles} files`);
  let total = 0;
  for (const e of report.entries) {
    const c = validateRelativePath(e.path, limits);
    if (!c.ok) usage(`report entry "${e.path}" has an invalid path: ${c.reason}`);
    if (e.absPath !== path.join(report.siteDir, ...e.path.split('/'))) usage(`report entry "${e.path}" does not lie at its path under siteDir`);
    const p = policyFinding(e.path, allowSourceMaps);
    if (p) throw new KitError(p.code, `refusing to package "${e.path}": ${p.message}`, { finding: p });
    if (e.size > limits.maxFileBytes) throw new KitError(ERROR_CODES.LIMIT, `"${e.path}" exceeds maxFileBytes`);
    total += e.size;
  }
  if (total > limits.maxTotalBytes) throw new KitError(ERROR_CODES.LIMIT, `total size exceeds maxTotalBytes ${limits.maxTotalBytes}`);
}

/**
 * `<appId>-<label>` with the label sanitized to [A-Za-z0-9._-]; must be one valid path segment.
 * @param {string} appId
 * @param {string} label
 * @param {Limits} limits
 * @returns {string}
 */
export function topDirName(appId, label, limits) {
  if (typeof appId !== 'string' || !APP_ID_RE.test(appId)) usage('appId must match [a-z0-9][a-z0-9._-]{0,79}');
  if (typeof label !== 'string' || label === '') usage('provenance.label must be a non-empty string');
  const top = archiveTopDir(appId, label);
  const c = validateRelativePath(top, limits);
  if (!c.ok) usage(`archive top directory "${top}" is not a valid path segment: ${c.reason}`);
  if (collisionKey(top) === 'site') usage('archive top directory must not be "site"');
  return top;
}

/**
 * Resolve the output path through the real parent directory and refuse anything inside (or equal to) siteDir.
 * @param {Fs} fs
 * @param {string} outFile
 * @param {string} siteDir
 * @returns {Promise<string>}
 */
async function resolveOutFile(fs, outFile, siteDir) {
  if (typeof outFile !== 'string' || outFile === '') usage('outFile is required');
  const abs = path.resolve(outFile);
  const base = path.basename(abs);
  if (base === '' || UNSAFE_BASENAME_RE.test(base)) usage('outFile name must not contain control characters or backslashes');
  let parent;
  try {
    parent = await fs.realpath(path.dirname(abs));
  } catch (e) {
    usage(`output directory does not exist: ${path.dirname(abs)}`, { cause: String(e) });
  }
  const target = path.join(parent, base);
  const site = await fs.realpath(siteDir);
  if (target === site || isInside(site, target)) usage(`refusing to write the archive inside the site directory: ${target}`);
  return target;
}

/**
 * Extra top-level files (operator docs, privacy inventory, licenses) must not shadow site content or the
 * kit-generated metadata files.
 * @param {{ name: string, data: Uint8Array }[]} extras
 * @param {Limits} limits
 */
function checkExtraFiles(extras, limits) {
  if (extras.length > METADATA_MAX_FILES - 2) usage(`at most ${METADATA_MAX_FILES - 2} extra files`);
  const reserved = new Set([collisionKey(SUMS_NAME), collisionKey(MANIFEST_NAME), 'site']);
  let bytes = 0;
  for (const x of extras) {
    const c = validateRelativePath(x.name, limits);
    if (!c.ok) usage(`extra file name "${x.name}" is invalid: ${c.reason}`);
    if (!(x.data instanceof Uint8Array)) usage(`extra file "${x.name}" data must be a Uint8Array`);
    if (reserved.has(collisionKey(x.name).split('/')[0] ?? '')) usage(`extra file "${x.name}" would land under ${SITE_ROOT} or replace ${SUMS_NAME}/${MANIFEST_NAME}`);
    bytes += x.data.length;
  }
  if (bytes > METADATA_MAX_BYTES / 2) usage(`extra files exceed ${METADATA_MAX_BYTES / 2} bytes`);
}

/**
 * Package a validated site. Reads each file exactly once, hashes and stores those bytes, and rechecks each size
 * against the inventory. The archive is verified in memory before it and its sidecar are committed atomically.
 * @param {{ report: ValidationReport, outFile: string, appId: string, provenance: Provenance,
 *   extraFiles?: { name: string, data: Uint8Array }[], compression?: 'deflate' | 'store', limits: Limits,
 *   allowSourceMaps: boolean, fs?: Fs }} opts
 * @returns {Promise<{ archivePath: string, archiveSha256: string, sidecarPath: string, manifest: HostingManifest, topDir: string }>}
 */
export async function packageSite(opts) {
  const fs = opts.fs ?? fsp;
  const { report, limits, provenance } = opts;
  const extraFiles = opts.extraFiles ?? [];
  const compression = opts.compression ?? 'deflate';
  checkReport(report, limits, opts.allowSourceMaps);
  const topDir = topDirName(opts.appId, provenance.label, limits);
  const archivePath = await resolveOutFile(fs, opts.outFile, report.siteDir);
  checkExtraFiles(extraFiles, limits);

  /** @type {FileRecord[]} */
  const records = [];
  /** @type {{ name: string, data: Uint8Array }[]} */
  const zipEntries = [];
  /** @type {Map<string, string>} */
  const hashes = new Map();
  for (const e of report.entries) {
    const data = await readFileExact(e.absPath, e.size, { fs });
    const sha256 = sha256Hex(data);
    records.push({ path: e.path, size: data.length, sha256 });
    hashes.set(`${SITE_ROOT}${e.path}`, sha256);
    zipEntries.push({ name: `${topDir}/${SITE_ROOT}${e.path}`, data });
  }
  const manifest = buildManifest({
    appId: opts.appId, entrypoint: report.entrypoint, records, limits, allowSourceMaps: opts.allowSourceMaps, provenance,
    trustSensitive: report.trustSensitive, metadataFiles: [MANIFEST_NAME, ...extraFiles.map((x) => x.name)],
  });
  const metadata = [{ name: MANIFEST_NAME, data: serializeManifest(manifest) }, ...extraFiles];
  for (const m of metadata) {
    hashes.set(m.name, sha256Hex(m.data));
    zipEntries.push({ name: `${topDir}/${m.name}`, data: m.data });
  }
  zipEntries.push({ name: `${topDir}/${SUMS_NAME}`, data: formatSums(hashes) });
  const zip = createZip(zipEntries, { compression });

  const { result } = inspectArchiveBytes(zip, { limits, expectedContentDigest: manifest.content.digest });
  if (!result.ok) throw new KitError(ERROR_CODES.ARCHIVE, 'internal error: the produced archive failed self-verification', { result });
  const archiveSha256 = sha256Hex(zip);
  const sidecarPath = `${archivePath}.sha256`;
  const sidecar = new TextEncoder().encode(`${archiveSha256}  ${path.basename(archivePath)}\n`);
  await commitFilesAtomic([{ target: archivePath, bytes: zip }, { target: sidecarPath, bytes: sidecar }], { fs });
  return { archivePath, archiveSha256, sidecarPath, manifest, topDir };
}
