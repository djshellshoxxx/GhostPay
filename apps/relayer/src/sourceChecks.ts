import type { RpcClient } from '@ghostpay/chain-adapters';
import type { AlertSink } from './alerts.js';
import { RelayerError } from './errors.js';
import type { Metrics } from './metrics.js';

export interface SourceChecks { ensureAgreement(chainId: number): Promise<void> }
export interface SourcePair { readonly primary: RpcClient; readonly secondary: RpcClient; readonly finalityDepth: number }

/** Checks canonical block identity, not provider independence or agreement about arbitrary contract state. */
export class CanonicalSourceChecks implements SourceChecks {
  private readonly pending = new Map<number, Promise<void>>();
  public constructor(private readonly sources: ReadonlyMap<number, SourcePair>, private readonly alerts: AlertSink, private readonly metrics: Metrics) {}
  public ensureAgreement(chainId: number): Promise<void> {
    const pair = this.sources.get(chainId);
    if (pair === undefined) return Promise.resolve();
    const current = this.pending.get(chainId);
    if (current !== undefined) return current;
    const checking = this.check(chainId, pair).finally(() => { this.pending.delete(chainId); });
    this.pending.set(chainId, checking);
    return checking;
  }
  private async check(chainId: number, pair: SourcePair): Promise<void> {
    try {
      if (pair.primary.chainId !== chainId || pair.secondary.chainId !== chainId || !Number.isSafeInteger(pair.finalityDepth) || pair.finalityDepth < 1)
        throw new RelayerError(503, 'rpc_unavailable');
      const [primaryTip, secondaryTip] = await Promise.all([pair.primary.blockNumber(), pair.secondary.blockNumber()]);
      const lag = primaryTip >= secondaryTip ? primaryTip - secondaryTip : secondaryTip - primaryTip;
      if (lag > BigInt(pair.finalityDepth)) throw new RelayerError(503, 'rpc_unavailable');
      const height = (primaryTip < secondaryTip ? primaryTip : secondaryTip) - BigInt(pair.finalityDepth) + 1n;
      if (height < 0n) throw new RelayerError(503, 'rpc_unavailable');
      const [a, b] = await Promise.all([pair.primary.getBlock(height), pair.secondary.getBlock(height)]);
      if (a?.timestamp === undefined || b?.timestamp === undefined) throw new RelayerError(503, 'rpc_unavailable');
      if (a.number !== height || b.number !== height || a.hash !== b.hash || a.parentHash !== b.parentHash || a.timestamp !== b.timestamp) {
        this.metrics.inc('relayer_rpc_disagreements_total', { chain_id: chainId });
        this.alerts.send({ kind: 'rpc_disagree', chainId });
        throw new RelayerError(503, 'rpc_disagree');
      }
      this.metrics.inc('relayer_rpc_agreement_checks_total', { chain_id: chainId });
    } catch (error) {
      if (error instanceof RelayerError) throw error;
      throw new RelayerError(503, 'rpc_unavailable');
    }
  }
}
