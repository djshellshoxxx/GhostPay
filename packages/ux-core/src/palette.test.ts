import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CHORD_TIMEOUT_MS,
  COMMANDS,
  INITIAL_CHORD,
  PaletteError,
  a11yLabel,
  ariaKeyShortcuts,
  createRegistry,
  defaultRegistry,
  detectConflicts,
  isTypingTarget,
  moveActive,
  normalizeShortcut,
  paletteView,
  parseChord,
  rank,
  rankDetailed,
  shortcutHelp,
  shortcutLabel,
  type ChordState,
  type Command,
  type KeyEventLike,
  type PaletteErrorCode,
} from './palette.js';

const cmd = (over: Partial<Command> & { id: string }): Command => ({
  title: 'Thing',
  keywords: [],
  action: { type: 'navigate', view: 'home' },
  ...over,
});
const errCode = (fn: () => unknown): PaletteErrorCode | 'no-throw' => {
  try {
    fn();
    return 'no-throw';
  } catch (e) {
    return e instanceof PaletteError ? e.code : ('other' as never);
  }
};
const free = { typing: false, modalOpen: false };

describe('built-in COMMANDS', () => {
  it('have no conflicts, no destructive entries (T-4) and register cleanly', () => {
    expect(detectConflicts(COMMANDS)).toEqual([]);
    expect(COMMANDS.some((c) => c.destructive === true)).toBe(false);
    expect(defaultRegistry().list()).toHaveLength(COMMANDS.length);
    expect(COMMANDS.every((c) => c.action.type !== undefined)).toBe(true);
  });
  it('covers every app view', () => {
    const views = COMMANDS.flatMap((c) => (c.action.type === 'navigate' ? [c.action.view] : []));
    expect(new Set(views)).toEqual(
      new Set(['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'settings', 'about']),
    );
  });
});

describe('normalizeShortcut', () => {
  it('canonicalises', () => {
    expect(normalizeShortcut('Shift+Mod+K')).toBe('mod+shift+k');
    expect(normalizeShortcut('  G   H ')).toBe('g h');
    expect(normalizeShortcut('?')).toBe('?');
    expect(normalizeShortcut('Escape')).toBe('escape');
    expect(normalizeShortcut('F5')).toBe('f5');
  });
  it('rejects junk', () => {
    for (const bad of [
      '',
      ' ',
      'g h i',
      'mod+',
      'ctrl+k',
      'mod+mod+k',
      'mod+k j',
      'g mod+k',
      'x'.repeat(30),
      '<script>',
      'mod+ab',
      'f13',
      'mod++',
      '+',
    ])
      expect(normalizeShortcut(bad)).toBeUndefined();
    expect(normalizeShortcut(5 as unknown as string)).toBeUndefined();
  });
});

describe('conflicts and registry', () => {
  it('detects duplicate ids, identical shortcuts, chord prefixes', () => {
    const cs = [
      cmd({ id: 'aa', shortcut: 'g' }),
      cmd({ id: 'bb', shortcut: 'g h' }),
      cmd({ id: 'cc', shortcut: 'G H' }),
      cmd({ id: 'aa' }),
      cmd({ id: 'dd' }),
    ];
    const kinds = detectConflicts(cs).map((c) => `${c.kind}:${c.a}:${c.b}`);
    expect(kinds).toContain('prefix:aa:bb');
    expect(kinds).toContain('same-shortcut:bb:cc');
    expect(kinds).toContain('prefix:aa:cc');
    expect(kinds).toContain('duplicate-id:aa:aa');
  });
  it('registry rejects bad commands with typed codes', () => {
    const r = createRegistry([cmd({ id: 'one', shortcut: 'g o' })]);
    expect(errCode(() => r.register(cmd({ id: 'one' })))).toBe('DUPLICATE_ID');
    expect(errCode(() => r.register(cmd({ id: 'two', shortcut: 'g o' })))).toBe('SHORTCUT_CONFLICT');
    expect(errCode(() => r.register(cmd({ id: 'two', shortcut: 'g' })))).toBe('SHORTCUT_CONFLICT');
    expect(errCode(() => r.register(cmd({ id: 'two', shortcut: 'mod+t' })))).toBe('RESERVED_SHORTCUT');
    expect(errCode(() => r.register(cmd({ id: 'two', shortcut: 'ctrl+x' })))).toBe('INVALID_SHORTCUT');
    expect(errCode(() => r.register(cmd({ id: 'wipe', destructive: true })))).toBe('DESTRUCTIVE_FORBIDDEN');
    expect(errCode(() => r.register(cmd({ id: 'Bad Id' })))).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'tt', title: '' })))).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'tt', title: '<b>x</b>' })))).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'tt', title: 'x'.repeat(61) })))).toBe('INVALID_COMMAND');
    expect(
      errCode(() => r.register(cmd({ id: 'tt', keywords: Array.from({ length: 13 }, () => 'k') }))),
    ).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'tt', keywords: [''] })))).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'tt', action: { type: 'nope' } as never })))).toBe(
      'INVALID_COMMAND',
    );
    expect(errCode(() => r.register(cmd({ id: 'tt', action: undefined as never })))).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'tt', action: { type: 'navigate', view: '../x' } })))).toBe(
      'INVALID_COMMAND',
    );
    expect(errCode(() => r.register(null as never))).toBe('INVALID_COMMAND');
    expect(errCode(() => r.register(cmd({ id: 'ok', shortcut: 'g q' })))).toBe('no-throw');
    expect(errCode(() => r.register(cmd({ id: 'ok2', action: { type: 'open-palette' } })))).toBe('no-throw');
    expect(r.byId('ok')?.id).toBe('ok');
    expect(r.byId('zz')).toBeUndefined();
    expect(r.list()).toHaveLength(3);
  });
  it('registered commands are frozen copies', () => {
    const kw = ['a'];
    const r = createRegistry([cmd({ id: 'one', keywords: kw })]);
    kw.push('b');
    expect(r.byId('one')?.keywords).toEqual(['a']);
    expect(Object.isFrozen(r.byId('one'))).toBe(true);
  });
});

describe('rank', () => {
  it('T-2 "sweep" puts Sweep first', () => {
    expect(rank(COMMANDS, 'sweep')[0]?.id).toBe('go.sweep');
    expect(rank(COMMANDS, 'SWEEP')[0]?.id).toBe('go.sweep');
  });
  it('fuzzy subsequence, keywords, accents', () => {
    expect(rank(COMMANDS, 'gsw')[0]?.id).toBe('go.sweep');
    expect(rank(COMMANDS, 'withdraw')[0]?.id).toBe('go.sweep');
    expect(rank(COMMANDS, 'rpc')[0]?.id).toBe('go.settings');
    expect(rank(COMMANDS, 'séttings')[0]?.id).toBe('go.settings');
    expect(rank(COMMANDS, 'ps')).not.toContain(undefined);
  });
  it('empty query keeps order; no match is empty; overlong query is empty', () => {
    expect(rank(COMMANDS, '').map((c) => c.id)).toEqual(COMMANDS.map((c) => c.id));
    expect(rank(COMMANDS, '   ')).toHaveLength(COMMANDS.length);
    expect(rank(COMMANDS, 'qqqzzz')).toEqual([]);
    expect(rank(COMMANDS, 'a'.repeat(65))).toEqual([]);
    expect(rank(COMMANDS, 5 as unknown as string)).toHaveLength(COMMANDS.length);
  });
  it('ties are stable and title matches expose highlight indices', () => {
    const a = [cmd({ id: 'aa', title: 'Alpha' }), cmd({ id: 'bb', title: 'Alpha' })];
    expect(rank(a, 'alpha').map((c) => c.id)).toEqual(['aa', 'bb']);
    expect(rankDetailed(a, 'alp')[0]?.titleMatch).toEqual([0, 1, 2]);
    expect(rankDetailed(COMMANDS, 'withdraw')[0]?.titleMatch).toEqual([]);
  });
  it('prefers word-start and consecutive matches', () => {
    const a = [cmd({ id: 'xx', title: 'Back up data' }), cmd({ id: 'yy', title: 'Bad cat dog' })];
    expect(rank(a, 'bud')[0]?.id).toBe('xx');
  });
  it('property: regex metacharacters and arbitrary text never throw', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (q) => {
        rank(COMMANDS, q);
      }),
      { numRuns: 300 },
    );
    expect(rank(COMMANDS, '.*')).toEqual([]);
    expect(rank(COMMANDS, '(')).toEqual([]);
  });
});

const key = (k: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({ key: k, ...extra });
const step = (s: ChordState, ev: KeyEventLike, t: number, ctx = free) =>
  parseChord(defaultRegistry(), s, ev, t, ctx);

describe('parseChord', () => {
  it('g then w within timeout navigates to sweep', () => {
    const a = step(INITIAL_CHORD, key('g'), 1000);
    expect(a.result).toEqual({ kind: 'pending', prefix: 'g' });
    const b = step(a.state, key('w'), 1000 + CHORD_TIMEOUT_MS);
    expect(b.result).toEqual({ kind: 'command', commandId: 'go.sweep' });
    expect(b.state).toEqual(INITIAL_CHORD);
  });
  it('chord expires after 1 s; the late key is treated fresh', () => {
    const a = step(INITIAL_CHORD, key('g'), 1000);
    const b = step(a.state, key('w'), 1000 + CHORD_TIMEOUT_MS + 1);
    expect(b.result).toEqual({ kind: 'none' });
    expect(step(a.state, key('g'), 3000).result.kind).toBe('pending');
  });
  it('wrong second key cancels', () => {
    const a = step(INITIAL_CHORD, key('g'), 0);
    expect(step(a.state, key('z'), 10)).toMatchObject({
      result: { kind: 'cancelled' },
      state: INITIAL_CHORD,
    });
  });
  it('T-1 never fires while typing or in a modal; typing also cancels a pending chord', () => {
    expect(step(INITIAL_CHORD, key('g'), 0, { typing: true, modalOpen: false }).result.kind).toBe('none');
    expect(step(INITIAL_CHORD, key('?'), 0, { typing: false, modalOpen: true }).result.kind).toBe('none');
    const a = step(INITIAL_CHORD, key('g'), 0);
    const b = step(a.state, key('h'), 5, { typing: true, modalOpen: false });
    expect(b.result.kind).toBe('none');
    expect(b.state).toEqual(INITIAL_CHORD);
  });
  it('mod+k opens palette on both platforms, even while typing, not with both mods', () => {
    expect(
      step(INITIAL_CHORD, key('k', { ctrlKey: true }), 0, { typing: true, modalOpen: false }).result,
    ).toEqual({ kind: 'command', commandId: 'palette.open' });
    expect(step(INITIAL_CHORD, key('K', { metaKey: true }), 0).result).toEqual({
      kind: 'command',
      commandId: 'palette.open',
    });
    expect(step(INITIAL_CHORD, key('k', { metaKey: true, ctrlKey: true }), 0).result.kind).toBe('none');
    expect(step(INITIAL_CHORD, key('x', { ctrlKey: true }), 0).result.kind).toBe('none');
    expect(step(INITIAL_CHORD, key('k', { ctrlKey: true, shiftKey: true }), 0).result.kind).toBe('none');
    expect(step(INITIAL_CHORD, key('k', { ctrlKey: true, altKey: true }), 0).result.kind).toBe('none');
  });
  it('? opens the help; Alt-modified and unknown keys are ignored', () => {
    expect(step(INITIAL_CHORD, key('?', { shiftKey: true }), 0).result).toEqual({
      kind: 'command',
      commandId: 'help.shortcuts',
    });
    expect(step(INITIAL_CHORD, key('g', { altKey: true }), 0).result.kind).toBe('none');
    expect(step(INITIAL_CHORD, key('q'), 0).result.kind).toBe('none');
  });
  it('ignores repeat, IME composition, bare modifiers and bad keys without losing state', () => {
    const a = step(INITIAL_CHORD, key('g'), 0);
    for (const ev of [
      key('h', { repeat: true }),
      key('h', { isComposing: true }),
      key('Shift'),
      key('Control'),
      key('Alt'),
      key('Meta'),
      key(''),
    ]) {
      expect(step(a.state, ev, 10)).toEqual({ state: a.state, result: { kind: 'none' } });
    }
    expect(step(a.state, { key: 5 } as never, 10).result.kind).toBe('none');
  });
  it('modifier shortcut also works when a chord is pending (resets it)', () => {
    const a = step(INITIAL_CHORD, key('g'), 0);
    expect(step(a.state, key('k', { ctrlKey: true }), 5)).toMatchObject({
      state: INITIAL_CHORD,
      result: { kind: 'command' },
    });
  });
});

describe('isTypingTarget', () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}, attrs: Record<string, string> = {}) => ({
    tagName,
    ...extra,
    getAttribute: (n: string) => attrs[n] ?? null,
  });
  it('detects form fields and editable regions', () => {
    for (const t of ['INPUT', 'textarea', 'Select']) expect(isTypingTarget(el(t))).toBe(true);
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el('DIV', {}, { contenteditable: '' }))).toBe(true);
    expect(isTypingTarget(el('DIV', {}, { contenteditable: 'plaintext-only' }))).toBe(true);
    expect(isTypingTarget(el('DIV', {}, { role: 'TextBox' }))).toBe(true);
    expect(isTypingTarget(el('DIV', {}, { role: 'combobox' }))).toBe(true);
  });
  it('non-typing targets', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
    expect(isTypingTarget({})).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('DIV', {}, { contenteditable: 'false' }))).toBe(false);
    expect(isTypingTarget(el('A', {}, { role: 'link' }))).toBe(false);
  });
  it('fails closed on hostile elements', () => {
    expect(
      isTypingTarget({
        get tagName(): string {
          throw new Error('x');
        },
      }),
    ).toBe(true);
  });
});

describe('accessibility', () => {
  it('shortcut labels per platform', () => {
    expect(shortcutLabel('mod+k', 'other')).toBe('Ctrl+K');
    expect(shortcutLabel('mod+k', 'mac')).toBe('⌘K');
    expect(shortcutLabel('mod+alt+shift+k', 'other')).toBe('Ctrl+Alt+Shift+K');
    expect(shortcutLabel('mod+alt+shift+k', 'mac')).toBe('⌥⇧⌘K');
    expect(shortcutLabel('g h', 'other')).toBe('G then H');
    expect(shortcutLabel('?', 'other')).toBe('?');
    expect(shortcutLabel('Escape', 'other')).toBe('Esc');
    expect(shortcutLabel('bogus key', 'other')).toBe('');
  });
  it('aria-keyshortcuts', () => {
    expect(ariaKeyShortcuts('mod+k', 'other')).toBe('Control+K');
    expect(ariaKeyShortcuts('mod+k', 'mac')).toBe('Meta+K');
    expect(ariaKeyShortcuts('mod+alt+shift+k', 'other')).toBe('Control+Alt+Shift+K');
    expect(ariaKeyShortcuts('escape', 'other')).toBe('Esc');
    expect(ariaKeyShortcuts('g h', 'other')).toBe('');
    expect(ariaKeyShortcuts('', 'other')).toBe('');
  });
  it('a11yLabel speaks modifiers', () => {
    expect(a11yLabel(COMMANDS.find((c) => c.id === 'go.scan') as Command, 'other')).toBe(
      'Go to Scan, shortcut G then N',
    );
    expect(a11yLabel(COMMANDS[0] as Command, 'other')).toBe('Open command palette, shortcut Ctrl plus K');
    expect(a11yLabel(cmd({ id: 'zz', title: 'Plain' }), 'other')).toBe('Plain');
  });
  it('paletteView builds listbox model with clamped selection and announcements', () => {
    const v = paletteView(COMMANDS, 'go', 99, 'other');
    expect(v.activeIndex).toBe(v.options.length - 1);
    expect(v.options.filter((o) => o.selected)).toHaveLength(1);
    expect(v.activeDescendant).toBe(v.options[v.activeIndex]?.domId);
    expect(v.announcement).toBe(`${v.options.length} commands`);
    expect(paletteView(COMMANDS, 'qqzz', 0, 'other')).toMatchObject({
      announcement: 'No commands match',
      activeIndex: -1,
      activeDescendant: undefined,
    });
    expect(paletteView(COMMANDS, 'withdraw', NaN, 'mac')).toMatchObject({
      announcement: '1 command',
      activeIndex: 0,
    });
    expect(paletteView(COMMANDS, '', -4, 'other').activeIndex).toBe(0);
  });
  it('moveActive wraps', () => {
    expect(moveActive(0, 3, 'up')).toBe(2);
    expect(moveActive(2, 3, 'down')).toBe(0);
    expect(moveActive(1, 3, 'down')).toBe(2);
    expect(moveActive(1, 3, 'home')).toBe(0);
    expect(moveActive(1, 3, 'end')).toBe(2);
    expect(moveActive(0, 0, 'down')).toBe(-1);
    expect(moveActive(NaN, 3, 'down')).toBe(1);
  });
  it('shortcutHelp lists only commands with shortcuts', () => {
    const h = shortcutHelp([...COMMANDS, cmd({ id: 'nokey' })], 'other');
    expect(h).toHaveLength(COMMANDS.length);
    expect(h.find((x) => x.id === 'go.home')?.hint).toBe('G then H');
  });
});
