import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { solveQuestion } from './challenge.testutil.js';
import {
  createChallengeService,
  MemoryAttemptLimiter,
  MemoryReplayStore,
  ReplayStoreFullError,
} from './challenge.js';

const SECRET = new Uint8Array(32).fill(9);

function seeded(seed: number): (n: number) => Uint8Array {
  let i = 0;
  return (n) => createHash('sha256').update(`${seed}:${i++}`).digest().subarray(0, n);
}

function answerFor(question: string): string {
  return solveQuestion(question);
}

describe('M-1: challenge stores cannot be filled by one client', () => {
  it('a victim in another partition still verifies after an attacker fails 10_000 tokens', async () => {
    const clock = { t: 1_000_000 };
    const svc = createChallengeService({ secrets: [SECRET], now: () => clock.t, randomBytes: seeded(1) });
    for (let i = 0; i < 10_000; i++) {
      const c = svc.issue('ctx');
      await svc.verify({ token: c.token, answer: 'definitely-wrong', context: 'ctx', partition: 'attacker' });
    }
    const v = svc.issue('ctx');
    const r = await svc.verify({
      token: v.token,
      answer: answerFor(v.question),
      context: 'ctx',
      partition: 'victim',
    });
    expect(r).toEqual({ ok: true });
  });

  it('a victim is served by evicting from the largest partition when the table is globally full', () => {
    const clock = { t: 1_000_000 };
    const attempts = new MemoryAttemptLimiter({ maxEntries: 16, maxPerPartition: 4, now: () => clock.t });
    for (let p = 0; p < 4; p++)
      for (let i = 0; i < 4; i++) attempts.increment(`a${p}-${i}`, 2_000_000, `p${p}`);
    expect(attempts.increment('victim', 2_000_000, 'victim')).toBe(1);
    expect(attempts.increment('victim', 2_000_000, 'victim')).toBe(2);
  });

  it('the attempt limiter fails closed only for the over-quota partition', () => {
    const attempts = new MemoryAttemptLimiter({ maxEntries: 100, maxPerPartition: 3, now: () => 1 });
    for (let i = 0; i < 3; i++) expect(attempts.increment(`x${i}`, 99, 'bad')).toBe(1);
    expect(attempts.increment('x3', 99, 'bad')).toBe(Number.POSITIVE_INFINITY);
    expect(attempts.increment('y0', 99, 'good')).toBe(1);
  });

  it('the replay store never evicts a live entry: replay stays impossible under pressure', () => {
    const store = new MemoryReplayStore({ maxEntries: 8, maxPerPartition: 2, now: () => 1 });
    expect(store.markUsed('solved', 99, 'a')).toBe(true);
    expect(store.markUsed('s2', 99, 'a')).toBe(true);
    expect(() => store.markUsed('s3', 99, 'a')).toThrow(ReplayStoreFullError);
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < 2; i++) store.markUsed(`o${p}${i}`, 99, `p${p}`);
    }
    expect(() => store.markUsed('late', 99, 'q')).toThrow(ReplayStoreFullError);
    expect(store.markUsed('solved', 99, 'a')).toBe(false);
    expect(store.markUsed('solved', 99, 'zzz')).toBe(false);
  });

  it('expiry frees slots without an O(n) scan per insert (L-7)', () => {
    const clock = { t: 0 };
    const store = new MemoryReplayStore({ maxEntries: 5, now: () => clock.t });
    for (let i = 0; i < 5; i++) store.markUsed(`k${i}`, 10 + i);
    clock.t = 12; // k0..k2 expired, in insertion order
    expect(store.markUsed('n1', 100)).toBe(true);
    expect(store.size).toBe(3);
    // Out-of-order expiry (an early-expiring entry behind a late one) is reclaimed by the throttled scan.
    const s2 = new MemoryReplayStore({ maxEntries: 2, now: () => clock.t });
    s2.markUsed('late', 1000);
    s2.markUsed('early', 13);
    clock.t = 20;
    expect(s2.markUsed('n', 2000)).toBe(true);
  });

  it('rejects a bad maxPerPartition and a bad partition value', async () => {
    expect(() => new MemoryReplayStore({ maxPerPartition: 0 })).toThrow();
    const svc = createChallengeService({ secrets: [SECRET], randomBytes: seeded(2) });
    const c = svc.issue('ctx');
    expect(await svc.verify({ token: c.token, answer: '1', context: 'ctx', partition: 5 })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(await svc.verify({ token: c.token, answer: '1', context: 'ctx', partition: '' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
