import { describe, expect, it } from 'vitest';
import { UxFeesError } from './errors.js';
import { adviseSweepTiming, type SweepTimingInput } from './timing.js';

const gwei = 1_000_000_000n;
const history = Array.from({ length: 100 }, (_, i) => BigInt(i + 1) * gwei);
const base = (urgency?: SweepTimingInput['urgency']): SweepTimingInput => ({
  history,
  now: 1_800_000_000n,
  current: 90n * gwei,
  ...(urgency === undefined ? {} : { urgency }),
});

describe('sweep timing urgency runtime validation', () => {
  it.each(['emergency', 'URGENT', '', 'urgent ', 0, false, null, {}, []])(
    'rejects unrecognized runtime urgency %s rather than treating it as normal',
    (urgency) => {
      expect(() => adviseSweepTiming({ ...base(), urgency: urgency as never })).toThrow(UxFeesError);
      expect(() => adviseSweepTiming({ ...base(), urgency: urgency as never })).toThrow(/urgency/i);
    },
  );

  it('preserves missing/default and explicit normal as wait, explicit urgent as ok', () => {
    expect(adviseSweepTiming(base()).advice).toBe('wait');
    expect(adviseSweepTiming(base('normal')).advice).toBe('wait');
    const urgent = adviseSweepTiming(base('urgent'));
    expect(urgent.advice).toBe('ok');
    expect(urgent.reasons.map((r) => r.key)).toContain('fees.timing.reason.highButUrgent');
  });
});
