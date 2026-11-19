/** A fixed, local failure classification. Remote exception objects and abort reasons never cross this boundary. */
export class BoundedRequestError extends Error {
  public constructor(public readonly code: 'ABORTED' | 'TIMEOUT' | 'TOO_LARGE' | 'INVALID_OPTIONS' | 'TRANSPORT') {
    super('Network request could not be completed.');
    this.name = 'BoundedRequestError';
  }
}

export interface BoundedRequestOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly signal?: AbortSignal | undefined;
}

export interface BoundedResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: Uint8Array;
}

/** Cleanup must never delay rejection or replace a result, including with non-native injected streams. */
function cancelQuietly(stream: { cancel(): Promise<unknown> } | null | undefined): void {
  try { if (stream !== null && stream !== undefined) void stream.cancel().catch(() => undefined); } catch { /* best effort */ }
}

/**
 * One HTTP exchange with an independent deadline over both fetch and streamed body reads. An already-aborted caller
 * never dispatches; late responses are discarded and all cleanup is nonblocking. This does not withdraw bytes already
 * sent, impose a CPU deadline on synchronous JavaScript, or authorize an endpoint: the caller supplies its scoped fetch.
 */
export async function boundedRequest(
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  url: string,
  init: RequestInit,
  options: BoundedRequestOptions,
): Promise<BoundedResponse> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2_147_483_647 ||
      !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) throw new BoundedRequestError('INVALID_OPTIONS');
  let target: URL;
  try { target = new URL(url); } catch { throw new BoundedRequestError('INVALID_OPTIONS'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if ((target.protocol !== 'https:' && !(target.protocol === 'http:' && loopback)) || target.username !== '' || target.password !== '' || target.hash !== '') {
    throw new BoundedRequestError('INVALID_OPTIONS');
  }
  const signals = Array.from(new Set([options.signal, init.signal].filter((signal): signal is AbortSignal => signal !== null && signal !== undefined)));
  if (signals.some((signal) => signal.aborted)) throw new BoundedRequestError('ABORTED');
  const ctl = new AbortController();
  const ownErrors = new Set<BoundedRequestError>();
  const error = (code: BoundedRequestError['code']): BoundedRequestError => {
    const value = new BoundedRequestError(code);
    ownErrors.add(value);
    return value;
  };
  let stopped: BoundedRequestError | undefined;
  let rejectStop: (e: BoundedRequestError) => void = () => undefined;
  const stopping = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
  // Wall time also checks a response queued before the deadline timer runs after browser sleep.
  const startedAt = Date.now();
  const deadlineAt = startedAt + options.timeoutMs;
  const stop = (code: 'ABORTED' | 'TIMEOUT'): void => {
    if (stopped !== undefined) return;
    stopped = error(code);
    rejectStop(stopped);
    ctl.abort();
  };
  const onAbort = (): void => { stop('ABORTED'); };
  const assertActive = (): void => {
    const now = Date.now();
    if (signals.some((signal) => signal.aborted)) stop('ABORTED');
    else if (now < startedAt || now >= deadlineAt) stop('TIMEOUT');
    if (stopped !== undefined) throw stopped;
  };
  for (const signal of signals) signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { stop('TIMEOUT'); }, options.timeoutMs);
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  const exchange = async (): Promise<BoundedResponse> => {
    assertActive();
    const res = await fetchFn(target.href, {
      ...init,
      signal: ctl.signal,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    response = res;
    // The outer race may already have finished. Do not start a late body or leave it downloading.
    if (stopped !== undefined || ctl.signal.aborted) {
      cancelQuietly(res.body);
      throw stopped ?? error('ABORTED');
    }
    assertActive();
    if (res.redirected === true || (res.url !== undefined && res.url !== '' && new URL(res.url).href !== target.href) ||
        !Number.isInteger(res.status) || res.status < 200 || res.status > 599 || res.ok !== (res.status < 300)) {
      throw error('TRANSPORT');
    }
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > options.maxBytes) throw error('TOO_LARGE');
    if (res.body === null) {
      completed = true;
      return { status: res.status, ok: res.ok, body: new Uint8Array(0) };
    }
    reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      assertActive();
      const { done, value } = await reader.read();
      assertActive();
      if (done) break;
      // Native fetch streams and DOM contexts may use different realms; instanceof rejects valid byte chunks.
      if (!ArrayBuffer.isView(value) || Object.prototype.toString.call(value) !== '[object Uint8Array]') throw error('TRANSPORT');
      total += value.byteLength;
      if (total > options.maxBytes) throw error('TOO_LARGE');
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    assertActive();
    completed = true;
    return { status: res.status, ok: res.ok, body };
  };
  try {
    const result = await Promise.race([exchange(), stopping]);
    assertActive();
    return result;
  } catch (e) {
    // `instanceof` alone is insufficient: an injected SDK may forge an exported error with sensitive fields.
    if (e instanceof BoundedRequestError && ownErrors.has(e)) throw new BoundedRequestError(e.code);
    throw new BoundedRequestError('TRANSPORT');
  } finally {
    clearTimeout(timer);
    for (const signal of signals) signal.removeEventListener('abort', onAbort);
    ctl.abort();
    try { if (!completed) cancelQuietly(reader ?? response?.body); } catch { /* even body access may throw on an injected response */ }
    try { reader?.releaseLock(); } catch { /* hostile cleanup cannot replace the fixed error */ }
  }
}
