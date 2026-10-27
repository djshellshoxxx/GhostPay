// @ts-check
// Tor v3 onion service profile generator. Pure: returns file contents only. It never starts tor, never creates
// keys or directories and never reads identity material. Every directive is documented in docs/TOR.md with its
// source (tor 0.4.9.11 manual + source, Tor Project community docs).
//
// This module also exports the small validation helpers shared with the I2P adapter (src/adapters/i2p.mjs).

import path from 'node:path';
import { KitError, ERROR_CODES } from '../errors.mjs';

/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('../types.mjs').Listener} Listener */
/** @typedef {{ name: string, data: Uint8Array }} OutFile */
/**
 * Where the web server is, seen from the overlay daemon's network namespace.
 * - 'host-listener': same host / namespace as `hostConfig.listen` (loopback TCP or unix socket). Also the case for a
 *   containerized web server whose port is published on host loopback (then `listen` is that published port).
 * - 'compose-service': the daemon runs in a sibling container on the compose network and reaches the web service by name.
 * @typedef {'host-listener' | 'compose-service'} TargetKind
 */
/** @typedef {{ kind: 'tcp', host: string, port: number } | { kind: 'unix', path: string }} WebTarget */
/**
 * @typedef {{ mode: 'system' } | { mode: 'dedicated', dataDirectory: string } | { mode: 'container', baseImage?: string }} TorInstance
 */
/** @typedef {boolean | { queueRate?: number, queueBurst?: number }} PowOption */

const { USAGE, CONFIG, PATH, UNSUPPORTED, NETWORK_SCOPE } = ERROR_CODES;

/** Container topology defined by the container profile (src/profiles/container.mjs). */
export const COMPOSE_WEB_SERVICE = 'web';
export const COMPOSE_WEB_PORT = 8080;
export const COMPOSE_INTERNAL_NETWORK = 'site_internal';
/** Extra network for the tor container only: it needs egress to the Tor network, site_internal may be internal. */
export const COMPOSE_TOR_EGRESS_NETWORK = 'tor_egress';

/**
 * Debian trixie-slim multi-arch index digest observed with `docker buildx imagetools inspect debian:trixie-slim`
 * on 2026-10-27. Not built, scanned or run by this kit. Operators should re-check and pass their own digest.
 */
export const DEFAULT_TOR_BASE_IMAGE =
  'debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad';

/** In-container locations used by the container mode (named volume `tor-data` is mounted at TOR_CONTAINER_DATA_DIR). */
export const TOR_CONTAINER_DATA_DIR = '/var/lib/tor';

/**
 * Well-known Tor management/proxy ports that must never be published as a website target.
 * 9050 SocksPort default and 9051 conventional ControlPort (tor.1, 0.4.9.11); 9150/9151 Tor Browser's SOCKS/control
 * ports (reserved for Tor Browser in the I2P port registry, https://i2p.net/en/docs/overview/ports/).
 */
export const TOR_MANAGEMENT_PORTS = Object.freeze({
  9050: 'Tor SocksPort (default)',
  9051: 'Tor ControlPort (conventional)',
  9150: 'Tor Browser SOCKS port',
  9151: 'Tor Browser control port',
});

/** I2P stacks' management ports (warned, not refused, when the Tor adapter is selected). */
const OTHER_STACK_PORTS = Object.freeze({
  7070: 'i2pd web console',
  7657: 'Java I2P router console',
  7650: 'I2PControl',
  7654: 'I2CP',
  7656: 'SAM',
  4444: 'I2P HTTP proxy',
  4447: 'i2pd SOCKS proxy',
});

/** Defaults written into every service block. Values are tor's own documented defaults unless noted. */
export const TOR_DOS_DEFAULTS = Object.freeze({
  introRatePerSec: 25, // tor.1 default
  introBurstPerSec: 200, // tor.1 default
  powQueueRate: 250, // tor.1 default
  powQueueBurst: 2500, // tor.1 default
  maxStreams: 32, // kit choice: browsers open <= ~6 parallel connections per site; tor default is 0 (unlimited)
});

const ONION_ORIGIN_RE = /^http:\/\/[a-z2-7]{56}\.onion$/;
const SAFE_ABS_PATH_RE = /^\/[A-Za-z0-9._/-]*$/;
const DIGEST_IMAGE_RE = /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}$/;
const SAFE_LABEL_RE = /^[\x20-\x7e]*$/;

// ---------------------------------------------------------------------------------------------------------------
// Shared adapter helpers (also used by i2p.mjs)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Checks the parts of a HostConfig an overlay adapter depends on. The coordinator's parseHostConfig is the real
 * validator; this is a defensive boundary check so that a raw object cannot produce an unsafe profile.
 * @param {unknown} hostConfig
 * @param {'onion' | 'i2p'} transport
 * @param {RegExp} originRe
 * @returns {HostConfig}
 */
export function assertHostConfig(hostConfig, transport, originRe) {
  if (!hostConfig || typeof hostConfig !== 'object') throw new KitError(USAGE, 'hostConfig is required');
  const hc = /** @type {HostConfig} */ (hostConfig);
  if (hc.schemaVersion !== 1) throw new KitError(CONFIG, 'hostConfig.schemaVersion must be 1');
  if (hc.transport !== transport) {
    throw new KitError(CONFIG, `hostConfig.transport is "${String(hc.transport)}", this adapter needs "${transport}"`);
  }
  if (hc.publicOrigin !== null && (typeof hc.publicOrigin !== 'string' || !originRe.test(hc.publicOrigin))) {
    throw new KitError(CONFIG, `hostConfig.publicOrigin does not look like a ${transport} origin`, { publicOrigin: hc.publicOrigin });
  }
  if (typeof hc.mirrorLabel !== 'string' || !SAFE_LABEL_RE.test(hc.mirrorLabel) || hc.mirrorLabel.length > 80) {
    throw new KitError(CONFIG, 'hostConfig.mirrorLabel must be printable ASCII, at most 80 characters');
  }
  assertListener(hc.listen);
  return hc;
}

/**
 * @param {unknown} listen
 * @returns {asserts listen is Listener}
 */
function assertListener(listen) {
  const l = /** @type {Partial<Record<string, unknown>> | null} */ (listen && typeof listen === 'object' ? listen : null);
  if (l && l.kind === 'tcp') {
    if (l.host !== '127.0.0.1' && l.host !== '::1') {
      throw new KitError(NETWORK_SCOPE, `listener host ${String(l.host)} is not loopback (127.0.0.1 or ::1)`);
    }
    assertPort(l.port, 'hostConfig.listen.port');
    return;
  }
  if (l && l.kind === 'unix') {
    assertSafeAbsolutePath(l.path, 'hostConfig.listen.path');
    return;
  }
  throw new KitError(CONFIG, 'hostConfig.listen must be { kind: "tcp", host, port } or { kind: "unix", path }');
}

/**
 * @param {unknown} port
 * @param {string} label
 * @returns {asserts port is number}
 */
export function assertPort(port, label) {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new KitError(USAGE, `${label} must be an integer port 1..65535`, { [label]: port });
  }
}

/**
 * Absolute, normalized POSIX path made only of [A-Za-z0-9._/-] (no spaces, quotes, newlines or "." / ".." segments),
 * so it can be written into torrc / ini / properties files without quoting or injection risk.
 * @param {unknown} p
 * @param {string} label
 * @returns {string} the path without a trailing slash
 */
export function assertSafeAbsolutePath(p, label) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024) throw new KitError(PATH, `${label} must be a non-empty path`);
  if (!SAFE_ABS_PATH_RE.test(p)) {
    throw new KitError(PATH, `${label} must be an absolute path using only A-Z a-z 0-9 . _ - /`, { [label]: p });
  }
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  if (trimmed === '/' || trimmed === '' || path.posix.normalize(trimmed) !== trimmed) {
    throw new KitError(PATH, `${label} must be normalized (no "//", ".", ".." segments) and not "/"`, { [label]: p });
  }
  return trimmed;
}

/**
 * @param {string} parent absolute, normalized
 * @param {string} child absolute, normalized
 */
function isInsideOrEqual(parent, child) {
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
}

/**
 * Identity material must never live in, contain, or equal a site/export/archive directory.
 * Comparison is lexical on absolute paths (generators are pure and do not resolve symlinks).
 * @param {string} p absolute, normalized
 * @param {unknown} forbiddenRoots
 * @param {string} label
 */
export function assertOutsideForbiddenRoots(p, forbiddenRoots, label) {
  if (forbiddenRoots === undefined) return;
  if (!Array.isArray(forbiddenRoots)) throw new KitError(USAGE, 'forbiddenRoots must be an array of absolute paths');
  for (const root of forbiddenRoots) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) {
      throw new KitError(USAGE, 'forbiddenRoots entries must be absolute paths', { root });
    }
    const r = path.posix.resolve(root);
    if (isInsideOrEqual(r, p) || isInsideOrEqual(p, r)) {
      throw new KitError(PATH, `${label} ${p} overlaps forbidden root ${r}: identity material must stay outside site, export and archive directories`, { [label]: p, root: r });
    }
  }
}

/**
 * @param {number} port
 * @param {Readonly<Record<number, string>>} ownPorts management ports of the selected stack (refused)
 * @param {Readonly<Record<number, string>>} otherPorts management ports of other overlay stacks (warned)
 * @param {string[]} warnings
 */
export function checkManagementPort(port, ownPorts, otherPorts, warnings) {
  const own = ownPorts[port];
  if (own) {
    throw new KitError(UNSUPPORTED, `target port ${port} is a management port (${own}); it must never be exposed as a website`, { port });
  }
  const other = otherPorts[port];
  if (other) warnings.push(`target port ${port} is a well-known management port of another stack (${other}); make sure it really is the web server`);
}

/**
 * @param {HostConfig} hostConfig
 * @param {unknown} target
 * @returns {WebTarget}
 */
export function resolveWebTarget(hostConfig, target) {
  if (target === 'host-listener') return hostConfig.listen;
  if (target === 'compose-service') return { kind: 'tcp', host: COMPOSE_WEB_SERVICE, port: COMPOSE_WEB_PORT };
  throw new KitError(USAGE, 'target must be "host-listener" or "compose-service"', { target });
}

/**
 * @param {Array<[string, string]>} entries [name, text]
 * @returns {OutFile[]}
 */
export function encodeFiles(entries) {
  const enc = new TextEncoder();
  return entries.map(([name, text]) => ({ name, data: enc.encode(text) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Tor profile
// ---------------------------------------------------------------------------------------------------------------

/**
 * @param {unknown} instance
 * @returns {TorInstance}
 */
function normalizeInstance(instance) {
  if (instance === undefined) return { mode: 'system' };
  const i = /** @type {Partial<Record<string, unknown>> | null} */ (instance && typeof instance === 'object' ? instance : null);
  if (i?.mode === 'system') return { mode: 'system' };
  if (i?.mode === 'dedicated') return { mode: 'dedicated', dataDirectory: assertSafeAbsolutePath(i.dataDirectory, 'instance.dataDirectory') };
  if (i?.mode === 'container') {
    const baseImage = i.baseImage === undefined ? DEFAULT_TOR_BASE_IMAGE : i.baseImage;
    if (typeof baseImage !== 'string' || !DIGEST_IMAGE_RE.test(baseImage)) {
      throw new KitError(USAGE, 'instance.baseImage must be pinned by digest: name[:tag]@sha256:<64 hex>', { baseImage });
    }
    return { mode: 'container', baseImage };
  }
  throw new KitError(USAGE, 'instance.mode must be "system", "dedicated" or "container"', { instance });
}

/**
 * @param {unknown} pow
 * @returns {{ queueRate: number, queueBurst: number } | null} null = disabled
 */
function normalizePow(pow) {
  if (pow === undefined || pow === true) return { queueRate: TOR_DOS_DEFAULTS.powQueueRate, queueBurst: TOR_DOS_DEFAULTS.powQueueBurst };
  if (pow === false) return null;
  if (pow && typeof pow === 'object') {
    const p = /** @type {{ queueRate?: unknown, queueBurst?: unknown }} */ (pow);
    const queueRate = p.queueRate ?? TOR_DOS_DEFAULTS.powQueueRate;
    const queueBurst = p.queueBurst ?? TOR_DOS_DEFAULTS.powQueueBurst;
    for (const [k, v] of /** @type {Array<[string, unknown]>} */ ([['queueRate', queueRate], ['queueBurst', queueBurst]])) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1_000_000) {
        throw new KitError(USAGE, `powDefense.${k} must be an integer 1..1000000`, { [k]: v });
      }
    }
    // tor refuses a burst smaller than the rate (hs_config.c, config_validate_service).
    if (/** @type {number} */ (queueBurst) < /** @type {number} */ (queueRate)) {
      throw new KitError(USAGE, 'powDefense.queueBurst must be >= queueRate (tor rejects it otherwise)');
    }
    return { queueRate: /** @type {number} */ (queueRate), queueBurst: /** @type {number} */ (queueBurst) };
  }
  throw new KitError(USAGE, 'powDefense must be true, false or { queueRate, queueBurst }');
}

/**
 * @param {WebTarget} t
 * @returns {string} HiddenServicePort TARGET (tor.1: addr:port, [ipv6]:port, unix:path)
 */
function torTarget(t) {
  if (t.kind === 'unix') return `unix:${t.path}`;
  return t.host.includes(':') ? `[${t.host}]:${t.port}` : `${t.host}:${t.port}`;
}

/**
 * @param {{ hiddenServiceDir: string, virtualPort: number, target: WebTarget, pow: { queueRate: number, queueBurst: number } | null }} s
 * @returns {string}
 */
function renderServiceBlock(s) {
  const lines = [
    '# --- onion service (per-service options must follow HiddenServiceDir) ---',
    `HiddenServiceDir ${s.hiddenServiceDir}`,
    'HiddenServiceVersion 3',
    `HiddenServicePort ${s.virtualPort} ${torTarget(s.target)}`,
    '# Intro-point rate limiting (tor default rate/burst written explicitly).',
    'HiddenServiceEnableIntroDoSDefense 1',
    `HiddenServiceEnableIntroDoSRatePerSec ${TOR_DOS_DEFAULTS.introRatePerSec}`,
    `HiddenServiceEnableIntroDoSBurstPerSec ${TOR_DOS_DEFAULTS.introBurstPerSec}`,
  ];
  if (s.pow) {
    lines.push(
      '# Proof-of-work defense: needs tor >= 0.4.8 with the "pow" module (tor --list-modules) built with --enable-gpl.',
      'HiddenServicePoWDefensesEnabled 1',
      `HiddenServicePoWQueueRate ${s.pow.queueRate}`,
      `HiddenServicePoWQueueBurst ${s.pow.queueBurst}`,
    );
  } else {
    lines.push('# Proof-of-work defense disabled by the operator (powDefense: false).', 'HiddenServicePoWDefensesEnabled 0');
  }
  lines.push(
    '# Per-rendezvous-circuit stream cap; circuits exceeding it are closed.',
    `HiddenServiceMaxStreams ${TOR_DOS_DEFAULTS.maxStreams}`,
    'HiddenServiceMaxStreamsCloseCircuit 1',
    '# Never enabled by this kit: HiddenServiceSingleHopMode / HiddenServiceNonAnonymousMode (they de-anonymize the server).',
    '',
  );
  return lines.join('\n');
}

/** @param {string} title */
function header(title) {
  return [
    `# ${title}`,
    '# Generated by ghostpay-portable-hosting-kit. INERT until an operator reviews and installs it by hand.',
    '# Contains no keys. Tor creates the onion identity in HiddenServiceDir on first start; back it up offline and',
    '# never copy it into a site bundle. Directive sources: docs/TOR.md (tor 0.4.9.11 manual, community.torproject.org).',
    '',
  ].join('\n');
}

/**
 * @param {string} dataDirectory
 * @param {string} serviceBlock
 */
function renderDedicatedTorrc(dataDirectory, serviceBlock) {
  return [
    header('Dedicated tor instance for one onion service (complete torrc; run with: tor -f <this file>)'),
    `DataDirectory ${dataDirectory}`,
    '# This instance only publishes the onion service: no SOCKS client port, no control port.',
    'SocksPort 0',
    'ControlPort 0',
    'RunAsDaemon 0',
    'Log notice stderr',
    'SafeLogging 1',
    '',
    serviceBlock,
  ].join('\n');
}

/** @param {TorInstance & { mode: 'container' }} inst */
function renderDockerfile(inst) {
  return [
    '# Tor sidecar image for the onion profile. Generated by ghostpay-portable-hosting-kit; build only after review.',
    '# The base image is pinned by digest. apt still installs the current Debian tor package (incl. trixie-security),',
    '# so the image is NOT bit-reproducible; check `tor --version` (>= 0.4.9, "covered by the GNU GPL" for PoW) after building.',
    `ARG BASE_IMAGE=${inst.baseImage}`,
    'FROM ${BASE_IMAGE}',
    'RUN apt-get update \\',
    ' && apt-get install -y --no-install-recommends tor \\',
    ' && rm -rf /var/lib/apt/lists/* \\',
    ` && install -d -o debian-tor -g debian-tor -m 0700 ${TOR_CONTAINER_DATA_DIR}`,
    'USER debian-tor',
    'ENTRYPOINT ["/usr/bin/tor", "-f", "/etc/tor/torrc"]',
    '',
  ].join('\n');
}

/** @param {TorInstance & { mode: 'container' }} inst */
function renderCompose(inst) {
  return [
    '# Compose override: tor sidecar for the onion profile. Use together with the container profile\'s compose file:',
    '#   docker compose -f <container compose file> -f tor/compose.tor.yml config   # review; this kit never runs `up`',
    '# Relative paths resolve against the FIRST -f file\'s directory, which must be the parent of tor/.',
    `# The tor container reaches the site as ${COMPOSE_WEB_SERVICE}:${COMPOSE_WEB_PORT} on ${COMPOSE_INTERNAL_NETWORK}; it needs a second`,
    `# network (${COMPOSE_TOR_EGRESS_NETWORK}) with egress to reach the Tor network. No ports are published.`,
    'services:',
    '  tor:',
    '    build:',
    '      context: ./tor',
    '      dockerfile: Dockerfile',
    '      args:',
    `        BASE_IMAGE: "${inst.baseImage}"`,
    '    image: ghostpay-onion-tor:local',
    '    read_only: true',
    '    cap_drop: [ALL]',
    '    security_opt: ["no-new-privileges:true"]',
    '    restart: unless-stopped',
    '    depends_on:',
    `      ${COMPOSE_WEB_SERVICE}:`,
    '        condition: service_started',
    '    volumes:',
    '      - ./tor/torrc:/etc/tor/torrc:ro',
    `      - tor-data:${TOR_CONTAINER_DATA_DIR}`,
    '    tmpfs:',
    '      - /tmp:size=8m,mode=1777,noexec,nosuid,nodev',
    `    networks: [${COMPOSE_INTERNAL_NETWORK}, ${COMPOSE_TOR_EGRESS_NETWORK}]`,
    '    pids_limit: 64',
    '    mem_limit: 256m',
    'networks:',
    `  ${COMPOSE_TOR_EGRESS_NETWORK}: {}`,
    'volumes:',
    '  # Holds the onion identity (hs_ed25519_secret_key). Back it up offline; never put it into a site bundle.',
    '  tor-data: {}',
    '',
  ].join('\n');
}

/**
 * @param {{ mode: TorInstance['mode'], files: string[], hiddenServiceDir: string, virtualPort: number, target: WebTarget, pow: boolean, publicOrigin: string | null }} r
 */
function renderReadme(r) {
  const install = {
    system: [
      '1. Review `tor/onion-service.torrc`. For a packaged system tor (Debian/Ubuntu) add one line to /etc/tor/torrc:',
      '   `%include /etc/tor/torrc.d/*.conf` and copy the fragment to /etc/tor/torrc.d/ghostpay-onion.conf.',
      '2. Validate the way the Debian/Ubuntu unit does before reloading:',
      '   `sudo tor --defaults-torrc /usr/share/tor/tor-service-defaults-torrc -f /etc/tor/torrc --verify-config`.',
      '3. Reload tor (`sudo systemctl reload tor`). Tor creates HiddenServiceDir (mode 0700) and the keys on first start.',
    ],
    dedicated: [
      '1. Review `tor/torrc`. Create a dedicated unprivileged user; DataDirectory and HiddenServiceDir must be owned by it, mode 0700.',
      '2. Validate: `tor --verify-config -f tor/torrc` (as that user).',
      '3. Start it yourself under a supervisor of your choice: `tor -f /path/to/torrc`.',
    ],
    container: [
      '1. Review `tor/torrc`, `tor/Dockerfile`, `tor/compose.tor.yml` and re-check the pinned base image digest.',
      '2. Validate only: `docker compose -f <container compose file> -f tor/compose.tor.yml config`, run from the',
      '   directory that contains both the container compose file and `tor/` (relative paths resolve against the first file).',
      '3. Starting the stack is your decision. The onion identity lives in the `tor-data` volume.',
    ],
  }[r.mode];
  return [
    '# Onion service profile (generated)',
    '',
    'Nothing in this directory is active. An operator installs it by hand after review. See docs/TOR.md for the',
    'full guide, sources, and limits.',
    '',
    `- Mode: ${r.mode}`,
    `- Files: ${r.files.map((f) => '`' + f + '`').join(', ')}`,
    `- HiddenServiceDir: \`${r.hiddenServiceDir}\` (identity; keep it outside every site, export and archive directory)`,
    `- Virtual port ${r.virtualPort} -> \`${torTarget(r.target)}\``,
    `- PoW defense: ${r.pow ? 'enabled (adaptive; free when not under attack)' : 'DISABLED by operator choice'}`,
    `- Onion origin: ${r.publicOrigin ?? 'not known yet (read <HiddenServiceDir>/hostname after first start)'}`,
    '',
    '## Install',
    '',
    ...install,
    '',
    '## Identity backup',
    '',
    'The files `hs_ed25519_secret_key`, `hs_ed25519_public_key` and `hostname` in HiddenServiceDir are the onion',
    'identity. Copy them offline, encrypted, with restrictive permissions. Anyone holding the secret key can',
    'impersonate the site. Never add them to a site bundle, archive, repository or container image.',
    '',
    '## Never expose',
    '',
    'Tor SocksPort/ControlPort/MetricsPort, router consoles, I2PControl and SAM are not website ports.',
    'Onion hosting does not anonymize wallet behaviour, RPC requests or on-chain transactions.',
    '',
  ].join('\n');
}

/**
 * Generate a Tor v3 onion service profile.
 * @param {{
 *   hostConfig: HostConfig,
 *   hiddenServiceDir: string,
 *   target: TargetKind,
 *   virtualPort?: number,
 *   instance?: TorInstance,
 *   powDefense?: PowOption,
 *   forbiddenRoots?: string[],
 * }} opts
 * @returns {{ files: OutFile[], warnings: string[] }}
 */
export function generateTorProfile(opts) {
  if (!opts || typeof opts !== 'object') throw new KitError(USAGE, 'options object is required');
  const hostConfig = assertHostConfig(opts.hostConfig, 'onion', ONION_ORIGIN_RE);
  /** @type {string[]} */
  const warnings = [];
  const instance = normalizeInstance(opts.instance);
  const virtualPort = opts.virtualPort ?? 80;
  assertPort(virtualPort, 'virtualPort');
  const pow = normalizePow(opts.powDefense);
  if (!pow) warnings.push('PoW defense disabled: the service has no adaptive protection against rendezvous floods');

  const hiddenServiceDir = assertSafeAbsolutePath(opts.hiddenServiceDir, 'hiddenServiceDir');
  assertOutsideForbiddenRoots(hiddenServiceDir, opts.forbiddenRoots, 'hiddenServiceDir');

  const target = resolveWebTarget(hostConfig, opts.target);
  assertTopology(instance, opts.target);
  if (target.kind === 'tcp') checkManagementPort(target.port, TOR_MANAGEMENT_PORTS, OTHER_STACK_PORTS, warnings);

  if (instance.mode === 'dedicated') {
    assertOutsideForbiddenRoots(instance.dataDirectory, opts.forbiddenRoots, 'instance.dataDirectory');
    if (instance.dataDirectory === hiddenServiceDir) throw new KitError(PATH, 'HiddenServiceDir must differ from DataDirectory');
  }
  if (instance.mode === 'container' && !hiddenServiceDir.startsWith(`${TOR_CONTAINER_DATA_DIR}/`)) {
    throw new KitError(PATH, `container mode: hiddenServiceDir is the in-container path and must be inside ${TOR_CONTAINER_DATA_DIR}/ (the tor-data volume)`);
  }
  if (instance.mode === 'system' && !hiddenServiceDir.startsWith('/var/lib/tor/')) {
    warnings.push('system tor on Debian/Ubuntu runs under the AppArmor profile system_tor, which only allows writes below /var/lib/tor/; this HiddenServiceDir may be denied');
  }
  if (hostConfig.onionLocation !== null) warnings.push('hostConfig.onionLocation is a clearnet-only setting and is ignored for an onion mirror');

  const serviceBlock = renderServiceBlock({ hiddenServiceDir, virtualPort, target, pow });
  /** @type {Array<[string, string]>} */
  const entries = [];
  if (instance.mode === 'system') {
    entries.push(['tor/onion-service.torrc', header('torrc fragment for an existing system tor (use with %include)') + serviceBlock]);
  } else if (instance.mode === 'dedicated') {
    entries.push(['tor/torrc', renderDedicatedTorrc(instance.dataDirectory, serviceBlock)]);
  } else {
    entries.push(['tor/torrc', renderDedicatedTorrc(TOR_CONTAINER_DATA_DIR, serviceBlock)]);
    entries.push(['tor/Dockerfile', renderDockerfile(instance)]);
    entries.push(['tor/compose.tor.yml', renderCompose(instance)]);
  }
  entries.push(['tor/README-TOR.md', renderReadme({
    mode: instance.mode,
    files: entries.map(([n]) => n),
    hiddenServiceDir,
    virtualPort,
    target,
    pow: pow !== null,
    publicOrigin: hostConfig.publicOrigin,
  })]);
  return { files: encodeFiles(entries), warnings };
}

/**
 * 127.0.0.1 inside a container is that container only; a host tor cannot resolve a compose service name.
 * @param {TorInstance} instance
 * @param {unknown} target
 */
function assertTopology(instance, target) {
  if (instance.mode === 'container' && target !== 'compose-service') {
    throw new KitError(UNSUPPORTED, 'container mode needs target "compose-service": 127.0.0.1 inside the tor container is the tor container itself, not the web server');
  }
  if (instance.mode !== 'container' && target === 'compose-service') {
    throw new KitError(UNSUPPORTED, `a ${instance.mode} tor on the host cannot reach the compose service "${COMPOSE_WEB_SERVICE}" by name; publish the web port on host loopback and use target "host-listener"`);
  }
}
