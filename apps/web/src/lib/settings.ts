import { validateRpcUrl } from '@ghostpay/chain-adapters';
import { validateSettingsDelayRange } from '@ghostpay/qr-exchange';
import { UserFacingError } from './errors';

export const INVOICE_LINK_CLIPBOARD_DELAYS_SEC = [30, 60] as const;
type InvoiceLinkClipboardDelay = 0 | (typeof INVOICE_LINK_CLIPBOARD_DELAYS_SEC)[number];

export function invoiceLinkClipboardDelay(value: unknown): InvoiceLinkClipboardDelay {
  return INVOICE_LINK_CLIPBOARD_DELAYS_SEC.find((seconds) => seconds === value) ?? 0;
}

/** Non-secret preferences. RPC URLs are stored in plain text in this browser (unless marked session-only); the Settings page says so. */
export interface Settings {
  readonly rpcUrls: Readonly<Record<string, string>>;
  /** Optional independent second provider per chain; its answers are compared with the primary at every scan checkpoint. */
  readonly rpcUrlsSecondary: Readonly<Record<string, string>>;
  readonly relayerUrl: string;
  readonly delayMinSec: number;
  readonly delayMaxSec: number;
  readonly lockTimeoutMin: number;
  readonly theme: 'system' | 'light' | 'dark';
  readonly autoClearFragment: boolean;
  readonly invoiceLinkClipboardDelaySec: InvoiceLinkClipboardDelay;
  readonly pinnedSigners: readonly string[];
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  rpcUrls: Object.freeze({}),
  rpcUrlsSecondary: Object.freeze({}),
  relayerUrl: '',
  delayMinSec: 120,
  delayMaxSec: 900,
  lockTimeoutMin: 15,
  theme: 'system',
  autoClearFragment: true,
  invoiceLinkClipboardDelaySec: 0,
  pinnedSigners: Object.freeze([]),
});

export const SETTINGS_KEY = 'ghostpay.settings.v1';

/** Validates a user-entered RPC URL (TLS, or explicitly selected loopback HTTP; no userinfo or fragment). */
export function checkRpcUrl(raw: string): string {
  try {
    return validateRpcUrl(raw.trim(), { allowInsecureLocalhost: true });
  } catch {
    throw new UserFacingError({ key: 'error.settings.rPCURLRejectedUseHttpsOrWssWithNoUsername' });
  }
}

const SECRET_QUERY_NAME = /^(?:key|apikey|api[-_]?key|token|access[-_]?token|auth|authorization|secret|password|passwd|jwt|sig|signature|project[-_]?id)$/i;
const SECRET_PATH_CONTEXT = /^(?:v[0-9]+|key|keys|token|apikey|api[-_]?key|auth|rpc|api)$/i;
const SECRET_PATH_LABEL = /^(?:key|keys|token|access[-_]?token|apikey|api[-_]?key|auth|authorization|secret|password|passwd|jwt)$/i;

function tokenLike(v: string, min: number): boolean {
  return v.length >= min && /^[A-Za-z0-9_+/=-]+$/.test(v) && /[0-9]/.test(v) && /[A-Za-z]/.test(v);
}

/**
 * Heuristic: does this RPC URL appear to carry a provider key in its path or query (`/v2/<token>`, `?apikey=`, a long
 * hex or base64 segment)? A hit means the key would sit in plain text in this browser and be shown on screen. False
 * negatives are possible; this is a warning aid, not a guarantee.
 */
export function rpcUrlLooksSecret(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  for (const [name, value] of u.searchParams) {
    if (value !== '' && (SECRET_QUERY_NAME.test(name) || tokenLike(value, 20))) return true;
  }
  const segments = u.pathname.split('/').filter((x) => x !== '').map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  return segments.some((seg, i) => {
    if (/^(?:0x)?[0-9a-f]{32,}$/i.test(seg)) return true;
    if (tokenLike(seg, 24)) return true;
    const prev = i > 0 ? segments[i - 1] : undefined;
    return prev !== undefined && (SECRET_PATH_LABEL.test(prev) || (SECRET_PATH_CONTEXT.test(prev) && tokenLike(seg, 12)));
  });
}

/**
 * Endpoints the user chose to keep for this page session only. Module memory, never written to storage: `saveSettings`
 * omits an entry whose chain and URL match. Reloading the app drops them.
 */
export type RpcSlot = 'primary' | 'secondary';
const sessionOnly = new Map<string, string>();
const sessionKey = (slot: RpcSlot, chainId: string): string => `${slot}:${chainId}`;

export function setRpcSessionOnly(slot: RpcSlot, chainId: string, url: string | undefined): void {
  if (url === undefined || url.trim() === '') sessionOnly.delete(sessionKey(slot, chainId));
  else sessionOnly.set(sessionKey(slot, chainId), checkRpcUrl(url));
}

export function isRpcSessionOnly(slot: RpcSlot, chainId: string, url: string): boolean {
  const saved = sessionOnly.get(sessionKey(slot, chainId));
  if (saved === undefined) return false;
  try { return saved === checkRpcUrl(url); } catch { return false; }
}

export function clearRpcSessionOnly(): void {
  sessionOnly.clear();
}

/** Validates a relayer base URL (https only, no credentials, no query or fragment). */
export function checkRelayerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new UserFacingError({ key: 'error.settings.relayerURLIsNotAValidURL' });
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') {
    throw new UserFacingError({ key: 'error.settings.relayerURLMustBeHttpsWithNoCredentialsQueryOr' });
  }
  return u.origin + u.pathname.replace(/\/+$/, '');
}

/** Delay bounds must be whole seconds, 0 <= min <= max <= 24 h. */
export function checkDelayRange(minSec: number, maxSec: number): void {
  try { validateSettingsDelayRange(minSec, maxSec); }
  catch {
    throw new UserFacingError({ key: 'error.settings.delayRangeMustBeWholeSecondsMinimumAtMostMaximum' });
  }
}

function sanitizeRpcMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^[1-9][0-9]{0,15}$/.test(k) || typeof v !== 'string') continue;
      try {
        out[k] = checkRpcUrl(v);
      } catch {
        /* drop invalid entry */
      }
    }
  }
  return out;
}

/** Coerces untrusted stored JSON to a valid `Settings`; anything unexpected falls back to defaults field by field. */
export function sanitizeSettings(raw: unknown): Settings {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rpcUrls = sanitizeRpcMap(o['rpcUrls']);
  const rpcUrlsSecondary = sanitizeRpcMap(o['rpcUrlsSecondary'] ?? o['secondaryRpcUrls']);
  let relayerUrl = '';
  if (typeof o['relayerUrl'] === 'string') {
    try {
      relayerUrl = checkRelayerUrl(o['relayerUrl']);
    } catch {
      relayerUrl = '';
    }
  }
  let delayMinSec: number = DEFAULT_SETTINGS.delayMinSec;
  let delayMaxSec: number = DEFAULT_SETTINGS.delayMaxSec;
  try {
    const a = o['delayMinSec'];
    const b = o['delayMaxSec'];
    if (typeof a === 'number' && typeof b === 'number') {
      checkDelayRange(a, b);
      delayMinSec = a;
      delayMaxSec = b;
    }
  } catch {
    /* keep defaults */
  }
  const lock = o['lockTimeoutMin'];
  const lockTimeoutMin = typeof lock === 'number' && Number.isInteger(lock) && lock >= 1 && lock <= 240 ? lock : DEFAULT_SETTINGS.lockTimeoutMin;
  const t = o['theme'];
  const theme = t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
  const pins = Array.isArray(o['pinnedSigners'])
    ? (o['pinnedSigners'] as unknown[]).filter((p): p is string => typeof p === 'string' && /^(?:02|03)[0-9a-f]{64}$/.test(p)).slice(0, 50)
    : [];
  return {
    rpcUrls,
    rpcUrlsSecondary,
    relayerUrl,
    delayMinSec,
    delayMaxSec,
    lockTimeoutMin,
    theme,
    autoClearFragment: typeof o['autoClearFragment'] === 'boolean' ? o['autoClearFragment'] : true,
    invoiceLinkClipboardDelaySec: invoiceLinkClipboardDelay(o['invoiceLinkClipboardDelaySec']),
    pinnedSigners: pins,
  };
}

/** Storage-failure-tolerant load. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): Settings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return text === null || text === undefined ? DEFAULT_SETTINGS : sanitizeSettings(JSON.parse(text));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Saves only validated non-secret preferences. Returns false when storage is unavailable. */
export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()): boolean {
  try {
    if (storage === undefined) return false;
    // Structural typing permits callers to carry extra fields. Never persist those fields or their
    // toJSON hooks: this storage boundary is deliberately separate from encrypted key backups.
    const clean = sanitizeSettings(s);
    const strip = (slot: RpcSlot, map: Readonly<Record<string, string>>): Record<string, string> =>
      Object.fromEntries(Object.entries(map).filter(([k, v]) => !isRpcSessionOnly(slot, k, v)));
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...clean, rpcUrls: strip('primary', clean.rpcUrls), rpcUrlsSecondary: strip('secondary', clean.rpcUrlsSecondary) }));
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// i18n-use: error.settings.rPCURLRejectedUseHttpsOrWssWithNoUsername error.settings.relayerURLIsNotAValidURL error.settings.relayerURLMustBeHttpsWithNoCredentialsQueryOr error.settings.delayRangeMustBeWholeSecondsMinimumAtMostMaximum
