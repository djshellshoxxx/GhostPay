import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainAdapterError, RpcHttpError } from '@ghostpay/chain-adapters';
import { NetTransportError } from './errors.js';
import { createFetchTransport, type FetchLike } from './fetchTransport.js';

const ENDPOINT = 'https://chosen-rpc.test/rpc';
const BODY = '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0x1111111111111111111111111111111111111111","latest"]}';
const LIMITS = { timeoutMs: 50, maxBytes: 16 };
const encoder = new TextEncoder();

function bodyStream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function response(body: ReadableStream<Uint8Array> | null): Awaited<ReturnType<FetchLike>> {
  return { ok: true, status: 200, body };
}

async function settled(promise: Promise<string>): Promise<unknown> {
  let result: unknown = { pending: true };
  void promise.then((value) => { result = { value }; }, (error: unknown) => { result = { error }; });
  await Promise.resolve();
  return result;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetch transport isolation and bounded failures', () => {
  it('settles the deadline when the selected fetch ignores abort, without direct fallback', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const chosen = vi.fn<FetchLike>((_url, init) => {
      signal = init.signal;
      return new Promise(() => undefined);
    });
    const direct = vi.fn();
    vi.stubGlobal('fetch', direct);
    const pending = createFetchTransport({ fetchImpl: chosen }).send(ENDPOINT, BODY, LIMITS);
    void pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(51);
    expect(await settled(pending)).toMatchObject({ error: { code: 'RPC_FAILURE', message: 'RPC_FAILURE: transport error or timeout' } });
    expect(signal?.aborted).toBe(true);
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(direct).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles the deadline and cancels an unresponsive response stream', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const pending = createFetchTransport({ fetchImpl: () => Promise.resolve(response(stream)) }).send(ENDPOINT, BODY, LIMITS);
    void pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(51);
    expect(await settled(pending)).toMatchObject({ error: { code: 'RPC_FAILURE' } });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('discards and cancels a fetch response arriving after the deadline without reading it', async () => {
    vi.useFakeTimers();
    let complete: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    const pending = createFetchTransport({ fetchImpl: () => new Promise((resolve) => { complete = resolve; }) }).send(ENDPOINT, BODY, LIMITS);
    void pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(51);
    expect(await settled(pending)).toMatchObject({ error: { code: 'RPC_FAILURE' } });
    const cancel = vi.fn(() => undefined);
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const getReader = vi.spyOn(stream, 'getReader');
    complete?.(response(stream));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });

  it.each(['hang', 'reject', 'throw'] as const)('rejects oversized streams immediately even when cancel will %s', async (mode) => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => {
      if (mode === 'hang') return new Promise<void>(() => undefined);
      if (mode === 'reject') return Promise.reject(new Error('sensitive cancellation reason'));
      throw new Error('sensitive cancellation reason');
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(17)); },
      cancel,
    });
    const pending = createFetchTransport({ fetchImpl: () => Promise.resolve(response(stream)) }).send(ENDPOINT, BODY, LIMITS);
    void pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(await settled(pending)).toMatchObject({ error: { code: 'RESPONSE_TOO_LARGE', message: 'RESPONSE_TOO_LARGE: response exceeds cap' } });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    Object.assign(new Error(`destination ${ENDPOINT} payload ${BODY}`), { name: 'ChainAdapterError', code: 'RPC_FAILURE' }),
    new ChainAdapterError('RPC_FAILURE', `destination ${ENDPOINT} payload ${BODY}`),
    new NetTransportError('PROXY_CONNECT', `destination ${ENDPOINT} payload ${BODY}`),
    Object.assign(new RpcHttpError(503), { message: `destination ${ENDPOINT} payload ${BODY}` }),
    undefined,
  ])('does not trust class names or error text from a fetch implementation', async (error) => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(error);
    const pending = createFetchTransport({ fetchImpl }).send(ENDPOINT, BODY, LIMITS);
    await expect(pending).rejects.toMatchObject({ code: 'RPC_FAILURE', message: 'RPC_FAILURE: transport error or timeout' });
  });

  it('redacts errors from body readers as well as fetch failures', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new ChainAdapterError('INVALID_INPUT', BODY)); },
    });
    await expect(createFetchTransport({ fetchImpl: () => Promise.resolve(response(stream)) }).send(ENDPOINT, BODY, LIMITS))
      .rejects.toMatchObject({ code: 'RPC_FAILURE', message: 'RPC_FAILURE: transport error or timeout' });
    expect(stream.locked).toBe(false);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, 2 ** 31])('refuses an invalid timeout before dispatch (%s)', async (timeoutMs) => {
    const send = vi.fn<FetchLike>(() => Promise.resolve(response(bodyStream('ok'))));
    await expect(createFetchTransport({ fetchImpl: send }).send(ENDPOINT, BODY, { ...LIMITS, timeoutMs }))
      .rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses an invalid response cap before dispatch (%s)', async (maxBytes) => {
    const send = vi.fn<FetchLike>(() => Promise.resolve(response(bodyStream('ok'))));
    await expect(createFetchTransport({ fetchImpl: send }).send(ENDPOINT, BODY, { ...LIMITS, maxBytes }))
      .rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves exact-cap bytes, split UTF-8, hardened options and a single selected destination', async () => {
    const bytes = encoder.encode('a€b');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    const send = vi.fn<FetchLike>(() => Promise.resolve(response(stream)));
    await expect(createFetchTransport({ fetchImpl: send }).send(ENDPOINT, BODY, { ...LIMITS, maxBytes: 5 })).resolves.toBe('a€b');
    expect(send).toHaveBeenCalledExactlyOnceWith(ENDPOINT, expect.objectContaining({
      method: 'POST', body: BODY, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    }));
    expect(stream.locked).toBe(false);
  });

  it.each([301, 307, 400, 429, 500, 503])('returns an HTTP failure without following or retaining status %s response data', async (status) => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const send = vi.fn<FetchLike>(() => Promise.resolve({ ok: false, status, body: stream }));
    await expect(createFetchTransport({ fetchImpl: send }).send(ENDPOINT, BODY, LIMITS)).rejects.toMatchObject({ name: 'RpcHttpError', status });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([0, 100, 600, Number.NaN, 200.5])('redacts malformed upstream status %s', async (status) => {
    const send: FetchLike = () => Promise.resolve({ ok: true, status, body: bodyStream('ok') });
    await expect(createFetchTransport({ fetchImpl: send }).send(ENDPOINT, BODY, LIMITS))
      .rejects.toMatchObject({ code: 'RPC_FAILURE', message: 'RPC_FAILURE: transport error or timeout' });
  });

  it('does not let a real HTTP redirect forward the sensitive POST to a second server', async () => {
    const received: { path: string | undefined; body: string }[] = [];
    const forbidden = createServer((req, res) => {
      received.push({ path: req.url, body: '' });
      res.end('forbidden');
    });
    let firstRequests = 0;
    const selected = createServer((_req, res) => {
      firstRequests++;
      res.writeHead(307, { location: `${serverUrl(forbidden)}/disallowed` });
      res.end();
    });
    try {
      await listen(forbidden);
      await listen(selected);
      await expect(createFetchTransport({ allowInsecureLocalhost: true }).send(serverUrl(selected), BODY, { timeoutMs: 2000, maxBytes: 100 }))
        .rejects.toMatchObject({ code: 'RPC_FAILURE' });
      expect(firstRequests).toBe(1);
      expect(received).toEqual([]);
    } finally {
      selected.closeAllConnections();
      forbidden.closeAllConnections();
      await Promise.all([close(selected), close(forbidden)]);
    }
  });
});

async function listen(server: Server): Promise<void> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}

function serverUrl(server: Server): string {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('missing test server address');
  return `http://127.0.0.1:${String(address.port)}/`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => { server.close((error) => { if (error === undefined) resolve(); else reject(error); }); });
}
