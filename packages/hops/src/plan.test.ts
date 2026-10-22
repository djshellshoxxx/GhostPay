import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { defaultHops, fingerprintReport, planHops, previewCost, validatePlan } from './plan.js';
import { H, makePlan, setup, TOKEN } from './helpers.testutil.js';
import { HopError, type HopPlan } from './types.js';

const err = async (p: Promise<unknown> | (() => unknown), code: string): Promise<void> => {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    expect((e as HopError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};
const deps = (env: Awaited<ReturnType<typeof setup>>['env']) => ({ addrs: env.addrs, rng: env.rng, nowMs: () => env.nowMs });

describe('planHops', () => {
  it('builds k legs with exact fee ladder, distinct fresh addresses, full-balance chaining', async () => {
    for (const k of [1, 2, 3, 4] as const) {
      const { plan, env } = await makePlan({ hops: k }, 1_000_000_000n, `s${k}`);
      expect(plan.legs).toHaveLength(k);
      expect(plan.weak).toBe(true);
      expect(plan.legs[0]?.state).toBe('waiting');
      expect(plan.legs.slice(1).every((l) => l.state === 'planned')).toBe(true);
      const addrs = [plan.source, ...plan.legs.map((l) => l.to)];
      expect(new Set(addrs).size).toBe(k + 1);
      let amt = 1_000_000_000n;
      for (const [i, l] of plan.legs.entries()) {
        expect(l.expectedAmountIn).toBe(amt);
        expect(l.expectedFee).toBe((amt * 50n) / 10_000n);
        if (i > 0) expect(l.from).toBe(plan.legs[i - 1]?.to);
        amt -= l.expectedFee;
      }
      expect(env.keys.length).toBe(k + 1);
      validatePlan(plan);
    }
  });

  it('fee floors: 0.50, 0.99, 1.49, 1.98 percent', async () => {
    const expected = [50, 99.75, 149.25, 198.5];
    for (const k of [1, 2, 3, 4] as const) {
      const { plan } = await makePlan({ hops: k }, 10_000_000_000n, `f${k}`);
      expect(previewCost(plan).totalFeeBps).toBeCloseTo(expected[k - 1] as number, 1);
    }
  });

  it('rejects unacked, mainnet, no-permit, bad hops, bad inputs', async () => {
    const { env, input } = await setup();
    await err(planHops({ ...input, ackWeak: false as unknown as true }, deps(env)), 'NOT_ACKED');
    await err(planHops({ ...input, chainId: 1 }, deps(env)), 'MAINNET_FORBIDDEN');
    await err(planHops({ ...input, chainId: 8453 }, deps(env)), 'MAINNET_FORBIDDEN');
    await err(planHops({ ...input, tokenSupportsPermit: false }, deps(env)), 'NO_PERMIT');
    await err(planHops({ ...input, hops: 5 as 4 }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, hops: 0 }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, sourceBalance: 0n }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, source: '0x12' }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, maxTotalFeeBps: -1 }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, delay: { minMs: 5, maxMs: 1, maxTotalMs: 100 } }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, delay: { minMs: H, maxMs: H, maxTotalMs: H } }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, delay: { minMs: 0, maxMs: 1, maxTotalMs: 8 * 24 * H } }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, relayers: [] }, deps(env)), 'INVALID_INPUT');
    await err(planHops({ ...input, quotes: () => Promise.resolve({ fee: -1n, feeTo: TOKEN, expiresAtMs: 0 }) }, deps(env)), 'INVALID_INPUT');
  });

  it('FEE_CAP on total and per-leg, AMOUNT_TOO_SMALL when fee >= amount', async () => {
    const { env, input } = await setup();
    const q = (fee: (n: number) => bigint) => (leg: number) => Promise.resolve({ fee: fee(leg), feeTo: TOKEN, expiresAtMs: 0 });
    // 2 legs at 2.9 % each = ~5.8 % > 500 bps total, each leg under 300 bps
    await err(planHops({ ...input, quotes: q(() => 29_000_000n) }, deps(env)), 'FEE_CAP');
    await err(planHops({ ...input, quotes: q(() => 31_000_000n), maxTotalFeeBps: 10_000 }, deps(env)), 'FEE_CAP');
    await err(planHops({ ...input, quotes: q(() => 1_000_000_000n) }, deps(env)), 'AMOUNT_TOO_SMALL');
    await err(planHops({ ...input, sourceBalance: 5n, quotes: q(() => 5n) }, deps(env)), 'AMOUNT_TOO_SMALL');
  });

  it('external final destination; reuse of source or duplicate rejected', async () => {
    const { env, input } = await setup();
    const ext = '0x00000000000000000000000000000000000e0001' as const;
    const plan = await planHops({ ...input, finalDestination: { kind: 'external', address: ext } }, deps(env));
    expect(plan.legs[1]?.to.toLowerCase()).toBe(ext);
    expect(plan.legs[1]?.toIndex).toBeNull();
    expect(plan.externalDestination).toBe(true);
    expect(previewCost(plan).text.some((t) => t.includes('fresh, never-used'))).toBe(true);
    await err(planHops({ ...input, finalDestination: { kind: 'external', address: input.source } }, deps(env)), 'ADDRESS_REUSE');
    await err(planHops({ ...input, finalDestination: { kind: 'external', address: '0xzz' } }, deps(env)), 'INVALID_INPUT');
  });

  it('ledger reuse and a colliding address source are rejected', async () => {
    const { env, input } = await setup();
    const used = { ...env.addrs, isUsed: () => Promise.resolve(true) };
    await err(planHops(input, { addrs: used, rng: env.rng, nowMs: () => env.nowMs }), 'ADDRESS_REUSE');
    const colliding = { ...env.addrs, next: () => Promise.resolve({ index: 0, address: input.source }) };
    await err(planHops(input, { addrs: colliding, rng: env.rng, nowMs: () => env.nowMs }), 'ADDRESS_REUSE');
    const unused = { ...env.addrs, isUsed: () => Promise.resolve(false) };
    expect((await planHops(input, { addrs: unused, rng: env.rng, nowMs: () => env.nowMs })).legs).toHaveLength(2);
  });

  it('direct only with one hop; rotate never repeats; single relayer warns', async () => {
    const { env, input } = await setup();
    await err(planHops({ ...input, relayerSelection: 'direct' }, deps(env)), 'ILLEGAL_TRANSITION');
    const direct = await planHops({ ...input, relayerSelection: 'direct', hops: 1 }, deps(env));
    expect(direct.legs[0]?.relayerId).toBe('direct');
    for (let i = 0; i < 20; i++) {
      const p = (await makePlan({ hops: 4 }, 1_000_000_000n, `r${i}`)).plan;
      for (let j = 1; j < 4; j++) expect(p.legs[j]?.relayerId).not.toBe(p.legs[j - 1]?.relayerId);
      expect(previewCost(p).text.join(' ')).not.toContain('Only one relayer');
    }
    const one = (await makePlan({ relayers: [{ id: 'a', url: 'x' }] })).plan;
    expect(previewCost(one).text.join(' ')).toContain('Only one relayer');
    const same = (await makePlan({ relayerSelection: 'same' })).plan;
    expect(same.legs[0]?.relayerId).toBe(same.legs[1]?.relayerId);
    expect(previewCost(same).text.join(' ')).toContain('Only one relayer');
  });

  it('delays: per leg within bounds, sum under cap, independent', async () => {
    const ps = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => makePlan({ hops: 4 }, 1_000_000_000n, `d${i}`)));
    const all = ps.flatMap((x) => x.plan.legs.map((l) => l.delayMs));
    expect(all.every((d) => d >= 600_000 && d <= 12 * H)).toBe(true);
    expect(new Set(all).size).toBeGreaterThan(20);
    for (const { plan } of ps) expect(plan.legs.reduce((a, l) => a + l.delayMs, 0)).toBeLessThanOrEqual(7 * 24 * H);
    const last = ps[0]?.plan.legs[3];
    expect(last?.dueAtMs).toBe((ps[0]?.plan.createdAtMs ?? 0) + (ps[0]?.plan.legs.reduce((a, l) => a + l.delayMs, 0) ?? 0));
  });

  it('property: ladder invariants for random balances/hops', async () => {
    await fc.assert(
      fc.asyncProperty(fc.bigInt({ min: 10_000n, max: 10n ** 24n }), fc.integer({ min: 1, max: 4 }), async (bal, k) => {
        const { plan } = await makePlan({ hops: k as 1 | 2 | 3 | 4 }, bal, `p${bal}${k}`);
        validatePlan(plan);
        const r = fingerprintReport(plan);
        expect(r.ladder[0]).toBe(bal);
        expect(r.candidateRange.min <= bal && bal <= r.candidateRange.max).toBe(true);
      }),
      { numRuns: 25 },
    );
  });
});

describe('validatePlan', () => {
  it('detects residue, consolidation, bad index, bad fee, unacked, mainnet', async () => {
    const { plan } = await makePlan({ hops: 3 });
    const mut = (f: (p: HopPlan) => HopPlan, code: string) => {
      expect(() => validatePlan(f(plan))).toThrowError(expect.objectContaining({ code }) as Error);
    };
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 1 ? { ...l, expectedAmountIn: l.expectedAmountIn - 1n } : l)) }), 'CONSOLIDATION');
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 2 ? { ...l, from: p.source } : l)) }), 'CONSOLIDATION');
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 1 ? { ...l, to: p.legs[0]?.to as never } : l)) }), 'ADDRESS_REUSE');
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 1 ? { ...l, index: 7 } : l)) }), 'INVALID_INPUT');
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 0 ? { ...l, expectedFee: l.expectedAmountIn } : l)) }), 'AMOUNT_TOO_SMALL');
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 0 ? { ...l, expectedFee: l.expectedAmountIn / 10n } : l)) }), 'FEE_CAP');
    mut((p) => ({ ...p, ackWeakAtMs: 0 }), 'NOT_ACKED');
    mut((p) => ({ ...p, chainId: 1 }), 'MAINNET_FORBIDDEN');
    mut((p) => ({ ...p, relayerSelection: 'direct' }), 'ILLEGAL_TRANSITION');
    mut((p) => ({ ...p, legs: [] }), 'INVALID_INPUT');
    mut((p) => ({ ...p, legs: [...p.legs, ...p.legs] }), 'INVALID_INPUT');
    mut((p) => ({ ...p, legs: p.legs.map((l, i) => (i === 0 ? { ...l, relayerId: 'direct' } : l)) }), 'INVALID_INPUT');
  });
});

describe('pool handoff planning', () => {
  it('defaults', () => {
    expect(defaultHops('pool-exit')).toBe(0);
    expect(defaultHops('none')).toBe(2);
  });
  it('zero hops allowed with pool-exit, >2 and post-exit rejected', async () => {
    const { env, input } = await setup();
    const p0 = await planHops({ ...input, hops: 0, handoff: 'pool-exit' }, deps(env));
    expect(p0.legs).toHaveLength(0);
    expect(previewCost(p0).text.join(' ')).toContain('add no privacy');
    expect(fingerprintReport(p0).ladder).toHaveLength(0);
    await err(planHops({ ...input, hops: 3, handoff: 'pool-exit' }, deps(env)), 'HANDOFF_REJECTED');
    await err(planHops({ ...input, stage: 'post-exit' }, deps(env)), 'HANDOFF_REJECTED');
    expect((await planHops({ ...input, hops: 2, handoff: 'pool-exit' }, deps(env))).legs).toHaveLength(2);
  });
});

describe('fingerprintReport', () => {
  it('exact ladder and conservative candidate range', async () => {
    const { plan } = await makePlan({ hops: 2 }, 1_000_000n);
    const r = fingerprintReport(plan);
    expect(r.ladder).toEqual([1_000_000n, 995_000n, 990_025n]);
    expect(r.candidateRange.min).toBeLessThanOrEqual(1_000_000n);
    expect(r.candidateRange.max).toBeGreaterThanOrEqual(1_000_000n);
    expect(r.candidateRange.count).toBe(r.candidateRange.max - r.candidateRange.min + 1n);
    expect(r.spreadPercent).toBeGreaterThan(4);
    expect(r.spreadPercent).toBeLessThan(7);
  });
  it('previewCost shows single sweep next to total', async () => {
    const { plan } = await makePlan({ hops: 3 });
    const p = previewCost(plan);
    expect(p.singleSweepFeeBps).toBe(50);
    expect(p.perLeg).toHaveLength(3);
    expect(p.text.some((t) => t.startsWith('One plain sweep to a fresh address costs'))).toBe(true);
    expect(p.delayRangeMs).toEqual([3 * 600_000, 3 * 12 * H]);
  });
  it('guards chain', async () => {
    const { plan } = await makePlan();
    expect(() => previewCost({ ...plan, chainId: 1 })).toThrow();
    expect(() => fingerprintReport({ ...plan, chainId: 1 })).toThrow();
  });
});
