# F08 offline public-profile viewer recovery — 2026-11-24

## Scope and pins

The coordinator approved recovery of PR #563's bounded offline viewer with a separate native acceptance gate. It preserves existing v1 public-profile verification and full-key comparison. Persona creation, rotation, encrypted identity state, P05/P06 integration and GhostStore catalog attestation remain separate unfinished work.

| Item | Source |
| --- | --- |
| Branch | `integration/f08-offline-review-recovery-20261124` |
| Base | `83c503f970044e1708b3a7493ee7284cd59e0844` |
| Base tree | `db8e94d9b37382dbe83a8a577248b39f6a7b4256` |
| Original donor head retained as a merge parent | `923e1edfb9ac34f8b6855d8ac8516cd835070afd` |
| Original implementation | `23e33b2421fcc44e7e08a6f9751c86d87e9ca4ff` |
| Recovery merge | `3318e5b74d392aeb9667133bb891109b8bfbba89` |
| Qualified product/CI source | `dad346a4e02bf75ec1c1f3cd0628e262b79262af` |
| Qualified product/CI tree | `10c881f99ea17fe46df79b37360b631442b40326` |
| Final fixture/guard source | `6f24ea96850c8b153d329f028c57be88cf4ea6f1` |
| Final fixture/guard tree | `10bbad1f4bd8445a22722e20cf0b02449a4262ee` |

The final guard source differs from the product/build-tested source only in the ownership record and the existing automation-hardening test's green-check fixture. Production and workflows are identical. This handoff is a subsequent documentation-only change.

The worker reused its completed isolated `native-idb-ci` worktree to avoid another source copy. All 68 workspace links point into it; external dependency artifacts are unchanged and 65 package build outputs were copied locally. No dependency install, root-worktree edit, donor-branch edit, remote write or deployment occurred.

## Recovery and preservation

Only `docs/ai/ACTIVE_WORK.md` conflicted. Every current claim and the exact donor claim were retained by union. All product files merged cleanly. Both the original donor head and the complete current base remain ancestors.

The viewer, its 15-case unit file, its two-scenario Playwright spec, and the two-line merchant-panel mount match the donor blobs exactly. Every current value and metadata field in the four locale catalogs is preserved, with fourteen donor `ghostId.review.*` messages added to each. Current critical-message classifications remain intact. Current `packages/invoice-schema/src/merchantProfile.ts`, including the stronger finite/nonnegative-clock guard, is unchanged.

The viewer uses the existing strict schema/signature/size/expiry checks, displays origins as text, compares the entire independently supplied key, and handles expired, replaced, cleared and late results. It has no wallet, signing, storage, network, pin-mutating, payment or future-provider API. Its comparison stays session-local and does not create invoice authority.

The compile-time flag remains default off. Full mounts the viewer only for `VITE_GHOSTID_OFFLINE_REVIEW=1`. Lean selects `AppLean`, which does not import the merchant panel even with that flag set. Shared locale strings can remain in lean output; no byte-identical output claim is made. All fourteen keys are critical, preserving English fallback for machine-drafted catalogs and unchanged native-language approval status.

## Dedicated native job and enforcement

The coordinator approved the structure before implementation. The new `ghostid-native` job has the existing changes/code condition, Ubuntu, `contents: read`, a 30-minute timeout and `fail-fast: false`. Each matrix leg has its own runner and build.

| Exact required check | Profile | Step-local flag | Scenario that must pass |
| --- | --- | --- | --- |
| `ghostid-native (default-full)` | `full` | `0` | Default picker exclusion |
| `ghostid-native (opt-in-full)` | `full` | `1` | Offline review, full-key comparison, zero requests and preserved independent origin pin |
| `ghostid-native (lean-with-flag)` | `lean` | `1` | Lean picker exclusion with flag set |

After pinned checkout/library setup and managed Chromium installation, each leg resolves `GHOSTPAY_CHROMIUM` through Playwright and runs the unchanged spec with the unchanged build/preview configuration:

```sh
npm run test:e2e --workspace @ghostpay/web -- e2e/future-ghostid.spec.ts --project=desktop --reporter=line,json
```

The JSON gate requires exactly one passed test and the intended other scenario skipped, zero runner errors or unexpected/flaky results, the correct passed title and desktop project, and one actually passed attempt. All-skipped, wrong-scenario, concealed-retry, runner-error and wrong-project results fail. Separate per-scenario artifacts retain the report and test evidence.

Ordinary E2E jobs, their artifact identity, native IDB step, Pages workflow, deployment settings and Playwright config are unchanged. Removing the new 82-line job restores the complete original CI file byte for byte and restores the original parsed workflow.

The cloud gate keeps all five previous required names and appends the three exact native names above. Its existing `GATE_JOBS` test adds only this job ID. Static comparison confirms the required-name append is the only cloud-workflow change; existing provenance, exact-head, independent-review, fork and path controls are unchanged.

The first Node workflow run found five failures: the existing automation-hardening all-green fixture supplied only the old five checks, so the stronger gate correctly refused it. A claimed followup appends exactly the three new names to that fixture, preserving every existing test and expected assertion. The complete rerun passes. Initial failures and corrective rerun evidence are retained.

## Local qualification

| Check | Result |
| --- | --- |
| Viewer/merchant-panel/security-classification/privacy suites | 69 passed in four files, including all 15 viewer cases |
| Viewer V8 coverage | Statements 97.05%; branches 94.44%; functions 100%; lines 100% |
| Complete invoice-schema suite | 744 passed in 13 files |
| Invoice-schema V8 coverage | Statements 98.13%; branches 97.8%; functions 100%; lines 99.27% |
| Full web TypeScript and typed ESLint, including E2E | Both passed |
| Existing workflow/build-profile Node tests after fixture repair | 68 passed, zero failed/skipped |
| Locale validation | Four catalogs, zero errors; 473 warnings retained under the existing non-strict gate |
| Source extraction | 2,144 used keys, zero missing English keys, 142 unused keys reported |
| Original pin guard | 114 `uses:` references passed |
| Original secret/egress and transaction-origin guards | Passed |
| YAML and new shell/inline Node syntax | All 11 workflow mappings and new scripts passed |
| Ordinary report-gate simulations | Three intended accepts and six refusals behaved correctly; no browser involved |
| History/blob/locale preservation and diff whitespace | Passed |

There are 881 passed existing/recovered tests in these suites. The focused web invocation used one worker, the four original donor-related suites and coverage restricted to `src/features/future/ghostid/OfflineProfileReview.tsx`. No duplicate whole-web coverage run was performed or claimed. The package command was `npm run test -w @ghostpay/invoice-schema -- --maxWorkers=1`; web typecheck/lint used their unchanged scripts. Local tooling was Node 24.22.3 and npm 11.19.1.

## Three built artifacts

Every mode ran unchanged `npm run build -w @ghostpay/web`, including TypeScript and the original postbuild scan. `GP_COMMIT` pins the artifacts to `dad346a4e02bf75ec1c1f3cd0628e262b79262af`; the original module-report facility recorded the actual application and Worker graph.

| Mode | Original scan | Compiler evidence |
| --- | --- | --- |
| Default full, flag `0` | Passed, 19 files | Viewer `renderedLength: 0` |
| Opt-in full, flag `1` | Passed, 19 files | Viewer `renderedLength: 6396` |
| Lean, flag `1` | Passed, 17 files | Viewer and merchant-panel modules both absent; original lean application/Worker guards pass |

Existing chunk-size and QR dynamic/static-import build warnings remain warnings. No scanner, threshold or guard was relaxed. Compiler evidence is not native browser acceptance.

## Remaining acceptance and receipts

No native browser was launched or counted as passed locally. The final published composition must pass all three new hosted native checks and the ordinary/security gates before main integration. Root owns independent final review, composition, publication and merge authority. Default activation, deployment and provider-completion status remain unchanged.

Scratch receipts and source-pinned build artifacts are under `/workspace/scratch/f80482f352bc/f08-qualification/`. `results.json` records source/guard pins, donor blobs, preserved messages, test results, artifact hashes, module evidence and native limitations. `static-workflow-review.json` records the exact additive enforcement diff. The original donor handoff remains unchanged at `docs/handoffs/F08_OFFLINE_MERCHANT_PROFILE_REVIEW.md`.
