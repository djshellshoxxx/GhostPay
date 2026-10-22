/**
 * Pure civil-calendar and timezone math on UTC epoch milliseconds.
 * No `Date`, no `Intl`: the host injects a {@link TzOffset} resolver.
 */

export const MS_MIN = 60_000;
export const MS_DAY = 86_400_000;

/**
 * Injected resolver: minutes east of UTC in effect at a UTC instant
 * (e.g. -300 for EST). The host builds it from the user's IANA zone.
 * @security Output is validated; a hostile resolver cannot yield NaN/huge offsets.
 */
export type TzOffset = (utcMs: number) => number;

/** Fixed-UTC resolver. */
export const UTC: TzOffset = () => 0;

export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

/** Days since 1970-01-01 for a proleptic Gregorian date (Hinnant algorithm). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (DIM[month - 1] ?? 31);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOfDays(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

/** Offset in ms at a UTC instant, validated. */
export function offsetMs(tz: TzOffset, utcMs: number): number {
  const m = tz(utcMs);
  if (!Number.isInteger(m) || Math.abs(m) > 24 * 60) {
    throw new RangeError('tz resolver returned an invalid offset');
  }
  return m * MS_MIN;
}

/** Local wall-clock (as if UTC) for a UTC instant. */
export function utcToLocalMs(utcMs: number, tz: TzOffset): number {
  return utcMs + offsetMs(tz, utcMs);
}

/**
 * Convert a local wall-clock reading (expressed as ms "as if UTC") to a UTC instant.
 * Ambiguous (fall-back) times resolve to the first occurrence; nonexistent
 * (spring-forward gap) times resolve forward by the gap, so the event still happens
 * exactly once per local day.
 * @security Deterministic and total: never returns NaN or throws for valid resolvers.
 */
export function localToUtc(localMs: number, tz: TzOffset): number {
  const offs = [offsetMs(tz, localMs - MS_DAY), offsetMs(tz, localMs + MS_DAY)];
  const valid: number[] = [];
  for (const o of offs) {
    const cand = localMs - o;
    if (offsetMs(tz, cand) === o) valid.push(cand);
  }
  if (valid.length > 0) return Math.min(...valid);
  return localMs - Math.min(...offs);
}
