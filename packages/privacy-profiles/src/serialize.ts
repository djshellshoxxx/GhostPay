/**
 * Versioned (de)serialisation of selections. Sanitising drops unknown fields one by one, never throwing.
 * @security Acks not in the known list are dropped, so a stored blob cannot pre-acknowledge anything new.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { ACK_KEYS } from './keys.js';
import { PRESETS } from './presets.js';
import { defaultSelection } from './resolve.js';
import { OPTION_IDS } from './types.js';
import type { AckKey, OptionId, PresetId, Selection } from './types.js';

/** Stable JSON: `{ acks, preset, v, values }` with sorted keys. */
export function serializeSelection(sel: Selection): string {
  const values: Record<string, string> = {};
  for (const k of Object.keys(sel.values).sort()) {
    const v = (sel.values as Record<string, string | undefined>)[k];
    if (v !== undefined) values[k] = v;
  }
  return JSON.stringify({ acks: [...sel.acks].sort(), preset: sel.preset, v: 1, values });
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Rebuilds a valid selection from untrusted input. Version other than 1 gives the default selection. */
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
  return { preset, values, acks };
}
