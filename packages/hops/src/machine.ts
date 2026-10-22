import { assertTestnet } from './guard.js';
import { HopError, OVERDUE_MS, type HopEvent, type HopLeg, type HopPlan, type HopState } from './types.js';

function illegal(): never {
  throw new HopError('ILLEGAL_TRANSITION', 'illegal leg transition');
}

function setLeg(plan: HopPlan, i: number, patch: Partial<HopLeg>): HopPlan {
  const legs = plan.legs.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
  return { ...plan, legs };
}

function backToDue(plan: HopPlan, i: number): HopPlan {
  const legs = plan.legs.map((x, idx): HopLeg => {
    if (idx !== i) return x;
    const { nonce: _n, deadlineS: _d, txHash: _t, ...rest } = x;
    void _n; void _d; void _t;
    return { ...rest, state: 'due' };
  });
  return { ...plan, legs };
}

function legAt(plan: HopPlan, i: number): HopLeg {
  const l = plan.legs[i];
  if (l === undefined) return illegal();
  return l;
}

function expect(l: HopLeg, ...states: HopState[]): void {
  if (!states.includes(l.state)) illegal();
}

/**
 * Pure leg state machine. Total: every event either returns a new plan or throws
 * `ILLEGAL_TRANSITION`; the input plan is never mutated.
 *
 * @remarks Persist-before-sign (HOP-REQ-8): `beginSigning` stores the nonce and deadline; `submitted`
 * is refused without a stored nonce. Legs run strictly in order: `beginSigning` on leg `j` needs leg
 * `j-1` confirmed. When a leg confirms, the next leg's due time is `confirmedAt + its drawn delay`.
 *
 * @param plan Current plan.
 * @param ev Event.
 * @returns Next plan.
 * @throws {HopError} `ILLEGAL_TRANSITION`, `MAINNET_FORBIDDEN`.
 */
export function reduce(plan: HopPlan, ev: HopEvent): HopPlan {
  assertTestnet(plan.chainId);
  if (ev.type === 'tick') {
    const legs = plan.legs.map((l) => (l.state === 'waiting' && ev.nowMs >= l.dueAtMs ? { ...l, state: 'due' as const } : l));
    return { ...plan, legs };
  }
  const l = legAt(plan, ev.leg);
  switch (ev.type) {
    case 'beginSigning': {
      expect(l, 'due');
      if (ev.leg > 0 && legAt(plan, ev.leg - 1).state !== 'confirmed') illegal();
      if (ev.nonce < 0n || ev.deadlineS <= 0n) illegal();
      return setLeg(plan, ev.leg, { state: 'signing', nonce: ev.nonce, deadlineS: ev.deadlineS });
    }
    case 'submitted':
      expect(l, 'signing');
      if (l.nonce === undefined) illegal();
      return setLeg(plan, ev.leg, { state: 'submitted', txHash: ev.txHash });
    case 'confirmed': {
      expect(l, 'signing', 'submitted');
      if (l.nonce === undefined) illegal();
      let next = setLeg(plan, ev.leg, { state: 'confirmed' });
      const n = plan.legs[ev.leg + 1];
      if (n !== undefined) next = setLeg(next, ev.leg + 1, { state: 'waiting', dueAtMs: ev.nowMs + n.delayMs });
      return next;
    }
    case 'revertToDue':
      expect(l, 'signing', 'submitted');
      return backToDue(plan, ev.leg);
    case 'retry':
      expect(l, 'failed');
      return backToDue(plan, ev.leg);
    case 'fail':
      expect(l, 'planned', 'waiting', 'due', 'signing', 'submitted');
      return setLeg(plan, ev.leg, { state: 'failed' });
    case 'cancel':
      expect(l, 'planned', 'waiting', 'due');
      return setLeg(plan, ev.leg, { state: 'cancelled' });
  }
}

/**
 * Legs that are `due` more than one hour past `dueAtMs` (HOP-UX-4 overdue notice).
 *
 * @param plan Plan.
 * @param nowMs Wall clock.
 * @returns Overdue legs.
 */
export function overdueLegs(plan: HopPlan, nowMs: number): HopLeg[] {
  return plan.legs.filter((l) => (l.state === 'due' || l.state === 'waiting') && nowMs > l.dueAtMs + OVERDUE_MS);
}

/**
 * True when every leg is confirmed.
 *
 * @param plan Plan.
 * @returns Completion flag.
 */
export function isComplete(plan: HopPlan): boolean {
  return plan.legs.every((l) => l.state === 'confirmed');
}
