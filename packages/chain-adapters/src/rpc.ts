import type { ChainConfig } from './config/chains.js';
import { ChainAdapterError, fail } from './errors.js';
import type { Address, Hex } from './types.js';

/** Raw JSON-RPC log object as returned by `eth_getLogs` (untrusted). */
export interface RpcLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly transactionHash?: string;
  readonly logIndex: string;
  readonly removed?: boolean;
}

/** Minimal block header view. */
export interface BlockRef {
  readonly number: bigint;
  readonly hash: Hex;
  readonly parentHash: Hex;
}

/** Filter for {@link RpcClient.getLogs}. */
export interface LogFilter {
  readonly address: Address;
  readonly topics: readonly (Hex | null)[];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

/**
 * Low-level transport: POST `body` to `url`, return the response text. Implementations MUST enforce
 * `timeoutMs` and `maxBytes` (throwing `ChainAdapterError` `RESPONSE_TOO_LARGE`/`RPC_FAILURE`) and
 * must signal HTTP failures by throwing {@link RpcHttpError}. Injected in tests: no network is used there.
 */
export interface RpcTransport {
  send(url: string, body: string, init: { readonly timeoutMs: number; readonly maxBytes: number }): Promise<string>;
}

/** Thrown by transports for non-2xx statuses. `retryable` is true for 429 and 5xx. */
export class RpcHttpError extends Error {
  public readonly status: number;
  public constructor(status: number) {
    super(`HTTP ${String(status)}`);
    this.name = 'RpcHttpError';
    this.status = status;
  }
  /** Whether a retry may help. */
  public get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Options for {@link validateRpcUrl}. */
export interface UrlOptions {
  /** Permit `http://localhost`, `http://127.0.0.1` and `http://[::1]` (development only). */
  readonly allowInsecureLocalhost?: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates an RPC endpoint URL.
 *
 * @remarks Accepts `https:` and `wss:`; `http:`/`ws:` only for loopback hosts with the explicit flag.
 * Rejects credentials in the userinfo (they leak into logs and referrers), fragments, empty hosts and
 * other schemes.
 *
 * @param raw URL string.
 * @param opts Options.
 * @returns The normalized URL string.
 * @throws {ChainAdapterError} `RPC_URL_REJECTED`; messages never echo the URL.
 */
export function validateRpcUrl(raw: string, opts: UrlOptions = {}): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail('RPC_URL_REJECTED', 'not a valid URL');
  }
  if (u.username !== '' || u.password !== '') return fail('RPC_URL_REJECTED', 'credentials in URL are not allowed');
  if (u.hash !== '') return fail('RPC_URL_REJECTED', 'fragment not allowed');
  if (u.hostname === '') return fail('RPC_URL_REJECTED', 'empty host');
  if (u.protocol === 'https:' || u.protocol === 'wss:') return u.toString();
  if ((u.protocol === 'http:' || u.protocol === 'ws:') && opts.allowInsecureLocalhost === true && LOCAL_HOSTS.has(u.hostname)) {
    return u.toString();
  }
  return fail('RPC_URL_REJECTED', 'only https/wss (or explicit localhost opt-in) allowed');
}

/** Default transport on top of global `fetch`: HTTP(S) only, streamed size cap, abort-based timeout. */
export const fetchTransport: RpcTransport = {
  async send(url, body, init) {
    if (!url.startsWith('https:') && !url.startsWith('http:')) return fail('RPC_URL_REJECTED', 'fetch transport needs http(s)');
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      ctl.abort();
    }, init.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        signal: ctl.signal,
        redirect: 'error',
      });
      if (!res.ok) throw new RpcHttpError(res.status);
      if (res.body === null) return fail('RPC_FAILURE', 'empty body');
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > init.maxBytes) {
          await reader.cancel();
          return fail('RESPONSE_TOO_LARGE', 'response exceeds cap');
        }
        chunks.push(value);
      }
      const all = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        all.set(c, off);
        off += c.length;
      }
      return new TextDecoder().decode(all);
    } catch (e) {
      if (e instanceof RpcHttpError || (e instanceof Error && e.name === 'ChainAdapterError')) throw e;
      return fail('RPC_FAILURE', 'transport error or timeout');
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Client options. */
export interface ClientOptions extends UrlOptions {
  readonly transport?: RpcTransport;
  /** Per-request timeout, default 10 000 ms. */
  readonly timeoutMs?: number;
  /** Response size cap in bytes, default 2 MiB. */
  readonly maxResponseBytes?: number;
  /** Retries after the first attempt, default 2 (max 5). */
  readonly retries?: number;
  /** Base back-off in ms, default 200. */
  readonly baseDelayMs?: number;
  /** Injected sleep (tests). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Injected uniform random in [0,1) for jitter (tests). Default: Web Crypto. */
  readonly random?: () => number;
  /**
   * Re-verify `eth_chainId` when this many ms have passed since the last check, and always after any failed request
   * (a reconnect). Default 60 000; `0` disables the periodic check (the check after a failure stays on).
   */
  readonly chainRecheckMs?: number;
  /** Injected clock in ms (tests). Default `Date.now`. */
  readonly now?: () => number;
}

/** Verified JSON-RPC client bound to one chain. */
export interface RpcClient {
  readonly chainId: number;
  /** Generic request; returns the `result` field. */
  request(method: string, params: readonly unknown[]): Promise<unknown>;
  blockNumber(): Promise<bigint>;
  getBlock(number: bigint): Promise<BlockRef | null>;
  getLogs(filter: LogFilter): Promise<readonly RpcLog[]>;
}

function cryptoRandom(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return (b[0] as number) / 2 ** 32;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
const HASH = /^0x[0-9a-f]{64}$/;

/**
 * Parses a canonical JSON-RPC quantity.
 *
 * @param v Untrusted value.
 * @returns bigint.
 * @throws {ChainAdapterError} `RPC_FAILURE` for anything but a canonical lowercase hex quantity.
 */
export function parseQuantity(v: unknown): bigint {
  if (typeof v !== 'string' || !QUANTITY.test(v)) return fail('RPC_FAILURE', 'malformed quantity');
  return BigInt(v);
}

function toQuantity(n: bigint): string {
  return `0x${n.toString(16)}`;
}

/**
 * Creates a client and verifies `eth_chainId` against `chain` before returning (fail closed).
 *
 * @remarks Retries (bounded, full-jitter exponential back-off) only on transport failures,
 * retryable HTTP statuses and JSON-RPC rate-limit errors (-32005, -32097); never on malformed
 * responses. Responses larger than the cap, batch responses and id mismatches are rejected.
 * A JSON-RPC error keeps only its code, plus `reverted` on the thrown error when the node
 * reported failed execution (code 3, or -32000/-32003/-32015 with a revert, out-of-gas,
 * invalid-opcode or EVM-halt text), and `halted` when that failure was no plain revert; no node
 * text is kept.
 *
 * @param chain Expected chain (must be known; enablement is checked by callers that build payments).
 * @param url Endpoint; validated by {@link validateRpcUrl}.
 * @param opts Options.
 * @returns A verified client.
 * @throws {ChainAdapterError} `RPC_URL_REJECTED`, `CHAIN_MISMATCH`, `RPC_FAILURE`, `RESPONSE_TOO_LARGE`.
 */
export async function createClient(chain: ChainConfig, url: string, opts: ClientOptions = {}): Promise<RpcClient> {
  const target = validateRpcUrl(url, opts);
  const transport = opts.transport ?? fetchTransport;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxResponseBytes ?? 2 * 1024 * 1024;
  const retries = Math.min(Math.max(opts.retries ?? 2, 0), 5);
  const base = opts.baseDelayMs ?? 200;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? cryptoRandom;
  let nextId = 1;

  const recheckMs = opts.chainRecheckMs ?? 60_000;
  const clock = opts.now ?? Date.now;
  let lastChainCheck = clock();
  let dirty = false;
  let failureGeneration = 0;

  async function rawRequest(method: string, params: readonly unknown[]): Promise<{ readonly value: unknown; readonly generation: number }> {
    const id = nextId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    let reconnect = false;
    for (let attempt = 0; ; attempt++) {
      // This flag belongs to this request: another concurrent chain check must not erase its recovery requirement.
      // Chain-id requests perform their own bounded retries and never recursively verify themselves.
      if (reconnect && method !== 'eth_chainId') {
        await checkChain();
        reconnect = false;
      }
      const generation = failureGeneration;
      try {
        const text = await transport.send(target, body, { timeoutMs, maxBytes });
        if (text.length > maxBytes) return fail('RESPONSE_TOO_LARGE', 'response exceeds cap');
        return { value: parseResponse(text, id), generation };
      } catch (e) {
        // A transport-level failure may mean a reconnect to a different backend: re-verify the chain before trusting
        // more. A JSON-RPC error object proves the same node answered, so it does not.
        if (!(e instanceof JsonRpcError)) {
          dirty = true;
          reconnect = true;
          failureGeneration++;
        }
        if (attempt >= retries || !isRetryable(e)) return rethrow(e);
        await sleep(Math.floor(random() * base * 2 ** attempt));
      }
    }
  }

  async function checkChain(): Promise<void> {
    const response = await rawRequest('eth_chainId', []);
    const reported = parseQuantity(response.value);
    if (reported !== BigInt(chain.chainId)) return fail('CHAIN_MISMATCH', 'endpoint reports a different chain id');
    // A response from a check started before another request lost its connection cannot clear that failure.
    if (response.generation !== failureGeneration) return fail('RPC_FAILURE', 'connection changed during chain verification');
    lastChainCheck = clock();
    dirty = false;
  }

  /** Every request after the first connect is preceded by a chain id re-check when stale or after a failure. */
  async function guarded(method: string, params: readonly unknown[]): Promise<unknown> {
    if (method !== 'eth_chainId' && (dirty || (recheckMs > 0 && clock() - lastChainCheck >= recheckMs))) await checkChain();
    return (await rawRequest(method, params)).value;
  }

  const client = clientFromRequest(chain.chainId, guarded);
  await checkChain();
  dirty = false;
  return client;
}

/** Builds the typed client surface on top of a raw `request` function. */
function clientFromRequest(chainId: number, request: RpcClient['request']): RpcClient {
  return {
    chainId,
    request,
    async blockNumber() {
      return parseQuantity(await request('eth_blockNumber', []));
    },
    async getBlock(number) {
      const r = await request('eth_getBlockByNumber', [toQuantity(number), false]);
      if (r === null) return null;
      if (typeof r !== 'object' || Array.isArray(r)) return fail('RPC_FAILURE', 'malformed block');
      const o = r as Record<string, unknown>;
      const hash = o['hash'];
      const parentHash = o['parentHash'];
      if (typeof hash !== 'string' || !HASH.test(hash) || typeof parentHash !== 'string' || !HASH.test(parentHash)) {
        return fail('RPC_FAILURE', 'malformed block hash');
      }
      const n = parseQuantity(o['number']);
      if (n !== number) return fail('RPC_FAILURE', 'block number mismatch');
      return { number: n, hash: hash as Hex, parentHash: parentHash as Hex };
    },
    async getLogs(f) {
      const r = await request('eth_getLogs', [
        { address: f.address, topics: f.topics, fromBlock: toQuantity(f.fromBlock), toBlock: toQuantity(f.toBlock) },
      ]);
      if (!Array.isArray(r)) return fail('RPC_FAILURE', 'logs not an array');
      return r as RpcLog[];
    },
  };
}

class JsonRpcError extends Error {
  public constructor(
    public readonly rpcCode: number,
    public readonly reverted: boolean,
    public readonly halted: boolean,
  ) {
    super(`JSON-RPC error ${String(rpcCode)}`);
    this.name = 'JsonRpcError';
  }
}

/** @internal Normalizes every failure into a ChainAdapterError. */
function rethrow(e: unknown): never {
  if (e instanceof Error && e.name === 'ChainAdapterError') throw e;
  if (e instanceof RpcHttpError) return fail('RPC_FAILURE', `http status ${String(e.status)}`);
  if (e instanceof JsonRpcError) throw new ChainAdapterError('RPC_FAILURE', `json-rpc error ${String(e.rpcCode)}`, { reverted: e.reverted, halted: e.halted });
  return fail('RPC_FAILURE', 'transport failure');
}

/**
 * Codes that mean failed execution only together with a failure text: geth without revert data (-32000),
 * Nethermind/OpenEthereum (-32015), and reth/op-reth (-32003), which also use it for rejections before execution,
 * such as insufficient funds.
 */
const REVERT_WITH_TEXT_CODES: ReadonlySet<number> = new Set([-32000, -32003, -32015]);

/**
 * Failure texts of those codes: a revert, or the call running out of its gas, hitting an invalid opcode (Nethermind:
 * "invalid instruction") or halting otherwise (reth: "EVM error: ..."). A dry run carries the gas limit that will be
 * signed, so the others mean the signed transaction would fail as well.
 */
const FAILED_EXECUTION_TEXT = /revert|out of gas|invalid opcode|invalid instruction|EVM error/i;

/**
 * Whether a JSON-RPC error object reports failed execution: code 3 (sent with revert data), or -32000/-32003/-32015
 * whose message (or string `data`, where Nethermind and OpenEthereum put it) says it reverted, ran out of gas, hit an
 * invalid opcode or otherwise halted. Only this boolean leaves here.
 */
function reportsRevert(code: number, err: Readonly<Record<string, unknown>>): boolean {
  if (code === 3) return true;
  if (!REVERT_WITH_TEXT_CODES.has(code)) return false;
  return failureTexts(err).some((v) => FAILED_EXECUTION_TEXT.test(v));
}

/** Of a failed execution ({@link reportsRevert}): whether it halted (out of gas, bad opcode) rather than reverted. */
function reportsHalt(code: number, err: Readonly<Record<string, unknown>>): boolean {
  if (code === 3 || !reportsRevert(code, err)) return false;
  return !failureTexts(err).some((v) => /revert/i.test(v));
}

function failureTexts(err: Readonly<Record<string, unknown>>): string[] {
  return [err['message'], err['data']].filter((v): v is string => typeof v === 'string');
}

function isRetryable(e: unknown): boolean {
  if (e instanceof RpcHttpError) return e.retryable;
  if (e instanceof JsonRpcError) return e.rpcCode === -32005 || e.rpcCode === -32097;
  // Transport-level ChainAdapterError RPC_FAILURE (timeout / network) is retryable; size/shape errors are not.
  if (e instanceof Error && e.name === 'ChainAdapterError') return e.message.startsWith('RPC_FAILURE: transport');
  return true; // unknown thrown value from a custom transport: treat as transport failure
}

function parseResponse(text: string, id: number): unknown {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return fail('RPC_FAILURE', 'response is not JSON');
  }
  if (typeof j !== 'object' || j === null || Array.isArray(j)) return fail('RPC_FAILURE', 'response is not an object');
  const o = j as Record<string, unknown>;
  if (o['jsonrpc'] !== '2.0' || o['id'] !== id) return fail('RPC_FAILURE', 'bad envelope or id');
  if ('error' in o) {
    const err = o['error'];
    const fields = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
    const code = typeof fields['code'] === 'number' ? fields['code'] : 0;
    throw new JsonRpcError(code, reportsRevert(code, fields), reportsHalt(code, fields));
  }
  if (!('result' in o)) return fail('RPC_FAILURE', 'missing result');
  return o['result'];
}

/**
 * Cross-checks one request against two independent endpoints and requires identical results.
 *
 * @remarks Use for high-value reads (block hash at a finalized height, manifest-adjacent calls).
 * Comparison is on canonical JSON of the `result`; any difference or failure on either side throws.
 *
 * @param a Primary client.
 * @param b Secondary client (must be on the same chain id).
 * @param method JSON-RPC method.
 * @param params Params.
 * @returns The agreed result.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` for different chains, `RPC_FAILURE` on disagreement.
 */
export async function requestWithFallbackCheck(
  a: RpcClient,
  b: RpcClient,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  if (a.chainId !== b.chainId) return fail('CHAIN_MISMATCH', 'clients target different chains');
  const [ra, rb] = await Promise.all([a.request(method, params), b.request(method, params)]);
  if (stableStringify(ra) !== stableStringify(rb)) return fail('RPC_FAILURE', 'providers disagree');
  return ra;
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Methods whose result is deterministic for a given block and safe to demand from two providers. */
export const DEFAULT_RECONCILED_METHODS: readonly string[] = Object.freeze([
  'eth_getCode',
  'eth_call',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getBlockByNumber',
  'eth_getLogs',
]);

/** Options for {@link createReconciledClient}. */
export interface ReconcileOptions {
  /** Methods that must return identical results from both providers. Default {@link DEFAULT_RECONCILED_METHODS}. */
  readonly methods?: readonly string[];
  /** Sleep used between the first disagreement and the single re-try (tip races). Default 1000 ms. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly retryDelayMs?: number;
}

/**
 * Wraps two verified clients so that every security-relevant read must be identical on both providers.
 *
 * @remarks Reads outside the reconciled set (`eth_blockNumber`, `eth_gasPrice`, `eth_sendRawTransaction`, ...) go to
 * the primary only. A disagreement is re-tried once after a short pause (providers may differ by one block at the
 * tip); a second disagreement throws `RPC_FAILURE: providers disagree`. This detects a single lying or omitting
 * provider (S3-14); it does not help when both providers are the same backend or collude.
 *
 * @param primary Primary client.
 * @param secondary Independent second client on the same chain.
 * @param opts Options.
 * @returns A client with the same interface.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` when the clients are on different chains.
 */
export function createReconciledClient(primary: RpcClient, secondary: RpcClient, opts: ReconcileOptions = {}): RpcClient {
  if (primary.chainId !== secondary.chainId) return fail('CHAIN_MISMATCH', 'clients target different chains');
  const methods = new Set(opts.methods ?? DEFAULT_RECONCILED_METHODS);
  const sleep = opts.sleep ?? defaultSleep;
  const delay = opts.retryDelayMs ?? 1000;
  const request = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    if (!methods.has(method)) return primary.request(method, params);
    try {
      return await requestWithFallbackCheck(primary, secondary, method, params);
    } catch (e) {
      if (!(e instanceof Error) || e.message !== 'RPC_FAILURE: providers disagree') throw e;
      await sleep(delay);
      return requestWithFallbackCheck(primary, secondary, method, params);
    }
  };
  return clientFromRequest(primary.chainId, request);
}
