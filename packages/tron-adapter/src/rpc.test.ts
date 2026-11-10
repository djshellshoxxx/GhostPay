import { describe, expect, it } from 'vitest';
import { createHttpRpc } from './rpc.js';

const okFetch = (capture: { init?: RequestInit; url?: string }, body: string, status = 200): typeof fetch =>
  ((url: string, init?: RequestInit) => {
    capture.url = url;
    if (init !== undefined) capture.init = init;
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
const throwing = (): typeof fetch => (() => Promise.reject(new Error('secret-detail')));
const respond = (res: () => Response): typeof fetch => () => Promise.resolve(res());
const MiB = 1024 * 1024;

/**
 * A 64 MiB body served in 64 KiB chunks; `seen` records how many chunks were pulled and whether it was cancelled
 * (`failCancel`: the cancellation itself fails).
 */
function bigBody(seen: { pulled: number; cancelled: boolean; failCancel?: boolean }): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024).fill(0x20);
  return new ReadableStream({
    pull(c) {
      seen.pulled++;
      if (seen.pulled > 1024) c.close();
      else c.enqueue(chunk);
    },
    cancel() {
      seen.cancelled = true;
      if (seen.failCancel === true) throw new Error('cancel failed');
    },
  });
}

describe('createHttpRpc', () => {
  it('enforces https (localhost excepted) and valid urls', () => {
    expect(() => createHttpRpc({ baseUrl: 'http://nile.trongrid.io' })).toThrow(/https/);
    expect(() => createHttpRpc({ baseUrl: 'ftp://x.y' })).toThrow();
    expect(() => createHttpRpc({ baseUrl: 'not a url' })).toThrow();
    expect(() => createHttpRpc({ baseUrl: 'http://127.0.0.1:9090' })).not.toThrow();
    expect(() => createHttpRpc({ baseUrl: 'http://localhost:9090' })).not.toThrow();
  });
  it('posts JSON, sends api key, refuses redirects', async () => {
    const cap: { init?: RequestInit; url?: string } = {};
    const rpc = createHttpRpc({ baseUrl: 'https://nile.trongrid.io/', apiKey: 'k', fetch: okFetch(cap, '{"a":1}') });
    expect(await rpc.post('/wallet/getnowblock', {})).toEqual({ a: 1 });
    expect(cap.url).toBe('https://nile.trongrid.io/wallet/getnowblock');
    expect((cap.init?.headers as Record<string, string>)['TRON-PRO-API-KEY']).toBe('k');
    expect(cap.init?.redirect).toBe('error');
    await expect(rpc.post('nope', {})).rejects.toThrow();
  });
  it('maps failures to fixed errors', async () => {
    const mk = (f: typeof fetch) => createHttpRpc({ baseUrl: 'https://x.example', fetch: f });
    await expect(mk(okFetch({}, '{}', 500)).post('/a', {})).rejects.toThrow(/request failed/);
    await expect(mk(okFetch({}, 'not json')).post('/a', {})).rejects.toThrow(/invalid response/);
    await expect(mk(okFetch({}, 'x'.repeat(9 * 1024 * 1024))).post('/a', {})).rejects.toThrow(/invalid response/);
    await expect(mk(throwing()).post('/a', {})).rejects.toThrow(/request failed/);
    const ac = new AbortController();
    ac.abort();
    await expect(mk(throwing()).post('/a', {}, ac.signal)).rejects.toThrow(/aborted/);
  });
  it('caps the response size while the body streams', async () => {
    const mk = (f: typeof fetch) => createHttpRpc({ baseUrl: 'https://x.example', fetch: f });
    // The download is cancelled just past the 8 MiB cap instead of being read to the end.
    const streamed = { pulled: 0, cancelled: false };
    await expect(mk(respond(() => new Response(bigBody(streamed)))).post('/a', {})).rejects.toThrow(/invalid response/);
    expect(streamed.cancelled).toBe(true);
    expect(streamed.pulled).toBeLessThan(8 * 16 + 8);
    // A declared Content-Length above the cap is refused before the body is read.
    const declared = { pulled: 0, cancelled: false };
    const big = () => new Response(bigBody(declared), { headers: { 'content-length': String(64 * MiB) } });
    await expect(mk(respond(big)).post('/a', {})).rejects.toThrow(/invalid response/);
    expect(declared.cancelled).toBe(true);
    expect(declared.pulled).toBeLessThanOrEqual(1);
    // A cancellation that fails does not hide the refusal.
    for (const headers of [{}, { 'content-length': String(64 * MiB) }]) {
      const failing = { pulled: 0, cancelled: false, failCancel: true };
      await expect(mk(respond(() => new Response(bigBody(failing), { headers }))).post('/a', {})).rejects.toThrow(/invalid response/);
      expect(failing.cancelled).toBe(true);
    }
    // A body that fails while streaming is a transport failure (or an abort when the caller aborted).
    const broken = () => new Response(new ReadableStream({ pull: (c) => { c.error(new Error('secret-detail')); } }));
    await expect(mk(respond(broken)).post('/a', {})).rejects.toThrow(/request failed/);
    const ac = new AbortController();
    const abortMidBody = () => new Response(new ReadableStream({ pull: (c) => { ac.abort(); c.error(new Error('aborted')); } }));
    await expect(mk(respond(abortMidBody)).post('/a', {}, ac.signal)).rejects.toThrow(/aborted/);
    await expect(mk(respond(() => new Response(null))).post('/a', {})).rejects.toThrow(/invalid response/);
  });
});
