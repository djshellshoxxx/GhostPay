import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePrivacy } from '../lib/privacyMode';

/** A visible neutral control remains outside every privacy boundary, including Settings. */
export function focusPrivacyControl(): void {
  document.querySelector<HTMLElement>('[data-privacy-safe-control]')?.focus();
}

/**
 * Keep one React portal mounted so a visual mask preserves drafts, pending work and
 * sole-copy keys. Its host belongs to the live document only while display is allowed.
 */
export function PrivacyBoundary({ hidden, children }: { readonly hidden: boolean; readonly children: ReactNode }): ReactNode {
  const [host] = useState(() => document.createElement('div'));
  const placeHost = useCallback((slot: HTMLDivElement | null): void => {
    if (slot === null) return;
    if (!hidden) {
      host.hidden = false;
      host.inert = false;
      if (host.parentNode !== slot) slot.append(host);
      return;
    }
    const hadFocus = host.contains(document.activeElement);
    for (const field of host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
      try { field.setSelectionRange(0, 0); } catch { /* Non-text input types do not support selection. */ }
    }
    if (hadFocus) focusPrivacyControl();
    document.getSelection()?.removeAllRanges();
    host.hidden = true;
    host.inert = true;
    host.remove();
  }, [hidden, host]);
  return <><div ref={placeHost} />{createPortal(children, host)}</>;
}

export function SensitiveContent(props: { readonly active?: boolean; readonly children: ReactNode }): ReactNode {
  const { masked } = usePrivacy();
  return <PrivacyBoundary hidden={props.active !== false && masked}>{props.children}</PrivacyBoundary>;
}
