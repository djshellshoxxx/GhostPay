import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT, assertDecimals, formatUnits, parseUnits } from './amount.js';
import { ExportError } from './errors.js';
import { MAX_TIMESTAMP_MS, formatTimestamp, parseTimestamp } from './time.js';

describe('formatUnits', () => {
  it.each([
    [0n, 0, '0'],
    [0n, 6, '0.000000'],
    [1n, 6, '0.000001'],
    [1_500_000n, 6, '1.500000'],
    [123n, 0, '123'],
    [-5n, 1, '-0.5'],
    [10n ** 30n + 1n, 18, '1000000000000.000000000000000001'],
    [MAX_AMOUNT, 18, '115792089237316195423570985008687907853269984665640564039457.584007913129639935'],
  ])('%s/%s -> %s', (v, d, s) => {
    expect(formatUnits(v, d)).toBe(s);
  });
  it('trims zeros on request', () => {
    expect(formatUnits(1_500_000n, 6, true)).toBe('1.5');
    expect(formatUnits(2_000_000n, 6, true)).toBe('2');
    expect(formatUnits(0n, 6, true)).toBe('0');
  });
  it('rejects bad decimals', () => {
    for (const d of [-1, 39, 1.5, NaN]) expect(() => assertDecimals(d)).toThrow(ExportError);
  });
  it('round-trips with parseUnits', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX_AMOUNT }),
        fc.integer({ min: 0, max: 38 }),
        fc.boolean(),
        (v, d, t) => {
          expect(parseUnits(formatUnits(v, d, t), d)).toBe(v);
        },
      ),
    );
  });
});

describe('parseUnits', () => {
  it('parses exact values', () => {
    expect(parseUnits('1.5', 6)).toBe(1_500_000n);
    expect(parseUnits('0', 0)).toBe(0n);
    expect(parseUnits('0.000001', 6)).toBe(1n);
    expect(parseUnits('12', 2)).toBe(1200n);
  });
  it.each([
    '',
    '-1',
    '+1',
    '1e3',
    ' 1',
    '1 ',
    '1.',
    '.5',
    '01',
    '1,000',
    '0x10',
    '1.2.3',
    '１',
    'NaN',
    'Infinity',
  ])('rejects %j', (s) => {
    expect(() => parseUnits(s, 6)).toThrow(ExportError);
  });
  it('rejects too much precision, overflow and long input', () => {
    expect(() => parseUnits('0.1234567', 6)).toThrow(/fractional/);
    expect(() => parseUnits('1.0', 0)).toThrow(/fractional/);
    expect(() => parseUnits((MAX_AMOUNT + 1n).toString(), 0)).toThrow(/uint256/);
    expect(parseUnits(MAX_AMOUNT.toString(), 0)).toBe(MAX_AMOUNT);
    expect(() => parseUnits('1'.repeat(121), 0)).toThrow(/long/);
  });
});

describe('timestamps', () => {
  const t = Date.UTC(2024, 0, 2, 3, 4, 5, 6);
  it('formats in UTC', () => {
    expect(formatTimestamp(t)).toBe('2024-01-02T03:04:05.006Z');
    expect(formatTimestamp(t, 'date')).toBe('2024-01-02');
    expect(formatTimestamp(t, 'unix')).toBe('1704164645');
    expect(formatTimestamp(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(formatTimestamp(MAX_TIMESTAMP_MS)).toBe('9999-12-31T23:59:59.999Z');
  });
  it('rejects invalid instants', () => {
    for (const ms of [-1, 1.5, NaN, MAX_TIMESTAMP_MS + 1, Infinity]) {
      expect(() => formatTimestamp(ms)).toThrow(ExportError);
    }
  });
  it('round-trips iso exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_TIMESTAMP_MS }), (ms) => {
        expect(parseTimestamp(formatTimestamp(ms))).toBe(ms);
      }),
    );
  });
  it('parses short fractions, date and unix', () => {
    expect(parseTimestamp('2024-01-02T03:04:05Z')).toBe(t - 6);
    expect(parseTimestamp('2024-01-02T03:04:05.5Z')).toBe(t - 6 + 500);
    expect(parseTimestamp('2024-02-29', 'date')).toBe(Date.UTC(2024, 1, 29));
    expect(parseTimestamp('1704164645', 'unix')).toBe(1704164645000);
    expect(parseTimestamp('0', 'unix')).toBe(0);
  });
  it.each([
    '2024-01-02T03:04:05+00:00',
    '2024-01-02T03:04:05',
    '2024-01-02 03:04:05Z',
    '2024-13-02T03:04:05Z',
    '2023-02-29T00:00:00Z',
    '2024-01-02T24:00:00Z',
    '2024-01-02T03:60:00Z',
    '2024-01-02T03:04:60Z',
    '0050-01-01T00:00:00Z',
    '2024-01-02T03:04:05.1234Z',
    'x'.repeat(41),
    '',
  ])('rejects iso %j', (s) => {
    expect(() => parseTimestamp(s)).toThrow(ExportError);
  });
  it('rejects bad date and unix', () => {
    expect(() => parseTimestamp('2023-02-29', 'date')).toThrow(ExportError);
    expect(() => parseTimestamp('2024-1-1', 'date')).toThrow(ExportError);
    for (const s of ['-1', '01', '1.5', '1e3', '', '9999999999999']) {
      expect(() => parseTimestamp(s, 'unix')).toThrow(ExportError);
    }
  });
});
