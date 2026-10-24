import { parseStrictJson } from '@ghostpay/invoice-schema';
import { UserFacingError } from './errors';
import { checkDelayRange, type Settings } from './settings';

export type SharedSettings = Pick<Settings, 'delayMinSec' | 'delayMaxSec' | 'lockTimeoutMin' | 'theme' | 'autoClearFragment'>;
const FIELDS = ['autoClearFragment', 'delayMaxSec', 'delayMinSec', 'lockTimeoutMin', 'theme'];
const BAD = 'This is not a supported nonsecret settings transfer.';
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new UserFacingError(BAD);
  return value as Record<string, unknown>;
}
function validate(value: unknown): SharedSettings {
  const s = object(value, FIELDS);
  if (typeof s['delayMinSec'] !== 'number' || typeof s['delayMaxSec'] !== 'number') throw new UserFacingError(BAD);
  checkDelayRange(s['delayMinSec'], s['delayMaxSec']);
  if (!Number.isInteger(s['lockTimeoutMin']) || (s['lockTimeoutMin'] as number) < 1 || (s['lockTimeoutMin'] as number) > 240 || typeof s['autoClearFragment'] !== 'boolean' || !['system', 'light', 'dark'].includes(s['theme'] as string)) throw new UserFacingError(BAD);
  return { delayMinSec: s['delayMinSec'], delayMaxSec: s['delayMaxSec'], lockTimeoutMin: s['lockTimeoutMin'] as number, theme: s['theme'] as Settings['theme'], autoClearFragment: s['autoClearFragment'] };
}
export function exportSettingsExchange(s: Settings): string {
  const settings = validate({ delayMinSec: s.delayMinSec, delayMaxSec: s.delayMaxSec, lockTimeoutMin: s.lockTimeoutMin, theme: s.theme, autoClearFragment: s.autoClearFragment });
  return JSON.stringify({ format: 'ghostpay-settings', v: 1, settings });
}
export function parseSettingsExchange(text: string): SharedSettings {
  if (text.length > 4096 || new TextEncoder().encode(text).byteLength > 4096) throw new UserFacingError(BAD);
  let parsed: unknown;
  try { parsed = parseStrictJson(text); } catch { throw new UserFacingError(BAD); }
  const envelope = object(parsed, ['format', 'v', 'settings']);
  if (envelope['format'] !== 'ghostpay-settings' || envelope['v'] !== 1) throw new UserFacingError(BAD);
  return validate(envelope['settings']);
}
/** Call only after an explicit apply action. Keeps current local endpoints and pinned signer trust. */
export function applySettingsExchange(current: Settings, preview: SharedSettings): Settings {
  return { ...current, ...validate(preview) };
}
