// Real local-contract evidence qualification. No remote networks, production pins or funded keys.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHAINS, ANNOUNCEMENT_TOPIC, type ChainConfig, type RpcClient, type RpcLog } from '@ghostpay/chain-adapters';
import { ZERO_ADDRESS, ghostPayPolicyRouterAbi, type Address, type Hex } from '@ghostpay/policy-scheme';
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, getAddress, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyPolicyDeployment, type PolicyChainDeployment } from './chain';
import type { PolicyDeploymentProfile } from './deploymentEvidence';
import { account, fixedRng } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';
import { isPolicyEvidenceBlockCanonical, verifyPolicyPaymentEvidence } from './paymentEvidence';
import type { Scheme2Match } from './scan2';

const root = resolve(import.meta.dirname, '../../../../..');
const out = process.env['POLICY_SCHEME_ARTIFACTS'] ?? resolve(root, 'packages/contracts/out');
const names = ['PolicyAccount', 'PolicyAccountFactory', 'GhostPayPolicyRouter', 'ERC5564Announcer', 'MockERC20'] as const;
const ANVIL = process.env['ANVIL_BIN'] ?? 'anvil';
const available = spawnSync(ANVIL, ['--version'], { stdio: 'ignore' }).status === 0 && names.every((name) => existsSync(resolve(out, `${name}.sol/${name}.json`)));
const required = process.env['REQUIRE_ANVIL'] === '1';
function artifact(name: typeof names[number]): { abi: Abi; bytecode: Hex } {
  const parsed = JSON.parse(readFileSync(resolve(out, `${name}.sol/${name}.json`), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: parsed.abi, bytecode: parsed.bytecode.object };
}
if (required && !available) it('requires local policy evidence Anvil artifacts', () => { expect.fail(`Missing Anvil or contract artifacts at ${out}`); });

describe.skipIf(!available)('scheme-2 evidence on real local contracts', () => {
  let proc: ChildProcess | undefined;
  let url = '';
  let deployment: PolicyChainDeployment;
  let profile: PolicyDeploymentProfile;
  let token: Address;
  const chain: ChainConfig = { ...CHAINS.find((c) => c.chainId === 11155111)!, chainId: 31337, name: 'Local evidence fixture', finalityDepth: 0 };
  const testVector = JSON.parse(readFileSync(resolve(root, 'test-vectors/policy-scheme.json'), 'utf8')) as { deployment: { deployerPrivateKey: Hex } };
  const deployer = privateKeyToAccount(testVector.deployment.deployerPrivateKey);
  const feeRecipient: Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
  const request = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const data = await response.json() as { result?: unknown; error?: unknown };
    if (data.error !== undefined) throw new Error('local RPC rejected request');
    return data.result;
  };
  const rpc: RpcClient = {
    chainId: chain.chainId, request,
    blockNumber: async () => BigInt(await request('eth_blockNumber', []) as string),
    getBlock: async (number) => {
      const b = await request('eth_getBlockByNumber', [`0x${number.toString(16)}`, false]) as { hash: Hex; parentHash: Hex };
      return { number, hash: b.hash, parentHash: b.parentHash };
    },
    getLogs: () => Promise.reject(new Error('unused in direct evidence test')),
  };
  beforeAll(async () => {
    const started = await new Promise<{ proc: ChildProcess; url: string }>((resolveStarted, reject) => {
      const child = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '31337'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('local Anvil startup timeout')); }, 20_000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.stdout?.on('data', (chunk: Buffer) => {
        text += chunk.toString();
        const match = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(text);
        if (match?.[1] !== undefined) { clearTimeout(timeout); resolveStarted({ proc: child, url: `http://${match[1]}` }); }
      });
    });
    proc = started.proc; url = started.url;
    const pub = createPublicClient({ transport: http(url), pollingInterval: 20 });
    const wallet = createWalletClient({ account: deployer, transport: http(url), pollingInterval: 20 });
    const deploy = async (name: typeof names[number], args: readonly unknown[] = []): Promise<Address> => {
      const hash = await wallet.deployContract({ ...artifact(name), args, chain: null, account: deployer });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe('success');
      return getAddress(receipt.contractAddress!);
    };
    await request('anvil_setBalance', [deployer.address, '0x56bc75e2d63100000']);
    const implementation = await deploy('PolicyAccount');
    const factory = await deploy('PolicyAccountFactory', [implementation, ZERO_ADDRESS, 0n, feeRecipient]);
    const announcer = await deploy('ERC5564Announcer');
    const router = await deploy('GhostPayPolicyRouter', [announcer, feeRecipient, factory]);
    token = await deploy('MockERC20', ['Fixture', 'FIX', 18]);
    deployment = { chainId: 31337, factory, implementation, announcer, router, feeRecipient, flatFee: 0n };
    const codeHash = async (address: Address): Promise<Hex> => keccak256((await pub.getCode({ address }))!);
    // Test-only trust is anchored in artifacts deployed by this test, not a remote RPC manifest.
    profile = { deployment, deploymentStartBlock: 0n, factoryFeeToken: ZERO_ADDRESS, factoryFeeRecipient: feeRecipient,
      codeHashes: { router: await codeHash(router), factory: await codeHash(factory), implementation: await codeHash(implementation), announcer: await codeHash(announcer) },
      assets: [{ token: ZERO_ADDRESS, semantics: 'native' }, { token, semantics: 'erc20-exact-transfer', codeHash: await codeHash(token) }] };
  });
  afterAll(() => { proc?.kill(); });

  it('rejects changed getter-compatible runtime on a real local deployment', async () => {
    const pub = createPublicClient({ transport: http(url), pollingInterval: 20 });
    const snapshot = await request('evm_snapshot', []);
    const original = (await pub.getCode({ address: deployment.router }))!;
    await request('anvil_setCode', [deployment.router, `${original}00`]);
    expect(await pub.readContract({ address: deployment.router, abi: ghostPayPolicyRouterAbi, functionName: 'FEE_BPS' })).toBe(25n);
    await expect(verifyPolicyDeployment(rpc, chain, { factory: deployment.factory, router: deployment.router }, profile)).rejects.toThrow(/authenticated configuration/);
    await request('evm_revert', [snapshot]);
  });

  it.each([false, true])('authenticates runtime code and verifies a direct canonical payment (ERC20=%s)', async (erc20) => {
    const pub = createPublicClient({ transport: http(url), pollingInterval: 20 });
    const wallet = createWalletClient({ account: deployer, transport: http(url), pollingInterval: 20 });
    const latest = await pub.getBlock();
    const payment = preparePolicyPayment({ metaAddress: account('acct-001').metaAddress, deployment, token: erc20 ? token : 'native', gross: 1_000_000n, nowSec: latest.timestamp, rng: fixedRng(account('acct-001').ephemeralPrivateKey) });
    if (erc20) {
      const tokenAbi = artifact('MockERC20').abi;
      const mintHash = await wallet.sendTransaction({ account: deployer, chain: null, to: token, data: encodeFunctionData({ abi: tokenAbi, functionName: 'mint', args: [deployer.address, 1_000_000n] }) });
      expect((await pub.waitForTransactionReceipt({ hash: mintHash })).status).toBe('success');
      const approval = payment.approval!;
      const approvalHash = await wallet.sendTransaction({ account: deployer, chain: null, to: approval.to, data: approval.data });
      expect((await pub.waitForTransactionReceipt({ hash: approvalHash })).status).toBe('success');
    }
    const snapshot = await request('evm_snapshot', []);
    const txHash = await wallet.sendTransaction({ account: deployer, chain: null, ...payment.built.tx });
    expect((await pub.waitForTransactionReceipt({ hash: txHash })).status).toBe('success');
    const receipt = await request('eth_getTransactionReceipt', [txHash]) as { logs: RpcLog[] };
    const log = receipt.logs.find((l) => l.topics[0] === ANNOUNCEMENT_TOPIC)!;
    const match: Scheme2Match = { id: `${log.blockHash}:${String(BigInt(log.logIndex))}`, accountAddress: payment.payment.accountAddress,
      ownerAddress: payment.payment.ownerAddress, policyHash: payment.payment.policyHash, ephemeralPublicKey: `0x${Buffer.from(payment.payment.ephemeralPublicKey).toString('hex')}`,
      metadata: payment.built.metadata, blockNumber: BigInt(log.blockNumber), blockHash: log.blockHash as Hex, logIndex: Number(BigInt(log.logIndex)),
      caller: deployment.router, transactionHash: txHash };
    const authenticated = await verifyPolicyDeployment(rpc, chain, { factory: deployment.factory, router: deployment.router }, profile);
    expect(authenticated.router).toBe(deployment.router);
    const evidence = await verifyPolicyPaymentEvidence({ client: rpc, chain, profile, match, expected: { token: erc20 ? token : ZERO_ADDRESS, net: payment.built.net }, seenEvidenceIds: new Set() });
    expect(evidence).toMatchObject({ status: 'verified', gross: 1_000_000n, net: 997_500n, transactionHash: txHash });
    if (evidence.status !== 'verified') throw new Error('local payment unverified');
    expect(await isPolicyEvidenceBlockCanonical(rpc, evidence)).toBe(true);
    await request('evm_revert', [snapshot]);
    await request('evm_increaseTime', [1]);
    await request('evm_mine', []);
    expect(await isPolicyEvidenceBlockCanonical(rpc, evidence)).toBe(false);
  });
});
