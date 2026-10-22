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
  throw new Error('Local browser storage is unavailable.');
}

function fail(message: string): never {
  throw new Error(message);
}

function announceChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RECONCILIATION_LEDGER_CHANGE_EVENT));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validateRecord(value: unknown): ReconciliationRecord {
  if (!isObject(value)) return fail('A local ledger entry is not an object.');
  const allowed = new Set([
    'version', 'id', 'sellerKeyId', 'chainId', 'transactionHash', 'blockNumber', 'blockHash', 'logIndex',
    'stealthAddress', 'asset', 'amountMinorUnits', 'viewTagMatched', 'invoiceDigest', 'recordedAt', 'evidenceStatus', 'evidenceSource',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return fail('A local ledger entry has unsupported fields.');
  const hex32 = /^0x[0-9a-f]{64}$/;
  const hex20 = /^0x[0-9a-f]{40}$/;
  const keyId = /^[0-9a-f]{64}$/;
  if (value.version !== 1 || typeof value.sellerKeyId !== 'string' || !keyId.test(value.sellerKeyId)) return fail('A local ledger entry has an invalid version or seller scope.');
  if (!Number.isSafeInteger(value.chainId) || (value.chainId as number) <= 0) return fail('A local ledger entry has an invalid chain.');
  if (typeof value.transactionHash !== 'string' || !hex32.test(value.transactionHash) || value.transactionHash !== value.transactionHash.toLowerCase()) return fail('A local ledger entry has an invalid transaction hash.');
  if (typeof value.blockNumber !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value.blockNumber)) return fail('A local ledger entry has an invalid block number.');
  if (typeof value.blockHash !== 'string' || !hex32.test(value.blockHash) || value.blockHash !== value.blockHash.toLowerCase()) return fail('A local ledger entry has an invalid block hash.');
  if (!Number.isSafeInteger(value.logIndex) || (value.logIndex as number) < 0) return fail('A local ledger entry has an invalid log index.');
  if (typeof value.stealthAddress !== 'string' || !hex20.test(value.stealthAddress) || value.stealthAddress !== value.stealthAddress.toLowerCase()) return fail('A local ledger entry has an invalid recipient.');
  if (value.asset !== 'native' && (typeof value.asset !== 'string' || !hex20.test(value.asset) || value.asset !== value.asset.toLowerCase())) return fail('A local ledger entry has an invalid asset.');
  if (typeof value.amountMinorUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(value.amountMinorUnits) || BigInt(value.amountMinorUnits) > MAX_UINT256) return fail('A local ledger entry has an invalid amount.');
  if (typeof value.viewTagMatched !== 'boolean') return fail('A local ledger entry has an invalid view-tag flag.');
  if (value.invoiceDigest !== undefined && (typeof value.invoiceDigest !== 'string' || !hex32.test(value.invoiceDigest) || value.invoiceDigest !== value.invoiceDigest.toLowerCase())) return fail('A local ledger entry has an invalid invoice digest.');
  if (!Number.isSafeInteger(value.recordedAt) || (value.recordedAt as number) <= 0 || (value.recordedAt as number) > 8_640_000_000_000_000) return fail('A local ledger entry has an invalid timestamp.');
  if (value.evidenceStatus !== 'verified-at-scan' && value.evidenceStatus !== 'invalidated-after-reorg') return fail('A local ledger entry has an invalid evidence status.');
  if (value.evidenceSource !== 'verified-router-scan') return fail('A local ledger entry has an invalid evidence source.');
  const expectedId = `${value.sellerKeyId}:${String(value.chainId)}:${value.transactionHash}:${value.stealthAddress}:${value.blockHash}:${String(value.logIndex)}`;
  if (value.id !== expectedId) return fail('A local ledger entry identity does not match its evidence.');
  return value as unknown as ReconciliationRecord;
}

function documentFromRaw(raw: string | null): ReconciliationLedgerDocument {
  if (raw === null) return { version: 1, records: [] };
  if (new TextEncoder().encode(raw).byteLength > MAX_LEDGER_BYTES) return fail('The local reconciliation ledger is larger than its safety limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return fail('The local reconciliation ledger is corrupt and was not changed.'); }
  if (!isObject(parsed) || Object.keys(parsed).sort().join('|') !== 'records|version' || parsed.version !== 1 || !Array.isArray(parsed.records) || parsed.records.length > MAX_RECONCILIATION_RECORDS) return fail('The local reconciliation ledger has an unsupported format.');
  const records = parsed.records.map(validateRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length) return fail('The local reconciliation ledger contains duplicate entries.');
  return { version: 1, records };
}

function serialize(document: ReconciliationLedgerDocument): string {
  const value = JSON.stringify({ version: 1, records: document.records });
  if (new TextEncoder().encode(value).byteLength > MAX_LEDGER_BYTES) return fail('The local reconciliation ledger reached its storage limit.');
  return value;
}

export function isReconciliationLedgerEnabled(storage: LedgerStorage = defaultStorage()): boolean {
  return storage.getItem(RECONCILIATION_LEDGER_ENABLED_KEY) === '1';
}

export function setReconciliationLedgerEnabled(enabled: boolean, storage: LedgerStorage = defaultStorage()): void {
  if (enabled) storage.setItem(RECONCILIATION_LEDGER_ENABLED_KEY, '1');
  else {
    storage.removeItem(RECONCILIATION_LEDGER_ENABLED_KEY);
    storage.removeItem(RECONCILIATION_LEDGER_DATA_KEY);
  }
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
  if (match.receipt !== 'verified' || !match.viaRouter || match.metadata === undefined) return fail('Only a verified router scan match with parsed metadata can be added to the ledger.');
  const transactionHash = match.announcement.transactionHash?.toLowerCase();
  if (transactionHash === undefined) return fail('This verified scan match has no transaction hash and cannot be saved.');
  if (!/^[0-9a-f]{64}$/.test(sellerKeyId)) return fail('The current seller key scope is invalid.');
  if (invoiceDigest !== undefined && !/^0x[0-9a-f]{64}$/.test(invoiceDigest)) return fail('Invoice digest must be a lowercase 32-byte hex value.');
  if (!Number.isSafeInteger(recordedAt) || recordedAt <= 0 || recordedAt > 8_640_000_000_000_000) return fail('The ledger timestamp is invalid.');
  const chainId = match.chainId;
  const stealthAddress = match.stealthAddress.toLowerCase();
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
  return validateRecord(record);
}

export function saveReconciliationRecord(record: ReconciliationRecord, storage: LedgerStorage = defaultStorage()): readonly ReconciliationRecord[] {
  if (!isReconciliationLedgerEnabled(storage)) return fail('Enable the local reconciliation ledger before saving a record.');
  const valid = validateRecord(record);
  const doc = documentFromRaw(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY));
  const previousIndex = doc.records.findIndex((item) => item.id === valid.id);
  if (previousIndex >= 0) {
    const previous = doc.records[previousIndex]!;
    if (previous.invoiceDigest !== undefined && valid.invoiceDigest !== undefined && previous.invoiceDigest !== valid.invoiceDigest) return fail('This payment is already linked to a different invoice digest.');
    if (previous.invoiceDigest === undefined && valid.invoiceDigest !== undefined) {
      const records = [...doc.records];
      records[previousIndex] = { ...previous, invoiceDigest: valid.invoiceDigest };
      storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, serialize({ version: 1, records }));
      announceChanged();
      return records;
    }
    return doc.records;
  }
  if (doc.records.length >= MAX_RECONCILIATION_RECORDS) return fail('The local reconciliation ledger is full. Export and delete older records to continue.');
  const records = [...doc.records, valid];
  storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, serialize({ version: 1, records }));
  announceChanged();
  return records;
}

export function invalidateReconciliationAtOrAfter(chainId: number, sellerKeyId: string, blockNumber: bigint, storage: LedgerStorage = defaultStorage()): readonly ReconciliationRecord[] {
  const doc = documentFromRaw(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY));
  const records = doc.records.map((record) => record.chainId === chainId && record.sellerKeyId === sellerKeyId && BigInt(record.blockNumber) >= blockNumber
    ? { ...record, evidenceStatus: 'invalidated-after-reorg' as const }
    : record);
  if (records.some((record, index) => record !== doc.records[index])) {
    storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, serialize({ version: 1, records }));
    announceChanged();
  }
  return records;
}

export function clearReconciliationRecords(storage: LedgerStorage = defaultStorage()): void {
  storage.removeItem(RECONCILIATION_LEDGER_DATA_KEY);
  announceChanged();
}

export function clearReconciliationScope(chainId: number, sellerKeyId: string, storage: LedgerStorage = defaultStorage()): readonly ReconciliationRecord[] {
  const doc = documentFromRaw(storage.getItem(RECONCILIATION_LEDGER_DATA_KEY));
  const records = doc.records.filter((record) => record.chainId !== chainId || record.sellerKeyId !== sellerKeyId);
  if (records.length === doc.records.length) return records;
  if (records.length === 0) storage.removeItem(RECONCILIATION_LEDGER_DATA_KEY);
  else storage.setItem(RECONCILIATION_LEDGER_DATA_KEY, serialize({ version: 1, records }));
  announceChanged();
  return records;
}

export function exportReconciliationLedger(records: readonly ReconciliationRecord[]): string {
  if (records.length > MAX_RECONCILIATION_RECORDS) return fail('The local reconciliation ledger has too many records to export.');
  return serialize({ version: 1, records: records.map(validateRecord) });
}

export function searchReconciliationRecords(records: readonly ReconciliationRecord[], query: string): readonly ReconciliationRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return records;
  return records.filter((record) => [
    record.id, record.sellerKeyId, String(record.chainId), record.transactionHash, record.blockNumber,
    record.blockHash, record.stealthAddress, record.asset, record.amountMinorUnits, record.invoiceDigest ?? '', record.evidenceStatus,
  ].some((value) => value.toLowerCase().includes(needle)));
}
