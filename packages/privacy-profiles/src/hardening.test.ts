import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyConfig } from './config.js';
import { evaluate } from './evaluate.js';
import { ERROR_KEYS } from './keys.js';
import { acknowledge, applyPreset, defaultSelection, setOption } from './resolve.js';
import { sanitizeSelection, serializeSelection } from './serialize.js';
import { createSnapshot } from './snapshot.js';
import type { Capability, Context, Selection } from './types.js';
import { ctx, sel } from './x.testutil.js';

const codes = (s: unknown, c: unknown): string[] => evaluate(s as Selection, c as Context).blocking.map((b) => b.code);
const HOPS1 = { 'sweep.hops': '1' } as const;

describe('evaluate is total on malformed selections (PP-2, fail closed)', () => {
  it.each([null, undefined, 5, 'x', true, [], [1]])('selection %j: no throw, not ok, effective = defaults', (bad) => {
    const ev = evaluate(bad as never, ctx());
    expect(ev.ok).toBe(false);
    expect(ev.blocking.map((b) => b.code)).toContain('E_INVALID_SELECTION');
    expect(ev.blocking.find((b) => b.code === 'E_INVALID_SELECTION')?.key).toBe('privacy.err.invalidSelection');
    expect(ev.effective['sweep.exit']).toBe('plain');
    expect(ev.requiredAcks).toEqual([]);
  });
  it('a string in `acks` cannot forge acknowledgements by substring match', () => {
    const forged = { preset: 'custom', values: HOPS1, acks: 'privacy.ack.hopsWeak' } as unknown as Selection;
    const c = codes(forged, ctx());
    expect(c).toContain('E_INVALID_SELECTION');
    expect(c).toContain('E_ACK_MISSING');
  });
  it.each([null, undefined, 7, {}, 'privacy.ack.hopsWeak'])('acks %j does not throw even when an ack is required', (acks) => {
    const s = { preset: 'custom', values: HOPS1, acks } as unknown as Selection;
    expect(() => evaluate(s, ctx())).not.toThrow();
    expect(codes(s, ctx())).toContain('E_ACK_MISSING');
  });
  it.each([null, 5, 'x', ['a'], undefined])('values %j is rejected, not read as options', (values) => {
    const s = { preset: 'custom', values, acks: [] } as unknown as Selection;
    expect(codes(s, ctx())).toContain('E_INVALID_SELECTION');
    expect(evaluate(s, ctx()).effective['sweep.hops']).toBe('0');
  });
  it('a well-formed selection is unchanged by the guards', () => {
    const ev = evaluate(sel({ 'sweep.dust': 'off' }), ctx());
    expect(ev.ok).toBe(true);
    expect(ev.blocking).toEqual([]);
  });
  it('inherited properties of `values` are not options', () => {
    const proto = { 'sweep.hops': '3' };
    const values = Object.create(proto) as Record<string, string>;
    expect(evaluate({ preset: 'custom', values, acks: [] }, ctx()).effective['sweep.hops']).toBe('0');
  });
});

describe('evaluate is total on malformed contexts and fails closed', () => {
  const bad: [string, Record<string, unknown>][] = [
    ['unknown action', { action: 'bogus' }],
    ['unknown env', { env: 'bogus' }],
    ['string chain id', { chainId: '11155111' }],
    ['NaN chain id', { chainId: Number.NaN }],
    ['Infinity chain id', { chainId: Infinity }],
    ['fractional chain id', { chainId: 1.5 }],
    ['undefined chain id', { chainId: undefined }],
    ['unknown asset', { asset: 'bogus' }],
    ['numeric btc network', { btcNetwork: 5 }],
    ['array capabilities', { capabilities: ['sweep-relayer'] }],
    ['missing capabilities', { capabilities: undefined }],
    ['null capabilities', { capabilities: null }],
    ['plain-object capabilities', { capabilities: { has: () => true } }],
  ];
  it.each(bad)('%s: blocking E_INVALID_CONTEXT, never throws', (_n, over) => {
    const c = { ...ctx(), ...over };
    const ev = evaluate(sel({ 'sweep.dust': 'off' }), c);
    expect(ev.ok).toBe(false);
    expect(ev.blocking.map((b) => b.code)).toContain('E_INVALID_CONTEXT');
    expect(ev.blocking.find((b) => b.code === 'E_INVALID_CONTEXT')?.key).toBe('privacy.err.invalidContext');
  });
  it.each([null, undefined, 5, 'x', []])('context %j: blocking, no throw', (c) => {
    expect(codes(defaultSelection(), c)).toContain('E_INVALID_CONTEXT');
  });
  it('an unknown action no longer hides non-default values from every rule', () => {
    const risky = sel({ 'sweep.hopRelayers': 'direct', 'sweep.hops': '3' });
    expect(evaluate(risky, ctx({ action: 'sweep' })).ok).toBe(false);
    const ev = evaluate(risky, { ...ctx(), action: 'bogus' } as never);
    expect(ev.ok).toBe(false);
    expect(ev.blocking.map((b) => b.ruleId)).toContain('R-05');
  });
  it('invalid capabilities container grants nothing (fail closed)', () => {
    const c = { ...ctx(), capabilities: ['sweep-relayer', 'multi-relayer'] as unknown as ReadonlySet<Capability> };
    expect(codes(sel(HOPS1), c)).toContain('E_CAPABILITY');
  });
  it('an object that only claims to be a Set (toStringTag, has) is not accepted and cannot make anything throw', () => {
    const fake = { [Symbol.toStringTag]: 'Set', has: () => true, size: 1 };
    const c = { ...ctx(), capabilities: fake } as unknown as Context;
    expect(codes(sel(HOPS1), c)).toContain('E_INVALID_CONTEXT');
    expect(codes(sel(HOPS1), c)).toContain('E_CAPABILITY');
    expect(() => createSnapshot(emptyConfig(), c)).not.toThrow();
    expect(createSnapshot(emptyConfig(), c).ok).toBe(false);
  });
  it('a Set from another realm or a Set subclass is accepted', () => {
    class Caps extends Set<Capability> {}
    expect(codes(defaultSelection(), ctx({ capabilities: new Caps() }))).toEqual([]);
  });
  it('a valid cross-realm style Set is accepted', () => {
    const c = ctx({ capabilities: new Set<Capability>(['sweep-relayer']) });
    expect(codes(sel(HOPS1, ['privacy.ack.hopsWeak']), c)).not.toContain('E_INVALID_CONTEXT');
  });
});

describe('constructors are total (PP-2)', () => {
  it('applyPreset: unknown id and invalid context', () => {
    const r = applyPreset('bogus' as never, ctx());
    expect(r.selection).toEqual({ preset: 'custom', values: {}, acks: [] });
    expect(r.evaluation.ok).toBe(false);
    expect(r.evaluation.blocking.map((b) => b.key)).toContain('privacy.err.unknownPreset');
    for (const p of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(applyPreset(p as never, ctx()).evaluation.ok).toBe(false);
    }
    const r2 = applyPreset('maximum', null as never);
    expect(r2.evaluation.blocking.map((b) => b.code)).toContain('E_INVALID_CONTEXT');
    expect(r2.selection.values['sweep.exit']).toBeUndefined();
  });
  it('setOption and acknowledge accept malformed input without throwing', () => {
    const r = setOption(null as never, 'sweep.dust', 'off', null as never);
    expect(r.evaluation.ok).toBe(false);
    expect(r.selection.values['sweep.dust']).toBe('off');
    expect(acknowledge(null as never, 'privacy.ack.hopsWeak').acks).toEqual(['privacy.ack.hopsWeak']);
    expect(acknowledge({ preset: 'custom', values: {}, acks: 'x' } as never, 'privacy.ack.hopsWeak').acks).toEqual(['privacy.ack.hopsWeak']);
  });
  it('serializeSelection writes only a valid v1 blob for garbage input', () => {
    for (const g of [null, undefined, 5, { preset: 'x', values: null, acks: null }]) {
      const j = serializeSelection(g as never);
      expect(sanitizeSelection(JSON.parse(j))).toEqual({ preset: 'custom', values: {}, acks: [] });
    }
  });
  it('new error keys are registered', () => {
    for (const k of ['privacy.err.invalidSelection', 'privacy.err.invalidContext', 'privacy.err.unknownPreset']) expect(ERROR_KEYS as readonly string[]).toContain(k);
  });
});

describe('property: evaluate, applyPreset, setOption never throw on arbitrary input', () => {
  it('arbitrary selection x arbitrary context', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (s, c) => {
        const a = evaluate(s as never, c as never);
        expect(a).toEqual(evaluate(s as never, c as never));
        expect(a.ok).toBe(a.blocking.length === 0);
        expect(() => applyPreset('maximum', c as never)).not.toThrow();
        expect(() => setOption(s as never, 'sweep.hops', '2', c as never)).not.toThrow();
        expect(() => acknowledge(s as never, 'privacy.ack.hopsWeak')).not.toThrow();
        expect(() => serializeSelection(s as never)).not.toThrow();
      }),
      { numRuns: 400 },
    );
  });
  it('valid selection x arbitrary context is never ok unless the context is valid', () => {
    fc.assert(
      fc.property(fc.anything(), (c) => {
        const ev = evaluate(defaultSelection(), c as never);
        if (ev.ok) {
          const k = c as Context;
          expect(k.capabilities instanceof Set).toBe(true);
          expect(['settings', 'create-invoice', 'pay', 'scan', 'sweep', 'btc-receive', 'btc-send']).toContain(k.action);
        }
      }),
      { numRuns: 400 },
    );
  });
});
