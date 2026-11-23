import { describe, expect, it } from 'vitest';
import { createTemplate, parseTemplates } from './template.js';
import { validateSnapshot } from './scheduled.js';
import { validText } from './validate.js';

const valid = {
  id: 'plan-1',
  name: 'Dinner',
  chain: 'eth',
  asset: 'ETH',
  recipient: '0x1234',
  amount: '10',
  memo: 'Monthly',
};

describe('schedule text rejects ill-formed UTF-16', () => {
  it.each([
    ['isolated high surrogate', '\uD800'],
    ['isolated low surrogate', '\uDC00'],
    ['embedded high surrogate', 'A\uD800B'],
    ['embedded low surrogate', 'A\uDC00B'],
    ['one unmatched high before a valid pair', '\uD800\uD83D\uDE80'],
    ['one unmatched low after a valid pair', '\uD83D\uDE80\uDC00'],
  ])('rejects %s', (_label, input) => {
    expect(validText(input, 'name', 1, 64)).toMatchObject({
      ok: false,
      error: { code: 'bad_text' },
    });
  });

  it('rejects malformed names and memos at existing template and scheduled-payment entrypoints', () => {
    expect(createTemplate({ ...valid, name: '\uD800' }, () => 1000)).toMatchObject({
      ok: false,
      error: { code: 'bad_text' },
    });
    expect(parseTemplates([{ ...valid, memo: 'note\uDC00', createdAtMs: 1000, updatedAtMs: 1000 }]))
      .toMatchObject({ ok: false, error: { code: 'bad_text' } });
    expect(validateSnapshot({
      chain: valid.chain,
      asset: valid.asset,
      recipient: valid.recipient,
      amount: valid.amount,
      memo: '\uD800',
    })).toMatchObject({ ok: false, error: { code: 'bad_text' } });
  });

  it('retains valid astral pairs, empty memos, length checks and existing control/bidi rejection', () => {
    expect(validText('🚀'.repeat(64), 'name', 1, 64)).toEqual({
      ok: true, value: '🚀'.repeat(64),
    });
    expect(validText('', 'memo', 0, 140)).toEqual({ ok: true, value: '' });
    expect(validText('🚀'.repeat(65), 'name', 1, 64)).toMatchObject({
      ok: false, error: { code: 'bad_text' },
    });
    expect(validText('line\nbreak', 'memo', 0, 140)).toMatchObject({
      ok: false, error: { code: 'bad_text' },
    });
    expect(validText('a\u202Eb', 'memo', 0, 140)).toMatchObject({
      ok: false, error: { code: 'bad_text' },
    });
    expect(createTemplate({ ...valid, name: '🚀' }, () => 1000)).toMatchObject({
      ok: true, value: { name: '🚀' },
    });
  });
});
