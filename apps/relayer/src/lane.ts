import { RelayerError } from './errors.js';

/** What a lane job hands back: the immediate answer plus a promise for when the slot may be released. */
export interface JobOutcome<T> {
  readonly value: T;
  /** Resolves when the in-flight transaction is settled; must never reject. */
  readonly settled: Promise<void>;
}

/**
 * Serial execution lane for one chain: at most ONE job (one in-flight transaction) runs at a time and
 * at most `maxPending` jobs (running plus waiting) are admitted; the rest are rejected immediately.
 */
export class ChainLane {
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private closed = false;
  private readonly perGroup = new Map<string, number>();

  /**
   * @param maxPending Jobs running plus waiting.
   * @param maxPerGroup Jobs one group (client) may hold at once; defaults to `maxPending` (no extra limit).
   */
  public constructor(
    private readonly maxPending: number,
    private readonly maxPerGroup: number = maxPending,
  ) {
    if (!Number.isInteger(maxPending) || maxPending < 1) throw new Error('maxPending must be a positive integer');
    if (!Number.isInteger(maxPerGroup) || maxPerGroup < 1) throw new Error('maxPerGroup must be a positive integer');
  }

  /** Jobs currently running or waiting. */
  public get pending(): number {
    return this.pendingCount;
  }

  /**
   * Queues a job.
   *
   * @param job Runs when all earlier jobs settled; resolves with the response value and a settle promise.
   * @param group Opaque client identifier; one group can hold at most `maxPerGroup` slots so a single
   * source cannot make everybody else see `queue_full`.
   * @returns The job's value.
   * @throws {RelayerError} 503 `shutting_down` / `queue_full`; 429 `client_queue_full`; the job's own errors otherwise.
   */
  public submit<T>(job: () => Promise<JobOutcome<T>>, group?: string): Promise<T> {
    if (this.closed) return Promise.reject(new RelayerError(503, 'shutting_down'));
    if (this.pendingCount >= this.maxPending) return Promise.reject(new RelayerError(503, 'queue_full', 5));
    if (group !== undefined && (this.perGroup.get(group) ?? 0) >= this.maxPerGroup) {
      return Promise.reject(new RelayerError(429, 'client_queue_full', 5));
    }
    this.pendingCount += 1;
    if (group !== undefined) this.perGroup.set(group, (this.perGroup.get(group) ?? 0) + 1);
    return new Promise<T>((resolve, reject) => {
      const start = async (): Promise<void> => {
        try {
          const out = await job();
          resolve(out.value);
          await out.settled;
        } catch (e) {
          reject(e instanceof Error ? e : new Error('job_failed'));
        } finally {
          this.pendingCount -= 1;
          if (group !== undefined) {
            const left = (this.perGroup.get(group) ?? 1) - 1;
            if (left <= 0) this.perGroup.delete(group);
            else this.perGroup.set(group, left);
          }
        }
      };
      this.tail = this.tail.then(start);
    });
  }

  /** Stops admitting new jobs. */
  public close(): void {
    this.closed = true;
  }

  /** Resolves when everything admitted so far has settled. */
  public async drain(): Promise<void> {
    await this.tail;
  }
}

/** Hands out sequential transaction nonces for one hot-key account, re-syncing from the chain on demand. */
export class NonceManager {
  private next: number | null = null;

  public constructor(private readonly fetchPending: () => Promise<number>) {}

  /** @returns The nonce to use for the next transaction. */
  public async acquire(): Promise<number> {
    this.next ??= await this.fetchPending();
    const n = this.next;
    this.next = n + 1;
    return n;
  }

  /** Forgets local state: the next `acquire` re-reads the pending count from the chain. */
  public invalidate(): void {
    this.next = null;
  }
}
