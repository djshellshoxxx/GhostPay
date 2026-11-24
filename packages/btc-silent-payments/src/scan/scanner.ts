import { createLabelTable } from '../labels.js';
import { fail, SilentPaymentError } from '../errors.js';
import { toHex } from '../ecc.js';
import { scanTweakAgainstSet, type FoundOutput, type ScanKeys } from '../receiver.js';
import type { BlockOutput, BlockOutputs, BlockSpend, BlockTweaks, TweakSource } from './types.js';

/** An output that belongs to the receiver, with its chain position. */
export interface ReceivedOutput extends FoundOutput {
  readonly height: number;
  readonly blockHash: string;
  readonly txid?: string;
  readonly vout?: number;
  readonly amountSats?: bigint;
  /** Multiple block outputs share this key, or it reappeared in a prior scan. */
  readonly duplicateKey: boolean;
  /** True only when an independent verifier confirmed this output. */
  readonly verified: boolean;
}

/** A watched outpoint was consumed by a transaction in a scanned block. */
export interface SpendEvent extends BlockSpend {
  readonly height: number;
  readonly blockHash: string;
}

/** Independent check of oracle-reported txid/vout/amount and output script. */
export type OutputVerifier = (output: Omit<ReceivedOutput, 'verified'>, signal?: AbortSignal) => boolean | Promise<boolean>;

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
   * Optional sampling of `crossCheck`: besides every block with matches, each block WITHOUT matches is also
   * cross-checked (block hash, full tweak list and full output list must agree) when `random() < rate`, so a primary
   * source that omits tweaks or outputs in blocks the wallet did not match is caught with probability `rate` per
   * block. `rate` 0 is the default behaviour, 1 checks every block. `random` must return a number in `[0, 1)`; the
   * caller injects it (this library draws no randomness itself). Requires `crossCheck`.
   * PRIVACY: sampling also hides from the second source which of the heights it is asked about hold payments.
   */
  readonly crossCheckSample?: { readonly rate: number; readonly random: () => number };
  /**
   * Optional per-output hook (for example a lookup in the user's own full node). Must return exactly `true`;
   * `false`, a non-boolean or a throw rejects the scan with a typed error. Runs before the output is yielded.
   */
  readonly verifyOutput?: (output: ReceivedOutput, signal?: AbortSignal) => boolean | Promise<boolean>;
  /** Optional verifier: false drops the output; absent verifier leaves it explicitly unverified. */
  readonly verifier?: OutputVerifier;
  /** Persisted x-only keys already returned; repeated keys are flagged and the set is updated. */
  readonly seenKeys?: Set<string>;
  /**
   * Called once per block after all of that block's outputs were yielded (also for blocks with none), so a
   * caller can persist progress. Not called for a block interrupted by abort.
   */
  readonly onBlock?: (block: { readonly height: number; readonly blockHash: string }) => void | Promise<void>;
  /**
   * Outpoints (`txid:vout`, e.g. persisted matches) whose spending should be reported through `onSpend`, in
   * addition to every outpoint found earlier in this call. Matched locally: never sent to the source.
   */
  readonly watchOutpoints?: ReadonlySet<string>;
  /**
   * Receives each spend of a watched or found outpoint. Only used when the source implements `getSpends`, which is
   * then called once per block (after its outputs, before `onBlock`); without this callback spends are not requested.
   */
  readonly onSpend?: (event: SpendEvent) => void | Promise<void>;
}

/** Highest block height accepted (BlindBit and the request side use u32). */
export const MAX_SCAN_HEIGHT = 0xffffffff;
/** Default span limit of {@link scanBlocks}: about 38 years of blocks. */
export const DEFAULT_MAX_SCAN_BLOCKS = 2_000_000;
/** Most spends one block may report: a 4 MWU block holds under 25 000 inputs. */
export const MAX_SPENDS_PER_BLOCK = 100_000;
const MAX_VOUT = 0xffffffff;
const MAX_SATS = 21_000_000n * 100_000_000n;
const TXID = /^[0-9a-f]{64}$/;
const OUTPOINT = /^[0-9a-f]{64}:(0|[1-9][0-9]{0,9})$/;

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

function checkSpendBounds(s: unknown): asserts s is BlockSpend {
  if (typeof s !== 'object' || s === null) return fail('INVALID_RESPONSE');
  const { txid, vout, spentBy } = s as Record<string, unknown>;
  if (typeof txid !== 'string' || !TXID.test(txid) || typeof spentBy !== 'string' || !TXID.test(spentBy) || spentBy === txid) {
    return fail('INVALID_RESPONSE');
  }
  if (!Number.isInteger(vout) || (vout as number) < 0 || (vout as number) > MAX_VOUT) return fail('INVALID_RESPONSE');
}

/** Decides, for a block without matches, whether the sampled cross-check runs; `random()` is validated each draw. */
function sampled(sample: NonNullable<ScanBlocksParams['crossCheckSample']>): boolean {
  if (sample.rate === 0) return false;
  const r = sample.random();
  if (typeof r !== 'number' || !(r >= 0 && r < 1)) return fail('INVALID_INPUT');
  return r < sample.rate;
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
 * @throws {SilentPaymentError} `INVALID_INPUT` (also for a span above `maxBlocks` or heights above u32, a malformed `watchOutpoints` id, or a `crossCheckSample` without `crossCheck`, with a rate outside [0, 1] or a draw outside [0, 1)), `REORG_DETECTED` (also when `getSpends` or a sampled cross-check reports another hash), `TRANSPORT_FAILURE`, `INVALID_RESPONSE` (also for impossible txid/vout/amount/spend values, more than {@link MAX_SPENDS_PER_BLOCK} spends, a failed `verifyOutput`, or a `crossCheck` disagreement).
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
  const sample = p.crossCheckSample;
  if (sample !== undefined) {
    if (p.crossCheck === undefined || typeof sample.random !== 'function') return fail('INVALID_INPUT');
    if (typeof sample.rate !== 'number' || !(sample.rate >= 0 && sample.rate <= 1)) return fail('INVALID_INPUT');
  }
  const watch = p.watchOutpoints ?? new Set<string>();
  for (const id of watch) if (!OUTPOINT.test(id)) return fail('INVALID_INPUT');
  const seenKeys = p.seenKeys ?? new Set<string>();
  const seenOutpoints = new Set<string>();
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
    const priorKey = new Map<string, boolean>();
    for (const tweak of tw.tweaks) {
      if (isAborted(signal)) return;
      for (const f of scanTweakAgainstSet(keys, tweak, candidates, labels)) {
        const keyHex = toHex(f.xOnlyPublicKey);
        const metas = byKey.get(keyHex) ?? [];
        let prior = priorKey.get(keyHex);
        if (prior === undefined) {
          prior = seenKeys.has(keyHex);
          priorKey.set(keyHex, prior);
          seenKeys.add(keyHex);
        }
        for (const meta of metas) {
          if (meta.txid !== undefined && meta.vout !== undefined) {
            const outpoint = `${meta.txid}:${meta.vout}`;
            if (seenOutpoints.has(outpoint)) continue;
            seenOutpoints.add(outpoint);
          }
          found.push({
            ...f,
            height,
            blockHash: tw.blockHash,
            ...(meta.txid === undefined ? {} : { txid: meta.txid }),
            ...(meta.vout === undefined ? {} : { vout: meta.vout }),
            ...(meta.amountSats === undefined ? {} : { amountSats: meta.amountSats }),
            duplicateKey: metas.length > 1 || prior,
            verified: false,
          });
        }
      }
    }
    if (p.crossCheck !== undefined) {
      if (found.length > 0) await crossCheckBlock(p.crossCheck, height, tw.blockHash, found, byKey, signal);
      else if (sample !== undefined && sampled(sample)) await crossCheckWholeBlock(p.crossCheck, tw, outs, signal);
    }
    for (const r of found) {
      if (isAborted(signal)) return;
      if (p.verifyOutput !== undefined) await runHook(p.verifyOutput, r, signal);
      if (p.verifier === undefined) {
        yield r;
      } else if (await runVerifier(p.verifier, r, signal)) {
        yield { ...r, verified: true };
      }
    }
    if (isAborted(signal)) return;
    if (p.onSpend !== undefined && source.getSpends !== undefined) {
      const sp = await source.getSpends(height, signal);
      if (sp.height !== height || sp.blockHash !== tw.blockHash) return fail('REORG_DETECTED');
      if (!Array.isArray(sp.spends) || sp.spends.length > MAX_SPENDS_PER_BLOCK) return fail('INVALID_RESPONSE');
      for (const sIn of sp.spends) {
        checkSpendBounds(sIn);
        const id = `${sIn.txid}:${sIn.vout}`;
        if (!watch.has(id) && !seenOutpoints.has(id)) continue;
        if (isAborted(signal)) return;
        await p.onSpend({ txid: sIn.txid, vout: sIn.vout, spentBy: sIn.spentBy, height, blockHash: tw.blockHash });
      }
    }
    if (isAborted(signal)) return;
    if (p.onBlock !== undefined) await p.onBlock({ height, blockHash: tw.blockHash });
  }
}

async function runVerifier(verifier: OutputVerifier, r: ReceivedOutput, signal?: AbortSignal): Promise<boolean> {
  try {
    return await verifier(r, signal) === true;
  } catch (e) {
    if (e instanceof SilentPaymentError) throw e;
    return fail('TRANSPORT_FAILURE');
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

const outputKey = (o: BlockOutput): string => `${toHex(o.xOnlyPublicKey)}|${o.txid ?? ''}|${o.vout === undefined ? '' : String(o.vout)}|${o.amountSats === undefined ? '' : String(o.amountSats)}`;

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

/** Sampled check of a block without matches: the second source must serve the same hash, tweaks and outputs. */
async function crossCheckWholeBlock(second: TweakSource, tw: BlockTweaks, outs: BlockOutputs, signal?: AbortSignal): Promise<void> {
  const [otherTw, otherOuts] = await Promise.all([second.getTweaks(tw.height, signal), second.getOutputs(tw.height, signal)]);
  if (otherTw.height !== tw.height || otherTw.blockHash !== tw.blockHash || otherOuts.height !== tw.height || otherOuts.blockHash !== tw.blockHash) {
    return fail('REORG_DETECTED');
  }
  for (const o of otherOuts.outputs) checkOutputBounds(o);
  if (!sameMultiset(otherTw.tweaks.map(toHex), tw.tweaks.map(toHex))) return fail('INVALID_RESPONSE');
  if (!sameMultiset(otherOuts.outputs.map(outputKey), outs.outputs.map(outputKey))) return fail('INVALID_RESPONSE');
}
