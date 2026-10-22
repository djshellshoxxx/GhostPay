import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assertWithinCap, bufferDust, dustWorthSweeping, planBuffer, roundBuffer } from './buffer.js';
import { HygieneError } from './errors.js';
import { fundingGuard, FUNDING_GUARD_MESSAGE } from './guard.js';
import { A1, A2, A3 } from './fixtures.testutil.js';
import {
  DEFAULT_HYGIENE_SETTINGS,
  HYGIENE_LABELS,
  HYGIENE_NOT_PROTECTED,
  sanitizeHygieneSettings,
} from './options.js';

const isGrid = (v: bigint): boolean => /^[125]0*$/.test(v.toString());
const sig = (v: bigint): number => v.toString().replace(/0+$/, '').length;

describe('roundBuffer grid125 (AT-HY-4)', () => {
  it.each([
    [1n, 1n],
    [2n, 2n],
    [3n, 5n],
    [5n, 5n],
    [6n, 10n],
    [10n, 10n],
    [11n, 20n],
    [20n, 20n],
    [21n, 50n],
    [50n, 50n],
    [51n, 100n],
    [201n, 500n],
    [2_010_000_000_000_000n, 5_000_000_000_000_000n],
    [9_999_999_999_999_999n, 10_000_000_000_000_000n],
  ])('%s -> %s', (raw, want) => {
    expect(roundBuffer(raw, 'grid125')).toBe(want);
  });
  it('property: >= raw, on grid, <= 3x, idempotent', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 2n ** 128n - 1n }), (raw) => {
        const r = roundBuffer(raw, 'grid125');
        return r >= raw && isGrid(r) && r <= 3n * raw && roundBuffer(r, 'grid125') === r;
      }),
      { numRuns: 500 },
    );
  });
});

describe('roundBuffer sig2 and off', () => {
  it.each([
    [1n, 1n],
    [99n, 99n],
    [100n, 100n],
    [101n, 110n],
    [951n, 960n],
    [999n, 1000n],
    [123_456_789n, 130_000_000n],
  ])('sig2 %s -> %s', (raw, want) => {
    expect(roundBuffer(raw, 'sig2')).toBe(want);
  });
  it('property sig2: >= raw, <= 2 sig digits, overshoot < 10% for raw>=100', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 2n ** 128n - 1n }), (raw) => {
        const r = roundBuffer(raw, 'sig2');
        return r >= raw && sig(r) <= 2 && (raw < 100n || (r - raw) * 10n < raw * 1n + raw);
      }),
      { numRuns: 500 },
    );
  });
  it('off returns raw', () => {
    expect(roundBuffer(123_456_789_012n, 'off')).toBe(123_456_789_012n);
  });
});

describe('roundBuffer input rules (HY-BUF-3)', () => {
  it('rejects zero, negative, non-bigint, unknown mode', () => {
    expect(() => roundBuffer(0n, 'grid125')).toThrow(HygieneError);
    expect(() => roundBuffer(-5n, 'off')).toThrow(HygieneError);
    expect(() => roundBuffer(5 as unknown as bigint, 'off')).toThrow(HygieneError);
    expect(() => roundBuffer(5n, 'nope' as never)).toThrow(/unknown rounding/);
  });
  it('3x cap throws', () => {
    expect(() => assertWithinCap(31n, 10n)).toThrow(HygieneError);
    expect(() => assertWithinCap(30n, 10n)).not.toThrow();
  });
  it('worst-case grid overshoot stays below 3x (2.5x bound)', () => {
    expect(roundBuffer(201n, 'grid125')).toBe(500n);
    expect(roundBuffer(201n, 'grid125') * 10n).toBeLessThan(201n * 25n + 1n);
  });
});

describe('planBuffer / dust (HY-BUF-4, HY-DUST-1)', () => {
  it('maxBufferWei equals rounded', () => {
    expect(planBuffer(2_010n, 'grid125')).toEqual({
      raw: 2_010n,
      rounded: 5_000n,
      maxBufferWei: 5_000n,
      extra: 2_990n,
    });
  });
  it('bufferDust', () => {
    expect(bufferDust(1_000n, 21n, 10n)).toBe(790n);
    expect(bufferDust(100n, 21n, 10n)).toBe(0n);
    expect(() => bufferDust(-1n, 1n, 1n)).toThrow(HygieneError);
    expect(() => bufferDust(1n, -1n, 1n)).toThrow(HygieneError);
    expect(() => bufferDust(1n, 1n, -1n)).toThrow(HygieneError);
  });
  it('dustWorthSweeping 20% threshold is strict', () => {
    expect(dustWorthSweeping(21n, 100n)).toBe(true);
    expect(dustWorthSweeping(20n, 100n)).toBe(false);
    expect(dustWorthSweeping(5n, 100n, 4n)).toBe(true);
    expect(() => dustWorthSweeping(-1n, 1n)).toThrow(HygieneError);
    expect(() => dustWorthSweeping(1n, -1n)).toThrow(HygieneError);
    expect(() => dustWorthSweeping(1n, 1n, -1n)).toThrow(HygieneError);
  });
});

describe('fundingGuard (HY-FUND-1)', () => {
  const known = { wallets: [A1 as `0x${string}`], destinations: [A2 as `0x${string}`] };
  it('blocks known wallet and ledger destination, any case, with the ERC-5564 text', () => {
    for (const f of [A1, A2, A1.toUpperCase().replace('0X', '0x')]) {
      const g = fundingGuard(f as `0x${string}`, known);
      expect(g).toEqual({ allow: false, message: FUNDING_GUARD_MESSAGE });
    }
    expect(FUNDING_GUARD_MESSAGE).toContain('MUST NOT have any physical connection');
  });
  it('allows unknown, rejects malformed', () => {
    expect(fundingGuard(A3, known)).toEqual({ allow: true });
    expect(() => fundingGuard('0x1', known)).toThrow(HygieneError);
    expect(() => fundingGuard(A3, { wallets: ['x' as never], destinations: [] })).toThrow(HygieneError);
  });
});

describe('options and honest copy', () => {
  it('defaults match spec', () => {
    expect(DEFAULT_HYGIENE_SETTINGS).toEqual({
      destination: 'self-derived',
      verification: 'address-free',
      bufferRounding: 'grid125',
      sweepDust: true,
      knownWalletGuard: true,
    });
  });
  it('sanitize falls back and drops extras', () => {
    expect(sanitizeHygieneSettings(null)).toEqual(DEFAULT_HYGIENE_SETTINGS);
    expect(sanitizeHygieneSettings([1])).toEqual(DEFAULT_HYGIENE_SETTINGS);
    expect(
      sanitizeHygieneSettings({
        destination: 'bogus',
        verification: 'direct',
        bufferRounding: 'off',
        sweepDust: 'yes',
        knownWalletGuard: false,
        x: 1,
      }),
    ).toEqual({
      destination: 'self-derived',
      verification: 'direct',
      bufferRounding: 'off',
      sweepDust: true,
      knownWalletGuard: false,
    });
    expect(sanitizeHygieneSettings({ destination: 'external-reuse', sweepDust: false }).sweepDust).toBe(
      false,
    );
  });
  it('copy is honest: no banned words, required labels present', () => {
    const text = JSON.stringify([HYGIENE_LABELS, HYGIENE_NOT_PROTECTED, FUNDING_GUARD_MESSAGE]);
    expect(text).not.toMatch(/anonymous|untraceable|\bmix|unlinkable|private payment/i);
    expect(HYGIENE_LABELS.verification.direct).toContain('tells your RPC which address is yours');
    expect(HYGIENE_LABELS.bufferRounding.off).toContain('fingerprints this client');
    expect(HYGIENE_LABELS.title).toContain('not anonymity');
    expect(HYGIENE_NOT_PROTECTED.length).toBe(6);
  });
});
