// @vitest-environment node
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encodeFunctionData } from 'viem/utils';
import { assertRegistryDeployed, erc6538RegistryAbi, buildLookupCall, buildRegisterKeysCall, ERC6538_REGISTRY_ADDRESS, lookupMetaAddress } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Differential test: our calldata/decoding vs the CC0 reference ERC6538Registry (ref/ERC6538Registry.sol, copied
// unmodified from the ethereum/ERCs repo) compiled locally and run on a local anvil. The reference pins
// `pragma solidity 0.8.23`; the test compiles a temp copy with the pragma relaxed to the local solc.
// Skips when anvil/solc are missing unless REQUIRE_ANVIL=1.
const ANVIL = process.env['ANVIL_BIN'] ?? (existsSync('/root/.foundry/bin/anvil') ? '/root/.foundry/bin/anvil' : 'anvil');
const SOLC = process.env['SOLC_BIN'] ?? '/home/user/tools/solc';
const REF = resolve(import.meta.dirname, 'ref/ERC6538Registry.sol');
const required = process.env['REQUIRE_ANVIL'] === '1';
const available = (!ANVIL.includes('/') || existsSync(ANVIL)) && existsSync(SOLC) && existsSync(REF);

function compileRuntime(): string {
  const dir = mkdtempSync(join(tmpdir(), 'erc6538-'));
  const src = join(dir, 'ERC6538Registry.sol');
  writeFileSync(src, readFileSync(REF, 'utf8').replace('pragma solidity 0.8.23;', 'pragma solidity ^0.8.23;'));
  const out = execFileSync(SOLC, ['--bin-runtime', '--evm-version', 'cancun', '--optimize', src], { encoding: 'utf8' });
  const m = /ERC6538Registry =======\s*Binary of the runtime part:\s*\n([0-9a-f]+)/.exec(out);
  if (m?.[1] === undefined) throw new Error('could not compile reference registry');
  return `0x${m[1]}`;
}

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((ok, bad) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '31337'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => { bad(new Error('anvil did not start')); }, 20_000);
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /Listening on ([0-9.]+:[0-9]+)/.exec(buf);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        ok({ proc, url: `http://${m[1]}` });
      }
    });
    proc.once('error', bad);
  });
}

describe('ERC-6538 helpers vs reference registry (anvil)', () => {
  it('has anvil and solc when REQUIRE_ANVIL=1', () => {
    if (required) expect(available, 'REQUIRE_ANVIL=1 but anvil, solc or the reference source is missing').toBe(true);
  });

  describe.skipIf(!available)('on anvil', () => {
    let proc: ChildProcess | undefined;
    let url = '';
    let from = '';
    const rpc = async (method: string, params: readonly unknown[]): Promise<unknown> => {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (j.error !== undefined) throw new Error(j.error.message);
      return j.result;
    };
    const client = { request: rpc };
    type Receipt = { status: string; logs: { address: string; topics: string[] }[] };
    const receiptOf = async (hash: string): Promise<Receipt> => {
      for (let i = 0; i < 100; i++) {
        const r = (await rpc('eth_getTransactionReceipt', [hash])) as Receipt | null;
        if (r !== null) return r;
        await new Promise((res) => setTimeout(res, 50));
      }
      throw new Error('no receipt');
    };

    beforeAll(async () => {
      const a = await startAnvil();
      proc = a.proc;
      url = a.url;
      from = ((await rpc('eth_accounts', [])) as string[])[0] as string;
    }, 60_000);

    afterAll(() => {
      proc?.kill('SIGKILL');
    });

    it('fails closed before the registry exists', async () => {
      await expect(assertRegistryDeployed(client)).rejects.toThrow(/CHAIN_DISABLED/);
      await expect(lookupMetaAddress(client, from)).rejects.toThrow(/CHAIN_DISABLED/);
    });

    it('register then look up round-trips through the reference contract', async () => {
      await rpc('anvil_setCode', [ERC6538_REGISTRY_ADDRESS, compileRuntime()]);
      await assertRegistryDeployed(client);
      expect(await lookupMetaAddress(client, from)).toBeUndefined();

      const meta = encodeMetaAddress(generateKeySet());
      const call = buildRegisterKeysCall(meta);
      const hash = (await rpc('eth_sendTransaction', [{ from, to: call.to, data: call.data }])) as string;
      const receipt = await receiptOf(hash);
      expect(receipt.status).toBe('0x1');
      expect(receipt.logs).toHaveLength(1);
      expect(receipt.logs[0]?.address.toLowerCase()).toBe(ERC6538_REGISTRY_ADDRESS.toLowerCase());
      expect(await lookupMetaAddress(client, from)).toBe(meta);

      // Entries are per registrant: another address sees nothing.
      expect(await lookupMetaAddress(client, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBeUndefined();
      expect(buildLookupCall(from).to).toBe(ERC6538_REGISTRY_ADDRESS);
    });

    it('rejects a malformed value the registry happily stores', async () => {
      const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'registerKeys', args: [1n, `0x${'02'.repeat(66)}`] });
      await receiptOf((await rpc('eth_sendTransaction', [{ from, to: ERC6538_REGISTRY_ADDRESS, data }])) as string);
      await expect(lookupMetaAddress(client, from)).rejects.toThrow(/INVALID_INPUT/);
    });
  });
});
