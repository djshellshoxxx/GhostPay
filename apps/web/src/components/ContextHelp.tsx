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
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
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
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
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
