import { ChainAdapterError } from '@ghostpay/chain-adapters';
import { GhostPayCryptoError } from '@ghostpay/core-crypto';
import { InvoiceError } from '@ghostpay/invoice-schema';

/** An error whose message is already safe and written for the end user. */
export class UserFacingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

const INVOICE_TEXT: Readonly<Record<string, string>> = {
  FRAGMENT_FORMAT: 'This is not a GhostPay v1 invoice link.',
  FRAGMENT_TOO_LARGE: 'The invoice link is larger than the 16 KiB limit and was rejected.',
  BASE64URL: 'The invoice link is corrupted (bad encoding) and was rejected.',
  UTF8: 'The invoice link is corrupted (bad text encoding) and was rejected.',
  JSON: 'The invoice link is corrupted (bad structure) and was rejected.',
  SCHEMA: 'The invoice is not valid and was rejected.',
  NON_CANONICAL: 'The invoice link is not in canonical form and was rejected.',
  DECRYPT: 'The invoice could not be decrypted: the link was changed or damaged.',
  SIGNING: 'The invoice could not be signed.',
  RANDOMNESS: 'The browser random source failed. Nothing was created.',
  UNSUPPORTED: 'This browser or invoice version is not supported.',
};

/**
 * Maps any thrown value to text that is safe to show. Messages never include user input, links, keys or RPC URLs.
 */
export function userMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof InvoiceError) {
    const base = INVOICE_TEXT[error.code] ?? 'The invoice was rejected.';
    return error.code === 'SCHEMA' && error.path !== undefined ? `${base} (field: ${error.path})` : base;
  }
  if (error instanceof ChainAdapterError) {
    // These two carry fixed-form, user-readable details written for this purpose (no URLs, no provider text).
    if (error.code === 'PAYMENT_UNVERIFIED' || error.code === 'DEPLOYMENT_UNVERIFIED') return `Cannot confirm: ${error.message.replace(/^[A-Z_]+: /, '')}.`;
    return `Blocked by a safety check (${error.code}).`;
  }
  if (error instanceof GhostPayCryptoError) {
    return `A cryptographic check failed (${error.code}).`;
  }
  return 'Something went wrong. Nothing was sent.';
}
