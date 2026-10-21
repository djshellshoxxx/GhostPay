import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, getAddress, http, parseAbi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMIT_TYPES, buildSweepTypedData } from '@ghostpay/chain-adapters';
import { parseConfig } from './config.js';
import { createLogger } from './log.js';
import { buildRelayer, type Relayer } from './runtime.js';

const ANVIL = process.env['ANVIL_BIN'] ?? '/home/user/tools/foundry/anvil';
const OUT = resolve(import.meta.dirname, '../../../packages/contracts/out');
const RELAYER_JSON = `${OUT}/GhostPaySweepRelayer.sol/GhostPaySweepRelayer.json`;
const TOKEN_JSON = `${OUT}/PermitToken.sol/PermitToken.json`;
const available = existsSync(ANVIL) && existsSync(RELAYER_JSON) && existsSync(TOKEN_JSON);

// Throwaway test keys; balances are set on the local anvil with anvil_setBalance.
const DEPLOYER_KEY: Hex = `0x${'dd'.repeat(32)}`;
const HOT_KEY: Hex = `0x${'ee'.repeat(32)}`;
const FEE_KEY: Hex = `0x${'5e'.repeat(32)}`;
const OWNER_KEY: Hex = `0x${'7a'.repeat(32)}`;
const DEST: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

function artifact(path: string): { abi: never; bytecode: Hex } {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { abi: never; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

/** Starts a local anvil on an ephemeral port and resolves once it reports its address. */
function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolveP, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '31337'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => reject(new Error('anvil did not start')), 20_000);
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /Listening on ([0-9.]+:[0-9]+)/.exec(buf);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        resolveP({ proc, url: `http://${m[1]}` });
      }
    });
    proc.once('error', reject);
    proc.once('exit', () => reject(new Error('anvil exited')));
  });
}

describe.skipIf(!available)('end to end on anvil (real GhostPaySweepRelayer + ERC-2612 token)', () => {
  let proc: ChildProcess | undefined;
  let relayer: Relayer | undefined;
  let base = '';
  let url = '';
  let token: Address;
  let sweepContract: Address;

  const owner = privateKeyToAccount(OWNER_KEY);
  const feeTo = privateKeyToAccount(FEE_KEY);

  beforeAll(async () => {
    const a = await startAnvil();
    proc = a.proc;
    url = a.url;
    for (const k of [DEPLOYER_KEY, HOT_KEY]) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [privateKeyToAccount(k).address, '0x56bc75e2d63100000'] }),
      });
      expect(res.ok).toBe(true);
    }
    const deployer = privateKeyToAccount(DEPLOYER_KEY);
    const pub = createPublicClient({ transport: http(url) });
    const wallet = createWalletClient({ account: deployer, transport: http(url), chain: undefined });
    const rel = artifact(RELAYER_JSON);
    const tok = artifact(TOKEN_JSON);
    const h1 = await wallet.deployContract({ abi: rel.abi, bytecode: rel.bytecode, chain: null });
    sweepContract = getAddress((await pub.waitForTransactionReceipt({ hash: h1 })).contractAddress as Address);
    const h2 = await wallet.deployContract({ abi: tok.abi, bytecode: tok.bytecode, args: [6], chain: null });
    token = getAddress((await pub.waitForTransactionReceipt({ hash: h2 })).contractAddress as Address);
    const mint = await wallet.writeContract({ address: token, abi: parseAbi(['function mint(address to, uint256 amount)']), functionName: 'mint', args: [owner.address, 1_000_000_000n], chain: null });
    await pub.waitForTransactionReceipt({ hash: mint });

    const config = parseConfig(
      {
        allowedOrigins: ['http://localhost:5173'],
        allowDevChain: true,
        allowInsecureLocalhostRpc: true,
        listen: { host: '127.0.0.1', port: 0 },
        breaker: { windowSize: 10, minSamples: 3, failureRatio: 0.5, cooldownSeconds: 5 },
        queue: { maxPending: 4, maxPerClient: 4, receiptTimeoutSeconds: 30 },
        chains: [
          {
            chainId: 31337,
            rpcUrl: url,
            sweepRelayer: sweepContract,
            feeTo: feeTo.address,
            tokens: [{ address: token, symbol: 'PMT', decimals: 6, permit: true, usdStable: true }],
            nativeUsdPrice: '3000',
            gasUnits: { sweep: '150000', sweepWithPermit: '200000' },
            maxGasLimit: '1000000',
            maxGasPriceWei: '1000000000000',
            dailyBudgetWei: '1000000000000000000',
            minBalanceWei: '1000000000000000',
          },
        ],
      },
      { env: {}, hotKeyAddress: privateKeyToAccount(HOT_KEY).address, readManifest: () => undefined },
    );
    relayer = await buildRelayer({
      config,
      hotKey: Uint8Array.from(Buffer.from(HOT_KEY.slice(2), 'hex')),
      quoteSecret: new Uint8Array(32).fill(7),
      logger: createLogger(() => undefined),
    });
    const addr = await relayer.server.listen();
    base = `http://127.0.0.1:${String(addr.port)}`;
  }, 60_000);

  afterAll(async () => {
    await relayer?.server.close();
    proc?.kill('SIGKILL');
  });

  const post = async (path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };

  it('quotes, accepts a permit sweep, moves the tokens, and refuses a replay', async () => {
    const pub = createPublicClient({ transport: http(url) });
    const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function nonces(address) view returns (uint256)']);
    const bal = (a: Address): Promise<bigint> => pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [a] });
    const amount = 500_000_000n;

    const q = await post('/v1/quote', { chainId: 31337, token, owner: owner.address, destination: DEST, amount: amount.toString() });
    expect(q.status).toBe(200);
    const fee = BigInt(q.json['fee'] as string);
    expect(fee).toBeGreaterThanOrEqual((amount * 50n) / 10_000n);
    expect(fee).toBeLessThanOrEqual((amount * 300n) / 10_000n);

    const block = await pub.getBlock();
    const deadline = block.timestamp + 600n;
    const order = { token, owner: owner.address, destination: DEST, feeTo: feeTo.address, amount, fee, deadline, nonce: 1n };
    const td = buildSweepTypedData(31337, sweepContract, order);
    const sweepSig = await owner.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
    const permitNonce = await pub.readContract({ address: token, abi: erc20, functionName: 'nonces', args: [owner.address] });
    const permitSig = await owner.signTypedData({
      domain: { name: 'PermitToken', version: '1', chainId: 31337, verifyingContract: token },
      types: PERMIT_TYPES,
      primaryType: 'Permit',
      message: { owner: owner.address, spender: sweepContract, value: amount, nonce: permitNonce, deadline },
    });
    const body = {
      chainId: 31337,
      sweep: { token, owner: owner.address, destination: DEST, feeTo: feeTo.address, amount: amount.toString(), fee: fee.toString(), deadline: deadline.toString(), nonce: '1' },
      sweepSig,
      permit: { value: amount.toString(), deadline: deadline.toString(), v: Number(`0x${permitSig.slice(130, 132)}`), r: `0x${permitSig.slice(2, 66)}`, s: `0x${permitSig.slice(66, 130)}` },
      quoteToken: q.json['quoteToken'],
    };

    const destBefore = await bal(DEST);
    const r = await post('/v1/sweep', body);
    expect(r.status).toBe(200);
    const receipt = await pub.waitForTransactionReceipt({ hash: r.json['txHash'] as Hex });
    expect(receipt.status).toBe('success');
    expect(receipt.from.toLowerCase()).toBe(privateKeyToAccount(HOT_KEY).address.toLowerCase());
    expect(await bal(DEST)).toBe(destBefore + amount - fee);
    expect(await bal(feeTo.address)).toBe(fee);
    expect(await bal(owner.address)).toBe(1_000_000_000n - amount);

    // replay: the real contract's NonceAlreadyUsed revert is decoded from the simulation
    const again = await post('/v1/sweep', body);
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ error: { code: 'nonce_used' } });
  }, 60_000);
});

