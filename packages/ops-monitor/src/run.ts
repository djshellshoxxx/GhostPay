import type { Finding, MonitorContext, Probe } from './types.js';
import { errTag, mk } from './util.js';

/**
 * Runs all probes concurrently and concatenates their findings in probe order.
 *
 * @remarks A probe that rejects (or returns a non-array) becomes one `warn` finding with subject
 * `monitor`; the runner itself never throws because of a probe.
 * @security A broken watcher must be loud, not silent: the fault is surfaced as `warn`, never dropped.
 * @param probes Probes to run.
 * @param ctx Shared read-only context.
 * @returns All findings.
 */
export async function runOnce(probes: readonly Probe[], ctx: MonitorContext): Promise<Finding[]> {
  const results = await Promise.all(
    probes.map(async (p): Promise<Finding[]> => {
      try {
        const r = await p.run(ctx);
        if (!Array.isArray(r)) throw new Error('bad result');
        return r;
      } catch (e) {
        return [mk(p.id, 'warn', 'monitor', `probe failed (${errTag(e)})`)];
      }
    }),
  );
  return results.flat();
}
