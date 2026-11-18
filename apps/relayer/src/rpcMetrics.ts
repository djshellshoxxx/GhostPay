import type { Metrics } from './metrics.js';

/** Measures transport time to response headers (including failures), without retaining URL, method, or body data. */
export function timedRpcFetch(metrics: Metrics, chainId: number, now: () => number, fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const started = now();
    try {
      return await fetchImpl(input, init);
    } finally {
      metrics.observe('relayer_rpc_latency_seconds', Math.max(0, now() - started) / 1000, { chain_id: chainId });
    }
  };
}
