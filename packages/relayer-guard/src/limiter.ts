import { monotonicNow, requireConfig, type Clock } from './errors.js';
import { groupOfBucketKey } from './ip.js';

/** Key used for every request that arrives while the table is full of active entries. */
export const OVERFLOW_KEY = '\u0000overflow';

/**
 * Insertion-ordered bounded map that never evicts an entry the caller still considers live.
 * @internal
 */
class BoundedTable<V> {
  private readonly map = new Map<string, V>();
  private readonly groups = new Map<string, number>();
  private readonly keyGroups = new Map<string, string>();

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

  /** Reads without refreshing the entry's recency (a read-only probe is not a use). */
  public peek(key: string): V | undefined {
    return this.map.get(key);
  }

  public groupSize(group: string): number {
    return this.groups.get(group) ?? 0;
  }

  /** @returns Whether {@link insert} would succeed now. */
  public canInsert(): boolean {
    if (this.map.size < this.max) return true;
    const oldest = this.map.values().next().value;
    return oldest !== undefined && this.idle(oldest);
  }

  /** Inserts `key`, evicting the least-recently-used entry only if it is idle. @returns false if full. */
  public insert(key: string, v: V, group: string): boolean {
    if (!this.canInsert()) return false;
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.remove(oldest);
    }
    this.map.set(key, v);
    this.keyGroups.set(key, group);
    this.groups.set(group, (this.groups.get(group) ?? 0) + 1);
    return true;
  }

  private remove(key: string): void {
    if (!this.map.delete(key)) return;
    const group = this.keyGroups.get(key) ?? '';
    this.keyGroups.delete(key);
    const n = this.groups.get(group) ?? 0;
    if (n <= 1) this.groups.delete(group);
    else this.groups.set(group, n - 1);
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
  /** Maximum tracked keys per abuse group (default `max(1, ceil(maxKeys / 8))`). */
  readonly maxPerGroup?: number;
  /** Maximum isolated overflow buckets before using the shared overflow bucket (default 0). */
  readonly maxOverflowGroups?: number;
  /** Derives an abuse group from a key. Pass a privacy-preserving group explicitly to `take` when keys are hashed. */
  readonly groupOf?: (key: string) => string;
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
  private readonly groupOverflow = new Map<string, Bucket>();
  private readonly maxPerGroup: number;
  private readonly maxOverflowGroups: number;

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
    this.maxPerGroup = opts.maxPerGroup ?? Math.max(1, Math.ceil(opts.maxKeys / 8));
    this.maxOverflowGroups = opts.maxOverflowGroups ?? 0;
    requireConfig(
      Number.isInteger(this.maxPerGroup) && this.maxPerGroup >= 1,
      'maxPerGroup must be an integer >= 1',
    );
    requireConfig(
      Number.isInteger(this.maxOverflowGroups) && this.maxOverflowGroups >= 0,
      'maxOverflowGroups must be an integer >= 0',
    );
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
  public take(key: string, cost = 1, abuseGroup?: string): TakeResult {
    requireConfig(Number.isFinite(cost) && cost >= 0, 'cost must be >= 0');
    const group = abuseGroup ?? (this.opts.groupOf ?? groupOfBucketKey)(key);
    requireConfig(group.length > 0 && group.length <= 256, 'group must be 1..256 characters');
    let bucket = this.table.get(key);
    let overflow = false;
    let cap = this.opts.burst;
    if (bucket === undefined) {
      const fresh = { tokens: this.opts.burst, last: this.now() };
      if (this.table.groupSize(group) < this.maxPerGroup && this.table.insert(key, fresh, group))
        bucket = fresh;
      else {
        bucket = this.groupOverflow.get(group);
        if (bucket === undefined && this.groupOverflow.size < this.maxOverflowGroups) {
          bucket = { tokens: this.overflowBurst, last: this.now() };
          this.groupOverflow.set(group, bucket);
        }
        bucket ??= this.overflowBucket;
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
      cost > cap
        ? Number.POSITIVE_INFINITY
        : Math.ceil(((cost - bucket.tokens) / this.opts.ratePerSecond) * 1000);
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
  /** Most unreimbursed loss charged to one key (and to one abuse group) per window. */
  readonly perKeyLimit: bigint;
  /** Most unreimbursed loss across all keys per window, charged once per reservation or charge. */
  readonly globalLimit: bigint;
  /** Most distinct keys held, and separately most distinct groups held, >= 1. */
  readonly maxKeys: number;
  /** Maximum tracked keys per abuse group (default `max(1, ceil(maxKeys / 8))`). */
  readonly maxPerGroup?: number;
  /**
   * Part of `globalLimit` only clean sources may use: a reservation or charge any of whose key or group entries
   * already lost money in the current window is admitted only up to `globalLimit - cleanReserve`, so sources that
   * keep losing cannot exhaust the global budget for everyone (default 0, at most `globalLimit`).
   */
  readonly cleanReserve?: bigint;
}

/** One source of a loss: a key, the abuse group it shares a limit with, and its overflow class. */
export interface LossSource {
  readonly key: string;
  /** Abuse group (default: the key itself). */
  readonly group?: string;
  /**
   * Overflow class (default `''`). While a table is full of live entries, newcomers share one overflow entry per
   * class, so sources of different classes (for example a destination and a client network) never share one.
   */
  readonly kind?: string;
}

interface Spend {
  window: number;
  /** Reserved and charged in `window`. */
  spent: bigint;
  /** Settled or charged loss in `window`; non-zero makes the source unclean (see `cleanReserve`). */
  lost: bigint;
}

interface Resolved {
  /** Distinct key and group entries, the first source's key entry first. */
  readonly entries: readonly Spend[];
  readonly overflow: boolean;
}

/** Most distinct {@link LossSource.kind} values (each holds one key and one group overflow entry). */
const MAX_LOSS_KINDS = 8;

/**
 * Caps gas the relayer paid without being reimbursed (reverted or front-run sweeps, S3-06), per
 * source key, per abuse group and globally, in fixed windows.
 *
 * Use: before sending, `allows(key)` / `allowsAll(sources)`; reserve the worst case with `reserve` /
 * `reserveAll` and settle the actual loss (zero for a reimbursed sweep); or record a loss directly with
 * `charge(key, gasCostWei)`. A reservation for several sources (one sweep keyed by destination and by client
 * network) charges each key and group once and the global limit once (audit L5-02).
 *
 * @security Key it on something costlier to mint than a fresh owner address: the client network
 *   bucket ({@link bucketKey}) and, separately, the destination. Per-owner keys alone are free to
 *   mint (S3-06). Keys and groups live in bounded tables that evict only entries from an earlier window, so they
 *   overflow only while full of live entries (L5-04); newcomers then share one overflow entry per
 *   {@link LossSource.kind}, and the reservation reports it.
 */
export class LossBudget {
  private readonly keys: BoundedTable<Spend>;
  private readonly groups: BoundedTable<Spend>;
  private readonly overflowKeys = new Map<string, Spend>();
  private readonly overflowGroups = new Map<string, Spend>();
  private readonly global: Spend = { window: -1, spent: 0n, lost: 0n };
  private readonly maxPerGroup: number;
  private readonly cleanReserve: bigint;

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
    this.maxPerGroup = opts.maxPerGroup ?? Math.max(1, Math.ceil(opts.maxKeys / 8));
    requireConfig(
      Number.isInteger(this.maxPerGroup) && this.maxPerGroup >= 1,
      'maxPerGroup must be an integer >= 1',
    );
    this.cleanReserve = opts.cleanReserve ?? 0n;
    requireConfig(
      this.cleanReserve >= 0n && this.cleanReserve <= opts.globalLimit,
      'cleanReserve must be in 0..globalLimit',
    );
    const idle = (e: Spend): boolean => e.window !== this.windowIndex();
    this.keys = new BoundedTable(opts.maxKeys, idle);
    this.groups = new BoundedTable(opts.maxKeys, idle);
  }

  /** @returns Whether one more unreimbursed spend is allowed for `key` (every limit strictly unspent). */
  public allows(key: string, group = key): boolean {
    return this.allowsAll([{ key, group }]);
  }

  /** @returns Whether one more unreimbursed spend is allowed for a loss attributed to all of `sources`. */
  public allowsAll(sources: readonly LossSource[]): boolean {
    return this.admits(this.resolve(sources, false), 1n);
  }

  /**
   * Records an unreimbursed loss.
   *
   * @param key Source key.
   * @param amount Loss, >= 0.
   * @returns The key's total in the current window after charging.
   */
  public charge(key: string, amount: bigint, group = key): bigint {
    requireConfig(amount >= 0n, 'amount must be >= 0');
    const r = this.resolve([{ key, group }], true);
    this.add(r, amount, amount);
    return (r.entries[0] as Spend).spent;
  }

  /** Atomically reserves a worst-case loss estimate so concurrent sends cannot overspend the budget. */
  public reserve(key: string, estimate: bigint, group = key): LossReservation | null {
    return this.reserveAll([{ key, group }], estimate);
  }

  /**
   * Atomically reserves a worst-case loss attributed to all of `sources` (for example a sweep's destination and
   * client network): every key and group limit must admit it, and the global limit is charged once.
   *
   * @returns The reservation, or `null` when any limit would be exceeded (nothing reserved).
   */
  public reserveAll(sources: readonly LossSource[], estimate: bigint): LossReservation | null {
    requireConfig(estimate >= 0n, 'estimate must be >= 0');
    requireConfig(sources.length > 0, 'at least one source is required');
    if (!this.admits(this.resolve(sources, false), estimate)) return null;
    const window = this.windowIndex();
    const held = this.resolve(sources, true);
    this.add(held, estimate, 0n);
    let settled = false;
    const settle = (actual: bigint): boolean => {
      requireConfig(actual >= 0n, 'actual must be >= 0');
      if (settled) return false;
      settled = true;
      // A late settlement is a loss of the current window, charged once like any other.
      if (this.windowIndex() === window) this.add(held, actual - estimate, actual);
      else this.add(this.resolve(sources, true), actual, actual);
      return true;
    };
    const release = (): boolean => {
      if (settled) return false;
      settled = true;
      if (this.windowIndex() === window) this.add(held, -estimate, 0n);
      return true;
    };
    return {
      window,
      estimate,
      overflow: held.overflow,
      get settled() {
        return settled;
      },
      settle,
      release,
    };
  }

  /** Finds (or with `create`, inserts) the distinct entries of `sources`; a read-only probe changes nothing. */
  private resolve(sources: readonly LossSource[], create: boolean): Resolved {
    const w = this.windowIndex();
    const entries = new Set<Spend>();
    let overflow = false;
    const pick = (table: BoundedTable<Spend>, key: string, group: string, spill: Spend, partition: boolean): Spend => {
      const hit = create ? table.get(key) : table.peek(key);
      if (hit !== undefined) return hit;
      if ((!partition || table.groupSize(group) < this.maxPerGroup) && table.canInsert()) {
        const fresh = { window: w, spent: 0n, lost: 0n };
        if (create) table.insert(key, fresh, group);
        return fresh;
      }
      overflow = true;
      return spill;
    };
    for (const src of sources) {
      const group = src.group ?? src.key;
      const kind = src.kind ?? '';
      entries.add(pick(this.keys, src.key, group, this.overflowOf(this.overflowKeys, kind), true));
      entries.add(pick(this.groups, group, '', this.overflowOf(this.overflowGroups, kind), false));
    }
    return { entries: [...entries], overflow };
  }

  private overflowOf(spills: Map<string, Spend>, kind: string): Spend {
    let spill = spills.get(kind);
    if (spill === undefined) {
      requireConfig(spills.size < MAX_LOSS_KINDS, 'at most 8 loss source kinds');
      spill = { window: -1, spent: 0n, lost: 0n };
      spills.set(kind, spill);
    }
    return spill;
  }

  private admits(r: Resolved, amount: bigint): boolean {
    const w = this.windowIndex();
    let clean = true;
    for (const e of r.entries) {
      if (e.window !== w) continue;
      if (amount > this.opts.perKeyLimit - e.spent) return false;
      if (e.lost > 0n) clean = false;
    }
    const globalSpent = this.global.window === w ? this.global.spent : 0n;
    const cap = clean ? this.opts.globalLimit : this.opts.globalLimit - this.cleanReserve;
    return amount <= cap - globalSpent;
  }

  /** Adds `delta` to every entry and once to the global total; `lost` marks settled or charged loss. */
  private add(r: Resolved, delta: bigint, lost: bigint): void {
    const w = this.windowIndex();
    for (const e of [...r.entries, this.global]) {
      if (e.window !== w) {
        e.window = w;
        e.spent = 0n;
        e.lost = 0n;
      }
      e.spent += delta;
      e.lost += lost;
    }
  }

  private windowIndex(): number {
    return Math.floor(Math.max(0, this.now()) / this.opts.windowMs);
  }
}

/** A single-use loss reservation. `release()` is shorthand for settling zero loss. */
export interface LossReservation {
  readonly window: number;
  readonly estimate: bigint;
  /** True when a key or group of the reservation was charged to a shared overflow entry (tables full). */
  readonly overflow: boolean;
  readonly settled: boolean;
  settle(actual: bigint): boolean;
  release(): boolean;
}
