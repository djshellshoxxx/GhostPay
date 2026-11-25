import { secretScalarFromBytes, serializeScanState, SilentPaymentError, zeroize } from '@ghostpay/btc-silent-payments';
import { MAX_HEADERS } from './headers';
import type { EsploraFetch } from './esplora';
import { BtcScanSourceBridge } from './scanWorkerSource';
import { BtcOracleBridge } from './oracleBridge';
import { normalizeOracleConfig } from './oracleSource';
import { MAX_SCAN_BLOCKS, MAX_SCAN_MATCHES, wipeFound, type ScanParams, type ScanResult } from './scan';
import { isHeight, isWorkerErrorCode, MAX_WORKER_STATE_BYTES, readWorkerState, type BtcScanRequest, type BtcScanResponse, type BtcScanStart } from './scanWorkerMessages';

export interface BtcScanWorker {
  onmessage: ((event: { data: BtcScanResponse }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: BtcScanRequest): void;
  terminate(): void;
}
export type BtcScanWorkerFactory = () => BtcScanWorker;
export function createBtcScanWorker(): BtcScanWorker {
  return new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' }) as unknown as BtcScanWorker;
}
let nextId = 0;
function wipeResponseResult(value: unknown): void {
  if (value === null || typeof value !== 'object' || !('found' in value) || !Array.isArray(value.found)) return;
  for (const item of value.found as unknown[]) {
    if (item !== null && typeof item === 'object' && 'spendTweak' in item && item.spendTweak instanceof Uint8Array) zeroize(item.spendTweak);
  }
}
function validateResult(r: ScanResult, p: ScanParams, providerSpentCheck: boolean): void {
  const hex = (s: unknown): boolean => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  if (r === null || typeof r !== 'object' || !isHeight(r.fromHeight) || !Number.isSafeInteger(r.toHeight) || !isHeight(r.spentCount) || r.headerAnchored !== true ||
      !['local', 'provider', 'unknown'].includes(r.spentStatus) ||
      ((r.spentStatus === 'provider') !== providerSpentCheck) ||
      !Array.isArray(r.blocks) || r.blocks.length > 1000 || r.blocks.some((b: ScanResult['blocks'][number]) => !isHeight(b.height) || !hex(b.hash)) ||
      !Array.isArray(r.found) || r.found.length > MAX_SCAN_MATCHES || r.found.some((f: ScanResult['found'][number]) =>
        !isHeight(f.height) || !hex(f.blockHash) || !hex(f.txid) || !isHeight(f.vout) || typeof f.amountSats !== 'bigint' || f.amountSats < 0n || f.amountSats > 2_100_000_000_000_000n ||
        !(f.spendTweak instanceof Uint8Array) || f.spendTweak.length !== 32 || !(f.xOnlyPublicKey instanceof Uint8Array) || f.xOnlyPublicKey.length !== 32 ||
        typeof f.duplicateKey !== 'boolean' || (f.label !== null && !isHeight(f.label)))) throw new SilentPaymentError('INVALID_RESPONSE');
  const history = r.recoveredHistory;
  if (r.fromHeight !== p.fromHeight || p.headers === undefined || r.toHeight > p.headers.tipHeight ||
      (r.spentStatus === 'local' && r.toHeight < p.headers.tipHeight) ||
      r.blocks.some((b: ScanResult['blocks'][number]) => b.height > r.toHeight || p.headers?.hashAt(b.height) !== b.hash) ||
      r.found.some((f: ScanResult['found'][number]) => f.height > r.toHeight || p.headers?.hashAt(f.height) !== f.blockHash) ||
      new Set(r.found.map((f: ScanResult['found'][number]) => `${f.txid}:${String(f.vout)}`)).size !== r.found.length ||
      (history !== undefined && (history === null || !isHeight(history.offset) || !isHeight(history.end) || !isHeight(history.total) ||
        history.offset > history.end || history.end > history.total || history.end - history.offset > (p.recoveryLimit ?? MAX_SCAN_BLOCKS))))
    throw new SilentPaymentError('INVALID_RESPONSE');
}

/** Dedicated worker per request; all exits detach handlers and terminate it. Checkpoint commits stay in the vault owner. */
export async function scanForPaymentsInWorker(p: ScanParams, factory: BtcScanWorkerFactory = createBtcScanWorker, fetchFn: EsploraFetch): Promise<ScanResult> {
  if (typeof fetchFn !== 'function') throw new SilentPaymentError('INVALID_INPUT');
  if (p.providerSpentCheck !== undefined && typeof p.providerSpentCheck !== 'boolean') throw new SilentPaymentError('INVALID_INPUT');
  if (p.signal?.aborted === true) throw new SilentPaymentError('ABORTED');
  if (p.headers === undefined || p.headers.tipHeight - p.headers.checkpointHeight > MAX_HEADERS) throw new SilentPaymentError('INVALID_INPUT');
  const state = p.resumeState === undefined ? undefined : serializeScanState(p.resumeState);
  const oracle = p.oracle === undefined ? undefined : normalizeOracleConfig(p.oracle, p.client.baseUrl);
  // Light scanning discloses matched transaction IDs and outpoints. Refuse before creating a worker or transport.
  if (oracle?.mode === 'light' && p.providerSpentCheck !== true) throw new SilentPaymentError('INVALID_INPUT');
  if (state !== undefined && state.length > MAX_WORKER_STATE_BYTES) throw new SilentPaymentError('UNSUPPORTED');
  const id = nextId = (nextId + 1) % 0xffff_ffff;
  const request: BtcScanStart = { type: 'start', id, network: p.wallet.net.id, baseUrl: p.client.baseUrl,
    scanSecret: new Uint8Array(p.wallet.keys.scanSecret), spendPublicKey: new Uint8Array(p.wallet.keys.spendPublicKey),
    headers: p.headers.toJSON(), fromHeight: p.fromHeight, checkpoints: p.onState !== undefined,
    ...(p.toHeight === undefined ? {} : { toHeight: p.toHeight }), ...(state === undefined ? {} : { resumeState: state }),
    ...(p.recoveryOffset === undefined ? {} : { recoveryOffset: p.recoveryOffset }), ...(p.recoveryLimit === undefined ? {} : { recoveryLimit: p.recoveryLimit }),
    ...(oracle === undefined ? {} : { oracle }),
    ...(p.providerSpentCheck === undefined ? {} : { providerSpentCheck: p.providerSpentCheck }),
  };
  let worker: BtcScanWorker;
  try { worker = factory(); } catch { zeroize(request.scanSecret); throw new SilentPaymentError('UNSUPPORTED'); }
  return new Promise<ScanResult>((resolve, reject) => {
    let closed = false; let sequence = 0; let committing = false;
    const source = new BtcScanSourceBridge(p.client.baseUrl, fetchFn, (message) => { if (!closed) worker.postMessage(message); }, (error) => { finish(error); },
      { providerSpentCheck: p.providerSpentCheck === true, matchedOutputProofs: oracle?.mode === 'light' });
    const oracleBridge = oracle === undefined ? undefined : new BtcOracleBridge(oracle, p.client.baseUrl, p.wallet.net.id, fetchFn,
      (message) => { if (!closed) worker.postMessage(message); }, (error) => { finish(error); });
    const finish = (error?: unknown, result?: ScanResult): void => {
      if (closed) { if (result !== undefined) wipeFound(result.found); return; }
      closed = true; source.dispose(); oracleBridge?.dispose(); p.signal?.removeEventListener('abort', abort);
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate();
      if (result !== undefined) resolve(result); else reject(error instanceof Error ? error : new SilentPaymentError('INVALID_RESPONSE'));
    };
    const abort = (): void => { finish(new SilentPaymentError('ABORTED')); };
    worker.onerror = (): void => { finish(new SilentPaymentError('TRANSPORT_FAILURE')); };
    worker.onmessageerror = (): void => { finish(new SilentPaymentError('INVALID_RESPONSE')); };
    worker.onmessage = ({ data: m }): void => {
      if (closed || m?.id !== id) { if (m?.type === 'done') wipeResponseResult(m.result); return; }
      try {
        if (m.type === 'source' || m.type === 'sourceCancel') { source.handle(m); return; }
        if (m.type === 'oracle' || m.type === 'oracleCancel') {
          if (oracleBridge === undefined) throw new SilentPaymentError('INVALID_RESPONSE');
          oracleBridge.handle(m); return;
        }
        if (m.type === 'block' && isHeight(m.height)) { p.onBlock?.(m.height); return; }
        if (m.type === 'error' && isWorkerErrorCode(m.code)) { finish(new SilentPaymentError(m.code)); return; }
        if (m.type === 'done' && !committing) {
          validateResult(m.result, p, p.providerSpentCheck === true);
          const found: ScanResult['found'][number][] = [];
          try {
            for (const f of m.result.found) found.push({ ...f, spendTweak: secretScalarFromBytes(f.spendTweak) });
          } catch (e) { wipeFound(found); throw e; }
          // Structured clone strips SecretScalar's redacting prototype; restore it, then wipe the plain copies.
          wipeFound(m.result.found); finish(undefined, { ...m.result, found }); return;
        }
        if (m.type !== 'checkpoint' || committing || m.sequence !== sequence + 1 || p.onState === undefined) throw new SilentPaymentError('INVALID_RESPONSE');
        const saved = readWorkerState(m.state);
        if (saved.network !== p.wallet.net.id || saved.birthHeight !== p.fromHeight) throw new SilentPaymentError('INVALID_RESPONSE');
        committing = true; sequence = m.sequence;
        // A canceled/locked UI owns its existing guard inside onState, including the transactional CAS guard.
        void Promise.resolve().then(() => { if (!closed) return p.onState?.(saved); }).then(() => {
          if (closed) return; committing = false; worker.postMessage({ type: 'checkpointAck', id, sequence });
        }).catch((e: unknown) => { finish(e); });
      } catch (e) { if (m.type === 'done') wipeResponseResult(m.result); finish(e); }
    };
    p.signal?.addEventListener('abort', abort, { once: true });
    try { if (p.signal?.aborted === true) abort(); else worker.postMessage(request); }
    catch { finish(new SilentPaymentError('TRANSPORT_FAILURE')); }
    finally { zeroize(request.scanSecret); }
  });
}
