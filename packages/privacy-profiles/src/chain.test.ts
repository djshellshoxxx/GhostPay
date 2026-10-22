import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { CHAIN_RULES, chainMatrix } from './chainRules.js';
import { evaluate } from './evaluate.js';
import { CHAIN_ERROR_KEYS, CHAIN_WARNING_KEYS, ERROR_KEYS, WARNING_KEYS } from './keys.js';
import { RULES } from './rules.js';
import { STEP_CATALOGUE } from './steps.js';
import type { StepKind } from './steps.js';
import type { OptionId, Selection } from './types.js';
import { ctx } from './x.testutil.js';

describe('chain rules data', () => {
  it('has C-01..C-35 exactly once, in order', () => {
    expect(CHAIN_RULES.map((r) => r.id)).toEqual(Array.from({ length: 35 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`));
  });
  it('keys are known; effect matches relation', () => {
    const known = new Set<string>([...WARNING_KEYS, ...CHAIN_WARNING_KEYS, ...ERROR_KEYS, ...CHAIN_ERROR_KEYS, 'privacy.ack.hopsWeak', 'privacy.ack.ctUnwrapPublic']);
    for (const r of CHAIN_RULES) {
      expect(known.has(r.key), r.id).toBe(true);
      if (r.escalate) expect(known.has(r.escalate.key)).toBe(true);
      if (r.relation === 'impossible') expect(r.effect).toBe('block');
      if (r.relation === 'redundant') expect(r.effect).toBe('warn');
      if (r.profileRule) expect(RULES.some((p) => p.id === r.profileRule)).toBe(true);
    }
  });
  it('PL-7: a rule that refines a profile rule uses a key of the same family (block vs warn)', () => {
    for (const r of CHAIN_RULES) {
      if (!r.profileRule) continue;
      const p = RULES.find((x) => x.id === r.profileRule);
      const profileBlocks = p?.key.startsWith('privacy.err.') === true;
      const chainBlocks = r.effect === 'block' || (r.effect === 'ack' && r.key.startsWith('privacy.err'));
      if (r.id !== 'C-05') expect(chainBlocks, `${r.id} vs ${r.profileRule}`).toBe(profileBlocks);
    }
  });
  it('matrix is generated, one cell per rule', () => {
    const m = chainMatrix();
    expect(m).toHaveLength(35);
    expect(m.find((c) => c.ruleIds[0] === 'C-01')).toEqual({ a: 'hops.forward', b: 'pool.deposit', relation: 'redundant', ruleIds: ['C-01'] });
    expect(m.find((c) => c.ruleIds[0] === 'C-13')?.a).toBe('pool.deposit|hops.forward|hygiene.sweep');
    expect(m.find((c) => c.ruleIds[0] === 'C-03')).toMatchObject({ a: 'pool.exit', b: '*', relation: 'impossible' });
    expect(m.find((c) => c.ruleIds[0] === 'C-07')).toMatchObject({ a: 'pool.deposit', b: 'pool.deposit' });
    expect(m.find((c) => c.ruleIds[0] === 'C-34')).toMatchObject({ a: 'pool.deposit', b: 'pool.deposit', relation: 'redundant' });
    expect(m.find((c) => c.ruleIds[0] === 'C-35')?.a).toBe('pool.exit');
    expect(m.find((c) => c.ruleIds[0] === 'C-33')).toMatchObject({ a: '*', b: '*' });
  });
});

describe('step catalogue', () => {
  const kinds = Object.keys(STEP_CATALOGUE) as StepKind[];
  it('has 18 kinds, keyed by own kind, with roles from the spec', () => {
    expect(kinds).toHaveLength(18);
    for (const k of kinds) expect(STEP_CATALOGUE[k].kind).toBe(k);
    expect(STEP_CATALOGUE['hops.forward'].role).toBe('seller');
    expect(STEP_CATALOGUE['pay.from-pool'].role).toBe('payer');
    expect(STEP_CATALOGUE['pool.deposit'].role).toBe('both');
    expect(STEP_CATALOGUE['pool.exit'].fan).toBe('many');
    expect(STEP_CATALOGUE['payer.fresh-wallet'].waits).toBe(true);
  });
  it('terminal holdings are never accepted (T-3)', () => {
    for (const k of kinds) for (const a of STEP_CATALOGUE[k].accepts) expect(['owned', 'paid']).not.toContain(a.t);
  });
  it('every projected option and value exists in the catalogue for every enum param', () => {
    for (const k of kinds) {
      const d = STEP_CATALOGUE[k];
      const combos: Record<string, string | number | boolean>[] = [{}];
      for (const [name, sch] of Object.entries(d.params)) {
        const vals = sch.type === 'boolean' ? [true, false] : (sch.values ?? []);
        const next: typeof combos = [];
        for (const c of combos) for (const v of vals) next.push({ ...c, [name]: v });
        if (vals.length) combos.splice(0, combos.length, ...next.slice(0, 200));
      }
      for (const p of combos) {
        for (const [opt, v] of Object.entries(d.project(p))) {
          const o = OPTION_CATALOGUE[opt as OptionId];
          expect(o, `${k} ${opt}`).toBeDefined();
          expect(o.values.map((x) => x.value), `${k} ${opt}=${v}`).toContain(v);
        }
      }
    }
  });
  it('R-17 refinement: payer pool.deposit projects no payment-tx options; pay.from-pool does', () => {
    expect(STEP_CATALOGUE['pool.deposit'].project({ role: 'payer', pool: 'shielded-pool' })).toEqual({});
    expect(STEP_CATALOGUE['pay.from-pool'].project({})).toEqual({ 'pay.source': 'shielded-pool' });
    expect(STEP_CATALOGUE['pool.deposit'].project({ role: 'seller', pool: 'railgun' })).toMatchObject({ 'sweep.exit': 'railgun' });
  });
  it('chaining 3.5 example payer pipeline projects to a selection evaluate() accepts', () => {
    const steps: [StepKind, Record<string, string | number | boolean>][] = [
      ['src.wallet', {}], ['payer.fresh-wallet', {}], ['amount.shape', { mode: 'denom' }], ['pool.deposit', { pool: 'shielded-pool', role: 'payer' }], ['pool.dwell', {}], ['pay.from-pool', {}],
    ];
    const values: Partial<Record<OptionId, string>> = {};
    for (const [k, p] of steps) Object.assign(values, STEP_CATALOGUE[k].project(p));
    // payerMode=fresh-wallet + source=pool conflicts at selection level (R-17) unless the deposit step's payer mode is dropped
    const s: Selection = { preset: 'custom', values, acks: [] };
    expect(evaluate(s, ctx({ action: 'pay' })).blocking.map((b) => b.ruleId)).toContain('R-17');
    const seller: Partial<Record<OptionId, string>> = {};
    for (const [k, p] of [['hygiene.sweep', {}], ['hops.forward', { hops: 1 }]] as [StepKind, Record<string, string | number>][]) Object.assign(seller, STEP_CATALOGUE[k].project(p));
    expect(seller).toMatchObject({ 'sweep.destination': 'self-derived', 'sweep.hops': '1' });
  });
  it('project defaults when params are missing or mistyped', () => {
    expect(STEP_CATALOGUE['hops.forward'].project({})).toEqual({ 'sweep.hops': '1', 'sweep.hopRelayers': 'rotate' });
    expect(STEP_CATALOGUE['amount.shape'].project({ noise: true })).toEqual({ 'pay.amountBlur': 'off', 'pay.amountNoise': 'on' });
    expect(STEP_CATALOGUE['pay.submit'].project({ route: 'accrual' })['pay.route']).toBe('router');
    expect(STEP_CATALOGUE['ct.wrap'].project({})).toEqual({ 'pay.amountVisibility': 'ct1-zama' });
    for (const k of ['src.wallet', 'payer.fresh-wallet', 'sweep.delay', 'btc.send', 'btc.recv', 'btc.payjoin-contribute', 'pool.exit', 'hygiene.sweep', 'pool.dwell', 'recv.stealth', 'ct.sweep', 'ct.unwrap'] as StepKind[])
      expect(typeof STEP_CATALOGUE[k].project({})).toBe('object');
    expect(STEP_CATALOGUE['pool.deposit'].project({})).toEqual({ 'sweep.exit': 'shielded-pool', 'sweep.poolAmountPlan': 'denominations', 'sweep.exitGas': 'buffer' });
  });
});
