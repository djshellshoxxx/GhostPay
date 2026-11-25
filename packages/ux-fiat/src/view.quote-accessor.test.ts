import { describe, expect, it } from 'vitest';
import type { RateQuote } from './types.js';
import { computeFiatView, type FiatViewInput } from './view.js';

const NOW = 1_700_000_000_000;
const quote: RateQuote = {
  asset: 'ETH',
  fiat: 'USD',
  rate: '2500.5',
  timestampMs: NOW - 1000,
  source: 'test-feed',
};
const input: FiatViewInput = {
  amountBase: 10n ** 18n,
  asset: { id: 'ETH', decimals: 18 },
  fiat: { code: 'USD', decimals: 2 },
  quote,
  nowMs: NOW,
  format: {
    symbol: '$',
    symbolPosition: 'prefix',
    symbolSpace: false,
    groupSeparator: ',',
    decimalSeparator: '.',
    grouping: 3,
    minusSign: '-',
  },
  rounding: 'half-even',
};

describe('computeFiatView untrusted quote property boundaries', () => {
  it.each(['asset', 'fiat', 'rate', 'timestampMs', 'source'] as const)(
    'returns invalid rather than throwing when quote.%s getter throws',
    (field) => {
      const malformed = { ...quote };
      Object.defineProperty(malformed, field, {
        enumerable: true,
        get() { throw new Error('fixture quote accessor failed'); },
      });
      expect(computeFiatView({ ...input, quote: malformed })).toEqual({
        state: 'invalid',
        error: { code: 'bad-rate-format', message: 'quote fields could not be read' },
      });
    },
  );

  it('returns invalid for a failing quote proxy access', () => {
    const malformed = new Proxy({ ...quote }, {
      get(target, property, receiver): unknown {
        if (property === 'asset') throw new Error('fixture quote proxy failed');
        return Reflect.get(target, property, receiver);
      },
    });
    expect(computeFiatView({ ...input, quote: malformed })).toEqual({
      state: 'invalid',
      error: { code: 'bad-rate-format', message: 'quote fields could not be read' },
    });
  });

  it('keeps valid, ordinarily malformed, offline, stale, and future cases unchanged', () => {
    const good = computeFiatView(input);
    expect(good.state).toBe('ok');
    if (good.state === 'ok') expect(good.minor).toBe(250_050n);

    const malformed = computeFiatView({ ...input, quote: { ...quote, rate: 'NaN' } });
    expect(malformed.state).toBe('invalid');
    if (malformed.state === 'invalid') expect(malformed.error.code).toBe('bad-rate-format');

    expect(computeFiatView({ ...input, quote: null })).toEqual({ state: 'no-rate' });

    const stale = computeFiatView({ ...input, quote: { ...quote, timestampMs: NOW - 700_000 } });
    expect(stale.state).toBe('stale');
    if (stale.state === 'stale') expect(stale.minor).toBeNull();

    const future = computeFiatView({ ...input, quote: { ...quote, timestampMs: NOW + 30_001 } });
    expect(future.state).toBe('invalid');
    if (future.state === 'invalid') expect(future.error.code).toBe('bad-timestamp');
  });
});
