import { b64urlDecode, b64urlEncode } from './base64url.js';
import { QrExchangeError } from './errors.js';
import { MAX_PAYLOAD_BYTES, parseChunk, sessionIdOf } from './multipart.js';

export interface AddResult {
  /** received / total, 0..1 (0 before any chunk). */
  readonly progress: number;
  readonly received: number;
  readonly total: number;
  readonly complete: boolean;
  /** Present only when complete; a fresh copy on every call. */
  readonly payload?: Uint8Array;
}

/** Default idle limit for a partially received transfer (no new part for this long discards it). */
export const DEFAULT_ASSEMBLY_MAX_AGE_MS = 10 * 60 * 1000;

export interface AssemblerOptions {
  /** Injectable clock (ms); defaults to Date.now. */
  readonly now?: () => number;
  /** Idle limit in ms for an incomplete transfer, a positive safe integer. Completed transfers never expire. */
  readonly maxAgeMs?: number;
}

/**
 * Stateful, order-independent reassembly. Duplicates are ignored. A chunk of another transfer, or a different
 * chunk body for an index already held, throws and leaves the state unchanged. A failed final integrity check
 * throws INTEGRITY_FAILED and discards everything. After completion, repeated chunks of the same transfer
 * return the completed result again; call reset() to start a new transfer. An incomplete transfer idle for longer
 * than `maxAgeMs` throws SESSION_EXPIRED on the next chunk and is discarded, so stale parts cannot be mixed into a
 * later scan. Memory is bounded by MAX_CHUNKS x MAX_CHUNK_CHARS (one transfer at a time).
 */
export class Assembler {
  readonly #now: () => number;
  readonly #maxAgeMs: number;
  #lastActivity = 0;
  #session: string | null = null;
  #total = 0;
  #parts: (string | undefined)[] = [];
  #received = 0;
  #done: Uint8Array | null = null;

  constructor(options: AssemblerOptions = {}) {
    const maxAge = options.maxAgeMs ?? DEFAULT_ASSEMBLY_MAX_AGE_MS;
    if (!Number.isSafeInteger(maxAge) || maxAge <= 0) throw new QrExchangeError('BAD_INPUT');
    this.#maxAgeMs = maxAge;
    this.#now = options.now ?? Date.now;
  }

  /** Session id of the transfer in progress (or completed), null when empty. */
  get session(): string | null {
    return this.#session;
  }

  /** Zero-based indices not yet received; empty before the first chunk and after completion. A fresh array. */
  missing(): readonly number[] {
    if (this.#session === null || this.#done !== null) return [];
    const out: number[] = [];
    for (let i = 0; i < this.#parts.length; i++) if (this.#parts[i] === undefined) out.push(i);
    return out;
  }

  add(chunkText: string): AddResult {
    const c = parseChunk(chunkText);
    const now = this.#now();
    if (this.#session !== null && this.#done === null && now - this.#lastActivity > this.#maxAgeMs) {
      this.reset();
      throw new QrExchangeError('SESSION_EXPIRED');
    }
    if (this.#session === null) {
      this.#session = c.session;
      this.#total = c.total;
      this.#parts = new Array<string | undefined>(c.total).fill(undefined);
    } else if (c.session !== this.#session || c.total !== this.#total) {
      throw new QrExchangeError('SESSION_MISMATCH');
    }
    if (this.#done !== null) return this.#result();
    this.#lastActivity = now;
    const held = this.#parts[c.index];
    if (held === undefined) {
      this.#parts[c.index] = c.data;
      this.#received++;
    } else if (held !== c.data) {
      throw new QrExchangeError('CHUNK_CONFLICT');
    }
    if (this.#received === this.#total) this.#finish();
    return this.#result();
  }

  reset(): void {
    this.#session = null;
    this.#total = 0;
    this.#parts = [];
    this.#received = 0;
    this.#done = null;
  }

  #finish(): void {
    const parts = this.#parts as string[];
    const size = parts[0]!.length;
    for (let i = 0; i < parts.length; i++) {
      const len = parts[i]!.length;
      const last = i === parts.length - 1;
      if (last ? len > size : len !== size) return this.#fail();
    }
    let bytes: Uint8Array;
    try {
      const body = parts.join('');
      bytes = b64urlDecode(body);
      if (bytes.length === 0 || bytes.length > MAX_PAYLOAD_BYTES || b64urlEncode(bytes) !== body) return this.#fail();
    } catch {
      return this.#fail();
    }
    if (sessionIdOf(bytes) !== this.#session) return this.#fail();
    this.#done = bytes;
  }

  #fail(): never {
    this.reset();
    throw new QrExchangeError('INTEGRITY_FAILED');
  }

  #result(): AddResult {
    const base = {
      progress: this.#total === 0 ? 0 : this.#received / this.#total,
      received: this.#received,
      total: this.#total,
    };
    return this.#done === null
      ? { ...base, complete: false }
      : { ...base, complete: true, payload: this.#done.slice() };
  }
}
