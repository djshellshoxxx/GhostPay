import { describe, expect, it } from 'vitest';
import {
  advance, BillingError, cancel, createSubscription, DEFAULT_DUNNING, markPaid, pause, periodAt, prorate,
  prorateChange, resume, type DunningPolicy, type Plan, type Subscription,
} from './index.js';
import { D, JAN31, seededRng, TEMPLATE } from './fixtures.testutil.js';

const plan: Plan = {
  id: 'pro', name: 'Pro plan', currency: 'USD', amountMinor: '4900', taxBps: 825,
  schedule: { anchor: JAN31, cadence: { kind: 'monthly', every: 1 } },
};
const rng = () => seededRng('sub');
const policy: DunningPolicy = { leadSeconds: 3 * D, graceSeconds: 3 * D, lapseAfterSeconds: 14 * D, reminderOffsets: [-D, 0, 3 * D], maxIssuePerAdvance: 1 };

function start(): Subscription {
  return createSubscription('sub_1', plan, JAN31 - 10 * D);
}

describe('issuance', () => {
  it('does not issue before lead window, issues inside it', () => {
    const s = start();
    expect(advance(s, JAN31 - 4 * D, TEMPLATE, policy, rng()).issued).toHaveLength(0);
    const r = advance(s, JAN31 - 3 * D, TEMPLATE, policy, rng());
    expect(r.issued).toHaveLength(1);
    const inv = r.issued[0]!;
    // 4900 + floor(4900*825/10000)=404 tax => 5304
    expect(inv.fiat.minorUnits).toBe('5304');
    expect(inv.tax).toEqual({ rateBps: 825, minorUnits: '404' });
    expect(inv.lineItems[0]?.description).toBe('Pro plan 2026-01-31 to 2026-02-28');
    expect(inv.expiresAt).toBe(JAN31 + 17 * D);
    expect(r.subscription.nextIndex).toBe(1);
  });
  it('idempotent: same time issues nothing twice', () => {
    const a = advance(start(), JAN31, TEMPLATE, policy, rng());
    const b = advance(a.subscription, JAN31, TEMPLATE, policy, rng());
    expect(b.issued).toHaveLength(0);
    expect(b.subscription.periods).toHaveLength(1);
  });
  it('blocks next issuance while past_due; resumes after payment', () => {
    let s = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    const wide = { ...policy, leadSeconds: 40 * D };
    const t = JAN31 + 5 * D;
    const late = advance(s, t, TEMPLATE, wide, rng());
    expect(late.subscription.status).toBe('past_due');
    expect(late.issued).toHaveLength(0);
    s = markPaid(late.subscription, 0, t + 10);
    expect(s.status).toBe('active');
    expect(advance(s, t, TEMPLATE, wide, rng()).issued).toHaveLength(1);
  });
  it('catch-up is capped per call', () => {
    const s = start();
    const r = advance(s, JAN31, TEMPLATE, { ...policy, maxIssuePerAdvance: 2, leadSeconds: 40 * D }, rng());
    expect(r.issued).toHaveLength(2);
    expect(r.subscription.periods.map((p) => p.index)).toEqual([0, 1]);
  });
  it('rejects bad plans, ids, policies, templates', () => {
    expect(() => createSubscription('bad id', plan, 0)).toThrow(BillingError);
    expect(() => createSubscription('x', { ...plan, amountMinor: '0' }, 0)).toThrow(BillingError);
    expect(() => createSubscription('x', { ...plan, name: 'café' }, 0)).toThrow(BillingError);
    expect(() => createSubscription('x', { ...plan, taxBps: 10_001 }, 0)).toThrow(BillingError);
    expect(() => advance(start(), JAN31, TEMPLATE, { ...policy, maxIssuePerAdvance: 0 })).toThrow(BillingError);
    expect(() => advance(start(), JAN31, TEMPLATE, { ...policy, reminderOffsets: [5, 5] })).toThrow(BillingError);
    expect(() => advance(start(), JAN31, TEMPLATE, { ...policy, graceSeconds: -1 })).toThrow(BillingError);
    expect(() => advance(start(), JAN31, { ...TEMPLATE, quoteTtlSeconds: -1 }, policy)).toThrow(BillingError);
    expect(() => advance(start(), JAN31, TEMPLATE, { ...policy, reminderOffsets: new Array<number>(13).fill(0).map((_, i) => i) })).toThrow(BillingError);
  });
  it('default policy works and plan starting in the future starts at period 0', () => {
    const fut = createSubscription('f', plan, 0);
    expect(fut.nextIndex).toBe(0);
    expect(advance(fut, JAN31 - 3 * D, TEMPLATE, DEFAULT_DUNNING, rng()).issued).toHaveLength(1);
  });
});

describe('dunning', () => {
  it('reminders fire once each, skipped offsets collapse', () => {
    const s0 = advance(start(), JAN31 - 3 * D, TEMPLATE, policy, rng()).subscription;
    // dueAt = JAN31 (period start). Reminder offsets: -1d, 0, +3d
    expect(advance(s0, JAN31 - 2 * D, TEMPLATE, policy, rng()).reminders).toHaveLength(0);
    const r1 = advance(s0, JAN31 - D, TEMPLATE, policy, rng());
    expect(r1.reminders).toEqual([{ subscriptionId: 'sub_1', periodIndex: 0, offsetIndex: 0, dueAt: JAN31 }]);
    const again = advance(r1.subscription, JAN31 - D, TEMPLATE, policy, rng());
    expect(again.reminders).toHaveLength(0);
    // jump to +3d: offsets 1 and 2 both elapsed -> single reminder, index 2
    const r2 = advance(r1.subscription, JAN31 + 3 * D, TEMPLATE, policy, rng());
    expect(r2.reminders.map((r) => r.offsetIndex)).toEqual([2]);
    expect(r2.subscription.status).toBe('past_due');
  });
  it('lapses after grace + lapse window and stays lapsed', () => {
    const s0 = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    const r = advance(s0, JAN31 + 17 * D, TEMPLATE, policy, rng());
    expect(r.subscription.status).toBe('lapsed');
    expect(r.reminders).toHaveLength(0);
    expect(advance(r.subscription, JAN31 + 100 * D, TEMPLATE, policy, rng()).issued).toHaveLength(0);
    // paying a lapsed sub does not silently reactivate
    expect(markPaid(r.subscription, 0, JAN31 + 18 * D).status).toBe('lapsed');
  });
  it('late-issued invoice is due at issue time', () => {
    const r = advance(start(), JAN31 + 5 * D, TEMPLATE, policy, rng());
    expect(r.subscription.periods[0]?.dueAt).toBe(JAN31 + 5 * D);
  });
});

describe('markPaid', () => {
  it('is idempotent and rejects unknown/void', () => {
    const s = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    const p = markPaid(s, 0, JAN31 + 1);
    expect(markPaid(p, 0, JAN31 + 99)).toBe(p);
    expect(p.periods[0]?.paidAt).toBe(JAN31 + 1);
    expect(() => markPaid(s, 5, 1)).toThrow(BillingError);
    const c = cancel(s, JAN31 + 1, { atPeriodEnd: false });
    expect(() => markPaid(c, 0, 1)).toThrow(BillingError);
  });
  it('past_due stays when another invoice is still open', () => {
    let s = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    s = { ...s, status: 'past_due' };
    const extra = { ...(s.periods[0] as NonNullable<Subscription['periods'][number]>), index: 1 };
    s = { ...s, periods: [...s.periods, extra] };
    expect(markPaid(s, 0, JAN31 + 1).status).toBe('past_due');
  });
});

describe('pause / resume / cancel', () => {
  it('paused: nothing issued, no reminders; resume skips elapsed periods', () => {
    let s = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    s = markPaid(s, 0, JAN31);
    s = pause(s, JAN31 + D);
    const mid = advance(s, JAN31 + 40 * D, TEMPLATE, policy, rng());
    expect(mid.issued).toHaveLength(0);
    expect(mid.reminders).toHaveLength(0);
    const resumeAt = periodAt(plan.schedule, 1).start + 5 * D; // 2026-03-05
    const r = resume(mid.subscription, resumeAt);
    expect(r.status).toBe('active');
    expect(r.pausedAt).toBeUndefined();
    expect(r.nextIndex).toBe(2); // March 31 is next; Feb is skipped, not back-billed
    expect(advance(r, resumeAt, TEMPLATE, policy, rng()).issued).toHaveLength(0);
    expect(advance(r, periodAt(plan.schedule, 2).start - 3 * D, TEMPLATE, policy, rng()).issued).toHaveLength(1);
  });
  it('resume exactly on a period start bills that period; before anchor uses 0', () => {
    const s = pause(start(), JAN31 - 9 * D);
    expect(resume(s, periodAt(plan.schedule, 1).start).nextIndex).toBe(1);
    expect(resume(s, JAN31 - 9 * D).nextIndex).toBe(0);
  });
  it('state guards', () => {
    expect(() => resume(start(), 1)).toThrow(BillingError);
    expect(() => pause(pause(start(), 1), 2)).toThrow(BillingError);
  });
  it('cancel immediately voids unpaid', () => {
    const s = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    const c = cancel(s, JAN31 + D, { atPeriodEnd: false });
    expect(c.status).toBe('canceled');
    expect(c.periods[0]?.status).toBe('void');
    expect(cancel(c, JAN31 + 2 * D, { atPeriodEnd: true })).toBe(c);
    expect(advance(c, JAN31 + 40 * D, TEMPLATE, policy, rng()).issued).toHaveLength(0);
  });
  it('cancel at period end: current paid period runs, next not invoiced', () => {
    let s = advance(start(), JAN31, TEMPLATE, policy, rng()).subscription;
    s = markPaid(s, 0, JAN31);
    s = cancel(s, JAN31 + 5 * D, { atPeriodEnd: true });
    expect(s.cancelAtPeriodEnd).toBe(periodAt(plan.schedule, 0).end);
    const feb25 = periodAt(plan.schedule, 0).end - 2 * D; // inside lead window of period 1
    const mid = advance(s, feb25, TEMPLATE, policy, rng());
    expect(mid.issued).toHaveLength(0);
    expect(mid.subscription.status).toBe('active');
    const end = advance(mid.subscription, periodAt(plan.schedule, 0).end, TEMPLATE, policy, rng());
    expect(end.subscription.status).toBe('canceled');
    expect(end.subscription.canceledAt).toBe(periodAt(plan.schedule, 0).end);
  });
  it('cancel at period end before the anchor ends at first period start', () => {
    const c = cancel(start(), JAN31 - 9 * D, { atPeriodEnd: true });
    expect(c.cancelAtPeriodEnd).toBe(JAN31);
  });
  it('paused sub with cancelAtPeriodEnd still cancels at the boundary', () => {
    const s = pause(cancel(start(), JAN31 - 9 * D, { atPeriodEnd: true }), JAN31 - 8 * D);
    expect(advance(s, JAN31 + 1, TEMPLATE, policy, rng()).subscription.status).toBe('canceled');
  });
});

describe('proration', () => {
  const per = { index: 0, start: 0, end: 30 * D };
  it('prorates 3000 over 30 days, 10 days left', () => {
    expect(prorate(3000n, per, 20 * D)).toBe(1000n);
    expect(prorate(3000n, per, 0)).toBe(3000n);
    expect(prorate(3000n, per, 30 * D)).toBe(0n);
    expect(prorate(1000n, per, 10 * D)).toBe(667n); // 666.67 rounds up
  });
  it('rejects outside period', () => {
    expect(() => prorate(1n, per, -1)).toThrow(BillingError);
    expect(() => prorate(1n, per, 30 * D + 1)).toThrow(BillingError);
  });
  it('upgrade 3000 -> 6000 with 10 of 30 days left charges 1000', () => {
    expect(prorateChange(3000n, 6000n, per, 20 * D)).toEqual({ direction: 'charge', amountMinor: 1000n, creditUnusedOld: 1000n, chargeRemainingNew: 2000n });
  });
  it('downgrade gives credit; same plan none', () => {
    expect(prorateChange(6000n, 3000n, per, 20 * D)).toMatchObject({ direction: 'credit', amountMinor: 1000n });
    expect(prorateChange(3000n, 3000n, per, 20 * D)).toMatchObject({ direction: 'none', amountMinor: 0n });
  });
});
