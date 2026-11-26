import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE, OPTION_GROUPS, POOL_EXIT_VALUES, SPONSORED_PAYER_MODES } from './catalogue.js';
import { CHAIN_RULES } from './chainRules.js';
import { emptyConfig, parseConfig, toConfig } from './config.js';
import { describePreset } from './claims.js';
import { evaluate, explain, honestLabel } from './evaluate.js';
import { PRESETS } from './presets.js';
import { acknowledge, applyPreset, defaultSelection, setOption } from './resolve.js';
import { RULES } from './rules.js';
import { sanitizeSelection, serializeSelection } from './serialize.js';
import { reviewConfig } from './snapshot.js';
import { STEP_CATALOGUE } from './steps.js';
import type { OptionId, Selection } from './types.js';
import { ctx } from './x.testutil.js';

const deepFrozen = (x: unknown, path = 'root', seen = new Set<unknown>()): string[] => {
  if (typeof x !== 'object' || x === null || seen.has(x) || x instanceof Set || x instanceof Map) return [];
  seen.add(x);
  const bad = Object.isFrozen(x) ? [] : [path];
  for (const k of Reflect.ownKeys(x)) bad.push(...deepFrozen((x as Record<PropertyKey, unknown>)[k], `${path}.${String(k)}`, seen));
  return bad;
};

describe('static definition data cannot be edited at run time', () => {
  it.each<[string, unknown]>([
    ['OPTION_CATALOGUE', OPTION_CATALOGUE],
    ['OPTION_GROUPS', OPTION_GROUPS],
    ['POOL_EXIT_VALUES', POOL_EXIT_VALUES],
    ['SPONSORED_PAYER_MODES', SPONSORED_PAYER_MODES],
    ['RULES', RULES],
    ['PRESETS', PRESETS],
    ['CHAIN_RULES', CHAIN_RULES],
    ['STEP_CATALOGUE', STEP_CATALOGUE],
  ])('%s is deeply frozen', (_n, table) => {
    expect(deepFrozen(table)).toEqual([]);
  });
  it('edits throw and change nothing', () => {
    const before = JSON.stringify([OPTION_CATALOGUE, RULES, PRESETS]);
    expect(() => {
      (OPTION_CATALOGUE['sweep.exit'] as { defaultValue: string }).defaultValue = 'railgun';
    }).toThrow(TypeError);
    expect(() => {
      (OPTION_CATALOGUE['sweep.exit'].values as unknown[]).pop();
    }).toThrow(TypeError);
    expect(() => {
      (RULES as unknown[]).length = 0;
    }).toThrow(TypeError);
    expect(() => {
      (PRESETS.maximum.prefer['sweep.exit'] as string[]).unshift('mock-pool');
    }).toThrow(TypeError);
    expect(() => {
      delete (PRESETS as Record<string, unknown>)['maximum'];
    }).toThrow(TypeError);
    expect(() => {
      (POOL_EXIT_VALUES as string[]).push('plain');
    }).toThrow(TypeError);
    expect(JSON.stringify([OPTION_CATALOGUE, RULES, PRESETS])).toBe(before);
    expect(evaluate(defaultSelection(), ctx()).ok).toBe(true);
  });
});

describe('results are frozen', () => {
  const c = ctx({ env: 'web-onion' });
  it.each<[string, () => unknown]>([
    ['defaultSelection', () => defaultSelection()],
    ['evaluate', () => evaluate(defaultSelection(), c)],
    ['explain', () => explain(defaultSelection(), c)],
    ['honestLabel', () => honestLabel(evaluate(defaultSelection(), c))],
    ['applyPreset', () => applyPreset('maximum', c)],
    ['applyPreset (unknown id)', () => applyPreset('bogus' as never, c)],
    ['setOption', () => setOption(defaultSelection(), 'sweep.dust', 'off', c)],
    ['setOption (rejected)', () => setOption(defaultSelection(), 'sweep.exit', 'nonsense', c)],
    ['acknowledge', () => acknowledge(defaultSelection(), 'privacy.ack.hopsWeak')],
    ['sanitizeSelection', () => sanitizeSelection({ v: 1, preset: 'custom', values: { 'sweep.dust': 'off' }, acks: [] })],
    ['emptyConfig', () => emptyConfig()],
    ['toConfig', () => toConfig(applyPreset('enhanced', c).selection)],
    ['parseConfig', () => parseConfig({ v: 2, preset: 'custom', values: {}, acks: [], consents: [] })],
    ['parseConfig (errors)', () => parseConfig('{')],
    ['reviewConfig', () => reviewConfig(toConfig(applyPreset('maximum', c).selection), c)],
    ['describePreset', () => describePreset('maximum', c)],
  ])('%s', (_n, make) => {
    expect(deepFrozen(make())).toEqual([]);
  });
  it('a frozen evaluation cannot be edited to look acceptable', () => {
    const ev = evaluate({ preset: 'custom', values: { 'sweep.hops': '1' }, acks: [] }, c);
    expect(ev.ok).toBe(false);
    expect(() => {
      (ev as { ok: boolean }).ok = true;
    }).toThrow(TypeError);
    expect(() => {
      (ev.blocking as unknown[]).length = 0;
    }).toThrow(TypeError);
    expect(ev.ok).toBe(false);
  });
  it('a frozen selection cannot be edited to add an acknowledgement', () => {
    const s = applyPreset('maximum', c).selection;
    expect(() => {
      (s.acks as string[]).push('privacy.ack.poolDisclosure');
    }).toThrow(TypeError);
    expect(s.acks).toEqual([]);
  });
});

describe('inputs are never modified, frozen or aliased by a call', () => {
  const fresh = (): { preset: Selection['preset']; values: Partial<Record<OptionId, string>>; acks: string[] } => ({
    preset: 'custom',
    values: { 'sweep.dust': 'off' },
    acks: ['privacy.ack.hopsWeak'],
  });
  const untouched = (s: ReturnType<typeof fresh>): void => {
    expect(Object.isFrozen(s)).toBe(false);
    expect(Object.isFrozen(s.values)).toBe(false);
    expect(Object.isFrozen(s.acks)).toBe(false);
    expect(s).toEqual(fresh());
  };
  it('evaluate, explain, serialize, review, toConfig', () => {
    const s = fresh();
    evaluate(s as Selection, ctx());
    explain(s as Selection, ctx());
    serializeSelection(s as Selection);
    reviewConfig({ ...(s as Selection), consents: [] }, ctx());
    toConfig(s as Selection);
    untouched(s);
  });
  it('setOption and acknowledge return new objects and leave the input mutable', () => {
    const s = fresh();
    const r = setOption(s as Selection, 'sweep.delay', 'jitter', ctx());
    expect(r.selection.values).not.toBe(s.values);
    expect(r.selection.acks).not.toBe(s.acks);
    untouched(s);
    const a = acknowledge(s as Selection, 'privacy.ack.ctTrust');
    expect(a.acks).not.toBe(s.acks);
    expect(a.values).not.toBe(s.values);
    untouched(s);
    s.acks.push('privacy.ack.poolDisclosure');
    s.values['sweep.delay'] = 'jitter';
    expect(r.selection.acks).toEqual(['privacy.ack.hopsWeak']);
    expect(r.selection.values).toEqual({ 'sweep.dust': 'off', 'sweep.delay': 'jitter' });
  });
  it('a malformed selection that is repaired is copied, not frozen in place', () => {
    const values = { 'sweep.dust': 'off' } as Partial<Record<OptionId, string>>;
    const bad = { preset: 'custom', values, acks: 'x' } as unknown as Selection;
    const a = acknowledge(bad, 'privacy.ack.hopsWeak');
    const b = acknowledge(bad, 'privacy.ack.bogus');
    const c2 = setOption(bad, 'sweep.delay', 'jitter', ctx());
    expect(a.acks).toEqual(['privacy.ack.hopsWeak']);
    expect(b.values).not.toBe(values);
    expect(c2.selection.values).not.toBe(values);
    expect(Object.isFrozen(values)).toBe(false);
  });
  it('evaluating a mutable selection does not freeze it, and later edits do not change an earlier result', () => {
    const s = fresh();
    const before = evaluate(s as Selection, ctx());
    s.values['sweep.hops'] = '3';
    expect(before.effective['sweep.hops']).toBe('0');
    expect(evaluate(s as Selection, ctx()).effective['sweep.hops']).toBe('3');
  });
});
