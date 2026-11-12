export { QrExchangeError } from './errors.js';
export type { QrExchangeErrorCode } from './errors.js';
export {
  encodeMultipart,
  parseChunk,
  sessionIdOf,
  crc32Ascii,
  MAX_PAYLOAD_BYTES,
  MAX_CHUNKS,
  MIN_CHUNK_CHARS,
  MAX_CHUNK_CHARS,
  DEFAULT_CHUNK_CHARS,
  MAX_CHUNK_TEXT_LEN,
} from './multipart.js';
export type { EncodeOptions, ParsedChunk } from './multipart.js';
export { Assembler, DEFAULT_ASSEMBLY_MAX_AGE_MS } from './assembler.js';
export type { AddResult, AssemblerOptions } from './assembler.js';
export { startCamera, scanFromVideo, stopVideo, MAX_SCAN_TEXT_LEN } from './camera.js';
export { listVideoInputs, activeDeviceId } from './camera.js';
export type { MediaDevicesLike, MediaStreamLike, MediaTrackLike, VideoLike, FrameReader, ScanOptions } from './camera.js';
export type { CameraConstraints, MediaDeviceInfoLike, StartCameraOptions } from './camera.js';
export {
  createDefaultReader,
  createPlatformReader,
  createCanvasGrabber,
  createDecoderReader,
  loadJsQrDecoder,
} from './readers.js';
export { decodeQrImage, imageHeaderDimensions, HEADER_PROBE_BYTES, MAX_IMAGE_BYTES, MAX_IMAGE_DIM, MAX_IMAGE_PIXELS } from './readers.js';
export type { DecodeImageEnv, DecodeImageOptions, ImageBitmapLike, ImageFileLike } from './readers.js';
export type {
  BarcodeDetectorLike,
  BarcodeDetectorCtorLike,
  Canvas2dLike,
  Frame,
  FrameGrabber,
  QrFrameDecoder,
} from './readers.js';
export { qrMatrix, qrSvgPath } from './generate.js';
export type { QrMatrix } from './generate.js';

export * from './seller.js';
export * from './settings-exchange.js';
