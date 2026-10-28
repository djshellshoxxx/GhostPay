import { getSessionPublic } from '../lib/session';

/** Public signing key of the current in-memory session (test helper). */
export function currentSignerHex(): string {
  const session = getSessionPublic();
  if (session === undefined) throw new Error('no seller keys loaded');
  return session.signerPublicKey;
}
