import { err, ok, readClock, type Clock, type Result } from './result.js';
import {
  MS_DAY,
  MS_MIN,
  daysFromCivil,
  daysInMonth,
  localToUtc,
  weekdayOfDays,
  type CivilDate,
  type TzOffset,
} from './time.js';
import { checkKeys, isPlainObject, validInt } from './validate.js';

export type Frequency = 'daily' | 'weekly' | 'monthly';

/** Hard upper year; bounds every iteration so loops always terminate. */
export const MAX_YEAR = 2200;
export const MIN_YEAR = 2000;
export const MAX_UPCOMING = 100;

/**
 * Recurrence rule. Times are local wall-clock in the host's zone (via {@link TzOffset}),
 * so "09:00 daily" stays at 09:00 across DST changes.
 */
export interface RecurrenceRule {
  readonly frequency: Frequency;
  /** Every N days/weeks/months, 1..365 (months: 1..120). */
  readonly interval: number;
  /** First local date; also the anchor for interval counting. */
  readonly startDate: CivilDate;
  /** Local minutes after midnight, 0..1439. */
  readonly timeOfDayMinutes: number;
  /** Weekly only: 0=Sun..6=Sat, defaults to the weekday of startDate. */
  readonly weekdays?: readonly number[];
  /** Monthly only: 1..31, clamped to month length (Jan 31 -> Feb 28/29 -> Mar 31). */
  readonly dayOfMonth?: number;
  /** Inclusive UTC instant after which no occurrence is produced. */
  readonly endMs?: number;
  /** Total occurrence cap, 1..10000. */
  readonly maxOccurrences?: number;
}

const KEYS = [
  'frequency',
  'interval',
  'startDate',
  'timeOfDayMinutes',
  'weekdays',
  'dayOfMonth',
  'endMs',
  'maxOccurrences',
];

/**
 * Validate an untrusted rule and normalise it (sorted unique weekdays, defaults filled).
 * @security Bounded years/intervals/counts guarantee finite, fast iteration.
 */
export function validateRule(input: unknown): Result<RecurrenceRule> {
  if (!isPlainObject(input)) return err('bad_rule', 'rule must be an object');
  const k = checkKeys(input, KEYS, 'rule');
  if (!k.ok) return k;
  const f = input['frequency'];
  if (f !== 'daily' && f !== 'weekly' && f !== 'monthly') {
    return err('bad_rule', 'frequency must be daily, weekly or monthly');
  }
  const interval = validInt(input['interval'], 'interval', 1, f === 'monthly' ? 120 : 365);
  if (!interval.ok) return interval;
  const sd = input['startDate'];
  if (!isPlainObject(sd)) return err('bad_rule', 'startDate must be an object');
  const sk = checkKeys(sd, ['year', 'month', 'day'], 'startDate');
  if (!sk.ok) return sk;
  const year = validInt(sd['year'], 'year', MIN_YEAR, MAX_YEAR);
  if (!year.ok) return year;
  const month = validInt(sd['month'], 'month', 1, 12);
  if (!month.ok) return month;
  const day = validInt(sd['day'], 'day', 1, 31);
  if (!day.ok) return day;
  if (day.value > daysInMonth(year.value, month.value)) {
    return err('bad_rule', 'startDate is not a real calendar date');
  }
  const tod = validInt(input['timeOfDayMinutes'], 'timeOfDayMinutes', 0, 1439);
  if (!tod.ok) return tod;
  const startDate = { year: year.value, month: month.value, day: day.value };
  const startDays = daysFromCivil(startDate.year, startDate.month, startDate.day);

  let weekdays: readonly number[] | undefined;
  if (input['weekdays'] !== undefined) {
    if (f !== 'weekly') return err('bad_rule', 'weekdays only valid for weekly');
    const w: unknown = input['weekdays'];
    if (!Array.isArray(w) || w.length < 1 || w.length > 7) {
      return err('bad_rule', 'weekdays must have 1-7 entries');
    }
    const set = new Set<number>();
    for (const x of w as unknown[]) {
      const v = validInt(x, 'weekday', 0, 6);
      if (!v.ok) return v;
      set.add(v.value);
    }
    weekdays = [...set].sort((a, b) => a - b);
  } else if (f === 'weekly') {
    weekdays = [weekdayOfDays(startDays)];
  }

  let dayOfMonth: number | undefined;
  if (input['dayOfMonth'] !== undefined) {
    if (f !== 'monthly') return err('bad_rule', 'dayOfMonth only valid for monthly');
    const d = validInt(input['dayOfMonth'], 'dayOfMonth', 1, 31);
    if (!d.ok) return d;
    dayOfMonth = d.value;
  } else if (f === 'monthly') {
    dayOfMonth = startDate.day;
  }

  let endMs: number | undefined;
  if (input['endMs'] !== undefined) {
    const e = validInt(input['endMs'], 'endMs', 0, Number.MAX_SAFE_INTEGER);
    if (!e.ok) return e;
    endMs = e.value;
  }
  let maxOccurrences: number | undefined;
  if (input['maxOccurrences'] !== undefined) {
    const m = validInt(input['maxOccurrences'], 'maxOccurrences', 1, 10_000);
    if (!m.ok) return m;
    maxOccurrences = m.value;
  }
  return ok({
    frequency: f,
    interval: interval.value,
    startDate,
    timeOfDayMinutes: tod.value,
    ...(weekdays === undefined ? {} : { weekdays }),
    ...(dayOfMonth === undefined ? {} : { dayOfMonth }),
    ...(endMs === undefined ? {} : { endMs }),
    ...(maxOccurrences === undefined ? {} : { maxOccurrences }),
  });
}

function* candidateDays(rule: RecurrenceRule): Generator<number> {
  const startDays = daysFromCivil(rule.startDate.year, rule.startDate.month, rule.startDate.day);
  const maxDays = daysFromCivil(MAX_YEAR + 1, 1, 1);
  if (rule.frequency === 'daily') {
    for (let d = startDays; d < maxDays; d += rule.interval) yield d;
  } else if (rule.frequency === 'weekly') {
    const weekStart = startDays - weekdayOfDays(startDays);
    for (let base = weekStart; base < maxDays; base += 7 * rule.interval) {
      for (const wd of rule.weekdays ?? []) {
        if (base + wd >= startDays) yield base + wd;
      }
    }
  } else {
    const dom = rule.dayOfMonth ?? rule.startDate.day;
    const m0 = rule.startDate.year * 12 + rule.startDate.month - 1;
    for (let k = 0; ; k += rule.interval) {
      const m = m0 + k;
      const y = Math.floor(m / 12);
      if (y > MAX_YEAR) return;
      const mo = (m % 12) + 1;
      // Always computed from the anchor day-of-month: no drift after clamping.
      const d = daysFromCivil(y, mo, Math.min(dom, daysInMonth(y, mo)));
      if (d >= startDays) yield d;
    }
  }
}

/**
 * Lazily yield occurrence instants (UTC ms) in strictly increasing order.
 * @security Terminates: bounded by MAX_YEAR, endMs and maxOccurrences.
 */
export function* occurrences(rule: RecurrenceRule, tz: TzOffset): Generator<number> {
  let n = 0;
  let prev = -Infinity;
  for (const d of candidateDays(rule)) {
    if (rule.maxOccurrences !== undefined && n >= rule.maxOccurrences) return;
    const utc = localToUtc(d * MS_DAY + rule.timeOfDayMinutes * MS_MIN, tz);
    if (rule.endMs !== undefined && utc > rule.endMs) return;
    // Defensive: a pathological resolver must not produce non-increasing output.
    if (utc <= prev) continue;
    prev = utc;
    n++;
    yield utc;
  }
}

/** First occurrence strictly after `afterMs`, or null when the rule is exhausted. */
export function nextOccurrence(rule: RecurrenceRule, tz: TzOffset, afterMs: number): number | null {
  for (const o of occurrences(rule, tz)) if (o > afterMs) return o;
  return null;
}

/** Up to `count` (1..100) occurrences strictly after `afterMs`. */
export function listUpcoming(rule: RecurrenceRule, tz: TzOffset, afterMs: number, count: number): number[] {
  const n = Math.min(Math.max(Math.trunc(count), 0), MAX_UPCOMING);
  const out: number[] = [];
  if (n === 0) return out;
  for (const o of occurrences(rule, tz)) {
    if (o <= afterMs) continue;
    out.push(o);
    if (out.length >= n) break;
  }
  return out;
}

export type MissedPolicy = 'latest-only' | 'catch-up';

export interface EvaluateOptions {
  readonly rule: RecurrenceRule;
  readonly tz: TzOffset;
  readonly clock: Clock;
  /** Newest occurrence the user already handled (confirmed or dismissed), if any. */
  readonly lastHandledMs: number | null;
  /** 'latest-only' (default): one prompt; 'catch-up': up to maxCatchUp prompts. */
  readonly policy?: MissedPolicy;
  /** Occurrences older than this are skipped, never prompted. Default 7 days. */
  readonly maxAgeMs?: number;
  /** Cap for 'catch-up'. Default 5, max 20. */
  readonly maxCatchUp?: number;
}

/** An occurrence the user must explicitly confirm. Nothing is ever sent automatically. */
export interface DueOccurrence {
  readonly dueAtMs: number;
  readonly overdueMs: number;
  readonly needsUserConfirm: true;
}

export interface Evaluation {
  readonly due: readonly DueOccurrence[];
  /** Missed occurrences that will NOT be prompted (too old / superseded). Last 100 only. */
  readonly skipped: readonly number[];
  readonly skippedCount: number;
  readonly nextMs: number | null;
}

export const DEFAULT_MAX_AGE_MS = 7 * MS_DAY;

/**
 * Work out what is due now, what was missed, and what comes next.
 * @security Never auto-sends: every item has `needsUserConfirm: true`. Stale
 * occurrences are skipped rather than surfaced, so an old schedule cannot trigger
 * a surprise payment after a long absence.
 */
export function evaluateRecurrence(opts: EvaluateOptions): Evaluation {
  const now = readClock(opts.clock);
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!Number.isSafeInteger(maxAge) || maxAge < 0) throw new RangeError('invalid maxAgeMs');
  const catchUp = Math.min(Math.max(opts.maxCatchUp ?? 5, 1), 20);
  const policy = opts.policy ?? 'latest-only';
  const pending: number[] = [];
  let nextMs: number | null = null;
  for (const o of occurrences(opts.rule, opts.tz)) {
    if (o > now) {
      nextMs = o;
      break;
    }
    if (opts.lastHandledMs !== null && o <= opts.lastHandledMs) continue;
    pending.push(o);
  }
  const fresh = pending.filter((o) => now - o <= maxAge);
  const take = policy === 'latest-only' ? 1 : catchUp;
  const chosen = fresh.slice(-take);
  const skipped = pending.filter((o) => !chosen.includes(o));
  return {
    due: chosen.map((o) => ({ dueAtMs: o, overdueMs: now - o, needsUserConfirm: true as const })),
    skipped: skipped.slice(-100),
    skippedCount: skipped.length,
    nextMs,
  };
}
