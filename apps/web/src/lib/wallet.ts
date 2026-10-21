import { parseQuantity, type Address, type Hex } from '@ghostpay/chain-adapters';
import { getAddress, isAddress } from 'viem/utils';
import { UserFacingError } from './errors';

/** Minimal EIP-1193 provider surface. */
export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown>;
}

export interface WalletInfo {
  readonly id: string;
  readonly name: string;
  /** Only ever a short `data:image/...;base64,` URI, otherwise omitted. */
  readonly icon?: string;
  readonly rdns?: string;
  readonly kind: 'eip6963' | 'injected';
  readonly provider: Eip1193Provider;
}

export interface WindowLike {
  addEventListener(type: string, listener: (e: Event) => void): void;
  removeEventListener(type: string, listener: (e: Event) => void): void;
  dispatchEvent(e: Event): boolean;
  readonly ethereum?: unknown;
}

const ICON_RE = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_ICON = 64 * 1024;

function isProvider(v: unknown): v is Eip1193Provider {
  return typeof v === 'object' && v !== null && typeof (v as { request?: unknown }).request === 'function';
}

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return t.length === 0 ? undefined : t.slice(0, max);
}

/**
 * EIP-6963 discovery plus a labelled `window.ethereum` fallback. Announcement payloads are untrusted: names are
 * stripped and truncated, icons accepted only as short base64 data URIs, duplicates by uuid dropped.
 */
export async function discoverWallets(win: WindowLike, waitMs = 150): Promise<readonly WalletInfo[]> {
  const found = new Map<string, WalletInfo>();
  const onAnnounce = (e: Event): void => {
    const detail = (e as CustomEvent<unknown>).detail as { info?: Record<string, unknown>; provider?: unknown } | null;
    if (detail === null || typeof detail !== 'object' || detail.info === undefined || !isProvider(detail.provider)) return;
    const uuid = cleanText(detail.info['uuid'], 64);
    const name = cleanText(detail.info['name'], 40);
    if (uuid === undefined || name === undefined || found.has(uuid)) return;
    const icon = detail.info['icon'];
    const rdns = cleanText(detail.info['rdns'], 80);
    found.set(uuid, {
      id: `6963:${uuid}`,
      name,
      kind: 'eip6963',
      provider: detail.provider,
      ...(typeof icon === 'string' && icon.length <= MAX_ICON && ICON_RE.test(icon) ? { icon } : {}),
      ...(rdns === undefined ? {} : { rdns }),
    });
  };
  win.addEventListener('eip6963:announceProvider', onAnnounce);
  win.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((r) => setTimeout(r, waitMs));
  win.removeEventListener('eip6963:announceProvider', onAnnounce);
  const list = [...found.values()];
  if (list.length === 0 && isProvider(win.ethereum)) {
    list.push({ id: 'injected', name: 'Browser wallet (EIP-1193 injected)', kind: 'injected', provider: win.ethereum });
  }
  return list;
}

export interface WalletSession {
  readonly wallet: WalletInfo;
  readonly account: Address;
  readonly chainId: number;
}

async function call(p: Eip1193Provider, method: string, params?: readonly unknown[]): Promise<unknown> {
  try {
    return await p.request(params === undefined ? { method } : { method, params });
  } catch (e) {
    const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
    if (code === 4001) throw new UserFacingError('You rejected the request in your wallet.');
    throw new WalletCallError(method, code);
  }
}

/** Raised for provider failures; the message carries no provider-supplied text. */
export class WalletCallError extends Error {
  public constructor(
    public readonly method: string,
    public readonly rpcCode: unknown,
  ) {
    super(`Wallet call failed: ${method}`);
    this.name = 'WalletCallError';
  }
}

function toAccount(v: unknown): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) throw new UserFacingError('The wallet returned an invalid account.');
  return getAddress(v);
}

function firstAccount(v: unknown): Address {
  if (!Array.isArray(v) || v.length === 0) throw new UserFacingError('The wallet returned no accounts.');
  return toAccount(v[0]);
}

async function readChainId(p: Eip1193Provider): Promise<number> {
  let id: bigint;
  try {
    id = parseQuantity(await call(p, 'eth_chainId'));
  } catch (e) {
    if (e instanceof UserFacingError || e instanceof WalletCallError) throw e;
    throw new UserFacingError('The wallet returned an invalid chain id.');
  }
  if (id < 1n || id > BigInt(Number.MAX_SAFE_INTEGER)) throw new UserFacingError('The wallet returned an invalid chain id.');
  const n = Number(id);
  // Consistency probe: a provider that answers net_version must agree with eth_chainId. This cannot defeat a
  // consistently lying provider; the independent RPC check after sending covers that when an RPC is configured.
  let net: unknown;
  try {
    net = await p.request({ method: 'net_version' });
  } catch {
    net = undefined;
  }
  if ((typeof net === 'string' || typeof net === 'number') && String(net) !== String(n)) {
    throw new UserFacingError('The wallet gave contradictory chain ids. Refusing to continue.');
  }
  return n;
}

/**
 * Connects and verifies a wallet: account lists from `eth_requestAccounts` and `eth_accounts` must agree and the chain
 * must equal the invoice chain (one switch request is offered). Any inconsistency refuses the connection.
 */
export async function connectWallet(wallet: WalletInfo, expectedChainId: number): Promise<WalletSession> {
  const requested = firstAccount(await call(wallet.provider, 'eth_requestAccounts'));
  const listed = firstAccount(await call(wallet.provider, 'eth_accounts'));
  if (requested !== listed) throw new UserFacingError('The wallet reported inconsistent accounts. Refusing to continue.');
  let chainId = await readChainId(wallet.provider);
  if (chainId !== expectedChainId) {
    try {
      await call(wallet.provider, 'wallet_switchEthereumChain', [{ chainId: `0x${expectedChainId.toString(16)}` }]);
    } catch (e) {
      if (e instanceof UserFacingError) throw e;
    }
    chainId = await readChainId(wallet.provider);
    if (chainId !== expectedChainId) {
      throw new UserFacingError(`Your wallet is on chain ${String(chainId)} but this invoice requires chain ${String(expectedChainId)}. Switch networks in your wallet.`);
    }
  }
  return { wallet, account: requested, chainId };
}

/** Re-reads account and chain immediately before a signature or send. */
export async function recheckWallet(s: WalletSession): Promise<void> {
  const acct = firstAccount(await call(s.wallet.provider, 'eth_accounts'));
  if (acct !== s.account) throw new UserFacingError('The selected wallet account changed. Reconnect and review again.');
  const chainId = await readChainId(s.wallet.provider);
  if (chainId !== s.chainId) throw new UserFacingError('The wallet network changed. Reconnect and review again.');
}

export interface TxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** Sends one transaction through the wallet and returns its hash (shape-checked only). */
export async function sendViaWallet(s: WalletSession, tx: TxRequest): Promise<Hex> {
  await recheckWallet(s);
  const hash = await call(s.wallet.provider, 'eth_sendTransaction', [
    { from: s.account, to: tx.to, data: tx.data, value: `0x${tx.value.toString(16)}`, chainId: `0x${s.chainId.toString(16)}` },
  ]);
  if (typeof hash !== 'string' || !HASH_RE.test(hash)) throw new UserFacingError('The wallet did not return a valid transaction hash.');
  return hash.toLowerCase() as Hex;
}

/** `eth_signTypedData_v4`; the caller verifies the recovered signer. */
export async function signTypedDataViaWallet(s: WalletSession, typedDataJson: string): Promise<Hex> {
  await recheckWallet(s);
  const sig = await call(s.wallet.provider, 'eth_signTypedData_v4', [s.account, typedDataJson]);
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new UserFacingError('The wallet returned an invalid signature.');
  return sig as Hex;
}

/** Raised when the transaction the network saw differs from the one that was previewed. */
export class SubmissionMismatchError extends UserFacingError {
  public constructor(public readonly field: string) {
    super(`The wallet submitted a transaction that differs from the preview (${field}). Do not trust this payment: check your wallet and the block explorer.`);
    this.name = 'SubmissionMismatchError';
  }
}

export interface RpcRequester {
  request(method: string, params: readonly unknown[]): Promise<unknown>;
}

export interface SeenTx {
  readonly hash: Hex;
  readonly from: Address;
  readonly to: Address | null;
  readonly input: Hex;
  readonly value: bigint;
  readonly chainId: bigint | undefined;
}

function parseSeenTx(v: unknown): SeenTx | undefined {
  if (v === null) return undefined;
  if (typeof v !== 'object') throw new UserFacingError('Your RPC returned an unexpected transaction shape.');
  const o = v as Record<string, unknown>;
  try {
    return {
      hash: String(o['hash']).toLowerCase() as Hex,
      from: toAccount(o['from']),
      to: o['to'] === null ? null : toAccount(o['to']),
      input: String(o['input'] ?? o['data']).toLowerCase() as Hex,
      value: parseQuantity(o['value']),
      chainId: o['chainId'] === undefined ? undefined : parseQuantity(o['chainId']),
    };
  } catch {
    throw new UserFacingError('Your RPC returned an unexpected transaction shape.');
  }
}

export type SubmissionCheck = 'verified' | 'not-visible-yet';

/**
 * Compares the transaction visible on the user's own RPC with what was previewed. A provider that lies about the
 * chain or mutates the transaction is caught here (when an RPC is configured).
 */
export async function verifySubmission(
  rpc: RpcRequester,
  hash: Hex,
  expected: { readonly from: Address; readonly to: Address; readonly data: Hex; readonly value: bigint; readonly chainId: number },
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  attempts = 6,
): Promise<SubmissionCheck> {
  const expFrom = getAddress(expected.from);
  const expTo = getAddress(expected.to);
  for (let i = 0; i < attempts; i++) {
    const seen = parseSeenTx(await rpc.request('eth_getTransactionByHash', [hash]));
    if (seen !== undefined) {
      if (seen.hash !== hash.toLowerCase()) throw new SubmissionMismatchError('hash');
      if (seen.from !== expFrom) throw new SubmissionMismatchError('sender');
      if (seen.to === null || seen.to !== expTo) throw new SubmissionMismatchError('destination contract');
      if (seen.input !== expected.data.toLowerCase()) throw new SubmissionMismatchError('call data');
      if (seen.value !== expected.value) throw new SubmissionMismatchError('value');
      if (seen.chainId !== undefined && seen.chainId !== BigInt(expected.chainId)) throw new SubmissionMismatchError('chain');
      return 'verified';
    }
    if (i < attempts - 1) await sleep(1500);
  }
  return 'not-visible-yet';
}

export interface ReceiptInfo {
  readonly status: 'success' | 'reverted';
  readonly blockNumber: bigint;
}

/** Polls the user's RPC for a receipt; returns undefined if none appears within the attempts. */
export async function pollReceipt(
  rpc: RpcRequester,
  hash: Hex,
  expectedTo: Address,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  attempts = 20,
): Promise<ReceiptInfo | undefined> {
  for (let i = 0; i < attempts; i++) {
    const r = await rpc.request('eth_getTransactionReceipt', [hash]);
    if (r !== null) {
      if (typeof r !== 'object') throw new UserFacingError('Your RPC returned an unexpected receipt shape.');
      const o = r as Record<string, unknown>;
      let to: Address | undefined;
      try {
        to = o['to'] === null || o['to'] === undefined ? undefined : toAccount(o['to']);
        const status = parseQuantity(o['status']);
        if (to !== undefined && to !== getAddress(expectedTo)) throw new SubmissionMismatchError('receipt destination');
        return { status: status === 1n ? 'success' : 'reverted', blockNumber: parseQuantity(o['blockNumber']) };
      } catch (e) {
        if (e instanceof UserFacingError) throw e;
        throw new UserFacingError('Your RPC returned an unexpected receipt shape.');
      }
    }
    await sleep(2000);
  }
  return undefined;
}
