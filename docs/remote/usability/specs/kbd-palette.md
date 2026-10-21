# Spec: kbd-palette: Command palette and keyboard shortcuts
Impact 2/5 | Effort S | Score 2 | Build wave 1 | Depends on: ux-glossary

## Problem
Eight nav buttons and long forms; power users and keyboard users have no quick actions.

## Exists today (verified in repo) vs missing
- apps/web/src/App.tsx:18 ORDER of views; nav buttons.
- Missing: everything described under Design.

## Design
Ctrl/Cmd+K opens a modal listing commands {id,title,keywords,run}; fuzzy match via simple subsequence scoring. Shortcuts: g then h/s/c/p/n/w (go-to), ? opens shortcut list. Single-key shortcuts disabled while focus is in an input, textarea, select, contenteditable or when a modal is open. No destructive commands (wipe keys, delete tags, send payment) are available from the palette without their normal confirmation screen.

## Privacy and security impact
Local only; command usage not recorded.

## Build ownership
- NEW package: `packages/command-palette` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/command-palette`.
- Public API (exports from `src/index.ts`):
- `rank(commands: Command[], q: string): Command[]`
- `parseChord(events): ChordResult`
- `isTypingTarget(el): boolean`
- `COMMANDS: readonly Command[] (no side-effect commands)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/App.tsx (global key listener, palette mount)
- apps/web/src/components/Palette.tsx (new)
- Add `@ghostpay/command-palette` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **KBDPA-1** MUST Shortcuts never fire inside form fields.
2. **KBDPA-2** MUST Palette is a focus-trapped dialog with Esc to close and focus return.
3. **KBDPA-3** MUST No command bypasses a confirmation.
4. **KBDPA-4** MUST Chord timeout 1 s.
5. **KBDPA-5** SHOULD Show shortcut hints in nav titles.

## Acceptance tests
1. **T-1** Typing "g" in an input does not navigate.
2. **T-2** rank("sweep") puts Sweep first.
3. **T-3** Esc returns focus to opener.
4. **T-4** COMMANDS contains none tagged destructive.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
