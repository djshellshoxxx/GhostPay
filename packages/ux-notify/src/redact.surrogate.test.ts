import { describe, expect, it } from 'vitest';
import { validateParams } from './notification.js';
import { sanitizeLabel } from './redact.js';

describe('notification label truncation across UTF-16 surrogate boundaries', () => {
  it('does not emit half an emoji at the default 40-unit notification label limit', () => {
    const label = '~'.repeat(39) + '🚀';
    expect(sanitizeLabel(label)).toBe('~'.repeat(39));
    expect(validateParams({ label })).toEqual({ ok: true, value: { label: '~'.repeat(39) } });
  });

  it('does not emit half an emoji at the 24-unit lock-screen title limit', () => {
    expect(sanitizeLabel('x'.repeat(23) + '📬', 24)).toBe('x'.repeat(23));
  });

  it('preserves a complete surrogate pair when both code units fit', () => {
    expect(sanitizeLabel('a'.repeat(38) + '🚀', 40)).toBe('a'.repeat(38) + '🚀');
    expect(sanitizeLabel('x'.repeat(22) + '📬', 24)).toBe('x'.repeat(22) + '📬');
  });

  it('preserves previous ASCII limits and existing whitespace/control sanitation', () => {
    expect(sanitizeLabel('b'.repeat(41), 40)).toBe('b'.repeat(40));
    expect(sanitizeLabel('  Inbox\n\t  ', 40)).toBe('Inbox');
    expect(sanitizeLabel('a\u202eb', 40)).toBe('a b');
  });
});
