import { BillingError } from './errors.js';

/** Maximum period index supported (bounds all loops). */
export const MAX_PERIOD_INDEX = 100_000;
const DAY = 86_400;

/** Billing cadence. `custom` is a fixed number of seconds. */
export type Cadence =
  | { readonly kind: 'weekly'; readonly every: number }
  | { readonly kind: 'monthly'; readonly every: number }
  | { readonly kind: 'custom'; readonly seconds: number };

/** Schedule definition: anchored at `anchor` (unix seconds, UTC). */
export interface ScheduleSpec {
  readonly anchor: number;
  readonly cadence: Cadence;
}

/** A billing period `[start, end)` in unix seconds. */
export interface Period {
  readonly index: number;
  readonly start: number;
  readonly end: number;
}

function int(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new BillingError('SCHEDULE', 'invalid schedule');
  return v;
}

/**
 * Validates a schedule spec.
 *
 * @throws {BillingError} `SCHEDULE`.
 */
export function validateSchedule(s: ScheduleSpec): void {
  int(s.anchor, 0, 253_402_300_799);
  const c = s.cadence;
  if (c.kind === 'weekly' || c.kind === 'monthly') int(c.every, 1, 24);
  else if (c.kind === 'custom') int(c.seconds, 3600, 366 * DAY);
  else throw new BillingError('SCHEDULE', 'invalid cadence');
}

function monthStart(spec: ScheduleSpec & { cadence: { kind: 'monthly'; every: number } }, n: number): number {
  const a = new Date(spec.anchor * 1000);
  const total = a.getUTCMonth() + n * spec.cadence.every;
  const year = a.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(a.getUTCDate(), dim);
  const ms = Date.UTC(year, month, day, a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds());
  return ms / 1000;
}

/**
 * Start of period `n` (UTC, deterministic).
 *
 * @remarks Computed from the anchor, never from the previous period, so month-end
 * clamping does not drift: anchor Jan 31 gives Feb 28/29, then Mar 31, Apr 30.
 *
 * @param n Period index, 0..{@link MAX_PERIOD_INDEX}.
 * @throws {BillingError} `SCHEDULE`.
 */
export function periodStart(spec: ScheduleSpec, n: number): number {
  validateSchedule(spec);
  int(n, 0, MAX_PERIOD_INDEX);
  const c = spec.cadence;
  if (c.kind === 'weekly') return spec.anchor + n * c.every * 7 * DAY;
  if (c.kind === 'custom') return spec.anchor + n * c.seconds;
  return monthStart({ anchor: spec.anchor, cadence: c }, n);
}

/** Period `n` as `[start, end)`. */
export function periodAt(spec: ScheduleSpec, n: number): Period {
  return { index: n, start: periodStart(spec, n), end: periodStart(spec, n + 1) };
}

/**
 * Index of the period containing `t`, or -1 when `t` is before the anchor.
 *
 * @throws {BillingError} `SCHEDULE` when `t` is beyond the supported horizon.
 */
export function periodIndexAt(spec: ScheduleSpec, t: number): number {
  validateSchedule(spec);
  int(t, 0, 253_402_300_799);
  if (t < spec.anchor) return -1;
  if (periodStart(spec, MAX_PERIOD_INDEX) <= t) throw new BillingError('SCHEDULE', 'beyond horizon');
  let lo = 0;
  let hi = MAX_PERIOD_INDEX;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (periodStart(spec, mid) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Lists `count` (1..1000) consecutive periods from index `from`. */
export function listPeriods(spec: ScheduleSpec, from: number, count: number): readonly Period[] {
  int(count, 1, 1000);
  int(from, 0, MAX_PERIOD_INDEX - count);
  return Array.from({ length: count }, (_, i) => periodAt(spec, from + i));
}
