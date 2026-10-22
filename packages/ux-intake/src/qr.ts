import {
  classifyPayload,
  MAX_PAYLOAD_CHARS,
  sanitizeInput,
  type Payload,
  type PayloadErrorCode,
  type PayloadPolicy,
} from './payload.js';
import { err, ok, type Result } from './result.js';

/** Max chars in one chunk frame's data section. */
export const MAX_CHUNK_DATA_CHARS = 2048;
/** Max frames in one multi-frame transfer. */
export const MAX_CHUNKS = 16;
/** Chunk lifetime from the first accepted frame (ms). */
export const ASSEMBLY_TTL_MS = 60_000;
/** Chunk frame prefix: `gpc1:<id>:<index>/<total>:<data>` (index is 1-based). */
export const CHUNK_PREFIX = 'gpc1:';

export type ScanErrorCode =
  | PayloadErrorCode
  | 'bad-chunk'
  | 'chunk-session-mismatch'
  | 'chunk-conflict'
  | 'chunk-too-large'
  | 'nested-chunk';

/** One parsed chunk frame. */
export interface ChunkFrame {
  readonly id: string;
  readonly index: number;
  readonly total: number;
  readonly data: string;
}

/** Outcome of scanning one frame in isolation. */
export type ScanOutcome =
  | { readonly type: 'payload'; readonly payload: Payload }
  | { readonly type: 'chunk'; readonly chunk: ChunkFrame };

const CHUNK_RE = /^gpc1:([a-z0-9]{6,16}):([1-9][0-9]?)\/([2-9]|1[0-6]):([A-Za-z0-9._~%/+=:?&#-]+)$/;

function parseChunk(s: string): Result<ChunkFrame, ScanErrorCode> {
  const m = CHUNK_RE.exec(s);
  if (m === null) return err('bad-chunk');
  const index = Number(m[2]);
  const total = Number(m[3]);
  const data = m[4] as string;
  if (index > total) return err('bad-chunk');
  if (data.length > MAX_CHUNK_DATA_CHARS) return err('chunk-too-large');
  return ok({ id: m[1] as string, index, total, data });
}

/**
 * Interprets one scanned string: a chunk frame or a complete payload.
 *
 * @param raw Raw QR text from the (external) camera decoder.
 * @param policy Host allowlist and caps; `maxChars` defaults to 4096 per frame.
 * @security Pure; no camera access. Everything is untrusted until it passes {@link classifyPayload}.
 */
export function interpretScan(raw: unknown, policy: PayloadPolicy): Result<ScanOutcome, ScanErrorCode> {
  const clean = sanitizeInput(raw, policy.maxChars ?? 4096);
  if (!clean.ok) return clean;
  if (clean.value.startsWith(CHUNK_PREFIX)) {
    const c = parseChunk(clean.value);
    return c.ok ? ok({ type: 'chunk', chunk: c.value }) : c;
  }
  const p = classifyPayload(clean.value, policy);
  return p.ok ? ok({ type: 'payload', payload: p.value }) : p;
}

/** Immutable in-progress multi-frame state. */
export interface AssemblyState {
  readonly id: string;
  readonly total: number;
  readonly startedAt: number;
  readonly parts: readonly (string | null)[];
}

/** Result of feeding one frame to {@link addScan}. */
export type AddScanValue =
  | {
      readonly status: 'progress';
      readonly state: AssemblyState;
      readonly received: number;
      readonly total: number;
      /** 1-based indexes still missing. */
      readonly missing: readonly number[];
      readonly duplicate: boolean;
      /** True when an expired assembly was discarded and this frame started a new one. */
      readonly restarted: boolean;
    }
  | { readonly status: 'complete'; readonly payload: Payload }
  | { readonly status: 'payload'; readonly payload: Payload };

function progress(state: AssemblyState, duplicate: boolean, restarted: boolean): AddScanValue {
  const missing: number[] = [];
  state.parts.forEach((p, i) => {
    if (p === null) missing.push(i + 1);
  });
  return {
    status: 'progress',
    state,
    received: state.total - missing.length,
    total: state.total,
    missing,
    duplicate,
    restarted,
  };
}

/**
 * Feeds one scanned string into the (optional) current multi-frame assembly.
 *
 * @remarks A non-chunk scan returns `status: 'payload'` and leaves state to the caller.
 * Rules: one transfer at a time (a frame with another id is `chunk-session-mismatch`; the UI
 * must reset explicitly, so a hostile QR cannot silently replace progress); identical repeats
 * are `duplicate`; a different body for a seen index is `chunk-conflict`; `total` must match;
 * the assembly expires `ASSEMBLY_TTL_MS` after the first frame (then restarts). The joined text
 * is capped at {@link MAX_PAYLOAD_CHARS}, may not itself be a chunk, and is classified like a
 * single scan. On any error the caller should drop the state (except `chunk-session-mismatch`).
 * @param state Current assembly or null.
 * @param raw Raw scanned text.
 * @param policy Payload policy; `maxChars` is applied per frame, the reassembled text uses {@link MAX_PAYLOAD_CHARS}.
 * @param nowMs Injected clock (ms).
 * @security Chunk integrity relies on the final payload's own authentication (invoice signature);
 * frames carry no MAC, so a nearby attacker can only cause conflict/rejection, not a valid forged invoice.
 */
export function addScan(
  state: AssemblyState | null,
  raw: unknown,
  policy: PayloadPolicy,
  nowMs: number,
): Result<AddScanValue, ScanErrorCode> {
  const scan = interpretScan(raw, policy);
  if (!scan.ok) return scan;
  if (scan.value.type === 'payload') return ok({ status: 'payload', payload: scan.value.payload });
  const c = scan.value.chunk;
  let cur = state;
  let restarted = false;
  if (cur !== null && nowMs - cur.startedAt > ASSEMBLY_TTL_MS) {
    cur = null;
    restarted = true;
  }
  if (cur === null) {
    cur = { id: c.id, total: c.total, startedAt: nowMs, parts: new Array<string | null>(c.total).fill(null) };
  } else if (cur.id !== c.id) {
    return err('chunk-session-mismatch');
  } else if (cur.total !== c.total) {
    return err('chunk-conflict');
  }
  const existing = cur.parts[c.index - 1] as string | null;
  if (existing !== null) {
    return existing === c.data ? ok(progress(cur, true, restarted)) : err('chunk-conflict');
  }
  const parts = cur.parts.map((p, i) => (i === c.index - 1 ? c.data : p));
  const size = parts.reduce<number>((n, p) => n + (p === null ? 0 : p.length), 0);
  if (size > MAX_PAYLOAD_CHARS) return err('chunk-too-large');
  const next: AssemblyState = { ...cur, parts };
  if (parts.some((p) => p === null)) return ok(progress(next, false, restarted));
  const joined = parts.join('');
  if (joined.startsWith(CHUNK_PREFIX)) return err('nested-chunk');
  const p = classifyPayload(joined, { ...policy, maxChars: MAX_PAYLOAD_CHARS });
  return p.ok ? ok({ status: 'complete', payload: p.value }) : p;
}

/** Camera permission states surfaced to the UI. */
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

export type PermissionAction = 'start-scan' | 'request-permission' | 'show-settings-help' | 'use-fallback';

/** Render-ready permission view-model (no DOM). */
export interface PermissionViewModel {
  readonly state: PermissionState;
  readonly showScanner: boolean;
  readonly primaryAction: PermissionAction;
  /** Manual paste/import is always offered so a denied or missing camera never blocks the user. */
  readonly showPasteFallback: true;
  /** i18n key for the status line. */
  readonly messageKey: string;
}

/**
 * Maps a permission state to a view-model.
 *
 * @param state Current camera permission state.
 * @security `prompt` never auto-starts capture: the user must trigger the request.
 */
export function permissionViewModel(state: PermissionState): PermissionViewModel {
  const base = { state, showPasteFallback: true, messageKey: `intake.camera.${state}` } as const;
  switch (state) {
    case 'granted':
      return { ...base, showScanner: true, primaryAction: 'start-scan' };
    case 'prompt':
      return { ...base, showScanner: false, primaryAction: 'request-permission' };
    case 'denied':
      return { ...base, showScanner: false, primaryAction: 'show-settings-help' };
    case 'unavailable':
      return { ...base, showScanner: false, primaryAction: 'use-fallback' };
  }
}

/** Inputs to {@link nextPermissionState}. */
export type PermissionEvent =
  | { readonly type: 'queried'; readonly state: PermissionState }
  | { readonly type: 'request-started' }
  | { readonly type: 'request-failed'; readonly errorName: string };

/**
 * Maps a `getUserMedia` DOMException name to a state: `NotAllowedError`/`SecurityError` mean denied;
 * every other name (`NotFoundError`, `NotReadableError`, `OverconstrainedError`, unknown) means unavailable.
 */
export function permissionFromErrorName(name: string): PermissionState {
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
}

/**
 * Pure transition function for the permission state.
 *
 * @remarks `unavailable` is sticky against `request-started` (no camera to request); a
 * `queried` event always wins (the platform is the source of truth).
 */
export function nextPermissionState(current: PermissionState, event: PermissionEvent): PermissionState {
  switch (event.type) {
    case 'queried':
      return event.state;
    case 'request-started':
      return current === 'unavailable' ? 'unavailable' : current === 'granted' ? 'granted' : 'prompt';
    case 'request-failed':
      return permissionFromErrorName(event.errorName);
  }
}
