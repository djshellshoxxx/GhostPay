# GhostPay BUG-ONLY R9 — reject invalid sweep timing urgency (2026-11-21)

## Source pins and scope
- Repository: `djshellshoxxx/GhostPay`; GitHub Pages browser-beta existing `@ghostpay/ux-fees` library behavior only.
- Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (live at discovery).
- Isolated branch: `automation/20261121/bug/ux-fees-urgency-validation-r9`.
- Ownership claim: `2de924f159d2ae7bcb7dd469f99f41ad408d066a` (additive `docs/ai/ACTIVE_WORK.md`).
- Failing regression-first commit: `0f99ed9c3e3881f43d1c84fecd21cfb7137e4959`.
- Minimal source-fix commit: `9bebaba4f9f0788331fc3661880698316a4fdf86`.
- Original `packages/ux-fees/src/timing.ts` blob: `cafc7f958424f87ad867b852607bd2d6ed87a912`.
- Corrected source blob: `a3a58d9e25ac41435e2f86e8530e276f2e9fe7a0`.
- New regression blob: `1d288dabd6ab7f952122957ffdba928f1bbd5f40`.
- Only production edit: `packages/ux-fees/src/timing.ts`; new test `packages/ux-fees/src/timing.urgency-validation.test.ts`. No existing test-file edits.

## Reproduced defect and root cause
`adviseSweepTiming(input)` types `urgency?: 'normal' | 'urgent'`, and the package documents rejection of invalid options, but validates gas/time/numeric options without validating urgency at runtime. Its high-rank branch checks only `input.urgency === 'urgent'`; every malformed urgency behaves as nonurgent. In a source-branch-equivalent test with deterministic local history 1..100 gwei and current 90 gwei, rank=8950 bps, `urgency: 'emergency'` yielded `wait`, whereas a valid `'urgent'` yields `ok`. Invalid input should not silently select either policy.

Regression committed before repair: nine invalid urgency values (`'emergency'`, `'URGENT'`, `''`, `'urgent '`, `0`, `false`, `null`, `{}`, `[]`) require the existing `UxFeesError` and urgency-specific message. Positive controls assert omitted/normal -> `wait` and urgent -> `ok` with unchanged reason key. The original source has no urgency enum validation; each negative case fails against the baseline.

Minimal repair: after the existing `now` check, reject any defined urgency other than `'normal'` or `'urgent'` via existing `fail('urgency invalid')`. No heuristic, enum, interface, fee or privacy change for valid inputs.

## Verification (separate levels)
- Before fix: 90-gwei branch behavior reproduced by direct calculation of the existing source branch (rank 8950; malformed urgency -> `wait`). This is a source-equivalent isolated check, **not** a repository test.
- After fix: extracted the exact new guard from GitHub blob `a3a58d9e25ac41435e2f86e8530e276f2e9fe7a0` and executed it against 9 invalid and 3 valid/default inputs: **12/12 guard-level checks passed**. This is not a full `adviseSweepTiming` execution, Vitest, build, lint, or browser test.
- Source proof: the test-first and source-fix commit SHA order is preserved; changed source and test blobs were independently fetched back from GitHub at the task branch.
- Local checkout `git ls-remote` fails: `Could not resolve host: github.com`. Installed Node 22.16.0 is available, but repository checkout/dependencies/Vitest were not available locally; **do not claim local repository tests**.
- Hosted GitHub CI, repo-wide typecheck/lint/build and native browser: must be read on the *final PR head*, not assumed successful. No separate independent reviewer exists in this run; no independent approval claimed.

## Coordination and gates
- At discovery on 2026-11-21, GitHub reported **179 open PRs**; their changed-filename inventories were inspected in paged batches. None changed `packages/ux-fees/src/`; large PRs #278/#264/#262/#372 change `packages/ux-fees/package.json` but not the owned files. Reinspect at integration.
- PR #390 `b655bc273a6704c9c140287b8adcdf4085b91882` had 39 final reported checks: 36 success, 3 skipped, no failures; 6 associated workflow runs were successful. `list_pull_request_reviews` returned no submitted reviews. GitHub PR metadata says `draft: false`, notwithstanding old draft wording in its description. Do not edit its owner branch or treat CI green as independent approval.
- Metadata-only `automation/ghostpay-integration-lock` HEAD `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: `integration-lock.json` generation 11, status `held`, owner `994a0d214fb9-root-r3`; expiry timestamp is past but not a released-owner handoff. Do not take over or merge.

## Remaining work for next authorized cycle
1. Reconfirm this draft PR exact head, open PR ownership, source hashes and all required hosted CI; diagnose actual failures without changing others' owned files.
2. Obtain full repository Vitest tests, applicable typecheck/lint/static Pages build, and native browser qualification if required and available; distinguish unavailable checks from passes.
3. Obtain review from a *genuine separate verifier*; do not self-approve.
4. Only integration owner with a legitimately released/handed-off lock may merge after all gates green. Do not deploy or release.
5. Rotate to a different, demonstrably unclaimed BUG-ONLY defect on later runs.
