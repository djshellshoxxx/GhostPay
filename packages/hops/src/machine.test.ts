import { describe, expect, it } from 'vitest';
import { isComplete, overdueLegs, reduce } from './machine.js';
import { H, makePlan } from './helpers.testutil.js';
import { HopError, type HopEvent, type HopPlan } from './types.js';

const code = (f: () => unknown): string => {
  try { f(); } catch (e) { return (e as HopError).code; }
  return 'none';
};
const TX = `0x${'ab'.repeat(32)}` as const;

async function plan3(): Promise<HopPlan> {
  return (await makePlan({ hops: 3 })).plan;
}
const due = (p: HopPlan, i = 0): HopPlan => reduce(p, { type: 'tick', nowMs: (p.legs[i]?.dueAtMs ?? 0) + 1 });

describe('reduce', () => {
  it('happy path to confirmed; next leg due = confirmedAt + its delay', async () => {
    let p = due(await plan3());
    expect(p.legs[0]?.state).toBe('due');
    p = reduce(p, { type: 'beginSigning', leg: 0, nonce: 5n, deadlineS: 99n });
    p = reduce(p, { type: 'submitted', leg: 0, txHash: TX });
    p = reduce(p, { type: 'confirmed', leg: 0, nowMs: 1000 });
    expect(p.legs[0]?.state).toBe('confirmed');
    expect(p.legs[1]?.state).toBe('waiting');
    expect(p.legs[1]?.dueAtMs).toBe(1000 + (p.legs[1]?.delayMs ?? 0));
    expect(p.legs[2]?.state).toBe('planned');
    expect(isComplete(p)).toBe(false);
  });
  it('tick only moves waiting legs whose time has come', async () => {
    const p = await plan3();
    expect(reduce(p, { type: 'tick', nowMs: 0 })).toEqual(p);
    expect(reduce(p, { type: 'tick', nowMs: 1e18 }).legs.map((l) => l.state)).toEqual(['due', 'planned', 'planned']);
  });
  it('does not mutate input', async () => {
    const p = await plan3();
    const snap = JSON.stringify(p, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
    reduce(p, { type: 'cancel', leg: 0 });
    expect(JSON.stringify(p, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).toBe(snap);
  });
  it('rejects every illegal transition (exhaustive matrix)', async () => {
    const base = await plan3();
    const mk = (s: string, extra: object = {}): HopPlan => ({ ...base, legs: base.legs.map((l, i) => (i === 0 ? ({ ...l, state: s, ...extra } as never) : l)) });
    const evs: HopEvent[] = [
      { type: 'beginSigning', leg: 0, nonce: 1n, deadlineS: 5n },
      { type: 'submitted', leg: 0, txHash: TX },
      { type: 'confirmed', leg: 0, nowMs: 1 },
      { type: 'revertToDue', leg: 0 },
      { type: 'fail', leg: 0 },
      { type: 'retry', leg: 0 },
      { type: 'cancel', leg: 0 },
    ];
    const allowed: Record<string, string[]> = {
      planned: ['fail', 'cancel'],
      waiting: ['fail', 'cancel'],
      due: ['beginSigning', 'fail', 'cancel'],
      signing: ['submitted', 'confirmed', 'revertToDue', 'fail'],
      submitted: ['confirmed', 'revertToDue', 'fail'],
      confirmed: [],
      failed: ['retry'],
      cancelled: [],
    };
    for (const [state, ok] of Object.entries(allowed)) {
      for (const ev of evs) {
        const p = mk(state, state === 'signing' || state === 'submitted' ? { nonce: 1n, deadlineS: 5n } : {});
        const c = code(() => reduce(p, ev));
        expect(c, `${state} + ${ev.type}`).toBe(ok.includes(ev.type) ? 'none' : 'ILLEGAL_TRANSITION');
      }
    }
  });
  it('signing -> submitted/confirmed refused without stored nonce (HOP-REQ-8)', async () => {
    const base = await plan3();
    const p: HopPlan = { ...base, legs: base.legs.map((l, i) => (i === 0 ? { ...l, state: 'signing' } : l)) };
    expect(code(() => reduce(p, { type: 'submitted', leg: 0, txHash: TX }))).toBe('ILLEGAL_TRANSITION');
    expect(code(() => reduce(p, { type: 'confirmed', leg: 0, nowMs: 1 }))).toBe('ILLEGAL_TRANSITION');
  });
  it('legs run in order and inputs are validated', async () => {
    const base = await plan3();
    const p: HopPlan = { ...base, legs: base.legs.map((l, i) => (i === 1 ? { ...l, state: 'due' } : l)) };
    expect(code(() => reduce(p, { type: 'beginSigning', leg: 1, nonce: 1n, deadlineS: 5n }))).toBe('ILLEGAL_TRANSITION');
    expect(code(() => reduce(due(base), { type: 'beginSigning', leg: 0, nonce: -1n, deadlineS: 5n }))).toBe('ILLEGAL_TRANSITION');
    expect(code(() => reduce(due(base), { type: 'beginSigning', leg: 0, nonce: 1n, deadlineS: 0n }))).toBe('ILLEGAL_TRANSITION');
    expect(code(() => reduce(base, { type: 'cancel', leg: 9 }))).toBe('ILLEGAL_TRANSITION');
    expect(code(() => reduce({ ...base, chainId: 1 }, { type: 'tick', nowMs: 1 }))).toBe('MAINNET_FORBIDDEN');
  });
  it('revertToDue and retry clear signing state; last confirm completes', async () => {
    let p = due(await makePlan({ hops: 1 }).then((x) => x.plan));
    p = reduce(p, { type: 'beginSigning', leg: 0, nonce: 5n, deadlineS: 99n });
    p = reduce(p, { type: 'revertToDue', leg: 0 });
    expect(p.legs[0]).not.toHaveProperty('nonce');
    p = reduce(p, { type: 'fail', leg: 0 });
    p = reduce(p, { type: 'retry', leg: 0 });
    expect(p.legs[0]?.state).toBe('due');
    p = reduce(p, { type: 'beginSigning', leg: 0, nonce: 6n, deadlineS: 99n });
    p = reduce(p, { type: 'confirmed', leg: 0, nowMs: 5 });
    expect(isComplete(p)).toBe(true);
  });
});

describe('overdueLegs', () => {
  it('flags legs more than 1 h past due', async () => {
    const p = await plan3();
    const d = p.legs[0]?.dueAtMs ?? 0;
    expect(overdueLegs(p, d + H)).toHaveLength(0);
    expect(overdueLegs(p, d + H + 1)).toHaveLength(1);
    expect(overdueLegs(due(p), d + H + 1)).toHaveLength(1);
    expect(overdueLegs(reduce(p, { type: 'cancel', leg: 0 }), d + 10 * H)).toHaveLength(0);
  });
});
