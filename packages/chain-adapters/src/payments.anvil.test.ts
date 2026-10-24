import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMetadata } from '@ghostpay/core-crypto';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findChain } from './config/chains.js';
import { validateManifest } from './deployments.js';
import { routerSplit } from './fees.js';
import { manifestJson, payment, recipient } from './fixtures.testutil.js';
import { validateAnnouncementLog } from './logs.js';
import { verifyClaimedPayment, type ClaimedPayment } from './payments.js';
import { buildPaymentTx, type BuiltPayment } from './router.js';
import { createClient, type RpcClient, type RpcLog } from './rpc.js';

// Real compiled contracts and real JSON-RPC on an isolated local EVM. This is NOT
// deployed USDC or live-chain acceptance: only this disposable Anvil instance gets
// MockERC20 runtime code at the allowlisted token address; production tables stay unchanged.
const ANVIL = process.env['ANVIL_BIN'] ?? (existsSync('/root/.foundry/bin/anvil') ? '/root/.foundry/bin/anvil' : 'anvil');
const OUT = resolve(import.meta.dirname, '../../contracts/out');
const ART = {
  router: `${OUT}/GhostPayRouter.sol/GhostPayRouter.json`,
  announcer: `${OUT}/ERC5564Announcer.sol/ERC5564Announcer.json`,
  token: `${OUT}/MockERC20.sol/MockERC20.json`,
};
const available = (ANVIL.includes('/') ? existsSync(ANVIL) : (process.env['PATH'] ?? '').split(':').some((dir) => existsSync(`${dir}/${ANVIL}`))) && Object.values(ART).every((path) => existsSync(path));
const DEPLOYER_KEY: Hex = `0x${'dd'.repeat(32)}`;
const PAYER_KEY: Hex = `0x${'aa'.repeat(32)}`;
const FEE_RECIPIENT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TOKEN: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress = (address: Address): Hex => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
const artifact = (path: string): { abi: Abi; bytecode: Hex } => {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: parsed.abi, bytecode: parsed.bytecode.object };
};

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolveStart, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '84532'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const fail = (): void => { clearTimeout(timer); proc.kill('SIGKILL'); reject(new Error('local payment Anvil failed to start')); };
    const timer = setTimeout(fail, 20_000);
    proc.stdout?.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-65_536);
      const match = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(output);
      if (match?.[1] !== undefined) { clearTimeout(timer); resolveStart({ proc, url: `http://${match[1]}` }); }
    });
    proc.once('error', fail);
    proc.once('exit', () => { clearTimeout(timer); reject(new Error('local payment Anvil exited')); });
  });
}

describe('direct payment evidence against compiled local router (anvil)', () => {
  it('requires local Anvil and compiled artifacts when REQUIRE_ANVIL=1', () => {
    if (process.env['REQUIRE_ANVIL'] === '1') expect(available, 'REQUIRE_ANVIL=1 needs anvil and contracts/out (run forge build)').toBe(true);
  });

  describe.skipIf(!available)('real loopback RPC with explicitly injected mock token code', () => {
    let proc: ChildProcess | undefined;
    let url = '';
    let rpc: RpcClient;
    let router: Address;
    let announcer: Address;
    let nativeClaim: ClaimedPayment;
    let tokenClaim: ClaimedPayment;
    const chain = findChain(84532)!;
    const payer = privateKeyToAccount(PAYER_KEY);
    const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function mint(address,uint256)', 'function approve(address,uint256) returns (bool)']);
    const pub = (): ReturnType<typeof createPublicClient> => createPublicClient({ transport: http(url), pollingInterval: 25 });
    const wallet = (key: Hex): ReturnType<typeof createWalletClient> => createWalletClient({
      account: privateKeyToAccount(key),
      chain: defineChain({ id: 84532, name: 'isolated payment Anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } }),
      transport: http(url),
    });
    const verify = (claim: ClaimedPayment, client = rpc, extra: { consumedTransfers?: Set<string>; secondaryClient?: RpcClient } = {}) =>
      verifyClaimedPayment({ chain, client, router, announcer, claim, ...extra });

    async function sendPayment(native: boolean): Promise<{ built: BuiltPayment; claim: ClaimedPayment }> {
      const built = buildPaymentTx({
        chain, deployment: validateManifest({ ...manifestJson(84532), router, announcer, feeRecipient: FEE_RECIPIENT }, 84532),
        invoice: { chainId: chain.chainId, token: native ? 'native' : TOKEN.toLowerCase() },
        payment: payment(recipient().meta), grossAmount: native ? 10n ** 15n + 3n : 10_000_003n, deadline: 4_000_000_000n,
      });
      const hash = await wallet(PAYER_KEY).sendTransaction({ ...built.tx, chain: null, account: payer });
      expect((await pub().waitForTransactionReceipt({ hash })).status).toBe('success');
      const raw = await rpc.request('eth_getTransactionReceipt', [hash]) as { logs: RpcLog[] };
      const announcement = raw.logs.filter((log) => log.address.toLowerCase() === announcer.toLowerCase()).map((log) => validateAnnouncementLog(log, announcer, 1n, 0n, 1_000_000n)).find((log) => log !== undefined);
      if (announcement === undefined) throw new Error('real router receipt omitted its announcement');
      const claim: ClaimedPayment = { stealthAddress: announcement.stealthAddress, announcement, metadata: parseMetadata(announcement.metadata), viaRouter: announcement.caller.toLowerCase() === router.toLowerCase() };
      expect(claim.metadata?.netAmount).toBe(built.preview.net);
      expect(announcement.transactionHash).toBe(hash);
      return { built, claim };
    }

    beforeAll(async () => {
      const started = await startAnvil(); proc = started.proc; url = started.url;
      rpc = await createClient(chain, url, { allowInsecureLocalhost: true, retries: 0 });
      for (const key of [DEPLOYER_KEY, PAYER_KEY]) await rpc.request('anvil_setBalance', [privateKeyToAccount(key).address, '0x21e19e0c9bab2400000']);
      const deploy = async (path: string, args: readonly unknown[] = []): Promise<Address> => {
        const art = artifact(path); const deployer = wallet(DEPLOYER_KEY);
        const hash = await deployer.deployContract({ abi: art.abi, bytecode: art.bytecode, args, chain: null, account: privateKeyToAccount(DEPLOYER_KEY) });
        const address = (await pub().waitForTransactionReceipt({ hash })).contractAddress;
        if (address === null || address === undefined) throw new Error('local fixture deployment omitted contract address');
        return getAddress(address);
      };
      announcer = await deploy(ART.announcer); router = await deploy(ART.router, [announcer, FEE_RECIPIENT]);
      const mock = await deploy(ART.token, ['LOCAL MOCK USDC', 'MOCK', 6]);
      const runtime = await rpc.request('eth_getCode', [mock, 'latest']);
      expect(typeof runtime === 'string' && runtime.length > 2).toBe(true);
      await rpc.request('anvil_setCode', [TOKEN, runtime]);
      expect(await rpc.request('eth_getCode', [TOKEN, 'latest'])).toBe(runtime);
      for (const [functionName, args] of [['mint', [payer.address, 10n ** 20n]], ['approve', [router, 2n ** 256n - 1n]]] as const) {
        const hash = await wallet(PAYER_KEY).writeContract({ address: TOKEN, abi: erc20, functionName, args, chain: null, account: payer });
        expect((await pub().waitForTransactionReceipt({ hash })).status).toBe('success');
      }
      nativeClaim = (await sendPayment(true)).claim; tokenClaim = (await sendPayment(false)).claim;
      await rpc.request('anvil_mine', [`0x${chain.finalityDepth.toString(16)}`]);
    }, 60_000);
    afterAll(() => { proc?.kill('SIGKILL'); });

    it.each([{ label: 'native', native: true }, { label: 'ERC20', native: false }])('accepts a real $label payment only with exact transaction/receipt evidence, including finality and fee split', async ({ native }) => {
      const p = pub();
      const feeBefore = native ? await p.getBalance({ address: FEE_RECIPIENT }) : await p.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [FEE_RECIPIENT] });
      const { built, claim } = await sendPayment(native);
      const split = routerSplit(built.preview.gross);
      const feeAfter = native ? await p.getBalance({ address: FEE_RECIPIENT }) : await p.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [FEE_RECIPIENT] });
      const received = native ? await p.getBalance({ address: claim.stealthAddress }) : await p.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [claim.stealthAddress] });
      expect(feeAfter - feeBefore).toBe(split.fee); expect(received).toBe(split.net);
      const blockReads: bigint[] = []; const requests: string[] = [];
      const traced: RpcClient = { ...rpc, getBlock: (number) => { blockReads.push(number); return rpc.getBlock(number); }, request: (method, params) => { requests.push(method); return rpc.request(method, params); } };
      const pending = await verify(claim, traced);
      expect(pending).toMatchObject({ status: 'received', final: false, confirmations: 1n });
      expect(pending.evidence).toEqual(native ? ['router-caller', 'block-hash', 'receipt'] : ['router-caller', 'block-hash', 'receipt', 'transfer-log']);
      expect(blockReads).toEqual([claim.announcement.blockNumber, claim.announcement.blockNumber]);
      expect(requests.sort()).toEqual(['eth_getTransactionByHash', 'eth_getTransactionReceipt']);
      expect(pending.evidenceBinding).toMatch(/^0x[0-9a-f]{64}$/);
      if (!native) {
        const raw = await rpc.request('eth_getTransactionReceipt', [claim.announcement.transactionHash]) as { logs: RpcLog[] };
        const transfer = raw.logs.find((log) => log.address.toLowerCase() === TOKEN.toLowerCase() && log.topics[0] === TRANSFER_TOPIC && log.topics[2]?.toLowerCase() === topicAddress(claim.stealthAddress));
        expect(transfer?.topics[1]?.toLowerCase()).toBe(topicAddress(payer.address));
        expect(BigInt(transfer!.data)).toBe(split.net);
        expect(BigInt(transfer!.logIndex)).toBeLessThan(BigInt(claim.announcement.logIndex));
        expect(pending.evidenceId).toBe(`erc20:${TOKEN.toLowerCase()}:${claim.announcement.blockNumber}:${claim.announcement.blockHash.toLowerCase()}:${claim.announcement.transactionHash!.toLowerCase()}:${BigInt(transfer!.logIndex)}`);
      } else expect(pending.evidenceId).toBe(`native:${claim.announcement.blockNumber}:${claim.announcement.transactionHash!.toLowerCase()}:${claim.announcement.blockHash.toLowerCase()}`);
      await rpc.request('anvil_mine', [`0x${chain.finalityDepth.toString(16)}`]);
      const consumedTransfers = new Set<string>();
      const finalized = await verify(claim, rpc, { consumedTransfers });
      expect(finalized).toMatchObject({ status: 'received', final: true, evidenceId: pending.evidenceId, evidenceBinding: pending.evidenceBinding });
      expect(consumedTransfers.size).toBe(1);
      expect((await verify(claim, rpc, { consumedTransfers })).status).toBe('unverified-claim');
    });

    // Fault injection starts from actual local RPC responses; it does not replace
    // the positive-path verifier or claim to represent an independent live provider.
    const altered = (change: (method: string, response: Record<string, unknown>) => unknown): RpcClient => ({
      ...rpc, request: async (method, params) => {
        const response = await rpc.request(method, params);
        return response !== null && typeof response === 'object' && !Array.isArray(response) ? change(method, response as Record<string, unknown>) : response;
      },
    });
    it.each(['transaction-hash', 'transaction-target', 'transaction-chain', 'calldata', 'receipt-status', 'receipt-block', 'receipt-payer', 'missing-announcement', 'transfer-payer', 'transfer-order', 'transfer-amount'] as const)('rejects %s corruption of real ERC20 evidence without consuming it', async (fault) => {
      const client = altered((method, raw) => {
        if (method === 'eth_getTransactionByHash') {
          if (fault === 'transaction-hash') return { ...raw, hash: `0x${'f'.repeat(64)}` };
          if (fault === 'transaction-target') return { ...raw, to: FEE_RECIPIENT };
          if (fault === 'transaction-chain') return { ...raw, chainId: '0x1' };
          if (fault === 'calldata') return { ...raw, input: '0x12345678' };
        }
        if (method === 'eth_getTransactionReceipt') {
          if (fault === 'receipt-status') return { ...raw, status: '0x0' };
          if (fault === 'receipt-block') return { ...raw, blockHash: `0x${'f'.repeat(64)}` };
          if (fault === 'receipt-payer') return { ...raw, from: FEE_RECIPIENT };
          if (fault === 'missing-announcement') return { ...raw, logs: (raw['logs'] as RpcLog[]).filter((log) => log.address.toLowerCase() !== announcer.toLowerCase()) };
          return { ...raw, logs: (raw['logs'] as RpcLog[]).map((log) => {
            if (log.address.toLowerCase() !== TOKEN.toLowerCase() || log.topics[0] !== TRANSFER_TOPIC) return log;
            if (fault === 'transfer-payer') return { ...log, topics: [log.topics[0], topicAddress(router), log.topics[2]] };
            if (fault === 'transfer-order') return { ...log, logIndex: `0x${(tokenClaim.announcement.logIndex + 1).toString(16)}` };
            if (fault === 'transfer-amount') return { ...log, data: `0x${'0'.repeat(63)}1` };
            return log;
          }) };
        }
        return raw;
      });
      const consumedTransfers = new Set<string>();
      const result = await verify(tokenClaim, client, { consumedTransfers });
      expect(result.status).toBe('unverified-claim'); expect(result.evidenceId).toBeUndefined(); expect(consumedTransfers.size).toBe(0);
    });

    it('rejects a native transaction whose actual value was replaced with zero', async () => {
      const result = await verify(nativeClaim, altered((method, raw) => method === 'eth_getTransactionByHash' ? { ...raw, value: '0x0' } : raw));
      expect(result.status).toBe('unverified-claim'); expect(result.evidenceId).toBeUndefined();
    });

    it('compares exact payer bindings across providers even when the transfer consumption identity matches', async () => {
      const secondary = altered((method, raw) => {
        if (method === 'eth_getTransactionByHash') return { ...raw, from: FEE_RECIPIENT };
        if (method === 'eth_getTransactionReceipt') return { ...raw, from: FEE_RECIPIENT, logs: (raw['logs'] as RpcLog[]).map((log) => log.topics[0] === TRANSFER_TOPIC ? { ...log, topics: [log.topics[0], topicAddress(FEE_RECIPIENT), log.topics[2]] } : log) };
        return raw;
      });
      const primaryProof = await verify(tokenClaim); const alteredProof = await verify(tokenClaim, secondary);
      expect(primaryProof.status).toBe('received'); expect(alteredProof.status).toBe('received');
      expect(primaryProof.evidenceId).toBe(alteredProof.evidenceId); expect(primaryProof.evidenceBinding).not.toBe(alteredProof.evidenceBinding);
      const consumedTransfers = new Set<string>();
      const result = await verify(tokenClaim, rpc, { secondaryClient: secondary, consumedTransfers });
      expect(result.status).toBe('unverified-claim'); expect(result.reason).toMatch(/did not agree/); expect(consumedTransfers.size).toBe(0);
    });

    it('rejects a real orphaned payment when Anvil reverts between its first canonical read and its final reread', async () => {
      const snapshot = await rpc.request('evm_snapshot', []);
      const { claim } = await sendPayment(false);
      let reads = 0;
      const client: RpcClient = { ...rpc, getBlock: async (number) => {
        if (number === claim.announcement.blockNumber && ++reads === 2) {
          expect(await rpc.request('evm_revert', [snapshot])).toBe(true);
          await rpc.request('evm_mine', []);
        }
        return rpc.getBlock(number);
      } };
      const consumedTransfers = new Set<string>();
      const result = await verify(claim, client, { consumedTransfers });
      expect(reads).toBe(2); expect(result.status).toBe('unverified-claim'); expect(result.reason).toMatch(/changed while/);
      expect(result.evidenceId).toBeUndefined(); expect(consumedTransfers.size).toBe(0);
      expect((await rpc.getBlock(claim.announcement.blockNumber))?.hash).not.toBe(claim.announcement.blockHash);
      expect((await verify(claim)).status).toBe('unverified-claim');
      expect(await rpc.request('eth_getTransactionReceipt', [claim.announcement.transactionHash])).toBeNull();
    });
  });
});
