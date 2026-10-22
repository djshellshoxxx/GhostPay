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

  public constructor(private readonly maxPending: number) {
    if (!Number.isInteger(maxPending) || maxPending < 1) throw new Error('maxPending must be a positive integer');
  }

  /** Jobs currently running or waiting. */
  public get pending(): number {
    return this.pendingCount;
  }

  /**
   * Queues a job.
   *
   * @param job Runs when all earlier jobs settled; resolves with the response value and a settle promise.
   * @returns The job's value.
   * @throws {RelayerError} 503 `shutting_down` / `queue_full`; the job's own errors otherwise.
   */
  public submit<T>(job: () => Promise<JobOutcome<T>>): Promise<T> {
    if (this.closed) return Promise.reject(new RelayerError(503, 'shutting_down'));
    if (this.pendingCount >= this.maxPending) return Promise.reject(new RelayerError(503, 'queue_full', 5));
    this.pendingCount += 1;
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
