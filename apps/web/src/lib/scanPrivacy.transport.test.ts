import { describe, expect, it } from 'vitest';
import { fetchHttpTransport } from './scanPrivacy';

// R12-3: the indexer transport enforces maxBytes while it streams, not after buffering the whole body.
const CHUNK = 64 * 1024;

function counted(chunks: number, size = CHUNK): { body: ReadableStream<Uint8Array>; pulled: () => number; cancelled: () => boolean } {
  let pulled = 0;
  let n = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (n >= chunks) { c.close(); return; }
      const v = new Uint8Array(size).fill(n++ & 0xff);
      pulled += v.byteLength;
      c.enqueue(v);
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { body, pulled: () => pulled, cancelled: () => cancelled };
}

const get = (maxBytes: number) => ({ method: 'GET' as const, url: 'https://indexer.example/v1/logs', maxBytes, timeoutMs: 30_000 });

describe('fetchHttpTransport size cap', () => {
  it('stops reading an oversized streamed body about one chunk past the cap, cancels it and aborts the request', async () => {
    const s = counted(1000); // ~64 MiB
    let signal: AbortSignal | undefined;
    const t = fetchHttpTransport((_url, init) => { signal = init.signal ?? undefined; return Promise.resolve(new Response(s.body, { status: 200 })); });
    await expect(t.request(get(100_000))).rejects.toMatchObject({ name: 'ScanSourceError', code: 'TRANSPORT' });
    expect(s.pulled()).toBeLessThanOrEqual(100_000 + CHUNK);
    expect(s.cancelled()).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it('refuses a declared Content-Length above the cap without reading the body', async () => {
    const s = counted(4);
    const t = fetchHttpTransport(() => Promise.resolve(new Response(s.body, { status: 200, headers: { 'content-length': String(4 * CHUNK) } })));
    await expect(t.request(get(CHUNK))).rejects.toMatchObject({ code: 'TRANSPORT' });
    expect(s.pulled()).toBe(0);
    expect(s.cancelled()).toBe(true);
  });

  it('returns a body exactly at the cap byte for byte', async () => {
    const s = counted(3, 1000);
    const t = fetchHttpTransport(() => Promise.resolve(new Response(s.body, { status: 200 })));
    const r = await t.request(get(3000));
    expect(r.status).toBe(200);
    const want = new Uint8Array(3000);
    want.fill(0, 0, 1000); want.fill(1, 1000, 2000); want.fill(2, 2000, 3000);
    expect(r.body).toEqual(want);
  });

  it('returns a small JSON body unchanged and keeps the HTTP status', async () => {
    const text = '{"ok":true}';
    const t = fetchHttpTransport(() => Promise.resolve(new Response(text, { status: 404, headers: { 'content-length': String(text.length) } })));
    const r = await t.request(get(1024));
    expect(r.status).toBe(404);
    expect(new TextDecoder().decode(r.body)).toBe(text);
  });

  it('treats a response with no body as an empty body', async () => {
    const t = fetchHttpTransport(() => Promise.resolve(new Response(null, { status: 204 })));
    const r = await t.request(get(10));
    expect(r.status).toBe(204);
    expect(r.body.length).toBe(0);
  });
});
