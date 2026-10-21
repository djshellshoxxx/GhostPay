import { fail, SolanaStealthError } from './errors.js';
import type { BlockhashLifetime } from './tx.js';

/** Minimal JSON-RPC transport (injectable; tests use a mock). This package never sends transactions. */
export interface SolanaRpc {
  request(method: string, params: readonly unknown[], signal?: AbortSignal): Promise<unknown>;
}

/** Options of {@link createHttpRpc}. */
export interface HttpRpcOptions {
  /** `https://...`, or `http://` only for localhost / 127.0.0.1 (local validator). */
  readonly url: string;
  /** Injectable fetch (tests); defaults to global fetch. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

type ReviverContext = { source?: string } | undefined;

/** JSON parse that turns integers beyond 2^53 into bigint using the source text (V8 >= 11.4). */
export function parseJsonLossless(text: string): unknown {
  return JSON.parse(text, function reviver(this: unknown, _k: string, v: unknown, ctx?: ReviverContext) {
    if (typeof v === 'number' && Number.isInteger(v) && !Number.isSafeInteger(v)) {
      if (ctx?.source === undefined || !/^-?\d+$/.test(ctx.source)) return fail('INVALID_RESPONSE');
      return BigInt(ctx.source);
    }
    return v;
  } as (this: unknown, key: string, value: unknown) => unknown);
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * JSON-RPC 2.0 client over HTTP.
 *
 * @remarks No default endpoint: the caller must choose one (privacy: the RPC operator sees every
 * scanned signature and the scanner's IP). Response `id` must echo the request id.
 * @throws {SolanaStealthError} `INVALID_INPUT` (bad URL), `TRANSPORT_FAILURE`, `INVALID_RESPONSE`,
 * `RPC_ERROR`, `ABORTED`.
 */
export function createHttpRpc(opts: HttpRpcOptions): SolanaRpc {
  let url: URL;
  try {
    url = new URL(opts.url);
  } catch {
    return fail('INVALID_INPUT');
  }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url.hostname)))) {
    return fail('INVALID_INPUT');
  }
  if (url.username !== '' || url.password !== '') return fail('INVALID_INPUT');
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let nextId = 1;
  return {
    async request(method, params, signal) {
      if (isAborted(signal)) return fail('ABORTED');
      const id = nextId++;
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
      let text: string;
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal: combined,
          redirect: 'error',
        });
        if (!res.ok) return fail('TRANSPORT_FAILURE');
        text = await res.text();
      } catch (e) {
        if (e instanceof SolanaStealthError) throw e;
        return fail(isAborted(signal) ? 'ABORTED' : 'TRANSPORT_FAILURE');
      }
      let body: unknown;
      try {
        body = parseJsonLossless(text);
      } catch {
        return fail('INVALID_RESPONSE');
      }
      if (typeof body !== 'object' || body === null) return fail('INVALID_RESPONSE');
      const b = body as { id?: unknown; result?: unknown; error?: unknown };
      if (b.id !== id) return fail('INVALID_RESPONSE');
      if (b.error !== undefined && b.error !== null) return fail('RPC_ERROR');
      if (!('result' in b)) return fail('INVALID_RESPONSE');
      return b.result;
    },
  };
}

/** @internal number|bigint -> bigint, non-negative integer only. */
export function toU64(v: unknown): bigint {
  if (typeof v === 'bigint' && v >= 0n) return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return fail('INVALID_RESPONSE');
}

function obj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('INVALID_RESPONSE');
  return v as Record<string, unknown>;
}

function str(v: unknown): string {
  if (typeof v !== 'string') return fail('INVALID_RESPONSE');
  return v;
}

/** RPC commitment level. */
export type Commitment = 'processed' | 'confirmed' | 'finalized';

/** `getLatestBlockhash`. */
export async function getLatestBlockhash(
  rpc: SolanaRpc,
  commitment: Commitment = 'finalized',
  signal?: AbortSignal,
): Promise<BlockhashLifetime> {
  const r = obj(await rpc.request('getLatestBlockhash', [{ commitment }], signal));
  const value = obj(r['value']);
  return { blockhash: str(value['blockhash']), lastValidBlockHeight: toU64(value['lastValidBlockHeight']) };
}

/** `getMinimumBalanceForRentExemption(dataLength)`. */
export async function getMinimumBalanceForRentExemption(
  rpc: SolanaRpc,
  dataLength: number,
  signal?: AbortSignal,
): Promise<bigint> {
  if (!Number.isSafeInteger(dataLength) || dataLength < 0) return fail('INVALID_INPUT');
  return toU64(await rpc.request('getMinimumBalanceForRentExemption', [dataLength], signal));
}

/** `getSlot`. */
export async function getSlot(
  rpc: SolanaRpc,
  commitment: Commitment = 'finalized',
  signal?: AbortSignal,
): Promise<bigint> {
  return toU64(await rpc.request('getSlot', [{ commitment }], signal));
}

/** One `getSignaturesForAddress` entry. */
export interface SignatureInfo {
  readonly signature: string;
  readonly slot: bigint;
  readonly failed: boolean;
}

/** `getSignaturesForAddress` (newest first). */
export async function getSignaturesForAddress(
  rpc: SolanaRpc,
  address: string,
  opts: { readonly before?: string; readonly limit: number; readonly commitment?: Commitment },
  signal?: AbortSignal,
): Promise<SignatureInfo[]> {
  const cfg: Record<string, unknown> = { limit: opts.limit, commitment: opts.commitment ?? 'finalized' };
  if (opts.before !== undefined) cfg['before'] = opts.before;
  const r = await rpc.request('getSignaturesForAddress', [address, cfg], signal);
  if (!Array.isArray(r)) return fail('INVALID_RESPONSE');
  return r.map((e) => {
    const o = obj(e);
    return { signature: str(o['signature']), slot: toU64(o['slot']), failed: o['err'] != null };
  });
}

/** Parsed subset of a `getTransaction` (encoding `json`) response. */
export interface RpcTransaction {
  readonly slot: bigint;
  readonly signature: string;
  readonly failed: boolean;
  /** Static keys followed by loaded writable then readonly keys (v0 lookup tables). */
  readonly accountKeys: readonly string[];
  readonly instructions: readonly {
    readonly programIdIndex: number;
    readonly accounts: readonly number[];
    /** base58 instruction data. */
    readonly data: string;
  }[];
  readonly preBalances: readonly bigint[];
  readonly postBalances: readonly bigint[];
  readonly postTokenBalances: readonly TokenBalance[];
  readonly preTokenBalances: readonly TokenBalance[];
}

/** Token balance entry (`uiTokenAmount.amount` as bigint). */
export interface TokenBalance {
  readonly accountIndex: number;
  readonly mint: string;
  readonly owner: string | undefined;
  readonly amount: bigint;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return fail('INVALID_RESPONSE');
  return v.map(str);
}

function index(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) return fail('INVALID_RESPONSE');
  return v;
}

function tokenBalances(v: unknown): TokenBalance[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return fail('INVALID_RESPONSE');
  return v.map((e) => {
    const o = obj(e);
    const ui = obj(o['uiTokenAmount']);
    const amt = str(ui['amount']);
    if (!/^\d{1,20}$/.test(amt)) return fail('INVALID_RESPONSE');
    return {
      accountIndex: index(o['accountIndex']),
      mint: str(o['mint']),
      owner: o['owner'] === undefined ? undefined : str(o['owner']),
      amount: BigInt(amt),
    };
  });
}

/** `getTransaction(signature, {encoding:'json', maxSupportedTransactionVersion: 0})`; `null` if unknown. */
export async function getTransaction(
  rpc: SolanaRpc,
  signature: string,
  commitment: Commitment = 'finalized',
  signal?: AbortSignal,
): Promise<RpcTransaction | null> {
  const r = await rpc.request(
    'getTransaction',
    [signature, { encoding: 'json', commitment, maxSupportedTransactionVersion: 0 }],
    signal,
  );
  if (r === null) return null;
  const o = obj(r);
  const tx = obj(o['transaction']);
  const msg = obj(tx['message']);
  const meta = obj(o['meta']);
  const loaded = meta['loadedAddresses'] == null ? undefined : obj(meta['loadedAddresses']);
  const accountKeys = [
    ...strArray(msg['accountKeys']),
    ...(loaded === undefined ? [] : [...strArray(loaded['writable']), ...strArray(loaded['readonly'])]),
  ];
  const ixRaw = msg['instructions'];
  if (!Array.isArray(ixRaw)) return fail('INVALID_RESPONSE');
  const instructions = ixRaw.map((e) => {
    const i = obj(e);
    const accounts = i['accounts'];
    if (!Array.isArray(accounts)) return fail('INVALID_RESPONSE');
    return { programIdIndex: index(i['programIdIndex']), accounts: accounts.map(index), data: str(i['data']) };
  });
  const bal = (v: unknown): bigint[] => {
    if (!Array.isArray(v)) return fail('INVALID_RESPONSE');
    return v.map(toU64);
  };
  const sigs = strArray(tx['signatures']);
  if (sigs[0] === undefined || sigs[0] !== signature) return fail('INVALID_RESPONSE');
  return {
    slot: toU64(o['slot']),
    signature,
    failed: meta['err'] != null,
    accountKeys,
    instructions,
    preBalances: bal(meta['preBalances']),
    postBalances: bal(meta['postBalances']),
    preTokenBalances: tokenBalances(meta['preTokenBalances']),
    postTokenBalances: tokenBalances(meta['postTokenBalances']),
  };
}
