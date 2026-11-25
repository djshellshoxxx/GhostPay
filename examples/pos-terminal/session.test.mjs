#!/usr/bin/env node
// Lifecycle tests for pos-session.js, the terminal's DOM-free session layer over the mirrored POS reducer.
// Everything is synthetic: a deterministic clock, an in-memory storage double, a mock wallet that "pays", and a
// mock merchant server that signs and verifies webhook bodies with @ghostpay/merchant-hooks before forwarding the raw
// verified body to the terminal feed. No network, wallet, chain or real funds are involved.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { MemoryNonceStore, parseWebhookEvent, serializeWebhookEvent, signWebhook, verifyWebhook } from '@ghostpay/merchant-hooks';
import { reconcile } from '@ghostpay/merchant-ledger';
import {
  IDLE_SESSION, MAX_FEED_BYTES, MAX_SEEN_EVENTS, SALE_TTL_SECONDS, STORAGE_KEY,
  amountsText, applyFeedMessage, cancelSale, customerView, errorMessage, formatCountdown, keypadInput,
  newSale, parseFeedEvent, presentLink, recordManualPayment, restoreSession, serializeSession, startSale,
  tickSession, verificationText,
} from './pos-session.js';

const LINK = 'https://pos.example/#gpi=v1.synthetic';
const T0 = 1_767_225_600; // 2026-01-01T00:00:00Z

/** Deterministic clock: only advances when told to. */
function fakeClock(start = T0) {
  let now = start;
  return { now: () => now, advance: (s) => { now += s; return now; }, set: (s) => { now = s; } };
}

/** Deterministic session-id source. */
function ids() {
  let n = 0;
  return () => (++n).toString(16).padStart(16, '0');
}

/** In-memory Web Storage double. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    get length() { return map.size; },
  };
}

function open(input = {}, now = T0, nextId = ids()) {
  const r = startSale(IDLE_SESSION, { amount: '12.50', currency: 'USD', link: LINK, invoiceId: 'pos-sale', ...input }, now, nextId);
  assert.equal(r.error, undefined, `unexpected start error ${r.error}`);
  return r.session;
}

/**
 * Mock merchant server: the wallet pays, the server accumulates per invoice (webhooks.md R8 cumulative totals),
 * signs the body, verifies it as a receiver would, and forwards only the verified raw body to the terminal.
 */
function mockMerchantServer(clock) {
  const secret = new Uint8Array(32).fill(7);
  const nonces = new MemoryNonceStore();
  const totals = new Map();
  let seq = 0;
  return {
    pay(invoiceId, currency, amountMinor, type) {
      const total = (totals.get(invoiceId) ?? 0n) + amountMinor;
      totals.set(invoiceId, total);
      seq += 1;
      const body = serializeWebhookEvent({
        id: `evt_${seq}`, type: type ?? 'invoice.partial', createdAt: clock.now(),
        data: { invoiceId, currency, amountMinor: total.toString(), paymentId: `tx_${seq}` },
      });
      const header = signWebhook(secret, body, { now: clock.now(), nonce: seq.toString(16).padStart(16, '0') });
      const verified = verifyWebhook(secret, body, header, { now: clock.now(), nonces });
      assert.equal(verified.ok, true, 'the mock server forwards only verified bodies');
      return body;
    },
  };
}

describe('sale creation, amount validation and currency precision', () => {
  test('a valid sale opens awaiting with exact minor units, the configured TTL and the link held in memory', () => {
    const s = open();
    assert.equal(s.sale.status, 'awaiting');
    assert.equal(s.sale.dueMinor, 1250n);
    assert.equal(s.sale.paidMinor, 0n);
    assert.equal(s.sale.expiresAt, T0 + SALE_TTL_SECONDS);
    assert.equal(s.sale.invoiceId, 'pos-sale');
    assert.equal(s.sale.sessionId, '0000000000000001');
    assert.equal(s.link, LINK);
    assert.equal(amountsText(s), '0.00 / 12.50 USD');
  });

  test('zero-decimal and two-decimal currencies keep their exponent; excess precision is refused, never rounded', () => {
    assert.equal(open({ amount: '1500', currency: 'JPY' }).sale.dueMinor, 1500n);
    assert.equal(open({ amount: '12.340', currency: 'KWD' }).sale.dueMinor, 1234n);
    assert.equal(open({ amount: '9999999999999999.99' }).sale.dueMinor, 999999999999999999n);
    for (const [amount, currency] of [['1500.5', 'JPY'], ['12.345', 'USD'], ['0', 'USD'], ['0.00', 'USD'], ['-1', 'USD'],
      ['1e6', 'USD'], ['', 'USD'], [' ', 'USD'], ['10000000000000000', 'USD'], ['1,50', 'USD']]) {
      const r = startSale(IDLE_SESSION, { amount, currency, link: LINK }, T0, ids());
      assert.equal(r.error, 'bad-amount', `${amount} ${currency}`);
      assert.equal(r.session, IDLE_SESSION);
    }
    assert.equal(errorMessage('bad-amount', 'JPY'), 'Enter an amount like 1250 JPY.');
    assert.equal(errorMessage('bad-amount', 'USD'), 'Enter an amount like 12.50 USD.');
  });

  test('currency, link, invoice reference, TTL, clock and busy terminal are validated before a sale opens', () => {
    const cases = [
      [{ currency: 'US' }, 'bad-currency'], [{ currency: 'usd1' }, 'bad-currency'],
      [{ link: 'http://evil.example/#gpi=v1.abc' }, 'bad-link'], [{ link: '' }, 'bad-link'],
      [{ invoiceId: 'has space' }, 'bad-invoice'], [{ invoiceId: 'x'.repeat(129) }, 'bad-invoice'],
      [{ ttlSeconds: 29 }, 'bad-ttl'], [{ ttlSeconds: 901 }, 'bad-ttl'], [{ ttlSeconds: 1.5 }, 'bad-ttl'],
    ];
    for (const [input, code] of cases) {
      assert.equal(startSale(IDLE_SESSION, { amount: '1', currency: 'USD', link: LINK, ...input }, T0, ids()).error, code);
    }
    for (const now of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const r = startSale(IDLE_SESSION, { amount: '1', currency: 'USD', link: LINK }, now, ids());
      assert.equal(r.error, 'bad-clock');
      assert.equal(r.session, IDLE_SESSION);
    }
    const active = open();
    assert.equal(startSale(active, { amount: '1', currency: 'USD', link: LINK }, T0, ids()).error, 'busy');
    assert.equal(errorMessage('bad-link', 'USD', 'link must be https'), 'link must be https');
    assert.equal(errorMessage('bad-clock'), 'Check the terminal clock and retry.');
    const custom = open({ invoiceId: 'order-42:a_b.c', currency: ' eur ' });
    assert.equal(custom.sale.invoiceId, 'order-42:a_b.c');
    assert.equal(custom.sale.currency, 'EUR');
  });

  test('the touch keypad builds only amounts the currency can represent', () => {
    const type = (keys, currency = 'USD', start = '') => keys.reduce((v, k) => keypadInput(v, k, currency), start);
    assert.equal(type(['1', '2', '.', '5', '0']), '12.50');
    assert.equal(type(['1', '.', '2', '3', '4']), '1.23', 'third decimal ignored for a 2-decimal currency');
    assert.equal(type(['1', '.', '.', '5']), '1.5');
    assert.equal(type(['.', '5']), '0.5');
    assert.equal(type(['0', '0', '7']), '7', 'no leading zeros');
    assert.equal(type(['1', '5', '0', '0', '.'], 'JPY'), '1500', 'no decimal point for a zero-decimal currency');
    assert.equal(type(['1', '2', 'back']), '1');
    assert.equal(type(['1', '2', 'clear']), '');
    assert.equal(type(['back']), '');
    assert.equal(type(Array(20).fill('9')), '9'.repeat(16), 'integer digits stop at the parser bound');
    assert.equal(type(['x', '-', 'e']), '', 'unknown keys are ignored');
    assert.equal(keypadInput('1e6', '1', 'USD'), '1e6', 'an invalid typed value is left for the validator to report');
  });
});

describe('presentation, countdown and the customer display', () => {
  test('customer view shows exact due/remaining amounts, an m:ss countdown and the QR only while awaiting', () => {
    const s = open({ amount: '10.05' });
    const v = customerView(s, T0 + 1);
    assert.deepEqual(v, {
      status: 'awaiting', title: 'Scan to pay', dueText: '10.05 USD', remainingText: 'Remaining 10.05 USD',
      countdownText: '4:59', showQr: true,
    });
    const part = recordManualPayment(s, '0.05', T0 + 2).session;
    assert.equal(customerView(part, T0 + 2).remainingText, 'Remaining 10.00 USD');
    assert.equal(customerView(part, T0 + 299).countdownText, '0:01');
    assert.equal(customerView(part, T0 + 300).countdownText, '0:00', 'never negative');
    assert.equal(customerView(part, NaN).countdownText, '', 'an unusable clock shows no countdown');
    const idle = customerView(IDLE_SESSION, T0);
    assert.equal(idle.showQr, false);
    assert.equal(idle.title, 'Welcome');
    assert.equal(idle.dueText, '');
    assert.equal(formatCountdown(0), '0:00');
    assert.equal(formatCountdown(61), '1:01');
    assert.equal(formatCountdown(900), '15:00');
    assert.equal(formatCountdown(-5), '0:00');
    assert.equal(formatCountdown(NaN), '');
  });

  test('terminal outcomes have distinct customer titles and never show the QR', () => {
    const s = open();
    const outcomes = {
      paid: recordManualPayment(s, '12.50', T0 + 1).session,
      expired: tickSession(s, T0 + SALE_TTL_SECONDS).session,
      cancelled: cancelSale(s, T0 + 1),
    };
    const titles = { paid: 'Payment recorded. Thank you', expired: 'Payment request expired', cancelled: 'Sale cancelled' };
    for (const [status, session] of Object.entries(outcomes)) {
      assert.equal(session.sale.status, status);
      assert.equal(session.link, undefined, 'the bearer link is dropped when the sale ends');
      const v = customerView(session, T0 + 1);
      assert.equal(v.title, titles[status]);
      assert.equal(v.showQr, false);
      assert.equal(v.countdownText, '');
    }
    assert.equal(customerView(outcomes.paid, T0).remainingText, '');
  });

  test('tick expires exactly at the deadline and reports an unusable clock without losing the sale', () => {
    const s = open();
    assert.equal(tickSession(s, T0 + SALE_TTL_SECONDS - 1).session.sale.status, 'awaiting');
    const expired = tickSession(s, T0 + SALE_TTL_SECONDS);
    assert.equal(expired.clockOk, true);
    assert.equal(expired.session.sale.status, 'expired');
    for (const now of [NaN, Infinity, -1]) {
      const r = tickSession(s, now);
      assert.equal(r.clockOk, false);
      assert.equal(r.session, s);
    }
    assert.equal(tickSession(IDLE_SESSION, NaN).clockOk, true, 'nothing to time while idle');
  });
});

describe('cancellation and reset', () => {
  test('cancel keeps the recorded partial total, works with a failed clock and is absorbed afterwards', () => {
    const part = recordManualPayment(open(), '2.00', T0 + 1).session;
    const c = cancelSale(part, NaN);
    assert.equal(c.sale.status, 'cancelled');
    assert.equal(c.sale.paidMinor, 200n);
    assert.equal(cancelSale(c, T0), c);
    assert.equal(recordManualPayment(c, '1', T0).error, 'not-active');
    assert.equal(cancelSale(IDLE_SESSION, T0), IDLE_SESSION);
  });

  test('new sale starts from a clean idle session with fresh identifiers and no inherited totals or reports', () => {
    const nextId = ids();
    const server = mockMerchantServer(fakeClock());
    const first = applyFeedMessage(open({}, T0, nextId), server.pay('pos-sale', 'USD', 1250n, 'invoice.paid'), T0 + 1).session;
    assert.equal(first.sale.status, 'paid');
    const reset = newSale(first);
    assert.equal(reset, IDLE_SESSION);
    const second = startSale(reset, { amount: '1.25', currency: 'USD', link: LINK + '2', invoiceId: 'pos-sale-2' }, T0 + 5, nextId).session;
    assert.notEqual(second.sale.sessionId, first.sale.sessionId);
    assert.equal(second.sale.paidMinor, 0n);
    assert.equal(second.verifiedMinor, 0n);
    assert.deepEqual(second.seen, []);
    assert.equal(amountsText(second), '0.00 / 1.25 USD');
  });

  test('without a reference each sale gets its own invoice id, so a delayed report for the previous sale cannot credit the next', () => {
    const nextId = ids();
    const clock = fakeClock();
    const server = mockMerchantServer(clock);
    const start = (link) => startSale(IDLE_SESSION, { amount: '10.00', currency: 'USD', link }, clock.now(), nextId).session;
    const first = start(LINK);
    assert.equal(first.sale.invoiceId, 'pos-0000000000000001');
    const delayed = server.pay(first.sale.invoiceId, 'USD', 600n); // previous sale's report, delivered late
    const second = start(LINK + '2');
    assert.equal(second.sale.invoiceId, 'pos-0000000000000002');
    const r = applyFeedMessage(second, delayed, clock.advance(1));
    assert.equal(r.outcome, 'wrong-sale');
    assert.equal(r.session.sale.paidMinor, 0n);
  });
});

describe('payment completion from the verified payment feed', () => {
  test('cumulative webhook totals become exact one-time deltas and complete the sale', () => {
    const clock = fakeClock();
    const server = mockMerchantServer(clock);
    let s = open({ amount: '10.00', invoiceId: 'inv-7' });
    let r = applyFeedMessage(s, server.pay('inv-7', 'USD', 400n), clock.advance(5));
    assert.equal(r.outcome, 'counted');
    assert.equal(r.deltaMinor, 400n);
    s = r.session;
    assert.equal(s.sale.paidMinor, 400n);
    assert.equal(s.verifiedMinor, 400n);
    r = applyFeedMessage(s, server.pay('inv-7', 'USD', 600n, 'invoice.paid'), clock.advance(5));
    assert.equal(r.outcome, 'counted');
    assert.equal(r.deltaMinor, 600n);
    assert.equal(r.session.sale.status, 'paid');
    assert.equal(r.session.sale.paidMinor, 1000n);
    assert.match(verificationText(r.session), /payment feed/);
    assert.doesNotMatch(verificationText(r.session), /entered by hand/);
  });

  test('replayed, reordered and stale reports never duplicate a total', () => {
    const clock = fakeClock();
    const server = mockMerchantServer(clock);
    let s = open({ amount: '10.00' });
    const first = server.pay('pos-sale', 'USD', 300n);
    const second = server.pay('pos-sale', 'USD', 200n);
    s = applyFeedMessage(s, second, T0 + 1).session; // arrives first: cumulative 500
    assert.equal(s.sale.paidMinor, 500n);
    const stale = applyFeedMessage(s, first, T0 + 2); // older cumulative 300
    assert.equal(stale.outcome, 'stale');
    assert.equal(stale.session.sale.paidMinor, 500n);
    const replay = applyFeedMessage(stale.session, second, T0 + 3);
    assert.equal(replay.outcome, 'duplicate');
    assert.equal(replay.session, stale.session);
    assert.equal(replay.session.sale.paidMinor, 500n);
  });

  test('overpayment is counted exactly and closes the sale as paid', () => {
    const server = mockMerchantServer(fakeClock());
    const r = applyFeedMessage(open({ amount: '1.00' }), server.pay('pos-sale', 'USD', 150n, 'invoice.over'), T0 + 1);
    assert.equal(r.session.sale.status, 'paid');
    assert.equal(r.session.sale.paidMinor, 150n);
    assert.equal(amountsText(r.session), '1.50 / 1.00 USD');
  });

  test('reports for another invoice or currency, expiry notices and malformed bodies are refused without effect', () => {
    const server = mockMerchantServer(fakeClock());
    const s = open({ invoiceId: 'inv-1' });
    const outcomes = [
      [server.pay('inv-2', 'USD', 1250n), 'wrong-sale'],
      [server.pay('inv-1', 'EUR', 1250n), 'wrong-sale'],
      [server.pay('inv-1', 'USD', 0n, 'invoice.expired'), 'ignored-type'],
      ['{"id":"e","type":"invoice.paid"}', 'malformed'],
      ['not json', 'malformed'],
      [42, 'malformed'],
      ['x'.repeat(MAX_FEED_BYTES + 1), 'malformed'],
      [JSON.stringify({ id: 'e', type: 'invoice.paid', createdAt: 1, data: { invoiceId: 'inv-1', currency: 'USD', amountMinor: '1250', extra: 1 } }), 'malformed'],
      [JSON.stringify({ id: 'e', type: 'invoice.paid', createdAt: 1, data: { invoiceId: 'inv-1', currency: 'USD', amountMinor: '01250' } }), 'malformed'],
      [JSON.stringify({ id: 'e', type: 'invoice.paid', createdAt: 1, data: { invoiceId: 'inv-1', currency: 'USD', amountMinor: 1250 } }), 'malformed'],
    ];
    for (const [raw, outcome] of outcomes) {
      const r = applyFeedMessage(s, raw, T0 + 1);
      assert.equal(r.outcome, outcome, String(raw).slice(0, 60));
      assert.equal(r.session.sale.paidMinor, 0n);
      assert.equal(r.session.sale.status, 'awaiting');
    }
  });

  test('a report at or after the deadline expires the sale uncounted; one after closing is flagged for review', () => {
    const server = mockMerchantServer(fakeClock());
    const s = open();
    const late = applyFeedMessage(s, server.pay('pos-sale', 'USD', 1250n), T0 + SALE_TTL_SECONDS);
    assert.equal(late.outcome, 'late');
    assert.equal(late.session.sale.status, 'expired');
    assert.equal(late.session.sale.paidMinor, 0n);
    const after = applyFeedMessage(late.session, server.pay('pos-sale', 'USD', 1n), T0 + SALE_TTL_SECONDS + 1);
    assert.equal(after.outcome, 'not-active');
    assert.equal(after.session, late.session);
    assert.equal(applyFeedMessage(IDLE_SESSION, server.pay('pos-sale', 'USD', 1n), T0).outcome, 'not-active');
  });

  test('a report during a clock failure is not consumed, so redelivery counts it once the clock recovers', () => {
    const server = mockMerchantServer(fakeClock());
    const body = server.pay('pos-sale', 'USD', 1250n);
    const s = open();
    const failed = applyFeedMessage(s, body, NaN);
    assert.equal(failed.outcome, 'bad-clock');
    assert.equal(failed.session, s);
    assert.equal(applyFeedMessage(failed.session, body, T0 + 1).session.sale.status, 'paid');
  });

  test('manual demo entries are flagged as not verified and combine exactly with feed totals', () => {
    const server = mockMerchantServer(fakeClock());
    let s = recordManualPayment(open({ amount: '10.00' }), '1.00', T0 + 1).session;
    assert.equal(s.manualMinor, 100n);
    s = applyFeedMessage(s, server.pay('pos-sale', 'USD', 400n), T0 + 2).session;
    assert.equal(s.sale.paidMinor, 500n);
    s = applyFeedMessage(s, server.pay('pos-sale', 'USD', 500n), T0 + 3).session; // cumulative 900
    assert.equal(s.sale.paidMinor, 1000n);
    assert.equal(s.sale.status, 'paid');
    assert.match(verificationText(s), /entered by hand/);
    assert.equal(verificationText(IDLE_SESSION), '');
    for (const amount of ['', '0', '1.234', 'abc', '-1']) assert.equal(recordManualPayment(open(), amount, T0).error, 'bad-received');
    assert.equal(recordManualPayment(open(), '1', NaN).error, 'bad-clock');
    const late = recordManualPayment(open(), '12.50', T0 + SALE_TTL_SECONDS);
    assert.equal(late.session.sale.status, 'expired');
    assert.equal(late.session.manualMinor, 0n);
  });

  test('the remembered report window is bounded', () => {
    const server = mockMerchantServer(fakeClock());
    let s = open({ amount: '9999.00' });
    for (let i = 0; i < MAX_SEEN_EVENTS + 10; i++) s = applyFeedMessage(s, server.pay('pos-sale', 'USD', 1n), T0 + 1).session;
    assert.equal(s.seen.length, MAX_SEEN_EVENTS);
    assert.equal(s.sale.paidMinor, BigInt(MAX_SEEN_EVENTS + 10));
  });

  test('feed event validation accepts exactly what merchant-hooks parseWebhookEvent accepts', () => {
    const id = fc.oneof(fc.stringMatching(/^[A-Za-z0-9_.:-]{1,12}$/), fc.string({ maxLength: 4 }), fc.constant('x'.repeat(129)));
    const amount = fc.oneof(fc.bigInt({ min: 0n, max: 10n ** 31n }).map(String), fc.constantFrom('01', '-1', '1.0', ''), fc.integer());
    const data = fc.record({
      invoiceId: id, currency: fc.constantFrom('USD', 'JPY', 'usd', 'US', 7),
      amountMinor: amount, paymentId: fc.option(id, { nil: undefined }), extra: fc.option(fc.constant(1), { nil: undefined }),
    }, { requiredKeys: [] });
    const event = fc.record({
      id, type: fc.constantFrom('invoice.paid', 'invoice.partial', 'invoice.over', 'invoice.expired', 'invoice.other'),
      createdAt: fc.oneof(fc.integer({ min: -2, max: 2 ** 40 }), fc.double(), fc.constant('1')), data,
    }, { requiredKeys: [] });
    fc.assert(fc.property(fc.oneof(event.map(e => JSON.stringify(e)), fc.string({ maxLength: 40 })), (raw) => {
      let expected;
      try { expected = parseWebhookEvent(raw); } catch { expected = undefined; }
      assert.deepEqual(parseFeedEvent(raw), expected);
    }), { seed: 402, numRuns: 500 });
  });

  test('generated wallet payments agree with merchant-ledger reconcile before the deadline', () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 1n, max: 10n ** 12n }),
      fc.array(fc.record({ amount: fc.bigInt({ min: 1n, max: 10n ** 12n }), at: fc.integer({ min: 0, max: SALE_TTL_SECONDS + 20 }) }), { maxLength: 8 }),
      (due, wallet) => {
        const clock = fakeClock();
        const server = mockMerchantServer(clock);
        let s = startSale(IDLE_SESSION, { amount: due.toString(), currency: 'JPY', link: LINK, invoiceId: 'pos-sale' }, T0, ids()).session;
        const payments = [];
        for (const [i, { amount, at }] of [...wallet].sort((a, b) => a.at - b.at).entries()) {
          clock.set(T0 + at);
          const body = server.pay('pos-sale', 'JPY', amount);
          s = applyFeedMessage(s, body, clock.now()).session;
          payments.push({ id: `tx_${i}`, invoiceId: 'pos-sale', currency: 'JPY', amountMinor: amount.toString(), observedAt: clock.now() });
          if (s.sale.status === 'paid') break; // the terminal closes on completion; later funds are review items
        }
        const [ledger] = reconcile([{ id: 'pos-sale', currency: 'JPY', amountMinor: due.toString(), expiresAt: T0 + SALE_TTL_SECONDS }],
          payments, { now: clock.now() }).invoices;
        assert.equal(s.sale.paidMinor.toString(), ledger.paidMinor, 'exact counted total');
        if (s.sale.status === 'awaiting' && clock.now() >= T0 + SALE_TTL_SECONDS) return; // no tick delivered yet
        const terminal = s.sale.status === 'paid' ? (s.sale.paidMinor > due ? 'over' : 'paid')
          : s.sale.status === 'expired' ? 'expired' : s.sale.paidMinor === 0n ? 'unmatched' : 'partial';
        assert.equal(terminal, ledger.status);
      }), { seed: 403, numRuns: 300 });
  });
});

describe('session persistence and recovery', () => {
  test('an active sale round-trips without the bearer link and resumes awaiting', () => {
    const storage = memoryStorage();
    const server = mockMerchantServer(fakeClock());
    let s = applyFeedMessage(open({ invoiceId: 'inv-9' }), server.pay('inv-9', 'USD', 250n), T0 + 1).session;
    s = recordManualPayment(s, '1.00', T0 + 2).session;
    const text = serializeSession(s);
    assert.equal(typeof text, 'string');
    assert.doesNotMatch(text, /gpi=|https:/, 'the payment link is never stored');
    storage.setItem(STORAGE_KEY, text);
    const r = restoreSession(storage.getItem(STORAGE_KEY), T0 + 10);
    assert.equal(r.notice, 'restored');
    assert.equal(r.session.restored, true);
    assert.equal(r.session.link, undefined);
    assert.deepEqual(r.session.sale, s.sale);
    assert.equal(r.session.verifiedMinor, 250n);
    assert.equal(r.session.manualMinor, 100n);
    assert.deepEqual(r.session.seen, s.seen);
    assert.equal(customerView(r.session, T0 + 10).showQr, false, 'no QR until the link is presented again');
    assert.equal(customerView(r.session, T0 + 10).title, 'One moment, please');
    const replay = applyFeedMessage(r.session, server.pay('inv-9', 'USD', 0n), T0 + 11); // cumulative still 250
    assert.equal(replay.outcome, 'stale');
    const shown = presentLink(r.session, LINK);
    assert.equal(shown.error, undefined);
    assert.equal(shown.session.link, LINK);
    assert.equal(shown.session.restored, false);
    assert.equal(customerView(shown.session, T0 + 10).showQr, true);
    assert.equal(customerView(shown.session, T0 + 10).title, 'Scan to pay');
    assert.equal(presentLink(r.session, 'http://x.example/#gpi=v1.a').error, 'bad-link');
    assert.equal(presentLink(IDLE_SESSION, LINK).error, 'not-active');
  });

  for (const count of [1, 60, 63, MAX_SEEN_EVENTS, MAX_SEEN_EVENTS + 10]) {
    test(`valid maximum-length report IDs survive a reload after ${count} reports`, () => {
      const invoiceId = 'i'.repeat(128);
      let s = open({ invoiceId, amount: '100.00' });
      let lastBody;
      for (let i = 0; i < count; i++) {
        lastBody = JSON.stringify({
          id: 'e'.repeat(125) + String(i).padStart(3, '0'),
          type: 'invoice.partial',
          createdAt: T0,
          data: { invoiceId, currency: 'USD', amountMinor: String(i + 1) },
        });
        const result = applyFeedMessage(s, lastBody, T0 + 1);
        assert.equal(result.outcome, 'counted');
        s = result.session;
      }
      assert.equal(s.seen.length, Math.min(count, MAX_SEEN_EVENTS));
      const text = serializeSession(s);
      assert.doesNotMatch(text, /gpi=|https:/);
      const restored = restoreSession(text, T0 + 2);
      assert.equal(restored.notice, 'restored');
      assert.deepEqual(restored.session.sale, s.sale);
      assert.equal(restored.session.verifiedMinor, BigInt(count));
      assert.deepEqual(restored.session.seen, s.seen);
      assert.equal(applyFeedMessage(restored.session, lastBody, T0 + 3).outcome, 'duplicate');
    });
  }

  test('only an awaiting sale is stored; closed and idle sessions clear storage', () => {
    const s = open();
    assert.equal(serializeSession(IDLE_SESSION), undefined);
    assert.equal(serializeSession(cancelSale(s, T0)), undefined);
    assert.equal(serializeSession(tickSession(s, T0 + SALE_TTL_SECONDS).session), undefined);
    assert.equal(serializeSession(recordManualPayment(s, '12.50', T0).session), undefined);
  });

  test('a sale that ended while the page was closed restores as expired with its recorded total', () => {
    const part = recordManualPayment(open(), '2.00', T0 + 1).session;
    const r = restoreSession(serializeSession(part), T0 + SALE_TTL_SECONDS + 60);
    assert.equal(r.notice, 'expired-while-away');
    assert.equal(r.session.sale.status, 'expired');
    assert.equal(r.session.sale.paidMinor, 200n);
  });

  test('a deadline beyond the maximum TTL (clock moved back) closes the restored sale for review', () => {
    const s = open();
    const r = restoreSession(serializeSession(s), T0 - 3600);
    assert.equal(r.notice, 'clock-changed');
    assert.equal(r.session.sale.status, 'cancelled');
  });

  test('an unusable clock on reload keeps the restored sale awaiting until the clock recovers', () => {
    const s = open();
    const r = restoreSession(serializeSession(s), NaN);
    assert.equal(r.notice, 'restored');
    assert.equal(r.session.sale.status, 'awaiting');
  });

  test('missing, corrupt, tampered or inconsistent records are discarded instead of reopening a sale', () => {
    assert.deepEqual(restoreSession(null, T0), { session: IDLE_SESSION, notice: 'none' });
    const good = JSON.parse(serializeSession(recordManualPayment(open(), '1.00', T0).session));
    const tampered = [
      'not json', '[]', '{}', JSON.stringify({ ...good, v: 2 }), JSON.stringify({ ...good, link: LINK }),
      JSON.stringify({ ...good, dueMinor: '0' }), JSON.stringify({ ...good, dueMinor: 1250 }),
      JSON.stringify({ ...good, paidMinor: '1250' }), JSON.stringify({ ...good, paidMinor: '-1' }),
      JSON.stringify({ ...good, manualMinor: '0' }), JSON.stringify({ ...good, verifiedMinor: '5' }),
      JSON.stringify({ ...good, currency: 'usd' }), JSON.stringify({ ...good, invoiceId: '' }),
      JSON.stringify({ ...good, sessionId: '<script>' }), JSON.stringify({ ...good, expiresAt: 1.5 }),
      JSON.stringify({ ...good, expiresAt: -1 }), JSON.stringify({ ...good, seen: ['ok', 'ok'] }),
      JSON.stringify({ ...good, seen: Array(MAX_SEEN_EVENTS + 1).fill(0).map((_, i) => `e${i}`) }),
      JSON.stringify({ ...good, seen: ['bad id'] }), JSON.stringify({ ...good, seen: 'e1' }),
      JSON.stringify({ ...good, dueMinor: '1' + '0'.repeat(40) }), 'x'.repeat(MAX_FEED_BYTES * 4),
    ];
    for (const text of tampered) {
      const r = restoreSession(text, T0 + 1);
      assert.equal(r.notice, 'discarded', text.slice(0, 80));
      assert.equal(r.session, IDLE_SESSION);
    }
  });

  test('generated lifecycles keep the stored record consistent with the in-memory session', () => {
    const step = fc.oneof(
      fc.record({ op: fc.constant('feed'), amount: fc.bigInt({ min: 0n, max: 2000n }) }),
      fc.record({ op: fc.constant('manual'), amount: fc.bigInt({ min: 1n, max: 2000n }) }),
      fc.record({ op: fc.constantFrom('tick', 'cancel', 'reload') }),
    );
    fc.assert(fc.property(fc.array(step, { maxLength: 12 }), fc.array(fc.integer({ min: 0, max: 120 }), { minLength: 12, maxLength: 12 }), (steps, gaps) => {
      const clock = fakeClock();
      const server = mockMerchantServer(clock);
      const storage = memoryStorage();
      let s = open({ amount: '50.00' });
      const persist = () => {
        const text = serializeSession(s);
        if (text === undefined) storage.removeItem(STORAGE_KEY); else storage.setItem(STORAGE_KEY, text);
      };
      persist();
      for (const [i, st] of steps.entries()) {
        clock.advance(gaps[i]);
        if (st.op === 'feed') s = applyFeedMessage(s, server.pay('pos-sale', 'USD', st.amount), clock.now()).session;
        if (st.op === 'manual') s = recordManualPayment(s, (Number(st.amount) / 100).toFixed(2), clock.now()).session;
        if (st.op === 'tick') s = tickSession(s, clock.now()).session;
        if (st.op === 'cancel') s = cancelSale(s, clock.now());
        if (st.op === 'reload') {
          const before = s;
          s = restoreSession(storage.getItem(STORAGE_KEY), clock.now()).session;
          if (before.sale.status === 'awaiting') {
            assert.equal(s.sale.paidMinor, before.sale.paidMinor);
            assert.equal(s.sale.sessionId, before.sale.sessionId);
          } else assert.equal(s, IDLE_SESSION);
        }
        assert.equal(s.sale.paidMinor, (s.verifiedMinor ?? 0n) + (s.manualMinor ?? 0n), 'paid = feed + manual');
        persist();
        assert.equal(storage.length, s.sale.status === 'awaiting' ? 1 : 0);
      }
    }), { seed: 404, numRuns: 200 });
  });
});
