import { afterEach, describe, expect, it, vi } from 'vitest';
import { BtcOracleBridge } from './oracleBridge';
import { MAX_SOURCE_BYTES } from './scanWorkerMessages';
import type { EsploraFetch } from './esplora';

const setup = (fetchFn: EsploraFetch) => {
  const send = vi.fn(); const fail = vi.fn();
  return { send, fail, bridge: new BtcOracleBridge({ kind: 'http', url: 'https://oracle.test' }, 'https://esplora.test', 'regtest', fetchFn, send, fail) };
};
const request = { type: 'oracle' as const, id: 1, requestId: 1, height: 1, source: 0 as const };
afterEach(() => vi.useRealTimers());
describe('bounded oracle transport', () => {
  it('ends a stalled fetch at the absolute deadline and cancels a late body', async () => {
    vi.useFakeTimers(); let release!: (r: Response) => void;
    const f = setup(() => new Promise((resolve) => { release = resolve; })); f.bridge.handle(request);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.send).toHaveBeenCalledWith({ type: 'oracleError', id: 1, requestId: 1, code: 'TRANSPORT_FAILURE' });
    const cancel = vi.fn(); release(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce(); f.bridge.dispose();
  });
  it('bounds a stalled body and rejects oversized response declarations', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); const f = setup(() => Promise.resolve(new Response(new ReadableStream({ cancel }))));
    f.bridge.handle(request); await vi.advanceTimersByTimeAsync(30_000);
    expect(f.send.mock.calls[0]![0]).toMatchObject({ type: 'oracleError' }); expect(cancel).toHaveBeenCalledOnce(); f.bridge.dispose();
    const over = setup(() => Promise.resolve(new Response('{}', { headers: { 'content-length': String(MAX_SOURCE_BYTES + 1) } })));
    over.bridge.handle(request); await vi.advanceTimersByTimeAsync(0);
    expect(over.send.mock.calls[0]![0]).toMatchObject({ type: 'oracleError' }); over.bridge.dispose();
  });
  it('refuses unavailable sources, duplicate request IDs and excess concurrency before transport', () => {
    const fetchFn = vi.fn<EsploraFetch>(() => new Promise(() => undefined)); const f = setup(fetchFn);
    f.bridge.handle({ ...request, source: 1 }); expect(fetchFn).not.toHaveBeenCalled();
    f.bridge.handle(request); f.bridge.handle(request); f.bridge.handle({ ...request, requestId: 2 }); f.bridge.handle({ ...request, requestId: 3 });
    expect(fetchFn).toHaveBeenCalledTimes(2); expect(f.fail).toHaveBeenCalledTimes(3); f.bridge.dispose();
  });
});
