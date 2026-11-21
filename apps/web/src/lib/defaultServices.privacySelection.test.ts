import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, fetchTransport, findChain, RpcHttpError } from '@ghostpay/chain-adapters';
import { createSelectedRpc, loadNetworkSelection } from './defaultServices';

const direct = { rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'single', noticeAcknowledged: false };
const own = { ...direct, rpcMode: 'own-node', noticeAcknowledged: true };
const storage = (raw: string | null): Storage => ({ getItem: () => raw } as unknown as Storage);
afterEach(() => { vi.restoreAllMocks(); });

describe('TM14 stored network policy fails closed without provider substitution', () => {
  it('keeps direct as the fresh-install default and accepts an explicit acknowledged selection', () => {
    expect(loadNetworkSelection(storage(null))).toEqual(direct);
    expect(loadNetworkSelection(storage(JSON.stringify(direct)))).toEqual(direct);
    expect(loadNetworkSelection(storage(JSON.stringify(own)))).toEqual(own);
  });

  it.each(['{broken', 'null', '"fixture-value"', '[]', '{"rpcMode":null}', '{"rpcProfile":null}', '{"noticeAcknowledged":null}', '{"rpcMode":"unexpected"}', '{"rpcMode":"own-node","noticeAcknowledged":true,"unknown":"fixture-value"}'])('refuses malformed persisted selection %s instead of selecting direct', (raw) => {
    expect(() => loadNetworkSelection(storage(raw))).toThrow(/network profile/i);
    try { loadNetworkSelection(storage(raw)); } catch (error) { expect(String(error)).not.toContain('fixture-value'); }
  });

  it('refuses an unreadable stored selection instead of choosing a provider policy', () => {
    expect(() => loadNetworkSelection({ getItem: () => { throw new Error('fixture-private-path'); } })).toThrow(/network profile/i);
  });

  it.each(['rpcProfile', 'relayerProfile', 'rpcMode', 'noticeAcknowledged'])('refuses a truncated saved policy missing %s', (missing) => {
    const complete = { ...own, rpcProfile: 'tor-browser' };
    const truncated = Object.fromEntries(Object.entries(complete).filter(([key]) => key !== missing));
    expect(() => loadNetworkSelection(storage(JSON.stringify(truncated)))).toThrow(/invalid or unavailable/i);
  });

  it.each([{}, { noticeAcknowledged: true }])('refuses an incomplete saved policy %j', (partial) => {
    expect(() => loadNetworkSelection(storage(JSON.stringify(partial)))).toThrow(/invalid or unavailable/i);
  });

  it.each(['own-node', 'tor-browser'])('requires acknowledgement of a saved %s selection instead of silently using direct', (profile) => {
    const saved = profile === 'own-node' ? { ...direct, rpcMode: profile } : { ...direct, rpcProfile: profile };
    expect(() => loadNetworkSelection(storage(JSON.stringify(saved)))).toThrow(/acknowledge|notice/i);
  });

  it('blocks previously cached clients immediately after profile storage becomes corrupt', async () => {
    let raw: string | null = JSON.stringify(direct);
    const store = { getItem: () => raw } as unknown as Storage;
    const send = vi.spyOn(fetchTransport, 'send').mockImplementation((_url, text) => {
      const request = JSON.parse(text) as { id: number; method: string };
      return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'eth_chainId' ? '0x14a34' : '0x1' }));
    });
    const client = await createSelectedRpc(() => loadNetworkSelection(store))(findChain(84532)!, 'https://rpc.example/');
    expect(send).toHaveBeenCalledTimes(1);
    raw = '{broken';
    await expect(client.blockNumber()).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    raw = JSON.stringify(direct); // Explicitly repaired settings allow the same endpoint again.
    expect(await client.blockNumber()).toBe(1n);
    expect(send).toHaveBeenCalledTimes(3); // A policy failure dirties the client; restoring it rechecks the chain first.
  });

  it('blocks the retry and reconnect when storage becomes unreadable after the first HTTP attempt', async () => {
    let denied = false;
    const store = { getItem: () => { if (denied) throw new Error('fixture-value'); return JSON.stringify(direct); } } as unknown as Storage;
    const send = vi.spyOn(fetchTransport, 'send').mockImplementation((_url, text) => {
      const request = JSON.parse(text) as { id: number };
      return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x14a34' }));
    });
    const client = await createSelectedRpc(() => loadNetworkSelection(store), (chain, url, options) => createClient(chain, url, {
      ...options, sleep: () => { denied = true; return Promise.resolve(); }, random: () => 0,
    }))(findChain(84532)!, 'https://rpc.example/');
    send.mockRejectedValueOnce(new RpcHttpError(503));
    await expect(client.blockNumber()).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
