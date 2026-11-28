import { cloneElement, createContext, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

const InlineTips = createContext(false);

/** Catalog keys only: never take tooltip text from a field value, wallet label, QR payload or transaction. */
export function ControlTip({ message, children }: {
  readonly message: MessageKey;
  readonly children: ReactElement<{
    'aria-description'?: string;
    'data-control-tip'?: string;
    hidden?: boolean;
    children?: ReactNode;
  }>;
}): ReactNode {
  const inline = useContext(InlineTips);
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const text = t(message);
  const target = cloneElement(children, { 'aria-description': text, 'data-control-tip': '' });
  if (!inline || children.props.hidden) return target;
  // Inline notes are redundant for assistive technology. Keep them out of enclosing labels' names.
  const note = <span aria-hidden="true" className="control-tip-inline" onClick={(event) => {
    // Notes can be inside a label or summary. Reading or selecting the note must not activate it.
    event.preventDefault();
  }}>{text}</span>;
  // A closed details element only renders its summary.
  return children.type === 'summary'
    ? cloneElement(target, {}, children.props.children, note)
    : <>{target}{note}</>;
}

function tipTarget(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) return null;
  if (node.closest('.context-help')) return null;
  const label = node.closest('label');
  if (label?.control?.hasAttribute('data-control-tip')) return label.control;
  return node.closest('[data-control-tip]');
}

/** The bubble lives alongside the shell; events also reach controls rendered through React portals. */
function HoverTips(): ReactNode {
  const bubble = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = bubble.current;
    if (tip === null) return;
    let hovered: Element | null = null;
    let focused: Element | null = null;
    let owner: Element | null = null;
    let touch = false;
    let pointerPressed = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const cancelPending = (): void => { clearTimeout(pending); pending = undefined; };
    const hide = (): void => {
      owner = null;
      updates.disconnect();
      tip.hidden = true;
      if (tip.textContent) tip.textContent = '';
    };
    const show = (control: Element | null): void => {
      const text = control?.getAttribute('aria-description');
      if (!control?.isConnected || !text || control.closest('[inert], [hidden]') || control.getClientRects().length === 0) { hide(); return; }
      if (owner === null) updates.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-description', 'hidden', 'open', 'inert'] });
      owner = control;
      if (tip.textContent !== text) tip.textContent = text;
      tip.hidden = false;
      const anchor = control.getBoundingClientRect();
      const { width, height } = tip.getBoundingClientRect();
      const margin = 6;
      const viewport = document.documentElement;
      if (anchor.bottom <= 0 || anchor.top >= viewport.clientHeight) { hide(); return; }
      const below = viewport.clientHeight - anchor.bottom;
      const top = below >= height + margin || below >= anchor.top ? anchor.bottom : anchor.top - height;
      tip.style.left = `${Math.max(margin, Math.min(anchor.left, viewport.clientWidth - width - margin))}px`;
      tip.style.top = `${Math.max(margin, Math.min(top, viewport.clientHeight - height - margin))}px`;
    };
    const reset = (): void => { cancelPending(); hovered = null; focused = null; hide(); };
    const press = (event: PointerEvent): void => { touch = event.pointerType === 'touch'; pointerPressed = true; reset(); };
    const release = (): void => { pointerPressed = false; };
    const reposition = (): void => { if (owner !== null) show(owner); };
    const pointer = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return;
      const next = event.type === 'pointerout' ? event.relatedTarget : event.target;
      if (next instanceof Node && tip.contains(next)) return;
      if (next instanceof Element && next.closest('.context-help')) { reset(); return; }
      const target = tipTarget(next);
      if (target === hovered) return;
      cancelPending();
      hovered = target;
      if (target === null) { show(focused); return; }
      // During pointer travel a brief crossing must not obscure the next control.
      if (owner !== focused) hide();
      pending = setTimeout(() => { pending = undefined; show(hovered ?? focused); }, 300);
    };
    const focus = (event: FocusEvent): void => {
      cancelPending();
      const next = event.type === 'focusout' ? event.relatedTarget : event.target;
      if (next instanceof Element && next.closest('.context-help')) { reset(); return; }
      focused = touch || pointerPressed ? null : tipTarget(next);
      show(focused ?? hovered);
    };
    const key = (event: KeyboardEvent): void => {
      touch = false;
      pointerPressed = false;
      if (event.key === 'Escape' && (owner !== null || pending !== undefined)) {
        reset();
        // A passive tip must also let the same Escape cancel a dialog or close a disclosure.
      }
    };
    // A route, language, dialog, privacy mask or async state can change with the pointer stationary.
    const updates = new MutationObserver(() => {
      if (owner === null) return;
      if (!owner.isConnected || owner.closest('[hidden], [inert]') !== null || !owner.getClientRects().length) reset();
      else if (owner.getAttribute('aria-description') !== tip.textContent) show(owner);
    });
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('pointerover', pointer, true);
    document.addEventListener('pointerout', pointer, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('focusout', focus, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('blur', reset);
    return () => {
      cancelPending();
      updates.disconnect();
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      document.removeEventListener('pointerover', pointer, true);
      document.removeEventListener('pointerout', pointer, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('focusout', focus, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return <div ref={bubble} className="control-tip-bubble" role="tooltip" aria-hidden="true" hidden />;
}

const ToggleTips = createContext<() => void>(() => undefined);
export function ControlTipsProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [inline, setInline] = useState(false);
  return <InlineTips.Provider value={inline}>
    <ToggleTips.Provider value={() => { setInline((current) => !current); }}>
      {children}
      {!inline && <HoverTips />}
    </ToggleTips.Provider>
  </InlineTips.Provider>;
}

export function ControlTipsSwitch(): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const inline = useContext(InlineTips);
  const toggle = useContext(ToggleTips);
  const id = useId();
  return <div className="control-tips-switch">
    <ControlTip message="tips.toggleHint"><input type="checkbox" id={id} checked={inline} onChange={toggle} /></ControlTip>
    <label htmlFor={id}>{t('tips.toggle')}</label>
  </div>;
}
