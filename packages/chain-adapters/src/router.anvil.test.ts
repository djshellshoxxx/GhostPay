import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findChain } from './config/chains.js';
import { validateManifest } from './deployments.js';
import { routerFee, routerSplit } from './fees.js';
import { manifestJson, payment, recipient } from './fixtures.testutil.js';
import { assertPreviewMatchesCalldata, buildPaymentTx } from './router.js';

// Fee differential: chain-adapters fee math vs the COMPILED GhostPayRouter running on a local anvil.
// Skips when anvil or the forge artifacts are missing, unless REQUIRE_ANVIL=1 (CI), which turns that into a failure.
const ANVIL = process.env['ANVIL_BIN'] ?? (existsSync('/root/.foundry/bin/anvil') ? '/root/.foundry/bin/anvil' : 'anvil');
const OUT = resolve(import.meta.dirname, '../../contracts/out');
const ART = {
  router: `${OUT}/GhostPayRouter.sol/GhostPayRouter.json`,
  announcer: `${OUT}/ERC5564Announcer.sol/ERC5564Announcer.json`,
  token: `${OUT}/MockERC20.sol/MockERC20.json`,
};
const required = process.env['REQUIRE_ANVIL'] === '1';

function anvilOnPath(): boolean {
  if (ANVIL.includes('/')) return existsSync(ANVIL);
  return (process.env['PATH'] ?? '').split(':').some((d) => existsSync(`${d}/${ANVIL}`));
}
const available = anvilOnPath() && Object.values(ART).every((p) => existsSync(p));

const DEPLOYER_KEY: Hex = `0x${'dd'.repeat(32)}`;
const PAYER_KEY: Hex = `0x${'aa'.repeat(32)}`;
const FEE_RECIPIENT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function artifact(path: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolveP, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '31337'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => {
      reject(new Error('anvil did not start'));
    }, 20_000);
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /Listening on ([0-9.]+:[0-9]+)/.exec(buf);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        resolveP({ proc, url: `http://${m[1]}` });
      }
    });
    proc.once('error', reject);
    proc.once('exit', () => {
      reject(new Error('anvil exited'));
    });
  });
}

describe('router fee differential vs compiled router (anvil)', () => {
  it('has anvil and artifacts when REQUIRE_ANVIL=1', () => {
    if (required) expect(available, 'REQUIRE_ANVIL=1 but anvil or contracts/out artifacts are missing (run forge build)').toBe(true);
  });

  describe.skipIf(!available)('on anvil', () => {
    let proc: ChildProcess | undefined;
    let url = '';
    let router: Address;
    let token: Address;
    const chain = findChain(84532);
    const payer = privateKeyToAccount(PAYER_KEY);
    const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function mint(address,uint256)', 'function approve(address,uint256) returns (bool)']);
    const { meta } = recipient();
    const pub = (): ReturnType<typeof createPublicClient> => createPublicClient({ transport: http(url) });
    const wallet = (key: Hex): ReturnType<typeof createWalletClient> => createWalletClient({ account: privateKeyToAccount(key), chain: defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } }), transport: http(url) });

    beforeAll(async () => {
      const a = await startAnvil();
      proc = a.proc;
      url = a.url;
      for (const k of [DEPLOYER_KEY, PAYER_KEY]) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [privateKeyToAccount(k).address, '0x21e19e0c9bab2400000'] }),
        });
        expect(res.ok).toBe(true);
      }
      const w = wallet(DEPLOYER_KEY);
      const p = pub();
      const deploy = async (path: string, args: readonly unknown[] = []): Promise<Address> => {
        const art = artifact(path);
        const hash = await w.deployContract({ abi: art.abi, bytecode: art.bytecode, args, chain: null, account: w.account as never });
        return getAddress((await p.waitForTransactionReceipt({ hash })).contractAddress as Address);
      };
      const announcer = await deploy(ART.announcer);
      router = await deploy(ART.router, [announcer, FEE_RECIPIENT]);
      token = await deploy(ART.token, ['USD Coin', 'USDC', 6]);
      const mint = await wallet(PAYER_KEY).writeContract({ address: token, abi: erc20, functionName: 'mint', args: [payer.address, 2n ** 200n], chain: null, account: payer });
      await p.waitForTransactionReceipt({ hash: mint });
      const appr = await wallet(PAYER_KEY).writeContract({ address: token, abi: erc20, functionName: 'approve', args: [router, 2n ** 256n - 1n], chain: null, account: payer });
      await p.waitForTransactionReceipt({ hash: appr });
    }, 60_000);

    afterAll(() => {
      proc?.kill('SIGKILL');
    });

    const deployment = (): ReturnType<typeof validateManifest> =>
      validateManifest({ ...manifestJson(84532), router, feeRecipient: FEE_RECIPIENT }, 84532);

    // Calldata does not contain the chain id, so payments are built under the 84532 table entry and sent to anvil.
    const build = (gross: bigint, isNative: boolean): ReturnType<typeof buildPaymentTx> => {
      if (chain === undefined) throw new Error('chain table lacks 84532');
      return buildPaymentTx({
        chain,
        deployment: deployment(),
        invoice: { chainId: 84532, token: isNative ? 'native' : token.toLowerCase() },
        payment: payment(meta),
        grossAmount: gross,
        deadline: 4_000_000_000n,
        findTokenFn: (_c, a) => ({ chainId: 84532, address: a, permit: false }) as never,
      });
    };

    const GROSSES = [4n, 399n, 400n, 401n, 9_999n, 10_000n, 10_001n, 123_456_789n, 10n ** 18n + 1n, 2n ** 100n + 12_345n, 2n ** 190n - 7n];

    it('ERC-20: on-chain fee and net equal routerFee()/routerSplit() for boundary and large grosses', async () => {
      const p = pub();
      for (const gross of GROSSES) {
        const built = build(gross, false);
        assertPreviewMatchesCalldata(built.preview, built.tx, 84532);
        const split = routerSplit(gross);
        expect(built.preview.fee).toBe(routerFee(gross));
        const stealth = built.preview.stealth;
        const feeBefore = await p.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [FEE_RECIPIENT] });
        const hash = await wallet(PAYER_KEY).sendTransaction({ to: built.tx.to, data: built.tx.data, value: built.tx.value, chain: null, account: payer });
        expect((await p.waitForTransactionReceipt({ hash })).status).toBe('success');
        const feeAfter = await p.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [FEE_RECIPIENT] });
        expect(feeAfter - feeBefore, `fee gross=${gross.toString()}`).toBe(split.fee);
        expect(await p.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [stealth] }), `net gross=${gross.toString()}`).toBe(split.net);
      }
    });

    it('native: on-chain fee and net equal routerFee()/routerSplit()', async () => {
      const p = pub();
      for (const gross of [4n, 401n, 10_001n, 10n ** 15n + 3n, 5n * 10n ** 18n + 17n]) {
        const built = build(gross, true);
        const split = routerSplit(gross);
        const feeBefore = await p.getBalance({ address: FEE_RECIPIENT });
        const hash = await wallet(PAYER_KEY).sendTransaction({ to: built.tx.to, data: built.tx.data, value: built.tx.value, chain: null, account: payer });
        expect((await p.waitForTransactionReceipt({ hash })).status).toBe('success');
        expect((await p.getBalance({ address: FEE_RECIPIENT })) - feeBefore, `fee gross=${gross.toString()}`).toBe(split.fee);
        expect(await p.getBalance({ address: built.preview.stealth }), `net gross=${gross.toString()}`).toBe(split.net);
      }
    });
  });
});
