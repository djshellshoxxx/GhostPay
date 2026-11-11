/** 0x-prefixed hex string. */
export type Hex = `0x${string}`;

/** A block head: number and hash. */
export interface Head {
  readonly number: bigint;
  readonly hash: Hex;
}

/**
 * A validated public ERC-5564 announcement with its chain position. Structurally a superset of the
 * fields chain-adapters' `ScannedAnnouncement` carries (hex normalised to lowercase).
 */
export interface ScanAnnouncement {
  readonly schemeId: bigint;
  readonly stealthAddress: Hex;
  readonly caller: Hex;
  readonly ephemeralPublicKey: Hex;
  /** `metadata[0]` is the view tag. It stays local: no source ever transmits it (NP-S-2). */
  readonly metadata: Hex;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly logIndex: number;
  /** Transaction hash when the server supplied a well-formed one. Untrusted: only a receipt from the user's RPC gives it meaning. */
  readonly transactionHash?: Hex;
  /** `blockHash:logIndex`, recomputed by the validator, never trusted from a server. */
  readonly id: string;
}

/** Request for one window of announcements. */
export interface FetchRequest {
  readonly chainId: number;
  /** Inclusive. */
  readonly fromBlock: bigint;
  /** Inclusive. */
  readonly toBlock: bigint;
}

/** Result of one fetch. */
export interface FetchResult {
  /** Validated, deduplicated, sorted by `(blockNumber, logIndex)`; only blocks inside `coverage`. */
  readonly announcements: readonly ScanAnnouncement[];
  readonly head: Head;
  /** Padded window actually fetched (may be larger than requested, clamped to the head / shard). */
  readonly coverage: { readonly fromBlock: bigint; readonly toBlock: bigint };
  /** Records dropped for failing validation (never surfaced to UI state). */
  readonly skipped: number;
}

/** How a source's data is protected against a lying server. */
export type Integrity = 'unverified' | 'quorum' | 'proof';

/**
 * Where announcements come from. Local mirror of the spec's `PublicLogSource` (network-privacy 4.7).
 * `kind` additionally allows `'quorum'` (spec lists four kinds; the composition source needs its own).
 */
export interface PublicLogSource {
  readonly kind: 'range' | 'indexer' | 'pir2' | 'light' | 'quorum';
  readonly integrity: Integrity;
  fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult>;
}

/** Minimal bytes-level HTTP transport. Callers supply the profile (direct, Tor, ...). Identical shape to pir-two-server's. */
export interface HttpTransport {
  request(req: {
    readonly method: 'GET' | 'POST';
    readonly url: string;
    readonly body?: Uint8Array;
    readonly timeoutMs: number;
    readonly maxBytes: number;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{ readonly status: number; readonly body: Uint8Array }>;
}

/** Source of the announcement logs of one chain (e.g. a thin wrapper over chain-adapters `fetchAnnouncements`). */
export interface RangeBackend {
  getHead(signal?: AbortSignal): Promise<Head>;
  /** Raw (untrusted) records for the inclusive window; the source validates every one. */
  getAnnouncements(req: FetchRequest, signal?: AbortSignal): Promise<readonly unknown[]>;
}

/** A second, independent source of block hashes (e.g. the user's RPC), used to check indexers and PIR manifests. */
export interface HeadSource {
  head(signal?: AbortSignal): Promise<Head>;
  blockHash(blockNumber: bigint, signal?: AbortSignal): Promise<Hex>;
}

/** Light client interface (Helios-like). Role: integrity only; it does NOT hide queries. */
export interface LightClient {
  head(): Promise<Head>;
  /** Hash of a block as verified by the light client's header chain, or undefined if it cannot say. */
  blockHash(blockNumber: bigint): Promise<Hex | undefined>;
  getBalance(address: Hex): Promise<bigint>;
  getTransactionCount(address: Hex): Promise<bigint>;
  getCode(address: Hex): Promise<Hex>;
  getStorageAt(address: Hex, slot: Hex): Promise<Hex>;
  /** True only if the client proves log inclusion (receipts proof). Unverified for Helios in this PoC. */
  readonly verifiesLogs: boolean;
}

/** The four user-selectable scan modes. Default `range`. */
export type ScanMode = 'range' | 'indexer-tor' | 'pir2' | 'light-client';
/** Default scan mode (spec Selector C). */
export const DEFAULT_SCAN_MODE: ScanMode = 'range';
