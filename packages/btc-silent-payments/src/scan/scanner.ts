import { createLabelTable } from '../labels.js';
import { fail } from '../errors.js';
import { toHex } from '../ecc.js';
import { scanTweakAgainstSet, type FoundOutput, type ScanKeys } from '../receiver.js';
import type { TweakSource } from './types.js';

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
 * @throws {SilentPaymentError} `INVALID_INPUT`, `REORG_DETECTED`, `TRANSPORT_FAILURE`, `INVALID_RESPONSE`.
 * @security Uses the scan secret locally only. Block heights requested are visible to the source.
 */
export async function* scanBlocks(p: ScanBlocksParams): AsyncGenerator<ReceivedOutput> {
  const { source, keys, fromHeight, signal } = p;
  if (!Number.isInteger(fromHeight) || fromHeight < 0) return fail('INVALID_INPUT');
  if (isAborted(signal)) return;
  const toHeight = p.toHeight ?? (await source.getTipHeight(signal));
  if (!Number.isInteger(toHeight) || toHeight < fromHeight - 1) return fail('INVALID_INPUT');
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
    // Several outputs of one block may pay the same x-only key (nothing on chain prevents it, and
    // anyone can copy a key they saw). Keep every occurrence: each is spendable by this wallet and
    // must be reported with its OWN txid/vout/amount, never another output's.
    const byKey = new Map<string, (typeof outs.outputs)[number][]>();
    for (const o of outs.outputs) {
      const k = toHex(o.xOnlyPublicKey);
      const list = byKey.get(k);
      if (list === undefined) byKey.set(k, [o]);
      else list.push(o);
    }
    const candidates = new Set(byKey.keys());
    for (const tweak of tw.tweaks) {
      if (isAborted(signal)) return;
      for (const f of scanTweakAgainstSet(keys, tweak, candidates, labels)) {
        for (const meta of byKey.get(toHex(f.xOnlyPublicKey)) ?? []) {
          yield {
            ...f,
            height,
            blockHash: tw.blockHash,
            ...(meta.txid === undefined ? {} : { txid: meta.txid }),
            ...(meta.vout === undefined ? {} : { vout: meta.vout }),
            ...(meta.amountSats === undefined ? {} : { amountSats: meta.amountSats }),
          };
        }
      }
    }
  }
}
