import { createLabelTable } from '../labels.js';
import { fail, SilentPaymentError } from '../errors.js';
import { toHex } from '../ecc.js';
import { scanTweakAgainstSet, type FoundOutput, type ScanKeys } from '../receiver.js';
import type { BlockOutput, TweakSource } from './types.js';

/** An output that belongs to the receiver, with its chain position. */
export interface ReceivedOutput extends FoundOutput {
  readonly height: number;
  readonly blockHash: string;
  readonly txid?: string;
  readonly vout?: number;
  readonly amountSats?: bigint;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted;
}

/** Parameters of {@link scanBlocks}. */
export interface ScanBlocksParams {
  readonly source: TweakSource;
  readonly keys: ScanKeys;
  /** First block height (inclusive). */
  readonly fromHeight: number;
  /** Last block height (inclusive); defaults to the source's tip. */
  readonly toHeight?: number;
  readonly signal?: AbortSignal;
  /**
   * Largest number of blocks one call may scan (default {@link DEFAULT_MAX_SCAN_BLOCKS}). A hostile oracle that
   * reports an inflated tip can otherwise keep a wallet requesting forever.
   */
  readonly maxBlocks?: number;
  /**
   * Optional second, independent source (own node, another oracle). For every block in which this wallet found
   * outputs, the second source's block hash and outputs must agree with the first (hash, x-only key, txid, vout,
   * amount) or the scan fails closed. PRIVACY: the second source learns the heights of blocks that contain
   * payments to this wallet (the primary source learns every scanned height anyway).
   */
  readonly crossCheck?: TweakSource;
  /**
   * Optional per-output hook (for example a lookup in the user's own full node). Must return exactly `true`;
   * `false`, a non-boolean or a throw rejects the scan with a typed error. Runs before the output is yielded.
   */
  readonly verifyOutput?: (output: ReceivedOutput, signal?: AbortSignal) => boolean | Promise<boolean>;
}

/** Highest block height accepted (BlindBit and the request side use u32). */
export const MAX_SCAN_HEIGHT = 0xffffffff;
/** Default span limit of {@link scanBlocks}: about 38 years of blocks. */
export const DEFAULT_MAX_SCAN_BLOCKS = 2_000_000;
const MAX_VOUT = 0xffffffff;
const MAX_SATS = 21_000_000n * 100_000_000n;
const TXID = /^[0-9a-f]{64}$/;

/** Rejects chain metadata no honest source can produce (a source is untrusted, whichever implementation). */
function checkOutputBounds(o: BlockOutput): void {
  if (o.txid !== undefined && (typeof o.txid !== 'string' || !TXID.test(o.txid))) return fail('INVALID_RESPONSE');
  if (o.vout !== undefined && (!Number.isInteger(o.vout) || o.vout < 0 || o.vout > MAX_VOUT)) return fail('INVALID_RESPONSE');
  if (o.amountSats !== undefined && (typeof o.amountSats !== 'bigint' || o.amountSats < 0n || o.amountSats > MAX_SATS)) {
    return fail('INVALID_RESPONSE');
  }
}

function sameOutput(a: BlockOutput, b: BlockOutput): boolean {
  return toHex(a.xOnlyPublicKey) === toHex(b.xOnlyPublicKey) && a.txid === b.txid && a.vout === b.vout && a.amountSats === b.amountSats;
}

/**
 * Scans a block range for silent payments, entirely locally.
 *
 * @remarks For each block it asks the {@link TweakSource} for tweaks and taproot outputs
 * (by height only) and runs the BIP-352 receiver check on this machine. The scan key is never
 * given to the source. A block whose tweak and output data disagree on height or hash is treated
 * as a reorg/inconsistency and aborts with `REORG_DETECTED` (fail closed). Aborting via the
 * signal ends the iteration without error.
 *
 * @param p Source, keys and range.
 * @returns Async iterable of received outputs in block order.
 * @throws {SilentPaymentError} `INVALID_INPUT` (also for a span above `maxBlocks` or heights above u32), `REORG_DETECTED`, `TRANSPORT_FAILURE`, `INVALID_RESPONSE` (also for impossible txid/vout/amount values, a failed `verifyOutput`, or a `crossCheck` disagreement).
 * @security Uses the scan secret locally only. Block heights requested are visible to the source.
 */
export async function* scanBlocks(p: ScanBlocksParams): AsyncGenerator<ReceivedOutput> {
  const { source, keys, fromHeight, signal } = p;
  if (!Number.isInteger(fromHeight) || fromHeight < 0) return fail('INVALID_INPUT');
  if (isAborted(signal)) return;
  const toHeight = p.toHeight ?? (await source.getTipHeight(signal));
  if (!Number.isInteger(toHeight) || toHeight < fromHeight - 1 || toHeight > MAX_SCAN_HEIGHT || fromHeight > MAX_SCAN_HEIGHT) {
    return fail('INVALID_INPUT');
  }
  const maxBlocks = p.maxBlocks ?? DEFAULT_MAX_SCAN_BLOCKS;
  if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1) return fail('INVALID_INPUT');
  if (toHeight - fromHeight + 1 > maxBlocks) return fail('INVALID_INPUT');
  const labels = keys.labels ?? createLabelTable(keys.scanSecret);
  for (let height = fromHeight; height <= toHeight; height++) {
    if (isAborted(signal)) return;
    const [tw, outs] = await Promise.all([
      source.getTweaks(height, signal),
      source.getOutputs(height, signal),
    ]);
    if (tw.height !== height || outs.height !== height || tw.blockHash !== outs.blockHash) {
      return fail('REORG_DETECTED');
    }
    for (const o of outs.outputs) checkOutputBounds(o);
    // Several outputs of one block may pay the same x-only key (nothing on chain prevents it, and
    // anyone can copy a key they saw). Keep every occurrence: each is spendable by this wallet and
    // must be reported with its OWN txid/vout/amount, never another output's.
    const byKey = new Map<string, BlockOutput[]>();
    for (const o of outs.outputs) {
      const k = toHex(o.xOnlyPublicKey);
      const list = byKey.get(k);
      if (list === undefined) byKey.set(k, [o]);
      else list.push(o);
    }
    const candidates = new Set(byKey.keys());
    const found: ReceivedOutput[] = [];
    for (const tweak of tw.tweaks) {
      if (isAborted(signal)) return;
      for (const f of scanTweakAgainstSet(keys, tweak, candidates, labels)) {
        for (const meta of byKey.get(toHex(f.xOnlyPublicKey)) ?? []) {
          found.push({
            ...f,
            height,
            blockHash: tw.blockHash,
            ...(meta.txid === undefined ? {} : { txid: meta.txid }),
            ...(meta.vout === undefined ? {} : { vout: meta.vout }),
            ...(meta.amountSats === undefined ? {} : { amountSats: meta.amountSats }),
          });
        }
      }
    }
    if (found.length > 0 && p.crossCheck !== undefined) await crossCheckBlock(p.crossCheck, height, tw.blockHash, found, byKey, signal);
    for (const r of found) {
      if (isAborted(signal)) return;
      if (p.verifyOutput !== undefined) await runHook(p.verifyOutput, r, signal);
      yield r;
    }
  }
}

async function runHook(hook: NonNullable<ScanBlocksParams['verifyOutput']>, r: ReceivedOutput, signal?: AbortSignal): Promise<void> {
  let ok: unknown;
  try {
    ok = await hook(r, signal);
  } catch (e) {
    if (e instanceof SilentPaymentError) throw e;
    return fail('TRANSPORT_FAILURE');
  }
  if (ok !== true) return fail('INVALID_RESPONSE');
}

async function crossCheckBlock(
  second: TweakSource,
  height: number,
  blockHash: string,
  found: readonly ReceivedOutput[],
  byKey: ReadonlyMap<string, readonly BlockOutput[]>,
  signal?: AbortSignal,
): Promise<void> {
  const other = await second.getOutputs(height, signal);
  if (other.height !== height || other.blockHash !== blockHash) return fail('REORG_DETECTED');
  for (const o of other.outputs) checkOutputBounds(o);
  for (const f of found) {
    const mine = (byKey.get(toHex(f.xOnlyPublicKey)) ?? []).find((m) => m.txid === f.txid && m.vout === f.vout && m.amountSats === f.amountSats);
    if (mine === undefined || !other.outputs.some((o) => sameOutput(o, mine))) return fail('INVALID_RESPONSE');
  }
}
