import { RpcHttpError, type RpcTransport } from '@ghostpay/chain-adapters';
import { NetTransportError } from './errors.js';

/** Options for {@link transportToFetch}. */
export interface ToFetchOptions {
  /** Per-request timeout, ms. Default 30000. */
  readonly timeoutMs?: number;
  /** Response cap, bytes. Default 1 MiB. */
  readonly maxBytes?: number;
}

/**
 * Adapts an {@link RpcTransport} to a `fetch`-shaped function (for example viem's `http(url, {fetchFn})`
 * or `custom`). POST only; the explicit `init.body` must be a string, including for Request inputs.
 *
 * @remarks A non-2xx upstream status is returned as a `Response` with that status and an empty body so
 * the caller's own HTTP error handling runs. Every other failure is thrown unchanged, so a failed
 * non-direct profile can never turn into a silent `direct` request (NP-T-5).
 * Already-cancelled calls never dispatch. Cancellation after dispatch refuses the result but cannot recall
 * bytes already sent: RpcTransport has no cancellation interface, and its own timeout still bounds the work.
 * @param transport Transport (usually `profile.transport(purpose)`).
 * @param o Options.
 */
export function transportToFetch(transport: RpcTransport, o: ToFetchOptions = {}): typeof fetch {
  const timeoutMs = o.timeoutMs ?? 30_000;
  const maxBytes = o.maxBytes ?? 1024 * 1024;
  const adapted: typeof fetch = async (input, init) => {
    const request = typeof input === 'string' || input instanceof URL ? undefined : input;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? request?.method ?? 'POST';
    if (typeof method !== 'string' || method.toUpperCase() !== 'POST') throw new NetTransportError('INVALID_CONFIG', 'only POST is supported');
    if (typeof init?.body !== 'string') throw new NetTransportError('INVALID_CONFIG', 'body must be a string');
    // An explicit null detaches a Request's signal, as with fetch; undefined inherits it.
    const signal = init.signal === undefined ? request?.signal : init.signal;
    const aborted = new DOMException('request aborted', 'AbortError');
    const isAborted = (): boolean => signal?.aborted === true;
    if (isAborted()) throw aborted;
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => { reject(aborted); };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const text = await Promise.race([transport.send(url, init.body, { timeoutMs, maxBytes }), cancelled]);
      if (isAborted()) throw aborted;
      return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      if (isAborted()) throw aborted;
      if (e instanceof RpcHttpError) return new Response(null, { status: e.status });
      throw e;
    } finally {
      if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort);
    }
  };
  return adapted;
}
