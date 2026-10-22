import { assertTestnetChain, fail, requireInt } from './errors.js';
import { randomInt, type RandomSource } from './random.js';

/** Inputs of {@link planSchedule}. */
export interface ScheduleOptions {
  readonly chainId: number;
  /** Number of parts, 1..8. */
  readonly k: number;
  readonly gapMinSec: number;
  readonly gapMaxSec: number;
  /** Total horizon from plan start in seconds. */
  readonly horizonSec: number;
  /** Start offset of the first part in seconds, `0..gapMaxSec` (default 0). */
  readonly firstOffsetSec?: number;
  readonly random: RandomSource;
}

const MAX_SEC = 30 * 24 * 3600;
const RETRIES = 200;

/**
 * Random schedule: due offsets (ms from plan start) for `k` parts.
 *
 * @remarks Gaps are iid uniform in `[max(1ms, gapMin), gapMax]` from the injected CSPRNG with rejection
 * sampling, so due times are strictly increasing. Draws whose total exceeds the horizon are rejected
 * and redrawn (uniform over the feasible set). Nothing is signed or queued here.
 * @security Timing is friction only; it does not hide the IP and a closed tab cancels the plan.
 * @param o Options.
 * @returns Ascending offsets in ms, first in `[0, gapMaxSec*1000]`, last `<= horizonSec*1000`.
 * @throws {AmountBlurError} `INVALID_INPUT`, `HORIZON_TOO_SHORT`, `RANDOM_FAILED`, `CHAIN_NOT_ALLOWED`.
 */
export function planSchedule(o: ScheduleOptions): readonly number[] {
  assertTestnetChain(o.chainId);
  const k = requireInt(o.k, 1, 8, 'k');
  const gapMin = requireInt(o.gapMinSec, 0, MAX_SEC, 'gapMinSec');
  const gapMax = requireInt(o.gapMaxSec, 0, MAX_SEC, 'gapMaxSec');
  const horizon = requireInt(o.horizonSec, 0, MAX_SEC, 'horizonSec');
  const firstSec = requireInt(o.firstOffsetSec ?? 0, 0, MAX_SEC, 'firstOffsetSec');
  if (gapMax < gapMin) fail('INVALID_INPUT', 'gapMaxSec below gapMinSec');
  if (k > 1 && gapMax < 1) fail('INVALID_INPUT', 'gapMaxSec must be positive for several parts');
  if (firstSec > gapMax) fail('INVALID_INPUT', 'firstOffsetSec above gapMaxSec');
  const lo = Math.max(1, gapMin * 1000);
  const hi = gapMax * 1000;
  const first = firstSec * 1000;
  const horizonMs = horizon * 1000;
  if (first > horizonMs || first + (k - 1) * lo > horizonMs) fail('HORIZON_TOO_SHORT', 'schedule does not fit the horizon');
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const out: number[] = [first];
    let t = first;
    for (let i = 1; i < k; i += 1) {
      t += randomInt(o.random, lo, hi);
      out.push(t);
    }
    if (t <= horizonMs) return Object.freeze(out);
  }
  return fail('HORIZON_TOO_SHORT', 'schedule does not fit the horizon');
}
