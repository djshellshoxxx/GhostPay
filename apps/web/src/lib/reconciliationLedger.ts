import { UserFacingError, type MessageDescriptor } from './errors';
import type { ScanMatch } from './scanClient';

export const RECONCILIATION_LEDGER_ENABLED_KEY = 'ghostpay.reconciliation.enabled.v1';
export const RECONCILIATION_LEDGER_DATA_KEY = 'ghostpay.reconciliation.records.v1';
export const RECONCILIATION_LEDGER_CHANGE_EVENT = 'ghostpay:reconciliation-ledger-change';
export const MAX_RECONCILIATION_RECORDS = 2_000;
const MAX_LEDGER_BYTES = 2_000_000;
const MAX_UINT256 = (1n << 256n) - 1n;

export interface ReconciliationRecord {
  readonly version: 1;
  readonly id: string;
  /** Hash of the seller's public spending/viewing key pair. It scopes records without storing either key. */
  readonly sellerKeyId: string;
  readonly chainId: number;
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly logIndex: number;
  readonly stealthAddress: string;
  readonly asset: string;
  readonly amountMinorUnits: string;
  readonly viewTagMatched: boolean;
  /** Seller-entered association only; no invoice content is loaded or verified here. */
  readonly invoiceDigest?: string;
  readonly recordedAt: number;
  readonly evidenceStatus: 'verified-at-scan' | 'invalidated-after-reorg';
  readonly evidenceSource: 'verified-router-scan';
}

export interface ReconciliationLedgerDocument {
  readonly version: 1;
  readonly records: readonly ReconciliationRecord[];
}

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

export function validateReconciliationRecord(value: unknown): ReconciliationRecord {
  if (!isObject(value)) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryIsNotAnObject' });
  const allowed = new Set([
    'version', 'id', 'sellerKeyId', 'chainId', 'transactionHash', 'blockNumber', 'blockHash', 'logIndex',
    'stealthAddress', 'asset', 'amountMinorUnits', 'viewTagMatched', 'invoiceDigest', 'recordedAt', 'evidenceStatus', 'evidenceSource',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasUnsupportedFields' });
  const hex32 = /^0x[0-9a-f]{64}$/;
  const hex20 = /^0x[0-9a-f]{40}$/;
  const keyId = /^[0-9a-f]{64}$/;
  if (value.version !== 1 || typeof value.sellerKeyId !== 'string' || !keyId.test(value.sellerKeyId)) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidVersionOrSeller' });
  if (!Number.isSafeInteger(value.chainId) || (value.chainId as number) <= 0) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidChain' });
  if (typeof value.transactionHash !== 'string' || !hex32.test(value.transactionHash) || value.transactionHash !== value.transactionHash.toLowerCase()) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidTransactionHash' });
  if (typeof value.blockNumber !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value.blockNumber)) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidBlockNumber' });
  if (typeof value.blockHash !== 'string' || !hex32.test(value.blockHash) || value.blockHash !== value.blockHash.toLowerCase()) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidBlockHash' });
  if (!Number.isSafeInteger(value.logIndex) || (value.logIndex as number) < 0) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidLogIndex' });
  if (typeof value.stealthAddress !== 'string' || !hex20.test(value.stealthAddress) || value.stealthAddress !== value.stealthAddress.toLowerCase()) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidRecipient' });
  if (value.asset !== 'native' && (typeof value.asset !== 'string' || !hex20.test(value.asset) || value.asset !== value.asset.toLowerCase())) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidAsset' });
  if (typeof value.amountMinorUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(value.amountMinorUnits) || BigInt(value.amountMinorUnits) > MAX_UINT256) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidAmount' });
  if (typeof value.viewTagMatched !== 'boolean') return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidViewTagFlag' });
  if (value.invoiceDigest !== undefined && (typeof value.invoiceDigest !== 'string' || !hex32.test(value.invoiceDigest) || value.invoiceDigest !== value.invoiceDigest.toLowerCase())) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidInvoiceDigest' });
  if (!Number.isSafeInteger(value.recordedAt) || (value.recordedAt as number) <= 0 || (value.recordedAt as number) > 8_640_000_000_000_000) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidTimestamp' });
  if (value.evidenceStatus !== 'verified-at-scan' && value.evidenceStatus !== 'invalidated-after-reorg') return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidEvidenceStatus' });
  if (value.evidenceSource !== 'verified-router-scan') return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidEvidenceSource' });
  const expectedId = `${value.sellerKeyId}:${String(value.chainId)}:${value.transactionHash}:${value.stealthAddress}:${value.blockHash}:${String(value.logIndex)}`;
  if (value.id !== expectedId) return fail({ key: 'error.reconciliationLedger.aLocalLedgerEntryIdentityDoesNotMatchItsEvidence' });
  return value as unknown as ReconciliationRecord;
}

function documentFromRaw(raw: string | null): ReconciliationLedgerDocument {
  if (raw === null) return { version: 1, records: [] };
  if (new TextEncoder().encode(raw).byteLength > MAX_LEDGER_BYTES) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerIsLargerThanItsSafetyLimit' });
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerIsCorruptAndWasNotChanged' }); }
  if (!isObject(parsed) || Object.keys(parsed).sort().join('|') !== 'records|version' || parsed.version !== 1 || !Array.isArray(parsed.records) || parsed.records.length > MAX_RECONCILIATION_RECORDS) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerHasAnUnsupportedFormat' });
  const records = parsed.records.map(validateReconciliationRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerContainsDuplicateEntries' });
  return { version: 1, records };
}

function serialize(document: ReconciliationLedgerDocument): string {
  const value = JSON.stringify({ version: 1, records: document.records });
  if (new TextEncoder().encode(value).byteLength > MAX_LEDGER_BYTES) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerReachedItsStorageLimit' });
  return value;
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

/** Builds a record only from the scan path's verified router result; imported seller receipts are never accepted here. */
export function recordFromVerifiedMatch(
  match: ScanMatch,
  sellerKeyId: string,
  invoiceDigest?: string,
  recordedAt = Date.now(),
): ReconciliationRecord {
  if (match.receipt !== 'verified' || !match.viaRouter || match.metadata === undefined) return fail({ key: 'error.reconciliationLedger.onlyAVerifiedRouterScanMatchWithParsedMetadataCan' });
  const transactionHash = match.announcement.transactionHash?.toLowerCase();
  if (transactionHash === undefined) return fail({ key: 'error.reconciliationLedger.thisVerifiedScanMatchHasNoTransactionHashAndCannot' });
  if (!/^[0-9a-f]{64}$/.test(sellerKeyId)) return fail({ key: 'error.reconciliationLedger.theCurrentSellerKeyScopeIsInvalid' });
  if (invoiceDigest !== undefined && !/^0x[0-9a-f]{64}$/.test(invoiceDigest)) return fail({ key: 'error.reconciliationLedger.invoiceDigestMustBeALowercase32ByteHexValue' });
  if (!Number.isSafeInteger(recordedAt) || recordedAt <= 0 || recordedAt > 8_640_000_000_000_000) return fail({ key: 'error.reconciliationLedger.theLedgerTimestampIsInvalid' });
  const chainId = match.chainId;
  const stealthAddress = match.stealthAddress.toLowerCase();
  if (stealthAddress !== match.announcement.stealthAddress.toLowerCase())
    return fail({ key: 'error.reconciliationLedger.theVerifiedScanRecipientDoesNotMatchItsAnnouncement' });
  const blockHash = match.announcement.blockHash.toLowerCase();
  const blockNumber = match.announcement.blockNumber.toString();
  const logIndex = match.announcement.logIndex;
  const asset = match.metadata.kind === 'native' ? 'native' : match.metadata.token.toLowerCase();
  const amountMinorUnits = match.metadata.netAmount.toString();
  const record: ReconciliationRecord = {
    version: 1,
    id: `${sellerKeyId}:${String(chainId)}:${transactionHash}:${stealthAddress}:${blockHash}:${String(logIndex)}`,
    sellerKeyId,
    chainId,
    transactionHash,
    blockNumber,
    blockHash,
    logIndex,
    stealthAddress,
    asset,
    amountMinorUnits,
    viewTagMatched: match.tagMatches,
    ...(invoiceDigest === undefined ? {} : { invoiceDigest }),
    recordedAt,
    evidenceStatus: 'verified-at-scan',
    evidenceSource: 'verified-router-scan',
  };
  return validateReconciliationRecord(record);
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

export function exportReconciliationLedger(records: readonly ReconciliationRecord[]): string {
  if (records.length > MAX_RECONCILIATION_RECORDS) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerHasTooManyRecordsToExport' });
  return serialize({ version: 1, records: records.map(validateReconciliationRecord) });
}

export function searchReconciliationRecords(records: readonly ReconciliationRecord[], query: string): readonly ReconciliationRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return records;
  return records.filter((record) => [
    record.id, record.sellerKeyId, String(record.chainId), record.transactionHash, record.blockNumber,
    record.blockHash, record.stealthAddress, record.asset, record.amountMinorUnits, record.invoiceDigest ?? '', record.evidenceStatus,
  ].some((value) => value.toLowerCase().includes(needle)));
}

// i18n-use: error.reconciliationLedger.localBrowserStorageIsUnavailable error.reconciliationLedger.aLocalLedgerEntryIsNotAnObject error.reconciliationLedger.aLocalLedgerEntryHasUnsupportedFields error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidVersionOrSeller error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidChain error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidTransactionHash error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidBlockNumber error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidBlockHash error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidLogIndex error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidRecipient error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidAsset error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidAmount error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidViewTagFlag error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidInvoiceDigest error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidTimestamp error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidEvidenceStatus error.reconciliationLedger.aLocalLedgerEntryHasAnInvalidEvidenceSource error.reconciliationLedger.aLocalLedgerEntryIdentityDoesNotMatchItsEvidence error.reconciliationLedger.theLocalReconciliationLedgerIsLargerThanItsSafetyLimit error.reconciliationLedger.theLocalReconciliationLedgerIsCorruptAndWasNotChanged error.reconciliationLedger.theLocalReconciliationLedgerHasAnUnsupportedFormat error.reconciliationLedger.theLocalReconciliationLedgerContainsDuplicateEntries error.reconciliationLedger.theLocalReconciliationLedgerReachedItsStorageLimit error.reconciliationLedger.theLegacyLedgerIsReadOnlyUseTheEncryptedReconciliation error.reconciliationLedger.onlyAVerifiedRouterScanMatchWithParsedMetadataCan error.reconciliationLedger.thisVerifiedScanMatchHasNoTransactionHashAndCannot error.reconciliationLedger.theCurrentSellerKeyScopeIsInvalid error.reconciliationLedger.invoiceDigestMustBeALowercase32ByteHexValue error.reconciliationLedger.theLedgerTimestampIsInvalid error.reconciliationLedger.theVerifiedScanRecipientDoesNotMatchItsAnnouncement error.reconciliationLedger.noLegacyPlaintextReconciliationDataIsStored error.reconciliationLedger.theLegacyReconciliationDataExceedsItsSafetyLimit error.reconciliationLedger.theLocalReconciliationLedgerHasTooManyRecordsToExport
