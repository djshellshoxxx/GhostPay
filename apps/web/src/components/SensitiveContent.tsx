import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePrivacy } from '../lib/privacyMode';

/** A visible neutral control remains outside every privacy boundary, including Settings. */
export function focusPrivacyControl(): void {
  document.querySelector<HTMLElement>('[data-privacy-safe-control]')?.focus();
}

/**
 * Preserve mounted workflows and their sole-copy recovery state. Native hidden removes the subtree from display
 * and accessibility; inert also disarms interaction. This is visual privacy, not erasure of DOM or JS memory.
 */
export function PrivacyBoundary(props: { readonly hidden: boolean; readonly children: ReactNode }): ReactNode {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!props.hidden || element.current === null) return;
    const hadFocus = element.current.contains(document.activeElement);
    for (const field of element.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
      try { field.setSelectionRange(0, 0); } catch { /* Non-text input types do not support selection. */ }
    }
    if (hadFocus) focusPrivacyControl();
    // Moving focus or collapsing a form selection may itself replace the document selection.
    document.getSelection()?.removeAllRanges();
  }, [props.hidden]);
  return <div ref={element} hidden={props.hidden} inert={props.hidden} aria-hidden={props.hidden ? true : undefined}>{props.children}</div>;
}

export function SensitiveContent(props: { readonly active?: boolean; readonly children: ReactNode }): ReactNode {
  const { masked } = usePrivacy();
  return <PrivacyBoundary hidden={props.active !== false && masked}>{props.children}</PrivacyBoundary>;
}
