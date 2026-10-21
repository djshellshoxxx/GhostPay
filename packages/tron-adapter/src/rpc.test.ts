import { describe, expect, it } from 'vitest';
import { createHttpRpc } from './rpc.js';

const okFetch = (capture: { init?: RequestInit; url?: string }, body: string, status = 200): typeof fetch =>
  ((url: string, init?: RequestInit) => {
    capture.url = url;
    if (init !== undefined) capture.init = init;
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
const throwing = (): typeof fetch => (() => Promise.reject(new Error('secret-detail')));

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
});
