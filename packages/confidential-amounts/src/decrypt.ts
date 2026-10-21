import { CtError, requireInput } from './errors.js';
import { parseAddress } from './manifest.js';
import type { Address } from 'viem';

/** A fetch-like transport. Opaque to the scheduler. */
export type Transport = (input: string, init?: Record<string, unknown>) => Promise<unknown>;

/** One decryption job. Exactly one stealth owner per job (CT-DEC-1). */
export interface DecryptJob<T> {
  /** The one stealth address whose handle this job decrypts. */
  readonly owner: Address;
  /** Runs the request with a transport that is not shared with any other job. */
  run(transport: Transport | undefined): Promise<T>;
}

/** Options of {@link DecryptScheduler}. */
export interface DecryptSchedulerOptions {
  /** Minimum gap between two request starts, ms (default 30 000). */
  readonly minGapMs?: number;
  /** Maximum gap between two request starts, ms (default 300 000). */
  readonly maxGapMs?: number;
  /** Delay the first job by a random gap too (default true). */
  readonly delayFirst?: boolean;
  /** Maximum queued jobs (default 256). */
  readonly maxQueue?: number;
  /**
   * Creates an isolated transport for one request (e.g. a fresh Tor circuit). `key` is a random
   * request id, NOT the owner address. Optional: without it jobs get `undefined` and must not be
   * relied on for transport isolation.
   */
  readonly isolate?: (key: string) => Transport;
  /** Uniform random in [0,1). Default: Web Crypto. Injectable for tests. */
  readonly random?: () => number;
  /** Sleep function. Default: `setTimeout`. Injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

interface Queued {
  readonly job: DecryptJob<unknown>;
  readonly resolve: (v: unknown) => void;
  readonly reject: (e: unknown) => void;
  cancelled: boolean;
}

/** @internal Uniform [0,1) from Web Crypto (53 random bits). */
function cryptoRandom(): number {
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  const hi = (buf[0] ?? 0) >>> 5;
  const lo = (buf[1] ?? 0) >>> 6;
  return (hi * 67108864 + lo) / 9007199254740992;
}

/** @internal Request id: 16 random bytes as hex. */
function requestId(random: () => number): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(random() * 256).toString(16).padStart(2, '0');
  return s;
}

/**
 * Serial decryption queue with random gaps (CT-DEC-2). Jobs run one at a time; the start of each
 * job is separated from the previous start by a uniform random gap in `[minGapMs, maxGapMs]`, so a
 * hosted relayer cannot correlate many stealth addresses by timing bursts. Each job carries a single
 * owner (CT-DEC-1) and receives its own transport when `isolate` is configured.
 * @security Reduces, does not remove, relayer-side linkage: the relayer still sees every stealth
 * address you decrypt for, from the same IP unless `isolate` provides separate circuits.
 */
export class DecryptScheduler {
  readonly #min: number;
  readonly #max: number;
  readonly #delayFirst: boolean;
  readonly #maxQueue: number;
  readonly #isolate: ((key: string) => Transport) | undefined;
  readonly #random: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #queue: Queued[] = [];
  #running = false;
  #waiting: Queued | undefined;
  #started = 0;

  /** @param o See {@link DecryptSchedulerOptions}. */
  public constructor(o: DecryptSchedulerOptions = {}) {
    this.#min = o.minGapMs ?? 30_000;
    this.#max = o.maxGapMs ?? 300_000;
    requireInput(Number.isFinite(this.#min) && this.#min >= 0, 'minGapMs must be >= 0');
    requireInput(Number.isFinite(this.#max) && this.#max >= this.#min, 'maxGapMs must be >= minGapMs');
    this.#delayFirst = o.delayFirst ?? true;
    this.#maxQueue = o.maxQueue ?? 256;
    requireInput(Number.isInteger(this.#maxQueue) && this.#maxQueue > 0, 'maxQueue must be a positive integer');
    this.#isolate = o.isolate;
    this.#random = o.random ?? cryptoRandom;
    this.#sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  }

  /** Number of jobs waiting (excluding the one running). */
  public get pending(): number {
    return this.#queue.length;
  }

  /** Number of jobs started so far. */
  public get started(): number {
    return this.#started;
  }

  /**
   * Queues a job.
   * @returns The job's result; rejects with `QUEUE_FULL`, `CANCELLED`, or the job's own error.
   */
  public enqueue<T>(job: DecryptJob<T>): Promise<T> {
    parseAddress(job.owner, 'owner');
    if (this.#queue.length >= this.#maxQueue) {
      return Promise.reject(new CtError('QUEUE_FULL', 'decryption queue is full'));
    }
    return new Promise<T>((resolve, reject) => {
      this.#queue.push({ job: job, resolve: resolve as (v: unknown) => void, reject, cancelled: false });
      if (!this.#running) void this.#drain();
    });
  }

  /** Rejects every job that has not started yet (queued or waiting out its gap) with `CANCELLED`. */
  public cancelPending(): void {
    const dropped = this.#queue.splice(0);
    if (this.#waiting) dropped.push(this.#waiting);
    for (const q of dropped) {
      q.cancelled = true;
      q.reject(new CtError('CANCELLED', 'decryption job cancelled'));
    }
  }

  /** @internal Draws the next gap in ms. */
  #gap(): number {
    return this.#min + Math.floor(this.#random() * (this.#max - this.#min + 1));
  }

  async #drain(): Promise<void> {
    this.#running = true;
    try {
      for (let next = this.#queue.shift(); next !== undefined; next = this.#queue.shift()) {
        if (this.#started > 0 || this.#delayFirst) {
          this.#waiting = next;
          await this.#sleep(this.#gap());
          this.#waiting = undefined;
        }
        if (next.cancelled) continue;
        this.#started++;
        const transport = this.#isolate ? this.#isolate(requestId(this.#random)) : undefined;
        try {
          next.resolve(await next.job.run(transport));
        } catch (e) {
          next.reject(e);
        }
      }
    } finally {
      this.#running = false;
    }
  }
}
