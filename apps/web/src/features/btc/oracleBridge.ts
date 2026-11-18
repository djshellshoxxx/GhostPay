import { BlindBitClient, BlindBitGrpcClient, SilentPaymentError } from '@ghostpay/btc-silent-payments';
import type { EsploraFetch } from './esplora';
import { normalizeOracleConfig, validateOracleBlock, MAX_ORACLE_ENTRIES, type BtcOracleConfig, type BtcOracleEndpoint } from './oracleSource';
import { isHeight, isWorkerErrorCode, MAX_SOURCE_BYTES, type BtcScanRequest, type BtcScanResponse } from './scanWorkerMessages';
import { readScanSourceBody } from './scanWorkerSource';
import type { BtcNetworkId } from './network';

/** Main-thread transport: the worker supplies a public height and selected source index only. */
export class BtcOracleBridge {
  private readonly pending = new Map<number, AbortController>();
  private readonly endpoints: readonly BtcOracleEndpoint[];
  private closed = false;
  public constructor(config: BtcOracleConfig, esploraUrl: string, private readonly network: BtcNetworkId,
    private readonly fetchFn: EsploraFetch, private readonly send: (message: BtcScanRequest) => void, private readonly fail: (e: Error) => void) {
    const selected = normalizeOracleConfig(config, esploraUrl);
    this.endpoints = selected.second === undefined ? [selected] : [selected, selected.second];
  }
  public dispose(): void { this.closed = true; for (const stop of this.pending.values()) stop.abort(); this.pending.clear(); }
  public handle(m: Extract<BtcScanResponse, { type: 'oracle' | 'oracleCancel' }>): void {
    if (this.closed) return;
    if (m.type === 'oracleCancel') { this.pending.get(m.requestId)?.abort(); return; }
    if (!isHeight(m.requestId) || !isHeight(m.height) || (m.source !== 0 && m.source !== 1) || this.endpoints[m.source] === undefined || this.pending.has(m.requestId) || this.pending.size >= 2) {
      this.fail(new SilentPaymentError('INVALID_RESPONSE')); return;
    }
    const stop = new AbortController(); this.pending.set(m.requestId, stop);
    void this.read(m, this.endpoints[m.source]!, stop);
  }
  private async read(m: Extract<BtcScanResponse, { type: 'oracle' }>, endpoint: BtcOracleEndpoint, stop: AbortController): Promise<void> {
    const timer = setTimeout(() => { stop.abort(); }, 30_000);
    let abort!: () => void;
    const aborted = new Promise<never>((_, reject) => { abort = () => { reject(new SilentPaymentError('TRANSPORT_FAILURE')); }; stop.signal.addEventListener('abort', abort, { once: true }); });
    const bounded: EsploraFetch = async (url, init) => {
      const pendingResponse = this.fetchFn(url, { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: stop.signal });
      void pendingResponse.then((response) => { if (stop.signal.aborted || this.closed) void response.body?.cancel().catch(() => undefined); }, () => undefined);
      const response = await Promise.race([pendingResponse, aborted]);
      const body = await Promise.race([readScanSourceBody(response, stop.signal), aborted]);
      if (stop.signal.aborted || this.closed) throw new SilentPaymentError('ABORTED');
      return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
    };
    try {
      const source = endpoint.kind === 'http'
        ? new BlindBitClient({ baseUrl: endpoint.url, fetch: bounded, maxResponseBytes: MAX_SOURCE_BYTES })
        : new BlindBitGrpcClient({ baseUrl: endpoint.url, network: this.network, fetch: bounded, maxResponseBytes: MAX_SOURCE_BYTES, maxEntries: MAX_ORACLE_ENTRIES });
      const info = await Promise.race([source.getInfo(stop.signal), aborted]);
      if (info.network !== this.network) throw new SilentPaymentError('NETWORK_MISMATCH');
      if (info.tweaksOnly || !info.tweaksFullBasic) throw new SilentPaymentError('UNSUPPORTED');
      if (info.height < m.height) throw new SilentPaymentError('INVALID_RESPONSE');
      const [tweaks, outputs] = await Promise.race([Promise.all([source.getTweaks(m.height, stop.signal), source.getOutputs(m.height, stop.signal)]), aborted]);
      const block = { tweaks, outputs }; validateOracleBlock(block, m.height);
      if (!this.closed && !stop.signal.aborted) this.send({ type: 'oracleResult', id: m.id, requestId: m.requestId, block });
    } catch (e) {
      if (!this.closed) this.send({ type: 'oracleError', id: m.id, requestId: m.requestId,
        code: e instanceof SilentPaymentError && isWorkerErrorCode(e.code) ? e.code : 'TRANSPORT_FAILURE' });
    } finally {
      clearTimeout(timer); stop.signal.removeEventListener('abort', abort); stop.abort(); this.pending.delete(m.requestId);
    }
  }
}
