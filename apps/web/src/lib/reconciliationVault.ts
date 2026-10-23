import { UserFacingError } from './errors';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  exportReconciliationLedger,
  MAX_RECONCILIATION_RECORDS,
  validateReconciliationRecord,
  type ReconciliationRecord,
} from './reconciliationLedger';
import { captureSessionGuard, getSessionPublic, revealViewingKey } from './session';
import { checkpointKeyId } from './scanClient';

/** Only ciphertext and public seller/chain scope identifiers are persisted. No plaintext document is cached. */
export const MAX_VAULT_BYTES = 8_000_000;
export const RECONCILIATION_VAULT_CHANGE_EVENT = 'ghostpay:reconciliation-vault-change';
const INVALIDATION_CHANNEL = 'ghostpay:reconciliation-invalidation';
export interface ReconciliationScope {
  readonly sellerKeyId: string;
  readonly chainId: number;
}
export interface VaultRecord extends ReconciliationRecord {
  readonly provenance: 'live-scan' | 'imported-history';
}
interface Document {
  readonly saturated: boolean;
  readonly version: 1;
  readonly records: readonly VaultRecord[];
  readonly invalidatedFrom: string | null;
  readonly tombstones: readonly string[];
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
}
export interface ReconciliationImportPreview {
  readonly readOnly: boolean;
  readonly recordCount: number;
  readonly invalidatedCount: number;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const empty = (): Document => ({
  version: 1,
  records: [],
  invalidatedFrom: null,
  tombstones: [],
  saturated: false,
});
function fail(message: string): never {
  throw new Error(message);
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
    fail('Invalid reconciliation scope.');
}
function parseEnvelope(text: string, scope: ReconciliationScope): Envelope {
  if (text.length > MAX_VAULT_BYTES || encoder.encode(text).byteLength > MAX_VAULT_BYTES)
    fail('Encrypted reconciliation data exceeds its safety limit.');
  let value: unknown;
  try {
    value = parseStrictJson(text);
  } catch {
    return fail('Invalid encrypted reconciliation format.');
  }
  if (
    !object(value) ||
    !exact(value, 'format|version|sellerKeyId|chainId|salt|iv|ciphertext') ||
    value.format !== 'ghostpay-reconciliation' ||
    value.version !== 1
  )
    fail('Invalid encrypted reconciliation format.');
  if (value.sellerKeyId !== scope.sellerKeyId || value.chainId !== scope.chainId)
    fail('Encrypted reconciliation data belongs to another seller or chain scope.');
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
    fail('Invalid encrypted reconciliation fields.');
  return value as unknown as Envelope;
}
function validateDocument(value: unknown, scope: ReconciliationScope): Document {
  if (
    !object(value) ||
    !exact(value, 'version|records|invalidatedFrom|tombstones|saturated') ||
    value.version !== 1 ||
    typeof value.saturated !== 'boolean' ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_RECONCILIATION_RECORDS ||
    !Array.isArray(value.tombstones) ||
    value.tombstones.length > MAX_RECONCILIATION_RECORDS
  )
    fail('Invalid reconciliation document or record limit.');
  if (
    value.invalidatedFrom !== null &&
    (typeof value.invalidatedFrom !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value.invalidatedFrom))
  )
    fail('Invalid reconciliation reorg cutoff.');
  const records = value.records.map((item: unknown): VaultRecord => {
    if (!object(item) || (item.provenance !== 'live-scan' && item.provenance !== 'imported-history'))
      return fail('Invalid reconciliation provenance.');
    const { provenance, ...rest } = item;
    const record = validateReconciliationRecord(rest);
    if (record.chainId !== scope.chainId || record.sellerKeyId !== scope.sellerKeyId)
      fail('Reconciliation record has another scope.');
    return { ...record, provenance };
  });
  if (new Set(records.map((r) => r.id)).size !== records.length) fail('Duplicate reconciliation records.');
  const tombstones = value.tombstones.map((id: unknown): string =>
    typeof id === 'string' && id.length <= 400 && id.startsWith(`${scopeKey(scope)}:`)
      ? id
      : fail('Invalid reconciliation tombstone.'),
  );
  if (new Set(tombstones).size !== tombstones.length) fail('Duplicate reconciliation tombstones.');
  return {
    version: 1,
    records,
    invalidatedFrom: value.invalidatedFrom,
    tombstones,
    saturated: value.saturated,
  };
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
  ) {
    assertScope(scope);
    this.scope = Object.freeze({ ...scope });
  }
  private guard(revision = this.revision): void {
    this.sessionGuard();
    if (this.base === undefined) fail('The reconciliation vault is locked.');
    if (revision !== this.revision) fail('Reconciliation vault action became stale.');
  }
  public async unlock(key: Uint8Array): Promise<void> {
    const revision = ++this.revision;
    this.base = undefined;
    const material = Uint8Array.from(key);
    try {
      this.sessionGuard();
      if (key.byteLength !== 32) fail('Invalid reconciliation viewing key.');
      const base = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
      this.sessionGuard();
      if (revision !== this.revision) fail('Reconciliation vault action became stale.');
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
    if (revision !== this.revision) fail('Reconciliation vault action became stale.');
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
        fail('Reconciliation plaintext exceeds its safety limit.');
      return validateDocument(parseStrictJson(decoder.decode(plaintext)), this.scope);
    } catch (error) {
      this.guard(revision);
      if (
        error instanceof Error &&
        /scope|record|limit|document|provenance|tombstone|cutoff/.test(error.message)
      )
        throw error;
      throw new Error('Could not decrypt or validate the reconciliation data.', { cause: error });
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
      if (result.length > MAX_VAULT_BYTES) fail('Encrypted reconciliation data exceeds its safety limit.');
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
  private async change(update: (document: Document) => Document): Promise<void> {
    const revision = this.revision;
    this.guard(revision);
    // Bounded optimistic retries. Never replace a concurrent writer's ciphertext blindly.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { text, document } = await this.snapshot();
      const next = await this.encrypt(update(document));
      this.guard(revision);
      if (await this.store.compareAndSwap(scopeKey(this.scope), text, next, () => this.guard(revision))) {
        this.guard(revision);
        announce();
        return;
      }
      this.guard(revision);
    }
    fail('Reconciliation data changed in another tab. Reload and try again.');
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
    return { records: snapshot.document.records, readOnly: snapshot.document.saturated };
  }
  public async save(value: ReconciliationRecord): Promise<void> {
    const record = { ...validateReconciliationRecord(value) };
    if (record.sellerKeyId !== this.scope.sellerKeyId || record.chainId !== this.scope.chainId)
      fail('Reconciliation record has another scope.');
    if (record.evidenceStatus !== 'verified-at-scan')
      fail('Only a current verified scan observation can be saved.');
    await this.change((document) => {
      if (document.saturated)
        throw new UserFacingError(
          'The reconciliation vault reached its invalidation capacity and is read-only. Export its encrypted history before reviewing this storage limitation. Old evidence cannot be revived.',
        );
      if (document.tombstones.includes(record.id))
        fail('This historical observation was invalidated by a reorg.');
      const prior = document.records.find((r) => r.id === record.id);
      if (prior?.evidenceStatus === 'invalidated-after-reorg')
        fail('This historical observation was invalidated by a reorg.');
      if (
        prior?.invoiceDigest !== undefined &&
        record.invoiceDigest !== undefined &&
        prior.invoiceDigest !== record.invoiceDigest
      )
        fail('This record already has a different invoice annotation.');
      const next: VaultRecord = {
        ...record,
        ...(prior?.invoiceDigest === undefined ? {} : { invoiceDigest: prior.invoiceDigest }),
        provenance: 'live-scan',
      };
      const records =
        prior === undefined
          ? [...document.records, next]
          : document.records.map((r) => (r.id === record.id ? next : r));
      return { ...document, records };
    });
  }
  public async invalidateFrom(block: bigint, observed: readonly ReconciliationRecord[] = []): Promise<void> {
    if (block < 0n || block > 9_999_999_999_999_999n) fail('Invalid reorg block.');
    const observedIds = observed.map((value) => {
      const record = validateReconciliationRecord(value);
      if (
        record.chainId !== this.scope.chainId ||
        record.sellerKeyId !== this.scope.sellerKeyId ||
        BigInt(record.blockNumber) < block
      )
        return fail('Invalid reorg observation scope.');
      return record.id;
    });
    let saturated = false;
    await this.change((document) => {
      const cutoff =
        document.invalidatedFrom === null || block < BigInt(document.invalidatedFrom)
          ? block
          : BigInt(document.invalidatedFrom);
      const records = document.records.map((r): VaultRecord =>
        BigInt(r.blockNumber) >= block ? { ...r, evidenceStatus: 'invalidated-after-reorg' } : r,
      );
      const tombstones = [
        ...new Set([
          ...document.tombstones,
          ...observedIds,
          ...records.filter((r) => r.evidenceStatus === 'invalidated-after-reorg').map((r) => r.id),
        ]),
      ];
      saturated = document.saturated || tombstones.length > MAX_RECONCILIATION_RECORDS;
      return {
        ...document,
        records,
        tombstones: tombstones.slice(0, MAX_RECONCILIATION_RECORDS),
        invalidatedFrom: cutoff.toString(),
        saturated,
      };
    });
    if (saturated)
      throw new UserFacingError(
        'Reorg invalidation was saved, but its history reached the safety limit. The encrypted reconciliation vault is now read-only; export the history and do not rely on invalidated observations.',
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
    const preview = Object.freeze({
      readOnly:
        document.saturated ||
        current.saturated ||
        new Set([...document.tombstones, ...current.tombstones]).size > MAX_RECONCILIATION_RECORDS,
      recordCount: document.records.length,
      invalidatedCount: document.records.filter((r) => r.evidenceStatus === 'invalidated-after-reorg').length,
    });
    // Retain encrypted input only. Activation decrypts and validates again against the current database.
    this.previews.set(preview, { text, revision: this.revision });
    return preview;
  }
  public async activateImport(preview: ReconciliationImportPreview): Promise<void> {
    this.guard();
    const staged = this.previews.get(preview);
    if (staged === undefined || staged.revision !== this.revision)
      fail('Create a current import preview before activation.');
    const imported = await this.decrypt(staged.text);
    await this.change((document) => {
      const tombstones = [...new Set([...document.tombstones, ...imported.tombstones])];
      const saturated =
        document.saturated || imported.saturated || tombstones.length > MAX_RECONCILIATION_RECORDS;
      if (saturated && !preview.readOnly)
        throw new UserFacingError(
          'The reconciliation safety state changed. Preview this backup again before accepting a read-only vault.',
        );
      const cutoffs = [document.invalidatedFrom, imported.invalidatedFrom]
        .filter((n): n is string => n !== null)
        .map(BigInt);
      const cutoff = cutoffs.length === 0 ? null : cutoffs.reduce((a, b) => (a < b ? a : b));
      const byId = new Map(document.records.map((r) => [r.id, r]));
      for (const record of imported.records) {
        if (byId.has(record.id)) continue;
        byId.set(record.id, {
          ...record,
          provenance: 'imported-history',
          evidenceStatus:
            record.evidenceStatus === 'invalidated-after-reorg' ||
            tombstones.includes(record.id) ||
            (cutoff !== null && BigInt(record.blockNumber) >= cutoff)
              ? 'invalidated-after-reorg'
              : record.evidenceStatus,
        });
      }
      // Imported tombstones apply to existing records too; imports cannot reverse known invalidation.
      const records = [...byId.values()].map((r): VaultRecord =>
        tombstones.includes(r.id) ||
        ((saturated || r.provenance === 'imported-history') &&
          cutoff !== null &&
          BigInt(r.blockNumber) >= cutoff)
          ? { ...r, evidenceStatus: 'invalidated-after-reorg' }
          : r,
      );
      return {
        version: 1,
        records,
        tombstones: tombstones.slice(0, MAX_RECONCILIATION_RECORDS),
        invalidatedFrom: cutoff?.toString() ?? null,
        saturated,
      };
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
      request.onerror = () => reject(new Error('Encrypted reconciliation storage is unavailable.'));
      request.onblocked = () =>
        reject(new Error('Close other GhostPay tabs to open encrypted reconciliation storage.'));
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
        reject(new Error('Encrypted reconciliation storage could not be read.'));
    });
  }
  public async compareAndSwap(
    key: string,
    expected: string | null,
    next: string,
    guard: () => void,
  ): Promise<boolean> {
    if (next.length > MAX_VAULT_BYTES) fail('Encrypted reconciliation data exceeds its safety limit.');
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
          failure instanceof Error ? failure : new Error('Encrypted reconciliation write did not commit.'),
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
    fail('The current seller scope changed.');
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
