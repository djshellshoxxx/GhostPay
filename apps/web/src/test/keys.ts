import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { requireSession } from '../lib/session';

/** Public signing key of the current in-memory session (test helper). */
export function currentSignerHex(): string {
  return signerPublicKeyHex(requireSession().signingKey);
}
