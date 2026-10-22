# guide-onboarding: onboarding state machine

## Requirements
- R1 Steps: welcome, wallet (create|import), backup (quiz), profile, receive, done. Pure `reduce(state, event)`; never throws; errors returned with unchanged state.
- R2 State/events never contain secrets (no words, keys, addresses). Quiz grading returns booleans (`gradeQuiz`), only booleans enter the machine.
- R3 Created wallet: backup quiz of 3 distinct ascending positions (`buildQuiz`, injected RNG). Wrong answer clears positions (re-draw); 3 wrong submissions force `PHRASE_REVIEWED`. Quiz pass is mandatory before profile.
- R4 Imported wallet skips the quiz (`backupConfirmed` true, progress shows `skipped`).
- R5 Resumable: `parseState(unknown)` strictly validates (exact key set, enums, step/fact consistency) else `null` (restart). `viewModel.resumeAction` tells host what to redo (restart wallet creation, draw positions, show phrase).
- R6 Back allowed only wallet->welcome (before wallet ready) and receive->profile.
## Acceptance tests (onboarding.test.ts)
- create and import happy paths reach expected steps; JSON round-trip equals state.
- 3 wrong attempts => reviewRequired, quiz events rejected until PHRASE_REVIEWED.
- malformed positions/results/timestamps/unknown events return named errors.
- parseState rejects extra keys, secret-like strings in enum fields, inconsistent combos; fuzz never throws.
- property: random event streams never throw, state always re-parses, past backup implies backupConfirmed.
