import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  NotificationQueue,
  NOTIFICATION_KINDS,
  parseSnapshot,
  validateParams,
  type NotificationInput,
  type QueueConfig,
} from './notification.js';
import { containsSensitive } from './redact.js';

const EVM = '0x2222222222222222222222222222222222222222';
const MIN = 60_000;
const DAY = 86_400_000;

function mk(extra: Partial<QueueConfig> = {}, start = 1_700_000_000_000) {
  const clock = { t: start };
  const q = new NotificationQueue({ now: () => clock.t, ...extra });
  return { q, clock };
}
const rcv = (key: string, extra: Partial<NotificationInput> = {}): NotificationInput => ({
  kind: 'payment_received',
  dedupeKey: key,
  params: { amount: '12.50', asset: 'USDC', address: EVM, label: 'Sam' },
  ...extra,
});

describe('privacy rendering', () => {
  it('discreet in-app has no amount, address, label, digits', () => {
    const { q } = mk({ discreet: true });
    const r = q.push(rcv('a'));
    const v = q.get((r as { id: string }).id)!;
    expect(v.redacted).toBe(true);
    expect(v.args).toEqual({});
    const text = `${v.title} ${v.body}`;
    expect(text).not.toMatch(/12\.50|USDC|0x|Sam|\d/);
    expect(containsSensitive(text)).toBe(false);
  });
  it('is discreet by default', () => {
    expect(mk().q.discreet).toBe(true);
  });
  it('non-discreet masks address and shows amount', () => {
    const { q } = mk({ discreet: false });
    q.push(rcv('a'));
    const v = q.list()[0]!;
    expect(v.body).toBe('12.50 USDC · Sam · 0x2222…2222');
    expect(v.title).toBe('Payment received');
    expect(`${v.title}${v.body}`).not.toContain(EVM);
    expect(v.args).toEqual({ amount: '12.50 USDC', label: 'Sam', address: '0x2222…2222' });
  });
  it('non-discreet drops address-like labels and handles missing params', () => {
    const { q } = mk({ discreet: false });
    q.push({ kind: 'payment_sent', dedupeKey: 'b', params: { label: EVM, amount: '3' } });
    q.push({ kind: 'sync_issue', dedupeKey: 'c' });
    const vs = q.list();
    const sent = vs.find((v) => v.kind === 'payment_sent')!;
    expect(sent.body).toBe('3');
    expect(sent.body).not.toContain(EVM);
    expect(vs.find((v) => v.kind === 'sync_issue')!.body).toBe('Open the app for details.');
  });
  it('lock screen is generic for every kind in both modes', () => {
    for (const discreet of [true, false]) {
      const { q } = mk({ discreet });
      NOTIFICATION_KINDS.forEach((kind, i) =>
        q.push({
          kind,
          dedupeKey: `k${i}`,
          params: { amount: '99.99', asset: 'ETH', address: EVM, label: 'Bob' },
        }),
      );
      for (const v of q.list('lockscreen')) {
        expect(v.title).toBe('Notification');
        expect(v.body).toBe('Open the app to see more.');
        expect(v.args).toEqual({});
        expect(v.redacted).toBe(true);
      }
    }
  });
  it('discreet templates for all kinds are clean, multi titles too', () => {
    const { q } = mk({ discreet: true });
    NOTIFICATION_KINDS.forEach((kind, i) => {
      q.push({ kind, dedupeKey: `x${i}`, coalesceKey: 'c' });
      q.push({ kind, dedupeKey: `y${i}`, coalesceKey: 'c' });
    });
    for (const v of q.list()) {
      expect(v.count).toBe(2);
      expect(containsSensitive(v.title + ' ' + v.body)).toBe(false);
      expect(v.title + v.body).not.toMatch(/\d/);
    }
  });
  it('custom lock label sanitized; sensitive label rejected', () => {
    const a = mk({ lockScreenLabel: '  Inbox\n' });
    a.q.push(rcv('a'));
    expect(a.q.list('lockscreen')[0]!.title).toBe('Inbox');
    const b = mk({ lockScreenLabel: '0x2222222222222222' });
    b.q.push(rcv('a'));
    expect(b.q.list('lockscreen')[0]!.title).toBe('Notification');
  });
  it('multi non-discreet shows count only', () => {
    const { q } = mk({ discreet: false });
    q.push(rcv('a', { coalesceKey: 'p' }));
    q.push(rcv('b', { coalesceKey: 'p' }));
    q.push(rcv('c', { coalesceKey: 'p' }));
    const v = q.list()[0]!;
    expect(v.title).toBe('3 payments received');
    expect(v.body).not.toMatch(/12\.50|0x/);
  });
  it('property: discreet/lockscreen never leak any generated params', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{1,10}(\.\d{1,6})?$/),
        fc.stringMatching(/^[A-Za-z0-9]{12,60}$/),
        fc.string({ maxLength: 30 }),
        (amount, address, label) => {
          const { q } = mk({ discreet: true });
          q.push({ kind: 'payment_received', dedupeKey: 'p', params: { amount, address, label } });
          for (const v of [...q.list('inapp'), ...q.list('lockscreen')]) {
            const t = v.title + v.body + JSON.stringify(v.args);
            expect(t).not.toContain(address);
            expect(t).not.toContain(amount);
          }
        },
      ),
    );
  });
});

describe('validation', () => {
  it('rejects bad inputs', () => {
    const { q } = mk();
    const bad = (i: unknown, reason: string) =>
      expect(q.push(i as NotificationInput)).toEqual({ outcome: 'rejected', reason });
    bad(null, 'kind');
    bad({ kind: 'nope', dedupeKey: 'a' }, 'kind');
    bad({ kind: 'sync_issue', dedupeKey: 'bad key!' }, 'dedupe_key');
    bad({ kind: 'sync_issue', dedupeKey: 5 }, 'dedupe_key');
    bad({ kind: 'sync_issue', dedupeKey: 'a', coalesceKey: '??' }, 'coalesce_key');
    bad({ kind: 'sync_issue', dedupeKey: 'a', priority: 'urgent' }, 'priority');
    bad({ kind: 'sync_issue', dedupeKey: 'a', ttlMs: 0 }, 'ttl');
    bad({ kind: 'sync_issue', dedupeKey: 'a', ttlMs: 1.5 }, 'ttl');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { amount: '1e9' } }, 'params_amount');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { amount: '-1' } }, 'params_amount');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { asset: 'usdc' } }, 'params_asset');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { address: 'short' } }, 'params_address');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { label: 5 } }, 'params_label');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { label: 'x'.repeat(201) } }, 'params_label');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: { evil: 1 } }, 'params_shape');
    bad({ kind: 'sync_issue', dedupeKey: 'a', params: [] }, 'params_shape');
    expect(q.list()).toEqual([]);
  });
  it('validateParams edge: empty label dropped', () => {
    expect(validateParams({ label: '   ' })).toEqual({ ok: true, value: {} });
    expect(validateParams(undefined)).toEqual({ ok: true, value: {} });
  });
});

describe('dedupe, coalesce, priority', () => {
  it('dedupes and upgrades priority', () => {
    const { q } = mk({ discreet: false });
    const a = q.push(rcv('same')) as { id: string };
    q.markRead(a.id);
    const b = q.push(rcv('same', { priority: 'high' }));
    expect(b).toEqual({ outcome: 'deduped', id: a.id });
    expect(q.list()).toHaveLength(1);
    expect(q.list()[0]!.priority).toBe('high');
    q.push(rcv('same', { priority: 'low' }));
    expect(q.list()[0]!.priority).toBe('high');
    expect(q.list()[0]!.count).toBe(1);
  });
  it('dedupe key reusable after expiry', () => {
    const { q, clock } = mk({ defaultTtlMs: 1000 });
    q.push(rcv('k'));
    clock.t += 1001;
    expect(q.push(rcv('k')).outcome).toBe('added');
  });
  it('coalesces within window only, unread only, same kind', () => {
    const { q, clock } = mk({ coalesceWindowMs: 10 * MIN });
    const a = q.push(rcv('1', { coalesceKey: 'g' })) as { id: string };
    clock.t += 5 * MIN;
    expect(q.push(rcv('2', { coalesceKey: 'g', priority: 'high' }))).toEqual({
      outcome: 'coalesced',
      id: a.id,
    });
    expect(q.get(a.id)!.count).toBe(2);
    expect(q.get(a.id)!.priority).toBe('high');
    expect(q.push({ kind: 'payment_sent', dedupeKey: '3', coalesceKey: 'g' }).outcome).toBe('added');
    clock.t += 5 * MIN; // window measured from updatedAt
    expect(q.push(rcv('4', { coalesceKey: 'g' })).outcome).toBe('coalesced');
    clock.t += 11 * MIN;
    expect(q.push(rcv('5', { coalesceKey: 'g' })).outcome).toBe('added');
    q.markAllRead();
    expect(q.push(rcv('6', { coalesceKey: 'g' })).outcome).toBe('added');
  });
  it('a coalesced event keeps its dedupe key (replay ignored) and key list is bounded', () => {
    const { q } = mk();
    q.push(rcv('e0', { coalesceKey: 'g' }));
    for (let i = 1; i < 30; i++) q.push(rcv(`e${i}`, { coalesceKey: 'g' }));
    expect(q.push(rcv('e29', { coalesceKey: 'g' })).outcome).toBe('deduped');
    expect(q.snapshot().records[0]!.dedupeKeys).toHaveLength(20);
  });
  it('sorts by priority then recency', () => {
    const { q, clock } = mk();
    q.push({ kind: 'sync_issue', dedupeKey: 'l', priority: 'low' });
    clock.t += 1;
    q.push({ kind: 'sync_issue', dedupeKey: 'n1' });
    clock.t += 1;
    q.push({ kind: 'sync_issue', dedupeKey: 'n2' });
    q.push({ kind: 'security_alert', dedupeKey: 'c', priority: 'critical' });
    expect(q.list().map((v) => v.priority)).toEqual(['critical', 'normal', 'normal', 'low']);
    expect(q.list()[1]!.id).toBe('n3');
  });
});

describe('read, expiry, dismiss', () => {
  it('read/unread flow', () => {
    const { q } = mk();
    const a = q.push(rcv('a')) as { id: string };
    q.push(rcv('b'));
    expect(q.unreadCount()).toBe(2);
    expect(q.markRead(a.id)).toBe(true);
    expect(q.markRead('zzz')).toBe(false);
    expect(q.unreadCount()).toBe(1);
    expect(q.markAllRead()).toBe(1);
    expect(q.markAllRead()).toBe(0);
    expect(q.get(a.id)!.read).toBe(true);
    expect(q.dismiss(a.id)).toBe(true);
    expect(q.dismiss(a.id)).toBe(false);
    q.clear();
    expect(q.list()).toEqual([]);
  });
  it('expires exactly at expiresAt and purges', () => {
    const { q, clock } = mk();
    const a = q.push(rcv('a', { ttlMs: 1000 })) as { id: string };
    clock.t += 999;
    expect(q.get(a.id)).toBeDefined();
    clock.t += 1;
    expect(q.get(a.id)).toBeUndefined();
    expect(q.unreadCount()).toBe(0);
    expect(q.markRead(a.id)).toBe(false);
    expect(q.purgeExpired()).toBe(1);
    expect(q.purgeExpired()).toBe(0);
  });
  it('coalescing extends expiry', () => {
    const { q, clock } = mk();
    const a = q.push(rcv('a', { ttlMs: 1000, coalesceKey: 'g' })) as { id: string };
    clock.t += 900;
    q.push(rcv('b', { ttlMs: 1000, coalesceKey: 'g' }));
    clock.t += 900;
    expect(q.get(a.id)).toBeDefined();
  });
});

describe('capacity', () => {
  it('evicts read low first; protects unread critical', () => {
    const { q, clock } = mk({ maxSize: 3 });
    const c = q.push({ kind: 'security_alert', dedupeKey: 'c', priority: 'critical' }) as { id: string };
    clock.t += 1;
    const n = q.push({ kind: 'sync_issue', dedupeKey: 'n' }) as { id: string };
    clock.t += 1;
    q.push({ kind: 'sync_issue', dedupeKey: 'l', priority: 'low' });
    clock.t += 1;
    q.push({ kind: 'sync_issue', dedupeKey: 'n2' }); // evicts unread low
    expect(
      q
        .list()
        .map((v) => v.priority)
        .sort(),
    ).toEqual(['critical', 'normal', 'normal']);
    q.markRead(n.id);
    clock.t += 1;
    q.push({ kind: 'sync_issue', dedupeKey: 'n3' }); // evicts read normal
    expect(q.get(n.id)).toBeUndefined();
    expect(q.get(c.id)).toBeDefined();
  });
  it('rejects non-critical when full of unread critical; critical evicts oldest', () => {
    const { q, clock } = mk({ maxSize: 2 });
    q.push({ kind: 'security_alert', dedupeKey: 'a', priority: 'critical' });
    clock.t += 1;
    q.push({ kind: 'security_alert', dedupeKey: 'b', priority: 'critical' });
    expect(q.push({ kind: 'sync_issue', dedupeKey: 'x', priority: 'high' })).toEqual({
      outcome: 'rejected',
      reason: 'queue_full',
    });
    expect(q.push({ kind: 'security_alert', dedupeKey: 'c', priority: 'critical' }).outcome).toBe('added');
    expect(q.list()).toHaveLength(2);
    expect(q.get('n1')).toBeUndefined();
  });
  it('invalid config values fall back to defaults', () => {
    const { q } = mk({ maxSize: -5, coalesceWindowMs: -1, defaultTtlMs: 0 });
    for (let i = 0; i < 60; i++) q.push({ kind: 'sync_issue', dedupeKey: `k${i}` });
    expect(q.list()).toHaveLength(50);
  });
});

describe('quiet hours and alerts', () => {
  // 1_700_000_000_000 ms = 2023-11-14T22:13:20Z -> minute-of-day 1333 UTC
  it('wraps midnight with injected offset', () => {
    const { q, clock } = mk({}, Date.UTC(2024, 0, 1, 22, 0));
    expect(q.setQuietHours({ startMinute: 22 * 60, endMinute: 7 * 60, utcOffsetMinutes: 0 })).toBe(true);
    expect(q.isQuietNow()).toBe(true);
    clock.t = Date.UTC(2024, 0, 1, 6, 59);
    expect(q.isQuietNow()).toBe(true);
    clock.t = Date.UTC(2024, 0, 1, 7, 0);
    expect(q.isQuietNow()).toBe(false);
    clock.t = Date.UTC(2024, 0, 1, 21, 59);
    expect(q.isQuietNow()).toBe(false);
    // +120 offset shifts local time: 20:00Z is 22:00 local
    q.setQuietHours({ startMinute: 22 * 60, endMinute: 7 * 60, utcOffsetMinutes: 120 });
    clock.t = Date.UTC(2024, 0, 1, 20, 0);
    expect(q.isQuietNow()).toBe(true);
    // negative offset across day boundary: 01:00Z with -120 is 23:00 local
    q.setQuietHours({ startMinute: 22 * 60, endMinute: 7 * 60, utcOffsetMinutes: -120 });
    clock.t = Date.UTC(2024, 0, 1, 1, 0);
    expect(q.isQuietNow()).toBe(true);
  });
  it('same-day window, empty window, null, invalid', () => {
    const { q, clock } = mk(
      { quietHours: { startMinute: 600, endMinute: 660, utcOffsetMinutes: 0 } },
      Date.UTC(2024, 0, 1, 10, 30),
    );
    expect(q.isQuietNow()).toBe(true);
    clock.t = Date.UTC(2024, 0, 1, 11, 0);
    expect(q.isQuietNow()).toBe(false);
    q.setQuietHours({ startMinute: 5, endMinute: 5, utcOffsetMinutes: 0 });
    expect(q.isQuietNow()).toBe(false);
    expect(q.setQuietHours({ startMinute: 1440, endMinute: 0, utcOffsetMinutes: 0 })).toBe(false);
    expect(q.setQuietHours({ startMinute: 0, endMinute: 0, utcOffsetMinutes: 900 })).toBe(false);
    expect(q.setQuietHours(null)).toBe(true);
    expect(q.isQuietNow()).toBe(false);
  });
  it('takeAlerts: quiet suppresses all but critical; deferred ones alert later; low never; once only', () => {
    const { q, clock } = mk(
      { quietHours: { startMinute: 0, endMinute: 360, utcOffsetMinutes: 0 } },
      Date.UTC(2024, 0, 1, 3, 0),
    );
    q.push({ kind: 'payment_received', dedupeKey: 'n' });
    q.push({ kind: 'sync_issue', dedupeKey: 'l', priority: 'low' });
    q.push({ kind: 'security_alert', dedupeKey: 'c', priority: 'critical' });
    const first = q.takeAlerts();
    expect(first.map((v) => v.kind)).toEqual(['security_alert']);
    expect(first[0]!.surface).toBe('lockscreen');
    expect(q.takeAlerts()).toEqual([]);
    clock.t = Date.UTC(2024, 0, 1, 6, 0);
    expect(q.takeAlerts('inapp').map((v) => v.kind)).toEqual(['payment_received']);
    expect(q.takeAlerts()).toEqual([]);
  });
  it('read entries do not alert; priority bump re-alerts', () => {
    const { q } = mk();
    const a = q.push({ kind: 'sync_issue', dedupeKey: 'a' }) as { id: string };
    const b = q.push({ kind: 'sync_issue', dedupeKey: 'b' }) as { id: string };
    q.markRead(a.id);
    expect(q.takeAlerts().map((v) => v.id)).toEqual([b.id]);
    q.push({ kind: 'sync_issue', dedupeKey: 'b', priority: 'critical' });
    expect(q.takeAlerts().map((v) => v.id)).toEqual([b.id]);
    q.push({ kind: 'sync_issue', dedupeKey: 'z', coalesceKey: 'g' });
    q.takeAlerts();
    q.push({ kind: 'sync_issue', dedupeKey: 'z2', coalesceKey: 'g', priority: 'high' });
    expect(q.takeAlerts()).toHaveLength(1);
  });
});

describe('snapshot / restore', () => {
  it('round-trips', () => {
    const a = mk({ discreet: false });
    a.q.push(rcv('a', { coalesceKey: 'g' }));
    a.q.push(rcv('b', { coalesceKey: 'g' }));
    a.q.push({ kind: 'sync_issue', dedupeKey: 's' });
    const snap = JSON.parse(JSON.stringify(a.q.snapshot())) as unknown;
    const b = mk({ discreet: false }, a.clock.t);
    expect(b.q.restore(snap)).toEqual({ ok: true, value: 2 });
    expect(b.q.list()).toEqual(a.q.list());
    expect(b.q.push({ kind: 'sync_issue', dedupeKey: 'new' })).toEqual({ outcome: 'added', id: 'n3' });
  });
  it('drops expired on restore; truncates to maxSize', () => {
    const a = mk();
    for (let i = 0; i < 5; i++)
      a.q.push({ kind: 'sync_issue', dedupeKey: `k${i}`, ttlMs: i === 0 ? 10 : DAY });
    const b = mk({ maxSize: 3 }, a.clock.t + 100);
    expect(b.q.restore(a.q.snapshot())).toEqual({ ok: true, value: 3 });
  });
  it('rejects tampered data and leaves state unchanged', () => {
    const a = mk();
    a.q.push({ kind: 'sync_issue', dedupeKey: 'k' });
    const good = a.q.snapshot();
    const rec = good.records[0]!;
    const cases: unknown[] = [
      null,
      [],
      { v: 2, seq: 0, records: [] },
      { v: 1, seq: -1, records: [] },
      { v: 1, seq: 0, records: 'x' },
      { v: 1, seq: 0, records: [], extra: 1 },
      { v: 1, seq: 0, records: new Array(1001).fill(rec) },
      { ...good, records: [null] },
      { ...good, records: [{ ...rec, extra: 1 }] },
      { ...good, records: [{ ...rec, id: 'x1' }] },
      { ...good, records: [rec, rec] },
      { ...good, records: [{ ...rec, kind: 'nope' }] },
      { ...good, records: [{ ...rec, kind: 5 }] },
      { ...good, records: [{ ...rec, priority: 'meh' }] },
      { ...good, records: [{ ...rec, priority: 1 }] },
      { ...good, records: [{ ...rec, dedupeKeys: [] }] },
      { ...good, records: [{ ...rec, dedupeKeys: ['bad key'] }] },
      { ...good, records: [{ ...rec, dedupeKeys: 'x' }] },
      { ...good, records: [{ ...rec, coalesceKey: '??' }] },
      { ...good, records: [{ ...rec, count: 0 }] },
      { ...good, records: [{ ...rec, createdAt: -1 }] },
      { ...good, records: [{ ...rec, expiresAt: 'x' }] },
      { ...good, records: [{ ...rec, read: 1 }] },
      { ...good, records: [{ ...rec, params: { amount: 'x' } }] },
    ];
    for (const c of cases) {
      expect(parseSnapshot(c).ok).toBe(false);
      expect(a.q.restore(c).ok).toBe(false);
    }
    expect(a.q.list()).toHaveLength(1);
    expect(parseSnapshot({ ...good, records: [{ ...rec, coalesceKey: 'ok' }] }).ok).toBe(true);
  });
});
