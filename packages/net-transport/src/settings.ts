import { validateRpcUrl } from '@ghostpay/chain-adapters';
import { NetTransportError } from './errors.js';
import { assertTestnet, type NetworkRef } from './guard.js';
import { validateOnionUrl } from './onion.js';
import { PROFILE_IDS, type ProfileId } from './profile.js';

/** RPC source modes (spec selector B). */
export const RPC_MODES = ['single', 'quorum', 'own-node', 'light-client'] as const;
/** RPC source mode. */
export type RpcMode = (typeof RPC_MODES)[number];

/** Scan source modes (spec selector C). */
export const SCAN_MODES = ['range', 'indexer-tor', 'pir2', 'light-client'] as const;
/** Scan source mode. */
export type ScanMode = (typeof SCAN_MODES)[number];

/** Runtime the settings are validated for. */
export type Env = 'web' | 'node';
/** Which client role a profile applies to. */
export type Role = 'rpc' | 'relayer';

/** Persisted, non-secret network-privacy settings (`ghostpay.settings.v1` -> `network`). */
export interface NetworkSettings {
  /** Transport for RPC reads. Default `direct`. */
  readonly rpcProfile: ProfileId;
  /** Transport for relayer calls. Default `direct`. */
  readonly relayerProfile: ProfileId;
  /** RPC source. Default `single`. */
  readonly rpcMode: RpcMode;
  /** Scan source. Default `range`. */
  readonly scanMode: ScanMode;
  /** Experimental toggle (required for Nym and OHTTP profiles). Default false. */
  readonly experimental: boolean;
}

/** Spec defaults: every option is opt-in; nothing is chosen automatically (NP-T-2). */
export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = Object.freeze({
  rpcProfile: 'direct',
  relayerProfile: 'direct',
  rpcMode: 'single',
  scanMode: 'range',
  experimental: false,
});

/** Options for {@link validateNetworkSettings}. */
export interface ValidateSettingsOptions {
  /** Runtime. */
  readonly env: Env;
  /** Network (testnet guard). */
  readonly network: NetworkRef;
  /** Build flags: onion and Nym builds are off in the default bundle (NP-O-1, NP-N-2). */
  readonly builds?: { readonly onion?: boolean; readonly nym?: boolean };
  /** True when an OHTTP gateway is configured for the RPC role (otherwise `ohttp` is refused for RPC). */
  readonly ohttpGatewayConfigured?: boolean;
}

interface Availability {
  readonly envs: readonly Env[];
  readonly roles: readonly Role[];
}

/** Where each profile may be selected (spec section 3 table). */
export const PROFILE_AVAILABILITY: Readonly<Record<ProfileId, Availability>> = Object.freeze({
  direct: { envs: ['web', 'node'], roles: ['rpc', 'relayer'] },
  'tor-browser': { envs: ['web'], roles: ['rpc', 'relayer'] },
  'tor-socks': { envs: ['node'], roles: ['rpc', 'relayer'] },
  onion: { envs: ['web', 'node'], roles: ['rpc', 'relayer'] },
  'i2p-outproxy': { envs: ['node'], roles: ['relayer'] },
  'nym-mixfetch': { envs: ['web'], roles: ['rpc', 'relayer'] },
  'nym-socks5': { envs: ['node'], roles: ['rpc', 'relayer'] },
  ohttp: { envs: ['web', 'node'], roles: ['rpc', 'relayer'] },
});

const KEYS: ReadonlySet<string> = new Set(['rpcProfile', 'relayerProfile', 'rpcMode', 'scanMode', 'experimental']);

function invalid(msg: string): never {
  throw new NetTransportError('INVALID_CONFIG', msg);
}

function pick<T extends string>(v: unknown, allowed: readonly T[], dflt: T, what: string): T {
  if (v === undefined) return dflt;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) return invalid(`unknown ${what}`);
  return v as T;
}

function checkProfile(id: ProfileId, role: Role, o: ValidateSettingsOptions, experimental: boolean, rpcMode: RpcMode): void {
  const a = PROFILE_AVAILABILITY[id];
  if (!a.envs.includes(o.env)) invalid('profile is not available in this environment');
  if (!a.roles.includes(role)) invalid('profile is not available for this role');
  if (id === 'onion' && o.env === 'web' && o.builds?.onion !== true) invalid('onion profile needs the onion build');
  if (id === 'onion' && role === 'rpc' && rpcMode !== 'own-node') invalid('onion RPC needs rpcMode own-node');
  if ((id === 'nym-mixfetch' || id === 'nym-socks5') && o.builds?.nym !== true && o.env === 'web') invalid('nym profile needs the nym build');
  if ((id === 'nym-mixfetch' || id === 'nym-socks5' || id === 'ohttp') && !experimental) invalid('profile needs the experimental toggle');
  if (id === 'ohttp' && role === 'rpc' && o.ohttpGatewayConfigured !== true) invalid('ohttp for RPC needs a configured gateway');
}

/**
 * Validates persisted network-privacy settings. Missing input yields {@link DEFAULT_NETWORK_SETTINGS}.
 *
 * @security Testnet-guarded. Unknown keys, unknown values and unavailable combinations are rejected
 * (fail closed), never coerced. Messages are fixed and never echo input.
 * @param raw Parsed JSON (untrusted).
 * @param o Options.
 * @throws {NetTransportError} `INVALID_CONFIG` or `NETWORK_NOT_ALLOWED`.
 */
export function validateNetworkSettings(raw: unknown, o: ValidateSettingsOptions): NetworkSettings {
  assertTestnet(o.network);
  if (raw === undefined || raw === null) return DEFAULT_NETWORK_SETTINGS;
  if (typeof raw !== 'object' || Array.isArray(raw)) return invalid('network settings must be an object');
  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) if (!KEYS.has(k)) invalid('unknown network setting');
  const experimental = obj['experimental'] === undefined ? false : obj['experimental'];
  if (typeof experimental !== 'boolean') return invalid('experimental must be a boolean');
  const rpcProfile = pick(obj['rpcProfile'], PROFILE_IDS, 'direct', 'rpc profile');
  const relayerProfile = pick(obj['relayerProfile'], PROFILE_IDS, 'direct', 'relayer profile');
  const rpcMode = pick(obj['rpcMode'], RPC_MODES, 'single', 'rpc mode');
  const scanMode = pick(obj['scanMode'], SCAN_MODES, 'range', 'scan mode');
  checkProfile(rpcProfile, 'rpc', o, experimental, rpcMode);
  checkProfile(relayerProfile, 'relayer', o, experimental, rpcMode);
  if (scanMode === 'indexer-tor' && rpcProfile === 'direct') invalid('indexer-tor needs a non-direct transport profile');
  return { rpcProfile, relayerProfile, rpcMode, scanMode, experimental };
}

/** Options for {@link validateRpcMode}. */
export interface RpcModeOptions {
  /** Network (testnet guard). */
  readonly network: NetworkRef;
  /** Permit loopback `http://` for `own-node` (development). */
  readonly allowInsecureLocalhost?: boolean;
}

const MAX_URLS = 8;

/**
 * Validates the URL list that goes with an {@link RpcMode}.
 *
 * - `single`: exactly 1 URL.
 * - `quorum`: 2..8 URLs on distinct hosts (two URLs on one host add no independence).
 * - `own-node`: exactly 1 URL, loopback (http allowed with the flag) or a valid v3 onion URL.
 * - `light-client`: 1..8 execution-RPC URLs.
 *
 * @param mode Mode.
 * @param urls URLs (untrusted strings).
 * @param o Options.
 * @returns Normalized URLs.
 * @throws {NetTransportError} `INVALID_CONFIG`, `ONION_URL`, `NETWORK_NOT_ALLOWED`; `ChainAdapterError`
 * `RPC_URL_REJECTED` from the shared URL validator. Messages never echo URLs.
 */
export function validateRpcMode(mode: RpcMode, urls: readonly string[], o: RpcModeOptions): string[] {
  assertTestnet(o.network);
  if (!(RPC_MODES as readonly string[]).includes(mode)) return invalid('unknown rpc mode');
  if (urls.length < 1 || urls.length > MAX_URLS) return invalid('wrong number of RPC URLs');
  if (mode === 'single' && urls.length !== 1) return invalid('single mode needs exactly one URL');
  if (mode === 'own-node' && urls.length !== 1) return invalid('own-node mode needs exactly one URL');
  if (mode === 'quorum' && urls.length < 2) return invalid('quorum mode needs at least two URLs');
  const out = urls.map((u) => {
    if (mode === 'own-node' && /^https?:\/\/[^/?#]*\.onion(?:[:/?#]|$)/i.test(u)) return validateOnionUrl(u, { allowHttp: true });
    if (mode === 'own-node') {
      const checked = validateRpcUrl(u, { allowInsecureLocalhost: o.allowInsecureLocalhost === true });
      const host = new URL(checked).hostname;
      const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      if (!loopback) return invalid('own-node needs a loopback or onion URL');
      return checked;
    }
    return validateRpcUrl(u);
  });
  if (mode === 'quorum' && new Set(out.map((u) => new URL(u).hostname)).size < 2) return invalid('quorum URLs must be on distinct hosts');
  return out;
}
