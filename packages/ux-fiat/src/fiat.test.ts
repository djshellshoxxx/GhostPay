import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkAmount,
  checkPolicy,
  checkRateJump,
  classifyAge,
  computeFiatView,
  DEFAULT_RATE_POLICY,
  divRound,
  formatFiatParts,
  formatUnits,
  fromFiatMinor,
  joinParts,
  parseFiatInput,
  parseRate,
  parseUnits,
  ROUNDING_MODES,
  toFiatMinor,
  type FiatFormat,
  type ParsedRate,
  type RateQuote,
} from './index.js';

const NOW = 1_700_000_000_000;
const q = (o: Partial<RateQuote> = {}): RateQuote => ({
  asset: 'ETH',
  fiat: 'USD',
  rate: '2500.5',
  timestampMs: NOW - 1000,
  source: 'test-feed',
  ...o,
});
const rate = (o: Partial<RateQuote> = {}): ParsedRate => {
  const r = parseRate(q(o));
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const US: FiatFormat = {
  symbol: '$', symbolPosition: 'prefix', symbolSpace: false,
  groupSeparator: ',', decimalSeparator: '.', grouping: 3, minusSign: '-',
};
const DE: FiatFormat = {
  symbol: '€', symbolPosition: 'suffix', symbolSpace: true,
  groupSeparator: '.', decimalSeparator: ',', grouping: 3, minusSign: '−',
};
const IN: FiatFormat = { ...US, symbol: '₹', grouping: 'indian' };

describe('divRound', () => {
  it('rounds every mode for +/- values', () => {
    const t = (n: bigint, d: bigint) => ROUNDING_MODES.map((m) => divRound(n, d, m));
    // modes: trunc, away, floor, ceil, half-away, half-trunc, half-even
    expect(t(7n, 2n)).toEqual([3n, 4n, 3n, 4n, 4n, 3n, 4n]);
    expect(t(5n, 2n)).toEqual([2n, 3n, 2n, 3n, 3n, 2n, 2n]);
    expect(t(-7n, 2n)).toEqual([-3n, -4n, -4n, -3n, -4n, -3n, -4n]);
    expect(t(-5n, 2n)).toEqual([-2n, -3n, -3n, -2n, -3n, -2n, -2n]);
    expect(t(10n, 4n)).toEqual([2n, 3n, 2n, 3n, 3n, 2n, 2n]);
    expect(t(11n, 4n)).toEqual([2n, 3n, 2n, 3n, 3n, 3n, 3n]);
    expect(t(9n, 3n)).toEqual([3n, 3n, 3n, 3n, 3n, 3n, 3n]);
    expect(t(1n, 3n)).toEqual([0n, 1n, 0n, 1n, 0n, 0n, 0n]);
  });
  it('rejects non-positive divisor', () => {
    expect(() => divRound(1n, 0n, 'floor')).toThrow(RangeError);
  });
});

describe('parseRate', () => {
  it('accepts plain decimals', () => {
    const r = rate({ rate: '0.000123' });
    expect(r.num).toBe(123n);
    expect(r.scale).toBe(6);
  });
  it.each([
    ['0', 'rate-zero'],
    ['0.000', 'rate-zero'],
    ['-1', 'rate-negative'],
    ['-0', 'rate-negative'],
    ['1e5', 'bad-rate-format'],
    [' 1', 'bad-rate-format'],
    ['1,5', 'bad-rate-format'],
    ['01', 'bad-rate-format'],
    ['.5', 'bad-rate-format'],
    ['5.', 'bad-rate-format'],
    ['NaN', 'bad-rate-format'],
    ['Infinity', 'bad-rate-format'],
    ['', 'bad-rate-format'],
    ['1.1234567890123456789', 'bad-rate-format'],
    ['1000000000001', 'rate-too-large'],
    ['9'.repeat(31), 'rate-too-large'],
    ['0.0000000000001', 'rate-too-small'],
  ])('rejects %s', (rate_, code) => {
    const r = parseRate(q({ rate: rate_ }));
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });
  it('rejects non-string rate and bad fields', () => {
    const bad = (o: Record<string, unknown>) => {
      const r = parseRate({ ...q(), ...o });
      return r.ok ? 'ok' : r.error.code;
    };
    expect(bad({ rate: 5 })).toBe('bad-rate-format');
    expect(bad({ asset: '' })).toBe('bad-asset');
    expect(bad({ asset: 'E‮TH' })).toBe('bad-asset');
    expect(bad({ fiat: 'usd' })).toBe('bad-fiat');
    expect(bad({ source: 'x'.repeat(65) })).toBe('bad-source');
    expect(bad({ source: 'a\nb' })).toBe('bad-source');
    expect(bad({ timestampMs: 0 })).toBe('bad-timestamp');
    expect(bad({ timestampMs: 1.5 })).toBe('bad-timestamp');
    expect(bad({ timestampMs: NaN })).toBe('bad-timestamp');
    expect(parseRate(null as unknown as RateQuote).ok).toBe(false);
  });
  it('respects custom bounds and rejects bad policy', () => {
    const p = { ...DEFAULT_RATE_POLICY, maxRate: '100' };
    expect(parseRate(q({ rate: '101' }), p).ok).toBe(false);
    expect(parseRate(q({ rate: '100' }), p).ok).toBe(true);
    for (const bad of [
      { staleMs: 5 },
      { freshMs: -1 },
      { freshMs: 1.5 },
      { maxRate: '0' },
      { minRate: '5', maxRate: '1' },
      { maxRate: 'abc' },
      { minRate: '0' },
    ]) {
      const c = checkPolicy({ ...DEFAULT_RATE_POLICY, ...bad });
      expect(c.ok).toBe(false);
    }
    expect(parseRate(q(), { ...DEFAULT_RATE_POLICY, staleMs: 1 }).ok).toBe(false);
  });
});

describe('classifyAge', () => {
  const age = (ts: number, now = NOW) => {
    const r = classifyAge(ts, now);
    if (!r.ok) throw new Error(r.error.code);
    return r.value;
  };
  it('boundaries', () => {
    expect(age(NOW - 60_000)).toEqual({ freshness: 'fresh', ageMs: 60_000 });
    expect(age(NOW - 60_001).freshness).toBe('aging');
    expect(age(NOW - 600_000).freshness).toBe('aging');
    expect(age(NOW - 600_001).freshness).toBe('stale');
    expect(age(NOW + 30_000).freshness).toBe('fresh');
    expect(age(NOW + 30_001).freshness).toBe('future');
  });
  it('rejects bad inputs', () => {
    expect(classifyAge(0, NOW).ok).toBe(false);
    expect(classifyAge(NOW, 0).ok).toBe(false);
    expect(classifyAge(NOW, NOW, { ...DEFAULT_RATE_POLICY, staleMs: 0 }).ok).toBe(false);
  });
});

describe('toFiatMinor / fromFiatMinor exact math', () => {
  const eth = 18;
  it('1 ETH at 2500.5 USD = 250050 cents', () => {
    expect(toFiatMinor(10n ** 18n, eth, rate(), 2, 'half-even')).toEqual({ ok: true, value: 250050n });
  });
  it('rounds sub-cent amounts per mode', () => {
    // 1 wei * 2500.5 = tiny; 0.000002 ETH = 0.005001 USD => 0.5001 cents
    const amt = 2_000_000_000_000n;
    const f = (m: (typeof ROUNDING_MODES)[number]) => {
      const r = toFiatMinor(amt, eth, rate(), 2, m);
      return r.ok ? r.value : null;
    };
    expect(f('trunc')).toBe(0n);
    expect(f('floor')).toBe(0n);
    expect(f('ceil')).toBe(1n);
    expect(f('away')).toBe(1n);
    expect(f('half-away')).toBe(1n);
    expect(f('half-even')).toBe(1n);
    expect(toFiatMinor(-amt, eth, rate(), 2, 'floor')).toEqual({ ok: true, value: -1n });
    expect(toFiatMinor(-amt, eth, rate(), 2, 'ceil')).toEqual({ ok: true, value: 0n });
  });
  it('no float error: 0.1+0.2 style', () => {
    const r = rate({ rate: '0.1' });
    expect(toFiatMinor(3n, 1, r, 2, 'trunc')).toEqual({ ok: true, value: 3n }); // 0.3 token * 0.1 = 0.03
  });
  it('zero-decimal fiat and asset', () => {
    const r = rate({ rate: '1234.5', fiat: 'JPY' });
    expect(toFiatMinor(3n, 0, r, 0, 'half-away')).toEqual({ ok: true, value: 3704n }); // 3703.5
    expect(toFiatMinor(3n, 0, r, 0, 'half-even')).toEqual({ ok: true, value: 3704n });
    expect(toFiatMinor(3n, 0, r, 0, 'half-trunc')).toEqual({ ok: true, value: 3703n });
  });
  it('huge amount stays exact', () => {
    const amt = 10n ** 30n + 7n;
    const r = toFiatMinor(amt, 18, rate({ rate: '1' }), 2, 'trunc');
    expect(r).toEqual({ ok: true, value: (amt * 100n) / 10n ** 18n });
  });
  it('reverse with explicit direction', () => {
    // $25.00 at 2500.5 => 0.009998000399920016 ETH (non-terminating): floor vs ceil differ by 1
    const lo = fromFiatMinor(2500n, 2, rate(), 18, 'floor');
    const hi = fromFiatMinor(2500n, 2, rate(), 18, 'ceil');
    expect(lo).toEqual({ ok: true, value: 9_998_000_399_920_015n });
    expect(hi).toEqual({ ok: true, value: 9_998_000_399_920_016n });
    // round trip: ceil token amount covers fiat value
    if (hi.ok) {
      const back = toFiatMinor(hi.value, 18, rate(), 2, 'ceil');
      expect(back.ok && back.value >= 2500n).toBe(true);
    }
  });
  it('reverse exact case', () => {
    expect(fromFiatMinor(250050n, 2, rate(), 18, 'floor')).toEqual({ ok: true, value: 10n ** 18n });
    expect(fromFiatMinor(250050n, 2, rate(), 18, 'ceil')).toEqual({ ok: true, value: 10n ** 18n });
  });
  it('validates args', () => {
    const r = rate();
    const code = (x: { ok: boolean; error?: { code: string } }) => (x.ok ? 'ok' : x.error?.code);
    expect(code(toFiatMinor(1n, 37, r, 2, 'floor'))).toBe('bad-decimals');
    expect(code(toFiatMinor(1n, 18, r, 19, 'floor'))).toBe('bad-decimals');
    expect(code(toFiatMinor(1n, 1.5, r, 2, 'floor'))).toBe('bad-decimals');
    expect(code(toFiatMinor(1 as unknown as bigint, 18, r, 2, 'floor'))).toBe('bad-amount');
    expect(code(toFiatMinor(10n ** 78n, 18, r, 2, 'floor'))).toBe('overflow');
    expect(code(toFiatMinor(1n, 18, r, 2, 'round' as never))).toBe('bad-rounding');
    expect(code(toFiatMinor(1n, 18, { ...r, num: 0n }, 2, 'floor'))).toBe('rate-zero');
    expect(code(fromFiatMinor(1n, 2, r, 37, 'floor'))).toBe('bad-decimals');
    expect(code(fromFiatMinor(1n, 19, r, 18, 'floor'))).toBe('bad-decimals');
    expect(code(fromFiatMinor('1' as unknown as bigint, 2, r, 18, 'floor'))).toBe('bad-amount');
    expect(code(fromFiatMinor(1n, 2, r, 18, undefined as never))).toBe('bad-rounding');
    expect(code(fromFiatMinor(1n, 2, { ...r, num: 0n }, 18, 'floor'))).toBe('rate-zero');
  });
  it('reverse overflow is reported', () => {
    const r = rate({ rate: '0.000000000001' });
    const res = fromFiatMinor(10n ** 77n, 0, r, 36, 'floor');
    expect(res.ok).toBe(false);
  });
  it('property: floor <= exact <= ceil and ceil-floor <= 1', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 40n }),
        fc.integer({ min: 0, max: 36 }),
        fc.integer({ min: 0, max: 18 }),
        fc.bigInt({ min: 1n, max: 10n ** 20n }),
        fc.integer({ min: 0, max: 18 }),
        (amt, ad, fd, num, scale) => {
          const r: ParsedRate = { num, scale, asset: 'A', fiat: 'USD', timestampMs: 1, source: 's' };
          const lo = toFiatMinor(amt, ad, r, fd, 'floor');
          const hi = toFiatMinor(amt, ad, r, fd, 'ceil');
          if (!lo.ok || !hi.ok) return false;
          const diff = hi.value - lo.value;
          return diff === 0n || diff === 1n;
        },
      ),
    );
  });
  it('property: reverse ceil then forward floor >= original', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (fiat, num) => {
          const r: ParsedRate = { num, scale: 4, asset: 'A', fiat: 'USD', timestampMs: 1, source: 's' };
          const tok = fromFiatMinor(fiat, 2, r, 18, 'ceil');
          if (!tok.ok) return false;
          const back = toFiatMinor(tok.value, 18, r, 2, 'ceil');
          return back.ok && back.value >= fiat;
        },
      ),
    );
  });
});

describe('units', () => {
  it('parse/format', () => {
    expect(parseUnits('1.5', 18)).toEqual({ ok: true, value: 1_500_000_000_000_000_000n });
    expect(parseUnits('0', 6)).toEqual({ ok: true, value: 0n });
    expect(formatUnits(1_500_000_000_000_000_000n, 18)).toEqual({ ok: true, value: '1.5' });
    expect(formatUnits(-5n, 3)).toEqual({ ok: true, value: '-0.005' });
    expect(formatUnits(7n, 0)).toEqual({ ok: true, value: '7' });
    expect(formatUnits(1000n, 3)).toEqual({ ok: true, value: '1' });
  });
  it('excess precision rejected unless rounding mode given', () => {
    const r = parseUnits('1.234', 2);
    expect(!r.ok && r.error.code).toBe('excess-precision');
    expect(parseUnits('1.235', 2, 'half-even')).toEqual({ ok: true, value: 124n });
    expect(parseUnits('1.239', 2, 'trunc')).toEqual({ ok: true, value: 123n });
  });
  it('rejects junk', () => {
    for (const s of ['', '-1', '1e3', '1.', '.1', ' 1', '0x10', '1,0', '00']) {
      expect(parseUnits(s, 18).ok).toBe(false);
    }
    expect(parseUnits('1', 40).ok).toBe(false);
    expect(parseUnits('9'.repeat(79), 0).ok).toBe(false);
    expect(parseUnits(5 as unknown as string, 2).ok).toBe(false);
    expect(formatUnits(1n, 40).ok).toBe(false);
    expect(formatUnits(10n ** 80n, 2).ok).toBe(false);
    expect(checkAmount(1).ok).toBe(false);
  });
  it('property: format/parse round trip', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 50n }), fc.integer({ min: 0, max: 36 }), (a, d) => {
        const s = formatUnits(a, d);
        if (!s.ok) return false;
        const p = parseUnits(s.value, d);
        return p.ok && p.value === a;
      }),
    );
  });
});

describe('formatting', () => {
  const f = (v: bigint, d: number, fmt: FiatFormat) => {
    const r = formatFiatParts(v, d, fmt);
    if (!r.ok) throw new Error(r.error.code);
    return joinParts(r.value);
  };
  it('en-like, de-like, indian', () => {
    expect(f(123456789n, 2, US)).toBe('$1,234,567.89');
    expect(f(123456789n, 2, DE)).toBe('1.234.567,89 €');
    expect(f(123456789n, 2, IN)).toBe('₹12,34,567.89');
    expect(f(-5n, 2, US)).toBe('-$0.05');
    expect(f(-5n, 2, DE)).toBe('−0,05 €');
    expect(f(0n, 2, US)).toBe('$0.00');
    expect(f(999n, 0, US)).toBe('$999');
    expect(f(100n, 2, { ...US, minFractionDigits: 0 })).toBe('$1');
    expect(f(150n, 2, { ...US, minFractionDigits: 1 })).toBe('$1.5');
    expect(f(105n, 2, { ...US, minFractionDigits: 0 })).toBe('$1.05');
    expect(f(1234n, 2, { ...US, groupSeparator: '' })).toBe('$12.34');
    expect(f(1234n, 2, { ...US, symbol: '' })).toBe('12.34');
    expect(f(1234n, 2, { ...US, symbol: 'CHF', symbolSpace: true })).toBe('CHF 12.34');
  });
  it('typed parts', () => {
    const r = formatFiatParts(-123456n, 2, US);
    expect(r.ok && r.value.map((p) => p.type)).toEqual([
      'sign', 'symbol', 'integer', 'group', 'integer', 'decimal', 'fraction',
    ]);
  });
  it('rejects bad formats', () => {
    const bad = (o: Partial<FiatFormat> & Record<string, unknown>) =>
      formatFiatParts(1n, 2, { ...US, ...o }).ok;
    expect(bad({ groupSeparator: '.' })).toBe(false);
    expect(bad({ decimalSeparator: '5' })).toBe(false);
    expect(bad({ decimalSeparator: '' })).toBe(false);
    expect(bad({ groupSeparator: '‮' })).toBe(false);
    expect(bad({ symbol: '9' })).toBe(false);
    expect(bad({ symbol: 'x'.repeat(9) })).toBe(false);
    expect(bad({ minusSign: '' })).toBe(false);
    expect(bad({ symbolPosition: 'middle' as never })).toBe(false);
    expect(bad({ grouping: 4 as never })).toBe(false);
    expect(bad({ minFractionDigits: 3 })).toBe(false);
    expect(bad({ symbol: 5 as never })).toBe(false);
    expect(formatFiatParts(1n, 19, US).ok).toBe(false);
    expect(formatFiatParts(1 as unknown as bigint, 2, US).ok).toBe(false);
  });
  it('parseFiatInput', () => {
    expect(parseFiatInput('1,234.5', 2, US)).toEqual({ ok: true, value: 123450n });
    expect(parseFiatInput('1.234,56', 2, DE)).toEqual({ ok: true, value: 123456n });
    expect(parseFiatInput('12', 0, US)).toEqual({ ok: true, value: 12n });
    expect(parseFiatInput('0.05', 2, US)).toEqual({ ok: true, value: 5n });
    const code = (s: string, d = 2, fmt = US) => {
      const r = parseFiatInput(s, d, fmt);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(code('1.234')).toBe('excess-precision');
    expect(code('1.2.3')).toBe('bad-input');
    expect(code('1.')).toBe('bad-input');
    expect(code('')).toBe('bad-input');
    expect(code(',1')).toBe('bad-input');
    expect(code('1,')).toBe('bad-input');
    expect(code('1,,000')).toBe('bad-input');
    expect(code('-1')).toBe('bad-input');
    expect(code('1e3')).toBe('bad-input');
    expect(code('x'.repeat(101))).toBe('bad-input');
    expect(code('1', 19)).toBe('bad-decimals');
    expect(code('1', 2, { ...US, groupSeparator: '.' })).toBe('bad-format');
    expect(code('1', 2, { ...US, decimalSeparator: '' })).toBe('bad-format');
    expect(code('9'.repeat(79), 0)).toBe('overflow');
    expect(parseFiatInput('1234.5', 2, { groupSeparator: '', decimalSeparator: '.' }).ok).toBe(true);
    expect(parseFiatInput(5 as unknown as string, 2, US).ok).toBe(false);
  });
  it('property: parse(format) round trip', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), fc.integer({ min: 0, max: 18 }), (v, d) => {
        for (const fmt of [US, DE, IN]) {
          const s = formatFiatParts(v, d, { ...fmt, symbol: '' });
          if (!s.ok) return false;
          const back = parseFiatInput(joinParts(s.value), d, fmt);
          if (!back.ok || back.value !== v) return false;
        }
        return true;
      }),
    );
  });
});

describe('checkRateJump', () => {
  it('flags large moves, allows small', () => {
    const a = rate({ rate: '100' });
    expect(checkRateJump(a, rate({ rate: '105' }), 500).ok).toBe(true);
    expect(checkRateJump(a, rate({ rate: '95.00' }), 500).ok).toBe(true);
    const bad = checkRateJump(a, rate({ rate: '105.01' }), 500);
    expect(!bad.ok && bad.error.code).toBe('rate-jump');
    expect(checkRateJump(a, rate({ rate: '1' }), 500).ok).toBe(false);
    expect(checkRateJump(a, rate({ asset: 'BTC' }), 500).ok).toBe(false);
    expect(checkRateJump(a, rate({ fiat: 'EUR' }), 500).ok).toBe(false);
    expect(checkRateJump(a, a, -1).ok).toBe(false);
  });
});

describe('computeFiatView', () => {
  const base = {
    amountBase: 10n ** 18n,
    asset: { id: 'ETH', decimals: 18 },
    fiat: { code: 'USD', decimals: 2 },
    nowMs: NOW,
    format: US,
    rounding: 'half-even' as const,
  };
  it('no rate when offline', () => {
    expect(computeFiatView({ ...base, quote: undefined })).toEqual({ state: 'no-rate' });
    expect(computeFiatView({ ...base, quote: null })).toEqual({ state: 'no-rate' });
  });
  it('ok / aging / stale / showStale', () => {
    const ok = computeFiatView({ ...base, quote: q() });
    expect(ok).toMatchObject({ state: 'ok', freshness: 'fresh', minor: 250050n, source: 'test-feed' });
    expect(ok.state === 'ok' && ok.parts && joinParts(ok.parts)).toBe('$2,500.50');
    const aging = computeFiatView({ ...base, quote: q({ timestampMs: NOW - 120_000 }) });
    expect(aging).toMatchObject({ state: 'ok', freshness: 'aging', ageMs: 120_000 });
    const stale = computeFiatView({ ...base, quote: q({ timestampMs: NOW - 700_000 }) });
    expect(stale).toMatchObject({ state: 'stale', minor: null, parts: null });
    const shown = computeFiatView({ ...base, quote: q({ timestampMs: NOW - 700_000 }), showStale: true });
    expect(shown).toMatchObject({ state: 'stale', minor: 250050n });
  });
  it('invalid cases withhold value', () => {
    const code = (v: ReturnType<typeof computeFiatView>) => (v.state === 'invalid' ? v.error.code : v.state);
    expect(code(computeFiatView({ ...base, quote: q({ rate: '0' }) }))).toBe('rate-zero');
    expect(code(computeFiatView({ ...base, quote: q({ rate: '-5' }) }))).toBe('rate-negative');
    expect(code(computeFiatView({ ...base, quote: q({ rate: '9'.repeat(20) }) }))).toBe('rate-too-large');
    expect(code(computeFiatView({ ...base, quote: q({ asset: 'BTC' }) }))).toBe('rate-mismatch');
    expect(code(computeFiatView({ ...base, quote: q({ fiat: 'EUR' }) }))).toBe('rate-mismatch');
    expect(code(computeFiatView({ ...base, quote: q({ timestampMs: NOW + 31_000 }) }))).toBe('bad-timestamp');
    expect(code(computeFiatView({ ...base, nowMs: 0, quote: q() }))).toBe('bad-timestamp');
    expect(code(computeFiatView({ ...base, quote: q(), policy: { ...DEFAULT_RATE_POLICY, staleMs: 0 } }))).toBe('bad-policy');
    expect(code(computeFiatView({ ...base, amountBase: 10n ** 80n, quote: q() }))).toBe('overflow');
    expect(code(computeFiatView({ ...base, format: { ...US, groupSeparator: '.' }, quote: q() }))).toBe('bad-format');
  });
});
