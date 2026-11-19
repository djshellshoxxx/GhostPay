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
 * `RpcTransport` over a fetch implementation, honouring the contract: bounded `timeoutMs`, streamed
 * `maxBytes` cap, non-2xx -> `RpcHttpError`, `redirect: 'error'`, no cookies, no referrer.
 *
 * @security The URL is validated with chain-adapters `validateRpcUrl` (https, no userinfo/fragment;
 * loopback http only with the flag) and must be http(s) (this transport cannot do `wss`).
 * @param o Options.
 */
export function createFetchTransport(o: FetchTransportOptions = {}): RpcTransport {
  return {
    async send(url, body, init) {
      // setTimeout otherwise coerces NaN/overflow/negative deadlines; an invalid cap can remove the bound entirely.
      if (!Number.isInteger(init.timeoutMs) || init.timeoutMs < 1 || init.timeoutMs > 2_147_483_647 ||
          !Number.isSafeInteger(init.maxBytes) || init.maxBytes < 1) {
        throw new NetTransportError('INVALID_CONFIG', 'invalid transport limits');
      }
      const checked = validateRpcUrl(url, o.allowInsecureLocalhost === true ? { allowInsecureLocalhost: true } : {});
      if (!checked.startsWith('http')) throw new NetTransportError('URL_REJECTED', 'destination URL rejected');
      const f = o.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
      if (f === undefined) throw new NetTransportError('UNSUPPORTED_ENV', 'no fetch implementation available');
      const ctl = new AbortController();
      const failure = new ChainAdapterError('RPC_FAILURE', 'transport error or timeout');
      let responseError: ChainAdapterError | RpcHttpError | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          ctl.abort();
          reject(failure);
        }, init.timeoutMs);
      });
      const read = async (): Promise<string> => {
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
        // An injected SDK may ignore AbortSignal. Discard late results without starting body consumption.
        if (ctl.signal.aborted) {
          if (res.body !== null) cancelQuietly(res.body);
          throw failure;
        }
        if (!Number.isInteger(res.status) || res.status < 200 || res.status > 599 || res.ok !== (res.status < 300)) {
          if (res.body !== null) cancelQuietly(res.body);
          throw failure;
        }
        if (!res.ok) {
          if (res.body !== null) cancelQuietly(res.body);
          responseError = new RpcHttpError(res.status);
          throw responseError;
        }
        if (res.body === null) {
          responseError = new ChainAdapterError('RPC_FAILURE', 'empty body');
          throw responseError;
        }
        const bodyReader = res.body.getReader();
        reader = bodyReader;
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await bodyReader.read();
          if (ctl.signal.aborted) throw failure;
          if (done) break;
          total += value.length;
          if (total > init.maxBytes) {
            responseError = new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
            throw responseError;
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
      };
      try {
        // Abort alone cannot settle a noncompliant fetch/stream; the deadline covers fetch AND body reads.
        return await Promise.race([read(), deadline]);
      } catch (e) {
        // Only errors constructed in this request are safe to expose. Even a real imported error class may
        // carry URL/request data when thrown by an injected fetch, stream or SDK.
        if (responseError !== undefined && e === responseError) throw e;
        throw failure;
      } finally {
        clearTimeout(timer);
        ctl.abort();
        if (reader !== undefined) {
          cancelQuietly(reader);
          try { reader.releaseLock(); } catch { /* Cleanup errors must not replace the fixed response error. */ }
        }
      }
    },
  };
}

/** Cancellation is cleanup, never a dependency of reporting a timeout, HTTP failure or response-size refusal. */
function cancelQuietly(stream: { cancel(): Promise<void> }): void {
  try { void stream.cancel().catch(() => undefined); } catch { /* Untrusted implementations may throw synchronously. */ }
}
