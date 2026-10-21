import { useId, useState, type ReactNode } from 'react';

export function Notice(props: { readonly kind: 'info' | 'warn' | 'error' | 'ok'; readonly title?: string; readonly children: ReactNode }): ReactNode {
  const label = { info: 'Note', warn: 'Warning', error: 'Problem', ok: 'Done' }[props.kind];
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
  readonly children: (id: string, describedBy: string | undefined) => ReactNode;
}): ReactNode {
  const id = useId();
  const hintId = props.hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.children(id, hintId)}
      {props.hint !== undefined && (
        <p className="hint" id={hintId}>
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function CopyButton(props: { readonly text: string; readonly label: string }): ReactNode {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="btn"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(props.text);
            setState('copied');
          } catch {
            setState('failed');
          }
        })();
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: select the text manually' : props.label}
    </button>
  );
}

export function Mono(props: { readonly children: ReactNode }): ReactNode {
  return <code className="mono">{props.children}</code>;
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
