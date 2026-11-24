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

/** One outpoint consumed by a transaction of a block. */
export interface BlockSpend {
  /** Spent outpoint's transaction id (64 hex chars). */
  readonly txid: string;
  readonly vout: number;
  /** Id of the transaction that spends it (64 hex chars). */
  readonly spentBy: string;
}

/** Every outpoint consumed by the transactions of one block (coinbase excluded). */
export interface BlockSpends {
  readonly height: number;
  /** 64 hex chars. */
  readonly blockHash: string;
  readonly spends: readonly BlockSpend[];
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
  /**
   * Optional: all outpoints spent by the block at `height`. Lets a wallet learn whether its outputs were spent
   * by matching locally, instead of asking a server per outpoint (which would reveal its UTXOs).
   */
  getSpends?(height: number, signal?: AbortSignal): Promise<BlockSpends>;
}
