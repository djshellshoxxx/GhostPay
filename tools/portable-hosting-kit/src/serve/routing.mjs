// @ts-check
// Normative request routing shared by the preview server and the nginx profile (docs/INTERFACES.md, "Routing
// semantics"). The nginx profile re-expresses exactly these rules; test/profiles/differential.test.mjs checks that
// both servers agree.

import { KitError, ERROR_CODES } from '../errors.mjs';
import { ALLOWED_HIDDEN_DIRS, NEVER_SERVED_NAMES, contentTypeFor } from '../policy.mjs';

/** @typedef {import('../types.mjs').RouteResult} RouteResult */

/** basePath: "/" or "/seg/.../" with conservative segment characters (it is embedded in server configs). */
const BASE_PATH_RE = /^\/(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*$/;
const ABSOLUTE_FORM_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/;
const MALFORMED_PERCENT_RE = /%(?![0-9A-Fa-f]{2})/;

/**
 * @param {string} s
 * @returns {boolean} true if s contains a C0 control character or DEL
 */
export function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * @param {string} s
 * @returns {boolean} control character, DEL or backslash
 */
function hasForbiddenChar(s) {
  return hasControlChar(s) || s.includes('\\');
}

/** @type {RouteResult} */
const NOT_FOUND = Object.freeze({ kind: 'not-found' });
/** @type {RouteResult} */
const FORBIDDEN = Object.freeze({ kind: 'forbidden' });

/**
 * @param {string} basePath
 * @returns {string} the same basePath, validated
 */
export function checkBasePath(basePath) {
  if (typeof basePath !== 'string' || !BASE_PATH_RE.test(basePath)) {
    throw new KitError(ERROR_CODES.CONFIG, `basePath must be "/" or "/seg/.../" using [A-Za-z0-9._~-] (no dot segments), got ${JSON.stringify(basePath)}`);
  }
  return basePath;
}

/**
 * True if a relative path may be served at all: no segment starting with "." (except a first segment
 * ".well-known") and no segment named in NEVER_SERVED_NAMES. A trailing empty segment ("dir/") is ignored.
 * @param {string} rel relative path without leading "/"
 * @returns {boolean}
 */
export function isServableRelPath(rel) {
  const segs = rel.split('/');
  if (segs[segs.length - 1] === '') segs.pop();
  return segs.every((s, i) => !NEVER_SERVED_NAMES.includes(s) && (!s.startsWith('.') || (i === 0 && ALLOWED_HIDDEN_DIRS.includes(s))));
}

/**
 * The servable subset of an inventory: drops `_headers` and hidden paths, and refuses malformed paths and files
 * without an allowlisted Content-Type (the core validator rejects those before they reach a profile).
 * @param {string[]} files relative POSIX paths
 * @returns {string[]} sorted
 */
export function servableFiles(files) {
  /** @type {string[]} */
  const out = [];
  for (const f of files) {
    if (typeof f !== 'string' || f === '' || f.startsWith('/') || f.endsWith('/') || hasForbiddenChar(f)
      || f.split('/').some((s) => s === '' || s === '.' || s === '..')) {
      throw new KitError(ERROR_CODES.PATH, `not a normalized relative path: ${JSON.stringify(f)}`, { path: f });
    }
    if (!isServableRelPath(f)) continue;
    if (contentTypeFor(f) === null) {
      throw new KitError(ERROR_CODES.POLICY, `no allowlisted Content-Type for ${f}`, { path: f });
    }
    out.push(f);
  }
  return out.sort();
}

/**
 * The path part of a raw request-target: absolute-form scheme/authority removed (as nginx does), query and
 * fragment cut off. Not decoded.
 * @param {string} target
 * @returns {string}
 */
export function rawPathOf(target) {
  const noAuthority = target.replace(ABSOLUTE_FORM_RE, '');
  const path = noAuthority.split(/[?#]/, 1)[0] ?? '';
  return path === '' && noAuthority !== target ? '/' : path;
}

/**
 * Byte-wise percent-decoding of a path part (each %XX -> one latin1 char); malformed escapes are kept verbatim.
 * @param {string} raw
 * @returns {string}
 */
function decodeBytes(raw) {
  return raw.replace(/%([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * True if nginx's request-line parser rejects the path with 400 before any configuration applies: a malformed
 * "%" escape, an encoded NUL, or "." / ".." segments (literal or encoded) that climb above "/".
 * @param {string} target raw request-target
 * @returns {boolean}
 */
export function isRejectedByUriParser(target) {
  const raw = rawPathOf(target);
  if (MALFORMED_PERCENT_RE.test(raw)) return true;
  const bytes = decodeBytes(raw);
  if (bytes.includes('\u0000')) return true;
  let depth = 0;
  for (const seg of bytes.split('/').slice(1)) {
    if (seg === '..') {
      depth -= 1;
      if (depth < 0) return true;
    } else if (seg !== '' && seg !== '.') depth += 1;
  }
  return false;
}

/**
 * The value nginx exposes as `$request_uri`: the request-target, with an absolute-form scheme and authority
 * removed (an empty path becomes "/").
 * @param {string} target
 * @returns {string}
 */
export function nginxRequestUri(target) {
  const m = ABSOLUTE_FORM_RE.exec(target);
  if (!m) return target;
  const rest = target.slice(m[0].length);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/**
 * Decode the path part once. Null for invalid encoding (including invalid UTF-8), control characters, backslash,
 * a path not starting with "/", or an empty, "." or ".." segment.
 * @param {string} target raw request-target
 * @returns {string | null}
 */
export function decodeRequestPath(target) {
  const raw = rawPathOf(target);
  if (!raw.startsWith('/')) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (hasForbiddenChar(decoded)) return null;
  const segs = decoded.slice(1).split('/');
  if (segs.some((s, i) => s === '.' || s === '..' || (s === '' && i < segs.length - 1))) return null;
  return decoded;
}

/**
 * The site path whose `_headers` rules apply to a response that does not serve a file (301, 404, 405, 400):
 * the decoded request path relative to the base path ("/x/y"), or "/" when the request is invalid or outside
 * the base path.
 * @param {string} target raw request-target
 * @param {string} basePath
 * @returns {string}
 */
export function requestHeaderPath(target, basePath) {
  const decoded = decodeRequestPath(target);
  if (decoded === null || !decoded.startsWith(basePath)) return '/';
  return `/${decoded.slice(basePath.length)}`;
}

/**
 * Percent-encode a decoded absolute path for a Location header (each segment with encodeURIComponent).
 * @param {string} p
 * @returns {string}
 */
export function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

/**
 * Directories (relative, without trailing slash) that contain a servable index.html.
 * @param {string[]} servable
 * @returns {Set<string>}
 */
export function indexDirectories(servable) {
  const dirs = new Set();
  for (const f of servable) {
    if (f.endsWith('/index.html')) dirs.add(f.slice(0, -'/index.html'.length));
  }
  return dirs;
}

/**
 * @param {{ files: string[], entrypoint: string, basePath: string }} args
 * @returns {(urlPath: string) => RouteResult}
 */
export function createRouter({ files, entrypoint, basePath }) {
  checkBasePath(basePath);
  const servable = new Set(servableFiles(files));
  if (!servable.has(entrypoint) || !contentTypeFor(entrypoint)?.startsWith('text/html')) {
    throw new KitError(ERROR_CODES.ENTRYPOINT, `entrypoint ${JSON.stringify(entrypoint)} is not a servable HTML file in the file list`);
  }
  const dirs = indexDirectories([...servable]);
  const bareBase = basePath.slice(0, -1);

  return (urlPath) => {
    const decoded = decodeRequestPath(urlPath);
    if (decoded === null) return NOT_FOUND;
    if (basePath !== '/' && decoded === bareBase) return { kind: 'redirect', location: basePath };
    if (!decoded.startsWith(basePath)) return NOT_FOUND;
    const rel = decoded.slice(basePath.length);
    if (!isServableRelPath(rel)) return FORBIDDEN;
    if (rel === '' || rel.endsWith('/')) {
      if (servable.has(`${rel}index.html`)) return { kind: 'file', path: `${rel}index.html` };
    } else {
      if (servable.has(rel)) return { kind: 'file', path: rel };
      if (dirs.has(rel)) return { kind: 'redirect', location: encodePath(`${basePath}${rel}/`) };
    }
    const last = rel.split('/').filter((s) => s !== '').pop() ?? '';
    if (last.includes('.')) return NOT_FOUND;
    return { kind: 'fallback', path: entrypoint };
  };
}
