import { MAX_PROFILE_BYTES, signMerchantProfile, merchantIdFor, signerPublicKeyHex, encodeBase64Url, type MerchantProfile } from '@ghostpay/invoice-schema';
import { describe, expect, it, vi } from 'vitest';
import { fetchMerchantProfile, notifyEmbedDone, readProfileFromSearch, signerFingerprint, startEmbedHost } from './embedHost';

const KEY = new Uint8Array(32).fill(5);
const signer = signerPublicKeyHex(KEY);
const NOW = 1_700_000_000;
const MERCHANT = 'https://shop.example';
const N = 'c'.repeat(32);
const TX = `0x${'d'.repeat(64)}`;

function profile(over: Partial<{ origins: string[]; exp: number; name: string }> = {}): MerchantProfile {
  return signMerchantProfile(
    {
      v: 1,
      merchantId: merchantIdFor(signer),
      name: over.name ?? 'Shop',
      signer,
      chains: [8453],
      tokens: ['USDC'],
      templates: [],
      origins: over.origins ?? [MERCHANT],
      exp: over.exp ?? NOW + 100,
    },
    KEY,
  );
}

type Listener = (e: { origin: string; source: unknown; data: unknown }) => void;
function env(): { win: never; parent: { postMessage: ReturnType<typeof vi.fn> }; send: (o: string, src: unknown, d: unknown) => void; listeners: Set<Listener> } {
  const listeners = new Set<Listener>();
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_t: string, l: Listener) => listeners.add(l),
    removeEventListener: (_t: string, l: Listener) => listeners.delete(l),
  };
  return { win: win as never, parent, send: (origin, source, data) => listeners.forEach((l) => l({ origin, source, data })), listeners };
}
const hello = (n = N): unknown => ({ t: 'gp:hello', n, v: 1, data: {} });

describe('embed host (checkout side)', () => {
  it('is inert when disabled, unframed, or without a verified profile', () => {
    const e = env();
    expect(startEmbedHost(e.win, profile(), false)).toBeUndefined();
    expect(startEmbedHost(e.win, undefined, true)).toBeUndefined();
    const self: { parent?: unknown } = {};
    self.parent = self;
    expect(startEmbedHost(self as never, profile(), true)).toBeUndefined();
    expect(e.listeners.size).toBe(0);
  });

  it('answers hello from the parent window at an allowed origin, and only to that origin', () => {
    const e = env();
    const s = startEmbedHost(e.win, profile(), true);
    e.send(MERCHANT, e.parent, hello());
    expect(e.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(e.parent.postMessage).toHaveBeenCalledWith({ t: 'gp:init', n: N, v: 1, data: {} }, MERCHANT);
    s?.close();
  });

  it('ignores origin mismatch, wrong source, malformed messages and a second hello', () => {
    const e = env();
    const s = startEmbedHost(e.win, profile(), true);
    e.send('https://evil.example', e.parent, hello());
    e.send(MERCHANT, {}, hello());
    e.send(MERCHANT, e.parent, { t: 'gp:init', n: N, v: 1, data: {} });
    e.send(MERCHANT, e.parent, { ...(hello() as object), extra: 1 });
    expect(e.parent.postMessage).not.toHaveBeenCalled();
    e.send(MERCHANT, e.parent, hello());
    e.send(MERCHANT, e.parent, hello('e'.repeat(32)));
    expect(e.parent.postMessage).toHaveBeenCalledTimes(1);
    s?.close();
  });

  it('sends exactly one completion carrying only status, chainId and txHash, never a wildcard origin', () => {
    const e = env();
    const s = startEmbedHost(e.win, profile(), true);
    notifyEmbedDone({ status: 'submitted', chainId: 8453, txHash: TX }); // before hello: dropped
    expect(e.parent.postMessage).not.toHaveBeenCalled();
    e.send(MERCHANT, e.parent, hello());
    notifyEmbedDone({ status: 'submitted', chainId: 8453, txHash: TX, secret: 'k', memo: 'm' } as never);
    notifyEmbedDone({ status: 'submitted', chainId: 8453, txHash: TX });
    expect(e.parent.postMessage).toHaveBeenCalledTimes(2);
    expect(e.parent.postMessage).toHaveBeenLastCalledWith({ t: 'gp:done', n: N, v: 1, data: { status: 'submitted', chainId: 8453, txHash: TX } }, MERCHANT);
    for (const call of e.parent.postMessage.mock.calls) expect(call[1]).not.toBe('*');
    s?.close();
    notifyEmbedDone({ status: 'failed', chainId: 1 });
    expect(e.parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('drops an invalid completion without consuming the session', () => {
    const e = env();
    const s = startEmbedHost(e.win, profile(), true);
    e.send(MERCHANT, e.parent, hello());
    s?.done({ status: 'submitted', chainId: 1 }); // no hash: invalid
    expect(e.parent.postMessage).toHaveBeenCalledTimes(1);
    s?.done({ status: 'failed', chainId: 1 });
    expect(e.parent.postMessage).toHaveBeenCalledTimes(2);
    s?.close();
  });
});

describe('profile loading', () => {
  const enc = (o: unknown): string => encodeBase64Url(new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o)));

  it('reads a valid profile from the query and rejects forged, expired, oversize and garbage values', () => {
    const p = profile();
    expect(readProfileFromSearch(`?gpm=${enc(p)}`, NOW)).toEqual(p);
    expect(readProfileFromSearch(`?gpm=${enc({ ...p, origins: ['https://evil.example'] })}`, NOW)).toBeUndefined();
    expect(readProfileFromSearch(`?gpm=${enc(p)}`, NOW + 100)).toBeUndefined();
    expect(readProfileFromSearch(`?gpm=${'A'.repeat(20000)}`, NOW)).toBeUndefined();
    expect(readProfileFromSearch('?gpm=%%%', NOW)).toBeUndefined();
    expect(readProfileFromSearch('', NOW)).toBeUndefined();
  });

  it('fetches only https, with no credentials/referrer, and verifies the profile', async () => {
    const p = profile();
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(p))));
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, f)).toEqual(p);
    expect(f).toHaveBeenCalledWith('https://shop.example/p.json', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' }));
    expect(await fetchMerchantProfile('http://shop.example/p.json', NOW, f)).toBeUndefined();
    expect(await fetchMerchantProfile('https://u:p@shop.example/p.json', NOW, f)).toBeUndefined();
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(new Response('x'.repeat(9000))))).toBeUndefined();
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.reject(new Error('net')))).toBeUndefined();
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(new Response('{}', { status: 404 })))).toBeUndefined();
  });

  it('formats the signer fingerprint as four groups of four', () => {
    expect(signerFingerprint(signer)).toMatch(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/);
  });
});

describe('profile response byte budget', () => {
  function response(chunks: Uint8Array[], headers: HeadersInit = {}, status = 200): {
    res: Response; cancel: ReturnType<typeof vi.fn<() => Promise<void>>>; pull: ReturnType<typeof vi.fn>;
  } {
    let index = 0;
    const cancel = vi.fn(() => Promise.resolve());
    const pull = vi.fn((ctl: ReadableStreamDefaultController<Uint8Array>) => {
      const chunk = chunks[index++];
      if (chunk === undefined) ctl.close();
      else ctl.enqueue(chunk);
    });
    return { res: new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), { headers, status }), cancel, pull };
  }

  it.each([undefined, '1', 'invalid'])('cancels an oversized stream despite Content-Length=%s', async (length) => {
    const { res, cancel, pull } = response(
      [new Uint8Array(MAX_PROFILE_BYTES), new Uint8Array(1), new Uint8Array(100)],
      length === undefined ? {} : { 'content-length': length },
    );
    const text = vi.spyOn(res, 'text');
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(res))).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(text).not.toHaveBeenCalled();
    expect(res.body?.locked).toBe(false);
  });

  it.each([200, 404])('cancels an unread rejected response with status %s', async (status) => {
    const { res, cancel, pull } = response([new Uint8Array(4)], { 'content-length': String(MAX_PROFILE_BYTES + 1) }, status);
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(res))).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull).not.toHaveBeenCalled();
  });

  it('accepts a valid signed profile exactly at the byte limit, including split UTF-8', async () => {
    const p = profile({ name: 'Café' });
    const json = JSON.stringify(p);
    const encoded = new TextEncoder().encode(json);
    const padded = new TextEncoder().encode(json + ' '.repeat(MAX_PROFILE_BYTES - encoded.length));
    const split = padded.indexOf(0xc3) + 1;
    expect(split).toBeGreaterThan(0);
    const { res, cancel } = response([padded.slice(0, split), padded.slice(split)], { 'content-length': String(MAX_PROFILE_BYTES) });
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(res))).toEqual(p);
    expect(cancel).not.toHaveBeenCalled();
    expect(res.body?.locked).toBe(false);
  });

  it('counts bytes instead of UTF-16 characters', async () => {
    const bytes = new TextEncoder().encode('é'.repeat(MAX_PROFILE_BYTES / 2 + 1));
    const { res, cancel } = response([bytes, new Uint8Array(1)]);
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(res))).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not wait for remote cancellation before rejecting', async () => {
    const { res, cancel } = response([new Uint8Array(MAX_PROFILE_BYTES + 1)]);
    cancel.mockImplementation(() => new Promise<void>(() => undefined));
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(res))).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(res.body?.locked).toBe(false);
  });

  it('rejects malformed UTF-8 and releases the reader after a stream error', async () => {
    const invalid = response([new Uint8Array([0xff]), new Uint8Array(1)]);
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(invalid.res))).toBeUndefined();
    expect(invalid.cancel).toHaveBeenCalledTimes(1);
    const res = new Response(new ReadableStream({ pull: () => { throw new Error('broken stream'); } }));
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(res))).toBeUndefined();
    expect(res.body?.locked).toBe(false);
  });

  it('rejects a response without a body', async () => {
    expect(await fetchMerchantProfile('https://shop.example/p.json', NOW, () => Promise.resolve(new Response(null)))).toBeUndefined();
  });
});
