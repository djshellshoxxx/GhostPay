#!/usr/bin/env node
// Checks pos-logic.js (static page) against posReduce from @ghostpay/merchant-hooks on event sequences.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { existsSync, readFileSync } from 'node:fs';
import { INITIAL_POS_STATE, posReduce } from '@ghostpay/merchant-hooks';
import { INITIAL, ZERO_DECIMAL_CURRENCIES, checkLink, formatMinor, parseMinor, reduce } from './pos-logic.js';

const start = { type: 'start', sessionId: 's1', invoiceId: 'inv', currency: 'USD', dueMinor: 1000n, ttlSeconds: 60 };
const pay = (n) => ({ type: 'payment', invoiceId: 'inv', currency: 'USD', amountMinor: BigInt(n) });
const seqs = [
  [[start, 100], [pay(400), 110], [pay(600), 120], [pay(1), 121], [{ type: 'tick' }, 130]],
  [[start, 100], [pay(5000), 101]],
  [[start, 100], [{ type: 'tick' }, 160], [pay(1000), 161]],
  [[start, 100], [{ type: 'cancel' }, 101], [pay(1000), 102]],
  [[start, 100], [{ type: 'payment', invoiceId: 'other', currency: 'USD', amountMinor: 1n }, 101], [pay(0), 102], [start, 103]],
  [[{ type: 'tick' }, 5], [pay(1), 6]],
];
for (const seq of seqs) {
  let a = INITIAL_POS_STATE;
  let b = INITIAL;
  for (const [ev, now] of seq) {
    const ra = posReduce(a, ev, now);
    const rb = reduce(b, ev, now);
    assert.equal(rb.accepted, ra.accepted);
    assert.deepEqual(rb.state, ra.state);
    a = ra.state;
    b = rb.state;
  }
}
for (const bad of [{ ...start, ttlSeconds: 5 }, { ...start, ttlSeconds: 901 }, { ...start, dueMinor: 0n }]) {
  assert.throws(() => posReduce(INITIAL_POS_STATE, bad, 1));
  assert.throws(() => reduce(INITIAL, bad, 1));
}
// Runtime-invalid events must fail closed in both the library and the static mirror.
for (const now of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100', null, undefined]) {
  assert.throws(() => posReduce(INITIAL_POS_STATE, start, now), /bad-time-policy/);
  assert.throws(() => reduce(INITIAL, start, now), /bad-time-policy/);
}
for (const fn of [posReduce, reduce]) {
  const idle = fn === posReduce ? INITIAL_POS_STATE : INITIAL;
  assert.throws(() => fn(idle, start, Number.MAX_SAFE_INTEGER - 59), /bad-time-policy/, 'expiry addition must remain safe');
  const active = fn(idle, start, 100).state;
  for (const now of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const ev of [pay(1000), { type: 'tick' }]) {
      assert.throws(() => fn(active, ev, now), /bad-time-policy/);
    }
    assert.equal(fn(active, { type: 'cancel' }, now).state.status, 'cancelled');
  }
  for (const expiresAt of [undefined, NaN, Infinity, -1, 0.5]) {
    assert.throws(() => fn({ ...active, expiresAt }, pay(1000), 101), /bad-time-policy/);
    const cancelled = fn({ ...active, paidMinor: 401n, expiresAt }, { type: 'cancel' }, 101).state;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.paidMinor, 401n);
    assert.equal(Object.hasOwn(cancelled, 'expiresAt'), false);
  }
  for (const field of ['sessionId', 'invoiceId', 'currency']) {
    assert.throws(() => fn(idle, { ...start, [field]: '  ' }, 100), /bad-session/);
    assert.throws(() => fn({ ...active, [field]: null }, pay(1), 101), /bad-session/);
  }
  for (const dueMinor of [1000, '1000', NaN, undefined, null]) {
    assert.throws(() => fn(idle, { ...start, dueMinor }, 100), /bad-amount/);
  }
  for (const amountMinor of [1000, '1000', NaN, undefined, null]) {
    assert.throws(() => fn(active, { ...pay(1000), amountMinor }, 101), /bad-amount/);
  }
  // This parity fixture starts at 100 with a 60-second TTL (expiry 160).
  // The separate package runtime fixture uses a 30-second TTL (expiry 130).
  assert.equal(fn(active, pay(1000), 130).state.status, 'paid');
  assert.equal(fn(active, pay(1000), 159).state.status, 'paid');
  assert.equal(fn(active, pay(1000), 160).state.status, 'expired');
  assert.equal(fn(active, { type: 'tick' }, 160).accepted, true);
}
// Amounts are invoice minor units in the GhostPay app's exponent (apps/web fiatDecimals): 0 decimals for JPY and the
// other zero-decimal codes, 2 for every other code. A fixed 2 made a JPY 1500 sale due 150000.
assert.equal(parseMinor('12.50', 'USD'), 1250n);
assert.equal(parseMinor('0.5', 'USD'), 50n);
assert.equal(parseMinor('1.234', 'USD'), undefined);
assert.equal(parseMinor('-1', 'USD'), undefined);
assert.equal(parseMinor('1e3', 'USD'), undefined);
assert.equal(parseMinor('1500', 'JPY'), 1500n);
assert.equal(parseMinor('1500.00', 'JPY'), 1500n);
assert.equal(parseMinor('1500.5', 'JPY'), undefined);
assert.equal(parseMinor('12.340', 'KWD'), 1234n);
assert.equal(parseMinor('12.345', 'KWD'), undefined);
assert.equal(parseMinor('12', 'usd'), undefined);
assert.equal(parseMinor('0.00000000', 'JPY'), 0n);
assert.equal(parseMinor('12.34000000', 'USD'), 1234n);
assert.equal(parseMinor('1500.00000000', 'JPY'), 1500n);
assert.equal(parseMinor('12.340000000', 'USD'), undefined, 'nine fractional digits remain invalid even when trailing zeros');
assert.equal(parseMinor('9999999999999999.00', 'USD'), 999999999999999900n);
assert.equal(parseMinor('10000000000000000.00', 'USD'), undefined, 'the sixteen-digit integer bound is unchanged');
assert.equal(parseMinor('0.' + '0'.repeat(100_000), 'USD'), undefined, 'unbounded zero input is refused by the existing finite decimal grammar');
assert.equal(formatMinor(5n, 'USD'), '0.05');
assert.equal(formatMinor(123456n, 'USD'), '1234.56');
assert.equal(formatMinor(1500n, 'JPY'), '1500');
assert.equal(formatMinor(1234n, 'KWD'), '12.34');
const appFormat = new URL('../../apps/web/src/lib/format.ts', import.meta.url);
if (existsSync(appFormat)) {
  const app = readFileSync(appFormat, 'utf8');
  const set = /ZERO_DECIMAL_CURRENCIES = new Set\(\[([^\]]*)\]\)/.exec(app);
  assert.deepEqual([...ZERO_DECIMAL_CURRENCIES], [...(set?.[1] ?? '').matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]), 'table equals the GhostPay app table');
  assert.match(app, /return ZERO_DECIMAL_CURRENCIES\.has\(currency\) \? 0 : 2;/, 'every other code has 2 decimals');
} else {
  console.log('SKIP app table check: apps/web is not present');
}
assert.equal(checkLink('http://evil.example/#gpi=v1.abc'), 'link must be https');
assert.equal(checkLink('https://a.example/?x=1#gpi=v1.abc'), 'link must not have credentials or a query');
assert.equal(checkLink('https://u:p@a.example/#gpi=v1.abc'), 'link must not have credentials or a query');
assert.equal(checkLink('https://a.example/#nope'), 'not a GhostPay payment link');
assert.equal(checkLink('https://a.example/#gpi=v1.' + 'a'.repeat(3000)), 'link too long for a QR code');
assert.equal(checkLink('https://a.example/#gpi=v1.abc_-'), undefined);

// Exercise the shipped package and no-bundler mirror against the same independent ledger.
const implementations = [[posReduce, INITIAL_POS_STATE], [reduce, INITIAL]];
const units = fc.bigInt({ min: 1n, max: (1n << 100n) - 1n });
const observation = fc.record({
  amount: units,
  kind: fc.constantFrom('match', 'wrong invoice', 'wrong currency', 'tick', 'duplicate start', 'zero'),
});

test('bounded POS lifecycles preserve exact minor units and terminal absorption', () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 30, max: 900 }),
    fc.array(observation, { minLength: 1, maxLength: 20 }), units,
    (now, ttlSeconds, observations, remainder) => {
      const partial = observations.filter(o => o.kind === 'match').reduce((sum, o) => sum + o.amount, 0n);
      const sale = { ...start, ttlSeconds, dueMinor: partial + remainder };
      const expiresAt = now + ttlSeconds;
      for (const [step, idle] of implementations) {
        let total = 0n;
        const opened = step(idle, sale, now);
        assert.equal(opened.accepted, true);
        let state = Object.freeze(opened.state);
        assert.deepEqual(state, { status: 'awaiting', sessionId: sale.sessionId, invoiceId: sale.invoiceId,
          currency: sale.currency, expiresAt, dueMinor: sale.dueMinor, paidMinor: 0n });
        for (const { kind, amount } of observations) {
          const event = {
            match: pay(amount), 'wrong invoice': { ...pay(amount), invoiceId: 'other' },
            'wrong currency': { ...pay(amount), currency: 'JPY' }, tick: { type: 'tick' },
            'duplicate start': sale, zero: pay(0n),
          }[kind];
          const result = step(state, event, expiresAt - 1);
          assert.equal(result.accepted, kind === 'match');
          if (kind === 'match') total += amount;
          else assert.equal(result.state, state);
          assert.deepEqual(result.state, { ...state, paidMinor: total });
          state = Object.freeze(result.state);
        }
        for (const [event, time, status, accepted, paidMinor] of [
          [pay(remainder), expiresAt - 1, 'paid', true, sale.dueMinor],
          [pay(remainder + 1n), expiresAt - 1, 'paid', true, sale.dueMinor + 1n],
          [pay(remainder), expiresAt, 'expired', false, total],
          [{ type: 'tick' }, expiresAt, 'expired', true, total],
          [{ type: 'cancel' }, NaN, 'cancelled', true, total],
        ]) {
          const closed = step(state, event, time);
          assert.deepEqual(closed, { accepted, state: { ...state, status, paidMinor } });
          for (const replay of [sale, pay(remainder), { type: 'tick' }, { type: 'cancel' }]) {
            const ignored = step(closed.state, replay, now);
            assert.equal(ignored.accepted, false);
            assert.equal(ignored.state, closed.state);
          }
        }
      }
    }), { seed: 400, numRuns: 200 });
});

test('invalid generated inputs cannot replace a valid session', () => {
  const badTime = fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 0, max: 1000 }).map(n => n + 0.5),
    fc.constantFrom(NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined), fc.string({ maxLength: 12 }));
  const badAmount = fc.oneof(fc.double(), fc.string({ maxLength: 32 }), fc.boolean(),
    fc.constantFrom(null, undefined), fc.array(fc.integer(), { maxLength: 4 }), fc.constant({}));
  fc.assert(fc.property(badTime, badAmount, units, (clock, amount, dueMinor) => {
    for (const [step, initial] of implementations) {
      const idle = Object.freeze({ ...initial });
      const sale = { ...start, dueMinor };
      const current = Object.freeze(step(idle, sale, 0).state);
      assert.throws(() => step(idle, sale, clock), /bad-time-policy/);
      assert.throws(() => step(idle, { ...sale, dueMinor: amount }, 0), /bad-amount/);
      for (const event of [pay(1), { type: 'tick' }]) {
        assert.throws(() => step(current, event, clock), /bad-time-policy/);
        assert.throws(() => step({ ...current, expiresAt: clock }, event, 1), /bad-time-policy/);
      }
      assert.throws(() => step(current, { ...pay(1), amountMinor: amount }, 1), /bad-amount/);
      for (const field of ['dueMinor', 'paidMinor']) {
        assert.throws(() => step({ ...current, [field]: amount }, pay(1), 1), /bad-amount/);
      }
      if (typeof amount !== 'string') assert.equal(parseMinor(amount, 'USD'), undefined);
      assert.equal(step(current, pay(dueMinor), 1).state.paidMinor, dueMinor);
    }
  }), { seed: 401, numRuns: 200 });
});
