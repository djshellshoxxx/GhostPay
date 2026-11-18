import { QrExchangeError } from './errors.js';
import type { QrExchangeErrorCode } from './errors.js';

/** Minimal structural types so the core never touches the DOM and tests can use fakes. */
export interface MediaTrackLike {
  stop(): void;
  /** Only `deviceId` is read (to pick the next camera); labels are never read. */
  getSettings?(): { readonly deviceId?: string };
}
export interface MediaStreamLike {
  getTracks(): readonly MediaTrackLike[];
}
/** Rear camera by default; a specific camera only after the user asked to switch. */
export interface CameraConstraints {
  readonly video:
    | { readonly facingMode: 'environment'; readonly width: { readonly ideal: number } }
    | { readonly deviceId: { readonly exact: string }; readonly width: { readonly ideal: number } };
  readonly audio: false;
}
/** Only `kind` and `deviceId` are read; device labels are never read or logged. */
export interface MediaDeviceInfoLike {
  readonly kind: string;
  readonly deviceId: string;
}
export interface MediaDevicesLike {
  getUserMedia(constraints: CameraConstraints): Promise<MediaStreamLike>;
  enumerateDevices?(): Promise<readonly MediaDeviceInfoLike[]>;
}
export interface StartCameraOptions {
  readonly signal?: AbortSignal | undefined;
  /** Exact camera to open (from listVideoInputs); omitted means the rear-facing default. */
  readonly deviceId?: string | undefined;
  /** Pass `isSecureContext`: a missing mediaDevices on an insecure page is then reported as CAMERA_INSECURE. */
  readonly secureContext?: boolean | undefined;
}
export interface VideoLike {
  /** Typed `unknown` so a real HTMLVideoElement is assignable; only MediaStream-like values are acted upon. */
  srcObject: unknown;
  readonly readyState: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  play(): Promise<void>;
}
/** Reads one QR text from the current video frame, or null. */
export interface FrameReader {
  read(video: VideoLike): Promise<string | null>;
}

const HAVE_CURRENT_DATA = 2;
/** Decoded text longer than this is dropped before it reaches the caller (largest valid chunk is ~740 chars). */
export const MAX_SCAN_TEXT_LEN = 4096;
const MAX_CONSECUTIVE_READ_FAILURES = 30;
const stoppedTracks = new WeakSet<object>();
const MAX_DEVICE_ID_LEN = 512;
const MAX_VIDEO_INPUTS = 16;

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function isStream(v: unknown): v is MediaStreamLike {
  return typeof v === 'object' && v !== null && typeof (v as { getTracks?: unknown }).getTracks === 'function';
}

/** Stops tracks on a captured stream without touching a video element that may now own another stream. */
function stopStream(stream: unknown): void {
  if (!isStream(stream)) return;
  let tracks: readonly MediaTrackLike[];
  try {
    tracks = stream.getTracks();
  } catch {
    return;
  }
  for (const track of tracks) {
    if (typeof track !== 'object' || track === null || stoppedTracks.has(track)) continue;
    stoppedTracks.add(track);
    try {
      track.stop();
    } catch {
      /* keep stopping the remaining tracks */
    }
  }
}

/** Stops every track of the element's stream and detaches it. Safe to call repeatedly. */
export function stopVideo(video: VideoLike): void {
  stopStream(video.srcObject);
  video.srcObject = null;
}

function validDeviceId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_DEVICE_ID_LEN;
}

/** Maps getUserMedia DOMException names (including legacy Chrome aliases) to fixed, content-free codes. */
function cameraErrorCode(e: unknown): QrExchangeErrorCode {
  const name = typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'CAMERA_DENIED';
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'CAMERA_NOT_FOUND';
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return 'CAMERA_IN_USE';
    default:
      return 'CAMERA_UNAVAILABLE';
  }
}

/**
 * Asks for the rear camera (or `deviceId`) and attaches it to `video`. Must be called from an explicit user action: nothing in
 * this package starts the camera on its own. On any failure the tracks are stopped before the error is thrown.
 */
export async function startCamera(
  video: VideoLike,
  mediaDevices: MediaDevicesLike | undefined,
  options: StartCameraOptions = {},
): Promise<void> {
  if (mediaDevices === undefined || typeof mediaDevices.getUserMedia !== 'function') {
    throw new QrExchangeError(options.secureContext === false ? 'CAMERA_INSECURE' : 'CAMERA_UNAVAILABLE');
  }
  const { deviceId } = options;
  if (deviceId !== undefined && !validDeviceId(deviceId)) throw new QrExchangeError('BAD_INPUT');
  if (isAborted(options.signal)) throw new QrExchangeError('ABORTED');
  let stream: MediaStreamLike;
  try {
    stream = await mediaDevices.getUserMedia({
      video: deviceId === undefined
        ? { facingMode: 'environment', width: { ideal: 1280 } }
        : { deviceId: { exact: deviceId }, width: { ideal: 1280 } },
      audio: false,
    });
  } catch (e) {
    throw new QrExchangeError(cameraErrorCode(e));
  }
  if (isAborted(options.signal)) {
    stopStream(stream);
    throw new QrExchangeError('ABORTED');
  }
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    if (video.srcObject === stream) video.srcObject = null;
    stopStream(stream);
    throw new QrExchangeError('CAMERA_UNAVAILABLE');
  }
  if (isAborted(options.signal) || video.srcObject !== stream) {
    if (video.srcObject === stream) video.srcObject = null;
    stopStream(stream);
    throw new QrExchangeError(isAborted(options.signal) ? 'ABORTED' : 'CAMERA_UNAVAILABLE');
  }
}

/**
 * Distinct, non-empty ids of the video inputs (at most 16), for a "switch camera" control. Call after a stream
 * started: before permission browsers may report empty ids. Labels are never read. Resolves [] on any failure.
 */
export async function listVideoInputs(mediaDevices: MediaDevicesLike | undefined): Promise<string[]> {
  if (mediaDevices === undefined || typeof mediaDevices.enumerateDevices !== 'function') return [];
  let devices: unknown;
  try {
    devices = await mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
  if (!Array.isArray(devices)) return [];
  const out: string[] = [];
  for (const d of devices as unknown[]) {
    if (typeof d !== 'object' || d === null) continue;
    const { kind, deviceId } = d as { kind?: unknown; deviceId?: unknown };
    if (kind !== 'videoinput' || !validDeviceId(deviceId) || out.includes(deviceId)) continue;
    out.push(deviceId);
    if (out.length >= MAX_VIDEO_INPUTS) break;
  }
  return out;
}

/** Device id of the element's current video track, when the platform reports one. */
export function activeDeviceId(video: VideoLike): string | undefined {
  const stream = video.srcObject;
  if (!isStream(stream)) return undefined;
  try {
    const id = stream.getTracks()[0]?.getSettings?.().deviceId;
    return validDeviceId(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export interface ScanOptions {
  readonly signal?: AbortSignal;
  /** Frame reader; default is chosen by createDefaultReader (platform BarcodeDetector, else jsQR). */
  readonly reader?: FrameReader;
  /** Pause between frames, default 120 ms (saves battery; QR scanning does not need 60 fps). */
  readonly intervalMs?: number;
  /** Injected for tests. Must resolve after `ms` or as soon as `signal` aborts. */
  readonly wait?: (ms: number, signal: AbortSignal | undefined) => Promise<void>;
}

function defaultWait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Reads QR texts from a video element that already shows a camera stream (see startCamera). Calls `onText` for
 * each new distinct text (consecutive repeats are skipped); `onText` returning true ends the scan. Resolves when
 * the scan ends or `signal` aborts. In every case, including errors, all camera tracks are stopped and the element
 * is detached. Frames are processed in memory only; decoded text is never logged by this package.
 */
export async function scanFromVideo(
  video: VideoLike,
  onText: (text: string) => boolean | void | Promise<boolean | void>,
  options: ScanOptions = {},
): Promise<void> {
  const { signal } = options;
  const wait = options.wait ?? defaultWait;
  const intervalMs = options.intervalMs ?? 120;
  const ownedStream = video.srcObject;
  try {
    const reader = options.reader ?? (await (await import('./readers.js')).createDefaultReader());
    let last: string | null = null;
    let failures = 0;
    while (signal?.aborted !== true) {
      if (video.srcObject !== ownedStream) break;
      if (video.readyState >= HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        let text: string | null = null;
        try {
          text = await reader.read(video);
          failures = 0;
        } catch {
          if (++failures >= MAX_CONSECUTIVE_READ_FAILURES) throw new QrExchangeError('SCAN_FAILED');
        }
        if (text !== null && text.length > 0 && text.length <= MAX_SCAN_TEXT_LEN && text !== last) {
          if (isAborted(signal) || video.srcObject !== ownedStream) break;
          last = text;
          if ((await onText(text)) === true) return;
        }
      }
      await wait(intervalMs, signal);
    }
  } finally {
    if (video.srcObject === ownedStream) stopVideo(video);
    else stopStream(ownedStream);
  }
}
