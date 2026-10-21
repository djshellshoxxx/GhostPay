import { monotonicNow, requireConfig, type Clock } from './errors.js';

/** Key used for every request that arrives while the table is full of active entries. */
export const OVERFLOW_KEY = '\u0000overflow';

/** How many of the oldest entries {@link BoundedTable} inspects for an idle one (L-8). */
const EVICT_SCAN = 8;

/**
 * Insertion-ordered bounded map that never evicts an entry the caller still considers live.
 * Optionally counts entries per group.
 * @internal
 */
class BoundedTable<V> {
  private readonly map = new Map<string, V>();
  private readonly groups = new Map<string, number>();

  public constructor(
    private readonly max: number,
    private readonly idle: (v: V) => boolean,
    private readonly groupOf: (v: V) => string | undefined = () => undefined,
  ) {}

  public get size(): number {
    return this.map.size;
  }

  public groupSize(group: string): number {
    return this.groups.get(group) ?? 0;
  }

  public get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  /** @returns The key of an idle entry among the oldest {@link EVICT_SCAN} (of `group` when given). */
  private evictable(group?: string): string | undefined {
    let n = 0;
    for (const [k, v] of this.map) {
      if (n++ >= EVICT_SCAN) break;
      if (this.idle(v) && (group === undefined || this.groupOf(v) === group)) return k;
    }
    return undefined;
  }

  /** @returns Whether {@link insert} would succeed now. */
  public canInsert(): boolean {
    return this.map.size < this.max || this.evictable() !== undefined;
  }

  private drop(key: string): void {
    const v = this.map.get(key) as V;
    this.map.delete(key);
    const g = this.groupOf(v);
    if (g === undefined) return;
    const left = this.groupSize(g) - 1;
    if (left > 0) this.groups.set(g, left);
    else this.groups.delete(g);
  }

  /**
   * Inserts `key`, evicting an idle entry among the oldest ones only if full. When `group` is
   * saturated (>= `maxPerGroup`) only an idle entry of that group may be evicted.
   * @returns false if there was no room.
   */
  public insert(key: string, v: V, maxPerGroup = Number.POSITIVE_INFINITY): boolean {
    const g = this.groupOf(v);
    const saturated = g !== undefined && this.groupSize(g) >= maxPerGroup;
    if (saturated || this.map.size >= this.max) {
      const victim = this.evictable(saturated ? g : undefined);
      if (victim === undefined) return false;
      this.drop(victim);
    }
    this.map.set(key, v);
    if (g !== undefined) this.groups.set(g, this.groupSize(g) + 1);
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
  /**
   * Maps a key to its abuse group (for example {@link groupOfBucketKey}: IPv6 /48, IPv4 /24). When
   * set, a group may hold at most `maxPerGroup` table slots and its overflow goes to a per-group
   * overflow bucket, so one group cannot drain the others' newcomers (audit M-3). Must be cheap and
   * must not throw. Default: no grouping (one global overflow bucket).
   */
  readonly groupOf?: (key: string) => string;
  /** Table slots one group may hold, integer >= 1 (default `max(1, floor(maxKeys / 4))`). Needs `groupOf`. */
  readonly maxPerGroup?: number;
  /** Most per-group overflow buckets held, integer >= 1 (default 1024). Beyond it: the global overflow bucket. */
  readonly maxOverflowGroups?: number;
}

/** Cheap counters for alerting. */
export interface LimiterStats {
  /** Requests charged to any overflow bucket since construction. Alert on its rate. */
  readonly overflowHits: number;
  /** Tracked keys (excluding overflow). */
  readonly tableSize: number;
  /** Per-group overflow buckets currently held. */
  readonly overflowGroups: number;
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
  group?: string;
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
  private readonly overflowTable: BoundedTable<Bucket>;
  private readonly maxPerGroup: number;
  private overflowHits = 0;

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
    requireConfig(
      Number.isFinite(this.overflowBurst) && this.overflowBurst >= 1,
      'overflowBurst must be >= 1',
    );
    this.maxPerGroup = opts.maxPerGroup ?? Math.max(1, Math.floor(opts.maxKeys / 4));
    requireConfig(
      Number.isInteger(this.maxPerGroup) && this.maxPerGroup >= 1,
      'maxPerGroup must be an integer >= 1',
    );
    const overflowGroups = opts.maxOverflowGroups ?? 1024;
    requireConfig(
      Number.isInteger(overflowGroups) && overflowGroups >= 1,
      'maxOverflowGroups must be an integer >= 1',
    );
    this.table = new BoundedTable(
      opts.maxKeys,
      (b) => this.refilled(b, opts.burst) >= opts.burst,
      (b) => b.group,
    );
    this.overflowTable = new BoundedTable(
      overflowGroups,
      (b) => this.refilled(b, this.overflowBurst) >= this.overflowBurst,
    );
    this.overflowBucket = { tokens: this.overflowBurst, last: now() };
  }

  /** Number of tracked keys (excluding overflow). */
  public get size(): number {
    return this.table.size;
  }

  /** Cheap counters for alerting on overflow (a sustained nonzero overflow rate means a flood or an undersized table). */
  public stats(): LimiterStats {
    return {
      overflowHits: this.overflowHits,
      tableSize: this.table.size,
      overflowGroups: this.overflowTable.size,
    };
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
      const group = this.opts.groupOf?.(key);
      const fresh: Bucket = { tokens: this.opts.burst, last: this.now() };
      if (group !== undefined) fresh.group = group;
      if (this.table.insert(key, fresh, this.maxPerGroup)) bucket = fresh;
      else {
        bucket = this.overflowFor(group);
        overflow = true;
        cap = this.overflowBurst;
        this.overflowHits++;
      }
    }
    bucket.tokens = this.refilled(bucket, cap);
    bucket.last = Math.max(bucket.last, this.now());
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { ok: true, retryAfterMs: 0, overflow };
    }
    const retryAfterMs =
      cost > cap
        ? Number.POSITIVE_INFINITY
        : Math.ceil(((cost - bucket.tokens) / this.opts.ratePerSecond) * 1000);
    return { ok: false, retryAfterMs, overflow };
  }

  /** The overflow bucket for `group`: its own if a slot is available, else the shared last-resort one. */
  private overflowFor(group: string | undefined): Bucket {
    if (group === undefined) return this.overflowBucket;
    const existing = this.overflowTable.get(group);
    if (existing !== undefined) return existing;
    const fresh: Bucket = { tokens: this.overflowBurst, last: this.now(), group };
    return this.overflowTable.insert(group, fresh) ? fresh : this.overflowBucket;
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

/** Handle returned by {@link LossBudget.reserve}. Opaque: pass it to `settle` or `release` exactly once. */
export class LossReservation {
  /** @internal */
  public constructor(
    /** @internal */ public readonly owner: LossBudget,
    public readonly key: string,
    /** Amount currently held. */
    public readonly estimate: bigint,
    /** @internal */ public readonly window: number,
    /** @internal */ public readonly spends: readonly Spend[],
    /** @internal */ public done = false,
  ) {}

  /** True once settled or released. */
  public get settled(): boolean {
    return this.done;
  }
}

/**
 * Caps gas the relayer paid without being reimbursed (reverted or front-run sweeps, S3-06), per
 * source key and globally, in fixed windows.
 *
 * Use: `reserve(key, estimatedLoss)` before sending (atomic check-and-charge, so parallel requests
 * cannot overshoot the cap), then `settle(reservation, actualLoss)` once the outcome is known (0n
 * for a reimbursed success) or `release(reservation)` if nothing was spent. `allows()` and
 * `charge()` remain for callers that only account after the fact.
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

  /**
   * @returns Whether one more unreimbursed spend is allowed for `key` (both limits strictly unspent).
   * @security Advisory only: check-then-charge is racy, N parallel callers all see `true`. Use
   *   {@link LossBudget.reserve} to enforce the cap.
   */
  public allows(key: string): boolean {
    const w = this.windowIndex();
    const s = this.peek(key);
    const keySpent = s !== undefined && s.window === w ? s.spent : 0n;
    const globalSpent = this.global.window === w ? this.global.spent : 0n;
    return keySpent < this.opts.perKeyLimit && globalSpent < this.opts.globalLimit;
  }

  /**
   * Atomically checks both limits and charges `estimate` (synchronous: no other request can
   * interleave between check and charge).
   *
   * @param key Source key.
   * @param estimate Worst-case loss of the attempt (for example gas limit times max fee), >= 0.
   * @returns A reservation, or `null` if key total + estimate or global total + estimate would exceed a limit.
   */
  public reserve(key: string, estimate: bigint): LossReservation | null {
    requireConfig(estimate >= 0n, 'estimate must be >= 0');
    const w = this.windowIndex();
    const existing = this.peek(key);
    const keySpent = existing !== undefined && existing.window === w ? existing.spent : 0n;
    const globalSpent = this.global.window === w ? this.global.spent : 0n;
    if (keySpent + estimate > this.opts.perKeyLimit || globalSpent + estimate > this.opts.globalLimit)
      return null;
    const s = existing ?? this.slot(key, w);
    this.add([s, this.global], w, estimate);
    return new LossReservation(this, key, estimate, w, [s, this.global]);
  }

  /**
   * Replaces a reservation's estimate by the actual loss (floored at 0 per total). The actual cost
   * may exceed the estimate: real loss is always recorded, even past the limit.
   * @returns False if the reservation was already settled or released (ignored).
   */
  public settle(r: LossReservation, actual: bigint): boolean {
    requireConfig(
      r instanceof LossReservation && r.owner === this,
      'reservation does not belong to this budget',
    );
    requireConfig(actual >= 0n, 'actual must be >= 0');
    if (r.done) return false;
    r.done = true;
    // A reservation from an earlier window was charged to a total that has since been reset.
    if (r.window === this.windowIndex()) this.add(r.spends, r.window, actual - r.estimate);
    return true;
  }

  /** Fully refunds a reservation (nothing was spent). @returns False if already settled or released. */
  public release(r: LossReservation): boolean {
    return this.settle(r, 0n);
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
    const s = this.table.get(key) ?? this.slot(key, w);
    this.add([s, this.global], w, amount);
    return s.spent;
  }

  private slot(key: string, w: number): Spend {
    const fresh = { window: w, spent: 0n };
    return this.table.insert(key, fresh) ? fresh : this.overflowSpend;
  }

  private add(targets: readonly Spend[], w: number, delta: bigint): void {
    for (const t of targets) {
      if (t.window !== w) {
        t.window = w;
        t.spent = 0n;
      }
      t.spent = t.spent + delta < 0n ? 0n : t.spent + delta;
    }
  }

  private peek(key: string): Spend | undefined {
    return this.table.get(key) ?? (this.table.canInsert() ? undefined : this.overflowSpend);
  }

  private windowIndex(): number {
    return Math.floor(Math.max(0, this.now()) / this.opts.windowMs);
  }
}
