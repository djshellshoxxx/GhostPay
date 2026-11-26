/**
 * Versioned (de)serialisation of selections. Sanitising drops unknown fields one by one, never throwing.
 * @security Acks not in the known list are dropped, so a stored blob cannot pre-acknowledge anything new.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { deepFreeze } from './freeze.js';
import { isRecord, normalizeSelection } from './input.js';
import { ACK_KEYS } from './keys.js';
import { PRESETS } from './presets.js';
import { defaultSelection } from './resolve.js';
import { OPTION_IDS } from './types.js';
import type { AckKey, OptionId, PresetId, Selection } from './types.js';

/**
 * Stable version 1 JSON: `{ acks, preset, v, values }` with sorted keys. Total: a malformed selection is repaired to its
 * restrictive form first, so only a valid blob is ever written. Version 2 (with consents) is `serializeConfig`.
 */
export function serializeSelection(selIn: Selection): string {
  const sel = normalizeSelection(selIn).selection;
  const values: Record<string, string> = {};
  for (const k of Object.keys(sel.values).sort()) {
    const v = (sel.values as Record<string, string | undefined>)[k];
    if (typeof v === 'string') values[k] = v;
  }
  const acks = sel.acks.filter((a): a is AckKey => typeof a === 'string');
  return JSON.stringify({ acks: [...acks].sort(), preset: typeof sel.preset === 'string' ? sel.preset : 'custom', v: 1, values });
}

/**
 * Lenient rebuild of a version 1 selection from untrusted input: unknown fields are dropped one by one and any other
 * version gives the default selection. Callers that must tell the user what was wrong use `parseConfig` instead.
 */
export function sanitizeSelection(raw: unknown): Selection {
  if (!isRecord(raw) || raw['v'] !== 1) return defaultSelection();
  const preset: Selection['preset'] =
    typeof raw['preset'] === 'string' && (raw['preset'] === 'custom' || Object.prototype.hasOwnProperty.call(PRESETS, raw['preset']))
      ? (raw['preset'] as PresetId | 'custom')
      : 'custom';
  const values: Partial<Record<OptionId, string>> = {};
  const rv = raw['values'];
  if (isRecord(rv)) {
    for (const id of OPTION_IDS) {
      if (!Object.prototype.hasOwnProperty.call(rv, id)) continue;
      const v = rv[id];
      const def = OPTION_CATALOGUE[id];
      if (def.userSelectable && typeof v === 'string' && def.values.some((x) => x.value === v)) values[id] = v;
    }
  }
  const acks = Array.isArray(raw['acks'])
    ? [...new Set((raw['acks'] as unknown[]).filter((a): a is AckKey => typeof a === 'string' && (ACK_KEYS as readonly string[]).includes(a)))].sort()
    : [];
  return deepFreeze({ preset, values, acks });
}
