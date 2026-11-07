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
// In CI (or with REQUIRE_ANVIL=1) a missing anvil/artifact is a hard failure, never a silent skip (audit G-09).
const mustRun = process.env['CI'] === 'true' || process.env['REQUIRE_ANVIL'] === '1';

describe.runIf(mustRun)('anvil e2e prerequisites (CI must not skip)', () => {
  it('anvil binary and forge artifacts exist', () => {
    expect({ anvil: existsSync(ANVIL), relayer: existsSync(RELAYER_JSON), token: existsSync(TOKEN_JSON) }).toEqual({
      anvil: true,
      relayer: true,
      token: true,
    });
  });
});

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
        gas: { griefReserveBps: 500 },
        rateLimit: { ipBurst: 50, ownerBurst: 50, quoteGroupBurst: 50 },
        breaker: { windowSize: 10, minSamples: 3, failureRatio: 0.5, cooldownSeconds: 5 },
        queue: { maxPending: 4, receiptTimeoutSeconds: 30 },
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
  const rpc = async (method: string, params: unknown[] = []): Promise<unknown> => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = (await r.json()) as { result?: unknown; error?: unknown };
    expect(j.error).toBeUndefined();
    return j.result;
  };
  const metric = (line: string): number => {
    const hit = relayer?.metrics.render().split('\n').find((l) => l.startsWith(line));
    return hit === undefined ? 0 : Number(hit.slice(line.length).trim());
  };
  /**
   * Waits until the relayer itself has settled every earlier sweep. It settles a sweep (returning the unused budget
   * reservation) after its OWN receipt wait, which can lag the test's receipt wait; a metric snapshot taken before
   * that is off by the earlier sweep's unused reservation. The lane counts a job as pending until it is settled.
   */
  const laneIdle = async (): Promise<void> => {
    for (let i = 0; i < 100 && metric('relayer_queue_pending{chain_id="31337"}') !== 0; i++) await new Promise((res) => setTimeout(res, 100));
    expect(metric('relayer_queue_pending{chain_id="31337"}')).toBe(0);
  };
  const erc20 = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function nonces(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function transfer(address,uint256) returns (bool)',
    'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
  ]);

  /** Quotes and signs a sweep order plus a matching permit, returning the /v1/sweep body and the permit parts. */
  const prepare = async (amount: bigint, nonce: bigint): Promise<{ body: Record<string, unknown>; fee: bigint; permit: { v: number; r: Hex; s: Hex; deadline: bigint } }> => {
    const pub = createPublicClient({ transport: http(url) });
    const q = await post('/v1/quote', { chainId: 31337, token, owner: owner.address, destination: DEST, amount: amount.toString() });
    expect(q.status).toBe(200);
    const fee = BigInt(q.json['fee'] as string);
    const deadline = (await pub.getBlock()).timestamp + 600n;
    const td = buildSweepTypedData(31337, sweepContract, { token, owner: owner.address, destination: DEST, feeTo: feeTo.address, amount, fee, deadline, nonce });
    const sweepSig = await owner.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
    const permitNonce = await pub.readContract({ address: token, abi: erc20, functionName: 'nonces', args: [owner.address] });
    const ps = await owner.signTypedData({
      domain: { name: 'PermitToken', version: '1', chainId: 31337, verifyingContract: token },
      types: PERMIT_TYPES,
      primaryType: 'Permit',
      message: { owner: owner.address, spender: sweepContract, value: amount, nonce: permitNonce, deadline },
    });
    const permit: { v: number; r: Hex; s: Hex; deadline: bigint } = { v: Number(`0x${ps.slice(130, 132)}`), r: `0x${ps.slice(2, 66)}`, s: `0x${ps.slice(66, 130)}`, deadline };
    const body = {
      chainId: 31337,
      sweep: { token, owner: owner.address, destination: DEST, feeTo: feeTo.address, amount: amount.toString(), fee: fee.toString(), deadline: deadline.toString(), nonce: nonce.toString() },
      sweepSig,
      permit: { value: amount.toString(), deadline: deadline.toString(), v: permit.v, r: permit.r, s: permit.s },
      quoteToken: q.json['quoteToken'],
    };
    return { body, fee, permit };
  };

  it('falls back to the allowance path when a third party front-runs the permit (spec 04)', async () => {
    const pub = createPublicClient({ transport: http(url) });
    const bal = (a: Address): Promise<bigint> => pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [a] });
    const amount = 100_000_000n;
    const { body, fee, permit } = await prepare(amount, 2n);

    // A third party submits the owner's permit first (ERC-2612 front-run): the allowance is now set and the nonce consumed.
    const stranger = privateKeyToAccount(DEPLOYER_KEY);
    const w = createWalletClient({ account: stranger, transport: http(url), chain: undefined });
    const fr = await w.writeContract({ address: token, abi: erc20, functionName: 'permit', args: [owner.address, sweepContract, amount, permit.deadline, permit.v, permit.r, permit.s], chain: null });
    expect((await pub.waitForTransactionReceipt({ hash: fr })).status).toBe('success');
    expect(await pub.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [owner.address, sweepContract] })).toBe(amount);

    const skippedBefore = metric('relayer_permit_skipped_total{chain_id="31337"}');
    const destBefore = await bal(DEST);
    const feeBefore = await bal(feeTo.address);
    const r = await post('/v1/sweep', body);
    expect(r.status).toBe(200);
    expect((await pub.waitForTransactionReceipt({ hash: r.json['txHash'] as Hex })).status).toBe('success');
    expect(await bal(DEST)).toBe(destBefore + amount - fee);
    expect(await bal(feeTo.address)).toBe(feeBefore + fee);
    // The relayer dropped the (now useless) permit and used the plain sweep path.
    expect(metric('relayer_permit_skipped_total{chain_id="31337"}')).toBe(skippedBefore + 1);
    expect(metric('relayer_mined_reverts_total{chain_id="31337"}')).toBe(0);
  }, 60_000);

  it('owner sweeps first: the relayer tx reverts, the gas loss is bounded and visible in metrics (spec 04 s5)', async () => {
    const pub = createPublicClient({ transport: http(url) });
    const amount = 100_000_000n;
    const { body } = await prepare(amount, 3n);
    await laneIdle();
    const revertsBefore = metric('relayer_mined_reverts_total{chain_id="31337"}');
    const strikesBefore = metric('relayer_owner_failures_total');
    const usedBefore = metric('relayer_daily_budget_used_wei{chain_id="31337"}');
    const remaining = await pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [owner.address] });
    const destBefore = await pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [DEST] });

    // Hold the relayer tx pending, then let the owner drain the balance with a higher gas price so it mines first.
    await rpc('evm_setAutomine', [false]);
    try {
      const r = await post('/v1/sweep', body);
      expect(r.status).toBe(200);
      const hash = r.json['txHash'] as Hex;
      await rpc('anvil_setBalance', [owner.address, '0x56bc75e2d63100000']);
      const ow = createWalletClient({ account: owner, transport: http(url), chain: undefined });
      const drain = await ow.writeContract({ address: token, abi: erc20, functionName: 'transfer', args: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', remaining], chain: null, gas: 100_000n, gasPrice: 500_000_000_000n });
      await rpc('evm_mine');
      await rpc('evm_setAutomine', [true]);
      const drainRec = await pub.waitForTransactionReceipt({ hash: drain });
      expect(drainRec.status).toBe('success');
      const rec = await pub.waitForTransactionReceipt({ hash });
      expect(rec.status).toBe('reverted');
      expect(rec.blockNumber).toBeGreaterThanOrEqual(drainRec.blockNumber);

      // Nothing moved to the destination.
      expect(await pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [DEST] })).toBe(destBefore);

      // The settlement runs after the receipt; poll the counters instead of sleeping a fixed time.
      for (let i = 0; i < 50 && metric('relayer_mined_reverts_total{chain_id="31337"}') === revertsBefore; i++) await new Promise((res) => setTimeout(res, 100));
      expect(metric('relayer_mined_reverts_total{chain_id="31337"}')).toBe(revertsBefore + 1);
      expect(metric('relayer_owner_failures_total')).toBe(strikesBefore + 1);
      // Loss = gas actually paid; it is exactly what the daily budget gauge kept (unused reservation returned) and is
      // inside the per-key loss budget (default 0.005 ETH).
      const tx = await pub.getTransaction({ hash });
      const lost = rec.gasUsed * (tx.gasPrice ?? 0n);
      expect(lost).toBeGreaterThan(0n);
      expect(lost).toBeLessThan(5n * 10n ** 15n);
      expect(metric('relayer_daily_budget_used_wei{chain_id="31337"}') - usedBefore).toBe(Number(lost));
    } finally {
      await rpc('evm_setAutomine', [true]);
    }
  }, 60_000);
});

