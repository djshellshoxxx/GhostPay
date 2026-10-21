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
  /**
   * True when more than one output in the block carries this x-only key (possible spoof attempt,
   * TS-01). Every such output is returned; the caller must not assume the first is the real one.
   */
  readonly duplicateKey: boolean;
  /**
   * True only when the caller-supplied {@link OutputVerifier} confirmed this output against an
   * independent source. Oracle-reported data (txid, vout, amount, height) is otherwise UNVERIFIED (TS-02).
   */
  readonly verified: boolean;
}

/**
 * Independent check of an oracle-reported output (own node `getrawtransaction`, second oracle).
 * Return `true` only if the script is `5120||x`, and txid/vout/amount/height all match.
 */
export type OutputVerifier = (o: Omit<ReceivedOutput, 'verified'>, signal?: AbortSignal) => Promise<boolean>;

/** Default cap on blocks per {@link scanBlocks} call (TS-04: bounds oracle requests). */
export const DEFAULT_MAX_BLOCKS = 200_000;

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
  /** Maximum number of heights scanned in one call; default {@link DEFAULT_MAX_BLOCKS}. Exceeding it fails `INVALID_INPUT`. */
  readonly maxBlocks?: number;
  /** Optional independent verification. Outputs failing it are dropped; passing ones get `verified: true`. */
  readonly verifier?: OutputVerifier;
  /**
   * x-only keys (hex) already reported. A BIP-352 output key cannot legitimately recur at another height
   * (its inputs are spent), so a key seen here again is flagged `duplicateKey` (NC-03). Pass a set you
   * persist to extend this across calls; it is updated in place.
   */
  readonly seenKeys?: Set<string>;
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
  const maxBlocks = p.maxBlocks ?? DEFAULT_MAX_BLOCKS;
  if (!Number.isInteger(maxBlocks) || maxBlocks < 1 || toHeight - fromHeight + 1 > maxBlocks) {
    return fail('INVALID_INPUT');
  }
  // (txid:vout) already yielded in this call: an oracle repeating an output at several heights counts once.
  const seenOutpoints = new Set<string>();
  const seenKeys = p.seenKeys ?? new Set<string>();
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
    const byKey = new Map<string, (typeof outs.outputs)[number][]>();
    for (const o of outs.outputs) {
      const k = toHex(o.xOnlyPublicKey);
      const list = byKey.get(k);
      if (list === undefined) byKey.set(k, [o]);
      else list.push(o);
    }
    const candidates = new Set(byKey.keys());
    const priorKey = new Map<string, boolean>();
    for (const tweak of tw.tweaks) {
      if (isAborted(signal)) return;
      for (const f of scanTweakAgainstSet(keys, tweak, candidates, labels)) {
        const metas = byKey.get(toHex(f.xOnlyPublicKey)) ?? [];
        const kHex = toHex(f.xOnlyPublicKey);
        let prior = priorKey.get(kHex);
        if (prior === undefined) {
          prior = seenKeys.has(kHex);
          priorKey.set(kHex, prior);
          seenKeys.add(kHex);
        }
        const duplicateKey = metas.length > 1 || prior;
        for (const meta of metas) {
          if (meta.txid !== undefined && meta.vout !== undefined) {
            const op = `${meta.txid}:${meta.vout}`;
            if (seenOutpoints.has(op)) continue;
            seenOutpoints.add(op);
          }
          const base = {
            ...f,
            height,
            blockHash: tw.blockHash,
            ...(meta.txid === undefined ? {} : { txid: meta.txid }),
            ...(meta.vout === undefined ? {} : { vout: meta.vout }),
            ...(meta.amountSats === undefined ? {} : { amountSats: meta.amountSats }),
            duplicateKey,
          };
          if (p.verifier === undefined) {
            yield { ...base, verified: false };
          } else if (await p.verifier(base, signal)) {
            yield { ...base, verified: true };
          }
        }
      }
    }
  }
}
