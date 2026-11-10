import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { sanitizeDisplayText } from '../lib/sanitize';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { ContextHelp } from './ContextHelp';

// i18n-use: common.notice.info common.notice.warn common.notice.error common.notice.ok
export function Notice(props: { readonly kind: 'info' | 'warn' | 'error' | 'ok'; readonly title?: string; readonly children: ReactNode }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const label = t(`common.notice.${props.kind}`);
  return (
    <div className={`notice notice-${props.kind}`} role={props.kind === 'error' ? 'alert' : 'note'}>
      <strong className="notice-title">
        <span aria-hidden="true">{{ info: 'ℹ', warn: '⚠', error: '✖', ok: '✔' }[props.kind]} </span>
        {props.title ?? label}
        <span className="sr-only">:</span>
      </strong>
      <div>{props.children}</div>
    </div>
  );
}

export function Field(props: {
  readonly label: string;
  readonly hint?: string;
  readonly help?: { readonly label: string; readonly text: string };
  readonly children: (id: string, describedBy: string | undefined) => ReactNode;
}): ReactNode {
  const id = useId();
  const hintId = props.hint === undefined ? undefined : `${id}-hint`;
  const helpId = props.help === undefined ? undefined : `${id}-help`;
  const describedBy = [hintId, helpId].filter((value) => value !== undefined).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.children(id, describedBy)}
      {props.help !== undefined && <ContextHelp id={`${id}-help`} label={props.help.label}>{props.help.text}</ContextHelp>}
      {props.hint !== undefined && (
        <p className="hint" id={hintId}>
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function CopyButton(props: { readonly text: string; readonly label: string }): ReactNode {
  const [result, setResult] = useState<{ readonly text: string; readonly state: 'copied' | 'failed' } | undefined>();
  const attempt = useRef(0);
  const currentText = useRef(props.text);
  currentText.current = props.text;
  const state = result?.text === props.text ? result.state : 'idle';
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  useEffect(() => {
    setResult(undefined);
    return () => { attempt.current += 1; };
  }, [props.text]);
  return (
    <button
      type="button"
      className="btn"
      onClick={() => {
        const text = props.text;
        const request = ++attempt.current;
        const finish = (state: 'copied' | 'failed'): void => {
          if (request === attempt.current && currentText.current === text) setResult({ text, state });
        };
        void (async () => {
          try {
            await navigator.clipboard.writeText(text);
            finish('copied');
          } catch {
            finish('failed');
          }
        })();
      }}
    >
      {state === 'copied' ? t('common.copy.copied') : state === 'failed' ? t('common.copy.failed') : props.label}
    </button>
  );
}

export function Mono(props: { readonly children: ReactNode }): ReactNode {
  return <code className="mono" dir="ltr">{props.children}</code>;
}

/** Triggers a local file download of text content (Blob URL, no network). */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Renders untrusted text with bidi, zero-width and tag characters made visible (S3-12). `notice` adds an inline explanation
 * once, next to the first use, so the reader knows why markers appear.
 */
export function SafeText(props: { readonly value: string; readonly notice?: boolean }): ReactNode {
  const s = sanitizeDisplayText(props.value);
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <>
      <span className="isolate">{s.text}</span>
      {props.notice !== false && (s.replaced > 0 || s.mixedScript) && (
        <span className="hint">
          {' '}
          {s.replaced > 0 && <>{t('common.safeText.hidden', { count: s.replaced })}{' '}</>}
          {s.mixedScript && t('common.safeText.mixed')}
        </span>
      )}
    </>
  );
}
