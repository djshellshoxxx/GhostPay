# Spec: kbd-palette: Command palette and keyboard shortcuts
Impact 2/5 | Effort S | Score 2 | Build wave 1 | Depends on: none (originally ux-glossary; titles here are plain English and i18n keys are added at wiring)
Status: logic built in `packages/ux-core/src/palette.ts` (swarm 7). The modal, focus trap and key listener are UI wiring.

## Problem
Eight nav buttons and long forms; power users and keyboard users have no quick actions.

## Exists today (verified in repo)
apps/web/src/App.tsx `ORDER` = home, seller, create, pay, scan, sweep, settings, about; nav buttons only.

## Design
- `Command {id, title, keywords, shortcut?, action}`; `action` is data: `navigate{view} | open-palette | open-shortcuts`. There are no callbacks, so a command cannot perform a side effect by itself.
- Shortcuts: `mod+k` palette, `?` help, chords `g h` home, `g s` seller, `g c` create, `g p` pay, `g n` scan, `g w` sweep, `g t` settings, `g a` about. (Mnemonics: scaN, sWeep, seTtings; this deviates from the original "s" because seller and sweep both start with s.)
- `normalizeShortcut`: lower-case, modifier order `mod+alt+shift+key`, at most two plain keys for chords; invalid forms rejected.
- `createRegistry` rejects: duplicate ids, invalid ids/titles (control chars, `<`, `>`), >12 keywords, unknown action types, bad view slugs, invalid or reserved shortcuts (`mod+t/w/n/r/l/q/p/s/f`, `alt+f4`, `f5`, `f11`, `f12`), `destructive: true` (always), and any identical-shortcut or single-key-vs-chord-prefix conflict. `detectConflicts` reports `duplicate-id | same-shortcut | prefix` pairs.
- `rank/rankDetailed`: NFKD-folded, case-insensitive subsequence match. Score rewards consecutive runs, word starts, prefix and substring; titles outrank keywords; ties keep registration order; query capped at 64 chars; empty query returns all. Highlight indices returned for titles.
- `parseChord(registry, state, event, nowMs, {typing, modalOpen})` pure step: ignores key repeat, IME composition and bare modifiers; modifier shortcuts (`mod+k`) work with exactly one of Ctrl/Meta and are allowed while typing; plain keys and chords are suppressed when typing or a modal is open and cancel a pending chord; chord expires after 1000 ms; Alt-modified keys ignored.
- `isTypingTarget(el)`: INPUT, TEXTAREA, SELECT, contenteditable (property or attribute other than "false"), ARIA roles textbox/combobox/searchbox/spinbutton/listbox; fails closed (true) if reading the element throws.
- A11y: `shortcutLabel` ("Ctrl+K", "⌘K", "G then H"), `ariaKeyShortcuts` ("Control+K"/"Meta+K"; chords -> ""), `a11yLabel` ("Go to Scan, shortcut G then N"), `paletteView` (listbox options with `palette-opt-<id>` ids, `aria-selected`, `activeDescendant`, live-region announcement "N commands" / "No commands match"), `moveActive` (wrap-around, Home/End), `shortcutHelp`.

## Privacy and security impact
Local only; command usage is never recorded. No command can navigate to a destructive action without that action's own confirmation screen.

## Requirements
1. **KBDPA-1** MUST Plain-key shortcuts never fire in form fields, editable regions or while a modal is open.
2. **KBDPA-2** MUST (UI) Palette is a focus-trapped dialog; Esc closes; focus returns to the opener. Model supports `aria-activedescendant` and announcements.
3. **KBDPA-3** MUST No command bypasses a confirmation: destructive commands cannot be registered.
4. **KBDPA-4** MUST Chord timeout is 1000 ms.
5. **KBDPA-5** SHOULD Shortcut hints in nav titles via `shortcutLabel`.
6. **KBDPA-6** MUST Reserved browser shortcuts cannot be taken over.
7. **KBDPA-7** MUST Query text never reaches a RegExp or eval.

## Acceptance tests (`palette.test.ts`)
1. **T-1** `g` with `typing:true` -> none; pending chord cancelled when focus moves into an input.
2. **T-2** `rank(COMMANDS,"sweep")[0].id === "go.sweep"`; `gsw`, `withdraw` (keyword), `séttings` also resolve.
3. **T-3** (e2e, wiring) Esc returns focus to opener.
4. **T-4** `COMMANDS` has no destructive entry; registry throws `DESTRUCTIVE_FORBIDDEN`.
5. **T-5** chord `g` then `w` at +1000 ms -> `go.sweep`; at +1001 ms -> none.
6. **T-6** conflict matrix (`g` vs `g h`, `G H` vs `g h`), reserved `mod+t`, malformed shortcuts, hostile elements, regex-metacharacter queries.
