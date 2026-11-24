import { describe, expect, it } from 'vitest';
import { normalizeTag, type AddressBook } from './contacts.js';
import { searchContacts } from './search.js';

const book: AddressBook = {
  contacts: [
    {
      id: 'a'.repeat(32),
      label: 'Alice',
      address: '0x' + '1'.repeat(40),
      network: 'eth',
      tags: [normalizeTag(' ＷＯＲＫ '), normalizeTag('ＶＩＰ')],
      note: 'Berlin',
      createdAt: 1000,
      updatedAt: 2000,
    },
    {
      id: 'b'.repeat(32),
      label: 'Bob',
      address: '0x' + '2'.repeat(40),
      network: 'btc',
      tags: [normalizeTag('work')],
      note: '',
      createdAt: 2000,
      updatedAt: 3000,
    },
  ],
};

describe('searchContacts normalized tag filters', () => {
  it('finds a saved tag using any canonically equivalent NFKC filter spelling', () => {
    expect(book.contacts[0]?.tags).toEqual(['work', 'vip']);
    for (const queryTag of ['work', 'WORK', ' ＷＯＲＫ ', 'ｗｏｒｋ']) {
      expect(searchContacts(book, { tags: [queryTag], network: 'eth' }).map((c) => c.label)).toEqual(['Alice']);
    }
  });

  it('keeps the all-tags requirement, network scope, free-text query and original inputs', () => {
    const requested = [' ＷＯＲＫ ', 'ＶＩＰ'];
    expect(searchContacts(book, { tags: requested, query: 'berlin' }).map((c) => c.label)).toEqual(['Alice']);
    expect(searchContacts(book, { tags: requested, network: 'btc' })).toEqual([]);
    expect(searchContacts(book, { tags: ['ＵＮＫＮＯＷＮ'] })).toEqual([]);
    expect(searchContacts(book, { tags: ['work'] }).map((c) => c.label)).toEqual(['Alice', 'Bob']);
    expect(requested).toEqual([' ＷＯＲＫ ', 'ＶＩＰ']);
    expect(book.contacts[0]?.tags).toEqual(['work', 'vip']);
  });
});
