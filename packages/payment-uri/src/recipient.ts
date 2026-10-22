import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Address families handled by this package. */
export type RecipientKind = 'evm' | 'btc' | 'silent-payment' | 'solana' | 'tron';

/**
 * Canonical recipient plus data for lookalike / poisoning defences in the UI.
 *
 * @security Show `display` in full (never truncated) and `digest` beside it so a user can compare out of band.
 * Feed `canonical` to a lookalike detector (for example `@ghostpay/address-safety`) against the address book.
 */
export interface RecipientInfo {
  readonly kind: RecipientKind;
  /** Canonical text (EIP-55 for EVM, lowercase for bech32, as-is for case-sensitive base58). */
  readonly canonical: string;
  /** Canonical text in space-separated groups of 4 characters (EVM: after `0x`). */
  readonly display: string;
  /** Short domain-separated SHA-256 fingerprint, 3 groups of 4 hex characters. */
  readonly digest: string;
}

/** Builds a {@link RecipientInfo}. */
export function recipientInfo(kind: RecipientKind, canonical: string): RecipientInfo {
  const body = kind === 'evm' ? canonical.slice(2) : canonical;
  const groups = body.match(/.{1,4}/g) ?? [];
  const display = (kind === 'evm' ? '0x' : '') + groups.join(' ');
  const h = bytesToHex(sha256(new TextEncoder().encode(`ghostpay/payment-uri/recipient/v1\0${kind}\0${canonical}`)));
  return { kind, canonical, display, digest: `${h.slice(0, 4)} ${h.slice(4, 8)} ${h.slice(8, 12)}` };
}
