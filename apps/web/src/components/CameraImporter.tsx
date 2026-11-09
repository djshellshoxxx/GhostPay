import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { QrExchangeError, scanFromVideo, startCamera, stopVideo } from '@ghostpay/qr-exchange';
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
}

// i18n-use: camera.status.tooLarge camera.status.accepted camera.status.rejected camera.status.unusable camera.error.denied camera.error.unavailable camera.error.scanFailed camera.error.startFailed
// i18n-use: camera.status.requesting camera.status.active camera.status.stopped camera.status.closed camera.status.enterFirst
/** Camera consent outcomes are security keys: an unreviewed locale shows the English source for them. */
function cameraMessage(error: unknown): MessageKey {
  if (error instanceof QrExchangeError) {
    if (error.code === 'CAMERA_DENIED') return 'camera.error.denied';
    if (error.code === 'CAMERA_UNAVAILABLE') return 'camera.error.unavailable';
    if (error.code === 'SCAN_FAILED') return 'camera.error.scanFailed';
  }
  return 'camera.error.startFailed';
}

/** Explicit camera consent, bounded input, and a shared lifetime for camera and pasted imports. */
export function CameraImporter({ label, onText, scopeKey, active = true, onInputChange }: CameraImporterProps): ReactNode {
  const i18n = useI18nOptional();
  const t = (i18n ?? SOURCE_TRANSLATOR).t;
  const root = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pasteAbort = useRef<AbortController | null>(null);
  const live = useRef(false);
  const isEnabled = useRef(active); isEnabled.current = active;
  const inputChanged = useRef(onInputChange); inputChanged.current = onInputChange;
  const callback = useRef(onText);
  callback.current = onText;
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  // Keep a key, not rendered copy: changing language also updates an already displayed status.
  const [status, setStatus] = useState<MessageKey | undefined>();

  const stop = useCallback((): void => {
    abort.current?.abort();
    pasteAbort.current?.abort();
    abort.current = null;
    pasteAbort.current = null;
    if (video.current !== null) stopVideo(video.current);
    if (live.current) { setRunning(false); setBusy(false); }
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
      if (!visible()) { stop(); setText(''); setStatus('camera.status.closed'); }
    };
    // toggle does not bubble; capture observes every containing disclosure, including nested details.
    document.addEventListener('toggle', disclosureChanged, true);
    return () => { live.current = false; stop(); document.removeEventListener('toggle', disclosureChanged, true); };
  }, [stop]);
  useEffect(() => { stop(); setText(''); setStatus(undefined); }, [active, scopeKey, stop]);

  const submit = async (value: string, controller: AbortController): Promise<boolean> => {
    const signal = controller.signal;
    if (signal.aborted || !visible()) return false;
    inputChanged.current?.();
    const candidate = value.trim();
    if (candidate.length > 65_536 || new TextEncoder().encode(candidate).byteLength > 65_536) {
      setStatus('camera.status.tooLarge');
      return false;
    }
    if (candidate.length === 0) { setStatus('camera.status.enterFirst'); return false; }
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

  const begin = (): void => {
    const el = video.current;
    if (el === null || abort.current !== null || !visible()) return;
    pasteAbort.current?.abort();
    inputChanged.current?.();
    setStatus('camera.status.requesting'); setRunning(true);
    const controller = new AbortController(); abort.current = controller;
    const isActive = (): boolean => abort.current === controller && !controller.signal.aborted && visible();
    void (async () => {
      try {
        await startCamera(el, navigator.mediaDevices, { signal: controller.signal });
        if (!isActive()) return;
        setStatus('camera.status.active');
        await scanFromVideo(el, async (value) => {
          if (!isActive()) return false;
          const accepted = await submit(value, controller);
          if (!isActive()) return false;
          if (accepted) { setText(''); setRunning(false); return true; }
          return false;
        }, { signal: controller.signal });
      } catch (error) {
        if (isActive()) setStatus(cameraMessage(error));
      } finally {
        if (abort.current === controller) { abort.current = null; if (live.current) setRunning(false); }
      }
    })();
  };
  const paste = (): void => {
    if (pasteAbort.current !== null || !visible()) return;
    stop();
    const controller = new AbortController(); pasteAbort.current = controller; setBusy(true);
    void submit(text, controller).then((accepted) => {
      if (controller.signal.aborted || !live.current) return;
      if (accepted) setText('');
    }).finally(() => {
      if (pasteAbort.current === controller) { pasteAbort.current = null; if (live.current) setBusy(false); }
    });
  };

  return (
    <section ref={root} className="panel" aria-label={label}>
      <h3>{label}</h3>
      <p>{t('camera.consent')}</p>
      <div className="stack">
        <video ref={video} muted playsInline aria-label={t('camera.preview')} hidden={!running} style={{ width: '100%', maxWidth: '32rem' }} />
        {running || busy ? <button type="button" className="btn" onClick={() => { stop(); inputChanged.current?.(); setStatus('camera.status.stopped'); }}>{t('camera.stop')}</button>
          : <button type="button" className="btn" disabled={!active} onClick={begin}>{t('camera.scan')}</button>}
        <label>{t('camera.pasteLabel')}<textarea rows={3} dir="ltr" maxLength={65_536} autoComplete="off" spellCheck={false} value={text} onChange={(event) => { stop(); inputChanged.current?.(); setStatus(undefined); setText(event.target.value); }} /></label>
        <button type="button" className="btn" disabled={!active || busy || text.trim() === ''} onClick={paste}>{t('camera.usePasted')}</button>
        <p role="status" aria-live="polite">{status === undefined ? '' : t(status)}</p>
      </div>
    </section>
  );
}
