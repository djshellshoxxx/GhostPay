// @ts-check
// Public, host-specific configuration: parse, validate, default. Contains no secrets and no application trust
// settings. Chain IDs, contract addresses, RPC URLs and similar belong to the application build and are reviewed
// there; the kit refuses them here so nobody mistakes a hosting overlay for a way to change them.
import { createHash } from 'node:crypto';
import { KitError, ERROR_CODES } from '../errors.mjs';
import { HOST_CONFIG_SCHEMA_VERSION } from '../version.mjs';

/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('../types.mjs').Listener} Listener */

const KEYS = ['schemaVersion', 'transport', 'publicOrigin', 'basePath', 'listen', 'mirrorLabel', 'onionLocation'];
const TRANSPORTS = /** @type {const} */ (['clearnet', 'onion', 'i2p']);
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

/** Key fragments that indicate secrets or app trust settings (matched case-insensitively). */
const FORBIDDEN_KEY_HINTS = [
  { re: /(private|secret|seed|mnemonic|passw|token|apikey|api_key|credential|wallet|signing|keyfile|^key$|privkey)/i, why: 'looks like a secret; secrets never belong in public host configuration' },
  { re: /(chain|contract|router|announcer|relayer|rpc|feerecipient|fee_recipient|address|manifest|trust|deployment)/i, why: 'is application trust configuration; it is compiled into the app build and the kit never rewrites it' },
];

/**
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {never}
 */
function fail(message, details) {
  throw new KitError(ERROR_CODES.CONFIG, message, details);
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * RFC 4648 base32 decode (lowercase, no padding).
 * @param {string} s
 * @returns {Buffer | null}
 */
function base32Decode(s) {
  let bits = 0;
  let value = 0;
  /** @type {number[]} */
  const out = [];
  for (const ch of s) {
    const i = BASE32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * True if `label` (without ".onion") is a valid v3 onion address: base32(pubkey[32] | checksum[2] | version[1]),
 * checksum = SHA3-256(".onion checksum" | pubkey | version)[:2], version = 3 (Tor rend-spec-v3).
 * @param {string} label
 * @returns {boolean}
 */
export function isValidOnionV3Label(label) {
  if (!/^[a-z2-7]{56}$/.test(label)) return false;
  const raw = base32Decode(label);
  if (raw === null || raw.length !== 35) return false;
  const pubkey = raw.subarray(0, 32);
  const checksum = raw.subarray(32, 34);
  const version = raw.subarray(34, 35);
  if (version[0] !== 3) return false;
  const h = createHash('sha3-256').update(Buffer.from('.onion checksum')).update(pubkey).update(version).digest();
  return h[0] === checksum[0] && h[1] === checksum[1];
}

/**
 * Parse an origin string into URL parts, refusing anything that is not a bare origin.
 * @param {string} field
 * @param {unknown} v
 * @returns {URL}
 */
function parseOrigin(field, v) {
  if (typeof v !== 'string' || v.length > 300) fail(`${field} must be a string origin such as https://example.org`);
  /** @type {URL} */
  let u;
  try {
    u = new URL(v);
  } catch {
    return fail(`${field} is not a valid URL: ${JSON.stringify(v)}`);
  }
  if (u.username !== '' || u.password !== '') fail(`${field} must not contain credentials`);
  if ((u.pathname !== '/' && u.pathname !== '') || u.search !== '' || u.hash !== '' || v.endsWith('/')) {
    fail(`${field} must be an origin without path, query or fragment (use basePath for a subpath): ${v}`);
  }
  return u;
}

/**
 * @param {string} field
 * @param {unknown} v
 * @returns {string} normalized origin
 */
export function validateOnionOrigin(field, v) {
  const u = parseOrigin(field, v);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') fail(`${field} must use http: or https:`);
  const m = /^([a-z2-7]{56})\.onion$/.exec(u.hostname);
  if (m === null || m[1] === undefined) fail(`${field} must be a v3 onion origin (56 base32 characters + .onion)`);
  if (!isValidOnionV3Label(m[1])) fail(`${field} has an invalid v3 onion checksum or version: ${u.hostname}`);
  return u.origin;
}

/**
 * @param {string} field
 * @param {unknown} v
 * @returns {string}
 */
function validateI2pOrigin(field, v) {
  const u = parseOrigin(field, v);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') fail(`${field} must use http: or https:`);
  // b32 = 52 chars; encrypted-leaseset "b33" addresses are 56+ chars with the same .b32.i2p suffix.
  if (!/^[a-z2-7]{52,}\.b32\.i2p$/.test(u.hostname)) fail(`${field} must be a .b32.i2p origin (52+ base32 characters)`);
  return u.origin;
}

/**
 * @param {string} field
 * @param {unknown} v
 * @returns {string}
 */
function validateClearnetOrigin(field, v) {
  const u = parseOrigin(field, v);
  if (u.protocol !== 'https:') fail(`${field} must use https:// for clearnet hosting (plain HTTP lets the network swap the bundle)`);
  if (/\.(onion|i2p)$/.test(u.hostname)) fail(`${field} is an onion/I2P host; set transport accordingly`);
  return u.origin;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
export function validateBasePath(v) {
  if (typeof v !== 'string') return fail('basePath must be a string such as "/" or "/mirror/"');
  if (v === '/') return v;
  if (!v.startsWith('/') || !v.endsWith('/') || v.length > 200) fail(`basePath must start and end with "/": ${JSON.stringify(v)}`);
  for (const seg of v.slice(1, -1).split('/')) {
    if (!/^[A-Za-z0-9._~-]+$/.test(seg) || seg === '.' || seg === '..' || seg.startsWith('.')) {
      fail(`basePath segment ${JSON.stringify(seg)} is not allowed (use letters, digits, "-", "_", "~", "."; no dot segments)`);
    }
  }
  return v;
}

/**
 * @param {unknown} v
 * @returns {Listener}
 */
export function validateListener(v) {
  if (!isPlainObject(v)) return fail('listen must be an object: {"kind":"tcp","host":"127.0.0.1","port":8080} or {"kind":"unix","path":"/run/..."}');
  if (v['kind'] === 'tcp') {
    const extra = Object.keys(v).filter((k) => !['kind', 'host', 'port'].includes(k));
    if (extra.length > 0) fail(`listen has unknown fields: ${extra.join(', ')}`);
    const host = v['host'];
    const port = v['port'];
    if (typeof host !== 'string' || !LOOPBACK_HOSTS.includes(host)) {
      throw new KitError(ERROR_CODES.NETWORK_SCOPE, `listen.host must be a loopback address (${LOOPBACK_HOSTS.join(' or ')}); got ${JSON.stringify(host)}. Put a TLS terminator, Tor or an I2P router in front instead of exposing this listener.`);
    }
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) fail('listen.port must be an integer 1024-65535 (unprivileged)');
    return { kind: 'tcp', host, port };
  }
  if (v['kind'] === 'unix') {
    const extra = Object.keys(v).filter((k) => !['kind', 'path'].includes(k));
    if (extra.length > 0) fail(`listen has unknown fields: ${extra.join(', ')}`);
    const p = v['path'];
    if (typeof p !== 'string' || !p.startsWith('/') || p.includes('\0') || Buffer.byteLength(p) > 100 || p.split('/').includes('..')) {
      fail('listen.path must be an absolute unix socket path of at most 100 bytes without ".." segments');
    }
    return { kind: 'unix', path: p };
  }
  return fail('listen.kind must be "tcp" or "unix"');
}

/**
 * Validate a parsed JSON value as HostConfig. Unknown fields are rejected.
 * @param {unknown} value
 * @returns {HostConfig}
 */
export function parseHostConfig(value) {
  if (!isPlainObject(value)) return fail('host configuration must be a JSON object');
  for (const k of Object.keys(value)) {
    if (KEYS.includes(k)) continue;
    const hint = FORBIDDEN_KEY_HINTS.find((h) => h.re.test(k));
    if (hint !== undefined) fail(`field ${JSON.stringify(k)} ${hint.why}`, { field: k });
    fail(`unknown field ${JSON.stringify(k)} (allowed: ${KEYS.join(', ')})`, { field: k });
  }
  if (value['schemaVersion'] !== HOST_CONFIG_SCHEMA_VERSION) fail(`schemaVersion must be ${HOST_CONFIG_SCHEMA_VERSION}`);
  const transport = value['transport'];
  if (typeof transport !== 'string' || !(/** @type {readonly string[]} */ (TRANSPORTS)).includes(transport)) fail(`transport must be one of ${TRANSPORTS.join(', ')}`);
  const t = /** @type {'clearnet' | 'onion' | 'i2p'} */ (transport);

  const rawOrigin = value['publicOrigin'] ?? null;
  /** @type {string | null} */
  let publicOrigin = null;
  if (rawOrigin !== null) {
    if (t === 'clearnet') publicOrigin = validateClearnetOrigin('publicOrigin', rawOrigin);
    else if (t === 'onion') publicOrigin = validateOnionOrigin('publicOrigin', rawOrigin);
    else publicOrigin = validateI2pOrigin('publicOrigin', rawOrigin);
  }

  const basePath = validateBasePath(value['basePath'] ?? '/');
  const listen = validateListener(value['listen'] ?? { kind: 'tcp', host: '127.0.0.1', port: 8080 });

  const label = value['mirrorLabel'] ?? 'mirror';
  if (typeof label !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(label)) fail('mirrorLabel must be 1-64 characters: letters, digits, space, ".", "_", "-"');

  const rawOnionLocation = value['onionLocation'] ?? null;
  /** @type {string | null} */
  let onionLocation = null;
  if (rawOnionLocation !== null) {
    if (t !== 'clearnet') fail('onionLocation is only meaningful for clearnet hosting (it advertises an onion mirror)');
    onionLocation = validateOnionOrigin('onionLocation', rawOnionLocation);
  }

  return { schemaVersion: 1, transport: t, publicOrigin, basePath, listen, mirrorLabel: label, onionLocation };
}

/**
 * A safe starting configuration for a transport; publicOrigin stays null until the operator knows it.
 * @param {'clearnet' | 'onion' | 'i2p'} transport
 * @returns {HostConfig}
 */
export function defaultHostConfig(transport) {
  return parseHostConfig({
    schemaVersion: 1,
    transport,
    publicOrigin: null,
    basePath: '/',
    listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 },
    mirrorLabel: `${transport}-mirror`,
    onionLocation: null,
  });
}

/**
 * Deterministic JSON text for a HostConfig (stable key order, trailing newline).
 * @param {HostConfig} c
 * @returns {string}
 */
export function serializeHostConfig(c) {
  const ordered = Object.fromEntries(KEYS.map((k) => [k, /** @type {Record<string, unknown>} */ (c)[k] ?? null]));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
