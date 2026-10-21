/** Error codes thrown by this package. Messages are fixed and never contain secret material. */
export type SecretBoxErrorCode = 'DISPOSED' | 'SERIALIZE' | 'ASYNC_IN_SYNC_USE' | 'INVALID_INPUT' | 'SECRET_IN_PAYLOAD';

/** Error with a stable {@link SecretBoxErrorCode}. */
export class SecretBoxError extends Error {
  /** Machine-readable code. */
  public readonly code: SecretBoxErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text.
   */
  public constructor(code: SecretBoxErrorCode, message: string) {
    super(message);
    this.name = 'SecretBoxError';
    this.code = code;
  }
}

/** Minimal randomness interface (Web Crypto's `crypto`). */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

interface State {
  bytes: Uint8Array | null;
  readonly label: string;
}

/** Module-private storage: the box object itself holds no own data properties. */
const STATE = new WeakMap<SecretBox, State>();
const INSPECT = Symbol.for('nodejs.util.inspect.custom');
const LABEL_RE = /^[A-Za-z0-9_.-]{1,32}$/;
/** Web Crypto `getRandomValues` limit per call. */
const MAX_RANDOM = 65_536;

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    (typeof v === 'object' || typeof v === 'function') &&
    v !== null &&
    typeof (v as { then?: unknown }).then === 'function'
  );
}

/**
 * Overwrites every buffer with zeros. `null`/`undefined` entries are skipped.
 *
 * @param buffers Buffers to clear.
 * @security Best-effort: JavaScript engines may have copied the bytes (GC moves, JIT registers,
 *   strings, `structuredClone`, transferred-then-received buffers). This clears only the given views.
 */
export function wipe(...buffers: readonly (Uint8Array | null | undefined)[]): void {
  for (const b of buffers) b?.fill(0);
}

function stateOf(box: SecretBox): State {
  const s = STATE.get(box);
  if (s === undefined) throw new SecretBoxError('INVALID_INPUT', 'not a SecretBox');
  return s;
}

function live(box: SecretBox): Uint8Array {
  const b = stateOf(box).bytes;
  if (b === null) throw new SecretBoxError('DISPOSED', 'secret has been disposed');
  return b;
}

/**
 * Holder for secret bytes (private keys, seeds, AES keys) that is **not** a `Uint8Array`.
 *
 * The bytes live in a module-private `WeakMap`, so the object has no own data: spread,
 * `Object.entries`, `Array.from`, `structuredClone`/`postMessage` and IndexedDB `put` see an empty
 * object, and `JSON.stringify` throws. `String(box)`, template literals and `util.inspect` print a
 * fixed redacted string (they do not throw, so a stray log line cannot crash a process; audit S3-08).
 * Access is only through {@link SecretBox.use} / {@link SecretBox.useAsync}, which lend a fresh copy
 * and wipe it afterwards, or {@link SecretBox.take}, which moves the bytes out and disposes the box.
 *
 * @security Guardrail, not a boundary. Code running in the same realm can still call `use` and copy
 *   the bytes; a compromised page has the key. Zeroization is best-effort (see {@link wipe}).
 *   Designed to close the specific leaks of audit S3-08 and haiku `code-tslibs` L-06
 *   (`Symbol.species`, `slice`, `subarray`, spread, `structuredClone` of `SecretBytes`).
 */
export class SecretBox {
  private constructor(bytes: Uint8Array, label: string) {
    STATE.set(this, { bytes, label });
    Object.freeze(this);
  }

  /**
   * Copies `source` into a new box.
   *
   * @param source Secret bytes (length >= 1).
   * @param opts `label` (1-32 chars `[A-Za-z0-9_.-]`, shown in redacted output; default `secret`);
   *   `wipeSource` (default `true`) zeroes `source` after copying.
   * @security With `wipeSource: false` the caller still owns a live copy and must wipe it.
   */
  public static copyOf(source: Uint8Array, opts: { readonly label?: string; readonly wipeSource?: boolean } = {}): SecretBox {
    if (!(source instanceof Uint8Array) || source.length === 0) {
      throw new SecretBoxError('INVALID_INPUT', 'source must be a non-empty Uint8Array');
    }
    const label = SecretBox.checkLabel(opts.label);
    const copy = new Uint8Array(source.length);
    copy.set(source);
    if (opts.wipeSource !== false) wipe(source);
    return new SecretBox(copy, label);
  }

  /**
   * Fills a new box from `rng` (Web Crypto by default).
   *
   * @param length 1..65536 bytes.
   * @param opts `label`, `rng` (test seam).
   * @security Uses `crypto.getRandomValues`; never `Math.random` (ADR-0004). Does not do rejection
   *   sampling: callers needing a scalar in [1, n-1] must use core-crypto's `randomScalar`.
   */
  public static random(length: number, opts: { readonly label?: string; readonly rng?: RandomSource } = {}): SecretBox {
    if (!Number.isInteger(length) || length < 1 || length > MAX_RANDOM) {
      throw new SecretBoxError('INVALID_INPUT', 'length must be an integer in 1..65536');
    }
    const label = SecretBox.checkLabel(opts.label);
    const bytes = new Uint8Array(length);
    (opts.rng ?? globalThis.crypto).getRandomValues(bytes);
    return new SecretBox(bytes, label);
  }

  /** @returns Whether `value` is a live or disposed {@link SecretBox}. */
  public static isSecretBox(value: unknown): value is SecretBox {
    return typeof value === 'object' && value !== null && STATE.has(value as SecretBox);
  }

  private static checkLabel(label: string | undefined): string {
    const l = label ?? 'secret';
    if (!LABEL_RE.test(l)) throw new SecretBoxError('INVALID_INPUT', 'label must match [A-Za-z0-9_.-]{1,32}');
    return l;
  }

  /** Byte length (0 once disposed). */
  public get length(): number {
    return stateOf(this).bytes?.length ?? 0;
  }

  /** True after {@link dispose} or {@link take}. */
  public get disposed(): boolean {
    return stateOf(this).bytes === null;
  }

  /** The non-secret label. */
  public get label(): string {
    return stateOf(this).label;
  }

  /**
   * Lends a fresh copy of the bytes to a synchronous callback and wipes the copy afterwards (also
   * when `fn` throws).
   *
   * @param fn Must not return a promise: the copy would be wiped before the awaited code ran.
   * @returns The value of `fn`.
   * @throws SecretBoxError ASYNC_IN_SYNC_USE if `fn` returns a thenable; DISPOSED if disposed.
   * @security Do not keep a reference to the lent view; it is zero after return.
   */
  public use<T>(fn: (bytes: Uint8Array) => T): T {
    const copy = live(this).slice();
    try {
      const r = fn(copy);
      if (isThenable(r)) {
        throw new SecretBoxError('ASYNC_IN_SYNC_USE', 'use() callback returned a promise; use useAsync()');
      }
      return r;
    } finally {
      wipe(copy);
    }
  }

  /**
   * Like {@link use} for async callbacks; the copy is wiped when the returned promise settles.
   *
   * @param fn Async callback.
   * @returns The awaited value of `fn`.
   */
  public async useAsync<T>(fn: (bytes: Uint8Array) => Promise<T>): Promise<T> {
    const copy = live(this).slice();
    try {
      return await fn(copy);
    } finally {
      wipe(copy);
    }
  }

  /**
   * Moves the bytes out: returns the internal buffer and disposes the box without wiping it.
   * Intended for a one-way hand-off such as `worker.postMessage(b, [b.buffer])`, which detaches the
   * sender's copy.
   *
   * @returns The secret bytes; the caller now owns them and must wipe them.
   */
  public take(): Uint8Array {
    const b = live(this);
    stateOf(this).bytes = null;
    return b;
  }

  /**
   * Constant-time-style comparison (runtime independent of where bytes differ; length mismatch
   * returns false after a full pass).
   *
   * @param other Box or bytes.
   * @security JavaScript gives no constant-time guarantee; this avoids early exit only.
   */
  public equals(other: SecretBox | Uint8Array): boolean {
    const a = live(this);
    const b = other instanceof Uint8Array ? other : live(other);
    const n = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
  }

  /** Wipes and releases the bytes. Idempotent. */
  public dispose(): void {
    const s = stateOf(this);
    wipe(s.bytes);
    s.bytes = null;
  }

  /** @throws SecretBoxError SERIALIZE always: secrets are never JSON. */
  public toJSON(): never {
    throw new SecretBoxError('SERIALIZE', 'a SecretBox must not be serialized');
  }

  /** @returns A fixed redacted string. */
  public toString(): string {
    return `[SecretBox ${this.label} redacted]`;
  }

  /** @returns The redacted string for every hint (no numeric coercion of secrets). */
  public [Symbol.toPrimitive](): string {
    return this.toString();
  }

  /** Node `util.inspect` / `console.log` hook. */
  public [INSPECT](): string {
    return this.toString();
  }
}

const MAX_DEPTH = 16;
const MAX_NODES = 10_000;

/**
 * Throws if `payload` contains a {@link SecretBox} anywhere in its own enumerable structure (arrays,
 * plain objects, `Map`/`Set` values). Call before `postMessage`, IndexedDB writes, `fetch` bodies or
 * logging structured data.
 *
 * @param payload Value about to leave the current context.
 * @throws SecretBoxError SECRET_IN_PAYLOAD; INVALID_INPUT if the structure is too deep (> 16) or
 *   large (> 10 000 nodes) to check, which fails closed.
 * @security A box would be cloned as `{}` (not leaked), so this check turns a silent data-loss bug
 *   into a loud one. It cannot detect raw bytes obtained through `use()`/`take()` and placed in a
 *   payload: those are indistinguishable from other bytes.
 */
export function assertNoSecretBox(payload: unknown): void {
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (typeof v !== 'object' || v === null) return;
    if (SecretBox.isSecretBox(v)) throw new SecretBoxError('SECRET_IN_PAYLOAD', 'payload contains a SecretBox');
    if (seen.has(v)) return;
    if (depth > MAX_DEPTH || seen.size >= MAX_NODES) {
      throw new SecretBoxError('INVALID_INPUT', 'payload too deep or too large to check');
    }
    seen.add(v);
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return;
    const children = v instanceof Map ? [...v.keys(), ...v.values()] : v instanceof Set ? [...v] : Object.values(v);
    for (const c of children) walk(c, depth + 1);
  };
  walk(payload, 0);
}
