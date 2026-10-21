import { fail, intIn, isRecord, ok, onlyKeys, type Result } from './common.js';
import type { NotificationInput, Priority } from './notification.js';
import { PRIORITIES, validateParams } from './notification.js';

/**
 * Plain-data bridge consumed by ux-schedule: a scheduled reminder that the
 * notification queue can turn into an in-app notification. Contains no
 * functions or Dates so it serialises losslessly.
 */
export interface ScheduledReminder {
  v: 1;
  /** Stable id supplied by the scheduler. */
  id: string;
  /** Due instant, ms since epoch (UTC). */
  dueAtMs: number;
  label?: string;
  amount?: string;
  asset?: string;
  address?: string;
  priority?: Priority;
  /** How long after dueAtMs the reminder still surfaces. Default 24h. */
  graceMs?: number;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = 86_400_000;

/** Strictly validate an untrusted reminder (e.g. imported schedule). */
export function validateScheduledReminder(x: unknown): Result<ScheduledReminder> {
  if (!isRecord(x) || !onlyKeys(x, ['v', 'id', 'dueAtMs', 'label', 'amount', 'asset', 'address', 'priority', 'graceMs']) || x['v'] !== 1) return fail('reminder_shape');
  if (typeof x['id'] !== 'string' || !ID_RE.test(x['id'])) return fail('reminder_id');
  if (!intIn(x['dueAtMs'], 0, 8.64e15)) return fail('reminder_due');
  const params = validateParams({ ...pick(x, ['label', 'amount', 'asset', 'address']) });
  if (!params.ok) return params;
  const out: ScheduledReminder = { v: 1, id: x['id'], dueAtMs: x['dueAtMs'], ...params.value };
  if (x['priority'] !== undefined) {
    if (typeof x['priority'] !== 'string' || !(PRIORITIES as readonly string[]).includes(x['priority'])) return fail('reminder_priority');
    out.priority = x['priority'] as Priority;
  }
  if (x['graceMs'] !== undefined) {
    if (!intIn(x['graceMs'], 0, 365 * DAY)) return fail('reminder_grace');
    out.graceMs = x['graceMs'];
  }
  return ok(out);
}

function pick(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

/** True when `now` is within [dueAtMs, dueAtMs+grace]. */
export function isReminderDue(r: ScheduledReminder, nowMs: number): boolean {
  return nowMs >= r.dueAtMs && nowMs <= r.dueAtMs + (r.graceMs ?? DAY);
}

/**
 * Convert a due reminder to queue input; null if not due / expired.
 * The dedupe key includes the due time so a recurring reminder re-fires per
 * occurrence but a repeated poll of the same occurrence does not.
 */
export function reminderToNotificationInput(r: ScheduledReminder, nowMs: number): NotificationInput | null {
  if (!isReminderDue(r, nowMs)) return null;
  const params: NotificationInput['params'] = {};
  if (r.label !== undefined) params.label = r.label;
  if (r.amount !== undefined) params.amount = r.amount;
  if (r.asset !== undefined) params.asset = r.asset;
  if (r.address !== undefined) params.address = r.address;
  return {
    kind: 'reminder_due',
    dedupeKey: `reminder:${r.id}:${r.dueAtMs}`,
    coalesceKey: 'reminder_due',
    priority: r.priority ?? 'normal',
    params,
    ttlMs: Math.max(1, r.dueAtMs + (r.graceMs ?? DAY) - nowMs),
  };
}

/** Inputs for all currently due reminders, ordered by due time then id. */
export function dueNotificationInputs(list: readonly ScheduledReminder[], nowMs: number): NotificationInput[] {
  return [...list]
    .sort((a, b) => a.dueAtMs - b.dueAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((r) => {
      const i = reminderToNotificationInput(r, nowMs);
      return i ? [i] : [];
    });
}
