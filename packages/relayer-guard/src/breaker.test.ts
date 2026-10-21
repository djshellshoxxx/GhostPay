import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BreakerOpenError, GuardError } from './errors.js';
import { GuardedBreaker, classifyRelayOutcome, type GuardedBreakerOptions, type Outcome, type RelayResultClass } from './breaker.js';

const OPTS: GuardedBreakerOptions = {
  windowSize: 10,
  minSamples: 5,
  failureRatio: 0.5,
  cooldownMs: 60_000,
  probeTimeoutMs: 30_000,
};

function make(opts: Partial<GuardedBreakerOptions> = {}): { b: GuardedBreaker; clock: { t: number } } {
  const clock = { t: 1_000 };
  return { b: new GuardedBreaker({ ...OPTS, ...opts }, () => clock.t), clock };
}

function failN(b: GuardedBreaker, n: number): void {
  for (let i = 0; i < n; i++) b.tryAcquire()?.settle('failure');
}

describe('GuardedBreaker config', () => {
  it.each<[Partial<GuardedBreakerOptions>]>([
    [{ minSamples: 0 }],
    [{ minSamples: 1.5 }],
    [{ windowSize: 4 }],
    [{ failureRatio: 0 }],
    [{ failureRatio: 1.01 }],
    [{ cooldownMs: 0 }],
    [{ cooldownMs: Number.NaN }],
    [{ probeTimeoutMs: -1 }],
    [{ probeTimeoutMs: Number.POSITIVE_INFINITY }],
  ])('rejects %j', (bad) => {
    expect(() => make(bad)).toThrow(GuardError);
  });

  it('uses the monotonic default clock', () => {
    const b = new GuardedBreaker(OPTS);
    expect(b.state).toBe('closed');
    expect(b.health()).toBe('ok');
  });
});

describe('GuardedBreaker closed state', () => {
  it('admits non-probe permits and opens at the failure ratio after minSamples', () => {
    const { b } = make();
    for (let i = 0; i < 2; i++) b.tryAcquire()?.settle('success');
    failN(b, 2);
    expect(b.state).toBe('closed');
    failN(b, 1); // 3/5 failures
    expect(b.state).toBe('open');
    expect(b.health()).toBe('unhealthy');
    expect(b.tryAcquire()).toBeNull();
  });

  it('never counts neutral outcomes (S3-06: user errors cannot open it)', () => {
    const { b } = make();
    for (let i = 0; i < 1000; i++) b.tryAcquire()?.settle('neutral');
    expect(b.state).toBe('closed');
  });

  it('forgets outcomes beyond the window', () => {
    const { b } = make({ windowSize: 5, minSamples: 5, failureRatio: 0.6 });
    failN(b, 2);
    for (let i = 0; i < 5; i++) b.tryAcquire()?.settle('success');
    failN(b, 2); // window = s,s,s,f,f -> 0.4
    expect(b.state).toBe('closed');
  });

  it('settle is single-use', () => {
    const { b } = make();
    const p = b.tryAcquire();
    expect(p?.probe).toBe(false);
    expect(p?.settle('success')).toBe(true);
    expect(p?.settled).toBe(true);
    expect(p?.settle('failure')).toBe(false);
  });
});

describe('GuardedBreaker half-open (S3-05 regression)', () => {
  function openAndCool(): { b: GuardedBreaker; clock: { t: number } } {
    const m = make();
    m.b.trip();
    m.clock.t += OPTS.cooldownMs;
    return m;
  }

  it('reports degraded once the cooldown elapsed and in half_open, never ok', () => {
    const { b } = openAndCool();
    expect(b.health()).toBe('degraded');
    expect(b.retryAfterMs()).toBe(0);
    const p = b.tryAcquire();
    expect(p?.probe).toBe(true);
    expect(b.state).toBe('half_open');
    expect(b.health()).toBe('degraded');
    expect(b.tryAcquire()).toBeNull(); // only one probe in flight
    expect(b.retryAfterMs()).toBe(0);
  });

  it('a neutral probe (user-class error) frees the slot instead of wedging', () => {
    const { b, clock } = openAndCool();
    b.tryAcquire()?.settle('neutral');
    expect(b.state).toBe('half_open');
    clock.t += 3_600_000;
    const next = b.tryAcquire();
    expect(next?.probe).toBe(true);
    next?.settle('success');
    expect(b.state).toBe('closed');
  });

  it('probe success closes, probe failure re-opens with a fresh cooldown', () => {
    const { b, clock } = openAndCool();
    b.tryAcquire()?.settle('failure');
    expect(b.state).toBe('open');
    expect(b.retryAfterMs()).toBe(OPTS.cooldownMs);
    clock.t += OPTS.cooldownMs - 1;
    expect(b.tryAcquire()).toBeNull();
    clock.t += 1;
    b.tryAcquire()?.settle('success');
    expect(b.state).toBe('closed');
  });

  it('an unsettled probe expires as a failure; its late settlement is ignored', () => {
    const { b, clock } = openAndCool();
    const lost = b.tryAcquire();
    clock.t += OPTS.probeTimeoutMs;
    expect(b.state).toBe('open');
    expect(lost?.settled).toBe(true);
    expect(lost?.settle('success')).toBe(false);
    expect(b.state).toBe('open');
    clock.t += OPTS.cooldownMs;
    expect(b.tryAcquire()?.probe).toBe(true);
  });

  it('stale closed-era permits cannot move a later state', () => {
    const { b } = make();
    const old = b.tryAcquire();
    b.trip();
    expect(old?.settled).toBe(true);
    expect(old?.settle('failure')).toBe(false);
    b.reset();
    expect(b.state).toBe('closed');
  });

  it('property: no sequence of neutral/expired probes leaves it unable to admit after cooldown+timeout', () => {
    const outcome = fc.constantFrom<Outcome | 'drop'>('success', 'failure', 'neutral', 'drop');
    fc.assert(
      fc.property(fc.array(fc.tuple(outcome, fc.integer({ min: 0, max: 200_000 })), { maxLength: 60 }), (steps) => {
        const { b, clock } = make();
        for (const [o, dt] of steps) {
          clock.t += dt;
          const p = b.tryAcquire();
          if (p !== null && o !== 'drop') p.settle(o);
        }
        clock.t += OPTS.cooldownMs + OPTS.probeTimeoutMs + 1;
        clock.t += OPTS.cooldownMs;
        return b.tryAcquire() !== null;
      }),
      { numRuns: 500 },
    );
  });
});

describe('GuardedBreaker.run', () => {
  it('returns the value and settles with the classifier', async () => {
    const { b } = make();
    await expect(b.run(() => Promise.resolve(7), () => 'success')).resolves.toBe(7);
  });

  it('rethrows and classifies errors', async () => {
    const { b } = make({ minSamples: 1, windowSize: 1, failureRatio: 1 });
    await expect(b.run(() => Promise.reject(new Error('rpc')), () => 'failure')).rejects.toThrow('rpc');
    expect(b.state).toBe('open');
    const err = await b.run(() => Promise.resolve(1), () => 'success').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BreakerOpenError);
    expect((err as BreakerOpenError).code).toBe('BREAKER_OPEN');
    expect((err as BreakerOpenError).retryAfterMs).toBe(OPTS.cooldownMs);
  });

  it('settles neutral when the classifier throws (probe slot is freed)', async () => {
    const { b, clock } = make();
    b.trip();
    clock.t += OPTS.cooldownMs;
    const boom = (): Outcome => {
      throw new Error('classifier');
    };
    await expect(b.run(() => Promise.resolve(1), boom)).rejects.toThrow('classifier');
    expect(b.state).toBe('half_open');
    expect(b.tryAcquire()?.probe).toBe(true);
  });
});

describe('classifyRelayOutcome', () => {
  it('maps user-attributable classes to neutral and operational ones to failure', () => {
    const neutral: RelayResultClass[] = [
      'simulation_reverted',
      'invalid_request',
      'nonce_used',
      'quote_invalid',
      'budget_exhausted',
      'gas_price_too_high',
      'gas_limit_too_high',
      'loss_budget_exhausted',
      'mined_revert_state_changed',
    ];
    for (const c of neutral) expect(classifyRelayOutcome(c)).toBe('neutral');
    for (const c of ['rpc_error', 'send_failed', 'receipt_timeout', 'mined_revert_unexplained'] as const) {
      expect(classifyRelayOutcome(c)).toBe('failure');
    }
    expect(classifyRelayOutcome('confirmed')).toBe('success');
  });
});
