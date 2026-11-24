import { describe, expect, it, vi } from 'vitest';
import { merchantIdFor, signMerchantProfile, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { fetchMerchantProfile } from './embedHost';
import { forgetMerchantKey, merchantProfileUrl, readMerchantKey, rememberMerchantKey, type MerchantPinLock } from './merchantIdentity';

const key = new Uint8Array(32).fill(5);
const signer = signerPublicKeyHex(key);
const other = signerPublicKeyHex(new Uint8Array(32).fill(6));
const origin = 'https://merchant.test';
function storage(): Storage {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); }, clear: () => map.clear(), get length() { return map.size; }, key: (n) => [...map.keys()][n] ?? null };
}

describe('merchant origin pins', () => {
  it('rejects credentials, non-HTTPS, fragments and oversized URLs', () => {
    expect(merchantProfileUrl(`${origin}/profile.json`)).toBe(`${origin}/profile.json`);
    for (const value of ['http://merchant.test/p', 'https://a:b@merchant.test/p', `${origin}/p#secret`, `${origin}/${'x'.repeat(2048)}`, 'javascript:alert(1)']) {
      expect(merchantProfileUrl(value)).toBeUndefined();
    }
  });
  it('requires independently confirmed full key and never silently replaces a pin', async () => {
    const s = storage();
    expect(readMerchantKey(origin, s)).toEqual({ kind: 'absent' });
    expect(await rememberMerchantKey(origin, signer, other, s, originLock())).toBe(false);
    expect(await rememberMerchantKey(origin, signer, signer, s, originLock())).toBe(true);
    expect(readMerchantKey(origin, s)).toEqual({ kind: 'saved', signer });
    expect(await rememberMerchantKey(origin, other, other, s, originLock())).toBe(false);
    expect(readMerchantKey(origin, s)).toEqual({ kind: 'saved', signer });
    expect(readMerchantKey('https://lookalike.test', s)).toEqual({ kind: 'absent' });
    expect(await forgetMerchantKey(origin, other, s, originLock())).toBe(false);
    expect(await forgetMerchantKey(origin, signer, s, originLock())).toBe(true);
    expect(await rememberMerchantKey(origin, other, other, s, originLock())).toBe(true);
  });
  it('fails closed on ambiguous duplicate-key JSON in a persisted signer pin', async () => {
    const s = storage();
    expect(await rememberMerchantKey(origin, signer, signer, s, originLock())).toBe(true);
    const keyName = s.key(0) as string;
    const ambiguous = [
      `{"v":1,"signer":"${other}","signer":"${signer}"}`,
      `{"v":0,"v":1,"signer":"${signer}"}`,
      `{"v":1,"signer":"${signer}","signer":"${signer}"}`,
    ];
    for (const text of ambiguous) {
      s.setItem(keyName, text);
      expect(readMerchantKey(origin, s)).toEqual({ kind: 'unavailable' });
      expect(await rememberMerchantKey(origin, other, other, s, originLock())).toBe(false);
      expect(await forgetMerchantKey(origin, signer, s, originLock())).toBe(false);
    }
    // Existing pins and order/whitespace-tolerant JSON remain compatible.
    s.setItem(keyName, `{ "signer": "${signer}", "v": 1 }`);
    expect(readMerchantKey(origin, s)).toEqual({ kind: 'saved', signer });
    expect(await forgetMerchantKey(origin, signer, s, originLock())).toBe(true);
  });
  it('fails closed on corrupt storage, denied writes and stale changes', async () => {
    const s = storage();
    await rememberMerchantKey(origin, signer, signer, s, originLock());
    const keyName = s.key(0) as string;
    s.setItem(keyName, '{"signer":"bad"}');
    expect(readMerchantKey(origin, s)).toEqual({ kind: 'unavailable' });
    expect(await rememberMerchantKey(origin, other, other, s, originLock())).toBe(false);
    expect(await forgetMerchantKey(origin, other, s, originLock())).toBe(false);
    const denied = { ...storage(), getItem: () => { throw new Error('denied'); } };
    expect(readMerchantKey(origin, denied)).toEqual({ kind: 'unavailable' });
    expect(await rememberMerchantKey(origin, signer, signer, denied, originLock())).toBe(false);
    expect(readMerchantKey(`${origin}/path`, s)).toEqual({ kind: 'unavailable' });
  });
});

function originLock(): MerchantPinLock {
  const held = new Set<string>();
  return (name, action) => {
    if (held.has(name)) return Promise.resolve(false);
    held.add(name);
    return Promise.resolve().then(action).finally(() => { held.delete(name); });
  };
}

describe('merchant pin transaction boundaries', () => {
  it('refuses to mutate pins without origin locking', async () => {
    const s = storage();
    vi.stubGlobal('navigator', { locks: undefined });
    try {
      expect(await rememberMerchantKey(origin, signer, signer, s)).toBe(false);
      expect(readMerchantKey(origin, s)).toEqual({ kind: 'absent' });
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not overwrite a concurrent save between its storage read and write', async () => {
    const underlying = storage();
    const lock = originLock();
    let concurrent: Promise<boolean> | undefined;
    let raced = false;
    const s = { ...underlying, getItem: (name: string): string | null => {
      const value = underlying.getItem(name);
      if (!raced) {
        raced = true;
        concurrent = rememberMerchantKey(origin, other, other, underlying, lock);
      }
      return value;
    } };
    const first = await rememberMerchantKey(origin, signer, signer, s, lock);
    const second = await concurrent;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(readMerchantKey(origin, underlying)).toEqual({ kind: 'saved', signer });
  });
  it('checks the active profile again inside the origin lock', async () => {
    const s = storage();
    let current = true;
    let run: (() => void) | undefined;
    const delayed: MerchantPinLock = (_name, action) => new Promise<boolean>((resolve) => { run = () => { resolve(action()); }; });
    const pending = rememberMerchantKey(origin, signer, signer, s, delayed, () => current);
    current = false;
    run?.();
    expect(await pending).toBe(false);
    expect(readMerchantKey(origin, s)).toEqual({ kind: 'absent' });
  });
});

describe('merchant fetch cancellation', () => {
  it('cancels a stalled stream promptly and omits cache, credentials and referrer', async () => {
    const controller = new AbortController();
    let cancelled = false;
    let init: RequestInit | undefined;
    const pending = fetchMerchantProfile(`${origin}/p`, 100, (_u, request) => {
      init = request;
      return Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
    }, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(await pending).toBeUndefined();
    expect(cancelled).toBe(true);
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  });
  it('refuses remote profiles that do not name their source origin', async () => {
    const profile = signMerchantProfile({ v: 1, merchantId: merchantIdFor(signer), name: 'Merchant', signer, chains: [1], tokens: ['ETH'], templates: [], origins: ['https://other.test'], exp: 200 }, key);
    expect(await fetchMerchantProfile(`${origin}/p`, 100, () => Promise.resolve(new Response(JSON.stringify(profile))))).toBeUndefined();
  });
  it('bounds stalled requests by time and makes no request when already aborted', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      controller.abort();
      const noFetch = vi.fn(() => Promise.resolve(new Response('{}')));
      expect(await fetchMerchantProfile(`${origin}/p`, 100, noFetch, controller.signal)).toBeUndefined();
      expect(noFetch).not.toHaveBeenCalled();
      let signal: AbortSignal | null | undefined;
      const pending = fetchMerchantProfile(`${origin}/p`, 100, (_u, init) => {
        signal = init.signal;
        return new Promise<Response>(() => undefined);
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toBeUndefined();
      expect(signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

});
