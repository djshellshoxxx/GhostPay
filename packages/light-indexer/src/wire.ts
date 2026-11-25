/**
 * `/v1/logs` wire contract, version 1. Normative text: `docs/specs/indexer-logs-api-v1.md`. The reference client is
 * `packages/scan-source/src/indexer.ts:createIndexerSource`; this module must stay compatible with it.
 *
 * @security Every accepted parameter is public and identical for every client that scans the same window. There is no
 * parameter for a key, view tag, stealth address, meta-address, caller or scheme: an unknown parameter is rejected,
 * never ignored, so a client cannot attach one by mistake.
 */

/** 0x-prefixed lowercase hex. */
export type Hex = `0x${string}`;

/** Wire contract version, returned in every response body. */
export const WIRE_VERSION = 1;
/** Route of the announcement window endpoint. */
export const LOGS_PATH = '/v1/logs';
/** Route of the public service status endpoint. */
export const STATUS_PATH = '/v1/status';

/** `keccak256("Announcement(uint256,address,address,bytes,bytes)")`: ERC-5564 Announcer event topic 0. */
export const ANNOUNCEMENT_TOPIC: Hex = '0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7';

/** Record limits. They equal the reference client's structural checks (`scan-source/src/validate.ts`). */
export const EPHEMERAL_PUBLIC_KEY_BYTES = 33;
export const MIN_METADATA_BYTES = 1;
export const MAX_METADATA_BYTES = 4096;
export const MAX_SCHEME_ID = (1n << 64n) - 1n;
/** Block numbers are stored as SQLite integers and served as decimal strings. */
export const MAX_BLOCK_NUMBER = BigInt(Number.MAX_SAFE_INTEGER);
/** Request-target length cap (path plus query), in bytes. */
export const MAX_REQUEST_TARGET_BYTES = 512;
/** Bytes reserved in the response budget for the JSON envelope around headers and announcements. */
export const ENVELOPE_RESERVE_BYTES = 1024;

/** Testnet chain ids, identical to `@ghostpay/scan-source` `TESTNET_CHAIN_IDS` (a test pins the equality). */
export const TESTNET_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/** Stable error codes of wire version 1. */
export type WireErrorCode =
  | 'BAD_REQUEST'
  | 'UNKNOWN_PARAMETER'
  | 'URI_TOO_LONG'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CHAIN_NOT_SERVED'
  | 'WINDOW_TOO_LARGE'
  | 'WINDOW_NOT_ALIGNED'
  | 'PAGE_SIZE_OUT_OF_RANGE'
  | 'BEFORE_INDEXED_RANGE'
  | 'NOT_YET_INDEXED'
  | 'BLOCK_EXCEEDS_PAGE_LIMIT'
  | 'NOT_READY'
  | 'HALTED'
  | 'STORE_INCONSISTENT'
  | 'INTERNAL';

/** HTTP status and fixed message per code. Messages never echo request data. */
export const WIRE_ERRORS: Readonly<Record<WireErrorCode, { readonly status: number; readonly message: string }>> = Object.freeze({
  BAD_REQUEST: { status: 400, message: 'malformed request' },
  UNKNOWN_PARAMETER: { status: 400, message: 'unknown query parameter' },
  URI_TOO_LONG: { status: 414, message: 'request target too long' },
  NOT_FOUND: { status: 404, message: 'no such route' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'method not allowed' },
  CHAIN_NOT_SERVED: { status: 404, message: 'chain not served' },
  WINDOW_TOO_LARGE: { status: 400, message: 'window exceeds the maximum block span' },
  WINDOW_NOT_ALIGNED: { status: 400, message: 'window is not aligned to the block grid' },
  PAGE_SIZE_OUT_OF_RANGE: { status: 400, message: 'page size out of range' },
  BEFORE_INDEXED_RANGE: { status: 416, message: 'window starts before the indexed range' },
  NOT_YET_INDEXED: { status: 416, message: 'window starts beyond the indexed head' },
  BLOCK_EXCEEDS_PAGE_LIMIT: { status: 422, message: 'a single block exceeds the page limits' },
  NOT_READY: { status: 503, message: 'index is empty' },
  HALTED: { status: 503, message: 'indexer halted: reorg deeper than the configured limit' },
  STORE_INCONSISTENT: { status: 500, message: 'stored header chain is inconsistent' },
  INTERNAL: { status: 500, message: 'internal error' },
});

/** Server-side query limits (published by `/v1/status`). */
export interface QueryLimits {
  readonly chainId: number;
  /** `from` and `to + 1` must be multiples of this. 1 disables the grid. */
  readonly alignBlocks: number;
  /** Largest accepted `to - from + 1`. */
  readonly maxWindowBlocks: number;
  /** Largest accepted `pageSize`; also the record cap of one page. */
  readonly maxPageSize: number;
  /** `pageSize` when the request omits it. */
  readonly defaultPageSize: number;
  /** Largest response body in bytes. */
  readonly maxResponseBytes: number;
}

/** A parsed, validated `/v1/logs` query. */
export interface LogsQuery {
  readonly chainId: number;
  readonly from: bigint;
  readonly to: bigint;
  readonly pageSize: number;
  /** Continuation: first block of this page, `from < cursor <= to`. Absent on the first page. */
  readonly cursor?: bigint;
}

/** Result of {@link parseLogsQuery}. */
export type ParseResult = { readonly ok: true; readonly query: LogsQuery } | { readonly ok: false; readonly code: WireErrorCode };

/** Block header as served: decimal number, lowercase hashes. */
export interface WireHeader {
  readonly number: string;
  readonly hash: Hex;
  readonly parentHash: Hex;
}

/** Announcement as served. Field names match what `scan-source` `parseAnnouncement` reads. */
export interface WireAnnouncement {
  readonly schemeId: string;
  readonly stealthAddress: Hex;
  readonly caller: Hex;
  readonly ephemeralPublicKey: Hex;
  readonly metadata: Hex;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly logIndex: number;
  readonly transactionHash: Hex;
}

/** `/v1/logs` 200 response body. */
export interface LogsPage {
  readonly version: typeof WIRE_VERSION;
  readonly chainId: number;
  readonly announcer: Hex;
  /** Inclusive block span covered by `headers`; every announcement of these blocks that meets the record limits is present. */
  readonly coverage: { readonly fromBlock: string; readonly toBlock: string };
  /** Cursor for the next page when a cap cut this page short; `null` otherwise. */
  readonly next: string | null;
  /** Indexed head at response time. */
  readonly head: { readonly number: string; readonly hash: Hex };
  readonly headers: readonly WireHeader[];
  readonly announcements: readonly WireAnnouncement[];
  /** Announcer logs in the covered blocks that were not served (outside the record limits or undecodable). */
  readonly omitted: number;
}

const ALLOWED = new Set(['chainId', 'from', 'to', 'pageSize', 'cursor']);
const DEC = /^(?:0|[1-9][0-9]{0,19})$/;

/**
 * Strict parser for the query string of `GET /v1/logs` (without the leading `?`). Rejects unknown, duplicate, empty
 * and percent-encoded parameters, non-canonical decimals, oversized and misaligned windows.
 */
export function parseLogsQuery(search: string, limits: QueryLimits): ParseResult {
  const fail = (code: WireErrorCode): ParseResult => ({ ok: false, code });
  const values = new Map<string, string>();
  if (search !== '') {
    for (const part of search.split('&')) {
      const eq = part.indexOf('=');
      const key = eq < 0 ? part : part.slice(0, eq);
      if (!ALLOWED.has(key)) return fail('UNKNOWN_PARAMETER');
      const value = eq < 0 ? '' : part.slice(eq + 1);
      if (values.has(key) || !DEC.test(value)) return fail('BAD_REQUEST');
      values.set(key, value);
    }
  }
  const chainRaw = values.get('chainId');
  const fromRaw = values.get('from');
  const toRaw = values.get('to');
  if (chainRaw === undefined || fromRaw === undefined || toRaw === undefined) return fail('BAD_REQUEST');
  const chainBig = BigInt(chainRaw);
  if (chainBig !== BigInt(limits.chainId)) return fail('CHAIN_NOT_SERVED');
  const from = BigInt(fromRaw);
  const to = BigInt(toRaw);
  if (to < from || to > MAX_BLOCK_NUMBER) return fail('BAD_REQUEST');
  if (to - from + 1n > BigInt(limits.maxWindowBlocks)) return fail('WINDOW_TOO_LARGE');
  const align = BigInt(limits.alignBlocks);
  if (from % align !== 0n || (to + 1n) % align !== 0n) return fail('WINDOW_NOT_ALIGNED');
  const pageRaw = values.get('pageSize');
  const pageBig = pageRaw === undefined ? BigInt(limits.defaultPageSize) : BigInt(pageRaw);
  if (pageBig < 1n || pageBig > BigInt(limits.maxPageSize)) return fail('PAGE_SIZE_OUT_OF_RANGE');
  const cursorRaw = values.get('cursor');
  const query: LogsQuery = { chainId: limits.chainId, from, to, pageSize: Number(pageBig) };
  if (cursorRaw === undefined) return { ok: true, query };
  const cursor = BigInt(cursorRaw);
  if (cursor <= from || cursor > to) return fail('BAD_REQUEST');
  return { ok: true, query: { ...query, cursor } };
}

/** Throws `RangeError` unless `limits` is internally consistent. Called once at service construction. */
export function assertQueryLimits(limits: QueryLimits): void {
  const int = (v: number, lo: number, hi: number): boolean => Number.isSafeInteger(v) && v >= lo && v <= hi;
  if (!TESTNET_CHAIN_IDS.includes(limits.chainId)) throw new RangeError('chain id is not an allowed testnet');
  if (!int(limits.alignBlocks, 1, 1_000_000)) throw new RangeError('alignBlocks out of range');
  if (!int(limits.maxWindowBlocks, limits.alignBlocks, 1_000_000)) throw new RangeError('maxWindowBlocks out of range');
  if (!int(limits.maxPageSize, 1, 100_000)) throw new RangeError('maxPageSize out of range');
  if (!int(limits.defaultPageSize, 1, limits.maxPageSize)) throw new RangeError('defaultPageSize out of range');
  if (!int(limits.maxResponseBytes, 64 * 1024, 64 * 1024 * 1024)) throw new RangeError('maxResponseBytes out of range');
}
