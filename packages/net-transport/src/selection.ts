import { FIRST_USE_NOTICE, PROFILE_VERIFICATION, TOR_BROWSER_NOTICE, UNVERIFIED_NOTICE } from './claims.js';
import type { Purpose } from './credentials.js';
import type { NetworkRef } from './guard.js';
import { validateRpcMode } from './settings.js';

/**
 * TM14: per-purpose network selection a web page can apply by itself (browser-safe, no I/O).
 *
 * A page cannot open SOCKS, reach I2P or Nym, or check that it runs in Tor Browser, so the web selection offers only:
 * - `direct` (default) and `tor-browser` (ambient: the user runs the page in Tor Browser; the request path is the same
 *   `fetch`, nothing is verified, see {@link TOR_BROWSER_NOTICE});
 * - RPC mode `single` (default) or `own-node` (the configured RPC URL must be loopback or a v3 onion URL).
 *
 * @security Defaults are unchanged and nothing is chosen automatically (NP-T-2). A non-default selection takes effect
 * only after the user acknowledged the first-use notices ({@link effectiveSelection}); until then the default applies.
 * Tor (any form), I2P, Nym and OHTTP are `unverified` ({@link PROFILE_VERIFICATION}): never tested against the real
 * network.
 */
export const WEB_SELECTABLE_PROFILES = ['direct', 'tor-browser'] as const;
/** Profile a web page can select. */
export type WebProfileId = (typeof WEB_SELECTABLE_PROFILES)[number];
/** RPC modes a web page can select. */
export const WEB_RPC_MODES = ['single', 'own-node'] as const;
/** Web RPC mode. */
export type WebRpcMode = (typeof WEB_RPC_MODES)[number];

/** Persisted, non-secret web network selection. */
export interface WebNetworkSelection {
  /** Profile for RPC reads (`scan-bulk`, `read-address`, `health`). */
  readonly rpcProfile: WebProfileId;
  /** Profile for relayer calls (`quote`, `sweep`, `submit`). */
  readonly relayerProfile: WebProfileId;
  readonly rpcMode: WebRpcMode;
  /** The user acknowledged {@link firstUseNotices} for this selection. */
  readonly noticeAcknowledged: boolean;
}

/** Storage key of the web selection (plain JSON, not secret). */
export const WEB_NETWORK_SELECTION_KEY = 'ghostpay.networkProfiles.v1';

/** Defaults: identical to the behaviour before TM14. */
export const DEFAULT_WEB_NETWORK_SELECTION: WebNetworkSelection = Object.freeze({
  rpcProfile: 'direct',
  relayerProfile: 'direct',
  rpcMode: 'single',
  noticeAcknowledged: false,
});

const KEYS: ReadonlySet<string> = new Set(['rpcProfile', 'relayerProfile', 'rpcMode', 'noticeAcknowledged']);
const RELAYER_PURPOSES: ReadonlySet<Purpose> = new Set<Purpose>(['quote', 'sweep', 'submit']);

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v);

/**
 * Parses an untrusted stored selection. Anything malformed (unknown key or value, wrong type) yields the default as a
 * whole, never a partly applied selection.
 */
export function parseWebNetworkSelection(raw: unknown): WebNetworkSelection {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_WEB_NETWORK_SELECTION;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => !KEYS.has(k))) return DEFAULT_WEB_NETWORK_SELECTION;
  const rpcProfile = o['rpcProfile'] ?? 'direct';
  const relayerProfile = o['relayerProfile'] ?? 'direct';
  const rpcMode = o['rpcMode'] ?? 'single';
  const noticeAcknowledged = o['noticeAcknowledged'] ?? false;
  if (!oneOf(rpcProfile, WEB_SELECTABLE_PROFILES) || !oneOf(relayerProfile, WEB_SELECTABLE_PROFILES)) return DEFAULT_WEB_NETWORK_SELECTION;
  if (!oneOf(rpcMode, WEB_RPC_MODES) || typeof noticeAcknowledged !== 'boolean') return DEFAULT_WEB_NETWORK_SELECTION;
  return Object.freeze({ rpcProfile, relayerProfile, rpcMode, noticeAcknowledged });
}

/** True when anything differs from the default (the acknowledgement flag aside). */
export function isNonDefaultSelection(sel: WebNetworkSelection): boolean {
  return sel.rpcProfile !== 'direct' || sel.relayerProfile !== 'direct' || sel.rpcMode !== 'single';
}

/** Notices the user must see before a non-default selection applies; empty for the default. */
export function firstUseNotices(sel: WebNetworkSelection): readonly string[] {
  if (!isNonDefaultSelection(sel)) return [];
  const profiles = [sel.rpcProfile, sel.relayerProfile];
  const out = [FIRST_USE_NOTICE];
  if (profiles.includes('tor-browser')) out.push(TOR_BROWSER_NOTICE);
  if (profiles.some((p) => PROFILE_VERIFICATION[p] === 'unverified')) out.push(UNVERIFIED_NOTICE);
  return out;
}

/** The selection that applies now: the default until a non-default one is acknowledged. */
export function effectiveSelection(sel: WebNetworkSelection): WebNetworkSelection {
  return isNonDefaultSelection(sel) && !sel.noticeAcknowledged ? DEFAULT_WEB_NETWORK_SELECTION : sel;
}

/** Profile that applies to one request purpose. */
export function profileForPurpose(sel: WebNetworkSelection, purpose: Purpose): WebProfileId {
  return RELAYER_PURPOSES.has(purpose) ? sel.relayerProfile : sel.rpcProfile;
}

/**
 * `own-node` check of an RPC URL: loopback (`http` allowed there) or a valid v3 onion URL. Testnet-guarded.
 *
 * @throws {NetTransportError} / `ChainAdapterError` with fixed messages that never echo the URL.
 */
export function checkOwnNodeRpcUrl(url: string, network: NetworkRef): string {
  const [checked] = validateRpcMode('own-node', [url], { network, allowInsecureLocalhost: true });
  return checked as string;
}
