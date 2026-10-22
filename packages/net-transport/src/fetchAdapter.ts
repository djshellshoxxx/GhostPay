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
 * or `custom`). POST only; the body must be a string.
 *
 * @remarks A non-2xx upstream status is returned as a `Response` with that status and an empty body so
 * the caller's own HTTP error handling runs. Every other failure is thrown unchanged, so a failed
 * non-direct profile can never turn into a silent `direct` request (NP-T-5).
 * @param transport Transport (usually `profile.transport(purpose)`).
 * @param o Options.
 */
export function transportToFetch(transport: RpcTransport, o: ToFetchOptions = {}): typeof fetch {
  const timeoutMs = o.timeoutMs ?? 30_000;
  const maxBytes = o.maxBytes ?? 1024 * 1024;
  const adapted: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if ((init?.method ?? 'POST').toUpperCase() !== 'POST') throw new NetTransportError('INVALID_CONFIG', 'only POST is supported');
    if (typeof init?.body !== 'string') throw new NetTransportError('INVALID_CONFIG', 'body must be a string');
    try {
      const text = await transport.send(url, init.body, { timeoutMs, maxBytes });
      return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      if (e instanceof RpcHttpError) return new Response(null, { status: e.status });
      throw e;
    }
  };
  return adapted;
}
