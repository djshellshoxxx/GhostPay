import { describe, expect, it } from 'vitest';
import { validateScheduledReminder } from './reminder-bridge.js';

const valid = {
  v: 1,
  id: 'rent_1',
  dueAtMs: 1_000,
  label: 'Rent',
  amount: '15',
  priority: 'normal',
  graceMs: 100,
} as const;

describe('scheduled reminder untrusted accessor boundary', () => {
  for (const key of ['v', 'id', 'dueAtMs', 'label', 'amount', 'priority', 'graceMs'] as const) {
    it(`returns a typed failure when the ${key} getter throws`, () => {
      const input: Record<string, unknown> = { ...valid };
      Object.defineProperty(input, key, {
        enumerable: true,
        configurable: true,
        get: () => {
          throw new Error('unreadable-reminder-field');
        },
      });
      expect(validateScheduledReminder(input)).toEqual({ ok: false, error: 'reminder_shape' });
    });
  }

  it('returns a typed failure when an imported object cannot enumerate its keys', () => {
    const input = new Proxy({ ...valid }, {
      ownKeys: () => {
        throw new Error('unreadable-reminder-keys');
      },
    });
    expect(validateScheduledReminder(input)).toEqual({ ok: false, error: 'reminder_shape' });
  });

  it('preserves valid reminder conversion and neighboring field error codes', () => {
    expect(validateScheduledReminder(valid)).toEqual({ ok: true, value: valid });
    expect(validateScheduledReminder({ ...valid, id: 'bad!' })).toEqual({
      ok: false,
      error: 'reminder_id',
    });
    expect(validateScheduledReminder({ ...valid, dueAtMs: -1 })).toEqual({
      ok: false,
      error: 'reminder_due',
    });
    expect(validateScheduledReminder({ ...valid, priority: 'emergency' })).toEqual({
      ok: false,
      error: 'reminder_priority',
    });
  });
});
