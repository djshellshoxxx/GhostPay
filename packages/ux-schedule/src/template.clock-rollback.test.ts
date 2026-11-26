import { describe, expect, it } from 'vitest';
import { createTemplate, parseTemplates, updateTemplate } from './template.js';

const input = {
  id: 'rent',
  name: 'Rent',
  chain: 'test',
  asset: 'TEST',
  recipient: 'synthetic-address',
  amount: '100',
  memo: 'test',
};

function created() {
  const r = createTemplate(input, () => 1000);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('template edit timestamps across clock corrections', () => {
  it.each([900, 0])('keeps an edit importable when the clock moves back to %i', (now) => {
    const original = created();
    const r = updateTemplate(original, { amount: '200' }, () => now);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.createdAtMs).toBe(1000);
    expect(r.value.updatedAtMs).toBe(1000);
    expect(r.value.amount).toBe('200');
    expect(parseTemplates([r.value])).toEqual({ ok: true, value: [r.value] });
  });

  it('does not move a previous edit timestamp backwards', () => {
    const r = updateTemplate(created(), { name: 'First edit' }, () => 2000);
    if (!r.ok) throw new Error(r.error.code);
    const next = updateTemplate(r.value, { name: 'Second edit' }, () => 1500);
    if (!next.ok) throw new Error(next.error.code);
    expect(next.value.updatedAtMs).toBe(2000);
    expect(next.value.name).toBe('Second edit');
    expect(updateTemplate(next.value, {}, () => 2500)).toMatchObject({
      ok: true,
      value: { createdAtMs: 1000, updatedAtMs: 2500 },
    });
  });

  it('keeps malformed imported times and broken clocks rejected', () => {
    const original = created();
    expect(parseTemplates([{ ...original, updatedAtMs: 999 }])).toMatchObject({
      ok: false,
      error: { code: 'bad_time' },
    });
    expect(() => updateTemplate(original, {}, () => NaN)).toThrow(RangeError);
    expect(() => updateTemplate(original, {}, () => -1)).toThrow(RangeError);
  });
});
