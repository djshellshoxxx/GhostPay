import { decodeAnnouncementLog } from './abi.js';
import type { ChainHeader, ChainReader } from './rpc.js';
import type { BlockBatch, LogStore, StoredAnnouncement } from './store.js';
import { ANNOUNCEMENT_TOPIC, MAX_BLOCK_NUMBER, type Hex } from './wire.js';

/** Options for {@link Indexer}. */
export interface IndexerOptions {
  readonly store: LogStore;
  readonly reader: ChainReader;
  readonly chainId: number;
  /** ERC-5564 Announcer contract address (lowercase or checksummed). */
  readonly announcer: Hex;
  /** Blocks kept behind the RPC head before indexing, default 0. A lag makes the reference client's newest window fail closed. */
  readonly confirmations?: number;
  /** Blocks fetched and committed per step, default 200. */
  readonly batchBlocks?: number;
  /** Deepest reorg rolled back automatically, default 128 blocks. A deeper one halts the indexer. */
  readonly maxReorgDepth?: number;
}

/** Outcome of one {@link Indexer.syncOnce} step. */
export type SyncResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'advanced'; readonly from: bigint; readonly to: bigint }
  | { readonly kind: 'rolledBack'; readonly ancestor: bigint }
  /** The chain moved while a batch was being read; nothing was written. */
  | { readonly kind: 'retry' }
  | { readonly kind: 'halted' };

/** Fixed-text ingestion failure. */
export class IngestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

/** Aggregate ingestion counters (no timestamps). */
export interface IngestCounters {
  blocks: number;
  announcements: number;
  omitted: number;
  rollbacks: number;
  retries: number;
  errors: number;
}

/**
 * Follows one chain's ERC-5564 Announcer logs into a {@link LogStore}.
 *
 * Reorg handling: before advancing, the stored tip is compared with the chain's block at the same height. If they
 * differ (or the chain is now shorter), the ingester walks back until a stored block hash equals the chain's hash at
 * that height (the common ancestor), deletes everything above it in one transaction, and continues from there. When no
 * common ancestor exists within `maxReorgDepth`, the store is marked halted and the service answers `HALTED`.
 * New blocks are written only after their parent links and every log's block hash match the headers read for the
 * batch; any disagreement discards the batch (`retry`).
 *
 * @security Reads public chain data only. Never receives or stores client requests.
 */
export class Indexer {
  private readonly store: LogStore;
  private readonly reader: ChainReader;
  private readonly chainIdValue: number;
  private readonly announcer: Hex;
  private readonly confirmations: bigint;
  private readonly batch: bigint;
  private readonly maxDepth: bigint;
  private readonly stats: IngestCounters = { blocks: 0, announcements: 0, omitted: 0, rollbacks: 0, retries: 0, errors: 0 };

  public constructor(o: IndexerOptions) {
    const int = (v: number, lo: number, hi: number, name: string): bigint => {
      if (!Number.isSafeInteger(v) || v < lo || v > hi) throw new RangeError(`${name} out of range`);
      return BigInt(v);
    };
    this.store = o.store;
    this.reader = o.reader;
    this.chainIdValue = o.chainId;
    this.announcer = o.announcer.toLowerCase() as Hex;
    this.confirmations = int(o.confirmations ?? 0, 0, 10_000, 'confirmations');
    this.batch = int(o.batchBlocks ?? 200, 1, 10_000, 'batchBlocks');
    this.maxDepth = int(o.maxReorgDepth ?? 128, 1, 100_000, 'maxReorgDepth');
  }

  /** Copy of the aggregate counters. */
  public counters(): IngestCounters {
    return { ...this.stats };
  }

  /** Refuses an upstream RPC that serves a different chain than the store. */
  public async verifyChain(signal?: AbortSignal): Promise<void> {
    if ((await this.reader.chainId(signal)) !== this.chainIdValue) throw new IngestError('rpc chain id does not match the configured chain');
  }

  /** One step: reorg check, then at most `batchBlocks` new blocks. */
  public async syncOnce(signal?: AbortSignal): Promise<SyncResult> {
    if (this.store.halted) return { kind: 'halted' };
    const tip = this.store.tip();
    if (tip !== undefined) {
      const remote = await this.reader.header(tip.number, signal);
      if (remote?.hash !== tip.hash) return this.rollback(tip.number, signal);
    }
    const remoteHead = await this.reader.blockNumber(signal);
    const head = remoteHead - this.confirmations;
    const start = tip === undefined ? this.store.indexedFrom : tip.number + 1n;
    if (head < start) return { kind: 'idle' };
    let end = start + this.batch - 1n;
    if (end > head) end = head;
    if (end > MAX_BLOCK_NUMBER) throw new IngestError('block number out of range');

    const headers: ChainHeader[] = [];
    for (let n = start; n <= end; n++) {
      const h = await this.reader.header(n, signal);
      if (h === undefined) return this.retry();
      const parent = headers.length === 0 ? tip : headers[headers.length - 1];
      if (parent !== undefined && h.parentHash !== parent.hash) return this.retry();
      headers.push(h);
    }
    const byNumber = new Map<bigint, ChainHeader>(headers.map((h) => [h.number, h]));
    const logs = await this.reader.announcerLogs(start, end, this.announcer, signal);

    const anns = new Map<bigint, StoredAnnouncement[]>();
    const omitted = new Map<bigint, number>();
    const seen = new Set<string>();
    for (const log of logs) {
      const h = byNumber.get(log.blockNumber);
      if (h === undefined || log.blockHash !== h.hash || log.removed) return this.retry();
      if (log.address !== this.announcer || log.topics[0] !== ANNOUNCEMENT_TOPIC) throw new IngestError('rpc returned a log outside the filter');
      const key = `${log.blockNumber.toString()}:${String(log.logIndex)}`;
      if (seen.has(key)) throw new IngestError('rpc returned a duplicate log');
      seen.add(key);
      const d = decodeAnnouncementLog(log);
      if (d === undefined) {
        omitted.set(log.blockNumber, (omitted.get(log.blockNumber) ?? 0) + 1);
        continue;
      }
      const list = anns.get(log.blockNumber) ?? [];
      list.push({ ...d, blockNumber: log.blockNumber, blockHash: log.blockHash, logIndex: log.logIndex, transactionHash: log.transactionHash });
      anns.set(log.blockNumber, list);
    }
    const blocks: BlockBatch[] = headers.map((h) => ({
      header: { ...h, omitted: omitted.get(h.number) ?? 0 },
      announcements: (anns.get(h.number) ?? []).sort((a, b) => a.logIndex - b.logIndex),
    }));
    this.store.appendBlocks(blocks);
    this.stats.blocks += blocks.length;
    for (const b of blocks) {
      this.stats.announcements += b.announcements.length;
      this.stats.omitted += b.header.omitted;
    }
    return { kind: 'advanced', from: start, to: end };
  }

  private retry(): SyncResult {
    this.stats.retries++;
    return { kind: 'retry' };
  }

  private async rollback(tipNumber: bigint, signal?: AbortSignal): Promise<SyncResult> {
    const floor = this.store.indexedFrom;
    for (let k = tipNumber - 1n; k >= floor; k--) {
      if (tipNumber - k > this.maxDepth) return this.halt();
      const local = this.store.header(k);
      const remote = await this.reader.header(k, signal);
      if (local !== undefined && remote?.hash === local.hash) return this.rolledBack(k);
    }
    // Every stored block diverged: the index restarts from its first block if that is within the depth limit.
    if (tipNumber - (floor - 1n) > this.maxDepth) return this.halt();
    return this.rolledBack(floor - 1n);
  }

  private rolledBack(ancestor: bigint): SyncResult {
    this.store.rollbackTo(ancestor);
    this.stats.rollbacks++;
    return { kind: 'rolledBack', ancestor };
  }

  private halt(): SyncResult {
    this.store.halt();
    return { kind: 'halted' };
  }

  /**
   * Runs {@link syncOnce} until `signal` aborts or the store halts. Sleeps `intervalMs` when idle, after a `retry` and
   * after an error; `onError` receives the error (it carries fixed text only).
   */
  public async run(o: { readonly intervalMs: number; readonly signal: AbortSignal; readonly onError?: (e: unknown) => void }): Promise<void> {
    while (!o.signal.aborted) {
      let pause: boolean;
      try {
        const r = await this.syncOnce(o.signal);
        if (r.kind === 'halted') return;
        pause = r.kind === 'idle' || r.kind === 'retry';
      } catch (e) {
        if (o.signal.aborted) return;
        this.stats.errors++;
        o.onError?.(e);
        pause = true;
      }
      if (pause) await sleep(o.intervalMs, o.signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done(): void {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}
