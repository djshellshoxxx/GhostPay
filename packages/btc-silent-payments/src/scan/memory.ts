import { SilentPaymentError } from '../errors.js';
import type { BlockOutputs, BlockTweaks, TweakSource } from './types.js';

/** One block of fake data. */
export interface MemoryBlock {
  readonly tweaks: BlockTweaks;
  readonly outputs: BlockOutputs;
}

/** A recorded call to the fake. */
export interface MemoryRequest {
  readonly method: 'getTipHeight' | 'getTweaks' | 'getOutputs';
  readonly height?: number;
}

/**
 * In-memory {@link TweakSource} for tests and offline use. Records every call so tests can
 * assert what a scanner disclosed.
 */
export class InMemoryTweakSource implements TweakSource {
  public readonly requests: MemoryRequest[] = [];
  private readonly blocks = new Map<number, MemoryBlock>();

  public constructor(blocks: readonly MemoryBlock[]) {
    for (const b of blocks) this.blocks.set(b.tweaks.height, b);
  }

  public getTipHeight(): Promise<number> {
    this.requests.push({ method: 'getTipHeight' });
    let tip = -1;
    for (const h of this.blocks.keys()) tip = Math.max(tip, h);
    return Promise.resolve(tip);
  }

  public getTweaks(height: number): Promise<BlockTweaks> {
    this.requests.push({ method: 'getTweaks', height });
    const b = this.blocks.get(height);
    return b === undefined
      ? Promise.reject(new SilentPaymentError('TRANSPORT_FAILURE'))
      : Promise.resolve(b.tweaks);
  }

  public getOutputs(height: number): Promise<BlockOutputs> {
    this.requests.push({ method: 'getOutputs', height });
    const b = this.blocks.get(height);
    return b === undefined
      ? Promise.reject(new SilentPaymentError('TRANSPORT_FAILURE'))
      : Promise.resolve(b.outputs);
  }
}
