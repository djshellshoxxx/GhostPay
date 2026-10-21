import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { SigningError } from './errors.js';
import { canonicalize } from './json.js';
import { validateInvoice, type Invoice } from './schema.js';

/** Domain separation prefix for invoice signatures (ADR-0002). */
export const SIGNING_DOMAIN = 'GhostPay.Invoice.v1\0';

const SIG_RE = /^[0-9a-f]{128}$/;

/** An invoice plus its 64-byte compact ECDSA signature (lowercase hex). Integrity only, not seller identity. */
export interface SignedInvoice {
  readonly invoice: Invoice;
  readonly signature: string;
}

/**
 * Canonical UTF-8 bytes of a full invoice.
 *
 * @remarks Validates first, then emits deterministic JSON: sorted keys, no
 * whitespace, NFC strings, integers only (large values are decimal strings).
 *
 * @param invoice Invoice (re-validated).
 * @returns Canonical bytes (what the signature digest covers).
 * @throws {SchemaError} If the invoice is invalid.
 * @security Contains the private part (line items, memo) in clear.
 * @testVector invoice-v1-sample
 */
export function canonicalInvoiceBytes(invoice: Invoice): Uint8Array {
  return utf8ToBytes(canonicalize(validateInvoice(invoice)));
}

/**
 * Signature digest: `keccak256("GhostPay.Invoice.v1\0" || canonicalBytes)`.
 *
 * @param invoice Invoice (re-validated).
 * @returns 32-byte digest.
 * @throws {SchemaError} If the invoice is invalid.
 * @security Public data.
 * @testVector invoice-v1-sample
 */
export function invoiceDigest(invoice: Invoice): Uint8Array {
  return keccak_256(concatBytes(utf8ToBytes(SIGNING_DOMAIN), canonicalInvoiceBytes(invoice)));
}

/**
 * Derives the 33-byte compressed invoice-signing public key as lowercase hex.
 *
 * @param signingKey 32-byte secp256k1 secret in [1, n-1].
 * @returns 66-character hex string.
 * @throws {SigningError} If the key is invalid.
 * @security Use a dedicated invoice-signing key, never the spend/view keys (ADR-0002).
 * @testVector invoice-v1-sample
 */
export function signerPublicKeyHex(signingKey: Uint8Array): string {
  try {
    return bytesToHex(secp256k1.getPublicKey(signingKey, true));
  } catch {
    throw new SigningError();
  }
}

/**
 * Signs an invoice with the invoice-signing key (ECDSA secp256k1, low-s, 64-byte compact).
 *
 * @remarks Deterministic RFC 6979 nonces. Refuses if `invoice.signer` is not the
 * public key of `signingKey`, and self-verifies before returning.
 *
 * @param invoice Invoice to sign.
 * @param signingKey 32-byte secret key. The caller owns and should wipe it.
 * @returns The invoice with its signature.
 * @throws {SigningError} On key mismatch/invalid key; {@link SchemaError} if invalid.
 * @security The signature proves control of the signer key, not seller identity; trust requires pinning (see `signerPinned`).
 * @testVector invoice-v1-sample
 */
export function signInvoice(invoice: Invoice, signingKey: Uint8Array): SignedInvoice {
  const clean = validateInvoice(invoice);
  if (signerPublicKeyHex(signingKey) !== clean.signer) throw new SigningError();
  // The key was validated by signerPublicKeyHex above, so noble cannot reject it here.
  const signature = bytesToHex(
    secp256k1.sign(invoiceDigest(clean), signingKey, { prehash: false, lowS: true }),
  );
  return { invoice: clean, signature };
}

/**
 * Verifies the invoice signature against the embedded `signer` key.
 *
 * @remarks Digest as in {@link invoiceDigest}; high-s (malleable) and malformed
 * signatures are rejected. A `true` result means only that the holder of the
 * embedded signer key signed these exact bytes. It does not identify the seller.
 *
 * @param signed Invoice and signature.
 * @returns `true` only for a valid, low-s signature.
 * @throws {SchemaError} If the invoice itself is invalid.
 * @security Never present `true` as "verified seller"; compare `signer` with a pinned key.
 * @testVector invoice-v1-sample
 */
export function verifyInvoiceSignature(signed: SignedInvoice): boolean {
  const clean = validateInvoice(signed.invoice);
  if (!SIG_RE.test(signed.signature)) return false;
  try {
    return secp256k1.verify(hexToBytes(signed.signature), invoiceDigest(clean), hexToBytes(clean.signer), {
      prehash: false,
      lowS: true,
    });
  } catch {
    return false;
  }
}
