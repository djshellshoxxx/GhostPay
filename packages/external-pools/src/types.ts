import type { SecretBox } from '@ghostpay/secret-box';
import type { Address, Hex } from 'viem';

export type { Address, Hex };

/** Route ids behind the single {@link ExternalPoolAdapter} interface (spec section 1). `EP-0` is `'none'`, handled by the planner. */
export type ExitRouteId = 'privacy-pools' | 'railgun' | 'tornado-fixed' | 'aztec' | 'mock-pool';

/** Operator-declared state of a pool (Aztec Connect lesson, spec 3.4). Only `active` allows new entries. */
export type PoolLifecycle = 'active' | 'deprecated' | 'sunset' | 'unknown';

/** Asset key: ERC-20 address, or `'native'`. */
export type AssetId = Address | 'native';

/**
 * Signer for the one-time stealth address S1.
 *
 * @security The secret never leaves the signer. Adapters only read `address` and, for Railgun's shield
 *   key, call `signMessage`.
 */
export interface StealthSigner {
  readonly address: Address;
  /** EIP-191 personal-sign. Required only by routes that derive keys from a signature (Railgun shield key). */
  signMessage?(message: string): Promise<Hex>;
}

/** Input of a sweep-through-pool request. */
export interface RouteRequest {
  readonly chainId: number;
  readonly asset: AssetId;
  readonly amount: bigint;
  /** S1: the pool deposit MUST be sent by this address (Privacy Pools ragequit identity, EP-PP-1). */
  readonly stealth: { readonly address: Address; readonly signer: StealthSigner };
  readonly destination: Address | 'derive-fresh';
  /** Root of note-key derivation. Held in a {@link SecretBox}; adapters only borrow it with `use()`. */
  readonly rootSeed: SecretBox;
}

/** Fee disclosure, read from chain or relayer, never hard-coded (spec section 5). `null` means not applicable or not read. */
export interface FeeBreakdown {
  readonly entryFeeBps: number | null;
  readonly exitFeeBps: number | null;
  readonly relayerFeeBps: number | null;
  readonly source: string;
}

export type ExitMaturity = 'production' | 'young' | 'alpha' | 'testnet-only' | 'test-double';
export type ThirdParty = 'relayer' | 'broadcaster' | 'indexer' | 'asp' | 'ppoi';
export type AuditStatus = 'none-found' | 'unknown' | { readonly reportUrl: string; readonly retrieved: string };

/** UI table row (spec section 5). The route comparison is rendered from these objects. */
export interface ExitRouteInfo {
  readonly id: ExitRouteId;
  readonly name: string;
  readonly chains: readonly number[];
  readonly assets: readonly AssetId[];
  readonly lifecycle: PoolLifecycle;
  readonly maturity: ExitMaturity;
  readonly feeDisclosure: FeeBreakdown | 'unknown';
  readonly whatItHides: readonly string[];
  readonly whatItDoesNotHide: readonly string[];
  readonly independentExit: 'ragequit' | 'self-broadcast' | 'none';
  readonly needsLiveThirdParty: readonly ThirdParty[];
  readonly auditStatus: AuditStatus;
  /** False for routes that exist only as a documented slot (EP-3, EP-4). */
  readonly available: boolean;
  readonly unavailableReason?: string;
}

export interface SupportResult {
  readonly supported: boolean;
  readonly reason?: string;
  /** Smallest deposit the pool accepts, if known. */
  readonly minAmount?: bigint;
}

export interface EntryQuote {
  readonly routeId: ExitRouteId;
  readonly chainId: number;
  readonly asset: AssetId;
  /** Amount sent by S1. */
  readonly amount: bigint;
  /** Fee taken at entry (vetting/shield fee). */
  readonly feeAmount: bigint;
  /** Amount the pool credits. MUST equal the on-chain committed value (EP-PP-4). */
  readonly creditedAmount: bigint;
  readonly fee: FeeBreakdown;
  /** Opaque adapter state carried from quote to prepare/record. Never contains secrets. */
  readonly adapterData: Readonly<Record<string, string>>;
}

/** Unsigned transaction. S1 signs; the adapter never holds a key. */
export interface PreparedTx {
  readonly kind?: 'approve' | 'deposit' | 'shield' | 'exit' | 'ragequit' | 'unshield';
  readonly from: Address;
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
  readonly chainId: number;
  readonly description: string;
}

export interface LogLike {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly logIndex: number;
  readonly blockNumber?: bigint;
  readonly transactionHash?: Hex;
}

/** Minimal receipt shape; viem receipts satisfy it structurally once `confirmations` is added by the caller. */
export interface TxReceiptLike {
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly from: Address;
  readonly to: Address | null;
  readonly status: 'success' | 'reverted';
  readonly logs: readonly LogLike[];
  /** Blocks on top of the inclusion block, counted by the caller. */
  readonly confirmations: number;
}

export type NoteState = 'pending' | 'confirmed' | 'exiting' | 'exited' | 'ragequit' | 'lost-sync';

/** Persisted ONLY encrypted in the vault (EP-VAULT-1). */
export interface PoolNote {
  /** `keccak256(routeId|chainId|depositTx|logIndex)`. */
  readonly noteId: string;
  readonly routeId: ExitRouteId;
  readonly chainId: number;
  readonly asset: AssetId;
  /** Amount credited by the pool (after entry fees), taken from the on-chain event. */
  readonly depositedAmount: bigint;
  /** S1. Equals the signer address; ragequit identity for Privacy Pools. */
  readonly depositor: Address;
  readonly depositTx: Hex;
  readonly depositBlock: bigint;
  readonly state: NoteState;
  /** Opaque, versioned adapter payload. Contains secrets; only ever stored inside the vault. */
  readonly adapterData: Uint8Array;
  /** Unix seconds, rounded to the hour (EP-VAULT-6). */
  readonly createdAt: number;
}

export interface ExitOptions {
  readonly destination: Address;
  /** Upper bound for relayer/broadcaster fee (bps of the exited amount). */
  readonly maxFeeBps?: number;
  /** Use a self-funded transaction instead of a third-party relayer (links gas funding, N3). */
  readonly selfBroadcast?: boolean;
  /** User has ticked the N3 acknowledgement (gas-funding link). Required for `selfBroadcast`. */
  readonly ackN3?: boolean;
  /** Root seed, for routes that must re-derive wallet keys to exit (Railgun). Borrowed with `use()` only. */
  readonly rootSeed?: SecretBox;
}

export interface ExitQuote {
  readonly noteId: string;
  readonly routeId: ExitRouteId;
  readonly destination: Address;
  readonly grossAmount: bigint;
  readonly feeAmount: bigint;
  readonly netAmount: bigint;
  readonly feeBps: number;
  readonly via: 'relayer' | 'broadcaster' | 'self';
  /** Unix ms after which the quote must not be used. */
  readonly expiresAt: number;
  /** What the exit transaction will show to chain observers about the destination (UI text). */
  readonly destinationSeen: string;
  readonly adapterData: Readonly<Record<string, string>>;
}

export interface ExitResult {
  readonly noteId: string;
  readonly txHash: Hex | null;
  readonly destination: Address;
  readonly exitedAmount: bigint;
  readonly feeAmount: bigint;
  readonly newState: NoteState;
}

/** Read-only chain access, injected so tests never need a network (EP-GEN-2). */
export interface ChainReader {
  getCode(chainId: number, address: Address): Promise<Hex>;
  call(chainId: number, to: Address, data: Hex): Promise<Hex>;
  getLogs(
    chainId: number,
    filter: { address: Address; topics?: readonly (Hex | null)[]; fromBlock: bigint; toBlock: bigint },
  ): Promise<readonly LogLike[]>;
  getBlockNumber(chainId: number): Promise<bigint>;
}

/** Injected I/O for exits. Adapters MUST use only this `fetch` (EP-GEN-2). */
export interface ExitTransport {
  readonly fetch: typeof fetch;
  /** Hook for `network-privacy.md`; the adapter passes it to its HTTP client unchanged. */
  readonly proxy?: { readonly socks5?: string };
  now(): number;
}

export interface ScanContext {
  readonly chainId: number;
  readonly chain: ChainReader;
  /** S1 addresses to look for (depositor identity). */
  readonly stealthAddresses: readonly Address[];
  readonly fromBlock: bigint;
  readonly toBlock?: bigint;
}

/** The single interface every pool route implements (spec 6.2). */
export interface ExternalPoolAdapter {
  readonly id: ExitRouteId;
  /** Version of the `adapterData` layout. */
  readonly schema: number;
  info(): ExitRouteInfo;
  /** `chainId` lets multi-chain adapters report per-chain state; callers pass the chain they intend to use. */
  health(chainId?: number): Promise<{ lifecycle: PoolLifecycle; reason?: string }>;
  supports(q: { chainId: number; asset: AssetId }): Promise<SupportResult>;
  quoteEntry(r: RouteRequest): Promise<EntryQuote>;
  prepareEntry(r: RouteRequest, q: EntryQuote): Promise<PreparedTx[]>;
  recordEntry(r: RouteRequest, q: EntryQuote, receipt: TxReceiptLike): Promise<PoolNote>;
  quoteExit(n: PoolNote, o: ExitOptions): Promise<ExitQuote>;
  executeExit(n: PoolNote, q: ExitQuote, t: ExitTransport): Promise<ExitResult>;
  /** Operator-free exit (ragequit / self-broadcast). MUST NOT need relayer, broadcaster, ASP or indexer (EP-GEN-6). */
  prepareEmergencyExit(n: PoolNote, seed?: SecretBox): Promise<PreparedTx[]>;
  recover(seed: SecretBox, scan: ScanContext): AsyncIterable<PoolNote>;
}
