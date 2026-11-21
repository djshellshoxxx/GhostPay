# GP-BUG — Onboarding phrase-review acknowledgment gate

Date: 2026-11-21. Scope: **one existing UX-guide state-machine defect**, no UI/network/crypto/contract changes.

## Pinned inputs, ownership and gate review

- Current main at discovery: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Source: `packages/ux-guide/src/onboarding.ts`; original GitHub blob `d36ab8c71bf62dfd36cfa3e5b70b137e82a9222d`.
- Work branch: `automation/20261121/bug/onboarding-review-gate-r1`.
- Claim recorded before editing source: `82497313c9424bc246e330656f766c42c1e3e8d8`.
- Regression added **first**, before production fix: `4925997de488ace3bbbd568e55d12e431de96b8f`.
- Minimal production fix: `21f3d050a148e50017dd48f4c7ab57bdcc18548c`. Repaired source GitHub blob `6e403ee382c27f41d28568953d32590681358242`.
- Exact open PR ownership scan: two pages of REST open pull requests, 187 open at discovery; fetched paginated changed-file inventories for all 187. None modified `packages/ux-guide/src/`. Broader PRs #87, #210, #238, #253, #262, #264, #278 and #372 change `packages/ux-guide/package.json` only; no overlap with this test/source. Recheck before integration.
- PR #390: head `b655bc273a6704c9c140287b8adcdf4085b91882`, check-runs 36 success / three skipped / zero failing, combined Snyk status success. GitHub reviews empty. Examined rendered-display-text source/test diff: no confirmed code or CI failure requiring intervention; owner files untouched. PR #419/#422 overlapping display-text branches require separate coordination. PR #390 is open and non-draft at recheck despite historical draft language.
- Main integration lease: separately held generation 11 by another coordinator (last pinned ownership claim `994a0d214fb9-root-r3`); **no lease transfer, protected main update or merge attempted**.

## Confirmed failure

`reduce(state, { type: 'PHRASE_REVIEWED', at })` previously accepted the event whenever `state.step === 'backup'`, without checking `state.reviewRequired`. This allows an unsolicited acknowledgment after one or two wrong mnemonic-quiz submissions to reset `quizAttempts` to zero, avoiding the documented mandatory review after three wrong submissions. It also accepts an acknowledgment before any quiz attempt. The normal view-model does not advertise the button until review is required, but the exported reducer should enforce the same transition invariant.

Reproduced using the literal `PHRASE_REVIEWED` case body dynamically extracted from the exact GitHub source blob above, with the original `ok` and `fail` helper semantics:

- Before fix: `{ step:'backup', reviewRequired:false, quizAttempts:2 }` + `PHRASE_REVIEWED` => `ok:true`, `quizAttempts:0`. **Failing regression**.
- Before fix: same event on a fresh backup quiz => `ok:true` despite no requested review.
- Third wrong quiz, using the exact extracted `QUIZ_SUBMITTED` case, correctly turns `reviewRequired` on; the problem was the premature acknowledgment.

## Minimal repair and verification

Added a single guard after the existing backup-step check: `if (!state.reviewRequired) return fail(state, 'invalid_event');`. It does not change the legitimate acknowledgment, counted quiz attempts, back navigation, persisted state shape or UX copy.

Three new Vitest regression cases are committed in isolated `onboarding.review-gate.test.ts`: unsolicited acknowledgment on a fresh quiz, preservation of attempt counts through one/two failures and eventual mandatory review, and successful acknowledgment/retry after the third failure. Existing `onboarding.test.ts` remains unchanged.

**Executed:** exact GitHub-source-clause V8 evaluations (not a repo runtime or Vitest): ten pre/post cases across the two SHA-pinned blobs, including premature and fresh acknowledgments, forced-review acknowledgments, wrong-step refusals and the third-failure lock. Two original cases accepted invalid transitions; after the fix all five post-fix behavior checks produced expected outcomes. Extracted cases used a minimal state object and local helper stubs corresponding to the source; the full repository was not compiled or executed locally.

**Not executed locally:** repository Vitest, full package coverage, typecheck, lint, production build or native browser tests; native `git ls-remote` cannot resolve `github.com` from the execution container. All hosted CI/browser outcomes must be checked at exact PR head after publication. No independent human or separately executing agent review has been obtained.

## Outstanding gates and handoff

Keep the PR draft unless all required exact-head hosted checks, applicable native browser verification, a genuine independent review, conflict-free dependency and ownership recheck, and legitimate held integration lease transfer/release are demonstrated. Never treat skipped checks as successful coverage. No merge, deployment, workflow dispatch, branch deletion, wallet usage, funds, remote traffic testing or bypass of another worker's files. Recheck main/PR heads before any future decision. Rotate to another *unowned* existing Pages function on a later bug-only round.
