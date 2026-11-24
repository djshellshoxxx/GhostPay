import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeReleaseHash, entryScriptUrl } from './release';

describe('release hash', () => {
  it('hashes the same-origin entry script', async () => {
    const body = new TextEncoder().encode('abc');
    const r = await computeReleaseHash('./assets/index-1.js', () => Promise.resolve(new Response(body)), 'https://app.test');
    expect(r.file).toBe('index-1.js');
    expect(r.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('refuses cross-origin scripts and failed fetches', async () => {
    await expect(computeReleaseHash('https://evil.test/a.js', () => Promise.resolve(new Response('x')), 'https://app.test')).rejects.toThrow(/cross-origin/);
    await expect(computeReleaseHash('/a.js', () => Promise.resolve(new Response('x', { status: 404 })), 'https://app.test')).rejects.toThrow(/fetch failed/);
  });
  it('resolves the entry script against the document URL, so it stays inside a project sub-path', async () => {
    const urls: string[] = [];
    const fetchFn = (url: string): Promise<Response> => { urls.push(url); return Promise.resolve(new Response('abc')); };
    const r = await computeReleaseHash('./assets/index-1.js', fetchFn, 'https://owner.github.io/GhostPay/');
    expect(urls).toEqual(['https://owner.github.io/GhostPay/assets/index-1.js']);
    expect(r.file).toBe('index-1.js');
    // A document URL with a fragment or a file name resolves the same way.
    await computeReleaseHash('./assets/index-1.js', fetchFn, 'https://owner.github.io/GhostPay/index.html#gpi=v1.x');
    expect(urls[1]).toBe('https://owner.github.io/GhostPay/assets/index-1.js');
    // Another origin is still refused, whatever the path.
    await expect(computeReleaseHash('https://owner2.github.io/GhostPay/assets/a.js', fetchFn, 'https://owner.github.io/GhostPay/')).rejects.toThrow(/cross-origin/);
  });
  it('finds the entry script in a document', () => {
    const doc = { querySelectorAll: () => [{ getAttribute: () => './assets/index-1.js' }, { getAttribute: () => null }] } as unknown as Document;
    expect(entryScriptUrl(doc)).toBe('./assets/index-1.js');
    expect(entryScriptUrl({ querySelectorAll: () => [] } as unknown as Document)).toBeUndefined();
  });
});

describe('release hash network isolation', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('forbids redirects and browser credentials on the automatic startup fetch', async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('abc')));
    await computeReleaseHash('/assets/entry.js', fetchFn, 'https://app.test/');
    expect(fetchFn).toHaveBeenCalledWith('https://app.test/assets/entry.js', expect.objectContaining({
      mode: 'same-origin', redirect: 'error', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer',
    }));
    expect(fetchFn.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://user:secret@app.test/assets/entry.js',
    '/assets/entry.js#private-identifier',
    'data:text/javascript,private-identifier',
    'file:///private-identifier.js',
  ])('rejects an unsafe script URL before dispatch: %s', async (url) => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('abc')));
    await expect(computeReleaseHash(url, fetchFn, 'https://app.test/')).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never exposes an invalid base URL or a transport exception in errors', async () => {
    const secret = 'private-identifier-0x123';
    const fetchFn = vi.fn(() => Promise.reject(new Error(secret)));
    for (const base of ['https://app.test/', secret]) {
      const error: unknown = await computeReleaseHash('/entry.js', fetchFn, base).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(secret);
    }
  });

  it('rejects a redirected response even if an injected fetch ignores redirect policy', async () => {
    const res = new Response('abc');
    Object.defineProperty(res, 'redirected', { value: true });
    await expect(computeReleaseHash('/entry.js', () => Promise.resolve(res), 'https://app.test/')).rejects.toThrow();
  });

  it('refuses a foreign final response URL without hashing it', async () => {
    const res = new Response('abc');
    Object.defineProperty(res, 'url', { value: 'https://foreign.test/private-identifier' });
    await expect(computeReleaseHash('/entry.js', () => Promise.resolve(res), 'https://app.test/')).rejects.toThrow();
  });

  it('rejects declared oversized assets before reading their body', async () => {
    const res = new Response('abc', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } });
    await expect(computeReleaseHash('/entry.js', () => Promise.resolve(res), 'https://app.test/')).rejects.toThrow();
    expect(res.body?.locked).toBe(false);
  });

  it('settles on deadline when fetch ignores abort, without retrying', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(() => new Promise<Response>(() => undefined));
    const settled = vi.fn();
    void computeReleaseHash('/entry.js', fetchFn, 'https://app.test/').then(settled, settled);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(settled).toHaveBeenCalledWith(expect.any(Error));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('settles on stalled-body timeout even when cancellation never resolves', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const res = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const settled = vi.fn();
    void computeReleaseHash('/entry.js', () => Promise.resolve(res), 'https://app.test/').then(settled, settled);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(settled).toHaveBeenCalledWith(expect.any(Error));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(res.body?.locked).toBe(false);
  });

  it('rejects streamed overflow immediately despite a stalled cancel promise', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const res = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); },
      cancel,
    }));
    const settled = vi.fn();
    void computeReleaseHash('/entry.js', () => Promise.resolve(res), 'https://app.test/').then(settled, settled);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith(expect.any(Error));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(res.body?.locked).toBe(false);
  });

  it('does not expose a custom reader cleanup error or lose an otherwise valid hash', async () => {
    const res = new Response('abc');
    const stream = res.body as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    const release = reader.releaseLock.bind(reader);
    vi.spyOn(stream, 'getReader').mockReturnValue(reader);
    vi.spyOn(reader, 'releaseLock').mockImplementation(() => { release(); throw new Error('private-cleanup-identifier'); });
    await expect(computeReleaseHash('/entry.js', () => Promise.resolve(res), 'https://app.test/'))
      .resolves.toMatchObject({ sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  });

  it('cancels a response arriving after the deadline without reading it', async () => {
    vi.useFakeTimers();
    let complete: ((res: Response) => void) | undefined;
    const settled = vi.fn();
    void computeReleaseHash('/entry.js', () => new Promise<Response>((resolve) => { complete = resolve; }), 'https://app.test/')
      .then(settled, settled);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(settled).toHaveBeenCalledWith(expect.any(Error));
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const getReader = vi.spyOn(stream, 'getReader');
    complete?.(new Response(stream));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
  });
});
