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

/** A detected, still-unspent silent payment output. */
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
}

export interface ScanResult {
  readonly fromHeight: number;
  readonly toHeight: number;
  readonly found: readonly FoundPayment[];
  /** Detected outputs that were already spent (not offered for sweeping). */
  readonly spentCount: number;
  /** Every scanned block, ascending: lets a later header sync find results from blocks that left the chain. */
  readonly blocks: readonly { readonly height: number; readonly hash: string }[];
  /** The scanned blocks were checked against a validated header chain. */
  readonly headerAnchored: boolean;
  /** The prior matched block page revalidated in this result. Other historical matches remain unspendable. */
  readonly recoveredHistory?: { readonly offset: number; readonly end: number; readonly total: number };
}

/** Best-effort wipe of the spend tweaks held by scan results (used on lock, a new scan and unmount). */
export function wipeFound(found: readonly FoundPayment[]): void {
  for (const f of found) zeroize(f.spendTweak);
}

/**
 * Scans a block range for silent payments to the wallet and drops outputs that are already spent.
 * The scan secret stays in this process; the server sees block heights and outpoints only.
 * Every spend tweak the scanner produced that is not in the returned `found` (spent, skipped, or all of them when
 * the scan fails) is wiped before this returns; the caller owns, and must wipe, the returned ones ({@link wipeFound}).
 */
export async function scanForPayments(p: ScanParams): Promise<ScanResult> {
  const { client, wallet, fromHeight, signal } = p;
  const checkAbort = (): void => { if (signal?.aborted === true) throw new SilentPaymentError('ABORTED'); };
  if (!Number.isInteger(fromHeight) || fromHeight < 0) throw new SilentPaymentError('INVALID_INPUT');
  const esplora = new EsploraTweakSource(client, wallet.net);
  const lightHeaders = p.oracle?.mode === 'light' ? p.headers : undefined;
  if (p.oracle?.mode === 'light' && lightHeaders === undefined) throw new SilentPaymentError('INVALID_INPUT');
  if (p.oracle !== undefined && p.readOracle === undefined) throw new SilentPaymentError('INVALID_INPUT');
  const chosen: TweakSource = p.oracle?.mode === 'light' && p.readOracle !== undefined
    ? new OracleTweakSource(p.readOracle, () => client.tipHeight(signal))
    : p.readOracle === undefined ? esplora : new CrossCheckedTweakSource(esplora, p.readOracle);
  const plain = p.readSecondOracle === undefined ? chosen : new CrossCheckedTweakSource(chosen, p.readSecondOracle);
  const source: TweakSource = p.headers === undefined ? plain : new HeaderAnchoredTweakSource(plain, p.headers);
  const headerAnchored = p.headers !== undefined;
  const serverTip = await client.tipHeight(signal);
  const tip = p.headers === undefined ? serverTip : Math.min(serverTip, p.headers.tipHeight);
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
  if (toHeight < fromHeight) return { fromHeight, toHeight, found: [], spentCount: 0, blocks: [], headerAnchored };
  if (toHeight - resumeHeight + 1 > MAX_SCAN_BLOCKS) throw new SilentPaymentError('INVALID_INPUT');

  const blocks: { height: number; hash: string }[] = [];
  const candidates: FoundPayment[] = [];
  const seen = new Set<string>();
  const tweaks = new Set<Uint8Array>();
  const found: FoundPayment[] = [];
  let returned = false;
  let recoveredHistory: ScanResult['recoveredHistory'];
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
      for await (const r of scanBlocks({ ...common, fromHeight,
        onBlock: ({ height, blockHash }) => { blocks.push({ height, hash: blockHash }); },
      })) accept(r);
    } else {
      // Restored metadata contains no spend tweak. Re-read only prior matched blocks against current headers,
      // re-derive each output locally and check current outspend status before returning anything spendable.
      const recoveryHeights = [...new Set(reconciled.state.matches.filter((m) => m.status === 'confirmed' && m.spent === undefined && m.height <= toHeight).map((m) => m.height))].sort((a, b) => a - b);
      const offset = recoveryOffset >= recoveryHeights.length ? 0 : recoveryOffset;
      const end = Math.min(offset + recoveryLimit, recoveryHeights.length);
      recoveredHistory = { offset, end, total: recoveryHeights.length };
      for (const height of recoveryHeights.slice(offset, end)) {
        checkAbort();
        for await (const r of scanBlocks({ ...common, fromHeight: height, toHeight: height,
          onBlock: ({ blockHash }) => { blocks.push({ height, hash: blockHash }); },
        })) accept(r);
      }
      for await (const r of resumeScan({ ...common, state: reconciled.state, hashAt: (h) => p.headers?.hashAt(h),
        onState: async (state) => {
          checkAbort();
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
      if (await client.isUnspent(c.txid, c.vout, signal)) {
        const duplicateKey = c.duplicateKey || (keyCounts.get(Array.from(c.xOnlyPublicKey).join(',')) ?? 0) > 1;
        found.push(duplicateKey === c.duplicateKey ? c : { ...c, duplicateKey });
      }
      else spentCount++;
    }
    checkAbort();
    returned = true;
    blocks.sort((a, b) => a.height - b.height);
    return { fromHeight, toHeight, found, spentCount, blocks, headerAnchored, ...(recoveredHistory === undefined ? {} : { recoveredHistory }) };
  } finally {
    // Outputs paying the same key share one tweak buffer: keep every buffer a returned output still uses.
    const kept = new Set<Uint8Array>(returned ? found.map((f) => f.spendTweak) : []);
    for (const t of tweaks) if (!kept.has(t)) zeroize(t);
  }
}
