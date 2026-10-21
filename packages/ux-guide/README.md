# @ghostpay/ux-guide

Pure, UI-free logic for first-run guidance. No DOM, network, storage or timers; clock and RNG are injected.

- `onboarding.ts`: resumable state machine + view-model (welcome, wallet create/import, backup quiz, profile, first receive). State never holds secrets; `parseState` fails closed on tampered blobs.
- `profiles.ts`: Everyday / Private / Maximum profiles, tradeoffs table, `recommendProfile(answers)`, settings as plain data, `diffSettings`, `detectProfile`.
- `checklist.ts`: `evaluateChecklist(input)` with blockers vs acknowledgeable warnings, look-alike address detection, address-review challenge.

See docs/remote/usability/specs/guide-*.md, wiring/ux-guide.md, audit-ux-guide.md.
