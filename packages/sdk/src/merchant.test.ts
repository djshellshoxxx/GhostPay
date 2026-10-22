import { describe, expect, it } from 'vitest';
import { SdkAbortedError, SdkConfigError, SdkHttpError, SdkInputError, SdkNetworkError, SdkResponseError } from './errors.js';
import { TypedEmitter, type SdkEvent } from './events.js';
import { MAX_RESPONSE_CHARS, createMerchantApi, normalizeBaseUrl, type FetchLike } from './merchant.js';

const NONCE = 'ab'.repeat(16);
const STATUS = { nonce: NONCE, state: 'paid', receivedMinorUnits: '12345', updatedAt: 1_800_000_100 };

function reply(body: unknown, status = 200): ReturnType<FetchLike> {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(text) });
}

function setup(handler: FetchLike, extra: { baseUrl?: string | undefined; apiKey?: string | undefined } = {}) {
  const events: SdkEvent[] = [];
  const emitter = new TypedEmitter();
  emitter.on((e) => void events.push(e));
  let t = 1000;
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  const api = createMerchantApi({
    baseUrl: 'baseUrl' in extra ? extra.baseUrl : 'https://m.example.test/api',
    fetch,
    apiKey: extra.apiKey,
    nowMs: () => (t += 5),
    emitter,
  });
  return { api, events, calls };
}

describe('normalizeBaseUrl', () => {
  it('accepts https and loopback http, strips trailing slash', () => {
    expect(normalizeBaseUrl('https://m.example.test/api/')).toBe('https://m.example.test/api');
    expect(normalizeBaseUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(normalizeBaseUrl('http://127.0.0.1:1/x')).toBe('http://127.0.0.1:1/x');
    expect(normalizeBaseUrl('http://[::1]:1')).toBe('http://[::1]:1');
  });
  it('rejects plain http to remote hosts, credentials, query, fragment, junk', () => {
    for (const bad of ['http://m.example.test', 'https://u:p@m.test', 'https://m.test/?a=1', 'https://m.test/#x', 'nope', 'file:///etc/passwd', 'http://localhost.evil.test'])
      expect(() => normalizeBaseUrl(bad)).toThrow(SdkConfigError);
  });
});

describe('merchant API', () => {
  it('health, status, payments parse strictly; money stays strings', async () => {
    const { api, calls } = setup((url) => {
      if (url.endsWith('/v1/health')) return reply({ status: 'ok', version: '0.1.0' });
      if (url.endsWith('/payments'))
        return reply({ payments: [{ id: 'pay_1', txHash: `0x${'1'.repeat(64)}`, amountMinorUnits: '12345', confirmations: 3, detectedAt: 5 }] });
      return reply(STATUS);
    });
    expect(await api.health()).toEqual({ status: 'ok', version: '0.1.0' });
    expect(await api.getInvoiceStatus(NONCE)).toEqual(STATUS);
    const pays = await api.listPayments(NONCE);
    expect(pays[0]?.amountMinorUnits).toBe('12345');
    expect(calls.map((c) => c.url)).toEqual([
      'https://m.example.test/api/v1/health',
      `https://m.example.test/api/v1/invoices/${NONCE}`,
      `https://m.example.test/api/v1/invoices/${NONCE}/payments`,
    ]);
  });
  it('registerInvoice sends only public facts, content-type json, bearer key', async () => {
    const { api, calls } = setup(() => reply({ ...STATUS, state: 'pending', receivedMinorUnits: '0' }), { apiKey: 'sk_test_fake' });
    await api.registerInvoice({ nonce: NONCE, chainId: 8453, currency: 'USD', minorUnits: '12345', expiresAt: 1_800_003_600 });
    const c = calls[0];
    expect(c?.init.method).toBe('POST');
    expect(c?.init.headers['authorization']).toBe('Bearer sk_test_fake');
    expect(c?.init.headers['content-type']).toBe('application/json');
    expect(Object.keys(JSON.parse(c?.init.body ?? '{}') as object).sort()).toEqual(['chainId', 'currency', 'expiresAt', 'minorUnits', 'nonce']);
  });
  it('no authorization header without apiKey; abort signal is forwarded', async () => {
    const { api, calls } = setup(() => reply({ status: 'ok', version: '1' }));
    const ac = new AbortController();
    await api.health({ signal: ac.signal });
    expect(calls[0]?.init.headers['authorization']).toBeUndefined();
    expect(calls[0]?.init.signal).toBe(ac.signal);
  });
  it('local input validation happens before any fetch', async () => {
    const { api, calls } = setup(() => reply(STATUS));
    const ok = { nonce: NONCE, chainId: 8453, currency: 'USD', minorUnits: '1', expiresAt: 1 };
    for (const bad of [{ nonce: 'X' }, { chainId: 0 }, { chainId: 1.5 }, { currency: 'usd' }, { minorUnits: '1.5' }, { minorUnits: '-1' }, { expiresAt: -1 }])
      await expect(api.registerInvoice({ ...ok, ...bad })).rejects.toBeInstanceOf(SdkInputError);
    await expect(api.getInvoiceStatus('../../etc/passwd')).rejects.toBeInstanceOf(SdkInputError);
    await expect(api.listPayments(`${NONCE}/..`)).rejects.toBeInstanceOf(SdkInputError);
    expect(calls).toHaveLength(0);
  });
  it('non-2xx maps to SdkHttpError without the body; events recorded', async () => {
    const { api, events } = setup(() => reply('secret-internal-detail', 503));
    const err = await api.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SdkHttpError);
    expect((err as SdkHttpError).status).toBe(503);
    expect((err as Error).message).not.toContain('secret');
    expect(events.map((e) => e.type)).toEqual(['http.request', 'http.response']);
    const resp = events[1];
    expect(resp?.type === 'http.response' && resp.durationMs).toBe(10);
  });
  it('fetch rejection is a network error; aborted signal is an abort error', async () => {
    const { api, events } = setup(() => Promise.reject(new Error('ECONNRESET http://internal')));
    const err = await api.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SdkNetworkError);
    expect((err as Error).message).not.toContain('internal');
    const ac = new AbortController();
    ac.abort();
    await expect(api.health({ signal: ac.signal })).rejects.toBeInstanceOf(SdkAbortedError);
    expect(events.filter((e) => e.type === 'http.error').map((e) => e.type === 'http.error' && e.errorCode)).toEqual(['NETWORK', 'ABORTED']);
  });
  it('malformed, oversize, float, duplicate-key and extra-key responses are rejected', async () => {
    const cases: unknown[] = [
      'not json',
      '',
      `{"pad":"${'a'.repeat(MAX_RESPONSE_CHARS)}"}`,
      '{"status":"ok","version":"1","version":"2"}',
      { status: 'ok', version: '1', extra: 1 },
      { status: 'ok' },
      { status: 'down', version: '1' },
      { status: 'ok', version: 'bad version!' },
      [],
      null,
    ];
    for (const body of cases) {
      const { api } = setup(() => reply(body));
      await expect(api.health()).rejects.toBeInstanceOf(SdkResponseError);
    }
    const bad: unknown[] = [
      { ...STATUS, state: 'refunded' },
      { ...STATUS, receivedMinorUnits: 12345 },
      { ...STATUS, receivedMinorUnits: '1.5' },
      { ...STATUS, nonce: 'A'.repeat(32) },
      { ...STATUS, updatedAt: 1.5 },
      { ...STATUS, updatedAt: -1 },
      { ...STATUS, extra: true },
      { ...STATUS, state: 7 },
    ];
    for (const body of bad) {
      const { api } = setup(() => reply(body));
      await expect(api.getInvoiceStatus(NONCE)).rejects.toBeInstanceOf(SdkResponseError);
    }
    const goodPay = { id: 'p', txHash: `0x${'1'.repeat(64)}`, amountMinorUnits: '1', confirmations: 0, detectedAt: 0 };
    const badPay: unknown[] = [
      { payments: 'x' },
      { payments: [{ ...goodPay, txHash: '0x12' }] },
      { payments: [{ ...goodPay, id: 'bad id' }] },
      { payments: [{ ...goodPay, confirmations: -1 }] },
      { payments: [{ ...goodPay, extra: 1 }] },
      { payments: new Array(1001).fill(goodPay) },
      { payments: [], extra: 1 },
    ];
    for (const body of badPay) {
      const { api } = setup(() => reply(body));
      await expect(api.listPayments(NONCE)).rejects.toBeInstanceOf(SdkResponseError);
    }
    const { api } = setup(() => reply({ payments: [] }));
    expect(await api.listPayments(NONCE)).toEqual([]);
  });
  it('body read failure is a response error', async () => {
    const { api } = setup(() => Promise.resolve({ status: 200, ok: true, text: () => Promise.reject(new Error('x')) }));
    await expect(api.health()).rejects.toBeInstanceOf(SdkResponseError);
  });
  it('config errors: no baseUrl, no fetch', async () => {
    const { api, calls } = setup(() => reply({}), { baseUrl: undefined });
    await expect(api.health()).rejects.toBeInstanceOf(SdkConfigError);
    expect(calls).toHaveLength(0);
    const orig = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      const noFetch = createMerchantApi({ baseUrl: 'https://m.example.test', fetch: undefined, apiKey: undefined, nowMs: () => 0, emitter: new TypedEmitter() });
      await expect(noFetch.health()).rejects.toBeInstanceOf(SdkConfigError);
      (globalThis as { fetch?: unknown }).fetch = () => reply({ status: 'ok', version: '1' });
      expect((await noFetch.health()).status).toBe('ok');
    } finally {
      (globalThis as { fetch?: unknown }).fetch = orig;
    }
  });
});
