# guide-profiles: privacy profile selector

## Requirements
- R1 Profiles `everyday`, `private`, `maximum` map to `ProfileSettings` plain data (receive address mode, send delay, fiat-rate mode, balance hiding, address-review mode, confirmations, high-value threshold, auto-lock). `settingsFor` returns copies.
- R2 `TRADEOFFS` table rows privacy/speed/convenience/fees, levels 1-3 (higher better), i18n keys only.
- R3 `recommendProfile(answers)`: 3 questions (audience, amounts, waiting), additive scores, ties go to more private, `instant` waiting never yields `maximum`, no answers yields `private`, `complete` flag, reason keys. Unknown questions/options throw `AnswerError`.
- R4 `diffSettings` / `detectProfile` for confirmation dialogs and "custom" display.
## Acceptance tests (profiles.test.ts)
- exact settings values; monotonic tightening; copy semantics.
- exact scores for three answer sets; cap rule; tie rule; prototype-key answers (`toString`, `constructor`) rejected; fast-check over all answer subsets.
