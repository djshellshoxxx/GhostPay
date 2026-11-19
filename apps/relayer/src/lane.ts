import { RelayerError } from './errors.js';

/** What a lane job hands back: the immediate answer plus a promise for when the slot may be released. */
export interface JobOutcome<T> {
  readonly value: T;
  /** Resolves when the in-flight transaction is settled; must never reject. */
  readonly settled: Promise<void>;
}

/**
 * One client's claim on the lane, taken synchronously by {@link ChainLane.reserve} before the caller's first await and
 * held until the job it submits has settled. Exactly one of `submit` or `release` ends it; both are safe to repeat.
 */
export interface LaneTicket {
  /** Queues the job under this ticket; the client slot is released when the job's lane slot is. */
  submit<T>(job: () => Promise<JobOutcome<T>>): Promise<T>;
  /** Gives the client slot back without queueing anything (admission refused before the lane); no-op after `submit`. */
  release(): void;
}

/**
 * Serial execution lane for one chain: at most ONE job (one in-flight transaction) runs at a time and
 * at most `maxPending` jobs (running plus waiting) are admitted; the rest are rejected immediately. A client (a salted
 * network key) holds at most `maxPerClient` tickets at a time, from its reservation until its job settles, so one
 * client cannot hold every slot (RL-02, NC-04).
 */
export class ChainLane {
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private closed = false;
  /** Tickets held per client key. An entry exists only while a ticket is held, so it is bounded by open requests. */
  private readonly perClient = new Map<string, number>();

  public constructor(
    private readonly maxPending: number,
    private readonly maxPerClient: number = maxPending,
  ) {
    if (!Number.isInteger(maxPending) || maxPending < 1) throw new Error('maxPending must be a positive integer');
    if (!Number.isInteger(maxPerClient) || maxPerClient < 1) throw new Error('maxPerClient must be a positive integer');
  }

  /** Jobs currently running or waiting. */
  public get pending(): number {
    return this.pendingCount;
  }

  /** Client keys currently holding at least one ticket. */
  public get heldClients(): number {
    return this.perClient.size;
  }

  /**
   * Takes one of a client's slots synchronously (check and increment with no await in between).
   *
   * @param client Salted client key; `undefined` takes no per-client slot (direct service callers).
   * @returns A ticket that must be submitted or released.
   * @throws {RelayerError} 429 `client_queue_full` when the client already holds `maxPerClient` tickets.
   */
  public reserve(client: string | undefined): LaneTicket {
    if (client !== undefined) {
      const held = this.perClient.get(client) ?? 0;
      if (held >= this.maxPerClient) throw new RelayerError(429, 'client_queue_full', 5);
      this.perClient.set(client, held + 1);
    }
    let open = client !== undefined;
    let used = false;
    const free = (): void => {
      if (!open || client === undefined) return;
      open = false;
      const left = (this.perClient.get(client) ?? 1) - 1;
      if (left <= 0) this.perClient.delete(client);
      else this.perClient.set(client, left);
    };
    return {
      submit: <T>(job: () => Promise<JobOutcome<T>>): Promise<T> => {
        if (used) return Promise.reject(new Error('ticket already used'));
        used = true;
        return this.enqueue(job, free);
      },
      // After submit the lane owns the slot and frees it when the job settles.
      release: () => {
        if (!used) free();
      },
    };
  }

  /**
   * Queues a job.
   *
   * @param job Runs when all earlier jobs settled; resolves with the response value and a settle promise.
   * @returns The job's value.
   * @throws {RelayerError} 503 `shutting_down` / `queue_full`; the job's own errors otherwise.
   */
  public submit<T>(job: () => Promise<JobOutcome<T>>): Promise<T> {
    return this.enqueue(job, () => undefined);
  }

  private enqueue<T>(job: () => Promise<JobOutcome<T>>, done: () => void): Promise<T> {
    if (this.closed) {
      done();
      return Promise.reject(new RelayerError(503, 'shutting_down'));
    }
    if (this.pendingCount >= this.maxPending) {
      done();
      return Promise.reject(new RelayerError(503, 'queue_full', 5));
    }
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
          done();
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
