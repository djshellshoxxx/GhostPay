import type { RawLog } from './abi.js';
import { ANNOUNCEMENT_TOPIC, type Hex } from './wire.js';

/** A canonical block header as reported by the chain. */
export interface ChainHeader {
  readonly number: bigint;
  readonly hash: Hex;
  readonly parentHash: Hex;
}

/** What the ingester needs from a chain. The JSON-RPC implementation is {@link JsonRpcChainReader}. */
export interface ChainReader {
  chainId(signal?: AbortSignal): Promise<number>;
  blockNumber(signal?: AbortSignal): Promise<bigint>;
  /** Header at `n`, or `undefined` when the chain has no such block (yet, or any more after a reorg). */
  header(n: bigint, signal?: AbortSignal): Promise<ChainHeader | undefined>;
  /** Announcement logs of `announcer` in `[from, to]` (address and topic 0 filter only). */
  announcerLogs(from: bigint, to: bigint, announcer: Hex, signal?: AbortSignal): Promise<RawLog[]>;
}

/** RPC failure with fixed text: never the endpoint URL (it can carry an API key) or the response body. */
export class RpcError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

/** Options for {@link JsonRpcChainReader}. */
export interface JsonRpcOptions {
  readonly url: string;
  /** Per-call timeout, default 15 s. */
  readonly timeoutMs?: number;
  /** Response size cap in bytes, default 32 MiB. */
  readonly maxResponseBytes?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

const QTY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const H32 = /^0x[0-9a-fA-F]{64}$/;
const H20 = /^0x[0-9a-fA-F]{40}$/;
const DATA = /^0x(?:[0-9a-fA-F]{2})*$/;

const bad = (): never => {
  throw new RpcError('malformed rpc response');
};
const qty = (v: unknown): bigint => (typeof v === 'string' && QTY.test(v) ? BigInt(v) : bad());
const h32 = (v: unknown): Hex => (typeof v === 'string' && H32.test(v) ? (v.toLowerCase() as Hex) : bad());
const toQty = (n: bigint): string => `0x${n.toString(16)}`;

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new RpcError('rpc response too large');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseLog(raw: unknown): RawLog {
  if (typeof raw !== 'object' || raw === null) return bad();
  const r = raw as Record<string, unknown>;
  const address = r['address'];
  const topics = r['topics'];
  const data = r['data'];
  const logIndex = qty(r['logIndex']);
  if (typeof address !== 'string' || !H20.test(address) || typeof data !== 'string' || !DATA.test(data)) return bad();
  if (!Array.isArray(topics) || topics.length > 4 || logIndex > 0xffff_ffffn) return bad();
  const removed = r['removed'];
  if (removed !== undefined && typeof removed !== 'boolean') return bad();
  return {
    address: address.toLowerCase() as Hex,
    topics: (topics as unknown[]).map(h32),
    data: data.toLowerCase() as Hex,
    blockNumber: qty(r['blockNumber']),
    blockHash: h32(r['blockHash']),
    logIndex: Number(logIndex),
    transactionHash: h32(r['transactionHash']),
    removed: removed === true,
  };
}

/**
 * Minimal JSON-RPC reader over `fetch` (POST, JSON, no batching). Every response is size-capped and shape-checked.
 *
 * @security The RPC endpoint is the operator's own upstream. It learns which blocks the indexer reads, which is public
 * information; no client request is ever forwarded to it.
 */
export class JsonRpcChainReader implements ChainReader {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly fetchImpl: typeof fetch;
  private id = 0;

  public constructor(o: JsonRpcOptions) {
    let u: URL;
    try {
      u = new URL(o.url);
    } catch {
      throw new RpcError('malformed rpc url');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new RpcError('unsupported rpc url scheme');
    this.url = o.url;
    this.timeoutMs = o.timeoutMs ?? 15_000;
    this.maxBytes = o.maxResponseBytes ?? 32 * 1024 * 1024;
    this.fetchImpl = o.fetchImpl ?? fetch;
  }

  private async call(method: string, params: readonly unknown[], signal?: AbortSignal): Promise<unknown> {
    const id = ++this.id;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const sig = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    let text: string;
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: sig,
        redirect: 'error',
      });
      if (!res.ok) throw new RpcError('rpc http error');
      text = await readCapped(res, this.maxBytes);
    } catch (e) {
      if (e instanceof RpcError) throw e;
      throw new RpcError('rpc request failed');
    }
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      return bad();
    }
    if (typeof doc !== 'object' || doc === null || (doc as Record<string, unknown>)['id'] !== id) return bad();
    const d = doc as Record<string, unknown>;
    if (d['error'] !== undefined) throw new RpcError('rpc returned an error');
    if (!('result' in d)) return bad();
    return d['result'];
  }

  public async chainId(signal?: AbortSignal): Promise<number> {
    const n = qty(await this.call('eth_chainId', [], signal));
    return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : bad();
  }

  public async blockNumber(signal?: AbortSignal): Promise<bigint> {
    return qty(await this.call('eth_blockNumber', [], signal));
  }

  public async header(n: bigint, signal?: AbortSignal): Promise<ChainHeader | undefined> {
    const r = await this.call('eth_getBlockByNumber', [toQty(n), false], signal);
    if (r === null) return undefined;
    if (typeof r !== 'object') return bad();
    const b = r as Record<string, unknown>;
    const number = qty(b['number']);
    if (number !== n) return bad();
    return { number, hash: h32(b['hash']), parentHash: h32(b['parentHash']) };
  }

  public async announcerLogs(from: bigint, to: bigint, announcer: Hex, signal?: AbortSignal): Promise<RawLog[]> {
    const r = await this.call('eth_getLogs', [{ fromBlock: toQty(from), toBlock: toQty(to), address: announcer, topics: [ANNOUNCEMENT_TOPIC] }], signal);
    if (!Array.isArray(r)) return bad();
    return (r as unknown[]).map(parseLog);
  }
}
