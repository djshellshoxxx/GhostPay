import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeCatalog, reviewCatalogCart } from './catalog';

const utf8 = (text: string) => new TextEncoder().encode(text);
const bytes = (value: unknown) => utf8(JSON.stringify(value));
const unit = { chainId: 'eip155:11155111', assetId: 'native' };
const product = { productId: 'book', title: '印刷の本', ...unit, unitAtomic: '9007199254740993', delivery: 'manual-physical' };
const download = { ...product, productId: 'audio', title: 'Audio', unitAtomic: '7', delivery: 'manual-digital', contentDigest: 'ab'.repeat(32) };
const catalog = {
  schema: 'ghostpay.catalog/1', catalogId: 'books', revision: 'r1', merchantFingerprint: 'cd'.repeat(32),
  expiresAt: 1800000000, products: [product, download],
};
const lines = [{ productId: 'audio', quantity: 2 }, { productId: 'book', quantity: 3 }];
const max = (1n << 256n) - 1n;
const context = { ...unit, maxAtomic: max, nowSec: catalog.expiresAt - 1 };

function review(source: typeof catalog, selection: unknown = lines, policy = context) {
  const data = bytes(source);
  const { digest } = decodeCatalog(data);
  return reviewCatalogCart(data, bytes({ catalogDigest: digest, lines: selection }), { ...policy, expectedCatalogDigest: digest });
}

describe('GhostStore offline catalog and cart', () => {
  it('binds a cart to a content digest independently reproducible across JSON key order and whitespace', () => {
    const value = { ...catalog, products: [product] };
    const sortedProduct = { assetId: product.assetId, chainId: product.chainId, delivery: product.delivery,
      productId: product.productId, title: product.title, unitAtomic: product.unitAtomic };
    const canonical = { catalogId: value.catalogId, expiresAt: value.expiresAt, merchantFingerprint: value.merchantFingerprint,
      products: [sortedProduct], revision: value.revision, schema: value.schema };
    const expected = createHash('sha256').update('GhostPay.Catalog.v1\0').update(JSON.stringify(canonical)).digest('hex');
    expect(decodeCatalog(bytes(value)).digest).toBe(expected);
    expect(decodeCatalog(utf8(JSON.stringify(canonical, null, 2))).digest).toBe(expected);
  });

  it('quotes the selected products in cart order with exact atomic amounts above Number.MAX_SAFE_INTEGER', () => {
    const result = review(catalog);
    expect(result).toMatchObject({ catalogId: 'books', revision: 'r1', ...unit, subtotalAtomic: '27021597764222993',
      lines: [{ productId: 'audio', quantity: 2, lineAtomic: '14', contentDigest: download.contentDigest },
        { productId: 'book', quantity: 3, lineAtomic: '27021597764222979' }] });
    expect(Object.isFrozen(result.lines[0])).toBe(true);
    expect(Object.isFrozen(result.lines)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    { ...catalog, revision: 'r2' },
    { ...catalog, products: [{ ...product, unitAtomic: '1' }, download] },
    { ...catalog, products: [product, { ...download, contentDigest: 'ef'.repeat(32) }] },
    { ...catalog, products: [{ ...product, delivery: 'manual-digital' }, download] },
  ])('rejects changed catalog terms with either an old cart or a separately pinned old digest', (changed) => {
    const oldDigest = decodeCatalog(bytes(catalog)).digest;
    const newDigest = decodeCatalog(bytes(changed)).digest;
    expect(newDigest).not.toBe(oldDigest);
    for (const [cartDigest, expected] of [[oldDigest, newDigest], [newDigest, oldDigest]] as const) {
      expect(() => reviewCatalogCart(bytes(changed), bytes({ catalogDigest: cartDigest, lines }),
        { ...context, expectedCatalogDigest: expected })).toThrow('CATALOG_CHANGED');
    }
  });

  it.each([{ assetId: 'usd' }, { chainId: 'eip155:84532' }])('rejects mixed carts and a single product on the wrong settlement unit', (other) => {
    const mixed = { ...catalog, products: [product, { ...download, ...other }] };
    expect(() => review(mixed)).toThrow('SETTLEMENT_MISMATCH');
    expect(() => review(mixed, [lines[0]])).toThrow('SETTLEMENT_MISMATCH');
    expect(review(mixed, [lines[1]]).subtotalAtomic).toBe('27021597764222979');
  });

  it('uses the earlier of the provider amount limit and the uint256 boundary', () => {
    const items = (price: bigint) => ({ ...catalog, products: [{ ...product, unitAtomic: price.toString() }, download] });
    const one = [{ productId: 'book', quantity: 1 }];
    expect(review(items(max), one).subtotalAtomic).toBe(max.toString());
    expect(() => review(items(max), [...one, { productId: 'audio', quantity: 1 }])).toThrow('AMOUNT_LIMIT');
    expect(() => review(items(max), [{ productId: 'book', quantity: 2 }])).toThrow('AMOUNT_LIMIT');
    expect(review(items(10n), one, { ...context, maxAtomic: 10n }).subtotalAtomic).toBe('10');
    expect(() => review(items(10n), one, { ...context, maxAtomic: 9n })).toThrow('AMOUNT_LIMIT');
  });

  it.each([0, 1001, 1.5, '1', null])('rejects an invalid quantity %s', (quantity) => {
    expect(() => review(catalog, [{ productId: 'book', quantity }])).toThrow('INVALID_CART');
  });

  it('enforces cart line count, unique selections and catalog membership', () => {
    const products = Array.from({ length: 51 }, (_, i) => ({ ...product, productId: 'p' + String(i), unitAtomic: '1' }));
    const selected = products.map(({ productId }) => ({ productId, quantity: 1000 }));
    const source = { ...catalog, products };
    expect(review(source, selected.slice(0, 50)).subtotalAtomic).toBe('50000');
    for (const invalid of [[], selected, [selected[0], selected[0]], [{ productId: 'missing', quantity: 1 }], [{ ...selected[0], unitAtomic: '1' }]]) {
      expect(() => review(source, invalid)).toThrow('INVALID_CART');
    }
  });

  it('checks cart bytes, shape, and independent policy before returning an itemization', () => {
    const source = bytes(catalog);
    const { digest } = decodeCatalog(source);
    const policy = { ...context, expectedCatalogDigest: digest };
    for (const invalid of [new Uint8Array(16385), Uint8Array.of(0xff), bytes(null),
      bytes({ lines }), bytes({ catalogDigest: digest, lines, subtotalAtomic: '1' }),
      utf8('{"catalogDigest":"' + digest + '","lines":[],"lines":[]}'),
      bytes({ catalogDigest: digest, lines: [null] })]) {
      expect(() => reviewCatalogCart(source, invalid, policy)).toThrow('INVALID_CART');
    }
    for (const badPolicy of [{ ...policy, expectedCatalogDigest: '' }, { ...policy, chainId: '' }, { ...policy, assetId: '' }]) {
      expect(() => reviewCatalogCart(source, bytes({ catalogDigest: digest, lines }), badPolicy)).toThrow('INVALID_CONTEXT');
    }
  });

  it('rejects expired catalogs at the boundary and invalid caller clocks or limits', () => {
    expect(() => review(catalog, lines, { ...context, nowSec: catalog.expiresAt })).toThrow('CATALOG_EXPIRED');
    for (const nowSec of [-1, 1.5, NaN, Infinity]) expect(() => review(catalog, lines, { ...context, nowSec })).toThrow('INVALID_CONTEXT');
    for (const maxAtomic of [0n, max + 1n]) expect(() => review(catalog, lines, { ...context, maxAtomic })).toThrow('INVALID_CONTEXT');
  });

  it.each(['0', '01', '1.00', '-1', '1e8', '10\n', (max + 1n).toString(), '1'.repeat(79)])('rejects a noncanonical or oversized price %s', (unitAtomic) => {
    expect(() => decodeCatalog(bytes({ ...catalog, products: [{ ...product, unitAtomic }] }))).toThrow('INVALID_CATALOG');
  });

  it('enforces catalog input size, encoding, schema, duplicate keys and product count', () => {
    const source = bytes(catalog);
    const atLimit = new Uint8Array(1024 * 1024).fill(32);
    atLimit.set(source);
    expect(decodeCatalog(atLimit).digest).toBe(decodeCatalog(source).digest);
    const corrupt = source.slice();
    corrupt[20] = 0xff;
    const products = Array.from({ length: 500 }, (_, i) => ({ ...product, productId: String(i) }));
    expect(decodeCatalog(bytes({ ...catalog, products })).products).toHaveLength(500);
    for (const invalid of [
      new Uint8Array(atLimit.length + 1), corrupt, utf8('null'), bytes({ ...catalog, schema: 'ghostpay.catalog/2' }),
      bytes({ ...catalog, products: [] }), bytes({ ...catalog, products: [...products, product] }),
      bytes({ ...catalog, products: [product, download, product] }), bytes({ ...catalog, secret: 'extra field' }),
      utf8(JSON.stringify(catalog).replace('"revision":"r1"', '"revision":"r1","revision":"r2"')),
    ]) expect(() => decodeCatalog(invalid)).toThrow('INVALID_CATALOG');
  });

  it.each([{ title: 'a'.repeat(121) }, { title: '\ud800' }, { title: 'abc\u202edef' }, { title: '' },
    { delivery: 'automatic' }, { contentDigest: 'abc' }, { assetId: 'native\n' }, { productId: 'book\n' },
    { imageUrl: 'https://example.invalid/image' }])('rejects invalid product fields', (patch) => {
    expect(() => decodeCatalog(bytes({ ...catalog, products: [{ ...product, ...patch }] }))).toThrow('INVALID_CATALOG');
  });
});
