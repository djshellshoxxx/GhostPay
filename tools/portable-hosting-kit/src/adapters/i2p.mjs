// @ts-check
// I2P server-tunnel profile generator (eepsite for a static site). Pure: returns file contents only. It never starts
// a router, never creates keys and never reads identity material.
//
// i2pd and Java I2P use different formats, locations and options; the renderers live in i2p-i2pd.mjs and
// i2p-java.mjs. Sources for every option are listed in docs/I2P.md.

import { KitError, ERROR_CODES } from '../errors.mjs';
import {
  assertHostConfig,
  assertPort,
  assertSafeAbsolutePath,
  assertOutsideForbiddenRoots,
  checkManagementPort,
  resolveWebTarget,
  encodeFiles,
  TOR_MANAGEMENT_PORTS,
} from './tor.mjs';
import { renderI2pdTunnel, renderI2pdReadme } from './i2p-i2pd.mjs';
import { renderJavaTunnel, renderJavaReadme, javaTunnelFileName } from './i2p-java.mjs';

/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('./tor.mjs').OutFile} OutFile */
/** @typedef {import('./tor.mjs').TargetKind} TargetKind */
/** @typedef {import('./tor.mjs').WebTarget} WebTarget */
/** @typedef {'i2pd' | 'java-i2p'} I2pRouter */
/**
 * Everything a renderer needs, already validated.
 * @typedef {object} I2pTunnelSpec
 * @property {string} tunnelName
 * @property {string} host        target host (IP literal or compose service name)
 * @property {number} port        target TCP port
 * @property {number} inport      I2P-side port (i2pd only; Java server tunnels accept every I2P port)
 * @property {string} keysFile    router-relative key file path
 * @property {string | null} b32Host  "<52>.b32.i2p" when the public origin is known
 * @property {string} description mirror label reduced to [A-Za-z0-9 ._,()/-]
 * @property {TargetKind} target
 */

const { USAGE, PATH, UNSUPPORTED } = ERROR_CODES;

const I2P_ORIGIN_RE = /^http:\/\/[a-z2-7]{52}\.b32\.i2p$/;
const TUNNEL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEYS_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
/**
 * Router identity and state files (Java I2P: router.keys.dat, router.info, router.keys; i2pd: router.keys,
 * router.info, ntcp2.keys, ssu2.keys). A tunnel must never reuse them: that would tie the site to the router.
 */
const ROUTER_STATE_NAMES = Object.freeze(['router.keys.dat', 'router.info', 'router.keys', 'ntcp2.keys', 'ssu2.keys']);
/**
 * Every string written into a tunnel file (values and comments) must match this: no characters that are special in
 * Java I2P .properties ("\\", "#", "!", "=" / ":" in keys) or i2pd INI (";", "#", "[", "]"), no quotes, no controls.
 * ":" is allowed for the IPv6 literal "::1" in host values.
 */
const PLAIN_VALUE_RE = /^[A-Za-z0-9._,()/:-]+(?: [A-Za-z0-9._,()/:-]+)*$/;

/**
 * i2pd ports: docs.i2pd.website user-guide/configuration (http.port 7070, httpproxy 4444, socksproxy 4447, sam 7656,
 * bob 2827, i2cp 7654, i2pcontrol 7650) and the I2P port registry (SAM UDP 7655).
 */
export const I2PD_MANAGEMENT_PORTS = Object.freeze({
  7070: 'i2pd web console',
  4444: 'i2pd HTTP proxy',
  4447: 'i2pd SOCKS proxy',
  7656: 'SAM bridge',
  7655: 'SAM UDP',
  7654: 'I2CP',
  7650: 'I2PControl',
  2827: 'BOB',
});

/** Java I2P ports: I2P port registry https://i2p.net/en/docs/overview/ports/ and the I2P FAQ. 7658 (bundled eepsite web server) is a website, not refused. */
export const JAVA_I2P_MANAGEMENT_PORTS = Object.freeze({
  7657: 'Java I2P router console',
  7667: 'Java I2P router console (HTTPS)',
  4444: 'I2P HTTP proxy',
  4445: 'I2P HTTPS proxy',
  7650: 'I2PControl',
  7652: 'UPnP HTTP events',
  7653: 'UPnP SSDP',
  7654: 'I2CP',
  7655: 'SAM UDP',
  7656: 'SAM bridge',
  6668: 'IRC client proxy',
  2827: 'BOB (legacy)',
  7644: 'I2P browser-mode HTTP proxy',
  7647: 'I2P browser-mode console',
});

/**
 * @param {unknown} name
 * @returns {string}
 */
function assertTunnelName(name) {
  if (typeof name !== 'string' || !TUNNEL_NAME_RE.test(name)) {
    throw new KitError(USAGE, 'tunnelName must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}', { tunnelName: name });
  }
  return name;
}

/**
 * Key files are router-relative: i2pd 2.49 builds the path as <datadir>/<keys> (FS.h DataDirPath, plain string
 * concatenation, so an absolute path is NOT honoured); Java I2P resolves relative paths against its config dir.
 * @param {unknown} keysFile
 * @returns {string}
 */
function assertKeysFile(keysFile) {
  if (typeof keysFile !== 'string' || keysFile.length === 0 || keysFile.length > 255) {
    throw new KitError(PATH, 'keysFile must be a non-empty router-relative path');
  }
  if (keysFile.startsWith('/') || keysFile.includes('\\')) {
    throw new KitError(PATH, 'keysFile must be relative to the router data/config directory (i2pd ignores absolute paths)', { keysFile });
  }
  const base = keysFile.slice(keysFile.lastIndexOf('/') + 1);
  if (ROUTER_STATE_NAMES.includes(base)) {
    throw new KitError(PATH, `keysFile ${keysFile} is a router identity/state file name; use a dedicated key file for the tunnel`, { keysFile });
  }
  const segments = keysFile.split('/');
  if (segments.some((s) => s === '.' || s === '..' || !KEYS_SEGMENT_RE.test(s))) {
    throw new KitError(PATH, 'keysFile segments may only use A-Z a-z 0-9 . _ - and no "." or ".." segments', { keysFile });
  }
  if (!keysFile.endsWith('.dat')) throw new KitError(PATH, 'keysFile must end with .dat', { keysFile });
  if (keysFile.startsWith('transient')) {
    throw new KitError(PATH, 'keysFile must not start with "transient" (i2pd would use throwaway keys and the address would change on every start)');
  }
  return keysFile;
}

/**
 * @param {string} keysFile
 * @param {unknown} routerDataDir
 * @param {unknown} forbiddenRoots
 * @param {string[]} warnings
 */
function checkKeyLocation(keysFile, routerDataDir, forbiddenRoots, warnings) {
  if (routerDataDir === undefined) {
    if (Array.isArray(forbiddenRoots) && forbiddenRoots.length > 0) {
      warnings.push('routerDataDir not given: could not check that <router dir>/' + keysFile + ' lies outside the forbidden roots');
    }
    return;
  }
  // keysFile has no ".." segments, so <dir>/<keysFile> can only reach a forbidden root that overlaps <dir> itself.
  const dir = assertSafeAbsolutePath(routerDataDir, 'routerDataDir');
  assertOutsideForbiddenRoots(dir, forbiddenRoots, 'routerDataDir');
}

/**
 * Mirror label reduced to characters that are inert in both .properties and INI files.
 * @param {string} label
 * @param {string} fallback
 */
function sanitizeDescription(label, fallback) {
  const clean = label.replace(/[^A-Za-z0-9 ._,()/-]/g, '').replace(/ +/g, ' ').trim();
  return clean === '' ? fallback : clean;
}

/**
 * Generate an I2P HTTP server tunnel for the selected router.
 * @param {{
 *   hostConfig: HostConfig,
 *   router: I2pRouter,
 *   tunnelName: string,
 *   target: TargetKind,
 *   keysFile: string,
 *   inport?: number,
 *   forbiddenRoots?: string[],
 *   routerDataDir?: string,
 * }} opts
 * @returns {{ files: OutFile[], warnings: string[] }}
 */
export function generateI2pProfile(opts) {
  if (!opts || typeof opts !== 'object') throw new KitError(USAGE, 'options object is required');
  const hostConfig = assertHostConfig(opts.hostConfig, 'i2p', I2P_ORIGIN_RE);
  const router = opts.router;
  if (router !== 'i2pd' && router !== 'java-i2p') throw new KitError(USAGE, 'router must be "i2pd" or "java-i2p"', { router });
  /** @type {string[]} */
  const warnings = [];
  const tunnelName = assertTunnelName(opts.tunnelName);
  const keysFile = assertKeysFile(opts.keysFile);
  const inport = opts.inport ?? 80;
  assertPort(inport, 'inport');
  if (opts.inport !== undefined && router === 'java-i2p') {
    warnings.push('inport is ignored for Java I2P: its server tunnels accept connections on every I2P port');
  }
  checkKeyLocation(keysFile, opts.routerDataDir, opts.forbiddenRoots, warnings);

  const target = resolveWebTarget(hostConfig, opts.target);
  if (target.kind === 'unix') {
    throw new KitError(UNSUPPORTED, `${router} server tunnels connect to a TCP host:port; a unix-socket listener cannot be used. Listen on 127.0.0.1:<port> instead.`, { router });
  }
  const own = router === 'i2pd' ? I2PD_MANAGEMENT_PORTS : JAVA_I2P_MANAGEMENT_PORTS;
  const other = { ...TOR_MANAGEMENT_PORTS, ...(router === 'i2pd' ? JAVA_I2P_MANAGEMENT_PORTS : I2PD_MANAGEMENT_PORTS) };
  checkManagementPort(target.port, own, other, warnings);
  if (opts.target === 'compose-service') {
    warnings.push(`target ${target.host}:${target.port} only resolves inside the compose network: the router must run in a container attached to that network`);
  }
  if (hostConfig.publicOrigin === null) {
    warnings.push('publicOrigin not known yet: the Host header sent to the web server falls back to the router default');
  }

  /** @type {I2pTunnelSpec} */
  const spec = {
    tunnelName,
    host: target.host,
    port: target.port,
    inport,
    keysFile,
    b32Host: hostConfig.publicOrigin === null ? null : hostConfig.publicOrigin.slice('http://'.length),
    description: sanitizeDescription(hostConfig.mirrorLabel, tunnelName),
    target: /** @type {TargetKind} */ (opts.target),
  };
  for (const [field, value] of /** @type {Array<[string, string | null]>} */ ([['tunnelName', spec.tunnelName], ['host', spec.host], ['keysFile', spec.keysFile], ['b32Host', spec.b32Host], ['description', spec.description]])) {
    if (value !== null && !PLAIN_VALUE_RE.test(value)) {
      throw new KitError(ERROR_CODES.CONFIG, `${field} contains characters that are not safe in I2P configuration files`, { [field]: value });
    }
  }

  const configName = router === 'i2pd'
    ? `i2p/i2pd/tunnels.d/${tunnelName}.conf`
    : `i2p/java-i2p/i2ptunnel.config.d/${javaTunnelFileName(tunnelName)}`;
  /** @type {Array<[string, string]>} */
  const entries = router === 'i2pd'
    ? [[configName, renderI2pdTunnel(spec)], ['i2p/README-I2P.md', renderI2pdReadme(spec, configName)]]
    : [[configName, renderJavaTunnel(spec)], ['i2p/README-I2P.md', renderJavaReadme(spec, configName)]];
  return { files: encodeFiles(entries), warnings };
}
