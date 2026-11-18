import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { getAddress, type Address, type Hex } from 'viem';

/*
 * Node-side harness for the real-chain browser journey. The browser never talks to anvil directly: the app is configured
 * with an https RPC URL (the app accepts https/wss only), and Playwright forwards exactly those request bodies to the
 * local anvil and returns anvil's bytes unchanged. Every other origin is aborted and recorded. The wallet is an EIP-6963
 * provider whose eth_sendTransaction is executed by anvil from one of its unlocked, public dev accounts.
 */

export interface DevnetState {
  readonly rpcUrl: string;
  readonly chainId: 84532;
  readonly publicKey: string;
  readonly deploymentsDir: string;
  readonly announcer: Address;
  readonly router: Address;
  readonly sweepRelayer: Address;
  readonly feeRecipient: Address;
  readonly feeBps: number;
}

/** The https URL the app is configured with; Playwright forwards it to the loopback anvil. */
export const APP_RPC = 'https://rpc.devnet.e2e.test';
export const CHAIN_HEX = '0x14a34';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Public anvil default accounts (mnemonic "test test ... junk"). LOCAL ONLY; they hold nothing real. */
export const ANVIL_ACCOUNTS = {
  payer: getAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'), // index 2
  reloadPayer: getAddress('0x90F79bf6EB2c4f870365E785982E1f101E93b906'), // index 3
  wrongChainPayer: getAddress('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'), // index 4
  destination: getAddress('0x976EA74026E726554dB657fA54763abd0C3a0aa9'), // index 6: the seller's own cold wallet
} as const;

export function loadDevnet(): DevnetState {
  const path = process.env['GHOSTPAY_DEVNET_STATE'];
  if (path === undefined) throw new Error('GHOSTPAY_DEVNET_STATE is not set; run scripts/beta/browser-devnet.sh');
  const state = JSON.parse(readFileSync(path, 'utf8')) as DevnetState;
  const url = new URL(state.rpcUrl);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || state.chainId !== 84532) throw new Error('Devnet state must name a loopback anvil on 84532.');
  return state;
}

function post(rpcUrl: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(rpcUrl), { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout: 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    });
    req.on('timeout', () => req.destroy(new Error('anvil request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

export class RpcError extends Error {
  public constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

/** Direct test-side JSON-RPC to the loopback anvil (assertions and chain control only, never on the app's behalf). */
export class Anvil {
  private id = 0;
  public constructor(public readonly rpcUrl: string) {}

  async call<T = unknown>(method: string, params: readonly unknown[] = []): Promise<T> {
    const reply = JSON.parse(await post(this.rpcUrl, JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }))) as { result?: T; error?: { code: number; message: string } };
    if (reply.error !== undefined) throw new RpcError(reply.error.code, reply.error.message);
    return reply.result as T;
  }

  async balance(address: string): Promise<bigint> { return BigInt(await this.call<string>('eth_getBalance', [address, 'latest'])); }
  async nonce(address: string): Promise<number> { return Number(BigInt(await this.call<string>('eth_getTransactionCount', [address, 'latest']))); }
  async head(): Promise<number> { return Number(BigInt(await this.call<string>('eth_blockNumber'))); }
  async mine(blocks = 1): Promise<void> { await this.call('anvil_mine', [`0x${blocks.toString(16)}`]); }
  async automine(on: boolean): Promise<void> { await this.call('evm_setAutomine', [on]); }
  async tx(hash: string): Promise<{ blockNumber: string | null; from: string; to: string | null; value: string; input: string; nonce: string } | null> {
    return this.call('eth_getTransactionByHash', [hash]);
  }
  async receipt(hash: string): Promise<{ status: string; blockNumber: string; logs: { address: string; topics: string[] }[] } | null> {
    return this.call('eth_getTransactionReceipt', [hash]);
  }
}

/** Forwards the app's https RPC to anvil byte for byte; aborts and records every other external request. */
export class DevnetNetwork {
  readonly methods: string[] = [];
  readonly unexpected: string[] = [];
  readonly sentRaw: Hex[] = [];

  public constructor(private readonly state: DevnetState, private readonly origin: string) {}

  async install(context: BrowserContext): Promise<void> {
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === this.origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
      this.unexpected.push(url.origin);
      return route.abort();
    });
    await context.route(`${APP_RPC}/**`, (route) => this.forward(route));
    await context.addInitScript((rpc) => {
      window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
    }, APP_RPC);
  }

  private async forward(route: Route): Promise<void> {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postData() ?? '';
    try {
      const parsed = JSON.parse(body) as { method?: string; params?: unknown[] } | { method?: string; params?: unknown[] }[];
      for (const call of [parsed].flat()) {
        this.methods.push(String(call.method));
        if (call.method === 'eth_sendRawTransaction') this.sentRaw.push(call.params?.[0] as Hex);
      }
    } catch {
      this.unexpected.push('unparseable RPC body');
    }
    let reply: string;
    try {
      reply = await post(this.state.rpcUrl, body);
    } catch {
      return route.abort('connectionreset');
    }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: reply });
  }
}

interface WalletTx { from?: string; to?: string; data?: string; value?: string; chainId?: string }
type WalletReply = { result: unknown } | { error: { code: number; message: string } };

/**
 * An EIP-6963 wallet in the page whose account is an unlocked anvil dev account. `chainOverride` simulates the user's
 * wallet being on another network (it then also refuses wallet_switchEthereumChain, like a wallet without that chain).
 */
export class DevnetWallet {
  chainOverride: Hex | undefined;
  readonly sends: WalletTx[] = [];
  readonly hashes: Hex[] = [];
  readonly requests: string[] = [];

  public constructor(private readonly anvil: Anvil, public readonly account: Address, public readonly name = 'Devnet Wallet') {}

  private async chainId(): Promise<Hex> {
    return this.chainOverride ?? await this.anvil.call<Hex>('eth_chainId');
  }

  async handle(method: string, params: unknown[]): Promise<WalletReply> {
    this.requests.push(method);
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return { result: [this.account] };
      case 'eth_chainId':
        return { result: await this.chainId() };
      case 'net_version':
        return { result: String(Number.parseInt(await this.chainId(), 16)) };
      case 'wallet_switchEthereumChain':
        return { error: { code: 4902, message: 'Unrecognized chain' } };
      case 'eth_sendTransaction': {
        const tx = { ...(params[0] as WalletTx) };
        this.sends.push(tx);
        if (tx.from?.toLowerCase() !== this.account.toLowerCase()) return { error: { code: 4100, message: 'Unknown account' } };
        if (this.chainOverride !== undefined) return { error: { code: 4901, message: 'Wallet is on another chain' } };
        try {
          // Exactly the object the checkout handed to the wallet; anvil fills gas/nonce/fees and checks chainId.
          const hash = await this.anvil.call<Hex>('eth_sendTransaction', [tx]);
          this.hashes.push(hash);
          return { result: hash };
        } catch (e) {
          return { error: { code: e instanceof RpcError ? e.code : -32603, message: 'Wallet send failed' } };
        }
      }
      default:
        return { error: { code: 4200, message: 'Unsupported method' } };
    }
  }

  async inject(page: Page): Promise<void> {
    await page.exposeFunction('__devnetWallet', (method: string, params: unknown[]) => this.handle(method, params));
    await page.addInitScript((info) => {
      const w = window as unknown as { __devnetWallet: (method: string, params: unknown[]) => Promise<{ result?: unknown; error?: { code: number; message: string } }> };
      const provider = {
        on: (): void => undefined,
        removeListener: (): void => undefined,
        request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
          const reply = await w.__devnetWallet(method, params ?? []);
          if (reply.error !== undefined) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
          return reply.result;
        },
      };
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'devnet-wallet', name: info.name, icon: '', rdns: 'test.e2e.devnet' }, provider },
        }));
      });
    }, { name: this.name });
  }
}
