export type QrExchangeErrorCode =
  | 'BAD_INPUT'
  | 'TOO_LARGE'
  | 'TOO_MANY_CHUNKS'
  | 'BAD_CHUNK'
  | 'SESSION_MISMATCH'
  | 'CHUNK_CONFLICT'
  | 'INTEGRITY_FAILED'
  | 'QR_TOO_LONG'
  | 'CAMERA_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'SCAN_FAILED'
  | 'ABORTED';

const MESSAGES: Readonly<Record<QrExchangeErrorCode, string>> = {
  BAD_INPUT: 'qr-exchange: invalid input',
  TOO_LARGE: 'qr-exchange: payload too large',
  TOO_MANY_CHUNKS: 'qr-exchange: too many chunks',
  BAD_CHUNK: 'qr-exchange: invalid chunk',
  SESSION_MISMATCH: 'qr-exchange: chunk belongs to a different transfer',
  CHUNK_CONFLICT: 'qr-exchange: conflicting chunk',
  INTEGRITY_FAILED: 'qr-exchange: integrity check failed',
  QR_TOO_LONG: 'qr-exchange: text too long for a QR code',
  CAMERA_DENIED: 'qr-exchange: camera permission denied',
  CAMERA_UNAVAILABLE: 'qr-exchange: camera unavailable',
  SCAN_FAILED: 'qr-exchange: scanning failed',
  ABORTED: 'qr-exchange: aborted',
};

/** Typed error with a fixed message per code. Never carries input text, payload bytes or decoded QR content. */
export class QrExchangeError extends Error {
  readonly code: QrExchangeErrorCode;
  constructor(code: QrExchangeErrorCode) {
    super(MESSAGES[code]);
    this.name = 'QrExchangeError';
    this.code = code;
  }
}
