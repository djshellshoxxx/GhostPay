import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { keccak256, toBytes } from 'viem/utils';
import { CANONICAL_ANNOUNCER, validateManifest, type Address, type DeploymentManifest } from '@ghostpay/chain-adapters';
import { buildChainClients, buildRelayer, buildSourceClients } from './runtime.js';
import { FakeChain, testConfig } from './harness.testutil.js';
import { createLogger } from './log.js';
import { Metrics } from './metrics.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

type RpcRead = (method: string, params: readonly unknown[]) => unknown;
function fakeRpc(chainId: number, read: RpcRead = () => '0x0'): Promise<string> {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const j = JSON.parse(body) as { id: number; method: string; params: readonly unknown[] };
        res.setHeader('content-type', 'application/json');
        try {
          const result = j.method === 'eth_chainId' ? `0x${chainId.toString(16)}` : read(j.method, j.params);
          res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result }));
        } catch {
          res.statusCode = 503;
          res.end('{}');
        }
      });
    });
    servers.push(s);
    s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${String((s.address() as AddressInfo).port)}`));
  });
}

function readbackFixture(chainId = 11155111, announcer: Address = CANONICAL_ANNOUNCER): { manifest: DeploymentManifest; read: RpcRead } {
  const codes = { router: '0x6001600155', sweepRelayer: '0x6002600255', announcer: '0x6003600355' } as const;
  const manifest = validateManifest({
    chainId, announcer,
    router: '0x00000000000000000000000000000000000000a1',
    sweepRelayer: '0x00000000000000000000000000000000000000a2',
    feeRecipient: '0x00000000000000000000000000000000000000a3',
    feeBps: 25, solcVersion: '0.8.28', commit: 'a'.repeat(40), date: '2026-11-19T00:00:00Z',
    deployTx: { router: `0x${'11'.repeat(32)}`, sweepRelayer: `0x${'22'.repeat(32)}` },
    bytecodeHashes: { router: keccak256(codes.router), sweepRelayer: keccak256(codes.sweepRelayer) },
  }, chainId);
  const code: Record<string, string> = {
    [manifest.router.toLowerCase()]: codes.router,
    [manifest.sweepRelayer.toLowerCase()]: codes.sweepRelayer,
    [manifest.announcer.toLowerCase()]: codes.announcer,
  };
  const word = (v: string): string => `0x${v.slice(2).toLowerCase().padStart(64, '0')}`;
  const calls: Record<string, string> = {
    [keccak256(toBytes('FEE_RECIPIENT()')).slice(0, 10)]: word(manifest.feeRecipient),
    [keccak256(toBytes('ANNOUNCER()')).slice(0, 10)]: word(manifest.announcer),
    [keccak256(toBytes('FEE_BPS()')).slice(0, 10)]: word('0x19'),
  };
  const read: RpcRead = (method, params) => {
    if (method === 'eth_getCode') return code[(params[0] as string).toLowerCase()] ?? '0x';
    if (method === 'eth_call') return calls[(params[0] as { data: string }).data] ?? '0x';
    throw new Error('unexpected readback method');
  };
  return { manifest, read };
}

describe('buildChainClients', () => {
  it('builds only requested source clients and checks both configured chain identities', async () => {
    expect(await buildSourceClients(testConfig())).toEqual(new Map());
    const primary = await fakeRpc(11155111); const secondary = await fakeRpc(11155111);
    const config = testConfig({ allowInsecureLocalhostRpc: true }); const chain = config.chains[0]!;
    const sources = await buildSourceClients({ ...config, chains: [{ ...chain, rpcUrl: primary, secondaryRpcUrl: secondary }] });
    expect(sources.get(11155111)?.primary.chainId).toBe(11155111); expect(sources.get(11155111)?.secondary?.chainId).toBe(11155111);
    const wrong = await fakeRpc(1);
    await expect(buildSourceClients({ ...config, chains: [{ ...chain, rpcUrl: primary, secondaryRpcUrl: wrong }] })).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
  });
  it('verifies the endpoint chain id and builds a client per chain', async () => {
    const url = await fakeRpc(11155111);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url }] as never;
    const clients = await buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5));
    expect([...clients.keys()]).toEqual([11155111]);
    expect(clients.get(11155111)?.relayerAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('measures configured RPC HTTP fetches without recording endpoint identifiers', async () => {
    const url = await fakeRpc(11155111);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...(cfg.chains[0] as object), rpcUrl: url }] as never;
    const metrics = new Metrics();
    const clients = await buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5), metrics);
    expect(await clients.get(11155111)?.getGasPrice()).toBe(0n);
    expect(metrics.render()).toContain('relayer_rpc_latency_seconds_count{chain_id="11155111"} 1');
    expect(metrics.render()).not.toContain(url);
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

  it.each([
    [11155111, CANONICAL_ANNOUNCER],
    [31337, '0x0000000000000000000000000000000000000a11'],
  ] as const)('checks every manifest value through both explicitly configured providers on chain %i', async (chainId, announcer) => {
    const { manifest, read } = readbackFixture(chainId, announcer);
    const primaryReads: unknown[] = []; const secondaryReads: unknown[] = [];
    const primary = await fakeRpc(chainId, (method, params) => { primaryReads.push([method, params]); return read(method, params); });
    const secondary = await fakeRpc(chainId, (method, params) => { secondaryReads.push([method, params]); return read(method, params); });
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...cfg.chains[0]!, chainId, rpcUrl: primary, secondaryRpcUrl: secondary, manifest }];
    const clients = await buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5));
    expect([...clients.keys()]).toEqual([chainId]);
    expect(primaryReads).toHaveLength(6);
    expect(secondaryReads).toEqual(primaryReads);
  });

  it.each(['missing code', 'unavailable'] as const)('refuses startup when the configured secondary reports %s', async (failure) => {
    const { manifest, read } = readbackFixture();
    const primary = await fakeRpc(manifest.chainId, read);
    const secondary = await fakeRpc(manifest.chainId, (method, params) => {
      if (failure === 'unavailable') throw new Error('fixture RPC unavailable');
      return method === 'eth_getCode' ? '0x' : read(method, params);
    });
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...cfg.chains[0]!, rpcUrl: primary, secondaryRpcUrl: secondary, manifest }];
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toMatchObject({ code: 'RPC_FAILURE' });
  });

  it('refuses startup when the configured secondary is on a different chain', async () => {
    const { manifest, read } = readbackFixture();
    const primary = await fakeRpc(manifest.chainId, read);
    const secondary = await fakeRpc(1, read);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...cfg.chains[0]!, rpcUrl: primary, secondaryRpcUrl: secondary, manifest }];
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
  });

  it('refuses startup when the manifest and primary agree on a noncanonical known-chain announcer', async () => {
    const { manifest, read } = readbackFixture(11155111, '0x0000000000000000000000000000000000000a11');
    const primary = await fakeRpc(manifest.chainId, read);
    const cfg = testConfig({ allowInsecureLocalhostRpc: true });
    const chains = [{ ...cfg.chains[0]!, rpcUrl: primary, manifest }];
    await expect(buildChainClients({ ...cfg, chains }, new Uint8Array(32).fill(5))).rejects.toThrow(/canonical announcer/);
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

describe('state journal wiring', () => {
  it('opens an in-memory journal for state.ephemeral and a locked file journal for state.file', async () => {
    const { mkdtempSync, rmSync, existsSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { openJournal } = await import('./runtime.js');
    const dir = mkdtempSync(join(tmpdir(), 'relayer-rt-'));
    try {
      expect(openJournal(testConfig(), Date.now).lock).toBeUndefined();
      const stateFile = join(dir, 'state.json');
      const relayer = await buildRelayer({
        config: testConfig({ stateFile }),
        hotKey: new Uint8Array(32).fill(3),
        quoteSecret: new Uint8Array(32).fill(9),
        logger: createLogger(() => undefined),
        clients: new Map([[11155111, new FakeChain()]]),
      });
      expect(existsSync(`${stateFile}.lock`)).toBe(true);
      // A second writer on the same state file is refused while the first holds a fresh lock.
      writeFileSync(`${stateFile}.lock`, JSON.stringify({ pid: process.pid + 1, host: 'other', token: 'f'.repeat(32), beatMs: Date.now() }));
      expect(() => openJournal(testConfig({ stateFile }), Date.now)).toThrow(/locked by another/);
      relayer.dispose();
      expect(existsSync(`${stateFile}.lock`)).toBe(true); // not ours any more, so dispose leaves it
      rmSync(`${stateFile}.lock`);
      writeFileSync(stateFile, '{"version":9}');
      expect(() => openJournal(testConfig({ stateFile }), Date.now)).toThrow(/state file is invalid/);
      expect(existsSync(`${stateFile}.lock`)).toBe(false); // a failed open releases the lock it took
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('re-review M1: retries transient heartbeat failures, then reports the lock lost before it can go stale', async () => {
    const { vi } = await import('vitest');
    const { mkdirSync, mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'relayer-rt-'));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let clock = 1_000_000;
    let lostCalls = 0;
    const lines: string[] = [];
    try {
      const stateFile = join(dir, 'state.json');
      const relayer = await buildRelayer({
        config: testConfig({ stateFile }),
        hotKey: new Uint8Array(32).fill(3),
        quoteSecret: new Uint8Array(32).fill(9),
        logger: createLogger((l) => lines.push(l)),
        clients: new Map([[11155111, new FakeChain()]]),
        now: () => clock,
        onLockLost: () => { lostCalls += 1; },
      });
      rmSync(`${stateFile}.lock`);
      mkdirSync(`${stateFile}.lock`); // heartbeat now fails with an I/O error
      clock += 10_000;
      vi.advanceTimersByTime(10_000);
      clock += 10_000;
      vi.advanceTimersByTime(10_000);
      expect(lostCalls).toBe(0); // 20 s without a beat: still retrying
      expect(lines.join('\n')).toContain('state_lock_heartbeat_failed');
      expect(relayer.metrics.render()).toContain('relayer_state_lock_heartbeat_failures_total 2');
      clock += 10_000;
      vi.advanceTimersByTime(10_000);
      expect(lostCalls).toBe(1); // 30 s: given up before another process could take the stale lock
      vi.advanceTimersByTime(30_000);
      expect(lostCalls).toBe(1); // reported once
      relayer.dispose();
    } finally {
      vi.useRealTimers();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stops admitting work when the lock heartbeat finds the lock taken over', async () => {
    const { vi } = await import('vitest');
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'relayer-rt-'));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const lines: string[] = [];
    try {
      const stateFile = join(dir, 'state.json');
      const relayer = await buildRelayer({
        config: testConfig({ stateFile }),
        hotKey: new Uint8Array(32).fill(3),
        quoteSecret: new Uint8Array(32).fill(9),
        logger: createLogger((l) => lines.push(l)),
        clients: new Map([[11155111, new FakeChain()]]),
      });
      vi.advanceTimersByTime(10_000); // own heartbeat: fine
      expect(relayer.service.health().status).toBe('ok');
      writeFileSync(`${stateFile}.lock`, JSON.stringify({ pid: process.pid + 1, host: 'other', token: 'f'.repeat(32), beatMs: Date.now() }));
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      expect(lines.join('\n')).toContain('state_lock_lost');
      expect(relayer.service.health().status).toBe('shutting_down');
      relayer.dispose();
    } finally {
      vi.useRealTimers();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
