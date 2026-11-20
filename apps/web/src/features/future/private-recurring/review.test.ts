import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DUE_PREVIEW_PERIODS, RECURRING_REVIEW_SECONDS, RecurringError,
  RecurringReviewController, previewDue, type RecurringReviewContext,
} from './index';
import { JAN31, invoiceReference, snapshotFixture } from './fixtures.testutil';

const ctx = (): RecurringReviewContext => ({
  operationId: 'review-1', sessionEpoch: 1, signal: new AbortController().signal, nowSeconds: JAN31,
});
const dates = (now: number, overrides: Record<string, unknown> = {}) =>
  previewDue(snapshotFixture(overrides), 'plan-1', now).periods.map(period => new Date(period.start * 1000).toISOString());

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('F10 due-period preview', () => {
  it('preserves Jan 31 month-end clamping without cumulative drift', () => {
    expect(dates(Date.UTC(2026, 4, 31, 12, 34, 56) / 1000)).toEqual([
      '2026-01-31T12:34:56.000Z', '2026-02-28T12:34:56.000Z', '2026-03-31T12:34:56.000Z',
      '2026-04-30T12:34:56.000Z', '2026-05-31T12:34:56.000Z',
    ]);
  });

  it('keeps a leap-day clamp and original UTC anchor through display timezone/DST changes', () => {
    const anchorSeconds = Date.UTC(2028, 0, 31, 12, 34, 56) / 1000;
    const now = Date.UTC(2028, 3, 30, 12, 34, 56) / 1000;
    const expected = ['2028-01-31T12:34:56.000Z', '2028-02-29T12:34:56.000Z',
      '2028-03-31T12:34:56.000Z', '2028-04-30T12:34:56.000Z'];
    expect(dates(now, { anchorSeconds })).toEqual(expected);
    expect(dates(now, { anchorSeconds, displayTimeZone: 'America/Vancouver' })).toEqual(expected);
    expect(dates(now, { anchorSeconds, displayTimeZone: 'Asia/Kathmandu' })).toEqual(expected);
  });

  it('computes weekly cadence and does not preview a period before its exact UTC start', () => {
    const input = snapshotFixture({ cadence: { kind: 'weekly', every: 2 } });
    expect(previewDue(input, 'plan-1', JAN31 - 1).periods).toEqual([]);
    expect(previewDue(input, 'plan-1', JAN31 + 14 * 86_400 - 1).periods.map(p => p.index)).toEqual([0]);
    expect(previewDue(input, 'plan-1', JAN31 + 14 * 86_400).periods.map(p => p.index)).toEqual([0, 1]);
  });

  it('bounds long-sleep catch-up without creating invoices, consuming randomness, or contacting providers', () => {
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => { throw new Error('unexpected randomness'); });
    const fetch = vi.fn(() => { throw new Error('unexpected network'); });
    const wallet = vi.fn(() => { throw new Error('unexpected wallet'); });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('ethereum', { request: wallet });
    const input = snapshotFixture({ cadence: { kind: 'custom', seconds: 3600 } });
    const before = JSON.stringify(input);
    const view = previewDue(input, 'plan-1', JAN31 + 100 * 3600);
    expect(view.periods).toHaveLength(MAX_DUE_PREVIEW_PERIODS);
    expect(view.periods.at(-1)?.index).toBe(23);
    expect(view.hasMore).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(random).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(wallet).not.toHaveBeenCalled();
  });

  it.each(['paused', 'cancelled'])('does not offer due work while %s and retains existing references', status => {
    const input = snapshotFixture({ status });
    input.plans[0]!.nextPeriodIndex = 1;
    input.outbox.push(invoiceReference(0));
    const before = JSON.stringify(input);
    const view = previewDue(input, 'plan-1', JAN31 + 100 * 86_400);
    expect(view.periods).toEqual([]);
    expect(view.hasMore).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('honors a persisted cursor and uses stable plan-period identities across reloads', () => {
    const input = snapshotFixture({ cadence: { kind: 'custom', seconds: 3600 } });
    input.plans[0]!.nextPeriodIndex = 2;
    input.outbox.push(invoiceReference(0), invoiceReference(1));
    const first = previewDue(input, 'plan-1', JAN31 + 3 * 3600);
    const second = previewDue(JSON.parse(JSON.stringify(input)) as unknown, 'plan-1', JAN31 + 3 * 3600);
    expect(first.periods.map(p => p.eventId)).toEqual(['plan-1:period:2:invoice', 'plan-1:period:3:invoice']);
    expect(second).toEqual(first);
    expect(first.hasMore).toBe(false);
  });

  it('treats the schedule horizon as exhausted, never as one extra period', () => {
    const input = snapshotFixture({ anchorSeconds: 0, cadence: { kind: 'custom', seconds: 3600 } });
    input.plans[0]!.nextPeriodIndex = 99999;
    expect(previewDue(input, 'plan-1', 100000 * 3600).periods.map(p => p.index)).toEqual([99999]);
    input.plans[0]!.nextPeriodIndex = 100000;
    expect(previewDue(input, 'plan-1', 100000 * 3600).periods).toEqual([]);
  });

  it('refuses unrepresentable period ends, excessive previews, invalid clocks, and missing plans', () => {
    const input = snapshotFixture();
    for (const limit of [0, -1, 25, 1.5])
      expect(() => previewDue(input, 'plan-1', JAN31, limit)).toThrowError(new RecurringError('LIMIT'));
    expect(() => previewDue(input, 'plan-1', NaN)).toThrowError(new RecurringError('CLOCK'));
    expect(() => previewDue(input, 'missing', JAN31)).toThrowError(new RecurringError('PLAN_MISSING'));
    expect(() => previewDue(snapshotFixture({ anchorSeconds: 253402300799, cadence: { kind: 'custom', seconds: 3600 } }),
      'plan-1', 253402300799)).toThrowError(new RecurringError('SCHEDULE'));
  });
});

describe('F10 explicit recurring-period review', () => {
  it('consumes one local review for only the earliest period without mutating durable state', () => {
    const input = snapshotFixture({ cadence: { kind: 'custom', seconds: 3600 } });
    const context = { ...ctx(), nowSeconds: JAN31 + 10 * 3600 };
    const controller = new RecurringReviewController();
    const view = controller.preview(input, 'plan-1', context);
    const approved = controller.approveNext(view, input, context);
    expect(view.periods).toHaveLength(11);
    expect(approved.period.index).toBe(0);
    expect(approved.plan.amountAtomic).toBe('1000000000000000001');
    expect(approved.schema).toBe('ghostpay.recurring-period-selection/1');
    expect(input.outbox).toEqual([]);
    expect(input.plans[0]!.nextPeriodIndex).toBe(0);
    expect(Object.isFrozen(approved)).toBe(true);
    expect(() => controller.approveNext(view, input, context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
  });

  it('never serializes the staged private snapshot through the controller object', () => {
    const controller = new RecurringReviewController();
    const abort = new AbortController();
    controller.preview(snapshotFixture(), 'plan-1', { ...ctx(), signal: abort.signal });
    expect(JSON.stringify(controller)).toBe('{}');
    abort.abort();
    expect(JSON.stringify(controller)).toBe('{}');
  });

  it.each(['revision', 'amountAtomic', 'assetId', 'templateRef', 'status'])('rejects changed %s even if snapshot revision was not bumped', field => {
    const input = snapshotFixture();
    const controller = new RecurringReviewController();
    const context = ctx();
    const view = controller.preview(input, 'plan-1', context);
    const changes: Record<string, unknown> = {
      revision: 'terms-2', amountAtomic: '2', assetId: 'eip155:8453/slip44:60', templateRef: 'template-2', status: 'paused',
    };
    const changed = snapshotFixture({ [field]: changes[field] });
    expect(() => controller.approveNext(view, changed, context)).toThrowError(new RecurringError('STALE_REVIEW'));
  });

  it('rejects a changed profile, another tab cursor, or a new snapshot revision', () => {
    for (const change of ['profile', 'cursor', 'revision']) {
      const input = snapshotFixture();
      const controller = new RecurringReviewController();
      const context = ctx();
      const view = controller.preview(input, 'plan-1', context);
      if (change === 'profile') input.profileRef = 'profile-2';
      if (change === 'cursor') input.plans[0]!.nextPeriodIndex = 1;
      if (change === 'revision') input.revision = 'snapshot-2';
      expect(() => controller.approveNext(view, input, context)).toThrowError(new RecurringError('STALE_REVIEW'));
    }
  });

  it.each(['epoch', 'operation', 'signal'])('refuses changed operation ownership: %s', change => {
    const input = snapshotFixture();
    const controller = new RecurringReviewController();
    const context = ctx();
    const view = controller.preview(input, 'plan-1', context);
    const changed = { ...context,
      ...(change === 'epoch' ? { sessionEpoch: 2 } : {}),
      ...(change === 'operation' ? { operationId: 'review-2' } : {}),
      ...(change === 'signal' ? { signal: new AbortController().signal } : {}),
    };
    expect(() => controller.approveNext(view, input, changed)).toThrowError(new RecurringError('REVIEW_REVOKED'));
  });

  it('rejects abort, explicit cancellation, or an already locked preview', () => {
    const input = snapshotFixture();
    const controller = new RecurringReviewController();
    const abort = new AbortController();
    const context = { ...ctx(), signal: abort.signal };
    const view = controller.preview(input, 'plan-1', context);
    abort.abort();
    expect(() => controller.approveNext(view, input, context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
    expect(() => controller.preview(input, 'plan-1', context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
    const freshContext = ctx();
    const fresh = controller.preview(input, 'plan-1', freshContext);
    controller.cancel();
    expect(() => controller.approveNext(fresh, input, freshContext)).toThrowError(new RecurringError('REVIEW_REVOKED'));
  });

  it('requires review again after rollback or at the exact deadline, without waiting for timers', () => {
    const input = snapshotFixture();
    const controller = new RecurringReviewController();
    const context = ctx();
    const view = controller.preview(input, 'plan-1', context);
    expect(() => controller.approveNext(view, input, { ...context, nowSeconds: JAN31 - 1 })).toThrowError(new RecurringError('CLOCK'));
    const next = controller.preview(input, 'plan-1', context);
    expect(() => controller.approveNext(next, input, { ...context, nowSeconds: JAN31 + RECURRING_REVIEW_SECONDS }))
      .toThrowError(new RecurringError('REVIEW_EXPIRED'));
    const final = controller.preview(input, 'plan-1', context);
    expect(controller.approveNext(final, input, { ...context, nowSeconds: JAN31 + RECURRING_REVIEW_SECONDS - 1 }).period.index).toBe(0);
  });

  it('does not restore review through serialization, another controller, or a failed replacement', () => {
    const input = snapshotFixture();
    const controller = new RecurringReviewController();
    const context = ctx();
    const view = controller.preview(input, 'plan-1', context);
    expect(() => new RecurringReviewController().approveNext(view, input, context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
    expect(() => controller.approveNext({ ...view }, input, context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
    const renewed = controller.preview(input, 'plan-1', context);
    expect(() => controller.preview({ ...input, unknown: 1 }, 'plan-1', context)).toThrowError(new RecurringError('SCHEMA'));
    expect(() => controller.approveNext(renewed, input, context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
  });

  it('supersedes a prior preview and refuses inactive or not-yet-due plans', () => {
    const input = snapshotFixture();
    const controller = new RecurringReviewController();
    const context = ctx();
    const prior = controller.preview(input, 'plan-1', context);
    controller.preview(input, 'plan-1', context);
    expect(() => controller.approveNext(prior, input, context)).toThrowError(new RecurringError('REVIEW_REVOKED'));
    for (const overrides of [{ status: 'paused' }, { status: 'cancelled' }, { anchorSeconds: JAN31 + 1 }]) {
      const state = snapshotFixture(overrides);
      const view = controller.preview(state, 'plan-1', context);
      expect(() => controller.approveNext(view, state, context)).toThrowError(new RecurringError('NOT_DUE'));
    }
  });
});
