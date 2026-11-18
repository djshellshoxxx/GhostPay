import { parseCompressedPoint } from '@ghostpay/core-crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { hexToBytes } from '@noble/hashes/utils.js';

/**
 * Settings exchange between a user's own devices.
 *
 * v1 carries the five portable preferences only. v2 (my-devices transfer) can additionally carry public endpoint
 * configuration and pinned signer public keys, each as a separate optional section the user selects explicitly on
 * export and opts into per section on import. Neither version ever carries private keys, passphrases, tokens kept
 * outside URLs, or vault contents: there is no section for them, and unknown sections fail closed.
 */
export interface SharedSettings {
  readonly delayMinSec: number;
  readonly delayMaxSec: number;
  readonly lockTimeoutMin: number;
  readonly theme: 'system' | 'light' | 'dark';
  readonly autoClearFragment: boolean;
}

export const SETTINGS_EXCHANGE_FORMAT = 'ghostpay-settings';
export const SETTINGS_EXCHANGE_VERSION = 1;
export const MAX_SETTINGS_EXCHANGE_BYTES = 4096;
export type SettingsExchangeErrorCode = 'INVALID_SETTINGS_EXCHANGE' | 'SETTINGS_DELAY_RANGE' | 'SETTINGS_EXCHANGE_TOO_LARGE';
export class SettingsExchangeError extends TypeError {
  public constructor(public readonly code: SettingsExchangeErrorCode = 'INVALID_SETTINGS_EXCHANGE') {
    super(`Settings exchange validation failed (${code}).`);
    this.name = 'SettingsExchangeError';
  }
}
const FIELDS = ['autoClearFragment', 'delayMaxSec', 'delayMinSec', 'lockTimeoutMin', 'theme'];

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new SettingsExchangeError();
  return value as Record<string, unknown>;
}

/** Whole seconds, 0 <= min <= max <= 24 hours; shared with the GUI settings editor. */
export function validateSettingsDelayRange(minSec: number, maxSec: number): void {
  const valid = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 86_400;
  if (!valid(minSec) || !valid(maxSec) || minSec > maxSec) throw new SettingsExchangeError('SETTINGS_DELAY_RANGE');
}

export function validateSharedSettings(value: unknown): SharedSettings {
  const s = object(value, FIELDS);
  if (typeof s['delayMinSec'] !== 'number' || typeof s['delayMaxSec'] !== 'number') throw new SettingsExchangeError();
  validateSettingsDelayRange(s['delayMinSec'], s['delayMaxSec']);
  if (!Number.isInteger(s['lockTimeoutMin']) || (s['lockTimeoutMin'] as number) < 1 || (s['lockTimeoutMin'] as number) > 240 ||
      typeof s['autoClearFragment'] !== 'boolean' || !['system', 'light', 'dark'].includes(s['theme'] as string)) throw new SettingsExchangeError();
  return { delayMinSec: s['delayMinSec'], delayMaxSec: s['delayMaxSec'], lockTimeoutMin: s['lockTimeoutMin'] as number,
    theme: s['theme'] as SharedSettings['theme'], autoClearFragment: s['autoClearFragment'] };
}

function pickPreferences(source: SharedSettings): SharedSettings {
  return validateSharedSettings({ delayMinSec: source.delayMinSec, delayMaxSec: source.delayMaxSec,
    lockTimeoutMin: source.lockTimeoutMin, theme: source.theme, autoClearFragment: source.autoClearFragment });
}

/** v1 export (CLI and older readers). Selects only the five safe fields when passed a complete local settings object. */
export function exportSettingsExchange(source: SharedSettings): string {
  return JSON.stringify({ format: SETTINGS_EXCHANGE_FORMAT, v: SETTINGS_EXCHANGE_VERSION, settings: pickPreferences(source) });
}

function envelopeOf(text: string, maxBytes: number): Record<string, unknown> {
  if (typeof text !== 'string' || text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes)
    throw new SettingsExchangeError();
  let parsed: unknown;
  try { parsed = parseStrictJson(text); } catch { throw new SettingsExchangeError(); }
  const envelope = object(parsed, ['format', 'v', 'settings']);
  if (envelope['format'] !== SETTINGS_EXCHANGE_FORMAT) throw new SettingsExchangeError();
  return envelope;
}

/** v1-only parser, kept unchanged for the CLI. Validates a preview; callers decide separately whether to apply it. */
export function parseSettingsExchange(text: string): SharedSettings {
  const envelope = envelopeOf(text, MAX_SETTINGS_EXCHANGE_BYTES);
  if (envelope['v'] !== SETTINGS_EXCHANGE_VERSION) throw new SettingsExchangeError();
  return validateSharedSettings(envelope['settings']);
}

// ---------------------------------------------------------------------------------------------------------------
// v2: my-devices public configuration transfer.

export const DEVICE_SETTINGS_EXCHANGE_VERSION = 2;
/** Whole exported text, UTF-8 bytes. Fits one byte-mode QR at version 40-L (2953 bytes) with headroom. */
export const MAX_DEVICE_SETTINGS_EXCHANGE_BYTES = 2900;
/** Entries per chain-id map (rpcUrls, rpcUrlsSecondary). */
export const MAX_DEVICE_SETTINGS_MAP_ENTRIES = 32;
/** Same cap the web settings store applies to pinned signers. */
export const MAX_DEVICE_SETTINGS_PINNED_SIGNERS = 50;
/** Per-URL bound, in UTF-16 code units, before any validator runs. */
export const MAX_DEVICE_SETTINGS_URL_CHARS = 1024;

export type DeviceSettingsSection = 'preferences' | 'rpcUrls' | 'rpcUrlsSecondary' | 'relayerUrl' | 'pinnedSigners';
export const DEVICE_SETTINGS_SECTIONS: readonly DeviceSettingsSection[] = Object.freeze(
  ['preferences', 'rpcUrls', 'rpcUrlsSecondary', 'relayerUrl', 'pinnedSigners'] as const);

/** Every section is optional; at least one is present. Maps are keyed by canonical decimal chain id. */
export interface DeviceSettings {
  readonly preferences?: SharedSettings;
  /** Non-empty; an importer merges these chains into its own map (other chains are kept). */
  readonly rpcUrls?: Readonly<Record<string, string>>;
  readonly rpcUrlsSecondary?: Readonly<Record<string, string>>;
  /** '' means "this device uses no relayer". */
  readonly relayerUrl?: string;
  /** Lowercase compressed secp256k1 public keys (66 hex chars), unique, order preserved. May be empty. */
  readonly pinnedSigners?: readonly string[];
}

/** Injected so this package does not depend on app code. Validators throw to reject and return the normalized URL. */
export interface DeviceSettingsOptions {
  /** Chain ids this device knows; map keys outside this set are rejected. */
  readonly allowedChainIds: readonly number[];
  readonly validateRpcUrl: (url: string) => string;
  readonly validateRelayerUrl: (url: string) => string;
}

const CHAIN_KEY = /^[1-9][0-9]{0,15}$/;
const SIGNER_HEX = /^0[23][0-9a-f]{64}$/;
// Raw text floor: printable ASCII without spaces (URL parsers silently strip or rewrite the rest).
const URL_CHARS = /^[\x21-\x7e]+$/;

/** Package floor on top of the injected validator: a lax validator can narrow, never widen, what is accepted. */
function floorUrl(raw: unknown, protocols: readonly string[], allowQuery: boolean): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_DEVICE_SETTINGS_URL_CHARS || !URL_CHARS.test(raw) || raw.includes('#'))
    throw new SettingsExchangeError();
  let u: URL;
  try { u = new URL(raw); } catch { throw new SettingsExchangeError(); }
  if (!protocols.includes(u.protocol) || u.username !== '' || u.password !== '' || u.hostname === '' || (!allowQuery && u.search !== ''))
    throw new SettingsExchangeError();
  return raw;
}

function checkedUrl(raw: unknown, validate: (url: string) => string, protocols: readonly string[], allowQuery: boolean): string {
  const input = floorUrl(raw, protocols, allowQuery);
  let normalized: unknown;
  try { normalized = validate(input); } catch { throw new SettingsExchangeError(); }
  return floorUrl(normalized, protocols, allowQuery);
}

function chainMap(value: unknown, options: DeviceSettingsOptions): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SettingsExchangeError();
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_DEVICE_SETTINGS_MAP_ENTRIES) throw new SettingsExchangeError();
  const allowed = new Set(options.allowedChainIds);
  const checked: [number, string][] = entries.map(([key, url]) => {
    const id = Number(key);
    if (!CHAIN_KEY.test(key) || !Number.isSafeInteger(id) || !allowed.has(id)) throw new SettingsExchangeError();
    return [id, checkedUrl(url, options.validateRpcUrl, ['https:', 'wss:'], true)];
  });
  const out: Record<string, string> = {};
  for (const [id, url] of checked.sort((a, b) => a[0] - b[0])) out[String(id)] = url;
  return out;
}

function relayer(value: unknown, options: DeviceSettingsOptions): string {
  return value === '' ? '' : checkedUrl(value, options.validateRelayerUrl, ['https:'], false);
}

function signers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_DEVICE_SETTINGS_PINNED_SIGNERS) throw new SettingsExchangeError();
  const seen = new Set<string>();
  for (const key of value as unknown[]) {
    if (typeof key !== 'string' || !SIGNER_HEX.test(key) || seen.has(key)) throw new SettingsExchangeError();
    try { parseCompressedPoint(hexToBytes(key)); } catch { throw new SettingsExchangeError(); }
    seen.add(key);
  }
  return [...seen];
}

/** Validates a v2 `settings` object (or a caller's selection) into a fresh value with canonical section order. */
export function validateDeviceSettings(value: unknown, options: DeviceSettingsOptions): DeviceSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SettingsExchangeError();
  const s = value as Record<string, unknown>;
  const keys = Object.keys(s);
  if (keys.length === 0 || keys.some((k) => !(DEVICE_SETTINGS_SECTIONS as readonly string[]).includes(k))) throw new SettingsExchangeError();
  return {
    ...('preferences' in s ? { preferences: validateSharedSettings(s['preferences']) } : {}),
    ...('rpcUrls' in s ? { rpcUrls: chainMap(s['rpcUrls'], options) } : {}),
    ...('rpcUrlsSecondary' in s ? { rpcUrlsSecondary: chainMap(s['rpcUrlsSecondary'], options) } : {}),
    ...('relayerUrl' in s ? { relayerUrl: relayer(s['relayerUrl'], options) } : {}),
    ...('pinnedSigners' in s ? { pinnedSigners: signers(s['pinnedSigners']) } : {}),
  };
}

/** Selection object with only the known section keys whose value is not undefined; extra caller fields are dropped. */
function selected(source: DeviceSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of DEVICE_SETTINGS_SECTIONS) {
    const value = source[section];
    if (value !== undefined) out[section] = section === 'preferences' ? pickPreferences(value as SharedSettings) : value;
  }
  return out;
}

/**
 * Exports exactly the sections present in `selection`. A preferences-only selection emits the byte-identical v1
 * envelope so v1-only readers (older app builds, the CLI) still accept it; anything else emits v2.
 * Throws SETTINGS_EXCHANGE_TOO_LARGE when the text would not fit one QR (the caller asks the user to select less).
 */
export function exportDeviceSettingsExchange(selection: DeviceSettings, options: DeviceSettingsOptions): string {
  const settings = validateDeviceSettings(selected(selection), options);
  const keys = Object.keys(settings);
  const text = keys.length === 1 && settings.preferences !== undefined
    ? exportSettingsExchange(settings.preferences)
    : JSON.stringify({ format: SETTINGS_EXCHANGE_FORMAT, v: DEVICE_SETTINGS_EXCHANGE_VERSION, settings });
  if (new TextEncoder().encode(text).byteLength > MAX_DEVICE_SETTINGS_EXCHANGE_BYTES) throw new SettingsExchangeError('SETTINGS_EXCHANGE_TOO_LARGE');
  return text;
}

/** Parses v1 (mapped to `{ preferences }`) or v2. Validation only: nothing is applied, and nothing is fetched. */
export function parseDeviceSettingsExchange(text: string, options: DeviceSettingsOptions): DeviceSettings {
  const envelope = envelopeOf(text, MAX_DEVICE_SETTINGS_EXCHANGE_BYTES);
  if (envelope['v'] === SETTINGS_EXCHANGE_VERSION) return { preferences: validateSharedSettings(envelope['settings']) };
  if (envelope['v'] !== DEVICE_SETTINGS_EXCHANGE_VERSION) throw new SettingsExchangeError();
  return validateDeviceSettings(envelope['settings'], options);
}
