import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { createPublicClient, createTestClient, http, keccak256, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { createViemChainReader, type ViemLike } from './viem-reader.js';
import { verifyCodeHashes } from './codehash.js';
import { parseManifest } from './manifest.js';

describe('viem chain reader (stub)', () => {
  const calls: string[] = [];
  const client: ViemLike = {
    getCode: ({ address }) => {
      calls.push(`code:${address}`);
      return Promise.resolve(address.endsWith('0') ? undefined : '0x6001');
    },
    call: ({ to }) => Promise.resolve(to.endsWith('0') ? {} : { data: '0xaa' }),
    getBlockNumber: () => Promise.resolve(42n),
    request: ({ params }) => {
      calls.push(`logs:${params[0].fromBlock}-${params[0].toBlock}:${String(params[0].topics?.length)}`);
      return Promise.resolve([{ address: params[0].address, topics: ['0x01'], data: '0x', logIndex: '0x2', blockNumber: '0x5', transactionHash: '0x07' }]);
    },
  };
  const r = createViemChainReader(() => client);
  const a0 = '0x0000000000000000000000000000000000000010' as const;
  const a1 = '0x0000000000000000000000000000000000000011' as const;
  it('maps results and defaults', async () => {
    expect(await r.getCode(31337, a0)).toBe('0x');
    expect(await r.getCode(31337, a1)).toBe('0x6001');
    expect(await r.call(31337, a0, '0x')).toBe('0x');
    expect(await r.call(31337, a1, '0x')).toBe('0xaa');
    expect(await r.getBlockNumber(84532)).toBe(42n);
    const logs = await r.getLogs(31337, { address: a1, topics: [null, '0x01'], fromBlock: 1n, toBlock: 255n });
    expect(logs[0]).toMatchObject({ logIndex: 2, blockNumber: 5n });
    await r.getLogs(31337, { address: a1, fromBlock: 1n, toBlock: 2n });
    expect(calls).toContain('logs:0x1-0xff:2');
    expect(calls).toContain('logs:0x1-0x2:undefined');
  });
  it('checks the chain allowlist before touching the client', async () => {
    let touched = false;
    const guarded = createViemChainReader(() => {
      touched = true;
      return client;
    });
    await expect(guarded.getCode(1, a1)).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
    expect(touched).toBe(false);
  });
});

/* EP-GEN-4 against a real local node: anvil_setCode, no deployments anywhere else. */
const anvilBin = process.env['ANVIL_BIN'] ?? '/home/user/tools/anvil';
let proc: ChildProcess | undefined;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

async function startAnvil(): Promise<string | undefined> {
  const port = await freePort();
  try {
    proc = spawn(anvilBin, ['--port', String(port), '--host', '127.0.0.1', '--chain-id', '31337', '--silent'], { stdio: 'ignore' });
  } catch {
    return undefined;
  }
  proc.on('error', () => undefined);
  const url = `http://127.0.0.1:${String(port)}`;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
      if (res.ok) return url;
    } catch {
      /* not up yet */
    }
  }
  return undefined;
}

afterAll(() => {
  proc?.kill();
});

describe('code hash check against anvil (EP-GEN-4)', () => {
  it('accepts the pinned code and refuses a wrong one', async (ctx) => {
    const url = await startAnvil();
    if (url === undefined) {
      if (process.env['REQUIRE_ANVIL'] === '1') throw new Error('anvil required but not available');
      ctx.skip();
      return;
    }
    const pub = createPublicClient({ chain: foundry, transport: http(url) });
    const test = createTestClient({ chain: foundry, mode: 'anvil', transport: http(url) });
    const target = '0x00000000000000000000000000000000000c0de1';
    const good = '0x600160005260206000f3' as Hex;
    await test.setCode({ address: target, bytecode: good });
    const reader = createViemChainReader(() => pub);
    const entry = parseManifest({
      schema: 1,
      retrieved: '2026-10-21',
      entries: [{ route: 'mock-pool', chainId: 31337, status: 'verified', contracts: { c: target }, codeHashes: { c: keccak256(good) }, sources: ['local'] }],
    }).entries[0]!;
    await expect(verifyCodeHashes(reader, entry)).resolves.toBeUndefined();
    await test.setCode({ address: target, bytecode: '0x600260005260206000f3' });
    await expect(verifyCodeHashes(reader, entry)).rejects.toMatchObject({ code: 'CODE_HASH_MISMATCH' });
    await test.setCode({ address: target, bytecode: '0x' });
    await expect(verifyCodeHashes(reader, entry)).rejects.toMatchObject({ code: 'CODE_HASH_MISMATCH' });
    expect(await reader.getBlockNumber(31337)).toBeGreaterThanOrEqual(0n);
  }, 30_000);
});

describe('egress (EP-GEN-2)', () => {
  const root = new URL('.', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(root);
  it('no source file references global network APIs or process.env', () => {
    const banned = [/\bglobalThis\.fetch\b/, /(?<![.\w])fetch\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /sendBeacon/, /process\.env/, /\bimport\s*\(\s*['"]node:(http|https|net|dgram)/];
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const b of banned) expect(b.test(text), `${f} matches ${String(b)}`).toBe(false);
    }
    expect(files.length).toBeGreaterThan(10);
  });
});
