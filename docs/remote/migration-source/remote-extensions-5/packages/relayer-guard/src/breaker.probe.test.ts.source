import { describe, expect, it } from 'vitest';
import { GuardError } from './errors.js';
import { GuardedBreaker, type GuardedBreakerOptions } from './breaker.js';

const OPTS: GuardedBreakerOptions = {
  windowSize: 10,
  minSamples: 5,
  failureRatio: 0.5,
  cooldownMs: 60_000,
  probeTimeoutMs: 30_000,
};

function halfOpen(extra: Partial<GuardedBreakerOptions> = {}): { b: GuardedBreaker; clock: { t: number } } {
  const clock = { t: 1_000 };
  const b = new GuardedBreaker({ ...OPTS, ...extra }, () => clock.t);
  b.trip();
  clock.t += OPTS.cooldownMs;
  return { b, clock };
}

describe('M-4: neutral outcomes cannot starve the half-open probe', () => {
  it('PoC block 4: an attacker looping acquire/neutral does not stop an honest validated probe closing the breaker', () => {
    const { b } = halfOpen();
    let attackerWins = 0;
    for (let i = 0; i < 50; i++) {
      const p = b.tryAcquire({ validated: false });
      if (p !== null) {
        attackerWins++;
        p.settle('neutral');
      }
    }
    expect(attackerWins).toBe(0); // unvalidated callers never consume the slot
    const honest = b.tryAcquire({ validated: true });
    expect(honest?.probe).toBe(true);
    expect(honest?.settle('success')).toBe(true);
    expect(b.state).toBe('closed');
  });

  it('legacy callers (no options) are bounded: after maxNeutralProbes only validated callers get the probe', () => {
    const { b } = halfOpen({ maxNeutralProbes: 3 });
    for (let i = 0; i < 3; i++) b.tryAcquire()?.settle('neutral');
    expect(b.tryAcquire()).toBeNull();
    expect(b.tryAcquire({ validated: false })).toBeNull();
    const honest = b.tryAcquire({ validated: true });
    expect(honest?.probe).toBe(true);
    honest?.settle('success');
    expect(b.state).toBe('closed');
  });

  it('a validated neutral probe still frees the slot (never-wedge) but counts toward the bound', () => {
    const { b } = halfOpen({ maxNeutralProbes: 2 });
    b.tryAcquire({ validated: true })?.settle('neutral');
    b.tryAcquire({ validated: true })?.settle('neutral');
    expect(b.state).toBe('half_open');
    expect(b.tryAcquire({ validated: true })?.probe).toBe(true);
  });

  it('the neutral counter resets on every new half-open episode', () => {
    const { b, clock } = halfOpen({ maxNeutralProbes: 1 });
    b.tryAcquire()?.settle('neutral');
    expect(b.tryAcquire()).toBeNull();
    b.tryAcquire({ validated: true })?.settle('failure'); // re-opens
    clock.t += OPTS.cooldownMs;
    expect(b.tryAcquire()?.probe).toBe(true);
  });

  it('retryAfterMs has a nonzero floor while a probe is in flight, and none when idle', () => {
    const { b } = halfOpen();
    expect(b.retryAfterMs()).toBe(0);
    const p = b.tryAcquire()!;
    expect(b.retryAfterMs()).toBeGreaterThan(0);
    p.settle('neutral');
    expect(b.retryAfterMs()).toBe(0);
  });

  it('validated:false in closed state is admitted as before', () => {
    const b = new GuardedBreaker(OPTS, () => 0);
    expect(b.tryAcquire({ validated: false })?.probe).toBe(false);
  });

  it('validates maxNeutralProbes', () => {
    expect(() => new GuardedBreaker({ ...OPTS, maxNeutralProbes: 0 })).toThrow(GuardError);
    expect(() => new GuardedBreaker({ ...OPTS, maxNeutralProbes: 1.5 })).toThrow(GuardError);
  });
});
