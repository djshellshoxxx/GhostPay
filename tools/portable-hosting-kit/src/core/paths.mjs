// @ts-check
// Portable relative-path rules shared by the inventory walk, the manifest parser and the ZIP reader.
// A path that passes `validateRelativePath` is safe to join under a root on POSIX and Windows hosts and to use as a
// URL path without escaping ambiguity.
import path from 'node:path';
import { ERROR_CODES } from '../errors.mjs';

/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {Pick<Limits, 'maxPathBytes' | 'maxSegmentBytes' | 'maxDepth'>} PathLimits */
/** @typedef {{ ok: true, path: string } | { ok: false, rule: string, reason: string }} PathCheck */

// C0 controls, DEL, C1 controls.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/; // eslint-disable-line no-control-regex
// Bidirectional overrides/isolates/marks, line/paragraph separators and BOM: invisible, reorder displayed names.
const BIDI_RE = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/;
const LONE_SURROGATE_RE = /\p{Cs}/u;
const URL_SPECIAL_RE = /[?#%]/;
const NGINX_SPECIAL_RE = /\$/;
const WINDOWS_INVALID_RE = /[:*"<>|]/;
const DRIVE_RE = /^[A-Za-z]:/;
const WINDOWS_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$', 'CLOCK$',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, '\u00b9', '\u00b2', '\u00b3'].flatMap((n) => [`COM${n}`, `LPT${n}`]),
]);

/**
 * @param {string} rule
 * @param {string} reason
 * @returns {PathCheck}
 */
function fail(rule, reason) {
  return { ok: false, rule, reason };
}

/**
 * Rules for a single, non-empty segment that is not "." or "..".
 * @param {string} seg
 * @param {PathLimits} limits
 * @returns {PathCheck | null} failure or null
 */
function checkSegment(seg, limits) {
  if (Buffer.byteLength(seg, 'utf8') > limits.maxSegmentBytes) {
    return fail('segment-too-long', `segment exceeds ${limits.maxSegmentBytes} UTF-8 bytes`);
  }
  if (/[. ]$/.test(seg)) return fail('trailing-dot-or-space', 'segment ends with "." or " " (stripped by Windows)');
  const stem = (seg.split('.')[0] ?? '').trimEnd().toUpperCase();
  if (WINDOWS_RESERVED.has(stem)) return fail('windows-reserved-name', `${quote(seg)} is a reserved device name on Windows`);
  return null;
}

/**
 * Validate a POSIX relative path for portability and safety. Never normalizes: a path that is not already in
 * canonical form is rejected, so callers cannot be confused about which spelling was checked.
 * @param {unknown} p
 * @param {PathLimits} limits
 * @returns {PathCheck}
 */
export function validateRelativePath(p, limits) {
  if (typeof p !== 'string' || p === '') return fail('empty', 'path is empty or not a string');
  if (LONE_SURROGATE_RE.test(p)) return fail('lone-surrogate', 'path contains an unpaired UTF-16 surrogate');
  if (p.normalize('NFC') !== p) return fail('not-nfc', 'path is not in Unicode NFC form');
  if (CONTROL_RE.test(p)) return fail('control-char', 'path contains a control character');
  if (BIDI_RE.test(p)) return fail('bidi-char', 'path contains a bidirectional-control or invisible separator character');
  if (p.includes('\ufffd')) return fail('replacement-char', 'path contains U+FFFD (undecodable name)');
  if (p.includes('\\')) return fail('backslash', 'path contains a backslash');
  if (p.startsWith('/')) return fail('absolute', 'path is absolute');
  if (DRIVE_RE.test(p)) return fail('drive-letter', 'path starts with a drive letter');
  if (URL_SPECIAL_RE.test(p)) return fail('url-special-char', 'path contains "?", "#" or "%" (ambiguous in URLs)');
  if (NGINX_SPECIAL_RE.test(p)) return fail('nginx-special-char', 'path contains "$" (starts an nginx variable; generated server configuration could not reference it safely)');
  if (WINDOWS_INVALID_RE.test(p)) return fail('windows-invalid-char', 'path contains one of : * " < > | (invalid on Windows)');
  const segs = p.split('/');
  for (const seg of segs) {
    if (seg === '') return fail('empty-segment', 'path has an empty segment (leading, trailing or double "/")');
    if (seg === '.' || seg === '..') return fail('dot-segment', 'path has a "." or ".." segment');
  }
  if (Buffer.byteLength(p, 'utf8') > limits.maxPathBytes) return fail('path-too-long', `path exceeds ${limits.maxPathBytes} UTF-8 bytes`);
  if (segs.length > limits.maxDepth) return fail('too-deep', `path has more than ${limits.maxDepth} segments`);
  for (const seg of segs) {
    const bad = checkSegment(seg, limits);
    if (bad) return bad;
  }
  return { ok: true, path: p };
}

// Characters JSON.stringify leaves raw that can still steer a terminal or reorder displayed text.
const UNSAFE_DISPLAY_RE = /[\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/g;

/**
 * Quote an untrusted string for an error message: JSON string syntax with every control, bidi and separator
 * character escaped, so names from archives, manifests or the filesystem cannot inject terminal sequences.
 * @param {unknown} s
 * @returns {string}
 */
export function quote(s) {
  return JSON.stringify(String(s)).replace(UNSAFE_DISPLAY_RE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * Error code for a path rule: bounds are E_LIMIT, everything else E_PATH.
 * @param {string} rule
 * @returns {import('../errors.mjs').ErrorCode}
 */
export function pathRuleCode(rule) {
  return rule === 'path-too-long' || rule === 'segment-too-long' || rule === 'too-deep' ? ERROR_CODES.LIMIT : ERROR_CODES.PATH;
}

/**
 * Key under which two paths collide on case-insensitive or normalizing hosts. Approximate: full Unicode case
 * folding and per-filesystem tables (NTFS upcase, APFS) are not reproduced exactly.
 * @param {string} p
 * @returns {string}
 */
export function collisionKey(p) {
  return p.normalize('NFC').toUpperCase().toLowerCase();
}

/**
 * Compare two strings by the byte order of their UTF-8 encodings.
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareUtf8(a, b) {
  const c = Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  return c < 0 ? -1 : c > 0 ? 1 : 0;
}

/**
 * True when `childAbs` lies strictly inside `parentAbs` (lexically, after path.resolve).
 * @param {string} parentAbs
 * @param {string} childAbs
 * @returns {boolean}
 */
export function isInside(parentAbs, childAbs) {
  const rel = path.relative(path.resolve(parentAbs), path.resolve(childAbs));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
