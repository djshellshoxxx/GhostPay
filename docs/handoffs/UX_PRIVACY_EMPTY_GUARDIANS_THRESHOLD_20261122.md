# GhostPay BUG-ONLY — empty guardian list retains invalid threshold

Date: 2026-11-22 UTC. Integration: held externally, generation 11. This is an isolated unmerged candidate.

## Live source and coordination

- Main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `automation/20261122T0326Z/bug/ux-privacy-empty-guardians-threshold`; initial claim `056bd230192f545c0280ca4d9ebd03d1e6f286be`.
- Production before: `packages/ux-privacy/src/policy.ts` blob `f3b22076fef5ec2e100ffcb7fa7419adbcc69161`.
- Production after: same file blob `42515d886b244598a563788513344cdfb90521d0`, repair commit `5e00eb5dfad8489566c0b9e4a2ac888a4a893aab`.
- Regression-first commit: `e267018bff21a500c1da08b8faf362653816ce7d`. New file only: `packages/ux-privacy/src/policy.guardian-threshold.test.ts`. Existing `policy.test.ts` is unchanged.
- Draft review PR: https://github.com/djshellshoxxx/GhostPay/pull/437
- Scope: `validateFriendlyPolicy` logic only; no contracts, chain activity, feature implementation, UI, dependencies, deployment or release.

## Reproduction and root cause

Contract: `FriendlyPolicy.guardianThreshold` must be an integer from 1 to `guardians.length`; a threshold without guardians is invalid. Main correctly rejects a threshold with no `guardians` property, and validates it with 1+ guardian entries. However, `guardians: []` enters the array branch but neither the `gl.length > 0` validation nor the missing-property fallback. Therefore `guardianThreshold: 1` (or 0/2) adds no `INVALID_THRESHOLD` error and can be passed to both `describePolicy` and `toSchemePolicyInput`.

A manually reconstructed, source-equivalent Node v22.16.0 **guardian-control-flow** replay observed:

| Input | Main branch errors | Fixed branch errors |
| --- | --- | --- |
| `guardians: [], guardianThreshold: 1` | none | `INVALID_THRESHOLD` |
| `guardians: [], guardianThreshold: 0` | none | `INVALID_THRESHOLD` |
| `guardians: []` | none | none |
| 1 guardian, threshold 1 | none | none |
| no guardian property, threshold 1 | `INVALID_THRESHOLD` | `INVALID_THRESHOLD` |

This isolated replay does **not** execute the repository module or claim repository Vitest. The full pre-fix behavior also follows from inspection of the exact main GitHub blob above.

## Regression-first repair

Test commit `e267018bff21a500c1da08b8faf362653816ce7d` precedes source commit `5e00eb5dfad8489566c0b9e4a2ac888a4a893aab`. Regression covers thresholds 0/1/2 against empty lists, downstream `describePolicy` and `toSchemePolicyInput` rejection, explicit empty list without threshold, omitted guardians, and valid single guardian with threshold 1.

Smallest change: add a single `else if (p.guardianThreshold !== undefined)` inside the empty-list branch using the existing `INVALID_THRESHOLD` issue code and message. For valid configurations and malformed guardian-array types the original branch behavior is retained.

Broad active PRs #238, #262, #264, #278 and #372 change existing policy test or package metadata but were checked not to change `policy.ts`. #246 and #307 do not change this package. New focused test avoids the preexisting test-file ownership. All PR heads and overlapping paths must be rechecked before integration.

## Hosted verification and outstanding gates

Initial test-only PR head `e267018bff21a500c1da08b8faf362653816ce7d` triggered run https://github.com/djshellshoxxx/GhostPay/actions/runs/44980858171, but the run was superseded after the fix push; test jobs were cancelled, so **no pre-fix hosted failing test result is claimed**.

Native repository checkout, Vitest, lint, typecheck, build and browser test **were not executed locally**: git cannot resolve github.com in this runner. A source-equivalent Node control-flow replay is the only local runtime evidence. Exact **final PR head** hosted CI, workspace tests, browser/Pages build, independent reviewer submission, and released integration ownership remain mandatory. A separate genuinely independent verifier was not available in this execution; self-review is not independent approval.

## Separate recheck of preexisting PR #390

PR https://github.com/djshellshoxxx/GhostPay/pull/390 remained at `b655bc273a6704c9c140287b8adcdf4085b91882` with main `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Exact-head GitHub Actions CI `44898786362`, Hosting kit `44898786427`, Pages `44898786411`, Beta acceptance `44898786416`, and CLI `44898786403` all reported completed/success. The CI job inventory included successful `ts-lint`, `ts-typecheck`, `ts-test (web)`, and both lean/full e2e. No independent GitHub review submission was recorded, and the generation-11 integration lease is held by another coordinator; therefore no merge is authorized. PR #422 is stacked on #390 with overlapping display-boundary work and must be reconciled by its owners.

## Handoff

1. Read the exact current #437 head and the latest Actions runs; require all relevant checks to be success on that head, not on the earlier test or repair commit.
2. Get an independent source/test reviewer. Apply any real CI defects on this branch only if its ownership is still valid.
3. Recheck open PR/file overlaps and held integration lease before eventual merge; leave draft until qualified. In the meantime rotate to a different unclaimed Pages bug, not a feature or speculative redesign.
