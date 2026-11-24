import { describe, expect, it } from 'vitest';
import { matchesAddress, redactAddress } from './address.js';

describe('EVM receipt address truncation round-trip', () => {
  const mixed = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';

  it.each([
    ['default truncation', mixed, 6, 4],
    ['short 0-prefix truncation', mixed, 1, 4],
    ['upper-case 0X prefix', '0XAbCdEf0123456789abcdef0123456789ABCDEF01', 6, 4],
    ['long suffix', mixed, 8, 8],
  ])('matches its own %s case-insensitively', (_name, actual, head, tail) => {
    const revealed = redactAddress(actual, { head, tail });
    expect(revealed).toBeDefined();
    expect(matchesAddress(revealed!, actual)).toBe(true);
    expect(matchesAddress(revealed!.toLowerCase(), actual)).toBe(true);
  });

  it('does not match different EVM recipients with the same prefix', () => {
    const revealed = redactAddress(mixed, { head: 6, tail: 4 })!;
    expect(matchesAddress(revealed, mixed.slice(0, -1) + '2')).toBe(false);
  });

  it('preserves case-sensitive truncation for non-0x addresses', () => {
    const actual = 'AbcdEF0123456789abcdef0123456789ABCDEF01';
    const revealed = redactAddress(actual, { head: 6, tail: 4 })!;
    expect(matchesAddress(revealed, actual)).toBe(true);
    expect(matchesAddress(revealed.slice(0, -4) + 'ef01', actual)).toBe(false);
  });

  it('preserves full-address EVM case folding and non-EVM case sensitivity', () => {
    expect(matchesAddress(mixed.toLowerCase(), mixed)).toBe(true);
    const other = 'AbcdEF0123456789abcdef0123456789ABCDEF01';
    expect(matchesAddress(other.toLowerCase(), other)).toBe(false);
  });
});
