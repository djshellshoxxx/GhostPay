import { parseQuantity, type Address, type Hex } from '@ghostpay/chain-adapters';
import type { Abi } from 'viem';
import { getAddress, isAddress, keccak256, toBytes } from 'viem/utils';
import { attemptTxDigest, beginAttempt, readAttempts, removeUnsentAttempt, browserAttemptStorage, finishAttempt, withAttemptJournal, type AttemptInput, type AttemptLockManager, type AttemptStorage, type JournalAccess, type WalletAttempt } from './duplicateAttemptJournal';
import { UserFacingError } from './errors';
import { TransactionOutcomeError, WalletRequestRejectedError } from './transactionOutcome';
import { prepareWalletChainSwitch, prepareWalletConnection, prepareWalletSignature, prepareWalletTransaction, requireApproval, walletRequestParams, type WalletDisclosureApproval, type WalletDisclosureGate, type WalletDisclosureRequest } from './walletDisclosure';
import type { MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR } from '../i18n/source';
import type { Translator } from '../i18n/translator';

/** Minimal EIP-1193 provider surface. */
export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] | object }): Promise<unknown>;
  // Properties with an explicit receiver: the lifecycle observer calls them with `.call(provider, ...)`.
  on?: (this: Eip1193Provider, event: string, listener: () => void) => void;
  removeListener?: (this: Eip1193Provider, event: string, listener: () => void) => void;
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
    throw new UserFacingError({ key: 'error.wallet.walletDiscoveryCouldNotStartRetryOrUseAnotherWallet' });
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
export function walletWarnings(list: readonly WalletInfo[], t: Translator['t'] = SOURCE_TRANSLATOR.t): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  const names = new Map<string, number>();
  for (const w of list) names.set(w.name.toLowerCase(), (names.get(w.name.toLowerCase()) ?? 0) + 1);
  for (const w of list) {
    const msgs: string[] = [];
    if ((names.get(w.name.toLowerCase()) ?? 0) > 1) msgs.push(t('wallet.warning.duplicateName'));
    if (w.conflict === true) msgs.push(t('wallet.warning.conflictingIdentity'));
    if (SCRIPTS.filter(([, re]) => re.test(w.name)).length > 1) msgs.push(t('wallet.warning.mixedScript'));
    else if (/[^\x20-\x7e]/.test(w.name)) msgs.push(t('wallet.warning.nonAscii'));
    if (w.kind === 'eip6963' && w.rdns === undefined) msgs.push(t('wallet.warning.missingRdns'));
    if (msgs.length > 0) out.set(w.id, msgs);
  }
  return out;
}

export interface WalletSession {
  readonly wallet: WalletInfo;
  readonly account: Address;
  readonly chainId: number;
  /**
   * When present, every later signature and send first shows its exact request through this gate and waits for an
   * explicit approval. Absent: requests go straight to the wallet, as before.
   */
  readonly disclosure?: WalletDisclosureGate;
}

async function call(p: Eip1193Provider, method: string, params?: readonly unknown[]): Promise<unknown> {
  try {
    return await p.request(params === undefined ? { method } : { method, params });
  } catch (e) {
    let code: number | undefined;
    try { code = typeof e === 'object' && e !== null ? cleanRpcCode((e as { code?: unknown }).code) : undefined; } catch { /* A thrown error can itself be a hostile proxy/accessor. */ }
    if (code === 4001) throw new WalletRequestRejectedError();
    throw new WalletCallError(method, code);
  }
}

// Re-export preserves the public wallet API; the shared type avoids a wallet/outcome import cycle.
export { WalletRequestRejectedError } from './transactionOutcome';

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
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) throw new UserFacingError({ key: 'error.wallet.theWalletReturnedAnInvalidAccount' });
  return getAddress(v);
}

function firstAccount(v: unknown): Address {
  if (!Array.isArray(v) || v.length === 0) throw new UserFacingError({ key: 'error.wallet.theWalletReturnedNoAccounts' });
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
    throw new UserFacingError({ key: 'error.wallet.theWalletReturnedAnInvalidChainId' });
  }
  if (id < 1n || id > BigInt(Number.MAX_SAFE_INTEGER)) throw new UserFacingError({ key: 'error.wallet.theWalletReturnedAnInvalidChainId' });
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
    throw new UserFacingError({ key: 'error.wallet.theWalletGaveContradictoryChainIdsRefusingToContinue' });
  }
  return n;
}

/**
 * Connects and verifies a wallet: account lists from `eth_requestAccounts` and `eth_accounts` must agree and the chain
 * must equal the invoice chain (one switch request is offered). Any inconsistency refuses the connection.
 */
export async function connectWallet(
  wallet: WalletInfo, expectedChainId: number, assertCurrent?: () => void, signal?: AbortSignal,
  options?: { readonly disclosure?: WalletDisclosureGate },
): Promise<WalletSession> {
  const disclosure = options?.disclosure;
  const provider = wallet.provider;
  let approval: WalletDisclosureApproval | undefined;
  let changed = false;
  // While a disclosed wallet call and the reads that verify its outcome run, account and network events are
  // expected (granting access announces the account, the approved switch announces its chain); the reads below
  // check the actual state. Outside these windows any event refuses: it falls between an approval and its request.
  let expectingEvents = false;
  const check = (): void => {
    assertCurrent?.();
    if (changed || signal?.aborted === true || wallet.provider !== provider) {
      throw new UserFacingError({ key: 'error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview' });
    }
    approval?.assertCurrent();
  };
  // Only a disclosed connection observes the wallet while it connects. Without a gate nothing changes.
  const stop = disclosure === undefined ? (): void => undefined : observeWalletLifecycle(provider, (event) => {
    if (event === 'disconnect' || !expectingEvents) changed = true;
  });
  try {
    check();
    if (disclosure !== undefined) approval = await reviewWalletRequest(provider, disclosure, prepareWalletConnection(expectedChainId).disclosure, check, signal);
    check();
    expectingEvents = disclosure !== undefined;
    const requested = firstAccount(await call(provider, 'eth_requestAccounts'));
    // The approval was used by the request it named; an expiry afterwards cannot take back access already granted.
    approval = undefined;
    check();
    const listed = firstAccount(await call(provider, 'eth_accounts'));
    check();
    if (requested !== listed) throw new UserFacingError({ key: 'error.wallet.theWalletReportedInconsistentAccountsRefusingToContinue' });
    let chainId = await readChainId(provider, check);
    check();
    expectingEvents = false;
    if (chainId !== expectedChainId) {
      let switchParams: unknown[] = [{ chainId: `0x${expectedChainId.toString(16)}` }];
      if (disclosure !== undefined) {
        // A network switch needs its own approval; the account-access approval cannot authorize it.
        const prepared = prepareWalletChainSwitch(expectedChainId, requested);
        approval = await reviewWalletRequest(provider, disclosure, prepared.disclosure, check, signal);
        switchParams = walletRequestParams(prepared) ?? switchParams;
      }
      check();
      try {
        expectingEvents = disclosure !== undefined;
        await call(provider, 'wallet_switchEthereumChain', switchParams);
      } catch (e) {
        if (e instanceof UserFacingError) throw e;
      }
      approval = undefined;
      chainId = await readChainId(provider);
      check();
      if (chainId !== expectedChainId) {
        throw new UserFacingError({ key: 'error.wallet.invoiceChainMismatch', values: { chain: String(chainId), expected: String(expectedChainId) } });
      }
      if (disclosure !== undefined) {
        // A disclosed switch was reviewed for this account: confirm the wallet still reports it afterwards.
        const finalAccount = firstAccount(await call(provider, 'eth_accounts'));
        check();
        if (finalAccount !== requested) throw new UserFacingError({ key: 'error.wallet.theSelectedWalletAccountChangedReconnectAndReviewAgain' });
      }
      expectingEvents = false;
    }
    return { wallet, account: requested, chainId, ...(disclosure === undefined ? {} : { disclosure }) };
  } finally { stop(); }
}

export type WalletLifecycleEvent = 'accountsChanged' | 'chainChanged' | 'disconnect';

/**
 * Bounded, disposable EIP-1193 subscription. Retained callbacks become inert before provider cleanup runs. A provider
 * with neither `on` nor `removeListener` cannot be observed (request-only wallet); one with only half refuses.
 */
export function observeWalletLifecycle(provider: Eip1193Provider, changed: (event: WalletLifecycleEvent) => void): () => void {
  let active = true;
  const bound: { readonly event: WalletLifecycleEvent; readonly listener: () => void }[] = [];
  let remove: Eip1193Provider['removeListener'];
  const dispose = (): void => {
    active = false;
    for (const { event, listener } of bound.splice(0)) {
      try { remove?.call(provider, event, listener); } catch { /* Stale callbacks are already inert. */ }
    }
  };
  try {
    const add = provider.on;
    remove = provider.removeListener;
    if (add === undefined && remove === undefined) return dispose;
    if (typeof add !== 'function' || typeof remove !== 'function') throw new Error('monitor-unavailable');
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect'] as const) {
      const listener = (): void => { if (active) changed(event); };
      // Include this entry before calling untrusted registration: it may register and then throw.
      bound.push({ event, listener });
      add.call(provider, event, listener);
    }
    return dispose;
  } catch {
    dispose();
    throw new UserFacingError({ key: 'error.wallet.theWalletCouldNotBeMonitoredForAccountOrNetwork' });
  }
}

/** Shows one connection-stage request; a wallet event while it is open cancels the still-local review. */
async function reviewWalletRequest(provider: Eip1193Provider, disclose: WalletDisclosureGate, request: WalletDisclosureRequest, check: () => void, signal?: AbortSignal): Promise<WalletDisclosureApproval> {
  const operation = new AbortController();
  const abort = (): void => { operation.abort(); };
  let stop = (): void => undefined;
  try {
    check();
    if (signal?.aborted === true) operation.abort();
    signal?.addEventListener('abort', abort, { once: true });
    stop = observeWalletLifecycle(provider, abort);
    if (operation.signal.aborted) throw new UserFacingError({ key: 'wallet.disclosure.cancelled' });
    const approval = requireApproval(await disclose(request, operation.signal));
    check();
    if (operation.signal.aborted) throw new UserFacingError({ key: 'wallet.disclosure.cancelled' });
    approval.assertCurrent();
    return approval;
  } finally {
    signal?.removeEventListener('abort', abort);
    stop();
  }
}

/** Re-reads account and chain immediately before a signature or send. */
export async function recheckWallet(s: WalletSession, assertCurrent?: () => void): Promise<void> {
  assertCurrent?.();
  const acct = firstAccount(await call(s.wallet.provider, 'eth_accounts'));
  assertCurrent?.();
  if (acct !== s.account) throw new UserFacingError({ key: 'error.wallet.theSelectedWalletAccountChangedReconnectAndReviewAgain' });
  const chainId = await readChainId(s.wallet.provider, assertCurrent);
  assertCurrent?.();
  if (chainId !== s.chainId) throw new UserFacingError({ key: 'error.wallet.theWalletNetworkChangedReconnectAndReviewAgain' });
  const finalAccount = firstAccount(await call(s.wallet.provider, 'eth_accounts'));
  assertCurrent?.();
  if (finalAccount !== s.account) throw new UserFacingError({ key: 'error.wallet.theSelectedWalletAccountChangedReconnectAndReviewAgain' });
}

export interface TxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
/** Longest wait for recording a returned hash before handing it to the caller anyway. */
const FINISH_WAIT_MS = 10_000;

export interface WalletAttemptOptions {
  readonly kind: AttemptInput['kind'];
  /**
   * Logical action identity. For payments, the signed invoice digest: it replaces the calldata, which carries fresh
   * stealth randomness. For other kinds it narrows the calldata key, so the same approval or revoke for a later invoice
   * is a new action while repeating it for one invoice stays a duplicate (L2-I3).
   */
  readonly scope?: string;
  /** Stable transaction identity across rebuilt calldata/nonces; requires a bounded explicit scope. */
  readonly logicalAction?: boolean;
  /** Observes the immediate provider hand-off after the durable attempt is written. */
  readonly onWalletRequest?: () => void;
  /** Extra locally known ABI used only to label the disclosed contract call (the bytes sent never depend on it). */
  readonly disclosureAbi?: Abi;
  /** Explicit journal store (tests, policy). Default: the durable browser journal shared by all tabs. */
  readonly storage?: AttemptStorage;
  /** Journal lock; defaults to `navigator.locks` (missing locks refuse before any wallet request). */
  readonly lockManager?: AttemptLockManager;
  /**
   * The caller already holds `ATTEMPT_JOURNAL_LOCK` around this call (Web Locks are not reentrant, so requesting it
   * again would deadlock): journal writes then run in place. Only for a caller that really holds it.
   */
  readonly journalLockHeld?: boolean;
}
/** Journal key of an invoice payment: payer- and calldata-independent, the same for every tab and account. */
export function paymentAttemptKey(chainId: number, invoiceScope: string): string {
  return keccak256(toBytes(JSON.stringify([chainId, 'invoice-payer', 'payment', invoiceScope])));
}
export function walletAttemptKey(s: Pick<WalletSession, 'chainId' | 'account'>, tx: TxRequest, options?: WalletAttemptOptions): string {
  const call = [tx.to.toLowerCase(), tx.data.toLowerCase(), tx.value.toString()];
  const payment = options?.kind === 'payment' && options.scope !== undefined;
  const logicalTransaction = options?.logicalAction === true;
  if (logicalTransaction && (options.kind !== 'transaction' || typeof options.scope !== 'string' || !/^[A-Za-z0-9:._/-]{1,1024}$/.test(options.scope))) {
    throw new UserFacingError({ key: 'policy.withdraw.logicalScope' });
  }
  if (payment) return paymentAttemptKey(s.chainId, options.scope);
  return keccak256(toBytes(JSON.stringify([
    s.chainId, logicalTransaction ? 'logical-relayer' : s.account.toLowerCase(), options?.kind ?? 'transaction',
    logicalTransaction ? ['logical-transaction-v1', options.scope] : options?.scope === undefined ? call : [options.scope, ...call],
  ])));
}
/** Returned hash is preserved even if tab storage fails after broadcast. */
export class WalletBroadcastError extends TransactionOutcomeError {
  public constructor(public readonly hash: Hex) {
    super({ phase: 'verification-incomplete', hash, code: 'HASH_PERSISTENCE', message: { key: 'transaction.walletBroadcast', values: { hash } } });
    this.name = 'WalletBroadcastError';
  }
}

/** The wallet was asked to submit; an RPC code is diagnostic data, never proof that nothing was broadcast. */
export class WalletSubmissionUnknownError extends TransactionOutcomeError {
  public constructor(public readonly rpcCode?: number, invalidHash = false) {
    super({
      phase: 'broadcast-unknown',
      ...(rpcCode === undefined ? {} : { code: rpcCode }),
      message: invalidHash
        ? { key: 'error.wallet.theWalletDidNotReturnAValidTransactionHashThe' }
        : { key: 'transaction.walletUnknown', values: { diagnostic: rpcCode === undefined ? '' : { key: 'transaction.code', values: { code: String(rpcCode) } } } },
    });
    this.name = 'WalletSubmissionUnknownError';
  }
}
function walletAuthority(s: WalletSession, assertCurrent?: () => void): { assert: () => void; dispose: () => void; signal: AbortSignal } {
  const provider = s.wallet.provider;
  const account = s.account;
  const chainId = s.chainId;
  let changed = false;
  // Aborted by any wallet change or disposal: an open disclosure review for this operation closes with it.
  const operation = new AbortController();
  const onChanged = (): void => { changed = true; operation.abort(); };
  let stop: () => void;
  if (s.disclosure !== undefined) {
    // A shown disclosure must be cancellable by any wallet change: a provider with only one of `on`/`removeListener`
    // refuses, and callbacks become inert before untrusted removal can reenter them. A request-only provider (neither)
    // cannot be observed; the wallet recheck after approval still re-reads its account and network.
    stop = observeWalletLifecycle(provider, onChanged);
  } else {
    const events = ['accountsChanged', 'chainChanged', 'disconnect'];
    stop = (): void => {
      for (const event of events) {
        try { provider.removeListener?.(event, onChanged); } catch { /* Provider cleanup cannot erase a returned hash. */ }
      }
    };
    if (provider.on !== undefined && provider.removeListener !== undefined) {
      try { for (const event of events) provider.on(event, onChanged); } catch {
        stop();
        throw new UserFacingError({ key: 'error.wallet.theWalletCouldNotBeMonitoredForAccountOrNetwork' });
      }
    }
  }
  const dispose = (): void => {
    stop();
    operation.abort();
  };
  return {
    assert: () => {
      assertCurrent?.();
      if (changed || s.wallet.provider !== provider || s.account !== account || s.chainId !== chainId) {
        throw new UserFacingError({ key: 'error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview' });
      }
    },
    dispose,
    signal: operation.signal,
  };
}
interface StartedRequest {
  readonly attempt: WalletAttempt | undefined;
  readonly pending: Promise<unknown>;
}
/**
 * Sends one transaction through the wallet. An initiated wallet request cannot be cancelled by this page.
 * On the durable journal the final authority check, the `unknown` record and the provider call run in one synchronous
 * step inside the cross-tab journal lock; the lock is released as soon as the request has started (never across the
 * wallet prompt), and the returned hash is recorded under the lock again.
 */
export async function sendViaWallet(s: WalletSession, tx: TxRequest, assertCurrent?: () => void, options?: WalletAttemptOptions): Promise<Hex> {
  // Captured once, before any await: a caller editing `tx` or `options` later cannot change what was reviewed,
  // journaled or sent.
  const captured: TxRequest = Object.freeze({ to: tx.to, data: tx.data, value: tx.value });
  const attemptOptions = options === undefined ? undefined : Object.freeze({ ...options });
  const disclose = s.disclosure;
  const disclosed = disclose === undefined ? undefined : prepareWalletTransaction(s.chainId, s.account, captured, attemptOptions?.disclosureAbi);
  const authority = walletAuthority(s, assertCurrent);
  try {
    authority.assert();
    // Fail fast: a request whose journal cannot be read is refused before it is shown for approval. The authoritative
    // read still happens under the journal lock below.
    if (disclose !== undefined && (attemptOptions?.storage !== undefined || browserAttemptStorage() !== undefined)) readAttempts(attemptOptions?.storage);
    // The approval is checked again immediately before the provider call, never after it returns a hash. A gate that
    // answers without a usable approval cancels.
    const approval = disclose === undefined || disclosed === undefined ? undefined : requireApproval(await disclose(disclosed.disclosure, authority.signal));
    const check = (): void => { authority.assert(); if (approval !== undefined) approval.assertCurrent(); };
    check();
    await recheckWallet(s, check);
    check();
    const explicitStorage = attemptOptions?.storage;
    const journaled = explicitStorage !== undefined || browserAttemptStorage() !== undefined;
    const input: AttemptInput | undefined = !journaled ? undefined : {
      key: walletAttemptKey(s, captured, attemptOptions), chainId: s.chainId, account: s.account.toLowerCase(), kind: attemptOptions?.kind ?? 'transaction',
      txDigest: attemptTxDigest(s.chainId, s.account, captured.to, captured.data, captured.value),
    };
    // A disclosed request sends exactly the reviewed parameters; they equal the undisclosed form field for field.
    const params = (disclosed === undefined ? undefined : walletRequestParams(disclosed)) ?? [{ from: s.account, to: captured.to, data: captured.data, value: `0x${captured.value.toString(16)}`, chainId: `0x${s.chainId.toString(16)}` }];
    const invoke = (attempt: WalletAttempt | undefined): StartedRequest => {
      check();
      const pending = call(s.wallet.provider, 'eth_sendTransaction', params);
      pending.catch(() => undefined);
      try { attemptOptions?.onWalletRequest?.(); } catch { /* UI notification cannot interrupt tracking the wallet response. */ }
      return { attempt, pending };
    };
    const access: JournalAccess = {
      ...(explicitStorage === undefined ? {} : { storage: explicitStorage }),
      ...(attemptOptions?.lockManager === undefined ? {} : { lockManager: attemptOptions.lockManager }),
      ...(attemptOptions?.journalLockHeld === true ? { lockHeld: true } : {}),
    };
    const box: { started?: StartedRequest; abandoned?: boolean; unsent?: WalletAttempt } = {};
    const refuseIfAbandoned = (): void => {
      // A lock manager that settles before running its callback must never start a request this call already refused (QA-1).
      if (box.abandoned === true) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' });
    };
    if (input === undefined) box.started = invoke(undefined);
    else {
      try {
        // Keep the provider promise out of the journal lock so a wallet prompt never holds the lock.
        await withAttemptJournal((store) => {
          refuseIfAbandoned();
          check();
          return beginAttempt(input, store);
        }, access, (attempt) => {
          refuseIfAbandoned();
          // invoke() throws only from its authority check, before the provider is called: the committed record is unsent.
          try { box.started = invoke(attempt); } catch (e) { box.unsent = attempt; throw e; }
        });
      } catch (e) {
        if (box.started !== undefined) { /* The provider was invoked: a failing lock wrapper cannot erase the request. */ }
        else {
          box.abandoned = true;
          const unsent = box.unsent;
          if (unsent !== undefined) {
            // Nothing reached the wallet, so the `unknown` record would only block a legitimate retry (QA-5). If removal
            // fails the record stays: refusing a retry is the safe direction.
            try { await withAttemptJournal((store) => { removeUnsentAttempt(unsent, store); }, access); } catch { /* kept */ }
          }
          throw e;
        }
      }
    }
    const started = box.started;
    if (started === undefined) {
      box.abandoned = true;
      throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' });
    }
    let hash: unknown;
    try {
      hash = await started.pending;
    } catch (e) {
      if (e instanceof UserFacingError) throw e;
      throw new WalletSubmissionUnknownError(e instanceof WalletCallError ? e.rpcCode : undefined);
    }
    if (typeof hash !== 'string' || !HASH_RE.test(hash)) throw new WalletSubmissionUnknownError(undefined, true);
    const normalized = hash.toLowerCase() as Hex;
    const attempt = started.attempt;
    if (attempt !== undefined) {
      // The hash is recorded under the lock, which another tab may hold across a wallet prompt (policy actions). Never
      // keep a returned hash from the caller meanwhile: after a bounded wait surface it as a broadcast whose follow-up
      // failed, and let the queued write still record it when the lock frees (JRNL-L1).
      const finishing = withAttemptJournal((store) => { finishAttempt(attempt, normalized, store); }, { ...access, unboundedWait: true });
      finishing.catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waited = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => { resolve('timeout'); }, FINISH_WAIT_MS); });
      try {
        if (await Promise.race([finishing.then(() => 'recorded' as const), waited]) === 'timeout') throw new WalletBroadcastError(normalized);
      } catch { throw new WalletBroadcastError(normalized); }
      finally { clearTimeout(timer); }
    }
    return normalized;
  } finally { authority.dispose(); }

}

/** `eth_signTypedData_v4`; the caller verifies the recovered signer. */
export async function signTypedDataViaWallet(s: WalletSession, typedDataJson: string, assertCurrent?: () => void): Promise<Hex> {
  const disclose = s.disclosure;
  const disclosed = disclose === undefined ? undefined : prepareWalletSignature(s.chainId, s.account, typedDataJson);
  const authority = walletAuthority(s, assertCurrent);
  try {
    authority.assert();
    const approval = disclose === undefined || disclosed === undefined ? undefined : requireApproval(await disclose(disclosed.disclosure, authority.signal));
    const check = (): void => { authority.assert(); if (approval !== undefined) approval.assertCurrent(); };
    check();
    await recheckWallet(s, check);
    check();
    const sig = await call(s.wallet.provider, 'eth_signTypedData_v4', (disclosed === undefined ? undefined : walletRequestParams(disclosed)) ?? [s.account, typedDataJson]);
    // The approval was used by the request it named; the wallet account and network must still be the reviewed ones.
    authority.assert();
    if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new UserFacingError({ key: 'error.wallet.theWalletReturnedAnInvalidSignature' });
    return sig as Hex;
  } finally { authority.dispose(); }

}

/** Raised when the transaction the network saw differs from the one that was previewed. */
export class SubmissionMismatchError extends UserFacingError {
  public constructor(public readonly field: string) {
    super({ key: 'transaction.submissionMismatch', values: { field: { key: SUBMISSION_FIELD_KEYS[field] ?? 'transaction.field.unknown' } } });
    this.name = 'SubmissionMismatchError';
  }
}

const SUBMISSION_FIELD_KEYS: Readonly<Record<string, MessageKey>> = {
  hash: 'transaction.field.hash',
  sender: 'transaction.field.sender',
  'destination contract': 'transaction.field.destination',
  'call data': 'transaction.field.data',
  value: 'transaction.field.value',
  chain: 'transaction.field.chain',
  'receipt destination': 'transaction.field.receiptDestination',
};


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
  /** Account nonce when the RPC gave a canonical quantity; not part of the preview comparison. */
  readonly nonce: bigint | undefined;
}

function optionalQuantity(v: unknown): bigint | undefined {
  try { return parseQuantity(v); } catch { return undefined; }
}

/** Shape-checks an `eth_getTransactionByHash` answer; `undefined` for null, a typed error for anything malformed. */
export function parseSeenTx(v: unknown): SeenTx | undefined {
  if (v === null) return undefined;
  if (typeof v !== 'object') throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedTransactionShape' });
  const o = v as Record<string, unknown>;
  try {
    const hash = o['hash'];
    const input = o['input'] ?? o['data'];
    if (typeof hash !== 'string' || typeof input !== 'string') {
      throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedTransactionShape' });
    }
    return {
      hash: hash.toLowerCase() as Hex,
      from: toAccount(o['from']),
      to: o['to'] === null ? null : toAccount(o['to']),
      input: input.toLowerCase() as Hex,
      value: parseQuantity(o['value']),
      chainId: o['chainId'] === undefined ? undefined : parseQuantity(o['chainId']),
      nonce: optionalQuantity(o['nonce']),
    };
  } catch {
    throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedTransactionShape' });
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
  onVerified?: (seen: SeenTx) => void,
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
      onVerified?.(seen);
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
      if (typeof r !== 'object') throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedReceiptShape' });
      const o = r as Record<string, unknown>;
      let to: Address | undefined;
      try {
        const receiptHash = o['transactionHash'];
        if (typeof receiptHash !== 'string' || !HASH_RE.test(receiptHash)) {
          throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedReceiptShape' });
        }
        if (receiptHash.toLowerCase() !== hash.toLowerCase()) throw new SubmissionMismatchError('hash');
        to = o['to'] === null || o['to'] === undefined ? undefined : toAccount(o['to']);
        const status = parseQuantity(o['status']);
        if (status !== 0n && status !== 1n) {
          throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedReceiptShape' });
        }
        if (to !== undefined && to !== getAddress(expectedTo)) throw new SubmissionMismatchError('receipt destination');
        return { status: status === 1n ? 'success' : 'reverted', blockNumber: parseQuantity(o['blockNumber']) };
      } catch (e) {
        if (e instanceof UserFacingError) throw e;
        throw new UserFacingError({ key: 'error.wallet.yourRPCReturnedAnUnexpectedReceiptShape' });
      }
    }
    await sleep(2000);
  }
  return undefined;
}

// i18n-use: error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew error.wallet.invoiceChainMismatch error.wallet.theSelectedWalletAccountChangedReconnectAndReviewAgain error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview error.wallet.theWalletCouldNotBeMonitoredForAccountOrNetwork error.wallet.theWalletDidNotReturnAValidTransactionHashThe error.wallet.theWalletGaveContradictoryChainIdsRefusingToContinue error.wallet.theWalletNetworkChangedReconnectAndReviewAgain error.wallet.theWalletReportedInconsistentAccountsRefusingToContinue error.wallet.theWalletReturnedAnInvalidAccount error.wallet.theWalletReturnedAnInvalidChainId error.wallet.theWalletReturnedAnInvalidSignature error.wallet.theWalletReturnedNoAccounts error.wallet.walletDiscoveryCouldNotStartRetryOrUseAnotherWallet error.wallet.youRejectedTheRequestInYourWallet error.wallet.yourRPCReturnedAnUnexpectedReceiptShape error.wallet.yourRPCReturnedAnUnexpectedTransactionShape policy.withdraw.logicalScope transaction.code transaction.field.chain transaction.field.data transaction.field.destination transaction.field.hash transaction.field.receiptDestination transaction.field.sender transaction.field.unknown transaction.field.value transaction.submissionMismatch transaction.walletBroadcast transaction.walletUnknown wallet.warning.conflictingIdentity wallet.warning.duplicateName wallet.warning.missingRdns wallet.warning.mixedScript wallet.warning.nonAscii
