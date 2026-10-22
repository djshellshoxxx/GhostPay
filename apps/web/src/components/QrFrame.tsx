import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { makeQr, qrSvgText } from '../lib/qr';
import { QR_KINDS, qrKindClass, type QrIconId, type QrKind } from '../lib/qrKinds';
import '../styles/qr.css';
import { CopyButton, downloadText } from './Common';
import { QrView } from './QrView';

const ICON_PATHS: Readonly<Record<QrIconId, ReactNode>> = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
    </>
  ),
  devices: (
    <>
      <rect x="2" y="5" width="13" height="9" rx="1" />
      <path d="M1 18h15" />
      <rect x="17" y="8" width="5" height="11" rx="1" />
    </>
  ),
  'check-doc': (
    <>
      <path d="M6 2h9l4 4v16H6z" />
      <path d="M9 14l2.5 2.5L16 11" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3L2 21h20z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
};

/** Inline SVG icon (no external assets); decorative, the text label carries the meaning. */
export function QrIcon(props: { readonly icon: QrIconId }): ReactNode {
  return (
    <svg className="qr-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[props.icon]}
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Milliseconds each part stays visible when auto-advancing (slow enough for a phone camera to lock on). */
export const PART_INTERVAL_MS = 2500;

export interface QrFrameProps {
  readonly kind: QrKind;
  /** Full payload. With `chunks`, still the whole payload (used for the single-code fallback). */
  readonly text: string;
  readonly caption: string;
  /** Multipart: one QR per entry. Shown as "Part i of n". */
  readonly chunks?: readonly string[];
}

/** Colour-coded frame around a QR code: kind label, icon, border style, explanation and handling rules. */
export function QrFrame(props: QrFrameProps): ReactNode {
  const info = QR_KINDS[props.kind];
  const rules = info.rules;
  const uid = useId();
  const labelId = `${uid}-label`;
  const descId = `${uid}-desc`;
  const parts = props.chunks !== undefined && props.chunks.length > 1 ? props.chunks : null;
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [revealed, setRevealed] = useState(!rules.revealRequired);
  const [hiddenNote, setHiddenNote] = useState('');
  const [large, setLarge] = useState(false);
  const reduced = prefersReducedMotion();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const total = parts?.length ?? 1;
  const safeIndex = Math.min(index, total - 1);
  const current = parts !== null ? (parts[safeIndex] ?? props.text) : props.text;
  const visible = revealed || !rules.revealRequired;

  const hide = useCallback((note: string) => {
    setRevealed(false);
    setLarge(false);
    setAuto(false);
    setHiddenNote(note);
  }, []);

  // Secret: auto-hide after the configured time, and when the page is hidden.
  useEffect(() => {
    if (!rules.revealRequired || !revealed || rules.autoHideSeconds === null) return;
    const t = setTimeout(() => {
      hide('The secret QR code was hidden automatically.');
    }, rules.autoHideSeconds * 1000);
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') hide('The secret QR code was hidden because the page was hidden.');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [rules.revealRequired, rules.autoHideSeconds, revealed, hide]);

  // Multipart auto-advance (never when the user prefers reduced motion).
  useEffect(() => {
    if (!auto || parts === null || reduced) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % parts.length);
    }, PART_INTERVAL_MS);
    return () => {
      clearInterval(t);
    };
  }, [auto, parts, reduced]);

  // Full-screen mode: Escape closes, focus moves in and back, best-effort wake lock keeps the screen on.
  useEffect(() => {
    if (!large) return;
    const opener = openerRef.current;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLarge(false);
    };
    document.addEventListener('keydown', onKey);
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl !== undefined) {
        wl.request('screen').then(
          (l) => {
            if (cancelled) void l.release();
            else lock = l;
          },
          () => undefined,
        );
      }
    } catch {
      /* wake lock is optional */
    }
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
      if (lock !== null) void lock.release().catch(() => undefined);
      opener?.focus();
    };
  }, [large]);

  const download = (): void => {
    try {
      downloadText(`ghostpay-${props.kind}-qr.svg`, qrSvgText(makeQr(current)), 'image/svg+xml');
    } catch {
      /* too long: QrView already shows the explanation */
    }
  };

  const stepper =
    parts === null ? null : (
      <div className="qr-parts" role="group" aria-label="Multipart QR code">
        <p className="qr-part-status" role="status">
          Part {safeIndex + 1} of {total}
        </p>
        <button type="button" className="btn" disabled={safeIndex === 0} onClick={() => { setIndex(safeIndex - 1); }}>
          Previous part
        </button>
        <button type="button" className="btn" disabled={safeIndex === total - 1} onClick={() => { setIndex(safeIndex + 1); }}>
          Next part
        </button>
        {reduced ? (
          <p className="qr-note">Automatic stepping is off because your device asks for reduced motion. Use Next part.</p>
        ) : (
          <label className="qr-auto">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); }} /> Step through the parts automatically (about every {PART_INTERVAL_MS / 1000} seconds)
          </label>
        )}
      </div>
    );

  const image = <QrView text={current} caption={props.caption} bare />;

  return (
    <section className={`qr-frame ${qrKindClass(props.kind)}`} data-qr-kind={props.kind} aria-labelledby={labelId} aria-describedby={descId}>
      <header className="qr-frame-head">
        <QrIcon icon={info.icon} />
        <span id={labelId} className="qr-label">
          {info.label}
        </span>
      </header>
      <p id={descId} className="qr-explain">
        {info.explanation}
      </p>
      {rules.warning !== null && <p className="qr-warning">Warning: {rules.warning}</p>}
      {visible ? (
        <div className="qr-body">
          {image}
          <p className="qr-caption">{props.caption}</p>
          {stepper}
          <div className="qr-actions">
            {rules.revealRequired && (
              <button type="button" className="btn" onClick={() => { hide('The secret QR code is hidden.'); }}>
                Hide now
              </button>
            )}
            <button type="button" className="btn" ref={openerRef} onClick={() => { setLarge(true); }}>
              Show larger
            </button>
            {rules.allowCopyText && <CopyButton text={current} label="Copy as text" />}
            {rules.allowDownload && (
              <button type="button" className="btn" onClick={download}>
                Download SVG
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="qr-body qr-hidden">
          <button type="button" className="btn btn-primary" onClick={() => { setRevealed(true); setHiddenNote(''); }}>
            Reveal secret QR code
          </button>
        </div>
      )}
      <p className="qr-note" role="status">
        {hiddenNote}
      </p>
      {large && visible && (
        <div className="qr-large" role="dialog" aria-modal="true" aria-label={`${info.label} QR code, large`}>
          <p className="qr-large-label">
            <QrIcon icon={info.icon} /> {info.label}
          </p>
          {image}
          {parts !== null && (
            <p className="qr-part-status">
              Part {safeIndex + 1} of {total}
            </p>
          )}
          <p className="qr-note">Turn your screen brightness up and hold your phone camera steady over the code.</p>
          {parts !== null && (
            <div className="qr-actions">
              <button type="button" className="btn" disabled={safeIndex === 0} onClick={() => { setIndex(safeIndex - 1); }}>
                Previous part
              </button>
              <button type="button" className="btn" disabled={safeIndex === total - 1} onClick={() => { setIndex(safeIndex + 1); }}>
                Next part
              </button>
            </div>
          )}
          <button type="button" className="btn btn-primary" ref={closeRef} onClick={() => { setLarge(false); }}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
