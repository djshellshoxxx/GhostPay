import { describe, expect, it } from 'vitest';
import { addEntry, emptyBook, serializeBook, validateBook, type HandleBook } from './book.js';
import { LinkError } from './errors.js';
import { META_A, META_B } from './fixtures.testutil.js';

function rejectionCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof LinkError) return error.code;
    throw error;
  }
  return undefined;
}

const alice = { handle: 'alice', metaAddress: META_A, addedAt: 10 };
const bob = { handle: 'bob', metaAddress: META_B, addedAt: 11 };

describe('sparse handle-book entry rejection', () => {
  it('rejects a missing first entry rather than accepting an empty book', () => {
    const entries = new Array<unknown>(1);
    expect(rejectionCode(() => validateBook({ version: 1, entries }))).toBe('BOOK');
  });

  it('rejects a hole between valid entries instead of silently dropping it', () => {
    const entries = new Array<unknown>(3);
    entries[0] = alice;
    entries[2] = bob;
    expect(rejectionCode(() => validateBook({ version: 1, entries }))).toBe('BOOK');
  });

  it('rejects a trailing missing entry instead of truncating the book', () => {
    const entries = [alice] as unknown[];
    entries.length = 2;
    expect(rejectionCode(() => validateBook({ version: 1, entries }))).toBe('BOOK');
  });

  it('never serializes malformed sparse state as a valid but smaller book', () => {
    const entries = new Array<unknown>(2);
    entries[0] = alice;
    const book = { version: 1, entries } as HandleBook;
    expect(rejectionCode(() => serializeBook(book))).toBe('BOOK');
  });

  it('preserves normal dense, empty, and JSON-imported book behavior', () => {
    expect(validateBook(emptyBook())).toEqual(emptyBook());
    const dense = addEntry(addEntry(emptyBook(), alice), bob);
    expect(validateBook(dense)).toEqual(dense);
    expect(JSON.parse(serializeBook(dense))).toEqual(dense);
    expect(rejectionCode(() => validateBook({ version: 1, entries: [alice, null] }))).toBe('BOOK');
  });
});
