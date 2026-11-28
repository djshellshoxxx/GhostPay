import { describe, expect, it } from 'vitest';
import { buildAccessibleName } from './index.js';

describe('accessible-name Unicode truncation boundary', () => {
  it('does not retain half of an astral character in a long label', () => {
    expect(buildAccessibleName({ label: 'a'.repeat(158) + '😀xyz' })).toBe('a'.repeat(158) + '…');
  });

  it('does not retain half of an astral character in appended context', () => {
    expect(buildAccessibleName({ label: 'a'.repeat(156), context: '😀xyz' })).toBe('a'.repeat(156) + ', …');
  });

  it('keeps a complete pair immediately before the ellipsis', () => {
    expect(buildAccessibleName({ label: 'a'.repeat(157) + '😀xyz' })).toBe('a'.repeat(157) + '😀…');
  });

  it('preserves an exact-cap name and ordinary truncation', () => {
    expect(buildAccessibleName({ label: 'a'.repeat(158) + '😀' })).toBe('a'.repeat(158) + '😀');
    expect(buildAccessibleName({ label: 'a'.repeat(161) })).toBe('a'.repeat(159) + '…');
    expect(buildAccessibleName({ label: 'Send', context: 'Wallet 1' })).toBe('Send, Wallet 1');
  });
});
