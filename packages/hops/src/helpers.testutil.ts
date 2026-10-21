import { getAddress } from 'viem/utils';
import { SimEnv } from './stub.testutil.js';
import { planHops } from './plan.js';
import type { Address, HopPlan, HopPlanInput } from './types.js';

export const TOKEN: Address = getAddress('0x00000000000000000000000000000000000abc01');
export const H = 3_600_000;
export const DELAY = { minMs: 600_000, maxMs: 12 * H, maxTotalMs: 7 * 24 * H };

/** Env + S1 funded with `balance`, plus a ready input. */
export async function setup(balance = 1_000_000_000n, over: Partial<HopPlanInput> = {}, seed = 'sim') {
  const env = new SimEnv(seed);
  const s1 = await env.addrs.next();
  env.fund(TOKEN, s1.address, balance);
  const input: HopPlanInput = {
    chainId: 31337,
    token: TOKEN,
    source: s1.address,
    sourceIndex: s1.index,
    sourceBalance: balance,
    hops: 2,
    delay: DELAY,
    finalDestination: { kind: 'self-derived' },
    relayers: [{ id: 'a', url: 'http://a' }, { id: 'b', url: 'http://b' }],
    relayerSelection: 'rotate',
    quotes: (_leg, amountIn) => env.relayer.quote('a', { chainId: 31337, token: TOKEN, amount: String(amountIn) }),
    maxTotalFeeBps: 500,
    ackWeak: true,
    handoff: 'none',
    tokenSupportsPermit: true,
    ...over,
  };
  return { env, s1, input };
}

export async function makePlan(over: Partial<HopPlanInput> = {}, balance = 1_000_000_000n, seed = 'sim'): Promise<{ env: SimEnv; plan: HopPlan; input: HopPlanInput }> {
  const { env, input } = await setup(balance, over, seed);
  const plan = await planHops(input, { addrs: env.addrs, rng: env.rng, nowMs: () => env.nowMs });
  return { env, plan, input };
}

/** Runs every leg to confirmation: advance clock, run, mark confirmed via resume. */
export async function runAll(env: SimEnv, plan: HopPlan): Promise<HopPlan> {
  const { runHopLeg, resumeLeg } = await import('./execute.js');
  let p = plan;
  for (let i = 0; i < p.legs.length; i++) {
    const leg = p.legs[i];
    if (leg === undefined) break;
    env.nowMs = Math.max(env.nowMs, leg.dueAtMs);
    p = await runHopLeg(p, i, env.deps());
    p = await resumeLeg(p, i, env.deps());
  }
  return p;
}
