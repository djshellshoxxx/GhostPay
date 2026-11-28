import type { Abi, Hex } from 'viem';
import { summarizeWalletCall, type WalletCallSummary } from './walletCallSummary';
import { isAddress } from 'viem/utils';
import { UserFacingError } from './errors';

/** Upper bound for the complete JSON request shown before any provider interaction. */
export const WALLET_DISCLOSURE_MAX_BYTES = 65_536;
/** How long an open review may wait for a decision, and how long an approval stays usable after it was given. */
export const WALLET_DISCLOSURE_MS = 120_000;
export type WalletDisclosureMethod = 'eth_requestAccounts' | 'wallet_switchEthereumChain' | 'eth_sendTransaction' | 'eth_signTypedData_v4';

export interface WalletDisclosureRequest {
  readonly method: WalletDisclosureMethod;
  /** Expected/requested chain; connection does not yet know the wallet's current chain. */
  readonly chainId: number;
  readonly account?: string;
  /** The actual transaction target or typed-data verifying contract, not a decoded token recipient. */
  readonly destination?: string;
  readonly nativeValueWei?: string;
  readonly contractCall?: WalletCallSummary;
  readonly typedAmount?: string;
  readonly typedRecipient?: string;
  readonly primaryType?: string;
  /** Chain committed by the typed-data domain, kept distinct from the selected wallet network. */
  readonly domainChainId?: string;
  /** A lossless ASCII JSON representation of the exact method and parameters, never stored. */
  readonly requestJson: string;
}

export interface WalletDisclosureApproval { assertCurrent(): void }
export type WalletDisclosureGate = (request: WalletDisclosureRequest, signal?: AbortSignal) => Promise<WalletDisclosureApproval>;
export interface PreparedWalletRequest {
  readonly method: WalletDisclosureMethod;
  readonly params?: readonly unknown[];
  readonly disclosure: WalletDisclosureRequest;
}

const refused = (): UserFacingError => new UserFacingError({ key: 'wallet.disclosure.invalid' });
const cancelled = (): UserFacingError => new UserFacingError({ key: 'wallet.disclosure.cancelled' });
const UINT256_LIMIT = 1n << 256n;
function chain(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw refused();
  return value;
}
function account(value: string): string {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) throw refused();
  return value;
}
function prepared(method: WalletDisclosureMethod, fields: Omit<WalletDisclosureRequest, 'method' | 'requestJson'>, params?: readonly unknown[]): PreparedWalletRequest {
  // Every caller supplies freshly constructed frozen arrays/objects containing only primitive values.
  const requestJson = JSON.stringify(params === undefined ? { method } : { method, params })
    .replace(/[^\x20-\x7e]/g, (value) => `\\u${value.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (requestJson.length > WALLET_DISCLOSURE_MAX_BYTES) throw refused();
  return Object.freeze({ method, ...(params === undefined ? {} : { params }), disclosure: Object.freeze({ method, ...fields, requestJson }) });
}

/**
 * The parameters to hand to the wallet: a plain, unfrozen copy with exactly the reviewed values, so a wallet that edits
 * its arguments in place (for example to add a gas field) cannot fail on a frozen object.
 */
export function walletRequestParams(request: PreparedWalletRequest): unknown[] | undefined {
  return request.params === undefined ? undefined : JSON.parse(JSON.stringify(request.params)) as unknown[];
}

/**
 * A gate must answer with a usable approval. Anything else (a gate resolving `undefined`, a missing or non-callable
 * `assertCurrent`) is treated as a cancelled review, never as permission.
 */
export function requireApproval(value: unknown): WalletDisclosureApproval {
  const assertCurrent = typeof value === 'object' && value !== null ? (value as { assertCurrent?: unknown }).assertCurrent : undefined;
  if (typeof assertCurrent !== 'function') throw cancelled();
  return Object.freeze({ assertCurrent: () => { (assertCurrent as () => void).call(value); } });
}

export function prepareWalletConnection(chainId: number): PreparedWalletRequest {
  return prepared('eth_requestAccounts', { chainId: chain(chainId) });
}
export function prepareWalletChainSwitch(chainId: number, from: string): PreparedWalletRequest {
  return prepared('wallet_switchEthereumChain', { chainId: chain(chainId), account: account(from) }, Object.freeze([Object.freeze({ chainId: `0x${chainId.toString(16)}` })]));
}
export function prepareWalletTransaction(chainId: number, from: string, tx: { readonly to: string; readonly data: string; readonly value: bigint }, abi?: Abi): PreparedWalletRequest {
  const to = account(tx.to);
  const data = tx.data;
  const value = tx.value;
  if (typeof data !== 'string' || data.length > WALLET_DISCLOSURE_MAX_BYTES || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)
    || typeof value !== 'bigint' || value < 0n || value >= UINT256_LIMIT) throw refused();
  const contractCall = summarizeWalletCall(data as Hex, abi);
  const fields = { chainId: chain(chainId), account: account(from), destination: to, nativeValueWei: value.toString(),
    ...(contractCall === undefined ? {} : { contractCall }) };
  return prepared('eth_sendTransaction', fields, Object.freeze([Object.freeze({ from: fields.account, to, data, value: `0x${value.toString(16)}`, chainId: `0x${chainId.toString(16)}` })]));
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function knownAddress(value: unknown): string | undefined {
  return typeof value === 'string' && isAddress(value, { strict: false }) ? value : undefined;
}
function knownAmount(value: unknown): string | undefined {
  const text = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  return typeof text === 'string' && /^(?:0|[1-9][0-9]{0,77})$/.test(text) && BigInt(text) < UINT256_LIMIT ? text : undefined;
}
function knownDomainChain(value: unknown): string | undefined {
  const normalized = knownAmount(value);
  const text = normalized ?? (typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value) ? value : undefined);
  if (text === undefined) return undefined;
  const id = BigInt(text);
  return id < UINT256_LIMIT ? id.toString() : undefined;
}
/** The declared fields of one EIP-712 struct type, or `undefined` when the declaration is missing or ambiguous. */
function declaredFields(types: Record<string, unknown> | undefined, name: string | undefined): ReadonlyMap<string, string> | undefined {
  if (types === undefined || name === undefined || !Object.prototype.hasOwnProperty.call(types, name)) return undefined;
  const list = types[name];
  if (!Array.isArray(list)) return undefined;
  const fields = new Map<string, string>();
  for (const entry of list) {
    const field = record(entry);
    const fieldName = field?.['name'];
    const fieldType = field?.['type'];
    if (typeof fieldName !== 'string' || typeof fieldType !== 'string' || fields.has(fieldName)) return undefined;
    fields.set(fieldName, fieldType);
  }
  return fields;
}
const isAddressType = (type: string): boolean => type === 'address';
const isUintType = (type: string): boolean => /^uint(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/.test(type);
/** The one declared field among `names` with a fitting type; none or several give `undefined` (shown as unknown). */
function singleField(fields: ReadonlyMap<string, string> | undefined, names: readonly string[], fits: (type: string) => boolean): string | undefined {
  if (fields === undefined) return undefined;
  const hits = names.filter((name) => { const type = fields.get(name); return type !== undefined && fits(type); });
  return hits.length === 1 ? hits[0] : undefined;
}
/**
 * Labels only what the wallet will actually sign: fields declared in `types[primaryType]` and `types.EIP712Domain` with
 * a fitting type. A present but invalid value, an undeclared field or several candidates are left unknown.
 */
export function prepareWalletSignature(chainId: number, from: string, typedDataJson: string): PreparedWalletRequest {
  if (typeof typedDataJson !== 'string' || typedDataJson.length > WALLET_DISCLOSURE_MAX_BYTES) throw refused();
  let data: Record<string, unknown> | undefined;
  try { data = record(JSON.parse(typedDataJson) as unknown); } catch { throw refused(); }
  if (data === undefined) throw refused();
  const types = record(data['types']);
  const domain = record(data['domain']);
  const message = record(data['message']);
  const primaryType = typeof data['primaryType'] === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(data['primaryType']) ? data['primaryType'] : undefined;
  const messageFields = declaredFields(types, primaryType);
  const domainFields = declaredFields(types, 'EIP712Domain');
  const destination = domainFields?.get('verifyingContract') === 'address' ? knownAddress(domain?.['verifyingContract']) : undefined;
  const domainChainType = domainFields?.get('chainId');
  const domainChainId = domainChainType !== undefined && isUintType(domainChainType) ? knownDomainChain(domain?.['chainId']) : undefined;
  const recipientField = singleField(messageFields, ['destination', 'to', 'spender'], isAddressType);
  const typedRecipient = recipientField === undefined ? undefined : knownAddress(message?.[recipientField]);
  const amountField = singleField(messageFields, ['amount', 'value'], isUintType);
  const typedAmount = amountField === undefined ? undefined : knownAmount(message?.[amountField]);
  return prepared('eth_signTypedData_v4', {
    chainId: chain(chainId), account: account(from),
    ...(destination === undefined ? {} : { destination }),
    ...(domainChainId === undefined ? {} : { domainChainId }),
    ...(typedRecipient === undefined ? {} : { typedRecipient }),
    ...(typedAmount === undefined ? {} : { typedAmount }),
    ...(primaryType === undefined ? {} : { primaryType }),
  }, Object.freeze([from, typedDataJson]));
}

interface Clock { readonly wall: number; readonly monotonic: number }
function clock(): Clock | undefined {
  try {
    const wall = Date.now(); const monotonic = performance.now();
    return Number.isFinite(wall) && wall >= 0 && Number.isFinite(monotonic) && monotonic >= 0 ? { wall, monotonic } : undefined;
  } catch { return undefined; }
}
export interface PendingWalletDisclosure { readonly request: WalletDisclosureRequest }
interface Pending extends PendingWalletDisclosure {
  readonly approve: () => void;
  readonly reject: () => void;
  readonly cleanup: () => void;
}

/**
 * One prompt at a time. A prompt waits at most {@link WALLET_DISCLOSURE_MS} for a decision; an approval then stays usable
 * for the same time from the moment it was given, is bound to this host lifecycle and cannot survive another request.
 */
export class WalletDisclosureController {
  private active = false;
  private allowed = false;
  private revision = 0;
  private mounts = 0;
  private pending: Pending | undefined;
  private readonly listeners = new Set<() => void>();
  public readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  public readonly getSnapshot = (): PendingWalletDisclosure | undefined => this.pending;
  private emit(): void {
    // A failing subscriber must not leave a prompt half created or block the others.
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* Presentation errors never approve or keep a request. */ }
    }
  }
  public mount(): () => void {
    if (this.active) throw refused();
    this.active = true;
    const mount = ++this.mounts;
    // Only the unmount of the current mount deactivates the controller; a stale one is a no-op.
    return () => { if (this.mounts !== mount || !this.active) return; this.active = false; this.allowed = false; this.revoke(); };
  }
  public allowPresentation(allowed: boolean): void {
    this.allowed = allowed;
    if (!allowed) this.revoke();
  }
  public revoke(): void {
    this.revision++;
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) { pending.cleanup(); pending.reject(); this.emit(); }
  }
  public cancel(pending: PendingWalletDisclosure): void { if (this.pending === pending) this.revoke(); }
  public approve(pending: PendingWalletDisclosure): void {
    if (this.pending !== pending) return;
    const current = this.pending;
    this.pending = undefined;
    current.cleanup();
    current.approve();
    this.emit();
  }
  public readonly request: WalletDisclosureGate = (request, signal) => {
    if (!this.active || !this.allowed) return Promise.reject(new UserFacingError({ key: 'wallet.disclosure.unavailable' }));
    if (this.pending !== undefined) return Promise.reject(new UserFacingError({ key: 'wallet.disclosure.busy' }));
    const started = clock();
    if (signal?.aborted === true || started === undefined) return Promise.reject(cancelled());
    const revision = ++this.revision;
    let observed = started;
    let approvedAt: Clock | undefined;
    let expired = false;
    const assertCurrent = (): void => {
      const now = clock();
      const since = approvedAt ?? started;
      if (expired || !this.active || !this.allowed || this.revision !== revision || signal?.aborted === true || now === undefined
        || now.wall < observed.wall || now.monotonic < observed.monotonic
        || now.wall - since.wall >= WALLET_DISCLOSURE_MS || now.monotonic - since.monotonic >= WALLET_DISCLOSURE_MS) {
        expired = true;
        throw cancelled();
      }
      observed = now;
    };
    return new Promise<WalletDisclosureApproval>((resolve, reject) => {
      const onAbort = (): void => { this.cancel(pending); };
      const timer = setTimeout(onAbort, WALLET_DISCLOSURE_MS);
      const pending: Pending = Object.freeze({
        request,
        cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
        reject: () => { reject(cancelled()); },
        approve: () => {
          try {
            assertCurrent();
            // The usable window restarts at the decision: reading time is not taken from the time in the wallet.
            approvedAt = observed;
            resolve(Object.freeze({ assertCurrent }));
          } catch { reject(cancelled()); }
        },
      });
      this.pending = pending;
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted === true) onAbort();
      else this.emit();
    });
  };
}

// i18n-use: wallet.disclosure.invalid wallet.disclosure.cancelled wallet.disclosure.unavailable wallet.disclosure.busy
