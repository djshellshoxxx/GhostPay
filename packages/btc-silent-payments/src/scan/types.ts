import type { CompressedPoint } from '../secret.js';

/** Tweak data (`input_hash * A`, 33-byte compressed) for the eligible transactions of one block. */
export interface BlockTweaks {
  readonly height: number;
  /** 64 hex chars. */
  readonly blockHash: string;
  readonly tweaks: readonly CompressedPoint[];
}

/** A taproot output created in a block. */
export interface BlockOutput {
  /** 32-byte x-only output key. */
  readonly xOnlyPublicKey: Uint8Array;
  readonly txid?: string;
  readonly vout?: number;
  readonly amountSats?: bigint;
}

/** Taproot outputs created in one block. */
export interface BlockOutputs {
  readonly height: number;
  /** 64 hex chars. */
  readonly blockHash: string;
  readonly outputs: readonly BlockOutput[];
}

/**
 * Where block-level scan data comes from (an oracle, an own node or a test fake).
 *
 * @security PRIVACY CONTRACT: implementations receive only a block height and an optional
 * `AbortSignal`. They MUST NOT be given the scan key, the spend key, labels, addresses or any
 * value derived from them. The scanner never passes such data (asserted by tests).
 */
export interface TweakSource {
  /** Height of the chain tip known to the source. */
  getTipHeight(signal?: AbortSignal): Promise<number>;
  /** Tweak data of all eligible transactions in the block at `height`. */
  getTweaks(height: number, signal?: AbortSignal): Promise<BlockTweaks>;
  /** Taproot outputs created in the block at `height`. */
  getOutputs(height: number, signal?: AbortSignal): Promise<BlockOutputs>;
}
