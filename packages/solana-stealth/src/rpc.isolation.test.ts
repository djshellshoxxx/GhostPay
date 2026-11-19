import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolanaStealthError } from './errors.js';
import { createHttpRpc } from './rpc.js';

const LIMIT = 8 * 1024 * 1024;
const response = () => new Response('{"id":1,"result":7}');
const pending = <T>(): Promise<T> => new Promise<T>(() => undefined);

function requestUrl(input: Parameters<typeof globalThis.fetch>[0] | undefined): string | undefined {
  if (typeof input === 'string' || input === undefined) return input;
  return input instanceof URL ? input.href : input.url;
}

function observe(promise: Promise<unknown>): { settled: boolean; error?: unknown; value?: unknown } {
  const state: { settled: boolean; error?: unknown; value?: unknown } = { settled: false };
  void promise.then(
    (value) => { state.value = value; state.settled = true; },
    (error: unknown) => { state.error = error; state.settled = true; },
  );
  return state;
}

describe('Solana RPC network isolation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uses only the selected endpoint with no browser credentials, cache or referrer', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
    const rpc = createHttpRpc({ url: 'https://rpc.invalid/path?token=chosen', fetch });
    await expect(rpc.request('getSlot', [])).resolves.toBe(7);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetch.mock.calls[0]?.[0])).toBe('https://rpc.invalid/path?token=chosen');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
  });

  it.each(['https://rpc.invalid/#secret', 'https://rpc.invalid/#', 'https://user:secret@rpc.invalid/'])(
    'rejects ambiguous endpoint metadata before dispatch: %s',
    (url) => {
      const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
      expect(() => createHttpRpc({ url, fetch })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('retains explicit IPv6 loopback and the selected URL path', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
    await expect(createHttpRpc({ url: 'http://[::1]:8899/rpc', fetch }).request('getSlot', [])).resolves.toBe(7);
    expect(requestUrl(fetch.mock.calls[0]?.[0])).toBe('http://[::1]:8899/rpc');
  });

  it('does not dispatch an already-cancelled operation', async () => {
    const controller = new AbortController();
    controller.abort('private-reason');
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
    await expect(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', [], controller.signal))
      .rejects.toMatchObject({ code: 'ABORTED', message: 'operation aborted' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not dispatch after cancellation during payload serialization', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
    const param = { toJSON() { controller.abort(); return 'private-identifier'; } };
    await expect(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', [param], controller.signal))
      .rejects.toMatchObject({ code: 'ABORTED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('settles cancellation even when injected fetch ignores the signal', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(() => pending<Response>());
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', [], controller.signal));
    controller.abort('private-reason');
    await vi.advanceTimersByTimeAsync(0);
    expect(result.error).toMatchObject({ code: 'ABORTED', message: 'operation aborted' });
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('enforces its deadline even when injected fetch ignores the signal', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => pending<Response>());
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch, timeoutMs: 25 }).request('getSlot', []));
    await vi.advanceTimersByTimeAsync(26);
    expect(result.error).toMatchObject({ code: 'TRANSPORT_FAILURE', message: 'RPC request failed' });
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['abort', 'timeout'] as const)('stops a stalled body on %s without awaiting cancellation', async (mode) => {
    const cancel = vi.fn(() => pending<void>());
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(body)));
    const controller = new AbortController();
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch, timeoutMs: 25 }).request('getSlot', [], controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    if (mode === 'abort') controller.abort();
    await vi.advanceTimersByTimeAsync(26);
    expect(result.error).toMatchObject({ code: mode === 'abort' ? 'ABORTED' : 'TRANSPORT_FAILURE' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['declared', 'streamed'] as const)('rejects an oversized %s body when cancel never settles', async (kind) => {
    const cancel = vi.fn(() => pending<void>());
    const body = new ReadableStream<Uint8Array>({
      start(c) { if (kind === 'streamed') c.enqueue(new Uint8Array(LIMIT + 1)); },
      cancel,
    }, { highWaterMark: 0 });
    const headers = kind === 'declared' ? { 'content-length': String(LIMIT + 1) } : {};
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(body, { headers })));
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', []));
    await vi.advanceTimersByTimeAsync(0);
    expect(result.error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels an unread HTTP failure without awaiting cancellation or retrying', async () => {
    const cancel = vi.fn(() => pending<void>());
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(body, { status: 429 })));
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', []));
    await vi.advanceTimersByTimeAsync(0);
    expect(result.error).toMatchObject({ code: 'TRANSPORT_FAILURE' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('discards and cancels a response that arrives after the deadline', async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch, timeoutMs: 25 }).request('getSlot', []));
    await vi.advanceTimersByTimeAsync(26);
    expect(result.error).toMatchObject({ code: 'TRANSPORT_FAILURE' });
    const cancel = vi.fn(() => pending<void>());
    const pull = vi.fn();
    finish(new Response(new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull).not.toHaveBeenCalled();
    expect(result.value).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels a response when abort races its promise continuation', async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', [], controller.signal));
    const cancel = vi.fn(() => pending<void>());
    const pull = vi.fn();
    finish(new Response(new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 })));
    await Promise.resolve();
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(result.error).toMatchObject({ code: 'ABORTED' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 1.5, 2 ** 31])('rejects an invalid deadline before dispatch: %s', (timeoutMs) => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
    expect(() => createHttpRpc({ url: 'https://rpc.invalid', fetch, timeoutMs }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps untrusted fetch details to fixed errors without fallback', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('secret address and RPC key')));
    await expect(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', []))
      .rejects.toMatchObject({ code: 'TRANSPORT_FAILURE', message: 'RPC request failed' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['fetch', 'TRANSPORT_FAILURE'], ['stream', 'TRANSPORT_FAILURE'],
    ['fetch', 'ABORTED'], ['stream', 'INVALID_RESPONSE'],
  ] as const)('redacts an exported error supplied by %s with code %s', async (source, code) => {
    const foreign = Object.assign(new SolanaStealthError(code), {
      message: 'synthetic-request-identifier', cause: { request: 'synthetic-request-identifier' },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(() => source === 'fetch'
      ? Promise.reject(foreign)
      : Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(c) { c.error(foreign); } }))));
    const result = observe(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', []));
    await vi.advanceTimersByTimeAsync(0);
    expect(result.error).not.toBe(foreign);
    expect(result.error).toMatchObject({ code: 'TRANSPORT_FAILURE', message: 'RPC request failed' });
    expect(result.error).not.toHaveProperty('cause');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the exact response cap and UTF-8 across chunks', async () => {
    const text = '{"id":1,"result":"€"}';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const euro = bytes.indexOf(0xe2);
        c.enqueue(bytes.slice(0, euro + 1));
        c.enqueue(bytes.slice(euro + 1));
        c.enqueue(new Uint8Array(LIMIT - bytes.length).fill(0x20));
        c.close();
      },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(body)));
    await expect(createHttpRpc({ url: 'https://rpc.invalid', fetch }).request('getSlot', [])).resolves.toBe('€');
  });
});
