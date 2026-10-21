/**
 * Keyboard shortcut / command-palette registry: shortcut normalisation, conflict detection, fuzzy
 * ranking, chord parsing with timeout, typing-target detection and accessibility labels.
 *
 * @security Commands are inert data (`navigate` / `open-*` actions), never functions. Destructive
 * commands cannot be registered at all, so nothing in the palette can bypass a confirmation screen
 * (KBDPA-3). Single-key shortcuts never fire in form fields or while a modal is open (KBDPA-1).
 * Nothing about command usage is recorded.
 */

export type CommandAction =
  | { readonly type: 'navigate'; readonly view: string }
  | { readonly type: 'open-palette' }
  | { readonly type: 'open-shortcuts' };

export interface Command {
  /** Lowercase id, `[a-z][a-z0-9.-]{1,39}`. */
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  /** Normalised later: "mod+k", "g h", "?". */
  readonly shortcut?: string;
  readonly action: CommandAction;
  /** Must be false/absent; destructive commands are refused by the registry. */
  readonly destructive?: boolean;
}

export type PaletteErrorCode =
  | 'INVALID_COMMAND'
  | 'DESTRUCTIVE_FORBIDDEN'
  | 'DUPLICATE_ID'
  | 'INVALID_SHORTCUT'
  | 'RESERVED_SHORTCUT'
  | 'SHORTCUT_CONFLICT';

export class PaletteError extends Error {
  public readonly code: PaletteErrorCode;
  public constructor(code: PaletteErrorCode) {
    super(code);
    this.name = 'PaletteError';
    this.code = code;
  }
}

const ID_RE = /^[a-z][a-z0-9.-]{1,39}$/;
/** Browser/OS shortcuts a page must not take over. */
const RESERVED = new Set([
  'mod+t',
  'mod+w',
  'mod+n',
  'mod+r',
  'mod+l',
  'mod+q',
  'mod+p',
  'mod+s',
  'mod+f',
  'mod+shift+t',
  'mod+shift+n',
  'alt+f4',
  'f5',
  'f11',
  'f12',
]);
const MODS = ['mod', 'alt', 'shift'] as const;

/**
 * Normalises a shortcut: lower-case, modifier order `mod+alt+shift+key`, chords as "g h".
 * Valid forms: a single key, "mod+k", or a two-key chord of plain letters/digits ("g h").
 * Returns undefined when invalid.
 */
export function normalizeShortcut(s: string): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t.length === 0 || t.length > 24) return undefined;
  const parts = t.split(' ');
  if (parts.length > 2) return undefined;
  const norm: string[] = [];
  for (const p of parts) {
    const toks = p.split('+');
    const key = toks[toks.length - 1] ?? '';
    const mods = toks.slice(0, -1);
    if (!/^([a-z0-9?/,.;'[\]\-=]|f([1-9]|1[0-2])|escape|enter|tab)$/.test(key)) return undefined;
    if (new Set(mods).size !== mods.length || !mods.every((m) => (MODS as readonly string[]).includes(m)))
      return undefined;
    norm.push([...MODS.filter((m) => mods.includes(m)), key].join('+'));
  }
  if (norm.length === 2 && !norm.every((n) => /^[a-z0-9]$/.test(n))) return undefined; // chords: plain keys only
  return norm.join(' ');
}

export interface Conflict {
  readonly kind: 'duplicate-id' | 'same-shortcut' | 'prefix';
  readonly a: string;
  readonly b: string;
}

/** Pairwise conflicts: duplicate ids, identical shortcuts, or a single key that is the first key of a chord. */
export function detectConflicts(commands: readonly Command[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < commands.length; i++) {
    for (let j = i + 1; j < commands.length; j++) {
      const a = commands[i] as Command;
      const b = commands[j] as Command;
      if (a.id === b.id) out.push({ kind: 'duplicate-id', a: a.id, b: b.id });
      const sa = a.shortcut === undefined ? undefined : normalizeShortcut(a.shortcut);
      const sb = b.shortcut === undefined ? undefined : normalizeShortcut(b.shortcut);
      if (sa === undefined || sb === undefined) continue;
      if (sa === sb) out.push({ kind: 'same-shortcut', a: a.id, b: b.id });
      else if (sa.startsWith(sb + ' ') || sb.startsWith(sa + ' '))
        out.push({ kind: 'prefix', a: a.id, b: b.id });
    }
  }
  return out;
}

function hasUnsafeChar(t: string): boolean {
  for (const ch of t) {
    const n = ch.codePointAt(0) ?? 0;
    if (n < 32 || n === 127 || ch === '<' || ch === '>') return true;
  }
  return false;
}

function validate(c: Command): string | undefined {
  if (typeof c !== 'object' || c === null || typeof c.id !== 'string' || !ID_RE.test(c.id))
    throw new PaletteError('INVALID_COMMAND');
  if (c.destructive === true) throw new PaletteError('DESTRUCTIVE_FORBIDDEN');
  if (
    typeof c.title !== 'string' ||
    c.title.trim().length === 0 ||
    c.title.length > 60 ||
    hasUnsafeChar(c.title)
  )
    throw new PaletteError('INVALID_COMMAND');
  if (
    !Array.isArray(c.keywords) ||
    c.keywords.length > 12 ||
    c.keywords.some((k) => typeof k !== 'string' || k.length === 0 || k.length > 30)
  )
    throw new PaletteError('INVALID_COMMAND');
  const a = c.action as { type?: unknown; view?: unknown } | undefined;
  if (a === undefined || (a.type !== 'navigate' && a.type !== 'open-palette' && a.type !== 'open-shortcuts'))
    throw new PaletteError('INVALID_COMMAND');
  if (a.type === 'navigate' && (typeof a.view !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(a.view)))
    throw new PaletteError('INVALID_COMMAND');
  if (c.shortcut === undefined) return undefined;
  const n = normalizeShortcut(c.shortcut);
  if (n === undefined) throw new PaletteError('INVALID_SHORTCUT');
  if (RESERVED.has(n)) throw new PaletteError('RESERVED_SHORTCUT');
  return n;
}

export interface Registry {
  register(c: Command): void;
  list(): readonly Command[];
  byId(id: string): Command | undefined;
  /** Resolves a normalised shortcut to a command id. */
  bySequence(seq: string): string | undefined;
  /** True when some chord starts with this first key. */
  isChordPrefix(key: string): boolean;
}

/** Creates a registry that refuses invalid, destructive, reserved and conflicting commands. */
export function createRegistry(initial: readonly Command[] = []): Registry {
  const cmds: Command[] = [];
  const reg: Registry = {
    register(c) {
      const n = validate(c);
      if (cmds.some((x) => x.id === c.id)) throw new PaletteError('DUPLICATE_ID');
      if (n !== undefined && detectConflicts([...cmds, c]).some((k) => k.kind !== 'duplicate-id'))
        throw new PaletteError('SHORTCUT_CONFLICT');
      cmds.push(Object.freeze({ ...c, keywords: Object.freeze([...c.keywords]) }));
    },
    list: () => cmds.slice(),
    byId: (id) => cmds.find((c) => c.id === id),
    bySequence: (seq) =>
      cmds.find((c) => c.shortcut !== undefined && normalizeShortcut(c.shortcut) === seq)?.id,
    isChordPrefix: (key) =>
      cmds.some(
        (c) => c.shortcut !== undefined && (normalizeShortcut(c.shortcut) ?? '').startsWith(key + ' '),
      ),
  };
  for (const c of initial) reg.register(c);
  return reg;
}

/**
 * Built-in commands: navigation only. Go-to chords: g h home, g s seller, g c create, g p pay,
 * g n scan, g w sweep, g t settings, g a about.
 */
export const COMMANDS: readonly Command[] = Object.freeze([
  {
    id: 'palette.open',
    title: 'Open command palette',
    keywords: ['search', 'commands'],
    shortcut: 'mod+k',
    action: { type: 'open-palette' },
  },
  {
    id: 'help.shortcuts',
    title: 'Show keyboard shortcuts',
    keywords: ['help', 'keys'],
    shortcut: '?',
    action: { type: 'open-shortcuts' },
  },
  {
    id: 'go.home',
    title: 'Go to Home',
    keywords: ['start', 'dashboard'],
    shortcut: 'g h',
    action: { type: 'navigate', view: 'home' },
  },
  {
    id: 'go.seller',
    title: 'Go to Seller keys',
    keywords: ['receive', 'meta-address', 'keys'],
    shortcut: 'g s',
    action: { type: 'navigate', view: 'seller' },
  },
  {
    id: 'go.create',
    title: 'Go to Create invoice',
    keywords: ['request', 'bill', 'new'],
    shortcut: 'g c',
    action: { type: 'navigate', view: 'create' },
  },
  {
    id: 'go.pay',
    title: 'Go to Pay',
    keywords: ['send', 'invoice', 'checkout'],
    shortcut: 'g p',
    action: { type: 'navigate', view: 'pay' },
  },
  {
    id: 'go.scan',
    title: 'Go to Scan',
    keywords: ['payments', 'received', 'find'],
    shortcut: 'g n',
    action: { type: 'navigate', view: 'scan' },
  },
  {
    id: 'go.sweep',
    title: 'Go to Sweep',
    keywords: ['withdraw', 'collect', 'move funds'],
    shortcut: 'g w',
    action: { type: 'navigate', view: 'sweep' },
  },
  {
    id: 'go.settings',
    title: 'Go to Settings',
    keywords: ['rpc', 'relayer', 'theme', 'preferences'],
    shortcut: 'g t',
    action: { type: 'navigate', view: 'settings' },
  },
  {
    id: 'go.about',
    title: 'Go to About',
    keywords: ['version', 'privacy', 'release'],
    shortcut: 'g a',
    action: { type: 'navigate', view: 'about' },
  },
]);

/** The default registry (throws at import time if the built-ins ever conflict; covered by tests). */
export function defaultRegistry(): Registry {
  return createRegistry(COMMANDS);
}

// ---------------------------------------------------------------------------------------------
// Fuzzy matching

const MAX_QUERY = 64;

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Subsequence match of `q` in `text` (both already folded). Returns score and matched indices, or
 * undefined. Higher is better: consecutive runs, word starts and an early first hit score more.
 */
function subsequence(q: string, text: string): { score: number; indices: number[] } | undefined {
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const at = text.indexOf(ch, ti);
    if (at < 0) return undefined;
    const wordStart = at === 0 || /[^a-z0-9]/.test(text[at - 1] as string);
    run = at === ti && indices.length > 0 ? run + 1 : 0;
    score += 1 + run * 2 + (wordStart ? 3 : 0);
    indices.push(at);
    ti = at + 1;
  }
  score += text.startsWith(q) ? 20 : 0;
  score += text.includes(q) ? 10 : 0;
  score -= Math.min(5, indices[0] ?? 0);
  score -= Math.floor((text.length - q.length) / 10);
  return { score, indices };
}

export interface RankedCommand {
  readonly command: Command;
  readonly score: number;
  /** Matched character indices in `command.title` for highlighting (empty if matched via keyword). */
  readonly titleMatch: readonly number[];
}

/**
 * Ranks commands for a query. Empty query returns all in original order. Titles outrank keywords.
 * Ties keep registration order, so output is deterministic.
 * @security Query is length-capped and only used as data; never evaluated or put in a RegExp.
 */
export function rankDetailed(commands: readonly Command[], query: string): RankedCommand[] {
  const q = fold(typeof query === 'string' ? query : '')
    .replace(/\s+/g, ' ')
    .trim();
  if (q.length === 0) return commands.map((command) => ({ command, score: 0, titleMatch: [] }));
  if (q.length > MAX_QUERY) return [];
  const out: (RankedCommand & { order: number })[] = [];
  commands.forEach((command, order) => {
    const t = subsequence(q, fold(command.title));
    let best: { score: number; titleMatch: number[] } | undefined =
      t === undefined ? undefined : { score: t.score + 10, titleMatch: t.indices };
    for (const k of command.keywords) {
      const m = subsequence(q, fold(k));
      if (m !== undefined && (best === undefined || m.score > best.score))
        best = { score: m.score, titleMatch: [] };
    }
    if (best !== undefined) out.push({ command, score: best.score, titleMatch: best.titleMatch, order });
  });
  out.sort((a, b) => b.score - a.score || a.order - b.order);
  return out.map(({ command, score, titleMatch }) => ({ command, score, titleMatch }));
}

/** Convenience: `rankDetailed(...).map(r => r.command)`. */
export function rank(commands: readonly Command[], query: string): Command[] {
  return rankDetailed(commands, query).map((r) => r.command);
}

// ---------------------------------------------------------------------------------------------
// Chords

export const CHORD_TIMEOUT_MS = 1000;

export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
}

export interface ChordContext {
  /** Result of `isTypingTarget(event.target)`. */
  readonly typing: boolean;
  /** Any modal/dialog (including the palette itself) is open. */
  readonly modalOpen: boolean;
}

export interface ChordState {
  readonly pending: string | undefined;
  readonly startedAtMs: number;
}

export type ChordResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending'; readonly prefix: string }
  | { readonly kind: 'command'; readonly commandId: string }
  /** Chord started but did not match or timed out; the UI may ignore it. */
  | { readonly kind: 'cancelled' };

export const INITIAL_CHORD: ChordState = Object.freeze({ pending: undefined, startedAtMs: 0 });

/**
 * Pure chord step. `mod+k` (and any registered modifier shortcut) is allowed while typing but not
 * with other modifiers on single keys; plain-key shortcuts and chords are suppressed while typing,
 * in modals, during IME composition and on key repeat. A chord expires after 1000 ms.
 */
export function parseChord(
  registry: Registry,
  state: ChordState,
  ev: KeyEventLike,
  nowMs: number,
  ctx: ChordContext,
): { state: ChordState; result: ChordResult } {
  const none = { state: INITIAL_CHORD, result: { kind: 'none' } as ChordResult };
  if (ev.isComposing === true || ev.repeat === true || typeof ev.key !== 'string' || ev.key.length === 0)
    return { state, result: { kind: 'none' } };
  if (ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta')
    return { state, result: { kind: 'none' } };
  const expired = state.pending !== undefined && nowMs - state.startedAtMs > CHORD_TIMEOUT_MS;
  const wasPending = state.pending !== undefined && !expired;
  const key = ev.key.toLowerCase();
  const modified = ev.ctrlKey === true || ev.metaKey === true;

  if (modified) {
    const seq = ['mod', ev.altKey === true ? 'alt' : '', ev.shiftKey === true ? 'shift' : '', key]
      .filter((x) => x !== '')
      .join('+');
    const id = registry.bySequence(seq);
    if (id !== undefined && ev.ctrlKey !== ev.metaKey)
      return { state: INITIAL_CHORD, result: { kind: 'command', commandId: id } };
    return none;
  }
  if (ev.altKey === true) return none;
  if (ctx.typing || ctx.modalOpen) return none;

  if (wasPending) {
    const seq = `${state.pending} ${key}`;
    const id = registry.bySequence(seq);
    if (id !== undefined) return { state: INITIAL_CHORD, result: { kind: 'command', commandId: id } };
    return { state: INITIAL_CHORD, result: { kind: 'cancelled' } };
  }
  const seq = key; // shifted symbols like "?" arrive as key "?" already
  const single = registry.bySequence(seq);
  if (single !== undefined) return { state: INITIAL_CHORD, result: { kind: 'command', commandId: single } };
  if (registry.isChordPrefix(seq))
    return { state: { pending: seq, startedAtMs: nowMs }, result: { kind: 'pending', prefix: seq } };
  return none;
}

// ---------------------------------------------------------------------------------------------
// Typing targets

export interface ElementLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}

const TYPING_ROLES = new Set(['textbox', 'combobox', 'searchbox', 'spinbutton', 'listbox']);

/** True when keystrokes belong to the element (inputs, selects, editable regions, ARIA text roles). */
export function isTypingTarget(el: ElementLike | null | undefined): boolean {
  if (el === null || el === undefined) return false;
  try {
    const tag = (el.tagName ?? '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable === true) return true;
    const ce = el.getAttribute?.('contenteditable');
    if (ce !== null && ce !== undefined && ce !== 'false') return true;
    const role = el.getAttribute?.('role');
    return role !== null && role !== undefined && TYPING_ROLES.has(role.toLowerCase());
  } catch {
    return true; // fail closed: treat unreadable targets as typing
  }
}

// ---------------------------------------------------------------------------------------------
// Accessibility

export type Platform = 'mac' | 'other';

const KEY_NAMES: Readonly<Record<string, string>> = { escape: 'Esc', enter: 'Enter', tab: 'Tab' };

/** Visible hint, e.g. "Ctrl+K", "⌘K", "G then H". */
export function shortcutLabel(shortcut: string, platform: Platform): string {
  const n = normalizeShortcut(shortcut);
  if (n === undefined) return '';
  if (n.includes(' '))
    return n
      .split(' ')
      .map((k) => k.toUpperCase())
      .join(' then ');
  const toks = n.split('+');
  const key = toks.pop() as string;
  const k = KEY_NAMES[key] ?? key.toUpperCase();
  if (platform === 'mac') {
    return (
      (toks.includes('alt') ? '⌥' : '') +
      (toks.includes('shift') ? '⇧' : '') +
      (toks.includes('mod') ? '⌘' : '') +
      k
    );
  }
  return [
    ...(toks.includes('mod') ? ['Ctrl'] : []),
    ...(toks.includes('alt') ? ['Alt'] : []),
    ...(toks.includes('shift') ? ['Shift'] : []),
    k,
  ].join('+');
}

/** Value for `aria-keyshortcuts` (single combos only; chords are not expressible, returns ""). */
export function ariaKeyShortcuts(shortcut: string, platform: Platform): string {
  const n = normalizeShortcut(shortcut);
  if (n === undefined || n.includes(' ')) return '';
  const toks = n.split('+');
  const key = toks.pop() as string;
  const mods = toks.map((m) =>
    m === 'mod' ? (platform === 'mac' ? 'Meta' : 'Control') : m === 'alt' ? 'Alt' : 'Shift',
  );
  return [...mods, key.length === 1 ? key.toUpperCase() : (KEY_NAMES[key] ?? key)].join('+');
}

/** Screen-reader label: "Go to Scan, shortcut G then N". */
export function a11yLabel(c: Command, platform: Platform): string {
  const hint = c.shortcut === undefined ? '' : shortcutLabel(c.shortcut, platform);
  return hint === '' ? c.title : `${c.title}, shortcut ${hint.replace(/\+/g, ' plus ')}`;
}

export interface PaletteOption {
  readonly id: string;
  /** DOM id for `aria-activedescendant`. */
  readonly domId: string;
  readonly title: string;
  readonly label: string;
  readonly shortcutHint: string;
  readonly selected: boolean;
  readonly titleMatch: readonly number[];
}

export interface PaletteView {
  readonly options: readonly PaletteOption[];
  readonly activeIndex: number;
  /** Live-region text: "3 commands" / "No commands match". */
  readonly announcement: string;
  readonly activeDescendant: string | undefined;
}

/** Builds the listbox model for the palette dialog (combobox + listbox pattern). */
export function paletteView(
  commands: readonly Command[],
  query: string,
  activeIndex: number,
  platform: Platform,
): PaletteView {
  const ranked = rankDetailed(commands, query);
  const idx =
    ranked.length === 0 ? -1 : Math.min(Math.max(0, Math.trunc(activeIndex) || 0), ranked.length - 1);
  const options = ranked.map((r, i) => ({
    id: r.command.id,
    domId: `palette-opt-${r.command.id}`,
    title: r.command.title,
    label: a11yLabel(r.command, platform),
    shortcutHint: r.command.shortcut === undefined ? '' : shortcutLabel(r.command.shortcut, platform),
    selected: i === idx,
    titleMatch: r.titleMatch,
  }));
  return {
    options,
    activeIndex: idx,
    announcement:
      options.length === 0
        ? 'No commands match'
        : options.length === 1
          ? '1 command'
          : `${options.length} commands`,
    activeDescendant: idx < 0 ? undefined : (options[idx] as PaletteOption).domId,
  };
}

/** Arrow-key movement with wrap-around; Home/End jump. */
export function moveActive(index: number, length: number, dir: 'up' | 'down' | 'home' | 'end'): number {
  if (length <= 0) return -1;
  if (dir === 'home') return 0;
  if (dir === 'end') return length - 1;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return dir === 'down' ? (i + 1 + length) % length : (i - 1 + length) % length;
}

/** The grouped list for a "?" help dialog, in registration order. */
export function shortcutHelp(
  commands: readonly Command[],
  platform: Platform,
): { id: string; title: string; hint: string }[] {
  return commands
    .filter((c) => c.shortcut !== undefined)
    .map((c) => ({ id: c.id, title: c.title, hint: shortcutLabel(c.shortcut as string, platform) }));
}
