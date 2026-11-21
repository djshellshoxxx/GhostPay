import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RECURRING_PLANS, RecurringError, createRecurringPlan, reviseRecurringPlan,
  transitionRecurringPlan, previewDue, type RecurringMutationContext,
} from './index';
import { JAN31, invoiceReference, planFixture, snapshotFixture } from './fixtures.testutil';

const context = (nowSeconds = JAN31): RecurringMutationContext => ({
  profileRef: 'profile-1',
  expectedSnapshotRevision: 'snapshot-1',
  nextSnapshotRevision: 'snapshot-2',
  nowSeconds,
});

describe('F10 M2 — local-only, immutable recurring-plan lifecycle', () => {
  it('creates a new plan only in the paused state, without issuing work', () => {
    const prior = snapshotFixture();
    const before = JSON.stringify(prior);
    const result = createRecurringPlan(prior, planFixture({
      planId: 'plan-2', revision: 'terms-1', status: 'paused',
    }), context());
    expect(result.plans.map(state => state.plan.planId)).toEqual(['plan-1', 'plan-2']);
    expect(result.plans[1]).toMatchObject({ nextPeriodIndex: 0, plan: { status: 'paused' } });
    expect(result.revision).toBe('snapshot-2');
    expect(previewDue(result, 'plan-2', JAN31).periods).toEqual([]);
    expect(result.outbox).toEqual([]);
    expect(Object.isFrozen(result.plans)).toBe(true);
    expect(JSON.stringify(prior)).toBe(before);
  });

  it('rejects activated imports, duplicates, and creation beyond plan limits', () => {
    const original = snapshotFixture();
    expect(() => createRecurringPlan(original, planFixture({ planId: 'plan-2' }), context()))
      .toThrowError(new RecurringError('INVALID_TRANSITION'));
    expect(() => createRecurringPlan(original, planFixture({ status: 'paused' }), context()))
      .toThrowError(new RecurringError('DUPLICATE'));
    original.plans = Array.from({ length: MAX_RECURRING_PLANS }, (_, n) => ({
      plan: planFixture({ planId: `plan-${n}` }), nextPeriodIndex: 0,
    }));
    expect(() => createRecurringPlan(original, planFixture({ planId: 'new', status: 'paused' }), context()))
      .toThrowError(new RecurringError('LIMIT'));
  });

  it('pauses an active plan without rewinding its cursor, rewriting invoices, or creating effects', () => {
    const original = snapshotFixture();
    original.plans[0]!.nextPeriodIndex = 1;
    original.outbox.push(invoiceReference(0));
    const before = JSON.stringify(original);
    const fetchSpy = vi.fn(() => { throw new Error('unexpected network'); });
    const walletSpy = vi.fn(() => { throw new Error('unexpected wallet'); });
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = fetchSpy as typeof fetch;
      const next = transitionRecurringPlan(original, 'plan-1', 'pause', 'terms-1', 'terms-2', context());
      expect(next.plans[0]).toMatchObject({ nextPeriodIndex: 1, plan: { status: 'paused', revision: 'terms-2' } });
      expect(next.outbox).toEqual(original.outbox);
      expect(previewDue(next, 'plan-1', JAN31 + 100 * 86400).periods).toEqual([]);
      expect(next.outbox[0]?.planRevision).toBe('terms-1');
      expect(JSON.stringify(original)).toBe(before);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(walletSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('resumes only future UTC periods, skipping missed periods after a long pause', () => {
    const paused = snapshotFixture({ status: 'paused' });
    const now = Date.UTC(2026, 2, 15, 12, 34, 56) / 1000;
    const resumed = transitionRecurringPlan(paused, 'plan-1', 'resume', 'terms-1', 'terms-2', context(now));
    expect(resumed.plans[0]!.nextPeriodIndex).toBe(2);
    expect(resumed.plans[0]!.plan.status).toBe('active');
    expect(previewDue(resumed, 'plan-1', now).periods).toEqual([]);
    expect(previewDue(resumed, 'plan-1', Date.UTC(2026, 2, 31, 12, 34, 56) / 1000)
      .periods.map(period => period.index)).toEqual([2]);
  });

  it('skips the exact start of the current UTC period on resume and preserves month-end anchors', () => {
    const paused = snapshotFixture({ status: 'paused', anchorSeconds: Date.UTC(2028, 0, 31, 12, 34, 56) / 1000 });
    const exactFeb = Date.UTC(2028, 1, 29, 12, 34, 56) / 1000;
    const resumed = transitionRecurringPlan(paused, 'plan-1', 'resume', 'terms-1', 'terms-2', context(exactFeb));
    expect(resumed.plans[0]!.nextPeriodIndex).toBe(2);
    expect(previewDue(resumed, 'plan-1', Date.UTC(2028, 2, 31, 12, 34, 56) / 1000)
      .periods.map(period => period.index)).toEqual([2]);
  });

  it('does not rewind the cursor on resume before the first due date or after prior issuance', () => {
    const beforeFirst = snapshotFixture({ status: 'paused', anchorSeconds: JAN31 + 3600 });
    expect(transitionRecurringPlan(beforeFirst, 'plan-1', 'resume', 'terms-1', 'terms-2', context(JAN31))
      .plans[0]!.nextPeriodIndex).toBe(0);
    const prior = snapshotFixture({ status: 'paused', cadence: { kind: 'custom', seconds: 3600 } });
    prior.plans[0]!.nextPeriodIndex = 24;
    prior.outbox.push(invoiceReference(0, { status: 'prepared' }));
    const resumed = transitionRecurringPlan(prior, 'plan-1', 'resume', 'terms-1', 'terms-2', context(JAN31 + 3600));
    expect(resumed.plans[0]!.nextPeriodIndex).toBe(24);
    expect(resumed.outbox).toEqual(prior.outbox);
  });

  it('marks far-offline schedules exhausted, without inventing a terminal due period', () => {
    const paused = snapshotFixture({
      status: 'paused', anchorSeconds: 0, cadence: { kind: 'custom', seconds: 3600 },
    });
    const resumed = transitionRecurringPlan(paused, 'plan-1', 'resume', 'terms-1', 'terms-2', context(3600 * 100000));
    expect(resumed.plans[0]!.nextPeriodIndex).toBe(100000);
    expect(previewDue(resumed, 'plan-1', 3600 * 100000).periods).toEqual([]);
  });

  it('cancels from active or paused, preserves history, and cannot reactivate', () => {
    for (const status of ['active', 'paused']) {
      const original = snapshotFixture({ status });
      original.plans[0]!.nextPeriodIndex = 1;
      original.outbox.push(invoiceReference(0));
      const cancelled = transitionRecurringPlan(original, 'plan-1', 'cancel', 'terms-1', 'terms-2', context());
      expect(cancelled.plans[0]!.plan.status).toBe('cancelled');
      expect(cancelled.outbox).toEqual(original.outbox);
      expect(previewDue(cancelled, 'plan-1', JAN31 + 365 * 86400).periods).toEqual([]);
      expect(() => transitionRecurringPlan(cancelled, 'plan-1', 'resume', 'terms-2', 'terms-3', {
        ...context(), expectedSnapshotRevision: 'snapshot-2', nextSnapshotRevision: 'snapshot-3',
      })).toThrowError(new RecurringError('INVALID_TRANSITION'));
    }
  });

  it('revises paused future pricing/asset/template terms without touching historical invoice references', () => {
    const original = snapshotFixture({ status: 'paused' });
    original.plans[0]!.nextPeriodIndex = 1;
    original.outbox.push(invoiceReference(0));
    const revised = reviseRecurringPlan(original, 'plan-1', planFixture({
      status: 'paused', revision: 'terms-2', amountAtomic: '5',
      templateRef: 'template-2', assetId: 'eip155:8453/slip44:60',
    }), 'terms-1', context());
    expect(revised.plans[0]!.plan).toMatchObject({
      revision: 'terms-2', amountAtomic: '5', templateRef: 'template-2',
      assetId: 'eip155:8453/slip44:60', status: 'paused',
    });
    expect(revised.outbox).toEqual(original.outbox);
    expect(revised.outbox[0]!.planRevision).toBe('terms-1');
    expect(revised.plans[0]!.nextPeriodIndex).toBe(1);
  });

  it('requires fresh consent for term changes and an immutable schedule identity', () => {
    const paused = snapshotFixture({ status: 'paused' });
    for (const changed of [
      { status: 'active' },
      { revision: 'terms-1' },
      { anchorSeconds: JAN31 + 1 },
      { cadence: { kind: 'monthly', every: 2 } },
      { planId: 'another-plan' },
    ]) {
      expect(() => reviseRecurringPlan(paused, 'plan-1', planFixture({
        status: 'paused', revision: 'terms-2', ...changed,
      }), 'terms-1', context())).toThrowError(new RecurringError('INVALID_TRANSITION'));
    }
    expect(() => reviseRecurringPlan(snapshotFixture(), 'plan-1',
      planFixture({ status: 'paused', revision: 'terms-2' }), 'terms-1', context()))
      .toThrowError(new RecurringError('INVALID_TRANSITION'));
  });

  it('rejects stale snapshot, profile, plan, missing plan and reused revisions', () => {
    const snapshot = snapshotFixture();
    for (const changed of [
      { profileRef: 'profile-2' },
      { expectedSnapshotRevision: 'old-snapshot' },
      { nextSnapshotRevision: 'snapshot-1' },
    ]) {
      expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'pause', 'terms-1', 'terms-2', {
        ...context(), ...changed,
      })).toThrowError(new RecurringError('STALE_MUTATION'));
    }
    expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'pause', 'old-terms', 'terms-2', context()))
      .toThrowError(new RecurringError('STALE_MUTATION'));
    expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'pause', 'terms-1', 'terms-1', context()))
      .toThrowError(new RecurringError('STALE_MUTATION'));
    expect(() => transitionRecurringPlan(snapshot, 'absent', 'pause', 'terms-1', 'terms-2', context()))
      .toThrowError(new RecurringError('PLAN_MISSING'));
  });

  it('rejects invalid actions, clocks, ambiguous mutation input and revoked status transitions', () => {
    const snapshot = snapshotFixture();
    expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'resume', 'terms-1', 'terms-2', context()))
      .toThrowError(new RecurringError('INVALID_TRANSITION'));
    expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'bogus' as 'pause', 'terms-1', 'terms-2', context()))
      .toThrowError(new RecurringError('INVALID_TRANSITION'));
    expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'pause', 'terms-1', 'terms-2', {
      ...context(), nowSeconds: NaN,
    })).toThrowError(new RecurringError('CLOCK'));
    const modified = context();
    let reads = 0;
    Object.defineProperty(modified, 'profileRef', {
      enumerable: true, get: () => { reads++; return 'profile-1'; },
    });
    expect(() => transitionRecurringPlan(snapshot, 'plan-1', 'pause', 'terms-1', 'terms-2', modified))
      .toThrowError(new RecurringError('SCHEMA'));
    expect(reads).toBe(0);
  });
});
