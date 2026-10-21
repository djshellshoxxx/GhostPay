import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assertHandle, checkHandle, skeleton } from './handle.js';
import {
  addEntry,
  emptyBook,
  entryUri,
  findLookalikes,
  parseBook,
  removeEntry,
  resolveHandle,
  serializeBook,
  validateBook,
  MAX_ENTRIES,
  MAX_BOOK_JSON,
} from './book.js';
import { code, META_A, META_B, META_C } from './fixtures.testutil.js';

const reason = (s: unknown) => {
  const r = checkHandle(s);
  return r.ok ? 'OK' : r.reason;
};

describe('checkHandle', () => {
  it('accepts and canonicalises', () => {
    expect(checkHandle('@Alice-99')).toMatchObject({ ok: true, handle: 'alice-99' });
    expect(checkHandle('bob_smith')).toMatchObject({ ok: true, handle: 'bob_smith' });
    expect(reason('a'.repeat(32))).toBe('OK');
  });
  it('rejects each rule', () => {
    const t: [unknown, string][] = [
      [5, 'NOT_STRING'],
      ['ab', 'TOO_SHORT'],
      ['@a', 'TOO_SHORT'],
      ['a'.repeat(33), 'TOO_LONG'],
      [' alice', 'INVISIBLE'],
      ['ali​ce', 'INVISIBLE'],
      ['ali‮ce', 'INVISIBLE'],
      ['ali ce', 'INVISIBLE'],
      ['éric', 'INVISIBLE'],
      ['аlice', 'CONFUSABLE_NON_ASCII'],
      ['ｂob', 'CONFUSABLE_NON_ASCII'],
      ['bοb', 'CONFUSABLE_NON_ASCII'],
      ['ⅼisa', 'CONFUSABLE_NON_ASCII'],
      ['日本語', 'NON_ASCII'],
      ['éric', 'NON_ASCII'],
      ['a@b', 'INVALID_CHARS'],
      ['a b', 'INVISIBLE'],
      ['a.b', 'INVALID_CHARS'],
      ['@@ab', 'INVALID_CHARS'],
      ['-abc', 'BAD_EDGE'],
      ['abc_', 'BAD_EDGE'],
      ['a--b', 'DOUBLE_SEPARATOR'],
      ['a_-b', 'DOUBLE_SEPARATOR'],
      ['12345', 'ALL_DIGITS'],
      ['0xabc', 'LOOKS_LIKE_ADDRESS'],
      ['admin', 'RESERVED'],
      ['@GhostPay', 'RESERVED'],
      ['adm1n', 'LOOKALIKE_RESERVED'],
      ['gh0stpay', 'LOOKALIKE_RESERVED'],
      ['ghostpaY-', 'BAD_EDGE'],
      ['supp0rt', 'LOOKALIKE_RESERVED'],
      ['sup_port', 'LOOKALIKE_RESERVED'],
    ];
    for (const [i, r] of t) expect(reason(i), JSON.stringify(i)).toBe(r);
  });
  it('skeleton folds look-alikes', () => {
    expect(skeleton('paypal')).toBe(skeleton('paypa1'));
    expect(skeleton('modern')).toBe(skeleton('modem'));
    expect(skeleton('vvorld')).toBe(skeleton('world'));
    expect(skeleton('clock')).toBe(skeleton('dock'));
    expect(skeleton('B0b_x')).toBe('bobx');
    expect(skeleton('alice')).not.toBe(skeleton('alicia'));
  });
  it('assertHandle throws without leaking reason', () => {
    expect(assertHandle('Zed')).toMatchObject({ handle: 'zed' });
    expect(code(() => assertHandle('аlice'))).toBe('HANDLE');
  });
  it('never throws and output is always safe ASCII', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (s) => {
        const r = checkHandle(s);
        if (r.ok) expect(r.handle).toMatch(/^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/);
      }),
    );
  });
});

describe('book', () => {
  const base = addEntry(
    addEntry(emptyBook(), { handle: 'alice', metaAddress: META_A, label: 'Alice W.', addedAt: 10 }),
    { handle: 'Bob', metaAddress: META_B, addedAt: 11 },
  );
  it('adds, resolves exactly, removes', () => {
    expect(base.entries.map((e) => e.handle)).toEqual(['alice', 'bob']);
    expect(resolveHandle(base, '@ALICE')?.metaAddress).toBe(META_A);
    expect(resolveHandle(base, 'carol')).toBeUndefined();
    expect(code(() => resolveHandle(base, 'аlice'))).toBe('HANDLE');
    expect(removeEntry(base, 'alice').entries).toHaveLength(1);
    expect(removeEntry(base, 'nobody').entries).toHaveLength(2);
    expect(entryUri(base.entries[0]!)).toBe(`ghostpay:${META_A}`);
  });
  it('is immutable', () => {
    expect(emptyBook().entries).toHaveLength(0);
    expect(base.entries).toHaveLength(2);
    addEntry(base, { handle: 'carol', metaAddress: META_C, addedAt: 1 });
    expect(base.entries).toHaveLength(2);
  });
  it('blocks duplicates and look-alikes', () => {
    const add = (handle: string, meta: string) => () =>
      addEntry(base, { handle, metaAddress: meta, addedAt: 1 });
    expect(code(add('alice', META_C))).toBe('BOOK');
    expect(code(add('al1ce', META_C))).toBe('BOOK');
    expect(code(add('b0b', META_C))).toBe('BOOK');
    expect(code(add('carol', META_A))).toBe('BOOK');
    expect(code(add('carоl', META_C))).toBe('HANDLE');
    expect(code(add('carol', 'bad'))).toBe('TARGET');
    expect(code(() => addEntry(base, { handle: 'carol', metaAddress: META_C, addedAt: -1 }))).toBe('BOOK');
    expect(
      code(() => addEntry(base, { handle: 'carol', metaAddress: META_C, label: 'x‮', addedAt: 1 })),
    ).toBe('TEXT');
    expect(findLookalikes(base, 'al1ce').map((e) => e.handle)).toEqual(['alice']);
    expect(findLookalikes(base, 'alice')).toEqual([]);
  });
  it('caps entry count', () => {
    const entries = Array.from({ length: MAX_ENTRIES }, (_, i) => ({
      handle: `u${String(i).padStart(4, 'x')}`,
      metaAddress: META_A,
      addedAt: 1,
    }));
    expect(code(() => validateBook({ version: 1, entries: [...entries, ...entries] }))).toBe('BOOK');
    const full = { version: 1 as const, entries: entries as never };
    expect(code(() => addEntry(full, { handle: 'zzz', metaAddress: META_C, addedAt: 1 }))).toBe('BOOK');
  });
  it('JSON round trip and hostile imports', () => {
    const j = serializeBook(base);
    expect(j).toBe(
      `{"version":1,"entries":[{"handle":"alice","metaAddress":"${META_A}","label":"Alice W.","addedAt":10},{"handle":"bob","metaAddress":"${META_B}","addedAt":11}]}`,
    );
    expect(parseBook(j)).toEqual(base);
    const bad = [
      '',
      'nope',
      '[]',
      'null',
      '{"version":2,"entries":[]}',
      '{"version":1}',
      '{"version":1,"entries":{}}',
      '{"version":1,"entries":[],"x":1}',
      '{"__proto__":{"version":1},"version":1,"entries":[]}',
      `{"version":1,"entries":[{"handle":"Alice","metaAddress":"${META_A}","addedAt":1}]}`,
      `{"version":1,"entries":[{"handle":"alice","metaAddress":"${META_A}","addedAt":1.5}]}`,
      `{"version":1,"entries":[{"handle":"alice","metaAddress":"${META_A}","addedAt":1,"admin":true}]}`,
      `{"version":1,"entries":[{"handle":"alice","metaAddress":"${META_A}"}]}`,
      `{"version":1,"entries":[{"handle":"alice","metaAddress":"${META_A}","addedAt":1},{"handle":"a1ice","metaAddress":"${META_B}","addedAt":1}]}`,
      `{"version":1,"entries":[{"handle":"alice","metaAddress":"${META_A}","addedAt":1},{"handle":"zed","metaAddress":"${META_A}","addedAt":1}]}`,
    ];
    for (const b of bad)
      expect(
        code(() => parseBook(b)),
        b.slice(0, 60),
      ).toBeDefined();
    expect(code(() => parseBook('x'.repeat(MAX_BOOK_JSON + 1)))).toBe('BOOK');
    expect(code(() => parseBook(5))).toBe('BOOK');
  });
});
