import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FEE_DIVISOR, UINT64_MAX } from '../../abi.js';
import { P13Error, toResult } from './errors.js';
import {
  EUINT64_DOMAIN,
  MAX_UINT256,
  assertInDomain,
  checkConservation,
  checkedAdd,
  checkedSub,
  confidentialGrossForNet,
  confidentialRouterSplit,
  formatDecimalUnits,
  formatDisplayAmount,
  parseDecimalUnits,
  parseDisplayAmount,
  toConfidentialUnits,
  toUnderlyingUnits,
  wrapperUnits,
} from './units.js';

const SEED = 20261125;
const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};

describe('parseDecimalUnits (COMMON DecimalUnits)', () => {
  it('accepts canonical unsigned decimal strings up to 2^256-1', () => {
    expect(parseDecimalUnits('0')).toBe(0n);
    expect(parseDecimalUnits('18446744073709551615')).toBe(UINT64_MAX);
    expect(parseDecimalUnits(MAX_UINT256.toString())).toBe(MAX_UINT256);
  });

  it.each([
    '', '01', '-1', '+1', '1e3', '1.0', ' 1', '1 ', '0x10', '١', '１', '1_000', '00', 'NaN', 'Infinity',
  ])('rejects malformed %j', (text) => {
    expect(codeOf(() => parseDecimalUnits(text))).toBe('P13_INVALID_AMOUNT');
  });

  it.each([1, 1n, null, undefined, {}, ['1']])('rejects non-string value #%#', (value) => {
    expect(codeOf(() => parseDecimalUnits(value))).toBe('P13_INVALID_AMOUNT');
  });

  it('rejects values above 2^256-1 and over-long input without echoing it', () => {
    expect(codeOf(() => parseDecimalUnits((MAX_UINT256 + 1n).toString()))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => parseDecimalUnits('9'.repeat(79)))).toBe('P13_INVALID_AMOUNT');
    try {
      parseDecimalUnits('123456789x');
    } catch (e) {
      expect((e as Error).message).not.toContain('123456789');
    }
  });

  it('round-trips with formatDecimalUnits', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX_UINT256 }), (v) => parseDecimalUnits(formatDecimalUnits(v)) === v),
      { seed: SEED, numRuns: 500 },
    );
  });

  it('formatDecimalUnits refuses negatives, non-bigint and > 2^256-1', () => {
    expect(codeOf(() => formatDecimalUnits(-1n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => formatDecimalUnits(MAX_UINT256 + 1n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => formatDecimalUnits(1 as unknown as bigint))).toBe('P13_INVALID_AMOUNT');
  });
});

describe('parseDisplayAmount / formatDisplayAmount (exact, no floats)', () => {
  it('converts decimal text to base units exactly', () => {
    expect(parseDisplayAmount('12.345', 6)).toBe(12_345_000n);
    expect(parseDisplayAmount('0.000001', 6)).toBe(1n);
    expect(parseDisplayAmount('0', 6)).toBe(0n);
    expect(parseDisplayAmount('7', 0)).toBe(7n);
    // 0.1 + 0.2 style float errors cannot occur: the value is built from digits.
    expect(parseDisplayAmount('0.3', 18)).toBe(300_000_000_000_000_000n);
  });

  it('refuses more fraction digits than the asset has (no silent rounding)', () => {
    expect(codeOf(() => parseDisplayAmount('0.0000001', 6))).toBe('P13_PRECISION');
    expect(codeOf(() => parseDisplayAmount('1.5', 0))).toBe('P13_PRECISION');
  });

  it.each(['', '.5', '5.', '1.2.3', '-1', '+1', '1e2', '1,5', ' 1', '01.5', '١.0', '0x1'])('rejects %j', (t) => {
    expect(codeOf(() => parseDisplayAmount(t, 6))).toBe('P13_INVALID_AMOUNT');
  });

  it('rejects invalid decimals and oversized input', () => {
    expect(codeOf(() => parseDisplayAmount('1', -1))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => parseDisplayAmount('1', 37))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => parseDisplayAmount('1', 1.5))).toBe('P13_INVALID_ASSET');
    expect(codeOf(() => parseDisplayAmount('1'.repeat(101), 0))).toBe('P13_INVALID_AMOUNT');
    expect(codeOf(() => parseDisplayAmount('9'.repeat(79), 0))).toBe('P13_AMOUNT_RANGE');
  });

  it('formats exactly and round-trips', () => {
    expect(formatDisplayAmount(12_345_000n, 6)).toBe('12.345');
    expect(formatDisplayAmount(1n, 6)).toBe('0.000001');
    expect(formatDisplayAmount(5_000_000n, 6)).toBe('5');
    expect(formatDisplayAmount(0n, 6)).toBe('0');
    expect(formatDisplayAmount(42n, 0)).toBe('42');
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: UINT64_MAX }), fc.integer({ min: 0, max: 36 }), (v, d) =>
        parseDisplayAmount(formatDisplayAmount(v, d), d) === v,
      ),
      { seed: SEED, numRuns: 500 },
    );
  });
});

describe('amount domain (euint64) and checked arithmetic', () => {
  it('accepts 1..2^64-1 and rejects zero, negative and 2^64', () => {
    expect(assertInDomain(1n, EUINT64_DOMAIN)).toBe(1n);
    expect(assertInDomain(UINT64_MAX, EUINT64_DOMAIN)).toBe(UINT64_MAX);
    expect(codeOf(() => assertInDomain(0n, EUINT64_DOMAIN))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => assertInDomain(-1n, EUINT64_DOMAIN))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => assertInDomain(UINT64_MAX + 1n, EUINT64_DOMAIN))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => assertInDomain(1 as unknown as bigint, EUINT64_DOMAIN))).toBe('P13_INVALID_AMOUNT');
  });

  it('checkedAdd/checkedSub refuse overflow and underflow', () => {
    expect(checkedAdd(UINT64_MAX - 1n, 1n)).toBe(UINT64_MAX);
    expect(codeOf(() => checkedAdd(UINT64_MAX, 1n))).toBe('P13_OVERFLOW');
    expect(codeOf(() => checkedAdd(-1n, 1n))).toBe('P13_AMOUNT_RANGE');
    expect(checkedSub(5n, 5n)).toBe(0n);
    expect(codeOf(() => checkedSub(4n, 5n))).toBe('P13_OVERFLOW');
    expect(checkedAdd(MAX_UINT256 - 1n, 1n, MAX_UINT256)).toBe(MAX_UINT256);
  });
});

describe('wrapper units (mirrors OpenZeppelin ERC7984ERC20Wrapper 0.5.3)', () => {
  it('caps confidential decimals at 6 with a power-of-ten rate', () => {
    expect(wrapperUnits(18)).toEqual({ decimals: 6, rate: 1_000_000_000_000n });
    expect(wrapperUnits(6)).toEqual({ decimals: 6, rate: 1n });
    expect(wrapperUnits(2)).toEqual({ decimals: 2, rate: 1n });
    expect(codeOf(() => wrapperUnits(37))).toBe('P13_INVALID_ASSET');
  });

  it('converts underlying to confidential units exactly or refuses', () => {
    const { rate } = wrapperUnits(18);
    expect(toConfidentialUnits(1_500_000_000_000_000_000n, rate)).toBe(1_500_000n);
    // The wrapper would silently keep the remainder; GhostPay refuses instead.
    expect(codeOf(() => toConfidentialUnits(1_500_000_000_000_000_001n, rate))).toBe('P13_PRECISION');
    expect(codeOf(() => toConfidentialUnits(0n, rate))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => toConfidentialUnits((UINT64_MAX + 1n) * rate, rate))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => toConfidentialUnits(1n, 0n))).toBe('P13_INVALID_ASSET');
    expect(toUnderlyingUnits(1_500_000n, rate)).toBe(1_500_000_000_000_000_000n);
    expect(codeOf(() => toUnderlyingUnits(0n, rate))).toBe('P13_AMOUNT_RANGE');
  });
});

describe('confidential router split and gross-for-net (FEE_DIVISOR 400, floor)', () => {
  it('splits like the router: fee = floor(gross / 400), fee + net = gross', () => {
    expect(confidentialRouterSplit(399n)).toEqual({ gross: 399n, fee: 0n, net: 399n });
    expect(confidentialRouterSplit(400n)).toEqual({ gross: 400n, fee: 1n, net: 399n });
    expect(confidentialRouterSplit(UINT64_MAX)).toEqual({
      gross: UINT64_MAX,
      fee: UINT64_MAX / FEE_DIVISOR,
      net: UINT64_MAX - UINT64_MAX / FEE_DIVISOR,
    });
    expect(codeOf(() => confidentialRouterSplit(0n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => confidentialRouterSplit(UINT64_MAX + 1n))).toBe('P13_AMOUNT_RANGE');
  });

  it('grossForNet returns the minimal gross that delivers net (brute-force check for small values)', () => {
    for (let net = 1n; net <= 2_000n; net++) {
      let brute = net;
      while (confidentialRouterSplit(brute).net < net) brute++;
      expect(confidentialGrossForNet(net)).toBe(brute);
    }
  });

  it('grossForNet is minimal across the domain and refuses nets that need gross > 2^64-1', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: UINT64_MAX - UINT64_MAX / 400n }), (net) => {
        const g = confidentialGrossForNet(net);
        return confidentialRouterSplit(g).net >= net && (g === 1n || confidentialRouterSplit(g - 1n).net < net);
      }),
      { seed: SEED, numRuns: 500 },
    );
    const maxNet = confidentialRouterSplit(UINT64_MAX).net;
    expect(confidentialGrossForNet(maxNet)).toBeLessThanOrEqual(UINT64_MAX);
    expect(codeOf(() => confidentialGrossForNet(maxNet + 1n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => confidentialGrossForNet(0n))).toBe('P13_AMOUNT_RANGE');
  });
});

describe('checkConservation (plan-level arithmetic, not a proof) — P13-A03', () => {
  it('accepts inputs == outputs + fees', () => {
    const s = confidentialRouterSplit(1_000_000n);
    expect(() => checkConservation({ inputs: [s.gross], outputs: [s.net], fees: [s.fee] })).not.toThrow();
    expect(() => checkConservation({ inputs: [5n, 5n], outputs: [9n], fees: [1n] })).not.toThrow();
  });

  it('rejects inflation, deflation, zero outputs, negative values and overflowing sums', () => {
    expect(codeOf(() => checkConservation({ inputs: [10n], outputs: [10n], fees: [1n] }))).toBe('P13_CONSERVATION');
    expect(codeOf(() => checkConservation({ inputs: [10n], outputs: [8n], fees: [1n] }))).toBe('P13_CONSERVATION');
    expect(codeOf(() => checkConservation({ inputs: [10n], outputs: [0n, 10n], fees: [] }))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => checkConservation({ inputs: [10n], outputs: [11n], fees: [-1n] }))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => checkConservation({ inputs: [UINT64_MAX, 1n], outputs: [1n], fees: [] }))).toBe('P13_OVERFLOW');
    expect(codeOf(() => checkConservation({ inputs: [], outputs: [1n], fees: [] }))).toBe('P13_CONSERVATION');
    expect(codeOf(() => checkConservation({ inputs: [1n], outputs: [], fees: [1n] }))).toBe('P13_CONSERVATION');
    const many = Array.from({ length: 1001 }, () => 1n);
    expect(codeOf(() => checkConservation({ inputs: many, outputs: many, fees: [] }))).toBe('P13_RECORD_LIMIT');
  });

  it('holds for every router split (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: UINT64_MAX }), (g) => {
        const s = confidentialRouterSplit(g);
        checkConservation({ inputs: [s.gross], outputs: [s.net], fees: [s.fee] });
        return true;
      }),
      { seed: SEED, numRuns: 500 },
    );
  });

  it('throws P13Error instances', () => {
    expect(() => checkConservation({ inputs: [1n], outputs: [2n], fees: [] })).toThrow(P13Error);
  });
});
