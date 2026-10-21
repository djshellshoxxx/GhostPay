import { MAX_ROUTER_GROSS, routerFee } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import {
  ABS_MIN_PART_BASE,
  assertPlanInvariants,
  defaultMinPartBase,
  feeDelta,
  pickBufferPart,
  splitPart,
  totalsOf,
} from './fees.js';
import type { PlannedPart } from './types.js';

const part = (index: number, gross: bigint): PlannedPart => {
  const s = splitPart(gross);
  return { index, gross, fee: s.fee, net: s.net, dueOffsetMs: index * 1000, deadlineOffsetMs: index * 1000 + 600_000, isRemainder: false };
};

describe('fees', () => {
  it('router vectors 399/400 (GhostPayRouter.t.sol): dust pays zero, 400 pays 1', () => {
    expect(splitPart(399n)).toEqual({ gross: 399n, fee: 0n, net: 399n });
    expect(splitPart(400n)).toEqual({ gross: 400n, fee: 1n, net: 399n });
    expect(splitPart(401n).fee).toBe(1n);
    expect(splitPart(10n ** 6n).fee).toBe(2500n);
  });
  it('splitPart wraps router range errors', () => {
    expect(() => splitPart(0n)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => splitPart(MAX_ROUTER_GROSS + 1n)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(splitPart(MAX_ROUTER_GROSS).gross).toBe(MAX_ROUTER_GROSS);
  });
  it('defaultMinPartBase: max(400, 10^(d-2))', () => {
    expect(defaultMinPartBase(6)).toBe(10_000n);
    expect(defaultMinPartBase(18)).toBe(10n ** 16n);
    expect(defaultMinPartBase(2)).toBe(400n);
    expect(defaultMinPartBase(0)).toBe(400n);
    expect(defaultMinPartBase(1)).toBe(400n);
    expect(() => defaultMinPartBase(37)).toThrow();
    expect(() => defaultMinPartBase(0.5)).toThrow();
  });
  it('totals and feeDelta: floor superadditivity (R-FEE-1), real numbers', () => {
    const parts = [splitPart(799n), splitPart(799n)];
    const t = totalsOf(parts);
    expect(t.feeTotal).toBe(2n);
    // fee(1598) = floor(1598*25/10000) = 3, so the protocol forgoes 1 base unit (k-1 = 1).
    expect(routerFee(t.grossTotal)).toBe(3n);
    expect(feeDelta(t.grossTotal, t.feeTotal)).toBe(1n);
    expect(() => feeDelta(MAX_ROUTER_GROSS + 1n, 0n)).toThrow();
  });
  it('assertPlanInvariants accepts a good plan', () => {
    const p = [part(0, 1000n), part(1, 1000n)];
    expect(() => assertPlanInvariants(p, 1995n, 0n, 400n)).not.toThrow();
  });
  it('adversarial: seller short, overpay too high, tampered fee, below floor, bad count', () => {
    const p = [part(0, 1000n), part(1, 1000n)];
    expect(() => assertPlanInvariants(p, 1997n, 0n, 400n)).toThrow(/less than/);
    expect(() => assertPlanInvariants(p, 1n, 0n, 400n)).toThrow(/overpay/);
    expect(() => assertPlanInvariants([{ ...p[0]!, fee: 0n, net: 1000n }, p[1]!], 1n, 2000n, 400n)).toThrow(/fee or floor/);
    expect(() => assertPlanInvariants([part(0, 399n), part(1, 1000n)], 1n, 2000n, 400n)).toThrow(/fee or floor/);
    expect(() => assertPlanInvariants(p, 1n, 2000n, 399n)).toThrow(expect.objectContaining({ code: 'PART_BELOW_FLOOR' }));
    expect(() => assertPlanInvariants([p[0]!], 1n, 2000n, 400n)).toThrow(/count/);
    expect(() => assertPlanInvariants(Array.from({ length: 9 }, (_, i) => part(i, 1000n)), 1n, 99999n, 400n)).toThrow(/count/);
  });
  it('pickBufferPart: largest, first on tie, exactly one (AB-F3)', () => {
    expect(pickBufferPart([part(0, 500n), part(1, 900n), part(2, 900n)])).toBe(1);
    expect(pickBufferPart([part(0, 500n)])).toBe(0);
    expect(() => pickBufferPart([])).toThrow();
  });
  it('floor constant', () => {
    expect(ABS_MIN_PART_BASE).toBe(400n);
  });
});
