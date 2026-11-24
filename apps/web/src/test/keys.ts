import { generateSession, getSessionPublic, waiveSessionBackup, type SessionPublic } from '../lib/session';

/** Public signing key of the current in-memory session (test helper). */
export function currentSignerHex(): string {
  const session = getSessionPublic();
  if (session === undefined) throw new Error('no seller keys loaded');
  return session.signerPublicKey;
}

/** Generates seller keys and records the typed backup waiver (L1-01), so invoice and sharing views open directly. */
export function generateWaivedSession(): SessionPublic {
  const session = generateSession();
  waiveSessionBackup();
  return session;
}
