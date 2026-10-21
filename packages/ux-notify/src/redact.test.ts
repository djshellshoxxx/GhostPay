import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { containsAddress, containsSensitive, maskAddress, sanitizeLabel } from './redact.js';
import { hasSensitiveQuery } from './urlsafety.js';
import { fail, intIn, isRecord, ok, onlyKeys } from './common.js';

const EVM = '0x1111111111111111111111111111111111111111';
const BTC = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

describe('redact', () => {
  it('detects addresses', () => {
    expect(containsAddress(`send to ${EVM}`)).toBe(true);
    expect(containsAddress(BTC)).toBe(true);
    expect(containsAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBe(true);
    expect(containsAddress('deadbeefdeadbeefdeadbeef')).toBe(true);
    expect(containsAddress('Lunch with Sam')).toBe(false);
  });
  it('detects amounts', () => {
    for (const s of ['$5', '5€', '12.50', '1,234.5', '5 USDC', '1000', 'paid 25.00 USD']) expect(containsSensitive(s), s).toBe(true);
    for (const s of ['A payment arrived.', 'Open the app', 'Payments received']) expect(containsSensitive(s), s).toBe(false);
  });
  it('masks addresses and never returns full ones', () => {
    expect(maskAddress(EVM)).toBe('0x1111…1111');
    expect(maskAddress('short')).toBe('••••');
    expect(maskAddress('bad address!!!!')).toBe('••••');
    fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9]{12,100}$/), (a) => maskAddress(a) !== a && maskAddress(a).length <= 11));
  });
  it('sanitizes labels', () => {
    expect(sanitizeLabel('  a\u0000b‮  c\n\td ')).toBe('a b c d');
    expect(sanitizeLabel('x'.repeat(100))).toHaveLength(40);
  });
});

describe('urlsafety', () => {
  it('flags secret-looking queries', () => {
    expect(hasSensitiveQuery('')).toBe(false);
    expect(hasSensitiveQuery('?page=2&tab=a')).toBe(false);
    expect(hasSensitiveQuery('?access_token=abc')).toBe(true);
    expect(hasSensitiveQuery('?x=' + 'A'.repeat(32))).toBe(true);
    expect(hasSensitiveQuery('?%74oken=1')).toBe(true);
    expect(hasSensitiveQuery('?flag')).toBe(false);
    expect(hasSensitiveQuery('?seed')).toBe(true);
    expect(hasSensitiveQuery('?a=%E0%A4%A')).toBe(false);
    expect(hasSensitiveQuery('?%E0%A4%A=1')).toBe(false);
  });
});

describe('common', () => {
  it('helpers', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord({})).toBe(true);
    expect(onlyKeys({ a: 1 }, ['a'])).toBe(true);
    expect(onlyKeys({ b: 1 }, ['a'])).toBe(false);
    expect(intIn(1.5, 0, 3)).toBe(false);
    expect(intIn(NaN, 0, 3)).toBe(false);
    expect(intIn('1', 0, 3)).toBe(false);
    expect(intIn(3, 0, 3)).toBe(true);
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(fail('x')).toEqual({ ok: false, error: 'x' });
  });
});
