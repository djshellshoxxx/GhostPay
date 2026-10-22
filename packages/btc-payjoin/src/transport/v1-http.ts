import { PayjoinError, fail, mapRemoteError, toRemoteErrorCode, type PayjoinErrorCode } from '../errors.js';
import { assertNetwork } from '../network.js';
import { MAX_PSBT_BASE64 } from '../psbt.js';
import { parseParams, serializeParams, type PayjoinParams } from '../params.js';
import { buildPayjoinUri, validatePjUrl, type PayjoinUri } from '../uri.js';
import type {
  IncomingOriginal,
  OpenReceiverRequest,
  PayjoinTransport,
  ReceiverTransportSession,
  SenderTransportSession,
} from './types.js';

/** Minimal HTTP request as seen by the receiver endpoint. */
export interface HttpRequestLike {
  readonly method: string;
  /** Query string without the leading `?`. */
  readonly query: string;
  readonly body: string;
}

/** Minimal HTTP response produced by the receiver endpoint. */
export interface HttpResponseLike {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** Request handler a listener must route the `pj` path to. */
export type HttpHandler = (req: HttpRequestLike) => Promise<HttpResponseLike>;

/** A bound listener. */
export interface HttpListener {
  /** Absolute endpoint URL to put in `pj=`. */
  readonly url: string;
  close(): Promise<void>;
}

/** Options for {@link V1HttpTransport}. */
export interface V1HttpOptions {
  /** Injected fetch (BPJ-GEN-4). */
  readonly fetch?: typeof fetch;
  /** Injected listener factory, e.g. `nodeListen` from `v1-node.ts`. */
  readonly listen?: (handler: HttpHandler) => Promise<HttpListener>;
  /** Sender request timeout. Default 30 s. */
  readonly requestTimeoutMs?: number;
  /** How long the receiver endpoint waits for the application to reply. Default 30 s. */
  readonly replyTimeoutMs?: number;
  /** Maximum requests parked awaiting an application reply; more get 503 `unavailable`. Default 16. */
  readonly maxPending?: number;
}

const CORS = { 'Access-Control-Allow-Origin': '*' } as const;

function errorResponse(code: PayjoinErrorCode): HttpResponseLike {
  const remote = toRemoteErrorCode(code);
  const status = remote === 'unavailable' ? 503 : 400;
  const body: { errorCode: string; message: string; supported?: number[] } = {
    errorCode: remote,
    message: remote,
  };
  if (remote === 'version-unsupported') body.supported = [1];
  return { status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/**
 * BIP-78 (v1) transport: the sender POSTs the base64 Original with
 * `Content-Type: text/plain` and optional query parameters; the receiver
 * answers 200 with the base64 proposal, or a JSON error (BIP-78 "Protocol",
 * "Optional parameters", "Receiver's well known errors").
 *
 * @security Sender: `redirect: 'error'`, response size cap, JSON error codes
 * mapped through {@link mapRemoteError}, remote `message` discarded (BIP-78:
 * unknown errors must not reach the UI). The `pj` URL scheme is validated
 * by {@link validatePjUrl} (https, onion http or loopback).
 */
export class V1HttpTransport implements PayjoinTransport {
  public readonly kind = 'v1-http' as const;

  public constructor(private readonly opts: V1HttpOptions = {}) {}

  public async openReceiverSession(r: OpenReceiverRequest): Promise<ReceiverTransportSession> {
    assertNetwork(r.network);
    const listen = this.opts.listen;
    if (listen === undefined) fail('transport_failed', 'no listener configured');
    const replyTimeout = this.opts.replyTimeoutMs ?? 30_000;
    const queue: IncomingOriginal[] = [];
    const maxPending = this.opts.maxPending ?? 16;
    let parked = 0;
    let closed = false;

    const handler: HttpHandler = async (req) => {
      if (req.method === 'OPTIONS') {
        return { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' }, body: '' };
      }
      if (closed) return errorResponse('unavailable');
      if (req.method !== 'POST') return { status: 405, headers: { ...CORS }, body: '' };
      if (req.body.length === 0 || req.body.length > MAX_PSBT_BASE64) return errorResponse('original_psbt_rejected');
      let params: PayjoinParams;
      try {
        params = parseParams(req.query);
      } catch (e) {
        return errorResponse(e instanceof PayjoinError ? e.code : 'original_psbt_rejected');
      }
      if (parked >= maxPending) return errorResponse('unavailable');
      parked++;
      return new Promise<HttpResponseLike>((resolve) => {
        let settled = false;
        const settle = (r2: HttpResponseLike): void => {
          if (!settled) {
            settled = true;
            parked--;
            clearTimeout(timer);
            resolve(r2);
          }
        };
        const timer = setTimeout(() => {
          settle(errorResponse('unavailable'));
        }, replyTimeout);
        queue.push({
          originalPsbt: req.body.trim(),
          params,
          reply(p) {
            settle(
              typeof p === 'string'
                ? { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' }, body: p }
                : errorResponse(p.error),
            );
            return Promise.resolve();
          },
        });
      });
    };

    const listener = await listen(handler);
    const uri: PayjoinUri = {
      address: r.address,
      ...(r.amountSats !== undefined ? { amountSats: r.amountSats } : {}),
      pj: listener.url,
      outputSubstitution: r.outputSubstitution ?? true,
      network: r.network,
    };
    try {
      buildPayjoinUri(uri);
    } catch (e) {
      await listener.close();
      throw e;
    }
    return {
      uri,
      poll: () => Promise.resolve(queue.shift() ?? null),
      async close() {
        closed = true;
        await listener.close();
      },
    };
  }

  public sendOriginal(uri: PayjoinUri, originalPsbt: string, params: PayjoinParams): Promise<SenderTransportSession> {
    assertNetwork(uri.network);
    const f = this.opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (f === undefined) fail('transport_failed', 'no fetch');
    if (validatePjUrl(uri.pj) !== 1) fail('uri_invalid', 'v1 transport needs a v1 pj url');
    const url = `${uri.pj}${uri.pj.includes('?') ? '&' : '?'}${serializeParams(params)}`;
    const timeout = this.opts.requestTimeoutMs ?? 30_000;
    const result: Promise<{ proposalPsbt: string } | { error: PayjoinErrorCode }> = (async () => {
      try {
        const res = await f(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: originalPsbt,
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        });
        const text = await res.text();
        if (text.length > MAX_PSBT_BASE64) return { error: 'transport_failed' as const };
        if (res.status === 200) return { proposalPsbt: text.trim() };
        let remote: unknown;
        try {
          remote = (JSON.parse(text) as { errorCode?: unknown }).errorCode;
        } catch {
          remote = undefined;
        }
        return { error: mapRemoteError(remote) };
      } catch {
        return { error: 'transport_failed' as const };
      }
    })();
    return Promise.resolve({ poll: () => result });
  }
}
