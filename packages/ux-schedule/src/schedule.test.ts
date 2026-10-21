import { describe, expect, it } from 'vitest';
import { evaluateSchedule, markHandled, materializeDue, type RecurringSchedule } from './schedule.js';
import { validateRule } from './recurrence.js';
import { createTemplate } from './template.js';
import { confirm } from './scheduled.js';
import { UTC } from './time.js';
import { fixed, goodTemplate, noMemo, utc } from './testutil.testutil.js';

const r = validateRule({ frequency: 'monthly', interval: 1, startDate: { year: 2026, month: 1, day: 31 }, timeOfDayMinutes: 600 });
if (!r.ok) throw new Error();
const sched: RecurringSchedule = { id: 'sch', templateId: 'rent', rule: r.value, paused: false, policy: 'latest-only', lastHandledMs: null };
const tpl = (() => { const t = createTemplate(goodTemplate, fixed(0)); if (!t.ok) throw new Error(); return t.value; })();
const now = utc(2026, 2, 28, 12);

describe('recurring schedule', () => {
  it('Feb 28 (clamped) is due at 10:00, needs confirm', () => {
    const e = evaluateSchedule(sched, UTC, fixed(now));
    expect(e.due.map((d) => d.dueAtMs)).toEqual([utc(2026, 2, 28, 10)]);
    expect(e.nextMs).toBe(utc(2026, 3, 31, 10));
  });
  it('paused yields nothing; maxAge option is passed', () => {
    expect(evaluateSchedule({ ...sched, paused: true }, UTC, fixed(now)).due).toEqual([]);
    expect(evaluateSchedule(sched, UTC, fixed(now + 30 * 86_400_000), 1000).due).toEqual([]);
  });
  it('markHandled is monotonic', () => {
    const a = markHandled(sched, 100);
    expect(a.lastHandledMs).toBe(100);
    expect(markHandled(a, 50).lastHandledMs).toBe(100);
    expect(markHandled(a, 200).lastHandledMs).toBe(200);
    expect(() => markHandled(a, NaN)).toThrow(RangeError);
    expect(evaluateSchedule(markHandled(sched, utc(2026, 2, 28, 10)), UTC, fixed(now)).due).toEqual([]);
  });
  it('materializes deterministic, frozen, unconfirmed payments', () => {
    const e = evaluateSchedule(sched, UTC, fixed(now));
    const m = materializeDue(sched, tpl, e, fixed(now));
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.value).toHaveLength(1);
    const p = m.value[0];
    expect(p?.id).toBe(`sch@${utc(2026, 2, 28, 10)}`);
    expect(p?.state).toBe('due');
    expect(p?.payment.memo).toBe('monthly rent');
    // idempotent
    const again = materializeDue(sched, tpl, e, fixed(now), m.value);
    expect(again.ok && again.value).toEqual([]);
    // still requires explicit ack
    if (p) {
      const c = confirm(p, { userConfirmed: true, recipient: tpl.recipient, amount: tpl.amount }, fixed(now));
      expect(c.ok).toBe(true);
    }
  });
  it('template without memo; template mismatch', () => {
    const t = createTemplate(noMemo, fixed(0));
    if (!t.ok) throw new Error();
    const e = evaluateSchedule(sched, UTC, fixed(now));
    const m = materializeDue(sched, t.value, e, fixed(now));
    expect(m.ok && 'memo' in (m.value[0]?.payment ?? {})).toBe(false);
    const bad = materializeDue(sched, { ...tpl, id: 'other' }, e, fixed(now));
    expect(bad.ok).toBe(false);
  });
});
