import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Page } from '@playwright/test';
import { tokensForChain } from '@ghostpay/chain-adapters';
import {
  decodeFunctionResult, encodeDeployData, encodeFunctionData, getAddress, hashDomain, parseAbi,
  type Abi, type Address, type Hex,
} from 'viem';
import { Anvil, CHAIN_HEX, DevnetWallet, RpcError, type DevnetState } from './chain';

/** These mocks live only on the disposable loopback node. They are not issuer token deployments. */
export type Erc20Mode = 'plain' | 'permit';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const OP_ORACLE: Address = '0x420000000000000000000000000000000000000F';
const ZERO_ORACLE_CODE: Hex = '0x60206000f3';
const STARTING_TOKENS = 1_000_000_000_000n;
const TOKEN_ABI = parseAbi([
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function mint(address,uint256)',
  'function approve(address,uint256) returns (bool)',
  'function nonces(address) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]);

interface Artifact {
  readonly abi: Abi;
  readonly bytecode: { readonly object: Hex };
  readonly deployedBytecode: {
    readonly object: Hex;
    readonly immutableReferences: Record<string, readonly { readonly start: number; readonly length: number }[]>;
  };
}

/** Validate the destination before any account funding, code installation, snapshot, or transaction. */
async function requireLocalAnvil(anvil: Anvil, state: DevnetState): Promise<void> {
  const url = new URL(anvil.rpcUrl);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username !== '' || url.password !== ''
    || url.search !== '' || url.hash !== '' || url.href !== new URL(state.rpcUrl).href || state.chainId !== 84532) {
    throw new Error('ERC-20 fixture requires the declared loopback Anvil on chain 84532.');
  }
  const [client, chain] = await Promise.all([
    anvil.call<string>('web3_clientVersion'), anvil.call<Hex>('eth_chainId'),
  ]);
  if (!/^anvil\//i.test(client) || BigInt(chain) !== 84532n) {
    throw new Error('ERC-20 fixture refused a node that is not Anvil on chain 84532.');
  }
}

function loadArtifact(mode: Erc20Mode): Artifact {
  const name = mode === 'plain' ? 'MockERC20' : 'PermitToken';
  const stateFile = process.env['GHOSTPAY_DEVNET_STATE'];
  const roots = [
    ...(stateFile === undefined ? [] : [resolve(dirname(stateFile), 'forge-out')]),
    resolve(import.meta.dirname, '../../../../packages/contracts/out'),
  ];
  const path = roots.map((root) => resolve(root, `${name}.sol/${name}.json`)).find(existsSync);
  if (path === undefined) throw new Error(`Compiled ${name} is required; run forge build before the browser journey.`);
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as Artifact;
  if (!/^0x[0-9a-f]+$/i.test(artifact.bytecode.object) || !/^0x[0-9a-f]+$/i.test(artifact.deployedBytecode.object)) {
    throw new Error(`Compiled ${name} has missing or unlinked bytecode.`);
  }
  return artifact;
}

/** Ignore only the compiler-declared constructor immutables when recognizing our already installed test code. */
function normalizedRuntime(code: Hex, artifact: Artifact): string {
  const bytes = Buffer.from(code.slice(2), 'hex');
  for (const refs of Object.values(artifact.deployedBytecode.immutableReferences)) {
    for (const { start, length } of refs) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 1 || start + length > bytes.length) {
        throw new Error('Invalid immutable reference in the compiled test token.');
      }
      bytes.fill(0, start, start + length);
    }
  }
  return bytes.toString('hex');
}

async function included(anvil: Anvil, hash: Hex): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const receipt = await anvil.receipt(hash);
    if (receipt !== null) {
      if (BigInt(receipt.status) !== 1n) throw new Error('Local ERC-20 fixture transaction reverted.');
      return;
    }
    await delay(25);
  }
  throw new Error('Local ERC-20 fixture transaction was not included; fixture setup requires automining.');
}

export interface Erc20Fixture {
  readonly mode: Erc20Mode;
  readonly usdc: Address;
  readonly eurc: Address;
  /** The OP Stack reserve model is deliberately a local zero-fee oracle, never a real L1-fee qualification. */
  readonly opFeeModel: 'zero-local-stub';
  tokenBalance(token: Address, owner: Address): Promise<bigint>;
  allowance(token: Address, owner: Address, spender?: Address): Promise<bigint>;
  permitNonce(token: Address, owner: Address): Promise<bigint>;
  mint(token: Address, owner: Address, amount: bigint): Promise<Hex>;
  /** A real native transfer from the public local faucet, not an artificial balance change. */
  topUp(owner: Address, wei: bigint): Promise<Hex>;
  snapshot(): Promise<Hex>;
  revert(snapshot: Hex): Promise<void>;
}

/**
 * Reuse the existing test contracts at the existing allowlisted addresses on this Anvil only. A deployed template is
 * necessary: its runtime contains the constructor's immutable six-decimal value. Copy the ERC20 name/symbol storage
 * too; the permit domain's immutable name must agree with name() at the alias. Repeated setup recognizes the same
 * artifact and preserves chain history; callers use snapshots for isolation and assert balance deltas.
 */
export async function installErc20Fixture(anvil: Anvil, state: DevnetState, mode: Erc20Mode, accounts: readonly Address[]): Promise<Erc20Fixture> {
  if (mode !== 'plain' && mode !== 'permit') throw new Error('ERC-20 fixture mode must be plain or permit.');
  await requireLocalAnvil(anvil, state);
  const listed = tokensForChain(state.chainId);
  const usdcEntry = listed.find((token) => token.symbol === 'USDC');
  const eurcEntry = listed.find((token) => token.symbol === 'EURC');
  if (usdcEntry?.decimals !== 6 || eurcEntry?.decimals !== 6) throw new Error('Expected six-decimal USDC and EURC testnet allowlist entries.');
  const usdc = getAddress(usdcEntry.address);
  const eurc = getAddress(eurcEntry.address);
  const unlocked = (await anvil.call<Address[]>('eth_accounts')).map((account) => getAddress(account));
  const faucet = unlocked[0];
  if (faucet === undefined || accounts.some((account) => !unlocked.includes(getAddress(account)))) {
    throw new Error('ERC-20 fixture accounts must be unlocked public Anvil accounts.');
  }
  const artifact = loadArtifact(mode);
  const expected = normalizedRuntime(artifact.deployedBytecode.object, artifact);
  const existing = await Promise.all([usdc, eurc].map((address) => anvil.call<Hex>('eth_getCode', [address, 'latest'])));
  for (const code of existing) {
    if (code !== '0x' && normalizedRuntime(code, artifact) !== expected) {
      throw new Error('Refusing to replace a token with a different runtime; each ERC-20 mode needs a fresh Anvil.');
    }
  }
  if (existing.includes('0x')) {
    const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: mode === 'plain' ? ['LOCAL MOCK USDC', 'MOCK', 6] : [6] });
    const hash = await anvil.call<Hex>('eth_sendTransaction', [{ from: faucet, data }]);
    await included(anvil, hash);
    const receipt = await anvil.call<{ contractAddress: Address | null }>('eth_getTransactionReceipt', [hash]);
    if (receipt.contractAddress === null) throw new Error('Local test token deployment returned no address.');
    const template = receipt.contractAddress;
    const runtime = await anvil.call<Hex>('eth_getCode', [template, 'latest']);
    if (normalizedRuntime(runtime, artifact) !== expected) throw new Error('Local token deployment differs from its compiled artifact.');
    // OpenZeppelin ERC20 has balances, allowances and totalSupply in slots 0..2; name and symbol occupy slots 3 and 4.
    const name = await anvil.call<Hex>('eth_getStorageAt', [template, '0x3', 'latest']);
    const symbol = await anvil.call<Hex>('eth_getStorageAt', [template, '0x4', 'latest']);
    for (const [index, alias] of [usdc, eurc].entries()) {
      if (existing[index] !== '0x') continue;
      await anvil.call('anvil_setCode', [alias, runtime]);
      await anvil.call('anvil_setStorageAt', [alias, '0x3', name]);
      await anvil.call('anvil_setStorageAt', [alias, '0x4', symbol]);
    }
  }
  const read = (token: Address, data: Hex): Promise<Hex> => anvil.call<Hex>('eth_call', [{ to: token, data }, 'latest']);
  for (const token of [usdc, eurc]) {
    const decimals = decodeFunctionResult({ abi: TOKEN_ABI, functionName: 'decimals', data: await read(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'decimals' })) });
    const name = decodeFunctionResult({ abi: TOKEN_ABI, functionName: 'name', data: await read(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'name' })) });
    if (decimals !== 6 || name !== (mode === 'permit' ? 'PermitToken' : 'LOCAL MOCK USDC')) throw new Error('Local token constructor metadata is incorrect.');
    if (mode === 'permit') {
      const actual = await read(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'DOMAIN_SEPARATOR' }));
      const domain = hashDomain({
        domain: { name, version: '1', chainId: BigInt(state.chainId), verifyingContract: token },
        types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] },
      });
      if (actual.toLowerCase() !== domain.toLowerCase()) throw new Error('Local permit domain is not bound to the aliased token and chain.');
    }
  }
  const oracle = await anvil.call<Hex>('eth_getCode', [OP_ORACLE, 'latest']);
  if (oracle === '0x') await anvil.call('anvil_setCode', [OP_ORACLE, ZERO_ORACLE_CODE]);
  else if (oracle !== ZERO_ORACLE_CODE && oracle !== '0x600060005260206000f3') throw new Error('Local OP fee oracle is not the declared zero-fee test stub.');

  const send = async (from: Address, to: Address, data?: Hex, value?: bigint): Promise<Hex> => {
    await requireLocalAnvil(anvil, state);
    const hash = await anvil.call<Hex>('eth_sendTransaction', [{ from, to, ...(data === undefined ? {} : { data }), ...(value === undefined ? {} : { value: `0x${value.toString(16)}` }) }]);
    await included(anvil, hash);
    return hash;
  };
  const fixture: Erc20Fixture = {
    mode, usdc, eurc, opFeeModel: 'zero-local-stub',
    tokenBalance: async (token, owner) => BigInt(await read(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'balanceOf', args: [owner] }))),
    allowance: async (token, owner, spender = state.router) => BigInt(await read(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'allowance', args: [owner, spender] }))),
    permitNonce: async (token, owner) => BigInt(await read(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'nonces', args: [owner] }))),
    mint: (token, owner, amount) => send(faucet, token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'mint', args: [owner, amount] })),
    topUp: (owner, wei) => send(faucet, owner, undefined, wei),
    snapshot: async () => { await requireLocalAnvil(anvil, state); return anvil.call<Hex>('evm_snapshot'); },
    revert: async (snapshot) => {
      await requireLocalAnvil(anvil, state);
      if (!await anvil.call<boolean>('evm_revert', [snapshot])) throw new Error('Anvil snapshot was not restored.');
    },
  };
  for (const account of accounts) {
    for (const token of [usdc, eurc]) {
      const current = await fixture.tokenBalance(token, account);
      if (current < STARTING_TOKENS) await fixture.mint(token, account, STARTING_TOKENS - current);
      if (await fixture.allowance(token, account) !== 0n) {
        await send(account, token, encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [state.router, 0n] }));
      }
    }
  }
  return fixture;
}

type WalletReply = Awaited<ReturnType<DevnetWallet['handle']>>;
type WalletTx = DevnetWallet['sends'][number];
interface RequestControl {
  pause?: { readonly reached: () => void; readonly wait: Promise<void> };
  reject?: number;
  loseResponse?: boolean;
}

export interface WalletPause {
  /** Resolves when this actual provider request arrives, before any signing or broadcasting. */
  readonly reached: Promise<void>;
  release(): void;
}

/**
 * A manually consented browser wallet backed only by public unlocked Anvil accounts. It records provider requests
 * separately from actual broadcasts and signatures. Tests can delay a provider response, reject it, or lose a response
 * after a real broadcast; no app state, receipt, balance or RPC evidence is manufactured.
 */
export class Erc20Wallet extends DevnetWallet {
  readonly requestLog: { readonly method: string; readonly params: readonly unknown[] }[] = [];
  readonly signatures: Hex[] = [];
  selectedAccount: Address;
  private readonly controls = new Map<string, RequestControl>();

  public constructor(private readonly node: Anvil, private readonly state: DevnetState, account: Address, name = 'ERC-20 Test Wallet') {
    super(node, account, name);
    this.selectedAccount = account;
  }

  private next(method: string): RequestControl {
    let control = this.controls.get(method);
    if (control === undefined) { control = {}; this.controls.set(method, control); }
    return control;
  }

  pauseNext(method: string): WalletPause {
    const control = this.next(method);
    if (control.pause !== undefined) throw new Error('The next wallet request is already paused.');
    let arrived!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolveReached) => { arrived = resolveReached; });
    const wait = new Promise<void>((resolveWait) => { release = resolveWait; });
    control.pause = { reached: arrived, wait };
    return { reached, release };
  }

  rejectNext(method: string, code = 4001): void { this.next(method).reject = code; }
  loseNextResponse(method = 'eth_sendTransaction'): void { this.next(method).loseResponse = true; }

  async setAccount(page: Page, account: Address): Promise<void> {
    this.selectedAccount = getAddress(account);
    await this.emit(page, 'accountsChanged', [this.selectedAccount]);
  }

  async setChain(page: Page, chainId: Hex): Promise<void> {
    this.chainOverride = BigInt(chainId) === BigInt(CHAIN_HEX) ? undefined : chainId;
    await this.emit(page, 'chainChanged', chainId);
  }

  private emit(page: Page, event: string, value: unknown): Promise<void> {
    return page.evaluate(({ event, value }) => {
      (window as unknown as { __erc20WalletEvent: (event: string, value: unknown) => void }).__erc20WalletEvent(event, value);
    }, { event, value });
  }

  override async handle(method: string, params: unknown[]): Promise<WalletReply> {
    this.requests.push(method);
    this.requestLog.push({ method, params: structuredClone(params) });
    if (method === 'eth_sendTransaction') this.sends.push({ ...(params[0] as WalletTx) });
    const control = this.controls.get(method);
    this.controls.delete(method);
    if (control?.pause !== undefined) { control.pause.reached(); await control.pause.wait; }
    if (control?.reject !== undefined) return { error: { code: control.reject, message: 'User rejected the request.' } };
    try {
      let result: unknown;
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': result = [this.selectedAccount]; break;
        case 'eth_chainId': result = this.chainOverride ?? await this.node.call<Hex>('eth_chainId'); break;
        case 'net_version': result = String(BigInt(this.chainOverride ?? await this.node.call<Hex>('eth_chainId'))); break;
        case 'wallet_switchEthereumChain': return { error: { code: 4902, message: 'Unrecognized chain' } };
        case 'eth_sendTransaction': {
          const tx = params[0] as WalletTx;
          if (tx.from?.toLowerCase() !== this.selectedAccount.toLowerCase()) return { error: { code: 4100, message: 'Unknown account' } };
          if (this.chainOverride !== undefined) return { error: { code: 4901, message: 'Wallet is on another chain' } };
          await requireLocalAnvil(this.node, this.state);
          const hash = await this.node.call<Hex>('eth_sendTransaction', [tx]);
          this.hashes.push(hash);
          result = hash;
          break;
        }
        case 'eth_signTypedData_v4': {
          const [account, typedData] = params;
          if (typeof account !== 'string' || account.toLowerCase() !== this.selectedAccount.toLowerCase()) return { error: { code: 4100, message: 'Unknown account' } };
          if (this.chainOverride !== undefined) return { error: { code: 4901, message: 'Wallet is on another chain' } };
          await requireLocalAnvil(this.node, this.state);
          // Anvil accepts the typed-data object; parsing the wallet's JSON preserves every reviewed domain/message field.
          const typed: unknown = typeof typedData === 'string' ? JSON.parse(typedData) as unknown : typedData;
          const signature = await this.node.call<Hex>('eth_signTypedData_v4', [account, typed]);
          this.signatures.push(signature);
          result = signature;
          break;
        }
        default: return { error: { code: 4200, message: 'Unsupported method' } };
      }
      if (control?.loseResponse === true) return { error: { code: -32603, message: 'Wallet response was lost after completion.' } };
      return { result };
    } catch (error) {
      return { error: { code: error instanceof RpcError ? error.code : -32603, message: 'Local wallet request failed.' } };
    }
  }

  override async inject(page: Page): Promise<void> {
    await requireLocalAnvil(this.node, this.state);
    await page.exposeFunction('__erc20Wallet', (method: string, params: unknown[]) => this.handle(method, params));
    await page.addInitScript(({ name }) => {
      type Listener = (value: unknown) => void;
      const listeners = new Map<string, Set<Listener>>();
      const w = window as unknown as {
        __erc20Wallet: (method: string, params: unknown[]) => Promise<{ result?: unknown; error?: { code: number; message: string } }>;
        __erc20WalletEvent: (event: string, value: unknown) => void;
      };
      w.__erc20WalletEvent = (event, value) => { for (const listener of listeners.get(event) ?? []) listener(value); };
      const provider = {
        on: (event: string, listener: Listener): void => {
          let set = listeners.get(event);
          if (set === undefined) { set = new Set(); listeners.set(event, set); }
          set.add(listener);
        },
        removeListener: (event: string, listener: Listener): void => { listeners.get(event)?.delete(listener); },
        request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
          const reply = await w.__erc20Wallet(method, params ?? []);
          if (reply.error !== undefined) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
          return reply.result;
        },
      };
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'erc20-devnet-wallet', name, icon: '', rdns: 'test.e2e.erc20' }, provider },
        }));
      });
    }, { name: this.name });
  }
}
