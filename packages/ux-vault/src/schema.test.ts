import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type AddressBook } from './contacts.js';
import { CURRENT_SCHEMA, parsePayload, serializePayload, validateBook } from './schema.js';
import { type ImportOptions, mergeBooks } from './merge.js';

const ID1 = '1'.repeat(32);
const ID2 = '2'.repeat(32);
const ID3 = '3'.repeat(32);
const c = (
  id: string,
  over: Partial<AddressBook['contacts'][number]> = {},
): AddressBook['contacts'][number] => ({
  id,
  label: `L${id[0]}`,
  address: `0x${id[0]!.repeat(40)}`,
  network: 'eth',
  tags: [],
  note: '',
  createdAt: 100,
  updatedAt: 100,
  ...over,
});
const book = (...cs: AddressBook['contacts'][number][]): AddressBook => ({ contacts: cs });

describe('schema', () => {
  it('serialise/parse round trip is canonical', () => {
    const b = book(c(ID1, { tags: ['a'], note: 'n' }), c(ID2));
    const { payload, migratedFrom, exportedAt } = parsePayload(serializePayload(b, 777));
    expect(payload.book).toEqual(b);
    expect(payload.schema).toBe(CURRENT_SCHEMA);
    expect(migratedFrom).toBeUndefined();
    expect(exportedAt).toBe(777);
    expect(parsePayload(serializePayload(b)).exportedAt).toBeUndefined();
  });

  it('migrates v1 -> v2 with exact expected output', () => {
    const v1 = JSON.stringify({
      schema: 1,
      entries: [
        {
          id: ID1,
          name: ' Alice ',
          address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          chain: 'ETH',
          tag: 'Close Friends',
          ts: 1700000000000,
        },
        { id: ID2, name: 'Bob', address: 'bc1qexample', chain: 'btc', ts: 5 },
      ],
    });
    const r = parsePayload(v1);
    expect(r.migratedFrom).toBe(1);
    expect(r.payload.book.contacts).toEqual([
      {
        id: ID1,
        label: 'Alice',
        address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'eth',
        tags: ['close-friends'],
        note: '',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
      {
        id: ID2,
        label: 'Bob',
        address: 'bc1qexample',
        network: 'btc',
        tags: [],
        note: '',
        createdAt: 5,
        updatedAt: 5,
      },
    ]);
  });

  it.each([
    ['not json', '{nope'],
    ['array', '[]'],
    ['null', 'null'],
    ['no schema', '{"contacts":[]}'],
    ['schema 0', '{"schema":0,"contacts":[]}'],
    ['schema float', '{"schema":1.5}'],
    ['schema string', '{"schema":"2"}'],
    ['contacts not array', '{"schema":2,"contacts":{}}'],
    ['v1 entries missing', '{"schema":1}'],
    ['v1 bad entry', '{"schema":1,"entries":[5]}'],
    [
      'v1 bad ts',
      '{"schema":1,"entries":[{"id":"' + ID1 + '","name":"a","address":"x","chain":"eth","ts":-1}]}',
    ],
    [
      'v1 bad tag',
      '{"schema":1,"entries":[{"id":"' +
        ID1 +
        '","name":"a","address":"x","chain":"eth","tag":"@@","ts":1}]}',
    ],
    ['bad id', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), id: 'nope' }] })],
    ['bad label', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), label: 'a‮b' }] })],
    ['bad address', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), address: 'a b' }] })],
    ['bad network', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), network: 'E T' }] })],
    ['bad tags', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), tags: 'x' }] })],
    ['bad note', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), note: 5 }] })],
    ['bad createdAt', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), createdAt: '1' }] })],
    ['updated<created', JSON.stringify({ schema: 2, contacts: [{ ...c(ID1), updatedAt: 1 }] })],
    ['dup id', JSON.stringify({ schema: 2, contacts: [c(ID1), c(ID1, { address: 'zzz' })] })],
    [
      'dup address',
      JSON.stringify({
        schema: 2,
        contacts: [c(ID1), c(ID2, { address: c(ID1).address.toUpperCase().replace('0X', '0x') })],
      }),
    ],
    ['inherited fields ignored', JSON.stringify({ schema: 2, contacts: [{ id: ID1 }] })],
  ])('rejects %s as CORRUPT', (_n, json) => {
    expect(() => parsePayload(json)).toThrowError(expect.objectContaining({ code: 'CORRUPT' }));
  });

  it('future schema fails closed; too many contacts is LIMIT', () => {
    expect(() => parsePayload('{"schema":3,"contacts":[]}')).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }),
    );
    const many = { schema: 2, contacts: new Array<unknown>(5001).fill({}) };
    expect(() => parsePayload(JSON.stringify(many))).toThrowError(expect.objectContaining({ code: 'LIMIT' }));
    expect(() =>
      parsePayload(JSON.stringify({ schema: 1, entries: new Array<unknown>(5001).fill({}) })),
    ).toThrowError(expect.objectContaining({ code: 'LIMIT' }));
  });

  it('prototype pollution payloads are inert and unknown fields dropped', () => {
    const json = `{"schema":2,"__proto__":{"polluted":1},"extra":1,"contacts":[{"id":"${ID1}","label":"A","address":"x1","network":"eth","tags":[],"note":"","createdAt":1,"updatedAt":1,"admin":true,"__proto__":{"polluted":2}}]}`;
    const { payload } = parsePayload(json);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(payload.book.contacts[0]!).sort()).toEqual([
      'address',
      'createdAt',
      'id',
      'label',
      'network',
      'note',
      'tags',
      'updatedAt',
    ]);
  });

  it('validateBook rejects non-object', () => {
    expect(() => validateBook(null)).toThrow();
  });

  it('property: arbitrary JSON never crashes with anything but VaultError', () => {
    fc.assert(
      fc.property(fc.json(), (j) => {
        try {
          parsePayload(j);
        } catch (e) {
          expect((e as { name: string }).name).toBe('VaultError');
        }
      }),
    );
  });
});

describe('mergeBooks', () => {
  const merge = (l: AddressBook, i: AddressBook, o: ImportOptions = { mode: 'merge' }) => mergeBooks(l, i, o);

  it('adds new, keeps unchanged', () => {
    const { book: b, report } = merge(book(c(ID1)), book(c(ID1), c(ID2)));
    expect(b.contacts.map((x) => x.id)).toEqual([ID1, ID2]);
    expect(report).toMatchObject({ added: [ID2], unchanged: [ID1], updated: [], conflicts: [] });
  });

  it('newer wins field conflicts; ties and older keep local; tags unioned', () => {
    const local = book(c(ID1, { label: 'Local', tags: ['a'], updatedAt: 200 }));
    const newer = merge(local, book(c(ID1, { label: 'Inc', tags: ['b'], updatedAt: 300 })));
    expect(newer.book.contacts[0]).toMatchObject({ label: 'Inc', tags: ['b', 'a'] });
    expect(newer.report.conflicts).toEqual([
      { kind: 'field-differs', localId: ID1, incomingId: ID1, resolution: 'took-incoming' },
    ]);
    const tie = merge(local, book(c(ID1, { label: 'Inc', tags: ['b'], updatedAt: 200 })));
    expect(tie.book.contacts[0]).toMatchObject({ label: 'Local', tags: ['a', 'b'] });
    expect(tie.report.updated).toEqual([ID1]);
    const older = merge(local, book(c(ID1, { label: 'Inc', updatedAt: 150 })));
    expect(older.book.contacts[0]?.label).toBe('Local');
    expect(older.report.updated).toEqual([]);
  });

  it('explicit policies local / incoming', () => {
    const local = book(c(ID1, { label: 'Local', updatedAt: 500 }));
    const inc = book(c(ID1, { label: 'Inc', updatedAt: 1 }));
    expect(merge(local, inc, { mode: 'merge', onConflict: 'incoming' }).book.contacts[0]?.label).toBe('Inc');
    expect(merge(local, inc, { mode: 'merge', onConflict: 'local' }).book.contacts[0]?.label).toBe('Local');
    expect(
      merge(local, book(c(ID1, { label: 'Inc', updatedAt: 900 })), { mode: 'merge', onConflict: 'local' })
        .book.contacts[0]?.label,
    ).toBe('Local');
  });

  it('SECURITY: same-id address swap is never applied by default, even when newer', () => {
    const local = book(c(ID1, { address: '0xaaaa000000000000000000000000000000000001', updatedAt: 100 }));
    const evil = book(c(ID1, { address: '0xbbbb000000000000000000000000000000000002', updatedAt: 99999 }));
    const r = merge(local, evil);
    expect(r.book.contacts[0]?.address).toBe(local.contacts[0]?.address);
    expect(r.report.conflicts[0]).toMatchObject({ kind: 'address-changed', resolution: 'kept-local' });
    const forced = merge(local, evil, { mode: 'merge', onConflict: 'incoming' });
    expect(forced.book.contacts[0]?.address).toBe(evil.contacts[0]?.address);
    expect(forced.report.conflicts[0]).toMatchObject({
      kind: 'address-changed',
      resolution: 'took-incoming',
    });
  });

  it('forced address change that collides with another local contact is refused', () => {
    const local = book(c(ID1), c(ID2));
    const inc = book(c(ID1, { address: c(ID2).address, updatedAt: 999 }));
    const r = merge(local, inc, { mode: 'merge', onConflict: 'incoming' });
    expect(r.book.contacts[0]?.address).toBe(c(ID1).address);
    expect(r.book.contacts).toHaveLength(2);
  });

  it('different id + same address collapses onto local with tag union', () => {
    const local = book(c(ID1, { tags: ['x'] }));
    const inc = book(
      c(ID3, { address: c(ID1).address.toUpperCase().replace('0X', '0x'), tags: ['y'], label: 'Other' }),
    );
    const r = merge(local, inc);
    expect(r.book.contacts).toHaveLength(1);
    expect(r.book.contacts[0]).toMatchObject({ id: ID1, label: 'L1', tags: ['x', 'y'] });
    expect(r.report.conflicts).toEqual([
      { kind: 'duplicate-address', localId: ID1, incomingId: ID3, resolution: 'merged-tags' },
    ]);
    // no tag change -> not reported as updated
    expect(merge(local, book(c(ID3, { address: c(ID1).address, tags: ['x'] }))).report.updated).toEqual([]);
  });

  it('warns about look-alike additions', () => {
    const local = book(c(ID1, { address: '0xabcd000000000000000000000000000000001234' }));
    const inc = book(c(ID2, { address: '0xabcd999999999999999999999999999999991234', label: 'Lx' }));
    const r = merge(local, inc);
    expect(r.report.added).toEqual([ID2]);
    expect(r.report.warnings).toEqual([
      expect.objectContaining({ kind: 'lookalike-address', newContactId: ID2, contactId: ID1 }),
    ]);
  });

  it('replace swaps the book and reports removed/added/updated', () => {
    const r = merge(book(c(ID1), c(ID2)), book(c(ID2, { label: 'New' }), c(ID3)), { mode: 'replace' });
    expect(r.book.contacts.map((x) => x.id)).toEqual([ID2, ID3]);
    expect(r.report).toMatchObject({ mode: 'replace', removed: [ID1], updated: [ID2], added: [ID3] });
  });

  it('LIMIT: overflow aborts without partial result', () => {
    const mkMany = (n: number, off = 0): AddressBook => ({
      contacts: Array.from({ length: n }, (_, i) =>
        c((i + off).toString(16).padStart(32, '0'), { address: `a${i + off}`, label: `n${i + off}` }),
      ),
    });
    expect(() => merge(mkMany(5000), mkMany(1, 6000))).toThrowError(
      expect.objectContaining({ code: 'LIMIT' }),
    );
  });

  it('property: merge is idempotent and never drops local contacts', () => {
    const arb = fc.array(fc.integer({ min: 1, max: 9 }), { maxLength: 6 });
    fc.assert(
      fc.property(arb, arb, (a, b) => {
        const mkb = (xs: number[]): AddressBook => ({
          contacts: [...new Set(xs)].map((n) =>
            c(String(n).repeat(32), { address: `addr-${n}`, label: `Name${n}` }),
          ),
        });
        const l = mkb(a);
        const once = merge(l, mkb(b)).book;
        const twice = merge(once, mkb(b)).book;
        expect(twice).toEqual(once);
        for (const x of l.contacts) expect(once.contacts.some((y) => y.id === x.id)).toBe(true);
      }),
    );
  });
});
