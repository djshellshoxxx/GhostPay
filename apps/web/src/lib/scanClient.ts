import {
  ChainAdapterError,
  claimPairKey,
  compareProviders,
  dedupeClaims,
  fetchAnnouncements,
  findToken,
  verifyClaimedPayment,
  type Address,
  type ChainConfig,
  type DeploymentManifest,
  type Hex,
  type RpcClient,
  type ScanCursor,
  type PaymentVerification,
  type ProviderDiscrepancy,
  type ReceiptStatus,
  type ScannedAnnouncement,
} from '@ghostpay/chain-adapters';
import { parseMetadata, type ParsedMetadata } from '@ghostpay/core-crypto';
import { UserFacingError } from './errors';
import { createMatchCover } from './matchCover';
import { checkpointSlotNamer, isLegacyCheckpointSlot, legacyCheckpointSlot, sessionViewingKey, type ViewingKeyLender } from './scanCursorSlot';
import { anonymitySet, estimateSimilarTransfers, splitLanes, type AnonymitySet, type ScanLaneOptions, type TransferEstimate } from './scanSpam';
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
  /** True if the one-byte view tag matched; false identifies a payment found by the opt-in deep scan. */
  readonly tagMatches: boolean;
  /**
   * `verified`: attested by the manifest-verified router after `finalityDepth` confirmations.
   * `claimed`: announcement metadata only (a direct announcement anyone can forge); balance alone is not payment evidence.
   * `pending`: not yet final.
   */
  readonly receipt: ReceiptStatus;
}

export interface ScanProgress {
  readonly nextBlock: bigint;
  readonly scanned: number;
  readonly matches: number;
  readonly skipped: number;
  /**
   * The fetch was not truncated and the cursor is beyond the primary head observed for this page.
   * This does not prove complete history, log inclusion/completeness, durable storage, or the latest chain tip.
   */
  readonly caughtUp: boolean;
  /** Pages where a second provider disagreed (checkpoint withheld for those pages). */
  readonly discrepancies?: number;
  /** The configured per-run announcement or match budget stopped the scan; resume from `nextBlock`. */
  readonly limitReached?: boolean;
  /** Spec 05: open-lane (non-router) announcements deferred by the per-scan budget; resume from `nextBlock`. */
  readonly backlog?: number;
  /**
   * L4-01: committed blocks too large to fetch whole, so far in this run. Only their router-posted announcements were
   * scanned; other announcements there were skipped. Reported with every page, so a later failure cannot hide them.
   */
  readonly routerOnlyBlocks?: readonly bigint[];
}

/** The second RPC reported a head more than `finalityDepth` blocks below the scan RPC's: scans stop at its head. */
export interface SecondaryLag {
  readonly secondaryHead: bigint;
  readonly head: bigint;
}

/** Spec 05 local telemetry for one run. Computed on this device and never sent. */
export interface ScanTelemetry {
  /** Router-posted announcements processed. */
  readonly trusted: number;
  /** Other announcements processed. */
  readonly open: number;
  /** Announcements that looked like spam (repeated ephemeral key, flooding caller, malformed metadata); deprioritised, not dropped. */
  readonly suspected: number;
  readonly anonymity: AnonymitySet | undefined;
}

export { checkpointKeyId } from '@ghostpay/ux-vault/portable';

export interface CheckpointStore {
  load(chainId: number, keyId: string): ScanCursor | undefined;
  /**
   * Stores the resume cursor. Without `expected` the write is forward-only: a cursor older than the stored one is refused.
   * With `expected` (the cursor the writer last read or wrote, `null` for none) it is a compare-and-swap: the write happens
   * only while the slot still holds exactly that cursor. The slot's owner can therefore move it backward (reorg rollback,
   * claim replay, a deliberate restart), while a scan that lost the slot to another scan cannot overwrite it. A wrapper must
   * forward `expected`: dropping it turns runScan's rewinds into forward-only saves, which this store refuses.
   */
  save(chainId: number, keyId: string, cursor: ScanCursor, expected?: ScanCursor | null): void;
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
  /**
   * The stored checkpoint the caller chose `cursor` against: the snapshot it resumed from or showed when the user picked
   * another start, `null` for none. The run owns the slot only while it still holds this value, so a write or clear by
   * another scan between the caller's read and this run (during async setup, say) is a foreign change and the run yields.
   * Omitted: the run reads the slot at entry, which suits callers that start right after reading it.
   */
  readonly checkpointSeen?: ScanCursor | null;
  readonly onProgress?: (p: ScanProgress) => void;
  readonly onMatch?: (m: ScanMatch) => void;
  /** Preserve relevant evidence before a checkpoint can advance past it. */
  readonly onPageMatches?: (matches: readonly ScanMatch[], page: {
    readonly finalizedThrough: bigint;
    readonly resumed: boolean;
    readonly from: bigint;
    readonly through: bigint;
    readonly canonicalHash: (height: bigint) => Promise<Hex>;
    readonly retryFrom: (height: bigint) => void;
  }) => Promise<boolean>;
  readonly onUnresolvedEvidence?: (from: bigint) => Promise<void>;
  /** Immediately hide possibly orphaned actionable matches; this does not authorize persistent invalidation. */
  readonly onQuarantine?: (rolledBackTo: bigint) => void;
  /**
   * A rollback was confirmed (by both providers when configured); persist invalidation before accepting replacement
   * results. `canonicalHash` returns the block hash every configured provider reports at a height and throws on any
   * doubt, so only observations whose block was actually replaced are invalidated (nothing is, if it throws).
   */
  readonly onReorg?: (rolledBackTo: bigint, canonicalHash: (height: bigint) => Promise<Hex>) => void | Promise<void>;
  readonly maxPages?: number;
  /** Total accepted public announcements to process in one run (default 100,000). */
  readonly maxAnnouncementsPerScan?: number;
  /** Total cryptographic matches to retain in one run (default 10,000). */
  readonly maxMatchesPerScan?: number;
  /** Opt-in fallback: test the full stealth address when the announced view tag is incorrect. */
  readonly deep?: boolean;
  /** A worker reply that takes longer than this terminates the scan (default 60 s; S3-15). */
  readonly replyTimeoutMs?: number;
  /** Independent second provider on the same chain; compared at every checkpoint. */
  readonly secondaryClient?: RpcClient;
  /**
   * Cover lookups (opt-in, see matchCover.ts): every page also verifies a fixed, keyed share of its other router
   * payments, matched payment or not, through the same path and in chain order, so the RPC providers see a payment's
   * lookups among other payments'. Decoy results are discarded.
   */
  readonly matchCover?: boolean;
  readonly onDiscrepancy?: (d: readonly ProviderDiscrepancy[]) => void;
  /** Spec 05: non-router announcements processed per run (default 20,000). Overflow is deferred, never skipped. */
  readonly openLaneBudget?: number;
  /** Spec 05 lane options: flood threshold per caller and block, and the local spam score switch. */
  readonly floodPerBlock?: number;
  readonly spamScoring?: boolean;
  /**
   * Spec 05 B, opt-in: after the run, count transfers of the token of the latest payment found, at a similar amount, in a
   * fixed recent window (no sender or recipient in the query). Costs RPC calls; `unknown` on any limit or error.
   */
  readonly privacySetTransfers?: boolean;
}

function toWire(a: ScannedAnnouncement, skipTag: boolean): WireLog {
  return { id: a.id, schemeId: a.schemeId, stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata, ...(skipTag ? { skipTag: true } : {}) };
}

/**
 * Network access happens here (via chain-adapters), never in the worker. The worker receives public logs and, once,
 * the viewing key. Cancelling via `signal` stops fetching, tells the worker to stop, and terminates it.
 */
export async function runScan(p: ScanParams): Promise<{ readonly matches: readonly ScanMatch[]; readonly cursor: ScanCursor; readonly scanned: number; readonly discrepancies: readonly ProviderDiscrepancy[]; readonly limitReached: boolean; readonly backlog?: number; readonly telemetry?: ScanTelemetry; readonly routerOnlyBlocks?: readonly bigint[]; readonly secondaryLag?: SecondaryLag }> {
  let worker: ScanWorkerLike | undefined;
  let stopped = false;
  // Derived before the viewing key is handed to the worker (which zeroizes it); undefined when cover is off. A failure
  // here still wipes the viewing key, like every other exit of this function.
  let cover: ReturnType<typeof createMatchCover>;
  try { cover = createMatchCover(p.matchCover, p.viewingKey); } catch (e) { zeroizeBytes(p.viewingKey); throw e; }
  const stopWorker = (): void => {
    if (stopped) return;
    stopped = true;
    zeroizeBytes(p.viewingKey);
    cover?.dispose();
    if (worker === undefined) return;
    // Teardown must reach terminate even if a broken worker rejects further messages.
    try { if (p.signal.aborted) worker.postMessage({ type: 'cancel' }); } catch { /* best effort */ }
    try { worker.postMessage({ type: 'end' }); } catch { /* best effort */ }
    worker.terminate();
  };
  p.signal.addEventListener('abort', stopWorker, { once: true });
  const pending = new Map<number, (m: FromWorker) => void>();
  let ready: ((m: FromWorker) => void) | undefined;
  let failed: ((e: Error) => void) | undefined;
  let progressed: ((scanned: number) => void) | undefined;
  const timeoutMs = p.replyTimeoutMs ?? 60_000;
  const ABORTED = new Error('scan cancelled');
  // Settles on a reply, a worker error, the reply timeout, or Cancel: a hung worker can never block the caller.
  const wait = (register: (resolve: (m: FromWorker) => void) => void): Promise<FromWorker> =>
    new Promise<FromWorker>((resolve, reject) => {
      const done = (fn: () => void): void => {
        clearTimeout(timer);
        progressed = undefined;
        p.signal.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = (): void => done(() => reject(ABORTED));
      const expire = (): void => done(() => reject(new UserFacingError({ key: 'error.scanClient.theScannerDidNotAnswerInTimeAndWasStopped' })));
      let timer = setTimeout(expire, timeoutMs);
      let scannedSoFar = -1;
      // A whole page on a slow device can take longer than the timeout; the worker reports progress every 128
      // announcements and each step forward restarts the timer, which then only stops a worker that went silent.
      progressed = (count) => {
        if (count <= scannedSoFar) return;
        scannedSoFar = count;
        clearTimeout(timer);
        timer = setTimeout(expire, timeoutMs);
      };
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
  let limitReached = false;
  let backlog = 0;
  let trustedSeen = 0;
  let openSeen = 0;
  let suspected = 0;
  const routerBlocks: bigint[] = [];
  const laneOptions: ScanLaneOptions = { ...(p.floodPerBlock === undefined ? {} : { floodPerBlock: p.floodPerBlock }), ...(p.spamScoring === undefined ? {} : { spamScoring: p.spamScoring }) };
  // Blocks too large to fetch whole: only their router-posted announcements were scanned (bounded list).
  const routerOnlyBlocks = new Set<bigint>();
  const narrowed = (): { readonly routerOnlyBlocks?: readonly bigint[] } => (routerOnlyBlocks.size === 0 ? {} : { routerOnlyBlocks: [...routerOnlyBlocks] });
  let secondaryLag: SecondaryLag | undefined;
  // The latest head this run could scan to (the lower of the two heads): the privacy-set window ends here.
  let reachableHead: bigint | undefined;
  // Index in `all` of the first record kept for a one-time address and ephemeral key. That pair recognises a free
  // replay posted at the announcer in another block; it does not identify a payment, because anyone can send a second
  // router payment to the same pair. Keep this ledger per scan only: checkpoints never persist claimed payment data
  // or RPC evidence.
  const claimLedger = new Map<string, number>();
  const evidenceLedger = new Map<string, bigint>();
  // Blocks of cover payments seen as pending in this run: the replay rule treats them like pending matches.
  let coverPending: bigint[] = [];
  const discrepancies: ProviderDiscrepancy[] = [];
  // Pending results from this run are in memory only. On a reorg the safe persistence floor
  // must move back with the rollback, rather than remaining pinned to the old checkpoint.
  let persistenceFloor = p.cursor.nextBlock;
  let batchId = 0;
  let canSaveCheckpoint = true;
  // PRIV-06 F1: the checkpoint this run last read or wrote. Another scan of the same keys (a second tab, or an older run
  // that outlives a newer one) may write or clear the slot meanwhile. This run then yields the slot for the rest of the run
  // instead of overwriting it: the other writer's cursor (or its clear) stands whether it is ahead (a newer scan) or behind
  // (its own rollback). Yielding stops only the checkpoint write; the run still corroborates anchors, hands every page to
  // onPageMatches and reports every match. Read synchronously here, before the first await, so a scan started later cannot
  // be mistaken for this run's own write. A caller that read the slot earlier passes that snapshot instead (`checkpointSeen`).
  let ownedCheckpoint = p.checkpoints === undefined ? undefined
    : p.checkpointSeen !== undefined ? (p.checkpointSeen ?? undefined) : loadCheckpoint(p.checkpoints, p.chain.chainId, p.keyId);
  let checkpointYielded = false;
  let retryHeight: bigint | undefined;
  const finalizedAt = (head: bigint): bigint => head + 1n - BigInt(Math.max(1, p.chain.finalityDepth));
  const uncertainFrom = (from: bigint, head: bigint): bigint => {
    const first = finalizedAt(head) + 1n;
    return first < 0n ? 0n : first < from ? first : from;
  };
  try {
    if (p.signal.aborted) throw ABORTED;
    // Created inside the try so a throwing factory still reaches the key wipe below (S3-15).
    const w = p.createWorker();
    worker = w;
    w.onmessage = (e): void => {
      const m = e.data;
      if (m.type === 'matches') pending.get(m.batchId)?.(m);
      else if (m.type === 'progress' && pending.has(m.batchId)) progressed?.(m.scanned);
      // An error posted while a batch is outstanding ends the scan now. Routed to the start resolver it would be
      // ignored (that promise is already settled) and the batch would wait for the reply timeout.
      else if (m.type === 'error' && pending.size > 0) failed?.(new UserFacingError({ key: 'error.scanClient.theScannerWorkerFailed' }));
      else if (m.type === 'ready' || m.type === 'error' || m.type === 'ended') ready?.(m);
    };
    w.onerror = (): void => {
      failed?.(new UserFacingError({ key: 'error.scanClient.theScannerWorkerFailed' }));
    };
    const started = await wait((resolve) => {
      ready = resolve;
      w.postMessage({ type: 'start', viewingKey: p.viewingKey, spendingPublicKey: p.spendingPublicKeyHex });
    });
    if (started.type !== 'ready') throw new UserFacingError({ key: 'error.scanClient.theScannerRejectedTheKeys' });
    const maxPages = p.maxPages ?? 10_000;
    const maxAnnouncements = Math.max(1, Math.min(100_000, Number.isSafeInteger(p.maxAnnouncementsPerScan) ? p.maxAnnouncementsPerScan! : 100_000));
    const maxMatches = Math.max(1, Math.min(10_000, Number.isSafeInteger(p.maxMatchesPerScan) ? p.maxMatchesPerScan! : 10_000));
    const openBudget = Math.max(1, Math.min(100_000, Number.isSafeInteger(p.openLaneBudget) ? p.openLaneBudget! : 20_000));
    for (let page = 0; page < maxPages; page++) {
      if (p.signal.aborted) break;
      // With a second provider, end the page at the lower of the two heads: a second RPC a few blocks behind the
      // primary can then corroborate the page instead of withholding it on every run.
      let secondaryHead: bigint | undefined;
      if (p.secondaryClient !== undefined) {
        try {
          secondaryHead = await p.secondaryClient.blockNumber();
        } catch {
          if (p.signal.aborted) break;
          const conflicts: readonly ProviderDiscrepancy[] = [{ kind: 'secondary_error', ref: cursor.nextBlock.toString() }];
          discrepancies.push(...conflicts);
          p.onDiscrepancy?.(conflicts);
          p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length });
          break;
        }
        if (p.signal.aborted) break;
      }
      const res = await fetchAnnouncements({
        chain: p.chain, client: p.client, announcer: p.manifest.announcer, router: p.manifest.router, cursor,
        ...(secondaryHead === undefined ? {} : { toBlock: secondaryHead }),
      }).catch(async (cause: unknown) => {
        if (!p.signal.aborted && p.onUnresolvedEvidence !== undefined) {
          let from = cursor.nextBlock;
          if (cursor.last !== undefined) {
            // A missing checkpoint header is inconclusive. A reachable lower tip can still revoke depth.
            if (secondaryHead !== undefined) from = uncertainFrom(from, secondaryHead);
            try { from = uncertainFrom(from, await p.client.blockNumber()); } catch { /* Retain the known boundary. */ }
          }
          if (!p.signal.aborted) await p.onUnresolvedEvidence(from);
        }
        throw cause;
      });
      if (p.signal.aborted) break;
      // A page that reached the second RPC's head while the scan RPC is far ahead: say so, the scan stops there.
      secondaryLag = secondaryHead !== undefined && !res.truncated && res.head > secondaryHead + BigInt(p.chain.finalityDepth) ? { secondaryHead, head: res.head } : undefined;
      const pageRouterOnly = res.routerOnlyBlocks ?? [];
      const pageHead = secondaryHead !== undefined && secondaryHead < res.head ? secondaryHead : res.head;
      reachableHead = pageHead;
      skipped += res.skipped;
      // A reorg can be reported at a block ABOVE this page's start (a later window's end changed hash after the logs
      // below it were read). The page still starts at the cursor; only a rollback below it moves the start back.
      const pageFrom = res.reorg !== undefined && res.reorg.rolledBackTo < cursor.nextBlock ? res.reorg.rolledBackTo : cursor.nextBlock;
      if (res.reorg !== undefined) {
        // The floor only ever moves back. Raising it to a rollback point above the page start would save the
        // checkpoint past the finality tail and past pending matches, which the next session would never list.
        if (res.reorg.rolledBackTo < persistenceFloor) persistenceFloor = res.reorg.rolledBackTo;
        // Hide uncertain results immediately, while retaining the caller's observations for a
        // confirmed invalidation. One provider's fork must never permanently poison the vault.
        const keep = all.filter((m) => m.announcement.blockNumber < res.reorg!.rolledBackTo);
        all.length = 0;
        all.push(...keep);
        claimLedger.clear();
        keep.forEach((match, index) => { const pair = claimPairKey(match); if (!claimLedger.has(pair)) claimLedger.set(pair, index); });
        for (const [id, block] of evidenceLedger) if (block >= res.reorg.rolledBackTo) evidenceLedger.delete(id);
        coverPending = coverPending.filter((block) => block < res.reorg!.rolledBackTo);
        for (const block of routerOnlyBlocks) if (block >= res.reorg.rolledBackTo) routerOnlyBlocks.delete(block);
        // The replacement page re-reads these blocks: drop their router announcements so the privacy set counts each once.
        const keptRouterBlocks = routerBlocks.filter((block) => block < res.reorg!.rolledBackTo);
        routerBlocks.length = 0;
        routerBlocks.push(...keptRouterBlocks);
        p.onQuarantine?.(res.reorg.rolledBackTo);
        if (p.signal.aborted) break;
        if (p.secondaryClient !== undefined) {
          // Check the replacement page AND the old checkpoint/rollback anchors. Agreement at
          // the page end alone cannot establish that a previously saved block was orphaned.
          const pageComparison = res.cursor.last === undefined ? [] : (await compareProviders({
            chain: p.chain, secondary: p.secondaryClient, announcer: p.manifest.announcer,
            fromBlock: pageFrom, toBlock: res.cursor.last.number,
            primaryAnnouncements: res.announcements, primarySkipped: res.skipped,
            primaryBlockHash: res.cursor.last.hash,
            router: p.manifest.router, primaryRouterOnlyBlocks: pageRouterOnly,
          })).discrepancies;
          if (p.signal.aborted) break;
          const conflicts = pageComparison.length > 0 ? pageComparison : await confirmRollback(p, cursor, res.cursor, res.reorg.rolledBackTo);
          if (p.signal.aborted) break;
          if (conflicts.length > 0) {
            discrepancies.push(...conflicts);
            p.onDiscrepancy?.(conflicts);
            if (p.signal.aborted) break;
            await p.onUnresolvedEvidence?.(res.reorg.rolledBackTo);
            // An unconfirmed fork report must not delete the saved checkpoint either: keep it and this run's
            // position, so the next scan checks the same anchor again.
            p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length });
            break;
          }
        }
        try {
          await p.onReorg?.(res.reorg.rolledBackTo, (height) => canonicalHashAt(p, height));
        } catch (cause) {
          if (!p.signal.aborted) await p.onUnresolvedEvidence?.(res.reorg.rolledBackTo);
          throw cause;
        }
        if (p.signal.aborted) break;
      }
      if (scanned + res.announcements.length > maxAnnouncements) {
        limitReached = true;
        if (res.reorg !== undefined) {
          cursor = { nextBlock: pageFrom };
          p.checkpoints?.clear(p.chain.chainId, p.keyId);
        }
        p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length, limitReached });
        break;
      }
      // Spec 05: router-posted announcements (trusted lane) go first; the open lane has a per-run budget. A page whose open
      // lane does not fit is processed for the trusted lane only and the cursor is held before it, so nothing is skipped.
      const lanes = splitLanes(res.announcements, p.manifest.router, laneOptions);
      suspected += lanes.suspected;
      // The first page of a run is never deferred: with a budget below one page's open lane the cursor would
      // otherwise stay before that page on every run. Per-run work is then at most the budget plus one page.
      const deferred = openSeen > 0 && openSeen + lanes.open.length > openBudget ? lanes.open.length : 0;
      const toScan = deferred > 0 ? lanes.trusted : [...lanes.trusted, ...lanes.open];
      const position = new Map(res.announcements.map((a, i) => [a.id, i] as const));
      for (const a of res.announcements) byId.set(a.id, a);
      const id = ++batchId;
      const reply = await wait((resolve) => {
        pending.set(id, resolve);
        w.postMessage({ type: 'batch', batchId: id, logs: toScan.map((a) => toWire(a, p.deep === true && a.caller.toLowerCase() === p.manifest.router.toLowerCase())) });
      });
      pending.delete(id);
      if (p.signal.aborted) break;
      if (reply.type !== 'matches') throw new UserFacingError({ key: 'error.scanClient.theScannerReturnedAnUnexpectedReply' });
      scanned += toScan.length;
      trustedSeen += lanes.trusted.length;
      if (deferred === 0) openSeen += lanes.open.length;
      for (const a of lanes.trusted) if (routerBlocks.length < 200_000) routerBlocks.push(a.blockNumber);
      const claims: { readonly stealthAddress: Address; readonly announcement: ScannedAnnouncement; readonly metadata: ParsedMetadata | undefined; readonly viaRouter: boolean }[] = [];
      // Back to chain order, so lane ordering never changes which duplicate or match comes first.
      const ordered = [...reply.matches].sort((x, y) => (position.get(x.id) ?? 0) - (position.get(y.id) ?? 0));
      for (const m of ordered) {
        const announcement = byId.get(m.id);
        if (announcement === undefined) continue;
        let metadata: ParsedMetadata | undefined;
        try {
          metadata = parseMetadata(announcement.metadata);
        } catch {
          metadata = undefined;
        }
        const viaRouter = announcement.caller.toLowerCase() === p.manifest.router.toLowerCase();
        claims.push({ stealthAddress: m.stealthAddress as Address, announcement, metadata, viaRouter });
      }
      // Drop public replay announcements before any payment verification. The helper keeps every router record of a
      // one-time address/ephemeral-key pair (F1), else the earliest non-router log; each is verified on its own.
      const uniqueClaims = dedupeClaims(claims);
      if (all.length + uniqueClaims.items.length > maxMatches) {
        limitReached = true;
        if (res.reorg !== undefined) {
          cursor = { nextBlock: pageFrom };
          p.checkpoints?.clear(p.chain.chainId, p.keyId);
        }
        p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length, limitReached });
        break;
      }
      const pageMatches: ScanMatch[] = [];
      const pageEvidence = new Set(evidenceLedger.keys());
      const workerMatches = new Map(reply.matches.map((m) => [m.id, m] as const));
      // Real claims in chain order (it decides which of two claims sharing a transfer is credited). With cover on, the
      // keyed share of this page's other router payments is merged in, whether or not anything matched, and the whole
      // list runs in chain order. Cover is drawn only from payments that pass the checks verification applies before
      // its first request, so no cover lookup is silent.
      const steps = cover === undefined
        ? uniqueClaims.items.map((item) => ({ item, decoy: false }))
        : (() => {
            const matchedIds = new Set(claims.map((c) => c.announcement.id));
            const candidates = lanes.trusted.flatMap((announcement) => {
              if (matchedIds.has(announcement.id)) return [];
              let metadata: ParsedMetadata;
              try { metadata = parseMetadata(announcement.metadata); } catch { return []; }
              if (!sendsLookups(p.chain, p.manifest.router, announcement, metadata)) return [];
              return [{ stealthAddress: announcement.stealthAddress, announcement, metadata, viaRouter: true }];
            });
            return cover.plan(uniqueClaims.items, candidates);
          })();
      // Blocks of this page's failed cover checks, and the transfers cover credits among itself (never the ledger's).
      const coverClaimed: bigint[] = [];
      const coverEvidence = new Set<string>();
      for (const step of steps) {
        if (p.signal.aborted) break;
        if (step.decoy) {
          // The same verification call as a real claim, against a separate evidence set. The result is never shown or
          // recorded; only its block and receipt state feed the replay rule, so real and cover checks move it alike.
          const checked = receiptStatus(await verifyClaimedPayment({
            chain: p.chain,
            client: p.client,
            router: p.manifest.router,
            announcer: p.manifest.announcer,
            claim: step.item,
            ...(p.secondaryClient === undefined ? {} : { secondaryClient: p.secondaryClient }),
            consumedTransfers: coverEvidence,
          }).catch(() => undefined));
          if (checked === 'pending') coverPending.push(step.item.announcement.blockNumber);
          if (checked === 'claimed') coverClaimed.push(step.item.announcement.blockNumber);
          continue;
        }
        const claim = step.item;
        if (all.some((x) => x.announcement.id === claim.announcement.id)) continue;
        const verification = claim.metadata === undefined
          ? undefined
          : await verifyClaimedPayment({
              chain: p.chain,
              client: p.client,
              router: p.manifest.router,
              announcer: p.manifest.announcer,
              claim,
              ...(p.secondaryClient === undefined ? {} : { secondaryClient: p.secondaryClient }),
              consumedTransfers: pageEvidence,
            });
        const receipt = receiptStatus(verification);
        const workerMatch = workerMatches.get(claim.announcement.id);
        const match: ScanMatch = { chainId: p.chain.chainId, announcement: claim.announcement, stealthAddress: claim.stealthAddress, metadata: claim.metadata, viaRouter: claim.viaRouter, tagMatches: workerMatch?.tagMatches ?? true, receipt };
        pageMatches.push(match);
      }
      // Don't commit evidence from a partially processed/cancelled page.
      if (p.signal.aborted) break;
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
          router: p.manifest.router,
          primaryRouterOnlyBlocks: pageRouterOnly,
        });
        if (p.signal.aborted) break;
        if (cmp.discrepancies.length > 0) {
          disagree = true;
          discrepancies.push(...cmp.discrepancies);
          p.onDiscrepancy?.(cmp.discrepancies);
        }
      }
      // A primary-only router log can look cryptographically attested. Do not expose any matches from a page
      // until its logs and checkpoint block have reconciled with the independent provider.
      if (!disagree) {
        for (const id of pageEvidence) if (!evidenceLedger.has(id)) {
          const blockText = id.startsWith('native:') ? id.split(':')[1] : id.split(':')[2];
          if (blockText !== undefined && /^\d+$/.test(blockText)) evidenceLedger.set(id, BigInt(blockText));
        }
        for (const match of pageMatches) {
          if (all.some((x) => x.announcement.id === match.announcement.id)) continue;
          const pair = claimPairKey(match);
          const previous = claimLedger.get(pair);
          if (previous !== undefined) {
            const old = all[previous];
            if (old !== undefined && !old.viaRouter) {
              // A genuine router record outranks an earlier public replay and takes its place; a second replay
              // adds nothing. The view's onMatch handler applies the same rule.
              if (match.viaRouter) {
                all[previous] = match;
                p.onMatch?.(match);
              }
              continue;
            }
            // The pair already has a router record, so a replay is dropped. Another router announcement is another
            // transfer (the router moves funds in the transaction that announces) and is listed in its own right:
            // dropping it let a cheap payment mined first hide the genuine one.
            if (!match.viaRouter) continue;
            all.push(match);
            p.onMatch?.(match);
            continue;
          }
          claimLedger.set(pair, all.length);
          all.push(match);
          p.onMatch?.(match);
        }
      }
      // A page the providers disagree on must be re-scanned. Do not advance the in-memory cursor
      // or continue into later pages, since a later successful page could otherwise checkpoint
      // past these withheld logs and permanently skip them on resume.
      if (disagree) {
        await p.onUnresolvedEvidence?.(uncertainFrom(pageFrom, pageHead));
        if (res.reorg !== undefined) {
          cursor = { nextBlock: pageFrom };
          p.checkpoints?.clear(p.chain.chainId, p.keyId);
        }
        p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length });
        break;
      }
      // Include the agreed finality boundary even when no new blocks were scanned.
      const finalizedThrough = finalizedAt(pageHead);
      const resumed = p.cursor.last !== undefined;
      if (canSaveCheckpoint && await p.onPageMatches?.(pageMatches, {
        from: pageFrom, through: res.cursor.last?.number ?? pageFrom - 1n, finalizedThrough, resumed,
        canonicalHash: (height) => canonicalHashAt(p, height),
        retryFrom: (height) => {
          const retry = height > pageHead ? pageHead + 1n : height;
          // A resumed scan may need to revisit a linked observation quarantined during an earlier interruption.
          if (retry >= 0n && (resumed || retry > finalizedThrough) && retry < persistenceFloor) persistenceFloor = retry;
          if (retryHeight === undefined || retry < retryHeight) retryHeight = retry;
        },
      }) === false) canSaveCheckpoint = false;
      if (p.signal.aborted) break;
      if (deferred > 0) {
        backlog = deferred;
        if (res.reorg !== undefined) {
          cursor = { nextBlock: pageFrom };
          p.checkpoints?.clear(p.chain.chainId, p.keyId);
        }
        p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length, backlog });
        break;
      }
      cursor = res.cursor;
      for (const block of pageRouterOnly) if (routerOnlyBlocks.size < 1000) routerOnlyBlocks.add(block);
      if (canSaveCheckpoint && p.checkpoints !== undefined) {
        // With cover on, a failed claim that sends no request is left out: verifying it again cannot change it, and
        // its replay would read a block that only a payment of this seller leads to.
        const replayed = pageMatches.filter((m) => m.viaRouter && m.receipt === 'claimed' && (cover === undefined ||
          (m.metadata !== undefined && sendsLookups(p.chain, p.manifest.router, m.announcement, m.metadata))));
        const saved = await persistable(p, cursor, persistenceFloor, pageHead, {
          pending: [...all.filter((m) => m.receipt === 'pending').map((m) => m.announcement.blockNumber), ...coverPending],
          failed: [...replayed.map((m) => m.announcement.blockNumber), ...coverClaimed],
        }, retryHeight);
        if (p.signal.aborted) break;
        if (Array.isArray(saved)) {
          await p.onUnresolvedEvidence?.(pageFrom);
          // An uncorroborated anchor is withheld, never saved from the primary alone: stop and re-scan later.
          const conflicts = saved as readonly ProviderDiscrepancy[];
          discrepancies.push(...conflicts);
          p.onDiscrepancy?.(conflicts);
          if (res.reorg !== undefined) p.checkpoints.clear(p.chain.chainId, p.keyId);
          p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: false, discrepancies: discrepancies.length });
          break;
        }
        if (saved !== undefined && !checkpointYielded) {
          // Re-read, compare and write in one synchronous step. A store that does not round-trip reads undefined both here
          // and after its own writes, so it keeps saving.
          const stored = loadCheckpoint(p.checkpoints, p.chain.chainId, p.keyId);
          if (!sameCursor(stored, ownedCheckpoint)) {
            checkpointYielded = true;
          } else {
            p.checkpoints.save(p.chain.chainId, p.keyId, saved as ScanCursor, stored ?? null);
            // Own what the slot holds now: the saved cursor, or the unchanged one when the write was lost to a full or
            // failing storage (retried at the next page). Anything else is another writer's, so yield to it.
            const after = loadCheckpoint(p.checkpoints, p.chain.chainId, p.keyId);
            if (sameCursor(after, saved as ScanCursor) || sameCursor(after, stored)) ownedCheckpoint = after;
            else checkpointYielded = true;
          }
        }
      }
      p.onProgress?.({ nextBlock: cursor.nextBlock, scanned, matches: all.length, skipped, caughtUp: !res.truncated && cursor.nextBlock > res.head, discrepancies: discrepancies.length, ...narrowed() });
      if (!res.truncated) break;
    }
  } catch (e) {
    // Cancel while a reply was pending: return what was found so far.
    if (e !== ABORTED) throw e;
  } finally {
    p.signal.removeEventListener('abort', stopWorker);
    try { stopWorker(); } finally { zeroizeBytes(p.viewingKey); }
  }
  const scanHead = cursor.last?.number ?? (cursor.nextBlock > 0n ? cursor.nextBlock - 1n : 0n);
  // A budget/discrepancy/Cancel still leaves the window at the latest reported reachable head, making unscanned
  // blocks a lower bound. A lagging provider can lower that head below a prior page or cursor; do not retain an
  // obsolete high-water mark or count announcements beyond the current window.
  const windowHead = reachableHead ?? scanHead;
  const counted = trustedSeen + openSeen > 0 || scanned > 0;
  let transfers: TransferEstimate | undefined;
  if (p.privacySetTransfers === true && counted && !p.signal.aborted) {
    // The latest ERC-20 payment found sets the token and the amount band; the query itself names neither address.
    const paid = all.filter((m) => m.metadata?.kind === 'erc20').sort((x, y) => (x.announcement.blockNumber < y.announcement.blockNumber ? 1 : x.announcement.blockNumber > y.announcement.blockNumber ? -1 : 0))[0];
    transfers = paid?.metadata === undefined
      ? { status: 'unknown', reason: 'noPayment' }
      : await estimateSimilarTransfers({ client: p.client, chain: p.chain, token: paid.metadata.token, amount: paid.metadata.netAmount, head: windowHead });
  }
  const anonymity = counted ? anonymitySet({ chain: p.chain, routerBlocks, head: windowHead, scannedFrom: p.cursor.nextBlock, scannedTo: scanHead, ...(transfers === undefined ? {} : { transfers }) }) : undefined;
  return { matches: all, cursor, scanned, discrepancies, limitReached, backlog, routerOnlyBlocks: [...routerOnlyBlocks], ...(secondaryLag === undefined ? {} : { secondaryLag }), telemetry: { trusted: trustedSeen, open: openSeen, suspected, anonymity } };
}

/**
 * The block hash at `height` reported by the primary and, when configured, also by the second provider. After a
 * confirmed rollback it tells orphaned saved observations from unchanged ones; a missing block or any disagreement
 * throws, so nothing is invalidated and the next scan retries.
 */
async function canonicalHashAt(p: ScanParams, height: bigint): Promise<Hex> {
  const [primary, independent] = await Promise.all([p.client.getBlock(height), p.secondaryClient?.getBlock(height)]);
  const hash = primary?.hash.toLowerCase();
  if (hash === undefined || (p.secondaryClient !== undefined && (independent == null || independent.hash.toLowerCase() !== hash))) {
    throw new ChainAdapterError('RPC_FAILURE', 'canonical block hash unavailable');
  }
  return hash as Hex;
}

/** Bounded, fresh two-provider checks immediately before irreversible historical invalidation. */
async function confirmRollback(p: ScanParams, previous: ScanCursor, replacement: ScanCursor, rolledBackTo: bigint): Promise<readonly ProviderDiscrepancy[]> {
  const secondary = p.secondaryClient;
  if (secondary === undefined) return [];
  const heights = new Set([rolledBackTo]);
  if (previous.last !== undefined) heights.add(previous.last.number);
  if (replacement.last !== undefined) heights.add(replacement.last.number);
  const observed = new Map<bigint, string>();
  try {
    if (secondary.chainId !== p.chain.chainId) return [{ kind: 'secondary_error', ref: rolledBackTo.toString() }];
    // Re-read after the independent RPC awaits: a transient fork or an equivocating primary
    // must not turn a stale rollback report into permanent tombstones.
    for (let pass = 0; pass < 2; pass++) {
      const anchors = await Promise.all([...heights].map(async (number) => {
        const [primary, independent] = await Promise.all([p.client.getBlock(number), secondary.getBlock(number)]);
        return { number, primary, independent };
      }));
      if (p.signal.aborted) return [];
      for (const { number, primary, independent } of anchors) {
        const hash = primary?.hash.toLowerCase();
        if (hash === undefined || independent === null || hash !== independent.hash.toLowerCase() ||
            (observed.has(number) && observed.get(number) !== hash) ||
            (replacement.last?.number === number && hash !== replacement.last.hash.toLowerCase()) ||
            (rolledBackTo < previous.nextBlock && previous.last?.number === number && hash === previous.last.hash.toLowerCase())) {
          return [{ kind: 'block_hash_differs', ref: number.toString() }];
        }
        observed.set(number, hash);
      }
    }
    return [];
  } catch {
    return [{ kind: 'secondary_error', ref: rolledBackTo.toString() }];
  }
}

/**
 * A router-attributed announcement alone is still just a claim. Only independent transfer evidence can be shown as
 * received; pending applies only to evidence-backed, non-final funds.
 */
function receiptStatus(verification: PaymentVerification | undefined): ReceiptStatus {
  if (verification?.status !== 'received') return 'claimed';
  return verification.final ? 'verified' : 'pending';
}

/** What decides where the next scan starts, as announcement blocks. Cover checks count the same as real ones. */
interface ReplayChecks {
  /** Every check of this run that saw evidence-backed but non-final funds. */
  readonly pending: readonly bigint[];
  /** This page's router checks that degraded to `claimed`. */
  readonly failed: readonly bigint[];
}

/**
 * The cursor that is safe to persist: `finalityDepth` blocks behind the fetched position. Matches seen in that tail were only
 * `pending` and live in memory alone, so the next session re-scans (and re-verifies) the tail instead of skipping it.
 * Blocks already `finalityDepth` deep below `head` need no such tail, so when the scan is behind the head the checkpoint
 * moves up to the cursor itself: otherwise a run held by a budget a few pages in, each page narrower than `finalityDepth`,
 * would save the same checkpoint on every resume and never pass the spam (A5). Either way it never passes this run's
 * earliest `pending` check, and never moves behind where this run started. Router checks that degraded to `claimed`
 * get one replay: only while they are on the current page and above this run's floor, so neither an old claim nor one
 * the resumed run has just retried can pin every later checkpoint. With cover on, cover checks follow the same two
 * rules, so the block reads after a pending or failed check do not single out the seller's payments.
 *
 * With a second provider, whichever anchor is saved (the replay-tail block, or the page end when the cursor itself is saved)
 * must hold the ba0fd59 invariant: its hash is read from both providers plus a second primary read after the secondary
 * answers, and all three agree. Any failure is a discrepancy and the checkpoint is withheld: the page-end comparison in
 * compareProviders alone does not cover a primary that switches its answer afterwards.
 */
async function persistable(p: ScanParams, cursor: ScanCursor, floor: bigint, head: bigint, checks: ReplayChecks, retryHeight?: bigint): Promise<ScanCursor | readonly ProviderDiscrepancy[] | undefined> {
  const depth = BigInt(p.chain.finalityDepth);
  let next = cursor.nextBlock > depth ? cursor.nextBlock - depth : 0n;
  let settled = head + 1n > depth ? head + 1n - depth : 0n;
  if (cursor.nextBlock < settled) settled = cursor.nextBlock;
  if (settled > next) next = settled;
  // A payment check that saw a lower head than the log fetch can leave a match pending below either edge: re-scan it.
  for (const block of checks.pending) if (block < next) next = block;
  // A router claim whose verification failed is reported as `claimed`; the failure may be transient (RPC trouble) or
  // permanent (indirect router call, unparsable metadata), and the two are not distinguishable here. Give it ONE
  // replay: only claims from this page, and only above this run's floor. A claim at the floor was already retried by
  // this run (it resumed from that block), so pinning it again would make every resume restart there and, when the
  // next page is held by the open-lane budget or the match limit, never save past it (A5 liveness).
  for (const block of checks.failed) if (block > floor && block < next) next = block;
  // A previously accepted payment disappeared from this run but its block could not be confirmed as replaced.
  if (retryHeight !== undefined && retryHeight < next) next = retryHeight;
  if (next < floor) next = floor;
  if (next >= cursor.nextBlock) {
    if (p.secondaryClient === undefined || cursor.last === undefined) return cursor;
    // The page end becomes the canonical record for the next resume: corroborate it afresh, as for the tail anchor.
    const agreed = await corroborateAnchor(p, p.secondaryClient, cursor.last.number);
    if (p.signal.aborted) return undefined;
    if (typeof agreed !== 'string') return agreed;
    return agreed === cursor.last.hash.toLowerCase() ? cursor : [{ kind: 'block_hash_differs', ref: cursor.last.number.toString() }];
  }
  if (next === 0n) return { nextBlock: 0n };
  // Keep reorg detection for the stored position: bind it to the hash of the block just before it.
  const height = next - 1n;
  if (p.secondaryClient !== undefined) {
    // This anchor is a different block from the compared page end. A later resume treats it as the
    // canonical record, so a primary-only hash here could fake a reorg and invalidate real history.
    const conflicts = await corroborateAnchor(p, p.secondaryClient, height);
    if (p.signal.aborted) return undefined;
    return typeof conflicts === 'string' ? { nextBlock: next, last: { number: height, hash: conflicts as `0x${string}` } } : conflicts;
  }
  const ref = await p.client.getBlock(height);
  return ref === null ? { nextBlock: next } : { nextBlock: next, last: { number: height, hash: ref.hash } };
}

/** Fresh primary, secondary and primary re-read of one block; returns the agreed hash or the discrepancy. */
async function corroborateAnchor(p: ScanParams, secondary: RpcClient, height: bigint): Promise<string | readonly ProviderDiscrepancy[]> {
  const ref = height.toString();
  try {
    if (secondary.chainId !== p.chain.chainId || p.client.chainId !== p.chain.chainId) return [{ kind: 'secondary_error', ref }];
    const [primary, independent] = await Promise.all([p.client.getBlock(height), secondary.getBlock(height)]);
    if (p.signal.aborted) return [];
    // Re-read after the independent await so a primary that switches answers mid-check is caught.
    const again = await p.client.getBlock(height);
    if (p.signal.aborted) return [];
    if (independent === null) return [{ kind: 'secondary_error', ref }];
    const hash = primary?.hash.toLowerCase();
    if (primary === null || again === null || primary.number !== height || independent.number !== height || again.number !== height ||
        hash === undefined || !/^0x[0-9a-f]{64}$/.test(hash) || hash !== independent.hash.toLowerCase() || hash !== again.hash.toLowerCase()) {
      return [{ kind: 'block_hash_differs', ref }];
    }
    return hash;
  } catch {
    return [{ kind: 'secondary_error', ref }];
  }
}

/** A store that throws on read is treated as empty, like an unreadable slot. */
function loadCheckpoint(store: CheckpointStore, chainId: number, keyId: string): ScanCursor | undefined {
  try {
    return store.load(chainId, keyId);
  } catch {
    return undefined;
  }
}

/** Same resume position and anchor (hash compared case-insensitively). */
function sameCursor(a: ScanCursor | undefined, b: ScanCursor | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.nextBlock !== b.nextBlock) return false;
  if (a.last === undefined || b.last === undefined) return a.last === b.last;
  return a.last.number === b.last.number && a.last.hash.toLowerCase() === b.last.hash.toLowerCase();
}

function zeroizeBytes(b: Uint8Array): void {
  b.fill(0);
}

const KEY_ID = /^[0-9a-f]{64}$/;
const validScope = (chainId: number, keyId: string): boolean => Number.isSafeInteger(chainId) && KEY_ID.test(keyId);

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  /** Web Storage enumeration, used only to purge legacy slots; adapters without it cannot purge unknown names. */
  readonly length?: number;
  key?(index: number): string | null;
}

/** Snapshot names before removing them: Web Storage indexes shift after each removal. Never read legacy values. */
function sweepLegacySlots(storage: StorageLike | undefined): void {
  const stale: string[] = [];
  try {
    const count = storage?.length;
    if (storage === undefined || typeof storage.key !== 'function' || count === undefined || !Number.isSafeInteger(count)) return;
    for (let i = 0; i < count; i++) {
      const name = storage.key(i);
      if (name !== null && isLegacyCheckpointSlot(name)) stale.push(name);
    }
  } catch {
    /* still remove any names already found */
  }
  for (const name of stale) {
    try { storage?.removeItem(name); } catch { /* best effort */ }
  }
}

function parseCursor(text: string): ScanCursor | undefined {
  const o = JSON.parse(text) as { nextBlock?: unknown; last?: { number?: unknown; hash?: unknown } };
  if (typeof o.nextBlock !== 'string' || !/^\d{1,20}$/.test(o.nextBlock)) return undefined;
  const last = o.last;
  if (last !== undefined && typeof last.number === 'string' && /^\d{1,20}$/.test(last.number) && typeof last.hash === 'string' && /^0x[0-9a-f]{64}$/.test(last.hash)) {
    return { nextBlock: BigInt(o.nextBlock), last: { number: BigInt(last.number), hash: last.hash as `0x${string}` } };
  }
  return { nextBlock: BigInt(o.nextBlock) };
}

/** localCheckpointStore's read result when getItem throws (distinct from an empty or malformed slot). */
const UNREADABLE: unique symbol = Symbol('unreadable checkpoint slot');

const encodeCursor = (cursor: ScanCursor): string =>
  JSON.stringify({ nextBlock: cursor.nextBlock.toString(), ...(cursor.last === undefined ? {} : { last: { number: cursor.last.number.toString(), hash: cursor.last.hash } }) });

/**
 * Whether verifying this router announcement reaches the network: the same conditions `verifyClaimedPayment` checks
 * before its first request (router caller, router metadata with a positive amount and a supported asset, well-formed
 * transaction hash, block hash and log index). Cover is drawn only from announcements that pass, so a cover lookup
 * is never a silent one.
 */
function sendsLookups(chain: ChainConfig, router: Address, a: ScannedAnnouncement, meta: ParsedMetadata): boolean {
  if (a.caller.toLowerCase() !== router.toLowerCase()) return false;
  if (a.blockNumber < 0n || meta.netAmount <= 0n) return false;
  if (meta.kind === 'erc20' && findToken(chain.chainId, meta.token) === undefined) return false;
  const hash32 = /^0x[0-9a-fA-F]{64}$/;
  return a.transactionHash !== undefined && hash32.test(a.transactionHash) && hash32.test(a.blockHash)
    && Number.isSafeInteger(a.logIndex) && a.logIndex >= 0 && a.logIndex <= 0xffffff;
}

/**
 * Public scan cursor persistence (block number and hash only; no keys, no matches). Tolerates storage failures.
 *
 * v4 names use #211's HKDF and session-bound key lending, with a distinct version from both incompatible v3 formats.
 * Without the matching loaded seller keys nothing is read or written. Legacy v1/v2/v3 cursors are never read: the scan
 * restarts from the user's chosen block. Creating the store purges all old slots if storage supports enumeration. For
 * non-enumerable adapters, save/clear still remove the known v2 slot, while unknown old names remain unread and unused.
 */
export function localCheckpointStore(storage: StorageLike | undefined, viewingKey: ViewingKeyLender = sessionViewingKey): CheckpointStore {
  sweepLegacySlots(storage);
  const named = checkpointSlotNamer(viewingKey);
  const slot = (chainId: number, keyId: string): string | undefined => (validScope(chainId, keyId) ? named(chainId, keyId) : undefined);
  /**
   * The stored cursor. `undefined` is an empty slot, or a value that was read but is unparsable or malformed (overwritten,
   * never trusted). UNREADABLE means getItem itself failed: the slot may hold a newer cursor, so it must not be replaced.
   */
  const read = (name: string): ScanCursor | undefined | typeof UNREADABLE => {
    let text: string | null | undefined;
    try { text = storage?.getItem(name); } catch { return UNREADABLE; }
    if (text === null || text === undefined) return undefined;
    try { return parseCursor(text); } catch { return undefined; }
  };
  return {
    load(chainId, keyId) {
      try {
        const name = slot(chainId, keyId);
        const cursor = name === undefined ? undefined : read(name);
        return cursor === UNREADABLE ? undefined : cursor;
      } catch {
        return undefined;
      }
    },
    save(chainId, keyId, cursor, expected) {
      try {
        const name = slot(chainId, keyId);
        if (name === undefined) return;
        // PRIV-06 F1: no last-writer-wins within this document, where read, compare and write are one synchronous step.
        // This is not a cross-document atomic compare-and-swap: another tab's recent write may not be visible here yet,
        // so a stale write can still land (residual race; its effect is a later rescan, never a skipped block).
        const current = read(name);
        if (current === UNREADABLE) return;
        if (expected === undefined ? current !== undefined && cursor.nextBlock < current.nextBlock : !sameCursor(current, expected ?? undefined)) return;
        storage?.setItem(name, encodeCursor(cursor));
        storage?.removeItem(legacyCheckpointSlot(chainId, keyId));
      } catch {
        /* checkpoints are an optimisation */
      }
    },
    clear(chainId, keyId) {
      if (!validScope(chainId, keyId)) return;
      // A v2 name is public and can be removed even without the seller keys.
      try { storage?.removeItem(legacyCheckpointSlot(chainId, keyId)); } catch { /* best effort */ }
      try {
        const name = slot(chainId, keyId);
        if (name !== undefined) storage?.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

// i18n-use: error.scanClient.theScannerDidNotAnswerInTimeAndWasStopped error.scanClient.theScannerWorkerFailed error.scanClient.theScannerRejectedTheKeys error.scanClient.theScannerReturnedAnUnexpectedReply
