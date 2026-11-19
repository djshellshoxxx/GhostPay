import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WEB_NETWORK_SELECTION, WEB_NETWORK_SELECTION_KEY } from '@ghostpay/net-transport/browser';
import { notifyAppLock } from './appLock';
import { DEFAULT_SCAN_PRIVACY } from './scanPrivacy';
import { DEFAULT_SCAN_LANES } from './scanSpam';
import { clearSession } from './session';
import { clearRpcSessionOnly, setRpcSessionOnly, SETTINGS_KEY } from './settings';
import { createNetworkAuthority, type NetworkAction, type NetworkAuthority, type NetworkAuthorizationRequest, type BrowserNetworkRef } from './networkAuthorization';

const authorities: NetworkAuthority[] = [];
const rpc = 'https://rpc.test/selected?key=user-selected';
const evm = { kind: 'evm', chainId: 84532 } as const;
const owner = '0x1111111111111111111111111111111111111111';
const token = '0x2222222222222222222222222222222222222222';
const privacyKey = 'ghostpay.scanPrivacy.v1';
const lanesKey = 'ghostpay.scanLanes.v1';
const jsonRpc = (method = 'eth_blockNumber', params: readonly unknown[] = []): RequestInit => ({ method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
function harness(overrides: Parameters<typeof createNetworkAuthority>[0] = {}) {
  const values = new Map<string, string>();
  values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': rpc }, rpcUrlsSecondary: { '84532': 'http://localhost:8545' }, relayerUrl: 'https://relayer.test/api' }));
  values.set(privacyKey, JSON.stringify({ indexerUrls: { '84532': 'https://indexer.test/api' }, endpoints: { '84532': 'https://127.0.0.1:8545' } }));
  const read = vi.fn((key: string) => values.get(key) ?? null);
  const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('ok')));
  const authority = createNetworkAuthority({ storage: () => ({ getItem: read }), fetchFn: fetcher, ...overrides });
  authorities.push(authority);
  const authorize = (request: Partial<NetworkAuthorizationRequest> = {}) => authority.authorize({ action: 'scan', category: 'rpc', endpoint: rpc, network: evm, ...request });
  return { values, read, fetcher, authority, authorize };
}
afterEach(() => { for (const authority of authorities.splice(0)) authority.dispose(); clearRpcSessionOnly(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function text(grant: ReturnType<NetworkAuthority['authorize']>, url = rpc, init: RequestInit = jsonRpc()): Promise<string> {
  return (await grant.fetchFn(url, init)).text();
}

describe('per-action browser authorization', () => {
  it('does no networking on construction, local revocation or disposal', () => {
    const h = harness(); h.authority.invalidate(); h.authority.dispose(); h.authority.dispose();
    expect(h.fetcher).not.toHaveBeenCalled(); expect(() => h.authorize()).toThrow();
  });
  it('requires a known action, category and enabled network', () => {
    const h = harness();
    expect(() => h.authorize({ action: 'unexpected' as NetworkAction })).toThrow();
    expect(() => h.authorize({ category: 'resource' })).toThrow();
    for (const chainId of [1, 123456]) expect(() => h.authorize({ network: { kind: 'evm', chainId } })).toThrow();
    expect(() => h.authority.authorize({ action: 'scan', category: 'rpc', endpoint: rpc })).toThrow();
    expect(() => h.authorize({ allowDirectOnce: true })).toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('uses the exact selected endpoint and forces fetch privacy options', async () => {
    const h = harness(); const grant = h.authorize();
    expect(await text(grant, rpc, { ...jsonRpc(), credentials: 'include', redirect: 'follow', cache: 'force-cache', referrer: 'https://leak.test/secret' })).toBe('ok');
    expect(h.fetcher).toHaveBeenCalledWith(rpc, expect.objectContaining({ redirect: 'error', credentials: 'omit', referrer: '', referrerPolicy: 'no-referrer', cache: 'no-store' }));
    for (const target of ['https://rpc.test/other', rpc + 'changed', 'https://fallback.test']) await expect(text(grant, target)).rejects.toThrow();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['wss://rpc.test', 'https://user:pass@rpc.test', 'https://rpc.test/#secret', 'http://remote.test', 'not a URL'])('refuses unsupported endpoint %s without dispatch', (endpoint) => {
    const h = harness(); expect(() => h.authorize({ endpoint })).toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('preserves segment-bounded base routes without allowing neighboring paths or origins', async () => {
    const h = harness(); const grant = h.authorize({ category: 'indexer', endpoint: 'https://indexer.test/api', match: 'prefix' });
    expect(await text(grant, 'https://indexer.test/api/v1/logs?from=1', {})).toBe('ok');
    for (const target of ['https://indexer.test/apix/v1/logs', 'https://indexer.test/api/../secret', 'https://other.test/api/v1/logs']) await expect(text(grant, target, {})).rejects.toThrow();
    expect(() => h.authorize({ match: 'prefix' })).toThrow(); expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects unnecessary sensitive headers before contacting the endpoint', async () => {
    const h = harness(); const grant = h.authorize();
    for (const headers of [{ authorization: 'Bearer private-token' }, { cookie: 'secret=private' }]) await expect(text(grant, rpc, { ...jsonRpc(), headers })).rejects.toThrow();
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('refuses forged or foreign capabilities, chain changes and endpoint changes', () => {
    const h = harness(); const grant = h.authorize(); const foreign = harness().authorize();
    h.authority.assertRpcAuthorization(grant, 84532, rpc);
    for (const cap of [undefined, { ...grant }, foreign]) expect(() => h.authority.assertRpcAuthorization(cap, 84532, rpc)).toThrow();
    expect(() => h.authority.assertRpcAuthorization(grant, 11155111, rpc)).toThrow();
    expect(() => h.authority.assertRpcAuthorization(grant, 84532, 'https://rpc.test/other')).toThrow();
    const indexer = h.authorize({ category: 'indexer', endpoint: 'https://indexer.test/api', match: 'prefix' });
    expect(() => h.authority.assertRpcAuthorization(indexer, 84532, 'https://indexer.test/api')).toThrow();
  });
  it('never exposes transport errors, arbitrary abort reasons or foreign error instances', async () => {
    const h = harness(); const grant = h.authorize();
    h.fetcher.mockRejectedValueOnce(Object.assign(new Error('sensitive endpoint bearer token'), { cause: new Error('private key') }));
    const rejected = text(grant);
    await expect(rejected).rejects.toMatchObject({ name: 'UserFacingError' });
    await expect(rejected).rejects.not.toHaveProperty('cause');
    await expect(rejected).rejects.not.toThrow(/sensitive|private key/);
    const controller = new AbortController(); const cancelled = h.authorize({ signal: controller.signal }); controller.abort(new Error('secret abort reason'));
    await expect(text(cancelled)).rejects.toThrow(); expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('live settings, session and permissions', () => {
  it.each([SETTINGS_KEY, privacyKey, WEB_NETWORK_SELECTION_KEY, 'ghostpay.scanLanes.v1'])('refuses stale cached contexts after %s changes before the event', async (key) => {
    const h = harness(); const grant = h.authorize(); h.values.set(key, JSON.stringify(key === WEB_NETWORK_SELECTION_KEY ? { rpcMode: 'single' } : { endpoints: {} }));
    await expect(text(grant)).rejects.toThrow(); expect(h.fetcher).not.toHaveBeenCalled(); expect(grant.signal.aborted).toBe(true);
  });
  it('refuses permissions deleted while an action is pending', async () => {
    const h = harness(); h.values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node', noticeAcknowledged: true }));
    const grant = h.authorize({ endpoint: 'http://localhost:8545' }); h.values.delete(WEB_NETWORK_SELECTION_KEY);
    await expect(text(grant, 'http://localhost:8545', jsonRpc())).rejects.toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
    h.authority.invalidate(); expect(() => h.authorize()).toThrow();
    h.values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify({ rpcMode: 'single', rpcProfile: 'direct', relayerProfile: 'direct', noticeAcknowledged: false }));
    expect(await text(h.authorize())).toBe('ok');
  });
  it('rejects NEW grants from a stale UI endpoint and accepts only current selected or session-only URLs', () => {
    const h = harness(); h.values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://replacement.test' } }));
    expect(() => h.authorize()).toThrow();
    h.authorize({ endpoint: 'https://replacement.test' }).assertCurrent();
    setRpcSessionOnly('primary', '84532', rpc); expect(() => h.authorize()).toThrow();
    h.values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: {} })); h.authorize().assertCurrent(); clearRpcSessionOnly();
    expect(() => h.authorize()).toThrow();
    h.authorize({ action: 'settings-check' }).assertCurrent();
  });
  it.each(['{invalid', 'null', '[]', '{"requireProxy":"true"}', '{"transport":"bogus"}', '{"endpoints":{"84532":42}}', '{"source":"pir"}'])('fails closed on malformed scan settings %s', (raw) => {
    const h = harness(); h.values.set(privacyKey, raw); expect(() => h.authorize()).toThrow();
  });
  it.each(['{"rpcMode":"own-node"}', '{"rpcProfile":"tor-socks"}', '{"rpcMode":"bogus"}', '{"noticeAcknowledged":"yes"}', '{"extra":true}'])('does not degrade invalid network selection %s to direct authority', (raw) => {
    const h = harness(); h.values.set(WEB_NETWORK_SELECTION_KEY, raw); expect(() => h.authorize()).toThrow();
  });
  it.each([
    { key: privacyKey, record: { transport: 'local-proxy', requireProxyy: true } },
    { key: lanesKey, record: { privacySetTransferss: true } },
  ])('rejects unknown privacy schema keys in $key before a new non-scan action can dispatch', async ({ key, record }) => {
    const h = harness(); h.values.set(key, JSON.stringify(record));
    let refused = false;
    try { await text(h.authorize({ action: 'payment-preflight' })); } catch { refused = true; }
    expect({ refused, dispatched: h.fetcher.mock.calls.length }).toEqual({ refused: true, dispatched: 0 });
  });
  it.each([
    { key: privacyKey, field: 'transport', valid: { transport: 'direct', requireProxy: false } },
    { key: privacyKey, field: 'requireProxy', valid: { transport: 'direct', requireProxy: false } },
    ...['rpcMode', 'rpcProfile', 'relayerProfile', 'noticeAcknowledged'].map((field) => ({ key: WEB_NETWORK_SELECTION_KEY, field, valid: { rpcMode: 'single', rpcProfile: 'direct', relayerProfile: 'direct', noticeAcknowledged: false } })),
  ])('rejects a present null $field instead of defaulting new actions to permissive policy', ({ key, field, valid }) => {
    const h = harness(); const previous = h.authorize();
    h.values.set(key, JSON.stringify({ ...valid, [field]: null }));
    expect(() => h.authorize()).toThrow();
    expect(() => previous.assertCurrent()).toThrow();
    expect(previous.signal.aborted).toBe(true);
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { key: privacyKey, field: 'windowBlocks', min: 0, max: 100_000 },
    { key: privacyKey, field: 'jitterMinMs', min: 0, max: 10_000 },
    { key: privacyKey, field: 'jitterMaxMs', min: 0, max: 10_000 },
    { key: privacyKey, field: 'openLaneBudget', min: 1, max: 100_000 },
    { key: privacyKey, field: 'padBlocks', min: 0, max: 100_000 },
    { key: privacyKey, field: 'bulkEvidence', min: 0, max: 500 },
    { key: lanesKey, field: 'floodPerBlock', min: 1, max: 10_000 },
  ])('rejects malformed stored $field instead of dropping request shaping', ({ key, field, min, max }) => {
    const h = harness();
    for (const value of [null, '0', false, min - 1, max + 1, min + 0.5]) {
      h.values.set(key, JSON.stringify({ ...(key === privacyKey ? { jitterMinMs: 0, jitterMaxMs: 0 } : {}), [field]: value }));
      expect(() => h.authorize()).toThrow();
    }
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each([{ jitterMinMs: 500, jitterMaxMs: 100 }, { jitterMinMs: 500 }, { jitterMaxMs: 500 }])('rejects malformed stored jitter pairs %s instead of resetting them to zero', (value) => {
    const h = harness(); h.values.set(privacyKey, JSON.stringify(value)); expect(() => h.authorize()).toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each(['privacySetTransfers', 'spamScoring'])('rejects malformed stored lane flag %s', (field) => {
    const h = harness();
    for (const value of [null, 'true', 0, {}, []]) { h.values.set(lanesKey, JSON.stringify({ [field]: value })); expect(() => h.authorize()).toThrow(); }
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('keeps absent legacy fields compatible and accepts normalized scan setting boundaries', () => {
    const h = harness(); h.values.set(privacyKey, '{}'); h.values.set(lanesKey, '{}'); h.authorize().assertCurrent();
    for (const upper of [false, true]) {
      h.values.set(privacyKey, JSON.stringify({ ...DEFAULT_SCAN_PRIVACY, windowBlocks: upper ? 100_000 : 0, jitterMinMs: upper ? 10_000 : 0, jitterMaxMs: upper ? 10_000 : 0, openLaneBudget: upper ? 100_000 : 1, padBlocks: upper ? 100_000 : 0, bulkEvidence: upper ? 500 : 0 }));
      h.values.set(lanesKey, JSON.stringify({ ...DEFAULT_SCAN_LANES, floodPerBlock: upper ? 10_000 : 1, spamScoring: upper, privacySetTransfers: upper }));
      h.authorize().assertCurrent();
    }
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each(['endpoints', 'indexerUrls'])('rejects invalid stored scan %s before a sanitizer can drop it and use a fallback', (field) => {
    const h = harness();
    for (const value of ['not-a-url', '', 'https://user:password@rpc.test', 'https://rpc.test/#fragment', 'http://remote.test', 'file:///private']) {
      h.values.set(privacyKey, JSON.stringify({ [field]: { '84532': value } })); expect(() => h.authorize()).toThrow();
    }
    for (const chainId of ['0', 'invalid', '12345678901234567']) {
      h.values.set(privacyKey, JSON.stringify({ [field]: { [chainId]: 'https://rpc.test' } })); expect(() => h.authorize()).toThrow();
    }
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { transport: 'direct', endpoints: { '84532': 'http://localhost:8545' } },
    { transport: 'local-proxy', endpoints: { '84532': 'https://remote.test' } },
    { transport: 'local-proxy', indexerUrls: { '84532': 'https://remote.test' } },
    { indexerUrls: { '84532': 'https://indexer.test/api?query=not-supported' } },
  ])('rejects invalid stored scan endpoint/transport combination %s', (value) => {
    const h = harness(); h.values.set(privacyKey, JSON.stringify(value)); expect(() => h.authorize()).toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('preserves valid normalized scan URLs and RPC queries for each transport', () => {
    const h = harness();
    for (const value of [
      { transport: 'direct', endpoints: { '84532': 'https://rpc.test/?key=selected' }, indexerUrls: { '84532': 'https://indexer.test/api' } },
      { transport: 'tor-browser', endpoints: { '84532': 'https://rpc.test' } },
      { transport: 'local-proxy', endpoints: { '84532': 'http://127.0.0.1:8545/?key=selected' }, indexerUrls: { '84532': 'http://localhost:8546/api' } },
    ]) { h.values.set(privacyKey, JSON.stringify(value)); h.authorize().assertCurrent(); }
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('fails closed when settings storage becomes unavailable', async () => {
    const h = harness(); const grant = h.authorize(); h.read.mockImplementation(() => { throw new Error('private storage detail'); });
    await expect(text(grant)).rejects.toThrow(); expect(h.fetcher).not.toHaveBeenCalled(); expect(() => h.authorize()).toThrow();
    const blocked = harness({ storage: () => undefined }); expect(() => blocked.authorize()).toThrow();
  });
  it.each([() => notifyAppLock('manual'), () => notifyAppLock('idle'), () => { clearSession(); }])('revokes pending contexts on app lock or seller-session replacement', async (change) => {
    const h = harness(); const grant = h.authorize(); change();
    expect(grant.signal.aborted).toBe(true); await expect(text(grant)).rejects.toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('revokes on cross-tab events, signals subscribers and removes all subscriptions on disposal', async () => {
    const target = new EventTarget(); const h = harness({ events: target as unknown as Window });
    const changed = vi.fn(); const off = h.authority.subscribe(changed); h.authority.subscribe(() => { throw new Error('subscriber failed'); });
    const first = h.authorize(); const unrelated = new Event('storage'); Object.defineProperty(unrelated, 'key', { value: 'unrelated' });
    target.dispatchEvent(unrelated); expect(first.signal.aborted).toBe(false);
    const event = new Event('storage'); Object.defineProperty(event, 'key', { value: SETTINGS_KEY }); target.dispatchEvent(event);
    expect(first.signal.aborted).toBe(true); expect(changed).toHaveBeenCalledTimes(1); expect(h.authority.getRevision()).toBe(1);
    await expect(text(first)).rejects.toThrow(); off(); h.authority.invalidate(); expect(changed).toHaveBeenCalledTimes(1);
    const clear = new Event('storage'); Object.defineProperty(clear, 'key', { value: null }); target.dispatchEvent(clear);
    h.authority.dispose(); const revision = h.authority.getRevision(); target.dispatchEvent(event); expect(h.authority.getRevision()).toBe(revision);
  });
  it('expires idle contexts and refuses sleep/clock changes without waiting for delayed browser timers', async () => {
    vi.useFakeTimers(); let now = 1000; const h = harness({ nowMs: () => now, contextIdleMs: 100 }); const grant = h.authorize();
    now = 1100; await expect(text(grant)).rejects.toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
    const backwards = h.authorize(); now = 900; await expect(text(backwards)).rejects.toThrow();
    const timer = h.authorize(); await vi.advanceTimersByTimeAsync(100); expect(timer.signal.aborted).toBe(true);
  });
  it('rejects already-aborted actions and rapidly cancelled attempts without any dispatch', async () => {
    const h = harness(); for (let i = 0; i < 20; i++) { const grant = h.authorize(); grant.cancel(); await expect(text(grant)).rejects.toThrow(); }
    const stop = new AbortController(); stop.abort(); expect(() => h.authorize({ signal: stop.signal })).toThrow(); expect(h.fetcher).not.toHaveBeenCalled();
  });
});

describe('private-path and own-node policy on actual chain categories', () => {
  const refs: readonly [NetworkAction, BrowserNetworkRef][] = [
    ['scan', evm], ['btc-scan', { kind: 'btc', network: 'regtest' }], ['solana-scan', { kind: 'solana', network: 'devnet' }], ['tron-scan', { kind: 'tron', network: 'nile' }],
  ];
  it.each(refs)('applies own-node to %s without authorizing remote fallback', (action, network) => {
    const h = harness(); h.values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node', noticeAcknowledged: true }));
    expect(() => h.authorize({ action, network })).toThrow(); h.authorize({ action, network, endpoint: 'https://127.0.0.1:8545' }).assertCurrent(); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('blocks required direct mode and rejects nonloopback endpoints for required local proxy', () => {
    const h = harness(); h.values.set(privacyKey, JSON.stringify({ requireProxy: true, transport: 'direct' })); expect(() => h.authorize()).toThrow();
    h.values.set(privacyKey, JSON.stringify({ requireProxy: true, transport: 'local-proxy' })); expect(() => h.authorize()).toThrow(); h.authorize({ endpoint: 'http://localhost:8545' }).assertCurrent();
    expect(() => h.authorize({ category: 'indexer', endpoint: 'https://indexer.test/api' })).toThrow();
    expect(() => h.authorize({ category: 'relayer', action: 'sweep-quote', endpoint: 'https://relayer.test' })).toThrow();
  });
  it('permits explicit Sweep exceptions only for that capability and never overrides own-node', async () => {
    const h = harness(); h.values.set(privacyKey, JSON.stringify({ requireProxy: true, transport: 'local-proxy' }));
    const grant = h.authorize({ action: 'sweep-balance', allowDirectOnce: true, balance: { owner, token: 'native' } });
    expect(await text(grant, rpc, jsonRpc('eth_getBalance', [owner, 'latest']))).toBe('ok');
    await expect(text(grant, rpc, jsonRpc('eth_sendRawTransaction', ['0x01']))).rejects.toThrow(); await expect(text(grant, rpc, jsonRpc('eth_getBalance', [token, 'latest']))).rejects.toThrow();
    grant.dispose(); await expect(text(grant, rpc, jsonRpc('eth_getBalance', [owner, 'latest']))).rejects.toThrow(); expect(() => h.authorize()).toThrow();
    h.values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node', noticeAcknowledged: true }));
    expect(() => h.authorize({ action: 'sweep-balance', allowDirectOnce: true, balance: { owner, token: 'native' } })).toThrow(); expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('scopes token balance consent to balanceOf for the reviewed owner/token', async () => {
    const h = harness(); const grant = h.authorize({ action: 'sweep-balance', balance: { owner, token } }); const data = '0x70a08231' + owner.slice(2).padStart(64, '0');
    expect(await text(grant, rpc, jsonRpc('eth_call', [{ to: token, data }, 'latest']))).toBe('ok');
    for (const call of [{ to: owner, data }, { to: token, data: '0xdeadbeef' }]) await expect(text(grant, rpc, jsonRpc('eth_call', [call, 'latest']))).rejects.toThrow();
    await expect(text(grant, rpc, jsonRpc('eth_getBalance', [owner, 'latest']))).rejects.toThrow();
    await expect(text(h.authorize({ action: 'sweep-balance' }), rpc, jsonRpc('eth_chainId'))).rejects.toThrow();
  });
  it('keeps relayer quote and submission destinations separate', async () => {
    const h = harness(); const grant = h.authorize({ action: 'sweep-quote', category: 'relayer', endpoint: 'https://relayer.test/api', match: 'prefix' });
    expect(await text(grant, 'https://relayer.test/api/v1/quote', { method: 'POST', body: '{}' })).toBe('ok');
    await expect(text(grant, 'https://relayer.test/api/v1/sweep', { method: 'POST', body: '{}' })).rejects.toThrow(); await expect(text(grant, 'https://relayer.test/api/v1/quote', {})).rejects.toThrow(); expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('allows the selected browser Tor path without pretending to verify routing', async () => {
    const h = harness(); h.values.set(privacyKey, JSON.stringify({ requireProxy: true, transport: 'tor-browser' })); expect(await text(h.authorize())).toBe('ok');
  });
  it('allows only same-origin release hashing independently of external policy and storage', async () => {
    const h = harness({ storage: () => undefined, origin: () => 'http://site.onion' });
    const grant = h.authorize({ action: 'release-hash', category: 'resource', endpoint: 'http://site.onion/app.js' }); expect(await text(grant, 'http://site.onion/app.js', {})).toBe('ok');
    expect(() => h.authorize({ action: 'release-hash', category: 'resource', endpoint: 'https://thirdparty.test/app.js' })).toThrow(); await expect(text(grant, 'http://site.onion/app.js', { method: 'POST' })).rejects.toThrow();
  });
});

describe('bounded guarded responses', () => {
  it('rejects overdue fetch completion when the browser delays its deadline timer', async () => {
    vi.useFakeTimers(); let now = 1000; const h = harness({ requestTimeoutMs: 20, nowMs: () => now });
    let resolve!: (response: Response) => void; h.fetcher.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
    const pending = text(h.authorize()); const rejected = expect(pending).rejects.toThrow();
    now = 1021; const response = new Response('late'); const cancel = vi.spyOn(response.body!, 'cancel'); resolve(response); await rejected; expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1); // Only the context idle lifetime remains; the request timer was cleaned up.
  });
  it('rejects overdue body chunks before returning data when timers have not run', async () => {
    vi.useFakeTimers(); let now = 1000; const h = harness({ requestTimeoutMs: 20, nowMs: () => now });
    let control!: ReadableStreamDefaultController<Uint8Array>;
    h.fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(c) { control = c; } })));
    const response = await h.authorize().fetchFn(rpc, jsonRpc()); const pending = response.text(); const rejected = expect(pending).rejects.toThrow();
    now = 1020; control.enqueue(new TextEncoder().encode('late sensitive data')); await rejected;
  });
  it('remints malformed header failures instead of exposing injected header values', async () => {
    const h = harness(); const grant = h.authorize(); const pending = text(grant, rpc, { ...jsonRpc(), headers: { 'invalid header private-key': 'secret value' } });
    await expect(pending).rejects.toMatchObject({ name: 'UserFacingError' }); await expect(pending).rejects.not.toThrow(/private-key|secret value/); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('refuses redirects and changed final destinations, disposing bodies', async () => {
    const h = harness(); for (const properties of [{ redirected: true }, { url: 'https://forbidden.test/data' }]) {
      const response = new Response('ok'); for (const [key, value] of Object.entries(properties)) Object.defineProperty(response, key, { value });
      const cancelled = vi.spyOn(response.body!, 'cancel'); h.fetcher.mockResolvedValueOnce(response); await expect(text(h.authorize())).rejects.toThrow(); expect(cancelled).toHaveBeenCalled();
    }
  });
  it('settles ignored-abort fetches and disposes late response bodies', async () => {
    vi.useFakeTimers(); const h = harness({ requestTimeoutMs: 20 }); let resolve!: (response: Response) => void;
    h.fetcher.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; })); const pending = text(h.authorize()); const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20); await rejected; const response = new Response('ok'); const cancel = vi.spyOn(response.body!, 'cancel'); resolve(response); await Promise.resolve(); await Promise.resolve(); expect(cancel).toHaveBeenCalled();
  });
  it('rejects late responses after lock even when transport ignores signals', async () => {
    const h = harness(); let resolve!: (response: Response) => void; h.fetcher.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
    const pending = text(h.authorize()); const rejected = expect(pending).rejects.toThrow(); notifyAppLock('manual'); await rejected;
    const response = new Response('ok'); const cancel = vi.spyOn(response.body!, 'cancel'); resolve(response); await Promise.resolve(); await Promise.resolve(); expect(cancel).toHaveBeenCalled();
  });
  it('settles stalled response reads without waiting for hostile cleanup', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => undefined)); const h = harness({ requestTimeoutMs: 20 });
    h.fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise<void>(() => undefined); }, cancel })));
    const pending = text(h.authorize()); const rejected = expect(pending).rejects.toThrow(); await vi.advanceTimersByTimeAsync(20); await rejected; expect(cancel).toHaveBeenCalled();
  });
  it('cancels pending reads on revocation and refuses already-aborted request signals', async () => {
    const h = harness(); let control!: ReadableStreamDefaultController<Uint8Array>; h.fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(c) { control = c; } })));
    const grant = h.authorize(); const response = await grant.fetchFn(rpc, jsonRpc()); const pending = response.text(); const rejected = expect(pending).rejects.toThrow(); h.authority.invalidate(); await rejected; expect(() => control.enqueue(new Uint8Array([1]))).toThrow();
    const aborted = new AbortController(); aborted.abort('private'); await expect(text(h.authorize(), rpc, { ...jsonRpc(), signal: aborted.signal })).rejects.toThrow(); expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('counts bytes, accepts exact caps and rejects declared oversize before read', async () => {
    const h = harness({ maxResponseBytes: 4 }); h.fetcher.mockResolvedValueOnce(new Response('1234')); expect(await text(h.authorize())).toBe('1234');
    h.fetcher.mockResolvedValueOnce(new Response('12345')); await expect(text(h.authorize())).rejects.toThrow();
    const response = new Response('1', { headers: { 'content-length': '5' } }); const cancel = vi.spyOn(response.body!, 'cancel'); h.fetcher.mockResolvedValueOnce(response); await expect(text(h.authorize())).rejects.toThrow(); expect(cancel).toHaveBeenCalled();
  });
  it('bounds each BTC response independently while allowing paginated block totals of 64 MiB', async () => {
    const h = harness();
    const request = { action: 'btc-scan', category: 'rpc', endpoint: 'https://esplora.test', network: { kind: 'btc', network: 'testnet4' } } as const;
    const grant = h.authorize(request);
    // Reuse a single chunk: this exercises the real default ceiling without buffering an entire block in the test.
    const chunk = new Uint8Array(1024 * 1024);
    const response = (chunks: number): Response => new Response(new ReadableStream<Uint8Array>({
      pull(control) { if (chunks-- > 0) control.enqueue(chunk); else control.close(); },
    }));
    const readBytes = async (): Promise<number> => {
      const reader = (await grant.fetchFn(request.endpoint, {})).body!.getReader();
      let bytes = 0;
      try {
        for (;;) { const part = await reader.read(); if (part.done) return bytes; bytes += part.value.byteLength; }
      } finally { reader.releaseLock(); }
    };
    h.fetcher.mockImplementation(() => Promise.resolve(response(16)));
    let total = 0;
    for (let page = 0; page < 4; page++) total += await readBytes();
    expect(total).toBe(64 * 1024 * 1024);
    h.fetcher.mockResolvedValueOnce(response(17)); await expect(readBytes()).rejects.toThrow();
    const limited = harness({ maxResponseBytes: 4 }); limited.fetcher.mockResolvedValueOnce(new Response('12345'));
    await expect(text(limited.authorize(request), request.endpoint, {})).rejects.toThrow();
  });
  it('passes HTTP statuses to protocol adapters and handles empty bodies', async () => {
    const h = harness(); h.fetcher.mockResolvedValueOnce(new Response(null, { status: 204 })); const empty = await h.authorize().fetchFn(rpc, jsonRpc()); expect(empty.status).toBe(204); expect(empty.body).toBeNull();
    h.fetcher.mockResolvedValueOnce(new Response('denied', { status: 503 })); const denied = await h.authorize().fetchFn(rpc, jsonRpc()); expect(denied.status).toBe(503); expect(await denied.text()).toBe('denied');
  });
  it.each([0, -1, Number.NaN, 2_147_483_648])('rejects invalid bounds %s', (value) => {
    expect(() => createNetworkAuthority({ requestTimeoutMs: value })).toThrow(); expect(() => createNetworkAuthority({ contextIdleMs: value })).toThrow(); expect(() => createNetworkAuthority({ maxResponseBytes: value })).toThrow();
  });
});
