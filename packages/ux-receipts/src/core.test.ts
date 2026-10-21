import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatAmount } from './amount.js';
import { canonicalJson } from './canonical.js';
import { sha256Hex } from './digest.js';
import { matchesAddress, redactAddress } from './address.js';
import { ReceiptError } from './errors.js';
import { detectSecretLikeText } from './secrets.js';
import { isIsoDay, isIsoInstant, isSafeMemo, sanitizeForDisplay, isForbiddenFieldName } from './validate.js';

describe('canonicalJson', () => {
  it('sorts keys and strips whitespace', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: { z: 2, y: 3 } })).toBe(
      '{"a":[true,null,"x"],"b":1,"c":{"y":3,"z":2}}',
    );
  });
  it('is insertion-order independent', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (d) => {
        const rev = Object.fromEntries(Object.entries(d).reverse());
        return canonicalJson(d) === canonicalJson(rev);
      }),
    );
  });
  it('round-trips through JSON.parse', () => {
    const leaf = fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null));
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(leaf, fc.array(leaf))), (v) => {
        const c = canonicalJson(v);
        return canonicalJson(JSON.parse(c)) === c;
      }),
    );
  });
  it.each([
    ['float', 1.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['undefined', undefined],
    ['bigint', 1n],
    ['function', () => 1],
    ['symbol', Symbol('x')],
    ['date', new Date(0)],
    ['map', new Map()],
  ])('rejects %s', (_n, v) => {
    expect(() => canonicalJson(v)).toThrow(ReceiptError);
    expect(() => canonicalJson({ k: v })).toThrow(ReceiptError);
  });
  it('rejects cycles via depth limit', () => {
    const a: Record<string, unknown> = {};
    a['a'] = a;
    expect(() => canonicalJson(a)).toThrow(/too deep/);
  });
  it('accepts null-prototype objects', () => {
    const o = Object.create(null) as Record<string, unknown>;
    o['k'] = 1;
    expect(canonicalJson(o)).toBe('{"k":1}');
  });
});

describe('sha256Hex', () => {
  it('matches known vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('throws NO_WEBCRYPTO when subtle missing', async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      await expect(sha256Hex('x')).rejects.toMatchObject({ code: 'NO_WEBCRYPTO' });
    } finally {
      Object.defineProperty(globalThis, 'crypto', desc!);
    }
  });
});

describe('formatAmount', () => {
  it.each([
    ['1500000', 6, '1.5'],
    ['1', 6, '0.000001'],
    ['1000000', 6, '1'],
    ['5', 0, '5'],
    ['123456789012345678901234567890', 18, '123456789012.34567890123456789'],
  ])('%s/%i', (a, d, e) => expect(formatAmount(a, d)).toBe(e));
  it('rejects bad input', () => {
    expect(() => formatAmount('0', 6)).toThrow(ReceiptError);
    expect(() => formatAmount('1.5', 6)).toThrow(ReceiptError);
    expect(() => formatAmount('10', 37)).toThrow(ReceiptError);
  });
});

describe('addresses', () => {
  const A = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';
  it('forms', () => {
    expect(redactAddress(A, 'full')).toBe(A);
    expect(redactAddress(A, 'hidden')).toBeUndefined();
    expect(redactAddress(A, { head: 6, tail: 4 })).toBe('0xAbCd...EF01');
  });
  it.each([
    [0, 4],
    [6, 0],
    [1.5, 2],
    [17, 1],
    [1, 17],
    [20, 2],
  ])('rejects truncation %i/%i', (head, tail) => {
    expect(() => redactAddress(A, { head, tail })).toThrow(/truncation/);
  });
  it('rejects non-addresses', () => {
    expect(() => redactAddress('short', 'full')).toThrow(ReceiptError);
    expect(() => redactAddress(A + '!', 'full')).toThrow(ReceiptError);
  });
  it('matches', () => {
    expect(matchesAddress(A, A.toLowerCase())).toBe(true);
    expect(matchesAddress('0xabcd...ef01', A)).toBe(true);
    expect(matchesAddress('0xabcd...ef02', A)).toBe(false);
    expect(matchesAddress('0xabcd...ef01', '0xabcdef01')).toBe(false);
    expect(matchesAddress('abcDEF0123456789abcd', 'abcdef0123456789abcd')).toBe(false); // non-0x exact
    expect(matchesAddress('0X1234...5678', '0x1234abcd5678')).toBe(true);
  });
  it('truncation never reveals more than half', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-f0-9]{20,64}$/),
        fc.integer({ min: 1, max: 16 }),
        fc.integer({ min: 1, max: 16 }),
        (a, h, t) => {
          try {
            const s = redactAddress(a, { head: h, tail: t })!;
            return s.length - 3 <= a.length / 2 && matchesAddress(s, a);
          } catch (e) {
            return e instanceof ReceiptError && h + t > Math.floor(a.length / 2);
          }
        },
      ),
    );
  });
});

describe('secret detection', () => {
  const positives: [string, string][] = [
    ['hex-256', 'k=' + 'ab'.repeat(32)],
    ['hex-256', '0x' + '12'.repeat(32)],
    [
      'extended-private-key',
      'xprv' +
        '9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    ],
    ['stealth-meta-address', 'st:eth:0x' + 'ab'.repeat(33)],
    ['key-word', 'my Viewing Key is secret'],
    ['key-word', 'private_key'],
    ['seed-word', 'seed phrase inside'],
    [
      'mnemonic-shaped',
      'abandon ability able about above absent absorb abstract absurd abuse access accident',
    ],
  ];
  it.each(positives)('flags %s', (reason, text) => expect(detectSecretLikeText(text)).toContain(reason));
  it('does not flag ordinary memos', () => {
    for (const m of ['Lunch split', 'Rent for March', 'invoice #1234', 'thanks! ' + 'ab'.repeat(10)]) {
      expect(detectSecretLikeText(m)).toEqual([]);
    }
  });
  it('does not flag 65 hex run as 256-bit boundary', () => {
    expect(detectSecretLikeText('a'.repeat(65))).toEqual([]);
  });
});

describe('validators', () => {
  it('dates', () => {
    expect(isIsoInstant('2026-02-29T00:00:00.000Z')).toBe(false);
    expect(isIsoInstant('2026-03-04T05:06:07Z')).toBe(false);
    expect(isIsoInstant(5)).toBe(false);
    expect(isIsoDay('2026-02-29')).toBe(false);
    expect(isIsoDay('2026-02-28')).toBe(true);
    expect(isIsoDay('2026-2-28')).toBe(false);
  });
  it('memo', () => {
    expect(isSafeMemo('ok')).toBe(true);
    expect(isSafeMemo('')).toBe(false);
    expect(isSafeMemo('a'.repeat(141))).toBe(false);
    expect(isSafeMemo('a\nb')).toBe(false);
    expect(isSafeMemo('a‮b')).toBe(false);
    expect(isSafeMemo('a​b')).toBe(false);
    expect(isSafeMemo(3)).toBe(false);
  });
  it('sanitize + forbidden names', () => {
    expect(sanitizeForDisplay('a‮b\u0007')).toBe('a�b�');
    for (const n of ['viewingKey', 'spending_key', 'stealth-meta', 'seedPhrase', 'privKey', 'scanKey']) {
      expect(isForbiddenFieldName(n)).toBe(true);
    }
    expect(isForbiddenFieldName('foo')).toBe(false);
  });
});
