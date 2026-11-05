import { parseQuantity, type Address, type Hex } from '@ghostpay/chain-adapters';
import { getAddress, isAddress, keccak256, toBytes } from 'viem/utils';
import { beginAttempt, browserAttemptStorage, finishAttempt, type AttemptInput } from './duplicateAttemptJournal';
import { UserFacingError } from './errors';

/** Minimal EIP-1193 provider surface. */
export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: () => void): void;
  removeListener?(event: string, listener: () => void): void;
}

export interface WalletInfo {
  readonly id: string;
  readonly name: string;
  /** Only ever a short `data:image/...;base64,` URI, otherwise omitted. */
  readonly icon?: string;
  readonly rdns?: string;
  /** True when a second announcement reused this uuid with a different name or rdns (impersonation attempt, S3-22). */
  readonly conflict?: boolean;
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
const MAX_WALLETS = 32;
const MAX_ANNOUNCEMENTS = 256;
const MAX_METADATA_TEXT = 1024;
const MAX_DISCOVERY_MS = 1000;

function isProvider(v: unknown): v is Eip1193Provider {
  try {
    return typeof v === 'object' && v !== null && typeof (v as { request?: unknown }).request === 'function';
  } catch { return false; }
}

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string' || v.length > MAX_METADATA_TEXT) return undefined;
  // Control, format (bidi, zero-width), private-use and tag characters are removed: a wallet name must render as it reads.
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f]|\p{Cf}|\p{Co}|[\u{E0000}-\u{E007F}]/gu, '').trim();
  return t.length === 0 ? undefined : t.slice(0, max);
}

/**
 * EIP-6963 discovery plus a labelled `window.ethereum` fallback. Announcement payloads are untrusted: names are
 * stripped and truncated, icons accepted only as short base64 data URIs, duplicates by uuid dropped.
 * One bounded discovery window processes at most 256 announcements and retains at most 32 providers.
 */
export async function discoverWallets(win: WindowLike, waitMs = 150): Promise<readonly WalletInfo[]> {
  const found = new Map<string, WalletInfo>();
  let active = true;
  let announcements = 0;
  const onAnnounce = (e: Event): void => {
    // Count before reflecting any property, including event.detail: getters may throw or re-enter discovery.
    if (!active || announcements >= MAX_ANNOUNCEMENTS) return;
    announcements++;
    try {
      const detail = (e as CustomEvent<unknown>).detail as { info?: unknown; provider?: unknown } | null;
      if (detail === null || typeof detail !== 'object') return;
      const info = detail.info;
      const provider = detail.provider;
      if (typeof info !== 'object' || info === null || !isProvider(provider)) return;
      // Capture every field once. A changing getter must not validate one identity/provider and return another.
      const metadata = info as Record<string, unknown>;
      const uuid = cleanText(metadata['uuid'], 64);
      const name = cleanText(metadata['name'], 40);
      if (uuid === undefined || name === undefined) return;
      const icon = metadata['icon'];
      const rdns = cleanText(metadata['rdns'], 80);
      const prior = found.get(uuid);
      if (prior !== undefined) {
        // First announcement wins; conflicting metadata is a warning, never proof of wallet identity.
        if (prior.name !== name || prior.rdns !== rdns) found.set(uuid, { ...prior, conflict: true });
        return;
      }
      if (found.size >= MAX_WALLETS) return;
      found.set(uuid, {
        id: `6963:${uuid}`,
        name,
        kind: 'eip6963',
        provider,
        ...(typeof icon === 'string' && icon.length <= MAX_ICON && ICON_RE.test(icon) ? { icon } : {}),
        ...(rdns === undefined ? {} : { rdns }),
      });
    } catch {
      // EIP-6963 payloads are untrusted page objects, including accessors and revoked proxies.
    }
  };
  try {
    win.addEventListener('eip6963:announceProvider', onAnnounce);
    win.dispatchEvent(new Event('eip6963:requestProvider'));
    const duration = Number.isFinite(waitMs) ? Math.max(0, Math.min(MAX_DISCOVERY_MS, waitMs)) : 150;
    await new Promise((resolve) => setTimeout(resolve, duration));
  } catch {
    throw new UserFacingError('Wallet discovery could not start. Retry or use another wallet.');
  } finally {
    active = false;
    try { win.removeEventListener('eip6963:announceProvider', onAnnounce); } catch { /* Closed callback ignores late events even if cleanup fails. */ }
  }
  const list = [...found.values()];
  if (list.length === 0) {
    try {
      const injected = win.ethereum;
      if (isProvider(injected)) list.push({ id: 'injected', name: 'Browser wallet (EIP-1193 injected)', kind: 'injected', provider: injected });
    } catch { /* A hostile injected getter is not an available wallet. */ }
  }
  return list;
}

const SCRIPTS: readonly (readonly [string, RegExp])[] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
];

/**
 * Warnings for the wallet picker (S3-22): two wallets sharing a name, a uuid announced twice with different identity,
 * letters from several alphabets in one name (lookalikes), a non-ASCII name, or no rdns. Wallet identity is
 * self-declared by the page that announces it; these are hints, not proof.
 */
export function walletWarnings(list: readonly WalletInfo[]): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  const names = new Map<string, number>();
  for (const w of list) names.set(w.name.toLowerCase(), (names.get(w.name.toLowerCase()) ?? 0) + 1);
  for (const w of list) {
    const msgs: string[] = [];
    if ((names.get(w.name.toLowerCase()) ?? 0) > 1) msgs.push('Another wallet announced the same name. Pick the one whose identifier you recognise.');
    if (w.conflict === true) msgs.push('This wallet was announced twice with different names or identifiers. Treat it as suspicious.');
    if (SCRIPTS.filter(([, re]) => re.test(w.name)).length > 1) msgs.push('The name mixes letters from different alphabets, which is a common lookalike trick.');
    else if (/[^\x20-\x7e]/.test(w.name)) msgs.push('The name contains non-ASCII characters.');
    if (w.kind === 'eip6963' && w.rdns === undefined) msgs.push('It did not announce a reverse-DNS identifier.');
    if (msgs.length > 0) out.set(w.id, msgs);
  }
  return out;
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
    let code: number | undefined;
    try { code = typeof e === 'object' && e !== null ? cleanRpcCode((e as { code?: unknown }).code) : undefined; } catch { /* A thrown error can itself be a hostile proxy/accessor. */ }
    if (code === 4001) throw new UserFacingError('You rejected the request in your wallet.');
    throw new WalletCallError(method, code);
  }
}

/** Diagnostic codes only: EIP-1193 provider errors and standard JSON-RPC errors/server range. */
function cleanRpcCode(code: unknown): number | undefined {
  if (typeof code !== 'number' || !Number.isSafeInteger(code)) return undefined;
  return [4001, 4100, 4200, 4900, 4901, -32700, -32600, -32601, -32602, -32603].includes(code) || (code >= -32099 && code <= -32000) ? code : undefined;
}

/** Raised for provider failures; the message carries no provider-supplied text. */
export class WalletCallError extends Error {
  public readonly rpcCode: number | undefined;
  public constructor(
    public readonly method: string,
    rpcCode: unknown,
  ) {
    super(`Wallet call failed: ${method}`);
    this.name = 'WalletCallError';
    this.rpcCode = cleanRpcCode(rpcCode);
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

async function readChainId(p: Eip1193Provider, assertCurrent?: () => void): Promise<number> {
  assertCurrent?.();
  let id: bigint;
  try {
    const answer = await call(p, 'eth_chainId');
    assertCurrent?.();
    id = parseQuantity(answer);
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
  assertCurrent?.();
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
export async function recheckWallet(s: WalletSession, assertCurrent?: () => void): Promise<void> {
  assertCurrent?.();
  const acct = firstAccount(await call(s.wallet.provider, 'eth_accounts'));
  assertCurrent?.();
  if (acct !== s.account) throw new UserFacingError('The selected wallet account changed. Reconnect and review again.');
  const chainId = await readChainId(s.wallet.provider, assertCurrent);
  assertCurrent?.();
  if (chainId !== s.chainId) throw new UserFacingError('The wallet network changed. Reconnect and review again.');
  const finalAccount = firstAccount(await call(s.wallet.provider, 'eth_accounts'));
  assertCurrent?.();
  if (finalAccount !== s.account) throw new UserFacingError('The selected wallet account changed. Reconnect and review again.');
}

export interface TxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export interface WalletAttemptOptions {
  readonly kind: AttemptInput['kind'];
  /**
   * Logical action identity. For payments, the signed invoice digest: it replaces the calldata, which carries fresh
   * stealth randomness. For other kinds it narrows the calldata key, so the same approval or revoke for a later invoice
   * is a new action while repeating it for one invoice stays a duplicate (L2-I3).
   */
  readonly scope?: string;
}
export function walletAttemptKey(s: WalletSession, tx: TxRequest, options?: WalletAttemptOptions): string {
  const call = [tx.to.toLowerCase(), tx.data.toLowerCase(), tx.value.toString()];
  const payment = options?.kind === 'payment' && options.scope !== undefined;
  return keccak256(toBytes(JSON.stringify([
    s.chainId, payment ? 'invoice-payer' : s.account.toLowerCase(), options?.kind ?? 'transaction',
    payment ? options.scope : options?.scope === undefined ? call : [options.scope, ...call],
  ])));
}
/** Returned hash is preserved even if tab storage fails after broadcast. */
export class WalletBroadcastError extends UserFacingError {
  public constructor(public readonly hash: Hex) {
    super(`The wallet returned transaction ${hash}, but its hash could not be saved in this tab. Do not repeat the request; check your wallet.`);
    this.name = 'WalletBroadcastError';
  }
}
function walletAuthority(s: WalletSession, assertCurrent?: () => void): { assert: () => void; dispose: () => void } {
  const provider = s.wallet.provider;
  const account = s.account;
  const chainId = s.chainId;
  let changed = false;
  const onChanged = (): void => { changed = true; };
  const events = ['accountsChanged', 'chainChanged', 'disconnect'];
  const dispose = (): void => {
    for (const event of events) {
      try { provider.removeListener?.(event, onChanged); } catch { /* Provider cleanup cannot erase a returned hash. */ }
    }
  };
  if (provider.on !== undefined && provider.removeListener !== undefined) {
    try { for (const event of events) provider.on(event, onChanged); } catch {
      dispose();
      throw new UserFacingError('The wallet could not be monitored for account or network changes. Reconnect before continuing.');
    }
  }
  return {
    assert: () => {
      assertCurrent?.();
      if (changed || s.wallet.provider !== provider || s.account !== account || s.chainId !== chainId) {
        throw new UserFacingError('The wallet account, network or provider changed. Reconnect and review again.');
      }
    },
    dispose,
  };
}
/** Sends one transaction through the wallet. An initiated wallet request cannot be cancelled by this page. */
export async function sendViaWallet(s: WalletSession, tx: TxRequest, assertCurrent?: () => void, options?: WalletAttemptOptions): Promise<Hex> {
  const authority = walletAuthority(s, assertCurrent);
  try {
    await recheckWallet(s, authority.assert);
    authority.assert();
    const storage = browserAttemptStorage();
    const attempt = storage === undefined ? undefined : beginAttempt({
      key: walletAttemptKey(s, tx, options), chainId: s.chainId, account: s.account.toLowerCase(), kind: options?.kind ?? 'transaction',
    }, storage);
    // No await between this final authority check, the journal write, and provider invocation.
    authority.assert();
    let hash: unknown;
    try {
      hash = await call(s.wallet.provider, 'eth_sendTransaction', [
        { from: s.account, to: tx.to, data: tx.data, value: `0x${tx.value.toString(16)}`, chainId: `0x${s.chainId.toString(16)}` },
      ]);
    } catch (e) {
      if (e instanceof UserFacingError) throw e;
      throw new UserFacingError('The wallet request failed with an unknown outcome and may already have been submitted. Check your wallet and the chain before explicitly clearing this attempt; do not send again blindly.');
    }
    if (typeof hash !== 'string' || !HASH_RE.test(hash)) throw new UserFacingError('The wallet did not return a valid transaction hash. The outcome is unknown; check your wallet before another attempt.');
    const normalized = hash.toLowerCase() as Hex;
    if (attempt !== undefined) {
      try { finishAttempt(attempt, normalized, storage); } catch { throw new WalletBroadcastError(normalized); }
    }
    return normalized;
  } finally { authority.dispose(); }

}

/** `eth_signTypedData_v4`; the caller verifies the recovered signer. */
export async function signTypedDataViaWallet(s: WalletSession, typedDataJson: string, assertCurrent?: () => void): Promise<Hex> {
  const authority = walletAuthority(s, assertCurrent);
  try {
    await recheckWallet(s, authority.assert);
    authority.assert();
    const sig = await call(s.wallet.provider, 'eth_signTypedData_v4', [s.account, typedDataJson]);
    authority.assert();
    if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new UserFacingError('The wallet returned an invalid signature.');
    return sig as Hex;
  } finally { authority.dispose(); }

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
