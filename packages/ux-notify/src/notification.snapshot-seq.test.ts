import { describe, expect, it } from 'vitest';
import { NotificationQueue, parseSnapshot } from './notification.js';

const mkQueue = () => new NotificationQueue({ now: () => 1_700_000_000_000 });

describe('restored notification sequence consistency', () => {
  it('rejects a snapshot counter rewound behind a live record id', () => {
    const source = mkQueue();
    expect(source.push({ kind: 'payment_received', dedupeKey: 'first' })).toMatchObject({
      outcome: 'added',
      id: 'n1',
    });
    const snapshot = source.snapshot();
    const rewound = { ...snapshot, seq: 0 };

    // Without this guard, restore succeeds and the next push reuses n1.
    expect(parseSnapshot(rewound)).toEqual({ ok: false, error: 'record_id' });
    const destination = mkQueue();
    expect(destination.restore(rewound)).toEqual({ ok: false, error: 'record_id' });
    expect(destination.snapshot()).toEqual({ v: 1, seq: 0, records: [] });
  });

  it('rejects a counter below the largest id, not just the first record', () => {
    const source = mkQueue();
    source.push({ kind: 'payment_received', dedupeKey: 'a' });
    source.push({ kind: 'payment_sent', dedupeKey: 'b' });
    const rewound = { ...source.snapshot(), seq: 1 };
    expect(parseSnapshot(rewound)).toEqual({ ok: false, error: 'record_id' });
  });

  it('retains valid snapshots and allocates the next unique id', () => {
    const source = mkQueue();
    source.push({ kind: 'payment_received', dedupeKey: 'a' });
    source.push({ kind: 'payment_sent', dedupeKey: 'b' });
    expect(source.dismiss('n1')).toBe(true);
    const snapshot = source.snapshot();

    expect(parseSnapshot(snapshot)).toEqual({ ok: true, value: snapshot });
    const destination = mkQueue();
    expect(destination.restore(snapshot)).toEqual({ ok: true, value: 1 });
    expect(destination.push({ kind: 'security_alert', dedupeKey: 'c' })).toMatchObject({
      outcome: 'added',
      id: 'n3',
    });
    expect(destination.list()).toHaveLength(2);
  });

  it('accepts an empty initial snapshot with sequence zero', () => {
    const initial = { v: 1, seq: 0, records: [] };
    expect(parseSnapshot(initial)).toEqual({ ok: true, value: initial });
    expect(mkQueue().restore(initial)).toEqual({ ok: true, value: 0 });
  });
});
