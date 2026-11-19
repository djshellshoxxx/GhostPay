import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedRequest, BoundedRequestError, type BoundedRequestOptions } from './boundedRequest';

const URL = 'https://node.test/api';
const OPTIONS: BoundedRequestOptions = { timeoutMs: 1000, maxBytes: 8 };
const never = <T>(): Promise<T> => new Promise(() => undefined);
const fetchBody = (text: string) => () => Promise.resolve(new Response(text));
const code = (p: Promise<unknown>): Promise<string> => p.then(() => 'success', (e: unknown) => e instanceof BoundedRequestError ? e.code : 'other');
const next = (): Promise<void> => new Promise((resolve) => { queueMicrotask(resolve); });

async function outcome(p: Promise<unknown>, advance = 1100): Promise<string> {
  let state = 'pending';
  void code(p).then((s) => { state = s; });
  await vi.advanceTimersByTimeAsync(advance);
  return state;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('bounded HTTP exchange', () => {
  it('preserves protocol payloads, enforces request hygiene and accepts an exact UTF-8 cap', async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        const encoded = new TextEncoder().encode('A😀B');
        controller.enqueue(encoded.subarray(0, 3));
        controller.enqueue(encoded.subarray(3));
        controller.close();
      },
    }))));
    const res = await boundedRequest(fetchFn, URL, { method: 'POST', headers: { 'x-test': 'value' }, body: 'payload', credentials: 'include', redirect: 'follow' }, { ...OPTIONS, maxBytes: 6 });
    expect(new TextDecoder().decode(res.body)).toBe('A😀B');
    expect(res).toMatchObject({ status: 200, ok: true });
    expect(fetchFn).toHaveBeenCalledWith(URL, expect.objectContaining({
      method: 'POST', body: 'payload', headers: { 'x-test': 'value' },
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
    }));
    expect(fetchFn.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });
  it('returns bounded HTTP errors for protocol-specific refusal classification', async () => {
    const res = await boundedRequest(() => Promise.resolve(new Response('refused', { status: 429 })), URL, {}, OPTIONS);
    expect(res.status).toBe(429);
    expect(res.ok).toBe(false);
    expect(new TextDecoder().decode(res.body)).toBe('refused');
  });
  it('supports an empty native response body', async () => {
    expect((await boundedRequest(() => Promise.resolve(new Response(null, { status: 204 })), URL, {}, OPTIONS)).body).toEqual(new Uint8Array(0));
  });
  it.each([0, -1, NaN, Infinity, 0.5, 2_147_483_648])('rejects invalid deadline %s before dispatch', async (timeoutMs) => {
    const fetchFn = vi.fn(fetchBody('ok'));
    expect(await code(boundedRequest(fetchFn, URL, {}, { ...OPTIONS, timeoutMs }))).toBe('INVALID_OPTIONS');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid cap %s before dispatch', async (maxBytes) => {
    const fetchFn = vi.fn(fetchBody('ok'));
    expect(await code(boundedRequest(fetchFn, URL, {}, { ...OPTIONS, maxBytes }))).toBe('INVALID_OPTIONS');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(['not a URL', 'http://remote.test', 'https://user:pass@node.test', 'https://node.test/#fragment', 'wss://node.test'])('refuses unsupported destination %s', async (url) => {
    const fetchFn = vi.fn(fetchBody('ok'));
    expect(await code(boundedRequest(fetchFn, url, {}, OPTIONS))).toBe('INVALID_OPTIONS');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(['http://localhost:3000/', 'http://127.0.0.1:3000/', 'http://[::1]:3000/'])('permits explicit loopback %s', async (url) => {
    expect(await code(boundedRequest(fetchBody('ok'), url, {}, OPTIONS))).toBe('success');
  });
  it('refuses either already-cancelled signal before fetching', async () => {
    for (const options of [true, false]) {
      const fetchFn = vi.fn(fetchBody('ok'));
      const signal = AbortSignal.abort('never disclose this reason');
      expect(await code(boundedRequest(fetchFn, URL, options ? {} : { signal }, options ? { ...OPTIONS, signal } : OPTIONS))).toBe('ABORTED');
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('settles on cancellation even if fetch ignores the signal', async () => {
    const ctl = new AbortController();
    const work = boundedRequest(() => never<Response>(), URL, {}, { ...OPTIONS, signal: ctl.signal });
    ctl.abort('private reason');
    expect(await code(work)).toBe('ABORTED');
  });
  it('independently enforces a deadline when fetch ignores abort', async () => {
    vi.useFakeTimers();
    expect(await outcome(boundedRequest(() => never<Response>(), URL, {}, OPTIONS))).toBe('TIMEOUT');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('discards a late response without starting its reader', async () => {
    vi.useFakeTimers();
    let resolveFetch: (r: Response) => void = () => undefined;
    const fetching = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const work = boundedRequest(() => fetching, URL, {}, OPTIONS);
    expect(await outcome(work)).toBe('TIMEOUT');
    const cancel = vi.fn(() => never<void>());
    const getReader = vi.fn();
    resolveFetch({ body: { cancel, getReader } } as unknown as Response);
    await next(); await next();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
  });
  it('rejects a response queued after sleep before its deadline timer runs', async () => {
    vi.useFakeTimers();
    let resolveFetch: (r: Response) => void = () => undefined;
    const fetching = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const work = boundedRequest(() => fetching, URL, {}, OPTIONS);
    vi.setSystemTime(Date.now() + 1001);
    resolveFetch(new Response('ok'));
    expect(await code(work)).toBe('TIMEOUT');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fails closed when the wall clock moves backwards during the request', async () => {
    vi.useFakeTimers();
    let resolveFetch: (r: Response) => void = () => undefined;
    const fetching = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const work = boundedRequest(() => fetching, URL, {}, OPTIONS);
    vi.setSystemTime(Date.now() - 1);
    resolveFetch(new Response('ok'));
    expect(await code(work)).toBe('TIMEOUT');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a stalled reader despite hostile cleanup', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => never<void>());
    const releaseLock = vi.fn(() => { throw new Error('private cleanup'); });
    const response = { status: 200, ok: true, headers: new Headers(), body: { getReader: () => ({ read: () => never<ReadableStreamReadResult<Uint8Array>>(), cancel, releaseLock }) } } as unknown as Response;
    expect(await outcome(boundedRequest(() => Promise.resolve(response), URL, {}, OPTIONS))).toBe('TIMEOUT');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('refuses over-limit bytes without awaiting cancel (declared: %s)', async (declared) => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => never<void>());
    const res = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(9)); }, cancel }), declared ? { headers: { 'content-length': '9' } } : {});
    expect(await outcome(boundedRequest(() => Promise.resolve(res), URL, {}, OPTIONS), 1)).toBe('TOO_LARGE');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each(['not a length', '-4', '8'])('counts streamed bytes with content length %s', async (length) => {
    expect(await code(boundedRequest(() => Promise.resolve(new Response('123456789', { headers: { 'content-length': length } })), URL, {}, OPTIONS))).toBe('TOO_LARGE');
  });
  it.each([{ redirected: true }, { url: 'https://other.test/' }, { url: 'https://node.test/changed' }, { status: 0 }, { status: 600 }, { status: 200.5 }, { status: 400, ok: true }])('refuses unexpected redirect/status metadata %j', async (meta) => {
    const cancel = vi.fn(() => Promise.resolve());
    const res = { status: 200, ok: true, headers: new Headers(), body: { cancel }, ...meta } as unknown as Response;
    expect(await code(boundedRequest(() => Promise.resolve(res), URL, {}, OPTIONS))).toBe('TRANSPORT');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('remints a foreign error even when it uses the exported class', async () => {
    const forged = new BoundedRequestError('TOO_LARGE');
    forged.message = 'private endpoint and payload';
    forged.cause = new Error('private key');
    const err: unknown = await boundedRequest(() => Promise.reject(forged), URL, {}, OPTIONS).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'TRANSPORT', message: 'Network request could not be completed.' });
    expect(err).not.toBe(forged);
    expect((err as Error).cause).toBeUndefined();
  });
  it('sanitizes errors from the stream', async () => {
    const res = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('provider secret')); } }));
    expect(await code(boundedRequest(() => Promise.resolve(res), URL, {}, OPTIONS))).toBe('TRANSPORT');
  });
  it('does not leak errors from a throwing response body accessor during cleanup', async () => {
    const res = { status: 200, ok: true, headers: new Headers(), get body(): ReadableStream<Uint8Array> { throw new Error('private body accessor'); } } as Response;
    const error: unknown = await boundedRequest(() => Promise.resolve(res), URL, {}, OPTIONS).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TRANSPORT', message: 'Network request could not be completed.' });
    expect((error as Error).cause).toBeUndefined();
  });
  it('does not let synchronous cleanup errors replace a cap refusal', async () => {
    const read = vi.fn(() => Promise.resolve({ done: false, value: new Uint8Array(9) }));
    const res = { status: 200, ok: true, headers: new Headers(), body: { getReader: () => ({ read, cancel: () => { throw new Error('private'); }, releaseLock: () => { throw new Error('private'); } }) } } as unknown as Response;
    expect(await code(boundedRequest(() => Promise.resolve(res), URL, {}, OPTIONS))).toBe('TOO_LARGE');
  });
});
