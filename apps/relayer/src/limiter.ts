import { createHmac, randomBytes } from 'node:crypto';

/** Insertion-ordered LRU map with a hard size bound. */
export class LruMap<K, V> {
  private readonly map = new Map<K, V>();

  public constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error('LruMap max must be a positive integer');
  }

  /** Current number of entries. */
  public get size(): number {
    return this.map.size;
  }

  /** Reads and marks as most recently used. */
  public get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  /** Inserts/refreshes; evicts the least recently used entry beyond the bound. */
  public set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done !== true) this.map.delete(oldest.value);
    }
  }

  /** Drops everything. */
  public clear(): void {
    this.map.clear();
  }
}

/**
 * Salted keyed hash for rate-limit buckets. The salt is random, held only in memory and rotated, so
 * bucket keys cannot be linked across rotations and raw identifiers are never stored.
 */
export class KeyHasher {
  private salt: Buffer;
  private startedAt: number;
  private epochCounter = 0;

  public constructor(
    private readonly rotationMs: number,
    private readonly now: () => number,
    private readonly random: (n: number) => Buffer = randomBytes,
  ) {
    this.salt = this.random(32);
    this.startedAt = now();
  }

  /** Increments on each salt rotation; holders of derived keys must drop them when it changes. */
  public get epoch(): number {
    this.rotateIfDue();
    return this.epochCounter;
  }

  /**
   * @param input Raw identifier (IP, address). Not retained.
   * @returns 128-bit hex digest valid until the next rotation.
   */
  public hash(input: string): string {
    this.rotateIfDue();
    return createHmac('sha256', this.salt).update(input).digest('hex').slice(0, 32);
  }

  private rotateIfDue(): void {
    if (this.now() - this.startedAt >= this.rotationMs) {
      this.salt = this.random(32);
      this.startedAt = this.now();
      this.epochCounter += 1;
    }
  }
}

interface Bucket {
  tokens: number;
  last: number;
}

/** Result of a limiter probe. */
export interface LimitResult {
  readonly ok: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Token-bucket rate limiter over hashed keys with bounded memory (LRU). All state is dropped when
 * the hasher's salt rotates.
 */
export class RateLimiter {
  private readonly buckets: LruMap<string, Bucket>;
  private epoch: number;

  public constructor(
    private readonly opts: { readonly perMinute: number; readonly burst: number; readonly maxKeys: number },
    private readonly hasher: KeyHasher,
    private readonly now: () => number,
  ) {
    this.buckets = new LruMap(opts.maxKeys);
    this.epoch = hasher.epoch;
  }

  /**
   * Consumes one token for `rawKey`.
   *
   * @param rawKey Raw identifier; hashed immediately and never stored.
   * @returns Whether the request may proceed.
   */
  public take(rawKey: string): LimitResult {
    if (this.hasher.epoch !== this.epoch) {
      this.buckets.clear();
      this.epoch = this.hasher.epoch;
    }
    const key = this.hasher.hash(rawKey);
    const t = this.now();
    const ratePerMs = this.opts.perMinute / 60_000;
    const b = this.buckets.get(key) ?? { tokens: this.opts.burst, last: t };
    b.tokens = Math.min(this.opts.burst, b.tokens + Math.max(0, t - b.last) * ratePerMs);
    b.last = t;
    let result: LimitResult;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      result = { ok: true, retryAfterSeconds: 0 };
    } else {
      result = { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - b.tokens) / ratePerMs / 1000)) };
    }
    this.buckets.set(key, b);
    return result;
  }
}
