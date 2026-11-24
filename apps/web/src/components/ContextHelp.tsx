import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface ContextHelpProps {
  /** A localized, context-specific accessible name, for example "About receipt files". */
  readonly label: string;
  /** Plain explanatory text only; interactive content belongs in a disclosure or dialog. */
  readonly children: string;
  /** May also be referenced by a nearby control's aria-describedby. */
  readonly id?: string;
}

/**
 * Help available to mouse, keyboard, touch and assistive-technology users. The explanation stays
 * in the DOM so a control can reference it even while visually collapsed. The in-flow panel never
 * obscures an approval control and wraps at narrow viewports instead of being clipped by a parent.
 */
export function ContextHelp(props: ContextHelpProps): ReactNode {
  const generatedId = useId();
  const id = props.id ?? `${generatedId}-help`;
  const root = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hovered || focused || pinned);
  // A press elsewhere moves focus at mousedown, before the release (for touch, at the compatibility mousedown after
  // pointerup). Collapsing the in-flow explanation on that blur would move the pressed control away, so the release and
  // its click would land elsewhere. While a press is in progress (pointerdown or mousedown until mouseup or
  // pointercancel) the blur only marks the close as pending; it runs in a task queued at mouseup, which the browser runs
  // after that press's click has been dispatched. Any keydown ends a press, so keyboard blur (Tab) still closes at once.
  const pressing = useRef(false);
  const blurPending = useRef(false);

  useEffect(() => {
    if (!open) return;
    const dismiss = (): void => {
      setHovered(false);
      setPinned(false);
      setDismissed(true);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    // Outside dismissal waits for the click: the explanation is in the page flow, so hiding it at pointerdown would move
    // the pressed control away before the release, and that click (or tap) would land elsewhere or nowhere.
    const onOutsideClick = (event: MouseEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    const onPressStart = (): void => { pressing.current = true; };
    const onKeyInput = (): void => { pressing.current = false; };
    const onPressEnd = (): void => {
      pressing.current = false;
      if (!blurPending.current) return;
      setTimeout(() => {
        if (!blurPending.current) return;
        blurPending.current = false;
        setFocused(false);
        setPinned(false);
      }, 0);
    };
    pressing.current = false;
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('pointerdown', onPressStart, true);
    document.addEventListener('mousedown', onPressStart, true);
    document.addEventListener('keydown', onKeyInput, true);
    document.addEventListener('mouseup', onPressEnd, true);
    document.addEventListener('pointercancel', onPressEnd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('pointerdown', onPressStart, true);
      document.removeEventListener('mousedown', onPressStart, true);
      document.removeEventListener('keydown', onKeyInput, true);
      document.removeEventListener('mouseup', onPressEnd, true);
      document.removeEventListener('pointercancel', onPressEnd, true);
    };
  }, [open]);

  return (
    <span
      className="context-help"
      ref={root}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return;
        setHovered(true);
        setDismissed(false);
      }}
      onPointerLeave={() => { setHovered(false); }}
      onFocus={() => { blurPending.current = false; setFocused(true); setDismissed(false); }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        if (pressing.current) {
          blurPending.current = true;
          return;
        }
        setFocused(false);
        setPinned(false);
      }}
    >
      <button
        type="button"
        className="context-help-button"
        aria-label={props.label}
        aria-describedby={id}
        aria-controls={id}
        aria-expanded={open}
        onClick={() => {
          setPinned(!pinned);
          setDismissed(pinned);
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      <span id={id} className="context-help-text" role="tooltip" hidden={!open}>{props.children}</span>
    </span>
  );
}
