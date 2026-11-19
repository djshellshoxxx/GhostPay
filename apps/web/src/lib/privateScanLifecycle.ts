import { checkpointKeyId, type ReconciliationVaultStore } from '@ghostpay/ux-vault/portable';
import { readEncryptedVault } from './keyVault';
import { IdbReconciliationVaultStore } from './reconciliationVault';
import { captureSessionGuard, getSessionPublic, revealViewingKey, sessionVaultRecord } from './session';
import { createPrivateScanTombstone, PRIVATE_SCAN_SLOT_PREFIX, PrivateScanVault, ScanStateError, type PrivateScanScope } from './privateScanStore';

const CHANNEL = 'ghostpay:private-scan-invalidation';
let generation = 0;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;

/** Legacy progress had no authenticated discovery journal. Delete names only; its untrusted values are never read. */
export function purgeLegacyPrivateScanHistory(storage: Storage | undefined): void {
  if (storage === undefined) return;
  const names: string[] = [];
  try {
    const count = Math.min(storage.length, 10_000);
    for (let i = 0; i < count; i++) {
      const name = storage.key(i);
      if (name !== null && /^ghostpay\.scan\.checkpoint\.v[1-4]\./.test(name)) names.push(name);
    }
  } catch { /* Storage denial never authorizes legacy progress. */ }
  for (const name of names) { try { storage.removeItem(name); } catch { /* best effort */ } }
}

function invalidateLocal(): void {
  generation++;
  for (const listener of listeners) listener();
}

/** Broadcasts carry activity only. Storage CAS, not message delivery, enforces stale-writer exclusion. */
export function subscribePrivateScanInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  if (channel === undefined && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => { if (event.data === 'changed') invalidateLocal(); };
    } catch { channel = undefined; }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { channel?.close(); channel = undefined; }
  };
}

/**
 * The sole saved seller-vault deletion invalidates every scan context in this browser. Random tombstones retain CAS
 * history while discarding observations. This runs AFTER the confirmed key-vault deletion and must finish before that
 * operation reports success. An independently imported key holder can still deliberately start a fresh scan.
 */
export async function invalidatePrivateScanHistory(replace?: () => Promise<void>): Promise<void> {
  invalidateLocal();
  if (replace !== undefined) await replace();
  else if (typeof indexedDB !== 'undefined') {
    await new IdbReconciliationVaultStore().replacePrefix(PRIVATE_SCAN_SLOT_PREFIX, createPrivateScanTombstone);
  }
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    let broadcast: BroadcastChannel | undefined;
    try { broadcast = new BroadcastChannel(CHANNEL); broadcast.postMessage('changed'); }
    catch { /* Foreground load and transactional CAS remain authoritative. */ }
    finally { broadcast?.close(); }
  }
}

/** Opens only for the current loaded key identity and captures its revision even across a same-key restoration. */
export async function openCurrentPrivateScanVault(scope: PrivateScanScope, store: ReconciliationVaultStore, externalGuard: () => void): Promise<PrivateScanVault> {
  const session = getSessionPublic();
  if (session === undefined || checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey) !== scope.sellerKeyId) throw new ScanStateError('stale');
  const sessionGuard = captureSessionGuard();
  const openedGeneration = generation;
  const tiedVault = sessionVaultRecord();
  const guard = (): void => {
    externalGuard(); sessionGuard();
    if (generation !== openedGeneration) throw new ScanStateError('stale');
  };
  const checkSavedVault = async (): Promise<void> => {
    guard();
    // Check AFTER journal read/reservation. A deletion that follows this check tombstones the expected journal value;
    // opening after tombstoning sees the missing/replaced seller vault instead. A pre-read-only check has a TOCTOU gap.
    if (tiedVault !== undefined && await readEncryptedVault() !== tiedVault) throw new ScanStateError('stale');
    guard();
  };
  const boundStore: ReconciliationVaultStore = {
    async read(key) {
      guard();
      const result = await store.read(key);
      await checkSavedVault();
      return result;
    },
    async compareAndSwap(key, expected, next, current) {
      guard();
      await checkSavedVault();
      const result = await store.compareAndSwap(key, expected, next, () => { guard(); current(); });
      await checkSavedVault();
      return result;
    },
  };
  return PrivateScanVault.open(scope, revealViewingKey(), boundStore, guard);
}
