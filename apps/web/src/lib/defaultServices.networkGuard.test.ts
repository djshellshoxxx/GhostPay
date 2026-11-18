import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createClient, fetchTransport, findChain, RpcHttpError, type RpcClient, type RpcTransport } from '@ghostpay/chain-adapters';
import type { WebNetworkSelection } from '@ghostpay/net-transport/browser';
import { createSelectedRpc } from './defaultServices';

const chain = findChain(84532)!;
const own: WebNetworkSelection = { rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'own-node', noticeAcknowledged: true };
const direct: WebNetworkSelection = { ...own, rpcMode: 'single', noticeAcknowledged: false };
const remote = 'https://provider.test/private-endpoint';

function mockTransport(): MockInstance<RpcTransport['send']> {
  return vi.spyOn(fetchTransport, 'send').mockImplementation((_url, text) => {
    const request = JSON.parse(text) as { readonly id: number; readonly method: string };
    const result: unknown = request.method === 'eth_chainId' ? '0x14a34'
      : request.method === 'eth_getLogs' ? []
      : request.method === 'eth_getBlockByNumber' ? null : '0x1';
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  });
}
afterEach(() => { vi.restoreAllMocks(); });

describe('TM14: a saved own-node policy guards already-created clients', () => {
  const operations: readonly [string, (client: RpcClient) => Promise<unknown>][] = [
    ['request', (client) => client.request('eth_getBalance', ['0x1111111111111111111111111111111111111111', 'latest'])],
    ['blockNumber', (client) => client.blockNumber()],
    ['getBlock', (client) => client.getBlock(1n)],
    ['getLogs', (client) => client.getLogs({ address: '0x1111111111111111111111111111111111111111', topics: [], fromBlock: 1n, toBlock: 1n })],
  ];
  it.each(operations)('refuses cached %s before dispatch when own-node replaces direct mode', async (_name, operation) => {
    const send = mockTransport();
    let selected = direct;
    const client = await createSelectedRpc(() => selected)(chain, remote);
    expect(send).toHaveBeenCalledTimes(1); // Initial chain-id verification, before the selection changes.
    selected = own;
    await expect(operation(client)).rejects.toMatchObject({ code: 'RPC_URL_REJECTED' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rechecks the policy after a retryable error and before reconnect traffic', async () => {
    const send = mockTransport();
    let selected = direct;
    const client = await createSelectedRpc(() => selected, (c, url, opts) => createClient(c, url, {
      ...opts,
      sleep: () => { selected = own; return Promise.resolve(); },
      random: () => 0,
    }))(chain, remote);
    send.mockRejectedValueOnce(new RpcHttpError(503));
    await expect(client.blockNumber()).rejects.toMatchObject({ code: 'RPC_URL_REJECTED' });
    // Handshake and first attempt were sent under direct mode. No reconnect or retry goes to the remote after own-node.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps a cached loopback client usable after acknowledged own-node mode is selected', async () => {
    const send = mockTransport();
    let selected = direct;
    const client = await createSelectedRpc(() => selected)(chain, 'https://localhost:8545');
    selected = own;
    expect(await client.blockNumber()).toBe(1n);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
