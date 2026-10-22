import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { fail } from './errors.js';
import { isChainAllowed } from './guard.js';
import type { ExitRouteId } from './types.js';

const ROUTES: readonly ExitRouteId[] = ['privacy-pools', 'railgun', 'tornado-fixed', 'aztec', 'mock-pool'];
const HEX32 = /^0x[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEY = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * One pinned pool deployment (spec 6.2 "Manifest schema").
 *
 * `status: 'unverified'` means addresses or hashes are missing or not confirmed from a primary source;
 * adapters then report lifecycle `unknown` and the planner refuses to build entry transactions.
 */
export interface ManifestEntry {
  readonly route: ExitRouteId;
  readonly chainId: number;
  readonly status: 'verified' | 'unverified';
  /** Contract name to address. */
  readonly contracts: Readonly<Record<string, Address>>;
  /** Contract name to keccak256 of runtime code (EP-GEN-4). */
  readonly codeHashes: Readonly<Record<string, Hex>>;
  /** Circuit artifact file name to SHA-256 hex (EP-PP-6 / EP-RG-3). */
  readonly artifactSha256?: Readonly<Record<string, string>>;
  /** Allowed relayer / broadcaster base URLs (https or http://127.0.0.1 for anvil). */
  readonly relayers?: readonly string[];
  readonly deploymentBlock?: number;
  /** Primary source URL(s). */
  readonly sources: readonly string[];
  readonly notes?: string;
}

/** Pinned manifest document. */
export interface PoolManifest {
  readonly schema: 1;
  readonly retrieved: string;
  readonly entries: readonly ManifestEntry[];
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail('MANIFEST_INVALID', `${what} must be an object`);
  return v as Record<string, unknown>;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') fail('MANIFEST_INVALID', `${what} must be a string`);
  return v;
}

function relayerUrl(u: string): void {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return fail('MANIFEST_INVALID', 'relayer URL is not a URL');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    fail('MANIFEST_INVALID', 'relayer URL must be https (http only for localhost)');
  }
  if (url.username !== '' || url.password !== '') fail('MANIFEST_INVALID', 'relayer URL must not carry credentials');
}

function stringMap(v: unknown, what: string, valueOk: (s: string) => boolean): Record<string, string> {
  const o = rec(v, what);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!KEY.test(k)) fail('MANIFEST_INVALID', `${what} has a bad key`);
    const s = str(val, `${what}.${k}`);
    if (!valueOk(s)) fail('MANIFEST_INVALID', `${what}.${k} has a bad value`);
    out[k] = s;
  }
  return out;
}

function parseEntry(raw: unknown): ManifestEntry {
  const e = rec(raw, 'entry');
  const known = new Set(['route', 'chainId', 'status', 'contracts', 'codeHashes', 'artifactSha256', 'relayers', 'deploymentBlock', 'sources', 'notes']);
  for (const k of Object.keys(e)) if (!known.has(k)) fail('MANIFEST_INVALID', `unknown entry field ${k}`);
  const route = e['route'];
  if (typeof route !== 'string' || !ROUTES.includes(route as ExitRouteId)) fail('MANIFEST_INVALID', 'bad route');
  const chainId = e['chainId'];
  if (typeof chainId !== 'number' || !isChainAllowed(chainId)) fail('CHAIN_NOT_ALLOWED', 'manifest entry chain is not an allowlisted testnet');
  const status = e['status'];
  if (status !== 'verified' && status !== 'unverified') fail('MANIFEST_INVALID', 'bad status');
  const contracts = stringMap(e['contracts'], 'contracts', (s) => isAddress(s, { strict: true }) || /^0x[0-9a-f]{40}$/.test(s));
  for (const [k, v] of Object.entries(contracts)) contracts[k] = getAddress(v);
  const codeHashes = stringMap(e['codeHashes'], 'codeHashes', (s) => HEX32.test(s));
  const sources = e['sources'];
  if (!Array.isArray(sources) || sources.length === 0) fail('MANIFEST_INVALID', 'sources required');
  const srcs = (sources as unknown[]).map((s) => str(s, 'source'));
  if (status === 'verified') {
    if (Object.keys(contracts).length === 0) fail('MANIFEST_INVALID', 'verified entry needs contracts');
    for (const name of Object.keys(contracts)) {
      if (codeHashes[name] === undefined) fail('MANIFEST_INVALID', `verified entry lacks code hash for ${name}`);
    }
  }
  const relayersRaw = e['relayers'];
  let relayers: string[] | undefined;
  if (relayersRaw !== undefined) {
    if (!Array.isArray(relayersRaw)) fail('MANIFEST_INVALID', 'relayers must be an array');
    relayers = (relayersRaw as unknown[]).map((r) => str(r, 'relayer'));
    relayers.forEach(relayerUrl);
  }
  const art = e['artifactSha256'] === undefined ? undefined : stringMap(e['artifactSha256'], 'artifactSha256', (s) => SHA256.test(s));
  const block = e['deploymentBlock'];
  if (block !== undefined && (typeof block !== 'number' || !Number.isSafeInteger(block) || block < 0)) fail('MANIFEST_INVALID', 'bad deploymentBlock');
  const notes = e['notes'] === undefined ? undefined : str(e['notes'], 'notes');
  return Object.freeze({
    route: route as ExitRouteId,
    chainId,
    status,
    contracts: Object.freeze(contracts as Record<string, Address>),
    codeHashes: Object.freeze(codeHashes as Record<string, Hex>),
    ...(art === undefined ? {} : { artifactSha256: Object.freeze(art) }),
    ...(relayers === undefined ? {} : { relayers: Object.freeze(relayers) }),
    ...(block === undefined ? {} : { deploymentBlock: block }),
    sources: Object.freeze(srcs),
    ...(notes === undefined ? {} : { notes }),
  });
}

/**
 * Hand-validates a manifest document (no schema library; repo style). Unknown fields, non-allowlisted
 * chains, malformed addresses/hashes and credential-bearing relayer URLs are rejected.
 *
 * @param raw Parsed JSON.
 * @returns A frozen manifest.
 * @throws ExternalPoolError MANIFEST_INVALID or CHAIN_NOT_ALLOWED.
 * @security The manifest is the only source of contract addresses, circuit hashes and relayer hosts (EP-GEN-3).
 */
export function parseManifest(raw: unknown): PoolManifest {
  const m = rec(raw, 'manifest');
  if (m['schema'] !== 1) fail('MANIFEST_INVALID', 'unsupported manifest schema');
  const retrieved = str(m['retrieved'], 'retrieved');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) fail('MANIFEST_INVALID', 'retrieved must be YYYY-MM-DD');
  const entries = m['entries'];
  if (!Array.isArray(entries)) fail('MANIFEST_INVALID', 'entries must be an array');
  const parsed = (entries as unknown[]).map(parseEntry);
  const seen = new Set<string>();
  for (const e of parsed) {
    const k = `${e.route}:${String(e.chainId)}`;
    if (seen.has(k)) fail('MANIFEST_INVALID', `duplicate entry ${k}`);
    seen.add(k);
  }
  return Object.freeze({ schema: 1, retrieved, entries: Object.freeze(parsed) });
}

/**
 * @param m Manifest.
 * @param route Route id.
 * @param chainId Chain id.
 * @returns The entry, or `undefined`.
 */
export function findEntry(m: PoolManifest, route: ExitRouteId, chainId: number): ManifestEntry | undefined {
  return m.entries.find((e) => e.route === route && e.chainId === chainId);
}

/**
 * Asserts that an address supplied by a third-party SDK equals the manifest address (EP-GEN-3).
 *
 * @param what Label for the message.
 * @param manifestAddress Pinned address.
 * @param other Address from the SDK or relayer.
 * @throws ExternalPoolError MANIFEST_MISMATCH on difference (case-insensitive).
 */
export function assertSameAddress(what: string, manifestAddress: Address, other: string): void {
  if (manifestAddress.toLowerCase() !== other.toLowerCase()) fail('MANIFEST_MISMATCH', `${what} differs from the pinned manifest`);
}
