import {
  DEVICE_SETTINGS_SECTIONS, exportDeviceSettingsExchange, MAX_DEVICE_SETTINGS_PINNED_SIGNERS, parseDeviceSettingsExchange,
  SettingsExchangeError, validateDeviceSettings, type DeviceSettings, type DeviceSettingsOptions, type DeviceSettingsSection,
  type SharedSettings,
} from '@ghostpay/qr-exchange';
import { UserFacingError } from './errors';
import { checkRelayerUrl, checkRpcUrl, sanitizeSettings, type Settings } from './settings';

export type { DeviceSettings, SharedSettings } from '@ghostpay/qr-exchange';
export type ExchangeSection = DeviceSettingsSection;
export const EXCHANGE_SECTIONS: readonly ExchangeSection[] = DEVICE_SETTINGS_SECTIONS;
/** Only preferences are preselected; endpoint and trust sections are always an explicit choice. */
export const DEFAULT_EXPORT_SECTIONS: readonly ExchangeSection[] = ['preferences'];

function localized<T>(operation: () => T, fallback: 'error.settingsExchange.invalid' | 'settings.exchange.exportFailed' = 'error.settingsExchange.invalid'): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof SettingsExchangeError) {
      throw new UserFacingError({ key: error.code === 'SETTINGS_DELAY_RANGE' ? 'error.settings.delayRangeMustBeWholeSecondsMinimumAtMostMaximum'
        : error.code === 'SETTINGS_EXCHANGE_TOO_LARGE' ? 'settings.exchange.tooLarge' : fallback });
    }
    throw error;
  }
}

/** The same URL rules as the Settings form; the package adds its own floor on top. */
export function exchangeOptions(chainIds: readonly number[]): DeviceSettingsOptions {
  return { allowedChainIds: chainIds, validateRpcUrl: checkRpcUrl, validateRelayerUrl: checkRelayerUrl };
}

function preferencesOf(s: Settings): SharedSettings {
  return { delayMinSec: s.delayMinSec, delayMaxSec: s.delayMaxSec, lockTimeoutMin: s.lockTimeoutMin, theme: s.theme, autoClearFragment: s.autoClearFragment };
}

function knownChains(map: Readonly<Record<string, string>>, chainIds: readonly number[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of [...chainIds].sort((a, b) => a - b)) { const url = map[String(id)]; if (url !== undefined && url !== '') out[String(id)] = url; }
  return out;
}

/** Whether a section has anything to export (empty maps are never sent; an empty relayer means "no relayer"). */
export function exportSectionAvailable(s: Settings, section: ExchangeSection, chainIds: readonly number[]): boolean {
  if (section === 'rpcUrls') return Object.keys(knownChains(s.rpcUrls, chainIds)).length > 0;
  if (section === 'rpcUrlsSecondary') return Object.keys(knownChains(s.rpcUrlsSecondary, chainIds)).length > 0;
  if (section === 'pinnedSigners') return s.pinnedSigners.length > 0;
  return true;
}

/** Exactly what an export of `sections` carries; the export listing is rendered from this same value. */
export function buildSettingsExport(s: Settings, sections: readonly ExchangeSection[], chainIds: readonly number[]): DeviceSettings {
  const want = (section: ExchangeSection): boolean => sections.includes(section) && exportSectionAvailable(s, section, chainIds);
  return {
    ...(want('preferences') ? { preferences: preferencesOf(s) } : {}),
    ...(want('rpcUrls') ? { rpcUrls: knownChains(s.rpcUrls, chainIds) } : {}),
    ...(want('rpcUrlsSecondary') ? { rpcUrlsSecondary: knownChains(s.rpcUrlsSecondary, chainIds) } : {}),
    ...(want('relayerUrl') ? { relayerUrl: s.relayerUrl } : {}),
    ...(want('pinnedSigners') ? { pinnedSigners: [...s.pinnedSigners] } : {}),
  };
}

/** Preferences only (the default) emits the v1 envelope; any other selection emits v2. */
export function exportSettingsExchange(s: Settings, sections: readonly ExchangeSection[] = DEFAULT_EXPORT_SECTIONS, chainIds: readonly number[] = []): string {
  return localized(() => exportDeviceSettingsExchange(buildSettingsExport(s, sections, chainIds), exchangeOptions(chainIds)), 'settings.exchange.exportFailed');
}

/** Validation only (v1 or v2). Never applies anything and never contacts an imported endpoint. */
export function parseSettingsExchange(text: string, chainIds: readonly number[] = []): DeviceSettings {
  return localized(() => parseDeviceSettingsExchange(text, exchangeOptions(chainIds)));
}

export interface ValueDiff<T> { readonly current: T; readonly incoming: T; readonly changed: boolean }
export interface ChainEntryDiff { readonly chainId: string; readonly current: string | undefined; readonly incoming: string; readonly changed: boolean }
export interface ChainMapDiff { readonly entries: readonly ChainEntryDiff[]; readonly changed: boolean }
export interface SignerDiff {
  /** Incoming keys this device does not pin yet: untrusted until the user ticks each one. */
  readonly added: readonly string[];
  /** Keys pinned here but absent on the other device: removed only on an explicit opt-in. */
  readonly removed: readonly string[];
  readonly unchanged: number;
  readonly changed: boolean;
}

export interface SettingsExchangePreview {
  /** The settings the diff was computed against; apply refuses a different basis. */
  readonly basis: Settings;
  readonly chainIds: readonly number[];
  readonly incoming: DeviceSettings;
  readonly preferences?: ValueDiff<SharedSettings>;
  readonly rpcUrls?: ChainMapDiff;
  readonly rpcUrlsSecondary?: ChainMapDiff;
  readonly relayerUrl?: ValueDiff<string>;
  readonly pinnedSigners?: SignerDiff;
  /** False when importing this code would change nothing ("no changes"). */
  readonly changed: boolean;
}

export interface SettingsExchangeSelection {
  readonly preferences?: boolean;
  readonly rpcUrls?: boolean;
  readonly rpcUrlsSecondary?: boolean;
  readonly relayerUrl?: boolean;
  /** Subset of `preview.pinnedSigners.added` the user ticked. */
  readonly addSigners?: readonly string[];
  readonly removeSigners?: boolean;
}

const samePreferences = (a: SharedSettings, b: SharedSettings): boolean =>
  a.delayMinSec === b.delayMinSec && a.delayMaxSec === b.delayMaxSec && a.lockTimeoutMin === b.lockTimeoutMin && a.theme === b.theme && a.autoClearFragment === b.autoClearFragment;

const sameMap = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

function sameSettings(a: Settings, b: Settings): boolean {
  return samePreferences(preferencesOf(a), preferencesOf(b)) && sameMap(a.rpcUrls, b.rpcUrls) && sameMap(a.rpcUrlsSecondary, b.rpcUrlsSecondary) &&
    a.relayerUrl === b.relayerUrl && a.pinnedSigners.length === b.pinnedSigners.length && a.pinnedSigners.every((p, i) => b.pinnedSigners[i] === p);
}

function mapDiff(current: Readonly<Record<string, string>>, incoming: Readonly<Record<string, string>>): ChainMapDiff {
  const entries = Object.entries(incoming).map(([chainId, url]) => ({ chainId, current: current[chainId], incoming: url, changed: current[chainId] !== url }));
  return { entries, changed: entries.some((e) => e.changed) };
}

/** Per-section current vs incoming values. Pure: computing a preview makes no request to any imported endpoint. */
export function previewSettingsExchange(current: Settings, incoming: DeviceSettings, chainIds: readonly number[]): SettingsExchangePreview {
  const prefs = incoming.preferences;
  const pins = incoming.pinnedSigners;
  const preferences = prefs === undefined ? undefined : { current: preferencesOf(current), incoming: prefs, changed: !samePreferences(preferencesOf(current), prefs) };
  const rpcUrls = incoming.rpcUrls === undefined ? undefined : mapDiff(current.rpcUrls, incoming.rpcUrls);
  const rpcUrlsSecondary = incoming.rpcUrlsSecondary === undefined ? undefined : mapDiff(current.rpcUrlsSecondary, incoming.rpcUrlsSecondary);
  const relayerUrl = incoming.relayerUrl === undefined ? undefined : { current: current.relayerUrl, incoming: incoming.relayerUrl, changed: current.relayerUrl !== incoming.relayerUrl };
  let pinnedSigners: SignerDiff | undefined;
  if (pins !== undefined) {
    const added = pins.filter((p) => !current.pinnedSigners.includes(p));
    const removed = current.pinnedSigners.filter((p) => !pins.includes(p));
    pinnedSigners = { added, removed, unchanged: pins.length - added.length, changed: added.length > 0 || removed.length > 0 };
  }
  const sections = [preferences, rpcUrls, rpcUrlsSecondary, relayerUrl, pinnedSigners];
  return {
    basis: current, chainIds: [...chainIds], incoming,
    ...(preferences !== undefined ? { preferences } : {}),
    ...(rpcUrls !== undefined ? { rpcUrls } : {}),
    ...(rpcUrlsSecondary !== undefined ? { rpcUrlsSecondary } : {}),
    ...(relayerUrl !== undefined ? { relayerUrl } : {}),
    ...(pinnedSigners !== undefined ? { pinnedSigners } : {}),
    changed: sections.some((d) => d?.changed === true),
  };
}

/** Changed preferences are preselected; endpoints, relayer and every signer start unticked. */
export function defaultExchangeSelection(preview: SettingsExchangePreview): SettingsExchangeSelection {
  return { preferences: preview.preferences?.changed === true, rpcUrls: false, rpcUrlsSecondary: false, relayerUrl: false, addSigners: [], removeSigners: false };
}

/**
 * Imported preferences that weaken local protection: a longer idle lock, keeping invoice keys in the address bar, or
 * shorter submission delays (less timing jitter). Stronger or cosmetic changes (theme) are not weaker.
 */
export function weakensPreferences(diff: ValueDiff<SharedSettings> | undefined): boolean {
  if (diff === undefined || !diff.changed) return false;
  const { current: c, incoming: i } = diff;
  return i.lockTimeoutMin > c.lockTimeoutMin || (c.autoClearFragment && !i.autoClearFragment) ||
    i.delayMinSec < c.delayMinSec || i.delayMaxSec < c.delayMaxSec;
}

/**
 * Changes to what this device trusts or how well it protects itself need a second, explicit confirmation: relayer,
 * pinned signers, RPC endpoints (an RPC can misreport payments and sees which addresses are checked) and weaker
 * preferences. A forged "my devices" QR must never take effect with one tick and one click.
 */
export function needsTrustConfirmation(preview: SettingsExchangePreview, selection: SettingsExchangeSelection): boolean {
  return (selection.relayerUrl === true && preview.relayerUrl?.changed === true) || (selection.addSigners ?? []).length > 0 ||
    (selection.removeSigners === true && (preview.pinnedSigners?.removed.length ?? 0) > 0) ||
    (selection.rpcUrls === true && preview.rpcUrls?.changed === true) ||
    (selection.rpcUrlsSecondary === true && preview.rpcUrlsSecondary?.changed === true) ||
    (selection.preferences === true && weakensPreferences(preview.preferences));
}

/** Whether `selection` would change anything at all. */
export function selectionChangesSomething(preview: SettingsExchangePreview, selection: SettingsExchangeSelection): boolean {
  return (selection.preferences === true && preview.preferences?.changed === true) ||
    (selection.rpcUrls === true && preview.rpcUrls?.changed === true) ||
    (selection.rpcUrlsSecondary === true && preview.rpcUrlsSecondary?.changed === true) ||
    needsTrustConfirmation(preview, selection);
}

const applyFailed = (): never => { throw new UserFacingError({ key: 'settings.exchange.applyFailed' }); };

/**
 * Pure and all-or-nothing: validates the whole preview and selection first, then returns the next Settings object for
 * one save call. Throws (changing nothing) on a stale preview, a forged selection, or a result storage would alter.
 * RPC maps merge (incoming chains replace only those chains); the relayer and preferences are replaced; ticked signers
 * are added and, only with `removeSigners`, keys missing on the other device are removed.
 */
export function applySettingsExchange(current: Settings, preview: SettingsExchangePreview, selection: SettingsExchangeSelection): Settings {
  if (!sameSettings(current, preview.basis)) applyFailed();
  // Recheck the preview's own content: it is ordinary state and must not be trusted because it once parsed.
  const incoming = localized(() => validateDeviceSettings(preview.incoming, exchangeOptions(preview.chainIds)));
  const add = selection.addSigners ?? [];
  const offered = preview.pinnedSigners?.added ?? [];
  if (new Set(add).size !== add.length || add.some((p) => !offered.includes(p) || !(incoming.pinnedSigners ?? []).includes(p))) applyFailed();
  if (selection.removeSigners === true && incoming.pinnedSigners === undefined) applyFailed();
  const take = (section: 'preferences' | 'rpcUrls' | 'rpcUrlsSecondary' | 'relayerUrl'): boolean => {
    if (selection[section] !== true) return false;
    if (incoming[section] === undefined) applyFailed();
    return true;
  };
  const prefs = take('preferences') && incoming.preferences !== undefined ? incoming.preferences : preferencesOf(current);
  const rpcUrls = take('rpcUrls') ? { ...current.rpcUrls, ...incoming.rpcUrls } : current.rpcUrls;
  const rpcUrlsSecondary = take('rpcUrlsSecondary') ? { ...current.rpcUrlsSecondary, ...incoming.rpcUrlsSecondary } : current.rpcUrlsSecondary;
  const relayerUrl = take('relayerUrl') && incoming.relayerUrl !== undefined ? incoming.relayerUrl : current.relayerUrl;
  const remove = selection.removeSigners === true ? new Set(current.pinnedSigners.filter((p) => !(incoming.pinnedSigners ?? []).includes(p))) : new Set<string>();
  const pinnedSigners = [...current.pinnedSigners.filter((p) => !remove.has(p)), ...add.filter((p) => !current.pinnedSigners.includes(p))];
  if (pinnedSigners.length > MAX_DEVICE_SETTINGS_PINNED_SIGNERS) applyFailed();
  const next: Settings = { ...current, ...prefs, rpcUrls, rpcUrlsSecondary, relayerUrl, pinnedSigners };
  // Saving sanitizes; a result it would silently alter is a partial apply, so refuse it here instead.
  if (!sameSettings(sanitizeSettings(next), next)) applyFailed();
  return next;
}

// i18n-use: error.settingsExchange.invalid error.settings.delayRangeMustBeWholeSecondsMinimumAtMostMaximum settings.exchange.tooLarge settings.exchange.exportFailed settings.exchange.applyFailed
