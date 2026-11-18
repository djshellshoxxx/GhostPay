import { createReconciliationApi, type ReconciliationRecord } from '@ghostpay/ux-vault/portable';
export type { ReconciliationRecord, ReconciliationLedgerDocument } from '@ghostpay/ux-vault/portable';
const { recordFromVerifiedMatch, MAX_RECONCILIATION_RECORDS, validateReconciliationRecord, exportReconciliationLedger, searchReconciliationRecords } = createReconciliationApi({ Error: UserFacingError });
export { recordFromVerifiedMatch, MAX_RECONCILIATION_RECORDS, validateReconciliationRecord, exportReconciliationLedger, searchReconciliationRecords };
import { UserFacingError, type MessageDescriptor } from './errors';

export const RECONCILIATION_LEDGER_ENABLED_KEY = 'ghostpay.reconciliation.enabled.v1';
export const RECONCILIATION_LEDGER_DATA_KEY = 'ghostpay.reconciliation.records.v1';
export const RECONCILIATION_LEDGER_CHANGE_EVENT = 'ghostpay:reconciliation-ledger-change';
const MAX_LEDGER_BYTES = 2_000_000;

export interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): LedgerStorage {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    // Access to browser storage may throw in privacy modes.
  }
  throw new UserFacingError({ key: 'error.reconciliationLedger.localBrowserStorageIsUnavailable' });
}

function fail(message: MessageDescriptor): never {
  throw new UserFacingError(message);
}

function announceChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RECONCILIATION_LEDGER_CHANGE_EVENT));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function documentFromRaw(raw: string | null): import('@ghostpay/ux-vault/portable').ReconciliationLedgerDocument {
  if (raw === null) return { version: 1, records: [] };
  if (new TextEncoder().encode(raw).byteLength > MAX_LEDGER_BYTES) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerIsLargerThanItsSafetyLimit' });
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerIsCorruptAndWasNotChanged' }); }
  if (!isObject(parsed) || Object.keys(parsed).sort().join('|') !== 'records|version' || parsed.version !== 1 || !Array.isArray(parsed.records) || parsed.records.length > MAX_RECONCILIATION_RECORDS) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerHasAnUnsupportedFormat' });
  const records = parsed.records.map(validateReconciliationRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerContainsDuplicateEntries' });
  return { version: 1, records };
}

/** Legacy opt-in never enables the encrypted vault and cannot authorize new plaintext writes. */
export function isReconciliationLedgerEnabled(storage: LedgerStorage = defaultStorage()): boolean { void storage; return false; }

/** Retained for old callers: disable/delete is supported, enabling the plaintext ledger is forbidden. */
export function setReconciliationLedgerEnabled(enabled: boolean, storage: LedgerStorage = defaultStorage()): void {
  if (enabled) return fail({ key: 'error.reconciliationLedger.theLegacyLedgerIsReadOnlyUseTheEncryptedReconciliation' });
  storage.removeItem(RECONCILIATION_LEDGER_ENABLED_KEY);
  storage.removeItem(RECONCILIATION_LEDGER_DATA_KEY);
  announceChanged();
}

export function readReconciliationRecords(storage: LedgerStorage = defaultStorage()): readonly ReconciliationRecord[] {
  return documentFromRaw(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).records;
}

/** Existing records remain readable/exportable/deletable, but never become fresh chain evidence. */
export function saveReconciliationRecord(_record: ReconciliationRecord, storage: LedgerStorage = defaultStorage()): readonly ReconciliationRecord[] {
  void storage;
  return fail({ key: 'error.reconciliationLedger.theLegacyLedgerIsReadOnlyUseTheEncryptedReconciliation' });
}

export function clearReconciliationRecords(storage: LedgerStorage = defaultStorage()): void {
  storage.removeItem(RECONCILIATION_LEDGER_DATA_KEY);
  announceChanged();
}

/** Explicit untrusted legacy export preserves bounded raw bytes even when schema validation fails. */
export function exportUntrustedLegacyReconciliation(storage: LedgerStorage = defaultStorage()): string {
  const raw = storage.getItem(RECONCILIATION_LEDGER_DATA_KEY);
  if (raw === null) return fail({ key: 'error.reconciliationLedger.noLegacyPlaintextReconciliationDataIsStored' });
  if (raw.length > MAX_LEDGER_BYTES || new TextEncoder().encode(raw).byteLength > MAX_LEDGER_BYTES) return fail({ key: 'error.reconciliationLedger.theLegacyReconciliationDataExceedsItsSafetyLimit' });
  return raw;
}

// i18n-use: error.reconciliationLedger.localBrowserStorageIsUnavailable error.reconciliationLedger.aLocalLedgerEntryIsNotAnObject error.reconciliationLedger.aLocalLedgerEntryHasUnsupportedFields error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidVersionOrSeller error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidChain error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidTransactionHash error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidBlockNumber error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidBlockHash error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidLogIndex error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidRecipient error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidAsset error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidAmount error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidViewTagFlag error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidInvoiceDigest error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidTimestamp error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidEvidenceStatus error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidEvidenceSource error.reconciliationLedger.aLocalLedgerEntryIdentityDoesNotMatchItsEvidence error.reconciliationLedger.theLocalReconciliationLedgerIsLargerThanItsSafetyLimit error.reconciliationLedger.theLocalReconciliationLedgerIsCorruptAndWasNotChanged error.reconciliationLedger.theLocalReconciliationLedgerHasAnUnsupportedFormat error.reconciliationLedger.theLocalReconciliationLedgerContainsDuplicateEntries error.reconciliationLedger.theLocalReconciliationLedgerReachedItsStorageLimit error.reconciliationLedger.theLegacyLedgerIsReadOnlyUseTheEncryptedReconciliation error.reconciliationLedger.onlyAVerifiedRouterScanMatchWithParsedMetadataCan error.reconciliationLedger.thisVerifiedScanMatchHasNoTransactionHashAndCannot error.reconciliationLedger.theCurrentSellerKeyScopeIsInvalid error.reconciliationLedger.invoiceDigestMustBeALowercase32ByteHexValue error.reconciliationLedger.theLedgerTimestampIsInvalid error.reconciliationLedger.theVerifiedScanRecipientDoesNotMatchItsAnnouncement error.reconciliationLedger.noLegacyPlaintextReconciliationDataIsStored error.reconciliationLedger.theLegacyReconciliationDataExceedsItsSafetyLimit error.reconciliationLedger.theLocalReconciliationLedgerHasTooManyRecordsToExport
