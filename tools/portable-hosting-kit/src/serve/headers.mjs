// @ts-check
// Response-header policy: a strict, fail-closed subset of the Cloudflare Pages / Netlify `_headers` format.
//
// Combination semantics follow Cloudflare's documented behaviour (see docs/SERVER-PROFILES.md): every rule whose
// pattern matches contributes; rules are applied in file order; within a rule, "! Name" detaches run before that
// rule's "Name: value" lines; a header set by more than one matching rule (or twice in one rule) is joined with
// ", ". Anything Cloudflare would silently skip (bad lines, placeholders, absolute URLs) is an error here.

import { KitError, ERROR_CODES } from '../errors.mjs';
import { DEFAULT_CACHE_CONTROL, KIT_DEFAULT_HEADERS_FILE, REQUIRED_CSP_DIRECTIVES, REQUIRED_HEADERS, contentTypeFor } from '../policy.mjs';

/** @typedef {import('../types.mjs').HeaderRule} HeaderRule */
/** @typedef {import('../types.mjs').HeaderPolicy} HeaderPolicy */
/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('../types.mjs').Finding} Finding */

/** Cloudflare's documented limits; enforced so a file accepted here is also accepted there. */
export const MAX_HEADER_RULES = 100;
export const MAX_HEADER_LINE_LENGTH = 2000;

/** HSTS value emitted for clearnet sites with an https:// public origin (two years, no preload). */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

/**
 * Headers the server itself controls (framing, routing, validators). A `_headers` rule may not set or detach them,
 * because the preview and nginx could not both honour it identically.
 */
export const SERVER_MANAGED_HEADERS = Object.freeze([
  'accept-ranges', 'allow', 'connection', 'content-encoding', 'content-length', 'content-range', 'content-type',
  'date', 'etag', 'keep-alive', 'last-modified', 'location', 'proxy-connection', 'server', 'status', 'te', 'trailer',
  'transfer-encoding', 'upgrade',
]);

const TOKEN_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// Path characters a URL path never percent-encodes and clients send verbatim, plus the "*" splat.
const PATTERN_RE = /^\/[A-Za-z0-9\-._~!&'()+,;=@/*]*$/;
// Visible ASCII, space and tab.
const VALUE_RE = /^[\x20-\x7e\t]*$/;
const ABSOLUTE_URL_RE = /^[^\s]+:\/\//;
const ONION_ORIGIN_RE = /^https?:\/\/[a-z2-7]{56}\.onion$/;

/**
 * @param {string} message
 * @param {number} [line]
 * @returns {KitError}
 */
function headersError(message, line) {
  return new KitError(ERROR_CODES.HEADERS, line === undefined ? message : `_headers line ${line}: ${message}`, line === undefined ? {} : { line });
}

/**
 * "content-security-policy" -> "Content-Security-Policy".
 * @param {string} name
 * @returns {string}
 */
export function canonicalHeaderName(name) {
  return name.toLowerCase().replace(/(^|-)([a-z])/g, (_m, sep, c) => sep + c.toUpperCase());
}

/**
 * @param {string} name
 * @param {number} line
 * @returns {string} canonical name
 */
function checkHeaderName(name, line) {
  if (!TOKEN_RE.test(name)) throw headersError(`invalid header name ${JSON.stringify(name)}`, line);
  if (SERVER_MANAGED_HEADERS.includes(name.toLowerCase())) {
    throw headersError(`header ${name} is controlled by the server and cannot be set or detached in _headers`, line);
  }
  return canonicalHeaderName(name);
}

/**
 * @param {string} pattern trimmed path line
 * @param {number} line
 */
function checkPattern(pattern, line) {
  if (ABSOLUTE_URL_RE.test(pattern)) throw headersError(`absolute-URL patterns are not supported: ${pattern}`, line);
  if (!pattern.startsWith('/')) throw headersError(`expected a path pattern beginning with "/": ${pattern}`, line);
  if (pattern.includes(':')) throw headersError(`placeholders (":name") are not supported: ${pattern}`, line);
  if (!PATTERN_RE.test(pattern)) {
    throw headersError(`pattern contains characters outside the supported set [A-Za-z0-9-._~!&'()+,;=@/*]: ${pattern}`, line);
  }
  if ((pattern.match(/\*/g) ?? []).length > 1) throw headersError(`only one "*" splat is allowed per pattern: ${pattern}`, line);
  if (pattern.slice(1).split('/').some((s, i, all) => s === '.' || s === '..' || (s === '' && i < all.length - 1))) {
    throw headersError(`pattern must be a normalized path (no empty, "." or ".." segments): ${pattern}`, line);
  }
}

/**
 * Parse a `_headers` file. Fails closed: every line Cloudflare would ignore with a warning is an error here.
 * @param {string} text
 * @returns {HeaderRule[]}
 */
export function parseHeadersFile(text) {
  /** @type {HeaderRule[]} */
  const rules = [];
  /** @type {HeaderRule | null} */
  let current = null;
  /** @type {Set<string>} */
  const seen = new Set();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const close = (/** @type {number} */ line) => {
    if (current && current.set.length === 0 && current.detach.length === 0) {
      throw headersError(`rule ${current.pattern} has no headers`, line);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const raw = /** @type {string} */ (lines[i]);
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (raw.length > MAX_HEADER_LINE_LENGTH) throw headersError(`line exceeds ${MAX_HEADER_LINE_LENGTH} characters`, n);
    if (line.startsWith('/') || ABSOLUTE_URL_RE.test(line)) {
      close(n);
      checkPattern(line, n);
      if (seen.has(line)) throw headersError(`duplicate pattern ${line}; merge the two blocks`, n);
      if (rules.length >= MAX_HEADER_RULES) throw headersError(`more than ${MAX_HEADER_RULES} rules`, n);
      seen.add(line);
      current = { pattern: line, set: [], detach: [] };
      rules.push(current);
      continue;
    }
    if (!/^[ \t]/.test(raw)) throw headersError(`header lines must be indented below a path pattern: ${line}`, n);
    if (!current) throw headersError('header line before any path pattern', n);
    if (line.startsWith('!')) {
      const m = /^! (\S+)$/.exec(line);
      if (!m) throw headersError(`detach lines must have the form "! Name": ${line}`, n);
      current.detach.push(checkHeaderName(/** @type {string} */ (m[1]), n));
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) throw headersError(`expected "Name: value": ${line}`, n);
    const name = checkHeaderName(line.slice(0, colon).trim(), n);
    const value = line.slice(colon + 1).trim();
    if (value === '') throw headersError(`header ${name} has an empty value`, n);
    if (!VALUE_RE.test(value)) throw headersError(`header ${name} value must be printable ASCII`, n);
    if (current.pattern.includes('*') && value.includes(':splat')) {
      throw headersError(`":splat" substitution in values is not supported (header ${name})`, n);
    }
    current.set.push([name, value]);
  }
  close(lines.length);
  return rules;
}

/**
 * Regular-expression source for a validated pattern. Valid in both JavaScript and PCRE: "*" matches any run of
 * characters (including "/" and newlines), everything else literally, anchored at both ends.
 * @param {string} pattern
 * @returns {string}
 */
export function patternRegexSource(pattern) {
  const parts = pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'));
  return `^${parts.join('[\\s\\S]*')}$`;
}

/** @type {Map<string, RegExp>} */
const patternCache = new Map();

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternRegex(pattern) {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(patternRegexSource(pattern));
    patternCache.set(pattern, re);
  }
  return re;
}

/**
 * @param {HeaderRule} rule
 * @param {string} sitePath
 * @returns {boolean}
 */
export function ruleMatches(rule, sitePath) {
  return patternRegex(rule.pattern).test(sitePath);
}

/**
 * Headers produced by the rules for one site path ("/assets/a.js"), in first-set order.
 * @param {HeaderRule[]} rules
 * @param {string} sitePath
 * @returns {Array<[string, string]>}
 */
export function effectiveHeaders(rules, sitePath) {
  /** @type {Map<string, { name: string, values: string[] }>} */
  const acc = new Map();
  for (const rule of rules) {
    if (!ruleMatches(rule, sitePath)) continue;
    for (const name of rule.detach) acc.delete(name.toLowerCase());
    for (const [name, value] of rule.set) {
      const entry = acc.get(name.toLowerCase());
      if (entry) entry.values.push(value);
      else acc.set(name.toLowerCase(), { name, values: [value] });
    }
  }
  return [...acc.values()].map(({ name, values }) => [name, values.join(', ')]);
}

/**
 * @param {Array<[string, string]>} headers
 * @param {string} name
 * @returns {string | undefined}
 */
function getHeader(headers, name) {
  return headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];
}

/**
 * Directive names present in a (possibly comma-joined, i.e. multi-policy) CSP value. Every policy is enforced by
 * browsers, so a directive present in any of them is enforced.
 * @param {string} csp
 * @returns {Set<string>}
 */
export function cspDirectiveNames(csp) {
  const names = new Set();
  for (const policy of csp.split(',')) {
    for (const directive of policy.split(';')) {
      const name = directive.trim().split(/\s+/)[0]?.toLowerCase();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Check that every HTML response would carry the required headers and CSP directives.
 * @param {HeaderRule[]} rules
 * @param {string[]} htmlSitePaths e.g. ["/index.html", "/about/index.html"]
 * @returns {Finding[]}
 */
export function checkRequiredHeaders(rules, htmlSitePaths) {
  /** @type {Finding[]} */
  const findings = [];
  /** @param {string} rule @param {string} message @param {string} path */
  const add = (rule, message, path) => findings.push({ code: ERROR_CODES.HEADERS, rule, severity: 'error', message, path });
  for (const path of htmlSitePaths) {
    const eff = effectiveHeaders(rules, path);
    for (const name of REQUIRED_HEADERS) {
      if (getHeader(eff, name) === undefined) add('required-header', `HTML response for ${path} lacks ${name}`, path);
    }
    const nosniff = getHeader(eff, 'X-Content-Type-Options');
    if (nosniff !== undefined && nosniff.trim().toLowerCase() !== 'nosniff') {
      add('nosniff', `X-Content-Type-Options for ${path} must be "nosniff", got ${JSON.stringify(nosniff)}`, path);
    }
    const csp = getHeader(eff, 'Content-Security-Policy');
    if (csp !== undefined) {
      const present = cspDirectiveNames(csp);
      for (const d of REQUIRED_CSP_DIRECTIVES) {
        if (!present.has(d)) add('csp-directive', `Content-Security-Policy for ${path} lacks the ${d} directive`, path);
      }
    }
  }
  return findings;
}

/**
 * Throw KitError(E_HEADERS) when checkRequiredHeaders reports anything. Used by every serving profile, so a site
 * whose headers are weaker than required is refused rather than served.
 * @param {HeaderPolicy} policy
 * @param {string[]} htmlSitePaths
 */
export function assertRequiredHeaders(policy, htmlSitePaths) {
  const findings = checkRequiredHeaders(policy.rules, htmlSitePaths);
  if (findings.length > 0) {
    throw new KitError(ERROR_CODES.HEADERS, `header policy (${policy.source}) is weaker than required: ${findings.map((f) => f.message).join('; ')}`, { findings });
  }
}

/**
 * The gate every serving profile applies: each servable HTML file, and the site path "/" (whose rules apply to
 * error responses for invalid or out-of-base requests), must get the required headers.
 * @param {HeaderPolicy} policy
 * @param {string[]} servable relative paths of served files
 */
export function assertServableHeaders(policy, servable) {
  const html = servable.filter((f) => contentTypeFor(f)?.startsWith('text/html')).map((f) => `/${f}`);
  assertRequiredHeaders(policy, ['/', ...html]);
}

/**
 * The site's root `_headers` if listed, else the kit default. `readText(relPath)` reads a site file.
 * @param {string[]} filePaths
 * @param {(relPath: string) => Promise<string>} readText
 * @returns {Promise<HeaderPolicy>}
 */
export async function loadHeaderPolicy(filePaths, readText) {
  if (filePaths.includes('_headers')) {
    return { rules: parseHeadersFile(await readText('_headers')), source: 'site' };
  }
  return { rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE), source: 'kit-default' };
}

/**
 * Transport-dependent headers. Strict-Transport-Security only for clearnet with an https:// public origin;
 * Onion-Location (onion origin + raw request target) only for clearnet with `onionLocation` set; nothing for
 * onion or i2p. `requestTarget` is the raw request-target (nginx `$request_uri`); defaults to the base path.
 * @param {HostConfig} hostConfig
 * @param {string} [requestTarget]
 * @returns {Array<[string, string]>}
 */
export function transportHeaders(hostConfig, requestTarget = hostConfig.basePath) {
  /** @type {Array<[string, string]>} */
  const out = [];
  if (hostConfig.transport !== 'clearnet') return out;
  if (typeof hostConfig.publicOrigin === 'string' && hostConfig.publicOrigin.startsWith('https://')) {
    out.push(['Strict-Transport-Security', HSTS_VALUE]);
  }
  if (hostConfig.onionLocation !== null && hostConfig.onionLocation !== undefined) {
    out.push(['Onion-Location', onionOrigin(hostConfig) + requestTarget]);
  }
  return out;
}

/**
 * Validated onion origin from hostConfig.onionLocation (no trailing slash).
 * @param {HostConfig} hostConfig
 * @returns {string}
 */
export function onionOrigin(hostConfig) {
  const origin = String(hostConfig.onionLocation).replace(/\/$/, '');
  if (!ONION_ORIGIN_RE.test(origin)) {
    throw new KitError(ERROR_CODES.CONFIG, `onionLocation must be an onion origin like http://<56 base32 chars>.onion, got ${JSON.stringify(hostConfig.onionLocation)}`);
  }
  return origin;
}

/**
 * Every header the kit controls on a response, apart from Content-Type/Allow/Location: the effective rules for
 * `headerPath`, then `Cache-Control: no-cache` and the transport headers for any name the rules left unset.
 * A transport header never replaces a value the site's rules set (the site may be stricter, e.g. HSTS preload).
 * @param {{ policy: HeaderPolicy, hostConfig?: HostConfig | null, headerPath: string, requestTarget: string }} args
 * @returns {Array<[string, string]>}
 */
export function kitResponseHeaders({ policy, hostConfig, headerPath, requestTarget }) {
  const out = effectiveHeaders(policy.rules, headerPath);
  const has = (/** @type {string} */ n) => out.some(([x]) => x.toLowerCase() === n.toLowerCase());
  if (!has('Cache-Control')) out.push(['Cache-Control', DEFAULT_CACHE_CONTROL]);
  for (const [name, value] of hostConfig ? transportHeaders(hostConfig, requestTarget) : []) {
    if (!has(name)) out.push([name, value]);
  }
  return out;
}

/**
 * Lower-case names of every header the kit may emit for this policy and host (for tests and generators).
 * @param {HeaderPolicy} policy
 * @param {HostConfig | null} [hostConfig]
 * @returns {string[]}
 */
export function kitHeaderNames(policy, hostConfig) {
  const names = new Set(['content-type', 'cache-control', 'allow', 'location']);
  for (const rule of policy.rules) {
    for (const [n] of rule.set) names.add(n.toLowerCase());
    for (const n of rule.detach) names.add(n.toLowerCase());
  }
  for (const [n] of hostConfig ? transportHeaders(hostConfig) : []) names.add(n.toLowerCase());
  return [...names].sort();
}
