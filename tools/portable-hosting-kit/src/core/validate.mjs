// @ts-check
// Site validation: inventory + path rules + inclusion policy (allowlist, deny reasons) + collision detection +
// entrypoint + heuristic secret scan + trust-sensitive detection. Read-only: never modifies the input.
import fsp from 'node:fs/promises';
import { ERROR_CODES, isKitError } from '../errors.mjs';
import {
  ALLOWED_EXACT_NAMES, ALLOWED_HIDDEN_DIRS, DEFAULT_ENTRYPOINT, DEFAULT_LIMITS, DENY_RULES, MIME_TYPES,
  SECRET_CONTENT_PATTERNS, SECRET_MAGIC_PREFIXES, TEXT_EXTENSIONS, extensionOf,
} from '../policy.mjs';
import { readFileExact, readPrefix } from './hash.mjs';
import { errorFinding, walkSite } from './inventory.mjs';
import { compareUtf8, validateRelativePath } from './paths.mjs';

/** @typedef {typeof import('node:fs/promises')} Fs */
/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {import('../types.mjs').Finding} Finding */
/** @typedef {import('../types.mjs').InventoryEntry} InventoryEntry */
/** @typedef {import('../types.mjs').ValidationReport} ValidationReport */

const MAGIC = SECRET_MAGIC_PREFIXES.map((m) => ({ rule: m.rule, prefix: Buffer.from(m.prefix, 'latin1') }));
const MAGIC_LEN = Math.max(...MAGIC.map((m) => m.prefix.length));
const CHAIN_ID_RE = /"chainId"\s*:/;
const EVM_ADDRESS_VALUE_RE = /"0x[0-9a-fA-F]{40}"/;

/**
 * Inclusion policy for one path that already passed the path rules: the first matching deny rule gives a precise
 * reason; otherwise hidden segments (except a leading `.well-known/` directory) and anything off the allowlist are
 * rejected. Returns null when the file may be packaged.
 * @param {string} rel
 * @param {boolean} allowSourceMaps
 * @returns {Finding | null}
 */
export function policyFinding(rel, allowSourceMaps) {
  const lower = rel.toLowerCase();
  const deny = DENY_RULES.find((r) => r.test(lower, lower.split('/')));
  if (deny) return errorFinding(deny.code, deny.rule, deny.reason, rel);
  const segs = rel.split('/');
  const hidden = segs.some((s, i) => s.startsWith('.') && !(i === 0 && segs.length > 1 && ALLOWED_HIDDEN_DIRS.includes(s)));
  if (hidden) return errorFinding(ERROR_CODES.POLICY, 'hidden-path', 'hidden file or directory (only a top-level .well-known/ directory is allowed)', rel);
  const base = /** @type {string} */ (segs[segs.length - 1]);
  const ext = extensionOf(rel);
  const allowed = ext === '' ? ALLOWED_EXACT_NAMES.includes(base) : Object.hasOwn(MIME_TYPES, ext);
  if (!allowed) {
    const what = ext === '' ? `extensionless name "${base}"` : `file type ".${ext}"`;
    return errorFinding(ERROR_CODES.POLICY, 'not-allowed', `${what} is not on the static-site allowlist`, rel);
  }
  if (ext === 'map' && !allowSourceMaps) return errorFinding(ERROR_CODES.POLICY, 'source-map', 'source maps are excluded unless allowSourceMaps is set', rel);
  return null;
}

/**
 * @param {string} rel
 * @returns {boolean}
 */
function isTextPath(rel) {
  const ext = extensionOf(rel);
  return ext === '' || TEXT_EXTENSIONS.includes(ext);
}

/**
 * Heuristic content checks for one accepted file. Text files are read once in full; others only their prefix.
 * @param {InventoryEntry} entry
 * @param {Fs} fs
 * @returns {Promise<{ findings: Finding[], trustSensitive: boolean }>}
 */
async function scanFile(entry, fs) {
  /** @type {Finding[]} */
  const findings = [];
  const text = isTextPath(entry.path);
  const bytes = text ? await readFileExact(entry.absPath, entry.size, { fs }) : await readPrefix(entry.absPath, MAGIC_LEN, { fs });
  for (const m of MAGIC) {
    if (bytes.length >= m.prefix.length && bytes.subarray(0, m.prefix.length).equals(m.prefix)) {
      findings.push(errorFinding(ERROR_CODES.SECRET, m.rule, `file starts with the signature of ${m.rule}`, entry.path));
    }
  }
  if (!text) return { findings, trustSensitive: false };
  const content = bytes.toString('utf8');
  for (const p of SECRET_CONTENT_PATTERNS) {
    if (p.re.test(content)) findings.push(errorFinding(ERROR_CODES.SECRET, p.rule, `content matches secret pattern "${p.rule}" (heuristic)`, entry.path));
  }
  return { findings, trustSensitive: isTrustSensitive(entry.path, content) };
}

/**
 * JSON under a `deployments/` directory, or JSON with a "chainId" key together with 0x + 40-hex string values.
 * @param {string} rel
 * @param {string} content
 * @returns {boolean}
 */
function isTrustSensitive(rel, content) {
  if (extensionOf(rel) !== 'json') return false;
  if (rel.toLowerCase().split('/').slice(0, -1).includes('deployments')) return true;
  return CHAIN_ID_RE.test(content) && EVM_ADDRESS_VALUE_RE.test(content);
}

/**
 * @param {string} entrypoint
 * @param {InventoryEntry[]} entries
 * @param {Set<string>} rejected
 * @param {Limits} limits
 * @returns {Finding | null}
 */
function entrypointFinding(entrypoint, entries, rejected, limits) {
  const check = validateRelativePath(entrypoint, limits);
  if (!check.ok) return errorFinding(ERROR_CODES.ENTRYPOINT, 'entrypoint-invalid', `entrypoint path is invalid: ${check.reason}`, entrypoint);
  if (!['html', 'htm'].includes(extensionOf(entrypoint))) return errorFinding(ERROR_CODES.ENTRYPOINT, 'entrypoint-not-html', 'entrypoint must be an .html or .htm file', entrypoint);
  if (entries.some((e) => e.path === entrypoint)) return null;
  const why = rejected.has(entrypoint) ? 'entrypoint was rejected (see other findings)' : 'entrypoint does not exist in the site';
  return errorFinding(ERROR_CODES.ENTRYPOINT, 'entrypoint-missing', why, entrypoint);
}

/**
 * @param {Finding} a
 * @param {Finding} b
 * @returns {number}
 */
function compareFindings(a, b) {
  return compareUtf8(a.path ?? '', b.path ?? '') || compareUtf8(a.rule, b.rule);
}

/**
 * Validate a static-site directory. Global bounds throw KitError(E_LIMIT); everything else is a finding.
 * @param {string} siteDir
 * @param {{ limits?: Limits, entrypoint?: string, allowSourceMaps?: boolean, fs?: Fs }} [opts]
 * @returns {Promise<ValidationReport>}
 */
export async function validateSite(siteDir, opts = {}) {
  const fs = opts.fs ?? fsp;
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const entrypoint = opts.entrypoint ?? DEFAULT_ENTRYPOINT;
  const allowSourceMaps = opts.allowSourceMaps ?? false;
  const walk = await walkSite(siteDir, { limits, fs });
  const findings = [...walk.findings];
  const rejected = new Set(findings.filter((f) => f.severity === 'error' && f.path !== undefined).map((f) => /** @type {string} */ (f.path)));
  /** @type {string[]} */
  const trustSensitive = [];
  for (const entry of walk.files) {
    if (rejected.has(entry.path)) continue;
    const policy = policyFinding(entry.path, allowSourceMaps);
    if (policy) {
      findings.push(policy);
      rejected.add(entry.path);
      continue;
    }
    const scan = await scanSafely(entry, fs);
    findings.push(...scan.findings);
    if (scan.findings.some((f) => f.severity === 'error')) rejected.add(entry.path);
    else if (scan.trustSensitive) trustSensitive.push(entry.path);
  }
  const entries = walk.files.filter((e) => !rejected.has(e.path));
  const ep = entrypointFinding(entrypoint, entries, rejected, limits);
  if (ep) findings.push(ep);
  findings.sort(compareFindings);
  return {
    ok: !findings.some((f) => f.severity === 'error'),
    siteDir: walk.root,
    entrypoint,
    entries,
    findings,
    totalBytes: entries.reduce((s, e) => s + e.size, 0),
    trustSensitive: trustSensitive.sort(compareUtf8),
  };
}

/**
 * scanFile, turning "file changed or became a symlink since the walk" into a finding.
 * @param {InventoryEntry} entry
 * @param {Fs} fs
 * @returns {Promise<{ findings: Finding[], trustSensitive: boolean }>}
 */
async function scanSafely(entry, fs) {
  try {
    return await scanFile(entry, fs);
  } catch (e) {
    if (!isKitError(e)) throw e;
    return { findings: [errorFinding(e.code, 'changed-during-validation', e.message, entry.path)], trustSensitive: false };
  }
}
