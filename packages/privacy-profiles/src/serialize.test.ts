import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { evaluate, explain, withIssue } from './evaluate.js';
import { ALL_CAPABILITIES } from './keys.js';
import { compatibilityMatrix } from './matrix.js';
import { applyPreset, defaultSelection, setOption } from './resolve.js';
import { sanitizeSelection, serializeSelection } from './serialize.js';
import { OPTION_IDS } from './types.js';
import type { Capability, Context, Selection } from './types.js';
import { ctx, sel } from './x.testutil.js';

describe('serialisation (PP-18)', () => {
  it('round-trips every preset result and the default', () => {
    for (const id of ['standard', 'enhanced', 'maximum', 'confidential-amount'] as const) {
      const s = applyPreset(id, ctx()).selection;
      expect(sanitizeSelection(JSON.parse(serializeSelection(s)))).toEqual(s);
    }
    const d = defaultSelection();
    expect(sanitizeSelection(JSON.parse(serializeSelection(d)))).toEqual(d);
  });
  it('sorted keys, small, stable', () => {
    const s = sel({ 'sweep.dust': 'off', 'btc.rbf': 'off' }, ['privacy.ack.hopsWeak', 'privacy.ack.ctTrust']);
    const j = serializeSelection(s);
    expect(j).toBe('{"acks":["privacy.ack.ctTrust","privacy.ack.hopsWeak"],"preset":"custom","v":1,"values":{"btc.rbf":"off","sweep.dust":"off"}}');
    const all: Selection = { preset: 'custom', values: Object.fromEntries(OPTION_IDS.filter((o) => OPTION_CATALOGUE[o].userSelectable).map((o) => [o, OPTION_CATALOGUE[o].values.at(-1)?.value ?? ''])), acks: ['privacy.ack.hopsWeak'] };
    expect(serializeSelection(all).length).toBeLessThan(4096);
  });
  it('drops unknown option, value, ack, operator option; version mismatch gives default', () => {
    const raw = { v: 1, preset: 'bogus', values: { 'sweep.dust': 'off', 'sweep.exit': 'nope', 'ops.walletFunding': 'on', 'x.y': 'z', 'btc.rbf': 7, __proto__: 'x' }, acks: ['privacy.ack.hopsWeak', 'privacy.ack.fake', 5, 'privacy.ack.hopsWeak'] };
    expect(sanitizeSelection(raw)).toEqual({ preset: 'custom', values: { 'sweep.dust': 'off' }, acks: ['privacy.ack.hopsWeak'] });
    expect(sanitizeSelection({ v: 2, values: { 'sweep.dust': 'off' } })).toEqual(defaultSelection());
    expect(sanitizeSelection(null)).toEqual(defaultSelection());
    expect(sanitizeSelection([1])).toEqual(defaultSelection());
    expect(sanitizeSelection('x')).toEqual(defaultSelection());
    expect(sanitizeSelection({ v: 1, preset: 'maximum', values: 5, acks: 'x' })).toEqual({ preset: 'maximum', values: {}, acks: [] });
  });
  it('totality over arbitrary json (PP-2)', () => {
    fc.assert(fc.property(fc.anything(), (x) => { expect(() => sanitizeSelection(x)).not.toThrow(); }), { numRuns: 500 });
    fc.assert(fc.property(fc.jsonValue(), (x) => { const s = sanitizeSelection({ v: 1, ...(typeof x === 'object' && x !== null && !Array.isArray(x) ? x : {}) }); expect(evaluate(s, ctx()).effective).toBeDefined(); }), { numRuns: 300 });
  });
});

const arbSel = fc.record({
  preset: fc.constantFrom('custom', 'standard', 'maximum'),
  values: fc.dictionary(fc.oneof(fc.constantFrom(...OPTION_IDS), fc.string()), fc.oneof(fc.string(), fc.constantFrom('on', 'off', '1', 'direct', 'plain', 'shielded-pool', 'tor-browser'), fc.integer() as fc.Arbitrary<unknown>)),
  acks: fc.array(fc.constantFrom('privacy.ack.hopsWeak', 'privacy.ack.poolDisclosure', 'x'), { maxLength: 3 }),
}) as unknown as fc.Arbitrary<Selection>;
const arbCtx = fc.record({
  action: fc.constantFrom('settings', 'pay', 'sweep', 'scan', 'create-invoice', 'btc-send', 'btc-receive'),
  chainId: fc.oneof(fc.constant(null), fc.constantFrom(1, 31337, 11155111, 84532), fc.integer()),
  btcNetwork: fc.constantFrom(undefined, null, 'mainnet', 'regtest', 'testnet', 'signet'),
  env: fc.constantFrom('web', 'web-onion', 'node'),
  asset: fc.constantFrom(undefined, 'erc20-permit', 'erc20', 'native', 'confidential', 'btc'),
  caps: fc.subarray([...ALL_CAPABILITIES]),
}).map((a): Context => ({ action: a.action, chainId: a.chainId, ...(a.btcNetwork === undefined ? {} : { btcNetwork: a.btcNetwork }), env: a.env, ...(a.asset === undefined ? {} : { asset: a.asset }), capabilities: new Set<Capability>(a.caps) }));

describe('PP-2 / PP-3 totality and determinism', () => {
  it('evaluate, setOption, applyPreset, explain never throw; deterministic; sorted', () => {
    fc.assert(
      fc.property(arbSel, arbCtx, (s, c) => {
        const a = evaluate(s, c);
        const b = evaluate(s, c);
        expect(a).toEqual(b);
        expect(a.ok).toBe(a.blocking.length === 0);
        expect(a.trust).toEqual([...a.trust].sort());
        expect(a.doesNotHide).toEqual([...a.doesNotHide].sort());
        expect(a.blocking.every((i) => i.code.startsWith('E_'))).toBe(true);
        expect(a.warnings.every((i) => i.code.startsWith('W_'))).toBe(true);
        expect(() => explain(s, c)).not.toThrow();
        const r = setOption(s, 'sweep.hops', '2', c);
        expect(r.evaluation).toBeDefined();
        expect(applyPreset('maximum', c)).toEqual(applyPreset('maximum', c));
      }),
      { numRuns: 150 },
    );
  });
  it('non-default values on a non-testnet chain always block (PP-16)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...OPTION_IDS.filter((o) => OPTION_CATALOGUE[o].userSelectable && OPTION_CATALOGUE[o].group !== 'btc')), fc.integer().filter((n) => ![31337, 11155111, 84532].includes(n)), (opt, chainId) => {
        const d = OPTION_CATALOGUE[opt];
        const nd = d.values.find((v) => v.value !== d.defaultValue)?.value ?? d.defaultValue;
        const ev = evaluate(sel({ [opt]: nd }), ctx({ chainId, action: d.actions[0] ?? 'settings' }));
        expect(ev.blocking.map((b) => b.code)).toContain('E_WRONG_CHAIN');
      }),
    );
  });
  it('withIssue marks not ok', () => {
    const ev = withIssue(evaluate(defaultSelection(), ctx()), { code: 'E_CONFLICT', key: 'privacy.err.x', options: [] });
    expect(ev.ok).toBe(false);
  });
  it('unknown selection content becomes blocking, effective falls back to default', () => {
    const ev = evaluate({ preset: 'custom', values: { 'sweep.exit': 'nope', 'bogus': 'x', 'ops.walletFunding': 'on' } as never, acks: [] }, ctx());
    expect(ev.blocking.map((b) => b.code).sort()).toEqual(['E_NOT_SELECTABLE', 'E_UNKNOWN_VALUE', 'E_UNKNOWN_VALUE']);
    expect(ev.effective['sweep.exit']).toBe('plain');
  });
});

describe('PP-15 matrix', () => {
  const cells = compatibilityMatrix();
  const rel = (a: [string, string], b: [string, string]): string => {
    const c = cells.find((x) => x.a.option === a[0] && x.a.value === a[1] && x.b.option === b[0] && x.b.value === b[1]);
    return `${c?.relation}:${c?.ruleIds.join('+')}`;
  };
  it('is symmetric for conflicts', () => {
    for (const c of cells) {
      const t = cells.find((x) => x.a.option === c.b.option && x.a.value === c.b.value && x.b.option === c.a.option && x.b.value === c.a.value);
      expect(t?.relation).toBe(c.relation);
    }
  });
  it('reproduces section 8.1', () => {
    const FW = ['pay.payerMode', 'fresh-wallet'] as [string, string];
    const PR = ['pay.payerMode', 'permit-relay'] as [string, string];
    const P3 = ['pay.payerMode', 'eip7702-sponsored'] as [string, string];
    const SP = ['pay.source', 'shielded-pool'] as [string, string];
    const CT = ['pay.amountVisibility', 'ct1-zama'] as [string, string];
    const RND = ['pay.amountBlur', 'round'] as [string, string];
    const SPL = ['pay.amountBlur', 'split'] as [string, string];
    const DEN = ['pay.amountBlur', 'denom'] as [string, string];
    const NOFEE = ['pay.route', 'direct-no-fee'] as [string, string];
    const HOP = ['sweep.hops', '1'] as [string, string];
    const HOP3 = ['sweep.hops', '3'] as [string, string];
    const POOL = ['sweep.exit', 'shielded-pool'] as [string, string];
    const TOR = ['net.rpcProfile', 'tor-browser'] as [string, string];
    expect(rel(FW, SP)).toBe('conflict:R-17');
    expect(rel(FW, CT)).toBe('conflict:R-12');
    expect(rel(FW, RND)).toBe('ok:');
    expect(rel(FW, SPL)).toBe('ok:');
    expect(rel(FW, NOFEE)).toBe('ok:');
    expect(rel(FW, TOR)).toBe('ok:');
    expect(rel(PR, SP)).toBe('conflict:R-17');
    expect(rel(PR, CT)).toBe('conflict:R-12');
    expect(rel(PR, RND)).toBe('ok:');
    expect(rel(PR, SPL)).toBe('warn:R-32');
    expect(rel(PR, NOFEE)).toBe('conflict:R-20');
    expect(rel(PR, TOR)).toBe('warn:R-31');
    expect(rel(P3, SP)).toBe('conflict:R-17');
    expect(rel(P3, DEN)).toBe('warn:R-32');
    expect(rel(SP, CT)).toBe('conflict:R-13');
    expect(rel(SP, RND)).toBe('conflict:R-18');
    expect(rel(SP, DEN)).toBe('conflict:R-18');
    expect(rel(SP, NOFEE)).toBe('moot:R-19');
    expect(rel(SP, TOR)).toBe('warn:R-31');
    expect(rel(CT, RND)).toBe('moot:R-15');
    expect(rel(CT, SPL)).toBe('conflict:R-14');
    expect(rel(CT, DEN)).toBe('conflict:R-14');
    expect(rel(CT, NOFEE)).toBe('conflict:R-16');
    expect(rel(HOP, POOL)).toBe('warn:R-08');
    expect(rel(HOP3, POOL)).toBe('conflict:R-08+R-09');
    expect(rel(HOP, TOR)).toBe('warn:R-31');
    expect(rel(POOL, TOR)).toBe('warn:R-31');
    expect(compatibilityMatrix({ options: ['sweep.dust', 'sweep.delay'] })).toHaveLength(4 + 4);
  });
});
