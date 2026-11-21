import { afterEach, describe, expect, it, vi } from 'vitest';
import { findChain } from '@ghostpay/chain-adapters';
import { createDefaultServices } from './defaultServices';
import { SETTINGS_KEY } from './settings';
import type { NetworkAuthority } from './networkAuthorization';

const authorities: NetworkAuthority[] = [];
function servicesWithStorage(url = 'https://provider.test/rpc') {
  const values = new Map([[SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': url } })]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null });
  const services = createDefaultServices();
  if (services.network !== undefined) authorities.push(services.network);
  return { services, values };
}
afterEach(() => { for (const authority of authorities.splice(0)) authority.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('production service authorization boundary', () => {
  it('does not contact a configured provider without an operation authorization', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetcher);
    const { services } = servicesWithStorage();
    await expect(services.fetchFn('https://provider.test/api', {})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not create an RPC client just because an endpoint was configured', async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as { id: number };
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x14a34' })));
    });
    vi.stubGlobal('fetch', fetcher);
    const { services } = servicesWithStorage();
    await expect(services.createRpc(findChain(84532)!, 'https://provider.test/rpc')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks the current exact endpoint on cached clients and prevents a new stale endpoint grant', async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as { id: number; method: string };
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: body.method === 'eth_chainId' ? '0x14a34' : '0x1' })));
    });
    vi.stubGlobal('fetch', fetcher);
    const { services, values } = servicesWithStorage();
    const request = { action: 'scan', category: 'rpc', endpoint: 'https://provider.test/rpc', network: { kind: 'evm', chainId: 84532 } } as const;
    const grant = services.network!.authorize(request);
    const client = await services.createRpc(findChain(84532)!, request.endpoint, grant);
    expect(await client.blockNumber()).toBe(1n);
    values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://replacement.test/rpc' } }));
    await expect(client.blockNumber()).rejects.toThrow();
    expect(() => services.network!.authorize(request)).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('revokes between retry attempts without reconnecting or trying another provider', async () => {
    vi.useFakeTimers();
    const { services, values } = servicesWithStorage();
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as { id: number; method: string };
      if (body.method !== 'eth_chainId') {
        values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://replacement.test/rpc' } }));
        return Promise.resolve(new Response('temporary outage', { status: 503 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x14a34' })));
    });
    vi.stubGlobal('fetch', fetcher);
    const grant = services.network!.authorize({ action: 'scan', category: 'rpc', endpoint: 'https://provider.test/rpc', network: { kind: 'evm', chainId: 84532 } });
    const client = await services.createRpc(findChain(84532)!, 'https://provider.test/rpc', grant);
    const pending = client.blockNumber(); const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => url === 'https://provider.test/rpc')).toBe(true);
  });

  it('does not allow a balance-only client to submit a transaction', async () => {
    const { services } = servicesWithStorage();
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as { id: number };
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x14a34' })));
    });
    vi.stubGlobal('fetch', fetcher);
    const grant = services.network!.authorize({ action: 'sweep-balance', category: 'rpc', endpoint: 'https://provider.test/rpc', network: { kind: 'evm', chainId: 84532 }, balance: { owner: '0x1111111111111111111111111111111111111111', token: 'native' } });
    const client = await services.createRpc(findChain(84532)!, 'https://provider.test/rpc', grant);
    await expect(client.request('eth_sendRawTransaction', ['0x01'])).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
