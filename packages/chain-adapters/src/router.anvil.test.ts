/**
 * Differential test (audit gap A-04, FEE_SCHEDULE section 4): the client fee math must equal what the COMPILED
 * GhostPayRouter really does on an EVM. Runs against a throw-away `anvil` node and the forge artifacts in
 * `packages/contracts/out` (build them first: `PATH=/home/user/tools/foundry:$PATH forge build` in packages/contracts).
 *
 * Skipped when `anvil` is not on PATH, unless REQUIRE_ANVIL=1, in which case a missing anvil FAILS the run.
 * When anvil exists but the artifacts are missing the test fails with instructions (it never silently skips then).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { buildErc20Metadata, buildNativeMetadata, deriveStealthPayment, encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { concatHex, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress } from 'viem/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { erc20Abi } from './abi/erc20.js';
import { ghostPayRouterAbi } from './abi/router.js';
import { findChain } from './config/chains.js';
import { FEE_SCHEDULE, MAX_ROUTER_GROSS, grossForNet, routerFee, routerNet } from './fees.js';
import { createClient, type RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

const anvilOnPath = spawnSync('anvil', ['--version'], { encoding: 'utf8' }).status === 0;
const required = process.env['REQUIRE_ANVIL'] === '1';
const outDir = fileURLToPath(new URL('../../contracts/out/', import.meta.url));

function artifact(file: string, name: string): { abi: unknown; bytecode: Hex } {
  const p = `${outDir}${file}/${name}.json`;
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run: (cd packages/contracts && PATH=/home/user/tools/foundry:$PATH forge build)`);
  const j = JSON.parse(readFileSync(p, 'utf8')) as { abi: unknown; bytecode: { object: string } };
  return { abi: j.abi, bytecode: j.bytecode.object as Hex };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => {
        resolve(port);
      });
    });
  });
}

if (!anvilOnPath && required) {
  describe('router fee differential (anvil)', () => {
    it('REQUIRE_ANVIL=1 but `anvil` is not on PATH', () => {
      throw new Error('anvil is required (REQUIRE_ANVIL=1) but was not found on PATH. Install Foundry or add /home/user/tools/foundry to PATH.');
    });
  });
}

describe.skipIf(!anvilOnPath)('router fee differential (anvil)', () => {
  let proc: ChildProcess | undefined;
  let rpc: RpcClient;
  let payer: Address;
  let token: Address;
  let router: Address;
  const feeRecipient = getAddress('0x00000000000000000000000000000000000fee25');
  const meta = encodeMetaAddress(generateKeySet());
  const hex = (b: Uint8Array): Hex => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;

  async function send(to: Address | undefined, data: Hex, value = 0n): Promise<Record<string, unknown>> {
    const h = (await rpc.request('eth_sendTransaction', [{ from: payer, ...(to === undefined ? {} : { to }), data, value: `0x${value.toString(16)}`, gas: '0x1000000' }])) as string;
    for (let i = 0; i < 100; i++) {
      const rc = (await rpc.request('eth_getTransactionReceipt', [h])) as Record<string, unknown> | null;
      if (rc !== null) {
        if (rc['status'] !== '0x1') throw new Error('reverted');
        return rc;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('no receipt');
  }
  async function deploy(a: { abi: unknown; bytecode: Hex }, args: Hex = '0x'): Promise<Address> {
    const rc = await send(undefined, concatHex([a.bytecode, args]));
    return getAddress(rc['contractAddress'] as string);
  }
  async function balanceOf(who: Address): Promise<bigint> {
    const r = (await rpc.request('eth_call', [{ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [who] }) }, 'latest'])) as Hex;
    return decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data: r });
  }
  const nativeBalance = async (who: Address): Promise<bigint> => BigInt((await rpc.request('eth_getBalance', [who, 'latest'])) as string);
  const mint = (to: Address, amount: bigint): Promise<unknown> =>
    send(token, encodeFunctionData({ abi: [{ type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }], functionName: 'mint', args: [to, amount] }));
  const approve = (amount: bigint): Promise<unknown> => send(token, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, amount] }));

  function erc20Call(gross: bigint, minNet: bigint, claimedNet: bigint): { data: Hex; stealth: Address } {
    const p = deriveStealthPayment(meta);
    const data = encodeFunctionData({
      abi: ghostPayRouterAbi,
      functionName: 'payERC20',
      args: [token, p.stealthAddress, gross, minNet, 4_000_000_000n, hex(p.ephemeralPublicKey), hex(buildErc20Metadata(p.viewTag[0] as number, token, claimedNet))],
    });
    return { data, stealth: p.stealthAddress };
  }

  beforeAll(async () => {
    const announcer = artifact('ERC5564Announcer.sol', 'ERC5564Announcer');
    const tok = artifact('MockERC20.sol', 'MockERC20');
    const rt = artifact('GhostPayRouter.sol', 'GhostPayRouter');
    const port = await freePort();
    proc = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '11155111', '--silent'], { stdio: 'ignore' });
    const chain = findChain(11155111);
    if (chain === undefined) throw new Error('chain table');
    for (let i = 0; ; i++) {
      try {
        rpc = await createClient(chain, `http://127.0.0.1:${String(port)}`, { allowInsecureLocalhost: true, retries: 0, timeoutMs: 5000, chainRecheckMs: 0 });
        break;
      } catch (e) {
        if (i > 100) throw e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const accounts = (await rpc.request('eth_accounts', [])) as string[];
    payer = getAddress(accounts[0] as string);
    const ann = await deploy(announcer);
    token = await deploy(tok, encodeAbiParameters([{ type: 'string' }, { type: 'string' }, { type: 'uint8' }], ['Mock', 'MCK', 6]));
    router = await deploy(rt, encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [ann, feeRecipient]));
  }, 60_000);

  afterAll(() => {
    proc?.kill('SIGKILL');
  });

  it('on-chain constants equal the client constants', async () => {
    const read = async (fn: 'FEE_BPS' | 'BPS'): Promise<bigint> => {
      const r = (await rpc.request('eth_call', [{ to: router, data: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: fn }) }, 'latest'])) as Hex;
      return decodeFunctionResult({ abi: ghostPayRouterAbi, functionName: fn, data: r });
    };
    expect(await read('FEE_BPS')).toBe(FEE_SCHEDULE.ROUTER_FEE_BPS);
    expect(await read('BPS')).toBe(FEE_SCHEDULE.BPS);
  });

  const BOUNDARY: bigint[] = [1n, 2n, 24n, 25n, 399n, 400n, 401n, 799n, 800n, 801n, 9_999n, 10_000n, 10_001n, 12_345_678n, 10n ** 6n, 10n ** 18n, (1n << 128n) - 1n, MAX_ROUTER_GROSS - 1n, MAX_ROUTER_GROSS];

  it('ERC-20: client routerFee/routerNet equal the router for boundary values', async () => {
    for (const gross of BOUNDARY) {
      await mint(payer, gross);
      await approve(gross);
      const fee0 = await balanceOf(feeRecipient);
      const { data, stealth } = erc20Call(gross, routerNet(gross), routerNet(gross));
      await send(router, data);
      expect(await balanceOf(feeRecipient)).toBe(fee0 + routerFee(gross));
      expect(await balanceOf(stealth)).toBe(routerNet(gross));
      expect(routerFee(gross) + routerNet(gross)).toBe(gross);
    }
  }, 120_000);

  it('ERC-20: random amounts across all bit lengths', async () => {
    const rnd = (bits: number): bigint => {
      const b = new Uint8Array(Math.ceil(bits / 8));
      crypto.getRandomValues(b);
      return (BigInt(hex(b)) & ((1n << BigInt(bits)) - 1n)) | 1n;
    };
    for (let bits = 1; bits <= 250; bits += 7) {
      const gross = rnd(bits);
      if (gross > MAX_ROUTER_GROSS) continue;
      await mint(payer, gross);
      await approve(gross);
      const fee0 = await balanceOf(feeRecipient);
      const { data, stealth } = erc20Call(gross, routerNet(gross), routerNet(gross));
      await send(router, data);
      expect(await balanceOf(feeRecipient)).toBe(fee0 + routerFee(gross));
      expect(await balanceOf(stealth)).toBe(routerNet(gross));
    }
  }, 120_000);

  it('ERC-20: the router rejects what the client rejects (zero, overflow, wrong net in metadata, minNet too high)', async () => {
    await expect(send(router, erc20Call(0n, 0n, 1n).data)).rejects.toThrow();
    const over = MAX_ROUTER_GROSS + 1n;
    await mint(payer, over);
    await approve(over);
    await expect(send(router, erc20Call(over, 1n, 1n).data)).rejects.toThrow();
    await mint(payer, 1_000_000n);
    await approve(1_000_000n);
    await expect(send(router, erc20Call(1_000_000n, 0n, routerNet(1_000_000n) + 1n).data)).rejects.toThrow(); // metadata claims too much
    await expect(send(router, erc20Call(1_000_000n, routerNet(1_000_000n) + 1n, routerNet(1_000_000n)).data)).rejects.toThrow(); // slippage guard
  }, 60_000);

  it('grossForNet: the grossed-up amount delivers at least the wanted net, and one unit less does not (when it is a tight bound)', async () => {
    for (const net of [1n, 399n, 400n, 999_999n, 10_000_000n, 123_456_789n]) {
      const gross = grossForNet(net);
      await mint(payer, gross);
      await approve(gross);
      const { data, stealth } = erc20Call(gross, net, routerNet(gross));
      await send(router, data);
      expect(await balanceOf(stealth)).toBe(routerNet(gross));
      expect(routerNet(gross)).toBeGreaterThanOrEqual(net);
      if (gross > 1n && routerNet(gross - 1n) < net) {
        await expect(send(router, erc20Call(gross - 1n, net, routerNet(gross - 1n)).data)).rejects.toThrow();
      }
    }
  }, 60_000);

  it('native: fee recipient and stealth address receive exactly routerFee/routerNet', async () => {
    for (const gross of [1n, 399n, 400n, 401n, 10_000n, 10n ** 15n, 123_456_789_012_345_678n]) {
      const p = deriveStealthPayment(meta);
      const net = routerNet(gross);
      if (net === 0n) continue;
      const data = encodeFunctionData({
        abi: ghostPayRouterAbi,
        functionName: 'payNative',
        args: [p.stealthAddress, net, 4_000_000_000n, hex(p.ephemeralPublicKey), hex(buildNativeMetadata(p.viewTag[0] as number, net))],
      });
      const fee0 = await nativeBalance(feeRecipient);
      await send(router, data, gross);
      expect(await nativeBalance(feeRecipient)).toBe(fee0 + routerFee(gross));
      expect(await nativeBalance(p.stealthAddress)).toBe(net);
    }
  }, 60_000);
});
