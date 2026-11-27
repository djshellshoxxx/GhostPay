import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { ReconciliationVaultStore } from '@ghostpay/ux-vault/portable';
import { UserFacingError } from './errors';
import { sessionViewingKey, type ViewingKeyLender } from './scanCursorSlot';

/**
 * LATE-M1: whether an encrypted reconciliation vault may exist for one seller key and chain, kept in localStorage beside the
 * scan checkpoints. A scan page that cannot open IndexedDB then blocks its checkpoint only where a vault may exist.
 *
 * - `absent`: a read of this scope found no vault, and no write was announced since.
 * - `present`: a vault was read, or a write was announced before it was attempted.
 * - `unknown`: nothing recorded, or the slot cannot be read. Callers treat it like `present`.
 *
 * The value only moves up (unset, then `absent`, then `present`); nothing here turns `present` back into `absent`. The slot
 * name is derived from the viewing key like the checkpoint slot, so the public meta-address alone cannot find it.
 */
export type ReconciliationPresence = 'absent' | 'present' | 'unknown';

export const RECONCILIATION_PRESENCE_PREFIX = 'ghostpay.reconciliation.presence.v1.';
const SLOT_INFO = 'GhostPay/reconciliation-presence/v1/slot';

export interface PresenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** HKDF-SHA256(viewing key, no salt, label|chainId|keyId) as hex, under its own label (never a checkpoint slot name). */
export function presenceSlot(viewingKey: Uint8Array, chainId: number, keyId: string): string {
  if (viewingKey.length !== 32) throw new Error('invalid viewing key');
  return `${RECONCILIATION_PRESENCE_PREFIX}${bytesToHex(hkdf(sha256, viewingKey, undefined, utf8ToBytes(`${SLOT_INFO}|${String(chainId)}|${keyId}`), 32))}`;
}

export function readPresence(storage: PresenceStorage | undefined, slot: string | undefined): ReconciliationPresence {
  if (storage === undefined || slot === undefined) return 'unknown';
  let value: string | null;
  try { value = storage.getItem(slot); } catch { return 'unknown'; }
  return value === 'absent' || value === 'present' ? value : 'unknown';
}

/** Records that a vault may exist. False only when the slot might still read `absent` afterwards. */
function recordPresent(storage: PresenceStorage | undefined, slot: string): boolean {
  if (storage === undefined) return true; // Nothing can be read back either: the state stays `unknown`.
  try {
    storage.setItem(slot, 'present');
    if (storage.getItem(slot) === 'present') return true;
  } catch { /* Fall back to removing the slot, which also reads as `unknown`. */ }
  try { storage.removeItem(slot); } catch { /* Checked below. */ }
  try { return storage.getItem(slot) !== 'absent'; } catch { return false; }
}

/** Records that a read found no vault, unless anything was recorded before. Best effort: a failure leaves `unknown`. */
function recordAbsent(storage: PresenceStorage | undefined, slot: string): void {
  if (storage === undefined) return;
  try { if (storage.getItem(slot) === null) storage.setItem(slot, 'absent'); } catch { /* Stays `unknown`. */ }
}

/**
 * Wraps the store of one scope. Every read records what it found. Every write is announced before it is attempted, and is
 * refused when the announcement cannot be recorded, so a vault never comes into existence while its slot reads `absent`.
 * A committed write is announced again, in case another tab's earlier `absent` landed in between.
 */
export function trackReconciliationPresence(
  store: ReconciliationVaultStore, storage: PresenceStorage | undefined, slot: string,
): ReconciliationVaultStore {
  return {
    read: async (key) => {
      const value = await store.read(key);
      if (value === null) recordAbsent(storage, slot);
      else recordPresent(storage, slot);
      return value;
    },
    compareAndSwap: async (key, expected, next, guard) => {
      if (!recordPresent(storage, slot)) throw new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationWriteDidNotCommit' });
      const swapped = await store.compareAndSwap(key, expected, next, guard);
      if (swapped) recordPresent(storage, slot);
      return swapped;
    },
  };
}

export function presenceStorage(): PresenceStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/** The recorded presence for the loaded seller keys `keyId` names on `chainId`; `unknown` for any other keys. */
export function currentReconciliationPresence(
  chainId: number, keyId: string, storage: PresenceStorage | undefined = presenceStorage(), lender: ViewingKeyLender = sessionViewingKey,
): ReconciliationPresence {
  let slot: string | undefined;
  try { slot = lender(keyId, (viewingKey) => presenceSlot(viewingKey, chainId, keyId)); } catch { return 'unknown'; }
  return readPresence(storage, slot);
}
