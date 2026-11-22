import { parseStrictJson } from '@ghostpay/invoice-schema';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { ReconciliationVaultStore } from '@ghostpay/ux-vault/portable';
import {
  MAX_RECURRING_SNAPSHOT_BYTES, parseRecurringSnapshot, reference, validateRecurringSnapshot,
  type RecurringInvoiceReferenceV1, type RecurringSnapshotV1,
} from './model';
import { RecurringPreparationController } from './prepare';
import type { RecurringReview, RecurringReviewContext } from './review';

/** Reuse the existing IndexedDB-backed atomic ciphertext CAS contract. */
export type RecurringCiphertextStore = ReconciliationVaultStore;

export type RecurringVaultErrorCode =
  'LOCKED' | 'KEY' | 'CORRUPT' | 'CONFLICT' | 'STORAGE' | 'HISTORY' | 'UNREVIEWED';

export class RecurringVaultError extends Error {
  public constructor(public readonly code: RecurringVaultErrorCode) {
    super(`Encrypted recurring state refused (${code}).`);
    this.name = 'RecurringVaultError';
  }
}

export interface RecurringLoadedSnapshot {
  readonly snapshot: RecurringSnapshotV1;
}

const ENVELOPE_SCHEMA = 'ghostpay.recurring-encrypted/1';
const ENVELOPE_LIMIT = 2 * MAX_RECURRING_SNAPSHOT_BYTES + 2_048;
const ENVELOPE_KEYS = 'ciphertext|iv|profileRef|schema';

function fail(code: RecurringVaultErrorCode): never { throw new RecurringVaultError(code); }

function assertForward(previous: RecurringSnapshotV1, next: RecurringSnapshotV1): void {
  const states = new Map(next.plans.map(item => [item.plan.planId, item]));
  for (const before of previous.plans) {
    const after = states.get(before.plan.planId);
    if (after === undefined || after.nextPeriodIndex < before.nextPeriodIndex ||
        (before.plan.status === 'cancelled' && after.plan.status !== 'cancelled'))
      fail('HISTORY');
  }

  const references = new Map(next.outbox.map(item => [item.eventId, item]));
  const canAdvance: Record<RecurringInvoiceReferenceV1['status'], readonly RecurringInvoiceReferenceV1['status'][]> = {
    prepared: ['prepared', 'issued', 'void'],
    issued: ['issued', 'exported', 'void'],
    exported: ['exported'],
    void: ['void'],
  };
  for (const before of previous.outbox) {
    const after = references.get(before.eventId);
    if (after === undefined || before.eventId !== after.eventId || before.planId !== after.planId ||
        before.periodIndex !== after.periodIndex || before.planRevision !== after.planRevision ||
        before.kind !== after.kind || before.artifactRef !== after.artifactRef ||
        !canAdvance[before.status].includes(after.status))
      fail('HISTORY');
  }
}

function sameInvoiceReference(a: RecurringInvoiceReferenceV1, b: RecurringInvoiceReferenceV1 | undefined): boolean {
  return b !== undefined && a.eventId === b.eventId && a.planId === b.planId &&
    a.planRevision === b.planRevision && a.periodIndex === b.periodIndex &&
    a.kind === b.kind && a.artifactRef === b.artifactRef && a.status === b.status;
}

function parseEnvelope(text: string, profileRef: string): { iv: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> } {
  if (text.length > ENVELOPE_LIMIT) return fail('CORRUPT');
  let value: unknown;
  try { value = parseStrictJson(text); }
  catch { return fail('CORRUPT'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('CORRUPT');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).sort().join('|') !== ENVELOPE_KEYS || obj.schema !== ENVELOPE_SCHEMA ||
      obj.profileRef !== profileRef || typeof obj.iv !== 'string' || !/^[0-9a-f]{24}$/.test(obj.iv) ||
      typeof obj.ciphertext !== 'string' ||
      !/^(?:[0-9a-f]{2})+$/.test(obj.ciphertext) ||
      obj.ciphertext.length < 32 || obj.ciphertext.length > 2 * (MAX_RECURRING_SNAPSHOT_BYTES + 16))
    return fail('CORRUPT');
  try {
    return { iv: new Uint8Array(hexToBytes(obj.iv)), ciphertext: new Uint8Array(hexToBytes(obj.ciphertext)) };
  } catch {
    return fail('CORRUPT');
  }
}

/**
 * Encrypted browser-local F10 outbox. This consumes an existing nonextractable
 * AES-256-GCM key derived from the unlocked viewing-key session; key derivation
 * and idle/session authority remain owned by the existing P05 host.
 *
 * Storage must implement a real transactional read/compareAndSwap. In production
 * use IdbReconciliationVaultStore, not localStorage or an asynchronous read+put.
 *
 * No signing, payments, external delivery, or scheduled background execution.
 * Same-origin multi-tab CAS does not coordinate separate devices.
 */
export class RecurringEncryptedVault {
  readonly #profileRef: string;
  readonly #storageKey: string;
  readonly #aad: Uint8Array<ArrayBuffer>;
  readonly #handles = new WeakMap<RecurringLoadedSnapshot, {
    text: string; snapshot: RecurringSnapshotV1; generation: number;
  }>();
  #key: CryptoKey | undefined;
  #generation = 0;

  public constructor(
    private readonly store: RecurringCiphertextStore,
    profileRef: string,
    private readonly sessionGuard: () => void,
  ) {
    this.#profileRef = reference(profileRef);
    this.#storageKey = `ghostpay:f10:v1:${this.#profileRef}`;
    this.#aad = new TextEncoder().encode(`GhostPay/F10/snapshot/v1|${this.#profileRef}`);
  }

  /** Unlock only with a dedicated, nonextractable key from the live seller scope. */
  public unlock(key: CryptoKey): void {
    this.lock();
    const algorithm = key?.algorithm as { name?: unknown; length?: unknown } | undefined;
    if (algorithm?.name !== 'AES-GCM' || algorithm.length !== 256 ||
        key?.type !== 'secret' || key.extractable !== false ||
        !key.usages.includes('encrypt') || !key.usages.includes('decrypt'))
      fail('KEY');
    this.sessionGuard();
    this.#key = key;
  }

  /** Invalidate all in-flight loads, seals and writes on idle lock/session changes. */
  public lock(): void {
    this.#key = undefined;
    this.#generation++;
  }

  #guard(generation: number): CryptoKey {
    this.sessionGuard();
    if (this.#key === undefined || this.#generation !== generation) return fail('LOCKED');
    return this.#key;
  }

  #handle(snapshot: RecurringSnapshotV1, text: string, generation: number): RecurringLoadedSnapshot {
    const handle = Object.freeze({ snapshot });
    this.#handles.set(handle, { snapshot, text, generation });
    return handle;
  }

  async #readText(generation: number): Promise<string | null> {
    this.#guard(generation);
    try {
      const value = await this.store.read(this.#storageKey);
      this.#guard(generation);
      return value;
    } catch {
      this.#guard(generation);
      return fail('STORAGE');
    }
  }

  async #open(text: string, generation: number): Promise<RecurringSnapshotV1> {
    const key = this.#guard(generation);
    const envelope = parseEnvelope(text, this.#profileRef);
    let plain: Uint8Array<ArrayBuffer> | undefined;
    try {
      plain = new Uint8Array(await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: envelope.iv, additionalData: this.#aad, tagLength: 128 },
        key, envelope.ciphertext,
      ));
      this.#guard(generation);
      if (plain.byteLength > MAX_RECURRING_SNAPSHOT_BYTES) return fail('CORRUPT');
      const snapshot = parseRecurringSnapshot(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (snapshot.profileRef !== this.#profileRef) return fail('CORRUPT');
      return snapshot;
    } catch {
      this.#guard(generation);
      return fail('CORRUPT');
    } finally {
      plain?.fill(0);
    }
  }

  async #seal(snapshot: RecurringSnapshotV1, generation: number): Promise<string> {
    const key = this.#guard(generation);
    const plain = new TextEncoder().encode(JSON.stringify(snapshot));
    if (plain.byteLength > MAX_RECURRING_SNAPSHOT_BYTES) return fail('CORRUPT');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    try {
      const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: this.#aad, tagLength: 128 },
        key, plain,
      ));
      this.#guard(generation);
      const result = JSON.stringify({
        schema: ENVELOPE_SCHEMA, profileRef: this.#profileRef, iv: bytesToHex(iv),
        ciphertext: bytesToHex(ciphertext),
      });
      if (result.length > ENVELOPE_LIMIT) return fail('CORRUPT');
      return result;
    } catch {
      this.#guard(generation);
      return fail('STORAGE');
    } finally {
      plain.fill(0);
    }
  }

  async #write(expected: string | null, snapshot: RecurringSnapshotV1, generation: number): Promise<RecurringLoadedSnapshot> {
    const text = await this.#seal(snapshot, generation);
    this.#guard(generation);
    let committed: boolean;
    try {
      committed = await this.store.compareAndSwap(this.#storageKey, expected, text, () => {
        this.#guard(generation);
      });
    } catch {
      // Outcome may be ambiguous after a lost acknowledgement. Caller must
      // reload the durable state; never retry issuance on an assumed failure.
      this.#guard(generation);
      return fail('STORAGE');
    }
    this.#guard(generation);
    if (!committed) return fail('CONFLICT');
    return this.#handle(snapshot, text, generation);
  }

  /** Reload and validate the latest committed state; a prepared record is not an issued invoice. */
  public async load(): Promise<RecurringLoadedSnapshot | null> {
    const generation = this.#generation;
    const text = await this.#readText(generation);
    if (text === null) return null;
    const snapshot = await this.#open(text, generation);
    this.#guard(generation);
    return this.#handle(snapshot, text, generation);
  }

  /**
   * Save one immutable snapshot using exact ciphertext CAS. The previous handle
   * must come from a live load/commit on this instance. Stale tabs lose.
   * Initial creation must be all-paused and without an imported outbox.
   */
  public async commit(previous: RecurringLoadedSnapshot | null, input: unknown): Promise<RecurringLoadedSnapshot> {
    return this.#commit(previous, input, false);
  }

  /** Internal path: only M3's consumed review may add exactly one prepared outbox reference. */
  async #commit(
    previous: RecurringLoadedSnapshot | null, input: unknown, reviewedReservation: boolean,
  ): Promise<RecurringLoadedSnapshot> {
    const generation = this.#generation;
    this.#guard(generation);
    const next = validateRecurringSnapshot(input);
    if (next.profileRef !== this.#profileRef) return fail('CORRUPT');
    let expected: string | null = null;
    if (previous === null) {
      if (next.outbox.length !== 0 || next.plans.some(state => state.plan.status !== 'paused'))
        return fail('UNREVIEWED');
    } else {
      const entry = this.#handles.get(previous);
      if (entry === undefined || entry.snapshot !== previous.snapshot ||
          entry.generation !== generation) return fail('CONFLICT');
      if (next.revision === entry.snapshot.revision) return fail('CONFLICT');
      assertForward(entry.snapshot, next);
      const oldReferencesUnchanged = entry.snapshot.outbox.every((item, index) =>
        sameInvoiceReference(item, next.outbox[index]));
      if (!oldReferencesUnchanged) return fail('UNREVIEWED');
      if (reviewedReservation) {
        const added = next.outbox[entry.snapshot.outbox.length];
        if (next.outbox.length !== entry.snapshot.outbox.length + 1 ||
            added?.status !== 'prepared') return fail('UNREVIEWED');
      } else if (next.outbox.length !== entry.snapshot.outbox.length) return fail('UNREVIEWED');
      expected = entry.text;
    }
    return this.#write(expected, next, generation);
  }

  /**
   * Bind M3's consumed review to M4's durable reservation. A consumer may only
   * sign/export through P04 after this resolves successfully, with a new live
   * authority/provider check. On any error reload before fresh review.
   */
  public async reserveReviewed(
    controller: RecurringPreparationController,
    view: RecurringReview,
    previous: RecurringLoadedSnapshot,
    context: RecurringReviewContext,
    artifactRef: string,
    nextSnapshotRevision: string,
  ): Promise<RecurringLoadedSnapshot> {
    const generation = this.#generation;
    this.#guard(generation);
    const entry = this.#handles.get(previous);
    if (entry === undefined || entry.generation !== generation) return fail('CONFLICT');
    const staged = controller.prepareNext(view, previous.snapshot, context, artifactRef, nextSnapshotRevision);
    return this.#commit(previous, staged, true);
  }

  /** Ciphertext-only backup; never exports decrypted private plan terms. */
  public async exportEncrypted(): Promise<string | null> {
    const generation = this.#generation;
    const text = await this.#readText(generation);
    if (text !== null) await this.#open(text, generation);
    this.#guard(generation);
    return text;
  }

  /**
   * Explicit reviewed restore on a *new empty* profile store only. Never overwrite
   * live invoices/history or import active auto-issuance authority. Import into
   * a populated store must be handled by a separately reviewed merge workflow.
   */
  public async restoreToEmpty(encryptedBackup: string, newRevision: string): Promise<RecurringLoadedSnapshot> {
    const generation = this.#generation;
    this.#guard(generation);
    const backup = await this.#open(encryptedBackup, generation);
    const revision = reference(newRevision);
    if (revision === backup.revision) return fail('CONFLICT');
    const restored = validateRecurringSnapshot({
      ...backup, revision,
      plans: backup.plans.map(state => ({
        ...state, plan: state.plan.status === 'active' ?
          { ...state.plan, revision, status: 'paused' } : state.plan,
      })),
    });
    return this.#write(null, restored, generation);
  }
}
