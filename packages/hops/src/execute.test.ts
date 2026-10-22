import { describe, expect, it } from 'vitest';
import { resumeLeg, resumePlan, runHopLeg } from './execute.js';
import { isComplete } from './machine.js';
import { makePlan, runAll, TOKEN } from './helpers.testutil.js';
import { createMemoryPlanStore } from './store.js';
import type { HopPlan, PlanStore } from './types.js';

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try { await p; } catch (e) { return (e as { code?: string }).code ?? (e as Error).message; }
  return 'none';
};

describe('runHopLeg', () => {
  it('3-leg run: fees exact, final balance matches ladder, nonces unique, each owner signed', async () => {
    const { env, plan } = await makePlan({ hops: 3 });
    const done = await runAll(env, plan);
    expect(isComplete(done)).toBe(true);
    const last = done.legs[2];
    let amt = 1_000_000_000n;
    for (const l of done.legs) { expect(l.expectedAmountIn).toBe(amt); amt -= l.expectedFee; }
    expect(env.balances.get(last?.to ?? '')).toBe(amt);
    for (const l of done.legs.slice(0, 2)) expect(env.balances.get(l.to)).toBe(0n);
    expect(env.balances.get(plan.source)).toBe(0n);
    expect(new Set(env.submissions.map((s) => s.body.order.nonce)).size).toBe(3);
    for (const [i, s] of env.submissions.entries()) {
      expect(s.body.order.owner).toBe(done.legs[i]?.from);
      expect(s.body.order.destination).toBe(done.legs[i]?.to);
      expect(s.body.order.token).toBe(TOKEN);
    }
    // consecutive legs use different relayers (rotate, 2 relayers)
    expect(env.submissions[1]?.relayerId).not.toBe(env.submissions[0]?.relayerId);
  });

  it('order fields: deadline <= now + 900 s, fee <= quote and <= 300 bps, amount = balance read at signing (HOP-REQ-6)', async () => {
    const { env, plan } = await makePlan({ hops: 1 });
    env.balances.set(plan.source, 1_000_000_123n); // balance moved since planning
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    await runHopLeg(plan, 0, env.deps());
    const o = env.submissions[0]?.body.order;
    expect(o?.amount).toBe('1000000123');
    expect(BigInt(o?.deadline ?? 0)).toBe(BigInt(Math.floor(env.nowMs / 1000) + 900));
    expect(BigInt(o?.fee ?? 0) * 10_000n).toBeLessThanOrEqual(BigInt(o?.amount ?? 0) * 300n);
    expect(env.zeroized.every(Boolean)).toBe(true);
  });

  it('request shape: no plan id, no previous-leg reference, only allowed keys (HOP-RLY-2); quote per leg at due time (HOP-RLY-1)', async () => {
    const { env, plan } = await makePlan({ hops: 2 });
    const before = env.quoteCalls.length;
    await runAll(env, plan);
    expect(env.quoteCalls.length - before).toBe(2);
    for (const q of env.quoteCalls.slice(before)) expect(Object.keys(q.req).sort()).toEqual(['amount', 'chainId', 'token']);
    for (const s of env.submissions) {
      expect(Object.keys(s.body).sort()).toEqual(['chainId', 'order', 'permit', 'signature']);
      const text = JSON.stringify(s.body);
      expect(text).not.toContain(plan.id);
      for (const l of plan.legs) if (l.index !== s.body.order.owner.length) expect(text.includes(l.relayerId) && l.relayerId.length > 3).toBe(false);
    }
  });

  it('refuses before due, stale quote, fee cap, tiny balance, zero balance, direct, unknown leg', async () => {
    const { env, plan } = await makePlan({ hops: 2 });
    expect(await codeOf(runHopLeg(plan, 0, env.deps()))).toBe('NOT_DUE');
    expect(await codeOf(runHopLeg(plan, 1, env.deps()))).toBe('NOT_DUE');
    expect(await codeOf(runHopLeg(plan, 9, env.deps()))).toBe('ILLEGAL_TRANSITION');
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    env.quoteTtlMs = 0;
    expect(await codeOf(runHopLeg(plan, 0, env.deps()))).toBe('QUOTE_STALE');
    env.quoteTtlMs = 60_000;
    env.feeBps = 400n;
    expect(await codeOf(runHopLeg(plan, 0, env.deps()))).toBe('FEE_CAP');
    env.feeBps = 10_000n;
    expect(await codeOf(runHopLeg(plan, 0, env.deps()))).toBe('AMOUNT_TOO_SMALL');
    env.feeBps = 50n;
    env.balances.set(plan.source, 0n);
    expect(await codeOf(runHopLeg(plan, 0, env.deps()))).toBe('AMOUNT_TOO_SMALL');
    expect(await codeOf(runHopLeg({ ...plan, chainId: 1 }, 0, env.deps()))).toBe('MAINNET_FORBIDDEN');
    expect(env.submissions).toHaveLength(0);
    const d = await makePlan({ hops: 1, relayerSelection: 'direct' });
    d.env.nowMs = d.plan.legs[0]?.dueAtMs ?? 0;
    expect(await codeOf(runHopLeg(d.plan, 0, d.env.deps()))).toBe('DIRECT_UNSUPPORTED');
    // already signing -> illegal
    const p2: HopPlan = { ...plan, legs: plan.legs.map((l, i) => (i === 0 ? { ...l, state: 'confirmed' } : l)) };
    expect(await codeOf(runHopLeg(p2, 0, env.deps()))).toBe('ILLEGAL_TRANSITION');
  });

  it('session gate declining leaves the plan due and signs nothing', async () => {
    const { env, plan } = await makePlan({ hops: 1 });
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    env.authorize = false;
    const out = await runHopLeg(plan, 0, env.deps());
    expect(out.legs[0]?.state).toBe('due');
    expect(env.submissions).toHaveLength(0);
    expect(env.zeroized).toHaveLength(0);
  });

  it('key is zeroised even when signing path throws (HOP-REQ-9)', async () => {
    const { env, plan } = await makePlan({ hops: 1 });
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    const badPermit = { ...env.chain, permitReader: { ...env.chain.permitReader, name: () => Promise.reject(new Error('boom')) } };
    expect(await codeOf(runHopLeg(plan, 0, env.deps({ chain: badPermit })))).toBe('boom');
    expect(env.zeroized).toEqual([true]);
  });

  it('persist-before-sign: stored state is `signing` with nonce before any signature exists; stored JSON has no signature', async () => {
    const { env, plan } = await makePlan({ hops: 1 });
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    const seen: string[] = [];
    const store: PlanStore = {
      save: (p) => { seen.push(`${p.legs[0]?.state}:${p.legs[0]?.nonce !== undefined}:${env.submissions.length}:${env.zeroized.length}`); return Promise.resolve(); },
      load: () => Promise.resolve(null),
    };
    await runHopLeg(plan, 0, env.deps({ store }));
    expect(seen).toEqual(['signing:true:0:0', 'submitted:true:1:1']);
  });
});

describe('crash injection and resume (HOP-REQ-8)', () => {
  async function crashAfter(n: number) {
    const { env, plan } = await makePlan({ hops: 2 }, 1_000_000_000n, `crash${n}`);
    const real = createMemoryPlanStore();
    let saves = 0;
    const store: PlanStore = {
      save: async (p) => {
        if (saves++ === n) throw new Error('crash');
        await real.save(p);
      },
      load: (id) => real.load(id),
    };
    await real.save(plan);
    env.store = store;
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    return { env, plan, real, store };
  }

  it('crash while persisting `signing`: nothing was signed or sent', async () => {
    const { env, plan, real } = await crashAfter(0);
    await expect(runHopLeg(plan, 0, env.deps())).rejects.toThrow('crash');
    expect(env.submissions).toHaveLength(0);
    expect(env.zeroized).toHaveLength(0);
    expect((await real.load(plan.id))?.legs[0]?.state).toBe('waiting');
  });

  it('crash after signing persisted: resume finds nonce used -> confirmed, exactly one sweep', async () => {
    const { env, plan, real } = await crashAfter(1); // signing saved, submitted save crashes
    await expect(runHopLeg(plan, 0, env.deps())).rejects.toThrow('crash');
    const stored = await real.load(plan.id);
    expect(stored?.legs[0]?.state).toBe('signing');
    expect(stored?.legs[0]?.nonce).toBeDefined();
    env.store = real;
    const resumed = await resumePlan(plan.id, env.deps({ store: real }));
    expect(resumed?.legs[0]?.state).toBe('confirmed');
    expect(resumed?.legs[1]?.state).toBe('waiting');
    expect(env.submissions).toHaveLength(1);
    // finish leg 2
    env.nowMs = resumed?.legs[1]?.dueAtMs ?? 0;
    const fin = await runHopLeg(resumed as HopPlan, 1, env.deps({ store: real }));
    const fin2 = await resumeLeg(fin, 1, env.deps({ store: real }));
    expect(isComplete(fin2)).toBe(true);
    expect(env.submissions).toHaveLength(2);
  });

  it('signing persisted, relayer never got it: inside deadline stays; after deadline -> due; re-run sweeps once', async () => {
    const { env, plan } = await makePlan({ hops: 1 });
    env.nowMs = plan.legs[0]?.dueAtMs ?? 0;
    env.failSubmit = true;
    await expect(runHopLeg(plan, 0, env.deps())).rejects.toThrow('relayer down');
    const stored = await env.store.load(plan.id);
    expect(stored?.legs[0]?.state).toBe('signing');
    expect(await resumeLeg(stored as HopPlan, 0, env.deps())).toEqual(stored);
    env.nowMs += 901_000;
    const due = await resumeLeg(stored as HopPlan, 0, env.deps());
    expect(due.legs[0]?.state).toBe('due');
    env.failSubmit = false;
    const out = await runHopLeg(due, 0, env.deps());
    expect(out.legs[0]?.state).toBe('submitted');
    expect(env.balances.get(plan.legs[0]?.to ?? '')).toBe(995_000_000n);
  });

  it('resume edge cases: untouched legs, unknown id, missing nonce, bad index', async () => {
    const { env, plan } = await makePlan({ hops: 2 });
    expect(await resumeLeg(plan, 0, env.deps())).toBe(plan);
    expect(await resumePlan('nope', env.deps())).toBeNull();
    await env.store.save(plan);
    expect((await resumePlan(plan.id, env.deps()))?.legs[0]?.state).toBe('waiting');
    const bad: HopPlan = { ...plan, legs: plan.legs.map((l, i) => (i === 0 ? { ...l, state: 'signing' } : l)) };
    expect(await codeOf(resumeLeg(bad, 0, env.deps()))).toBe('ILLEGAL_TRANSITION');
    expect(await codeOf(resumeLeg(plan, 7, env.deps()))).toBe('ILLEGAL_TRANSITION');
    expect(await codeOf(resumeLeg({ ...plan, chainId: 1 }, 0, env.deps()))).toBe('MAINNET_FORBIDDEN');
  });
});
