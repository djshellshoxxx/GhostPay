import { describe, expect, it } from 'vitest';
import {
  MAX_SCHEDULED, MAX_HORIZON_MS, addScheduled, cancel, confirm, isTerminal, schedulePayment,
  sweep, tick, validateSnapshot, type ScheduledPayment,
} from './scheduled.js';
import { MS_DAY, fixed } from './testutil.testutil.js';

const NOW = 1_800_000_000_000;
const pay = { chain: 'eip155:1', asset: 'USDC', recipient: '0xAbCdEf0000000000000000000000000000000001', amount: '2500000' };
const mk = (o: Record<string, unknown> = {}, now = NOW): ScheduledPayment => {
  const r = schedulePayment({ id: 's1', payment: pay, dueAtMs: NOW + 1000, ...o }, fixed(now));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const ack = { userConfirmed: true as const, recipient: pay.recipient, amount: pay.amount };
const ec = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

describe('schedulePayment', () => {
  it('starts pending with default max age 7d', () => {
    const p = mk();
    expect(p.state).toBe('pending');
    expect(p.maxAgeMs).toBe(7 * MS_DAY);
  });
  it('due immediately when dueAt == now', () => expect(mk({ dueAtMs: NOW }).state).toBe('due'));
  it('validates', () => {
    const s = (o: object) => schedulePayment({ id: 's', payment: pay, dueAtMs: NOW + 5, ...o }, fixed(NOW));
    expect(ec(schedulePayment(5, fixed(NOW)))).toBe('bad_scheduled');
    expect(ec(s({ extra: 1 }))).toBe('unknown_field');
    expect(ec(s({ id: '!' }))).toBe('bad_id');
    expect(ec(s({ payment: { ...pay, amount: '0' } }))).toBe('bad_amount');
    expect(ec(s({ dueAtMs: NOW - 1 }))).toBe('in_past');
    expect(ec(s({ dueAtMs: NOW + MAX_HORIZON_MS + 1 }))).toBe('too_far');
    expect(ec(s({ dueAtMs: 'x' }))).toBe('bad_int');
    expect(ec(s({ maxAgeMs: 59_999 }))).toBe('bad_int');
    expect(ec(s({ maxAgeMs: 91 * MS_DAY }))).toBe('bad_int');
    expect(ec(s({ maxAgeMs: 60_000 }))).toBe('ok');
  });
  it('snapshot validation', () => {
    expect(ec(validateSnapshot(null))).toBe('bad_payment');
    expect(ec(validateSnapshot({ ...pay, x: 1 }))).toBe('unknown_field');
    expect(ec(validateSnapshot({ ...pay, chain: ' ' }))).toBe('bad_token');
    expect(ec(validateSnapshot({ ...pay, asset: '' }))).toBe('bad_token');
    expect(ec(validateSnapshot({ ...pay, recipient: 'a b' }))).toBe('bad_recipient');
    expect(ec(validateSnapshot({ ...pay, memo: 'x'.repeat(141) }))).toBe('bad_text');
    const m = validateSnapshot({ ...pay, memo: 'hi' });
    expect(m.ok && m.value.memo).toBe('hi');
  });
});

describe('state machine', () => {
  it('pending -> due -> confirmed', () => {
    const p = mk();
    expect(tick(p, fixed(NOW + 999)).state).toBe('pending');
    const d = tick(p, fixed(NOW + 1000));
    expect(d.state).toBe('due');
    expect(tick(d, fixed(NOW + 1000))).toBe(d); // idempotent
    const c = confirm(p, ack, fixed(NOW + 5000));
    expect(c.ok && c.value.state).toBe('confirmed');
    expect(c.ok && c.value.stateChangedAtMs).toBe(NOW + 5000);
  });
  it('cannot confirm while pending', () => {
    expect(ec(confirm(mk(), ack, fixed(NOW)))).toBe('bad_state');
  });
  it('max-age guard: confirm after expiry refused; boundary inclusive', () => {
    const p = mk({ maxAgeMs: 60_000 });
    expect(ec(confirm(p, ack, fixed(NOW + 1000 + 60_000)))).toBe('ok');
    expect(ec(confirm(p, ack, fixed(NOW + 1000 + 60_001)))).toBe('expired');
    expect(tick(p, fixed(NOW + 10 * MS_DAY)).state).toBe('expired'); // straight from pending
  });
  it('requires explicit user confirmation and matching details', () => {
    const p = mk({ dueAtMs: NOW });
    expect(ec(confirm(p, { ...ack, userConfirmed: false as unknown as true }, fixed(NOW)))).toBe('not_confirmed');
    expect(ec(confirm(p, { ...ack, recipient: '0xAbCdEf0000000000000000000000000000000002' }, fixed(NOW)))).toBe('mismatch');
    expect(ec(confirm(p, { ...ack, amount: '2500001' }, fixed(NOW)))).toBe('mismatch');
  });
  it('terminal states are final', () => {
    const p = mk({ dueAtMs: NOW });
    const c = confirm(p, ack, fixed(NOW));
    if (!c.ok) throw new Error();
    expect(ec(confirm(c.value, ack, fixed(NOW)))).toBe('bad_state');
    expect(ec(cancel(c.value, fixed(NOW)))).toBe('bad_state');
    expect(tick(c.value, fixed(NOW + 100 * MS_DAY))).toBe(c.value);
    expect(isTerminal(c.value.state)).toBe(true);
    expect(isTerminal('due')).toBe(false);
  });
  it('cancel from pending and due; cancelled cannot be confirmed', () => {
    const a = cancel(mk(), fixed(NOW));
    expect(a.ok && a.value.state).toBe('cancelled');
    const b = cancel(mk({ dueAtMs: NOW }), fixed(NOW));
    expect(b.ok && b.value.state).toBe('cancelled');
    if (a.ok) expect(ec(confirm(a.value, ack, fixed(NOW + 5000)))).toBe('bad_state');
    expect(ec(cancel(mk(), fixed(NOW + 30 * MS_DAY)))).toBe('bad_state'); // expired
  });
  it('clock going backwards does not revive or regress', () => {
    const d = tick(mk(), fixed(NOW + 2000));
    expect(tick(d, fixed(NOW)).state).toBe('due');
  });
});

describe('sweep / list', () => {
  it('lists due items oldest first with expiry countdown', () => {
    const a = mk({ id: 'b', dueAtMs: NOW + 10 });
    const b = mk({ id: 'a', dueAtMs: NOW + 5 });
    const c = mk({ id: 'c', dueAtMs: NOW + 5 });
    const f = mk({ id: 'f', dueAtMs: NOW + 1_000_000 });
    const x = mk({ id: 'x', dueAtMs: NOW + 1, maxAgeMs: 60_000 });
    const r = sweep([a, b, c, f, x], fixed(NOW + 100_000));
    expect(r.dueItems.map((d) => d.id)).toEqual(['a', 'c', 'b']);
    expect(r.dueItems[0]?.overdueMs).toBe(99_995);
    expect(r.dueItems[0]?.expiresInMs).toBe(7 * MS_DAY - 99_995);
    expect(r.dueItems.every((d) => d.needsUserConfirm)).toBe(true);
    expect(r.payments.find((p) => p.id === 'x')?.state).toBe('expired');
    expect(r.payments.find((p) => p.id === 'f')?.state).toBe('pending');
  });
  it('addScheduled uniqueness and cap', () => {
    const p = mk();
    const l = addScheduled([], p);
    expect(l.ok).toBe(true);
    if (l.ok) expect(ec(addScheduled(l.value, p))).toBe('duplicate_id');
    const big = Array.from({ length: MAX_SCHEDULED }, (_, i) => ({ ...p, id: `i${i}` }));
    expect(ec(addScheduled(big, p))).toBe('too_many');
  });
});
