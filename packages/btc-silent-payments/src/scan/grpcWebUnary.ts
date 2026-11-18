import { fail, SilentPaymentError } from '../errors.js';

/** Explicit transport; no browser credentials, redirects, caches or referrers are allowed. */
export type GrpcWebFetch = (url: string, init: {
  readonly method: 'POST'; readonly headers: Readonly<Record<string, string>>; readonly body: Uint8Array<ArrayBuffer>;
  readonly signal: AbortSignal; readonly credentials: 'omit'; readonly redirect: 'error';
  readonly cache: 'no-store'; readonly referrerPolicy: 'no-referrer';
}) => Promise<Response>;

function cancel(body: ReadableStream<Uint8Array> | null): void {
  try { void body?.cancel().catch(() => undefined); } catch { /* Preserve the failure. */ }
}
function checkTrailer(bytes: Uint8Array): void {
  if (bytes.length > 4096 || bytes.some((b) => b > 127)) return fail('INVALID_RESPONSE');
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\r\n');
  if (lines.at(-1) !== '') return fail('INVALID_RESPONSE');
  const statuses: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const match = /^([a-z0-9-]+):[ \t]*([^\r\n]*)$/.exec(line);
    if (!match) return fail('INVALID_RESPONSE');
    if (match[1] === 'grpc-status') statuses.push(match[2]!);
  }
  if (statuses.length !== 1 || statuses[0] !== '0') return fail('INVALID_RESPONSE');
}

/** Strict unary binary gRPC-Web. No streaming shortcuts or implicit retries. */
export async function grpcWebUnary(options: {
  readonly url: string; readonly payload: Uint8Array; readonly fetch: GrpcWebFetch;
  readonly maxBytes: number; readonly timeoutMs: number; readonly signal?: AbortSignal;
}): Promise<Uint8Array> {
  const stop = new AbortController();
  const abortError = (): SilentPaymentError => new SilentPaymentError(options.signal?.aborted === true ? 'ABORTED' : 'TRANSPORT_FAILURE');
  if (options.signal?.aborted === true) throw abortError();
  const forward = (): void => stop.abort();
  options.signal?.addEventListener('abort', forward, { once: true });
  let rejectAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(abortError());
    stop.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const timer = setTimeout(() => stop.abort(), options.timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let body: ReadableStream<Uint8Array> | null = null;
  let complete = false;
  try {
    const request = new Uint8Array(options.payload.length + 5);
    new DataView(request.buffer).setUint32(1, options.payload.length);
    request.set(options.payload, 5);
    const pending = options.fetch(options.url, {
      method: 'POST', body: request, signal: stop.signal, credentials: 'omit', redirect: 'error',
      cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/grpc-web+proto', accept: 'application/grpc-web+proto', 'x-grpc-web': '1' },
    });
    // A transport ignoring abort can settle after our deadline. Release its unused body then too.
    void pending.then((response) => { if (stop.signal.aborted) cancel(response.body); }, () => undefined);
    const response = await Promise.race([pending, deadline]);
    body = response.body;
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!response.ok || (type !== 'application/grpc-web+proto' && type !== 'application/grpc-web')) return fail('TRANSPORT_FAILURE');
    const status = response.headers.get('grpc-status');
    if (status !== null && status !== '0') return fail('TRANSPORT_FAILURE');
    const declared = response.headers.get('content-length');
    if (declared !== null && /^[0-9]+$/.test(declared) && Number(declared) > options.maxBytes) return fail('INVALID_RESPONSE');
    if (body === null) return fail('INVALID_RESPONSE');
    reader = body.getReader();
    let total = 0;
    let header = new Uint8Array(5);
    let headerUsed = 0;
    let payload: Uint8Array | undefined;
    let payloadUsed = 0;
    let flag = 0;
    let data: Uint8Array | undefined;
    let trailers = false;
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      const value = chunk.value;
      total += value.length;
      if (total > options.maxBytes) return fail('INVALID_RESPONSE');
      for (let offset = 0; offset < value.length;) {
        if (trailers) return fail('INVALID_RESPONSE');
        if (payload === undefined) {
          const count = Math.min(5 - headerUsed, value.length - offset);
          header.set(value.subarray(offset, offset + count), headerUsed); offset += count; headerUsed += count;
          if (headerUsed !== 5) continue;
          flag = header[0]!;
          const size = new DataView(header.buffer).getUint32(1);
          if ((flag !== 0 && flag !== 0x80) || size > options.maxBytes - 5 || (flag === 0x80 && size > 4096)) return fail('INVALID_RESPONSE');
          if ((flag === 0 && data !== undefined) || (flag === 0x80 && data === undefined)) return fail('INVALID_RESPONSE');
          payload = new Uint8Array(size); payloadUsed = 0;
        }
        const count = Math.min(payload.length - payloadUsed, value.length - offset);
        payload.set(value.subarray(offset, offset + count), payloadUsed); offset += count; payloadUsed += count;
        if (payloadUsed === payload.length) {
          if (flag === 0) data = payload;
          else { checkTrailer(payload); trailers = true; }
          payload = undefined; header = new Uint8Array(5); headerUsed = 0;
        }
      }
    }
    if (!trailers || data === undefined || headerUsed !== 0 || payload !== undefined) return fail('INVALID_RESPONSE');
    complete = true;
    return data;
  } catch (error) {
    if (error instanceof SilentPaymentError) throw error;
    if (stop.signal.aborted) throw abortError();
    return fail('TRANSPORT_FAILURE');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forward);
    if (rejectAbort !== undefined) stop.signal.removeEventListener('abort', rejectAbort);
    if (!complete) {
      stop.abort();
      if (reader !== undefined) { try { void reader.cancel().catch(() => undefined); } catch { /* Preserve failure. */ } }
      else cancel(body);
    }
    reader?.releaseLock();
  }
}
