import { ExportError } from './errors.js';

/** Latest representable instant: 9999-12-31T23:59:59.999Z. */
export const MAX_TIMESTAMP_MS = 253_402_300_799_999;

/** Supported date column formats. `date` and `unix` are lossy (day / second). */
export type DateFormat = 'iso' | 'date' | 'unix';

/** Throws unless `ms` is a safe integer within 0..MAX_TIMESTAMP_MS. */
export function assertTimestamp(ms: number): void {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > MAX_TIMESTAMP_MS) {
    throw new ExportError('INVALID_DATE', 'timestamp must be an integer ms in 0..9999-12-31');
  }
}

/** Formats epoch milliseconds in UTC. Never uses the local time zone. */
export function formatTimestamp(ms: number, format: DateFormat = 'iso'): string {
  assertTimestamp(ms);
  if (format === 'unix') return String(Math.floor(ms / 1000));
  const iso = new Date(ms).toISOString();
  return format === 'date' ? iso.slice(0, 10) : iso;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function utc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number {
  const t = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const back = new Date(t);
  // Date.UTC maps years 0..99 to 1900..1999 and normalises overflow; reject both.
  if (
    y < 100 ||
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  ) {
    throw new ExportError('INVALID_DATE', 'not a valid calendar date/time');
  }
  return t;
}

/**
 * Strictly parses a timestamp written by {@link formatTimestamp}.
 * ISO must end in `Z` (UTC); offsets and local times are rejected.
 */
export function parseTimestamp(text: string, format: DateFormat = 'iso'): number {
  if (text.length > 40) throw new ExportError('INVALID_DATE', 'timestamp too long');
  if (format === 'unix') {
    if (!/^(0|[1-9]\d{0,12})$/.test(text)) throw new ExportError('INVALID_DATE', 'not a unix seconds integer');
    const ms = Number(text) * 1000;
    assertTimestamp(ms);
    return ms;
  }
  if (format === 'date') {
    const m = DAY.exec(text);
    if (!m) throw new ExportError('INVALID_DATE', 'not a YYYY-MM-DD date');
    return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const m = ISO.exec(text);
  if (!m) throw new ExportError('INVALID_DATE', 'not an ISO-8601 UTC timestamp');
  const frac = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  return utc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), frac);
}
