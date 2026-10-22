import { PluginError } from './errors.js';
import { ShapeError, readArray, readBool, readInt, readShape, readString, textRe } from './validate.js';

/** Plugin API version implemented by this package. */
export const PLUGIN_API_VERSION = 1;
/** Maximum hosts in a network allowlist. */
export const MAX_NETWORK_HOSTS = 8;

/** Everything a plugin may declare. Unknown capabilities are rejected. */
export const CAPABILITIES = [
  'hook:onInvoiceCreate',
  'privacy:batching',
  'privacy:delay',
  'privacy:relay',
] as const;
/** A declarable capability. */
export type Capability = (typeof CAPABILITIES)[number];

/** Privacy knobs a plugin may restrict or offer options for. */
export type PrivacyKind = 'delay' | 'relay' | 'batching';

/** Permissions a plugin requests. Requests grant nothing until the host grants them. */
export interface PermissionRequest {
  /** Exact HTTPS hostnames (no wildcards, no ports). Empty = no network. */
  readonly network: readonly string[];
  /** Namespaced key/value storage. */
  readonly storage: boolean;
  /** May offer options weaker than defaults (always flagged to the user). */
  readonly downgrade: boolean;
}

/** Static, declarative plugin description. Contains no code and no URLs to code. */
export interface PluginManifest {
  readonly apiVersion: 1;
  /** Reverse-DNS style id, e.g. `org.example.delay`. Also the sort key. */
  readonly id: string;
  readonly name: string;
  /** Strict semver `MAJOR.MINOR.PATCH`, optional `-prerelease`. */
  readonly version: string;
  /** Sorted, unique. */
  readonly capabilities: readonly Capability[];
  readonly permissions: PermissionRequest;
}

const ID_RE = /^[a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31}){1,4}$/;
const SEMVER_RE =
  /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})(?:-[0-9A-Za-z-]{1,20}(?:\.[0-9A-Za-z-]{1,20}){0,3})?$/;
const NAME_RE = textRe(64);
/** Lowercase DNS hostname with at least one dot; no IP literals (a final label must not be all digits). */
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Maps a privacy kind to the capability that unlocks it. */
export function capabilityFor(kind: PrivacyKind): Capability {
  return `privacy:${kind}`;
}

/**
 * Validates an untrusted manifest.
 *
 * @param value Untrusted input (e.g. parsed JSON shipped with a plugin).
 * @returns Frozen canonical copy (capabilities and hosts sorted).
 * @throws {PluginError} `MANIFEST` with the offending field path.
 * @security Trust boundary: exact keys only, no accessors, no code or code URLs,
 * bounded sizes, duplicate capabilities/hosts rejected.
 */
export function validateManifest(value: unknown): PluginManifest {
  try {
    const r = readShape(
      value,
      ['apiVersion', 'id', 'name', 'version', 'capabilities', 'permissions'],
      [],
      '',
    );
    readInt(r.apiVersion, PLUGIN_API_VERSION, PLUGIN_API_VERSION, 'apiVersion');
    const id = readString(r.id, ID_RE, 'id');
    const name = readString(r.name, NAME_RE, 'name');
    const version = readString(r.version, SEMVER_RE, 'version');
    const caps = readArray(r.capabilities, CAPABILITIES.length, 'capabilities');
    const capSet = new Set<Capability>();
    caps.forEach((c, i) => {
      if (
        typeof c !== 'string' ||
        !(CAPABILITIES as readonly string[]).includes(c) ||
        capSet.has(c as Capability)
      ) {
        throw new ShapeError(`capabilities[${i}]`);
      }
      capSet.add(c as Capability);
    });
    const p = readShape(r.permissions, ['network', 'storage', 'downgrade'], [], 'permissions');
    const hosts = readArray(p.network, MAX_NETWORK_HOSTS, 'permissions.network');
    const hostSet = new Set<string>();
    hosts.forEach((h, i) => {
      const host = readString(h, HOST_RE, `permissions.network[${i}]`);
      if (hostSet.has(host)) throw new ShapeError(`permissions.network[${i}]`);
      hostSet.add(host);
    });
    const storage = readBool(p.storage, 'permissions.storage');
    const downgrade = readBool(p.downgrade, 'permissions.downgrade');
    if (capSet.size === 0) throw new ShapeError('capabilities');
    return Object.freeze({
      apiVersion: PLUGIN_API_VERSION,
      id,
      name,
      version,
      capabilities: Object.freeze([...capSet].sort()),
      permissions: Object.freeze({ network: Object.freeze([...hostSet].sort()), storage, downgrade }),
    });
  } catch (e) {
    if (e instanceof ShapeError) throw new PluginError('MANIFEST', e.path);
    throw e;
  }
}
