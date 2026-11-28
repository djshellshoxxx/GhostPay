import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import {
  ALL_TRUST_PARTIES,
  CONFIG_ERROR_KEYS,
  CONFIG_VERSION,
  MAX_CONFIG_CHARS,
  MIGRATION_FROM_VERSIONS,
  emptyConfig,
  loadConfig,
  parseConfig,
  serializeConfig,
  toConfig,
} from './config.js';
import type { ConfigError, ConsentKey, ProfileConfig } from './config.js';
import { applyPreset } from './resolve.js';
import { sanitizeSelection, serializeSelection } from './serialize.js';
import { OPTION_IDS } from './types.js';
import type { AckKey, PresetId } from './types.js';
import { ctx } from './x.testutil.js';

const PRESET_IDS: PresetId[] = ['standard', 'enhanced', 'shielded', 'maximum', 'confidential-amount'];
const V2 = { v: 2, preset: 'custom', values: {}, acks: [], consents: [] };
const errs = (input: unknown): ConfigError[] => {
  const r = parseConfig(input);
  return r.ok ? [] : [...r.errors];
};
const codes = (input: unknown): string[] => errs(input).map((e) => e.code);

describe('config format and versioning', () => {
  it('current version is 2 and every older version has exactly one migration step', () => {
    expect(CONFIG_VERSION).toBe(2);
    expect([...MIGRATION_FROM_VERSIONS]).toEqual(Array.from({ length: CONFIG_VERSION - 1 }, (_v, i) => i + 1));
  });
  it('serialises canonically: sorted keys, version, consents', () => {
    const cfg = toConfig({ preset: 'custom', values: { 'sweep.dust': 'off', 'btc.rbf': 'off' }, acks: ['privacy.ack.hopsWeak', 'privacy.ack.ctTrust'] }, ['party:tor-network']);
    expect(serializeConfig(cfg)).toBe(
      '{"acks":["privacy.ack.ctTrust","privacy.ack.hopsWeak"],"consents":["party:tor-network"],"preset":"custom","v":2,"values":{"btc.rbf":"off","sweep.dust":"off"}}',
    );
  });
  it('emptyConfig is the safe default: standard label, nothing selected, nothing acknowledged or consented', () => {
    expect(emptyConfig()).toEqual({ preset: 'standard', values: {}, acks: [], consents: [] });
    expect(Object.isFrozen(emptyConfig())).toBe(true);
  });
  it('round-trips every preset result and is idempotent', () => {
    for (const id of PRESET_IDS) {
      const cfg = toConfig(applyPreset(id, ctx()).selection);
      const text = serializeConfig(cfg);
      const r = parseConfig(text);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.config).toEqual(cfg);
        expect(r.migratedFrom).toBeNull();
        expect(serializeConfig(r.config)).toBe(text);
      }
    }
  });
  it('accepts a parsed object as well as text, without keeping a reference to it', () => {
    const raw = { ...V2, values: { 'sweep.dust': 'off' } };
    const r = parseConfig(raw);
    expect(r.ok).toBe(true);
    raw.values['sweep.dust'] = 'on';
    if (r.ok) expect(r.config.values).toEqual({ 'sweep.dust': 'off' });
  });
  it('normalises: explicit default values are dropped, acks and consents sorted', () => {
    const r = parseConfig({ ...V2, values: { 'sweep.dust': 'on', 'btc.rbf': 'off' }, acks: ['privacy.ack.hopsWeak', 'privacy.ack.ctTrust'], consents: ['party:tor-network', 'party:rpc'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.values).toEqual({ 'btc.rbf': 'off' });
      expect(r.config.acks).toEqual(['privacy.ack.ctTrust', 'privacy.ack.hopsWeak']);
      expect(r.config.consents).toEqual(['party:rpc', 'party:tor-network']);
    }
  });
});

describe('migration and backward compatibility', () => {
  it('a version 1 blob written by serializeSelection migrates to version 2 with no consent', () => {
    for (const id of PRESET_IDS) {
      const sel = applyPreset(id, ctx()).selection;
      const r = parseConfig(serializeSelection(sel));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.migratedFrom).toBe(1);
        expect(r.config).toEqual({ ...sel, consents: [] });
        expect(r.config.consents).toEqual([]);
      }
    }
  });
  it('agrees with the lenient sanitizer on every valid version 1 blob', () => {
    fc.assert(
      fc.property(arbValues(), fc.subarray(['privacy.ack.hopsWeak', 'privacy.ack.ctTrust', 'privacy.ack.poolDisclosure']), (values, acks) => {
        const text = JSON.stringify({ v: 1, preset: 'custom', values, acks: [...acks] });
        const r = parseConfig(text);
        expect(r.ok).toBe(true);
        const lenient = sanitizeSelection(JSON.parse(text));
        // The strict parser also normalises explicit default values away; the lenient one keeps them.
        const nonDefault = Object.fromEntries(Object.entries(lenient.values).filter(([k, v]) => v !== OPTION_CATALOGUE[k as keyof typeof OPTION_CATALOGUE].defaultValue));
        if (r.ok) expect({ preset: r.config.preset, values: r.config.values, acks: r.config.acks }).toEqual({ ...lenient, values: nonDefault });
      }),
      { numRuns: 200 },
    );
  });
  it('migration never invents consent or acknowledgement: v1 acks stay, consents are empty', () => {
    const r = parseConfig({ v: 1, preset: 'maximum', values: {}, acks: ['privacy.ack.hopsWeak'] });
    expect(r.ok && r.config.consents).toEqual([]);
    expect(r.ok && r.config.acks).toEqual(['privacy.ack.hopsWeak']);
  });
  it('version 1 has no consents field: its presence is an unknown field, not a smuggled consent', () => {
    const e = errs({ v: 1, preset: 'custom', values: {}, acks: [], consents: ['party:rpc'] });
    expect(e.map((x) => x.code)).toEqual(['E_CONFIG_UNKNOWN_FIELD']);
    expect(e[0]?.path).toBe('/consents');
  });
  it('a newer version is refused, not guessed and not reset to defaults', () => {
    const e = errs({ ...V2, v: 3 });
    expect(e.map((x) => x.code)).toEqual(['E_CONFIG_VERSION']);
    expect(e[0]).toMatchObject({ path: '/v', key: 'privacy.err.config.version' });
  });
  it.each([0, -1, 1.5, '2', null, true, Number.NaN, Infinity])('invalid version %j is refused', (v) => {
    expect(codes({ ...V2, v })).toEqual(['E_CONFIG_VERSION']);
  });
  it('a missing version is its own error', () => {
    const rest: Record<string, unknown> = { ...V2 };
    delete rest['v'];
    expect(codes(rest)).toEqual(['E_CONFIG_NO_VERSION']);
  });
  it('loadConfig falls back to the empty config and reports why, never a partial salvage', () => {
    const r = loadConfig({ ...V2, values: { 'sweep.dust': 'off', 'sweep.exit': 'nonsense' } });
    expect(r.source).toBe('default');
    expect(r.config).toEqual(emptyConfig());
    expect(r.errors.map((e) => e.code)).toEqual(['E_CONFIG_VALUE']);
    const ok = loadConfig(V2);
    expect(ok.source).toBe('parsed');
    expect(ok.errors).toEqual([]);
  });
});

describe('strict validation gives clear, keyed, located errors', () => {
  it.each<[string, unknown, string, string]>([
    ['null', null, 'E_CONFIG_NOT_OBJECT', ''],
    ['array', [], 'E_CONFIG_NOT_OBJECT', ''],
    ['number', 5, 'E_CONFIG_NOT_OBJECT', ''],
    ['undefined', undefined, 'E_CONFIG_NOT_OBJECT', ''],
    ['not json', '{nope', 'E_CONFIG_NOT_JSON', ''],
    ['json scalar', '"x"', 'E_CONFIG_NOT_OBJECT', ''],
    ['unknown preset', { ...V2, preset: 'ultra' }, 'E_CONFIG_PRESET', '/preset'],
    ['preset wrong type', { ...V2, preset: 3 }, 'E_CONFIG_TYPE', '/preset'],
    ['preset inherited name', { ...V2, preset: 'constructor' }, 'E_CONFIG_PRESET', '/preset'],
    ['values wrong type', { ...V2, values: [] }, 'E_CONFIG_TYPE', '/values'],
    ['unknown option', { ...V2, values: { 'sweep.nope': 'on' } }, 'E_CONFIG_OPTION', '/values/sweep.nope'],
    ['operator option', { ...V2, values: { 'ops.walletFunding': 'on' } }, 'E_CONFIG_NOT_SELECTABLE', '/values/ops.walletFunding'],
    ['unknown value', { ...V2, values: { 'sweep.exit': 'nonsense' } }, 'E_CONFIG_VALUE', '/values/sweep.exit'],
    ['value wrong type', { ...V2, values: { 'sweep.hops': 2 } }, 'E_CONFIG_VALUE', '/values/sweep.hops'],
    ['acks wrong type', { ...V2, acks: 'privacy.ack.hopsWeak' }, 'E_CONFIG_TYPE', '/acks'],
    ['unknown ack', { ...V2, acks: ['privacy.ack.fake'] }, 'E_CONFIG_ACK', '/acks/0'],
    ['ack wrong type', { ...V2, acks: [5] }, 'E_CONFIG_ACK', '/acks/0'],
    ['duplicate ack', { ...V2, acks: ['privacy.ack.hopsWeak', 'privacy.ack.hopsWeak'] }, 'E_CONFIG_DUPLICATE', '/acks/1'],
    ['consents wrong type', { ...V2, consents: {} }, 'E_CONFIG_TYPE', '/consents'],
    ['unknown consent party', { ...V2, consents: ['party:nobody'] }, 'E_CONFIG_CONSENT', '/consents/0'],
    ['malformed consent', { ...V2, consents: ['rpc'] }, 'E_CONFIG_CONSENT', '/consents/0'],
    ['consent for a value that is not experimental', { ...V2, consents: ['experimental:sweep.exit=plain'] }, 'E_CONFIG_CONSENT', '/consents/0'],
    ['duplicate consent', { ...V2, consents: ['party:rpc', 'party:rpc'] }, 'E_CONFIG_DUPLICATE', '/consents/1'],
    ['unknown top-level field', { ...V2, extra: 1 }, 'E_CONFIG_UNKNOWN_FIELD', '/extra'],
    ['missing values', { v: 2, preset: 'custom', acks: [], consents: [] }, 'E_CONFIG_TYPE', '/values'],
    ['missing acks', { v: 2, preset: 'custom', values: {}, consents: [] }, 'E_CONFIG_TYPE', '/acks'],
    ['missing consents', { v: 2, preset: 'custom', values: {}, acks: [] }, 'E_CONFIG_TYPE', '/consents'],
  ])('%s', (_name, input, code, path) => {
    const r = parseConfig(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toMatchObject({ code, path });
      expect(r.errors[0]?.key.startsWith('privacy.err.config.')).toBe(true);
      expect(CONFIG_ERROR_KEYS as readonly string[]).toContain(r.errors[0]?.key);
    }
  });
  it('reports every problem, sorted by path, deterministically', () => {
    const bad = { v: 2, preset: 'x', values: { 'sweep.nope': 'a', 'sweep.exit': 'b' }, acks: ['nope'], consents: ['party:nobody'], extra: true };
    const a = errs(bad);
    expect(a.map((e) => e.path)).toEqual([...a.map((e) => e.path)].sort());
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(errs(bad)).toEqual(a);
  });
  it('accepts a real party and a real experimental value consent', () => {
    const exp = OPTION_IDS.flatMap((o) => OPTION_CATALOGUE[o].values.filter((v) => v.maturity === 'experimental').map((v) => `experimental:${o}=${v.value}` as ConsentKey));
    expect(exp.length).toBeGreaterThan(0);
    const r = parseConfig({ ...V2, consents: ['party:tor-network', ...exp] });
    expect(r.ok).toBe(true);
  });
  it('every trust party in the catalogue is a valid consent party', () => {
    for (const o of OPTION_IDS) for (const v of OPTION_CATALOGUE[o].values) for (const t of v.trust) expect(ALL_TRUST_PARTIES).toContain(t);
    expect(ALL_TRUST_PARTIES).toContain('pool-relayer');
    expect(ALL_TRUST_PARTIES).toContain('railgun-broadcaster');
  });
});

describe('boundary limits and hostile input', () => {
  it('refuses oversize text before parsing it', () => {
    const big = JSON.stringify({ ...V2, pad: 'x'.repeat(MAX_CONFIG_CHARS) });
    const r = parseConfig(big);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.map((e) => e.code)).toEqual(['E_CONFIG_TOO_LARGE']);
  });
  it('bounds array work: too many acks or consents are refused, not iterated', () => {
    expect(codes({ ...V2, acks: new Array(10_000).fill('privacy.ack.hopsWeak') })).toEqual(['E_CONFIG_TOO_LARGE']);
    expect(codes({ ...V2, consents: new Array(10_000).fill('party:rpc') })).toEqual(['E_CONFIG_TOO_LARGE']);
  });
  it('an own "__proto__" key from JSON.parse is an unknown field, never applied', () => {
    const r = parseConfig('{"v":2,"preset":"custom","values":{"__proto__":"x"},"acks":[],"consents":[],"__proto__":{"polluted":true}}');
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(codes('{"v":2,"preset":"custom","values":{},"acks":[],"consents":[],"__proto__":{"x":1}}')).toEqual(['E_CONFIG_UNKNOWN_FIELD']);
  });
  it('inherited properties are not fields', () => {
    const proto = { values: { 'sweep.hops': '3' } };
    const o = Object.create(proto) as Record<string, unknown>;
    Object.assign(o, { v: 2, preset: 'custom', acks: [], consents: [] });
    expect(codes(o)).toEqual(['E_CONFIG_TYPE']);
  });
  it('never throws on arbitrary input and never returns an unfrozen config', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const r = parseConfig(x);
        if (r.ok) expect(Object.isFrozen(r.config)).toBe(true);
        else expect(r.errors.length).toBeGreaterThan(0);
        expect(() => loadConfig(x)).not.toThrow();
        expect(() => serializeConfig(x as never)).not.toThrow();
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => parseConfig(s)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
  it('error list is bounded', () => {
    const values = Object.fromEntries(Array.from({ length: 200 }, (_v, i) => [`bogus.${i}`, 'x']));
    expect(errs({ ...V2, values }).length).toBeLessThanOrEqual(65);
  });
});

describe('property: valid configs survive a round trip unchanged', () => {
  it('parse(serialize(c)) equals c for arbitrary valid selections', () => {
    fc.assert(
      fc.property(arbValues(), fc.subarray(['privacy.ack.hopsWeak', 'privacy.ack.ctTrust']), fc.subarray(['party:rpc', 'party:tor-network', 'party:pool-relayer']), (values, acks, consents) => {
        const cfg: ProfileConfig = toConfig({ preset: 'custom', values, acks: [...acks] as AckKey[] }, [...consents] as ConsentKey[]);
        const r = parseConfig(serializeConfig(cfg));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.config).toEqual(cfg);
      }),
      { numRuns: 200 },
    );
  });
});

function arbValues(): fc.Arbitrary<Record<string, string>> {
  const sel = OPTION_IDS.filter((o) => OPTION_CATALOGUE[o].userSelectable);
  return fc.record(Object.fromEntries(sel.map((o) => [o, fc.constantFrom(...OPTION_CATALOGUE[o].values.map((v) => v.value))])), { requiredKeys: [] }) as fc.Arbitrary<Record<string, string>>;
}
