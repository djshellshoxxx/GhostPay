import { findChain } from '@ghostpay/chain-adapters';
import { DEFAULT_WEB_NETWORK_SELECTION, WEB_NETWORK_SELECTION_KEY } from '@ghostpay/net-transport/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultServices } from './defaultServices';
import type { NetworkAuthority, NetworkAuthorization, NetworkAuthorizationRequest } from './networkAuthorization';
import { createPaymentExportRpc } from './paymentExportRpc';
import { SCAN_PRIVACY_KEY } from './scanPrivacy';
import { captureSessionGuard, clearSession, generateSession } from './session';
import { SETTINGS_KEY } from './settings';

const CHAIN = findChain(84532)!;
const RPC = 'https://provider.test/selected';
const PRIVATE_RPC = 'http://127.0.0.1:8545/private';
const ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const authorities: NetworkAuthority[] = [];
interface Message { readonly id: number; readonly method: string; readonly params: readonly unknown[] }
function message(init: RequestInit): Message { return JSON.parse(typeof init.body === 'string' ? init.body : '') as Message; }
function response(init: RequestInit, result?: string): Response {
  const request = message(init);
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: result ?? (request.method === 'eth_chainId' ? '0x14a34' : '0x') }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function harness(endpoint = RPC, assertScope: () => void = () => undefined) {
  generateSession();
  const guardSession = captureSessionGuard();
  const values = new Map([[SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': RPC }, rpcUrlsSecondary: { '84532': 'https://secondary.test/' } })]]);
  if (endpoint === PRIVATE_RPC) {
    values.set(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'local-proxy', requireProxy: true, endpoints: { '84532': PRIVATE_RPC } }));
    values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node', noticeAcknowledged: true }));
  }
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } });
  const fetcher = vi.fn((_url: string, init: RequestInit) => Promise.resolve(response(init)));
  vi.stubGlobal('fetch', fetcher);
  const defaults = createDefaultServices();
  const authority = defaults.network!;
  authorities.push(authority);
  const grants: NetworkAuthorization[] = [];
  const authorize = vi.fn((request: NetworkAuthorizationRequest) => {
    const grant = authority.authorize(request);
    grants.push(grant);
    return grant;
  });
  const services = { ...defaults, network: { ...authority, authorize } };
  const rpc = createPaymentExportRpc(CHAIN, endpoint, services, () => { guardSession(); assertScope(); });
  const requests = () => fetcher.mock.calls.map(([url, init]) => ({ url, method: message(init).method, params: message(init).params }));
  return { rpc, services, values, fetcher, authorize, grants, requests };
}

beforeEach(() => { clearSession(); });
afterEach(() => {
  for (const authority of authorities.splice(0)) authority.dispose();
  clearSession(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('explicit payment export RPC', () => {
  it('stays offline until requested, verifies the original chain, then disposes a fresh address-bound grant for each export', async () => {
    const h = harness();
    expect(h.authorize).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await h.rpc.request('eth_getCode', [ADDRESS.toUpperCase().replace('0X', '0x'), 'latest'])).toBe('0x');
      expect(h.grants[attempt]?.signal.aborted).toBe(true);
      expect(() => h.grants[attempt]?.assertCurrent()).toThrow();
    }
    expect(h.grants[0]).not.toBe(h.grants[1]);
    expect(h.authorize.mock.calls.map(([request]) => request)).toEqual(Array.from({ length: 2 }, () => ({
      action: 'payment-key-export', category: 'rpc', endpoint: RPC, network: { kind: 'evm', chainId: 84532 }, scope: ADDRESS,
    })));
    expect(h.requests()).toEqual(Array.from({ length: 2 }, () => [
      { url: RPC, method: 'eth_chainId', params: [] },
      { url: RPC, method: 'eth_getCode', params: [ADDRESS, 'latest'] },
    ]).flat());
  });

  it('keeps a cancelled private scan separate and uses only its original custom proxy under own-node policy', async () => {
    const h = harness(PRIVATE_RPC);
    const scan = h.services.network.authorize({ action: 'scan', category: 'rpc', endpoint: PRIVATE_RPC, network: { kind: 'evm', chainId: 84532 } });
    scan.cancel();
    expect(await h.rpc.request('eth_getCode', [ADDRESS, 'latest'])).toBe('0x');
    expect(scan.signal.aborted).toBe(true);
    expect(() => scan.assertCurrent()).toThrow();
    expect(h.requests()).toEqual([
      { url: PRIVATE_RPC, method: 'eth_chainId', params: [] },
      { url: PRIVATE_RPC, method: 'eth_getCode', params: [ADDRESS, 'latest'] },
    ]);
    expect(h.grants[1]?.signal.aborted).toBe(true);
  });

  it.each([
    ['eth_chainId', []], ['eth_getBalance', [ADDRESS, 'latest']], ['eth_sendRawTransaction', ['0x01']],
    ['eth_getCode', ['invalid', 'latest']], ['eth_getCode', [ADDRESS]],
    ['eth_getCode', [ADDRESS, '0x1']], ['eth_getCode', [ADDRESS, 'latest', 'extra']],
  ] as const)('rejects %s with invalid export parameters before issuing authority', async (method, params) => {
    const h = harness();
    await expect(h.rpc.request(method, params)).rejects.toThrow();
    expect(h.authorize).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('refuses an already cancelled operation or replaced seller before issuing authority', async () => {
    const h = harness();
    const controller = new AbortController(); controller.abort();
    await expect(h.rpc.request('eth_getCode', [ADDRESS, 'latest'], controller.signal)).rejects.toThrow();
    generateSession();
    await expect(h.rpc.request('eth_getCode', [ADDRESS, 'latest'])).rejects.toThrow();
    expect(h.authorize).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('never falls back after an endpoint change before the storage event or a chain mismatch', async () => {
    const h = harness();
    h.values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://replacement.test/' } }));
    await expect(h.rpc.request('eth_getCode', [ADDRESS, 'latest'])).rejects.toThrow();
    expect(h.fetcher).not.toHaveBeenCalled();
    h.values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': RPC } }));
    h.fetcher.mockImplementation((_url, init) => Promise.resolve(response(init, '0x1')));
    await expect(h.rpc.request('eth_getCode', [ADDRESS, 'latest'])).rejects.toThrow();
    expect(h.requests()).toEqual([{ url: RPC, method: 'eth_chainId', params: [] }]);
    expect(h.grants.at(-1)?.signal.aborted).toBe(true);
  });

  it.each(['eth_chainId', 'eth_getCode'])('aborts a pending %s, discards its late response, and disposes authority', async (pausedMethod) => {
    const h = harness();
    const pendingResponse = deferred<Response>();
    const started = deferred<RequestInit>();
    h.fetcher.mockImplementation((_url, init) => {
      if (message(init).method === pausedMethod) { started.resolve(init); return pendingResponse.promise; }
      return Promise.resolve(response(init));
    });
    const controller = new AbortController();
    const pending = h.rpc.request('eth_getCode', [ADDRESS, 'latest'], controller.signal);
    const rejected = expect(pending).rejects.toThrow();
    const init = await started.promise;
    controller.abort();
    await rejected;
    expect(init.signal?.aborted).toBe(true);
    expect(h.grants[0]?.signal.aborted).toBe(true);
    pendingResponse.resolve(response(init));
    await Promise.resolve();
    expect(h.requests().map((request) => request.method)).toEqual(pausedMethod === 'eth_chainId' ? ['eth_chainId'] : ['eth_chainId', 'eth_getCode']);
  });

  it.each(['eth_chainId', 'eth_getCode'])('rechecks scan scope after awaiting %s and does not return stale evidence', async (changedAfter) => {
    let current = true;
    const h = harness(RPC, () => { if (!current) throw new Error('scan scope changed'); });
    h.fetcher.mockImplementation((_url, init) => {
      if (message(init).method === changedAfter) current = false;
      return Promise.resolve(response(init));
    });
    await expect(h.rpc.request('eth_getCode', [ADDRESS, 'latest'])).rejects.toThrow();
    expect(h.grants[0]?.signal.aborted).toBe(true);
    expect(h.requests().map((request) => request.method)).toEqual(changedAfter === 'eth_chainId' ? ['eth_chainId'] : ['eth_chainId', 'eth_getCode']);
  });

  it('copies the requested address before asynchronous client creation', async () => {
    const h = harness();
    const args = [ADDRESS, 'latest'];
    const pending = h.rpc.request('eth_getCode', args);
    args[0] = '0x1111111111111111111111111111111111111111';
    expect(await pending).toBe('0x');
    expect(h.requests().at(-1)?.params).toEqual([ADDRESS, 'latest']);
    expect(h.authorize.mock.calls[0]?.[0].scope).toBe(ADDRESS);
  });
});
