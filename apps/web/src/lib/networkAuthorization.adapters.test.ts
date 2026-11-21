import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEB_NETWORK_SELECTION_KEY } from '@ghostpay/net-transport/browser';
import { findChain } from '@ghostpay/chain-adapters';
import { EsploraClient } from '../features/btc/esplora';
import { createRpc as createSolanaRpc } from '../features/solana/rpc';
import { createRpc as createTronRpc } from '../features/tron/rpc';
import { createNetworkAuthority, type NetworkAuthority, type NetworkAuthorizationRequest } from './networkAuthorization';
import { createDefaultServices } from './defaultServices';
import { SETTINGS_KEY } from './settings';

const authorities: NetworkAuthority[] = [];
const servers: Server[] = [];
const ownNode = JSON.stringify({ rpcMode: 'own-node', rpcProfile: 'direct', relayerProfile: 'direct', noticeAcknowledged: true });
async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('loopback server unavailable');
  return `http://127.0.0.1:${String(address.port)}`;
}
afterEach(async () => {
  for (const authority of authorities.splice(0)) authority.dispose();
  vi.unstubAllGlobals();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => { server.close((error) => { if (error !== undefined) reject(error); else resolve(); }); });
  }
});

async function fixture() {
  const destinations: string[] = [];
  const server = createServer((request, response) => {
    destinations.push(request.url ?? '');
    const buffers: Buffer[] = [];
    request.on('data', (data: Buffer) => { buffers.push(data); });
    request.on('end', () => {
      if (request.url === '/esplora/blocks/tip/height') { response.end('42'); return; }
      if (request.url === '/tron/wallet/getnowblock') { response.setHeader('content-type', 'application/json'); response.end('{"number":42}'); return; }
      const body = JSON.parse(Buffer.concat(buffers).toString('utf8')) as { id: number; method: string };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: body.method === 'eth_chainId' ? '0x14a34' : request.url === '/evm' ? '0x2a' : 42 }));
    });
  });
  const base = await listen(server);
  const values = new Map([[WEB_NETWORK_SELECTION_KEY, ownNode], [SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': base + '/evm' } })]]);
  const authority = createNetworkAuthority({ storage: () => ({ getItem: (key) => values.get(key) ?? null }), requestTimeoutMs: 3000 });
  authorities.push(authority);
  return { base, destinations, values, authority };
}

describe('authorization composed with real browser adapters and native loopback HTTP', () => {
  const chains: readonly [string, Pick<NetworkAuthorizationRequest, 'action' | 'network' | 'match'>, string][] = [
    ['Bitcoin regtest', { action: 'btc-scan', network: { kind: 'btc', network: 'regtest' }, match: 'prefix' }, '/esplora'],
    ['Solana devnet', { action: 'solana-scan', network: { kind: 'solana', network: 'devnet' }, match: 'exact' }, '/solana'],
    ['TRON Nile', { action: 'tron-scan', network: { kind: 'tron', network: 'nile' }, match: 'prefix' }, '/tron'],
  ];
  it.each(chains)('%s sends only to the chosen node and cannot dispatch after revocation', async (_label, request, path) => {
    const h = await fixture(); const url = h.base + path;
    const grant = h.authority.authorize({ ...request, category: 'rpc', endpoint: url });
    const get = request.action === 'btc-scan'
      ? () => new EsploraClient({ baseUrl: url, fetchFn: grant.fetchFn }).tipHeight()
      : request.action === 'solana-scan'
        ? () => createSolanaRpc(url, grant.fetchFn).request('getSlot', [])
        : () => createTronRpc(url, grant.fetchFn).post('/wallet/getnowblock', {});
    expect(await get()).toEqual(request.action === 'tron-scan' ? { number: 42 } : 42);
    expect(h.destinations).toEqual([path + (request.action === 'btc-scan' ? '/blocks/tip/height' : request.action === 'tron-scan' ? '/wallet/getnowblock' : '')]);
    h.authority.invalidate(); await expect(get()).rejects.toThrow(); expect(h.destinations).toHaveLength(1);
    expect(() => h.authority.authorize({ ...request, category: 'rpc', endpoint: 'https://public-fallback.test' + path })).toThrow();
    expect(h.destinations).toHaveLength(1);
  });
  it('guards cached EVM clients when another tab replaces the chosen endpoint', async () => {
    const h = await fixture();
    vi.stubGlobal('localStorage', { getItem: (key: string) => h.values.get(key) ?? null });
    const services = createDefaultServices(); const authority = services.network!; authorities.push(authority);
    const url = h.base + '/evm'; const grant = authority.authorize({ action: 'scan', category: 'rpc', endpoint: url, network: { kind: 'evm', chainId: 84532 } });
    const client = await services.createRpc(findChain(84532)!, url, grant);
    expect(await client.blockNumber()).toBe(42n); expect(h.destinations).toEqual(['/evm', '/evm']);
    h.values.set(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': h.base + '/replaced' } }));
    await expect(client.blockNumber()).rejects.toMatchObject({ code: 'RPC_URL_REJECTED' });
    expect(() => authority.authorize({ action: 'scan', category: 'rpc', endpoint: url, network: { kind: 'evm', chainId: 84532 } })).toThrow();
    expect(h.destinations).toEqual(['/evm', '/evm']);
  });
  it('never follows a redirect to a second actual origin', async () => {
    let forbidden = 0;
    const forbiddenOrigin = await listen(createServer((_request, response) => { forbidden++; response.end('forbidden'); }));
    const origin = await listen(createServer((_request, response) => { response.writeHead(307, { location: forbiddenOrigin + '/private' }); response.end(); }));
    const authority = createNetworkAuthority({ storage: () => ({ getItem: () => null }) }); authorities.push(authority);
    const grant = authority.authorize({ action: 'merchant-profile', category: 'resource', endpoint: origin + '/profile' });
    await expect(grant.fetchFn(origin + '/profile', {})).rejects.toThrow();
    expect(forbidden).toBe(0);
  });
});
