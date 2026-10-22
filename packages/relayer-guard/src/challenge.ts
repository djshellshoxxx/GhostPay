import { createHash, createHmac, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto';
import { requireConfig } from './errors.js';
import {
  generateQuestion,
  normalizeAnswer,
  type ChallengeDifficulty,
  type ChallengeRng,
} from './challenge-bank.js';

/**
 * Stateless plain-text question challenge for the sweep relayer.
 *
 * @security This only raises the cost of automated abuse; bots solve plain-text questions
 * trivially. It is NOT a security boundary on its own and must sit behind the per-owner rate limiter
 * and the gas {@link LossBudget}. Client-side checks are worthless: the relayer must call
 * {@link ChallengeService.verify} before spending gas. Answers and tokens are never logged.
 */

/** Records one-shot use of a challenge id. */
export interface ReplayStore {
  /**
   * Atomically marks `id` used.
   * @param id Challenge nonce (base64url).
   * @param expiresAt Wall-clock ms after which the entry may be forgotten.
   * @returns `true` if newly marked, `false` if already used. Throw (e.g. {@link ReplayStoreFullError})
   * when the mark cannot be recorded: the service then fails closed.
   */
  markUsed(id: string, expiresAt: number, partition?: string): boolean | Promise<boolean>;
}

/** Counts verification attempts per challenge id. */
export interface AttemptLimiter {
  /**
   * Atomically increments and returns the attempt count for `id` (first call returns 1).
   * @param id Challenge nonce (base64url).
   * @param expiresAt Wall-clock ms after which the entry may be forgotten.
   * @returns The new count. Return `Infinity` (or throw) when the count cannot be tracked: the
   * service then fails closed.
   */
  increment(id: string, expiresAt: number, partition?: string): number | Promise<number>;
}

/** Thrown by {@link MemoryReplayStore.markUsed} when every slot holds a live entry. */
export class ReplayStoreFullError extends Error {
  public constructor() {
    super('replay store is full');
    this.name = 'ReplayStoreFullError';
  }
}

interface Entry<V> {
  readonly expiresAt: number;
  readonly value: V;
  readonly partition: string;
}

const FULL_SCAN_INTERVAL_MS = 1000;

/** Bounded in-memory table with per-partition quotas and throttled full expiry scans. */
class ExpiringTable<V> {
  private readonly map = new Map<string, Entry<V>>();
  private readonly partitions = new Map<string, Set<string>>();
  private lastFullScan = Number.NEGATIVE_INFINITY;

  public constructor(
    private readonly maxEntries: number,
    private readonly maxPerPartition: number,
    private readonly now: () => number,
  ) {
    requireConfig(Number.isInteger(maxEntries) && maxEntries >= 1, 'maxEntries must be an integer >= 1');
    requireConfig(
      Number.isInteger(maxPerPartition) && maxPerPartition >= 1,
      'maxPerPartition must be an integer >= 1',
    );
  }

  public get size(): number {
    return this.map.size;
  }

  /** @returns The live entry for `id`, or undefined (an expired entry is dropped). */
  public live(id: string): Entry<V> | undefined {
    const e = this.map.get(id);
    if (e === undefined) return undefined;
    if (e.expiresAt <= this.now()) {
      this.remove(id);
      return undefined;
    }
    return e;
  }

  public set(
    id: string,
    expiresAt: number,
    value: V,
    partition: string | undefined,
    evict: boolean,
  ): 'ok' | 'partition_full' | 'full' {
    this.remove(id);
    // Missing partition is one bounded shared bucket, never an escape hatch around quotas.
    requireConfig(
      partition === undefined ||
        (typeof partition === 'string' && partition.length >= 1 && partition.length <= MAX_CONTEXT_LENGTH),
      'partition must be 1..256 characters',
    );
    const partitionKey = partition === undefined ? 'u:' : `p:${partition}`;
    if ((this.partitions.get(partitionKey)?.size ?? 0) >= this.maxPerPartition) {
      this.purge();
      if ((this.partitions.get(partitionKey)?.size ?? 0) >= this.maxPerPartition) return 'partition_full';
    }
    if (this.map.size >= this.maxEntries) {
      this.purge();
      if (this.map.size >= this.maxEntries && !(evict && this.evictFromLargestPartition())) return 'full';
    }
    this.map.set(id, { expiresAt, value, partition: partitionKey });
    const ids = this.partitions.get(partitionKey) ?? new Set<string>();
    ids.add(id);
    this.partitions.set(partitionKey, ids);
    return 'ok';
  }

  private remove(id: string): void {
    const e = this.map.get(id);
    if (e === undefined) return;
    this.map.delete(id);
    const ids = this.partitions.get(e.partition);
    ids?.delete(id);
    if (ids?.size === 0) this.partitions.delete(e.partition);
  }

  private purge(): void {
    const now = this.now();
    for (const [id, entry] of this.map) {
      if (entry.expiresAt > now) break;
      this.remove(id);
    }
    if (now - this.lastFullScan < FULL_SCAN_INTERVAL_MS) return;
    this.lastFullScan = now;
    for (const [id, entry] of this.map) if (entry.expiresAt <= now) this.remove(id);
  }

  private evictFromLargestPartition(): boolean {
    let largest: Set<string> | undefined;
    for (const ids of this.partitions.values())
      if (largest === undefined || ids.size > largest.size) largest = ids;
    const oldest = largest?.values().next().value;
    if (oldest === undefined) return false;
    this.remove(oldest);
    return true;
  }
}

/** Options for the in-memory stores. */
export interface MemoryStoreOptions {
  /** Most live entries held, integer >= 1 (default 10_000). */
  readonly maxEntries?: number;
  /** Maximum live entries per caller partition (default `max(1, floor(maxEntries / 8))`). */
  readonly maxPerPartition?: number;
  /** Wall clock in ms (default `Date.now`). */
  readonly now?: () => number;
}

function makeTable<V>(opts: MemoryStoreOptions): ExpiringTable<V> {
  const max = opts.maxEntries ?? 10_000;
  const perPartition = opts.maxPerPartition ?? Math.max(1, Math.floor(max / 8));
  return new ExpiringTable<V>(max, perPartition, opts.now ?? Date.now);
}

/**
 * Bounded in-memory {@link ReplayStore}.
 * @security Per-process only. With more than one relayer process a token can be replayed once per
 * process; production must supply a shared store.
 */
export class MemoryReplayStore implements ReplayStore {
  private readonly table: ExpiringTable<true>;

  public constructor(opts: MemoryStoreOptions = {}) {
    this.table = makeTable<true>(opts);
  }

  /** Number of entries currently held (including not yet purged expired ones). */
  public get size(): number {
    return this.table.size;
  }

  /** @throws ReplayStoreFullError when full of live entries. */
  public markUsed(id: string, expiresAt: number, partition?: string): boolean {
    if (this.table.live(id) !== undefined) return false;
    if (this.table.set(id, expiresAt, true, partition, false) !== 'ok') throw new ReplayStoreFullError();
    return true;
  }
}

/**
 * Bounded in-memory {@link AttemptLimiter}. When full of live entries it returns `Infinity`, so the
 * service rejects (fail closed).
 * @security Per-process only; production with several processes must supply a shared store.
 */
export class MemoryAttemptLimiter implements AttemptLimiter {
  private readonly table: ExpiringTable<{ n: number }>;

  public constructor(opts: MemoryStoreOptions = {}) {
    this.table = makeTable<{ n: number }>(opts);
  }

  public increment(id: string, expiresAt: number, partition?: string): number {
    const e = this.table.live(id);
    if (e !== undefined) return ++e.value.n;
    return this.table.set(id, expiresAt, { n: 1 }, partition, true) === 'ok' ? 1 : Number.POSITIVE_INFINITY;
  }
}

/** Why a verification failed. `context_mismatch` is deliberately absent: see {@link ChallengeService.verify}. */
export type ChallengeFailure =
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'wrong_answer'
  | 'too_many_attempts'
  | 'replayed'
  | 'replay_store_full';

/** Result of {@link ChallengeService.verify}. */
export type VerifyResult = { readonly ok: true } | { readonly ok: false; readonly reason: ChallengeFailure };

/** Challenge verification input; partition should be a resolved, preferably hashed client bucket. */
export interface VerifyInput {
  readonly token: unknown;
  readonly answer: unknown;
  readonly context: unknown;
  readonly partition?: unknown;
}

/** An issued challenge. */
export interface IssuedChallenge {
  /** Plain-text question to show the user. */
  readonly question: string;
  /** Opaque token to send back with the answer. */
  readonly token: string;
  /** Wall-clock expiry in ms since the epoch. */
  readonly expiresAt: number;
}

/** Service options. */
export interface ChallengeOptions {
  /** Secrets, each >= 32 bytes (copied). The first signs; all verify (rotation: put the new one first). */
  readonly secrets: readonly Uint8Array[];
  /** Token lifetime in ms, integer in 1..900_000 (default 120_000). */
  readonly ttlMs?: number;
  /** Difficulty 1..3 (default 1). Tokens bind the difficulty: changing it invalidates outstanding tokens. */
  readonly difficulty?: ChallengeDifficulty;
  /**
   * Wall clock in ms (default `Date.now`). Tokens may be verified by another process, so this must
   * be wall-clock time; {@link monotonicNow} is wrong here (its origin differs per process).
   */
  readonly now?: () => number;
  /** Source of 16 nonce bytes (default `crypto.randomBytes`). Inject only in tests. */
  readonly randomBytes?: (n: number) => Uint8Array;
  /** One-shot use store (default: new {@link MemoryReplayStore}). */
  readonly replayStore?: ReplayStore;
  /** Attempt counter (default: new {@link MemoryAttemptLimiter}). */
  readonly attemptLimiter?: AttemptLimiter;
  /** Attempts allowed per token, integer 1..100 (default 3). */
  readonly maxAttempts?: number;
}

const VERSION = 'v1';
const NONCE_BYTES = 16;
const MAC_BYTES = 32;
const MAX_TOKEN_LENGTH = 200;
const MAX_CONTEXT_LENGTH = 256;
const B64URL = /^[A-Za-z0-9_-]+$/u;

function b64(b: Uint8Array): string {
  return Buffer.from(b).toString('base64url');
}

/** Decodes canonical base64url of exactly `len` bytes, else null. */
function unb64(s: string, len: number): Buffer | null {
  if (!B64URL.test(s)) return null;
  const b = Buffer.from(s, 'base64url');
  return b.length === len && b.toString('base64url') === s ? b : null;
}

function hmac(key: Uint8Array, data: Uint8Array | string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** Length-prefixed (4-byte big-endian) concatenation: unambiguous across field boundaries. */
function frame(fields: readonly string[]): Buffer {
  const parts: Buffer[] = [];
  for (const f of fields) {
    const b = Buffer.from(f, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(b.length);
    parts.push(len, b);
  }
  return Buffer.concat(parts);
}

function sha(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/** HMAC-SHA256 counter-mode generator keyed by the question subkey. */
class Prf implements ChallengeRng {
  private block: Buffer = Buffer.alloc(0);
  private pos = 0;
  private counter = 0;

  public constructor(
    private readonly key: Buffer,
    private readonly seed: Buffer,
  ) {}

  private u32(): number {
    if (this.pos + 4 > this.block.length) {
      const c = Buffer.alloc(4);
      c.writeUInt32BE(this.counter++);
      this.block = hmac(this.key, Buffer.concat([this.seed, c]));
      this.pos = 0;
    }
    const v = this.block.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  public int(n: number): number {
    return this.u32() % n;
  }
}

interface KeyPair {
  readonly sign: Buffer;
  readonly question: Buffer;
}

interface Parsed {
  readonly expiresAt: number;
  readonly nonce: string;
  readonly nonceBytes: Buffer;
  readonly mac: Buffer;
}

/** @returns The parsed token, or null if it is not exactly the format {@link ChallengeService.issue} emits. */
function parseToken(token: unknown): Parsed | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  if (!B64URL.test(token)) return null;
  const inner = Buffer.from(token, 'base64url').toString('utf8');
  const parts = inner.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, exp, nonce, mac] = parts as [string, string, string, string];
  if (!/^[0-9]{1,15}$/u.test(exp) || String(Number(exp)) !== exp) return null;
  const nonceBytes = unb64(nonce, NONCE_BYTES);
  const macBytes = unb64(mac, MAC_BYTES);
  if (nonceBytes === null || macBytes === null) return null;
  return { expiresAt: Number(exp), nonce, nonceBytes, mac: macBytes };
}

/** Issues and verifies stateless challenges. Build with {@link createChallengeService}. */
export class ChallengeService {
  private readonly keys: readonly KeyPair[];
  private readonly ttlMs: number;
  private readonly difficulty: ChallengeDifficulty;
  private readonly now: () => number;
  private readonly rand: (n: number) => Uint8Array;
  private readonly replay: ReplayStore;
  private readonly attempts: AttemptLimiter;
  private readonly maxAttempts: number;

  /** @internal Use {@link createChallengeService}. */
  public constructor(opts: ChallengeOptions) {
    requireConfig(Array.isArray(opts.secrets) && opts.secrets.length >= 1, 'at least one secret is required');
    for (const s of opts.secrets) {
      requireConfig(
        s instanceof Uint8Array && s.length >= 32,
        'each secret must be a Uint8Array of >= 32 bytes',
      );
    }
    const ttl = opts.ttlMs ?? 120_000;
    requireConfig(
      Number.isInteger(ttl) && ttl >= 1 && ttl <= 900_000,
      'ttlMs must be an integer in 1..900000',
    );
    const diff = opts.difficulty ?? 1;
    requireConfig(diff === 1 || diff === 2 || diff === 3, 'difficulty must be 1, 2 or 3');
    const max = opts.maxAttempts ?? 3;
    requireConfig(
      Number.isInteger(max) && max >= 1 && max <= 100,
      'maxAttempts must be an integer in 1..100',
    );
    this.keys = opts.secrets.map((s) => {
      const copy = Uint8Array.from(s);
      return {
        sign: hmac(copy, 'ghostpay/relayer-guard/challenge/v1/sign'),
        question: hmac(copy, 'ghostpay/relayer-guard/challenge/v1/question'),
      };
    });
    this.ttlMs = ttl;
    this.difficulty = diff;
    this.now = opts.now ?? Date.now;
    this.rand = opts.randomBytes ?? nodeRandomBytes;
    this.replay = opts.replayStore ?? new MemoryReplayStore({ now: this.now });
    this.attempts = opts.attemptLimiter ?? new MemoryAttemptLimiter({ now: this.now });
    this.maxAttempts = max;
  }

  private mac(key: Buffer, expiresAt: number, nonce: string, context: string): Buffer {
    return hmac(key, frame([VERSION, String(expiresAt), nonce, String(this.difficulty), context]));
  }

  private qa(key: Buffer, nonceBytes: Buffer): ReturnType<typeof generateQuestion> {
    const seed = Buffer.concat([nonceBytes, Buffer.from([this.difficulty])]);
    return generateQuestion(new Prf(key, seed), this.difficulty);
  }

  /**
   * Issues a challenge bound to `context`.
   *
   * @security The token carries expiry, nonce and MAC only; the answer is regenerated on verify
   * from a PRF under an independent subkey, so the token never contains or reveals it.
   * @param context Caller-supplied binding, 1..256 chars, e.g. `${chainId}:${owner}`. Never an IP.
   * Validate attacker-influenced parts before calling.
   * @throws GuardError INVALID_CONFIG on an invalid context or a faulty `randomBytes`.
   */
  public issue(context: string): IssuedChallenge {
    requireConfig(
      typeof context === 'string' && context.length >= 1 && context.length <= MAX_CONTEXT_LENGTH,
      'context must be a string of 1..256 characters',
    );
    const nonceBytes = Buffer.from(this.rand(NONCE_BYTES));
    requireConfig(nonceBytes.length === NONCE_BYTES, 'randomBytes must return 16 bytes');
    const expiresAt = this.now() + this.ttlMs;
    requireConfig(Number.isSafeInteger(expiresAt) && expiresAt > 0 && expiresAt < 1e15, 'clock out of range');
    const nonce = b64(nonceBytes);
    const first = this.keys[0] as KeyPair;
    const mac = this.mac(first.sign, expiresAt, nonce, context);
    const token = Buffer.from(`${VERSION}.${expiresAt}.${nonce}.${b64(mac)}`, 'utf8').toString('base64url');
    return { question: this.qa(first.question, nonceBytes).question, token, expiresAt };
  }

  /**
   * Verifies an answer. Never throws on attacker-controlled input; returns a reason instead.
   *
   * Order: parse, MAC (constant time, against every secret), expiry, attempt counter, answer
   * (SHA-256 digests compared in constant time), then one-shot replay mark on success.
   *
   * `context_mismatch` is not reported: the context is inside the MAC, so a different context is
   * indistinguishable from a forged token and surfaces as `bad_signature` (distinguishing them
   * would be an oracle for forgers).
   *
   * Wrong answers consume attempts but do not mark the token used. A failing or full attempt
   * limiter yields `too_many_attempts`, and a failing or full replay store yields
   * `replay_store_full`: both fail closed.
   *
   * @security Costs one HMAC per configured secret for unauthenticated input, bounded by the
   * 200-char token cap; keep per-client rate limits in front.
   */
  public async verify(input: VerifyInput): Promise<VerifyResult> {
    try {
      return await this.verifyInner(input);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }

  private async verifyInner(input: VerifyInput): Promise<VerifyResult> {
    const { token, answer, context, partition } = input;
    const p = parseToken(token);
    if (
      p === null ||
      typeof context !== 'string' ||
      context.length < 1 ||
      context.length > MAX_CONTEXT_LENGTH
    ) {
      return { ok: false, reason: 'malformed' };
    }
    if (
      partition !== undefined &&
      (typeof partition !== 'string' || partition.length < 1 || partition.length > MAX_CONTEXT_LENGTH)
    ) {
      return { ok: false, reason: 'malformed' };
    }
    let matched: KeyPair | undefined;
    for (const k of this.keys) {
      const expected = this.mac(k.sign, p.expiresAt, p.nonce, context);
      if (timingSafeEqual(expected, p.mac) && matched === undefined) matched = k;
    }
    if (matched === undefined) return { ok: false, reason: 'bad_signature' };
    if (this.now() >= p.expiresAt) return { ok: false, reason: 'expired' };

    let count: number;
    try {
      count = await this.attempts.increment(p.nonce, p.expiresAt, partition);
    } catch {
      return { ok: false, reason: 'too_many_attempts' };
    }
    if (!(count <= this.maxAttempts)) return { ok: false, reason: 'too_many_attempts' };

    const given = normalizeAnswer(answer);
    const want = this.qa(matched.question, p.nonceBytes).answer;
    // Always hash both sides so timing does not depend on the answer's validity.
    const equal = timingSafeEqual(sha(given ?? ''), sha(want)) && given !== null;
    if (!equal) return { ok: false, reason: 'wrong_answer' };

    let fresh: boolean;
    try {
      fresh = await this.replay.markUsed(p.nonce, p.expiresAt, partition);
    } catch {
      return { ok: false, reason: 'replay_store_full' };
    }
    return fresh ? { ok: true } : { ok: false, reason: 'replayed' };
  }
}

/**
 * Creates a {@link ChallengeService}.
 * @throws GuardError INVALID_CONFIG on bad options (short secrets, ttl or difficulty out of range, ...).
 */
export function createChallengeService(opts: ChallengeOptions): ChallengeService {
  return new ChallengeService(opts);
}
