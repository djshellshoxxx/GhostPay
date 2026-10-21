import { describe, expect, it } from 'vitest';
import {
  MAX_TEMPLATES, addTemplate, createTemplate, parseTemplates, removeTemplate, updateTemplate,
} from './template.js';
import { fixed, goodTemplate, noMemo } from './testutil.testutil.js';

const clock = fixed(1_000);
const mk = (o: object = {}) => createTemplate({ ...goodTemplate, ...o }, clock);
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

describe('createTemplate', () => {
  it('accepts a valid template and stamps times', () => {
    const r = mk();
    expect(r.ok && r.value.createdAtMs).toBe(1000);
    expect(r.ok && r.value.amount).toBe('1500000000');
  });
  it('memo optional', () => {
    const r = createTemplate(noMemo, clock);
    expect(r.ok && 'memo' in r.value).toBe(false);
  });
  it.each([
    [null], [[]], ['x'], [new (class A {})()],
  ])('rejects non-object %#', (v) => expect(code(createTemplate(v, clock))).toBe('bad_template'));
  it('rejects unknown keys (e.g. __proto__ style smuggling)', () => {
    expect(code(mk({ extra: 1 }))).toBe('unknown_field');
    expect(code(createTemplate(JSON.parse('{"__proto__":{"x":1}}'), clock))).toBe('unknown_field');
  });
  it.each([
    ['id', '', 'bad_id'], ['id', 'a b', 'bad_id'], ['id', 5, 'bad_id'],
    ['name', '', 'bad_text'], ['name', 'x'.repeat(65), 'bad_text'], ['name', 'a\nb', 'bad_text'],
    ['name', 'a‮b', 'bad_text'], ['name', 'a b', 'bad_text'], ['name', 3, 'bad_text'],
    ['chain', 'a b', 'bad_token'], ['asset', '', 'bad_token'],
    ['recipient', 'has space', 'bad_recipient'], ['recipient', '', 'bad_recipient'],
    ['recipient', 'é', 'bad_recipient'],
    ['amount', '0', 'bad_amount'], ['amount', '-5', 'bad_amount'], ['amount', '01', 'bad_amount'],
    ['amount', '1.5', 'bad_amount'], ['amount', 100, 'bad_amount'], ['amount', '1e3', 'bad_amount'],
    ['amount', '9'.repeat(79), 'bad_amount'],
    ['memo', 'x'.repeat(141), 'bad_text'],
  ])('rejects bad %s=%j', (k, v, c) => expect(code(mk({ [k]: v }))).toBe(c));
  it('counts memo in code points not UTF-16 units', () => {
    expect(code(mk({ memo: '😀'.repeat(140) }))).toBe('ok');
    expect(code(mk({ memo: '😀'.repeat(141) }))).toBe('bad_text');
  });
  it('throws on broken clock', () => {
    expect(() => createTemplate(goodTemplate, () => NaN)).toThrow(RangeError);
    expect(() => createTemplate(goodTemplate, () => -1)).toThrow(RangeError);
  });
});

describe('updateTemplate', () => {
  const base = (() => { const r = mk(); if (!r.ok) throw new Error(); return r.value; })();
  it('merges, revalidates and bumps updatedAt', () => {
    const r = updateTemplate(base, { amount: '42' }, fixed(5000));
    expect(r.ok && r.value.amount).toBe('42');
    expect(r.ok && r.value.createdAtMs).toBe(1000);
    expect(r.ok && r.value.updatedAtMs).toBe(5000);
    expect(r.ok && r.value.memo).toBe('monthly rent');
  });
  it('works without memo', () => {
    const b = createTemplate(noMemo, clock);
    if (!b.ok) throw new Error();
    expect(updateTemplate(b.value, { name: 'N' }, clock).ok).toBe(true);
  });
  it('id immutable, bad values rejected, non-object rejected', () => {
    expect(code(updateTemplate(base, { id: 'z' }, clock))).toBe('unknown_field');
    expect(code(updateTemplate(base, { amount: '0' }, clock))).toBe('bad_amount');
    expect(code(updateTemplate(base, 5, clock))).toBe('bad_template');
  });
});

describe('list ops', () => {
  const t = (id: string, name: string) => {
    const r = mk({ id, name });
    if (!r.ok) throw new Error();
    return r.value;
  };
  it('add/remove', () => {
    const a = addTemplate([], t('a', 'Alpha'));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(code(addTemplate(a.value, t('a', 'Other')))).toBe('duplicate_id');
    expect(code(addTemplate(a.value, t('b', 'ALPHA')))).toBe('duplicate_name');
    expect(code(removeTemplate(a.value, 'zzz'))).toBe('not_found');
    const r = removeTemplate(a.value, 'a');
    expect(r.ok && r.value.length).toBe(0);
  });
  it('size cap', () => {
    const list = Array.from({ length: MAX_TEMPLATES }, (_, i) => t(`i${i}`, `n${i}`));
    expect(code(addTemplate(list, t('x', 'x')))).toBe('too_many');
  });
});

describe('parseTemplates', () => {
  const stored = { ...goodTemplate, createdAtMs: 1, updatedAtMs: 2 };
  it('accepts valid', () => expect(parseTemplates([stored]).ok).toBe(true));
  it('all-or-nothing and strict', () => {
    expect(code(parseTemplates('x'))).toBe('bad_import');
    expect(code(parseTemplates(new Array(MAX_TEMPLATES + 1).fill(stored)))).toBe('too_many');
    expect(code(parseTemplates([5]))).toBe('bad_template');
    expect(code(parseTemplates([{ ...stored, evil: 1 }]))).toBe('unknown_field');
    expect(code(parseTemplates([{ ...stored, amount: '0' }]))).toBe('bad_amount');
    expect(code(parseTemplates([{ ...stored, createdAtMs: 'x' }]))).toBe('bad_time');
    expect(code(parseTemplates([{ ...stored, updatedAtMs: 0 }]))).toBe('bad_time');
    expect(code(parseTemplates([stored, stored]))).toBe('duplicate_id');
  });
});
