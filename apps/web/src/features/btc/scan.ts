import {
  HeaderAnchoredTweakSource,
  scanBlocks,
  resumeScan,
  reconcileScanState,
  type ReceivedOutput,
  type ScanState,
  SilentPaymentError,
  zeroize,
  type HeaderChain,
  type SpendableOutput,
  type TweakSource,
} from '@ghostpay/btc-silent-payments';
import type { EsploraClient } from './esplora';
import { EsploraTweakSource } from './esplora';
import type { BtcWallet } from './wallet';
import { verifyMatchedOutput } from './inclusion';
import { CrossCheckedTweakSource, OracleTweakSource, type BtcOracleConfig, type ReadOracleBlock } from './oracleSource';

/** A detected silent payment output; spendability also requires the result's spentness evidence. */
export interface FoundPayment extends SpendableOutput {
  readonly height: number;
  readonly blockHash: string;
  readonly label: number | null;
  /** The source reported multiple outputs with this same x-only key, or replayed it at another height. */
  readonly duplicateKey: boolean;
}

/** Blocks per scan request: each block means downloading all of its transactions. */
export const MAX_SCAN_BLOCKS = 500;
/** Bound ephemeral matches and worker result size even for adversarial blocks. */
export const MAX_SCAN_MATCHES = 10_000;

export interface ScanParams {
  readonly client: EsploraClient;
  readonly wallet: { readonly net: BtcWallet['net']; readonly keys: Pick<BtcWallet['keys'], 'scanSecret' | 'spendPublicKey'> };
  readonly fromHeight: number;
  /** Inclusive; defaults to the server tip. */
  readonly toHeight?: number;
  readonly signal?: AbortSignal;
  readonly onBlock?: (height: number) => void;
  /**
   * Validated header chain (`headers.ts`). When given, the scan stops at its tip and every scanned block's hash must
   * equal the chain's hash at that height (else `REORG_DETECTED`), so the blocks scanned are those of the most-work
   * header chain known to this device. The view always passes it; without it blocks are only checked one by one.
   */
  readonly headers?: HeaderChain;
  /** Encrypted historical metadata. Only freshly revalidated outputs become spendable. Requires checked headers. */
  readonly resumeState?: ScanState;
  /** Paginate prior matched blocks without pausing the new-block cursor or trusting unvalidated history. */
  readonly recoveryOffset?: number;
  /** Bounded recovery page size; defaults to MAX_SCAN_BLOCKS. */
  readonly recoveryLimit?: number;
  /** Called after each fully scanned block; awaiting the encrypted commit bounds crash/cancel loss to one block. */
  readonly onState?: (state: ScanState) => void | Promise<void>;
  /** Explicit independent oracle policy; worker client owns its transport and never sends keys. */
  readonly oracle?: BtcOracleConfig;
  /** Worker-only typed bridge. Every full-block result must agree before it is offered or checkpointed. */
  readonly readOracle?: ReadOracleBlock;
  readonly readSecondOracle?: ReadOracleBlock;
  /**
   * Also ask the Esplora server, per outpoint, whether each payment is unspent (default false). PRIVACY: this tells the
   * server exactly which outputs are this wallet's; in exchange it also knows spends still waiting in the mempool, which
   * the local tracking (spends read from the scanned blocks themselves) cannot see.
   */
  readonly providerSpentCheck?: boolean;
}

/**
 * How the spent status of the returned payments was established: `local` from continuous block-input scanning
 * through the observed server tip (mempool spends remain invisible), `provider` by explicitly authorized queries,
 * `unknown` for an incomplete range or historical gap. Unknown outputs are discoveries, not sweepable outputs.
 */
export type SpentStatus = 'local' | 'provider' | 'unknown';

export interface ScanResult {
  readonly fromHeight: number;
  readonly toHeight: number;
  readonly found: readonly FoundPayment[];
  /** Detected outputs that were already spent (not offered for sweeping). */
  readonly spentCount: number;
  /** Scanned blocks plus any restored local-coverage tip anchor, ascending, for later reorganization checks. */
  readonly blocks: readonly { readonly height: number; readonly hash: string }[];
  /** The scanned blocks were checked against a validated header chain. */
  readonly headerAnchored: boolean;
  /** The prior matched block page revalidated in this result. Other historical matches remain unspendable. */
  readonly recoveredHistory?: { readonly offset: number; readonly end: number; readonly total: number };
  /** How `found` was filtered for spent outputs (see {@link SpentStatus}). */
  readonly spentStatus: SpentStatus;
}

/** Best-effort wipe of the spend tweaks held by scan results (used on lock, a new scan and unmount). */
export function wipeFound(found: readonly FoundPayment[]): void {
  for (const f of found) zeroize(f.spendTweak);
}

const outpointId = (txid: string, vout: number): string => `${txid}:${String(vout)}`;

/**
 * Scans a block range for silent payments to the wallet and drops outputs that are already spent.
 * Spent outputs are recognised locally: the source lists the outpoints each scanned block consumes (Esplora blocks
 * carry their inputs), the scanner matches them against the outputs it found and against the persisted unspent
 * matches, and the state records them, so the server learns no outpoint. A spend still in the mempool, or a spend in
 * a block scanned before spend tracking existed, is not visible; `providerSpentCheck` asks the server per outpoint
 * instead (and reveals the outpoints). The scan secret stays in this process; the server sees block heights.
 * Every spend tweak the scanner produced that is not in the returned `found` (spent, skipped, or all of them when
 * the scan fails) is wiped before this returns; the caller owns, and must wipe, the returned ones ({@link wipeFound}).
 */
export async function scanForPayments(p: ScanParams): Promise<ScanResult> {
  const { client, wallet, fromHeight, signal } = p;
  const checkAbort = (): void => { if (signal?.aborted === true) throw new SilentPaymentError('ABORTED'); };
  checkAbort();
  if (!Number.isInteger(fromHeight) || fromHeight < 0) throw new SilentPaymentError('INVALID_INPUT');
  const esplora = new EsploraTweakSource(client, wallet.net);
  const lightHeaders = p.oracle?.mode === 'light' ? p.headers : undefined;
  if (p.oracle?.mode === 'light' && (lightHeaders === undefined || p.providerSpentCheck !== true)) throw new SilentPaymentError('INVALID_INPUT');
  if (p.oracle !== undefined && p.readOracle === undefined) throw new SilentPaymentError('INVALID_INPUT');
  if (p.resumeState !== undefined && p.resumeState.matches.length > MAX_SCAN_MATCHES) throw new SilentPaymentError('UNSUPPORTED');
  const chosen: TweakSource = p.oracle?.mode === 'light' && p.readOracle !== undefined
    ? new OracleTweakSource(p.readOracle, () => client.tipHeight(signal))
    : p.readOracle === undefined ? esplora : new CrossCheckedTweakSource(esplora, p.readOracle);
  const plain = p.readSecondOracle === undefined ? chosen : new CrossCheckedTweakSource(chosen, p.readSecondOracle);
  const source: TweakSource = p.headers === undefined ? plain : new HeaderAnchoredTweakSource(plain, p.headers);
  const headerAnchored = p.headers !== undefined;
  const serverTip = await client.tipHeight(signal);
  const tip = p.headers === undefined ? serverTip : Math.min(serverTip, p.headers.tipHeight);
  const knownTip = p.headers === undefined ? serverTip : Math.max(serverTip, p.headers.tipHeight);
  const restored = p.resumeState;
  const recoveryOffset = p.recoveryOffset ?? 0;
  const recoveryLimit = p.recoveryLimit ?? MAX_SCAN_BLOCKS;
  if (!Number.isSafeInteger(recoveryOffset) || recoveryOffset < 0 || !Number.isSafeInteger(recoveryLimit) || recoveryLimit < 1 || recoveryLimit > MAX_SCAN_BLOCKS)
    throw new SilentPaymentError('INVALID_INPUT');
  if (restored !== undefined && (p.headers === undefined || restored.network !== wallet.net.id || restored.birthHeight !== fromHeight))
    throw new SilentPaymentError('INVALID_INPUT');
  const reconciled = restored === undefined ? undefined : await reconcileScanState(restored, (h) => p.headers?.hashAt(h));
  checkAbort();
  if (reconciled?.rolledBack === true) await p.onState?.(reconciled.state);
  const resumeHeight = reconciled?.resumeHeight ?? fromHeight;
  // Persistent scans advance in bounded pages; the next run resumes from the last committed block.
  const toHeight = Math.min(p.toHeight ?? tip, tip, restored === undefined ? tip : resumeHeight + MAX_SCAN_BLOCKS - 1);
  const providerCheck = p.providerSpentCheck === true;
  let spentStatus: SpentStatus = providerCheck ? 'provider' : source.getSpends === undefined || toHeight < knownTip ? 'unknown' : 'local';
  if (toHeight < fromHeight) return { fromHeight, toHeight, found: [], spentCount: 0, blocks: [], headerAnchored, spentStatus };
  if (toHeight - resumeHeight + 1 > MAX_SCAN_BLOCKS) throw new SilentPaymentError('INVALID_INPUT');

  const blocks: { height: number; hash: string }[] = [];
  const candidates: FoundPayment[] = [];
  const seen = new Set<string>();
  const tweaks = new Set<Uint8Array>();
  const found: FoundPayment[] = [];
  let returned = false;
  let recoveredHistory: ScanResult['recoveredHistory'];
  let spendsFromHeight = reconciled?.state.spendsFromHeight;
  const historicalOutpoints = new Map((reconciled?.state.matches ?? [])
    .filter((m) => m.status === 'confirmed' && m.txid !== undefined && m.vout !== undefined)
    .map((m) => [outpointId(m.txid!, m.vout!), { height: m.height, blockHash: m.blockHash }]));
  // A fresh scan observes all input history starting at the same height as its output discovery.
  if (reconciled === undefined && source.getSpends !== undefined) spendsFromHeight = fromHeight;
  // Outpoints a scanned block consumed: the spends reported for this call's own matches, plus the spends the state
  // already remembers (a persisted match re-derived below may have been spent in a block an earlier call scanned).
  const localSpent = new Set<string>();
  const noteSpend = (e: { readonly txid: string; readonly vout: number }): void => { localSpent.add(outpointId(e.txid, e.vout)); };
  const noteStateSpends = (state: ScanState): void => {
    // Load before recovery too: rereading a block for an unspent match can also rederive a spent sibling.
    // Restored metadata is independently capped at MAX_SCAN_MATCHES, so this set stays bounded.
    for (const m of state.matches) if (m.spent !== undefined && m.txid !== undefined && m.vout !== undefined) noteSpend({ txid: m.txid, vout: m.vout });
  };
  try {
    const keys = { scanSecret: wallet.keys.scanSecret, spendPublicKey: wallet.keys.spendPublicKey };
    const trackTweak = (r: ReceivedOutput): void => {
      if (!tweaks.has(r.spendTweak) && tweaks.size >= MAX_SCAN_MATCHES) { zeroize(r.spendTweak); throw new SilentPaymentError('UNSUPPORTED'); }
      tweaks.add(r.spendTweak);
    };
    const accept = (r: ReceivedOutput): void => {
      trackTweak(r);
      p.onBlock?.(r.height);
      if (r.txid === undefined || r.vout === undefined || r.amountSats === undefined) return;
      const id = `${r.txid}:${String(r.vout)}`;
      if (seen.has(id)) return;
      if (seen.size >= MAX_SCAN_MATCHES) throw new SilentPaymentError('UNSUPPORTED');
      seen.add(id);
      candidates.push({
        txid: r.txid, vout: r.vout, amountSats: r.amountSats, xOnlyPublicKey: r.xOnlyPublicKey,
        spendTweak: r.spendTweak, height: r.height, blockHash: r.blockHash, label: r.label, duplicateKey: r.duplicateKey,
      });
    };
    const common = { source, keys, toHeight, ...(signal === undefined ? {} : { signal }),
      ...(lightHeaders === undefined ? {} : { verifyOutput: (output: ReceivedOutput, proofSignal?: AbortSignal) => {
        trackTweak(output);
        return verifyMatchedOutput(client, lightHeaders, output, proofSignal);
      } }),
    };
    if (reconciled === undefined) {
      for await (const r of scanBlocks({ ...common, fromHeight, onSpend: noteSpend,
        onBlock: ({ height, blockHash }) => { blocks.push({ height, hash: blockHash }); },
      })) accept(r);
    } else {
      noteStateSpends(reconciled.state);
      // Restored metadata contains no spend tweak. Re-read prior matched blocks against current headers and
      // re-derive outputs. That proves discovery, not spentness: a legacy gap still requires a fresh full local
      // rescan or an explicit provider check before the UI may offer these outputs for sweeping.
      const recoveryHeights = [...new Set(reconciled.state.matches.filter((m) => m.status === 'confirmed' && m.spent === undefined && m.height <= toHeight).map((m) => m.height))].sort((a, b) => a - b);
      const offset = recoveryOffset >= recoveryHeights.length ? 0 : recoveryOffset;
      const end = Math.min(offset + recoveryLimit, recoveryHeights.length);
      recoveredHistory = { offset, end, total: recoveryHeights.length };
      for (const height of recoveryHeights.slice(offset, end)) {
        checkAbort();
        for await (const r of scanBlocks({ ...common, fromHeight: height, toHeight: height, onSpend: noteSpend,
          onBlock: ({ blockHash }) => { blocks.push({ height, hash: blockHash }); },
        })) accept(r);
      }
      // resumeScan watches the state's unspent matches itself and records their spends in each state it reports.
      for await (const r of resumeScan({ ...common, state: reconciled.state, hashAt: (h) => p.headers?.hashAt(h),
        onState: async (state) => {
          checkAbort();
          spendsFromHeight = state.spendsFromHeight;
          noteStateSpends(state);
          if (state.lastHash !== null) blocks.push({ height: state.lastHeight, hash: state.lastHash });
          await p.onState?.(state);
        },
      })) accept(r);
    }
    checkAbort();
    const keyCounts = new Map<string, number>();
    for (const c of candidates) {
      const key = Array.from(c.xOnlyPublicKey).join(',');
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    let spentCount = 0;
    for (const c of candidates) {
      checkAbort();
      if (localSpent.has(outpointId(c.txid, c.vout)) || (providerCheck && !(await client.isUnspent(c.txid, c.vout, signal)))) {
        spentCount++;
        continue;
      }
      const duplicateKey = c.duplicateKey || (keyCounts.get(Array.from(c.xOnlyPublicKey).join(',')) ?? 0) > 1;
      found.push(duplicateKey === c.duplicateKey ? c : { ...c, duplicateKey });
    }
    checkAbort();
    if (!providerCheck && found.some((c) => {
      if (spendsFromHeight === undefined || c.height < spendsFromHeight) return true;
      if (c.height >= resumeHeight) return false;
      // Input history covered only outpoints already watched at the time. A newly rediscovered output in an old
      // matched block may have a missed historical spend even though the same range was scanned previously.
      const prior = historicalOutpoints.get(outpointId(c.txid, c.vout));
      return prior === undefined || prior.height !== c.height || prior.blockHash !== c.blockHash;
    })) spentStatus = 'unknown';
    // A resumed-at-tip call may re-read only old discovery blocks. Retain the checked tip hash as evidence for the
    // saved input-coverage prefix too, so a later suffix reorganization cannot leave this result marked local.
    if (spentStatus === 'local' && p.headers !== undefined && !blocks.some((b) => b.height === toHeight)) {
      const hash = p.headers.hashAt(toHeight);
      if (hash === undefined) spentStatus = 'unknown';
      else blocks.push({ height: toHeight, hash });
    }
    returned = true;
    blocks.sort((a, b) => a.height - b.height);
    return { fromHeight, toHeight, found, spentCount, blocks, headerAnchored, spentStatus, ...(recoveredHistory === undefined ? {} : { recoveredHistory }) };
  } finally {
    // Outputs paying the same key share one tweak buffer: keep every buffer a returned output still uses.
    const kept = new Set<Uint8Array>(returned ? found.map((f) => f.spendTweak) : []);
    for (const t of tweaks) if (!kept.has(t)) zeroize(t);
  }
}
