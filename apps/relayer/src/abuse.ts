import { LruMap, type KeyHasher } from './limiter.js';

/** Failure-budget tunables. */
export interface AbuseOptions {
  /** Costly failures tolerated per owner within the window. */
  readonly ownerMax: number;
  /** Costly failures tolerated per destination within the window. */
  readonly destinationMax: number;
  readonly windowMs: number;
  readonly maxKeys: number;
}

/**
 * Per-owner and per-destination budgets of "costly failures" (a sweep that was mined and reverted, or whose
 * state changed between the two simulations, or whose owner could not cover the amount). Once a source has
 * used its budget, further sweeps from or to it are refused before any RPC or gas is spent. Owners are
 * free to mint, so the destination budget is the stronger key against a single beneficiary.
 *
 * @remarks Keys are salted hashes and all state is dropped when the salt rotates, consistent with the
 * privacy notice. Memory is bounded by an LRU.
 */
export class FailureBudgets {
  private readonly owners: LruMap<string, number[]>;
  private readonly destinations: LruMap<string, number[]>;

  public constructor(
    private readonly o: AbuseOptions,
    private readonly hasher: KeyHasher,
    private readonly now: () => number,
  ) {
    this.owners = new LruMap(o.maxKeys);
    this.destinations = new LruMap(o.maxKeys);
    hasher.onRotate(() => {
      this.owners.clear();
      this.destinations.clear();
    });
  }

  /**
   * @param owner Lowercase owner address.
   * @param destination Lowercase destination address.
   * @returns Whether new work for this pair is still allowed, else seconds until the oldest strike expires.
   */
  public check(owner: string, destination: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const a = this.wait(this.owners, this.hasher.hash(`o:${owner}`), this.o.ownerMax);
    const b = this.wait(this.destinations, this.hasher.hash(`d:${destination}`), this.o.destinationMax);
    const w = Math.max(a, b);
    return w === 0 ? { ok: true } : { ok: false, retryAfterSeconds: w };
  }

  /** Records one costly failure against both keys. */
  public record(owner: string, destination: string): void {
    this.add(this.owners, this.hasher.hash(`o:${owner}`), this.o.ownerMax);
    this.add(this.destinations, this.hasher.hash(`d:${destination}`), this.o.destinationMax);
  }

  private fresh(map: LruMap<string, number[]>, key: string): number[] {
    const t = this.now();
    const live = (map.get(key) ?? []).filter((x) => t - x < this.o.windowMs);
    map.set(key, live);
    return live;
  }

  private wait(map: LruMap<string, number[]>, key: string, max: number): number {
    const live = this.fresh(map, key);
    const oldest = live[0];
    if (live.length < max || oldest === undefined) return 0;
    return Math.max(1, Math.ceil((oldest + this.o.windowMs - this.now()) / 1000));
  }

  private add(map: LruMap<string, number[]>, key: string, max: number): void {
    const live = this.fresh(map, key);
    live.push(this.now());
    if (live.length > max) live.shift();
  }
}
