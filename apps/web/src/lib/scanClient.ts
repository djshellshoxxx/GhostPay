import {
  fetchAnnouncements,
  type Address,
  type ChainConfig,
  type DeploymentManifest,
  type RpcClient,
  type ScanCursor,
  type ScannedAnnouncement,
} from '@ghostpay/chain-adapters';
import { parseMetadata, type ParsedMetadata } from '@ghostpay/core-crypto';
import { UserFacingError } from './errors';
import type { FromWorker, ToWorker, WireLog } from './scannerCore';

export interface ScanWorkerLike {
  onmessage: ((e: { readonly data: FromWorker }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: ToWorker): void;
  terminate(): void;
}

export interface ScanMatch {
  /** Chain this match was found on. A match is only meaningful together with its chain; never infer it from UI state. */
  readonly chainId: number;
  readonly announcement: ScannedAnnouncement;
  readonly stealthAddress: Address;
  readonly metadata: ParsedMetadata | undefined;
  readonly viaRouter: boolean;
}

export interface ScanProgress {
  readonly nextBlock: bigint;
  readonly scanned: number;
  readonly matches: number;
  readonly skipped: number;
  readonly caughtUp: boolean;
  /** Number of chain reorganisations seen so far in this scan (matches at or above the rollback point were retracted). */
  readonly reorgs?: number;
}

/** A reorg reported by chain-adapters: results with `blockNumber >= rolledBackTo` were dropped and are being rescanned. */
export interface ScanReorg {
  readonly rolledBackTo: bigint;
  readonly retracted: readonly ScanMatch[];
}

export interface CheckpointStore {
  load(chainId: number): ScanCursor | undefined;
  save(chainId: number, cursor: ScanCursor): void;
  clear(chainId: number): void;
}

export interface ScanParams {
  readonly chain: ChainConfig;
  readonly manifest: DeploymentManifest;
  readonly client: RpcClient;
  readonly cursor: ScanCursor;
  readonly spendingPublicKeyHex: string;
  /** Raw viewing key bytes; consumed (zeroized by the worker) and sent nowhere else. */
  readonly viewingKey: Uint8Array;
  readonly createWorker: () => ScanWorkerLike;
  readonly signal: AbortSignal;
  readonly checkpoints?: CheckpointStore;
  readonly onProgress?: (p: ScanProgress) => void;
  readonly onMatch?: (m: ScanMatch) => void;
  readonly maxPages?: number;
  /** Called when a reorg is detected; the retracted matches are already removed from the result. */
  readonly onReorg?: (r: ScanReorg) => void;
  /** Max silence from the worker (any message resets it) before the scan fails instead of hanging. Default 60 000 ms. */
  readonly workerTimeoutMs?: number;
}

export const DEFAULT_WORKER_TIMEOUT_MS = 60_000;

/** Thrown internally when the scan is cancelled while waiting; never surfaces to callers. */
class ScanCancelled extends Error {}

function toWire(a: ScannedAnnouncement): WireLog {
  return { id: a.id, schemeId: a.schemeId, stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata };
}

/**
 * Network access happens here (via chain-adapters), never in the worker. The worker receives public logs and, once,
 * the viewing key. Cancelling via `signal` stops fetching, tells the worker to stop, and terminates it; cancel also
 * unblocks any pending worker or RPC wait immediately. A worker that stays silent for `workerTimeoutMs` fails the scan.
 *
 * Reorgs: chain-adapters compares the stored block hash on every page. On a mismatch it rewinds the cursor by
 * `chain.finalityDepth` and reports `reorg.rolledBackTo`; matches at or above that block are retracted here and
 * reported through `onReorg`, then rescanned. LIMIT: a reorg deeper than `finalityDepth` rewinds too little, so
 * announcements below `rolledBackTo` that no longer exist on the canonical chain are NOT retracted. Treat payments
 * as final only once they are older than the chain's finality depth, and verify the balance before relying on one.
 */
export async function runScan(p: ScanParams): Promise<{ readonly matches: readonly ScanMatch[]; readonly cursor: ScanCursor; readonly scanned: number; readonly reorgs: number }> {
  let worker: ScanWorkerLike | undefined;
  const pending = new Map<number, (m: FromWorker) => void>();
  let ready: ((m: FromWorker) => void) | undefined;
  let failed: ((e: Error) => void) | undefined;
  let touch: (() => void) | undefined;
  const timeoutMs = p.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
  const wait = (register: (resolve: (m: FromWorker) => void) => void): Promise<FromWorker> =>
    new Promise<FromWorker>((resolve, reject) => {
      if (p.signal.aborted) {
        reject(new ScanCancelled());
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        p.signal.removeEventListener('abort', onAbort);
        touch = undefined;
      };
      const onAbort = (): void => {
        done();
        reject(new ScanCancelled());
      };
      const arm = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          done();
          reject(new UserFacingError('The scanner worker stopped responding. The scan was stopped; start it again.'));
        }, timeoutMs);
      };
      touch = arm;
      failed = (e) => {
        done();
        reject(e);
      };
      arm();
      p.signal.addEventListener('abort', onAbort);
      register((m) => {
        done();
        resolve(m);
      });
    });
  /** Lets Cancel interrupt a pending RPC fetch; the underlying request is abandoned, not awaited. */
  const abortable = <T,>(work: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(new ScanCancelled());
      };
      p.signal.addEventListener('abort', onAbort, { once: true });
      work.then(
        (v) => {
          p.signal.removeEventListener('abort', onAbort);
          resolve(v);
        },
        (e: unknown) => {
          p.signal.removeEventListener('abort', onAbort);
          reject(e instanceof Error ? e : new Error('scan failed'));
        },
      );
    });

  const all: ScanMatch[] = [];
  const byId = new Map<string, ScannedAnnouncement>();
  let cursor = p.cursor;
  let scanned = 0;
  let skipped = 0;
  let reorgs = 0;
  let batchId = 0;
  try {
    const w = p.createWorker();
    worker = w;
    w.onmessage = (e): void => {
      const m = e.data;
      touch?.();
      if (m.type === 'matches') pending.get(m.batchId)?.(m);
      else if (m.type === 'error' && pending.size > 0) failed?.(new UserFacingError('The scanner worker reported an error.'));
      else if (m.type === 'ready' || m.type === 'error' || m.type === 'ended') ready?.(m);
    };
    w.onerror = (): void => {
      failed?.(new UserFacingError('The scanner worker failed.'));
    };
    try {
      const started = await wait((resolve) => {
        ready = resolve;
        w.postMessage({ type: 'start', viewingKey: p.viewingKey, spendingPublicKey: p.spendingPublicKeyHex });
      });
      if (started.type !== 'ready') throw new UserFacingError('The scanner rejected the keys.');
      const maxPages = p.maxPages ?? 10_000;
      for (let page = 0; page < maxPages; page++) {
        if (p.signal.aborted) break;
        const res = await abortable(fetchAnnouncements({ chain: p.chain, client: p.client, announcer: p.manifest.announcer, cursor }));
        if (p.signal.aborted) break;
        if (res.reorg !== undefined) {
          const at = res.reorg.rolledBackTo;
          const retracted = all.filter((m) => m.announcement.blockNumber >= at);
          if (retracted.length > 0) {
            const keep = all.filter((m) => m.announcement.blockNumber < at);
            all.length = 0;
            all.push(...keep);
          }
          reorgs++;
          p.onReorg?.({ rolledBackTo: at, retracted });
        }
        skipped += res.skipped;
        for (const a of res.announcements) byId.set(a.id, a);
        const id = ++batchId;
        const reply = await wait((resolve) => {
          pending.set(id, resolve);
          w.postMessage({ type: 'batch', batchId: id, logs: res.announcements.map(toWire) });
        });
        pending.delete(id);
        if (reply.type !== 'matches') throw new UserFacingError('The scanner returned an unexpected reply.');
        scanned += res.announcements.length;
        for (const m of reply.matches) {
          const announcement = byId.get(m.id);
          if (announcement === undefined) continue;
          let metadata: ParsedMetadata | undefined;
          try {
            metadata = parseMetadata(announcement.metadata);
          } catch {
            metadata = undefined;
          }
          const match: ScanMatch = {
            chainId: p.chain.chainId,
            announcement,
            stealthAddress: m.stealthAddress as Address,
            metadata,
            viaRouter: announcement.caller.toLowerCase() === p.manifest.router.toLowerCase(),
          };
          all.push(match);
          p.onMatch?.(match);
        }
        byId.clear();
        cursor = res.cursor;
        p.checkpoints?.save(p.chain.chainId, cursor);
        p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: !res.truncated, reorgs });
        if (!res.truncated) break;
      }
    } catch (e) {
      if (!(e instanceof ScanCancelled)) throw e;
    }
  } finally {
    if (worker !== undefined) {
      // A dead or stalled worker must never stop us from terminating it and wiping the key copy.
      try {
        if (p.signal.aborted) worker.postMessage({ type: 'cancel' });
        worker.postMessage({ type: 'end' });
      } catch {
        /* worker already gone */
      }
      worker.terminate();
    }
    zeroizeBytes(p.viewingKey);
  }
  return { matches: all, cursor, scanned, reorgs };
}

function zeroizeBytes(b: Uint8Array): void {
  b.fill(0);
}

const CP_PREFIX = 'ghostpay.scan.checkpoint.v1.';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Public scan cursor persistence (block number and hash only; no keys, no matches). Tolerates storage failures. */
export function localCheckpointStore(storage: StorageLike | undefined): CheckpointStore {
  return {
    load(chainId) {
      try {
        const text = storage?.getItem(CP_PREFIX + String(chainId));
        if (text === null || text === undefined) return undefined;
        const o = JSON.parse(text) as { nextBlock?: unknown; last?: { number?: unknown; hash?: unknown } };
        if (typeof o.nextBlock !== 'string' || !/^\d{1,20}$/.test(o.nextBlock)) return undefined;
        const last = o.last;
        if (last !== undefined && typeof last.number === 'string' && /^\d{1,20}$/.test(last.number) && typeof last.hash === 'string' && /^0x[0-9a-f]{64}$/.test(last.hash)) {
          return { nextBlock: BigInt(o.nextBlock), last: { number: BigInt(last.number), hash: last.hash as `0x${string}` } };
        }
        return { nextBlock: BigInt(o.nextBlock) };
      } catch {
        return undefined;
      }
    },
    save(chainId, cursor) {
      try {
        const body = { nextBlock: cursor.nextBlock.toString(), ...(cursor.last === undefined ? {} : { last: { number: cursor.last.number.toString(), hash: cursor.last.hash } }) };
        storage?.setItem(CP_PREFIX + String(chainId), JSON.stringify(body));
      } catch {
        /* checkpoints are an optimisation */
      }
    },
    clear(chainId) {
      try {
        storage?.removeItem(CP_PREFIX + String(chainId));
      } catch {
        /* ignore */
      }
    },
  };
}
