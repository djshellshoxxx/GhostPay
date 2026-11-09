import { parseStrictJson } from '@ghostpay/invoice-schema';

/** Portable preferences only. Endpoint configuration, signer trust and keys never cross this boundary. */
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
export class SettingsExchangeError extends TypeError {
  public constructor(public readonly code: 'INVALID_SETTINGS_EXCHANGE' | 'SETTINGS_DELAY_RANGE' = 'INVALID_SETTINGS_EXCHANGE') {
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

/** Selects only the five safe fields when passed a complete local settings object. */
export function exportSettingsExchange(source: SharedSettings): string {
  const settings = validateSharedSettings({ delayMinSec: source.delayMinSec, delayMaxSec: source.delayMaxSec,
    lockTimeoutMin: source.lockTimeoutMin, theme: source.theme, autoClearFragment: source.autoClearFragment });
  return JSON.stringify({ format: SETTINGS_EXCHANGE_FORMAT, v: SETTINGS_EXCHANGE_VERSION, settings });
}

/** Validates a preview; callers must separately decide whether to apply it to any local preferences. */
export function parseSettingsExchange(text: string): SharedSettings {
  if (text.length > MAX_SETTINGS_EXCHANGE_BYTES || new TextEncoder().encode(text).byteLength > MAX_SETTINGS_EXCHANGE_BYTES)
    throw new SettingsExchangeError();
  let parsed: unknown;
  try { parsed = parseStrictJson(text); } catch { throw new SettingsExchangeError(); }
  const envelope = object(parsed, ['format', 'v', 'settings']);
  if (envelope['format'] !== SETTINGS_EXCHANGE_FORMAT || envelope['v'] !== SETTINGS_EXCHANGE_VERSION) throw new SettingsExchangeError();
  return validateSharedSettings(envelope['settings']);
}
