import { fail, TronAdapterError } from './errors.js';

/** Minimal JSON-over-HTTP node API (java-tron full node / TronGrid `/wallet/*`). Injectable for tests. */
export interface TronRpc {
  post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown>;
}

/** Options of {@link createHttpRpc}. */
export interface HttpRpcOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  /** Sent as `TRON-PRO-API-KEY` (TronGrid). Never logged. */
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Reads the body as UTF-8 text through the byte cap, so a hostile node cannot make the tab buffer an unbounded body:
 * a declared `Content-Length` above it is refused unread, and the download is cancelled as soon as the streamed
 * bytes pass it.
 * @throws {TronAdapterError} `INVALID_RESPONSE` past the cap; stream errors propagate as thrown.
 */
async function readCapped(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get('content-length')) > max) {
    await res.body?.cancel().catch(() => undefined);
    return fail('INVALID_RESPONSE');
  }
  if (res.body === null) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return fail('INVALID_RESPONSE');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** https only (localhost / 127.0.0.1 may use http for a local devnet). */
export function createHttpRpc(o: HttpRpcOptions): TronRpc {
  let u: URL;
  try {
    u = new URL(o.baseUrl);
  } catch {
    return fail('INVALID_INPUT');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return fail('INSECURE_ENDPOINT');
  const f = o.fetch ?? globalThis.fetch;
  const base = u.toString().replace(/\/$/, '');
  return {
    async post(path, body, signal) {
      if (!path.startsWith('/')) return fail('INVALID_INPUT');
      const timeout = AbortSignal.timeout(o.timeoutMs ?? 15_000);
      let res: Response;
      try {
        res = await f(base + path, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(o.apiKey === undefined ? {} : { 'TRON-PRO-API-KEY': o.apiKey }),
          },
          body: JSON.stringify(body),
          redirect: 'error',
          signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        });
      } catch {
        if (signal?.aborted === true) return fail('ABORTED');
        return fail('TRANSPORT_FAILURE');
      }
      if (!res.ok) return fail('TRANSPORT_FAILURE');
      let text: string;
      try {
        text = await readCapped(res, MAX_BODY_BYTES);
      } catch (e) {
        if (e instanceof TronAdapterError) throw e;
        return fail(signal?.aborted === true ? 'ABORTED' : 'TRANSPORT_FAILURE');
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return fail('INVALID_RESPONSE');
      }
    },
  };
}

/** A block as returned by `getblockbylimitnext` / `getnowblock`, reduced to what scanning needs. */
export interface TronBlock {
  readonly number: bigint;
  readonly blockId: string;
  readonly transactions: readonly unknown[];
}

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('INVALID_RESPONSE');
  return v as Record<string, unknown>;
}

/** @internal */
export function parseBlock(v: unknown): TronBlock {
  const b = asRecord(v);
  const header = asRecord(asRecord(b['block_header'])['raw_data']);
  const n = header['number'];
  const id = b['blockID'];
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return fail('INVALID_RESPONSE');
  if (typeof id !== 'string' || !/^[0-9a-f]{64}$/i.test(id)) return fail('INVALID_RESPONSE');
  const txs = b['transactions'];
  if (txs !== undefined && !Array.isArray(txs)) return fail('INVALID_RESPONSE');
  return { number: BigInt(n), blockId: id, transactions: (txs as unknown[] | undefined) ?? [] };
}

/** Latest block (for ref block + head height). */
export async function getNowBlock(rpc: TronRpc, signal?: AbortSignal): Promise<TronBlock> {
  return parseBlock(await rpc.post('/wallet/getnowblock', {}, signal));
}

/** Blocks in [from, to] (inclusive), in order, via `/wallet/getblockbylimitnext` (end exclusive, UNVERIFIED). */
export async function getBlockRange(rpc: TronRpc, from: bigint, to: bigint, signal?: AbortSignal): Promise<TronBlock[]> {
  if (from < 0n || to < from || to > BigInt(Number.MAX_SAFE_INTEGER)) return fail('INVALID_INPUT');
  const resp = asRecord(await rpc.post('/wallet/getblockbylimitnext', { startNum: Number(from), endNum: Number(to) + 1 }, signal));
  const list = resp['block'];
  if (list === undefined) return [];
  if (!Array.isArray(list)) return fail('INVALID_RESPONSE');
  const blocks = list.map(parseBlock).filter((b) => b.number >= from && b.number <= to);
  for (let i = 1; i < blocks.length; i++) {
    if ((blocks[i] as TronBlock).number <= (blocks[i - 1] as TronBlock).number) return fail('INVALID_RESPONSE');
  }
  return blocks;
}

/** Receipt log subset used to confirm a TRC-20 Transfer event. */
export interface TronTxInfo {
  readonly id: string;
  readonly resultOk: boolean;
  readonly logs: readonly { readonly address: string; readonly topics: readonly string[]; readonly data: string }[];
}

/** `/wallet/gettransactioninfobyid`. */
export async function getTransactionInfo(rpc: TronRpc, txID: string, signal?: AbortSignal): Promise<TronTxInfo> {
  const r = asRecord(await rpc.post('/wallet/gettransactioninfobyid', { value: txID }, signal));
  if (r['id'] !== txID) return fail('INVALID_RESPONSE');
  const receipt = r['receipt'] === undefined ? {} : asRecord(r['receipt']);
  const result = receipt['result'];
  const rawLogs = r['log'] === undefined ? [] : r['log'];
  if (!Array.isArray(rawLogs)) return fail('INVALID_RESPONSE');
  const logs = rawLogs.map((l) => {
    const o = asRecord(l);
    const topics = o['topics'] ?? [];
    if (typeof o['address'] !== 'string' || !Array.isArray(topics) || topics.some((t) => typeof t !== 'string')) {
      return fail('INVALID_RESPONSE');
    }
    return { address: o['address'].toLowerCase(), topics: (topics as string[]).map((t) => t.toLowerCase()), data: (typeof o['data'] === 'string' ? o['data'] : '').toLowerCase() };
  });
  return { id: txID, resultOk: result === undefined || result === 'SUCCESS', logs };
}

/** `/wallet/getchainparameters` raw response. */
export async function getChainParametersRaw(rpc: TronRpc, signal?: AbortSignal): Promise<unknown> {
  return rpc.post('/wallet/getchainparameters', {}, signal);
}
