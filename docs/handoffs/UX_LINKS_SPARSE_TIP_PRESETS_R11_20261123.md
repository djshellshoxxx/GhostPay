# GhostPay BUG-ONLY R11 — sparse tip-page preset array boundary

Date: 2026-11-23 UTC.
Repository: `djshellshoxxx/GhostPay`.
Verified live main at start: `8ddb344973e80b8e1eda6821e970ee6a2b808b29` (after #452 receipt fix integration).
Task branch: `automation/20261123T0742Z/bug/ux-links-sparse-tip-presets-r11`, based directly on that main SHA.
Owned source: `packages/ux-links/src/tip.ts`.
New regression: `packages/ux-links/src/tip.sparse.test.ts`.
Pre-fix source Git blob: `4ec5184bd2379c5bf06065f029b7cf637e27fa42`.
Post-fix source Git blob: `723a78baa7aaa42435d7eff54b810299ed3eb0f0`.

## Reproduced existing-functionality failure

`buildTipPageModel` validates a `suggested` tip amount array's type and length (1..6) but then uses `Array.map` to parse and order it. JavaScript `map` does not invoke its callback for absent array indices. A one-slot hole returns a one-slot sparse `presets` array instead of a typed `LinkError('TIP', ..., 'suggested')`. In three-element arrays with a missing middle slot, the parser also silently bypasses its ascending-value check for that slot. The output lacks an actual suggested amount/URI in that position, despite the documented strictly ascending 1..6 preset contract. Plain JSON cannot contain holes, but the exported API also takes in-process `TipConfig` arrays; this is a concrete runtime correctness defect, not a remote exploitation claim.

A standalone Node.js v22.16.0 reproduction used the source's suggested-array `map` logic and the exact new index-presence guard, with synthetic amounts and no network, payment, wallet or custody execution. For dense valid arrays of size 1..6, and all single-hole placements of size 1..6:
- Original behavior: 21/21 expected-rejection assertions failed because holes were silently accepted.
- Repaired behavior: 21/21 sparse arrays rejected; six dense ascending arrays and two neighboring nonascending/duplicate cases passed (29/29 checks).
- This is **extracted source-equivalent logic**, NOT an execution of the full repository or the committed Vitest regression. Native GitHub checkout failed DNS lookup of `github.com`.

## Regression-first commits and minimal fix

1. `c9095c3bb903620bbc91c09f013b6cf7de9dcd9e`: additive ownership/acceptance claim in `docs/ai/ACTIVE_WORK.md`, before source edits.
2. `3c89e05bcb3a2777bea20059ca124c6d30df814a`: new failing Vitest regression committed **before** the production fix. Covers holes at only/first/middle/last positions plus a valid dense 3-preset scenario; `tip.test.ts` is intentionally untouched.
3. `06e971d6898e3445900701d88aa74468da56c307`: smallest source repair; iterate each suggested-array index and reject absent own-index properties via the package's existing `fail('TIP', 'suggested')` error, then leave the established mapping, URI construction, amount bounds and ascending checks unchanged.
4. This additive source-pinned handoff, without any other production changes.

## Live coordination, CI and merge gates

Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, current PRs and exact main HEAD before working.
Every changed-file inventory of all **255 open PRs** (#500 down through #51) was read. No PR modifies either `packages/ux-links/src/tip.ts` or new `tip.sparse.test.ts`. Existing `tip.test.ts` has competing broad owner changes (#224, #238, #262, #264, #278, #372), so it was not touched. Recheck this before any merge.
PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882` was confirmed open, **ready** rather than draft, with 39 exact-head check runs: 35 success and four skipped; all five workflow groups succeeded, including relevant Pages/browser qualification. GitHub's submitted review list was empty. PR #390's owned branch/files were not edited.
The integration metadata ref `automation/ghostpay-integration-lock` was read directly at `082e754f44944ebb4be283f89176b966bf8f7b4f`, **released, generation 12** following #452. A released lock is not an integration grant. No lock write/acquisition, merge, main update, deployment or release occurred.
The dedicated committed Vitest regression, repository typecheck, lint, full build and real browser E2E were **not executed locally**. The task PR must await exact-final-head hosted CI and applicable native browser verification. An actual separate reviewer must submit an independent review, and any dependency conflicts and lawful integration lock ownership must be resolved before merging.

## Scope / next action

One existing-functionality correctness defect only. No new features, redesign, protocol/schema changes, contract/fund interactions, external runtime traffic, new dependencies, fuzz/security automation overlap, deployment or release. After publishing the draft PR, record its exact head and hosted workflow job outcomes in a PR checkpoint comment; leave unqualified work draft for the next scheduled BUG-ONLY rotation. Select another unowned existing bug next cycle instead of broadening this PR.
