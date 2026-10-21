import { monotonicNow, requireConfig, type Clock } from './errors.js';

/** Key used for every request that arrives while the table is full of active entries. */
export const OVERFLOW_KEY = '\u0000overflow';

/**
 * Insertion-ordered bounded map that never evicts an entry the caller still considers live.
 * @internal
 */
class BoundedTable<V> {
  private readonly map = new Map<string, V>();

  public constructor(
    private readonly max: number,
    private readonly idle: (v: V) => boolean,
  ) {}

  public get size(): number {
    return this.map.size;
  }

  public get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  /** @returns Whether {@link insert} would succeed now. */
  public canInsert(): boolean {
    if (this.map.size < this.max) return true;
    const oldest = this.map.values().next().value;
    return oldest !== undefined && this.idle(oldest);
  }

  /** Inserts `key`, evicting the least-recently-used entry only if it is idle. @returns false if full. */
  public insert(key: string, v: V): boolean {
    if (!this.canInsert()) return false;
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, v);
    return true;
  }
}

/** Token-bucket tunables. */
export interface TokenBucketOptions {
  /** Refill rate in tokens per second, > 0. */
  readonly ratePerSecond: number;
  /** Bucket capacity (and initial content), >= 1. */
  readonly burst: number;
  /** Most distinct keys held, >= 1. */
  readonly maxKeys: number;
  /**
   * Capacity of the shared overflow bucket used while the table is full of non-idle keys
   * (default `burst`).
   */
  readonly overflowBurst?: number;
}

/** Result of a limiter probe. */
export interface TakeResult {
  readonly ok: boolean;
  /** Milliseconds until `cost` tokens are available (0 when `ok`). */
  readonly retryAfterMs: number;
  /** True when the request was charged to the shared overflow bucket. */
  readonly overflow: boolean;
}

interface Bucket {
  tokens: number;
  last: number;
}

/**
 * Token-bucket rate limiter with bounded memory that cannot be reset by key flooding.
 *
 * Differences from `apps/relayer/src/limiter.ts` (haiku audit L6): elapsed time is clamped at 0 and
 * the default clock is monotonic, so a clock step never removes tokens; when the table is full, only
 * an idle (fully refilled) bucket is evicted, which loses nothing, and otherwise the newcomer shares
 * one overflow bucket, so an attacker with many keys cannot evict and thereby refill a victim's
 * drained bucket.
 *
 * @security Keys should come from {@link bucketKey} (or an owner/destination address), optionally
 *   hashed. The limiter stores keys as given.
 */
export class TokenBucketLimiter {
  private readonly table: BoundedTable<Bucket>;
  private readonly overflowBucket: Bucket;
  private readonly overflowBurst: number;

  /**
   * @param opts Tunables (validated).
   * @param now Monotonic clock in ms.
   */
  public constructor(
    private readonly opts: TokenBucketOptions,
    private readonly now: Clock = monotonicNow,
  ) {
    requireConfig(Number.isFinite(opts.ratePerSecond) && opts.ratePerSecond > 0, 'ratePerSecond must be > 0');
    requireConfig(Number.isFinite(opts.burst) && opts.burst >= 1, 'burst must be >= 1');
    requireConfig(Number.isInteger(opts.maxKeys) && opts.maxKeys >= 1, 'maxKeys must be an integer >= 1');
    this.overflowBurst = opts.overflowBurst ?? opts.burst;
    requireConfig(Number.isFinite(this.overflowBurst) && this.overflowBurst >= 1, 'overflowBurst must be >= 1');
    this.table = new BoundedTable(opts.maxKeys, (b) => this.refilled(b, opts.burst) >= opts.burst);
    this.overflowBucket = { tokens: this.overflowBurst, last: now() };
  }

  /** Number of tracked keys (excluding overflow). */
  public get size(): number {
    return this.table.size;
  }

  /**
   * Consumes `cost` tokens for `key` if available.
   *
   * @param key Bucket key.
   * @param cost Tokens, >= 0 (default 1). A cost above the capacity can never succeed.
   */
  public take(key: string, cost = 1): TakeResult {
    requireConfig(Number.isFinite(cost) && cost >= 0, 'cost must be >= 0');
    let bucket = this.table.get(key);
    let overflow = false;
    let cap = this.opts.burst;
    if (bucket === undefined) {
      const fresh = { tokens: this.opts.burst, last: this.now() };
      if (this.table.insert(key, fresh)) bucket = fresh;
      else {
        bucket = this.overflowBucket;
        overflow = true;
        cap = this.overflowBurst;
      }
    }
    bucket.tokens = this.refilled(bucket, cap);
    bucket.last = Math.max(bucket.last, this.now());
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { ok: true, retryAfterMs: 0, overflow };
    }
    const retryAfterMs =
      cost > cap ? Number.POSITIVE_INFINITY : Math.ceil(((cost - bucket.tokens) / this.opts.ratePerSecond) * 1000);
    return { ok: false, retryAfterMs, overflow };
  }

  private refilled(b: Bucket, cap: number): number {
    const elapsed = Math.max(0, this.now() - b.last);
    return Math.min(cap, b.tokens + (elapsed / 1000) * this.opts.ratePerSecond);
  }
}

/** Loss-budget tunables (amounts in wei or any integer unit). */
export interface LossBudgetOptions {
  /** Fixed accounting window, ms > 0. */
  readonly windowMs: number;
  /** Most unreimbursed loss charged to one key per window. */
  readonly perKeyLimit: bigint;
  /** Most unreimbursed loss across all keys per window. */
  readonly globalLimit: bigint;
  /** Most distinct keys held, >= 1. */
  readonly maxKeys: number;
}

interface Spend {
  window: number;
  spent: bigint;
}

/**
 * Caps gas the relayer paid without being reimbursed (reverted or front-run sweeps, S3-06), per
 * source key and globally, in fixed windows.
 *
 * Use: before sending, `allows(key)`; after a mined revert or other unreimbursed spend,
 * `charge(key, gasCostWei)`. Successful sweeps are not charged (the fee reimbursed them).
 *
 * @security Key it on something costlier to mint than a fresh owner address: the client network
 *   bucket ({@link bucketKey}) and, separately, the destination. Per-owner keys alone are free to
 *   mint (S3-06). When the table is full of active keys, newcomers share {@link OVERFLOW_KEY}.
 */
export class LossBudget {
  private readonly table: BoundedTable<Spend>;
  private readonly overflowSpend: Spend = { window: -1, spent: 0n };
  private readonly global: Spend = { window: -1, spent: 0n };

  /**
   * @param opts Tunables (validated).
   * @param now Monotonic clock in ms.
   */
  public constructor(
    private readonly opts: LossBudgetOptions,
    private readonly now: Clock = monotonicNow,
  ) {
    requireConfig(Number.isFinite(opts.windowMs) && opts.windowMs > 0, 'windowMs must be > 0');
    requireConfig(opts.perKeyLimit >= 0n && opts.globalLimit >= 0n, 'limits must be >= 0');
    requireConfig(Number.isInteger(opts.maxKeys) && opts.maxKeys >= 1, 'maxKeys must be an integer >= 1');
    this.table = new BoundedTable(opts.maxKeys, (s) => s.window !== this.windowIndex());
  }

  /** @returns Whether one more unreimbursed spend is allowed for `key` (both limits strictly unspent). */
  public allows(key: string): boolean {
    const w = this.windowIndex();
    const s = this.peek(key);
    const keySpent = s !== undefined && s.window === w ? s.spent : 0n;
    const globalSpent = this.global.window === w ? this.global.spent : 0n;
    return keySpent < this.opts.perKeyLimit && globalSpent < this.opts.globalLimit;
  }

  /**
   * Records an unreimbursed loss.
   *
   * @param key Source key.
   * @param amount Loss, >= 0.
   * @returns The key's total in the current window after charging.
   */
  public charge(key: string, amount: bigint): bigint {
    requireConfig(amount >= 0n, 'amount must be >= 0');
    const w = this.windowIndex();
    let s = this.table.get(key);
    if (s === undefined) {
      const fresh = { window: w, spent: 0n };
      s = this.table.insert(key, fresh) ? fresh : this.overflowSpend;
    }
    for (const t of [s, this.global]) {
      if (t.window !== w) {
        t.window = w;
        t.spent = 0n;
      }
      t.spent += amount;
    }
    return s.spent;
  }

  private peek(key: string): Spend | undefined {
    return this.table.get(key) ?? (this.table.canInsert() ? undefined : this.overflowSpend);
  }

  private windowIndex(): number {
    return Math.floor(Math.max(0, this.now()) / this.opts.windowMs);
  }
}
