#!/usr/bin/env node
// Checks pos-logic.js (static page) against posReduce from @ghostpay/merchant-hooks on event sequences.
import assert from 'node:assert/strict';
import { INITIAL_POS_STATE, posReduce } from '@ghostpay/merchant-hooks';
import { INITIAL, checkLink, formatMinor, parseMinor, reduce } from './pos-logic.js';

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
assert.equal(parseMinor('12.50'), 1250n);
assert.equal(parseMinor('0.5'), 50n);
assert.equal(parseMinor('1.234'), undefined);
assert.equal(parseMinor('-1'), undefined);
assert.equal(parseMinor('1e3'), undefined);
assert.equal(formatMinor(5n), '0.05');
assert.equal(formatMinor(123456n), '1234.56');
assert.equal(checkLink('http://evil.example/#gpi=v1.abc'), 'link must be https');
assert.equal(checkLink('https://a.example/?x=1#gpi=v1.abc'), 'link must not have credentials or a query');
assert.equal(checkLink('https://u:p@a.example/#gpi=v1.abc'), 'link must not have credentials or a query');
assert.equal(checkLink('https://a.example/#nope'), 'not a GhostPay payment link');
assert.equal(checkLink('https://a.example/#gpi=v1.' + 'a'.repeat(3000)), 'link too long for a QR code');
assert.equal(checkLink('https://a.example/#gpi=v1.abc_-'), undefined);
console.log('pos-terminal parity: ok');
