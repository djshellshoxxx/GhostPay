import { UserFacingError, type MessageDescriptor } from './errors';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  exportReconciliationLedger,
  MAX_RECONCILIATION_RECORDS,
  validateReconciliationRecord,
  type ReconciliationRecord,
} from './reconciliationLedger';
import {
  MAX_REGISTERED_INVOICES,
  proposeInvoiceMatch,
  validateRegisteredInvoice,
  type MatchProposal,
  type RegisteredInvoice,
} from './reconciliationMatch';
import { receiptJson, validateReceiptPayload, verifyReceipt, type SignedReceipt } from './receipts';
import { captureSessionGuard, getSessionPublic, revealViewingKey } from './session';
import { checkpointKeyId } from './scanClient';

/** Only ciphertext and public seller/chain scope identifiers are persisted. No plaintext document is cached. */
export const MAX_VAULT_BYTES = 8_000_000;
export const RECONCILIATION_VAULT_CHANGE_EVENT = 'ghostpay:reconciliation-vault-change';
const INVALIDATION_CHANNEL = 'ghostpay:reconciliation-invalidation';
/** Canonical block-hash reads in flight during a reorg check (a rollback to genesis can cover every stored height). */
const CANONICAL_READS_IN_FLIGHT = 8;
export interface ReconciliationScope {
  readonly sellerKeyId: string;
  readonly chainId: number;
}
export const MAX_ARCHIVED_RECEIPTS = 500;
export interface VaultRecord extends ReconciliationRecord {
  readonly provenance: 'live-scan' | 'imported-history';
}
/** A seller-issued receipt kept for the seller's records. It is never payment evidence and never feeds matching. */
export interface ArchivedReceipt {
  readonly receipt: SignedReceipt;
  readonly archivedAt: number;
}
interface Document {
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
interface Envelope extends ReconciliationScope {
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
interface Cutoff {
  readonly from: bigint;
  /** Null: recorded before cutoff times existed, so it covers every observation at or above `from`. */
  readonly at: number | null;
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

export class ReconciliationVault {
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

/** Browser storage never sees plaintext; request success is not treated as transaction commit. */
export class IdbReconciliationVaultStore implements ReconciliationVaultStore {
  private dbPromise: Promise<IDBDatabase> | undefined;
  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('ghostpay-reconciliation-encrypted', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('vaults');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationStorageIsUnavailable' }));
      request.onblocked = () =>
        reject(new UserFacingError({ key: 'error.reconciliationVault.closeOtherGhostPayTabsToOpenEncryptedReconciliationStorage' }));
    });
    return this.dbPromise;
  }
  public async read(key: string): Promise<string | null> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
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
    });
  }
  public async compareAndSwap(
    key: string,
    expected: string | null,
    next: string,
    guard: () => void,
  ): Promise<boolean> {
    if (next.length > MAX_VAULT_BYTES) fail({ key: 'error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit' });
    const db = await this.db();
    guard();
    return new Promise((resolve, reject) => {
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
            swapped = true;
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(swapped);
      tx.onabort = tx.onerror = () =>
        reject(
          failure instanceof Error ? failure : new UserFacingError({ key: 'error.reconciliationVault.encryptedReconciliationWriteDidNotCommit' }),
        );
    });
  }
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

// i18n-use: error.reconciliationVault.invalidReconciliationScope error.reconciliationVault.encryptedReconciliationDataExceedsItsSafetyLimit error.reconciliationVault.invalidEncryptedReconciliationFormat error.reconciliationVault.encryptedReconciliationDataBelongsToAnotherSellerOrChainScope error.reconciliationVault.invalidEncryptedReconciliationFields error.reconciliationVault.invalidReconciliationDocumentOrRecordLimit error.reconciliationVault.invalidReconciliationReorgCutoff error.reconciliationVault.invalidReconciliationReorgCutoffTime error.reconciliationVault.invalidReconciliationProvenance error.reconciliationVault.reconciliationRecordHasAnotherScope error.reconciliationVault.duplicateReconciliationRecords error.reconciliationVault.invalidReconciliationTombstone error.reconciliationVault.duplicateReconciliationTombstones error.reconciliationVault.registeredInvoiceHasAnotherScope error.reconciliationVault.duplicateRegisteredInvoice error.reconciliationVault.duplicateRegisteredInvoiceNonce error.reconciliationVault.duplicateArchivedReceipt error.reconciliationVault.invalidArchivedReceipt error.reconciliationVault.archivedReceiptHasAnotherScope error.reconciliationVault.invalidArchivedReceiptTimestamp error.reconciliationVault.thisHistoricalObservationWasInvalidatedByAReorg error.reconciliationVault.thisRecordAlreadyHasADifferentInvoiceAnnotation error.reconciliationVault.theReconciliationVaultIsLocked error.reconciliationVault.reconciliationVaultActionBecameStale error.reconciliationVault.invalidReconciliationViewingKey error.reconciliationVault.reconciliationPlaintextExceedsItsSafetyLimit error.reconciliationVault.couldNotDecryptOrValidateTheReconciliationData error.reconciliationVault.reconciliationDataChangedInAnotherTabReloadAndTryAgain error.reconciliationVault.onlyACurrentVerifiedScanObservationCanBeSaved error.reconciliationVault.importedHistoryCannotBeMatchedAutomatically error.reconciliationVault.onlyACurrentUnlinkedVerifiedScanObservationCanBeMatched error.reconciliationVault.currentReconciliationObservationsExceedTheirSafetyLimit error.reconciliationVault.thisPaymentNoLongerHasASingleExactInvoiceMatch error.reconciliationVault.anotherRegisteredInvoiceAlreadyUsesThisNonce error.reconciliationVault.onlyAValidSignedReceiptCanBeArchived error.reconciliationVault.invalidReorgBlock error.reconciliationVault.invalidReorgObservationScope error.reconciliationVault.invalidCanonicalBlockHash error.reconciliationVault.reorgInvalidationWasSavedButItsHistoryReachedTheSafety error.reconciliationVault.createACurrentImportPreviewBeforeActivation error.reconciliationVault.theReconciliationSafetyStateChangedPreviewThisBackupAgainBefore error.reconciliationVault.thisBackupWouldExceedTheInvoiceRegistrationOrReceiptArchive error.reconciliationVault.encryptedReconciliationStorageIsUnavailable error.reconciliationVault.closeOtherGhostPayTabsToOpenEncryptedReconciliationStorage error.reconciliationVault.encryptedReconciliationStorageCouldNotBeRead error.reconciliationVault.encryptedReconciliationWriteDidNotCommit error.reconciliationVault.theCurrentSellerScopeChanged error.reconciliationVault.theReconciliationVaultReachedItsInvalidationCapacityAndIsRead

// i18n-use: error.reconciliationVault.invoiceCapacity

// i18n-use: error.reconciliationVault.receiptCapacity
