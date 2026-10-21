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
}

function toWire(a: ScannedAnnouncement): WireLog {
  return { id: a.id, schemeId: a.schemeId, stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata };
}

/**
 * Network access happens here (via chain-adapters), never in the worker. The worker receives public logs and, once,
 * the viewing key. Cancelling via `signal` stops fetching, tells the worker to stop, and terminates it.
 */
export async function runScan(p: ScanParams): Promise<{ readonly matches: readonly ScanMatch[]; readonly cursor: ScanCursor; readonly scanned: number }> {
  const worker = p.createWorker();
  const pending = new Map<number, (m: FromWorker) => void>();
  let ready: ((m: FromWorker) => void) | undefined;
  let failed: ((e: Error) => void) | undefined;
  worker.onmessage = (e): void => {
    const m = e.data;
    if (m.type === 'ready' || m.type === 'error' || m.type === 'ended') ready?.(m);
    else if (m.type === 'matches') pending.get(m.batchId)?.(m);
  };
  worker.onerror = (): void => {
    failed?.(new UserFacingError('The scanner worker failed.'));
  };
  const wait = (register: (resolve: (m: FromWorker) => void) => void): Promise<FromWorker> =>
    new Promise<FromWorker>((resolve, reject) => {
      failed = reject;
      register(resolve);
    });

  const all: ScanMatch[] = [];
  const byId = new Map<string, ScannedAnnouncement>();
  let cursor = p.cursor;
  let scanned = 0;
  let skipped = 0;
  let batchId = 0;
  try {
    const started = await wait((resolve) => {
      ready = resolve;
      worker.postMessage({ type: 'start', viewingKey: p.viewingKey, spendingPublicKey: p.spendingPublicKeyHex });
    });
    if (started.type !== 'ready') throw new UserFacingError('The scanner rejected the keys.');
    const maxPages = p.maxPages ?? 10_000;
    for (let page = 0; page < maxPages; page++) {
      if (p.signal.aborted) break;
      const res = await fetchAnnouncements({ chain: p.chain, client: p.client, announcer: p.manifest.announcer, cursor });
      if (p.signal.aborted) break;
      skipped += res.skipped;
      for (const a of res.announcements) byId.set(a.id, a);
      const id = ++batchId;
      const reply = await wait((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ type: 'batch', batchId: id, logs: res.announcements.map(toWire) });
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
      p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: !res.truncated });
      if (!res.truncated) break;
    }
  } finally {
    if (p.signal.aborted) worker.postMessage({ type: 'cancel' });
    worker.postMessage({ type: 'end' });
    worker.terminate();
    zeroizeBytes(p.viewingKey);
  }
  return { matches: all, cursor, scanned };
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
