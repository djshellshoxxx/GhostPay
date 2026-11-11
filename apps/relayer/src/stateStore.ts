import { closeSync, fsyncSync, linkSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync, constants as fsc } from 'node:fs';
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
  // The offending key is not echoed: it is file content.
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) fail(`${what} has an unexpected key`);
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
 * The relayer's journal over a {@link StateBackend}.
 *
 * Two write disciplines:
 * - {@link addSend} and the `onSigned` hash update ({@link updateSend} with `durable: true`) are write-through and fail
 *   closed: on a failed write nothing changes in memory and the caller refuses to sign or broadcast.
 * - Every other mutation (settlement, release, status after a broadcast) is applied in memory first. If its write fails
 *   the journal is marked dirty and the next write of any kind (or {@link flush}) persists the whole snapshot,
 *   including the earlier removal. A removal is therefore never lost, so a settled reservation cannot be restored and
 *   released twice after a restart, and failed removals cannot pile up against the record cap.
 *
 * An optional `guard` runs before every write (the single-writer lock check): a process that no longer holds the lock
 * cannot write, so it cannot overwrite the new holder's state, and `addSend` fails closed (no new transaction).
 */
export class StateJournal {
  private readonly chains: Map<number, ChainState>;
  private dirtyFlag = false;

  /**
   * @param backend Storage.
   * @param now Wall clock ms (record timestamps).
   * @param guard Called before each write; throws {@link StateError} to forbid it.
   * @throws {StateError} when stored state is unreadable or invalid.
   */
  public constructor(
    private readonly backend: StateBackend,
    private readonly now: () => number = Date.now,
    private readonly guard: () => void = () => undefined,
  ) {
    const text = backend.read();
    this.chains = text === null ? new Map<number, ChainState>() : decodeState(text);
  }

  /** True while an applied change is not yet on disk (a write failed and none succeeded since). */
  public get dirty(): boolean {
    return this.dirtyFlag;
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
   * Records today's budget use (applied even if the write fails; see class notes).
   *
   * @throws {StateError} when the write fails.
   */
  public setBudget(chainId: number, day: number, spentWei: bigint): void {
    const c = this.chain(chainId);
    if (c.budget.day === day && c.budget.spentWei === spentWei && !this.dirtyFlag) return;
    this.apply(chainId, { budget: { day, spentWei }, sends: c.sends });
  }

  /**
   * Adds a send record together with the budget it was reserved from, in one write-through write.
   *
   * @returns The record id.
   * @throws {StateError} when the write fails (nothing is recorded in memory either).
   */
  public addSend(chainId: number, rec: Omit<SendRecord, 'id' | 'createdAtMs'>, budget: { day: number; spentWei: bigint }): string {
    const c = this.chain(chainId);
    if (c.sends.length >= MAX_SENDS_PER_CHAIN) throw new StateError('too many unsettled transactions');
    const id = randomBytes(8).toString('hex');
    this.writeThrough(chainId, { budget, sends: [...c.sends, { ...rec, id, createdAtMs: this.now() }] });
    return id;
  }

  /**
   * Updates a record (status and/or hash). With `durable` (the pre-broadcast hash) it is write-through: on failure the
   * record is unchanged and the caller must not broadcast. Otherwise it is applied even if the write fails.
   *
   * @throws {StateError} when the write fails.
   */
  public updateSend(chainId: number, id: string, patch: { readonly status: SendStatus; readonly txHash?: Hex }, durable = false): void {
    const c = this.chain(chainId);
    if (!c.sends.some((s) => s.id === id)) return;
    const next = { budget: c.budget, sends: c.sends.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
    if (durable) this.writeThrough(chainId, next);
    else this.apply(chainId, next);
  }

  /**
   * Removes a settled record, optionally recording the budget after its release. Applied even if the write fails.
   *
   * @throws {StateError} when the write fails.
   */
  public removeSend(chainId: number, id: string, budget?: { day: number; spentWei: bigint }): void {
    const c = this.chain(chainId);
    const sends = c.sends.filter((s) => s.id !== id);
    if (sends.length === c.sends.length && budget === undefined) return;
    this.apply(chainId, { budget: budget ?? c.budget, sends });
  }

  /**
   * Writes the current snapshot if a previous write failed.
   *
   * @throws {StateError} when it still cannot be written.
   */
  public flush(): void {
    if (!this.dirtyFlag) return;
    this.write(this.chains);
  }

  private writeThrough(chainId: number, next: ChainState): void {
    const all = new Map(this.chains);
    all.set(chainId, next);
    this.write(all);
    this.chains.set(chainId, next);
  }

  private apply(chainId: number, next: ChainState): void {
    this.chains.set(chainId, next);
    this.dirtyFlag = true;
    this.write(this.chains);
  }

  private write(all: ReadonlyMap<number, ChainState>): void {
    this.guard();
    this.backend.write(encodeState(all));
    // Every write is a whole snapshot that includes all applied changes, so a success clears the dirty mark.
    this.dirtyFlag = false;
  }
}

/** Contents of the single-writer lock file next to the state file. */
interface LockBody {
  readonly pid: number;
  readonly host: string;
  /** Random per-acquisition token: the fencing identity. pid and host only help an operator read the file. */
  readonly token: string;
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
  /**
   * A lock naming this same host and pid (a restarted container, where node is pid 1 again) is taken over once its
   * heartbeat is older than this (default 15 s, longer than the 10 s heartbeat): a live holder keeps it fresher.
   */
  readonly restartStaleMs?: number;
}

/** A held single-writer lock. */
export interface StateLock {
  /** Throws {@link StateError} unless the lock file still carries this holder's token (the journal's write guard). */
  assertHeld(): void;
  /** Refreshes the heartbeat; call well within `restartStaleMs`. */
  heartbeat(): void;
  /** Removes the lock file if it is still ours. */
  release(): void;
}

function parseLock(text: string | null): LockBody | undefined {
  if (text === null) return undefined;
  try {
    const v = JSON.parse(text) as Partial<LockBody>;
    return typeof v.token === 'string' && typeof v.beatMs === 'number' ? (v as LockBody) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Takes the single-writer lock `<stateFile>.lock`. Two relayer processes sharing one hot key and state file would
 * hand out the same nonces and each spend the full daily budget, so a second process refuses to start while the
 * first keeps its heartbeat fresh, and the journal refuses every write once the lock carries another token.
 *
 * A missing lock is created exclusively (`link`, fails if one appeared meanwhile). A stale one (no heartbeat for
 * `staleMs`, or `restartStaleMs` when it names this host and pid) is replaced and read back to confirm the takeover.
 *
 * @remarks This guards one host or one shared volume; it is not distributed coordination. Running replicas with the
 * same hot key on separate storage is unsupported (README).
 * @throws {StateError} while another live process holds the lock.
 */
export function acquireStateLock(stateFile: string, o: LockOptions): StateLock {
  const path = `${stateFile}.lock`;
  const staleMs = o.staleMs ?? 30_000;
  const restartStaleMs = o.restartStaleMs ?? 15_000;
  const token = randomBytes(16).toString('hex');
  const body = (): string => `${JSON.stringify({ pid: o.pid, host: o.host, token, beatMs: o.now() } satisfies LockBody)}\n`;
  const backend = new FileStateBackend(path);
  const busy = (): never => {
    throw new StateError('state file is locked by another relayer process');
  };
  const current = backend.read();
  if (current === null) {
    // Exclusive create: write a private temp file, then hard-link it into place (EEXIST if another process won).
    const tmp = `${path}.${token}.tmp`;
    new FileStateBackend(tmp).write(body());
    try {
      linkSync(tmp, path);
    } catch {
      busy();
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        // nothing to clean up
      }
    }
  } else {
    const held = parseLock(current);
    if (held !== undefined) {
      const age = o.now() - held.beatMs;
      const sameInstance = held.pid === o.pid && held.host === o.host;
      if (age < (sameInstance ? restartStaleMs : staleMs)) busy();
    }
    backend.write(body());
  }
  const mine = (): boolean => parseLock(backend.read())?.token === token;
  if (!mine()) busy(); // a concurrent takeover won the race
  return {
    assertHeld: () => {
      if (!mine()) throw new StateError('state lock is not held by this process');
    },
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
