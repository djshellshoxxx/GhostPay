import { describe, expect, it } from 'vitest';
import { blindStartCandidates, traceForward } from './follower.testutil.js';
import { H, makePlan, runAll, setup, TOKEN } from './helpers.testutil.js';
import { planHops } from './plan.js';
import { seededRng } from './stub.testutil.js';
import { randomDelayMs } from './rand.js';

describe('AT-HOP-NEG-1: an analyst follows every hop (negative PoC)', () => {
  it('recovers D for 100 % of 200 randomized single-user plans in <= k steps', async () => {
    const r = seededRng('neg');
    let recovered = 0;
    for (let i = 0; i < 200; i++) {
      const k = (1 + randomDelayMs(0, 3, r)) as 1 | 2 | 3 | 4;
      const balance = BigInt(1_000_000 + randomDelayMs(0, 2_000_000_000, r));
      const { env, plan } = await makePlan({ hops: k }, balance, `neg${i}`);
      const done = await runAll(env, plan);
      const D = done.legs[k - 1]?.to;
      const t = traceForward(env.ledger, TOKEN, plan.source, balance, plan.createdAtMs, 7 * 24 * H);
      expect(t.ambiguous).toBe(false);
      expect(t.steps).toBeLessThanOrEqual(k);
      if (t.end === D) recovered++;
      expect(t.path).toEqual([plan.source, ...done.legs.map((l) => l.to)]);
    }
    expect(recovered).toBe(200);
  }, 120_000);

  it('crowd: a tracer that knows S1 is unaffected by c concurrent plans; amount-only tracer degrades as 1/c (informational)', async () => {
    const report: string[] = [];
    for (const c of [1, 5, 20]) {
      const { env } = await setup(1n);
      const balance = 1_000_000_000n;
      const plans = [];
      for (let i = 0; i < c; i++) {
        const s = await env.addrs.next();
        env.fund(TOKEN, s.address, balance);
        const p = await planHops(
          { ...(await setup(balance, {}, `x${c}${i}`)).input, source: s.address, sourceIndex: s.index, hops: 2,
            quotes: (_l, a) => env.relayer.quote('a', { chainId: 31337, token: TOKEN, amount: String(a) }) },
          { addrs: env.addrs, rng: env.rng, nowMs: () => env.nowMs },
        );
        plans.push(p);
      }
      let ok = 0;
      for (const p of plans) {
        const done = await (await import('./helpers.testutil.js')).runAll(env, p);
        const t = traceForward(env.ledger, TOKEN, p.source, balance, p.createdAtMs, 7 * 24 * H);
        if (t.end === done.legs[1]?.to && !t.ambiguous) ok++;
      }
      expect(ok).toBe(c); // known-start accuracy is 100 % for every c
      const cand = blindStartCandidates(env.ledger, TOKEN, balance);
      expect(cand).toBe(c);
      report.push(`c=${c}: known-start 100 %, amount-only guess ${(100 / cand).toFixed(1)} %`);
      if (c === 1) expect(100 / cand).toBe(100);
    }
    expect(report).toHaveLength(3);
  }, 120_000);

  it('tracer tolerates fee spread (0.5 %..3 %) and rejects out-of-window/foreign transfers', () => {
    const a = '0x00000000000000000000000000000000000000a1' as const;
    const b = '0x00000000000000000000000000000000000000b2' as const;
    const c = '0x00000000000000000000000000000000000000c3' as const;
    const base = { token: TOKEN, from: a, to: b, amount: 970_000n, timeMs: 10 };
    const l = [base, { token: TOKEN, from: b, to: c, amount: 960_000n, timeMs: 20 }];
    expect(traceForward(l, TOKEN, a, 1_000_000n, 0, 100).end).toBe(c);
    expect(traceForward(l, TOKEN, a, 1_000_000n, 0, 15).end).toBe(b); // outside window
    expect(traceForward([{ ...base, amount: 900_000n }], TOKEN, a, 1_000_000n, 0, 100).end).toBe(a); // fee > 3 %
    expect(traceForward([{ ...base, token: c }], TOKEN, a, 1_000_000n, 0, 100).steps).toBe(0);
    const amb = [base, { ...base, to: c, amount: 980_000n }];
    expect(traceForward(amb, TOKEN, a, 1_000_000n, 0, 100).ambiguous).toBe(true);
  });
});
