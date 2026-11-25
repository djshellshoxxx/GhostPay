import { parseStrictJson } from '@ghostpay/invoice-schema';

/** Retention applies only to disposable presentation copies, never to durable transaction/recovery stores. */
export type RetentionDelay = 0 | 300_000 | 900_000 | 3_600_000;
export const RETENTION_KEY = 'ghostpay.invoice-preview-retention.v1';
export const RETENTION_EVENT = 'ghostpay:invoice-preview-retention';
export const PROOF_RETENTION_KEY = 'ghostpay.proof-preview-retention.v1';
export const PROOF_RETENTION_EVENT = 'ghostpay:proof-preview-retention';
export const RETENTION_POLICIES = {
  invoice: { key: RETENTION_KEY, event: RETENTION_EVENT },
  proof: { key: PROOF_RETENTION_KEY, event: PROOF_RETENTION_EVENT },
} as const;
export type RetentionScope = keyof typeof RETENTION_POLICIES;
interface ReadStorage { getItem(key: string): string | null }
interface WriteStorage { setItem(key: string, value: string): void }
const validDelay = (value: unknown): value is RetentionDelay => value === 0 || value === 300_000 || value === 900_000 || value === 3_600_000;

export function readRetentionDelay(storage?: ReadStorage, scope: RetentionScope = 'invoice'): RetentionDelay {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(RETENTION_POLICIES[scope].key);
    // A retention policy is tiny untrusted input; ambiguous or oversized data must never enable deletion.
    if (raw === null || raw.length > 128) return 0;
    const value: unknown = parseStrictJson(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return 0;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 1 && validDelay(record['delay']) ? record['delay'] : 0;
  } catch { return 0; }
}

export function writeRetentionDelay(delay: RetentionDelay, storage?: WriteStorage, scope: RetentionScope = 'invoice'): boolean {
  if (!validDelay(delay)) return false;
  try {
    const policy = RETENTION_POLICIES[scope];
    (storage ?? globalThis.localStorage).setItem(policy.key, JSON.stringify({ delay }));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(policy.event));
    return true;
  } catch { return false; }
}

/** Why a registration is cleared: a confirmed manual plan, or an opted-in age expiry (the owner announces the latter). */
export type RetentionReason = 'confirmed' | 'expired';
interface Entry { readonly createdAt: number; readonly clear: (reason: RetentionReason) => void; disposed: boolean }
export interface RetentionPreview { readonly count: number }
export type RetentionResult = { readonly kind: 'stale' } | { readonly kind: 'cleared'; readonly count: number; readonly failed: number };

/** No record data, storage adapter, key names or general deletion capability enters this registry. */
export class InvoicePreviewRetention {
  private readonly entries = new Set<Entry>();
  private readonly previews = new WeakMap<RetentionPreview, { readonly revision: number; readonly entries: readonly Entry[] }>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  // Withdrawn callbacks still reserve capacity until their synchronous cleanup succeeds or fails.
  private clearing = 0;
  public readonly getRevision = (): number => this.revision;
  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private changed(): void {
    this.revision++;
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try { listener(); } catch { /* A failed observer must not orphan a registration or stop cleanup. */ }
    }
  }
  public register(clear: (reason: RetentionReason) => void, createdAt = Date.now()): () => void {
    if (!Number.isFinite(createdAt) || createdAt < 0 || typeof clear !== 'function') throw new Error('Invalid retention registration.');
    if (this.entries.size + this.clearing >= 32) throw new Error('Retention capacity reached.');
    const entry: Entry = { clear, createdAt, disposed: false };
    this.entries.add(entry);
    this.changed();
    return () => {
      // Disposal may happen while clear() has temporarily withdrawn this entry from the set.
      entry.disposed = true;
      if (this.entries.delete(entry)) this.changed();
    };
  }
  public preview(): RetentionPreview {
    const result = Object.freeze({ count: this.entries.size });
    this.previews.set(result, { revision: this.revision, entries: [...this.entries] });
    return result;
  }
  public confirm(preview: RetentionPreview): RetentionResult {
    const plan = this.previews.get(preview);
    this.previews.delete(preview);
    if (plan === undefined || plan.revision !== this.revision) return { kind: 'stale' };
    return this.clear(plan.entries, 'confirmed');
  }
  public expire(delay: RetentionDelay, now = Date.now()): number {
    if (!validDelay(delay) || delay === 0 || !Number.isFinite(now) || now < 0) return 0;
    return this.clear([...this.entries].filter((entry) => now >= entry.createdAt && now - entry.createdAt >= delay), 'expired').count;
  }
  private clear(entries: readonly Entry[], reason: RetentionReason): Extract<RetentionResult, { kind: 'cleared' }> {
    let count = 0;
    let failed = 0;
    for (const entry of entries) {
      if (!this.entries.has(entry)) continue;
      // Withdraw ownership before invoking the synchronous view adapter: reentrant cleanup cannot replay it.
      this.entries.delete(entry);
      this.clearing++;
      try { entry.clear(reason); entry.disposed = true; count++; }
      catch {
        if (!entry.disposed) this.entries.add(entry);
        failed++;
      } finally { this.clearing--; }
    }
    if (entries.length > 0) this.changed();
    return { kind: 'cleared', count, failed };
  }
}

export const invoicePreviewRetention = new InvoicePreviewRetention();
export const proofPreviewRetention = new InvoicePreviewRetention();
/** Consent and manual plans never cross presentation categories. */
export const RETENTION_REGISTRIES = { invoice: invoicePreviewRetention, proof: proofPreviewRetention } as const;
