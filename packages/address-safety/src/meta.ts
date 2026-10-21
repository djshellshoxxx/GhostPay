import { createHash } from 'node:crypto';
import { AddressSafetyError } from './errors.js';

const MAX_META = 4096;

/** Trust level of an invoice payee, see {@link payeeTrust}. */
export type PayeeTrust = 'pinned' | 'unpinned_valid_signature' | 'invalid';

/** Minimal structural view of a verified invoice (no dependency on `invoice-schema`). */
export interface InvoiceTrustInput {
  /** Whether the invoice signature verified against the embedded key. */
  readonly signatureValid: boolean;
  /** Signer public key text as embedded in the invoice. */
  readonly signer: string;
}

/** Minimal structural view of the caller's pinned seller keys. */
export type PinnedSellers = ReadonlySet<string> | readonly string[];

/**
 * Short, stable digest of a meta-address for out-of-band comparison.
 * @param meta Meta-address text, hashed as exact UTF-8.
 * @returns Five dash-separated groups of four hex chars (80 bits of SHA-256).
 * @throws {AddressSafetyError} On empty or over-long (above 4096 chars) input.
 * @security Display aid only; 80 bits resists accidental, not nation-state, collisions. Compare
 * the full meta-address when stakes are high.
 */
export function metaAddressFingerprint(meta: string): string {
  if (typeof meta !== 'string' || meta.length === 0 || meta.length > MAX_META) {
    throw new AddressSafetyError('meta-address must be 1..4096 characters');
  }
  const hex = createHash('sha256').update(meta, 'utf8').digest('hex').slice(0, 20);
  return hex.match(/.{4}/g)?.join('-') ?? hex;
}

/**
 * Decides how far an invoice payee may be trusted.
 * @param inv Verification result of the invoice.
 * @param pinned Caller's pinned seller keys.
 * @returns `pinned`, `unpinned_valid_signature` or `invalid`.
 * @security A valid signature from an unpinned key proves integrity, not identity (haiku M-1): the
 * UI must block or require explicit confirmation of the meta-address fingerprint. Comparison is
 * case-insensitive on the exact key text.
 */
export function payeeTrust(inv: InvoiceTrustInput, pinned: PinnedSellers): PayeeTrust {
  if (!inv.signatureValid) return 'invalid';
  const key = inv.signer.toLowerCase();
  const list: readonly string[] = Array.isArray(pinned) ? pinned : [...(pinned as ReadonlySet<string>)];
  return list.some((p) => p.toLowerCase() === key) ? 'pinned' : 'unpinned_valid_signature';
}
