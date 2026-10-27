// @ts-check
// Explicit inclusion policy. FROZEN for parallel work: change only through the coordinator.
//
// A file is packaged only if (1) its path passes the path rules, (2) no deny rule matches, and (3) its extension or
// exact name is on the allowlist below. The secret/state deny rules exist to give a precise reason for the most
// dangerous mistakes; they are NOT the safety mechanism. The allowlist is. A content scan for secrets runs in
// addition and is documented as heuristic.

/** @typedef {import('./types.mjs').Limits} Limits */

export const POLICY_ID = 'ghostpay.static-site-policy';
export const POLICY_VERSION = 1;

/** @type {Readonly<Limits>} */
export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 20000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxFileBytes: 64 * 1024 * 1024,
  maxPathBytes: 240,
  maxSegmentBytes: 120,
  maxDepth: 32,
  maxDirEntries: 50000,
});

/**
 * Allowed file extensions (lowercase, without dot) and the exact Content-Type every server profile must send.
 * Both the preview server and the generated nginx `types {}` block are derived from this table so they agree.
 * @type {Readonly<Record<string, string>>}
 */
export const MIME_TYPES = Object.freeze({
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  webmanifest: 'application/manifest+json',
  txt: 'text/plain',
  md: 'text/markdown',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
});

/** MIME types that are served with "; charset=utf-8". */
export const UTF8_MIME_TYPES = Object.freeze([
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/manifest+json',
  'text/plain',
  'text/markdown',
  'application/xml',
  'image/svg+xml',
]);

/** Extensionless file names allowed anywhere (case-sensitive). `_headers` is packaged but never served. */
export const ALLOWED_EXACT_NAMES = Object.freeze(['_headers', 'LICENSE', 'NOTICE', 'COPYING']);

/** Names that are packaged but must never be served by any profile. */
export const NEVER_SERVED_NAMES = Object.freeze(['_headers']);

/** The only hidden directory allowed (RFC 8615). */
export const ALLOWED_HIDDEN_DIRS = Object.freeze(['.well-known']);

/** Extensions scanned as text for secrets and external references. */
export const TEXT_EXTENSIONS = Object.freeze(['html', 'htm', 'css', 'js', 'mjs', 'json', 'map', 'webmanifest', 'txt', 'md', 'xml', 'svg']);

/** Extensions treated as data/config (name-based credential rules apply to these; code is content-scanned). */
const DATA_LIKE_EXTENSIONS = new Set(['', 'json', 'txt', 'xml', 'yml', 'yaml', 'ini', 'conf', 'cfg', 'toml', 'properties', 'env', 'csv', 'tsv', 'md']);

/**
 * @param {string} lowerPath
 * @returns {boolean}
 */
function isDataLike(lowerPath) {
  return DATA_LIKE_EXTENSIONS.has(extensionOf(lowerPath));
}

/**
 * Deny rules. `test` receives the lowercase relative path and its lowercase segments. Order matters: the first
 * matching rule is reported. code "E_SECRET" = secret or runtime state; "E_POLICY" = not static content.
 * @type {ReadonlyArray<{ rule: string, code: 'E_SECRET' | 'E_POLICY', reason: string, test: (p: string, segs: string[]) => boolean }>}
 */
export const DENY_RULES = Object.freeze([
  {
    rule: 'tor-onion-identity',
    code: 'E_SECRET',
    reason: 'Tor onion service identity or state (HiddenServiceDir contents)',
    test: (_p, s) => s.some((x) => /^hs_ed25519_(secret|public)_key$/.test(x) || x === 'authorized_clients' || x === 'onion_service_non_anonymous') || s.some((x) => ['hidden_service', 'hiddenservice', 'onion-service', 'onion_service', 'tor-data', 'tor_data'].includes(x)),
  },
  {
    rule: 'i2p-destination-keys',
    code: 'E_SECRET',
    reason: 'I2P destination private keys or router state',
    test: (p, s) => /\.dat$/.test(p) || s.some((x) => ['i2p-keys', 'i2pd', '.i2p', 'i2p-data', 'netdb'].includes(x)),
  },
  {
    rule: 'private-key-file',
    code: 'E_SECRET',
    reason: 'private key, certificate key store or SSH key',
    test: (p, s) => /\.(pem|key|p8|p12|pfx|jks|keystore|ppk|kdbx|gpg|pgp|asc)$/.test(p) || s.some((x) => /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(x)),
  },
  {
    rule: 'wallet-or-seed',
    code: 'E_SECRET',
    reason: 'wallet file, keystore or seed/mnemonic material',
    test: (p, s) => s.some((x) => x === 'wallet.dat' || /^utc--/.test(x) || x === 'keystore') || (isDataLike(p) && /(mnemonic|seed[-_ ]?phrase|recovery[-_ ]?phrase)/.test(s[s.length - 1] ?? '')),
  },
  {
    rule: 'credentials-or-env',
    code: 'E_SECRET',
    reason: 'environment file, credentials, tokens or package-manager auth',
    test: (p, s) => s.some((x) => /^\.env(\..*)?$/.test(x) || /^(\.npmrc|\.netrc|\.htpasswd|\.pgpass|\.git-credentials)$/.test(x)) || (isDataLike(p) && /(credential|secret|token|apikey|api_key|passwd|password)/.test(s[s.length - 1] ?? '')),
  },
  {
    rule: 'secret-directory',
    code: 'E_SECRET',
    reason: 'directory conventionally used for keys, secrets, private data or backups',
    test: (_p, s) => s.slice(0, -1).some((x) => ['keys', 'secrets', 'private', 'backup', 'backups', '.ssh', '.gnupg'].includes(x)),
  },
  {
    rule: 'database-or-backup',
    code: 'E_SECRET',
    reason: 'database, dump, backup or user data export',
    test: (p) => /\.(sqlite|sqlite3|db|db3|sql|dump|bak|backup|old|orig|ldb|mdb|accdb|realm)$/.test(p) || /\.(sqlite|db)-(wal|shm|journal)$/.test(p),
  },
  {
    rule: 'runtime-state',
    code: 'E_SECRET',
    reason: 'session data, logs, editor swap files, OS metadata or process state',
    test: (p, s) => /(\.(log|swp|swo|tmp|pid|sock|session)|~)$/.test(p) || s.some((x) => ['sessions', 'session', '.ds_store', 'thumbs.db', 'desktop.ini', '__macosx'].includes(x)),
  },
  {
    rule: 'vcs-or-dependencies',
    code: 'E_POLICY',
    reason: 'version-control metadata or dependency tree',
    test: (_p, s) => s.some((x) => ['.git', '.svn', '.hg', 'node_modules', 'bower_components'].includes(x)),
  },
  {
    rule: 'server-side-code',
    code: 'E_POLICY',
    reason: 'server-side code or server configuration; a static host must not execute or expose it',
    test: (p, s) => /\.(php\d?|phtml|cgi|pl|py|rb|sh|bash|asp|aspx|jsp|exe|dll|so|bat|cmd|ps1)$/.test(p) || s.some((x) => ['.htaccess', 'web.config', 'cgi-bin'].includes(x)),
  },
]);

/** Content patterns that mark a text file as containing a secret. Heuristic: absence proves nothing. */
export const SECRET_CONTENT_PATTERNS = Object.freeze([
  // Written as PRIVATE[ ]KEY-{5} so this detector does not itself match scripts/scan-secrets.sh (same strings matched).
  { rule: 'pem-private-key', re: /-{5}BEGIN (?:[A-Z0-9]+ )*PRIVATE[ ]KEY-{5}/ },
  { rule: 'tor-secret-key-blob', re: /== ed25519v1-secret: type0 ==/ },
  { rule: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { rule: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { rule: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: 'stripe-live-secret', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/ },
  { rule: 'labelled-hex-private-key', re: /(?:private[_-]?key|privkey|secret[_-]?key|mnemonic|seed)["']?\s*[:=]\s*["']?(?:0x)?[0-9a-fA-F]{64}\b/i },
  { rule: 'bip39-like-phrase', re: /(?:mnemonic|seed[_ -]?phrase|recovery[_ -]?phrase)["']?\s*[:=]\s*["'](?:[a-z]{3,8} ){11,23}[a-z]{3,8}["']/i },
]);

/** Binary-safe magic prefixes that identify secret files regardless of name. */
export const SECRET_MAGIC_PREFIXES = Object.freeze([
  { rule: 'tor-secret-key-blob', prefix: '== ed25519v1-secret: type0 ==' },
  { rule: 'sqlite-database', prefix: 'SQLite format 3\u0000' },
]);

/**
 * Response headers every served HTML response must carry (case-insensitive names). A site whose `_headers` file
 * lacks one of these is rejected rather than silently weakened.
 */
export const REQUIRED_HEADERS = Object.freeze(['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']);

/** CSP directives that must be present in the effective policy for HTML. */
export const REQUIRED_CSP_DIRECTIVES = Object.freeze(['default-src', 'object-src', 'base-uri', 'frame-ancestors']);

/**
 * Header rules applied when a site ships no `_headers` file. Same strict baseline as GhostPay's
 * apps/web/public/_headers (minus app-specific Permissions-Policy entries). A site that needs inline scripts,
 * third-party origins or framing must ship its own `_headers`; the kit never loosens this default.
 */
export const KIT_DEFAULT_HEADERS_FILE = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'self'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: accelerometer=(), autoplay=(), bluetooth=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=(), xr-spatial-tracking=()
  Cross-Origin-Opener-Policy: same-origin
`;

/** Cache-Control used when no header rule sets one: always revalidate. */
export const DEFAULT_CACHE_CONTROL = 'no-cache';

/** Default entrypoint. */
export const DEFAULT_ENTRYPOINT = 'index.html';

/** Default appId recorded in manifests. */
export const DEFAULT_APP_ID = 'ghostpay-web';

/**
 * @param {string} relPath
 * @returns {string} lowercase extension without dot, or "" when none
 */
export function extensionOf(relPath) {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * Content-Type header value for a relative path, or null if the type is not on the allowlist.
 * @param {string} relPath
 * @returns {string | null}
 */
export function contentTypeFor(relPath) {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  if (ALLOWED_EXACT_NAMES.includes(base) && extensionOf(relPath) === '') return 'text/plain; charset=utf-8';
  const mime = MIME_TYPES[extensionOf(relPath)];
  if (mime === undefined) return null;
  return UTF8_MIME_TYPES.includes(mime) ? `${mime}; charset=utf-8` : mime;
}
