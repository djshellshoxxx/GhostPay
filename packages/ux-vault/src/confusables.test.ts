import { describe, expect, it } from 'vitest';
import { type AddressBook, EMPTY_BOOK, addContact } from './contacts.js';
import {
  analyzeCandidate,
  findDuplicateGroups,
  hasMixedScripts,
  isLookalikeAddress,
  labelSkeleton,
} from './confusables.js';
import { seededRng } from './memory.testutil.js';

const env = { now: () => 1, rng: seededRng(7) };
const REAL = '0xabcd000000000000000000000000000000001234';
const POISON = '0xabcd999999999999999999999999999999991234';
const NEAR = '0xabcd000000000000000000000000000000001299'; // 2 chars differ
const OTHER = '0x5555555555555555555555555555555555555555';

function bookOf(...rows: [string, string, string?][]): AddressBook {
  let b = EMPTY_BOOK;
  for (const [l, a, n] of rows) b = addContact(b, { label: l, address: a, network: n ?? 'eth' }, env).book;
  return b;
}

describe('label skeleton', () => {
  it.each([
    ['Alice', 'A1ice'],
    ['Alice', 'Аlice'], // Cyrillic A
    ['Alice', 'ALICE'],
    ['Bob', 'B0b'],
    ['Corn', 'Com'],
    ['Wow', 'Vvow'],
    ['Al ice', 'Al-ice'],
    ['Zoë', 'Zoe'],
    ['paypal', 'раураl'],
  ])('%s ~ %s', (a, b) => {
    expect(labelSkeleton(a)).toBe(labelSkeleton(b));
  });
  it('different names differ', () => {
    expect(labelSkeleton('Alice')).not.toBe(labelSkeleton('Alicia'));
  });
  it('mixed scripts', () => {
    expect(hasMixedScripts('Аlice')).toBe(true);
    expect(hasMixedScripts('Alice')).toBe(false);
    expect(hasMixedScripts('Иван')).toBe(false);
  });
});

describe('address look-alikes', () => {
  it('edges and near detection; ignores exact, short, other nets', () => {
    expect(isLookalikeAddress('eth', REAL, POISON)).toBe('edges');
    expect(isLookalikeAddress('eth', REAL, NEAR)).toBe('near');
    expect(isLookalikeAddress('eth', REAL, REAL.toUpperCase().replace('0X', '0x'))).toBeUndefined();
    expect(isLookalikeAddress('eth', REAL, OTHER)).toBeUndefined();
    expect(isLookalikeAddress('eth', 'abcd1234', 'abcd1234x')).toBeUndefined();
    const a = 'bc1q' + 'x'.repeat(30);
    const nearOnly = 'bc1q' + 'x'.repeat(10) + 'yy' + 'x'.repeat(18); // edges equal too? prefix same -> use diff prefix
    expect(isLookalikeAddress('btc', a, nearOnly)).toBe('edges');
    const c = '1' + 'A'.repeat(33);
    const d = 'Z' + 'A'.repeat(32) + 'B'; // differ at first and last: no edges; hamming 2
    expect(isLookalikeAddress('btc', c, d)).toBe('near');
    const e = 'Z' + 'Y'.repeat(4) + 'A'.repeat(24) + 'B'.repeat(4);
    expect(isLookalikeAddress('btc', c, e)).toBeUndefined();
  });
});

describe('analyzeCandidate', () => {
  const book = bookOf(['Alice', REAL], ['Bob', OTHER]);
  it('flags exact duplicate as block', () => {
    const f = analyzeCandidate(book, {
      label: 'Zed',
      address: REAL.toUpperCase().replace('0X', '0x'),
      network: 'eth',
    });
    expect(f[0]).toMatchObject({ kind: 'exact-address', severity: 'block' });
  });
  it('flags address poisoning as high', () => {
    const f = analyzeCandidate(book, { label: 'New', address: POISON, network: 'eth' });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: 'lookalike-address', severity: 'high' });
    expect(f[0]?.detail).toMatch(/first and last/);
    const g = analyzeCandidate(book, {
      label: 'New',
      address: '0xabcd000000000000000000000000000000001299'.replace('abcd', 'ffff'),
      network: 'eth',
    });
    expect(g).toEqual([]);
  });
  it('same address on another network is not a collision', () => {
    expect(analyzeCandidate(book, { label: 'New', address: REAL, network: 'op' })).toEqual([]);
  });
  it('flags duplicate / confusable labels and mixed scripts, sorted by severity', () => {
    expect(
      analyzeCandidate(book, { label: 'alice', address: '0x' + '7'.repeat(40), network: 'eth' }).map(
        (f) => f.kind,
      ),
    ).toEqual(['duplicate-label']);
    const f = analyzeCandidate(book, { label: 'Аlice', address: POISON, network: 'eth' });
    expect(f.map((x) => x.kind)).toEqual(['lookalike-address', 'mixed-script-label', 'confusable-label']);
    expect(f.map((x) => x.severity)).toEqual(['high', 'medium', 'medium']);
  });
  it('ignoreId skips self when re-checking an existing contact', () => {
    const id = book.contacts[0]!.id;
    expect(analyzeCandidate(book, { label: 'Alice', address: REAL, network: 'eth' }, id)).toEqual([]);
  });
  it('validates candidate input', () => {
    expect(() => analyzeCandidate(book, { label: '', address: REAL, network: 'eth' })).toThrow();
  });
});

describe('findDuplicateGroups', () => {
  it('buckets exact, look-alike, confusable and duplicate-label groups', () => {
    const mkc = (id: string, label: string, address: string): AddressBook['contacts'][number] => ({
      id: id.repeat(32),
      label,
      address,
      network: 'eth',
      tags: [],
      note: '',
      createdAt: 0,
      updatedAt: 0,
    });
    const book: AddressBook = {
      contacts: [
        mkc('1', 'Alice', REAL),
        mkc('2', 'A1ice', POISON),
        mkc('3', 'Bob', OTHER),
        mkc('4', 'bob', '0x' + '6'.repeat(40)),
        mkc('5', 'Dup', OTHER.toUpperCase().replace('0X', '0x')),
        mkc('6', 'short', 'abc'),
      ],
    };
    const g = findDuplicateGroups(book);
    const byKind = (k: string): string[][] =>
      g.filter((x) => x.kind === k).map((x) => x.contactIds.map((i) => i[0]!));
    expect(byKind('exact-address')).toEqual([['3', '5']]);
    expect(byKind('lookalike-address')).toEqual([['1', '2']]);
    expect(byKind('confusable-label')).toEqual([['1', '2']]);
    expect(byKind('duplicate-label')).toEqual([['3', '4']]);
  });
  it('empty book -> none; redundant sub-groups are dropped', () => {
    expect(findDuplicateGroups(EMPTY_BOOK)).toEqual([]);
    const mkc = (id: string): AddressBook['contacts'][number] => ({
      id: id.repeat(32),
      label: 'Same',
      address: OTHER,
      network: 'eth',
      tags: [],
      note: '',
      createdAt: 0,
      updatedAt: 0,
    });
    const g = findDuplicateGroups({ contacts: [mkc('1'), mkc('2')] });
    expect(g.map((x) => x.kind).sort()).toEqual(['duplicate-label', 'exact-address']);
  });
});
