import { FlowError } from './errors.js';

/** Injected time source in unix milliseconds. Never read globals. */
export type Clock = () => number;

/** Lifecycle of a queued policy change. */
export type ChangeStatus = 'pending' | 'cancelled' | 'activated' | 'executed';

/** A queued policy change. `payload` is opaque to this package. */
export interface PendingChange {
  readonly id: string;
  readonly kind: string;
  /** Human-readable summary for the confirmation UI. */
  readonly summary: string;
  readonly payload: string;
  readonly createdAt: number;
  readonly activatesAt: number;
  readonly status: ChangeStatus;
  readonly cancelledAt?: number;
  readonly activatedAt?: number;
  /** Reference (e.g. tx hash) of the on-chain effect, once executed. */
  readonly executedRef?: string;
}

/** Input to {@link UndoQueue.submit}. */
export interface SubmitInput {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly payload: string;
  /** Undo window length in ms. */
  readonly delayMs: number;
}

/** Queue limits. */
export interface UndoOptions {
  readonly minDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly maxPending?: number;
}

/** Why cancel was refused. */
export type CancelRefusal =
  'NOT_FOUND' | 'WINDOW_CLOSED' | 'ALREADY_CANCELLED' | 'ALREADY_ACTIVATED' | 'EXECUTED_ON_CHAIN';

export type CancelResult =
  | { readonly ok: true; readonly change: PendingChange }
  | { readonly ok: false; readonly reason: CancelRefusal };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KIND_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const REF_RE = /^[A-Za-z0-9:_.-]{1,128}$/;
const MAX_PAYLOAD = 4096;
const MAX_SUMMARY = 280;

function isTime(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

/**
 * Local undo window for policy changes before they activate. Only the pending (not yet activated) stage is
 * cancellable; once a change is activated or executed on chain the queue refuses to cancel and says why.
 *
 * - The window is half-open: cancellable while now < activatesAt; exactly at activatesAt it is closed.
 * - The clock is injected and clamped monotonic: a clock that jumps backwards cannot re-open or extend a window.
 *
 * @security This is a client-side safety net, not a protocol guarantee. It never reverses an executed on-chain
 *   effect; use a real on-chain cancel transaction for that where the contract allows it.
 */
export class UndoQueue {
  private readonly items = new Map<string, PendingChange>();
  private lastNow = 0;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxPending: number;

  constructor(
    private readonly clock: Clock,
    opts: UndoOptions = {},
  ) {
    this.minDelayMs = opts.minDelayMs ?? 1000;
    this.maxDelayMs = opts.maxDelayMs ?? 30 * 24 * 3600 * 1000;
    this.maxPending = opts.maxPending ?? 256;
    if (
      !isTime(this.minDelayMs) ||
      !isTime(this.maxDelayMs) ||
      this.minDelayMs > this.maxDelayMs ||
      this.maxPending < 1
    ) {
      throw new FlowError('BAD_OPTION');
    }
  }

  private now(): number {
    const n = this.clock();
    if (!isTime(n)) throw new FlowError('BAD_CLOCK');
    if (n > this.lastNow) this.lastNow = n;
    return this.lastNow;
  }

  /** Queue a change. @throws FlowError BAD_CHANGE | DUPLICATE_ID | QUEUE_FULL | BAD_CLOCK */
  submit(input: SubmitInput): PendingChange {
    if (!ID_RE.test(input.id) || !KIND_RE.test(input.kind)) throw new FlowError('BAD_CHANGE');
    if (typeof input.summary !== 'string' || input.summary.length === 0 || input.summary.length > MAX_SUMMARY)
      throw new FlowError('BAD_CHANGE');
    if (typeof input.payload !== 'string' || input.payload.length > MAX_PAYLOAD)
      throw new FlowError('BAD_CHANGE');
    if (!isTime(input.delayMs) || input.delayMs < this.minDelayMs || input.delayMs > this.maxDelayMs)
      throw new FlowError('BAD_CHANGE');
    if (this.items.has(input.id)) throw new FlowError('DUPLICATE_ID');
    let pending = 0;
    for (const c of this.items.values()) if (c.status === 'pending') pending++;
    if (pending >= this.maxPending) throw new FlowError('QUEUE_FULL');
    const now = this.now();
    const c: PendingChange = {
      id: input.id,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload,
      createdAt: now,
      activatesAt: now + input.delayMs,
      status: 'pending',
    };
    this.items.set(c.id, c);
    return c;
  }

  /** Cancel a pending change strictly before its activation time. Never throws for refusals. */
  cancel(id: string): CancelResult {
    const c = this.items.get(id);
    if (c === undefined) return { ok: false, reason: 'NOT_FOUND' };
    if (c.status === 'cancelled') return { ok: false, reason: 'ALREADY_CANCELLED' };
    if (c.status === 'executed') return { ok: false, reason: 'EXECUTED_ON_CHAIN' };
    if (c.status === 'activated') return { ok: false, reason: 'ALREADY_ACTIVATED' };
    const now = this.now();
    if (now >= c.activatesAt) return { ok: false, reason: 'WINDOW_CLOSED' };
    const next: PendingChange = { ...c, status: 'cancelled', cancelledAt: now };
    this.items.set(id, next);
    return { ok: true, change: next };
  }

  /** Pending changes whose window has closed and which may now be activated, oldest first. */
  due(): PendingChange[] {
    const now = this.now();
    return this.list().filter((c) => c.status === 'pending' && now >= c.activatesAt);
  }

  /** Mark a due change as activated (the caller then performs the real action). @throws FlowError INVALID_TRANSITION */
  activate(id: string): PendingChange {
    const c = this.items.get(id);
    const now = this.now();
    if (c === undefined || c.status !== 'pending' || now < c.activatesAt)
      throw new FlowError('INVALID_TRANSITION');
    const next: PendingChange = { ...c, status: 'activated', activatedAt: now };
    this.items.set(id, next);
    return next;
  }

  /** Record that an activated change took effect on chain; from here it can never be cancelled. */
  markExecuted(id: string, ref: string): PendingChange {
    const c = this.items.get(id);
    if (c === undefined || c.status !== 'activated' || !REF_RE.test(ref))
      throw new FlowError('INVALID_TRANSITION');
    const next: PendingChange = { ...c, status: 'executed', executedRef: ref };
    this.items.set(id, next);
    return next;
  }

  /** Milliseconds left to cancel, or 0 when the window is closed or the change is not pending. */
  remainingMs(id: string): number {
    const c = this.items.get(id);
    if (c === undefined || c.status !== 'pending') return 0;
    return Math.max(0, c.activatesAt - this.now());
  }

  get(id: string): PendingChange | undefined {
    return this.items.get(id);
  }

  /** All changes ordered by (createdAt, id). */
  list(): PendingChange[] {
    return [...this.items.values()].sort(
      (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }

  /** Serializable copy for local storage. */
  snapshot(): { readonly lastNow: number; readonly items: readonly PendingChange[] } {
    return { lastNow: this.lastNow, items: this.list() };
  }

  /**
   * Rebuild a queue from untrusted stored data, validating every field and status invariant.
   * @throws FlowError BAD_SNAPSHOT
   */
  static restore(clock: Clock, data: unknown, opts: UndoOptions = {}): UndoQueue {
    const q = new UndoQueue(clock, opts);
    if (typeof data !== 'object' || data === null) throw new FlowError('BAD_SNAPSHOT');
    const d = data as { lastNow?: unknown; items?: unknown };
    if (!isTime(d.lastNow) || !Array.isArray(d.items) || d.items.length > 100000)
      throw new FlowError('BAD_SNAPSHOT');
    q.lastNow = d.lastNow;
    for (const raw of d.items as unknown[]) {
      if (typeof raw !== 'object' || raw === null) throw new FlowError('BAD_SNAPSHOT');
      const r = raw as Record<string, unknown>;
      const st = r['status'];
      if (
        typeof r['id'] !== 'string' ||
        !ID_RE.test(r['id']) ||
        typeof r['kind'] !== 'string' ||
        !KIND_RE.test(r['kind']) ||
        typeof r['summary'] !== 'string' ||
        r['summary'].length === 0 ||
        r['summary'].length > MAX_SUMMARY ||
        typeof r['payload'] !== 'string' ||
        r['payload'].length > MAX_PAYLOAD ||
        !isTime(r['createdAt']) ||
        !isTime(r['activatesAt']) ||
        r['activatesAt'] < r['createdAt'] ||
        (st !== 'pending' && st !== 'cancelled' && st !== 'activated' && st !== 'executed') ||
        q.items.has(r['id'])
      ) {
        throw new FlowError('BAD_SNAPSHOT');
      }
      const base: PendingChange = {
        id: r['id'],
        kind: r['kind'],
        summary: r['summary'],
        payload: r['payload'],
        createdAt: r['createdAt'],
        activatesAt: r['activatesAt'],
        status: st,
      };
      let c: PendingChange = base;
      if (st === 'cancelled') {
        if (!isTime(r['cancelledAt'])) throw new FlowError('BAD_SNAPSHOT');
        c = { ...base, cancelledAt: r['cancelledAt'] };
      } else if (st === 'activated' || st === 'executed') {
        if (!isTime(r['activatedAt']) || r['activatedAt'] < r['activatesAt'])
          throw new FlowError('BAD_SNAPSHOT');
        c = { ...base, activatedAt: r['activatedAt'] };
        if (st === 'executed') {
          if (typeof r['executedRef'] !== 'string' || !REF_RE.test(r['executedRef']))
            throw new FlowError('BAD_SNAPSHOT');
          c = { ...c, executedRef: r['executedRef'] };
        }
      }
      q.items.set(c.id, c);
    }
    return q;
  }
}
