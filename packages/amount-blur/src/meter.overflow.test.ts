import { describe, expect, it } from 'vitest';
import { AmountBlurError } from './errors.js';
import { estimateCrowd, honestyMeter } from './meter.js';

describe('crowd estimate intermediate overflow regression', () => {
  it('does not inflate a representable two-event crowd into the larger label', () => {
    const input = {
      eventsPerDay: Number.MAX_VALUE,
      windowDays: 2,
      amountBuckets: Number.MAX_VALUE,
    };
    expect(estimateCrowd(input)).toEqual({ A: 2, label: 'tiny' });
    expect(honestyMeter({ mode: 'round', crowd: input })?.crowd).toBe('tiny');
  });

  it('returns finite estimates when the multiplication overflows but the quotient fits', () => {
    expect(estimateCrowd({
      eventsPerDay: Number.MAX_VALUE,
      windowDays: Number.MAX_VALUE,
      amountBuckets: Number.MAX_VALUE,
    })).toEqual({ A: Number.MAX_VALUE, label: 'larger' });
  });

  it('rejects a mathematically unrepresentable estimate with the existing typed error', () => {
    expect(() => estimateCrowd({
      eventsPerDay: Number.MAX_VALUE,
      windowDays: 2,
      amountBuckets: 1,
    })).toThrow(AmountBlurError);
  });

  it('preserves ordinary crowd thresholds and a subnormal but finite result', () => {
    expect(estimateCrowd({ eventsPerDay: 10, windowDays: 3, amountBuckets: 20 }))
      .toEqual({ A: 1.5, label: 'none' });
    expect(estimateCrowd({ eventsPerDay: 1e-200, windowDays: 1e200, amountBuckets: 1e200 }))
      .toEqual({ A: 1e-200, label: 'none' });
  });
});
