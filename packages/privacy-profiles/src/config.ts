/**
 * Versioned, strictly validated configuration: the stored form of a selection plus the consents the user gave.
 *
 * Format version 2 is `{ v, preset, values, acks, consents }`. Version 1 (`serializeSelection`) lacks `consents` and
 * migrates by adding an empty list: a migration never invents consent or acknowledgement. A newer version is refused
 * rather than guessed. Parsing is all-or-nothing and reports every problem with a stable code, key and path; the lenient
 * `sanitizeSelection` remains for callers that prefer to salvage version 1 blobs.
 *
 * @security Input is untrusted. Text is size-checked before it is parsed, list work is bounded before it is iterated,
 * unknown fields are errors (no field is ever applied that this build does not understand), and results are deeply frozen.
 * @security A stored consent is only a record. Whether it covers what a selection needs is decided by `reviewConfig`.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { deepFreeze } from './freeze.js';
import { isRecord } from './input.js';
import { ACK_KEYS } from './keys.js';
import { PRESETS } from './presets.js';
import { OPTION_IDS } from './types.js';
import type { AckKey, ErrorKey, OptionId, Selection, TrustParty } from './types.js';

/** Current stored-configuration version. Bumping it requires a migration step (checked by a test). */
export const CONFIG_VERSION = 2;
/** Largest accepted text, in UTF-16 units (F18 section 6: 64 KiB export budget). Checked before parsing. */
export const MAX_CONFIG_CHARS = 65_536;
/** Largest accepted `values` object or list. Valid inputs are far smaller (56 options, 7 acknowledgements). */
const MAX_LIST = 64;
/** Errors reported at most, so a hostile blob cannot make the report large. */
const MAX_ERRORS = 64;

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Every party a selection can trust, derived from the catalogue so it cannot drift from it. */
export const ALL_TRUST_PARTIES: readonly TrustParty[] = deepFreeze(
  [
    ...new Set<TrustParty>([
      // Added by the evaluator for the default pool submitter, so they can appear without a catalogue row naming them.
      'pool-relayer',
      'railgun-broadcaster',
      ...OPTION_IDS.flatMap((id) => OPTION_CATALOGUE[id].values.flatMap((v) => v.trust)),
    ]),
  ].sort(),
);

/** What a user consents to: relying on a party, or using a value the specs still call experimental. */
export type ConsentKey = `party:${TrustParty}` | `experimental:${OptionId}=${string}`;

/** A selection plus its consents. Usable anywhere a {@link Selection} is. */
export interface ProfileConfig extends Selection {
  readonly consents: readonly ConsentKey[];
}

/** Parse failure kinds. */
export type ConfigErrorCode =
  | 'E_CONFIG_TOO_LARGE'
  | 'E_CONFIG_NOT_JSON'
  | 'E_CONFIG_NOT_OBJECT'
  | 'E_CONFIG_NO_VERSION'
  | 'E_CONFIG_VERSION'
  | 'E_CONFIG_UNKNOWN_FIELD'
  | 'E_CONFIG_TYPE'
  | 'E_CONFIG_PRESET'
  | 'E_CONFIG_OPTION'
  | 'E_CONFIG_NOT_SELECTABLE'
  | 'E_CONFIG_VALUE'
  | 'E_CONFIG_ACK'
  | 'E_CONFIG_CONSENT'
  | 'E_CONFIG_DUPLICATE';

/** One problem: stable code, text key, and where (JSON pointer style, `''` for the whole input). */
export interface ConfigError {
  readonly code: ConfigErrorCode;
  readonly key: ErrorKey;
  readonly path: string;
}

const KEYS: Readonly<Record<ConfigErrorCode, ErrorKey>> = {
  E_CONFIG_TOO_LARGE: 'privacy.err.config.tooLarge',
  E_CONFIG_NOT_JSON: 'privacy.err.config.notJson',
  E_CONFIG_NOT_OBJECT: 'privacy.err.config.notObject',
  E_CONFIG_NO_VERSION: 'privacy.err.config.noVersion',
  E_CONFIG_VERSION: 'privacy.err.config.version',
  E_CONFIG_UNKNOWN_FIELD: 'privacy.err.config.unknownField',
  E_CONFIG_TYPE: 'privacy.err.config.type',
  E_CONFIG_PRESET: 'privacy.err.config.preset',
  E_CONFIG_OPTION: 'privacy.err.config.option',
  E_CONFIG_NOT_SELECTABLE: 'privacy.err.config.notSelectable',
  E_CONFIG_VALUE: 'privacy.err.config.value',
  E_CONFIG_ACK: 'privacy.err.config.ack',
  E_CONFIG_CONSENT: 'privacy.err.config.consent',
  E_CONFIG_DUPLICATE: 'privacy.err.config.duplicate',
};

export { CONFIG_ERROR_KEYS } from './keys.js';

const cerr = (code: ConfigErrorCode, path: string): ConfigError => ({ code, key: KEYS[code], path });

/** Safe default: the standard label with nothing selected, acknowledged or consented. */
export function emptyConfig(): ProfileConfig {
  return deepFreeze({ preset: 'standard', values: {}, acks: [], consents: [] });
}

function isConsentKey(k: unknown): k is ConsentKey {
  if (typeof k !== 'string') return false;
  if (k.startsWith('party:')) return (ALL_TRUST_PARTIES as readonly string[]).includes(k.slice('party:'.length));
  if (k.startsWith('experimental:')) {
    const body = k.slice('experimental:'.length);
    const eq = body.indexOf('=');
    if (eq < 1) return false;
    const opt = body.slice(0, eq);
    const val = body.slice(eq + 1);
    if (!(OPTION_IDS as readonly string[]).includes(opt)) return false;
    return OPTION_CATALOGUE[opt as OptionId].values.some((v) => v.value === val && v.maturity === 'experimental');
  }
  return false;
}

/**
 * Valid consent keys in the own `consents` list of any value, sorted and unique. Anything malformed is ignored, which can
 * only mean fewer consents, never more. Work is bounded to the first 64 entries.
 */
export function readConsents(x: unknown): ConsentKey[] {
  if (!isRecord(x) || !has(x, 'consents') || !Array.isArray(x['consents'])) return [];
  return [...new Set((x['consents'] as unknown[]).slice(0, MAX_LIST).filter(isConsentKey))].sort();
}

const isAckKey = (k: unknown): k is AckKey => typeof k === 'string' && (ACK_KEYS as readonly string[]).includes(k);
const isPresetLabel = (k: unknown): k is Selection['preset'] => typeof k === 'string' && (k === 'custom' || has(PRESETS, k));

/**
 * Builds the normalised config from raw fields. With `errors`, every problem is recorded and the offending entry is
 * dropped; without it (lenient construction) problems are dropped silently. Normalised means: defaults removed,
 * lists sorted and unique.
 */
function build(
  fields: { preset: unknown; values: unknown; acks: unknown; consents: unknown },
  errors: ConfigError[] | null,
): ProfileConfig {
  const add = (code: ConfigErrorCode, path: string): void => {
    if (errors && errors.length < MAX_ERRORS) errors.push(cerr(code, path));
  };

  let preset: Selection['preset'] = 'custom';
  if (isPresetLabel(fields.preset)) preset = fields.preset;
  else add(typeof fields.preset === 'string' ? 'E_CONFIG_PRESET' : 'E_CONFIG_TYPE', '/preset');

  const values: Partial<Record<OptionId, string>> = {};
  if (!isRecord(fields.values)) add('E_CONFIG_TYPE', '/values');
  else if (Object.keys(fields.values).length > MAX_LIST) add('E_CONFIG_TOO_LARGE', '/values');
  else {
    for (const k of Object.keys(fields.values).sort()) {
      const v = fields.values[k];
      if (!(OPTION_IDS as readonly string[]).includes(k)) add('E_CONFIG_OPTION', `/values/${k}`);
      else {
        const def = OPTION_CATALOGUE[k as OptionId];
        if (!def.userSelectable) add('E_CONFIG_NOT_SELECTABLE', `/values/${k}`);
        else if (typeof v !== 'string' || !def.values.some((x) => x.value === v)) add('E_CONFIG_VALUE', `/values/${k}`);
        else if (v !== def.defaultValue) values[k as OptionId] = v;
      }
    }
  }

  const list = <T extends string>(raw: unknown, name: string, ok: (x: unknown) => x is T, bad: ConfigErrorCode): T[] => {
    if (!Array.isArray(raw)) {
      add('E_CONFIG_TYPE', `/${name}`);
      return [];
    }
    if (raw.length > MAX_LIST) {
      add('E_CONFIG_TOO_LARGE', `/${name}`);
      return [];
    }
    const seen = new Set<T>();
    raw.forEach((x: unknown, i) => {
      if (!ok(x)) add(bad, `/${name}/${i}`);
      else if (seen.has(x)) add('E_CONFIG_DUPLICATE', `/${name}/${i}`);
      else seen.add(x);
    });
    return [...seen].sort();
  };
  const acks = list<AckKey>(fields.acks, 'acks', isAckKey, 'E_CONFIG_ACK');
  const consents = list<ConsentKey>(fields.consents, 'consents', isConsentKey, 'E_CONFIG_CONSENT');
  return deepFreeze({ preset, values, acks, consents });
}

/**
 * Normalised config of any value together with every problem found, using the same strict rules as {@link parseConfig}
 * without the version field. Only own properties count. A value that is not an object gives the empty config and an error.
 * Review and snapshot code calls this so that what it evaluates is exactly what it stores.
 */
export function inspectConfig(x: unknown): { readonly config: ProfileConfig; readonly errors: readonly ConfigError[] } {
  if (!isRecord(x)) return deepFreeze({ config: emptyConfig(), errors: [cerr('E_CONFIG_NOT_OBJECT', '')] });
  const errors: ConfigError[] = [];
  const config = build(fieldsOf(x), errors);
  return deepFreeze({ config, errors });
}

/** Reads the five config fields of any object as own properties only (inherited ones are not fields). */
const fieldsOf = (o: Record<string, unknown>): { preset: unknown; values: unknown; acks: unknown; consents: unknown } => ({
  preset: has(o, 'preset') ? o['preset'] : undefined,
  values: has(o, 'values') ? o['values'] : undefined,
  acks: has(o, 'acks') ? o['acks'] : undefined,
  consents: has(o, 'consents') ? o['consents'] : undefined,
});

/**
 * Lenient constructor: a normalised config from a selection (for example an `applyPreset` result) and optional consents.
 * Invalid entries are dropped, which can only remove selections, acknowledgements and consents, never add them.
 */
export function toConfig(selection: Selection, consents: readonly ConsentKey[] = []): ProfileConfig {
  const f = fieldsOf(isRecord(selection) ? selection : {});
  return build(
    {
      preset: f.preset,
      values: isRecord(f.values) ? f.values : {},
      acks: Array.isArray(f.acks) ? f.acks.filter(isAckKey) : [],
      consents: Array.isArray(consents) ? consents.filter(isConsentKey) : [],
    },
    null,
  );
}

/** Canonical version 2 JSON with sorted keys. Total: anything that is not a config serialises as the empty config. */
export function serializeConfig(cfg: ProfileConfig): string {
  const own = isRecord(cfg) ? fieldsOf(cfg) : null;
  const c = own === null ? emptyConfig() : toConfig(cfg, Array.isArray(own.consents) ? (own.consents as ConsentKey[]) : []);
  return JSON.stringify({ acks: c.acks, consents: c.consents, preset: c.preset, v: CONFIG_VERSION, values: c.values });
}

type Raw = Readonly<Record<string, unknown>>;

/** One step per old version: version n to n + 1. Pure, and never invents acknowledgement or consent. */
const MIGRATIONS: Readonly<Record<number, (raw: Raw) => Raw>> = {
  1: (raw) => ({ ...raw, v: 2, consents: [] }),
};
/** Versions that have a migration step, ascending. A test checks they cover 1 to `CONFIG_VERSION - 1` without gaps. */
export const MIGRATION_FROM_VERSIONS: readonly number[] = deepFreeze(
  Object.keys(MIGRATIONS).map(Number).sort((a, b) => a - b),
);

/** Fields each stored version may carry. Anything else is refused before migration, so it cannot be smuggled in. */
const FIELDS_BY_VERSION: Readonly<Record<number, readonly string[]>> = {
  1: ['v', 'preset', 'values', 'acks'],
  2: ['v', 'preset', 'values', 'acks', 'consents'],
};

/** Outcome of {@link parseConfig}. */
export type ParseResult =
  | { readonly ok: true; readonly config: ProfileConfig; readonly migratedFrom: number | null }
  | { readonly ok: false; readonly errors: readonly ConfigError[] };

const fail = (errors: ConfigError[]): ParseResult => {
  const sorted = [...errors].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return deepFreeze({ ok: false as const, errors: sorted.slice(0, MAX_ERRORS) });
};

/**
 * Strict parse of stored text or an already parsed object, migrating older versions.
 * All-or-nothing: any error gives `ok: false` with every problem found (at most 64), sorted by path.
 */
export function parseConfig(input: unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    if (input.length > MAX_CONFIG_CHARS) return fail([cerr('E_CONFIG_TOO_LARGE', '')]);
    try {
      raw = JSON.parse(input) as unknown;
    } catch {
      return fail([cerr('E_CONFIG_NOT_JSON', '')]);
    }
  }
  if (!isRecord(raw)) return fail([cerr('E_CONFIG_NOT_OBJECT', '')]);
  if (!has(raw, 'v')) return fail([cerr('E_CONFIG_NO_VERSION', '/v')]);
  const v = raw['v'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > CONFIG_VERSION) return fail([cerr('E_CONFIG_VERSION', '/v')]);

  const keys = Object.keys(raw);
  if (keys.length > MAX_LIST) return fail([cerr('E_CONFIG_TOO_LARGE', '')]);
  const errors: ConfigError[] = [];
  const allowed = FIELDS_BY_VERSION[v] ?? [];
  for (const k of keys) if (!allowed.includes(k)) errors.push(cerr('E_CONFIG_UNKNOWN_FIELD', `/${k}`));

  let cur: Raw = raw;
  for (let n = v; n < CONFIG_VERSION; n++) cur = (MIGRATIONS[n] as (r: Raw) => Raw)(cur);
  const config = build(fieldsOf(cur), errors);
  if (errors.length > 0) return fail(errors);
  return deepFreeze({ ok: true as const, config, migratedFrom: v === CONFIG_VERSION ? null : v });
}

/** Result of {@link loadConfig}. */
export interface LoadResult {
  readonly config: ProfileConfig;
  readonly errors: readonly ConfigError[];
  readonly source: 'parsed' | 'default';
  readonly migratedFrom: number | null;
}

/**
 * Parse for callers that always need a config: on any error the empty config is returned together with the errors,
 * so a damaged or newer blob is never partly applied and the user can be told why.
 */
export function loadConfig(input: unknown): LoadResult {
  const r = parseConfig(input);
  if (r.ok) return deepFreeze({ config: r.config, errors: [], source: 'parsed' as const, migratedFrom: r.migratedFrom });
  return deepFreeze({ config: emptyConfig(), errors: r.errors, source: 'default' as const, migratedFrom: null });
}
