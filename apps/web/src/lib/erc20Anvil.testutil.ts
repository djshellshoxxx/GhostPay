// TEST-ONLY harness for the ERC-20 payment and recovery qualification on a disposable local anvil.
// Real compiled GhostPayRouter + ERC5564Announcer + test ERC-20s (packages/contracts/out) and real JSON-RPC on loopback.
// The production token allowlist is not changed: mock token runtime code is injected at the allowlisted address of
// THIS anvil only (anvil_setCode), exactly as chain-adapters' payments.anvil.test.ts does. This is not deployed USDC,
// not a live-chain result and not an audit. Public repeated-byte dev keys only; no real funds or secrets.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHAINS, createClient, loadDeployment, tokensForChain,
  type Address, type ChainConfig, type DeploymentManifest, type Hex, type RpcClient,
} from '@ghostpay/chain-adapters';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Eip1193Provider } from './wallet';

const ANVIL = process.env['ANVIL_BIN'] ?? 'anvil';
const OUT = process.env['ERC20_QUAL_ARTIFACTS'] ?? resolve(import.meta.dirname, '../../../../packages/contracts/out');
const ART = {
  router: 'GhostPayRouter', announcer: 'ERC5564Announcer', mock: 'MockERC20', feeOnTransfer: 'FeeOnTransferToken', permit: 'PermitToken',
} as const;
const artifactPath = (name: string): string => resolve(OUT, `${name}.sol/${name}.json`);

/** True when anvil runs and every compiled artifact exists. A skip is not a pass: CI sets REQUIRE_ANVIL=1. */
export const erc20AnvilAvailable: boolean = spawnSync(ANVIL, ['--version'], { stdio: 'ignore' }).status === 0
  && Object.values(ART).every((name) => existsSync(artifactPath(name)));
export const erc20AnvilRequired: boolean = process.env['REQUIRE_ANVIL'] === '1';

/** Distinct, obviously synthetic keys (repeated bytes). Never used anywhere but a disposable anvil. */
export const KEYS = {
  deployer: `0x${'d1'.repeat(32)}`,
  payer: `0x${'a1'.repeat(32)}`,
  payer2: `0x${'a2'.repeat(32)}`,
  payer3: `0x${'a3'.repeat(32)}`,
  attacker: `0x${'e1'.repeat(32)}`,
} as const satisfies Record<string, Hex>;
export const FEE_RECIPIENT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
/** Never deployed here: relayed sweeps are out of scope for this qualification. */
const PLACEHOLDER_RELAYER: Address = '0x0000000000000000000000000000000000000c33';
/** OP Stack GasPriceOracle predeploy (Base Sepolia is an OP chain). */
const OP_ORACLE: Address = '0x420000000000000000000000000000000000000F';
/** Runtime code that answers every call with 32 zero bytes: an oracle that reports no L1 data or operator fee. */
const ZERO_ORACLE_CODE: Hex = '0x600060005260206000f3';

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function mint(address,uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const parsed = JSON.parse(readFileSync(artifactPath(name), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: parsed.abi, bytecode: parsed.bytecode.object };
}

/** Every anvil this process spawned and has not seen exit: a timed-out hook never reaches `stop`, so exit reaps them. */
const spawned = new Set<ChildProcess>();
process.once('exit', () => { for (const proc of spawned) proc.kill('SIGKILL'); });

function startAnvil(chainId: number): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolveStart, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', String(chainId)], { stdio: ['ignore', 'pipe', 'pipe'] });
    spawned.add(proc);
    proc.once('exit', () => { spawned.delete(proc); });
    let output = '';
    const fail = (): void => { clearTimeout(timer); proc.kill('SIGKILL'); reject(new Error('local ERC-20 qualification anvil failed to start')); };
    const timer = setTimeout(fail, 30_000);
    proc.stdout?.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-65_536);
      const match = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(output);
      if (match?.[1] !== undefined) { clearTimeout(timer); resolveStart({ proc, url: `http://${match[1]}` }); }
    });
    proc.stderr?.resume();
    proc.once('error', fail);
    proc.once('exit', () => { clearTimeout(timer); reject(new Error('local ERC-20 qualification anvil exited')); });
  });
}

export type TokenKind = 'standard' | 'fee-on-transfer' | 'permit';

export interface LocalChain {
  readonly url: string;
  readonly chainId: number;
  readonly chain: ChainConfig;
  readonly rpc: RpcClient;
  readonly manifest: DeploymentManifest;
  readonly router: Address;
  readonly announcer: Address;
  /** The allowlisted token (USDC) of this chain, carrying the mock token's runtime code on this anvil only. */
  readonly usdc: Address;
  /** A second allowlisted token (EURC) with the same code, for wrong-token cases, or undefined if the chain lists none. */
  readonly eurc: Address | undefined;
  /** An ERC-20 deployed at an address that is NOT in the allowlist. */
  readonly rogueToken: Address;
  raw(method: string, params?: readonly unknown[]): Promise<unknown>;
  mine(blocks: number): Promise<void>;
  automine(on: boolean): Promise<void>;
  dropTransaction(hash: Hex): Promise<void>;
  setBalance(address: Address, wei: bigint): Promise<void>;
  balanceOf(token: Address, who: Address): Promise<bigint>;
  ethBalance(who: Address): Promise<bigint>;
  nonce(who: Address, tag?: 'latest' | 'pending'): Promise<number>;
  mint(token: Address, to: Address, amount: bigint): Promise<void>;
  /** Sends a transaction as `key` through viem (sets the nonce and fees itself) and waits for it unless automine is off. */
  send(key: Hex, tx: { to: Address; data?: Hex; value?: bigint; gas?: bigint }): Promise<Hex>;
  /** Latest block timestamp (seconds). */
  timestamp(): Promise<number>;
  stop(): void;
}

export interface LocalChainOptions {
  readonly chainId?: number;
  readonly token?: TokenKind;
  /** Accounts that get native funds and 1e12 units of every test token. */
  readonly fund?: readonly Hex[];
}

/**
 * Starts anvil, deploys the real contracts, aliases the allowlisted tokens and returns a verified RPC client. The shared
 * CI and sandbox machines can starve a freshly spawned anvil, so one attempt is bounded and retried once on a new node.
 */
export async function startLocalChain(options: LocalChainOptions = {}): Promise<LocalChain> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const holder: { proc?: ChildProcess } = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error('local ERC-20 qualification chain did not start in time')); }, 45_000); });
      return await Promise.race([startLocalChainOnce(options, holder), deadline]);
    } catch (error) {
      lastError = error;
      holder.proc?.kill('SIGKILL');
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function startLocalChainOnce(options: LocalChainOptions, holder: { proc?: ChildProcess }): Promise<LocalChain> {
  const chainId = options.chainId ?? 84532;
  const chain = CHAINS.find((c) => c.chainId === chainId);
  if (chain === undefined) throw new Error(`chain ${String(chainId)} is not in the chain table`);
  const listed = tokensForChain(chainId);
  const usdcEntry = listed.find((t) => t.symbol === 'USDC');
  if (usdcEntry === undefined) throw new Error('chain table lists no USDC for this chain');
  const eurcEntry = listed.find((t) => t.symbol === 'EURC');
  const started = await startAnvil(chainId);
  holder.proc = started.proc;
  try {
    const url = started.url;
    const viemChain = defineChain({ id: chainId, name: 'ERC-20 qualification anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } });
    const pub = createPublicClient({ transport: http(url), pollingInterval: 25 });
    const walletFor = (key: Hex): ReturnType<typeof createWalletClient> => createWalletClient({ account: privateKeyToAccount(key), chain: viemChain, transport: http(url) });
    const rawRequest = async (method: string, params: readonly unknown[] = []): Promise<unknown> => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const body = await response.json() as { result?: unknown; error?: { message?: string } };
      if (body.error !== undefined) throw new Error(`anvil ${method}: ${body.error.message ?? 'rejected'}`);
      return body.result;
    };
    const rpc = await createClient(chain, url, { allowInsecureLocalhost: true, retries: 0, chainRecheckMs: 0 });
    const fund = [KEYS.deployer, ...(options.fund ?? [KEYS.payer, KEYS.payer2, KEYS.payer3, KEYS.attacker])];
    for (const key of fund) await rawRequest('anvil_setBalance', [privateKeyToAccount(key).address, '0x21e19e0c9bab2400000']);
    const deploy = async (name: string, args: readonly unknown[] = []): Promise<Address> => {
      const art = artifact(name);
      const hash = await walletFor(KEYS.deployer).deployContract({ abi: art.abi, bytecode: art.bytecode, args, chain: null, account: privateKeyToAccount(KEYS.deployer) });
      const address = (await pub.waitForTransactionReceipt({ hash })).contractAddress;
      if (address === null || address === undefined) throw new Error('deployment produced no contract address');
      return getAddress(address);
    };
    const announcer = await deploy(ART.announcer);
    const router = await deploy(ART.router, [announcer, FEE_RECIPIENT]);
    const template = options.token === 'fee-on-transfer' ? await deploy(ART.feeOnTransfer)
      : options.token === 'permit' ? await deploy(ART.permit, [6])
        : await deploy(ART.mock, ['LOCAL MOCK USDC', 'MOCK', 6]);
    const runtime = await rawRequest('eth_getCode', [template, 'latest']) as Hex;
    const usdc = getAddress(usdcEntry.address);
    const eurc = eurcEntry === undefined ? undefined : getAddress(eurcEntry.address);
    for (const aliased of [usdc, ...(eurc === undefined ? [] : [eurc])]) {
      await rawRequest('anvil_setCode', [aliased, runtime]);
      // setCode moves code, not storage: ERC20.name() lives in storage slot 3 (after balances, allowances, supply). The
      // permit domain name is an immutable inside the code, so the stored name must match it for permit domains to agree.
      if (options.token === 'permit') await rawRequest('anvil_setStorageAt', [aliased, '0x3', `0x${Buffer.from('PermitToken').toString('hex').padEnd(62, '0')}16`]);
    }
    const rogueToken = await deploy(ART.mock, ['ROGUE', 'ROGUE', 6]);
    if (chain.opStack === true) await rawRequest('anvil_setCode', [OP_ORACLE, ZERO_ORACLE_CODE]);

    const manifest = loadDeployment(JSON.stringify({
      chainId, announcer, router, sweepRelayer: PLACEHOLDER_RELAYER, feeRecipient: FEE_RECIPIENT, feeBps: 25,
      deployTx: { router: `0x${'a'.repeat(64)}`, sweepRelayer: `0x${'b'.repeat(64)}` },
      solcVersion: '0.8.28+commit.7893614a', commit: 'c'.repeat(40),
      bytecodeHashes: { router: `0x${'d'.repeat(64)}`, sweepRelayer: `0x${'e'.repeat(64)}` },
      date: '2026-01-01T00:00:00Z',
    }), chainId);

    const local: LocalChain = {
      url, chainId, chain, rpc, manifest, router, announcer, usdc, eurc, rogueToken,
      raw: rawRequest,
      mine: async (blocks) => { await rawRequest('anvil_mine', [`0x${blocks.toString(16)}`]); },
      automine: async (on) => { await rawRequest('evm_setAutomine', [on]); },
      dropTransaction: async (hash) => { await rawRequest('anvil_dropTransaction', [hash]); },
      setBalance: async (address, wei) => { await rawRequest('anvil_setBalance', [address, `0x${wei.toString(16)}`]); },
      balanceOf: (token, who) => pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] }),
      ethBalance: (who) => pub.getBalance({ address: who }),
      nonce: async (who, tag = 'latest') => Number(BigInt(await rawRequest('eth_getTransactionCount', [who, tag]) as string)),
      mint: async (token, to, amount) => {
        const hash = await walletFor(KEYS.deployer).writeContract({ address: token, abi: erc20Abi, functionName: 'mint', args: [to, amount], chain: null, account: privateKeyToAccount(KEYS.deployer) });
        await pub.waitForTransactionReceipt({ hash });
      },
      send: async (key, tx) => walletFor(key).sendTransaction({ to: tx.to, ...(tx.data === undefined ? {} : { data: tx.data }), ...(tx.value === undefined ? {} : { value: tx.value }), ...(tx.gas === undefined ? {} : { gas: tx.gas }), chain: null, account: privateKeyToAccount(key) }),
      timestamp: async () => Number(BigInt((await rawRequest('eth_getBlockByNumber', ['latest', false]) as { timestamp: string }).timestamp)),
      stop: () => { started.proc.kill('SIGKILL'); },
    };
    for (const key of fund.filter((k) => k !== KEYS.deployer)) {
      for (const token of [usdc, ...(eurc === undefined ? [] : [eurc]), rogueToken]) await local.mint(token, privateKeyToAccount(key).address, 10n ** 12n);
    }
    return local;
  } catch (error) {
    started.proc.kill('SIGKILL');
    throw error;
  }
}

export interface AnvilWalletOptions {
  /** What the wallet reports as its network (default: the chain's). */
  readonly reportedChainId?: number;
  /**
   * `broadcast-then-error`: the transaction is really sent and mined/queued, then the call fails like a wallet that
   * crashed after broadcasting (the page never receives the hash).
   */
  readonly mode?: 'normal' | 'broadcast-then-error';
  /** Changes the transaction before it is really broadcast: a wallet (or a malicious extension) that edits the request. */
  readonly mutate?: (tx: { to: Address; data?: Hex; value?: string }) => { to: Address; data?: Hex; value?: string };
}

/** EIP-1193 wallet backed by a synthetic key: really signs and broadcasts to the local anvil. Records every call. */
export class AnvilWallet implements Eip1193Provider {
  public readonly calls: { readonly method: string; readonly params: unknown }[] = [];
  /** Hashes of transactions this wallet really broadcast. */
  public readonly hashes: Hex[] = [];
  public readonly account: Address;
  /** The network this wallet reports; a test may change it to model the user switching networks mid-flow. */
  public reportedChainId: number;
  public constructor(private readonly local: LocalChain, private readonly key: Hex, private readonly options: AnvilWalletOptions = {}) {
    this.account = privateKeyToAccount(key).address;
    this.reportedChainId = options.reportedChainId ?? local.chainId;
  }
  public get sendCount(): number { return this.calls.filter((c) => c.method === 'eth_sendTransaction').length; }
  public async request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown> {
    this.calls.push({ method: args.method, params: args.params });
    const reported = this.reportedChainId;
    switch (args.method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [this.account];
      case 'eth_chainId':
        return `0x${reported.toString(16)}`;
      case 'net_version':
        return String(reported);
      case 'wallet_switchEthereumChain':
        throw Object.assign(new Error('this synthetic wallet cannot switch networks'), { code: 4902 });
      case 'eth_sendTransaction': {
        const requested = (args.params as readonly [{ to: Address; data?: Hex; value?: string; from?: string }])[0];
        const tx = this.options.mutate === undefined ? requested : this.options.mutate(requested);
        const hash = await this.local.send(this.key, { to: tx.to, ...(tx.data === undefined ? {} : { data: tx.data }), ...(tx.value === undefined ? {} : { value: BigInt(tx.value) }) });
        this.hashes.push(hash);
        if (this.options.mode === 'broadcast-then-error') throw Object.assign(new Error('wallet crashed after broadcasting'), { code: -32603 });
        return hash;
      }
      case 'eth_signTypedData_v4': {
        const [, json] = args.params as readonly [string, string];
        const typed = JSON.parse(json) as { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
        const { EIP712Domain: _domain, ...types } = typed.types;
        void _domain;
        return privateKeyToAccount(this.key).signTypedData({ domain: typed.domain, types, primaryType: typed.primaryType, message: typed.message });
      }
      default:
        throw new Error(`synthetic wallet does not implement ${args.method}`);
    }
  }
}
