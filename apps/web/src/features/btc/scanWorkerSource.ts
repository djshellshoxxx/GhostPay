import { SilentPaymentError } from '@ghostpay/btc-silent-payments';
import { normalizeEsploraUrl, type EsploraFetch } from './esplora';
import { isHeight, isScanSourcePath, MAX_SOURCE_BYTES, MAX_SOURCE_PENDING, type BtcScanRequest, type BtcScanResponse } from './scanWorkerMessages';

/** Main-thread-only network bridge. Fixed selected origin, GET-only path allowlist, no cookies/redirects, bounded bodies. */
export class BtcScanSourceBridge {
  private readonly pending = new Map<number, AbortController>();
  private closed = false;
  private readonly baseUrl: string;
  public constructor(baseUrl: string, private readonly fetchFn: EsploraFetch,
    private readonly send: (message: BtcScanRequest) => void, private readonly fail: (error: Error) => void) {
    this.baseUrl = normalizeEsploraUrl(baseUrl);
  }
  public dispose(): void { this.closed = true; for (const ac of this.pending.values()) ac.abort(); this.pending.clear(); }
  public handle(m: Extract<BtcScanResponse, { type: 'source' | 'sourceCancel' }>): void {
    if (this.closed) return;
    if (m.type === 'sourceCancel') { this.pending.get(m.requestId)?.abort(); return; }
    if (!isHeight(m.requestId) || !isScanSourcePath(m.path) || this.pending.has(m.requestId) || this.pending.size >= MAX_SOURCE_PENDING) {
      this.fail(new SilentPaymentError('INVALID_RESPONSE')); return;
    }
    const abort = new AbortController(); this.pending.set(m.requestId, abort);
    void this.read(m, abort);
  }
  private async read(m: Extract<BtcScanResponse, { type: 'source' }>, abort: AbortController): Promise<void> {
    const timer = setTimeout(() => { abort.abort(); }, 30_000);
    const signal = abort.signal;
    let rejectAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () => { reject(new SilentPaymentError('TRANSPORT_FAILURE')); };
        signal.addEventListener('abort', rejectAbort, { once: true });
      });
      const fetching = this.fetchFn(`${this.baseUrl}${m.path}`, {
        method: 'GET', signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      }).then((response) => {
        if (this.closed || signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          throw new SilentPaymentError('TRANSPORT_FAILURE');
        }
        return response;
      });
      const response = await Promise.race([fetching, aborted]);
      const body = await Promise.race([readScanSourceBody(response, signal), aborted]);
      if (!this.closed && !signal.aborted) this.send({ type: 'sourceResult', id: m.id, requestId: m.requestId, status: response.status, body });
    } catch (e) {
      if (!this.closed && !signal.aborted) this.send({ type: 'sourceError', id: m.id, requestId: m.requestId,
        code: e instanceof SilentPaymentError && e.code === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' : 'TRANSPORT_FAILURE' });
      else if (!this.closed) this.send({ type: 'sourceError', id: m.id, requestId: m.requestId, code: 'TRANSPORT_FAILURE' });
    } finally {
      clearTimeout(timer); if (rejectAbort !== undefined) signal.removeEventListener('abort', rejectAbort);
      this.pending.delete(m.requestId);
    }
  }
}
export async function readScanSourceBody(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) {
    void response.body?.cancel().catch(() => undefined); throw new SilentPaymentError('INVALID_RESPONSE');
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const cancel = (): void => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new SilentPaymentError('ABORTED');
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) { cancel(); throw new SilentPaymentError('INVALID_RESPONSE'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
