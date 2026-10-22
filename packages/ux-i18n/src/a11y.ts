import { I18nError } from './errors.js';
import { sanitizeValue } from './message.js';

const MAX_NAME = 160;

function clean(s: string): string {
  return sanitizeValue(s).replace(/\s+/g, ' ').trim();
}

/** Inputs for {@link buildAccessibleName}. */
export interface AccessibleNameInput {
  readonly label: string;
  /** Current value or state, e.g. "Off", "3 of 5". */
  readonly state?: string;
  /** Extra context, e.g. the row it belongs to. */
  readonly context?: string;
  /** Text to append for hidden-but-meaningful info, e.g. "required". */
  readonly hint?: string;
}

/**
 * Build a concise accessible name: `label, context, state, hint` (empty parts dropped).
 * Controls and bidi marks are stripped; length capped.
 * @security Output is plain text for `aria-label`; set via setAttribute, never innerHTML.
 */
export function buildAccessibleName(input: AccessibleNameInput): string {
  const parts = [input.label, input.context, input.state, input.hint]
    .map((p) => (p === undefined ? '' : clean(p)))
    .filter((p) => p !== '');
  if (parts.length === 0 || clean(input.label) === '') {
    throw new I18nError('bad-input', 'accessible name requires a non-empty label');
  }
  const joined = parts.join(', ');
  return joined.length > MAX_NAME ? `${joined.slice(0, MAX_NAME - 1)}\u2026` : joined;
}

/** Live region politeness. */
export type Politeness = 'polite' | 'assertive';

/** Attributes + text for a live region update. */
export interface LiveRegionMessage {
  readonly role: 'status' | 'alert';
  readonly ariaLive: Politeness;
  readonly ariaAtomic: 'true';
  readonly text: string;
}

/**
 * Build a live-region update. `assertive` -> role=alert (errors only), `polite` -> role=status.
 * If `previous` text is identical, a trailing non-breaking space is toggled so screen readers
 * re-announce a repeated message (the DOM text must change).
 * @security Plain text only.
 */
export function buildLiveRegionMessage(
  message: string,
  politeness: Politeness = 'polite',
  previous?: string,
): LiveRegionMessage {
  let text = clean(message);
  if (text === '') throw new I18nError('bad-input', 'live message must be non-empty');
  if (previous !== undefined && previous === text) text = `${text}\u00a0`;
  return {
    role: politeness === 'assertive' ? 'alert' : 'status',
    ariaLive: politeness,
    ariaAtomic: 'true',
    text,
  };
}

/** Parse `#rgb` or `#rrggbb` to 0-255 channels, or undefined. Alpha is unsupported on purpose. */
export function parseHexColor(hex: string): readonly [number, number, number] | undefined {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (m === null) return undefined;
  let h = m[1] ?? '';
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG 2.x relative luminance for a hex color. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (rgb === undefined) throw new I18nError('bad-input', 'color must be #rgb or #rrggbb');
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

/** WCAG contrast ratio between two opaque hex colors, 1..21 (unrounded). */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Kind of content being rated. */
export type ContrastTarget = 'text' | 'large-text' | 'ui-component';

/** WCAG conformance result. */
export interface ContrastRating {
  readonly ratio: number;
  readonly level: 'AAA' | 'AA' | 'fail';
}

/**
 * Rate a pair per WCAG 2.1: text AA 4.5 / AAA 7; large text AA 3 / AAA 4.5; UI components AA 3
 * (no AAA tier; reported as AA). Ratio is NOT rounded up before comparing.
 */
export function rateContrast(fg: string, bg: string, target: ContrastTarget = 'text'): ContrastRating {
  const ratio = contrastRatio(fg, bg);
  const [aa, aaa] = target === 'text' ? [4.5, 7] : target === 'large-text' ? [3, 4.5] : [3, Infinity];
  return { ratio, level: ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : 'fail' };
}

/** Severity of a validator finding. */
export type A11ySeverity = 'error' | 'warning';

/** A validator finding. */
export interface A11yFinding {
  readonly code: string;
  readonly severity: A11ySeverity;
  readonly id: string;
  readonly message: string;
}

/** Focusable element description, in DOM order. */
export interface FocusItem {
  readonly id: string;
  /** Effective tabindex; undefined = natural. */
  readonly tabIndex?: number;
  readonly hidden?: boolean;
  readonly disabled?: boolean;
  /** Layout position in px (top-left origin) for visual-order checking. */
  readonly rect?: { readonly x: number; readonly y: number };
}

/**
 * Validate a DOM-ordered list of focusable items.
 * Findings: duplicate-id, positive-tabindex (warning), hidden-focusable, disabled-focusable,
 * visual-order-mismatch (warning; rows tolerance 8px; `rtl` flips horizontal order).
 */
export function validateFocusOrder(
  items: readonly FocusItem[],
  opts: { readonly rtl?: boolean } = {},
): A11yFinding[] {
  const out: A11yFinding[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) {
      out.push({ code: 'duplicate-id', severity: 'error', id: it.id, message: 'duplicate id in focus list' });
    }
    seen.add(it.id);
    if (it.tabIndex !== undefined && it.tabIndex > 0) {
      out.push({
        code: 'positive-tabindex',
        severity: 'warning',
        id: it.id,
        message: 'tabindex > 0 overrides natural order',
      });
    }
    if (it.hidden === true && (it.tabIndex === undefined || it.tabIndex >= 0)) {
      out.push({
        code: 'hidden-focusable',
        severity: 'error',
        id: it.id,
        message: 'hidden element is reachable by keyboard',
      });
    }
    if (it.disabled === true && it.tabIndex !== undefined && it.tabIndex >= 0) {
      out.push({
        code: 'disabled-focusable',
        severity: 'warning',
        id: it.id,
        message: 'disabled element has non-negative tabindex',
      });
    }
  }
  const reachable = items.filter(
    (i) =>
      i.rect !== undefined &&
      i.hidden !== true &&
      i.disabled !== true &&
      (i.tabIndex === undefined || i.tabIndex >= 0),
  );
  for (let k = 1; k < reachable.length; k++) {
    const p = reachable[k - 1];
    const c = reachable[k];
    if (p?.rect === undefined || c?.rect === undefined) continue;
    const sameRow = Math.abs(p.rect.y - c.rect.y) <= 8;
    const backwards = sameRow
      ? opts.rtl === true
        ? c.rect.x > p.rect.x
        : c.rect.x < p.rect.x
      : c.rect.y < p.rect.y;
    if (backwards) {
      out.push({
        code: 'visual-order-mismatch',
        severity: 'warning',
        id: c.id,
        message: 'focus moves backwards visually',
      });
    }
  }
  return out;
}

const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'switch',
  'combobox',
  'listbox',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'option',
  'searchbox',
]);
const KNOWN_ROLES: ReadonlySet<string> = new Set([
  ...INTERACTIVE_ROLES,
  'dialog',
  'alertdialog',
  'alert',
  'status',
  'img',
  'heading',
  'list',
  'listitem',
  'navigation',
  'main',
  'region',
  'group',
  'tablist',
  'tabpanel',
  'menu',
  'progressbar',
  'tooltip',
  'table',
  'row',
  'cell',
  'columnheader',
  'none',
  'presentation',
  'form',
  'search',
]);

/** Element description for ARIA validation. */
export interface AriaNode {
  readonly id: string;
  readonly role: string;
  readonly name?: string;
  readonly labelledBy?: readonly string[];
  readonly describedBy?: readonly string[];
  readonly focusable?: boolean;
  readonly ariaHidden?: boolean;
  /** Visible text content, to detect labels that do not contain it (WCAG 2.5.3). */
  readonly visibleText?: string;
}

/**
 * Validate ARIA labelling over plain data. Findings: duplicate-id, unknown-role,
 * missing-name (interactive/dialog/img), dangling-labelledby, dangling-describedby,
 * hidden-focusable, name-too-long (warning), label-in-name (warning).
 */
export function validateAriaLabels(nodes: readonly AriaNode[]): A11yFinding[] {
  const out: A11yFinding[] = [];
  const ids = new Set<string>();
  const byId = new Map<string, AriaNode>();
  for (const n of nodes) {
    if (ids.has(n.id))
      out.push({ code: 'duplicate-id', severity: 'error', id: n.id, message: 'duplicate id' });
    ids.add(n.id);
    byId.set(n.id, n);
  }
  const textOf = (n: AriaNode): string => clean(n.name ?? n.visibleText ?? '');
  for (const n of nodes) {
    if (!KNOWN_ROLES.has(n.role)) {
      out.push({
        code: 'unknown-role',
        severity: 'error',
        id: n.id,
        message: `unknown role ${n.role.slice(0, 30)}`,
      });
    }
    const referenced = (n.labelledBy ?? []).map((r) => {
      const t = byId.get(r);
      if (t === undefined) {
        out.push({
          code: 'dangling-labelledby',
          severity: 'error',
          id: n.id,
          message: 'aria-labelledby target missing',
        });
      }
      return t === undefined ? '' : textOf(t);
    });
    for (const r of n.describedBy ?? []) {
      if (!byId.has(r)) {
        out.push({
          code: 'dangling-describedby',
          severity: 'error',
          id: n.id,
          message: 'aria-describedby target missing',
        });
      }
    }
    const name = clean(n.name ?? '') || clean(referenced.join(' '));
    const needsName =
      INTERACTIVE_ROLES.has(n.role) || n.role === 'dialog' || n.role === 'alertdialog' || n.role === 'img';
    if (needsName && name === '' && n.ariaHidden !== true) {
      out.push({ code: 'missing-name', severity: 'error', id: n.id, message: 'no accessible name' });
    }
    if (name.length > MAX_NAME) {
      out.push({
        code: 'name-too-long',
        severity: 'warning',
        id: n.id,
        message: 'accessible name is very long',
      });
    }
    if (n.ariaHidden === true && n.focusable === true) {
      out.push({
        code: 'hidden-focusable',
        severity: 'error',
        id: n.id,
        message: 'aria-hidden element is focusable',
      });
    }
    const vt = clean(n.visibleText ?? '').toLowerCase();
    if (vt !== '' && name !== '' && INTERACTIVE_ROLES.has(n.role) && !name.toLowerCase().includes(vt)) {
      out.push({
        code: 'label-in-name',
        severity: 'warning',
        id: n.id,
        message: 'accessible name does not contain visible text',
      });
    }
  }
  return out;
}
