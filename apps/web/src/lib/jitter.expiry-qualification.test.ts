import { describe, expect, it } from 'vitest';
import { DelayScheduler, type SchedulerDeps } from './jitter';

// Independent, test-only follow-up to PR #274. No network, wallet or timer
// dependencies are touched; the scheduler receives deterministic injected clocks.
function clocks() {
  const state = { monotonicMs: 0, wallSeconds: 1000, cleared: [] as unknown[] };
  const deps: SchedulerDeps = {
    monotonicNow: () => state.monotonicMs,
    wallNowSeconds: () => state.wallSeconds,
    setInterval: () => 'timer',
    clearInterval: (handle) => { state.cleared.push(handle); },
  };
  return { state, deps };
}

describe('invoice-expiry rollback qualification (PR #274)', () => {
  it('does not expire before the monotonic floor actually crosses the boundary', () => {
    const { state, deps } = clocks();
    const scheduler = new DelayScheduler(5000, 1002, deps);
    state.wallSeconds = 900;
    state.monotonicMs = 1999;
    expect(scheduler.check()).toEqual({ status: 'waiting', remainingMs: 3001 });
    expect(state.cleared).toEqual([]);
    state.monotonicMs = 2000;
    expect(scheduler.check()).toEqual({ status: 'expired', remainingMs: 0 });
    expect(state.cleared).toEqual(['timer']);
  });

  it('Send now cannot bypass an elapsed expiry deadline after a wall-clock rollback', () => {
    const { state, deps } = clocks();
    const scheduler = new DelayScheduler(5000, 1002, deps);
    state.wallSeconds = 900;
    state.monotonicMs = 2000;
    scheduler.sendNow();
    expect(scheduler.snapshot()).toEqual({ status: 'expired', remainingMs: 0 });
    expect(state.cleared).toEqual(['timer']);
  });

  it('prioritizes expiry over delay readiness on a simultaneous deadline', () => {
    const { state, deps } = clocks();
    const scheduler = new DelayScheduler(2000, 1002, deps);
    state.wallSeconds = 900;
    state.monotonicMs = 2000;
    expect(scheduler.check()).toEqual({ status: 'expired', remainingMs: 0 });
    expect(state.cleared).toEqual(['timer']);
  });

  it('expires on an explicitly observed forward wall-clock jump', () => {
    const { state, deps } = clocks();
    const scheduler = new DelayScheduler(5000, 1002, deps);
    state.wallSeconds = 1003;
    expect(scheduler.check()).toEqual({ status: 'expired', remainingMs: 0 });
    expect(state.cleared).toEqual(['timer']);
  });

  it('fails closed for nonfinite clock samples while waiting', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const { state, deps } = clocks();
      const scheduler = new DelayScheduler(5000, 1002, deps);
      state.wallSeconds = bad;
      expect(scheduler.check()).toEqual({ status: 'expired', remainingMs: 0 });
      expect(state.cleared).toEqual(['timer']);
    }
    const { state, deps } = clocks();
    const scheduler = new DelayScheduler(5000, 1002, deps);
    state.monotonicMs = Number.NaN;
    expect(scheduler.check()).toEqual({ status: 'expired', remainingMs: 0 });
    expect(state.cleared).toEqual(['timer']);
  });

  it('does not re-open a terminal expired or cancelled schedule', () => {
    const expiredClocks = clocks();
    const expired = new DelayScheduler(5000, 1002, expiredClocks.deps);
    expiredClocks.state.monotonicMs = 2500;
    expiredClocks.state.wallSeconds = 900;
    expect(expired.check().status).toBe('expired');
    expiredClocks.state.wallSeconds = 1000;
    expiredClocks.state.monotonicMs = 0;
    expired.sendNow();
    expect(expired.snapshot().status).toBe('expired');

    const cancelledClocks = clocks();
    const cancelled = new DelayScheduler(5000, 1002, cancelledClocks.deps);
    cancelled.cancel();
    cancelledClocks.state.monotonicMs = 5000;
    cancelled.sendNow();
    expect(cancelled.snapshot().status).toBe('cancelled');
  });
});
