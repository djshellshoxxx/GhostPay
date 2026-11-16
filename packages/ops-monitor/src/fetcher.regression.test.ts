import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { defaultFetch, fetchBytes } from './fetcher.js';
import type { ReleaseConfig } from './types.js';

function captureUrl(): { release: ReleaseConfig; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    release: {
      mirrors: [], sha256sums: '', files: [],
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
      },
    },
  };
}

describe('release asset URL joining', () => {
  it.each([
    ['https://example.test/base///', '///asset.js', 'https://example.test/base/asset.js'],
    ['', '', '/'],
    ['///', '///', '/'],
    ['https://example.test/a//b', 'a//b', 'https://example.test/a//b/a//b'],
    ['https://example.test/base/\n', '/asset.js', 'https://example.test/base/\n/asset.js'],
  ])('joins %j and %j without changing internal characters', async (base, path, expected) => {
    const { release, urls } = captureUrl();
    expect(await fetchBytes(release, base, path)).toEqual(new Uint8Array());
    expect(urls).toEqual([expected]);
  });

  it('preserves original joining semantics over seeded bounded inputs', async () => {
    const input = fc.array(fc.constantFrom('a', '/', ':', '.', ' ', '\n', '\r', '\u2028', '?', '#'), { maxLength: 120 }).map((chars) => chars.join(''));
    await fc.assert(fc.asyncProperty(input, input, async (base, path) => {
      const { release, urls } = captureUrl();
      await fetchBytes(release, base, path);
      // Bounded reference input keeps the historical pattern safe in this oracle.
      expect(urls).toEqual([`${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`]);
    }), { seed: 20261116, numRuns: 1000 });
  });

  it('processes long internal slash runs without quadratic backtracking', async () => {
    const base = `https://example.test/${'/'.repeat(60_000)}x`;
    const { release, urls } = captureUrl();
    const start = performance.now();
    await fetchBytes(release, base, 'asset.js');
    expect(urls).toEqual([`${base}/asset.js`]);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('default release fetch streaming byte cap', () => {
  function installStream(chunks: readonly Uint8Array[], contentLength?: string, onCancel?: () => void): { mockRestore(): void } {
    let index = 0;
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index];
        if (chunk === undefined) controller.close();
        else {
          index += 1;
          controller.enqueue(chunk);
        }
      },
      cancel() { onCancel?.(); },
    }, { highWaterMark: 0 });
    const headers = new Headers(contentLength === undefined ? undefined : { 'content-length': contentLength });
    const response = { ok: true, status: 200, headers, body, arrayBuffer } as unknown as Response;
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    return mock;
  }

  it('accepts exactly maxBytes and preserves a multibyte character split across chunks', async () => {
    const expected = new TextEncoder().encode('x🙂');
    const cancel = vi.fn();
    const mock = installStream([expected.slice(0, 3), expected.slice(3)], String(expected.byteLength), cancel);
    try {
      const response = await defaultFetch('https://mirror.example/asset', expected.byteLength);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes).toEqual(expected);
      expect(new TextDecoder().decode(bytes)).toBe('x🙂');
      expect(cancel).not.toHaveBeenCalled();
    } finally {
      mock.mockRestore();
    }
  });

  it('cancels oversized streamed body without waiting for remote cancellation', async () => {
    let canceled!: () => void;
    const cancelObserved = new Promise<void>((resolve) => { canceled = resolve; });
    let pulled = 0;
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(3));
      },
      cancel() {
        canceled();
        return new Promise<void>(() => undefined);
      },
    }, { highWaterMark: 0 });
    const response = {
      ok: true, status: 200, headers: new Headers(), body,
      arrayBuffer,
    } as unknown as Response;
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    try {
      const wrapped = await defaultFetch('https://mirror.example/asset', 4);
      const read = wrapped.arrayBuffer().then(() => 'resolved', () => 'rejected');
      await expect(Promise.race([read, new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 100))]))
        .resolves.toBe('rejected');
      await expect(cancelObserved).resolves.toBeUndefined();
      expect(pulled).toBe(2);
      expect(arrayBuffer).not.toHaveBeenCalled();
    } finally {
      mock.mockRestore();
    }
  });

  it.each([undefined, 'unknown', '12bytes'])('streams and enforces maxBytes when Content-Length is %s', async (length) => {
    const canceled = vi.fn();
    const mock = installStream([new Uint8Array(3), new Uint8Array(3)], length, canceled);
    try {
      const response = await defaultFetch('https://mirror.example/asset', 4);
      await expect(response.arrayBuffer()).rejects.toMatchObject({ code: 'FETCH_FAILED' });
      expect(canceled).toHaveBeenCalledOnce();
    } finally {
      mock.mockRestore();
    }
  });

  it('rejects an oversized declared length before reading and cancels its body', async () => {
    const canceled = vi.fn();
    const mock = installStream([new Uint8Array(1)], '5', canceled);
    try {
      const response = await defaultFetch('https://mirror.example/asset', 4);
      await expect(response.arrayBuffer()).rejects.toMatchObject({ code: 'FETCH_FAILED' });
      expect(canceled).toHaveBeenCalledOnce();
    } finally {
      mock.mockRestore();
    }
  });
});
