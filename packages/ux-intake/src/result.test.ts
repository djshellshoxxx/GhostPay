import { describe, expect, it } from 'vitest';
import { err, errorKey, ok } from './result.js';

describe('result helpers', () => {
  it('builds ok/err and i18n keys', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('x')).toEqual({ ok: false, code: 'x' });
    expect(errorKey('open-redirect')).toBe('intake.error.open-redirect');
  });
});
