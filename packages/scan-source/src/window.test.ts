import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ScanSourceError } from './errors.js';
import { padWindow } from './window.js';

describe('padWindow (NP-S-3, AT-NP-14)', () => {
  it('known vectors', () => {
    expect(padWindow(1234n, 1234n, 1000, 1000)).toEqual({ from: 1000n, to: 1999n });
    expect(padWindow(0n, 0n, 1000, 1000)).toEqual({ from: 0n, to: 999n });
    expect(padWindow(999n, 1000n, 1000, 1000)).toEqual({ from: 0n, to: 1999n });
    expect(padWindow(1000n, 1999n, 1000, 1000)).toEqual({ from: 1000n, to: 1999n });
    expect(padWindow(5n, 6n, 10, 35)).toEqual({ from: 0n, to: 39n });
    expect(padWindow(10_001n, 10_001n, 10_000, 1)).toEqual({ from: 10_000n, to: 19_999n });
  });
  it('fresh install and one-block catch-up give the same size', () => {
    const a = padWindow(0n, 0n, 1000, 1000);
    const b = padWindow(7_654_321n, 7_654_321n, 1000, 1000);
    expect(a.to - a.from).toBe(b.to - b.from);
  });
  it('property: aligned, covers the request, span >= minSpan, minimal grid', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 100_000n }), fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 20_000 }), (from, len, align, minSpan) => {
        const to = from + len;
        const w = padWindow(from, to, align, minSpan);
        const a = BigInt(align);
        expect(w.from % a).toBe(0n);
        expect((w.to + 1n) % a).toBe(0n);
        expect(w.from <= from && w.to >= to).toBe(true);
        expect(w.to - w.from + 1n >= BigInt(minSpan)).toBe(true);
        expect(from - w.from < a).toBe(true); // not padded further than one grid step below
        expect(padWindow(w.from, w.to, align, minSpan)).toEqual(w); // idempotent
      }),
      { numRuns: 300 },
    );
  });
  it('rejects bad input', () => {
    for (const f of [() => padWindow(-1n, 0n, 1, 1), () => padWindow(5n, 4n, 1, 1), () => padWindow(0n, 0n, 0, 1), () => padWindow(0n, 0n, 1.5, 1), () => padWindow(0n, 0n, 1, 0), () => padWindow(0n, 0n, 10_000_001, 1)]) {
      expect(f).toThrow(ScanSourceError);
    }
  });
});
