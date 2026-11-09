import type { ScannedAnnouncement } from '@ghostpay/chain-adapters';
import type { ParsedMetadata } from '@ghostpay/core-crypto';
import { parseStrictJson, invoiceDigest, receiptJson, validateReceiptPayload, verifyReceipt, type Invoice, type SignedReceipt } from '@ghostpay/invoice-schema';
import { grossForNet, routerNet } from '@ghostpay/chain-adapters';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { PortableVaultError, type PortableErrorConstructor, type PortableMessageDescriptor as MessageDescriptor } from './portable-errors.js';


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


export interface RegisteredInvoice {
  readonly version: 1;
  readonly invoiceDigest: string;
  /** Local identity only; the nonce never appears on chain. */
  readonly nonce: string;
  readonly chainId: number;
  readonly asset: string;
  /** Exact router net amount a GhostPay payment of this invoice delivers to the one-time address. */
  readonly expectedNetMinorUnits: string;
  /** Unix seconds (invoice quote timestamp). */
  readonly createdAt: number;
  /** Unix seconds. */
  readonly expiresAt: number;
  /** Milliseconds since the epoch. */
  readonly registeredAt: number;
}


export type MatchProposal =
  | { readonly kind: 'exact'; readonly invoice: RegisteredInvoice }
  | {
      readonly kind: 'ambiguous';
      readonly candidates: readonly RegisteredInvoice[];
      readonly reason: 'multiple-invoices' | 'multiple-payments' | 'late-observation';
    }
  | { readonly kind: 'none' };


export type ContextRecord = ReconciliationRecord & { readonly provenance?: 'live-scan' | 'imported-history' };

export interface ReconciliationScope {
  readonly sellerKeyId: string;
  readonly chainId: number;
}

export interface VaultRecord extends ReconciliationRecord {
  readonly provenance: 'live-scan' | 'imported-history';
}

/** A seller-issued receipt kept for the seller's records. It is never payment evidence and never feeds matching. */
export interface ArchivedReceipt {
  readonly receipt: SignedReceipt;
  readonly archivedAt: number;
}

export interface Document {
  readonly saturated: boolean;
  readonly version: 3;
  readonly records: readonly VaultRecord[];
  /**
   * Lowest block of any reorg this vault handled. Records the vault held then were checked against the chain; the
   * cutoff only covers observations it did not hold, recorded before `invalidatedAt` (imported later).
   */
  readonly invalidatedFrom: string | null;
  /** When the cutoff was last moved (ms); null for documents written before it was recorded (applies to all). */
  readonly invalidatedAt: number | null;
  /** Ids of observations whose block a confirmed reorg replaced; never accepted again. */
  readonly tombstones: readonly string[];
  /** Opt-in, minimized invoice registrations for local matching. */
  readonly invoices: readonly RegisteredInvoice[];
  readonly receipts: readonly ArchivedReceipt[];
}

export interface Envelope extends ReconciliationScope {
  readonly format: 'ghostpay-reconciliation';
  readonly version: 1;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export interface ReconciliationVaultStore {
  read(key: string): Promise<string | null>;
  /** Exact previous ciphertext comparison and guard run inside the same readwrite transaction, before put. */
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean>;
}

export interface ReconciliationState {
  readonly records: readonly VaultRecord[];
  readonly readOnly: boolean;
  readonly invoices: readonly RegisteredInvoice[];
  readonly receipts: readonly ArchivedReceipt[];
}

export interface ReconciliationImportPreview {
  readonly readOnly: boolean;
  readonly recordCount: number;
  readonly invalidatedCount: number;
  readonly invoiceCount: number;
  readonly receiptCount: number;
}

export interface Cutoff {
  readonly from: bigint;
  /** Null: recorded before cutoff times existed, so it covers every observation at or above `from`. */
  readonly at: number | null;
}
export interface ReconciliationVaultHandle {
unlock(key: Uint8Array): Promise<void>;
lock(): void;
read(): Promise<readonly VaultRecord[]>;
readState(): Promise<ReconciliationState>;
save(value: ReconciliationRecord, actionGuard?: () => void): Promise<void>;
confirmProposal(value: ReconciliationRecord | VaultRecord, invoiceDigest: string, options?: {
    readonly current?: readonly ReconciliationRecord[];
    readonly guard?: () => void;
}): Promise<void>;
proposals(current?: readonly ReconciliationRecord[]): Promise<ReadonlyMap<string, MatchProposal>>;
registerInvoice(value: RegisteredInvoice): Promise<void>;
removeInvoice(invoiceDigest: string): Promise<void>;
clearInvoices(): Promise<void>;
archiveReceipt(receipt: SignedReceipt, archivedAt?: number): Promise<void>;
removeReceipt(signature: string): Promise<void>;
clearReceipts(): Promise<void>;
exportReceipts(): Promise<string>;
invalidateFrom(block: bigint, observed: readonly ReconciliationRecord[], canonicalHash: (height: bigint) => Promise<string>): Promise<void>;
clearRecords(): Promise<void>;
exportEncrypted(): Promise<string>;
previewImport(text: string): Promise<ReconciliationImportPreview>;
activateImport(preview: ReconciliationImportPreview): Promise<void>;
}
export type ReconciliationVaultConstructor = new (store: ReconciliationVaultStore, scope: ReconciliationScope, sessionGuard: () => void, now?: () => number) => ReconciliationVaultHandle;


export interface VerifiedReconciliationMatch {
 readonly chainId: number; readonly announcement: ScannedAnnouncement; readonly stealthAddress: string;
 readonly metadata: ParsedMetadata | undefined; readonly viaRouter: boolean; readonly tagMatches: boolean;
 readonly receipt: 'verified' | 'claimed' | 'pending';
}

/** Shared browser/CLI domain engine. Storage, notifications and diagnostics are injected. */
export function createReconciliationApi(options: { readonly Error?: PortableErrorConstructor; readonly notify?: () => void } = {}) {
  const UserFacingError = options.Error ?? PortableVaultError;
  const announce = options.notify ?? (() => undefined);

const MAX_RECONCILIATION_RECORDS = 2_000;

const MAX_LEDGER_BYTES = 2_000_000;

const MAX_UINT256 = (1n << 256n) - 1n;


function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}


function validateReconciliationRecord(value: unknown): ReconciliationRecord {
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


function serialize(document: ReconciliationLedgerDocument): string {
  const value = JSON.stringify({ version: 1, records: document.records });
  if (new TextEncoder().encode(value).byteLength > MAX_LEDGER_BYTES) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerReachedItsStorageLimit' });
  return value;
}


function exportReconciliationLedger(records: readonly ReconciliationRecord[]): string {
  if (records.length > MAX_RECONCILIATION_RECORDS) return fail({ key: 'error.reconciliationLedger.theLocalReconciliationLedgerHasTooManyRecordsToExport' });
  return serialize({ version: 1, records: records.map(validateReconciliationRecord) });
}


function searchReconciliationRecords<T extends ReconciliationRecord>(records: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return records;
  return records.filter((record) => [
    record.id, record.sellerKeyId, String(record.chainId), record.transactionHash, record.blockNumber,
    record.blockHash, record.stealthAddress, record.asset, record.amountMinorUnits, record.invoiceDigest ?? '', record.evidenceStatus,
  ].some((value) => value.toLowerCase().includes(needle)));
}


/**
 * Local invoice-to-payment matching (audit gap G-04). Nothing here is published: the chain carries no invoice
 * reference, so matches are inferred on this device from chain, asset, exact router net amount and a time window.
 * A proposal is a hint for the seller, never payment evidence; seller-signed receipts are never an input.
 */
const MAX_REGISTERED_INVOICES = 500;

/** Tolerated device clock difference between invoice creation and the scan that recorded a payment. */
const MATCH_CLOCK_SKEW_MS = 5 * 60_000;


const KEYS = 'asset|chainId|createdAt|expectedNetMinorUnits|expiresAt|invoiceDigest|nonce|registeredAt|version';

const MAX_TIME_MS = 8_640_000_000_000_000;


function validateRegisteredInvoice(value: unknown): RegisteredInvoice {
  const prototype: unknown = typeof value === 'object' && value !== null ? Object.getPrototypeOf(value) : undefined;
  if (Array.isArray(value) || (prototype !== Object.prototype && prototype !== null))
    return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoice' });
  // Strict JSON parsing yields null-prototype objects; keep a plain copy.
  const o = { ...(value as Record<string, unknown>) };
  // Schema keys use locale-independent UTF-16 order, matching the canonical ASCII key list.
  if (Object.keys(o).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join('|') !== KEYS || o.version !== 1) return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoice' });
  if (typeof o.invoiceDigest !== 'string' || !/^0x[0-9a-f]{64}$/.test(o.invoiceDigest)) return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceDigest' });
  if (typeof o.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(o.nonce)) return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceNonce' });
  if (!Number.isSafeInteger(o.chainId) || (o.chainId as number) <= 0) return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceChain' });
  if (typeof o.asset !== 'string' || (o.asset !== 'native' && !/^0x[0-9a-f]{40}$/.test(o.asset))) return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceAsset' });
  if (typeof o.expectedNetMinorUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(o.expectedNetMinorUnits) || BigInt(o.expectedNetMinorUnits) > MAX_UINT256)
    return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceAmount' });
  const seconds = (n: unknown): boolean => Number.isSafeInteger(n) && (n as number) > 0 && (n as number) * 1000 <= MAX_TIME_MS;
  if (!seconds(o.createdAt) || !seconds(o.expiresAt) || (o.expiresAt as number) <= (o.createdAt as number))
    return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceTimeWindow' });
  if (!Number.isSafeInteger(o.registeredAt) || (o.registeredAt as number) <= 0 || (o.registeredAt as number) > MAX_TIME_MS)
    return fail({ key: 'error.reconciliationMatch.invalidRegisteredInvoiceTimestamp' });
  return o as unknown as RegisteredInvoice;
}


/** Keeps only the fields matching needs: no line items, memo, fiat totals, meta-address or signer key. */
function registrationFromInvoice(invoice: Invoice, registeredAt = Date.now()): RegisteredInvoice {
  if (invoice.amountPolicy.mode !== 'fixed_token')
    throw new UserFacingError({ key: 'error.reconciliationMatch.onlyInvoicesWithAFixedTokenAmountCanBeRegistered' });
  const wanted = BigInt(invoice.amountPolicy.tokenAmount);
  const net = invoice.feePolicy === 'payer_pays' ? routerNet(grossForNet(wanted)) : routerNet(wanted);
  return validateRegisteredInvoice({
    version: 1,
    invoiceDigest: `0x${bytesToHex(invoiceDigest(invoice))}`,
    nonce: invoice.nonce,
    chainId: invoice.chainId,
    asset: invoice.token,
    expectedNetMinorUnits: net.toString(),
    createdAt: invoice.quote.timestamp,
    expiresAt: invoice.expiresAt,
    registeredAt,
  });
}


/** Only current router-verified live observations without an annotation take part in automatic matching. */
function eligible(record: ContextRecord): boolean {
  return (
    record.evidenceStatus === 'verified-at-scan' &&
    record.evidenceSource === 'verified-router-scan' &&
    record.invoiceDigest === undefined &&
    (record.provenance === undefined || record.provenance === 'live-scan')
  );
}


function candidate(invoice: RegisteredInvoice, record: ContextRecord): boolean {
  return (
    invoice.chainId === record.chainId &&
    invoice.asset === record.asset &&
    invoice.expectedNetMinorUnits === record.amountMinorUnits &&
    record.recordedAt >= invoice.createdAt * 1000 - MATCH_CLOCK_SKEW_MS
  );
}


/**
 * Proposes a registered invoice for one observation. `exact` needs a unique pairing in both directions within the
 * supplied context and an observation before expiry; every other overlap is `ambiguous` and must be resolved
 * by the seller. Invoices already linked to a current verified observation are not offered again.
 */
function proposeInvoiceMatch(
  record: ContextRecord,
  invoices: readonly RegisteredInvoice[],
  context: readonly ContextRecord[],
): MatchProposal {
  if (!eligible(record)) return { kind: 'none' };
  const byId = new Map<string, ContextRecord>();
  for (const item of [...context, record]) byId.set(item.id, item);
  const all = [...byId.values()];
  const claimed = new Set(
    all.filter((r) => r.evidenceStatus === 'verified-at-scan' && r.invoiceDigest !== undefined).map((r) => r.invoiceDigest),
  );
  const open = invoices.filter((invoice) => !claimed.has(invoice.invoiceDigest));
  const candidates = open.filter((invoice) => candidate(invoice, record));
  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates, reason: 'multiple-invoices' };
  const invoice = candidates[0]!;
  const competing = all.filter((r) => r.id !== record.id && eligible(r) && candidate(invoice, r));
  if (competing.length > 0) return { kind: 'ambiguous', candidates, reason: 'multiple-payments' };
  // Observation time is not block time. A late scan cannot establish that payment preceded invoice expiry.
  if (record.recordedAt >= invoice.expiresAt * 1000)
    return { kind: 'ambiguous', candidates, reason: 'late-observation' };
  return { kind: 'exact', invoice };
}


/** Only ciphertext and public seller/chain scope identifiers are persisted. No plaintext document is cached. */
const MAX_VAULT_BYTES = 8_000_000;

/** Canonical block-hash reads in flight during a reorg check (a rollback to genesis can cover every stored height). */
const CANONICAL_READS_IN_FLIGHT = 8;

const MAX_ARCHIVED_RECEIPTS = 500;

const encoder = new TextEncoder();

const decoder = new TextDecoder('utf-8', { fatal: true });

const empty = (): Document => ({
  version: 3,
  records: [],
  invalidatedFrom: null,
  invalidatedAt: null,
  tombstones: [],
  saturated: false,
  invoices: [],
  receipts: [],
});

const READ_ONLY_MESSAGE: MessageDescriptor = { key: 'error.reconciliationVault.theReconciliationVaultReachedItsInvalidationCapacityAndIsRead' };

const receiptId = (receipt: SignedReceipt): string => receipt.signature;

function fail(message: MessageDescriptor): never {
  throw new UserFacingError(message);
}

function object(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function exact(value: Record<string, unknown>, keys: string): boolean {
  return Object.keys(value).sort().join('|') === keys.split('|').sort().join('|');
}

function random(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function scopeKey(scope: ReconciliationScope): string {
  return `${scope.sellerKeyId}:${scope.chainId}`;
}

function assertScope(scope: ReconciliationScope): void {
  if (!/^[a-f0-9]{64}$/.test(scope.sellerKeyId) || !Number.isSafeInteger(scope.chainId) || scope.chainId <= 0)
    fail({ key: 'error.reconciliationVault.invalidReconciliationScope' });
}

function parseEnvelope(text: string, scope: ReconciliationScope): Envelope {
  if (text.length > MAX_VAULT_BYTES || encoder.encode(text).byteLength > MAX_VAULT_BYTES)
    fail({ key: 'error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit' });
  let value: unknown;
  try {
    value = parseStrictJson(text);
  } catch {
    return fail({ key: 'error.reconciliationVault.invalidEncryptedReconciliationFormat' });
  }
  if (
    !object(value) ||
    !exact(value, 'format|version|sellerKeyId|chainId|salt|iv|ciphertext') ||
    value.format !== 'ghostpay-reconciliation' ||
    value.version !== 1
  )
    fail({ key: 'error.reconciliationVault.invalidEncryptedReconciliationFormat' });
  if (value.sellerKeyId !== scope.sellerKeyId || value.chainId !== scope.chainId)
    fail({ key: 'error.reconciliationVault.encryptedReconciliationDataBelongsToAnotherSellerOrChainScope' });
  if (
    typeof value.salt !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.salt) ||
    typeof value.iv !== 'string' ||
    !/^[a-f0-9]{24}$/.test(value.iv) ||
    typeof value.ciphertext !== 'string' ||
    value.ciphertext.length < 32 ||
    value.ciphertext.length % 2 !== 0 ||
    !/^[a-f0-9]+$/.test(value.ciphertext)
  )
    fail({ key: 'error.reconciliationVault.invalidEncryptedReconciliationFields' });
  return value as unknown as Envelope;
}

function validateDocument(value: unknown, scope: ReconciliationScope): Document {
  // Version 1 documents (before invoice registration and receipt archiving) and version 2 documents (before the
  // reorg cutoff time) upgrade on the next write.
  const legacy =
    object(value) && value.version === 1 && exact(value, 'version|records|invalidatedFrom|tombstones|saturated');
  const timed = object(value) && value.version === 3;
  if (
    !object(value) ||
    (!legacy &&
      ((value.version !== 2 && value.version !== 3) ||
        !exact(
          value,
          `version|records|invalidatedFrom|tombstones|saturated|invoices|receipts${timed ? '|invalidatedAt' : ''}`,
        ) ||
        !Array.isArray(value.invoices) ||
        value.invoices.length > MAX_REGISTERED_INVOICES ||
        !Array.isArray(value.receipts) ||
        value.receipts.length > MAX_ARCHIVED_RECEIPTS)) ||
    typeof value.saturated !== 'boolean' ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_RECONCILIATION_RECORDS ||
    !Array.isArray(value.tombstones) ||
    value.tombstones.length > MAX_RECONCILIATION_RECORDS
  )
    fail({ key: 'error.reconciliationVault.invalidReconciliationDocumentOrRecordLimit' });
  if (
    value.invalidatedFrom !== null &&
    (typeof value.invalidatedFrom !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value.invalidatedFrom))
  )
    fail({ key: 'error.reconciliationVault.invalidReconciliationReorgCutoff' });
  const invalidatedAt = timed ? value.invalidatedAt : null;
  if (
    invalidatedAt !== null &&
    (value.invalidatedFrom === null ||
      !Number.isSafeInteger(invalidatedAt) ||
      (invalidatedAt as number) <= 0 ||
      (invalidatedAt as number) > 8_640_000_000_000_000)
  )
    fail({ key: 'error.reconciliationVault.invalidReconciliationReorgCutoffTime' });
  const records = value.records.map((item: unknown): VaultRecord => {
    if (!object(item) || (item.provenance !== 'live-scan' && item.provenance !== 'imported-history'))
      return fail({ key: 'error.reconciliationVault.invalidReconciliationProvenance' });
    const { provenance, ...rest } = item;
    const record = validateReconciliationRecord(rest);
    if (record.chainId !== scope.chainId || record.sellerKeyId !== scope.sellerKeyId)
      fail({ key: 'error.reconciliationVault.reconciliationRecordHasAnotherScope' });
    return { ...record, provenance };
  });
  if (new Set(records.map((r) => r.id)).size !== records.length) fail({ key: 'error.reconciliationVault.duplicateReconciliationRecords' });
  const tombstones = value.tombstones.map((id: unknown): string =>
    typeof id === 'string' && id.length <= 400 && id.startsWith(`${scopeKey(scope)}:`)
      ? id
      : fail({ key: 'error.reconciliationVault.invalidReconciliationTombstone' }),
  );
  if (new Set(tombstones).size !== tombstones.length) fail({ key: 'error.reconciliationVault.duplicateReconciliationTombstones' });
  const invoices = legacy
    ? []
    : (value.invoices as unknown[]).map((item) => {
        const invoice = validateRegisteredInvoice(item);
        if (invoice.chainId !== scope.chainId) fail({ key: 'error.reconciliationVault.registeredInvoiceHasAnotherScope' });
        return invoice;
      });
  if (new Set(invoices.map((i) => i.invoiceDigest)).size !== invoices.length) fail({ key: 'error.reconciliationVault.duplicateRegisteredInvoice' });
  if (new Set(invoices.map((i) => i.nonce)).size !== invoices.length) fail({ key: 'error.reconciliationVault.duplicateRegisteredInvoiceNonce' });
  const receipts = legacy ? [] : (value.receipts as unknown[]).map((item) => validateArchivedReceipt(item, scope));
  if (new Set(receipts.map((r) => receiptId(r.receipt))).size !== receipts.length) fail({ key: 'error.reconciliationVault.duplicateArchivedReceipt' });
  return {
    version: 3,
    records,
    invalidatedFrom: value.invalidatedFrom,
    invalidatedAt: invalidatedAt as number | null,
    tombstones,
    saturated: value.saturated,
    invoices,
    receipts,
  };
}

/** Authenticated ciphertext already protects stored receipts; signatures are verified when archived. */
function validateArchivedReceipt(value: unknown, scope: ReconciliationScope): ArchivedReceipt {
  if (!object(value) || !exact(value, 'receipt|archivedAt') || !object(value.receipt))
    return fail({ key: 'error.reconciliationVault.invalidArchivedReceipt' });
  const { signature, ...payload } = value.receipt;
  let clean: ReturnType<typeof validateReceiptPayload>;
  try {
    clean = validateReceiptPayload(payload);
  } catch {
    return fail({ key: 'error.reconciliationVault.invalidArchivedReceipt' });
  }
  if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/.test(signature)) return fail({ key: 'error.reconciliationVault.invalidArchivedReceipt' });
  if (clean.chainId !== scope.chainId) fail({ key: 'error.reconciliationVault.archivedReceiptHasAnotherScope' });
  const at = value.archivedAt;
  if (!Number.isSafeInteger(at) || (at as number) <= 0 || (at as number) > 8_640_000_000_000_000)
    fail({ key: 'error.reconciliationVault.invalidArchivedReceiptTimestamp' });
  return { receipt: { ...clean, signature }, archivedAt: at as number };
}

/**
 * Applies a live verified observation, preserving reorg tombstones and any prior annotation. A tombstoned id (its block
 * was replaced) is refused for good; a precautionary invalidation without a tombstone (an imported observation under a
 * reorg cutoff) is replaced by this fresh verified observation of the same block hash.
 */
function withSaved(document: Document, record: ReconciliationRecord): Document {
  if (document.saturated) throw new UserFacingError(READ_ONLY_MESSAGE);
  if (document.tombstones.includes(record.id)) fail({ key: 'error.reconciliationVault.thisHistoricalObservationWasInvalidatedByAReorg' });
  const prior = document.records.find((r) => r.id === record.id);
  if (
    prior?.invoiceDigest !== undefined &&
    record.invoiceDigest !== undefined &&
    prior.invoiceDigest !== record.invoiceDigest
  )
    fail({ key: 'error.reconciliationVault.thisRecordAlreadyHasADifferentInvoiceAnnotation' });
  const next: VaultRecord = {
    ...record,
    ...(prior?.invoiceDigest === undefined ? {} : { invoiceDigest: prior.invoiceDigest }),
    provenance: 'live-scan',
  };
  const records =
    prior === undefined ? [...document.records, next] : document.records.map((r) => (r.id === record.id ? next : r));
  return { ...document, records };
}

function cutoffOf(document: Document): Cutoff | undefined {
  return document.invalidatedFrom === null
    ? undefined
    : { from: BigInt(document.invalidatedFrom), at: document.invalidatedAt };
}

/** Whether a cutoff covers an observation its vault did not hold: at or above the block, recorded before it. */
function covers(cutoff: Cutoff | undefined, record: ReconciliationRecord): boolean {
  return (
    cutoff !== undefined &&
    BigInt(record.blockNumber) >= cutoff.from &&
    (cutoff.at === null || record.recordedAt < cutoff.at)
  );
}

/** The lower block and the later time of two cutoffs (a missing time stays missing): conservative for later imports. */
function mergeCutoffs(a: Cutoff | undefined, b: Cutoff | undefined): Cutoff | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  return { from: a.from < b.from ? a.from : b.from, at: a.at === null || b.at === null ? null : Math.max(a.at, b.at) };
}

const invalidated = (record: VaultRecord): VaultRecord => ({ ...record, evidenceStatus: 'invalidated-after-reorg' });

/**
 * The document an import activates; previews count from the same merge. Tombstones always apply. A cutoff covers only
 * observations its own vault did not hold when it was set: the local cutoff applies to imported records, the imported
 * cutoff to local imported history (to every record once tombstones are saturated). Records already invalid stay so.
 */
function mergeImport(document: Document, imported: Document): Document {
  const tombstones = [...new Set([...document.tombstones, ...imported.tombstones])];
  const saturated = document.saturated || imported.saturated || tombstones.length > MAX_RECONCILIATION_RECORDS;
  const local = cutoffOf(document);
  const remote = cutoffOf(imported);
  const records = document.records.map((r): VaultRecord =>
    tombstones.includes(r.id) || ((saturated || r.provenance === 'imported-history') && covers(remote, r))
      ? invalidated(r)
      : r,
  );
  const known = new Set(records.map((r) => r.id));
  for (const record of imported.records) {
    if (known.has(record.id)) continue;
    const next: VaultRecord = { ...record, provenance: 'imported-history' };
    records.push(
      record.evidenceStatus === 'invalidated-after-reorg' ||
        tombstones.includes(record.id) ||
        covers(local, record) ||
        (saturated && covers(remote, record))
        ? invalidated(next)
        : next,
    );
  }
  // Registrations and archived receipts merge by identity; a nonce reused by another digest keeps the local one.
  const invoices = [...document.invoices];
  for (const invoice of imported.invoices)
    if (!invoices.some((i) => i.invoiceDigest === invoice.invoiceDigest || i.nonce === invoice.nonce))
      invoices.push(invoice);
  const receipts = [...document.receipts];
  for (const entry of imported.receipts)
    if (!receipts.some((r) => receiptId(r.receipt) === receiptId(entry.receipt))) receipts.push(entry);
  const cutoff = mergeCutoffs(local, remote);
  return {
    version: 3,
    records,
    tombstones: tombstones.slice(0, MAX_RECONCILIATION_RECORDS),
    invalidatedFrom: cutoff?.from.toString() ?? null,
    invalidatedAt: cutoff?.at ?? null,
    saturated,
    invoices,
    receipts,
  };
}

const invalidCount = (document: Document): number =>
  document.records.filter((r) => r.evidenceStatus === 'invalidated-after-reorg').length;


class ReconciliationVault {
  private base: CryptoKey | undefined;
  private revision = 0;
  private readonly scope: ReconciliationScope;
  private readonly previews = new WeakMap<
    ReconciliationImportPreview,
    { readonly text: string; readonly revision: number }
  >();
  public constructor(
    private readonly store: ReconciliationVaultStore,
    scope: ReconciliationScope,
    private readonly sessionGuard: () => void,
    private readonly now: () => number = () => Date.now(),
  ) {
    assertScope(scope);
    this.scope = Object.freeze({ ...scope });
  }
  private guard(revision = this.revision): void {
    this.sessionGuard();
    if (this.base === undefined) fail({ key: 'error.reconciliationVault.theReconciliationVaultIsLocked' });
    if (revision !== this.revision) fail({ key: 'error.reconciliationVault.reconciliationVaultActionBecameStale' });
  }
  public async unlock(key: Uint8Array): Promise<void> {
    const revision = ++this.revision;
    this.base = undefined;
    const material = Uint8Array.from(key);
    try {
      this.sessionGuard();
      if (key.byteLength !== 32) fail({ key: 'error.reconciliationVault.invalidReconciliationViewingKey' });
      const base = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
      this.sessionGuard();
      if (revision !== this.revision) fail({ key: 'error.reconciliationVault.reconciliationVaultActionBecameStale' });
      this.base = base;
    } finally {
      key.fill(0);
      material.fill(0);
    }
  }
  public lock(): void {
    this.base = undefined;
    this.revision++;
  }
  private async aes(salt: string): Promise<CryptoKey> {
    this.guard();
    const base = this.base!;
    const revision = this.revision;
    const key = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: hexToBytes(salt),
        info: encoder.encode(`GhostPay/reconciliation/v1/aes-gcm|${scopeKey(this.scope)}`),
      },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    this.guard();
    if (revision !== this.revision) fail({ key: 'error.reconciliationVault.reconciliationVaultActionBecameStale' });
    return key;
  }
  private aad(envelope: Omit<Envelope, 'ciphertext'>): Uint8Array<ArrayBuffer> {
    return encoder.encode(JSON.stringify(envelope));
  }
  private async decrypt(text: string): Promise<Document> {
    const revision = this.revision;
    this.guard(revision);
    const envelope = parseEnvelope(text, this.scope);
    const key = await this.aes(envelope.salt);
    const { ciphertext, ...header } = envelope;
    let plaintext: Uint8Array<ArrayBuffer> | undefined;
    try {
      plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: hexToBytes(envelope.iv), additionalData: this.aad(header), tagLength: 128 },
          key,
          hexToBytes(ciphertext),
        ),
      );
      this.guard(revision);
      if (plaintext.byteLength > MAX_VAULT_BYTES / 2)
        fail({ key: 'error.reconciliationVault.reconciliationPlaintextExceedsItsSafetyLimit' });
      return validateDocument(parseStrictJson(decoder.decode(plaintext)), this.scope);
    } catch (error) {
      this.guard(revision);
      if (
        error instanceof Error &&
        /scope|record|limit|document|provenance|tombstone|cutoff|invoice|receipt/.test(error.message)
      )
        throw error;
      throw new UserFacingError({ key: 'error.reconciliationVault.couldNotDecryptOrValidateTheReconciliationData' });
    } finally {
      plaintext?.fill(0);
    }
  }
  private async encrypt(document: Document): Promise<string> {
    const revision = this.revision;
    this.guard(revision);
    validateDocument(document, this.scope);
    // Also apply the legacy record byte bound before allocation/encryption.
    exportReconciliationLedger(
      document.records.map((value) => {
        const { provenance, ...record } = value;
        void provenance;
        return record;
      }),
    );
    const header = {
      format: 'ghostpay-reconciliation' as const,
      version: 1 as const,
      ...this.scope,
      salt: bytesToHex(random(32)),
      iv: bytesToHex(random(12)),
    };
    const key = await this.aes(header.salt);
    const plaintext = encoder.encode(JSON.stringify(document));
    try {
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: hexToBytes(header.iv), additionalData: this.aad(header), tagLength: 128 },
        key,
        plaintext,
      );
      this.guard(revision);
      const result = JSON.stringify({ ...header, ciphertext: bytesToHex(new Uint8Array(ciphertext)) });
      if (result.length > MAX_VAULT_BYTES) fail({ key: 'error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit' });
      return result;
    } finally {
      plaintext.fill(0);
    }
  }
  private async snapshot(): Promise<{ text: string | null; document: Document }> {
    const revision = this.revision;
    this.guard(revision);
    const text = await this.store.read(scopeKey(this.scope));
    this.guard(revision);
    return { text, document: text === null ? empty() : await this.decrypt(text) };
  }
  private async change(update: (document: Document) => Document, actionGuard: () => void = () => undefined): Promise<void> {
    const revision = this.revision;
    const guard = (): void => {
      this.guard(revision);
      actionGuard();
    };
    guard();
    // Bounded optimistic retries. Never replace a concurrent writer's ciphertext blindly.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { text, document } = await this.snapshot();
      guard();
      const next = await this.encrypt(update(document));
      guard();
      if (await this.store.compareAndSwap(scopeKey(this.scope), text, next, guard)) {
        guard();
        announce();
        return;
      }
      guard();
    }
    fail({ key: 'error.reconciliationVault.reconciliationDataChangedInAnotherTabReloadAndTryAgain' });
  }
  public async read(): Promise<readonly VaultRecord[]> {
    const revision = this.revision;
    const snapshot = await this.snapshot();
    this.guard(revision);
    return snapshot.document.records;
  }
  /** Atomic decrypted view for rendering status and observations from the same guarded snapshot. */
  public async readState(): Promise<ReconciliationState> {
    const revision = this.revision;
    const snapshot = await this.snapshot();
    this.guard(revision);
    const { records, saturated, invoices, receipts } = snapshot.document;
    return { records, readOnly: saturated, invoices, receipts };
  }
  public async save(value: ReconciliationRecord, actionGuard?: () => void): Promise<void> {
    const record = { ...validateReconciliationRecord(value) };
    if (record.sellerKeyId !== this.scope.sellerKeyId || record.chainId !== this.scope.chainId)
      fail({ key: 'error.reconciliationVault.reconciliationRecordHasAnotherScope' });
    if (record.evidenceStatus !== 'verified-at-scan')
      fail({ key: 'error.reconciliationVault.onlyACurrentVerifiedScanObservationCanBeSaved' });
    await this.change((document) => withSaved(document, record), actionGuard);
  }
  /**
   * Links a verified observation to a registered invoice only if local matching, re-run on the current encrypted
   * document inside the compare-and-swap loop, still yields an exact pairing. Ambiguous or missing pairs are refused.
   */
  public async confirmProposal(
    value: ReconciliationRecord | VaultRecord,
    invoiceDigest: string,
    options: { readonly current?: readonly ReconciliationRecord[]; readonly guard?: () => void } = {},
  ): Promise<void> {
    const { provenance, ...plain } = value as VaultRecord;
    if (provenance !== undefined && provenance !== 'live-scan') fail({ key: 'error.reconciliationVault.importedHistoryCannotBeMatchedAutomatically' });
    const record = { ...validateReconciliationRecord(plain) };
    if (record.sellerKeyId !== this.scope.sellerKeyId || record.chainId !== this.scope.chainId)
      fail({ key: 'error.reconciliationVault.reconciliationRecordHasAnotherScope' });
    if (record.evidenceStatus !== 'verified-at-scan' || record.invoiceDigest !== undefined)
      fail({ key: 'error.reconciliationVault.onlyACurrentUnlinkedVerifiedScanObservationCanBeMatched' });
    if ((options.current?.length ?? 0) > MAX_RECONCILIATION_RECORDS)
      fail({ key: 'error.reconciliationVault.currentReconciliationObservationsExceedTheirSafetyLimit' });
    const context = (options.current ?? []).map((value) => {
      const current = { ...validateReconciliationRecord(value) };
      if (current.sellerKeyId !== this.scope.sellerKeyId || current.chainId !== this.scope.chainId)
        fail({ key: 'error.reconciliationVault.reconciliationRecordHasAnotherScope' });
      return current;
    });
    await this.change((document) => {
      const saved = withSaved(document, record);
      const current = saved.records.find((r) => r.id === record.id)!;
      // Unsaved scan results can make a pairing ambiguous too. Saved provenance/invalidation wins on duplicates.
      const stored = new Set(saved.records.map((r) => r.id));
      const proposal = proposeInvoiceMatch(current, saved.invoices, [
        ...saved.records,
        ...context.filter((r) => !stored.has(r.id)),
      ]);
      if (proposal.kind !== 'exact' || proposal.invoice.invoiceDigest !== invoiceDigest)
        throw new UserFacingError(
          { key: 'error.reconciliationVault.thisPaymentNoLongerHasASingleExactInvoiceMatch' },
        );
      return {
        ...saved,
        records: saved.records.map((r) => (r.id === record.id ? { ...r, invoiceDigest } : r)),
      };
    }, options.guard);
  }
  /** Proposals for stored and supplied current observations, computed from one guarded snapshot. */
  public async proposals(
    current: readonly ReconciliationRecord[] = [],
  ): Promise<ReadonlyMap<string, MatchProposal>> {
    const revision = this.revision;
    const { document } = await this.snapshot();
    this.guard(revision);
    const stored = new Set(document.records.map((r) => r.id));
    const context = [...document.records, ...current.filter((r) => !stored.has(r.id))];
    return new Map(context.map((r) => [r.id, proposeInvoiceMatch(r, document.invoices, context)]));
  }
  /** Opt-in registration of an invoice this seller created; only matching fields are kept. */
  public async registerInvoice(value: RegisteredInvoice): Promise<void> {
    const invoice = validateRegisteredInvoice(value);
    if (invoice.chainId !== this.scope.chainId) fail({ key: 'error.reconciliationVault.registeredInvoiceHasAnotherScope' });
    await this.change((document) => {
      if (document.saturated) throw new UserFacingError(READ_ONLY_MESSAGE);
      const prior = document.invoices.find(
        (i) => i.invoiceDigest === invoice.invoiceDigest || i.nonce === invoice.nonce,
      );
      if (prior !== undefined) {
        if (prior.invoiceDigest !== invoice.invoiceDigest) fail({ key: 'error.reconciliationVault.anotherRegisteredInvoiceAlreadyUsesThisNonce' });
        return document;
      }
      if (document.invoices.length >= MAX_REGISTERED_INVOICES)
        throw new UserFacingError(
          { key: 'error.reconciliationVault.invoiceCapacity', values: { count: String(MAX_REGISTERED_INVOICES) } },
        );
      return { ...document, invoices: [...document.invoices, invoice] };
    });
  }
  /** Removing a registration never changes saved observations or their annotations. */
  public async removeInvoice(invoiceDigest: string): Promise<void> {
    await this.change((document) => ({
      ...document,
      invoices: document.invoices.filter((i) => i.invoiceDigest !== invoiceDigest),
    }));
  }
  public async clearInvoices(): Promise<void> {
    await this.change((document) => ({ ...document, invoices: [] }));
  }
  /** Archives a receipt this seller issued. The archive is never consulted as payment evidence. */
  public async archiveReceipt(receipt: SignedReceipt, archivedAt = Date.now()): Promise<void> {
    if (!verifyReceipt(receipt)) fail({ key: 'error.reconciliationVault.onlyAValidSignedReceiptCanBeArchived' });
    const entry = validateArchivedReceipt({ receipt: { ...receipt }, archivedAt }, this.scope);
    await this.change((document) => {
      if (document.saturated) throw new UserFacingError(READ_ONLY_MESSAGE);
      if (document.receipts.some((r) => receiptId(r.receipt) === receiptId(entry.receipt))) return document;
      if (document.receipts.length >= MAX_ARCHIVED_RECEIPTS)
        throw new UserFacingError(
          { key: 'error.reconciliationVault.receiptCapacity', values: { count: String(MAX_ARCHIVED_RECEIPTS) } },
        );
      return { ...document, receipts: [...document.receipts, entry] };
    });
  }
  public async removeReceipt(signature: string): Promise<void> {
    await this.change((document) => ({
      ...document,
      receipts: document.receipts.filter((r) => receiptId(r.receipt) !== signature),
    }));
  }
  public async clearReceipts(): Promise<void> {
    await this.change((document) => ({ ...document, receipts: [] }));
  }
  /** Plaintext export of archived receipts on explicit request; every entry is re-verified by `receiptJson`. */
  public async exportReceipts(): Promise<string> {
    const revision = this.revision;
    const { receipts } = (await this.snapshot()).document;
    this.guard(revision);
    return `[${receipts.map((r) => receiptJson(r.receipt)).join(',')}]`;
  }
  /**
   * Applies a confirmed reorg at or above `block`. Each stored or `observed` (not yet saved) observation at or above it
   * is compared with `canonicalHash(height)`, the block hash the scan's providers now report: only observations whose
   * block was replaced are invalidated and tombstoned. Unchanged history stays as it is, so a shallow or overstated
   * rollback cannot invalidate it. `canonicalHash` must throw when it cannot answer; nothing is written then.
   */
  public async invalidateFrom(
    block: bigint,
    observed: readonly ReconciliationRecord[],
    canonicalHash: (height: bigint) => Promise<string>,
  ): Promise<void> {
    if (block < 0n || block > 9_999_999_999_999_999n) fail({ key: 'error.reconciliationVault.invalidReorgBlock' });
    const observedRecords = observed.map((value) => {
      const record = validateReconciliationRecord(value);
      if (
        record.chainId !== this.scope.chainId ||
        record.sellerKeyId !== this.scope.sellerKeyId ||
        BigInt(record.blockNumber) < block
      )
        return fail({ key: 'error.reconciliationVault.invalidReorgObservationScope' });
      return record;
    });
    const revision = this.revision;
    const { document: before } = await this.snapshot();
    this.guard(revision);
    // Already invalid observations stay invalid; only the valid ones need their block checked.
    const heights = new Set(
      [...before.records.filter((r) => r.evidenceStatus === 'verified-at-scan'), ...observedRecords]
        .filter((r) => BigInt(r.blockNumber) >= block)
        .map((r) => r.blockNumber),
    );
    const canonical = new Map<string, string>();
    // A few heights at a time: every height must be read before anything is written, and after the first failed read
    // no further read starts; the in-flight ones settle before the failure is reported, and nothing is written.
    const queue = [...heights];
    const failures: unknown[] = [];
    const reader = async (): Promise<void> => {
      for (let height = queue.shift(); height !== undefined && failures.length === 0; height = queue.shift()) {
        try {
          const hash = await canonicalHash(BigInt(height));
          this.guard(revision);
          if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) fail({ key: 'error.reconciliationVault.invalidCanonicalBlockHash' });
          canonical.set(height, hash.toLowerCase());
        } catch (error) {
          failures.push(error);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CANONICAL_READS_IN_FLIGHT, queue.length) }, reader));
    if (failures.length > 0) throw failures[0];
    // Records added meanwhile (no checked height) are fresh live observations and stay as they are.
    const replaced = (r: ReconciliationRecord): boolean => {
      const hash = canonical.get(r.blockNumber);
      return BigInt(r.blockNumber) >= block && hash !== undefined && hash !== r.blockHash;
    };
    const at = this.now();
    let saturated = false;
    await this.change((document) => {
      const cutoff = mergeCutoffs(cutoffOf(document), { from: block, at });
      const records = document.records.map((r): VaultRecord => (replaced(r) ? invalidated(r) : r));
      const tombstones = [
        ...new Set([
          ...document.tombstones,
          ...observedRecords.filter(replaced).map((r) => r.id),
          ...document.records.filter(replaced).map((r) => r.id),
        ]),
      ];
      saturated = document.saturated || tombstones.length > MAX_RECONCILIATION_RECORDS;
      return {
        ...document,
        records,
        tombstones: tombstones.slice(0, MAX_RECONCILIATION_RECORDS),
        invalidatedFrom: cutoff!.from.toString(),
        invalidatedAt: cutoff!.at,
        saturated,
      };
    });
    if (saturated)
      throw new UserFacingError(
        { key: 'error.reconciliationVault.reorgInvalidationWasSavedButItsHistoryReachedTheSafety' },
      );
  }
  /** Delete observations while retaining reorg invalidation history; old backups cannot resurrect it. */
  public async clearRecords(): Promise<void> {
    await this.change((document) => ({ ...document, records: [] }));
  }
  public async exportEncrypted(): Promise<string> {
    const { text, document } = await this.snapshot();
    return text ?? this.encrypt(document);
  }
  public async previewImport(text: string): Promise<ReconciliationImportPreview> {
    const revision = this.revision;
    const document = await this.decrypt(text);
    const current = (await this.snapshot()).document;
    this.guard(revision);
    // The same merge as activation: the count is what activation would mark invalid, not only what the backup says.
    const merged = mergeImport(current, document);
    const preview = Object.freeze({
      readOnly: merged.saturated,
      recordCount: document.records.length,
      invalidatedCount: invalidCount(merged) - invalidCount(current),
      invoiceCount: document.invoices.length,
      receiptCount: document.receipts.length,
    });
    // Retain encrypted input only. Activation decrypts and validates again against the current database.
    this.previews.set(preview, { text, revision: this.revision });
    return preview;
  }
  public async activateImport(preview: ReconciliationImportPreview): Promise<void> {
    this.guard();
    const staged = this.previews.get(preview);
    if (staged === undefined || staged.revision !== this.revision)
      fail({ key: 'error.reconciliationVault.createACurrentImportPreviewBeforeActivation' });
    const imported = await this.decrypt(staged.text);
    await this.change((document) => {
      // Imported tombstones apply to existing records too; imports cannot reverse known invalidation.
      const merged = mergeImport(document, imported);
      if (merged.saturated && !preview.readOnly)
        throw new UserFacingError(
          { key: 'error.reconciliationVault.theReconciliationSafetyStateChangedPreviewThisBackupAgainBefore' },
        );
      if (merged.invoices.length > MAX_REGISTERED_INVOICES || merged.receipts.length > MAX_ARCHIVED_RECEIPTS)
        throw new UserFacingError(
          { key: 'error.reconciliationVault.thisBackupWouldExceedTheInvoiceRegistrationOrReceiptArchive' },
        );
      return merged;
    });
    this.previews.delete(preview);
  }
}
  /** Strict unauthenticated header inspection; authentication requires unlock and read/preview. */
  function inspectReconciliationEnvelope(text: string): Envelope {
    if (text.length > MAX_VAULT_BYTES || encoder.encode(text).byteLength > MAX_VAULT_BYTES)
      return fail({ key: 'error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit' });
    let value: unknown;
    try { value = parseStrictJson(text); } catch { return fail({ key: 'error.reconciliationVault.invalidEncryptedReconciliationFormat' }); }
    if (!object(value) || typeof value.sellerKeyId !== 'string' || typeof value.chainId !== 'number')
      return fail({ key: 'error.reconciliationVault.invalidReconciliationScope' });
    const scope = { sellerKeyId: value.sellerKeyId, chainId: value.chainId };
    assertScope(scope);
    return parseEnvelope(text, scope);
  }


/** Builds a record only from the scan path's verified router result; imported seller receipts are never accepted here. */
function recordFromVerifiedMatch(
  match: VerifiedReconciliationMatch,
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
  return { recordFromVerifiedMatch, inspectReconciliationEnvelope, MAX_RECONCILIATION_RECORDS, MAX_REGISTERED_INVOICES, MATCH_CLOCK_SKEW_MS, MAX_VAULT_BYTES, MAX_ARCHIVED_RECEIPTS, validateReconciliationRecord, exportReconciliationLedger, searchReconciliationRecords, validateRegisteredInvoice, registrationFromInvoice, proposeInvoiceMatch, ReconciliationVault: ReconciliationVault as ReconciliationVaultConstructor };
}
