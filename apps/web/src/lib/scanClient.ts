import {
  compareProviders,
  fetchAnnouncements,
  verifyReceipt,
  type Address,
  type ChainConfig,
  type DeploymentManifest,
  type RpcClient,
  type ScanCursor,
  type ProviderDiscrepancy,
  type ReceiptStatus,
  type ScannedAnnouncement,
} from '@ghostpay/chain-adapters';
import { parseMetadata, type ParsedMetadata } from '@ghostpay/core-crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';
import type { FromWorker, ToWorker, WireLog } from './scannerCore';

export interface ScanWorkerLike {
  onmessage: ((e: { readonly data: FromWorker }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface ScanMatch {
  /** Chain the match was found on; consumers must not relabel it with another chain's tokens (S3-15). */
  readonly chainId: number;
  readonly announcement: ScannedAnnouncement;
  readonly stealthAddress: Address;
  readonly metadata: ParsedMetadata | undefined;
  readonly viaRouter: boolean;
  /**
   * `verified`: router-attested or backed by the stealth address balance, and `finalityDepth` deep.
   * `claimed`: metadata only (a direct announcement anyone can forge): do not treat the amount as received.
   * `pending`: not yet final.
   */
  readonly receipt: ReceiptStatus;
}

export interface ScanProgress {
  readonly nextBlock: bigint;
  readonly scanned: number;
  readonly matches: number;
  readonly skipped: number;
  readonly caughtUp: boolean;
  /** Pages where a second provider disagreed (checkpoint withheld for those pages). */
  readonly discrepancies?: number;
}

/**
 * Identifies the seller keys a checkpoint belongs to: `sha256(spendingPub|viewingPub)` as hex. A checkpoint is only valid for
 * the keys (and chain) it was written for, so a key rotation or a second profile never inherits another profile's position.
 */
export function checkpointKeyId(spendingPublicKeyHex: string, viewingPublicKeyHex: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${spendingPublicKeyHex.toLowerCase()}|${viewingPublicKeyHex.toLowerCase()}`)));
}

export interface CheckpointStore {
  load(chainId: number, keyId: string): ScanCursor | undefined;
  save(chainId: number, keyId: string, cursor: ScanCursor): void;
  clear(chainId: number, keyId: string): void;
}

export interface ScanParams {
  readonly chain: ChainConfig;
  readonly manifest: DeploymentManifest;
  readonly client: RpcClient;
  readonly cursor: ScanCursor;
  readonly spendingPublicKeyHex: string;
  /** {@link checkpointKeyId} of the keys being scanned; checkpoints are stored under it. */
  readonly keyId: string;
  /** Raw viewing key bytes; consumed (zeroized by the worker) and sent nowhere else. */
  readonly viewingKey: Uint8Array;
  readonly createWorker: () => ScanWorkerLike;
  readonly signal: AbortSignal;
  readonly checkpoints?: CheckpointStore;
  readonly onProgress?: (p: ScanProgress) => void;
  readonly onMatch?: (m: ScanMatch) => void;
  /** A reorg was detected: matches found in blocks >= `rolledBackTo` were dropped from the result and must be dropped by the caller. */
  readonly onReorg?: (rolledBackTo: bigint) => void;
  readonly maxPages?: number;
  /** A worker reply that takes longer than this terminates the scan (default 60 s; S3-15). */
  readonly replyTimeoutMs?: number;
  /** Independent second provider on the same chain; compared at every checkpoint. */
  readonly secondaryClient?: RpcClient;
  readonly onDiscrepancy?: (d: readonly ProviderDiscrepancy[]) => void;
}

function toWire(a: ScannedAnnouncement): WireLog {
  return { id: a.id, schemeId: a.schemeId, stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata };
}

/**
 * Network access happens here (via chain-adapters), never in the worker. The worker receives public logs and, once,
 * the viewing key. Cancelling via `signal` stops fetching, tells the worker to stop, and terminates it.
 */
export async function runScan(p: ScanParams): Promise<{ readonly matches: readonly ScanMatch[]; readonly cursor: ScanCursor; readonly scanned: number; readonly discrepancies: readonly ProviderDiscrepancy[] }> {
  let worker: ScanWorkerLike | undefined;
  const pending = new Map<number, (m: FromWorker) => void>();
  let ready: ((m: FromWorker) => void) | undefined;
  let failed: ((e: Error) => void) | undefined;
  const timeoutMs = p.replyTimeoutMs ?? 60_000;
  const ABORTED = new Error('scan cancelled');
  // Settles on a reply, a worker error, the reply timeout, or Cancel: a hung worker can never block the caller.
  const wait = (register: (resolve: (m: FromWorker) => void) => void): Promise<FromWorker> =>
    new Promise<FromWorker>((resolve, reject) => {
      const done = (fn: () => void): void => {
        clearTimeout(timer);
        p.signal.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = (): void => done(() => reject(ABORTED));
      const timer = setTimeout(() => done(() => reject(new UserFacingError('The scanner did not answer in time and was stopped.'))), timeoutMs);
      p.signal.addEventListener('abort', onAbort, { once: true });
      failed = (e) => done(() => reject(e));
      register((m) => done(() => resolve(m)));
      if (p.signal.aborted) onAbort();
    });

  const all: ScanMatch[] = [];
  const byId = new Map<string, ScannedAnnouncement>();
  let cursor = p.cursor;
  let scanned = 0;
  let skipped = 0;
  const discrepancies: ProviderDiscrepancy[] = [];
  let batchId = 0;
  try {
    // Created inside the try so a throwing factory still reaches the key wipe below (S3-15).
    const w = p.createWorker();
    worker = w;
    w.onmessage = (e): void => {
      const m = e.data;
      if (m.type === 'ready' || m.type === 'error' || m.type === 'ended') ready?.(m);
      else if (m.type === 'matches') pending.get(m.batchId)?.(m);
    };
    w.onerror = (): void => {
      failed?.(new UserFacingError('The scanner worker failed.'));
    };
    const started = await wait((resolve) => {
      ready = resolve;
      w.postMessage({ type: 'start', viewingKey: p.viewingKey, spendingPublicKey: p.spendingPublicKeyHex });
    });
    if (started.type !== 'ready') throw new UserFacingError('The scanner rejected the keys.');
    const maxPages = p.maxPages ?? 10_000;
    for (let page = 0; page < maxPages; page++) {
      if (p.signal.aborted) break;
      const res = await fetchAnnouncements({ chain: p.chain, client: p.client, announcer: p.manifest.announcer, cursor });
      if (p.signal.aborted) break;
      skipped += res.skipped;
      const pageFrom = res.reorg?.rolledBackTo ?? cursor.nextBlock;
      if (res.reorg !== undefined) {
        // Matches from orphaned blocks must not stay listed; the replay below re-finds the ones that survived.
        const keep = all.filter((m) => m.announcement.blockNumber < res.reorg!.rolledBackTo);
        all.length = 0;
        all.push(...keep);
        p.onReorg?.(res.reorg.rolledBackTo);
      }
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
        const viaRouter = announcement.caller.toLowerCase() === p.manifest.router.toLowerCase();
        // Without readable metadata nothing is claimed, so nothing can be verified.
        const receipt: ReceiptStatus =
          metadata === undefined
            ? 'claimed'
            : await verifyReceipt(p.client, p.chain, {
                stealthAddress: m.stealthAddress as Address,
                native: metadata.kind === 'native',
                token: metadata.token,
                amount: metadata.netAmount,
                blockNumber: announcement.blockNumber,
                viaRouter,
              });
        const match: ScanMatch = { chainId: p.chain.chainId, announcement, stealthAddress: m.stealthAddress as Address, metadata, viaRouter, receipt };
        if (all.some((x) => x.announcement.id === announcement.id)) continue;
        all.push(match);
        p.onMatch?.(match);
      }
      byId.clear();
      let disagree = false;
      if (p.secondaryClient !== undefined && res.cursor.last !== undefined) {
        const cmp = await compareProviders({
          chain: p.chain,
          secondary: p.secondaryClient,
          announcer: p.manifest.announcer,
          fromBlock: pageFrom,
          toBlock: res.cursor.last.number,
          primaryAnnouncements: res.announcements,
          primarySkipped: res.skipped,
          primaryBlockHash: res.cursor.last.hash,
        });
        if (cmp.discrepancies.length > 0) {
          disagree = true;
          discrepancies.push(...cmp.discrepancies);
          p.onDiscrepancy?.(cmp.discrepancies);
        }
      }
      cursor = res.cursor;
      // A page the providers disagree on must be re-scanned: do not persist a checkpoint past it.
      if (!disagree && p.checkpoints !== undefined) {
        const saved = await persistable(p, cursor);
        if (saved !== undefined) p.checkpoints.save(p.chain.chainId, p.keyId, saved);
      }
      p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: !res.truncated, discrepancies: discrepancies.length });
      if (!res.truncated) break;
    }
  } catch (e) {
    // Cancel while a reply was pending: return what was found so far.
    if (e !== ABORTED) throw e;
  } finally {
    try {
      if (worker !== undefined) {
        if (p.signal.aborted) worker.postMessage({ type: 'cancel' });
        worker.postMessage({ type: 'end' });
        worker.terminate();
      }
    } finally {
      zeroizeBytes(p.viewingKey);
    }
  }
  return { matches: all, cursor, scanned, discrepancies };
}

/**
 * The cursor that is safe to persist: `finalityDepth` blocks behind the fetched position. Matches seen in that tail were only
 * `pending` and live in memory alone, so the next session re-scans (and re-verifies) the tail instead of skipping it.
 * Never moves behind where this run started.
 */
async function persistable(p: ScanParams, cursor: ScanCursor): Promise<ScanCursor | undefined> {
  const depth = BigInt(p.chain.finalityDepth);
  const floor = p.cursor.nextBlock;
  let next = cursor.nextBlock > depth ? cursor.nextBlock - depth : 0n;
  if (next < floor) next = floor;
  if (next >= cursor.nextBlock) return cursor;
  if (next === 0n) return { nextBlock: 0n };
  // Keep reorg detection for the stored position: bind it to the hash of the block just before it.
  const ref = await p.client.getBlock(next - 1n);
  return ref === null ? { nextBlock: next } : { nextBlock: next, last: { number: next - 1n, hash: ref.hash } };
}

function zeroizeBytes(b: Uint8Array): void {
  b.fill(0);
}

// v2: bound to the key set. v1 entries (chain only) are ignored: they cannot be attributed to a key.
const CP_PREFIX = 'ghostpay.scan.checkpoint.v2.';
const KEY_ID = /^[0-9a-f]{64}$/;
const slot = (chainId: number, keyId: string): string | undefined => (KEY_ID.test(keyId) ? `${CP_PREFIX}${String(chainId)}.${keyId}` : undefined);

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Public scan cursor persistence (block number and hash only; no keys, no matches). Tolerates storage failures. */
export function localCheckpointStore(storage: StorageLike | undefined): CheckpointStore {
  return {
    load(chainId, keyId) {
      try {
        const k = slot(chainId, keyId);
        const text = k === undefined ? undefined : storage?.getItem(k);
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
    save(chainId, keyId, cursor) {
      try {
        const k = slot(chainId, keyId);
        if (k === undefined) return;
        const body = { nextBlock: cursor.nextBlock.toString(), ...(cursor.last === undefined ? {} : { last: { number: cursor.last.number.toString(), hash: cursor.last.hash } }) };
        storage?.setItem(k, JSON.stringify(body));
      } catch {
        /* checkpoints are an optimisation */
      }
    },
    clear(chainId, keyId) {
      try {
        const k = slot(chainId, keyId);
        if (k !== undefined) storage?.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}
