import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  activeDeviceId,
  Assembler,
  decodeQrImage,
  listVideoInputs,
  QrExchangeError,
  scanFromVideo,
  startCamera,
  stopVideo,
  type AssemblerOptions,
  parseChunk,
} from '@ghostpay/qr-exchange';
import type { MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

export interface CameraImporterProps {
  readonly label: string;
  /** Check signal before exposing or installing data after an await. Aborting does not undo a completed action. */
  readonly onText: (text: string, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
  /** Changing the owning invoice/key/session invalidates pending callbacks and stops camera tracks. */
  readonly scopeKey?: unknown;
  readonly active?: boolean;
  /** Invalidates a previous preview before a new candidate is bounded or parsed. */
  readonly onInputChange?: () => void;
  /**
   * Reassemble multipart (animated) QR transfers: GPQ1 chunks from the camera, pasted lines or an image are collected
   * until complete, then the payload (strict UTF-8) is passed to onText once. Other text still goes to onText as is.
   */
  readonly multipart?: boolean;
  /** Idle limit and clock of the per-import Assembler (tests and tuning); read when a transfer starts. */
  readonly assemblerOptions?: AssemblerOptions;
}

const MAX_TEXT_BYTES = 65_536;
const CHUNK_PREFIX = 'GPQ1/';
/** Missing part numbers shown in the status line; the rest are counted ("and N more"). */
const MISSING_SHOWN = 12;

interface Transfer {
  readonly received: number;
  readonly total: number;
  readonly missing: readonly number[];
}
/** accepted: onText took it; pending: more parts are needed (or only duplicates); failed: nothing usable. */
type Outcome = 'accepted' | 'pending' | 'failed';

// i18n-use: camera.status.tooLarge camera.status.accepted camera.status.rejected camera.status.unusable camera.error.denied camera.error.unavailable camera.error.scanFailed camera.error.startFailed
// i18n-use: camera.status.requesting camera.status.active camera.status.stopped camera.status.closed camera.status.enterFirst
// i18n-use: camera.error.notFound camera.error.inUse camera.error.insecure camera.status.hidden camera.file.reading camera.file.tooLarge camera.file.notImage camera.file.unreadable camera.file.noQr
// i18n-use: camera.multipart.progress camera.multipart.restarted camera.multipart.badPart camera.multipart.hiddenReset camera.multipart.otherTransfer camera.multipart.conflict camera.multipart.integrity camera.multipart.expired
/** Camera consent outcomes are security keys: an unreviewed locale shows the English source for them. */
function cameraMessage(error: unknown): MessageKey {
  if (error instanceof QrExchangeError) {
    if (error.code === 'CAMERA_DENIED') return 'camera.error.denied';
    if (error.code === 'CAMERA_NOT_FOUND') return 'camera.error.notFound';
    if (error.code === 'CAMERA_IN_USE') return 'camera.error.inUse';
    if (error.code === 'CAMERA_INSECURE') return 'camera.error.insecure';
    if (error.code === 'CAMERA_UNAVAILABLE') return 'camera.error.unavailable';
    if (error.code === 'SCAN_FAILED') return 'camera.error.scanFailed';
  }
  return 'camera.error.startFailed';
}
function imageMessage(error: unknown): MessageKey {
  if (error instanceof QrExchangeError) {
    if (error.code === 'TOO_LARGE') return 'camera.file.tooLarge';
    if (error.code === 'BAD_INPUT') return 'camera.file.notImage';
  }
  return 'camera.file.unreadable';
}
const errorCode = (error: unknown): string | undefined => (error instanceof QrExchangeError ? error.code : undefined);

/** Explicit camera consent, bounded input, and a shared lifetime for camera, pasted and image imports. */
export function CameraImporter({ label, onText, scopeKey, active = true, onInputChange, multipart = false, assemblerOptions }: CameraImporterProps): ReactNode {
  const i18n = useI18nOptional();
  const tr = i18n ?? SOURCE_TRANSLATOR;
  const t = tr.t;
  const root = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const statusEl = useRef<HTMLParagraphElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pasteAbort = useRef<AbortController | null>(null);
  const live = useRef(false);
  const isEnabled = useRef(active); isEnabled.current = active;
  const inputChanged = useRef(onInputChange); inputChanged.current = onInputChange;
  const callback = useRef(onText);
  callback.current = onText;
  const isMultipart = useRef(multipart); isMultipart.current = multipart;
  const assemblerConfig = useRef(assemblerOptions); assemblerConfig.current = assemblerOptions;
  // One transfer at a time, bounded by the Assembler (64 parts); dropped on stop, scope change, hidden page, unmount.
  const assembler = useRef<Assembler | null>(null);
  /** Session of a completed transfer whose payload was refused; its parts are ignored until the user scans again. */
  const refusedSession = useRef<string | null>(null);
  const received = useRef(0);
  const devices = useRef<readonly string[]>([]);
  const device = useRef<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [text, setText] = useState('');
  // Keep a key, not rendered copy: changing language also updates an already displayed status.
  const [status, setStatus] = useState<MessageKey | undefined>();
  const [alert, setAlert] = useState<MessageKey | undefined>();
  const [transfer, setTransfer] = useState<Transfer | undefined>();

  /** Stops camera tracks and aborts camera, paste and image imports. A started transfer is kept (see resetTransfer). */
  const stop = useCallback((keepSwitch = false): void => {
    abort.current?.abort();
    pasteAbort.current?.abort();
    abort.current = null;
    pasteAbort.current = null;
    if (video.current !== null) stopVideo(video.current);
    if (live.current) { setRunning(false); setBusy(false); if (!keepSwitch) setCanSwitch(false); }
  }, []);
  const resetTransfer = useCallback((): void => {
    assembler.current?.reset();
    assembler.current = null;
    received.current = 0;
    if (live.current) { setTransfer(undefined); setAlert(undefined); }
  }, []);
  const visible = (): boolean => {
    let element: HTMLElement | null = root.current;
    while (element !== null) {
      if (element instanceof HTMLDetailsElement && !element.open) return false;
      element = element.parentElement;
    }
    return isEnabled.current && live.current;
  };

  useEffect(() => {
    live.current = true;
    const disclosureChanged = (): void => {
      if (!visible()) { stop(); resetTransfer(); setText(''); setStatus('camera.status.closed'); }
    };
    // A hidden page must not keep the camera: stop it and require a new click (no automatic restart on return).
    const visibilityChanged = (): void => {
      if (document.visibilityState !== 'hidden') return;
      const cameraOn = abort.current !== null || (video.current?.srcObject ?? null) !== null;
      const partial = assembler.current !== null;
      if (cameraOn) stop();
      if (partial) resetTransfer();
      if (cameraOn) setStatus('camera.status.hidden');
      else if (partial) setStatus('camera.multipart.hiddenReset');
    };
    // toggle does not bubble; capture observes every containing disclosure, including nested details.
    document.addEventListener('toggle', disclosureChanged, true);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      live.current = false;
      stop();
      resetTransfer();
      document.removeEventListener('toggle', disclosureChanged, true);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [stop, resetTransfer]);
  useEffect(() => { stop(); resetTransfer(); refusedSession.current = null; setText(''); setStatus(undefined); }, [active, scopeKey, stop, resetTransfer]);

  const deliver = async (candidate: string, signal: AbortSignal): Promise<boolean> => {
    try {
      const accepted = (await callback.current(candidate, signal)) === true;
      if (signal.aborted || !visible()) return false;
      setStatus(accepted ? 'camera.status.accepted' : 'camera.status.rejected');
      return accepted;
    } catch {
      if (signal.aborted || !visible()) return false;
      setStatus('camera.status.unusable');
      return false;
    }
  };

  /** Feeds chunk lines in order. Chunk text is never rendered; only counts and part numbers are shown. */
  const feedParts = async (lines: readonly string[], signal: AbortSignal): Promise<Outcome> => {
    for (const line of lines) {
      if (signal.aborted || !visible()) return 'failed';
      if (refusedSession.current !== null && sessionOfPart(line) === refusedSession.current) return 'failed';
      const current = (assembler.current ??= new Assembler(assemblerConfig.current ?? {}));
      let result: ReturnType<Assembler['add']>;
      try {
        result = current.add(line);
      } catch (error) {
        const code = errorCode(error);
        if (code === 'SESSION_MISMATCH') { setAlert('camera.multipart.otherTransfer'); return 'failed'; }
        if (code === 'CHUNK_CONFLICT' || code === 'INTEGRITY_FAILED' || code === 'SESSION_EXPIRED') {
          resetTransfer();
          setAlert(code === 'CHUNK_CONFLICT' ? 'camera.multipart.conflict' : code === 'SESSION_EXPIRED' ? 'camera.multipart.expired' : 'camera.multipart.integrity');
          return 'failed';
        }
        setStatus('camera.multipart.badPart');
        return 'failed';
      }
      if (!result.complete) {
        if (result.received === received.current) continue; // duplicate part: nothing changes
        received.current = result.received;
        setTransfer({ received: result.received, total: result.total, missing: current.missing() });
        setStatus('camera.multipart.progress');
        setAlert(undefined);
        continue;
      }
      const payload = result.payload;
      const session = current.session;
      // Drop the transfer before delivery so a completed payload reaches onText exactly once.
      resetTransfer();
      let decoded: string;
      try {
        if (payload === undefined) throw new QrExchangeError('INTEGRITY_FAILED');
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      } catch {
        setAlert('camera.multipart.integrity');
        return 'failed';
      }
      if (await deliver(decoded, signal)) return 'accepted';
      // A looping animated code would otherwise rebuild and resubmit the refused payload, hiding the refusal.
      // Only a real refusal is remembered; an aborted delivery (stop, scope change, unmount) is not the user's answer.
      if (!signal.aborted) refusedSession.current = session;
      return 'failed';
    }
    return 'pending';
  };

  const submit = async (value: string, controller: AbortController): Promise<Outcome> => {
    const signal = controller.signal;
    if (signal.aborted || !visible()) return 'failed';
    inputChanged.current?.();
    const candidate = value.trim();
    if (candidate.length > MAX_TEXT_BYTES || new TextEncoder().encode(candidate).byteLength > MAX_TEXT_BYTES) {
      setStatus('camera.status.tooLarge');
      return 'failed';
    }
    if (candidate.length === 0) { setStatus('camera.status.enterFirst'); return 'failed'; }
    if (isMultipart.current && candidate.startsWith(CHUNK_PREFIX)) {
      const lines = candidate.split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line.length > 0);
      return feedParts(lines, signal);
    }
    return (await deliver(candidate, signal)) ? 'accepted' : 'failed';
  };

  const begin = (deviceId?: string): void => {
    if (deviceId === undefined) refusedSession.current = null; // a new scan (not a camera switch) is a new attempt
    const el = video.current;
    if (el === null || abort.current !== null || !visible()) return;
    pasteAbort.current?.abort();
    inputChanged.current?.();
    setStatus('camera.status.requesting'); setRunning(true);
    const controller = new AbortController(); abort.current = controller;
    const isActive = (): boolean => abort.current === controller && !controller.signal.aborted && visible();
    void (async () => {
      try {
        await startCamera(el, navigator.mediaDevices, { signal: controller.signal, deviceId, secureContext: window.isSecureContext });
        if (!isActive()) return;
        setStatus('camera.status.active');
        device.current = activeDeviceId(el) ?? deviceId;
        // Ids only (labels are never read); listed after permission because browsers hide ids before it.
        void listVideoInputs(navigator.mediaDevices).then((ids) => {
          if (!isActive()) return;
          devices.current = ids;
          setCanSwitch(ids.length > 1);
        }, () => undefined);
        await scanFromVideo(el, async (value) => {
          if (!isActive()) return false;
          const outcome = await submit(value, controller);
          if (!isActive()) return false;
          if (outcome === 'accepted') { setText(''); setRunning(false); return true; }
          return false;
        }, { signal: controller.signal });
      } catch (error) {
        if (isActive()) setStatus(cameraMessage(error));
      } finally {
        if (abort.current === controller) { abort.current = null; if (live.current) { setRunning(false); setCanSwitch(false); } }
      }
    })();
  };
  /** Stops the current stream (its tracks end before the next request) and opens the next camera. */
  const switchCamera = (): void => {
    const ids = devices.current;
    if (ids.length < 2) return;
    const next = ids[(ids.indexOf(device.current ?? '') + 1) % ids.length];
    stop(true);
    begin(next);
  };
  const paste = (): void => {
    refusedSession.current = null;
    if (pasteAbort.current !== null || !visible()) return;
    stop();
    const controller = new AbortController(); pasteAbort.current = controller; setBusy(true);
    void submit(text, controller).then((outcome) => {
      if (controller.signal.aborted || !live.current) return;
      if (outcome !== 'failed') setText('');
    }).finally(() => {
      if (pasteAbort.current === controller) { pasteAbort.current = null; if (live.current) setBusy(false); }
    });
  };
  const readImage = (event: ChangeEvent<HTMLInputElement>): void => {
    refusedSession.current = null; // picking an image is a new attempt
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Clear the selection so the same file can be chosen again; the File itself is only held for this decode.
    input.value = '';
    if (file === undefined || pasteAbort.current !== null || !visible()) return;
    stop();
    inputChanged.current?.();
    const controller = new AbortController(); pasteAbort.current = controller; setBusy(true);
    setStatus('camera.file.reading');
    void (async () => {
      try {
        const decoded = await decodeQrImage(file, { signal: controller.signal });
        if (controller.signal.aborted || !visible()) return;
        if (decoded === null) setStatus('camera.file.noQr');
        else await submit(decoded, controller);
      } catch (error) {
        if (!controller.signal.aborted && visible()) setStatus(imageMessage(error));
      } finally {
        if (pasteAbort.current === controller) { pasteAbort.current = null; if (live.current) setBusy(false); }
      }
    })();
  };
  // The button disappears with the transfer, so move focus to the status line instead of dropping it (WCAG 2.4.3).
  const startOver = (): void => { refusedSession.current = null; resetTransfer(); setStatus('camera.multipart.restarted'); statusEl.current?.focus(); };

  const progressText = (p: Transfer): string => t('camera.multipart.progress', { received: p.received, total: p.total });
  const statusText = (): string => {
    if (status === undefined) return '';
    if (status !== 'camera.multipart.progress') return t(status);
    if (transfer === undefined) return '';
    if (transfer.missing.length === 0) return progressText(transfer);
    const shown = transfer.missing.slice(0, MISSING_SHOWN).map((index) => tr.number(index + 1));
    const parts = tr.list(shown, { type: 'unit', style: 'short' });
    const more = transfer.missing.length - shown.length;
    const missing = more > 0 ? t('camera.multipart.missingMore', { parts, more }) : t('camera.multipart.missing', { parts });
    return `${progressText(transfer)} ${missing}`;
  };

  return (
    <section ref={root} className="panel" aria-label={label}>
      <h3>{label}</h3>
      <p>{t('camera.consent')}</p>
      <div className="stack">
        <video ref={video} muted playsInline aria-label={t('camera.preview')} hidden={!running} style={{ width: '100%', maxWidth: '32rem' }} />
        {running || busy ? <button type="button" className="btn" onClick={() => { stop(); resetTransfer(); inputChanged.current?.(); setStatus('camera.status.stopped'); }}>{t('camera.stop')}</button>
          : <button type="button" className="btn" disabled={!active} onClick={() => { begin(); }}>{t('camera.scan')}</button>}
        {running && canSwitch ? <button type="button" className="btn" onClick={switchCamera}>{t('camera.switch')}</button> : null}
        <label>{t('camera.pasteLabel')}<textarea rows={3} dir="ltr" maxLength={65_536} autoComplete="off" spellCheck={false} value={text} onChange={(event) => { stop(); inputChanged.current?.(); setStatus(assembler.current === null ? undefined : 'camera.multipart.progress'); setText(event.target.value); }} /></label>
        <button type="button" className="btn" disabled={!active || busy || text.trim() === ''} onClick={paste}>{t('camera.usePasted')}</button>
        <label>{t('camera.file.label')}<input type="file" accept="image/*" disabled={!active || busy} onChange={readImage} /></label>
        {transfer === undefined ? null : (
          <>
            <progress max={transfer.total} value={transfer.received} aria-label={t('camera.multipart.progressLabel')} aria-valuetext={progressText(transfer)} />
            <button type="button" className="btn" onClick={startOver}>{t('camera.multipart.startOver')}</button>
          </>
        )}
        <p ref={statusEl} tabIndex={-1} role="status" aria-live="polite">{statusText()}</p>
        {alert === undefined ? null : <p role="alert">{t(alert)}</p>}
      </div>
    </section>
  );
}

/** Session id of a GPQ1 part, or null when the text is not a valid part (it is then reported by the Assembler). */
function sessionOfPart(text: string): string | null {
  try { return parseChunk(text).session; } catch { return null; }
}
