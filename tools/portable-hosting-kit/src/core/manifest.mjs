// @ts-check
// Versioned hosting manifest: construction, deterministic serialization and strict parsing.
import { ERROR_CODES, KitError } from '../errors.mjs';
import { POLICY_ID, POLICY_VERSION, extensionOf } from '../policy.mjs';
import { KIT_NAME, KIT_VERSION, MANIFEST_SCHEMA, MANIFEST_SCHEMA_VERSION } from '../version.mjs';
import { canonicalBytes } from './canonical-json.mjs';
import { sha256Hex } from './hash.mjs';
import { collisionKey, compareUtf8, validateRelativePath } from './paths.mjs';

/** @typedef {import('../types.mjs').HostingManifest} HostingManifest */
/** @typedef {import('../types.mjs').FileRecord} FileRecord */
/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {import('../types.mjs').Provenance} Provenance */
/** @typedef {import('../errors.mjs').ErrorCode} ErrorCode */

export const MANIFEST_NAME = 'HOSTING-MANIFEST.json';
export const SUMS_NAME = 'SHA256SUMS';
export const SITE_ROOT = 'site/';
export const APP_ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_COMMIT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const LONE_SURROGATE_RE = /\p{Cs}/u;
const LIMIT_KEYS = /** @type {const} */ (['maxFiles', 'maxTotalBytes', 'maxFileBytes', 'maxPathBytes', 'maxSegmentBytes', 'maxDepth', 'maxDirEntries']);

/**
 * Archive top-level directory name: `<appId>-<label>` with the label sanitized to [A-Za-z0-9._-].
 * @param {string} appId
 * @param {string} label
 * @returns {string}
 */
export function archiveTopDir(appId, label) {
  return `${appId}-${String(label).replace(/[^A-Za-z0-9._-]/g, '-')}`;
}

/**
 * `"sha256:" + hex(sha256(canonicalJson({ entrypoint, files })))` over records sorted by UTF-8 path.
 * @param {string} entrypoint
 * @param {FileRecord[]} records
 * @returns {string}
 */
export function contentDigest(entrypoint, records) {
  return `sha256:${sha256Hex(canonicalBytes({ entrypoint, files: sortedRecords(records) }))}`;
}

/**
 * @param {FileRecord[]} records
 * @returns {FileRecord[]}
 */
function sortedRecords(records) {
  return [...records].sort((a, b) => compareUtf8(a.path, b.path)).map((r) => ({ path: r.path, size: r.size, sha256: r.sha256 }));
}

/**
 * Copy a manifest-shaped value into the fixed field order used for serialization. Assumes the shape is valid.
 * @param {HostingManifest} m
 * @returns {HostingManifest}
 */
function ordered(m) {
  const s = m.provenance.source;
  const limits = pickLimits(m.policy.limits);
  return {
    schema: m.schema,
    schemaVersion: m.schemaVersion,
    appId: m.appId,
    kit: { name: m.kit.name, version: m.kit.version },
    policy: { id: m.policy.id, version: m.policy.version, limits, allowSourceMaps: m.policy.allowSourceMaps },
    content: {
      root: m.content.root,
      entrypoint: m.content.entrypoint,
      fileCount: m.content.fileCount,
      totalBytes: m.content.totalBytes,
      digest: m.content.digest,
      files: m.content.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
    },
    provenance: {
      label: m.provenance.label,
      sourceDateEpoch: m.provenance.sourceDateEpoch,
      source: s.kind === 'git' ? { kind: 'git', commit: s.commit, dirty: s.dirty } : { kind: 'directory' },
      notes: [...m.provenance.notes],
    },
    trustSensitive: [...m.trustSensitive],
    metadataFiles: [...m.metadataFiles],
  };
}

/**
 * @param {Limits} limits
 * @returns {Limits}
 */
function pickLimits(limits) {
  return /** @type {Limits} */ (Object.fromEntries(LIMIT_KEYS.map((k) => [k, limits?.[k]])));
}

/**
 * Build and validate a manifest; invalid input throws KitError(E_USAGE).
 * @param {{ appId: string, entrypoint: string, records: FileRecord[], limits: Limits, allowSourceMaps: boolean,
 *   provenance: Provenance, trustSensitive: string[], metadataFiles: string[] }} input
 * @returns {HostingManifest}
 */
export function buildManifest(input) {
  const files = sortedRecords(input.records);
  /** @type {HostingManifest} */
  const m = {
    schema: MANIFEST_SCHEMA,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    appId: input.appId,
    kit: { name: KIT_NAME, version: KIT_VERSION },
    policy: { id: POLICY_ID, version: POLICY_VERSION, limits: pickLimits(input.limits), allowSourceMaps: input.allowSourceMaps },
    content: {
      root: SITE_ROOT,
      entrypoint: input.entrypoint,
      fileCount: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0),
      digest: contentDigest(input.entrypoint, files),
      files,
    },
    provenance: input.provenance,
    trustSensitive: [...input.trustSensitive].sort(compareUtf8),
    metadataFiles: [...input.metadataFiles].sort(compareUtf8),
  };
  checkManifest(m, ERROR_CODES.USAGE);
  return ordered(m);
}

/**
 * Deterministic JSON: fixed field order, 2-space indent, trailing newline.
 * @param {HostingManifest} manifest
 * @returns {Uint8Array}
 */
export function serializeManifest(manifest) {
  return new TextEncoder().encode(`${JSON.stringify(ordered(manifest), null, 2)}\n`);
}

/**
 * Strict parse: valid UTF-8 without BOM, known schema/version, exact field sets and types, internally consistent
 * (counts, totals, sorted unique paths, digest), and byte-identical to its own re-serialization (which rejects
 * duplicate keys, reordering and whitespace variants that other parsers might read differently).
 * @param {Uint8Array} bytes
 * @returns {HostingManifest}
 */
export function parseManifest(bytes) {
  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    value = JSON.parse(text);
  } catch (e) {
    throw new KitError(ERROR_CODES.VERIFY, `manifest is not valid UTF-8 JSON: ${/** @type {Error} */ (e).message}`);
  }
  checkManifest(value, ERROR_CODES.VERIFY);
  const m = /** @type {HostingManifest} */ (value);
  if (Buffer.compare(Buffer.from(serializeManifest(m)), Buffer.from(bytes)) !== 0) {
    throw new KitError(ERROR_CODES.VERIFY, 'manifest is not in canonical serialized form (duplicate keys, reordering or reformatting)');
  }
  return ordered(m);
}

/**
 * @param {ErrorCode} code
 * @param {string} message
 * @returns {never}
 */
function bad(code, message) {
  throw new KitError(code, `manifest: ${message}`);
}

/**
 * @param {unknown} v
 * @param {readonly string[]} keys
 * @param {string} where
 * @param {ErrorCode} code
 * @returns {Record<string, unknown>}
 */
function exactObject(v, keys, where, code) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) bad(code, `${where} must be an object`);
  const rec = /** @type {Record<string, unknown>} */ (v);
  const actual = Object.keys(rec);
  for (const k of actual) if (!keys.includes(k)) bad(code, `${where} has unknown field "${k}"`);
  for (const k of keys) if (!Object.hasOwn(rec, k)) bad(code, `${where} is missing field "${k}"`);
  return rec;
}

/**
 * @param {unknown} v
 * @param {string} where
 * @param {ErrorCode} code
 * @returns {string}
 */
function str(v, where, code) {
  if (typeof v !== 'string') bad(code, `${where} must be a string`);
  if (LONE_SURROGATE_RE.test(v)) bad(code, `${where} contains a lone surrogate`);
  return v;
}

/**
 * @param {unknown} v
 * @param {string} where
 * @param {ErrorCode} code
 * @param {number} [min]
 * @returns {number}
 */
function int(v, where, code, min = 0) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) bad(code, `${where} must be an integer >= ${min}`);
  return v;
}

/**
 * @param {unknown} v
 * @param {string} where
 * @param {ErrorCode} code
 * @returns {string[]}
 */
function strArray(v, where, code) {
  if (!Array.isArray(v)) bad(code, `${where} must be an array`);
  return v.map((x, i) => str(x, `${where}[${i}]`, code));
}

/**
 * Paths strictly increasing in UTF-8 order, valid, and free of case/Unicode collisions and file/dir conflicts.
 * @param {string[]} paths
 * @param {Limits} limits
 * @param {string} where
 * @param {ErrorCode} code
 */
function checkPathList(paths, limits, where, code) {
  const keys = new Set();
  for (let i = 0; i < paths.length; i++) {
    const p = /** @type {string} */ (paths[i]);
    const c = validateRelativePath(p, limits);
    if (!c.ok) bad(code, `${where}: "${p}": ${c.reason}`);
    if (i > 0 && compareUtf8(/** @type {string} */ (paths[i - 1]), p) >= 0) bad(code, `${where} must be sorted by UTF-8 bytes without duplicates`);
    const k = collisionKey(p);
    if (keys.has(k)) bad(code, `${where}: "${p}" collides with another path`);
    keys.add(k);
  }
  for (const p of paths) {
    const segs = collisionKey(p).split('/');
    for (let d = 1; d < segs.length; d++) {
      if (keys.has(segs.slice(0, d).join('/'))) bad(code, `${where}: "${p}" lies under a path that is a file`);
    }
  }
}

/**
 * @param {unknown} v
 * @param {ErrorCode} code
 * @returns {Limits}
 */
function checkLimits(v, code) {
  const rec = exactObject(v, LIMIT_KEYS, 'policy.limits', code);
  for (const k of LIMIT_KEYS) int(rec[k], `policy.limits.${k}`, code, 1);
  return /** @type {Limits} */ (/** @type {unknown} */ (rec));
}

/**
 * @param {unknown} v
 * @param {Limits} limits
 * @param {ErrorCode} code
 * @returns {FileRecord[]}
 */
function checkFiles(v, limits, code) {
  if (!Array.isArray(v)) bad(code, 'content.files must be an array');
  const files = v.map((f, i) => {
    const r = exactObject(f, ['path', 'size', 'sha256'], `content.files[${i}]`, code);
    const sha = str(r.sha256, `content.files[${i}].sha256`, code);
    if (!HEX64_RE.test(sha)) bad(code, `content.files[${i}].sha256 must be 64 lowercase hex`);
    const size = int(r.size, `content.files[${i}].size`, code);
    if (size > limits.maxFileBytes) bad(code, `content.files[${i}] exceeds maxFileBytes`);
    return { path: str(r.path, `content.files[${i}].path`, code), size, sha256: sha };
  });
  checkPathList(files.map((f) => f.path), limits, 'content.files', code);
  return files;
}

/**
 * @param {unknown} v
 * @param {Limits} limits
 * @param {ErrorCode} code
 */
function checkContent(v, limits, code) {
  const c = exactObject(v, ['root', 'entrypoint', 'fileCount', 'totalBytes', 'digest', 'files'], 'content', code);
  if (c.root !== SITE_ROOT) bad(code, `content.root must be "${SITE_ROOT}"`);
  const files = checkFiles(c.files, limits, code);
  const entrypoint = str(c.entrypoint, 'content.entrypoint', code);
  if (!files.some((f) => f.path === entrypoint)) bad(code, 'content.entrypoint is not one of content.files');
  if (!['html', 'htm'].includes(extensionOf(entrypoint))) bad(code, 'content.entrypoint must be an .html/.htm file');
  if (int(c.fileCount, 'content.fileCount', code) !== files.length) bad(code, 'content.fileCount does not match content.files');
  if (files.length > limits.maxFiles) bad(code, 'content.files exceeds maxFiles');
  const total = files.reduce((s, f) => s + f.size, 0);
  if (int(c.totalBytes, 'content.totalBytes', code) !== total) bad(code, 'content.totalBytes does not match content.files');
  if (total > limits.maxTotalBytes) bad(code, 'content.totalBytes exceeds maxTotalBytes');
  const digest = str(c.digest, 'content.digest', code);
  if (!DIGEST_RE.test(digest)) bad(code, 'content.digest must be "sha256:<64 hex>"');
  if (digest !== contentDigest(entrypoint, files)) bad(code, 'content.digest does not match content.entrypoint and content.files');
  return files;
}

/**
 * @param {unknown} v
 * @param {ErrorCode} code
 */
function checkProvenance(v, code) {
  const p = exactObject(v, ['label', 'sourceDateEpoch', 'source', 'notes'], 'provenance', code);
  str(p.label, 'provenance.label', code);
  if (p.sourceDateEpoch !== null) int(p.sourceDateEpoch, 'provenance.sourceDateEpoch', code);
  strArray(p.notes, 'provenance.notes', code);
  const kind = typeof p.source === 'object' && p.source !== null ? /** @type {Record<string, unknown>} */ (p.source).kind : undefined;
  if (kind === 'git') {
    const s = exactObject(p.source, ['kind', 'commit', 'dirty'], 'provenance.source', code);
    if (!GIT_COMMIT_RE.test(str(s.commit, 'provenance.source.commit', code))) bad(code, 'provenance.source.commit must be a 40/64-hex lowercase commit id');
    if (s.dirty !== null && typeof s.dirty !== 'boolean') bad(code, 'provenance.source.dirty must be boolean or null');
  } else if (kind === 'directory') {
    exactObject(p.source, ['kind'], 'provenance.source', code);
  } else {
    bad(code, 'provenance.source.kind must be "git" or "directory"');
  }
}

/**
 * @param {unknown} v
 * @param {Limits} limits
 * @param {ErrorCode} code
 */
function checkMetadataFiles(v, limits, code) {
  const names = strArray(v, 'metadataFiles', code);
  checkPathList(names, limits, 'metadataFiles', code);
  if (!names.includes(MANIFEST_NAME)) bad(code, `metadataFiles must include ${MANIFEST_NAME}`);
  for (const n of names) {
    const k = collisionKey(n);
    if (k === collisionKey(SUMS_NAME) || k.split('/')[0] === 'site') bad(code, `metadataFiles must not contain "${n}"`);
  }
}

/**
 * Validate the full manifest shape and its internal consistency.
 * @param {unknown} v
 * @param {ErrorCode} code
 */
function checkManifest(v, code) {
  const m = exactObject(v, ['schema', 'schemaVersion', 'appId', 'kit', 'policy', 'content', 'provenance', 'trustSensitive', 'metadataFiles'], 'manifest', code);
  if (m.schema !== MANIFEST_SCHEMA) bad(code, `unknown schema ${JSON.stringify(m.schema)}`);
  if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) bad(code, `unsupported schemaVersion ${JSON.stringify(m.schemaVersion)}`);
  if (!APP_ID_RE.test(str(m.appId, 'appId', code))) bad(code, 'appId must match [a-z0-9][a-z0-9._-]{0,79}');
  const kit = exactObject(m.kit, ['name', 'version'], 'kit', code);
  if (kit.name !== KIT_NAME) bad(code, `kit.name must be "${KIT_NAME}"`);
  if (!VERSION_RE.test(str(kit.version, 'kit.version', code))) bad(code, 'kit.version must be a semantic version');
  const policy = exactObject(m.policy, ['id', 'version', 'limits', 'allowSourceMaps'], 'policy', code);
  if (str(policy.id, 'policy.id', code) === '') bad(code, 'policy.id must not be empty');
  int(policy.version, 'policy.version', code, 1);
  if (typeof policy.allowSourceMaps !== 'boolean') bad(code, 'policy.allowSourceMaps must be boolean');
  const limits = checkLimits(policy.limits, code);
  const files = checkContent(m.content, limits, code);
  checkProvenance(m.provenance, code);
  const trust = strArray(m.trustSensitive, 'trustSensitive', code);
  checkPathList(trust, limits, 'trustSensitive', code);
  const filePaths = new Set(files.map((f) => f.path));
  for (const t of trust) if (!filePaths.has(t)) bad(code, `trustSensitive entry "${t}" is not one of content.files`);
  checkMetadataFiles(m.metadataFiles, limits, code);
}
