import { describe, expect, it } from 'vitest';
import { formatFiatParts, joinParts, parseFiatInput, type FiatFormat } from './index.js';

const plain: FiatFormat = {
  symbol: '',
  symbolPosition: 'prefix',
  symbolSpace: false,
  groupSeparator: ',',
  decimalSeparator: '.',
  grouping: 3,
  minusSign: '-',
};

function rendered(minor: bigint, fmt: FiatFormat): string {
  const parts = formatFiatParts(minor, 2, fmt);
  expect(parts.ok).toBe(true);
  if (!parts.ok) throw new Error(parts.error.code);
  return joinParts(parts.value);
}

describe('fiat input: formatting round-trip with overlapping separator text', () => {
  it('parses a valid formatted value when the group separator contains the decimal separator', () => {
    const fmt = { ...plain, groupSeparator: '..' };
    const text = rendered(123456n, fmt);
    expect(text).toBe('1..234.56');
    expect(parseFiatInput(text, 2, fmt)).toEqual({ ok: true, value: 123456n });
  });

  it('also parses a grouped Indian-pattern amount when full group tokens contain the decimal token', () => {
    const fmt = { ...plain, grouping: 'indian' as const, groupSeparator: '.:', decimalSeparator: ':' };
    const text = rendered(123456789n, fmt);
    expect(text).toBe('12.:34.:567:89');
    expect(parseFiatInput(text, 2, fmt)).toEqual({ ok: true, value: 123456789n });
  });

  it('retains ordinary US and reverse-overlap parsing', () => {
    expect(parseFiatInput(rendered(123456n, plain), 2, plain)).toEqual({ ok: true, value: 123456n });
    const reverse = { ...plain, groupSeparator: '.', decimalSeparator: '..' };
    expect(parseFiatInput(rendered(123456n, reverse), 2, reverse)).toEqual({
      ok: true,
      value: 123456n,
    });
  });

  it('still rejects two separate decimal tokens and group tokens in the fractional part', () => {
    const fmt = { ...plain, groupSeparator: '..' };
    expect(parseFiatInput('1..234.5.6', 2, fmt)).toMatchObject({
      ok: false,
      error: { code: 'bad-input' },
    });
    expect(parseFiatInput('1..234.5..6', 2, fmt)).toMatchObject({
      ok: false,
      error: { code: 'bad-input' },
    });
  });
});
