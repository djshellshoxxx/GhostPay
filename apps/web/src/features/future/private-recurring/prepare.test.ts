import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RecurringError, RecurringPreparationController, type RecurringReviewContext,
} from './index';
import { JAN31, invoiceReference, snapshotFixture } from './fixtures.testutil';

const context = (nowSeconds = JAN31): RecurringReviewContext => ({
  operationId: 'prepare-1', sessionEpoch: 2, nowSeconds, signal: new AbortController().signal,
});
const FEB28 = Date.UTC(2026, 1, 28, 12, 34, 56) / 1000;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('F10 M3 — prepared invoice references, not signed invoices', () => {
  it('consumes one live review and stages only the earliest due period once', () => {
    const original = snapshotFixture();
    const before = JSON.stringify(original);
    const coordinator = new RecurringPreparationController();
    const ctx = context();
    const review = coordinator.preview(original, 'plan-1', ctx);
    const next = coordinator.prepareNext(review, original, ctx, 'local-reservation-0', 'snapshot-2');
    expect(next.revision).toBe('snapshot-2');
    expect(next.plans[0]!.nextPeriodIndex).toBe(1);
    expect(next.outbox).toEqual([{
      eventId: 'plan-1:period:0:invoice',
      planId: 'plan-1', planRevision: 'terms-1', periodIndex: 0, kind: 'invoice',
      artifactRef: 'local-reservation-0', status: 'prepared',
    }]);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.outbox[0])).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
    expect(() => coordinator.prepareNext(review, original, ctx, 'local-reservation-0', 'snapshot-2'))
      .toThrowError(new RecurringError('REVIEW_REVOKED'));
  });

  it('uses the advancing cursor after reload instead of creating an earlier invoice twice', () => {
    const original = snapshotFixture();
    const coordinator = new RecurringPreparationController();
    const firstContext = context(FEB28);
    const first = coordinator.preview(original, 'plan-1', firstContext);
    expect(first.periods.map(p => p.index)).toEqual([0, 1]);
    const prepared = coordinator.prepareNext(first, original, firstContext, 'local-reservation-0', 'snapshot-2');
    const replayed = JSON.parse(JSON.stringify(prepared)) as unknown;
    const nextContext = context(FEB28);
    const nextView = new RecurringPreparationController().preview(replayed, 'plan-1', nextContext);
    expect(nextView.periods.map(p => p.index)).toEqual([1]);
    expect(nextView.periods[0]?.eventId).toBe('plan-1:period:1:invoice');
  });

  it('preserves every earlier historical outbox record without changing signed terms', () => {
    const original = snapshotFixture({ revision: 'terms-2', cadence: { kind: 'custom', seconds: 3600 } });
    original.plans[0]!.nextPeriodIndex = 1;
    original.outbox.push(invoiceReference(0, { planRevision: 'terms-1' }));
    const coordinator = new RecurringPreparationController();
    const ctx = context(JAN31 + 3600);
    const review = coordinator.preview(original, 'plan-1', ctx);
    const prepared = coordinator.prepareNext(review, original, ctx, 'local-reservation-1', 'snapshot-2');
    expect(prepared.outbox[0]).toEqual(invoiceReference(0));
    expect(prepared.outbox[1]!.planRevision).toBe('terms-2');
    expect(prepared.outbox[1]!.periodIndex).toBe(1);
    expect(prepared.plans[0]!.nextPeriodIndex).toBe(2);
  });

  it('rejects pre-existing artifact reference collisions without partial mutation', () => {
    const original = snapshotFixture({ cadence: { kind: 'custom', seconds: 3600 } });
    original.plans[0]!.nextPeriodIndex = 1;
    original.outbox.push(invoiceReference(0));
    const before = JSON.stringify(original);
    const coordinator = new RecurringPreparationController();
    const ctx = context(JAN31 + 3600);
    const review = coordinator.preview(original, 'plan-1', ctx);
    expect(() => coordinator.prepareNext(review, original, ctx, 'artifact-0', 'snapshot-2'))
      .toThrowError(new RecurringError('DUPLICATE'));
    expect(JSON.stringify(original)).toBe(before);
  });

  it('rejects invalid artifact identifiers and unchanged revisions', () => {
    for (const artifactRef of ['', 'bad/id', 'bad\nref', '/tmp/invoice.json']) {
      const original = snapshotFixture();
      const coordinator = new RecurringPreparationController();
      const ctx = context();
      const review = coordinator.preview(original, 'plan-1', ctx);
      expect(() => coordinator.prepareNext(review, original, ctx, artifactRef, 'snapshot-2'))
        .toThrowError(new RecurringError('REFERENCE'));
    }
    const original = snapshotFixture();
    const coordinator = new RecurringPreparationController();
    const ctx = context();
    const view = coordinator.preview(original, 'plan-1', ctx);
    expect(() => coordinator.prepareNext(view, original, ctx, 'local-reservation-0', 'snapshot-1'))
      .toThrowError(new RecurringError('STALE_MUTATION'));
  });

  it('refuses a changed snapshot, plan amount or cursor after review', () => {
    for (const change of ['snapshot', 'amount', 'cursor']) {
      const original = snapshotFixture();
      const coordinator = new RecurringPreparationController();
      const ctx = context();
      const review = coordinator.preview(original, 'plan-1', ctx);
      if (change === 'snapshot') original.revision = 'snapshot-new';
      if (change === 'amount') original.plans[0]!.plan.amountAtomic = '2';
      if (change === 'cursor') original.plans[0]!.nextPeriodIndex = 1;
      expect(() => coordinator.prepareNext(review, original, ctx, 'reservation-0', 'snapshot-2'))
        .toThrowError(new RecurringError('STALE_REVIEW'));
    }
  });

  it('rejects abort, operation and session changes, with no prepared entry', () => {
    const original = snapshotFixture();
    for (const changed of ['abort', 'operation', 'epoch', 'signal']) {
      const coordinator = new RecurringPreparationController();
      const abort = new AbortController();
      const ctx = { ...context(), signal: abort.signal };
      const view = coordinator.preview(original, 'plan-1', ctx);
      if (changed === 'abort') abort.abort();
      const next = { ...ctx,
        ...(changed === 'operation' ? { operationId: 'prepare-other' } : {}),
        ...(changed === 'epoch' ? { sessionEpoch: 3 } : {}),
        ...(changed === 'signal' ? { signal: new AbortController().signal } : {}),
      };
      expect(() => coordinator.prepareNext(view, original, next, 'reservation-0', 'snapshot-2'))
        .toThrowError(new RecurringError('REVIEW_REVOKED'));
    }
    expect(original.outbox).toEqual([]);
  });

  it('refuses clock rollback and approval after the five-minute live-review deadline', () => {
    const original = snapshotFixture();
    const coordinator = new RecurringPreparationController();
    const ctx = context();
    const view = coordinator.preview(original, 'plan-1', ctx);
    expect(() => coordinator.prepareNext(view, original, { ...ctx, nowSeconds: JAN31 - 1 }, 'res-0', 'snapshot-2'))
      .toThrowError(new RecurringError('CLOCK'));
    const view2 = coordinator.preview(original, 'plan-1', ctx);
    expect(() => coordinator.prepareNext(view2, original, { ...ctx, nowSeconds: JAN31 + 300 }, 'res-0', 'snapshot-2'))
      .toThrowError(new RecurringError('REVIEW_EXPIRED'));
  });

  it('cannot create a reference from a paused, cancelled, exhausted or future plan', () => {
    for (const overrides of [
      { status: 'paused' },
      { status: 'cancelled' },
      { anchorSeconds: JAN31 + 1 },
    ]) {
      const original = snapshotFixture(overrides);
      const coordinator = new RecurringPreparationController();
      const ctx = context();
      const view = coordinator.preview(original, 'plan-1', ctx);
      expect(() => coordinator.prepareNext(view, original, ctx, 'res-0', 'snapshot-2'))
        .toThrowError(new RecurringError('NOT_DUE'));
    }
    const exhausted = snapshotFixture({ cadence: { kind: 'custom', seconds: 3600 }, anchorSeconds: 0 });
    exhausted.plans[0]!.nextPeriodIndex = 100000;
    const coordinator = new RecurringPreparationController();
    const ctx = context(3600 * 100000);
    const view = coordinator.preview(exhausted, 'plan-1', ctx);
    expect(() => coordinator.prepareNext(view, exhausted, ctx, 'res-0', 'snapshot-2'))
      .toThrowError(new RecurringError('NOT_DUE'));
  });

  it('preparation does not access wallets, issue signatures, or make outbound requests', () => {
    const fetchSpy = vi.fn(() => { throw new Error('unexpected network'); });
    const walletSpy = vi.fn(() => { throw new Error('unexpected wallet'); });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('ethereum', { request: walletSpy });
    const original = snapshotFixture();
    const coordinator = new RecurringPreparationController();
    const ctx = context();
    const review = coordinator.preview(original, 'plan-1', ctx);
    expect(coordinator.prepareNext(review, original, ctx, 'reservation-0', 'snapshot-2').outbox[0]?.status).toBe('prepared');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(walletSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(coordinator)).toBe('{}');
  });

  it('does not transfer live consent to another controller or reconstitute it from JSON', () => {
    const original = snapshotFixture();
    const coordinator = new RecurringPreparationController();
    const ctx = context();
    const view = coordinator.preview(original, 'plan-1', ctx);
    const other = new RecurringPreparationController();
    expect(() => other.prepareNext(view, original, ctx, 'res-0', 'snapshot-2'))
      .toThrowError(new RecurringError('REVIEW_REVOKED'));
    expect(() => coordinator.prepareNext({ ...view }, original, ctx, 'res-0', 'snapshot-2'))
      .toThrowError(new RecurringError('REVIEW_REVOKED'));
  });
});
