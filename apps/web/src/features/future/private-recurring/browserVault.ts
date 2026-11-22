import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import { hexToBytes } from '@noble/hashes/utils.js';
import { IdbReconciliationVaultStore } from '../../../lib/reconciliationVault';
import {
  captureSessionGuard, getSessionPublic, revealViewingKey, subscribeSession,
} from '../../../lib/session';
import { RecurringEncryptedVault, RecurringVaultError } from './vault';

export interface CurrentRecurringVault {
  readonly profileRef: string;
  readonly vault: RecurringEncryptedVault;
  /** Dispose on app lock/unmount; also revokes outstanding CAS handles. */
  readonly dispose: () => void;
}

/**
 * Dormant F10 browser adapter: binds encrypted recurring state to the seller
 * whose keys are loaded in GhostPay's existing in-memory session.
 *
 * Only a temporary viewing-secret copy is imported to WebCrypto; it is wiped
 * even if key derivation fails. HKDF info and salt are F10/profile-specific,
 * producing a nonextractable AES256-GCM key separate from reconciliation,
 * tags, backups and other merchant data. No key or plaintext is persisted.
 *
 * This is not a signing capability and never invokes the invoice provider.
 * Caller must dispose on UI idle-lock, profile change or component unmount.
 */
export async function createCurrentRecurringVault(): Promise<CurrentRecurringVault> {
  const guard = captureSessionGuard();
  const session = getSessionPublic();
  if (session === undefined) throw new RecurringVaultError('LOCKED');
  const profileRef = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  if (!/^[0-9a-f]{64}$/.test(profileRef)) throw new RecurringVaultError('KEY');

  const rawViewingKey = revealViewingKey();
  let vault: RecurringEncryptedVault | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    guard();
    if (rawViewingKey.byteLength !== 32) throw new RecurringVaultError('KEY');
    const base = await globalThis.crypto.subtle.importKey(
      'raw', rawViewingKey as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveKey'],
    );
    guard();
    const key = await globalThis.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: hexToBytes(profileRef) as Uint8Array<ArrayBuffer>,
        info: new TextEncoder().encode(`GhostPay/F10/browser/v1/aes-gcm|${profileRef}`),
      },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    guard();

    // Same-origin idempotency needs the *existing* browser IndexedDB adapter,
    // which checks ciphertext and session guard inside a readwrite transaction.
    vault = new RecurringEncryptedVault(new IdbReconciliationVaultStore(), profileRef, guard);
    vault.unlock(key);
    const current = vault;
    unsubscribe = subscribeSession(() => current.lock());
    guard();
    return Object.freeze({
      profileRef, vault: current,
      dispose: () => { unsubscribe?.(); current.lock(); },
    });
  } catch (error) {
    unsubscribe?.();
    vault?.lock();
    throw error;
  } finally {
    rawViewingKey.fill(0);
  }
}
