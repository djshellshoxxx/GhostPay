import { SilentPaymentError } from '@ghostpay/btc-silent-payments';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EsploraClient, type EsploraFetch } from './esplora';

const BASE = 'https://esplora.test/api';
const never = <T>(): Promise<T> => new Promise(() => undefined);
const result = (p: Promise<unknown>): Promise<string> => p.then(() => 'success', (e: unknown) => e instanceof SilentPaymentError ? e.code : 'other');

/** Fake timers leave non-cooperative work pending without hanging the test runner. */
async function outcome(p: Promise<unknown>, advance = 100): Promise<string> {
  let state = 'pending';
  void result(p).then((s) => { state = s; });
  await vi.advanceTimersByTimeAsync(advance);
  return state;
}

function client(fetchFn: EsploraFetch): EsploraClient {
  return new EsploraClient({ baseUrl: BASE, fetchFn, timeoutMs: 20 });
}

afterEach(() => { vi.useRealTimers(); });

describe('Esplora cancellation isolation', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, 2_147_483_648])('rejects invalid deadline %s before any request', (timeoutMs) => {
    const fetchFn = vi.fn<EsploraFetch>();
    expect(() => new EsploraClient({ baseUrl: BASE, fetchFn, timeoutMs })).toThrow(SilentPaymentError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('settles a fetch that ignores both the deadline and abort signal', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<EsploraFetch>(() => never<Response>());
    expect(await outcome(client(fetchFn).tipHeight())).toBe('TRANSPORT_FAILURE');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized declared body without waiting for a hostile cancel', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => never<void>());
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { 'content-length': String(17 * 1024 * 1024) } });
    expect(await outcome(client(() => Promise.resolve(response)).tipHeight(), 1)).toBe('INVALID_RESPONSE');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('settles a stalled injected reader even if read and cancel both ignore abort', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => never<void>());
    const releaseLock = vi.fn();
    const reader = { read: () => never<ReadableStreamReadResult<Uint8Array>>(), cancel, releaseLock };
    const response = { ok: true, status: 200, headers: new Headers(), body: { getReader: () => reader } } as unknown as Response;
    expect(await outcome(client(() => Promise.resolve(response)).tipHeight())).toBe('TRANSPORT_FAILURE');
    expect(cancel).toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalled();
  });

  it('does not dispatch an already-cancelled operation', async () => {
    const signal = AbortSignal.abort('private cancellation reason');
    const fetchFn = vi.fn<EsploraFetch>(() => Promise.resolve(new Response('7')));
    expect(await result(client(fetchFn).tipHeight(signal))).toBe('ABORTED');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not dispatch a broadcast whose caller signal is already cancelled', async () => {
    const signal = AbortSignal.abort('private broadcast cancellation reason');
    const fetchFn = vi.fn<EsploraFetch>(() => Promise.resolve(new Response('1'.repeat(64))));
    expect(await result(client(fetchFn).broadcast('00', signal))).toBe('ABORTED');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
