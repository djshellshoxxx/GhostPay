import { afterEach, describe, expect, it, vi } from 'vitest';
import { BtcScanSourceBridge } from './scanWorkerSource';
import { isScanSourcePath, MAX_SOURCE_BYTES, type BtcScanRequest } from './scanWorkerMessages';
import type { EsploraFetch } from './esplora';

const request = (requestId = 1, path = '/blocks/tip/height') => ({ type: 'source' as const, id: 7, requestId, path });
function bridge(fetchFn: EsploraFetch) {
  const send = vi.fn<(message: BtcScanRequest) => void>(); const fail = vi.fn<(error: Error) => void>();
  const source = new BtcScanSourceBridge('https://chosen.test/api', fetchFn, send, fail);
  return { source, send, fail };
}

afterEach(() => { vi.useRealTimers(); });
describe('BTC main-thread source bridge', () => {
  it('allows only bounded public scanner paths, excluding origins, redirects and broadcasts', () => {
    const hash = 'ab'.repeat(32);
    for (const path of ['/blocks/tip/height', '/block-height/4294967295', `/block/${hash}`, `/block/${hash}/header`, `/block/${hash}/txs/16650`, `/tx/${hash}/outspend/0`]) expect(isScanSourcePath(path)).toBe(true);
    for (const path of ['https://other.test', '//other.test', '/../tx', '/tx', '/fee-estimates', '/block-height/4294967296', '/block-height/01', '/blocks/tip/height?secret=x', `/block/${hash}/txs/16675`, `/block/${hash}/txs/1`, `/tx/${hash}/outspend/-1`]) expect(isScanSourcePath(path)).toBe(false);
  });

  it('uses only the configured origin with privacy options and returns bounded public bytes', async () => {
    const fetchFn = vi.fn<EsploraFetch>(() => Promise.resolve(new Response('123')));
    const b = bridge(fetchFn); b.source.handle(request());
    await vi.waitFor(() => expect(b.send).toHaveBeenCalledOnce());
    expect(fetchFn).toHaveBeenCalledWith('https://chosen.test/api/blocks/tip/height', expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }));
    expect(b.send.mock.calls[0]?.[0]).toEqual({ type: 'sourceResult', id: 7, requestId: 1, status: 200, body: new TextEncoder().encode('123') });
    b.source.dispose();
  });

  it('refuses an invalid path before network access', () => {
    const fetchFn = vi.fn<EsploraFetch>(); const b = bridge(fetchFn); b.source.handle(request(1, '/tx'));
    expect(fetchFn).not.toHaveBeenCalled(); expect(b.fail).toHaveBeenCalledOnce(); b.source.dispose();
  });

  it('rejects per-outpoint requests without the scan owner’s explicit consent', () => {
    const fetchFn = vi.fn<EsploraFetch>(); const b = bridge(fetchFn);
    b.source.handle(request(1, `/tx/${'ab'.repeat(32)}/outspend/0`));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(b.fail).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    b.source.dispose();
  });

  it('caps simultaneous requests and refuses duplicate request IDs', async () => {
    const fetchFn = vi.fn<EsploraFetch>(() => new Promise(() => {})); const b = bridge(fetchFn);
    for (let id = 1; id <= 5; id++) b.source.handle(request(id));
    expect(fetchFn).toHaveBeenCalledTimes(4); expect(b.fail).toHaveBeenCalledOnce();
    b.source.handle(request(1)); expect(b.fail).toHaveBeenCalledTimes(2);
    b.source.dispose(); await Promise.resolve(); await Promise.resolve(); expect(b.send).not.toHaveBeenCalled();
  });

  it('rejects oversized declared lengths without waiting for stream cancellation', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const b = bridge(() => Promise.resolve(new Response(new ReadableStream({ cancel }), { headers: { 'content-length': String(MAX_SOURCE_BYTES + 1) } })));
    b.source.handle(request()); await vi.waitFor(() => expect(b.send).toHaveBeenCalledWith({ type: 'sourceError', id: 7, requestId: 1, code: 'INVALID_RESPONSE' }));
    expect(cancel).toHaveBeenCalledOnce(); b.source.dispose();
  });

  it('enforces the byte cap on streamed bodies with no declared length', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const b = bridge(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_SOURCE_BYTES)); controller.enqueue(new Uint8Array(1)); }, cancel,
    }))));
    b.source.handle(request()); await vi.waitFor(() => expect(b.send).toHaveBeenCalledWith({ type: 'sourceError', id: 7, requestId: 1, code: 'INVALID_RESPONSE' }));
    expect(cancel).toHaveBeenCalledOnce(); b.source.dispose();
  });

  it('aborts the fetch signal on close and ignores a late response', async () => {
    let release!: (response: Response) => void; let signal!: AbortSignal;
    const b = bridge((_, init) => { signal = init.signal!; return new Promise((resolve) => { release = resolve; }); });
    const cancel = vi.fn();
    b.source.handle(request()); b.source.dispose(); expect(signal.aborted).toBe(true); release(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce()); expect(b.send).not.toHaveBeenCalled();
  });

  it('settles hung transport at the fixed deadline without exposing its error text', async () => {
    vi.useFakeTimers(); const b = bridge(() => new Promise(() => {})); b.source.handle(request());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(b.send).toHaveBeenCalledWith({ type: 'sourceError', id: 7, requestId: 1, code: 'TRANSPORT_FAILURE' }); b.source.dispose();
  });
});
