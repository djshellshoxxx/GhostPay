import { describe, expect, it } from 'vitest';
import { checkHandle } from './handle.js';

describe('local handle confusable diagnostics', () => {
  it('identifies uppercase Cyrillic confusables', () => {
    expect(checkHandle('Аlice')).toEqual({ ok: false, reason: 'CONFUSABLE_NON_ASCII' });
  });

  it('identifies uppercase Greek confusables', () => {
    expect(checkHandle('bΟb')).toEqual({ ok: false, reason: 'CONFUSABLE_NON_ASCII' });
    expect(checkHandle('Ρaul')).toEqual({ ok: false, reason: 'CONFUSABLE_NON_ASCII' });
  });

  it('preserves lowercase, ordinary non-ASCII and ASCII diagnostics', () => {
    expect(checkHandle('аlice')).toEqual({ ok: false, reason: 'CONFUSABLE_NON_ASCII' });
    expect(checkHandle('bοb')).toEqual({ ok: false, reason: 'CONFUSABLE_NON_ASCII' });
    expect(checkHandle('éric')).toEqual({ ok: false, reason: 'NON_ASCII' });
    expect(checkHandle('日本語')).toEqual({ ok: false, reason: 'NON_ASCII' });
    expect(checkHandle('Alice')).toEqual({ ok: true, handle: 'alice', skeleton: 'allce' });
    expect(checkHandle('admin')).toEqual({ ok: false, reason: 'RESERVED' });
  });
});
