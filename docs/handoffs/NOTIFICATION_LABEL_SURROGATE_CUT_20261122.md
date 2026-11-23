# GhostPay BUG-ONLY R11 — notification label truncated surrogate pair

Status: isolated task branch only. No main integration, release, deployment, wallet, contract, real-world traffic, or feature edits.

## Exact sources and ownership

- Live `main` at discovery: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (2026-11-22 UTC).
- Task branch: `automation/20261122T0218Z/bug/notify-label-surrogate-cut-r11`.
- Claimed ownership before code: `docs/ai/ACTIVE_WORK.md` append in `6d71fa730e7bacc10db61128a2d6d2fd87bdb1e4`.
- New failing Vitest regression: `packages/ux-notify/src/redact.surrogate.test.ts`, committed first at `35191555a5aef7a8554937d0361438ebd5733d79`.
- Minimal production repair: `packages/ux-notify/src/redact.ts`, committed after test at `966731652c910a1aaa86f8a274c1d80de39ec7bc`.
- Baseline `redact.ts` Git blob: `2eb52f0da00abe531284a6f96f2f620e2caddb41`.
- Repaired `redact.ts` Git blob: `19d4c8b3655c7c918065af47c8def4d2b5f8995a`.
- Other worker branches and existing `redact.test.ts` were not modified.

GitHub open PR metadata census: 191 open PRs in three paginated pages. Per-PR changed filenames were inspected for a **bounded 56 PRs** across the newest eight, active notification #409, broad integration/recovery, recent source/QA, and likely owning branches. No inspected PR modified either owned `redact.ts` or new `redact.surrogate.test.ts`. Broad PRs #238/#262/#264/#278/#372 modified `redact.test.ts` and must not be overwritten. PR #409 owns `cache-policy.ts`. **Not an exhaustive 191-PR changed-file audit**: recheck remaining owners and newly opened PRs before integration.

## Defect and executable reproduction

`sanitizeLabel` removes control/bidi characters, folds whitespace and caps output using `.slice(0, max)`, which counts UTF-16 code units rather than Unicode characters. When `max` falls between the two code units of an emoji, the result includes a lone high surrogate. Notification `validateParams` uses the default 40-unit cap; queue lock-screen title uses a 24-unit cap.

- Input `'a'.repeat(39) + '🚀'`, `max=40`: baseline returns 39 `a` characters plus lone `\\uD83D`; repaired returns the 39 `a` characters.
- Input `'x'.repeat(23) + '📬'`, `max=24`: baseline returns 23 `x` characters plus lone `\\uD83D`; repaired returns the 23 `x` characters.
- Root cause: unguarded UTF-16 slicing. Smallest fix removes a final high surrogate from the clipped result. No new output limit, schema, dependency or UI behavior for ordinary valid inputs.

## Verification performed (not repository Vitest)

- Fetched original from exact `main` via GitHub connector and fixed production source from task branch. Reconstructed each complete TypeScript source in a local Node 22 working directory; independently computed both Git blob SHA-1 hashes and confirmed exact matches with the GitHub blob SHAs listed above.
- Node.js v22.16.0 with experimental TypeScript stripping: original accepted both broken outputs; repaired passed **11/11 deterministic cases**, including both boundaries, fully fitting emoji, ASCII cap, whitespace, bidi, and zero/one/two-unit caps.
- **20,000 deterministic Unicode randomized cases** using valid code-point strings, malformed Unicode exclusions, control chars and variable truncation limits. Repaired output had no isolated surrogate and never exceeded the supplied nonnegative bound. 2,356 changed cases were all exactly the removed final high surrogate; no unrelated changes observed.
- **5,000 deterministic ASCII parity checks** matched baseline and repaired outputs.
- Global TypeScript 5.8.3 `tsc --strict --noEmit --target ES2022 --module nodenext --moduleResolution nodenext` on repaired standalone source: **PASS**.
- Initial `node --check` on raw `.ts` produced an unsupported-TypeScript syntax error (not an application defect); the supported stripping/import path and TypeScript compiler checks succeeded.
- New four-case Vitest file is committed **but full package Vitest, workspace lint, build, repository typecheck and native browser tests were NOT executed locally**; local git checkout via `git ls-remote` fails DNS resolution for `github.com`. Hosted exact-head CI and applicable browser checks must qualify.

## Other gates and coordination

- PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882` (now **non-draft**) was checked directly: 39 check runs = **36 success, 3 skipped, 0 failed**, five successful workflow runs, plus Snyk success status; `list_pull_request_reviews` returns **no independent reviews**. PRs #419 and #422 also affect display text. #390 owner branch remains untouched; do not merge on CI alone.
- Integration lock branch `automation/ghostpay-integration-lock` at commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` was read directly. `integration-lock.json` is `held`, generation 11, owner `994a0d214fb9-root-r3`. Expired timestamp alone does not grant ownership. No lease change or merge performed.
- Independent source review by a different verifier: **not available**. This coordinator's second-pass inspection and randomized tests are not a substitute.
- Required before any merge: full changed-file ownership reconciliation, exact-head all-required hosted checks GREEN, applicable native browser qualification, independent review, no active dependencies, and confirmed legitimate release/transfer of integration lease. Until then, keep PR draft and source isolated.

Next round: inspect current PR head and CI (including new job logs for any failures), repair only a confirmed defect on this branch if ownership permits; otherwise select a new unowned Pages-runtime function and repeat regression-first sequence.

## Post-publication complete open-PR path reconciliation

After opening draft #433, GitHub returned 192 open PR entries (100 on page 1, 92 on page 2). All changed-file inventories across those entries were queried successfully, with zero request failures; #433's own changed files were also verified directly. No other open PR modified either `packages/ux-notify/src/redact.ts` or `packages/ux-notify/src/redact.surrogate.test.ts`. The only affected-package overlap is the separately owned legacy test `packages/ux-notify/src/redact.test.ts` in PRs **#224, #238, #262, #264, #278 and #372**, and independent cache-policy paths in #409. None was edited. This supersedes the earlier bounded-56 inventory limitation for that snapshot. New PR heads must still be rechecked before merge.

## Regression review correction (post-publication)

Second-pass source review found that the first `validateParams` fixture used a 39-character `a` string. Existing `containsAddress` detects that as a possible base58 address and intentionally removes it; this would have caused a false-positive test failure unrelated to surrogate handling. We reproduced this independently on the exact source blob: `containsAddress('a'.repeat(39)) === true`, while `containsAddress('~'.repeat(39)) === false`. The targeted fixture now uses 39 `~` characters to exercise the same UTF-16 split without tripping the existing address policy. Corrective regression-test-only commit: `6ebae73d1eabaf2a464a1682e5f427f412784edb`; production fix and untouched security policy are preserved. A complete repository Vitest run still awaits GitHub CI.
