import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { QrExchangeError, scanFromVideo, startCamera, stopVideo } from '@ghostpay/qr-exchange';

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

function cameraMessage(error: unknown): string {
  if (error instanceof QrExchangeError) {
    if (error.code === 'CAMERA_DENIED') return 'Camera access was denied. You can still paste the QR text below.';
    if (error.code === 'CAMERA_UNAVAILABLE') return 'Camera scanning is unavailable here. You can still paste the QR text below.';
    if (error.code === 'SCAN_FAILED') return 'The camera could not read a QR code. You can still paste its text below.';
  }
  return 'The camera could not be started. You can still paste the QR text below.';
}

/** Explicit camera consent, bounded input, and a shared lifetime for camera and pasted imports. */
export function CameraImporter({ label, onText, scopeKey, active = true, onInputChange }: CameraImporterProps): ReactNode {
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
  const [status, setStatus] = useState('');

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
      if (!visible()) { stop(); setText(''); setStatus('Import closed.'); }
    };
    // toggle does not bubble; capture observes every containing disclosure, including nested details.
    document.addEventListener('toggle', disclosureChanged, true);
    return () => { live.current = false; stop(); document.removeEventListener('toggle', disclosureChanged, true); };
  }, [stop]);
  useEffect(() => { stop(); setText(''); setStatus(''); }, [active, scopeKey, stop]);

  const submit = async (value: string, controller: AbortController): Promise<boolean> => {
    const signal = controller.signal;
    if (signal.aborted || !visible()) return false;
    inputChanged.current?.();
    const candidate = value.trim();
    if (candidate.length > 65_536 || new TextEncoder().encode(candidate).byteLength > 65_536) {
      setStatus('QR text exceeds the 64 KiB safety limit.');
      return false;
    }
    if (candidate.length === 0) { setStatus('Enter or scan QR text first.'); return false; }
    try {
      const accepted = (await callback.current(candidate, signal)) === true;
      if (signal.aborted || !visible()) return false;
      setStatus(accepted ? 'QR text accepted.' : 'That QR text was not accepted. Check it and try again.');
      return accepted;
    } catch {
      if (signal.aborted || !visible()) return false;
      setStatus('That QR text could not be used. Check it and try again.');
      return false;
    }
  };

  const begin = (): void => {
    const el = video.current;
    if (el === null || abort.current !== null || !visible()) return;
    pasteAbort.current?.abort();
    setStatus('Requesting camera access…'); setRunning(true);
    const controller = new AbortController(); abort.current = controller;
    const isActive = (): boolean => abort.current === controller && !controller.signal.aborted && visible();
    void (async () => {
      try {
        await startCamera(el, navigator.mediaDevices, { signal: controller.signal });
        if (!isActive()) return;
        setStatus('Camera active. Point it at a QR code.');
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
      <p>Camera access starts only when you choose it. Scanned text is checked on this device.</p>
      <div className="stack">
        <video ref={video} muted playsInline aria-label="QR scanner camera preview" hidden={!running} style={{ width: '100%', maxWidth: '32rem' }} />
        {running || busy ? <button type="button" className="btn" onClick={() => { stop(); setStatus('Camera stopped.'); }}>Stop camera</button>
          : <button type="button" className="btn" disabled={!active} onClick={begin}>Scan with camera</button>}
        <label>Or paste QR text<textarea rows={3} maxLength={65_536} autoComplete="off" spellCheck={false} value={text} onChange={(event) => { inputChanged.current?.(); setText(event.target.value); }} /></label>
        <button type="button" className="btn" disabled={!active || busy || text.trim() === ''} onClick={paste}>Use pasted text</button>
        <p role="status" aria-live="polite">{status}</p>
      </div>
    </section>
  );
}
