import type { AlertSink } from './alerts.js';

const WINDOW_MS = 300_000;
const DEDUPE_MS = 900_000;
const THRESHOLD = 100;

/** Bounded trailing-window rejection detector. Unconfigured chains share one anonymous bucket. */
export class RejectSpikeDetector {
  private readonly buckets = new Map<number, { times: number[]; alertAt?: number }>();

  public constructor(chainIds: readonly number[], private readonly alerts: AlertSink, private readonly now: () => number) {
    this.buckets.set(0, { times: [] });
    for (const chainId of chainIds) this.buckets.set(chainId, { times: [] });
  }

  /** Records one rejected quote or sweep without retaining any request identifier or contents. */
  public record(chainId?: number): void {
    const key = chainId !== undefined && this.buckets.has(chainId) ? chainId : 0;
    const bucket = this.buckets.get(key);
    if (bucket === undefined) return;
    const now = this.now();
    bucket.times = bucket.times.filter((at) => at <= now && now - at < WINDOW_MS);
    bucket.times.push(now);
    if (bucket.times.length > THRESHOLD + 1) bucket.times.shift();
    if (bucket.times.length <= THRESHOLD || (bucket.alertAt !== undefined && now - bucket.alertAt < DEDUPE_MS)) return;
    bucket.alertAt = now;
    this.alerts.send({ kind: 'reject_spike', ...(key === 0 ? {} : { chainId: key }), value: THRESHOLD + 1, threshold: THRESHOLD });
  }
}
