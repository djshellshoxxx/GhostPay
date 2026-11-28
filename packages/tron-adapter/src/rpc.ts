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
/** Private identity distinguishes our size refusal from an error supplied by injected transport code. */
const RESPONSE_LIMIT_FAILURE = new TronAdapterError('INVALID_RESPONSE');

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Cancellation is best effort; an injected stream must not delay a refusal. */
function cancelBody(body: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null): void {
  try {
    void body?.cancel().catch(() => undefined);
  } catch {
    // An injected stream may also throw synchronously during cleanup.
  }
}

/** Bound fetch and each stream read even when an injected implementation ignores abort. */
function interruptible<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('RPC request aborted'));
    };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      void run().then(
        (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
        () => { signal.removeEventListener('abort', onAbort); reject(new Error('RPC request failed')); },
      );
    } catch {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('RPC request failed'));
    }
  });
}

/**
 * Reads the body as UTF-8 text through the byte cap, so a hostile node cannot make the tab buffer an unbounded body:
 * a declared `Content-Length` above it is refused unread, and the download is cancelled as soon as the streamed
 * bytes pass it.
 * @throws {TronAdapterError} `INVALID_RESPONSE` past the cap; stream errors propagate as thrown.
 */
async function readCapped(res: Response, max: number, signal: AbortSignal): Promise<string> {
  if (Number(res.headers.get('content-length')) > max) {
    cancelBody(res.body);
    throw RESPONSE_LIMIT_FAILURE;
  }
  if (res.body === null) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await interruptible(() => reader.read(), signal);
      if (done) { complete = true; break; }
      total += value.byteLength;
      if (total > max) throw RESPONSE_LIMIT_FAILURE;
      chunks.push(value);
    }
  } finally {
    if (!complete) cancelBody(reader);
    reader.releaseLock();
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** https only (localhost / 127.0.0.1 / [::1] may use http for a local devnet). */
export function createHttpRpc(o: HttpRpcOptions): TronRpc {
  let u: URL;
  try {
    u = new URL(o.baseUrl);
  } catch {
    return fail('INVALID_INPUT');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return fail('INSECURE_ENDPOINT');
  // A query or fragment would absorb the appended API path. Use apiKey for header authentication.
  if (u.username !== '' || u.password !== '' || o.baseUrl.includes('?') || o.baseUrl.includes('#')) return fail('INVALID_INPUT');
  const f = o.fetch ?? globalThis.fetch;
  const base = u.toString().replace(/\/$/, '');
  const timeoutMs = o.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647) return fail('INVALID_INPUT');
  return {
    async post(path, body, signal) {
      if (!path.startsWith('/')) return fail('INVALID_INPUT');
      if (isAborted(signal)) return fail('ABORTED');
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      let text: string;
      let received: Response | undefined;
      try {
        const payload = JSON.stringify(body);
        const res = await interruptible(() => f(base + path, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(o.apiKey === undefined ? {} : { 'TRON-PRO-API-KEY': o.apiKey }),
          },
          body: payload,
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        }).then((value) => {
          received = value;
          if (controller.signal.aborted) cancelBody(value.body);
          return value;
        }), controller.signal);
        if (!res.ok) { cancelBody(res.body); return fail('TRANSPORT_FAILURE'); }
        text = await readCapped(res, MAX_BODY_BYTES, controller.signal);
        if (controller.signal.aborted) return fail(isAborted(signal) ? 'ABORTED' : 'TRANSPORT_FAILURE');
      } catch (e) {
        controller.abort();
        // Abort can race the promise continuation after fetch has supplied an unread response.
        if (received !== undefined && !received.bodyUsed) cancelBody(received.body);
        if (isAborted(signal)) return fail('ABORTED');
        return fail(e === RESPONSE_LIMIT_FAILURE ? 'INVALID_RESPONSE' : 'TRANSPORT_FAILURE');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
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
  if (list !== undefined && !Array.isArray(list)) return fail('INVALID_RESPONSE');
  const blocks = ((list as unknown[] | undefined) ?? []).map(parseBlock).filter((b) => b.number >= from && b.number <= to);
  // Completeness: the range must be contiguous and whole. A silently short answer would let the scan skip blocks
  // (and their payments) and move on.
  if (BigInt(blocks.length) !== to - from + 1n) return fail('INVALID_RESPONSE');
  for (let i = 0; i < blocks.length; i++) {
    if ((blocks[i] as TronBlock).number !== from + BigInt(i)) return fail('INVALID_RESPONSE');
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
