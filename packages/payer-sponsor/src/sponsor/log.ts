import type { Hex } from 'viem';
import type { SponsoredMode } from './types.js';

/** Coarse latency bucket (finer values would be a timing side channel in logs). */
export type LatencyBucket = '<100ms' | '<1s' | '<10s' | '>=10s';

/** The ONLY fields the sponsor logs (PH-GEN-4): no payer, stealth, IP, calldata, quote contents or keys. */
export interface SponsorLogEntry {
  readonly mode: SponsoredMode | 'unknown';
  readonly chainId: number;
  readonly outcome: 'ok' | 'rejected' | 'reverted' | 'error';
  readonly latencyBucket: LatencyBucket;
  readonly txHash?: Hex | undefined;
}

/** Receives one JSON line per entry. */
export type LogSink = (line: string) => void;

/**
 * Buckets a latency.
 *
 * @param ms Milliseconds.
 * @returns The bucket label.
 */
export function latencyBucket(ms: number): LatencyBucket {
  if (ms < 100) return '<100ms';
  if (ms < 1_000) return '<1s';
  if (ms < 10_000) return '<10s';
  return '>=10s';
}

/**
 * Creates the field-allowlisted logger. Extra properties on an entry (even if a caller smuggles them
 * in with a cast) are dropped by explicit field copying.
 *
 * @param sink Line sink (for example `console.log`).
 * @returns A logger function.
 */
export function createLogger(sink: LogSink): (entry: SponsorLogEntry) => void {
  return (entry) => {
    const out: Record<string, unknown> = {
      mode: entry.mode,
      chainId: entry.chainId,
      outcome: entry.outcome,
      latencyBucket: entry.latencyBucket,
    };
    if (entry.txHash !== undefined) out['txHash'] = entry.txHash;
    sink(JSON.stringify(out));
  };
}
