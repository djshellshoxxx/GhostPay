/**
 * Encrypted local store for P13 records over an injected key-value port (IndexedDB in a browser, memory in tests).
 * Each value is an envelope `GPC1 | version | recordId | revision | sealed`, sealed with AAD = header + namespace, so
 * an envelope cannot be moved to another record, revision or profile namespace undetected. Writes use
 * compare-and-set (two tabs cannot silently overwrite each other). Nothing is ever deleted automatically.
 */
import { decodeBase64Url, encodeBase64Url } from '@ghostpay/invoice-schema';
import { check, fail } from './errors.js';
import type { RecordSealer } from './cipher.js';
import { assertTransition, mayHaveEffect, type P13State } from './lifecycle.js';
import { decodeRecord, encodeRecord, summarize, type ConfidentialRecordV1, type RecordEvidence, type RecordSummary } from './record.js';
import { dataArray, exactRecord, matchString } from './strict.js';

/** Atomic key-value storage. */
export interface KvPort {
  get(key: string): Promise<Uint8Array | undefined>;
  /** Replaces the value iff the stored bytes equal `expected` (`undefined` = absent). Returns false otherwise. */
  compareAndSet(key: string, expected: Uint8Array | undefined, next: Uint8Array): Promise<boolean>;
  /** Keys starting with `prefix`, any order. */
  keys(prefix: string): Promise<readonly string[]>;
}

const MAGIC = [0x47, 0x50, 0x43, 0x31]; // "GPC1"
const VERSION = 1;
const HEADER_LEN = 4 + 1 + 16 + 4;
/** Envelope cap (spec: ciphertext envelopes 1 MiB). */
export const MAX_ENVELOPE_BYTES = 1024 * 1024;
/** Records per backup (COMMON batch budget). */
export const MAX_BACKUP_RECORDS = 1000;
const NAMESPACE_RE = /^[a-z0-9][a-z0-9:_/-]{0,127}$/;
const B64URL_RE = /^[A-Za-z0-9_-]{1,1400000}$/;

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function header(recordId: string, revision: number): Uint8Array {
  const h = new Uint8Array(HEADER_LEN);
  h.set(MAGIC, 0);
  h[4] = VERSION;
  h.set(hexToBytes(recordId), 5);
  new DataView(h.buffer).setUint32(21, revision, false);
  return h;
}

/** Report of {@link ConfidentialRecordStore.reconcileAfterReload}. Counts only; no amounts or ids. */
export interface ReconcileReport {
  readonly total: number;
  readonly invalidatedReviews: number;
  readonly needsReconciliation: number;
  readonly corrupt: number;
}

/** Report of {@link ConfidentialRecordStore.importBackup}. */
export interface ImportReport {
  readonly inserted: number;
  readonly replacedOlder: number;
  readonly keptNewerOrEqual: number;
  readonly conflicts: number;
}

/** Encrypted backup: ciphertext envelopes only, readable with the same record key and namespace. */
export interface BackupV1 {
  readonly schema: 'ghostpay.confidential-backup/v1';
  readonly namespace: string;
  readonly records: readonly string[];
}

/** Fields an update may change; everything else is immutable after creation. */
export interface RecordPatch {
  readonly state: P13State;
  readonly updatedAt: number;
  readonly sessionEpoch?: number;
  readonly evidence?: RecordEvidence;
}

/** List entry: a summary, or a marker for an envelope that failed to open (kept, never deleted). */
export type ListEntry = { readonly status: 'ok'; readonly summary: RecordSummary } | { readonly status: 'corrupt'; readonly key: string };

/** Encrypted P13 record store. */
export class ConfidentialRecordStore {
  readonly #kv: KvPort;
  readonly #sealer: RecordSealer;
  readonly #namespace: string;
  readonly #nsBytes: Uint8Array;
  /** Highest revision seen per record in this session (rollback detection within a session). */
  readonly #highWater = new Map<string, number>();

  /**
   * @param namespace Profile/network scope, e.g. `p13:profile-1:eip155-31337`.
   */
  public constructor(kv: KvPort, sealer: RecordSealer, namespace: string) {
    check(NAMESPACE_RE.test(namespace), 'P13_RECORD_INVALID', 'invalid namespace');
    this.#kv = kv;
    this.#sealer = sealer;
    this.#namespace = namespace;
    this.#nsBytes = new TextEncoder().encode(namespace);
  }

  #key(recordId: string): string {
    return `${this.#namespace}/${recordId}`;
  }

  #aad(h: Uint8Array): Uint8Array {
    const aad = new Uint8Array(h.length + 1 + this.#nsBytes.length);
    aad.set(h, 0);
    aad[h.length] = this.#nsBytes.length;
    aad.set(this.#nsBytes, h.length + 1);
    return aad;
  }

  async #seal(r: ConfidentialRecordV1): Promise<Uint8Array> {
    const h = header(r.recordId, r.revision);
    const sealed = await this.#sealer.seal(this.#aad(h), encodeRecord(r));
    const out = new Uint8Array(h.length + sealed.length);
    out.set(h, 0);
    out.set(sealed, h.length);
    check(out.length <= MAX_ENVELOPE_BYTES, 'P13_RECORD_LIMIT', 'envelope too large');
    return out;
  }

  /** Opens an envelope; `expectedId` binds it to its storage key. */
  async #open(envelope: Uint8Array, expectedId?: string): Promise<ConfidentialRecordV1> {
    check(envelope.length <= MAX_ENVELOPE_BYTES, 'P13_RECORD_LIMIT', 'envelope too large');
    check(envelope.length > HEADER_LEN, 'P13_RECORD_INVALID', 'envelope too short');
    check(MAGIC.every((b, i) => envelope[i] === b) && envelope[4] === VERSION, 'P13_RECORD_INVALID', 'unknown envelope');
    const h = envelope.subarray(0, HEADER_LEN);
    const recordId = bytesToHex(h.subarray(5, 21));
    const revision = new DataView(h.buffer, h.byteOffset, h.byteLength).getUint32(21, false);
    if (expectedId !== undefined) check(recordId === expectedId, 'P13_RECORD_INVALID', 'envelope stored under another id');
    const plaintext = await this.#sealer.open(this.#aad(h), envelope.subarray(HEADER_LEN));
    const record = decodeRecord(plaintext);
    check(record.recordId === recordId && record.revision === revision, 'P13_RECORD_INVALID', 'header mismatch');
    return record;
  }

  #observe(r: ConfidentialRecordV1): void {
    const seen = this.#highWater.get(r.recordId) ?? 0;
    check(r.revision >= seen, 'P13_RECORD_ROLLBACK', 'record revision went backwards');
    this.#highWater.set(r.recordId, r.revision);
  }

  /** Stores a new record (revision 1, state `prepared`). @throws `P13_RECORD_CONFLICT` if the id exists. */
  public async create(r: ConfidentialRecordV1): Promise<RecordSummary> {
    check(r.revision === 1 && r.state === 'prepared', 'P13_RECORD_INVALID', 'new records start prepared at revision 1');
    const env = await this.#seal(r);
    const ok = await this.#kv.compareAndSet(this.#key(r.recordId), undefined, env);
    check(ok, 'P13_RECORD_CONFLICT', 'record id already exists');
    this.#observe(r);
    return summarize(r);
  }

  /** Loads and verifies a record; `undefined` if absent. */
  public async load(recordId: string): Promise<ConfidentialRecordV1 | undefined> {
    matchString(recordId, /^[0-9a-f]{32}$/, 'P13_RECORD_INVALID');
    const env = await this.#kv.get(this.#key(recordId));
    if (env === undefined) return undefined;
    const r = await this.#open(env, recordId);
    this.#observe(r);
    return r;
  }

  /**
   * Applies `patch` if the stored revision equals `expectedRevision` and the lifecycle allows the transition.
   * @throws {P13Error} `P13_RECORD_CONFLICT` (retryable) on a concurrent write; `P13_TRANSITION`.
   */
  public async update(recordId: string, expectedRevision: number, patch: RecordPatch): Promise<ConfidentialRecordV1> {
    matchString(recordId, /^[0-9a-f]{32}$/, 'P13_RECORD_INVALID');
    const key = this.#key(recordId);
    const env = await this.#kv.get(key);
    check(env !== undefined, 'P13_RECORD_INVALID', 'record not found');
    const cur = await this.#open(env, recordId);
    this.#observe(cur);
    if (cur.revision !== expectedRevision) fail('P13_RECORD_CONFLICT', 'record changed concurrently', true);
    assertTransition(cur.state, patch.state);
    check(Number.isSafeInteger(patch.updatedAt) && patch.updatedAt >= cur.updatedAt, 'P13_RECORD_INVALID', 'time went backwards');
    const next: ConfidentialRecordV1 = {
      ...cur,
      revision: cur.revision + 1,
      state: patch.state,
      updatedAt: patch.updatedAt,
      sessionEpoch: patch.sessionEpoch ?? cur.sessionEpoch,
      ...(patch.evidence !== undefined ? { evidence: patch.evidence } : {}),
    };
    const nextEnv = await this.#seal(next);
    const ok = await this.#kv.compareAndSet(key, env, nextEnv);
    if (!ok) fail('P13_RECORD_CONFLICT', 'record changed concurrently', true);
    this.#observe(next);
    return next;
  }

  /** Amount-free list. Envelopes that fail to open are reported as `corrupt` and left untouched. */
  public async list(): Promise<readonly ListEntry[]> {
    const keys = [...(await this.#kv.keys(`${this.#namespace}/`))].sort();
    check(keys.length <= MAX_BACKUP_RECORDS, 'P13_RECORD_LIMIT', 'too many records');
    const out: ListEntry[] = [];
    for (const key of keys) {
      const env = await this.#kv.get(key);
      if (env === undefined) continue;
      try {
        const r = await this.#open(env, key.slice(this.#namespace.length + 1));
        this.#observe(r);
        out.push({ status: 'ok', summary: summarize(r) });
      } catch {
        out.push({ status: 'corrupt', key });
      }
    }
    return out;
  }

  /**
   * After a reload or crash: invalidates reviews from an older session epoch (reviewed -> prepared) and moves
   * submitted records to `unknown` until evidence arrives. Authorized records are only counted: the app cannot know
   * whether a signature left the device, so nothing is resent or cancelled automatically.
   */
  public async reconcileAfterReload(currentEpoch: number, nowSec: number): Promise<ReconcileReport> {
    let invalidatedReviews = 0;
    let needsReconciliation = 0;
    let corrupt = 0;
    const entries = await this.list();
    for (const e of entries) {
      if (e.status === 'corrupt') {
        corrupt += 1;
        continue;
      }
      const s = e.summary;
      const r = await this.load(s.recordId);
      if (r === undefined) continue;
      const at = Math.max(nowSec, r.updatedAt);
      if (r.state === 'reviewed' && r.sessionEpoch !== currentEpoch) {
        await this.update(r.recordId, r.revision, { state: 'prepared', updatedAt: at, sessionEpoch: currentEpoch });
        invalidatedReviews += 1;
      } else if (r.state === 'submitted') {
        await this.update(r.recordId, r.revision, { state: 'unknown', updatedAt: at, evidence: { ...r.evidence, reason: 'reloaded' } });
        needsReconciliation += 1;
      } else if (mayHaveEffect(r.state) && r.state !== 'verified' && r.state !== 'reverted') {
        needsReconciliation += 1;
      }
    }
    return { total: entries.length, invalidatedReviews, needsReconciliation, corrupt };
  }

  /** Exports every stored envelope as-is (ciphertext only; no re-encryption, no plaintext). */
  public async exportBackup(): Promise<BackupV1> {
    const keys = [...(await this.#kv.keys(`${this.#namespace}/`))].sort();
    check(keys.length <= MAX_BACKUP_RECORDS, 'P13_RECORD_LIMIT', 'too many records');
    const records: string[] = [];
    for (const key of keys) {
      const env = await this.#kv.get(key);
      if (env !== undefined) records.push(encodeBase64Url(env));
    }
    return { schema: 'ghostpay.confidential-backup/v1', namespace: this.#namespace, records };
  }

  /**
   * Restores a backup. Every envelope is opened and validated first (staged); if any fails, nothing is written.
   * Never replaces a stored record with an older or equal revision.
   */
  public async importBackup(value: unknown): Promise<ImportReport> {
    const b = exactRecord(value, ['schema', 'namespace', 'records'], [], 'P13_RECORD_INVALID');
    check(b['schema'] === 'ghostpay.confidential-backup/v1', 'P13_RECORD_INVALID', 'unknown backup schema');
    check(b['namespace'] === this.#namespace, 'P13_RECORD_INVALID', 'backup belongs to another namespace');
    const items = dataArray(b['records'], MAX_BACKUP_RECORDS, 'P13_RECORD_LIMIT');
    const staged: { env: Uint8Array; record: ConfidentialRecordV1 }[] = [];
    for (const item of items) {
      let env: Uint8Array;
      try {
        env = decodeBase64Url(matchString(item, B64URL_RE, 'P13_RECORD_INVALID'));
      } catch {
        return fail('P13_RECORD_INVALID', 'backup entry is not base64url');
      }
      staged.push({ env, record: await this.#open(env) });
    }
    const ids = staged.map((s) => s.record.recordId);
    check(new Set(ids).size === ids.length, 'P13_RECORD_INVALID', 'duplicate record in backup');
    let inserted = 0;
    let replacedOlder = 0;
    let keptNewerOrEqual = 0;
    let conflicts = 0;
    for (const { env, record } of staged) {
      const key = this.#key(record.recordId);
      const existing = await this.#kv.get(key);
      if (existing === undefined) {
        if (await this.#kv.compareAndSet(key, undefined, env)) inserted += 1;
        else conflicts += 1;
        continue;
      }
      let current: ConfidentialRecordV1 | undefined;
      try {
        current = await this.#open(existing, record.recordId);
      } catch {
        current = undefined; // unreadable local copy: keep it, report a conflict, do not overwrite
      }
      if (current === undefined) {
        conflicts += 1;
      } else if (current.revision < record.revision) {
        if (await this.#kv.compareAndSet(key, existing, env)) replacedOlder += 1;
        else conflicts += 1;
      } else if (current.revision === record.revision && !equalBytes(existing, env)) {
        conflicts += 1;
      } else {
        keptNewerOrEqual += 1;
      }
    }
    return { inserted, replacedOlder, keptNewerOrEqual, conflicts };
  }
}

/** In-memory {@link KvPort} (tests and the fixture flow). Values are copied on read and write. */
export function createMemoryKv(): KvPort & { readonly raw: Map<string, Uint8Array> } {
  const raw = new Map<string, Uint8Array>();
  return {
    raw,
    get: (key) => Promise.resolve(raw.has(key) ? Uint8Array.from(raw.get(key) ?? []) : undefined),
    compareAndSet: (key, expected, next) => {
      const cur = raw.get(key);
      const same = cur === undefined ? expected === undefined : expected !== undefined && equalBytes(cur, expected);
      if (same) raw.set(key, Uint8Array.from(next));
      return Promise.resolve(same);
    },
    keys: (prefix) => Promise.resolve([...raw.keys()].filter((k) => k.startsWith(prefix))),
  };
}
