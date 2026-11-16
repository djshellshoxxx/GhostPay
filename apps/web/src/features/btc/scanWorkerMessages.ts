import { parseScanState, SilentPaymentError, type ScanState, type SerializedHeaderChain, type SilentPaymentErrorCode } from '@ghostpay/btc-silent-payments';
import type { BtcNetworkId } from './network';
import type { ScanResult } from './scan';
import type { BtcOracleBlock, BtcOracleConfig } from './oracleSource';

export const MAX_WORKER_STATE_BYTES = 512 * 1024;
export const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const MAX_SOURCE_PENDING = 4;
export interface BtcScanStart {
  readonly type: 'start'; readonly id: number; readonly network: BtcNetworkId; readonly baseUrl: string;
  readonly scanSecret: Uint8Array; readonly spendPublicKey: Uint8Array; readonly headers: SerializedHeaderChain;
  readonly fromHeight: number; readonly toHeight?: number; readonly resumeState?: string;
  readonly recoveryOffset?: number; readonly recoveryLimit?: number; readonly checkpoints: boolean;
  readonly oracle?: BtcOracleConfig;
}
export type BtcScanRequest = BtcScanStart
  | BtcOracleRequest
  | { readonly type: 'checkpointAck'; readonly id: number; readonly sequence: number }
  | { readonly type: 'sourceResult'; readonly id: number; readonly requestId: number; readonly status: number; readonly body: Uint8Array<ArrayBuffer> }
  | { readonly type: 'sourceError'; readonly id: number; readonly requestId: number; readonly code: 'TRANSPORT_FAILURE' | 'INVALID_RESPONSE' };
export type BtcOracleRequest = { readonly type: 'oracleResult'; readonly id: number; readonly requestId: number; readonly block: BtcOracleBlock }
  | { readonly type: 'oracleError'; readonly id: number; readonly requestId: number; readonly code: SilentPaymentErrorCode };
export type BtcScanResponse =
  | { readonly type: 'block'; readonly id: number; readonly height: number }
  | { readonly type: 'checkpoint'; readonly id: number; readonly sequence: number; readonly state: string }
  | { readonly type: 'source'; readonly id: number; readonly requestId: number; readonly path: string }
  | { readonly type: 'sourceCancel'; readonly id: number; readonly requestId: number }
  | { readonly type: 'oracle'; readonly id: number; readonly requestId: number; readonly height: number; readonly source: 0 | 1 }
  | { readonly type: 'oracleCancel'; readonly id: number; readonly requestId: number }
  | { readonly type: 'done'; readonly id: number; readonly result: ScanResult }
  | { readonly type: 'error'; readonly id: number; readonly code: SilentPaymentErrorCode };
const ERROR_CODES: readonly SilentPaymentErrorCode[] = ['ABORTED', 'NETWORK_MISMATCH', 'INVALID_INPUT', 'INVALID_RESPONSE', 'INVALID_HEADER', 'REORG_DETECTED', 'TRANSPORT_FAILURE', 'UNSUPPORTED', 'GROUP_LIMIT_EXCEEDED'];
export const isWorkerErrorCode = (v: unknown): v is SilentPaymentErrorCode => ERROR_CODES.includes(v as SilentPaymentErrorCode);
export const isHeight = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 0xffff_ffff;
export function readWorkerState(text: string): ScanState {
  if (typeof text !== 'string' || text.length > MAX_WORKER_STATE_BYTES) throw new SilentPaymentError('INVALID_INPUT');
  return parseScanState(text);
}
/** The worker can request only public block data and current outspend status from the selected source. */
export function isScanSourcePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 128) return false;
  if (path === '/blocks/tip/height') return true;
  if (/^\/block\/[0-9a-f]{64}(?:\/header)?$/.test(path)) return true;
  if (/^\/tx\/[0-9a-f]{64}\/(?:hex|merkle-proof)$/.test(path)) return true;
  const height = /^\/block-height\/(0|[1-9][0-9]{0,9})$/.exec(path);
  if (height !== null) return isHeight(Number(height[1]));
  const outspend = /^\/tx\/[0-9a-f]{64}\/outspend\/(0|[1-9][0-9]{0,9})$/.exec(path);
  if (outspend !== null) return isHeight(Number(outspend[1]));
  const page = /^\/block\/[0-9a-f]{64}\/txs\/(0|[1-9][0-9]{0,4})$/.exec(path);
  return page !== null && Number(page[1]) <= 16_650 && Number(page[1]) % 25 === 0;
}
