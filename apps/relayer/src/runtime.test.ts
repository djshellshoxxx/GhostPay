import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChainClients } from './runtime.js';
import { testConfig } from './harness.testutil.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function fakeRpc(chainId: number, code = '0x6001'): Promise<string> {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const j = JSON.parse(body) as { id: number; method: string };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: j.method === 'eth_chainId' ? `0x${chainId.toString(16)}` : j.method === 'eth_getCode' ? code : '0x0' }));
      });
    });
    servers.push(s);
    s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${String((s.address() as AddressInfo).port)}`));
  });
}

describe('buildChainClients', () => {
  it('verifies the endpoint chain id and builds a client per chain', async () => {
    const url = await fakeRpc(11155111);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url }] as never;
    const clients = await buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5));
    expect([...clients.keys()]).toEqual([11155111]);
    expect(clients.get(11155111)?.relayerAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('builds the development chain descriptor for chain 31337', async () => {
    const url = await fakeRpc(31337);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), chainId: 31337, rpcUrl: url }] as never;
    const clients = await buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5));
    expect(clients.get(31337)?.chainId).toBe(31337);
  });

  it('refuses an endpoint on the wrong chain', async () => {
    const url = await fakeRpc(1);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url }] as never;
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
  });

  it('N-07: refuses a sweep relayer address without contract code', async () => {
    const url = await fakeRpc(11155111, '0x');
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url }] as never;
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toMatchObject({ code: 'RPC_FAILURE' });
  });
});
