import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCatalog, reviewCatalogCart } from '../features/future/ghoststore/catalog';
import { reviewVerifiedCart, type VerifiedCatalogIssuer } from './ghoststoreMerchantProof.testutil';

// Ephemeral test issuers. Key type and encoding belong to the fixture.
function fixtureFingerprint(publicKey: KeyObject) {
  return createHash('sha256').update(publicKey.export({ format: 'der', type: 'spki' })).digest('hex');
}

function fixtureIssuer() {
  const keys = generateKeyPairSync('ed25519');
  return {
    fingerprint: fixtureFingerprint(keys.publicKey),
    issue(catalogDigest: string) {
      const signature = sign(null, Buffer.from(catalogDigest, 'hex'), keys.privateKey);
      return { catalogDigest, signature, publicKey: keys.publicKey };
    },
  };
}

const merchant = fixtureIssuer();
const other = fixtureIssuer();
type Proof = ReturnType<typeof merchant.issue>;

function verifyFixtureProof(proof: Proof): VerifiedCatalogIssuer | undefined {
  if (!verify(null, Buffer.from(proof.catalogDigest, 'hex'), proof.publicKey, proof.signature)) return undefined;
  return { merchantFingerprint: fixtureFingerprint(proof.publicKey), catalogDigest: proof.catalogDigest };
}

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const unit = { assetId: 'native', chainId: 'eip155:11155111' };
const product = { ...unit, productId: 'book', unitAtomic: '9007199254740993', title: 'Book', delivery: 'manual-digital' };
const catalog = { schema: 'ghostpay.catalog/1', revision: 'r1', catalogId: 'books',
  merchantFingerprint: merchant.fingerprint, expiresAt: 1000, products: [product] };
const context = { ...unit, maxAtomic: (1n << 256n) - 1n, nowSec: 999 };
const catalogBytes = json(catalog);
const digest = decodeCatalog(catalogBytes).digest;
const cart = (catalogDigest: string, quantity = 2) => json({ catalogDigest, lines: [{ productId: 'book', quantity }] });
const proof = merchant.issue(digest);

describe('F02 offline catalog proof provider contract', () => {
  it('reviews the pinned signed revision with the original delivery terms and exact subtotal', () => {
    const ordinary = reviewCatalogCart(catalogBytes, cart(digest), { ...context, expectedCatalogDigest: digest });
    const result = reviewVerifiedCart(catalogBytes, cart(digest), verifyFixtureProof(proof), merchant.fingerprint, context);
    expect(result).toEqual(ordinary);
    expect(result.subtotalAtomic).toBe('18014398509481986');
    expect(result.lines[0]?.delivery).toBe('manual-digital');
  });

  it('rejects changed delivery terms even if the cart already references their new digest', () => {
    const changed = json({ ...catalog, products: [{ ...product, delivery: 'manual-physical' }] });
    expect(() => reviewVerifiedCart(changed, cart(decodeCatalog(changed).digest),
      verifyFixtureProof(proof), merchant.fingerprint, context)).toThrow('CATALOG_CHANGED');
  });

  it('requires the authenticating signer to match the independent pin', () => {
    const wrong = other.issue(digest);
    expect(verifyFixtureProof(wrong)?.merchantFingerprint).toBe(other.fingerprint);
    expect(() => reviewVerifiedCart(catalogBytes, cart(digest), verifyFixtureProof(wrong), merchant.fingerprint, context))
      .toThrow('UNVERIFIED_CATALOG_ISSUER');
  });

  it('requires the merchant named in the signed body to match the verified issuer', () => {
    const changed = json({ ...catalog, merchantFingerprint: other.fingerprint });
    const changedDigest = decodeCatalog(changed).digest;
    expect(() => reviewVerifiedCart(changed, cart(changedDigest), verifyFixtureProof(merchant.issue(changedDigest)),
      merchant.fingerprint, context)).toThrow('CATALOG_ISSUER_MISMATCH');
  });

  it('returns no review after failed signature verification', () => {
    const invalid = verifyFixtureProof({ ...proof, signature: other.issue(digest).signature });
    expect(invalid).toBeUndefined();
    expect(() => reviewVerifiedCart(catalogBytes, cart(digest), invalid, merchant.fingerprint, context))
      .toThrow('UNVERIFIED_CATALOG_ISSUER');
  });

  it('expires at the signed second for every valid quantity and retains exact totals immediately before it', () => {
    const verified = verifyFixtureProof(proof);
    fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 120 }), (quantity, delay) => {
      const selected = cart(digest, quantity);
      const result = reviewVerifiedCart(catalogBytes, selected, verified, merchant.fingerprint, context);
      expect(result.subtotalAtomic).toBe((BigInt(quantity) * BigInt(product.unitAtomic)).toString());
      for (const nowSec of [catalog.expiresAt, catalog.expiresAt + delay]) {
        expect(() => reviewVerifiedCart(catalogBytes, selected, verified, merchant.fingerprint, { ...context, nowSec }))
          .toThrow('CATALOG_EXPIRED');
      }
    }), { seed: 20261123, numRuns: 128 });
  });
});
