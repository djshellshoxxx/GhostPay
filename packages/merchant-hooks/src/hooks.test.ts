import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInvoice, parseFragment, signInvoice, signerPublicKeyHex, type RandomSource } from '@ghostpay/invoice-schema';
import {
  HooksError,
  IdempotencyGuard,
  INITIAL_POS_STATE,
  MAX_QR_BYTES,
  MemoryNonceStore,
  assertBaseUrl,
  assertPaymentLink,
  buildPaymentButton,
  buildPaymentLink,
  buildQrPayload,
  constantTimeEqual,
  decodeNdefUri,
  encodeNdefUri,
  escapeHtml,
  parseWebhookEvent,
  posReduce,
  retryDelaySeconds,
  serializeWebhookEvent,
  signWebhook,
  tagFit,
  verifyWebhook,
  type PosEvent,
  type PosState,
  type WebhookEvent,
} from './index.js';

const key = (n: number): Uint8Array => {
  const k = new Uint8Array(32);
  k[31] = n;
  return k;
};
const rng: RandomSource = {
  getRandomValues<T extends ArrayBufferView | null>(a: T): T {
    if (a === null) return a;
    new Uint8Array(a.buffer, a.byteOffset, a.byteLength).forEach((_, i, v) => (v[i] = (i * 7 + 3) & 0xff));
    return a;
  },
};
const NOW = 1_800_000_000;
function signed(memo = 'thanks') {
  const meta = `st:eth:0x${signerPublicKeyHex(key(3))}${signerPublicKeyHex(key(4))}`;
  const inv = createInvoice(
    {
      chainId: 8453,
      metaAddress: meta,
      fiat: { currency: 'USD', minorUnits: '12345' },
      token: 'native',
      amountPolicy: { mode: 'fiat_quote' },
      quote: { source: 'chainlink:eth-usd', timestamp: NOW, expiresAt: NOW + 600, maxSlippageBps: 50 },
      expiresAt: NOW + 3600,
      lineItems: [{ description: 'Coffee', quantity: '2', unitMinorUnits: '600' }],
      tax: { rateBps: 0, minorUnits: '0' },
      feePolicy: 'seller_pays',
      memo,
      signer: signerPublicKeyHex(key(7)),
    },
    rng,
  );
  return signInvoice(inv, key(7));
}

const SECRET = new Uint8Array(32).fill(9);
const NONCE = 'ab'.repeat(8);

describe('webhook signing', () => {
  it('roundtrips and has stable vector', () => {
    const h = signWebhook(SECRET, '{"a":1}', { now: NOW, nonce: NONCE });
    expect(h).toMatch(/^t=1800000000,n=abababababababab,v1=[0-9a-f]{64}$/);
    expect(h).toBe(signWebhook(SECRET, '{"a":1}', { now: NOW, nonce: NONCE }));
    const r = verifyWebhook(SECRET, '{"a":1}', h, { now: NOW + 10, nonces: new MemoryNonceStore() });
    expect(r).toEqual({ ok: true, timestamp: NOW, nonce: NONCE });
  });
  it('rejects tamper, wrong secret, header edits', () => {
    const h = signWebhook(SECRET, 'body', { now: NOW, nonce: NONCE });
    const ctx = () => ({ now: NOW, nonces: new MemoryNonceStore() });
    expect(verifyWebhook(SECRET, 'bodY', h, ctx())).toEqual({ ok: false, reason: 'bad-signature' });
    expect(verifyWebhook(new Uint8Array(32).fill(8), 'body', h, ctx())).toEqual({ ok: false, reason: 'bad-signature' });
    expect(verifyWebhook(SECRET, 'body', h.replace('n=ab', 'n=cd'), ctx())).toEqual({ ok: false, reason: 'bad-signature' });
    expect(verifyWebhook(SECRET, 'body', h.replace(`t=${NOW}`, `t=${NOW + 1}`), ctx())).toEqual({ ok: false, reason: 'bad-signature' });
  });
  it('freshness window both directions', () => {
    const h = signWebhook(SECRET, 'b', { now: NOW, nonce: NONCE });
    const at = (now: number) => verifyWebhook(SECRET, 'b', h, { now, nonces: new MemoryNonceStore() });
    expect(at(NOW + 300).ok).toBe(true);
    expect(at(NOW + 301)).toEqual({ ok: false, reason: 'stale' });
    expect(at(NOW - 300).ok).toBe(true);
    expect(at(NOW - 301)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyWebhook(SECRET, 'b', h, { now: NOW + 5, toleranceSeconds: 1, nonces: new MemoryNonceStore() }).ok).toBe(false);
  });
  it('replay rejected; forged request does not poison store', () => {
    const store = new MemoryNonceStore();
    const h = signWebhook(SECRET, 'b', { now: NOW, nonce: NONCE });
    const forged = `t=${NOW},n=${NONCE},v1=${'0'.repeat(64)}`;
    expect(verifyWebhook(SECRET, 'b', forged, { now: NOW, nonces: store }).ok).toBe(false);
    expect(verifyWebhook(SECRET, 'b', h, { now: NOW, nonces: store }).ok).toBe(true);
    expect(verifyWebhook(SECRET, 'b', h, { now: NOW + 1, nonces: store })).toEqual({ ok: false, reason: 'replay' });
  });
  it('malformed headers', () => {
    const good = signWebhook(SECRET, 'b', { now: NOW, nonce: NONCE });
    const sig = good.split('v1=')[1] as string;
    const bads = [
      '',
      'garbage',
      `t=${NOW},n=${NONCE}`,
      `${good},x=1`,
      `n=${NONCE},t=${NOW},v1=${sig}`,
      `t=${NOW},n=${NONCE},v1=${sig.toUpperCase()}`,
      `t=${NOW},n=abc,v1=${sig}`,
      `t=-1,n=${NONCE},v1=${sig}`,
      `t=${NOW},n=${NONCE},v1=${sig.slice(1)}`,
      `t=${NOW},n=${NONCE},w1=${sig}`,
      `t=${NOW},m=${NONCE},v1=${sig}`,
      `s=${NOW},n=${NONCE},v1=${sig}`,
      `t=${NOW},t=${NOW},v1=${sig}`,
    ];
    for (const b of bads) expect(verifyWebhook(SECRET, 'b', b, { now: NOW, nonces: new MemoryNonceStore() })).toEqual({ ok: false, reason: 'malformed' });
  });
  it('weak secret / bad nonce', () => {
    expect(() => signWebhook(new Uint8Array(31), 'b', { now: NOW, nonce: NONCE })).toThrow(/weak-secret/);
    expect(() => verifyWebhook(new Uint8Array(1), 'b', 'x', { now: NOW, nonces: new MemoryNonceStore() })).toThrow(HooksError);
    expect(() => signWebhook(SECRET, 'b', { now: NOW, nonce: 'zz' })).toThrow(/bad-nonce/);
    expect(() => signWebhook(SECRET, 'b', { now: -1, nonce: NONCE })).toThrow(/bad-nonce/);
  });
  it('constant-time compare', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
  it('nonce store expiry and fail-closed when full', () => {
    const s = new MemoryNonceStore(2);
    expect(s.add('a', 100, 0)).toBe(true);
    expect(s.add('b', 200, 0)).toBe(true);
    expect(s.add('c', 300, 50)).toBe(false);
    expect(s.has('a', 99)).toBe(true);
    expect(s.has('a', 100)).toBe(false);
    expect(s.add('c', 300, 100)).toBe(true); // a pruned
    expect(s.has('b', 150)).toBe(true);
    expect(s.has('zz', 0)).toBe(false);
    const full = new MemoryNonceStore(1);
    const h1 = signWebhook(SECRET, 'b', { now: NOW, nonce: NONCE });
    const h2 = signWebhook(SECRET, 'b', { now: NOW, nonce: 'cd'.repeat(8) });
    expect(verifyWebhook(SECRET, 'b', h1, { now: NOW, nonces: full }).ok).toBe(true);
    expect(verifyWebhook(SECRET, 'b', h2, { now: NOW, nonces: full })).toEqual({ ok: false, reason: 'replay' });
  });
});

describe('retry schedule', () => {
  it('vectors', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((a) => retryDelaySeconds(a))).toEqual([30, 60, 120, 240, 480, 960, 1920, 3600]);
    expect(retryDelaySeconds(9)).toBeNull();
    expect(retryDelaySeconds(1, 0)).toBe(15);
    expect(retryDelaySeconds(1, 500)).toBe(22);
    expect(retryDelaySeconds(3, 1000, { baseSeconds: 10, factor: 3, maxSeconds: 50, maxAttempts: 3 })).toBe(50);
    expect(retryDelaySeconds(4, 1000, { maxAttempts: 3 })).toBeNull();
    for (const a of [0, 1.5, -1]) expect(() => retryDelaySeconds(a)).toThrow(/bad-retry/);
    expect(() => retryDelaySeconds(1, 1001)).toThrow(HooksError);
    expect(() => retryDelaySeconds(1, -1)).toThrow(HooksError);
    expect(() => retryDelaySeconds(1, 0.5)).toThrow(HooksError);
  });
});

describe('events and idempotency', () => {
  const ev: WebhookEvent = {
    id: 'evt_1',
    type: 'invoice.paid',
    createdAt: NOW,
    data: { invoiceId: 'inv-1', currency: 'USD', amountMinor: '1200', paymentId: 'tx:1' },
  };
  it('roundtrips', () => {
    expect(parseWebhookEvent(serializeWebhookEvent(ev))).toEqual(ev);
    const noPay: WebhookEvent = { ...ev, data: { invoiceId: 'inv-1', currency: 'USD', amountMinor: '0' } };
    expect(parseWebhookEvent(serializeWebhookEvent(noPay))).toEqual(noPay);
    expect(serializeWebhookEvent(ev)).toBe('{"id":"evt_1","type":"invoice.paid","createdAt":1800000000,"data":{"invoiceId":"inv-1","currency":"USD","amountMinor":"1200","paymentId":"tx:1"}}');
  });
  it('rejects bad events', () => {
    const d = ev.data;
    const bad: unknown[] = [
      'nope',
      [],
      null,
      { ...ev, extra: 1 },
      { ...ev, id: '' },
      { ...ev, id: 'a b' },
      { ...ev, type: 'invoice.refunded' },
      { ...ev, createdAt: 1.5 },
      { ...ev, createdAt: '1' },
      { ...ev, createdAt: -1 },
      { ...ev, data: { ...d, amountMinor: '1.5' } },
      { ...ev, data: { ...d, amountMinor: 5 } },
      { ...ev, data: { ...d, amountMinor: '01' } },
      { ...ev, data: { ...d, currency: 'usd' } },
      { ...ev, data: { ...d, invoiceId: '<x>' } },
      { ...ev, data: { ...d, paymentId: 5 } },
      { ...ev, data: { ...d, extra: 1 } },
      { ...ev, data: { currency: 'USD', amountMinor: '1' } },
      { id: 'x' },
    ];
    for (const b of bad) expect(() => parseWebhookEvent(typeof b === 'string' ? b : JSON.stringify(b))).toThrow(/bad-event/);
    expect(() => parseWebhookEvent('{"__proto__":1')).toThrow(/bad-event/);
  });
  it('idempotency guard: processing until complete(), done afterwards, free again after release()', () => {
    const g = new IdempotencyGuard(2);
    expect(g.begin('a')).toBe('claimed');
    // In flight: a redelivery must not be acknowledged yet, the first attempt may still fail.
    expect(g.begin('a')).toBe('processing');
    g.release('a');
    expect(g.begin('a')).toBe('claimed');
    g.complete('a');
    expect(g.begin('a')).toBe('done');
    g.release('a'); // releasing never reopens a handled event
    expect(g.begin('a')).toBe('done');
    g.complete('x'); // never claimed: no effect
    expect(g.begin('x')).toBe('claimed');
  });
  it('idempotency guard: bounded, evicts the oldest done id, never an in-flight one', () => {
    const g = new IdempotencyGuard(2);
    expect(g.begin('a')).toBe('claimed');
    g.complete('a');
    expect(g.begin('b')).toBe('claimed');
    expect(g.begin('c')).toBe('claimed'); // full: evicts the oldest done id (a), not b in flight
    expect(g.begin('b')).toBe('processing');
    // Full of in-flight ids: fail closed (retryable) rather than forget one of them.
    expect(g.begin('d')).toBe('processing');
    g.complete('b');
    g.complete('c');
    expect(g.begin('d')).toBe('claimed'); // evicts b, the oldest done id
    expect(g.begin('b')).toBe('claimed'); // forgotten: the documented limit of a bounded in-memory store
    expect(g.begin('c')).toBe('processing'); // c was evicted for b; d and b are in flight
    g.release('d');
    expect(g.begin('c')).toBe('claimed');
  });
  const spec = new URL('../../../docs/remote/usability/specs/webhooks.md', import.meta.url);
  it.skipIf(!existsSync(spec))('spec R6 (docs/remote/usability/specs/webhooks.md) describes this guard', () => {
    const r6 = /^- R6 .*$/m.exec(readFileSync(spec, 'utf8'))?.[0] ?? '';
    const methods = Object.getOwnPropertyNames(IdempotencyGuard.prototype).filter((m) => m !== 'constructor');
    expect(new Set(methods)).toEqual(new Set(['begin', 'complete', 'release']));
    for (const term of [...methods.map((m) => `${m}(`), 'claimed', 'processing', 'done', '503']) expect(r6).toContain(term);
    expect(r6).not.toMatch(/\bclaim\(/); // the removed boolean API
  });
});

describe('links and buttons', () => {
  it('builds and verifies link via invoice-schema', async () => {
    const s = signed();
    const { url, fragment } = await buildPaymentLink(s, { baseUrl: 'https://pay.example.com/i', rng });
    expect(url).toBe(`https://pay.example.com/i${fragment}`);
    const parsed = await parseFragment(new URL(url).hash, { pinnedSigners: [s.invoice.signer] });
    expect(parsed.trust).toBe('trusted-seller');
    expect(parsed.invoice.memo).toBe('thanks');
    const enc = await buildPaymentLink(s, { baseUrl: 'https://pay.example.com/', encrypt: true, rng });
    expect(enc.url).not.toContain('Coffee');
    expect((await parseFragment(new URL(enc.url).hash)).encrypted).toBe(true);
  });
  it('base url rules', () => {
    for (const b of ['http://x.com/', 'https://u:p@x.com/', 'https://x.com/?a=1', 'https://x.com/#f', 'https://x.com/?', 'nope', 'javascript:alert(1)', 'http://evil.com/'])
      expect(() => assertBaseUrl(b)).toThrow(/bad-base/);
    expect(() => assertBaseUrl('http://localhost:3000/', { allowInsecureLocalhost: true })).not.toThrow();
    expect(() => assertBaseUrl('http://evil.com/', { allowInsecureLocalhost: true })).toThrow(HooksError);
  });
  it('button html is escaped and script-free', async () => {
    const { url } = await buildPaymentLink(signed(), { baseUrl: 'https://pay.example.com/' });
    const b = buildPaymentButton(url, '"><script>alert(1)</script> & co');
    expect(b.html).not.toMatch(/<script|onclick|onerror|<iframe|<img|src=/i);
    expect(b.html).toContain('&quot;&gt;&lt;script&gt;');
    expect(b.html.startsWith('<a class="ghostpay-button" href="https://pay.example.com/#gpi=v1.')).toBe(true);
    expect(b.html).toContain('rel="noopener noreferrer"');
    expect(b.href).toBe(url);
    expect(buildPaymentButton(url, 'x'.repeat(100)).html).toContain('>' + 'x'.repeat(40) + '<');
    expect(buildPaymentButton(url, '😀'.repeat(50)).html).toContain('😀'.repeat(40) + '<');
    expect(buildPaymentButton(url, 'a\u0000b\nc d').html).toContain('>a b c d<');
    expect(() => buildPaymentButton(url, '  \n ')).toThrow(/bad-label/);
    expect(escapeHtml(`&<>"'\``)).toBe('&amp;&lt;&gt;&quot;&#39;&#96;');
    expect(escapeHtml('plain')).toBe('plain');
  });
  it('rejects bad links', async () => {
    const { url } = await buildPaymentLink(signed(), { baseUrl: 'https://pay.example.com/' });
    const frag = new URL(url).hash;
    const bads = [
      'nope',
      'http://pay.example.com/' + frag,
      'https://u:p@pay.example.com/' + frag,
      'https://pay.example.com/?x=1' + frag,
      'https://pay.example.com/',
      'https://pay.example.com/#gpi=v2.abc',
      'https://pay.example.com/#gpi=v1.ab"c',
      'https://pay.example.com/#gpi=v1.',
      'https://pay.example.com/?' + frag,
    ];
    for (const b of bads) expect(() => buildPaymentButton(b, 'x')).toThrow(/bad-link/);
    expect(() => assertPaymentLink('http://localhost/' + frag)).toThrow(HooksError);
    expect(assertPaymentLink('http://localhost:8080/p' + frag, { allowInsecureLocalhost: true }).base).toBe('http://localhost:8080/p');
    expect(() => assertPaymentLink('http://evil.com/' + frag, { allowInsecureLocalhost: true })).toThrow(HooksError);
  });
});

describe('qr + pos', () => {
  it('qr payload', async () => {
    const { url } = await buildPaymentLink(signed(), { baseUrl: 'https://pay.example.com/' });
    const q = buildQrPayload(url);
    expect(q.payload).toBe(url);
    expect(q.bytes).toBe(url.length);
    expect(() => buildQrPayload('https://pay.example.com/#gpi=v1.' + 'A'.repeat(MAX_QR_BYTES))).toThrow(/qr-too-large/);
    expect(() => buildQrPayload('http://pay.example.com/#gpi=v1.AAAA')).toThrow(/bad-link/);
  });
  const start: PosEvent = { type: 'start', sessionId: 's1', invoiceId: 'inv', currency: 'USD', dueMinor: 1000n, ttlSeconds: 120 };
  const pay = (amountMinor: bigint, over: Partial<{ invoiceId: string; currency: string }> = {}): PosEvent => ({ type: 'payment', invoiceId: 'inv', currency: 'USD', amountMinor, ...over });
  const begin = (): PosState => posReduce(INITIAL_POS_STATE, start, NOW).state;
  it('start, partial, paid', () => {
    const s0 = begin();
    expect(s0).toMatchObject({ status: 'awaiting', expiresAt: NOW + 120, paidMinor: 0n });
    const p1 = posReduce(s0, pay(400n), NOW + 1);
    expect(p1).toMatchObject({ accepted: true, state: { status: 'awaiting', paidMinor: 400n } });
    expect(posReduce(p1.state, pay(600n), NOW + 2).state).toMatchObject({ status: 'paid', paidMinor: 1000n });
    expect(posReduce(s0, pay(10n ** 30n), NOW).state.status).toBe('paid');
  });
  it('ttl and amount bounds', () => {
    for (const ttl of [29, 901, 1.5]) expect(() => posReduce(INITIAL_POS_STATE, { ...start, ttlSeconds: ttl }, NOW)).toThrow(/bad-ttl/);
    expect(posReduce(INITIAL_POS_STATE, { ...start, ttlSeconds: 30 }, NOW).accepted).toBe(true);
    expect(posReduce(INITIAL_POS_STATE, { ...start, ttlSeconds: 900 }, NOW).accepted).toBe(true);
    expect(() => posReduce(INITIAL_POS_STATE, { ...start, dueMinor: 0n }, NOW)).toThrow(/bad-amount/);
  });
  it('rejects wrong invoice/currency/zero and illegal orders', () => {
    const s = begin();
    expect(posReduce(s, pay(1000n, { invoiceId: 'other' }), NOW).accepted).toBe(false);
    expect(posReduce(s, pay(1000n, { currency: 'EUR' }), NOW).accepted).toBe(false);
    expect(posReduce(s, pay(0n), NOW).accepted).toBe(false);
    expect(posReduce(s, start, NOW).accepted).toBe(false);
    expect(posReduce(INITIAL_POS_STATE, pay(5n), NOW).accepted).toBe(false);
    expect(posReduce(INITIAL_POS_STATE, { type: 'tick' }, NOW).accepted).toBe(false);
    expect(posReduce(s, { type: 'tick' }, NOW + 5)).toMatchObject({ accepted: false, state: s });
  });
  it('expiry and late payment', () => {
    const s = begin();
    expect(posReduce(s, { type: 'tick' }, NOW + 120)).toMatchObject({ accepted: true, state: { status: 'expired' } });
    const late = posReduce(s, pay(1000n), NOW + 121);
    expect(late).toMatchObject({ accepted: false, state: { status: 'expired', paidMinor: 0n } });
    expect(posReduce(s, pay(1000n), NOW + 119).state.status).toBe('paid');
  });
  it('terminal states absorb', () => {
    const paid = posReduce(begin(), pay(1000n), NOW).state;
    const cancelled = posReduce(begin(), { type: 'cancel' }, NOW);
    expect(cancelled).toMatchObject({ accepted: true, state: { status: 'cancelled' } });
    for (const st of [paid, cancelled.state, posReduce(begin(), { type: 'tick' }, NOW + 999).state])
      for (const e of [pay(5n), { type: 'cancel' } as PosEvent, { type: 'tick' } as PosEvent, start]) {
        const r = posReduce(st, e, NOW);
        expect(r.accepted).toBe(false);
        expect(r.state).toBe(st);
      }
  });
});

describe('nfc ndef', () => {
  const small = 'https://pay.example.com/p#gpi=v1.AbC_-123';
  it('golden bytes + roundtrip (short record)', () => {
    const b = encodeNdefUri(small);
    const text = new TextEncoder().encode('pay.example.com/p#gpi=v1.AbC_-123');
    expect(Array.from(b.subarray(0, 5))).toEqual([0xd1, 1, text.length + 1, 0x55, 0x04]);
    expect(b.length).toBe(5 + text.length);
    expect(decodeNdefUri(b)).toBe(small);
  });
  it('long record path', () => {
    const link = 'https://pay.example.com/#gpi=v1.' + 'A'.repeat(400);
    const b = encodeNdefUri(link, { maxBytes: 1000 });
    expect(b[0]).toBe(0xc1);
    expect(decodeNdefUri(b)).toBe(link);
    expect(() => encodeNdefUri(link)).not.toThrow(); // 888 default fits 400
    expect(() => encodeNdefUri('https://pay.example.com/#gpi=v1.' + 'A'.repeat(900))).toThrow(/too-large/);
    expect(() => encodeNdefUri('https://pay.example.com/#gpi=v1.' + 'A'.repeat(9000), { maxBytes: 99999 })).toThrow(/too-large/);
  });
  it('real invoice link size vs tags', async () => {
    const { url } = await buildPaymentLink(signed(), { baseUrl: 'https://p.io/' });
    const b = encodeNdefUri(url, { maxBytes: 4000 });
    expect(decodeNdefUri(b)).toBe(url);
    expect(tagFit(b.length)).toEqual(b.length > 504 ? (b.length > 888 ? [] : ['NTAG216']) : ['NTAG215', 'NTAG216']);
    expect(tagFit(100)).toEqual(['NTAG213', 'NTAG215', 'NTAG216']);
    expect(tagFit(144)).toEqual(['NTAG213', 'NTAG215', 'NTAG216']);
    expect(tagFit(145)).toEqual(['NTAG215', 'NTAG216']);
    expect(tagFit(5000)).toEqual([]);
  });
  it('encode rejects bad links', () => {
    for (const l of ['http://pay.example.com/#gpi=v1.AA', 'https://pay.example.com/?s=1#gpi=v1.AA', 'https://pay.example.com/', 'x'])
      expect(() => encodeNdefUri(l)).toThrow(HooksError);
    expect(() => encodeNdefUri('http://localhost/#gpi=v1.AA', { allowInsecureLocalhost: true })).toThrow(/bad-link/);
  });
  it('decode rejects malformed input', () => {
    const good = encodeNdefUri(small);
    const mut = (f: (b: Uint8Array) => void): Uint8Array => {
      const c = good.slice();
      f(c);
      return c;
    };
    const bads: Uint8Array[] = [
      new Uint8Array(0),
      new Uint8Array(4),
      good.subarray(0, good.length - 1),
      new Uint8Array([...good, 0]),
      mut((b) => (b[0] = 0x91)), // no ME
      mut((b) => (b[0] = 0x51)), // no MB
      mut((b) => (b[0] = 0xf1)), // chunk? CF=0x20 set
      mut((b) => (b[0] = 0xd9)), // IL set
      mut((b) => (b[0] = 0xd2)), // TNF=2
      mut((b) => (b[1] = 2)),
      mut((b) => (b[3] = 0x54)), // type 'T'
      mut((b) => (b[4] = 0x23)), // unknown prefix
      mut((b) => (b[4] = 0x03)), // http://
      mut((b) => (b[b.length - 1] = 0xff)), // bad utf8
      mut((b) => (b[2] = 1)), // len < 2
      new Uint8Array(9000),
      new Uint8Array([0xc1, 1, 0, 0, 0, 0, 0]), // long, len 0
      new Uint8Array([0xc1, 1, 0, 0, 0]), // long, truncated header
    ];
    for (const b of bads) expect(() => decodeNdefUri(b)).toThrow(HooksError);
  });
  it('decode accepts empty-prefix absolute URI and re-validates', () => {
    const t = new TextEncoder().encode('https://pay.example.com/#gpi=v1.AA');
    expect(decodeNdefUri(new Uint8Array([0xd1, 1, t.length + 1, 0x55, 0, ...t]))).toBe('https://pay.example.com/#gpi=v1.AA');
    const q = new TextEncoder().encode('pay.example.com/?s=1#gpi=v1.AA');
    expect(() => decodeNdefUri(new Uint8Array([0xd1, 1, q.length + 1, 0x55, 4, ...q]))).toThrow(/bad-link/);
    const h = new TextEncoder().encode('localhost/#gpi=v1.AA');
    expect(decodeNdefUri(new Uint8Array([0xd1, 1, h.length + 1, 0x55, 3, ...h]), { allowInsecureLocalhost: true })).toBe('http://localhost/#gpi=v1.AA');
  });
});
