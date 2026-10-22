import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import { UndoQueue, type SubmitInput } from './undo.js';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof FlowError ? e.code : 'NON_FLOW';
  }
  return undefined;
};
function mk(start = 10_000) {
  let t = start;
  const clock = (): number => t;
  return {
    clock,
    set: (n: number) => {
      t = n;
    },
    q: new UndoQueue(clock),
  };
}
const inp = (id = 'c1', delayMs = 60_000): SubmitInput => ({
  id,
  kind: 'policy.limit',
  summary: 'Raise daily limit to 500 USDC',
  payload: '{"limit":"500000000"}',
  delayMs,
});

describe('UndoQueue', () => {
  it('submit sets window from injected clock', () => {
    const { q } = mk();
    const c = q.submit(inp());
    expect(c).toMatchObject({ createdAt: 10_000, activatesAt: 70_000, status: 'pending' });
    expect(q.remainingMs('c1')).toBe(60_000);
  });
  it('cancel before activation works; boundary is closed', () => {
    const a = mk();
    a.q.submit(inp());
    a.set(69_999);
    expect(a.q.remainingMs('c1')).toBe(1);
    expect(a.q.cancel('c1')).toMatchObject({
      ok: true,
      change: { status: 'cancelled', cancelledAt: 69_999 },
    });
    expect(a.q.remainingMs('c1')).toBe(0);
    expect(a.q.cancel('c1')).toEqual({ ok: false, reason: 'ALREADY_CANCELLED' });
    const b = mk();
    b.q.submit(inp());
    b.set(70_000);
    expect(b.q.cancel('c1')).toEqual({ ok: false, reason: 'WINDOW_CLOSED' });
    expect(b.q.remainingMs('c1')).toBe(0);
  });
  it('rolling the clock back cannot reopen the window', () => {
    const a = mk();
    a.q.submit(inp());
    a.set(80_000);
    expect(a.q.cancel('c1')).toEqual({ ok: false, reason: 'WINDOW_CLOSED' });
    a.set(1);
    expect(a.q.cancel('c1')).toEqual({ ok: false, reason: 'WINDOW_CLOSED' });
    expect(a.q.due()).toHaveLength(1);
  });
  it('activate requires closed window; then cancel refuses', () => {
    const a = mk();
    a.q.submit(inp());
    expect(code(() => a.q.activate('c1'))).toBe('INVALID_TRANSITION');
    expect(a.q.due()).toEqual([]);
    a.set(70_000);
    expect(a.q.due().map((c) => c.id)).toEqual(['c1']);
    expect(a.q.activate('c1').status).toBe('activated');
    expect(a.q.cancel('c1')).toEqual({ ok: false, reason: 'ALREADY_ACTIVATED' });
    expect(a.q.due()).toEqual([]);
    expect(code(() => a.q.activate('c1'))).toBe('INVALID_TRANSITION');
    expect(code(() => a.q.activate('nope'))).toBe('INVALID_TRANSITION');
  });
  it('never undoes executed on-chain effects', () => {
    const a = mk();
    a.q.submit(inp());
    expect(code(() => a.q.markExecuted('c1', '0xabc'))).toBe('INVALID_TRANSITION');
    a.set(70_000);
    a.q.activate('c1');
    expect(code(() => a.q.markExecuted('c1', 'bad ref!'))).toBe('INVALID_TRANSITION');
    expect(code(() => a.q.markExecuted('zz', 'tx:0xabc'))).toBe('INVALID_TRANSITION');
    expect(a.q.markExecuted('c1', 'tx:0xabc')).toMatchObject({ status: 'executed', executedRef: 'tx:0xabc' });
    expect(a.q.cancel('c1')).toEqual({ ok: false, reason: 'EXECUTED_ON_CHAIN' });
    expect(a.q.cancel('missing')).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
  it('validates input and limits', () => {
    const { q } = mk();
    for (const bad of [
      { ...inp(), id: 'has space' },
      { ...inp(), kind: 'Bad' },
      { ...inp(), summary: '' },
      { ...inp(), summary: 'x'.repeat(281) },
      { ...inp(), payload: 'x'.repeat(4097) },
      { ...inp(), delayMs: 10 },
      { ...inp(), delayMs: 1e15 },
      { ...inp(), delayMs: 1.5 },
    ])
      expect(code(() => q.submit(bad))).toBe('BAD_CHANGE');
    q.submit(inp());
    expect(code(() => q.submit(inp()))).toBe('DUPLICATE_ID');
  });
  it('queue full counts only pending; bad options and clock', () => {
    const t = mk();
    const q = new UndoQueue(t.clock, { maxPending: 2 });
    q.submit(inp('a'));
    q.submit(inp('b'));
    expect(code(() => q.submit(inp('c')))).toBe('QUEUE_FULL');
    q.cancel('a');
    q.submit(inp('c'));
    expect(code(() => new UndoQueue(t.clock, { minDelayMs: 5, maxDelayMs: 1 }))).toBe('BAD_OPTION');
    expect(code(() => new UndoQueue(t.clock, { maxPending: 0 }))).toBe('BAD_OPTION');
    expect(code(() => new UndoQueue(() => NaN).submit(inp()))).toBe('BAD_CLOCK');
    expect(code(() => new UndoQueue(() => -1).list())).toBeUndefined();
    expect(code(() => new UndoQueue(() => -1).remainingMs('x'))).toBeUndefined();
    expect(new UndoQueue(t.clock).get('x')).toBeUndefined();
  });
  it('list order is deterministic', () => {
    const t = mk();
    t.q.submit(inp('b'));
    t.q.submit(inp('a'));
    t.set(10_001);
    t.q.submit(inp('c'));
    expect(t.q.list().map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('snapshot/restore round-trips all statuses', () => {
    const t = mk();
    t.q.submit(inp('a'));
    t.q.submit(inp('b'));
    t.q.submit(inp('c'));
    t.q.submit(inp('d'));
    t.q.cancel('a');
    t.set(70_000);
    t.q.activate('b');
    t.q.activate('c');
    t.q.markExecuted('c', 'tx:1');
    const snap = JSON.parse(JSON.stringify(t.q.snapshot())) as unknown;
    const r = UndoQueue.restore(t.clock, snap);
    expect(r.snapshot()).toEqual(t.q.snapshot());
    expect(r.cancel('c')).toEqual({ ok: false, reason: 'EXECUTED_ON_CHAIN' });
  });
  it('restore rejects tampered data', () => {
    const t = mk();
    t.q.submit(inp('a'));
    const good = JSON.parse(JSON.stringify(t.q.snapshot())) as {
      lastNow: number;
      items: Record<string, unknown>[];
    };
    const item = (patch: Record<string, unknown>): unknown => ({
      ...good,
      items: [{ ...good.items[0], ...patch }],
    });
    for (const bad of [
      null,
      5,
      { lastNow: -1, items: [] },
      { lastNow: 1, items: 'x' },
      { lastNow: 1, items: [null] },
      item({ id: '!' }),
      item({ kind: 'X' }),
      item({ summary: '' }),
      item({ payload: 3 }),
      item({ createdAt: 'x' }),
      item({ activatesAt: 1 }),
      item({ status: 'weird' }),
      item({ status: 'cancelled' }),
      item({ status: 'activated' }),
      item({ status: 'activated', activatedAt: 1 }),
      item({ status: 'executed', activatedAt: 70_000 }),
      item({ status: 'executed', activatedAt: 70_000, executedRef: ' ' }),
      { ...good, items: [good.items[0], good.items[0]] },
    ])
      expect(code(() => UndoQueue.restore(t.clock, bad))).toBe('BAD_SNAPSHOT');
  });
  it('property: cancel succeeds iff now < activatesAt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (delay, at) => {
          const t = mk(0);
          t.q.submit(inp('x', delay));
          t.set(at);
          expect(t.q.cancel('x').ok).toBe(at < delay);
        },
      ),
    );
  });
});
