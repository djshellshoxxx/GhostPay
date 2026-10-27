// @ts-check
// nginx profile. Re-expresses serve/routing.mjs and serve/headers.mjs as nginx configuration:
//
// - Headers: every kit-controlled header is emitted ONCE, at server level, with `add_header ... always`, from a
//   variable computed by `map` chains keyed on the final `$uri`. No location ever uses add_header, so nginx's
//   "add_header in a location drops the server-level ones" inheritance trap cannot occur, and 301/400/404/405
//   responses carry the same security headers as 200s. nginx omits a header whose value is empty. Header names
//   are written unquoted, so each is re-checked against [A-Za-z0-9-]+ here; values are always quoted.
// - Policy gate: before anything is generated, checkRequiredHeaders (serve/headers.mjs) must pass for every served
//   file and "/": nosniff everywhere (set by "/*", never detached), a restrictive CSP on html/htm/svg/xml and "/",
//   no "$" in values.
// - Routing: raw-request checks (encoding, dot/empty segments, controls, backslash) on `$request_uri`, hidden-path
//   check on `$uri`, exact locations for directory redirects, try_files for files and directory indexes, and a
//   named location for the SPA fallback.
// - MIME: an own `types {}` from MIME_TYPES, `charset utf-8` for UTF8_MIME_TYPES, `default_type text/plain`
//   (only extensionless allowlisted names such as LICENSE reach it), so Content-Type equals contentTypeFor().
//
// Output files: nginx.conf (host, loopback listener), hk-http.conf (http-level), hk-server.conf (server-level).
// The container profile reuses hk-http.conf and hk-server.conf with its own main file.

import * as path from 'node:path';
import { KitError, ERROR_CODES } from '../errors.mjs';
import { DEFAULT_CACHE_CONTROL, MIME_TYPES, NEVER_SERVED_NAMES, UTF8_MIME_TYPES } from '../policy.mjs';
import { KIT_NAME, KIT_VERSION } from '../version.mjs';
import { HSTS_VALUE, assertServableHeaders, onionOrigin, patternRegexSource } from '../serve/headers.mjs';
import { checkBasePath, createRouter, encodePath, hasControlChar, indexDirectories, servableFiles } from '../serve/routing.mjs';
import { VALID_HOST_REGEX, assertLoopbackListener } from '../serve/preview.mjs';

/** @typedef {import('../types.mjs').HeaderPolicy} HeaderPolicy */
/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('../types.mjs').Listener} Listener */
/** @typedef {{ name: string, data: Uint8Array }} OutFile */

export const NGINX_MAIN_FILE = 'nginx.conf';
export const NGINX_HTTP_FILE = 'hk-http.conf';
export const NGINX_SERVER_FILE = 'hk-server.conf';

/** Request limits, in line with deploy/nginx/nginx.conf (a static GET/HEAD-only site needs no request body). */
export const NGINX_LIMITS = Object.freeze([
  'client_max_body_size 64k;',
  'client_body_timeout 10s;',
  'client_header_timeout 10s;',
  'keepalive_timeout 15s;',
  'send_timeout 15s;',
  'client_header_buffer_size 1k;',
  'large_client_header_buffers 4 8k;',
]);

const HEX = '[0-9A-Fa-f]';
const CONT = `%[89ABab]${HEX}`;
/** Percent-encoded multi-byte UTF-8 sequences that decodeURIComponent accepts (RFC 3629 well-formed). */
export const PCT_UTF8_MULTIBYTE = [
  `%[Cc][2-9A-Fa-f]${CONT}`,
  `%[Dd]${HEX}${CONT}`,
  `%[Ee]0%[AaBb]${HEX}${CONT}`,
  `%[Ee][1-9A-Ca-cEeFf]${CONT}${CONT}`,
  `%[Ee][Dd]%[89]${HEX}${CONT}`,
  `%[Ff]0%[9AaBb]${HEX}${CONT}${CONT}`,
  `%[Ff][1-3]${CONT}${CONT}${CONT}`,
  `%[Ff]4%8${HEX}${CONT}${CONT}`,
].join('|');
/** One unit of a path that decodes without error (ASCII literal, %00-%7F, or a well-formed UTF-8 sequence). */
export const PCT_VALID_UNIT = `[^%?#]|%[0-7]${HEX}|${PCT_UTF8_MULTIBYTE}`;

const SEP = '(?:/|%2[Ff])';
const DOT = '(?:\\.|%2[Ee])';
// Possessive: an absolute-form "scheme://authority" prefix is consumed once and never re-scanned as a path.
const ABS_PREFIX = '^(?:[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*)?+';

/**
 * PCRE (nginx) regex matching a `$request_uri` whose path routing.decodeRequestPath() rejects: control characters,
 * DEL or backslash (literal or encoded), empty/"."/".." segments ("/" or "%2F" separated, dots literal or encoded),
 * or percent-encoded bytes that are not well-formed UTF-8. Malformed "%" escapes never get here (nginx: 400).
 */
export const NGINX_BAD_PATH_REGEX = `${ABS_PREFIX}(?:[^?#]*?(?:%[01]${HEX}|%7[Ff]|\\\\|%5[Cc])|[^?#]*?${SEP}(?:${SEP}|${DOT}${DOT}?(?:${SEP}|[?#]|$))|(?!(?:${PCT_VALID_UNIT})*(?:[?#]|$)))`;

/** Raw bytes Node's HTTP parser rejects in a request-target (it answers 400); nginx is told to do the same. */
export const NGINX_RAW_400_REGEX = '[\\x7f-\\xff]';

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * Double-quoted nginx string. `allowDollar` only for regex keys and for values whose variables we generated.
 * @param {string} s
 * @param {{ allowDollar?: boolean, what?: string }} [opts]
 * @returns {string}
 */
export function nginxQuote(s, { allowDollar = false, what = 'value' } = {}) {
  if (hasControlChar(s)) throw new KitError(ERROR_CODES.UNSUPPORTED, `${what} contains control characters: ${JSON.stringify(s)}`);
  if (!allowDollar && s.includes('$')) {
    throw new KitError(ERROR_CODES.UNSUPPORTED, `${what} contains "$", which nginx would interpolate as a variable: ${JSON.stringify(s)}`);
  }
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A header name as an unquoted nginx token: only [A-Za-z0-9-] (the parser enforces the same; this guards policies
 * built by other code).
 * @param {string} name
 * @returns {string}
 */
export function nginxHeaderName(name) {
  if (!/^[A-Za-z0-9-]+$/.test(name)) throw new KitError(ERROR_CODES.UNSUPPORTED, `header name ${JSON.stringify(name)} is not [A-Za-z0-9-]+`);
  return name;
}

/**
 * @param {Listener} listener
 * @returns {string} the `listen` directive
 */
export function nginxListen(listener) {
  assertLoopbackListener(listener);
  if (listener.kind === 'unix') return `listen unix:${listener.path} default_server;`;
  if (listener.port < 1) throw new KitError(ERROR_CODES.NETWORK_SCOPE, 'nginx needs a fixed port (1-65535)');
  const host = listener.host === '::1' ? '[::1]' : listener.host;
  return `listen ${host}:${listener.port} default_server;`;
}

/**
 * @param {string} p
 * @returns {string}
 */
function checkAbsoluteDir(p) {
  if (typeof p !== 'string' || !path.posix.isAbsolute(p)) throw new KitError(ERROR_CODES.USAGE, `wwwRoot must be an absolute POSIX path, got ${JSON.stringify(p)}`);
  nginxQuote(p, { what: 'wwwRoot' });
  return p;
}

/**
 * @typedef {object} HeaderOp
 * @property {number} rule      rule index
 * @property {boolean} detach
 * @property {string | null} set joined value set by this rule, or null
 */

/**
 * Per header name (lower case): canonical name and the ordered rule operations touching it.
 * @param {HeaderPolicy} policy
 * @returns {Map<string, { name: string, ops: HeaderOp[] }>}
 */
function headerOps(policy) {
  /** @type {Map<string, { name: string, ops: HeaderOp[] }>} */
  const byName = new Map();
  policy.rules.forEach((rule, i) => {
    const names = new Map([...rule.detach, ...rule.set.map(([n]) => n)].map((n) => [n.toLowerCase(), n]));
    for (const [lower, name] of names) {
      const values = rule.set.filter(([n]) => n.toLowerCase() === lower).map(([, v]) => v);
      const entry = byName.get(lower) ?? { name, ops: [] };
      entry.ops.push({ rule: i, detach: rule.detach.some((n) => n.toLowerCase() === lower), set: values.length ? values.join(', ') : null });
      byName.set(lower, entry);
    }
  });
  return new Map([...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Default values for headers when no rule sets them: Cache-Control and the transport headers.
 * Values may reference $request_uri (Onion-Location).
 * @param {HostConfig} hostConfig
 * @returns {Map<string, { name: string, value: string }>}
 */
function headerDefaults(hostConfig) {
  const m = new Map([['cache-control', { name: 'Cache-Control', value: DEFAULT_CACHE_CONTROL }]]);
  if (hostConfig.transport === 'clearnet') {
    if (typeof hostConfig.publicOrigin === 'string' && hostConfig.publicOrigin.startsWith('https://')) {
      m.set('strict-transport-security', { name: 'Strict-Transport-Security', value: HSTS_VALUE });
    }
    if (hostConfig.onionLocation !== null && hostConfig.onionLocation !== undefined) {
      m.set('onion-location', { name: 'Onion-Location', value: `${onionOrigin(hostConfig)}$request_uri` });
    }
  }
  return m;
}

/**
 * Map chain computing one header's value from the rule-match variables. Returns [lines, finalVariable].
 * @param {number} j header index
 * @param {HeaderOp[]} ops
 * @returns {[string[], string]}
 */
function headerChain(j, ops) {
  /** @type {string[]} */
  const out = [];
  let prev = '""';
  ops.forEach((op, k) => {
    const cur = `$hk_h${j}_${k}`;
    const r = `$hk_r${op.rule}`;
    const setQ = op.set === null ? null : nginxQuote(op.set, { what: 'header value' });
    if (op.detach || setQ === null || prev === '""') {
      out.push(`map ${r} ${cur} {`, '  volatile;', `  "1" ${setQ ?? '""'};`, `  default ${prev};`, '}');
    } else {
      out.push(
        `map "${r}|${prev}" ${cur} {`, '  volatile;',
        `  "~^1\\|$" ${setQ};`,
        `  "~^1\\|(?<hk_v>.+)$" "\${hk_v}, ${setQ.slice(1)};`,
        `  default ${prev};`, '}',
      );
    }
    prev = cur;
  });
  return [out, prev];
}

/**
 * @param {{ files: string[], entrypoint: string, hostConfig: HostConfig, policy: HeaderPolicy }} a
 */
function buildModel({ files, entrypoint, hostConfig, policy }) {
  const basePath = checkBasePath(hostConfig.basePath);
  createRouter({ files, entrypoint, basePath }); // validates entrypoint and paths exactly as the preview does
  const servable = servableFiles(files);
  assertServableHeaders(policy, servable);
  return { basePath, servable, entrypoint, policy, hostConfig };
}

/**
 * @param {ReturnType<typeof buildModel>} m
 * @returns {string}
 */
function renderHttp(m) {
  const byType = new Map();
  for (const [ext, type] of Object.entries(MIME_TYPES)) byType.set(type, [...(byType.get(type) ?? []), ext]);
  const bare = m.basePath.slice(0, -1);
  const relBase = escapeRegex(m.basePath);
  const hiddenNames = NEVER_SERVED_NAMES.map(escapeRegex).join('|');
  const lines = [
    `# Generated by ${KIT_NAME} ${KIT_VERSION}. http-level part of the site profile; do not edit by hand.`,
    'types {',
    ...[...byType].map(([type, exts]) => `  ${type} ${exts.join(' ')};`),
    '}',
    '# Only extensionless allowlisted names (LICENSE, NOTICE, COPYING) get the default type; it is never sniffable',
    '# because every response carries X-Content-Type-Options: nosniff.',
    'default_type text/plain;',
    'charset utf-8;',
    `charset_types ${UTF8_MIME_TYPES.filter((t) => t !== 'text/html').join(' ')};`,
    'server_tokens off;',
    'access_log off;',
    'log_not_found off;',
    'log_subrequest off;',
    'sendfile on;',
    'autoindex off;',
    'disable_symlinks on;',
    '# ETag/Last-Modified come from the exported files, whose mtimes exportStatic() copies from the site, so the',
    '# preview emulates the same 304/412 decisions. Range requests are disabled (always a full 200).',
    'etag on;',
    'if_modified_since exact;',
    'max_ranges 0;',
    'absolute_redirect off;',
    'port_in_redirect off;',
    'server_name_in_redirect off;',
    'msie_padding off;',
    ...NGINX_LIMITS,
    '',
    '# Raw request checks: "400" = bytes the preview\'s HTTP parser rejects, "404" = path routing rejects.',
    'map $request_uri $hk_raw {',
    `  ${nginxQuote(`~${NGINX_RAW_400_REGEX}`, { allowDollar: true })} "400";`,
    `  ${nginxQuote(`~${NGINX_BAD_PATH_REGEX}`, { allowDollar: true })} "404";`,
    '  default "";',
    '}',
    '# Hidden paths below the base path (rule 4): dot segments except a first ".well-known", never-served names.',
    'map $uri $hk_hidden {',
    '  volatile;',
    `  ${nginxQuote(`~^${relBase}(?:(?!\\.well-known(?:/|$))\\.|(?:[^/]*/)+\\.|(?:[^/]*/)*(?:${hiddenNames})(?:/|$))`, { allowDollar: true })} "1";`,
    '  default "";',
    '}',
    '# try_files candidate: "<dir>/" -> "<dir>/index.html" (rule 5).',
    'map $uri $hk_try {',
    '  volatile;',
    '  "~/$" "${uri}index.html";',
    '  default $uri;',
    '}',
    '# Last non-empty segment below the base path contains "." -> 404 instead of the SPA fallback (rule 7).',
    'map $uri $hk_lastdot {',
    '  volatile;',
    `  ${nginxQuote(`~^${relBase}(?:[^/]*/)*[^/]*\\.[^/]*/?$`, { allowDollar: true })} "1";`,
    '  default "";',
    '}',
    '# Site path whose _headers rules apply: the final $uri below the base path, or "/" for invalid/outside requests.',
    'map "$hk_raw|$uri" $hk_path {',
    '  volatile;',
    `  ${nginxQuote(`~^\\|${escapeRegex(bare)}(?<hk_rel>/[\\s\\S]*)$`, { allowDollar: true })} $hk_rel;`,
    '  default "/";',
    '}',
    '# Host header validation as in nginx 1.30 (older versions accept more); empty = HTTP/1.0 without Host.',
    'map $http_host $hk_bad_host {',
    '  "" "";',
    `  ${nginxQuote(`~${VALID_HOST_REGEX}`, { allowDollar: true })} "";`,
    '  default "1";',
    '}',
    'map $status $hk_allow {',
    '  405 "GET, HEAD";',
    '  default "";',
    '}',
  ];
  m.policy.rules.forEach((rule, i) => {
    lines.push(`# rule ${i}: ${rule.pattern}`, `map $hk_path $hk_r${i} {`, '  volatile;', `  ${nginxQuote(`~${patternRegexSource(rule.pattern)}`, { allowDollar: true })} "1";`, '  default "";', '}');
  });
  const defaults = headerDefaults(m.hostConfig);
  [...headerOps(m.policy)].forEach(([lower, { name, ops }], j) => {
    const [chain, last] = headerChain(j, ops);
    lines.push(`# ${name}`, ...chain);
    const def = defaults.get(lower);
    if (def) {
      lines.push(`map ${last} $hk_h${j} {`, '  volatile;', `  "" ${nginxQuote(def.value, { allowDollar: true })};`, `  default ${last};`, '}');
    } else {
      lines.push(`map ${last} $hk_h${j} {`, '  volatile;', `  default ${last};`, '}');
    }
  });
  return `${lines.join('\n')}\n`;
}

/**
 * @param {ReturnType<typeof buildModel>} m
 * @returns {string}
 */
function renderServer(m) {
  const ops = headerOps(m.policy);
  const defaults = headerDefaults(m.hostConfig);
  /** @type {string[]} */
  const adds = [];
  [...ops].forEach(([, { name }], j) => adds.push(`add_header ${nginxHeaderName(name)} $hk_h${j} always;`));
  for (const [lower, { name, value }] of defaults) {
    if (!ops.has(lower)) adds.push(`add_header ${nginxHeaderName(name)} ${nginxQuote(value, { allowDollar: true })} always;`);
  }
  adds.push('add_header Allow $hk_allow always;');
  const base = m.basePath;
  const bare = base.slice(0, -1);
  const lines = [
    `# Generated by ${KIT_NAME} ${KIT_VERSION}. server-level part of the site profile; do not edit by hand.`,
    '# Every kit-controlled header is added here, once, with "always". No location below may use add_header:',
    '# nginx would then drop all of these for that location.',
    'server_name _;',
    ...adds,
    '',
    'if ($hk_raw = 400) { return 400; }',
    'if ($hk_bad_host) { return 400; }',
    'if ($request_method !~ "^(?:GET|HEAD)$") { return 405; }',
    'if ($hk_raw = 404) { return 404; }',
    'if ($hk_hidden) { return 404; }',
  ];
  if (base !== '/') {
    lines.push(`location = ${nginxQuote(bare, { what: 'basePath' })} { return 301 ${nginxQuote(base, { what: 'basePath' })}; }`);
    lines.push('location / { return 404; }');
  }
  for (const dir of [...indexDirectories(m.servable)].sort()) {
    lines.push(`location = ${nginxQuote(`${base}${dir}`, { what: 'directory path' })} { return 301 ${nginxQuote(encodePath(`${base}${dir}/`), { what: 'redirect' })}; }`);
  }
  lines.push(
    `location ${nginxQuote(base, { what: 'basePath' })} {`,
    '  try_files $hk_try @hk_next;',
    '}',
    'location @hk_next {',
    '  if ($hk_lastdot) { return 404; }',
    `  try_files ${nginxQuote(`${base}${m.entrypoint}`, { what: 'entrypoint' })} =404;`,
    '}',
  );
  return `${lines.join('\n')}\n`;
}

/**
 * Main configuration file around the shared parts.
 * @param {{ listen: string, root: string, pidFile: string, tempDir: string, comment: string[] }} a
 * @returns {string}
 */
export function renderNginxMain({ listen, root, pidFile, tempDir, comment }) {
  const temp = (/** @type {string} */ n) => (tempDir === '' ? n : `${tempDir}/${n}`);
  return [
    `# Generated by ${KIT_NAME} ${KIT_VERSION}.`,
    ...comment.map((c) => `# ${c}`),
    'worker_processes 1;',
    `pid ${nginxQuote(pidFile, { what: 'pid path' })};`,
    'error_log stderr error;',
    'events { worker_connections 256; }',
    'http {',
    `  client_body_temp_path ${nginxQuote(temp('client_body_temp'))};`,
    `  proxy_temp_path ${nginxQuote(temp('proxy_temp'))};`,
    `  fastcgi_temp_path ${nginxQuote(temp('fastcgi_temp'))};`,
    `  uwsgi_temp_path ${nginxQuote(temp('uwsgi_temp'))};`,
    `  scgi_temp_path ${nginxQuote(temp('scgi_temp'))};`,
    `  include ${NGINX_HTTP_FILE};`,
    '  server {',
    `    ${listen}`,
    `    root ${nginxQuote(root, { what: 'root' })};`,
    `    include ${NGINX_SERVER_FILE};`,
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * Generate the nginx profile. Refuses non-loopback listeners (E_NETWORK_SCOPE), header policies weaker than
 * required (E_HEADERS, see checkRequiredHeaders) and values nginx cannot express (E_UNSUPPORTED). `wwwRoot` is exportStatic()'s wwwRoot (files live under `<wwwRoot><basePath>`).
 * Run unprivileged: `nginx -p <writable runtime dir>/ -e stderr -c <dir>/nginx.conf` (pid and temp paths are
 * relative to -p).
 * @param {{ files: string[], entrypoint: string, hostConfig: HostConfig, policy: HeaderPolicy, wwwRoot: string }} a
 * @returns {{ files: OutFile[] }}
 */
export function generateNginx({ files, entrypoint, hostConfig, policy, wwwRoot }) {
  const listen = nginxListen(hostConfig.listen);
  const root = checkAbsoluteDir(wwwRoot);
  const m = buildModel({ files, entrypoint, hostConfig, policy });
  const main = renderNginxMain({
    listen,
    root,
    pidFile: 'nginx.pid',
    tempDir: '',
    comment: [
      `Site "${hostConfig.mirrorLabel.replace(/[^\x20-\x7e]/g, '?')}", transport ${hostConfig.transport}, base path ${m.basePath}.`,
      'Run unprivileged from a writable runtime directory (pid and temp files are created there):',
      '  nginx -p /path/to/runtime/ -e stderr -c /path/to/this/nginx.conf',
      'Test: add -t. Logs: none (access_log off); errors go to stderr.',
    ],
  });
  const enc = new TextEncoder();
  return {
    files: [
      { name: NGINX_MAIN_FILE, data: enc.encode(main) },
      { name: NGINX_HTTP_FILE, data: enc.encode(renderHttp(m)) },
      { name: NGINX_SERVER_FILE, data: enc.encode(renderServer(m)) },
    ],
  };
}
