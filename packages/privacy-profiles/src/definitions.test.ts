import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { findDependencyCycles, validateDefinitions } from './definitions.js';
import type { DefinitionIssue, Definitions } from './definitions.js';
import { PRESETS } from './presets.js';
import { RULES } from './rules.js';
import { OPTION_IDS } from './types.js';
import type { OptionId, Pred, RuleDef } from './types.js';

type Obj = Record<string, unknown>;
interface Mutable {
  catalogue: Record<string, Obj>;
  rules: Obj[];
  presets: Record<string, Obj>;
}

/** Mutable deep copy of the shipped definitions, so each test can break exactly one thing. */
const fresh = (): Mutable => structuredClone({ catalogue: OPTION_CATALOGUE, rules: RULES, presets: PRESETS }) as unknown as Mutable;
const codes = (d: unknown): string[] => validateDefinitions(d as Definitions).map((i) => i.code);
const valueAt = (d: Mutable, opt: string, i: number): Obj => ((d.catalogue[opt] as Obj)['values'] as Obj[])[i] as Obj;
const preset = (d: Mutable, id: string): Obj => d.presets[id] as Obj;
const prefer = (d: Mutable, id: string): Record<string, string[]> => preset(d, id)['prefer'] as Record<string, string[]>;
const rule = (over: Obj): Obj => ({ specRef: 'new', ...over });
const reqRule = (id: string, when: Pred, then: Pred): RuleDef => ({ id: id as RuleDef['id'], kind: 'requires', when, then, key: 'privacy.err.requires.x', specRef: 'new' });
const isOpt = (opt: OptionId, ...v: string[]): Pred => ({ opt, in: v });

describe('shipped definitions are internally consistent', () => {
  it('have no issues', () => {
    expect(validateDefinitions()).toEqual([]);
  });
  it('have no dependency cycles', () => {
    expect(findDependencyCycles(RULES)).toEqual([]);
  });
});

describe('invalid declarations are reported, one fault at a time', () => {
  it('catalogue: key mismatch, bad default, duplicate value, unknown capability, ack and warning key', () => {
    let d = fresh();
    (d.catalogue['sweep.dust'] as Obj)['id'] = 'sweep.delay';
    expect(codes(d)).toContain('D_ID_MISMATCH');
    d = fresh();
    (d.catalogue['sweep.dust'] as Obj)['defaultValue'] = 'maybe';
    expect(codes(d)).toContain('D_BAD_DEFAULT');
    d = fresh();
    const vals = (d.catalogue['sweep.dust'] as Obj)['values'] as Obj[];
    vals.push(structuredClone(vals[0]) as Obj);
    expect(codes(d)).toContain('D_DUPLICATE_VALUE');
    d = fresh();
    (valueAt(d, 'sweep.hops', 1)['requires'] as string[]).push('flux-capacitor');
    expect(codes(d)).toContain('D_UNKNOWN_CAPABILITY');
    d = fresh();
    (valueAt(d, 'sweep.hops', 1)['acks'] as string[]).push('privacy.ack.nope');
    expect(codes(d)).toContain('D_UNKNOWN_ACK');
    d = fresh();
    (valueAt(d, 'sweep.hops', 1)['warnings'] as string[]).push('privacy.warn.nope');
    expect(codes(d)).toContain('D_UNKNOWN_KEY');
  });
  it('catalogue: missing or extra option, malformed entry', () => {
    const d = fresh();
    delete d.catalogue['sweep.dust'];
    expect(codes(d)).toContain('D_MISSING_OPTION');
    const e = fresh();
    e.catalogue['sweep.bogus'] = structuredClone(e.catalogue['sweep.dust']) as Obj;
    expect(codes(e)).toContain('D_UNKNOWN_OPTION');
    const f = fresh();
    f.catalogue['sweep.dust'] = 5 as unknown as Obj;
    expect(codes(f)).toContain('D_MALFORMED');
  });
  it('rules: duplicate id', () => {
    const d = fresh();
    d.rules.push(structuredClone(d.rules[0]) as Obj);
    expect(codes(d)).toContain('D_DUPLICATE_RULE_ID');
  });
  it.each<[string, unknown, string]>([
    ['unknown option', { opt: 'sweep.bogus', in: ['on'] }, 'D_UNKNOWN_OPTION'],
    ['unknown value', isOpt('sweep.exit', 'nonsense'), 'D_UNKNOWN_VALUE'],
    ['unknown capability', { cap: 'flux-capacitor' }, 'D_UNKNOWN_CAPABILITY'],
    ['unknown not-capability', { notCap: 'flux-capacitor' }, 'D_UNKNOWN_CAPABILITY'],
    ['unknown ack', { ack: 'privacy.ack.nope' }, 'D_UNKNOWN_ACK'],
    ['unknown scan', { scan: 'everything' }, 'D_BAD_PRED'],
    ['unknown env', { env: ['mars'] }, 'D_BAD_PRED'],
    ['unknown action', { action: ['dance'] }, 'D_BAD_PRED'],
    ['unknown asset', { asset: ['gold'] }, 'D_BAD_PRED'],
    ['empty all', { all: [] }, 'D_BAD_PRED'],
    ['empty any', { any: [] }, 'D_BAD_PRED'],
    ['two discriminators', { cap: 'tor-socks', notCap: 'tor-socks' }, 'D_BAD_PRED'],
    ['no discriminator', {}, 'D_BAD_PRED'],
    ['not an object', 5, 'D_BAD_PRED'],
    ['null', null, 'D_BAD_PRED'],
    ['opt without in or notIn', { opt: 'sweep.exit' }, 'D_BAD_PRED'],
    ['opt list not an array', { opt: 'sweep.exit', in: 'plain' }, 'D_BAD_PRED'],
    ['opt with both in and notIn', { opt: 'sweep.exit', in: ['plain'], notIn: ['railgun'] }, 'D_BAD_PRED'],
  ])('predicate: %s', (_n, pred, code) => {
    const wraps: ((p: unknown) => unknown)[] = [(p) => p, (p) => ({ all: [p, { cap: 'tor-socks' }] }), (p) => ({ not: p }), (p) => ({ any: [p] })];
    for (const wrap of wraps) {
      const d = fresh();
      d.rules.push(rule({ id: 'R-99', kind: 'conflict', when: wrap(pred), key: 'privacy.err.conflict.x' }));
      expect(codes(d)).toContain(code);
    }
  });
  it('predicate nesting beyond the depth bound is reported, not followed', () => {
    let deep: unknown = { cap: 'tor-socks' };
    for (let i = 0; i < 100; i++) deep = { not: deep };
    const d = fresh();
    d.rules.push(rule({ id: 'R-99', kind: 'conflict', when: deep, key: 'privacy.err.conflict.x' }));
    expect(codes(d)).toContain('D_BAD_PRED');
    expect(() => findDependencyCycles(d.rules as unknown as RuleDef[])).not.toThrow();
  });
  it('rules: a requires rule needs a then, other kinds must not have one, kinds and keys must agree', () => {
    const bad = (r: Obj): string[] => {
      const d = fresh();
      d.rules.push(rule({ id: 'R-99', when: isOpt('sweep.exit', 'railgun'), ...r }));
      return codes(d);
    };
    expect(bad({ kind: 'requires', key: 'privacy.err.requires.x' })).toContain('D_BAD_RULE_SHAPE');
    expect(bad({ kind: 'conflict', then: isOpt('sweep.dust', 'on'), key: 'privacy.err.conflict.x' })).toContain('D_BAD_RULE_SHAPE');
    expect(bad({ kind: 'conflict', key: 'privacy.warn.noAnonymity' })).toContain('D_BAD_RULE_SHAPE');
    expect(bad({ kind: 'warn', key: 'privacy.err.conflict.x' })).toContain('D_BAD_RULE_SHAPE');
    expect(bad({ kind: 'conflict', code: 'E_NOPE', key: 'privacy.err.conflict.x' })).toContain('D_BAD_RULE_SHAPE');
    expect(bad({ kind: 'sideways', key: 'privacy.err.conflict.x' })).toContain('D_BAD_RULE_SHAPE');
    expect(bad({ kind: 'conflict' })).toContain('D_BAD_RULE_SHAPE');
    const d = fresh();
    d.rules.push(5 as unknown as Obj);
    expect(codes(d)).toContain('D_MALFORMED');
  });
  it('presets: id, order, preference list and defaults', () => {
    let d = fresh();
    preset(d, 'enhanced')['id'] = 'maximum';
    expect(codes(d)).toContain('D_ID_MISMATCH');
    d = fresh();
    (preset(d, 'enhanced')['order'] as string[]).push('sweep.bogus');
    expect(codes(d)).toContain('D_UNKNOWN_OPTION');
    d = fresh();
    const order = preset(d, 'enhanced')['order'] as string[];
    order.push(order[0] as string);
    expect(codes(d)).toContain('D_PRESET_ORDER');
    d = fresh();
    prefer(d, 'enhanced')['sweep.exit'] = ['railgun'];
    expect(codes(d)).toContain('D_PRESET_DEFAULT');
    d = fresh();
    prefer(d, 'enhanced')['sweep.exit'] = ['nonsense', 'plain'];
    expect(codes(d)).toContain('D_UNKNOWN_VALUE');
    d = fresh();
    prefer(d, 'enhanced')['sweep.bogus'] = ['x'];
    expect(codes(d)).toContain('D_UNKNOWN_OPTION');
    d = fresh();
    prefer(d, 'enhanced')['sweep.hops'] = ['1', '0'];
    expect(codes(d)).toContain('D_PRESET_POLICY');
    d = fresh();
    prefer(d, 'enhanced')['btc.mode'] = ['payjoin-v2', 'silent-payment'];
    expect(codes(d)).toContain('D_PRESET_POLICY');
    d = fresh();
    d.presets['enhanced'] = 5 as unknown as Obj;
    expect(codes(d)).toContain('D_MALFORMED');
  });
  it('presets: an experimental, test-only, stub or watch value is refused by policy', () => {
    for (const [opt, value] of [['net.rpcProfile', 'nym-mixfetch'], ['sweep.exit', 'mock-pool'], ['sweep.exit', 'tornado-fixed'], ['sweep.exit', 'aztec']] as const) {
      const d = fresh();
      prefer(d, 'maximum')[opt] = [value, OPTION_CATALOGUE[opt].defaultValue];
      expect(codes(d), `${opt}=${value}`).toContain('D_PRESET_POLICY');
    }
  });
  it('is deterministic, sorted and located', () => {
    const d = fresh();
    d.rules.push(rule({ id: 'R-99', kind: 'conflict', when: { opt: 'sweep.bogus', in: ['x'] }, key: 'privacy.err.conflict.x' }));
    (d.catalogue['sweep.dust'] as Obj)['defaultValue'] = 'maybe';
    const a = validateDefinitions(d as unknown as Definitions);
    expect(validateDefinitions(d as unknown as Definitions)).toEqual(a);
    expect(a.map((i) => i.where)).toEqual([...a.map((i) => i.where)].sort());
    expect(a.every((i: DefinitionIssue) => i.where.length > 0)).toBe(true);
    expect(Object.isFrozen(a)).toBe(true);
  });
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (c, r, p) => {
        const out = validateDefinitions({ catalogue: c, rules: r, presets: p } as never);
        expect(out.length).toBeGreaterThan(0);
        expect(() => findDependencyCycles(r as never, c as never)).not.toThrow();
      }),
      { numRuns: 300 },
    );
    expect(validateDefinitions(null as never).map((i) => i.code)).toEqual(['D_MALFORMED']);
  });
});

describe('circular dependencies', () => {
  // None of these three has an activeWhen condition, so only the rules under test create edges.
  const a: OptionId = 'pay.route';
  const b: OptionId = 'announce.metadata';
  const c: OptionId = 'invoice.encrypt';
  const va = 'direct-no-fee';
  const vb = 'minimal';
  const vc = 'on';
  it('direct cycle: A needs B and B needs A', () => {
    const rules = [reqRule('R-91', isOpt(a, va), isOpt(b, vb)), reqRule('R-92', isOpt(b, vb), isOpt(a, va))];
    expect(findDependencyCycles(rules)).toEqual([[a, b].sort()]);
  });
  it('three-step cycle', () => {
    const rules = [reqRule('R-91', isOpt(a, va), isOpt(b, vb)), reqRule('R-92', isOpt(b, vb), isOpt(c, vc)), reqRule('R-93', isOpt(c, vc), isOpt(a, va))];
    expect(findDependencyCycles(rules)).toEqual([[a, b, c].sort()]);
    const d = fresh();
    d.rules.push(...(rules as unknown as Obj[]));
    expect(codes(d)).toContain('D_DEPENDENCY_CYCLE');
  });
  it('a chain without a way back is not a cycle', () => {
    expect(findDependencyCycles([reqRule('R-91', isOpt(a, va), isOpt(b, vb)), reqRule('R-92', isOpt(b, vb), isOpt(c, vc))])).toEqual([]);
  });
  it('an option that depends on itself is not a cycle (mutual groups such as R-26)', () => {
    expect(findDependencyCycles([reqRule('R-91', { any: [isOpt(a, va), isOpt(b, vb)] }, { all: [isOpt(a, va), isOpt(b, vb)] })])).toEqual([]);
  });
  it('only requires rules create edges', () => {
    const conflict: RuleDef = { id: 'R-92', kind: 'conflict', when: { all: [isOpt(b, vb), isOpt(a, va)] }, key: 'privacy.err.conflict.x', specRef: 'new' };
    expect(findDependencyCycles([reqRule('R-91', isOpt(a, va), isOpt(b, vb)), conflict])).toEqual([]);
  });
  it('an activeWhen dependency counts as an edge', () => {
    // exitGas is only active when sweep.exit is a pool (shipped). A rule making the exit need the gas option closes the loop.
    const rules = [reqRule('R-91', isOpt('sweep.exit', 'railgun'), isOpt('sweep.exitGas', 'topup'))];
    expect(findDependencyCycles(rules)).toEqual([['sweep.exit', 'sweep.exitGas']]);
    expect(findDependencyCycles(rules, {})).toEqual([]);
  });
  it('reports each cycle once, sorted, deterministically', () => {
    const rules = [
      reqRule('R-91', isOpt(a, va), isOpt(b, vb)),
      reqRule('R-92', isOpt(b, vb), isOpt(a, va)),
      reqRule('R-93', isOpt('invoice.padding', 'on'), isOpt('invoice.coarseTime', 'on')),
      reqRule('R-94', isOpt('invoice.coarseTime', 'on'), isOpt('invoice.padding', 'on')),
    ];
    const out = findDependencyCycles(rules);
    expect(out).toHaveLength(2);
    expect(findDependencyCycles([...rules].reverse())).toEqual(out);
    for (const cyc of out) expect(cyc).toEqual([...cyc].sort());
  });
  it('property: forward-only edges over any ordering never form a cycle; one back edge always does', () => {
    const ids = OPTION_IDS.filter((o) => !o.startsWith('ops.') && !['sweep.exitGas', 'sweep.poolAsp', 'sweep.poolSubmit', 'sweep.poolAmountPlan'].includes(o));
    fc.assert(
      fc.property(fc.shuffledSubarray([...ids], { minLength: 3, maxLength: 12 }), fc.nat(1000), (order, seed) => {
        const edges: [OptionId, OptionId][] = [];
        for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if ((seed + i * 7 + j * 13) % 3 === 0) edges.push([order[i] as OptionId, order[j] as OptionId]);
        const second = (o: OptionId): string => OPTION_CATALOGUE[o].values[1]?.value ?? '';
        const mk = (e: [OptionId, OptionId][]): RuleDef[] => e.map(([x, y], n) => reqRule(`R-${200 + n}`, isOpt(x, second(x)), isOpt(y, second(y))));
        expect(findDependencyCycles(mk(edges))).toEqual([]);
        if (edges.length > 0) {
          const [x, y] = edges[0] as [OptionId, OptionId];
          const back = findDependencyCycles(mk([...edges, [y, x]]));
          expect(back.some((cyc) => cyc.includes(x) && cyc.includes(y))).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
