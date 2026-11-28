import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertHardening,
  defaultHardening,
  hardenedSettings,
  MH_CATALOGUE,
  MH_IDS,
  normalizeHardening,
  parseHardeningJson,
  validateHardening,
  type HardeningSettings,
} from './catalogue.js';
import { MetadataHardeningError } from './guard.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('MH catalogue: validateHardening reads real booleans only', () => {
  it('a string "false" is not on (regression: truthiness made it a blocking conflict)', () => {
    const s = { enabled: { ...defaultHardening().enabled, 'MH-AMT-1': 'false', 'MH-AMT-2': 'false' }, tagMode: 'full' };
    expect(codeOf(() => validateHardening(s as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => assertHardening(s as never))).toBe('INVALID_INPUT');
  });
  it('needs an enabled map and a tagMode string', () => {
    for (const v of [undefined, null, 5, 'x', [], {}, { enabled: null, tagMode: 'full' }, { enabled: {}, tagMode: 5 }, { enabled: [], tagMode: 'full' }]) {
      expect(codeOf(() => validateHardening(v as never))).toBe('INVALID_INPUT');
    }
  });
  it('keeps the spec section 6 rules for well-formed settings', () => {
    const d = defaultHardening();
    expect(validateHardening(d).errors).toEqual([]);
    const both = { ...d, enabled: { ...d.enabled, 'MH-AMT-2': true } };
    expect(validateHardening(both).errors).toEqual(['MH-AMT-1 and MH-AMT-2: pick one.']);
    expect(codeOf(() => assertHardening(both))).toBe('CONFLICT');
    expect(validateHardening(hardenedSettings()).errors).toEqual([]);
  });
});

describe('MH catalogue: normalizeHardening (load/migrate persisted settings)', () => {
  it('fills missing ids with spec defaults and returns a validated, detached copy', () => {
    expect(normalizeHardening({ enabled: { 'MH-WAL-1': true }, tagMode: 'full' }).enabled).toEqual({ ...defaultHardening().enabled, 'MH-WAL-1': true });
    expect(normalizeHardening({})).toEqual(defaultHardening());
    expect(normalizeHardening(undefined)).toEqual(defaultHardening());
    expect(normalizeHardening(null)).toEqual(defaultHardening());
    const n = normalizeHardening({ enabled: {}, tagMode: 'full' });
    expect(Object.isFrozen(n.enabled)).toBe(true);
    expect(normalizeHardening(n)).toEqual(n);
  });
  it('drops unknown ids and prototype keys (data minimisation, forward compatibility)', () => {
    const raw = JSON.parse('{"enabled":{"MH-FUTURE-9":true,"__proto__":{"x":1},"constructor":true,"MH-WAL-1":true},"tagMode":"full","extra":{"secret":"s"}}') as unknown;
    const n = normalizeHardening(raw);
    expect(Object.keys(n).sort()).toEqual(['enabled', 'tagMode']);
    expect(Object.keys(n.enabled).sort()).toEqual([...MH_IDS].sort());
    expect(n.enabled['MH-WAL-1']).toBe(true);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it('rejects wrong types instead of coercing them', () => {
    for (const v of ['true', 1, 0, null, 'false', {}, []]) {
      expect(codeOf(() => normalizeHardening({ enabled: { 'MH-WAL-1': v } }))).toBe('INVALID_INPUT');
    }
    for (const v of [5, 'x', true, []]) expect(codeOf(() => normalizeHardening(v))).toBe('INVALID_INPUT');
    for (const e of [5, 'x', [], true]) expect(codeOf(() => normalizeHardening({ enabled: e }))).toBe('INVALID_INPUT');
    for (const t of [5, null, 'mask:9', 'FULL', ' full', {}]) expect(codeOf(() => normalizeHardening({ tagMode: t }))).toBe('INVALID_INPUT');
  });
  it('rejects a blocking conflict instead of silently accepting it', () => {
    expect(codeOf(() => normalizeHardening({ enabled: { 'MH-AMT-1': true, 'MH-AMT-2': true } }))).toBe('CONFLICT');
    expect(codeOf(() => normalizeHardening({ enabled: { 'MH-TAG-2': true }, tagMode: 'full' }))).toBe('CONFLICT');
    expect(normalizeHardening({ enabled: { 'MH-TAG-1': false, 'MH-TAG-2': true }, tagMode: 'mask:3' }).tagMode).toBe('mask:3');
  });
  it('does not mutate a deeply frozen input', () => {
    const raw = Object.freeze({ enabled: Object.freeze({ 'MH-WAL-1': true }), tagMode: 'full' });
    expect(() => normalizeHardening(raw)).not.toThrow();
    expect(raw.enabled).toEqual({ 'MH-WAL-1': true });
  });
  it('property: any object either normalises to a valid settings object or fails typed; normalising twice is stable', () => {
    fc.assert(
      fc.property(
        fc.record({ enabled: fc.option(fc.dictionary(fc.constantFrom(...MH_IDS, 'MH-X-1', '__proto__'), fc.anything()), { nil: undefined }), tagMode: fc.option(fc.anything(), { nil: undefined }) }),
        (raw) => {
          let n: HardeningSettings;
          try {
            n = normalizeHardening(raw);
          } catch (e) {
            expect(e).toBeInstanceOf(MetadataHardeningError);
            return;
          }
          expect(validateHardening(n).errors).toEqual([]);
          expect(normalizeHardening(n)).toEqual(n);
          for (const id of MH_IDS) expect(typeof n.enabled[id]).toBe('boolean');
        },
      ),
      { seed: 0x6d68, numRuns: 400 },
    );
  });
});

describe('MH catalogue: parseHardeningJson (malformed and hostile JSON)', () => {
  it('round-trips defaults and the hardened preset', () => {
    for (const s of [defaultHardening(), hardenedSettings()]) expect(parseHardeningJson(JSON.stringify(s))).toEqual(s);
  });
  it('fails typed on malformed JSON and non-strings, without echoing the text', () => {
    for (const t of ['', '{', '{"enabled":', 'null null', "{'a':1}", '\u0000', '[1,2', 'undefined', '{"enabled":{"MH-WAL-1":tru}}']) {
      try {
        parseHardeningJson(t);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(MetadataHardeningError);
        expect((e as MetadataHardeningError).code).toBe('INVALID_INPUT');
        expect((e as Error).message).toBe('settings are not valid JSON');
      }
    }
    for (const v of [undefined, null, 5, {}, []]) expect(codeOf(() => parseHardeningJson(v as never))).toBe('INVALID_INPUT');
  });
  it('treats JSON null as "no settings" only through normalizeHardening, not as valid settings JSON', () => {
    expect(codeOf(() => parseHardeningJson('[]'))).toBe('INVALID_INPUT');
    expect(codeOf(() => parseHardeningJson('5'))).toBe('INVALID_INPUT');
    expect(parseHardeningJson('{}')).toEqual(defaultHardening());
  });
  it('bounds the input size', () => {
    expect(codeOf(() => parseHardeningJson(`{"x":"${'a'.repeat(70_000)}"}`))).toBe('LIMIT_EXCEEDED');
    const deep = '['.repeat(100_000) + ']'.repeat(100_000);
    expect(codeOf(() => parseHardeningJson(deep))).toBe('LIMIT_EXCEEDED');
  });
  it('handles Unicode keys and values without corrupting known settings', () => {
    const text = JSON.stringify({ enabled: { 'MH-WAL-1': true, '設定 ✓': true }, tagMode: 'full', note: '日本語 😀' });
    const n = parseHardeningJson(text);
    expect(n.enabled['MH-WAL-1']).toBe(true);
    expect(Object.keys(n.enabled)).not.toContain('設定 ✓');
  });
});

describe('MH catalogue: normative copy', () => {
  it('has a row for every id with no anonymity claim, and is unchanged by normalisation', () => {
    for (const id of MH_IDS) {
      const row = MH_CATALOGUE[id];
      expect(`${row.title} ${row.hides} ${row.doesNotProtect}`).not.toMatch(/anonym|unlinkable|untraceable|untrackable|\bmix(er|ing)?\b/i);
      expect(row.doesNotProtect.length).toBeGreaterThan(0);
    }
    normalizeHardening(defaultHardening());
    expect(MH_CATALOGUE['MH-FEE-1'].doesNotProtect).toMatch(/No router protection/);
  });
});
