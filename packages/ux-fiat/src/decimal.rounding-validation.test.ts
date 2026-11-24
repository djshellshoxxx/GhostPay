import { describe, expect, it } from 'vitest';
import { parseUnits } from './decimal.js';
import { ROUNDING_MODES } from './types.js';

describe('parseUnits supplied rounding-mode validation', () => {
  it('rejects unsupported runtime modes even when rounding is not needed', () => {
    const unsupported: readonly unknown[] = [
      'round',
      'HALF-EVEN',
      'half-even ',
      '',
      null,
      0,
      {},
      Symbol('rounding'),
    ];
    for (const mode of unsupported) {
      const invalidExcess = parseUnits('1.25', 1, mode as never);
      expect(invalidExcess).toEqual({
        ok: false,
        error: { code: 'bad-rounding', message: 'unknown rounding mode' },
      });
      const invalidExact = parseUnits('1.2', 1, mode as never);
      expect(invalidExact).toEqual({
        ok: false,
        error: { code: 'bad-rounding', message: 'unknown rounding mode' },
      });
    }
  });

  it('preserves accepted rounding modes and absent-mode precision behavior', () => {
    for (const mode of ROUNDING_MODES) {
      expect(parseUnits('1.2', 1, mode)).toEqual({ ok: true, value: 12n });
    }
    expect(parseUnits('1.25', 1, 'trunc')).toEqual({ ok: true, value: 12n });
    expect(parseUnits('1.25', 1, 'half-even')).toEqual({ ok: true, value: 12n });
    expect(parseUnits('1.25', 1, 'half-away')).toEqual({ ok: true, value: 13n });
    expect(parseUnits('1.25', 1, 'ceil')).toEqual({ ok: true, value: 13n });
    expect(parseUnits('1.2', 1)).toEqual({ ok: true, value: 12n });
    expect(parseUnits('1.25', 1)).toMatchObject({
      ok: false,
      error: { code: 'excess-precision' },
    });
  });
});
