import { describe, expect, it } from 'vitest';
import { NotificationQueue } from './notification.js';
import { dueNotificationInputs, isReminderDue, reminderToNotificationInput, validateScheduledReminder, type ScheduledReminder } from './reminder-bridge.js';

const EVM = '0x3333333333333333333333333333333333333333';
const r1: ScheduledReminder = { v: 1, id: 'rent-1', dueAtMs: 1_000_000, label: 'Rent', amount: '800', asset: 'USDC', address: EVM, priority: 'high', graceMs: 5000 };

describe('validateScheduledReminder', () => {
  it('accepts valid and JSON round-trips', () => {
    const v = validateScheduledReminder(JSON.parse(JSON.stringify(r1)));
    expect(v).toEqual({ ok: true, value: r1 });
    expect(validateScheduledReminder({ v: 1, id: 'a', dueAtMs: 0 })).toEqual({ ok: true, value: { v: 1, id: 'a', dueAtMs: 0 } });
  });
  it('rejects adversarial input', () => {
    const bad = (x: unknown, e: string) => expect(validateScheduledReminder(x)).toEqual({ ok: false, error: e });
    bad(null, 'reminder_shape');
    bad({ ...r1, v: 2 }, 'reminder_shape');
    bad({ ...r1, extra: 1 }, 'reminder_shape');
    bad({ ...r1, id: '../x' }, 'reminder_id');
    bad({ ...r1, id: 5 }, 'reminder_id');
    bad({ ...r1, dueAtMs: -1 }, 'reminder_due');
    bad({ ...r1, dueAtMs: 1.5 }, 'reminder_due');
    bad({ ...r1, amount: '1e5' }, 'params_amount');
    bad({ ...r1, address: 'x' }, 'params_address');
    bad({ ...r1, priority: 'urgent' }, 'reminder_priority');
    bad({ ...r1, priority: 3 }, 'reminder_priority');
    bad({ ...r1, graceMs: -1 }, 'reminder_grace');
  });
});

describe('conversion', () => {
  it('due window is inclusive', () => {
    expect(isReminderDue(r1, 999_999)).toBe(false);
    expect(isReminderDue(r1, 1_000_000)).toBe(true);
    expect(isReminderDue(r1, 1_005_000)).toBe(true);
    expect(isReminderDue(r1, 1_005_001)).toBe(false);
    expect(isReminderDue({ v: 1, id: 'a', dueAtMs: 0 }, 86_400_000)).toBe(true);
  });
  it('builds queue input with per-occurrence dedupe', () => {
    expect(reminderToNotificationInput(r1, 999_999)).toBeNull();
    const i = reminderToNotificationInput(r1, 1_001_000)!;
    expect(i).toMatchObject({ kind: 'reminder_due', dedupeKey: 'reminder:rent-1:1000000', coalesceKey: 'reminder_due', priority: 'high', ttlMs: 4000 });
    expect(reminderToNotificationInput({ v: 1, id: 'z', dueAtMs: 5 }, 5)).toMatchObject({ priority: 'normal', params: {} });
  });
  it('polling twice yields one notification; several coalesce; discreet hides details', () => {
    const t = { now: 1_001_000 };
    const q = new NotificationQueue({ now: () => t.now, discreet: true });
    const list: ScheduledReminder[] = [{ ...r1, id: 'b', dueAtMs: 1_000_100 }, r1];
    for (let p = 0; p < 2; p++) for (const i of dueNotificationInputs(list, t.now)) q.push(i);
    const v = q.list();
    expect(v).toHaveLength(1);
    expect(v[0]!.count).toBe(2);
    expect(JSON.stringify(v)).not.toMatch(/Rent|800|USDC|0x/);
    expect(dueNotificationInputs(list, 0)).toEqual([]);
    expect(dueNotificationInputs([{ ...r1, id: 'b' }, r1], t.now).map((x) => x.dedupeKey)).toEqual(['reminder:b:1000000', 'reminder:rent-1:1000000']);
  });
});
