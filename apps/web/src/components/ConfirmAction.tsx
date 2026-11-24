import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { usePrivacy } from '../lib/privacyMode';
import { focusPrivacyControl, useBoundaryHidden } from './SensitiveContent';

interface ConfirmProps {
  readonly children: ReactNode;
  readonly message: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onConfirm: () => void;
}

/** A native confirmation pauses page timers. Keep the privacy deadline running during a review. */
export function ConfirmAction(props: ConfirmProps): ReactNode {
  const privacy = usePrivacy();
  const hidden = useBoundaryHidden();
  if (privacy.enabled && !privacy.masked && !hidden && !props.disabled) return <InlineConfirmation {...props} />;
  return <button type="button" className={props.className} disabled={props.disabled} onClick={() => {
    if (!hidden && !privacy.enabled && window.confirm(props.message)) props.onConfirm();
  }}>{props.children}</button>;
}

function InlineConfirmation(props: ConfirmProps): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [pending, setPending] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const label = useId();
  useLayoutEffect(() => { if (pending) cancel.current?.focus(); }, [pending]);
  useLayoutEffect(() => () => {
    if (group.current?.contains(document.activeElement) || trigger.current === document.activeElement) focusPrivacyControl();
  }, []);
  const dismiss = (): void => { setPending(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className={props.className} aria-expanded={pending}
      onClick={() => { setPending(!pending); }}>{props.children}</button>
    {pending && <div ref={group} role="group" aria-labelledby={label} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    }}>
      <p id={label}>{props.message}</p>
      <button ref={cancel} type="button" className="btn" onClick={dismiss}>{t('pay.cancel')}</button>
      <button type="button" className={props.className} onClick={() => { dismiss(); props.onConfirm(); }}>{props.children}</button>
    </div>}
  </>;
}
