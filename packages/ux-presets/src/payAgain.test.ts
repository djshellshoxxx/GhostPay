import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ADDR_A, ADDR_B, NOW, ctx, preset, record } from './fixtures.testutil.js';
import { derivePayAgain, presetToDraft } from './payAgain.js';
import type { PaymentDraft, Result } from './types.js';

const draft = (r: Result<PaymentDraft>): PaymentDraft => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
};
const codes = (d: PaymentDraft) => d.flags.map((f) => f.code);

describe('derivePayAgain', () => {
  it('clean repeat: no flags, never auto-sends, copies fields', () => {
    const d = draft(derivePayAgain(record(), ctx()));
    expect(d).toMatchObject({
      autoSend: false,
      requiresReview: true,
      blocked: false,
      address: ADDR_A,
      chain: 'eip155:1',
      asset: 'native',
      amount: 1_500_000_000_000_000_000n,
      fee: 2_100_000_000_000n,
      memo: 'rent',
      privacyProfile: 'standard',
      maxAmount: null,
      source: { kind: 'record', id: 'pay_1' },
    });
    expect(d.flags).toEqual([]);
  });

  it('flags fee increase beyond 5% as warn, with exact numbers', () => {
    const d = draft(derivePayAgain(record({ fee: 1000n }), ctx({ quotedFee: 1051n })));
    expect(d.flags).toEqual([
      { code: 'fee-changed', severity: 'warn', detail: { previous: '1000', current: '1051' } },
    ]);
    expect(d.fee).toBe(1051n);
    expect(d.blocked).toBe(false);
  });
  it('fee exactly at tolerance is not flagged; custom tolerance respected', () => {
    expect(draft(derivePayAgain(record({ fee: 1000n }), ctx({ quotedFee: 1050n }))).flags).toEqual([]);
    expect(
      codes(draft(derivePayAgain(record({ fee: 1000n }), ctx({ quotedFee: 1050n }), { feeToleranceBps: 0 }))),
    ).toEqual(['fee-changed']);
    expect(
      draft(derivePayAgain(record({ fee: 1000n }), ctx({ quotedFee: 1500n }), { feeToleranceBps: 10_000 }))
        .flags,
    ).toEqual([]);
  });
  it('fee decrease is info; from zero any increase flags; zero to zero does not', () => {
    expect(draft(derivePayAgain(record({ fee: 1000n }), ctx({ quotedFee: 900n }))).flags[0]).toMatchObject({
      severity: 'info',
    });
    expect(codes(draft(derivePayAgain(record({ fee: 0n }), ctx({ quotedFee: 1n }))))).toEqual([
      'fee-changed',
    ]);
    expect(draft(derivePayAgain(record({ fee: 0n }), ctx({ quotedFee: 0n }))).flags).toEqual([]);
  });
  it('missing quote -> warn, fee null', () => {
    const d = draft(derivePayAgain(record(), ctx({ quotedFee: null })));
    expect(d.fee).toBeNull();
    expect(d.flags).toEqual([{ code: 'fee-unavailable', severity: 'warn' }]);
  });

  it('changed address blocks and uses the NEW address', () => {
    const d = draft(derivePayAgain(record(), ctx({ resolvedAddress: ADDR_B })));
    expect(d.blocked).toBe(true);
    expect(d.address).toBe(ADDR_B);
    expect(d.flags).toContainEqual({
      code: 'address-changed',
      severity: 'block',
      detail: { previous: ADDR_A, current: ADDR_B },
    });
  });

  it('risk: increase warns, high blocks, unknown warns, decrease/equal silent', () => {
    expect(
      codes(draft(derivePayAgain(record({ addressRisk: 'none' }), ctx({ addressRisk: 'medium' })))),
    ).toEqual(['address-risk-increased']);
    const hi = draft(derivePayAgain(record({ addressRisk: 'none' }), ctx({ addressRisk: 'high' })));
    expect(codes(hi)).toEqual(['address-risk-high']);
    expect(hi.blocked).toBe(true);
    expect(codes(draft(derivePayAgain(record(), ctx({ addressRisk: 'unknown' }))))).toEqual([
      'address-risk-unknown',
    ]);
    expect(draft(derivePayAgain(record({ addressRisk: 'high' }), ctx({ addressRisk: 'low' }))).flags).toEqual(
      [],
    );
    expect(
      draft(derivePayAgain(record({ addressRisk: 'unknown' }), ctx({ addressRisk: 'medium' }))).flags,
    ).toEqual([]);
  });

  it('stale record is info; boundary is exclusive', () => {
    const day = 86_400_000;
    const d = draft(derivePayAgain(record({ paidAt: NOW - 91 * day }), ctx()));
    expect(d.flags).toEqual([
      { code: 'record-stale', severity: 'info', detail: { ageMs: String(91 * day) } },
    ]);
    expect(draft(derivePayAgain(record({ paidAt: NOW - 90 * day }), ctx())).flags).toEqual([]);
    expect(codes(draft(derivePayAgain(record({ paidAt: NOW - 10 }), ctx(), { staleAfterMs: 5 })))).toEqual([
      'record-stale',
    ]);
  });

  it('combines multiple flags', () => {
    const d = draft(
      derivePayAgain(
        record({ fee: 100n }),
        ctx({ resolvedAddress: ADDR_B, addressRisk: 'high', quotedFee: 500n }),
      ),
    );
    expect(codes(d)).toEqual(['address-changed', 'address-risk-high', 'fee-changed']);
  });

  it('rejects: bad record, future record, unresolved/invalid address, unsupported chain', () => {
    expect(derivePayAgain({ ...record(), amount: 0n }, ctx())).toMatchObject({
      ok: false,
      error: { code: 'invalid-record' },
    });
    expect(derivePayAgain(record({ paidAt: NOW + 1 }), ctx())).toMatchObject({
      ok: false,
      error: { code: 'invalid-record' },
    });
    expect(derivePayAgain(record(), ctx({ resolvedAddress: null }))).toMatchObject({
      ok: false,
      error: { code: 'payee-mismatch' },
    });
    expect(derivePayAgain(record(), ctx({ resolvedAddress: 'nope' }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-address' },
    });
    expect(derivePayAgain(record(), ctx({ resolvedAddress: 'bad addr' }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-address' },
    });
    expect(derivePayAgain(record(), ctx({ supported: () => false }))).toMatchObject({
      ok: false,
      error: { code: 'chain-mismatch' },
    });
    expect(derivePayAgain(record(), ctx({ supported: () => true })).ok).toBe(true);
  });

  it('a throwing or non-boolean validator/supported callback fails closed', () => {
    const boom = () => {
      throw new Error('x');
    };
    expect(derivePayAgain(record(), ctx({ validateAddress: boom }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-address' },
    });
    expect(derivePayAgain(record(), ctx({ validateAddress: (() => 'yes') as never }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-address' },
    });
    expect(derivePayAgain(record(), ctx({ supported: boom }))).toMatchObject({
      ok: false,
      error: { code: 'chain-mismatch' },
    });
  });

  it('rejects malformed contexts and options', () => {
    const bad = (c: unknown, o = {}) => derivePayAgain(record(), c as never, o);
    for (const c of [
      null,
      { ...ctx(), now: 1.5 },
      { ...ctx(), now: -1 },
      { ...ctx(), validateAddress: 1 },
      { ...ctx(), supported: 1 },
      { ...ctx(), addressRisk: 'x' },
      { ...ctx(), quotedFee: -1n },
      { ...ctx(), quotedFee: 5 },
      { ...ctx(), resolvedAddress: 5 },
    ])
      expect(bad(c)).toMatchObject({
        ok: false,
        error: { code: expect.stringMatching(/invalid-context/) as unknown },
      });
    expect(bad(ctx(), { feeToleranceBps: 10_001 }).ok).toBe(false);
    expect(bad(ctx(), { feeToleranceBps: 1.5 }).ok).toBe(false);
    expect(bad(ctx(), { staleAfterMs: -1 }).ok).toBe(false);
  });

  it('property: draft never auto-sends and never exposes the old address when it differs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('none', 'low', 'medium', 'high', 'unknown' as const),
        fc.constantFrom('none', 'low', 'medium', 'high', 'unknown' as const),
        fc.bigInt({ min: 0n, max: 10n ** 20n }),
        fc.bigInt({ min: 0n, max: 10n ** 20n }),
        fc.boolean(),
        (r1, r2, f1, f2, swap) => {
          const res = derivePayAgain(
            record({ addressRisk: r1, fee: f1 }),
            ctx({ addressRisk: r2, quotedFee: f2, resolvedAddress: swap ? ADDR_B : ADDR_A }),
          );
          expect(res.ok).toBe(true);
          if (!res.ok) return;
          expect(res.value.autoSend).toBe(false);
          expect(res.value.address).toBe(swap ? ADDR_B : ADDR_A);
          expect(res.value.blocked).toBe(swap || r2 === 'high');
        },
      ),
    );
  });
});

describe('presetToDraft', () => {
  it('fixed rule uses its amount and forbids override', () => {
    const d = draft(presetToDraft(preset(), ctx()));
    expect(d.amount).toBe(1_500_000_000_000_000_000n);
    expect(d.flags).toEqual([]);
    expect(d.source).toEqual({ kind: 'preset', id: 'preset_1' });
    expect(presetToDraft(preset(), ctx(), 5n)).toMatchObject({
      ok: false,
      error: { code: 'invalid-amount' },
    });
  });
  it('ask rule: amount null until supplied; must be positive', () => {
    const p = preset({ amountRule: { kind: 'ask' } });
    expect(draft(presetToDraft(p, ctx())).amount).toBeNull();
    expect(draft(presetToDraft(p, ctx(), 42n)).amount).toBe(42n);
    expect(presetToDraft(p, ctx(), 0n).ok).toBe(false);
    expect(presetToDraft(p, ctx(), -3n).ok).toBe(false);
  });
  it('up-to rule enforces the cap inclusively and reports it', () => {
    const p = preset({ amountRule: { kind: 'up-to', max: 100n } });
    expect(draft(presetToDraft(p, ctx(), 100n))).toMatchObject({ amount: 100n, maxAmount: 100n });
    expect(draft(presetToDraft(p, ctx())).amount).toBeNull();
    expect(presetToDraft(p, ctx(), 101n)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
  });
  it('re-validates the preset and the world', () => {
    expect(presetToDraft({ ...preset(), chain: 'bad' }, ctx()).ok).toBe(false);
    expect(presetToDraft(preset(), ctx({ addressRisk: 'high' }))).toMatchObject({
      ok: true,
      value: { blocked: true },
    });
    expect(presetToDraft(preset(), ctx({ resolvedAddress: null })).ok).toBe(false);
    expect(presetToDraft(preset(), ctx({ now: 1.5 })).ok).toBe(false);
  });
});
