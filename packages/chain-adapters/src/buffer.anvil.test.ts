import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveStealthSecret, unsafeRevealSecret, zeroize } from '@ghostpay/core-crypto';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, toHex, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findChain } from './config/chains.js';
import type { TokenConfig } from './config/tokens.js';
import { validateManifest } from './deployments.js';
import { calculateBuffer, routerSplit } from './fees.js';
import { manifestJson, payment, recipient } from './fixtures.testutil.js';
import { assertPreviewMatchesCalldata, buildPaymentTx } from './router.js';

// Spec 13 section 4, "anvil e2e sweep using only buffered gas": a payment through `payERC20WithBuffer` and
// through `payERC20WithPermitAndBuffer` (ADR-0030) against the COMPILED GhostPayRouter on a local anvil, then the
// recipient sweeps the tokens out of the one-time address with gas paid from the forwarded buffer and nothing else.
// Skips when anvil or the forge artifacts are missing, unless REQUIRE_ANVIL=1 (CI), which turns that into a failure.
const ANVIL = process.env['ANVIL_BIN'] ?? (existsSync('/root/.foundry/bin/anvil') ? '/root/.foundry/bin/anvil' : 'anvil');
const OUT = resolve(import.meta.dirname, '../../contracts/out');
const ART = {
  router: `${OUT}/GhostPayRouter.sol/GhostPayRouter.json`,
  announcer: `${OUT}/ERC5564Announcer.sol/ERC5564Announcer.json`,
  token: `${OUT}/MockERC20.sol/MockERC20.json`,
  permitToken: `${OUT}/PermitToken.sol/PermitToken.json`,
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
/** Where the recipient sweeps to; never funded with ETH, never a party to the payment. */
const SWEEP_DESTINATION: Address = getAddress(`0x${'be'.repeat(20)}`);
const ANVIL_CHAIN_ID = 31337;
const DEADLINE = 4_000_000_000n;
const GROSS = 1_000_000_000n; // 1000 units of a 6-decimal token
const SAFETY_BPS = 2_000n;

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

function artifact(path: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolveP, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', String(ANVIL_CHAIN_ID)], { stdio: ['ignore', 'pipe', 'pipe'] });
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

describe('buffered payments and a sweep funded only by the buffer (anvil, spec 13 section 4)', () => {
  it('has anvil and artifacts when REQUIRE_ANVIL=1', () => {
    if (required) expect(available, 'REQUIRE_ANVIL=1 but anvil or contracts/out artifacts are missing (run forge build)').toBe(true);
  });

  describe.skipIf(!available)('on anvil', () => {
    let proc: ChildProcess | undefined;
    let url = '';
    let router: Address;
    let plainToken: Address;
    let permitToken: Address;
    const chain = findChain(84532);
    const payer = privateKeyToAccount(PAYER_KEY);
    const { keys, meta } = recipient();
    const erc20 = parseAbi([
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address,address) view returns (uint256)',
      'function nonces(address) view returns (uint256)',
      'function mint(address,uint256)',
      'function approve(address,uint256) returns (bool)',
      'function transfer(address,uint256) returns (bool)',
    ]);
    const pub = (): ReturnType<typeof createPublicClient> => createPublicClient({ transport: http(url), pollingInterval: 25 });
    const wallet = (account: PrivateKeyAccount): ReturnType<typeof createWalletClient> =>
      createWalletClient({ account, chain: defineChain({ id: ANVIL_CHAIN_ID, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } }), transport: http(url) });

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
      const deployer = privateKeyToAccount(DEPLOYER_KEY);
      const w = wallet(deployer);
      const p = pub();
      const deploy = async (path: string, args: readonly unknown[] = []): Promise<Address> => {
        const art = artifact(path);
        const hash = await w.deployContract({ abi: art.abi, bytecode: art.bytecode, args, chain: null, account: deployer });
        return getAddress((await p.waitForTransactionReceipt({ hash })).contractAddress as Address);
      };
      const announcer = await deploy(ART.announcer);
      router = await deploy(ART.router, [announcer, FEE_RECIPIENT]);
      plainToken = await deploy(ART.token, ['USD Coin', 'USDC', 6]);
      permitToken = await deploy(ART.permitToken, [6]);
      for (const token of [plainToken, permitToken]) {
        const mint = await wallet(payer).writeContract({ address: token, abi: erc20, functionName: 'mint', args: [payer.address, GROSS * 10n], chain: null, account: payer });
        await p.waitForTransactionReceipt({ hash: mint });
      }
      // Only the plain token gets an approval; the permit token's allowance must come from the permit inside the call.
      const appr = await wallet(payer).writeContract({ address: plainToken, abi: erc20, functionName: 'approve', args: [router, GROSS], chain: null, account: payer });
      await p.waitForTransactionReceipt({ hash: appr });
    }, 60_000);

    afterAll(() => {
      proc?.kill('SIGKILL');
    });

    const deployment = (): ReturnType<typeof validateManifest> =>
      validateManifest({ ...manifestJson(84532), router, feeRecipient: FEE_RECIPIENT }, 84532);

    const tokenConfig = (address: Address, permit: boolean): TokenConfig => ({ chainId: 84532, symbol: 'TEST', address, decimals: 6, permit });

    const balanceOf = async (token: Address, who: Address): Promise<bigint> =>
      pub().readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [who] });

    /** Buffer quote the way a client would make one: a sweep estimated from a funded dummy, the current fee doubled, 20% safety. */
    const quote = async (token: Address): Promise<{ estimatedSweepGas: bigint; maxFeePerGas: bigint; bufferWei: bigint }> => {
      const p = pub();
      const estimatedSweepGas = await p.estimateContractGas({ address: token, abi: erc20, functionName: 'transfer', args: [SWEEP_DESTINATION, routerSplit(GROSS).net], account: payer.address });
      const maxFeePerGas = (await p.getGasPrice()) * 2n + 1n;
      return { estimatedSweepGas, maxFeePerGas, bufferWei: calculateBuffer({ estimatedSweepGas, maxFeePerGas, safetyBps: SAFETY_BPS }) };
    };

    /** The recipient's one-time key for this payment, recovered from the announcement fields the way a scan would. */
    const stealthAccount = (stealth: Address, ephemeralPublicKey: Hex, metadata: Hex): PrivateKeyAccount => {
      const secret = deriveStealthSecret({ schemeId: 1n, stealthAddress: stealth, ephemeralPublicKey, metadata }, keys);
      const raw = unsafeRevealSecret(secret);
      try {
        const account = privateKeyToAccount(toHex(raw));
        expect(account.address).toBe(stealth);
        return account;
      } finally {
        zeroize(raw);
        zeroize(secret);
      }
    };

    /** Pays, checks every balance the router touches, then sweeps with gas paid from the buffer alone. */
    const payAndSweep = async (token: Address, permitSignature: Hex | undefined, q: Awaited<ReturnType<typeof quote>>): Promise<void> => {
      if (chain === undefined) throw new Error('chain table lacks 84532');
      const p = pub();
      const pay = payment(meta);
      const built = buildPaymentTx({
        chain,
        deployment: deployment(),
        invoice: { chainId: 84532, token: token.toLowerCase() },
        payment: pay,
        grossAmount: GROSS,
        deadline: DEADLINE,
        ...(permitSignature === undefined ? {} : { permitSignature }),
        buffer: { bufferWei: q.bufferWei, maxBufferWei: q.bufferWei },
        findTokenFn: (_c, a) => tokenConfig(getAddress(a), permitSignature !== undefined),
      });
      expect(built.preview.method).toBe(permitSignature === undefined ? 'payERC20WithBuffer' : 'payERC20WithPermitAndBuffer');
      expect(built.tx.value).toBe(q.bufferWei);
      assertPreviewMatchesCalldata(built.preview, built.tx, 84532);
      const stealth = built.preview.stealth;
      const split = routerSplit(GROSS);

      // The one-time address starts empty: no ETH ever reaches it except the buffer.
      expect(await p.getBalance({ address: stealth })).toBe(0n);
      expect(await balanceOf(token, stealth)).toBe(0n);
      const feeTokenBefore = await balanceOf(token, FEE_RECIPIENT);
      const feeEthBefore = await p.getBalance({ address: FEE_RECIPIENT });

      const hash = await wallet(payer).sendTransaction({ to: built.tx.to, data: built.tx.data, value: built.tx.value, chain: null, account: payer });
      expect((await p.waitForTransactionReceipt({ hash })).status).toBe('success');

      expect(await balanceOf(token, stealth)).toBe(split.net);
      expect((await balanceOf(token, FEE_RECIPIENT)) - feeTokenBefore).toBe(split.fee);
      expect(await p.getBalance({ address: stealth }), 'buffer forwarded in full').toBe(q.bufferWei);
      expect(await p.getBalance({ address: FEE_RECIPIENT }), 'no fee on the buffer').toBe(feeEthBefore);
      expect(await p.getBalance({ address: router })).toBe(0n);
      expect(await balanceOf(token, router)).toBe(0n);
      expect(await p.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [payer.address, router] }), 'exact pull leaves no allowance').toBe(0n);

      // Sweep: the recipient recovers the one-time key and moves the tokens out, paying gas only from the buffer.
      const sweeper = stealthAccount(stealth, built.preview.ephemeralPublicKey, built.preview.metadata);
      const sweep = await wallet(sweeper).writeContract({
        address: token,
        abi: erc20,
        functionName: 'transfer',
        args: [SWEEP_DESTINATION, split.net],
        gas: q.estimatedSweepGas,
        gasPrice: q.maxFeePerGas,
        chain: null,
        account: sweeper,
      });
      const receipt = await p.waitForTransactionReceipt({ hash: sweep });
      expect(receipt.status).toBe('success');
      const spent = receipt.gasUsed * receipt.effectiveGasPrice;
      expect(spent <= q.bufferWei, `sweep cost ${spent.toString()} within buffer ${q.bufferWei.toString()}`).toBe(true);
      expect(await p.getBalance({ address: stealth }), 'only the buffer paid for the sweep').toBe(q.bufferWei - spent);
      expect(await balanceOf(token, stealth)).toBe(0n);
      expect(await balanceOf(token, SWEEP_DESTINATION)).toBe(split.net);
    };

    it('payERC20WithBuffer: approval path, the buffer alone funds the sweep', async () => {
      const before = await balanceOf(plainToken, SWEEP_DESTINATION);
      expect(before).toBe(0n);
      await payAndSweep(plainToken, undefined, await quote(plainToken));
    });

    it('payERC20WithPermitAndBuffer: an over-cap attempt reverts without consuming the permit; the same signature then pays and the buffer alone funds the sweep', async () => {
      if (chain === undefined) throw new Error('chain table lacks 84532');
      const p = pub();
      const nonce = await p.readContract({ address: permitToken, abi: erc20, functionName: 'nonces', args: [payer.address] });
      const permitSignature = await payer.signTypedData({
        domain: { name: 'PermitToken', version: '1', chainId: ANVIL_CHAIN_ID, verifyingContract: permitToken },
        types: PERMIT_TYPES,
        primaryType: 'Permit',
        message: { owner: payer.address, spender: router, value: GROSS, nonce, deadline: DEADLINE },
      });
      const q = await quote(permitToken);

      // msg.value above maxBufferWei: the router refuses before touching the permit, so the nonce is still usable.
      const overCap = buildPaymentTx({
        chain,
        deployment: deployment(),
        invoice: { chainId: 84532, token: permitToken.toLowerCase() },
        payment: payment(meta),
        grossAmount: GROSS,
        deadline: DEADLINE,
        permitSignature,
        buffer: { bufferWei: q.bufferWei, maxBufferWei: q.bufferWei },
        findTokenFn: (_c, a) => tokenConfig(getAddress(a), true),
      });
      const refused = await wallet(payer).sendTransaction({ to: overCap.tx.to, data: overCap.tx.data, value: q.bufferWei + 1n, gas: 400_000n, chain: null, account: payer });
      expect((await p.waitForTransactionReceipt({ hash: refused })).status).toBe('reverted');
      expect(await p.readContract({ address: permitToken, abi: erc20, functionName: 'nonces', args: [payer.address] })).toBe(nonce);
      expect(await balanceOf(permitToken, overCap.preview.stealth)).toBe(0n);
      expect(await p.getBalance({ address: overCap.preview.stealth })).toBe(0n);
      expect(await p.readContract({ address: permitToken, abi: erc20, functionName: 'allowance', args: [payer.address, router] })).toBe(0n);

      await payAndSweep(permitToken, permitSignature, q);
      expect(await p.readContract({ address: permitToken, abi: erc20, functionName: 'nonces', args: [payer.address] }), 'permit consumed once').toBe(nonce + 1n);
    });
  });
});
