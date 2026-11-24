import { isReason, sanitizeDisplayText } from '@ghostpay/address-safety';
import { canonicalize, parseStrictJson } from '@ghostpay/invoice-schema';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, isBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_CART_BYTES = 16 * 1024;
const MAX_UINT256 = (1n << 256n) - 1n;
const CATALOG_DOMAIN = 'GhostPay.Catalog.v1\0';
const CATALOG_FIELDS = ['schema', 'catalogId', 'revision', 'merchantFingerprint', 'expiresAt', 'products'];
const PRODUCT_FIELDS = ['productId', 'title', 'assetId', 'chainId', 'unitAtomic', 'delivery', 'contentDigest'];

type InputError = 'INVALID_CATALOG' | 'INVALID_CART';
type ReviewError = InputError | 'INVALID_CONTEXT' | 'CATALOG_CHANGED' | 'CATALOG_EXPIRED' | 'SETTLEMENT_MISMATCH' | 'AMOUNT_LIMIT';

export class CatalogError extends Error {
  constructor(readonly code: ReviewError) {
    super(code);
    this.name = 'CatalogError';
  }
}

interface Product {
  readonly productId: string;
  readonly title: string;
  readonly assetId: string;
  readonly chainId: string;
  readonly unitAtomic: string;
  readonly delivery: 'manual-digital' | 'manual-physical';
  readonly contentDigest?: string;
}

interface Catalog {
  readonly catalogId: string;
  readonly revision: string;
  readonly merchantFingerprint: string;
  readonly expiresAt: number;
  readonly digest: string;
  readonly products: readonly Product[];
}

export interface CartReviewContext {
  /** From an independent catalog pin or authentication provider, never from the cart itself. */
  readonly expectedCatalogDigest: string;
  /** The caller supplies a supported chain/asset pair and its inclusive atomic amount limit. */
  readonly chainId: string;
  readonly assetId: string;
  readonly maxAtomic: bigint;
  readonly nowSec: number;
}

function readJson(bytes: Uint8Array, limit: number, error: InputError): unknown {
  try {
    if (!isBytes(bytes) || bytes.byteLength > limit) throw new CatalogError(error);
    return parseStrictJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    throw new CatalogError(error);
  }
}

// This predicate only receives private snapshots from the strict JSON parser.
function hasOnlyFields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key));
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[^a-zA-Z0-9:._/-]/u.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && value.length === 64 && !/[^0-9a-f]/u.test(value);
}

function price(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 78 && value[0] !== '0' &&
    !/[^0-9]/u.test(value) && BigInt(value) <= MAX_UINT256;
}

function productFrom(value: unknown): Product {
  if (!hasOnlyFields(value, PRODUCT_FIELDS)) throw new CatalogError('INVALID_CATALOG');
  const { productId, title, assetId, chainId, unitAtomic, delivery, contentDigest } = value;
  if (!identifier(productId) || !identifier(assetId) || !identifier(chainId) || !price(unitAtomic) ||
      typeof title !== 'string' || title.length === 0 || title.length > 240 || Array.from(title).length > 120 ||
      title !== title.trim() || title.normalize('NFC') !== title || isReason(sanitizeDisplayText(title)) ||
      (delivery !== 'manual-digital' && delivery !== 'manual-physical') ||
      (contentDigest !== undefined && !digest(contentDigest))) throw new CatalogError('INVALID_CATALOG');
  return Object.freeze({ productId, title, assetId, chainId, unitAtomic, delivery,
    ...(contentDigest === undefined ? {} : { contentDigest }) });
}

/** Decode an unsigned catalog for inspection. Its digest identifies its terms and conveys no merchant authentication. */
export function decodeCatalog(bytes: Uint8Array): Catalog {
  const raw = readJson(bytes, MAX_CATALOG_BYTES, 'INVALID_CATALOG');
  if (!hasOnlyFields(raw, CATALOG_FIELDS)) throw new CatalogError('INVALID_CATALOG');
  const { schema, catalogId, revision, merchantFingerprint, expiresAt, products } = raw;
  if (schema !== 'ghostpay.catalog/1' || !identifier(catalogId) || !identifier(revision) || !digest(merchantFingerprint) ||
      typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt < 1 ||
      !Array.isArray(products) || products.length < 1 || products.length > 500) throw new CatalogError('INVALID_CATALOG');

  const items = products.map(productFrom);
  if (new Set(items.map((item) => item.productId)).size !== items.length) throw new CatalogError('INVALID_CATALOG');
  const commitment = bytesToHex(sha256(utf8ToBytes(CATALOG_DOMAIN + canonicalize(raw))));
  return Object.freeze({ catalogId, revision, merchantFingerprint, expiresAt, digest: commitment, products: Object.freeze(items) });
}

interface CartLine extends Product {
  readonly quantity: number;
  readonly lineAtomic: string;
}

/** Offline merchandise subtotal only. This operation cannot authorize a payment or confer delivery rights. */
export function reviewCatalogCart(catalogBytes: Uint8Array, cartBytes: Uint8Array, context: CartReviewContext) {
  const { nowSec, chainId, assetId, maxAtomic, expectedCatalogDigest } = context;
  if (!Number.isSafeInteger(nowSec) || nowSec < 0 || !identifier(chainId) || !identifier(assetId) ||
      typeof maxAtomic !== 'bigint' || maxAtomic < 1n || maxAtomic > MAX_UINT256 ||
      !digest(expectedCatalogDigest)) throw new CatalogError('INVALID_CONTEXT');

  const catalog = decodeCatalog(catalogBytes);
  if (catalog.digest !== expectedCatalogDigest) throw new CatalogError('CATALOG_CHANGED');
  if (catalog.expiresAt <= nowSec) throw new CatalogError('CATALOG_EXPIRED');

  const cart = readJson(cartBytes, MAX_CART_BYTES, 'INVALID_CART');
  if (!hasOnlyFields(cart, ['catalogDigest', 'lines']) || !digest(cart['catalogDigest']) ||
      !Array.isArray(cart['lines']) || cart['lines'].length < 1 || cart['lines'].length > 50) throw new CatalogError('INVALID_CART');
  if (cart['catalogDigest'] !== catalog.digest) throw new CatalogError('CATALOG_CHANGED');

  const available = new Map(catalog.products.map((item) => [item.productId, item]));
  const lines: CartLine[] = [];
  let subtotal = 0n;
  for (const selection of cart['lines'] as unknown[]) {
    if (!hasOnlyFields(selection, ['productId', 'quantity'])) throw new CatalogError('INVALID_CART');
    const { productId, quantity } = selection;
    if (!identifier(productId) || typeof quantity !== 'number' || !Number.isInteger(quantity) ||
        quantity < 1 || quantity > 1000) throw new CatalogError('INVALID_CART');
    const item = available.get(productId);
    if (item === undefined) throw new CatalogError('INVALID_CART');
    available.delete(productId); // A second selection of the same product is invalid.
    if (item.chainId !== chainId || item.assetId !== assetId) throw new CatalogError('SETTLEMENT_MISMATCH');
    const amount = BigInt(item.unitAtomic) * BigInt(quantity);
    subtotal += amount;
    if (subtotal > maxAtomic) throw new CatalogError('AMOUNT_LIMIT');
    lines.push(Object.freeze({ ...item, quantity, lineAtomic: amount.toString() }));
  }
  return Object.freeze({ catalogDigest: catalog.digest, catalogId: catalog.catalogId, revision: catalog.revision,
    merchantFingerprint: catalog.merchantFingerprint, expiresAt: catalog.expiresAt, chainId, assetId,
    lines: Object.freeze(lines), subtotalAtomic: subtotal.toString() });
}
