import { describe, expect, it } from 'vitest';
import { parseRate } from './rate.js';
import type { RateQuote } from './types.js';

const NOW = 1_700_000_000_000;
const plain: RateQuote = {
  asset: 'ETH',
  fiat: 'USD',
  rate: '2.5',
  timestampMs: NOW,
  source: 'user-selected-feed',
};

describe('parseRate quote snapshot regression', () => {
  it('returns the validated asset rather than rereading a changing getter', () => {
    let reads = 0;
    const quote: RateQuote = {
      ...plain,
      get asset() {
        return ++reads === 1 ? 'ETH' : 'ETH\u202e';
      },
    };
    const result = parseRate(quote);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.asset).toBe('ETH');
    expect(reads).toBe(1);
  });

  it('uses exactly one validated read of fiat, source and timestamp', () => {
    let fiatReads = 0;
    let sourceReads = 0;
    let timeReads = 0;
    const quote: RateQuote = {
      ...plain,
      get fiat() {
        return ++fiatReads === 1 ? 'USD' : 'usd';
      },
      get source() {
        return ++sourceReads === 1 ? 'user-selected-feed' : '\u202e';
      },
      get timestampMs() {
        return ++timeReads === 1 ? NOW : -1;
      },
    };
    const result = parseRate(quote);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fiat).toBe('USD');
      expect(result.value.source).toBe('user-selected-feed');
      expect(result.value.timestampMs).toBe(NOW);
    }
    expect([fiatReads, sourceReads, timeReads]).toEqual([1, 1, 1]);
  });

  it('parses a quote whose rate getter changes after its first read', () => {
    let reads = 0;
    const quote: RateQuote = {
      ...plain,
      get rate() {
        return ++reads === 1 ? '2.5' : 'NaN';
      },
    };
    const result = parseRate(quote);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ num: 25n, scale: 1 });
    expect(reads).toBe(1);
  });

  it('returns a typed error if a quote accessor throws', () => {
    const quote: RateQuote = {
      ...plain,
      get source(): string {
        throw new Error('accessor failure');
      },
    };
    expect(() => parseRate(quote)).not.toThrow();
    const result = parseRate(quote);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-rate-format');
  });

  it('retains ordinary JSON quote validation and existing parsed values', () => {
    expect(parseRate({ ...plain })).toEqual({
      ok: true,
      value: {
        asset: 'ETH',
        fiat: 'USD',
        num: 25n,
        scale: 1,
        timestampMs: NOW,
        source: 'user-selected-feed',
      },
    });
    const result = parseRate({ ...plain, fiat: 'usd' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-fiat');
  });
});
