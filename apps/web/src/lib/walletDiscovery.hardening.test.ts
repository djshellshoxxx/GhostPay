// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserFacingError } from './errors';
import { connectWallet, discoverWallets, WalletCallError, type Eip1193Provider, type WalletInfo, type WindowLike } from './wallet';

const ANNOUNCE = 'eip6963:announceProvider';
const REQUEST = 'eip6963:requestProvider';
const provider: Eip1193Provider = { request: () => Promise.resolve(null) };
const detail = (uuid = 'one', name = 'Example wallet'): unknown => ({ info: { uuid, name, rdns: 'example.wallet' }, provider });
const revoked = (): unknown => { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); return proxy; };
const getter = (name: string, value: object = {}): object => Object.defineProperty(value, name, { get: () => { throw new Error('provider secret payload'); } });

/** The real DOM EventTarget reports uncaught listener errors through window.error. */
class DiscoveryWindow implements WindowLike {
  public ethereum?: unknown;
  public readonly target = new EventTarget();
  public readonly announcements = new Set<(event: Event) => void>();
  public onRequest: () => void = () => undefined;
  public lastAnnounce: ((event: Event) => void) | undefined;
  public constructor() { this.target.addEventListener(REQUEST, () => { this.onRequest(); }); }
  public addEventListener(type: string, listener: (event: Event) => void): void {
    if (type === ANNOUNCE) { this.announcements.add(listener); this.lastAnnounce = listener; }
    this.target.addEventListener(type, listener);
  }
  public removeEventListener(type: string, listener: (event: Event) => void): void {
    if (type === ANNOUNCE) this.announcements.delete(listener);
    this.target.removeEventListener(type, listener);
  }
  public dispatchEvent(event: Event): boolean { return this.target.dispatchEvent(event); }
  public announce(payload: unknown): void { this.target.dispatchEvent(new CustomEvent(ANNOUNCE, { detail: payload })); }
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('hostile wallet discovery boundaries', () => {
  it('contains throwing metadata/provider getters and revoked proxies without DOM listener errors', async () => {
    const win = new DiscoveryWindow(); const uncaught: unknown[] = [];
    const onError = (event: ErrorEvent): void => { event.preventDefault(); uncaught.push(event.error); };
    window.addEventListener('error', onError);
    win.onRequest = () => {
      const badEvent = new Event(ANNOUNCE); getter('detail', badEvent); win.target.dispatchEvent(badEvent);
      for (const payload of [
        revoked(), getter('info'), getter('provider', { info: { uuid: 'bad', name: 'Bad' } }),
        { info: revoked(), provider },
        ...['uuid', 'name', 'icon', 'rdns'].map((field) => ({ info: getter(field, { ...(detail() as { info: object }).info }), provider })),
        { info: { uuid: 'bad', name: 'Bad' }, provider: getter('request') },
        { info: { uuid: 'bad', name: 'Bad' }, provider: revoked() },
      ]) win.announce(payload);
      win.announce(detail('healthy'));
    };
    try {
      const found = await discoverWallets(win, 0);
      expect(found.map((wallet) => wallet.id)).toEqual(['6963:healthy']);
      expect(uncaught).toEqual([]); expect(win.announcements.size).toBe(0);
    } finally { window.removeEventListener('error', onError); }
  });

  it('reads each provider/detail identity once rather than accepting a changing getter', async () => {
    const win = new DiscoveryWindow();
    const request = vi.fn(() => () => Promise.resolve(null));
    const candidate = Object.defineProperty({}, 'request', { get: request });
    const info = vi.fn().mockReturnValueOnce({ uuid: 'one', name: 'One', rdns: 'example.wallet' }).mockReturnValue(revoked());
    const getProvider = vi.fn().mockReturnValueOnce(candidate).mockReturnValue(revoked());
    const payload = Object.defineProperties({}, { info: { get: info }, provider: { get: getProvider } });
    win.onRequest = () => { win.announce(payload); };
    expect((await discoverWallets(win, 0))[0]?.provider).toBe(candidate);
    expect(info).toHaveBeenCalledTimes(1); expect(getProvider).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds collected providers and announcement reflection during a synchronous storm', async () => {
    const win = new DiscoveryWindow(); let reflected = 0;
    win.onRequest = () => {
      for (let i = 0; i < 1000; i++) {
        const event = new Event(ANNOUNCE);
        Object.defineProperty(event, 'detail', { get: () => { reflected++; return detail(`wallet-${i}`); } });
        win.target.dispatchEvent(event);
      }
    };
    const found = await discoverWallets(win, 0);
    expect(found).toHaveLength(32); expect(found[0]?.id).toBe('6963:wallet-0'); expect(found.at(-1)?.id).toBe('6963:wallet-31');
    expect(reflected).toBeLessThanOrEqual(256); expect(win.announcements.size).toBe(0);
  });

  it('still flags an identity conflict after reaching the provider bound', async () => {
    const win = new DiscoveryWindow();
    win.onRequest = () => { for (let i = 0; i < 32; i++) win.announce(detail(`wallet-${i}`)); win.announce(detail('wallet-0', 'Different name')); };
    const found = await discoverWallets(win, 0);
    expect(found).toHaveLength(32); expect(found[0]).toMatchObject({ id: '6963:wallet-0', name: 'Example wallet', conflict: true });
  });

  it('rejects oversized required text before sanitization and omits oversized optional metadata', async () => {
    const win = new DiscoveryWindow(); const huge = 'x'.repeat(100_000);
    win.onRequest = () => {
      win.announce(detail('huge-name', huge)); win.announce(detail(huge));
      win.announce({ info: { uuid: 'bounded', name: 'x'.repeat(100), rdns: huge, icon: `data:image/png;base64,${huge}` }, provider });
    };
    expect(await discoverWallets(win, 0)).toEqual([{ id: '6963:bounded', name: 'x'.repeat(40), kind: 'eip6963', provider }]);
  });

  it.each(['getter', 'revoked', 'request-getter'])('contains hostile injected fallback reflection: %s', async (mode) => {
    const win = new DiscoveryWindow();
    if (mode === 'getter') getter('ethereum', win);
    else win.ethereum = mode === 'revoked' ? revoked() : getter('request');
    await expect(discoverWallets(win, 0)).resolves.toEqual([]);
    expect(win.announcements.size).toBe(0);
  });

  it.each(['dispatch', 'partial-add'])('removes the listener and sanitizes %s failures', async (stage) => {
    const win = new DiscoveryWindow(); const add = win.addEventListener.bind(win);
    if (stage === 'dispatch') vi.spyOn(win, 'dispatchEvent').mockImplementation(() => { throw new Error('secret dispatch URL'); });
    else vi.spyOn(win, 'addEventListener').mockImplementation((type, listener) => { add(type, listener); throw new Error('secret add URL'); });
    const error = await discoverWallets(win, 0).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UserFacingError); expect((error as Error).message).not.toContain('secret');
    expect(win.announcements.size).toBe(0);
  });

  it('closes late callbacks even if provider cleanup throws', async () => {
    const win = new DiscoveryWindow(); let reflected = 0;
    const remove = win.removeEventListener.bind(win);
    vi.spyOn(win, 'removeEventListener').mockImplementation((type, listener) => { remove(type, listener); throw new Error('secret cleanup'); });
    await expect(discoverWallets(win, 0)).resolves.toEqual([]);
    const late = new Event(ANNOUNCE);
    Object.defineProperty(late, 'detail', { get: () => { reflected++; return detail(); } });
    win.lastAnnounce?.(late);
    expect(reflected).toBe(0);
  });

  it('caps the discovery lifetime without increasing test timing thresholds', async () => {
    vi.useFakeTimers(); const win = new DiscoveryWindow(); let settled = false;
    const task = discoverWallets(win, 100_000).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(true); expect(win.announcements.size).toBe(0); await task;
  });
});

describe('untrusted wallet error metadata', () => {
  const wallet = (reason: unknown): WalletInfo => ({ id: 'test', name: 'Test wallet', kind: 'injected', provider: { request: () => {
    // Deliberately reproduce providers rejecting arbitrary objects and revoked proxies.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject(reason);
  } } });
  it.each(['throwing-getter', 'revoked-proxy', 'object-code', 'string-code', 'nonfinite-code', 'unsupported-code'])('maps %s to a fixed WalletCallError without retaining provider objects', async (mode) => {
    const arbitrary = { privateUrl: 'https://secret.test/token', toString: () => { throw new Error('must not coerce'); } };
    const reason = mode === 'throwing-getter' ? getter('code') : mode === 'revoked-proxy' ? revoked() : {
      code: mode === 'object-code' ? arbitrary : mode === 'string-code' ? '4001 secret payload' : mode === 'nonfinite-code' ? Infinity : 123456789,
    };
    const error = await connectWallet(wallet(reason), 84532).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(WalletCallError); expect(error).toMatchObject({ method: 'eth_requestAccounts', rpcCode: undefined, message: 'Wallet call failed: eth_requestAccounts' });
    expect(JSON.stringify(error)).not.toContain('secret');
  });
  it.each([4100, 4200, 4900, 4901, -32700, -32600, -32601, -32602, -32603, -32000, -32099])('retains supported primitive numeric error code %s only', async (code) => {
    await expect(connectWallet(wallet({ code, data: { secret: true } }), 84532)).rejects.toMatchObject({ rpcCode: code, message: 'Wallet call failed: eth_requestAccounts' });
  });
  it('preserves numeric 4001 as the existing clear user rejection', async () => {
    await expect(connectWallet(wallet({ code: 4001 }), 84532)).rejects.toThrow('You rejected the request in your wallet.');
  });
  it('does not retain arbitrary code payloads through the public error constructor', () => {
    const error = new WalletCallError('eth_accounts', { secret: true });
    expect(error.rpcCode).toBeUndefined();
  });
});
