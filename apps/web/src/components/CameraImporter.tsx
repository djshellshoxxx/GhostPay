import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QrExchangeError, scanFromVideo, startCamera, stopVideo } from '@ghostpay/qr-exchange';

export interface CameraImporterProps {
  /** Name used for the explicit camera action and the text fallback. */
  readonly label: string;
  /** Return true when the text was accepted. Return false/undefined to keep scanning. */
  readonly onText: (text: string) => boolean | void | Promise<boolean | void>;
}

function cameraMessage(error: unknown): string {
  if (error instanceof QrExchangeError) {
    if (error.code === 'CAMERA_DENIED') return 'Camera access was denied. You can still paste the QR text below.';
    if (error.code === 'CAMERA_UNAVAILABLE') return 'Camera scanning is unavailable here. You can still paste the QR text below.';
    if (error.code === 'SCAN_FAILED') return 'The camera could not read a QR code. You can still paste its text below.';
  }
  return 'The camera could not be started. You can still paste the QR text below.';
}

/**
 * Opt-in QR importer. It asks for camera access only from the Start button and always stops tracks when
 * cancelled, accepted, rejected with an exception, or unmounted. The decoded value is never logged.
 */
export function CameraImporter({ label, onText }: CameraImporterProps): ReactNode {
  const video = useRef<HTMLVideoElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => () => {
    abort.current?.abort();
    const el = video.current;
    if (el !== null) stopVideo(el);
  }, []);

  const submit = async (value: string, signal?: AbortSignal): Promise<boolean> => {
    const candidate = value.trim();
    if (candidate.length === 0) {
      setStatus('Enter or scan QR text first.');
      return false;
    }
    try {
      const accepted = (await onText(candidate)) === true;
      if (signal?.aborted === true) return false;
      setStatus(accepted ? 'QR text accepted.' : 'That QR text was not accepted. Check it and try again.');
      return accepted;
    } catch {
      if (signal?.aborted === true) return false;
      setStatus('That QR text could not be used. Check it and try again.');
      return false;
    }
  };

  const begin = (): void => {
    const el = video.current;
    if (el === null || abort.current !== null) return;
    setStatus('Requesting camera access…');
    setRunning(true);
    const controller = new AbortController();
    abort.current = controller;
    const isActive = (): boolean => abort.current === controller && !controller.signal.aborted;
    void (async () => {
      try {
        await startCamera(el, navigator.mediaDevices, { signal: controller.signal });
        if (!isActive()) return;
        setStatus('Camera active. Point it at a QR code.');
        await scanFromVideo(el, async (value) => {
          if (!isActive()) return false;
          const accepted = await submit(value, controller.signal);
          if (!isActive()) return false;
          if (accepted) {
            setText('');
            setRunning(false);
            return true;
          }
          return false;
        }, { signal: controller.signal });
      } catch (error) {
        if (isActive()) setStatus(cameraMessage(error));
      } finally {
        if (abort.current === controller) {
          abort.current = null;
          setRunning(false);
        }
      }
    })();
  };

  const cancel = (): void => {
    abort.current?.abort();
    const el = video.current;
    if (el !== null) stopVideo(el);
    abort.current = null;
    setRunning(false);
    setStatus('Camera stopped.');
  };

  return (
    <section className="panel" aria-label={label}>
      <h3>{label}</h3>
      <p>Camera access starts only when you choose it. Scanned text is checked on this device.</p>
      <div className="stack">
        <video ref={video} muted playsInline aria-label="QR scanner camera preview" hidden={!running} style={{ width: '100%', maxWidth: '32rem' }} />
        {running ? (
          <button type="button" className="btn" onClick={cancel}>Stop camera</button>
        ) : (
          <button type="button" className="btn" onClick={begin}>Scan with camera</button>
        )}
        <label>
          Or paste QR text
          <textarea rows={3} autoComplete="off" spellCheck={false} value={text} onChange={(event) => { setText(event.target.value); }} />
        </label>
        <button type="button" className="btn" disabled={text.trim() === ''} onClick={() => { void submit(text).then((accepted) => { if (accepted) setText(''); }); }}>
          Use pasted text
        </button>
        <p role="status" aria-live="polite">{status}</p>
      </div>
    </section>
  );
}
