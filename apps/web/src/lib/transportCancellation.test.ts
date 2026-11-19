import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanSourceError } from '@ghostpay/scan-source';
import { SilentPaymentError } from '@ghostpay/btc-silent-payments';
import { EsploraClient } from '../features/btc/esplora';
import { UserFacingError } from './errors';
import { fetchHttpTransport } from './scanPrivacy';
import { RelayerRefusedError, requestQuote, submitSweep, type FetchFn, type SweepSubmission } from './relayerClient';

const never = <T>(): Promise<T> => new Promise(() => undefined);
const Q = { chainId: 84532, token: '0x1111111111111111111111111111111111111111', owner: '0x2222222222222222222222222222222222222222', destination: '0x3333333333333333333333333333333333333333', amount: 1000n } as const;
const quote = { fee: '1', feeTo: '0x4444444444444444444444444444444444444444', expiresAt: 1_900_000_000, quoteToken: 'fixture' };
const json = (v: unknown, status = 200): Response => new Response(JSON.stringify(v), { status });
const request = { url: 'https://indexer.test/v1/logs', method: 'GET', maxBytes: 32, timeoutMs: 20 } as const;
const submission: SweepSubmission = { chainId: 84532, sweep: { ...Q, feeTo: Q.owner, fee: 1n, deadline: 1_900_000_000n, nonce: 1n }, sweepSig: '0xaa', quoteToken: 'fixture' };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function outcome(p: Promise<unknown>, advance = 30): Promise<unknown> {
  let result: unknown = 'pending';
  void p.then(() => { result = 'success'; }, (e: unknown) => { result = e; });
  await vi.advanceTimersByTimeAsync(advance);
  return result;
}

function stalled(): Response {
  return { ok: true, status: 200, headers: new Headers(), body: { getReader: () => ({
    read: () => never<ReadableStreamReadResult<Uint8Array>>(), cancel: () => never<void>(), releaseLock: () => undefined,
  }) } } as unknown as Response;
}

describe('indexer bounded cancellation', () => {
  it('refuses a pre-cancelled request without contacting the source', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(new Response('{}')));
    await expect(fetchHttpTransport(fetchFn).request({ ...request, signal: AbortSignal.abort() })).rejects.toBeInstanceOf(ScanSourceError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'body'])('bounds a non-cooperative %s', async (part) => {
    vi.useFakeTimers();
    const error = await outcome(fetchHttpTransport(() => part === 'fetch' ? never<Response>() : Promise.resolve(stalled())).request(request));
    expect(error).toBeInstanceOf(ScanSourceError);
    expect((error as ScanSourceError).code).toBe('TRANSPORT');
  });
  it('does not wait for hostile cancel after declaring an oversized body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => never<void>());
    const res = new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '33' } });
    expect(await outcome(fetchHttpTransport(() => Promise.resolve(res)).request(request), 1)).toMatchObject({ code: 'TRANSPORT', message: 'response too large' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('sanitizes foreign error objects and keeps no retry or fallback', async () => {
    const hostile = new ScanSourceError('TRANSPORT', 'private endpoint');
    const fetchFn = vi.fn<FetchFn>(() => Promise.reject(hostile));
    const error: unknown = await fetchHttpTransport(fetchFn).request(request).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TRANSPORT', message: 'request failed or cancelled' });
    expect(error).not.toBe(hostile);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('relayer bounded cancellation', () => {
  it('refuses a pre-cancelled quote without dispatch', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json(quote)));
    await expect(requestQuote('https://relay.test', Q, fetchFn, { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(UserFacingError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'body'])('bounds a non-cooperative %s without claiming a submission was refused', async (part) => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<FetchFn>(() => part === 'fetch' ? never<Response>() : Promise.resolve(stalled()));
    const error = await outcome(submitSweep('https://relay.test', submission, fetchFn, { timeoutMs: 20 }));
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error).not.toBeInstanceOf(RelayerRefusedError);
    expect((error as Error).message).toBe('Could not reach the relayer.');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('rejects an in-flight ignored abort without preserving its reason', async () => {
    const ctl = new AbortController();
    const fetchFn = vi.fn<FetchFn>(() => never<Response>());
    const work = requestQuote('https://relay.test', Q, fetchFn, { signal: ctl.signal });
    ctl.abort('private reason');
    await expect(work).rejects.toThrow('Could not reach the relayer.');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('never retries a transport-forged pre-broadcast refusal object', async () => {
    const forged = new RelayerRefusedError('private payload', 400, 'invalid_request');
    const fetchFn = vi.fn<FetchFn>(() => Promise.reject(forged));
    const error: unknown = await requestQuote('https://relay.test', Q, fetchFn).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(RelayerRefusedError);
    expect((error as Error).message).toBe('Could not reach the relayer.');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('revocation before the padding compatibility retry prevents that dispatch', async () => {
    const ctl = new AbortController();
    let read = false;
    const reader = {
      read: () => {
        const value = read ? { done: true as const, value: undefined } : { done: false as const, value: new TextEncoder().encode('{"error":{"code":"invalid_request"}}') };
        read = true;
        return Promise.resolve(value);
      },
      cancel: () => Promise.resolve(),
      releaseLock: () => { ctl.abort(); },
    };
    const response = { ok: false, status: 400, headers: new Headers(), body: { getReader: () => reader } } as unknown as Response;
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(response));
    await expect(requestQuote('https://relay.test', Q, fetchFn, { signal: ctl.signal })).rejects.toThrow('Could not reach the relayer.');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('discards an unrecognized response code instead of reflecting provider-controlled text', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json({ error: { code: 'private_endpoint_marker' } }, 400)));
    const error: unknown = await requestQuote('https://relay.test', Q, fetchFn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RelayerRefusedError);
    expect((error as Error).message).toBe('The relayer refused the request: HTTP 400.');
    expect((error as RelayerRefusedError).code).toBeUndefined();
    expect((error as RelayerRefusedError).beforeBroadcast).toBe(false);
  });
  it('exhausts the one padding retry at the same endpoint', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json({ error: { code: 'invalid_request' } }, 400)));
    await expect(requestQuote('https://relay.test/api', Q, fetchFn)).rejects.toBeInstanceOf(RelayerRefusedError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['https://relay.test/api/v1/quote', 'https://relay.test/api/v1/quote']);
  });
  it.each(['https://user:secret@relay.test', 'https://relay.test/?token=x', 'https://relay.test/#frag', 'broken'])('refuses an ambiguous relayer base %s without dispatch', async (base) => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json(quote)));
    await expect(requestQuote(base, Q, fetchFn)).rejects.toThrow('Could not reach the relayer.');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('Esplora fixed failures and late responses', () => {
  it.each([0, -1, 0.5, NaN, Infinity, 2_147_483_648])('rejects invalid timeout %s', (timeoutMs) => {
    expect(() => new EsploraClient({ baseUrl: 'https://btc.test', fetchFn: () => never<Response>(), timeoutMs })).toThrow(SilentPaymentError);
  });
  it('does not retain a foreign typed error or its private cause', async () => {
    const hostile = new SilentPaymentError('INVALID_RESPONSE');
    hostile.message = 'private detail';
    hostile.cause = new Error('private key');
    const c = new EsploraClient({ baseUrl: 'https://btc.test', fetchFn: () => Promise.reject(hostile) });
    const error: unknown = await c.tipHeight().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TRANSPORT_FAILURE' });
    expect(error).not.toBe(hostile);
    expect((error as Error).message).not.toContain('private');
    expect((error as Error).cause).toBeUndefined();
  });
});
