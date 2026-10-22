import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ForbiddenCharacterError, SchemaError, validateInvoice, validatePrivatePart } from './index.js';
import { sampleInvoice } from './fixtures.testutil.js';

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const FORBIDDEN = [
  ...range(0x202a, 0x202e),
  ...range(0x2066, 0x2069),
  0x200e,
  0x200f,
  0x061c,
  ...range(0x200b, 0x200d),
  0x2060,
  0xfeff,
  0x00ad,
  ...range(0xe0000, 0xe007f),
  ...range(0x00, 0x1f),
  ...range(0x7f, 0x9f),
];
const cp = (n: number): string => String.fromCodePoint(n);

const withDescription = (d: string): unknown => ({ lineItems: [{ description: d, quantity: '1', unitMinorUnits: '1' }] });
const withMemo = (m: string): unknown => ({ lineItems: [], memo: m });
function err(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('S3-12 forbidden characters in free text', () => {
  it.each(FORBIDDEN)('rejects U+%i in a line-item description with a typed error', (n) => {
    const e = err(() => validatePrivatePart(withDescription(`a${cp(n)}b`)));
    expect(e).toBeInstanceOf(ForbiddenCharacterError);
    expect(e).toBeInstanceOf(SchemaError);
    expect((e as ForbiddenCharacterError).code).toBe('FORBIDDEN_CHARACTER');
    expect((e as ForbiddenCharacterError).path).toBe('lineItems[0].description');
    expect((e as Error).message).not.toContain(cp(n));
  });
  it.each(FORBIDDEN.filter((n) => n !== 0x0a))('rejects U+%i in a memo', (n) => {
    const e = err(() => validatePrivatePart(withMemo(`a${cp(n)}b`)));
    expect((e as ForbiddenCharacterError).code).toBe('FORBIDDEN_CHARACTER');
    expect((e as ForbiddenCharacterError).path).toBe('memo');
  });
  it('allows a line feed in the memo only', () => {
    expect(validatePrivatePart(withMemo('line1\nline2')).memo).toBe('line1\nline2');
    expect(err(() => validatePrivatePart(withDescription('a\nb')))).toBeInstanceOf(ForbiddenCharacterError);
    expect(err(() => validatePrivatePart(withMemo('a\r\nb')))).toBeInstanceOf(ForbiddenCharacterError);
    expect(err(() => validatePrivatePart(withMemo('a\tb')))).toBeInstanceOf(ForbiddenCharacterError);
  });
  it('rejects them in a full invoice too (strict validateInvoice)', () => {
    const base = sampleInvoice();
    const memo = { ...base, memo: `pay‮evil` };
    expect((err(() => validateInvoice(memo)) as ForbiddenCharacterError).code).toBe('FORBIDDEN_CHARACTER');
    const items = { ...base, lineItems: [{ description: 'x​y', quantity: '1', unitMinorUnits: '1' }] };
    expect((err(() => validateInvoice(items)) as ForbiddenCharacterError).path).toBe('lineItems[0].description');
  });
  it('still accepts ordinary international text, emoji and ZWJ-free scripts', () => {
    for (const t of ['Café au lait', '東京 ラーメン', 'Привет мир', 'Ünïcödé', '😀 party', 'עברית', 'مرحبا'])
      expect(validatePrivatePart(withDescription(t)).lineItems[0]?.description).toBe(t);
  });
  it('property: any string containing a forbidden code point is rejected, with the typed code', () => {
    const forbidden = fc.constantFrom(...FORBIDDEN.filter((n) => n !== 0x0a));
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), forbidden, fc.string({ maxLength: 20 }), (a, n, b) => {
        for (const mk of [withDescription, withMemo]) {
          const e = err(() => validatePrivatePart(mk(a + cp(n) + b)));
          // A string that fails an earlier hygiene check (lone surrogate / non-NFC) may report plain SCHEMA; never a pass.
          expect(e).toBeInstanceOf(SchemaError);
          const s = a + cp(n) + b;
          if (s === s.normalize('NFC') && !/[\ud800-\udfff]/u.test(a + b))
            expect((e as SchemaError).code).toBe('FORBIDDEN_CHARACTER');
        }
      }),
      { numRuns: 500 },
    );
  });
  it('property: strings built only from allowed characters never raise FORBIDDEN_CHARACTER', () => {
    const allowed = fc.string({ unit: fc.constantFrom(...Array.from('abcXYZ019 .,;:-_é東😀')), minLength: 1, maxLength: 50 });
    fc.assert(
      fc.property(allowed, (t) => {
        expect(validatePrivatePart(withDescription(t)).lineItems[0]?.description).toBe(t.normalize('NFC'));
      }),
      { numRuns: 300 },
    );
  });
  it('fuzz: arbitrary unicode never throws anything but SchemaError, and accepted text has no forbidden characters', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 60 }), (s) => {
        for (const mk of [withDescription, withMemo]) {
          try {
            const r = validatePrivatePart(mk(s));
            const out = mk === withMemo ? (r.memo as string) : (r.lineItems[0]?.description as string);
            for (const ch of out) expect(FORBIDDEN.includes(ch.codePointAt(0) as number) && ch !== '\n').toBe(false);
          } catch (e) {
            expect(e).toBeInstanceOf(SchemaError);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });
});
