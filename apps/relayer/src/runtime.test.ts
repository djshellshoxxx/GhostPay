import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChainClients, buildRelayer } from './runtime.js';
import { FakeChain, testConfig } from './harness.testutil.js';
import { createLogger } from './log.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function fakeRpc(chainId: number): Promise<string> {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const j = JSON.parse(body) as { id: number; method: string };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: j.method === 'eth_chainId' ? `0x${chainId.toString(16)}` : '0x0' }));
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

  it('fails closed when the chain does not match the manifest (on-chain read-back, CHAIN-ADAPTERS-05)', async () => {
    const url = await fakeRpc(11155111); // answers every eth_call/eth_getCode with 0x0: cannot confirm any manifest field
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const manifest = {
      chainId: 11155111,
      announcer: '0x55649e01b5df198d18d95b5cc5051630cfd45564',
      router: '0x00000000000000000000000000000000000000a1',
      sweepRelayer: '0x00000000000000000000000000000000000000a2',
      feeRecipient: '0x00000000000000000000000000000000000000a3',
      feeBps: 25,
      bytecodeHashes: { router: `0x${'33'.repeat(32)}`, sweepRelayer: `0x${'44'.repeat(32)}` },
    };
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url, manifest }] as never;
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toBeDefined();
  });

  it('refuses an endpoint on the wrong chain', async () => {
    const url = await fakeRpc(1);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url }] as never;
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
  });
});

describe('buildRelayer key separation', () => {
  it('refuses a quote secret equal to or prefixed by the hot signing key', async () => {
    const hotKey = new Uint8Array(32).fill(3);
    const shared = new Map([[11155111, new FakeChain()]]);
    const common = { config: testConfig(), hotKey, logger: createLogger(() => undefined), clients: shared };
    await expect(buildRelayer({ ...common, quoteSecret: hotKey })).rejects.toThrow(/must not equal or begin with the hot key/);
    await expect(buildRelayer({ ...common, quoteSecret: new Uint8Array(64).fill(0).map((x, i) => i < 32 ? 3 : x) })).rejects.toThrow(/must not equal or begin with the hot key/);
  });
});
