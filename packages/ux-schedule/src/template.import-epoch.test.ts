import { describe, expect, it } from 'vitest';
import { createTemplate, parseTemplates, updateTemplate } from './template.js';

const MAX_EPOCH_MS = 8_640_000_000_000_000;
const template = {
  id: 'rent',
  name: 'Rent',
  chain: 'eip155:1',
  asset: 'USDC',
  recipient: 'synthetic-recipient',
  amount: '100',
};
const stored = { ...template, createdAtMs: 1, updatedAtMs: 2 };

describe('template import epoch bounds', () => {
  it('rejects a creation and update timestamp beyond the clock domain', () => {
    const invalid = { ...stored, createdAtMs: MAX_EPOCH_MS + 1, updatedAtMs: MAX_EPOCH_MS + 1 };
    expect(parseTemplates([invalid])).toEqual({
      ok: false,
      error: { code: 'bad_time', message: 'invalid template timestamps' },
    });
    expect(() => createTemplate(template, () => MAX_EPOCH_MS + 1)).toThrow(RangeError);
  });

  it('rejects an out-of-range update timestamp even with a valid creation time', () => {
    expect(parseTemplates([{ ...stored, updatedAtMs: MAX_EPOCH_MS + 1 }])).toEqual({
      ok: false,
      error: { code: 'bad_time', message: 'invalid template timestamps' },
    });
  });

  it('preserves the inclusive epoch endpoints and ordinary round trips', () => {
    for (const now of [0, 1_000, MAX_EPOCH_MS]) {
      const made = createTemplate(template, () => now);
      if (!made.ok) throw new Error('fixture rejected');
      expect(parseTemplates([made.value])).toEqual({ ok: true, value: [made.value] });
      const updated = updateTemplate(made.value, { amount: '200' }, () => now);
      if (!updated.ok) throw new Error('update rejected');
      expect(parseTemplates([updated.value])).toEqual({ ok: true, value: [updated.value] });
    }
  });

  it('still rejects reversed timestamps and invalid entries in an otherwise valid list', () => {
    const badTime = { ok: false, error: { code: 'bad_time', message: 'invalid template timestamps' } };
    expect(parseTemplates([{ ...stored, updatedAtMs: 0 }])).toEqual(badTime);
    expect(parseTemplates([stored, { ...stored, id: 'other', name: 'Other', updatedAtMs: MAX_EPOCH_MS + 1 }])).toEqual(badTime);
  });
});
