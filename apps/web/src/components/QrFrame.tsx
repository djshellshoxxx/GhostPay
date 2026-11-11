import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { makeQr, qrSvgText } from '../lib/qr';
import { localizedQrKind, qrKindClass, type QrIconId, type QrKind } from '../lib/qrKinds';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/sourceCatalog';
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

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    try {
      if (typeof window.matchMedia !== 'function') return;
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const change = (): void => { setReduced(query.matches); };
      change();
      if (typeof query.addEventListener !== 'function') return;
      query.addEventListener('change', change);
      return () => { query.removeEventListener('change', change); };
    } catch {
      return;
    }
  }, []);
  return reduced;
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
  /**
   * Set false to withhold copy-as-text and SVG download even where the kind allows them (for example a settings QR
   * that carries endpoint URLs, which may embed API keys). It can only narrow the kind's rules, never widen them.
   */
  readonly allowExport?: boolean;
}

type PayloadScope = Pick<QrFrameProps, 'kind' | 'text' | 'chunks'>;

/** Equal copied chunks do not create a new scope merely because a language change rerendered a parent. */
function samePayload(scope: PayloadScope | undefined, next: PayloadScope): boolean {
  if (scope === undefined || scope.kind !== next.kind || scope.text !== next.text) return false;
  const before = scope.chunks ?? [];
  const after = next.chunks ?? [];
  return before.length === after.length && before.every((part, index) => part === after[index]);
}

function payloadScope(props: QrFrameProps): PayloadScope {
  return props.chunks === undefined
    ? { kind: props.kind, text: props.text }
    : { kind: props.kind, text: props.text, chunks: [...props.chunks] };
}

/** Colour-coded frame around a QR code: kind label, icon, border style, explanation and handling rules. */
export function QrFrame(props: QrFrameProps): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const info = localizedQrKind(props.kind, t);
  const rules = info.rules;
  const uid = useId();
  const labelId = `${uid}-label`;
  const descId = `${uid}-desc`;
  const largeDescId = `${uid}-large-desc`;
  const parts = props.chunks !== undefined && props.chunks.length > 1 ? props.chunks : null;
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [revealedFor, setRevealedFor] = useState<PayloadScope | undefined>();
  const [hiddenNote, setHiddenNote] = useState<MessageKey | undefined>();
  const [largeFor, setLargeFor] = useState<PayloadScope | undefined>();
  const revealed = samePayload(revealedFor, props);
  const reduced = useReducedMotion();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const revealRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const total = parts?.length ?? 1;
  // Clamp both ends when the multipart payload changes between renders.
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const current = parts !== null ? (parts[safeIndex] ?? props.text) : props.text;
  const visible = revealed || !rules.revealRequired;
  const large = visible && samePayload(largeFor, props);

  const hide = useCallback((note: MessageKey) => {
    setRevealedFor(undefined);
    setLargeFor(undefined);
    setAuto(false);
    setHiddenNote(note);
  }, []);

  // Rendering is already fail-closed above; drop stale secret snapshots after a payload change.
  useEffect(() => {
    if (revealedFor !== undefined && !samePayload(revealedFor, props)) setRevealedFor(undefined);
    if (largeFor !== undefined && !samePayload(largeFor, props)) setLargeFor(undefined);
  }, [props.kind, props.text, props.chunks, revealedFor, largeFor]);

  useEffect(() => { if (reduced || !visible) setAuto(false); }, [reduced, visible]);

  // Secret: auto-hide after the configured time, and when the page is hidden.
  useEffect(() => {
    if (!rules.revealRequired || !revealed || rules.autoHideSeconds === null) return;
    const timer = setTimeout(() => {
      hide('qrFrame.hidden.auto');
    }, rules.autoHideSeconds * 1000);
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') hide('qrFrame.hidden.page');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [rules.revealRequired, rules.autoHideSeconds, revealed, hide]);

  // Multipart auto-advance (never when the user prefers reduced motion).
  useEffect(() => {
    if (!auto || parts === null || reduced) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % parts.length);
    }, PART_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [auto, parts, reduced]);

  // Full-screen mode: Escape closes, focus moves in and back, best-effort wake lock keeps the screen on.
  useEffect(() => {
    if (!large) return;
    const opener = openerRef.current;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setLargeFor(undefined);
        return;
      }
      if (e.key !== 'Tab') return;
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first?.focus();
      }
    };
    const onFocus = (e: FocusEvent): void => {
      if (e.target instanceof Node && !dialogRef.current?.contains(e.target)) closeRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl !== undefined) {
        wl.request('screen').then(
          (l) => {
            if (cancelled) void l.release().catch(() => undefined);
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
      document.removeEventListener('focusin', onFocus);
      if (lock !== null) void lock.release().catch(() => undefined);
      if (opener?.isConnected) opener.focus();
      else revealRef.current?.focus();
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
      <div className="qr-parts" role="group" aria-label={t('qrFrame.multipart')}>
        <p className="qr-part-status" role="status">
          {t('qrFrame.part', { part: safeIndex + 1, total })}
        </p>
        <button type="button" className="btn" disabled={safeIndex === 0} onClick={() => { setIndex(safeIndex - 1); }}>
          {t('qrFrame.previous')}
        </button>
        <button type="button" className="btn" disabled={safeIndex === total - 1} onClick={() => { setIndex(safeIndex + 1); }}>
          {t('qrFrame.next')}
        </button>
        {reduced ? (
          <p className="qr-note">{t('qrFrame.reduced')}</p>
        ) : (
          <label className="qr-auto">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); }} /> {t('qrFrame.auto', { seconds: PART_INTERVAL_MS / 1000 })}
          </label>
        )}
      </div>
    );

  const image = <QrView text={current} caption={props.caption} bare />;

  return (
    <section className={`qr-frame ${qrKindClass(props.kind)}`} data-qr-kind={props.kind} data-qr-print-note={rules.revealRequired ? t('qrFrame.secretPrint') : undefined} aria-labelledby={labelId} aria-describedby={descId}>
      <header className="qr-frame-head">
        <QrIcon icon={info.icon} />
        <span id={labelId} className="qr-label">
          {info.label}
        </span>
      </header>
      <p id={descId} className="qr-explain">
        {info.explanation}
      </p>
      {rules.warning !== null && <p className="qr-warning">{t('qrFrame.warning', { warning: rules.warning })}</p>}
      {visible ? (
        <div className="qr-body">
          {image}
          <p className="qr-caption">{props.caption}</p>
          {stepper}
          <div className="qr-actions">
            {rules.revealRequired && (
              <button type="button" className="btn" onClick={() => { hide('qrFrame.hidden.manual'); }}>
                {t('qrFrame.hide')}
              </button>
            )}
            <button type="button" className="btn" ref={openerRef} onClick={() => { setLargeFor(payloadScope(props)); }}>
              {t('qrFrame.larger')}
            </button>
            {rules.allowCopyText && props.allowExport !== false && <CopyButton text={current} label={t('qrFrame.copy')} />}
            {rules.allowDownload && props.allowExport !== false && (
              <button type="button" className="btn" onClick={download}>
                {t('qrFrame.download')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="qr-body qr-hidden">
          <button type="button" className="btn btn-primary" ref={revealRef} onClick={() => { setRevealedFor(payloadScope(props)); setHiddenNote(undefined); }}>
            {t('qrFrame.reveal')}
          </button>
        </div>
      )}
      <p className="qr-note" role="status">
        {hiddenNote === undefined ? '' : t(hiddenNote)}
      </p>
      {large && visible && (
        <div className="qr-large" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('qrFrame.largeLabel', { kind: info.label })} aria-describedby={largeDescId}>
          <p className="qr-large-label">
            <QrIcon icon={info.icon} /> {info.label}
          </p>
          <p id={largeDescId} className="qr-explain">{info.explanation}</p>
          {image}
          {parts !== null && (
            <p className="qr-part-status">
              {t('qrFrame.part', { part: safeIndex + 1, total })}
            </p>
          )}
          <p className="qr-note">{t('qrFrame.brightness')}</p>
          {parts !== null && (
            <div className="qr-actions">
              <button type="button" className="btn" disabled={safeIndex === 0} onClick={() => { setIndex(safeIndex - 1); }}>
                {t('qrFrame.previous')}
              </button>
              <button type="button" className="btn" disabled={safeIndex === total - 1} onClick={() => { setIndex(safeIndex + 1); }}>
                {t('qrFrame.next')}
              </button>
            </div>
          )}
          <button type="button" className="btn btn-primary" ref={closeRef} onClick={() => { setLargeFor(undefined); }}>
            {t('qrFrame.close')}
          </button>
        </div>
      )}
    </section>
  );
}

// i18n-use: qrFrame.hidden.auto qrFrame.hidden.page qrFrame.hidden.manual
