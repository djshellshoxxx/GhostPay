import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ghostPayRouterAbi, loadDeployment } from '@ghostpay/chain-adapters';
import { encodeFunctionData, keccak256 } from 'viem';
import { createLogger } from './log.js';
import { buildChainClients } from './runtime.js';
import { CHAIN_ID, SWEEP_CONTRACT, testConfig } from './harness.testutil.js';

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

// --- N-07 remainder: manifest read-back at startup ---------------------------------------------------------------
const ROUTER = '0x1111111111111111111111111111111111111111';
const ANNOUNCER = '0x3333333333333333333333333333333333333333';
const FEE_RECIPIENT = '0x4444444444444444444444444444444444444444';
const ROUTER_CODE = '0x6001600155';
const RELAYER_CODE = '0x6002600255';
const ANNOUNCER_CODE = '0x6003600355';

function manifest() {
  return loadDeployment(
    JSON.stringify({
      chainId: CHAIN_ID,
      announcer: ANNOUNCER,
      router: ROUTER,
      sweepRelayer: SWEEP_CONTRACT,
      feeRecipient: FEE_RECIPIENT,
      feeBps: 25,
      deployTx: { router: `0x${'aa'.repeat(32)}`, sweepRelayer: `0x${'bb'.repeat(32)}` },
      solcVersion: '0.8.28',
      commit: 'c'.repeat(40),
      bytecodeHashes: { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE) },
      date: '2026-10-01T00:00:00Z',
    }),
    CHAIN_ID,
  );
}

interface Chainish {
  readonly relayerCode?: string;
  readonly feeRecipient?: string;
}

/** JSON-RPC node that answers the read-back (eth_call to the router, eth_getCode for the three contracts). */
function readbackRpc(c: Chainish = {}): Promise<string> {
  const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const sel = (n: 'FEE_RECIPIENT' | 'ANNOUNCER' | 'FEE_BPS'): string => encodeFunctionData({ abi: ghostPayRouterAbi, functionName: n });
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => (body += d.toString()));
      req.on('end', () => {
        const j = JSON.parse(body) as { id: number; method: string; params: unknown[] };
        let result: unknown = '0x0';
        if (j.method === 'eth_chainId') result = `0x${CHAIN_ID.toString(16)}`;
        else if (j.method === 'eth_call') {
          const data = (j.params[0] as { data: string }).data;
          result = data === sel('FEE_RECIPIENT') ? word(c.feeRecipient ?? FEE_RECIPIENT) : data === sel('ANNOUNCER') ? word(ANNOUNCER) : word('0x19');
        } else if (j.method === 'eth_getCode') {
          const a = String(j.params[0]).toLowerCase();
          result = a === ROUTER ? ROUTER_CODE : a === SWEEP_CONTRACT.toLowerCase() ? (c.relayerCode ?? RELAYER_CODE) : a === ANNOUNCER ? ANNOUNCER_CODE : '0x';
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result }));
      });
    });
    servers.push(s);
    s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${String((s.address() as AddressInfo).port)}`));
  });
}

describe('buildChainClients manifest read-back (N-07 remainder)', () => {
  const build = async (c: Chainish, withManifest = true) => {
    const url = await readbackRpc(c);
    const lines: string[] = [];
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url, ...(withManifest ? { manifest: manifest() } : {}) }] as never;
    const run = (): ReturnType<typeof buildChainClients> => buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5), createLogger((l) => lines.push(l)));
    return { run, lines };
  };

  it('starts when fee recipient, announcer, fee bps and code hashes all match the manifest', async () => {
    const { run, lines } = await build({});
    expect([...(await run()).keys()]).toEqual([CHAIN_ID]);
    expect(lines.map((l) => (JSON.parse(l) as { event: string }).event)).toContain('manifest_readback_ok');
  });

  it('fails closed when the sweep relayer runtime code hash differs from the manifest, naming the check and logging', async () => {
    const { run, lines } = await build({ relayerCode: '0x6009600955' });
    await expect(run()).rejects.toMatchObject({ code: 'MANIFEST_READBACK_FAILED', message: expect.stringContaining('relayer.codehash') as unknown });
    const events = lines.map((l) => JSON.parse(l) as { event: string; level: string; chainId?: number });
    expect(events).toContainEqual(expect.objectContaining({ event: 'manifest_readback_failed', level: 'error', chainId: CHAIN_ID }));
    expect(lines.join('')).not.toContain('6009600955');
  });

  it('fails closed when the router fee recipient differs from the manifest', async () => {
    const { run } = await build({ feeRecipient: '0x9999999999999999999999999999999999999999' });
    await expect(run()).rejects.toMatchObject({ code: 'MANIFEST_READBACK_FAILED', message: expect.stringContaining('router.FEE_RECIPIENT') as unknown });
  });

  it('without a manifest it only checks that code exists and says the deployment is unverified', async () => {
    const { run, lines } = await build({}, false);
    expect((await run()).size).toBe(1);
    expect(lines.map((l) => (JSON.parse(l) as { event: string }).event)).toContain('manifest_unverified');
  });
});

