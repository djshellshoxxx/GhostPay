import { createReconciliationApi, type ReconciliationVaultStore, type ReconciliationVaultHandle } from '@ghostpay/ux-vault/portable';
import { UserFacingError, type MessageDescriptor } from './errors';
import { captureSessionGuard, getSessionPublic, revealViewingKey } from './session';
import { checkpointKeyId } from './scanClient';
export type { ReconciliationScope, VaultRecord, ArchivedReceipt, ReconciliationVaultStore, ReconciliationState, ReconciliationImportPreview } from '@ghostpay/ux-vault/portable';
export const { MAX_VAULT_BYTES, MAX_ARCHIVED_RECEIPTS, ReconciliationVault } = createReconciliationApi({ Error: UserFacingError, notify: announce });
export type ReconciliationVault = ReconciliationVaultHandle;

export const RECONCILIATION_VAULT_CHANGE_EVENT = 'ghostpay:reconciliation-vault-change';

const INVALIDATION_CHANNEL = 'ghostpay:reconciliation-invalidation';

function fail(message: MessageDescriptor): never {
  throw new UserFacingError(message);
}

function announce(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RECONCILIATION_VAULT_CHANGE_EVENT));
  // Only an activity signal crosses tabs: never keys, scope identifiers, ciphertext or observations.
  if (typeof BroadcastChannel !== 'undefined') {
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(INVALIDATION_CHANNEL);
      channel.postMessage('changed');
    } catch {
      /* Foreground refresh remains available when channel access is blocked. */
    } finally {
      channel?.close();
    }
  }
}


/** Refresh the current scope from encrypted storage; broadcasts contain no private data. */
export function subscribeReconciliationChanges(refresh: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(INVALIDATION_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'changed') refresh();
      };
    } catch {
      channel?.close();
      channel = undefined;
    }
  }
  const foreground = (): void => {
    if (document.visibilityState === 'visible') refresh();
  };
  window.addEventListener(RECONCILIATION_VAULT_CHANGE_EVENT, refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', foreground);
  return () => {
    window.removeEventListener(RECONCILIATION_VAULT_CHANGE_EVENT, refresh);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', foreground);
    if (channel !== undefined) {
      channel.onmessage = null;
      channel.close();
    }
  };
}


/** Browser storage never sees plaintext; request success is not treated as transaction commit. */
export class IdbReconciliationVaultStore implements ReconciliationVaultStore {
  private dbPromise: Promise<IDBDatabase> | undefined;
  private db(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    let settled = false;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ghostpay-reconciliation-encrypted', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('vaults');
      };
      request.onsuccess = () => {
        const db = request.result;
        // A blocked open can succeed after it was rejected and a newer open has started.
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        db.onversionchange = () => {
          db.close();
          if (this.dbPromise === pending) this.dbPromise = undefined;
        };
        // The browser closed the connection itself (site data cleared, storage failure): the next call opens again.
        db.onclose = () => {
          if (this.dbPromise === pending) this.dbPromise = undefined;
        };
        resolve(db);
      };
      const fail = (message: MessageDescriptor): void => {
        if (settled) return;
        settled = true;
        reject(new UserFacingError(message));
      };
      request.onerror = () => fail({ key: 'error.reconciliationVault.encryptedReconciliationStorageIsUnavailable' });
      request.onblocked = () =>
        fail({ key: 'error.reconciliationVault.closeOtherGhostPayTabsToOpenEncryptedReconciliationStorage' });
    });
    this.dbPromise = pending;
    // Failed opens must not poison future operations; never replace a newer attempt.
    void pending.catch(() => {
      if (this.dbPromise === pending) this.dbPromise = undefined;
    });
    return pending;
  }
  /**
   * Runs `operate` on the cached connection. A connection the browser already closed (its `transaction()` throws an
   * InvalidStateError) is dropped and the operation runs once more on a fresh open; every other failure is reported as is.
   */
  private async withDb<T>(operate: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const pending = this.db();
    const db = await pending;
    try {
      return await operate(db);
    } catch (error) {
      if (!isClosedConnection(error)) throw error;
      if (this.dbPromise === pending) this.dbPromise = undefined;
      try { db.close(); } catch { /* already closed */ }
      return operate(await this.db());
    }
  }
  public read(key: string): Promise<string | null> {
    return this.withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('vaults', 'readonly');
      const request = tx.objectStore('vaults').get(key);
      let value: string | null = null;
      request.onsuccess = () => {
        if (request.result === undefined) value = null;
        else if (typeof request.result === 'string' && request.result.length <= MAX_VAULT_BYTES)
          value = request.result;
        else tx.abort();
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () =>
        reject(new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationStorageCouldNotBeRead' }));
    }));
  }
  public compareAndSwap(
    key: string,
    expected: string | null,
    next: string,
    guard: () => void,
  ): Promise<boolean> {
    if (next.length > MAX_VAULT_BYTES) fail({ key: 'error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit' });
    return this.withDb((db) => new Promise((resolve, reject) => {
      guard();
      const tx = db.transaction('vaults', 'readwrite');
      const store = tx.objectStore('vaults');
      const request = store.get(key);
      let swapped = false;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          guard();
          if ((request.result ?? null) === expected) {
            const write = store.put(next, key);
            write.onsuccess = () => {
              try {
                guard();
              } catch (error) {
                failure = error;
                tx.abort();
              }
            };
            // A full origin quota is reported as such, not as an unexplained failed commit; nothing was written.
            write.onerror = () => {
              if (isQuotaError(write.error)) failure = new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationStorageIsFull' });
            };
            swapped = true;
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(swapped);
      tx.onabort = tx.onerror = () => {
        if (failure === undefined && isQuotaError(tx.error)) failure = new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationStorageIsFull' });
        reject(
          failure instanceof Error ? failure : new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationWriteDidNotCommit' }),
        );
      };
    }));
  }
}

/** `transaction()` on a connection the browser closed throws this; the adapters then open again once. */
export function isClosedConnection(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'InvalidStateError';
}

/** The origin's storage quota is exhausted (Chromium and Firefox name it so; Safari reports it on the transaction). */
export function isQuotaError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'QuotaExceededError';
}

const browserStore = new IdbReconciliationVaultStore();

export async function createCurrentReconciliationVault(
  chainId: number,
  sellerKeyId: string,
): Promise<ReconciliationVault> {
  const guard = captureSessionGuard();
  const session = getSessionPublic();
  if (
    session === undefined ||
    checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey) !== sellerKeyId
  )
    fail({ key: 'error.reconciliationVault.theCurrentSellerScopeChanged' });
  const vault = new ReconciliationVault(browserStore, { chainId, sellerKeyId }, guard);
  try {
    await vault.unlock(revealViewingKey());
    guard();
    return vault;
  } catch (error) {
    vault.lock();
    throw error;
  }
}
// i18n-use: error.reconciliationVault.invalidReconciliationScope error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit error.reconciliationVault.invalidEncryptedReconciliationFormat error.reconciliationVault.encryptedReconciliationDataBelongsToAnotherSellerOrChainScope error.reconciliationVault.invalidEncryptedReconciliationFields error.reconciliationVault.invalidReconciliationDocumentOrRecordLimit error.reconciliationVault.invalidReconciliationReorgCutoff error.reconciliationVault.invalidReconciliationReorgCutoffTime error.reconciliationVault.invalidReconciliationProvenance error.reconciliationVault.reconciliationRecordHasAnotherScope error.reconciliationVault.duplicateReconciliationRecords error.reconciliationVault.invalidReconciliationTombstone error.reconciliationVault.duplicateReconciliationTombstones error.reconciliationVault.registeredInvoiceHasAnotherScope error.reconciliationVault.duplicateRegisteredInvoice error.reconciliationVault.duplicateRegisteredInvoiceNonce error.reconciliationVault.duplicateArchivedReceipt error.reconciliationVault.invalidArchivedReceipt error.reconciliationVault.archivedReceiptHasAnotherScope error.reconciliationVault.invalidArchivedReceiptTimestamp error.reconciliationVault.thisHistoricalObservationWasInvalidatedByAReorg error.reconciliationVault.thisRecordAlreadyHasADifferentInvoiceAnnotation error.reconciliationVault.theReconciliationVaultIsLocked error.reconciliationVault.reconciliationVaultActionBecameStale error.reconciliationVault.invalidReconciliationViewingKey error.reconciliationVault.reconciliationPlaintextExceedsItsSafetyLimit error.reconciliationVault.couldNotDecryptOrValidateTheReconciliationData error.reconciliationVault.reconciliationDataChangedInAnotherTabReloadAndTryAgain error.reconciliationVault.onlyACurrentVerifiedScanObservationCanBeSaved error.reconciliationVault.importedHistoryCannotBeMatchedAutomatically error.reconciliationVault.onlyACurrentUnlinkedVerifiedScanObservationCanBeMatched error.reconciliationVault.currentReconciliationObservationsExceedTheirSafetyLimit error.reconciliationVault.thisPaymentNoLongerHasASingleExactInvoiceMatch error.reconciliationVault.anotherRegisteredInvoiceAlreadyUsesThisNonce error.reconciliationVault.onlyAValidSignedReceiptCanBeArchived error.reconciliationVault.invalidReorgBlock error.reconciliationVault.invalidReorgObservationScope error.reconciliationVault.invalidCanonicalBlockHash error.reconciliationVault.reorgInvalidationWasSavedButItsHistoryReachedTheSafety error.reconciliationVault.createACurrentImportPreviewBeforeActivation error.reconciliationVault.theReconciliationSafetyStateChangedPreviewThisBackupAgainBefore error.reconciliationVault.thisBackupWouldExceedTheInvoiceRegistrationOrReceiptArchive error.reconciliationVault.encryptedReconciliationStorageIsUnavailable error.reconciliationVault.closeOtherGhostPayTabsToOpenEncryptedReconciliationStorage error.reconciliationVault.encryptedReconciliationStorageCouldNotBeRead error.reconciliationVault.encryptedReconciliationWriteDidNotCommit error.reconciliationVault.encryptedReconciliationStorageIsFull error.reconciliationVault.theCurrentSellerScopeChanged error.reconciliationVault.theReconciliationVaultReachedItsInvalidationCapacityAndIsRead

// i18n-use: error.reconciliationVault.invoiceCapacity

// i18n-use: error.reconciliationVault.receiptCapacity
