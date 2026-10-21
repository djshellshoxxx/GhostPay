import { validateRpcUrl } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';

/** Non-secret preferences. RPC URLs are stored in plain text in this browser; the Settings page says so. */
export interface Settings {
  readonly rpcUrls: Readonly<Record<string, string>>;
  readonly relayerUrl: string;
  readonly delayMinSec: number;
  readonly delayMaxSec: number;
  readonly lockTimeoutMin: number;
  readonly theme: 'system' | 'light' | 'dark';
  readonly autoClearFragment: boolean;
  readonly pinnedSigners: readonly string[];
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  rpcUrls: Object.freeze({}),
  relayerUrl: '',
  delayMinSec: 120,
  delayMaxSec: 900,
  lockTimeoutMin: 15,
  theme: 'system',
  autoClearFragment: true,
  pinnedSigners: Object.freeze([]),
});

export const SETTINGS_KEY = 'ghostpay.settings.v1';
const MAX_DELAY_SEC = 24 * 3600;

/** Validates a user-entered RPC URL (https only, no credentials, no fragment). Returns the normalized URL. */
export function checkRpcUrl(raw: string): string {
  try {
    return validateRpcUrl(raw.trim());
  } catch {
    throw new UserFacingError('RPC URL rejected: use https://, with no username, password or fragment.');
  }
}

/** Validates a relayer base URL (https only, no credentials, no query or fragment). */
export function checkRelayerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new UserFacingError('Relayer URL is not a valid URL.');
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') {
    throw new UserFacingError('Relayer URL must be https:// with no credentials, query or fragment.');
  }
  return u.origin + u.pathname.replace(/\/+$/, '');
}

/** Delay bounds must be whole seconds, 0 <= min <= max <= 24 h. */
export function checkDelayRange(minSec: number, maxSec: number): void {
  const ok = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_DELAY_SEC;
  if (!ok(minSec) || !ok(maxSec) || minSec > maxSec) {
    throw new UserFacingError('Delay range must be whole seconds, minimum at most maximum, up to 24 hours.');
  }
}

/** Coerces untrusted stored JSON to a valid `Settings`; anything unexpected falls back to defaults field by field. */
export function sanitizeSettings(raw: unknown): Settings {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rpcUrls: Record<string, string> = {};
  const rawRpc = o['rpcUrls'];
  if (typeof rawRpc === 'object' && rawRpc !== null && !Array.isArray(rawRpc)) {
    for (const [k, v] of Object.entries(rawRpc as Record<string, unknown>)) {
      if (!/^[1-9][0-9]{0,15}$/.test(k) || typeof v !== 'string') continue;
      try {
        rpcUrls[k] = checkRpcUrl(v);
      } catch {
        /* drop invalid entry */
      }
    }
  }
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
    relayerUrl,
    delayMinSec,
    delayMaxSec,
    lockTimeoutMin,
    theme,
    autoClearFragment: typeof o['autoClearFragment'] === 'boolean' ? o['autoClearFragment'] : true,
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

/** Storage-failure-tolerant save. Returns false when storage is unavailable. */
export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
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
