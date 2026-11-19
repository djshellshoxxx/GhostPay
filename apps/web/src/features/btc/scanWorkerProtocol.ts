import {
  HeaderChain, parseCompressedPoint, secretScalarFromBytes, serializeScanState,
  SilentPaymentError, zeroize,
} from '@ghostpay/btc-silent-payments';
import { EsploraClient, normalizeEsploraUrl } from './esplora';
import { genesisCheckpoint, MAX_HEADERS } from './headers';
import { btcNetwork } from './network';
import { MAX_SCAN_MATCHES, scanForPayments, wipeFound, type ScanResult } from './scan';
import { normalizeOracleConfig, type BtcOracleBlock } from './oracleSource';

import { isHeight, isScanSourcePath, isWorkerErrorCode, MAX_SOURCE_BYTES, MAX_SOURCE_PENDING, MAX_WORKER_STATE_BYTES, readWorkerState, type BtcScanRequest, type BtcScanResponse, type BtcScanStart } from './scanWorkerMessages';

/** One scan per worker. Public source requests cross a bounded main-thread bridge; this worker has no network API. */
export class BtcScanProtocol {
  private started = false;
  private stopped = false;
  private readonly abort = new AbortController();
  private secret: Uint8Array | undefined;
  private pending: { id: number; sequence: number; resolve: () => void; reject: (e: Error) => void } | undefined;
  private requestId = 0;
  private providerSpentCheck = false;
  private matchedOutputProofs = false;
  private readonly sources = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void; cleanup: () => void }>();
  private readonly oracles = new Map<number, { resolve: (block: BtcOracleBlock) => void; reject: (error: Error) => void; cleanup: () => void }>();
  public constructor(private readonly send: (message: BtcScanResponse) => void) {}
  public dispose(): void {
    this.stopped = true; this.abort.abort();
    if (this.secret instanceof Uint8Array) zeroize(this.secret);
    for (const request of this.sources.values()) { request.cleanup(); request.reject(new SilentPaymentError('ABORTED')); }
    this.sources.clear();
    for (const request of this.oracles.values()) { request.cleanup(); request.reject(new SilentPaymentError('ABORTED')); }
    this.oracles.clear();
    this.pending?.reject(new SilentPaymentError('ABORTED')); this.pending = undefined;
  }
  public handle(message: BtcScanRequest): void {
    if (this.stopped) { if (message?.type === 'start' && message.scanSecret instanceof Uint8Array) zeroize(message.scanSecret); return; }
    if (message?.type === 'oracleResult' || message?.type === 'oracleError') {
      const request = this.oracles.get(message.requestId);
      if (request === undefined || message.id !== this.sessionId) return;
      this.oracles.delete(message.requestId); request.cleanup();
      if (message.type === 'oracleError') request.reject(new SilentPaymentError(isWorkerErrorCode(message.code) ? message.code : 'INVALID_RESPONSE'));
      else request.resolve(message.block);
      return;
    }
    if (message?.type === 'sourceResult' || message?.type === 'sourceError') {
      const request = this.sources.get(message.requestId);
      if (request === undefined || message.id !== this.sessionId) return;
      this.sources.delete(message.requestId); request.cleanup();
      if (message.type === 'sourceError') request.reject(new SilentPaymentError(message.code === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' : 'TRANSPORT_FAILURE'));
      else if (!(message.body instanceof Uint8Array) || message.body.byteLength > MAX_SOURCE_BYTES || !Number.isInteger(message.status) || message.status < 200 || message.status > 599)
        request.reject(new SilentPaymentError('INVALID_RESPONSE'));
      else request.resolve(new Response([204, 205, 304].includes(message.status) ? null : message.body, { status: message.status }));
      return;
    }
    if (message?.type === 'checkpointAck') {
      const p = this.pending;
      if (p !== undefined && message.id === p.id && message.sequence === p.sequence) { this.pending = undefined; p.resolve(); }
      return;
    }
    if (message?.type !== 'start') return;
    if (this.started) { if (message.scanSecret instanceof Uint8Array) zeroize(message.scanSecret); return; }
    this.started = true;
    void this.run(message);
  }
  private sessionId = 0;
  private oracle(height: number, source: 0 | 1, signal?: AbortSignal): Promise<BtcOracleBlock> {
    if (!isHeight(height) || this.oracles.size >= 2) return Promise.reject(new SilentPaymentError('INVALID_INPUT'));
    if (this.stopped || signal?.aborted === true) return Promise.reject(new SilentPaymentError('ABORTED'));
    const requestId = ++this.requestId;
    return new Promise<BtcOracleBlock>((resolve, reject) => {
      const abort = (): void => {
        signal?.removeEventListener('abort', abort); this.oracles.delete(requestId);
        if (!this.stopped) this.send({ type: 'oracleCancel', id: this.sessionId, requestId });
        reject(new SilentPaymentError('ABORTED'));
      };
      this.oracles.set(requestId, { resolve, reject, cleanup: () => { signal?.removeEventListener('abort', abort); } });
      signal?.addEventListener('abort', abort, { once: true });
      this.send({ type: 'oracle', id: this.sessionId, requestId, height, source });
    });
  }
  private source(path: string, signal: AbortSignal | null | undefined): Promise<Response> {
    if (!isScanSourcePath(path) || (path.includes('/outspend/') && !this.providerSpentCheck) ||
        (/\/tx\/[^/]+\/(hex|merkle-proof)$/.test(path) && !this.matchedOutputProofs) || this.sources.size >= MAX_SOURCE_PENDING)
      return Promise.reject(new SilentPaymentError('INVALID_INPUT'));
    if (this.stopped || signal?.aborted === true) return Promise.reject(new SilentPaymentError('ABORTED'));
    const requestId = ++this.requestId;
    return new Promise<Response>((resolve, reject) => {
      const abort = (): void => {
        signal?.removeEventListener('abort', abort); this.sources.delete(requestId);
        if (!this.stopped) this.send({ type: 'sourceCancel', id: this.sessionId, requestId });
        reject(new SilentPaymentError('ABORTED'));
      };
      this.sources.set(requestId, { resolve, reject, cleanup: () => { signal?.removeEventListener('abort', abort); } });
      signal?.addEventListener('abort', abort, { once: true });
      this.send({ type: 'source', id: this.sessionId, requestId, path });
    });
  }
  private async run(m: BtcScanStart): Promise<void> {
    let result: ScanResult | undefined;
    this.secret = m.scanSecret; this.sessionId = m.id;
    try {
      if (!isHeight(m.id) || !isHeight(m.fromHeight) || (m.toHeight !== undefined && !isHeight(m.toHeight)) || typeof m.checkpoints !== 'boolean' ||
          (m.providerSpentCheck !== undefined && typeof m.providerSpentCheck !== 'boolean') ||
          typeof m.baseUrl !== 'string' || m.baseUrl.length > 2048 || !(m.scanSecret instanceof Uint8Array) || m.scanSecret.length !== 32 ||
          !(m.spendPublicKey instanceof Uint8Array) || m.spendPublicKey.length !== 33 || !Array.isArray(m.headers?.headers) ||
          m.headers.headers.length > MAX_HEADERS || m.headers.headers.some((h) => typeof h !== 'string' || !/^[0-9a-f]{160}$/.test(h)))
        throw new SilentPaymentError('INVALID_INPUT');
      const net = btcNetwork(m.network);
      if (!net.enabled || m.headers.network !== net.id) throw new SilentPaymentError('NETWORK_MISMATCH');
      const headers = HeaderChain.fromJSON(m.headers, { checkpoint: genesisCheckpoint(net) });
      // Reuse the source parser with its configured base, but emit only allowed path suffixes to the main thread.
      const baseUrl = normalizeEsploraUrl(m.baseUrl);
      const oracle = m.oracle === undefined ? undefined : normalizeOracleConfig(m.oracle, baseUrl);
      if (oracle?.mode === 'light' && m.providerSpentCheck !== true) throw new SilentPaymentError('INVALID_INPUT');
      this.providerSpentCheck = m.providerSpentCheck === true;
      this.matchedOutputProofs = oracle?.mode === 'light' && this.providerSpentCheck;
      const client = new EsploraClient({ baseUrl, fetchFn: (url, init) => {
        if (!url.startsWith(`${baseUrl}/`) || (init.method !== undefined && init.method !== 'GET') || init.body !== undefined)
          return Promise.reject(new SilentPaymentError('INVALID_INPUT'));
        return this.source(url.slice(baseUrl.length), init.signal);
      } });
      const scanSecret = secretScalarFromBytes(m.scanSecret);
      // secretScalarFromBytes copies the input. Keep only one worker-owned secret for disposal.
      zeroize(m.scanSecret); this.secret = scanSecret;
      const spendPublicKey = parseCompressedPoint(m.spendPublicKey);
      let sequence = 0;
      result = await scanForPayments({ client, wallet: { net, keys: { scanSecret, spendPublicKey } }, headers,
        ...(oracle === undefined ? {} : { oracle, readOracle: (height: number, signal?: AbortSignal) => this.oracle(height, 0, signal),
          ...(oracle.second === undefined ? {} : { readSecondOracle: (height: number, signal?: AbortSignal) => this.oracle(height, 1, signal) }) }),
        fromHeight: m.fromHeight, signal: this.abort.signal,
        ...(m.toHeight === undefined ? {} : { toHeight: m.toHeight }),
        ...(m.resumeState === undefined ? {} : { resumeState: readWorkerState(m.resumeState) }),
        ...(m.recoveryOffset === undefined ? {} : { recoveryOffset: m.recoveryOffset }),
        ...(m.recoveryLimit === undefined ? {} : { recoveryLimit: m.recoveryLimit }),
        ...(m.providerSpentCheck === undefined ? {} : { providerSpentCheck: m.providerSpentCheck }),
        onBlock: (height) => { if (!this.stopped) this.send({ type: 'block', id: m.id, height }); },
        ...(m.checkpoints ? { onState: (state) => {
          const text = serializeScanState(state);
          if (text.length > MAX_WORKER_STATE_BYTES) throw new SilentPaymentError('UNSUPPORTED');
          if (this.stopped) throw new SilentPaymentError('ABORTED');
          return new Promise<void>((resolve, reject) => {
            this.pending = { id: m.id, sequence: ++sequence, resolve, reject };
            this.send({ type: 'checkpoint', id: m.id, sequence, state: text });
          });
        } } : {}),
      });
      if (result.found.length > MAX_SCAN_MATCHES) throw new SilentPaymentError('UNSUPPORTED');
      if (!this.stopped) this.send({ type: 'done', id: m.id, result });
    } catch (e) {
      if (!this.stopped) this.send({ type: 'error', id: m.id, code: e instanceof SilentPaymentError && isWorkerErrorCode(e.code) ? e.code : 'INVALID_RESPONSE' });
    } finally {
      if (m.scanSecret instanceof Uint8Array) zeroize(m.scanSecret);
      if (result !== undefined) wipeFound(result.found);
      this.dispose();
    }
  }
}
