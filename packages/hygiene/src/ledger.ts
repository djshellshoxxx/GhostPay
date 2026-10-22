import { assertTestnetChain } from './testnet.js';
import { normAddress, type Address } from './addr.js';
import { fail } from './errors.js';

/** One ledger row: a destination on a chain and every source that was swept to it. */
export interface LedgerRow {
  readonly chainId: number;
  readonly destination: Address;
  readonly sources: readonly Address[];
  readonly index?: number;
}

/** Result of {@link DestLedger.canUse}. */
export type CanUse =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'DEST_HAS_OTHER_SOURCE' | 'DEST_IS_OWN_SOURCE' | 'DEST_IS_PROTOCOL';
    };

const MAX_U32 = 0xffff_ffff;
const ZERO = '0x0000000000000000000000000000000000000000';
const ROW_KEYS = new Set(['chainId', 'destination', 'sources', 'index']);

/**
 * Local destination ledger (HY-CON): one destination receives from one source address only.
 *
 * @remarks Pure in-memory model; storage (IndexedDB, keystore export) is injected by the app via
 * `toJSON` / `from`. Addresses are compared case-insensitively and stored lowercase.
 * Loss of the ledger lets an `external-*` user consolidate unknowingly; `self-derived` needs no state.
 * @security Contains addresses the user owns: it is private data linking sources to destinations. Keep it in the encrypted keystore export only.
 */
export class DestLedger {
  private readonly rows = new Map<
    string,
    { chainId: number; destination: Address; sources: Address[]; index?: number }
  >();
  private readonly protocol: ReadonlySet<Address>;

  /** @param protocolAddresses Router/relayer/token addresses that must never be a destination. */
  public constructor(protocolAddresses: readonly string[] = []) {
    this.protocol = new Set(protocolAddresses.map((a) => normAddress(a)));
  }

  private static key(chainId: number, dest: Address): string {
    return `${chainId}:${dest}`;
  }

  /** Next unused derivation index: max(recorded index) + 1, or 0. Never reuses an index. */
  public nextIndex(): number {
    let max = -1;
    for (const r of this.rows.values()) if (r.index !== undefined && r.index > max) max = r.index;
    if (max >= MAX_U32) fail('INVALID_LEDGER', 'index space exhausted');
    return max + 1;
  }

  /** Sources already swept to `destination` on `chainId` (empty if none). */
  public linkedSources(chainId: number, destination: string): readonly Address[] {
    assertTestnetChain(chainId);
    const r = this.rows.get(DestLedger.key(chainId, normAddress(destination)));
    return r === undefined ? [] : [...r.sources];
  }

  /**
   * May `source` be swept to `destination`?
   *
   * @returns `DEST_IS_PROTOCOL` (zero or protocol address), `DEST_IS_OWN_SOURCE` (destination equals the source or any recorded source on this chain: it would loop funds through a known address), `DEST_HAS_OTHER_SOURCE` (HY-CON-1), else ok. The same source again is ok (dust to the same destination).
   * @throws {HygieneError} `CHAIN_NOT_ALLOWED`, `INVALID_ADDRESS`.
   */
  public canUse(chainId: number, destination: string, source: string): CanUse {
    assertTestnetChain(chainId);
    const d = normAddress(destination);
    const s = normAddress(source);
    if (d === ZERO || this.protocol.has(d)) return { ok: false, reason: 'DEST_IS_PROTOCOL' };
    if (d === s) return { ok: false, reason: 'DEST_IS_OWN_SOURCE' };
    for (const r of this.rows.values()) {
      if (r.chainId === chainId && r.sources.includes(d)) return { ok: false, reason: 'DEST_IS_OWN_SOURCE' };
    }
    const row = this.rows.get(DestLedger.key(chainId, d));
    if (row !== undefined && row.sources.some((x) => x !== s))
      return { ok: false, reason: 'DEST_HAS_OTHER_SOURCE' };
    return { ok: true };
  }

  /**
   * Records a sweep. Refuses anything `canUse` refuses.
   * @throws {HygieneError} `DEST_REUSE` when refused; `INVALID_LEDGER` on a conflicting or duplicate index.
   */
  public record(chainId: number, destination: string, source: string, index?: number): void {
    const verdict = this.canUse(chainId, destination, source);
    if (!verdict.ok) fail('DEST_REUSE', verdict.reason);
    this.add(chainId, normAddress(destination), normAddress(source), index);
  }

  /**
   * Records a sweep to an already used destination (`external-reuse`, HY-DST-7). The caller MUST have
   * obtained the typed confirmation and shown {@link linkedSources} first. Protocol and own-source
   * destinations are still refused.
   * @throws {HygieneError} `DEST_REUSE`, `INVALID_LEDGER`.
   */
  public recordAcknowledgedReuse(chainId: number, destination: string, source: string): void {
    assertTestnetChain(chainId);
    const d = normAddress(destination);
    const s = normAddress(source);
    const v = this.canUse(chainId, d, s);
    if (!v.ok && v.reason !== 'DEST_HAS_OTHER_SOURCE') fail('DEST_REUSE', v.reason);
    this.add(chainId, d, s, undefined);
  }

  private add(chainId: number, d: Address, s: Address, index: number | undefined): void {
    if (index !== undefined) {
      if (!Number.isInteger(index) || index < 0 || index > MAX_U32) fail('INVALID_LEDGER', 'bad index');
      for (const r of this.rows.values()) {
        if (r.index === index && !(r.chainId === chainId && r.destination === d))
          fail('INVALID_LEDGER', 'index reused');
      }
    }
    const k = DestLedger.key(chainId, d);
    const row = this.rows.get(k);
    if (row === undefined) {
      const fresh: { chainId: number; destination: Address; sources: Address[]; index?: number } = {
        chainId,
        destination: d,
        sources: [s],
      };
      if (index !== undefined) fresh.index = index;
      this.rows.set(k, fresh);
      return;
    }
    if (index !== undefined && row.index !== undefined && row.index !== index)
      fail('INVALID_LEDGER', 'index conflict');
    if (index !== undefined && row.index === undefined) row.index = index;
    if (!row.sources.includes(s)) row.sources.push(s);
  }

  /** Plain rows for persistence (deep copy). */
  public toJSON(): LedgerRow[] {
    return [...this.rows.values()].map((r) => ({
      chainId: r.chainId,
      destination: r.destination,
      sources: [...r.sources],
      ...(r.index === undefined ? {} : { index: r.index }),
    }));
  }

  /**
   * Strict parse of untrusted persisted rows (HY-CON-4).
   * @throws {HygieneError} `INVALID_LEDGER` for non-array, unknown fields, bad addresses, bad chain,
   *   duplicate (chain, destination) rows, duplicate sources, duplicate or invalid indexes.
   */
  public static from(rows: unknown, protocolAddresses: readonly string[] = []): DestLedger {
    if (!Array.isArray(rows)) return fail('INVALID_LEDGER', 'rows must be an array');
    const ledger = new DestLedger(protocolAddresses);
    const seenIdx = new Set<number>();
    for (const raw of rows as unknown[]) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return fail('INVALID_LEDGER', 'row not an object');
      const o = raw as Record<string, unknown>;
      for (const k of Object.keys(o)) if (!ROW_KEYS.has(k)) return fail('INVALID_LEDGER', 'unknown field');
      const { chainId, destination, sources, index } = o;
      if (typeof chainId !== 'number') return fail('INVALID_LEDGER', 'bad chainId');
      try {
        assertTestnetChain(chainId);
      } catch {
        return fail('INVALID_LEDGER', 'bad chainId');
      }
      if (!Array.isArray(sources) || sources.length === 0) return fail('INVALID_LEDGER', 'bad sources');
      let d: Address;
      let srcs: Address[];
      try {
        d = normAddress(destination);
        srcs = (sources as unknown[]).map((x) => normAddress(x));
      } catch {
        return fail('INVALID_LEDGER', 'bad address');
      }
      if (new Set(srcs).size !== srcs.length) return fail('INVALID_LEDGER', 'duplicate source');
      if (index !== undefined) {
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MAX_U32) {
          return fail('INVALID_LEDGER', 'bad index');
        }
        if (seenIdx.has(index)) return fail('INVALID_LEDGER', 'duplicate index');
        seenIdx.add(index);
      }
      const k = DestLedger.key(chainId, d);
      if (ledger.rows.has(k)) return fail('INVALID_LEDGER', 'duplicate row');
      const row: { chainId: number; destination: Address; sources: Address[]; index?: number } = {
        chainId,
        destination: d,
        sources: srcs,
      };
      if (index !== undefined) row.index = index;
      ledger.rows.set(k, row);
    }
    return ledger;
  }
}
