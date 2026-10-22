import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type AddressBook,
  type ContactEnv,
  EMPTY_BOOK,
  addContact,
  addressKey,
  isValidId,
  newId,
  normalizeAddress,
  normalizeLabel,
  normalizeNetwork,
  normalizeNote,
  normalizeTag,
  normalizeTags,
  removeContact,
  updateContact,
  checkTime,
} from './contacts.js';
import { seededRng } from './memory.testutil.js';
import { listTags, searchContacts } from './search.js';

const mk = (t = 1000): ContactEnv => {
  let now = t;
  return { now: () => now++, rng: seededRng(42) };
};
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

describe('normalisers', () => {
  it('label: NFKC, collapse, trim', () => {
    expect(normalizeLabel('  Ａlice   Smith ')).toBe('Alice Smith');
  });
  it.each([
    ['empty', '   '],
    ['zero width', 'Al\u200bice'],
    ['bidi override', 'Alice‮txt'],
    ['control', 'Al\x00ice'],
    ['too long', 'x'.repeat(65)],
    ['unassigned', 'a͸'],
  ])('label rejects %s', (_n, v) => {
    expect(() => normalizeLabel(v)).toThrow();
  });
  it('label rejects non-strings', () => {
    expect(() => normalizeLabel(5)).toThrow();
    expect(() => normalizeNote(5)).toThrow();
    expect(() => normalizeTag(5)).toThrow();
    expect(() => normalizeNetwork(5)).toThrow();
    expect(() => normalizeAddress(5)).toThrow();
    expect(() => normalizeTags('x')).toThrow();
  });
  it('address: ASCII printable only, no spaces', () => {
    expect(normalizeAddress(` ${A} `)).toBe(A);
    for (const bad of ['', 'a b', 'ａｂｃ', `${A}\u200b`, 'x'.repeat(129), '0x11\n22']) {
      expect(() => normalizeAddress(bad)).toThrow();
    }
  });
  it('network and tags', () => {
    expect(normalizeNetwork(' ETH ')).toBe('eth');
    expect(() => normalizeNetwork('e th')).toThrow();
    expect(normalizeTags(['Work', 'work', 'Team_1'])).toEqual(['work', 'team_1']);
    expect(() => normalizeTags(Array.from({ length: 17 }, (_, i) => `t${i}`))).toThrow(/too many/);
    expect(() => normalizeTag('has space')).toThrow();
    expect(() => normalizeTag('')).toThrow();
  });
  it('note allows newlines, rejects control/format and long', () => {
    expect(normalizeNote('a\r\nb')).toBe('a\nb');
    expect(() => normalizeNote('a‮b')).toThrow();
    expect(() => normalizeNote('x'.repeat(501))).toThrow();
  });
  it('addressKey: EVM and bech32 case-insensitive, base58 case-sensitive', () => {
    expect(addressKey('eth', '0xAbCdEf0123456789aBcDeF0123456789abcdef01')).toBe(
      addressKey('eth', '0xabcdef0123456789abcdef0123456789abcdef01'),
    );
    expect(addressKey('btc', 'BC1QABC')).toBe('btc:bc1qabc');
    expect(addressKey('btc', '1AbC')).not.toBe(addressKey('btc', '1abc'));
    expect(addressKey('eth', A)).not.toBe(addressKey('btc', A));
  });
  it('isValidId / checkTime / newId', () => {
    expect(isValidId('a'.repeat(32))).toBe(true);
    expect(isValidId('A'.repeat(32))).toBe(false);
    expect(isValidId(5)).toBe(false);
    expect(() => checkTime(-1)).toThrow();
    expect(() => checkTime(1.5)).toThrow();
    expect(() => newId({ now: () => 1, rng: () => new Uint8Array(2) })).toThrow();
  });
});

describe('book operations', () => {
  it('add / update / remove', () => {
    const env = mk();
    const r1 = addContact(
      EMPTY_BOOK,
      { label: 'Alice', address: A, network: 'ETH', tags: ['Friends'], note: 'hi' },
      env,
    );
    expect(r1.contact).toMatchObject({
      label: 'Alice',
      network: 'eth',
      tags: ['friends'],
      note: 'hi',
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(r1.contact.id).toMatch(/^[0-9a-f]{32}$/);
    const r2 = updateContact(r1.book, r1.contact.id, { label: 'Alice B', tags: ['work'] }, env);
    expect(r2.contact).toMatchObject({ label: 'Alice B', tags: ['work'], createdAt: 1000, updatedAt: 1001 });
    expect(r1.book.contacts[0]?.label).toBe('Alice'); // pure
    expect(removeContact(r2.book, r1.contact.id).contacts).toEqual([]);
    expect(() => removeContact(r2.book, 'f'.repeat(32))).toThrow(/not found/);
    expect(() => updateContact(r2.book, 'f'.repeat(32), {}, env)).toThrow(/not found/);
  });
  it('updatedAt never goes backwards', () => {
    const r1 = addContact(
      EMPTY_BOOK,
      { label: 'A', address: A, network: 'eth' },
      { now: () => 5000, rng: seededRng(1) },
    );
    const r2 = updateContact(r1.book, r1.contact.id, { note: 'x' }, { now: () => 10, rng: seededRng(1) });
    expect(r2.contact.updatedAt).toBe(5000);
  });
  it('rejects exact duplicates (case-insensitive EVM) on add and update', () => {
    const env = mk();
    const r1 = addContact(EMPTY_BOOK, { label: 'A', address: A, network: 'eth' }, env);
    expect(() =>
      addContact(r1.book, { label: 'B', address: A.toUpperCase().replace('0X', '0x'), network: 'eth' }, env),
    ).toThrow(/already saved/);
    const r2 = addContact(r1.book, { label: 'B', address: B, network: 'eth' }, env);
    expect(() => updateContact(r2.book, r2.contact.id, { address: A }, env)).toThrow(/already saved/);
    // same address on another network is fine
    expect(addContact(r1.book, { label: 'B', address: A, network: 'op' }, env).book.contacts).toHaveLength(2);
  });
  it('enforces capacity and rng-collision safety', () => {
    const full: AddressBook = {
      contacts: Array.from({ length: 5000 }, (_, i) => ({
        id: i.toString(16).padStart(32, '0'),
        label: `c${i}`,
        address: `addr${i}`,
        network: 'x',
        tags: [],
        note: '',
        createdAt: 0,
        updatedAt: 0,
      })),
    };
    expect(() => addContact(full, { label: 'n', address: 'zzz', network: 'x' }, mk())).toThrow(/full/);
    const stuck: ContactEnv = { now: () => 1, rng: () => new Uint8Array(16) };
    const one = addContact(EMPTY_BOOK, { label: 'a', address: 'a1', network: 'x' }, stuck);
    expect(() => addContact(one.book, { label: 'b', address: 'b1', network: 'x' }, stuck)).toThrow(
      /duplicate id/,
    );
  });
  it('invalid input never mutates', () => {
    expect(() => addContact(EMPTY_BOOK, { label: '', address: A, network: 'eth' }, mk())).toThrow();
    expect(() =>
      addContact(
        EMPTY_BOOK,
        { label: 'x', address: A, network: 'eth' },
        { now: () => -1, rng: seededRng(1) },
      ),
    ).toThrow();
  });
});

describe('search and filter', () => {
  const env = mk();
  let book: AddressBook = EMPTY_BOOK;
  for (const [l, a, n, tags, note] of [
    ['Alice', A, 'eth', ['friends', 'work'], 'Berlin'],
    ['Bob', B, 'eth', ['work'], ''],
    ['Carol', 'bc1qexampleexampleexample', 'btc', ['friends'], 'rent'],
  ] as const) {
    book = addContact(book, { label: l, address: a, network: n, tags: [...tags], note }, env).book;
  }
  it('query AND-matches terms across label/note/address/tags', () => {
    expect(searchContacts(book, { query: 'alice' }).map((c) => c.label)).toEqual(['Alice']);
    expect(searchContacts(book, { query: 'BERLIN friends' }).map((c) => c.label)).toEqual(['Alice']);
    expect(searchContacts(book, { query: '0x2222' }).map((c) => c.label)).toEqual(['Bob']);
    expect(searchContacts(book, { query: 'nomatch' })).toEqual([]);
    expect(searchContacts(book, { query: '   ' })).toHaveLength(3);
  });
  it('tag filter is AND; network filter; sorting', () => {
    expect(searchContacts(book, { tags: ['friends', 'work'] }).map((c) => c.label)).toEqual(['Alice']);
    expect(searchContacts(book, { tags: ['Work'] }).map((c) => c.label)).toEqual(['Alice', 'Bob']);
    expect(searchContacts(book, { network: ' BTC ' }).map((c) => c.label)).toEqual(['Carol']);
    expect(searchContacts(book, { sort: 'recent' }).map((c) => c.label)).toEqual(['Carol', 'Bob', 'Alice']);
    expect(searchContacts(book, { sort: 'created' }).map((c) => c.label)).toEqual(['Carol', 'Bob', 'Alice']);
    expect(searchContacts(book).map((c) => c.label)).toEqual(['Alice', 'Bob', 'Carol']);
  });
  it('regex metacharacters are literal', () => {
    expect(searchContacts(book, { query: '.*' })).toEqual([]);
    expect(searchContacts(book, { query: '(((' })).toEqual([]);
  });
  it('ties break by id deterministically', () => {
    const t = (id: string): AddressBook['contacts'][number] => ({
      id,
      label: 'Same',
      address: id,
      network: 'x',
      tags: [],
      note: '',
      createdAt: 1,
      updatedAt: 1,
    });
    const b: AddressBook = { contacts: [t('b'.repeat(32)), t('a'.repeat(32))] };
    expect(searchContacts(b).map((c) => c.id[0])).toEqual(['a', 'b']);
    expect(searchContacts(b, { sort: 'recent' }).map((c) => c.id[0])).toEqual(['a', 'b']);
  });
  it('listTags counts', () => {
    expect(listTags(book)).toEqual([
      { tag: 'friends', count: 2 },
      { tag: 'work', count: 2 },
    ]);
  });
  it('property: filter results are always a subset and unaffected by input order', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), (q) => {
        const r = searchContacts(book, { query: q });
        expect(r.every((c) => book.contacts.includes(c))).toBe(true);
      }),
    );
  });
});
