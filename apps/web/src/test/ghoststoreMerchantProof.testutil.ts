import { reviewCatalogCart, type CartReviewContext } from '../features/future/ghoststore/catalog';

/** A successful result from the trusted F08 verifier. Imported catalog/cart fields cannot supply this result. */
export interface VerifiedCatalogIssuer {
  readonly merchantFingerprint: string;
  readonly catalogDigest: string;
}

/** Synchronous F02 consumption of a completed local verification, exercised only by qualification tests. */
export function reviewVerifiedCart(
  catalogBytes: Uint8Array,
  cartBytes: Uint8Array,
  verified: VerifiedCatalogIssuer | undefined,
  trustedMerchantFingerprint: string,
  context: Omit<CartReviewContext, 'expectedCatalogDigest'>,
) {
  if (verified === undefined || verified.merchantFingerprint !== trustedMerchantFingerprint) {
    throw new Error('UNVERIFIED_CATALOG_ISSUER');
  }
  const review = reviewCatalogCart(catalogBytes, cartBytes, { ...context, expectedCatalogDigest: verified.catalogDigest });
  if (review.merchantFingerprint !== trustedMerchantFingerprint) throw new Error('CATALOG_ISSUER_MISMATCH');
  return review;
}
