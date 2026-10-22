import { ChainAdapterError, RpcHttpError, validateRpcUrl, type RpcTransport } from '@ghostpay/chain-adapters';
import { NetTransportError } from './errors.js';

/** Minimal fetch shape (global `fetch`, a Nym `mixFetch`, or a test double). */
export type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    redirect: 'error';
    credentials: 'omit';
    cache: 'no-store';
    referrerPolicy: 'no-referrer';
  },
) => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>;

/** Options for {@link createFetchTransport}. */
export interface FetchTransportOptions {
  /** Fetch implementation; default resolves `globalThis.fetch` at send time. */
  readonly fetchImpl?: FetchLike | undefined;
  /** Permit `http://localhost|127.0.0.1|[::1]` (development). */
  readonly allowInsecureLocalhost?: boolean | undefined;
}

/**
 * `RpcTransport` over a fetch implementation, honouring the contract: abort-based `timeoutMs`, streamed
 * `maxBytes` cap, non-2xx -> `RpcHttpError`, `redirect: 'error'`, no cookies, no referrer.
 *
 * @security The URL is validated with chain-adapters `validateRpcUrl` (https, no userinfo/fragment;
 * loopback http only with the flag) and must be http(s) (this transport cannot do `wss`).
 * @param o Options.
 */
export function createFetchTransport(o: FetchTransportOptions = {}): RpcTransport {
  return {
    async send(url, body, init) {
      const checked = validateRpcUrl(url, o.allowInsecureLocalhost === true ? { allowInsecureLocalhost: true } : {});
      if (!checked.startsWith('http')) throw new NetTransportError('URL_REJECTED', 'destination URL rejected');
      const f = o.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
      if (f === undefined) throw new NetTransportError('UNSUPPORTED_ENV', 'no fetch implementation available');
      const ctl = new AbortController();
      const timer = setTimeout(() => {
        ctl.abort();
      }, init.timeoutMs);
      try {
        const res = await f(checked, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body,
          signal: ctl.signal,
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        });
        if (!res.ok) throw new RpcHttpError(res.status);
        if (res.body === null) throw new ChainAdapterError('RPC_FAILURE', 'empty body');
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > init.maxBytes) {
            await reader.cancel();
            throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
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
        if (e instanceof RpcHttpError || e instanceof NetTransportError || (e instanceof Error && e.name === 'ChainAdapterError')) throw e;
        throw new ChainAdapterError('RPC_FAILURE', 'transport error or timeout');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
