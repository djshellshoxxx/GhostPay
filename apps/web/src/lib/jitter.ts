/**
 * Feature 6: announcement jitter. Local scheduling only. Nothing is signed, queued or broadcast while waiting;
 * the caller builds and presents the transaction again at the due time and the wallet asks for confirmation.
 */

export type CryptoLike = Pick<Crypto, 'getRandomValues'>;

/** Uniform integer in [minMs, maxMs] via CSPRNG rejection sampling (no modulo bias, no Math.random). */
export function randomDelayMs(minMs: number, maxMs: number, cryptoApi: CryptoLike = crypto): number {
  if (!Number.isSafeInteger(minMs) || !Number.isSafeInteger(maxMs) || minMs < 0 || maxMs < minMs) {
    throw new RangeError('Invalid jitter range');
  }
  const span = maxMs - minMs + 1;
  const range = 0x1_0000_0000;
  if (!Number.isSafeInteger(span) || span <= 0 || span > range) throw new RangeError('Invalid jitter range');
  const limit = range - (range % span);
  const sample = new Uint32Array(1);
  for (let attempts = 0; attempts < 1000; attempts++) {
    cryptoApi.getRandomValues(sample);
    const v = sample[0] as number;
    if (v < limit) return minMs + (v % span);
  }
  throw new RangeError('Random source failed');
}

export type ScheduleStatus = 'waiting' | 'ready' | 'cancelled' | 'expired';

export interface ScheduleSnapshot {
  readonly status: ScheduleStatus;
  readonly remainingMs: number;
}

export interface SchedulerDeps {
  /** Monotonic milliseconds (performance.now). */
  readonly monotonicNow: () => number;
  /** Wall-clock unix seconds, used only to detect invoice expiry. */
  readonly wallNowSeconds: () => number;
  readonly setInterval: (fn: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}

const defaultDeps: SchedulerDeps = {
  monotonicNow: () => performance.now(),
  wallNowSeconds: () => Math.floor(Date.now() / 1000),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => {
    globalThis.clearInterval(h as ReturnType<typeof setInterval>);
  },
};

/**
 * One scheduled local delay. The due time is measured on a monotonic clock so wall-clock changes cannot shorten it;
 * `check()` is also invoked on visibility changes because background tabs throttle timers. When due, the schedule
 * becomes `ready` (or `expired` if the invoice expired meanwhile). Cancelling is final.
 */
export class DelayScheduler {
  private status: ScheduleStatus = 'waiting';
  private readonly dueAt: number;
  private handle: unknown;
  private readonly listeners = new Set<(s: ScheduleSnapshot) => void>();

  public constructor(
    delayMs: number,
    private readonly invoiceExpiresAtSeconds: number,
    private readonly deps: SchedulerDeps = defaultDeps,
  ) {
    this.dueAt = deps.monotonicNow() + delayMs;
    this.handle = deps.setInterval(() => {
      this.check();
    }, 500);
  }

  public subscribe(fn: (s: ScheduleSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public snapshot(): ScheduleSnapshot {
    return { status: this.status, remainingMs: this.status === 'waiting' ? Math.max(0, this.dueAt - this.deps.monotonicNow()) : 0 };
  }

  /** Re-evaluates the schedule; safe to call at any time (timer tick, visibilitychange, tests). */
  public check(): ScheduleSnapshot {
    if (this.status === 'waiting') {
      if (this.deps.wallNowSeconds() >= this.invoiceExpiresAtSeconds) this.finish('expired');
      else if (this.deps.monotonicNow() >= this.dueAt) this.finish('ready');
    }
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
    return snap;
  }

  public cancel(): void {
    if (this.status === 'waiting') this.finish('cancelled');
    this.check();
  }

  /** Used by "Send now": skip the rest of the wait. Only valid while waiting. */
  public sendNow(): void {
    if (this.status === 'waiting') this.finish(this.deps.wallNowSeconds() >= this.invoiceExpiresAtSeconds ? 'expired' : 'ready');
    this.check();
  }

  private finish(next: ScheduleStatus): void {
    this.status = next;
    this.deps.clearInterval(this.handle);
  }
}
