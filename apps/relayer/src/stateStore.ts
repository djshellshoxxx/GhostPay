import { closeSync, fsyncSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync, constants as fsc } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Hex } from 'viem';

/**
 * Restart-safe relayer state (financial exposure and hot-key nonce ownership).
 *
 * What is persisted, per chain, and nothing else (PRIVACY.md):
 * - the UTC day index and wei reserved against `dailyBudgetWei` on that day;
 * - one record per transaction that may still spend gas: hot-key nonce, local transaction hash (once signed), reserved
 *   wei, its budget day, gas price and a coarse status. Records are deleted as soon as a receipt settles them.
 *
 * No owner, destination, token, amount, fee, signature, IP or request id is ever written. A record exists only while a
 * transaction can still cost gas; the hash links to a public on-chain transaction only for that time.
 *
 * Durability: every mutation rewrites the whole file through a temporary file, `fsync`, `rename` and a directory
 * `fsync`, so a crash leaves either the old or the new snapshot, never a torn one. A file that does not parse is a
 * hard startup error (fail closed): silently starting from zero would reset the spent budget and forget a broadcast.
 */

/** Lifecycle of one gas-spending transaction as far as the journal needs it. */
export type SendStatus =
  /** Budget reserved and nonce assigned; not signed yet (a crash here provably broadcast nothing). */
  | 'reserved'
  /** Signed and about to be, or being, handed to the RPC; outcome not known (hash absent only if the client lost it). */
  | 'signed'
  /** The RPC accepted it; waiting for, or looking up, its receipt. */
  | 'pending';

/** A transaction that may still spend gas. Amounts are wei. */
export interface SendRecord {
  readonly id: string;
  readonly nonce: number;
  readonly txHash?: Hex;
  readonly reservedWei: bigint;
  readonly reservedDay: number;
  readonly gasPriceWei: bigint;
  readonly status: SendStatus;
  /** Wall-clock ms when the record was created (operator display and age-out only). */
  readonly createdAtMs: number;
}

/** Persisted state of one chain. */
export interface ChainState {
  readonly budget: { readonly day: number; readonly spentWei: bigint };
  readonly sends: readonly SendRecord[];
}

/** Raised for an unreadable, corrupt or unwritable state file. Messages name the problem, never file contents. */
export class StateError extends Error {
  public override readonly name = 'StateError';
}

/** Storage below the journal. {@link FileStateBackend} in production, {@link MemoryStateBackend} for tests/ephemeral. */
export interface StateBackend {
  /** @returns The stored text, or `null` when nothing was stored yet. */
  read(): string | null;
  /** Replaces the stored text durably; throws on failure. */
  write(text: string): void;
}

/** Keeps the state in memory only (`state.ephemeral`: a restart forgets it; development and tests). */
export class MemoryStateBackend implements StateBackend {
  public text: string | null = null;
  public writes = 0;
  /** Test hook: when set, `write` throws it. */
  public failWith: Error | undefined;

  public read(): string | null {
    return this.text;
  }

  public write(text: string): void {
    if (this.failWith !== undefined) throw this.failWith;
    this.text = text;
    this.writes += 1;
  }
}

const MAX_STATE_BYTES = 1 << 20;

/** Durable single-file backend (atomic replace). The file is created `0600`. */
export class FileStateBackend implements StateBackend {
  public constructor(private readonly path: string) {}

  public read(): string | null {
    let st;
    try {
      st = statSync(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new StateError('state file cannot be read');
    }
    if (!st.isFile()) throw new StateError('state file is not a regular file');
    if (st.size > MAX_STATE_BYTES) throw new StateError('state file is too large');
    try {
      return readFileSync(this.path, 'utf8');
    } catch {
      throw new StateError('state file cannot be read');
    }
  }

  public write(text: string): void {
    const tmp = `${this.path}.${randomBytes(6).toString('hex')}.tmp`;
    let fd: number | undefined;
    try {
      fd = openSync(tmp, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_EXCL, 0o600);
      writeSync(fd, text);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(tmp, this.path);
      syncDir(dirname(this.path));
    } catch {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // already failing; the original error is reported below
        }
      }
      try {
        unlinkSync(tmp);
      } catch {
        // nothing to clean up
      }
      throw new StateError('state file cannot be written');
    }
  }
}

function syncDir(dir: string): void {
  const fd = openSync(dir, fsc.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

const HASH = /^0x[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]{0,77})$/;
const ID = /^[0-9a-f]{16}$/;
const STATUSES: ReadonlySet<string> = new Set(['reserved', 'signed', 'pending']);
const MAX_SENDS_PER_CHAIN = 64;

function fail(what: string): never {
  throw new StateError(`state file is invalid: ${what}`);
}

function obj(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) fail(what);
  return x as Record<string, unknown>;
}

function keysExactly(o: Record<string, unknown>, required: readonly string[], optional: readonly string[], what: string): void {
  for (const k of required) if (!Object.hasOwn(o, k)) fail(`${what}.${k} missing`);
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) fail(`${what}.${k} unexpected`);
}

function int(x: unknown, what: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 || x > max) fail(what);
  return x;
}

function wei(x: unknown, what: string): bigint {
  if (typeof x !== 'string' || !UINT.test(x)) fail(what);
  return BigInt(x);
}

/**
 * Parses and strictly validates a state document (also used read-only by the ops CLI).
 *
 * @param text File contents.
 * @returns Chain states by chain id.
 * @throws {StateError} on any deviation from the schema.
 */
export function decodeState(text: string): Map<number, ChainState> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('not JSON');
  }
  const root = obj(raw, 'root');
  keysExactly(root, ['version', 'chains'], [], 'root');
  if (root['version'] !== 1) fail('unsupported version');
  const chainsRaw = obj(root['chains'], 'chains');
  const out = new Map<number, ChainState>();
  for (const [key, value] of Object.entries(chainsRaw)) {
    if (!/^[1-9][0-9]{0,15}$/.test(key)) fail('chain id');
    const chainId = Number(key);
    const c = obj(value, `chains.${key}`);
    keysExactly(c, ['budget', 'sends'], [], `chains.${key}`);
    const b = obj(c['budget'], `chains.${key}.budget`);
    keysExactly(b, ['day', 'spentWei'], [], `chains.${key}.budget`);
    const sendsRaw = c['sends'];
    if (!Array.isArray(sendsRaw) || sendsRaw.length > MAX_SENDS_PER_CHAIN) fail(`chains.${key}.sends`);
    const ids = new Set<string>();
    const sends = sendsRaw.map((s: unknown, i): SendRecord => {
      const w = `chains.${key}.sends[${String(i)}]`;
      const r = obj(s, w);
      keysExactly(r, ['id', 'nonce', 'reservedWei', 'reservedDay', 'gasPriceWei', 'status', 'createdAtMs'], ['txHash'], w);
      const id = r['id'];
      if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) fail(`${w}.id`);
      ids.add(id);
      const status = r['status'];
      if (typeof status !== 'string' || !STATUSES.has(status)) fail(`${w}.status`);
      const txHash = r['txHash'];
      if (txHash !== undefined && (typeof txHash !== 'string' || !HASH.test(txHash))) fail(`${w}.txHash`);
      // 'signed' may lack a hash when a client failed after handoff without one; only an accepted send must have it.
      if (status === 'pending' && txHash === undefined) fail(`${w}.txHash missing`);
      return {
        id,
        nonce: int(r['nonce'], `${w}.nonce`),
        ...(txHash === undefined ? {} : { txHash: txHash as Hex }),
        reservedWei: wei(r['reservedWei'], `${w}.reservedWei`),
        reservedDay: int(r['reservedDay'], `${w}.reservedDay`),
        gasPriceWei: wei(r['gasPriceWei'], `${w}.gasPriceWei`),
        status: status as SendStatus,
        createdAtMs: int(r['createdAtMs'], `${w}.createdAtMs`),
      };
    });
    out.set(chainId, { budget: { day: int(b['day'], `chains.${key}.budget.day`), spentWei: wei(b['spentWei'], `chains.${key}.budget.spentWei`) }, sends });
  }
  return out;
}

/** Serialises chain states (inverse of {@link decodeState}). */
export function encodeState(chains: ReadonlyMap<number, ChainState>): string {
  const doc: Record<string, unknown> = {};
  for (const [id, c] of [...chains.entries()].sort((a, b) => a[0] - b[0])) {
    doc[String(id)] = {
      budget: { day: c.budget.day, spentWei: c.budget.spentWei.toString() },
      sends: c.sends.map((s) => ({
        id: s.id,
        nonce: s.nonce,
        ...(s.txHash === undefined ? {} : { txHash: s.txHash.toLowerCase() }),
        reservedWei: s.reservedWei.toString(),
        reservedDay: s.reservedDay,
        gasPriceWei: s.gasPriceWei.toString(),
        status: s.status,
        createdAtMs: s.createdAtMs,
      })),
    };
  }
  return `${JSON.stringify({ version: 1, chains: doc }, null, 1)}\n`;
}

/**
 * The relayer's journal over a {@link StateBackend}. Every mutation is written through before it returns, so callers
 * can rely on "written, then act" ordering (reserve -> write -> broadcast).
 */
export class StateJournal {
  private readonly chains: Map<number, ChainState>;

  /**
   * @param backend Storage.
   * @param now Wall clock ms (record timestamps).
   * @throws {StateError} when stored state is unreadable or invalid.
   */
  public constructor(
    private readonly backend: StateBackend,
    private readonly now: () => number = Date.now,
  ) {
    const text = backend.read();
    this.chains = text === null ? new Map<number, ChainState>() : decodeState(text);
  }

  /** @returns The stored state of `chainId` (an empty default when none is stored). */
  public chain(chainId: number): ChainState {
    return this.chains.get(chainId) ?? { budget: { day: 0, spentWei: 0n }, sends: [] };
  }

  /** @returns Chain ids that have stored state. */
  public chainIds(): number[] {
    return [...this.chains.keys()];
  }

  /**
   * Records today's budget use.
   *
   * @throws {StateError} when the write fails (the in-memory copy is unchanged).
   */
  public setBudget(chainId: number, day: number, spentWei: bigint): void {
    const c = this.chain(chainId);
    if (c.budget.day === day && c.budget.spentWei === spentWei) return;
    this.commit(chainId, { budget: { day, spentWei }, sends: c.sends });
  }

  /**
   * Adds a send record together with the budget it was reserved from, in one write.
   *
   * @returns The record id.
   * @throws {StateError} when the write fails (nothing is recorded).
   */
  public addSend(chainId: number, rec: Omit<SendRecord, 'id' | 'createdAtMs'>, budget: { day: number; spentWei: bigint }): string {
    const c = this.chain(chainId);
    if (c.sends.length >= MAX_SENDS_PER_CHAIN) throw new StateError('too many unsettled transactions');
    const id = randomBytes(8).toString('hex');
    this.commit(chainId, { budget, sends: [...c.sends, { ...rec, id, createdAtMs: this.now() }] });
    return id;
  }

  /**
   * Updates a record (status and/or hash).
   *
   * @throws {StateError} when the write fails.
   */
  public updateSend(chainId: number, id: string, patch: { readonly status: SendStatus; readonly txHash?: Hex }): void {
    const c = this.chain(chainId);
    if (!c.sends.some((s) => s.id === id)) return;
    this.commit(chainId, { budget: c.budget, sends: c.sends.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  /**
   * Removes a settled record, optionally recording the budget after its release.
   *
   * @throws {StateError} when the write fails.
   */
  public removeSend(chainId: number, id: string, budget?: { day: number; spentWei: bigint }): void {
    const c = this.chain(chainId);
    const sends = c.sends.filter((s) => s.id !== id);
    if (sends.length === c.sends.length && budget === undefined) return;
    this.commit(chainId, { budget: budget ?? c.budget, sends });
  }

  private commit(chainId: number, next: ChainState): void {
    const all = new Map(this.chains);
    all.set(chainId, next);
    this.backend.write(encodeState(all));
    this.chains.set(chainId, next);
  }
}

/** Contents of the single-writer lock file next to the state file. */
interface LockBody {
  readonly pid: number;
  readonly host: string;
  readonly beatMs: number;
}

/** Options of {@link acquireStateLock}. */
export interface LockOptions {
  readonly pid: number;
  readonly host: string;
  /** Wall clock ms. */
  readonly now: () => number;
  /** A lock whose heartbeat is older than this is stale and taken over (default 30 s). */
  readonly staleMs?: number;
}

/** A held single-writer lock. */
export interface StateLock {
  /** Refreshes the heartbeat; call well within `staleMs`. */
  heartbeat(): void;
  /** Removes the lock file if it is still ours. */
  release(): void;
}

/**
 * Takes the single-writer lock `<stateFile>.lock`. Two relayer processes sharing one hot key and state file would
 * hand out the same nonces and each spend the full daily budget, so a second process refuses to start while the
 * first keeps its heartbeat fresh. A lock left by a crashed process is taken over when it names this same host and
 * pid (a restarted container) or when its heartbeat is stale.
 *
 * @remarks This guards one host or one shared volume; it is not distributed coordination. Running replicas with the
 * same hot key on separate storage is unsupported (README).
 * @throws {StateError} while another live process holds the lock.
 */
export function acquireStateLock(stateFile: string, o: LockOptions): StateLock {
  const path = `${stateFile}.lock`;
  const staleMs = o.staleMs ?? 30_000;
  const body = (): string => `${JSON.stringify({ pid: o.pid, host: o.host, beatMs: o.now() } satisfies LockBody)}\n`;
  const backend = new FileStateBackend(path);
  const current = backend.read();
  if (current !== null) {
    let held: LockBody | undefined;
    try {
      held = JSON.parse(current) as LockBody;
    } catch {
      held = undefined;
    }
    const ours = held !== undefined && held.pid === o.pid && held.host === o.host;
    const fresh = held !== undefined && typeof held.beatMs === 'number' && o.now() - held.beatMs < staleMs;
    if (!ours && fresh) throw new StateError('state file is locked by another relayer process');
  }
  backend.write(body());
  const mine = (): boolean => {
    try {
      const t = backend.read();
      if (t === null) return false;
      const held = JSON.parse(t) as LockBody;
      return held.pid === o.pid && held.host === o.host;
    } catch {
      return false;
    }
  };
  return {
    heartbeat: () => {
      if (!mine()) throw new StateError('state lock was taken over by another process');
      backend.write(body());
    },
    release: () => {
      if (!mine()) return;
      try {
        unlinkSync(path);
      } catch {
        // already gone
      }
    },
  };
}
