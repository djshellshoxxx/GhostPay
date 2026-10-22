import { toHex } from './ecc.js';
import { fail } from './errors.js';
import { createLabelTable } from './labels.js';
import { scanTweakAgainstSet, type FoundOutput, type ScanKeys } from './receiver.js';
import type { CompressedPoint } from './secret.js';

/** Tweak data (`input_hash * A`) and taproot outputs of one block. */
export interface BlockData {
  readonly height: number;
  /** 64 hex chars. */
  readonly blockHash: string;
  readonly tweaks: readonly CompressedPoint[];
  readonly outputs: readonly BlockOutput[];
}

/** A taproot output created in a block. */
export interface BlockOutput {
  /** 32-byte x-only output key. */
  readonly xOnlyPublicKey: Uint8Array;
  readonly txid?: string;
  readonly vout?: number;
  readonly amountSats?: bigint;
}

/**
 * Where block-level scan data comes from (an indexer, an own node or a test fake).
 *
 * @security PRIVACY CONTRACT: implementations receive only a block height and an optional
 * `AbortSignal`, never keys, labels or addresses.
 */
export interface TweakSource {
  getTipHeight(signal?: AbortSignal): Promise<number>;
  getBlock(height: number, signal?: AbortSignal): Promise<BlockData>;
}

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
  readonly fromHeight: number;
  /** Inclusive; defaults to the source's tip. */
  readonly toHeight?: number;
  readonly signal?: AbortSignal;
}

/**
 * Scans a block range for silent payments, entirely locally.
 *
 * @remarks The source sees block heights only. A block whose reported height differs from the
 * requested one aborts with `REORG_DETECTED` (fail closed). Aborting via the signal ends the
 * iteration without error.
 *
 * @param p Source, keys and range.
 * @returns Async iterable of received outputs in block order.
 * @throws {BtcFamilyError} `INVALID_INPUT`, `REORG_DETECTED`.
 * @security Uses the scan secret locally only.
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
    const block = await source.getBlock(height, signal);
    if (block.height !== height) return fail('REORG_DETECTED');
    const byKey = new Map<string, BlockOutput>();
    for (const o of block.outputs) byKey.set(toHex(o.xOnlyPublicKey), o);
    const candidates = new Set(byKey.keys());
    for (const tweak of block.tweaks) {
      for (const f of scanTweakAgainstSet(keys, tweak, candidates, labels)) {
        const meta = byKey.get(toHex(f.xOnlyPublicKey));
        yield {
          ...f,
          height,
          blockHash: block.blockHash,
          ...(meta?.txid === undefined ? {} : { txid: meta.txid }),
          ...(meta?.vout === undefined ? {} : { vout: meta.vout }),
          ...(meta?.amountSats === undefined ? {} : { amountSats: meta.amountSats }),
        };
      }
    }
  }
}
