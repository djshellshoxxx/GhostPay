import {
  CHAIN_PARAMS,
  HeaderChain,
  parseHeader,
  SilentPaymentError,
  syncHeaderChainFromSources,
  type HeaderCheckpoint,
  type HeaderSource,
  type SerializedHeaderChain,
} from '@ghostpay/btc-silent-payments';
import type { EsploraClient } from './esplora';
import type { BtcNetworkId, BtcNetworkInfo } from './network';
import type { FoundPayment, ScanResult } from './scan';

/**
 * Header sync for the Bitcoin view: a {@link HeaderChain} anchored at the pinned genesis block of the selected test
 * network, filled from the configured Esplora server(s), validated on this device (linkage, proof of work, the
 * difficulty rules, timestamps, versions, most-work selection) and saved per network so the next check resumes.
 *
 * This is header-chain validation against what the server(s) claim is the best chain. It is NOT SPV and NOT full
 * validation: nothing inside blocks is validated beyond what `esplora.ts` binds to a header, and a server that
 * withholds a heavier chain (or eclipses this device) is not detected. Proof of work is cheap on test networks.
 */

/**
 * 80-byte genesis headers. Each hashes to the `genesisHash` pinned in `network.ts` (checked by
 * `HeaderChain.create` and by the tests), which was verified against Bitcoin Core `chainparams.cpp`.
 */
export const GENESIS_HEADERS: Readonly<Record<Exclude<BtcNetworkId, 'mainnet'>, string>> = {
  testnet4:
    '0100000000000000000000000000000000000000000000000000000000000000000000004e7b2b9128fe0291db0693af2ae418b767e657cd407e80cb1434221eaea7a07a046f3566ffff001dbb0c7817',
  signet:
    '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a008f4d5fae77031e8ad22203',
  regtest:
    '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4adae5494dffff7f2002000000',
};

/** Headers validated and saved per round of {@link syncHeaders} (two difficulty periods). */
export const HEADERS_PER_ROUND = 4032;
/** Header requests in flight at once. */
const PARALLEL = 4;
/** Headers per `/blocks/:height` request (Esplora returns 10). */
const SUMMARY_SPAN = 10;

function bad(): never {
  throw new SilentPaymentError('INVALID_RESPONSE');
}

/** The pinned starting header of `net`. Mainnet (disabled) has none. */
export function genesisCheckpoint(net: BtcNetworkInfo): HeaderCheckpoint {
  if (!net.enabled || net.id === 'mainnet') throw new SilentPaymentError('NETWORK_MISMATCH');
  return { height: 0, hash: net.genesisHash, headerHex: GENESIS_HEADERS[net.id] };
}

/** Runs `task` over `items` with at most {@link PARALLEL} in flight; the first failure stops new tasks and is thrown. */
async function pool<T>(items: readonly T[], task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const item = items[next++] as T;
      try {
        await task(item);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
}

/**
 * {@link HeaderSource} on an Esplora server. Uses `GET /blocks/:height` (10 headers per request); a server without
 * it (HTTP error) is read one header at a time with `GET /block-height/:h` and `GET /block/:hash/header`.
 * Untrusted: the header chain validates everything returned. The server learns which header ranges are read.
 */
export class EsploraHeaderSource implements HeaderSource {
  private perHeight = false;

  public constructor(private readonly client: EsploraClient) {}

  public getTipHeight(signal?: AbortSignal): Promise<number> {
    return this.client.tipHeight(signal);
  }

  public async getHeaders(fromHeight: number, count: number, signal?: AbortSignal): Promise<readonly string[]> {
    if (!this.perHeight) {
      try {
        return await this.viaSummaries(fromHeight, count, signal);
      } catch (e) {
        if (!(e instanceof SilentPaymentError) || e.code !== 'TRANSPORT_FAILURE') throw e;
        this.perHeight = true;
      }
    }
    return this.viaHeights(fromHeight, count, signal);
  }

  private async viaSummaries(from: number, count: number, signal?: AbortSignal): Promise<string[]> {
    const out = new Array<string>(count);
    const starts: number[] = [];
    for (let s = from; s < from + count; s += SUMMARY_SPAN) starts.push(s);
    await pool(starts, async (s) => {
      const top = Math.min(s + SUMMARY_SPAN - 1, from + count - 1);
      const got = await this.client.headersBelow(top, signal);
      for (let h = s; h <= top; h++) out[h - from] = got.get(h) ?? bad();
    });
    return out;
  }

  private async viaHeights(from: number, count: number, signal?: AbortSignal): Promise<string[]> {
    const out = new Array<string>(count);
    await pool(Array.from({ length: count }, (_, i) => from + i), async (h) => {
      const hash = await this.client.blockHash(h, signal);
      const hex = await this.client.blockHeader(hash, signal);
      if (parseHeader(hex).hash !== hash) bad();
      out[h - from] = hex;
    });
    return out;
  }
}

/**
 * Storage of one network's serialized header chain (the shape of the package's `ScanStateStore` seam, plus a
 * work-guarded save and a delete).
 */
export interface HeaderStore {
  load(): Promise<string | undefined>;
  /**
   * Compare-and-swap on cumulative work: writes only when no stored chain has strictly more work than `tipWork`
   * (another tab may have saved a heavier one). Resolves `true` once the write is committed, `false` when refused.
   */
  save(serialized: string, tipWork: bigint): Promise<boolean>;
  /** Deletes the saved chain of this network. */
  clear(): Promise<void>;
}

export type HeaderStoreFor = (netId: BtcNetworkId) => HeaderStore;

/** In-memory {@link HeaderStore} (tests, and browsers without IndexedDB). */
export class MemoryHeaderStore implements HeaderStore {
  public value: string | undefined;
  public work: bigint | undefined;
  public load(): Promise<string | undefined> {
    return Promise.resolve(this.value);
  }
  public save(serialized: string, tipWork: bigint): Promise<boolean> {
    if (this.work !== undefined && this.work > tipWork) return Promise.resolve(false);
    this.value = serialized;
    this.work = tipWork;
    return Promise.resolve(true);
  }
  public clear(): Promise<void> {
    this.value = undefined;
    this.work = undefined;
    return Promise.resolve();
  }
}

/** Minimal slice of `IDBFactory` used here (injectable for tests). */
export type IdbFactoryLike = Pick<IDBFactory, 'open'>;

const IDB_NAME = 'ghostpay-btc-headers';
const IDB_STORE = 'chains';

/** Resolves when `tx` commits; rejects when it fails or is aborted (unless `refused()` says the abort was ours). */
function committed(tx: IDBTransaction, refused: () => boolean = () => false): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    tx.oncomplete = (): void => { resolve(true); };
    tx.onabort = (): void => {
      if (refused()) resolve(false);
      else reject(new Error('IndexedDB transaction aborted'));
    };
    tx.onerror = (): void => { if (!refused()) reject(new Error('IndexedDB transaction failed')); };
  });
}

/**
 * IndexedDB store of validated block headers, per network: `headers:v1:<network>` holds the chain JSON and
 * `headers:v1:<network>:work` its cumulative work (hex). A save reads the stored work and writes inside one
 * transaction, so a tab never overwrites a heavier chain another tab saved, and resolves only after the transaction
 * commits. Headers are public chain data: no key, address, amount or scan result is stored. What is read back is
 * validated again in full.
 */
export function idbHeaderStore(factory: IdbFactoryLike): HeaderStoreFor {
  let db: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const o = factory.open(IDB_NAME, 1);
      o.onupgradeneeded = (): void => {
        if (!o.result.objectStoreNames.contains(IDB_STORE)) o.result.createObjectStore(IDB_STORE);
      };
      o.onsuccess = (): void => { resolve(o.result); };
      o.onerror = (): void => {
        db = undefined;
        reject(new Error('IndexedDB unavailable'));
      };
    });
    return db;
  };
  return (netId) => {
    const key = `headers:v1:${netId}`;
    const workKey = `${key}:work`;
    return {
      async load(): Promise<string | undefined> {
        const tx = (await open()).transaction(IDB_STORE, 'readonly');
        const r = tx.objectStore(IDB_STORE).get(key);
        await committed(tx);
        const v: unknown = r.result;
        // Anything but text is corrupt: hand back text that fails validation, so it is discarded, never used.
        return v === undefined ? undefined : typeof v === 'string' ? v : '';
      },
      async save(serialized: string, tipWork: bigint): Promise<boolean> {
        const tx = (await open()).transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        let refused = false;
        const done = committed(tx, () => refused);
        const cur = store.get(workKey);
        cur.onsuccess = (): void => {
          const v: unknown = cur.result;
          const stored = typeof v === 'string' && /^[0-9a-f]{1,80}$/.test(v) ? BigInt(`0x${v}`) : undefined;
          if (stored !== undefined && stored > tipWork) {
            refused = true;
            tx.abort();
            return;
          }
          store.put(serialized, key);
          store.put(tipWork.toString(16), workKey);
        };
        return done;
      },
      async clear(): Promise<void> {
        const tx = (await open()).transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.objectStore(IDB_STORE).delete(workKey);
        await committed(tx);
      },
    };
  };
}

/** Per-view memory store: nothing outlives the view. */
export function memoryHeaderStore(): HeaderStoreFor {
  const stores = new Map<BtcNetworkId, MemoryHeaderStore>();
  return (netId) => {
    let s = stores.get(netId);
    if (s === undefined) {
      s = new MemoryHeaderStore();
      stores.set(netId, s);
    }
    return s;
  };
}

/**
 * Most headers this view keeps per network. Above it a saved chain is discarded on load and a sync fails closed
 * (`UNSUPPORTED`): nothing above checked headers is scanned, and the tab never freezes on an unbounded chain.
 */
export const MAX_HEADERS = 400_000;
/** Headers re-validated between yields to the event loop when a saved chain is loaded. */
const LOAD_CHUNK = 2016;
/** Rounds between saves (and at the end of every sync), so a long sync is not re-serialized every round. */
export const SAVE_EVERY_ROUNDS = 5;
/** Rounds per {@link syncHeaders} call (about 100 000 headers); the caller is told when more remain. */
export const MAX_ROUNDS_PER_CALL = 25;

const yieldToEventLoop = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

/** How a saved chain was found when loading. */
export type HeaderLoad = 'none' | 'restored' | 'discarded';

/**
 * The header chain for `net`: the saved one, if it is anchored at the pinned genesis header and every header passes
 * validation again; otherwise a fresh chain at genesis. Saved data is never trusted: a stored chain that fails any
 * check, names another network or anchor, or exceeds `maxHeaders` is deleted as a whole. Re-validation yields to
 * the event loop every {@link LOAD_CHUNK} headers and reports progress, so a long chain does not freeze the tab.
 */
export async function loadHeaderChain(
  net: BtcNetworkInfo,
  store: HeaderStore,
  o: { readonly now?: () => number; readonly onProgress?: (height: number) => void; readonly maxHeaders?: number } = {},
): Promise<{ readonly chain: HeaderChain; readonly loaded: HeaderLoad }> {
  const checkpoint = genesisCheckpoint(net);
  const params = CHAIN_PARAMS[net.id];
  const nowOpt = o.now === undefined ? {} : { now: o.now };
  const fresh = (): HeaderChain => HeaderChain.create({ params, checkpoint, ...nowOpt });
  let text: string | undefined;
  try {
    text = await store.load();
  } catch {
    return { chain: fresh(), loaded: 'none' };
  }
  if (text === undefined) return { chain: fresh(), loaded: 'none' };
  try {
    const j = JSON.parse(text) as SerializedHeaderChain;
    if (typeof j !== 'object' || j === null || j.network !== net.id || !Array.isArray(j.headers)) throw new SilentPaymentError('INVALID_INPUT');
    if (j.headers.length > (o.maxHeaders ?? MAX_HEADERS)) throw new SilentPaymentError('UNSUPPORTED');
    // Checks the stored anchor against the pinned one; the headers follow in chunks.
    const chain = HeaderChain.fromJSON({ ...j, headers: [] }, { params, checkpoint, ...nowOpt });
    for (let i = 0; i < j.headers.length; i += LOAD_CHUNK) {
      const r = chain.connect(j.headers.slice(i, i + LOAD_CHUNK));
      if (!r.adopted || r.tipHeight !== Math.min(j.headers.length, i + LOAD_CHUNK)) throw new SilentPaymentError('INVALID_HEADER');
      o.onProgress?.(chain.tipHeight);
      await yieldToEventLoop();
    }
    return { chain, loaded: 'restored' };
  } catch {
    await store.clear().catch(() => undefined);
    return { chain: fresh(), loaded: 'discarded' };
  }
}

export interface HeaderSyncOutcome {
  readonly tipHeight: number;
  /** Lowest height above which a heavier chain replaced verified headers during this sync. */
  readonly reorgFrom: number | undefined;
  /** A source served a competing branch, compared in full, with no more work than the verified chain; it was ignored. */
  readonly lessWork: boolean;
  /** Every change was saved (false: storage failed, or another tab holds a heavier chain). */
  readonly saved: boolean;
  /** The round limit stopped this call before the sources ran out of headers. */
  readonly more: boolean;
}

/** A failed sync, with what had already happened to the chain before the failure. */
export class HeaderSyncError extends SilentPaymentError {
  public constructor(code: SilentPaymentError['code'], public readonly partial: HeaderSyncOutcome) {
    super(code);
  }
}

/**
 * Brings `chain` up to date with `sources`, {@link HEADERS_PER_ROUND} headers per round (a competing branch is
 * always read and compared in full, up to the package's fork limit), at most `maxRounds` rounds per call, saving
 * every {@link SAVE_EVERY_ROUNDS} rounds and at the end. Fails closed with a {@link HeaderSyncError} when any source
 * fails (bad proof of work, broken linkage, a rule violation, a malformed or missing answer, a fork too deep to
 * compare) or the chain passes `maxHeaders`; the error carries what changed before (a heavier fork may already have
 * been adopted), and the still-valid chain is saved first. An invalid batch never changes the chain.
 */
export async function syncHeaders(p: {
  readonly chain: HeaderChain;
  readonly sources: readonly HeaderSource[];
  readonly store: HeaderStore;
  readonly signal?: AbortSignal;
  readonly onProgress?: (height: number) => void;
  readonly maxRounds?: number;
  readonly maxHeaders?: number;
}): Promise<HeaderSyncOutcome> {
  const { chain } = p;
  const maxRounds = p.maxRounds ?? MAX_ROUNDS_PER_CALL;
  const maxHeaders = p.maxHeaders ?? MAX_HEADERS;
  let reorgFrom: number | undefined;
  let lessWork = false;
  let saved = true;
  let dirty = 0;
  let more = false;
  const outcome = (): HeaderSyncOutcome => ({ tipHeight: chain.tipHeight, reorgFrom, lessWork, saved, more });
  const save = async (): Promise<void> => {
    dirty = 0;
    if (chain.tipHeight > maxHeaders) return;
    try {
      if (!(await p.store.save(JSON.stringify(chain.toJSON()), chain.tipWork))) saved = false;
    } catch {
      saved = false;
    }
  };
  const failWith = async (code: SilentPaymentError['code']): Promise<never> => {
    if (dirty > 0) await save();
    throw new HeaderSyncError(code, outcome());
  };
  for (let round = 0; ; round++) {
    if (round === maxRounds) {
      more = true;
      break;
    }
    const before = chain.tipHash;
    let results;
    try {
      results = await syncHeaderChainFromSources(chain, p.sources, {
        maxHeaders: HEADERS_PER_ROUND,
        batchSize: 1000,
        ...(p.signal === undefined ? {} : { signal: p.signal }),
      });
    } catch (e) {
      return failWith(e instanceof SilentPaymentError ? e.code : 'TRANSPORT_FAILURE');
    }
    const changed = chain.tipHash !== before;
    for (const r of results) {
      if (!r.ok) continue;
      const s = r.result;
      if (s.reorg) reorgFrom = Math.min(reorgFrom ?? s.forkHeight, s.forkHeight);
      // A probe missed (more than one header read) and the whole branch was compared and not adopted.
      if (!s.adopted && s.fetched > 1 && s.forkHeight < chain.tipHeight) lessWork = true;
    }
    if (changed) dirty++;
    const failed = results.find((r) => !r.ok);
    if (failed !== undefined && !failed.ok) return failWith(failed.code);
    if (chain.tipHeight > maxHeaders) return failWith('UNSUPPORTED');
    if (!changed) break;
    if (dirty >= SAVE_EVERY_ROUNDS) await save();
    p.onProgress?.(chain.tipHeight);
  }
  if (dirty > 0) await save();
  return outcome();
}

/**
 * Drops what a scan learned from blocks that are no longer on the verified chain: the scan is cut back to the last
 * block before the first scanned block whose hash differs from the chain's, and payments above that are removed
 * (their spend tweaks wiped by the caller via `dropped`). Returns `undefined` for `scan` when nothing is left.
 */
export function invalidateReorged(
  scan: ScanResult,
  chain: HeaderChain,
): { readonly scan: ScanResult | undefined; readonly dropped: readonly FoundPayment[] } {
  const stale = scan.blocks.find((b) => chain.hashAt(b.height) !== b.hash);
  const staleFound = scan.found.filter((f) => chain.hashAt(f.height) !== f.blockHash);
  if (stale === undefined && staleFound.length === 0) return { scan, dropped: [] };
  const cut = Math.min(stale?.height ?? Infinity, ...staleFound.map((f) => f.height)) - 1;
  const dropped = scan.found.filter((f) => f.height > cut);
  if (cut < scan.fromHeight) return { scan: undefined, dropped: scan.found };
  return {
    scan: { ...scan, toHeight: cut, blocks: scan.blocks.filter((b) => b.height <= cut), found: scan.found.filter((f) => f.height <= cut) },
    dropped,
  };
}
