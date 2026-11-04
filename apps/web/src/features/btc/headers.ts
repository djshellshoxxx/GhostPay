import {
  CHAIN_PARAMS,
  HeaderChain,
  MemoryScanStateStore,
  parseHeader,
  SilentPaymentError,
  syncHeaderChainFromSources,
  type HeaderCheckpoint,
  type HeaderSource,
  type ScanStateStore,
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

/** Storage of one network's serialized header chain (the package's scan-state persistence seam). */
export type HeaderStoreFor = (netId: BtcNetworkId) => ScanStateStore;

/** Minimal slice of `IDBFactory` used here (injectable for tests). */
export type IdbFactoryLike = Pick<IDBFactory, 'open'>;

const IDB_NAME = 'ghostpay-btc-headers';
const IDB_STORE = 'chains';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = (): void => { resolve(r.result); };
    r.onerror = (): void => { reject(new Error('IndexedDB request failed')); };
  });
}

/**
 * IndexedDB store of validated block headers, one record per network (`headers:v1:<network>`). Headers are public
 * chain data: no key, address, amount or scan result is stored. What is read back is validated again in full.
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
    return {
      async load(): Promise<string | undefined> {
        const d = await open();
        const v: unknown = await request(d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key));
        // Anything but text is corrupt: hand back text that fails validation, so it is discarded, never used.
        return v === undefined ? undefined : typeof v === 'string' ? v : '';
      },
      async save(serialized: string): Promise<void> {
        const d = await open();
        await request(d.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(serialized, key));
      },
    };
  };
}

/** Per-view memory store: nothing outlives the view. */
export function memoryHeaderStore(): HeaderStoreFor {
  const stores = new Map<BtcNetworkId, MemoryScanStateStore>();
  return (netId) => {
    let s = stores.get(netId);
    if (s === undefined) {
      s = new MemoryScanStateStore();
      stores.set(netId, s);
    }
    return s;
  };
}

/** How a saved chain was found when loading. */
export type HeaderLoad = 'none' | 'restored' | 'discarded';

/**
 * The header chain for `net`: the saved one, if it is anchored at the pinned genesis header and every header passes
 * validation again; otherwise a fresh chain at genesis. Saved data is never trusted: a stored chain that fails any
 * check, or names another network or anchor, is discarded (and overwritten) as a whole.
 */
export async function loadHeaderChain(
  net: BtcNetworkInfo,
  store: ScanStateStore,
  now?: () => number,
): Promise<{ readonly chain: HeaderChain; readonly loaded: HeaderLoad }> {
  const checkpoint = genesisCheckpoint(net);
  const params = CHAIN_PARAMS[net.id];
  const o = now === undefined ? {} : { now };
  const fresh = (): HeaderChain => HeaderChain.create({ params, checkpoint, ...o });
  let text: string | undefined;
  try {
    text = await store.load();
  } catch {
    return { chain: fresh(), loaded: 'none' };
  }
  if (text === undefined) return { chain: fresh(), loaded: 'none' };
  try {
    const j = JSON.parse(text) as Parameters<typeof HeaderChain.fromJSON>[0];
    if (typeof j !== 'object' || j === null || j.network !== net.id) throw new SilentPaymentError('INVALID_INPUT');
    return { chain: HeaderChain.fromJSON(j, { params, checkpoint, ...o }), loaded: 'restored' };
  } catch {
    const chain = fresh();
    await store.save(JSON.stringify(chain.toJSON())).catch(() => undefined);
    return { chain, loaded: 'discarded' };
  }
}

export interface HeaderSyncOutcome {
  readonly tipHeight: number;
  /** Lowest height above which a heavier chain replaced verified headers during this sync. */
  readonly reorgFrom: number | undefined;
  /** A source served a competing branch with no more work than the verified chain; it was ignored. */
  readonly lessWork: boolean;
  /** Every round that changed the chain was saved. */
  readonly saved: boolean;
}

/**
 * Brings `chain` up to date with `sources`, {@link HEADERS_PER_ROUND} headers at a time, saving after every round
 * that changed it (so a cancelled or failed sync resumes from there). Fails closed: when any source fails (bad
 * proof of work, broken linkage, a rule violation, a malformed or missing answer) this throws after saving the
 * still-valid chain; an invalid batch never changes the chain.
 */
export async function syncHeaders(p: {
  readonly chain: HeaderChain;
  readonly sources: readonly HeaderSource[];
  readonly store: ScanStateStore;
  readonly signal?: AbortSignal;
  readonly onProgress?: (height: number) => void;
}): Promise<HeaderSyncOutcome> {
  const { chain } = p;
  let reorgFrom: number | undefined;
  let lessWork = false;
  let saved = true;
  const save = async (): Promise<void> => {
    try {
      await p.store.save(JSON.stringify(chain.toJSON()));
    } catch {
      saved = false;
    }
  };
  for (;;) {
    const before = chain.tipHash;
    const results = await syncHeaderChainFromSources(chain, p.sources, {
      maxHeaders: HEADERS_PER_ROUND,
      batchSize: 1000,
      ...(p.signal === undefined ? {} : { signal: p.signal }),
    });
    const changed = chain.tipHash !== before;
    if (changed) await save();
    for (const r of results) {
      if (!r.ok) throw new SilentPaymentError(r.code);
      const s = r.result;
      if (s.reorg) reorgFrom = Math.min(reorgFrom ?? s.forkHeight, s.forkHeight);
      // A probe missed (more than one header read) and the branch was not adopted: it had no more work.
      if (!s.adopted && s.fetched > 1 && s.forkHeight < chain.tipHeight) lessWork = true;
    }
    if (!changed) break;
    p.onProgress?.(chain.tipHeight);
  }
  return { tipHeight: chain.tipHeight, reorgFrom, lessWork, saved };
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
