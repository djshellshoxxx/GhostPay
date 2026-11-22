# GhostPay BUG-ONLY — cancellation clock drift across expiry (2026-11-22)

## Exact source and ownership

- Baseline live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `automation/20261122/bug/ux-schedule-cancel-single-clock-11`.
- Ownership registry claim commit: `6d5a2dd5b148b8eb232b5a3d39094ad0661a15b0`.
- Failing regression committed **before** repair: `635a41891e6b82184d08e95535e00e14c46185e8` (new `packages/ux-schedule/src/scheduled.cancel-clock.test.ts`).
- Production fix: `27d280d97592a5035edadd07c2b4a7351f58dd14` (only `packages/ux-schedule/src/scheduled.ts`).
- Exact source blobs before `0e94c51ab5579099d24c9d0d2b1bf070a6a4a09d`, after `c6929785370c72a02f4a447346a101b8f3db4bda`.
- Existing `scheduled.test.ts`, any shared integration branch and all other workers' paths remain unchanged.

## Reproduction and root cause

On `main`, `cancel()` passes the injected `clock` into `tick()` to evaluate expiry, then calls `readClock(clock)` **again** when recording `stateChangedAtMs`. At the inclusive deadline (dueAtMs 10,000 + maxAgeMs 60,000 = 70,000), a resolver returning 70,000 on the first read and 70,001 on the second allows a `cancelled` record timestamped **after** expiry, despite `tick()` declaring that second instant expired. Even far from expiry, a moving clock misbinds cancellation timestamp to a different instant than the state check. The neighboring `confirm()` function already captures one clock sample for this reason.

The isolated Node v22.16.0 control-flow replay copied the exact affected `tick`, `cancel`, `readClock` and helper logic from the above source files. It observed **2 failures among 5 assertions on baseline** and **5/5 passing after the two-line repair**. These are *source-equivalent checks, not hash-matched executed repository modules, Vitest, TypeScript lint/typecheck, build or browser checks*. Neither live network requests nor wallet/contract/fund activity occurred.

## Test-first regression and minimal fix

New Vitest regression checks: (1) expiry-boundary clock advances across calls, (2) normal due cancellation binds to one sample, (3) already expired records remain rejected, and (4) pending cancellation and terminal rejection remain unchanged. The source fix reads a single validated `now = readClock(clock)`, runs `tick(p, () => now)`, and stamps the resulting cancellation with `now`. No API, new dependency, fee, transaction, scheduled execution, chain, or interface change.

## Coordination and qualifications

Before creating the branch, reviewed the **236 currently open PR changed-file inventories** in three paginated groups; no other PR modified `packages/ux-schedule/src/scheduled.ts` or the dedicated new test path. The broad consolidation PRs may own other `ux-schedule` files, but these exact files were unclaimed at selection. Recheck after future concurrent PR updates.

Existing PR [#390](https://github.com/djshellshoxxx/GhostPay/pull/390) remains `open`, non-draft, source head `b655bc273a6704c9c140287b8adcdf4085b91882`. Five exact-head Actions workflows — CI, Pages, Hosting kit, Beta acceptance and CLI operator qualification — were all `completed/success`; the 39 job/check entries include successful web tests, lint, typecheck and native browser jobs, with deployment-specific jobs skipped. GitHub lists **zero submitted reviews**; no independent review approval. PR [#422](https://github.com/djshellshoxxx/GhostPay/pull/422) is a separate stacked display-text reconciliation owned by other workers. PR #390 was not modified.

The metadata-only integration branch `automation/ghostpay-integration-lock` had head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` and its recorded metadata is **held**, generation 11, owned externally; the recorded expiry has passed, but that does not authorize taking it. No merge, lock update, branch takeover, deployment or release attempted.

## Outstanding gates / next handoff

1. Read this draft PR's final exact head and all hosted GitHub Actions checks including focused package `ux-schedule`, lint, typecheck, build and applicable Pages browser suites; repair only reproducible failures in the owned branch.
2. Arrange genuine independent code/test review; a single coordinator's self-check does not satisfy this gate.
3. Confirm dependency/ownership conflicts anew, then wait for legitimate *released or explicitly handed-off* integration lease ownership before any qualified main merge.
4. For the next BUG-ONLY rotation, select a different, unclaimed production file; do not broaden this PR into features, fuzzing, consolidation or deployment.

## Same-branch post-fix edge regression and correction (additive)

Sequential self-review identified a genuine behavioral regression **introduced by the first fix**: the new unconditional `readClock(clock)` occurred even for an already-terminal scheduled payment. Before the fix, `tick()` returned a terminal record without sampling a broken/injected clock and `cancel()` returned the established `bad_state` result. The first fix instead threw if that clock threw. Source-equivalent Node reproduction confirmed the difference; no independent reviewer is claimed.

- Follow-up **failing regression first**: `01f53a567b29560286f3d5269962d85046d861f8` adds a terminal-payment test with a throwing clock.
- Scoped repair **after the regression**: `4b4ac44bd4ac00639929ec04b91874cb958fe85d` adds an early `isTerminal(p.state)` check, preserving `bad_state` without a clock read.
- Final source blob: `1add33701823f9516d0579284dad10cd06ae530f` (initial repaired blob `c6929785370c72a02f4a447346a101b8f3db4bda` is superseded).
- Repeated isolated Node 22.16.0 control-flow replay: both initial expiry/normal-clock baseline assertions fail before repair; all **six** checked behaviors pass against the adjusted implementation, including terminal with a throwing clock. This is **not** actual repository Vitest/typecheck/lint/build/browser execution.
- CI triggered for earlier draft head `4657468527cd6816726691c61c1bc6af730e7945` is **superseded**; require fresh hosted exact-**final-head** CI after the handoff commit. No prior CI result qualifies this changed head.
- Earlier ownership/lock restrictions and independent review requirements remain unchanged. No merge, deployment or release authorized.
