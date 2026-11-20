# GhostPay read-only quality-control review

Review date: 2026-11-19 Pacific (recorded 2026-11-20 06:11 UTC). Worker: `/root/qc_review`.

## Scope and evidence limits

The tested baseline is main at `c977b5d6723f6822c3b5d86cd6b231712c53c395`. This lane reviewed repository instructions, build/test/release configuration, source/test correspondence, pre-existing hosted job logs and recent candidate source. The worker performed no application, test, configuration or repository edits, triggered no CI, and ran no payment, external load or offensive workflow. Files in this scratch directory are intermediate notes for the parent to publish as documentation.

All hosted results below were already executed by GitHub Actions; they are **not new local execution**. New local functional/property test evidence belongs to the core/browser/root lanes. This report independently corroborates their source analysis and checks whether recent candidates already fix it.

## Source applicability refresh — 2026-11-20 06:20 UTC

Main advanced while the pinned-source tests ran. A fresh read-only comparison of complete, untruncated GitHub Git-tree metadata confirms that **neither refreshed main nor PR #306 fixes any of the three findings below**. Their affected source files are byte-identical to the tested baseline. Earlier source locations and all execution results remain attributed to `c977b5d6723f6822c3b5d86cd6b231712c53c395`; source equality is not a fresh test pass for either new head.

| Source | Commit | Tree | Applicability |
| --- | --- | --- | --- |
| Tested baseline | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | `2634456ffa35681e799f71b72bb907f946a77618` | Original executions and findings |
| [Refreshed main](https://github.com/djshellshoxxx/GhostPay/tree/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5) | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` | `09649ff5d549a447fc67957c91dd254e7a53bfbd` | All three affected implementations unchanged; findings remain applicable |
| [PR #306 inspected head](https://github.com/djshellshoxxx/GhostPay/tree/885b9569e6fc99e43bf01d23305494275e10120e) | `885b9569e6fc99e43bf01d23305494275e10120e` | `1df6c1eb364fb5a1c2a152715923649cdf6385f8` | All three affected implementations unchanged; findings remain applicable |

The selected comparison covers 347 existing files: SellerKeys files, all payment-uri and ux-vault files, workspace package manifests and the root lockfile, Vitest/Playwright/TypeScript configuration and GitHub workflows. None was added, removed or changed on either refreshed head. Thus there is no dependency, test-configuration or workflow change in that scope that would explain away a pinned-source finding. Exact path/blob evidence and complete changed-path inventories are retained in `evidence/source-refresh.json`; principal finding blobs are also in `evidence/source-identity.json`.

Refreshed main contains 17 changed files relative to the tested baseline: 14 documentation files and the static-export hosting implementation with two related tests, from merged PR #267. PR #306 contains 34 changed files relative to the baseline: 21 documentation files and 13 other files. Its additional functional changes concern build-profile handling, merchant identity, QR classification/multipart handling and partial scanner workload handling, with associated tests; it also includes main's hosting changes. These unrelated changes still require qualification on their own combined head. The old main CI and current-session test counts must not be reassigned to either new revision.

In the remaining original review, an unqualified reference to main denotes the pinned tested baseline above. Candidate statuses in the original hosted table are retrieval snapshots, not a status claim for refreshed main or PR #306.

## Independent corroboration of new QA findings

### QA-SOURCE-01 — Backup export/verification supersession leaves a stale busy indicator

Priority: P2 correctness/usability; one underlying defect with two action orders. Source corroboration independently confirms browser lane's two failed ordinary deferred-operation checks and two passing controls; this worker did not rerun them.

On main, `apps/web/src/views/SellerKeys.tsx:123–127` aborts and replaces the active operation without resetting the busy state owned by the aborted kind. `startOperation:170–173` calls that helper. Export sets `busy=true` at 219; stale success/rejection callbacks return at 227/248 before clearing it. Verification similarly sets `verifyBusy=true` at 291, returns on supersession at 295/297/301, and the finalizer at 304 only clears the operation kind. The export and verification submit buttons disable themselves independently at 571 and 596, so ordinary users can start the other action while one remains pending.

Consequences: Export → Verify can leave the export button disabled after both operations settle. Verify → Export can retain the Cancel verification state and disabled Verify button even though the underlying verification is obsolete. Navigating away/remounting or another reset can recover the UI; no key loss or transaction defect is claimed.

The failure is **not fixed in inspected newer candidates**. Main SellerKeys blob is `437c684af1fac0f759607bb3fe4f8e37238a3d89`. PR #278 `417f7c71`, #300 `13762896`, #302 `e22c1748`, and #303 `a9e07155` use blob `2c17d389ad6d108a68470e075caf98d0a987cd33`; their only differences are recovery imports/components and suspended-session UI. The four relevant handler blocks are byte-identical, with SHA-256 comparisons retained in `evidence/source-identity.json`. PR #305's SellerKeys content was fetched separately and hashes to the main blob.

Repair handoff: coordinate with the active backup/privacy owner; make cancellation reset the obsolete operation's own UI state or serialize the mutually exclusive controls. Preserve the stale-completion/session guards. Regression acceptance should exercise both action orders, both resolve and reject completion, explicit cancellation, and the existing single-operation controls without weakening crypto costs or timeouts.

Duplicate check: No matching overlap finding/fix was located by targeted search of main and PR #302 audit/handoff records or recent open PR metadata. PR #240's busy/cancellation wording concerns its separate Spec 18 additions and is not evidence that the existing SellerKeys handlers were fixed.

### QA-SOURCE-02 — URI builders can return outputs their own parsers reject

Priority: P2 library correctness; one underlying aggregate-length defect across Bitcoin, Solana and TRON. The core lane supplies the actual valid-field examples and measured output lengths; this lane independently confirms the source and recent-branch persistence.

`packages/payment-uri/src/query.ts` enforces the 2,048-character whole-URI cap in `splitUri`. The builders in `bitcoin.ts:119–141`, `solana.ts:92–104`, and `tron.ts:74–82` validate each decoded field then concatenate percent-encoded fields without checking the final length. The label/message/memo limits in `text.ts` apply to decoded UTF-8 bytes, so combining allowed text and other optional fields can exceed the whole-URI limit.

All five relevant runtime blobs are **identical** across main and PR #278/#300/#302/#303; exact IDs are in `evidence/source-identity.json`. The newer payment-uri changes in this stack only update dependencies and escape equivalent Unicode test literals. PR #303's separate web `format.ts` guard does not address URI length.

Repair handoff: adopt a shared final encoded-output validator for every builder, preserving the existing parser cap and field limits. Add roundtrip-or-typed-refusal properties with maximum valid Unicode text, optional fields and URI families. Include boundaries immediately below/at/above the global limit. Do not silently truncate recipient, memo, label or amount data.

Duplicate check: No matching aggregate-output-length fix was located in the inspected main/candidate documentation or recent open PR search.

### QA-SOURCE-03 — Public decimal parser does not validate its precision option

Priority: P3 exported API-contract defect; not established as an active browser payment failure.

`packages/payment-uri/src/decimal.ts:20–29` accepts `maxScale: number` and reaches a `BigInt` conversion without validating finite integer precision. Invalid fractional/nonfinite precision can consequently produce an ordinary JavaScript `RangeError`, while the README line 15 promises fixed `PaymentUriError` errors. The parser is public via `index.ts:3`. Neighboring `toAtomic` and `formatAtomic` guard integer precision and bounds. The core lane ran the bounded argument checks; this worker confirmed the code.

The decimal source remains blob `8d8ceb070d29d511a1080861f878bbc6d367798f` across main and PR #278/#300/#302/#303. Existing production callers use fixed 8/18 precision, so keep the impact confined to the exported API. Do not confuse it with #301/#303's web amount-formatting fix.

Repair handoff: validate documented precision and maximum-value argument types/domains before conversion or exponentiation; use the package's typed error contract. Cover fractional, negative and nonfinite precision alongside ordinary 8/18 cases. No extreme-load input is necessary.

## Recent branch failure: existing integration work still incomplete

### QC-BRANCH-01 — PR #300 inherits an unwired wallet-attempt identity requirement

Priority: P2 functionality; blocker to calling this candidate fully qualified. This is **existing unfinished dependency wiring with newly inspected failure evidence**, not a new quick-hide regression.

Published head `137628961463fc5abd8b7927b2efe6b18a0a206a` and its tested synthetic merge `67a59cc1d6875ce507dd7af0cb60ef6a5aa1666c` both have tree `da95c2f24426fd9dfd01e38472f07f5dc466cbf9`, independently verified using GitHub's Git data API.

`WalletAttempts.tsx` now displays details only when its optional `wallet` prop supplies the matching account and chain. Yet all four production call sites omit that prop: `views/Pay.tsx:1059/1127`, `features/policy/PolicyPay.tsx:129`, and `features/registry/RegistryView.tsx:272`. Component tests pass explicit wallets, so they do not establish integration correctness.

[Beta job 136045028617](https://github.com/djshellshoxxx/GhostPay/actions/runs/44662861927/job/136045028617) failed two browser journeys, with one passing control. Assertions at `devnet-journey.spec.ts:102/267` expected a submitted transaction hash in the attempt journal but received the connect-wallet prompt. [Pages journey job 136045028292](https://github.com/djshellshoxxx/GhostPay/actions/runs/44662861940/job/136045028292) failed the same assertion at `pages-devnet.spec.ts:376`: ten passed, one failed, five downstream tests did not run.

Pay blob `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` and component blob `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563` exactly match frozen dependency `d6819796`. Its existing `docs/engineering-handoffs/continuous-20261120/privacy-mask-history/AUDIT.md` explicitly handed Pay/Registry call-site integration to the coordinator. Continue that owner work; preserve account/chain gating and duplicate-attempt protection rather than weakening assertions or displaying all accounts again. Retest matching wallet, reconnect after reload, account/chain switch, policy/registry and private-history reveal behavior on the final reconciled tree.

## Hosted baseline and current qualification gaps

| Source/check | Observed outcome | Provenance |
| --- | --- | --- |
| Main CI | 24 successful jobs, none failed/skipped | [44513266929](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266929) |
| Main web coverage | 2,806 passed, one skipped; 200 files passed/one skipped; 93.26% statements, 89.46% branches, 94.8% functions, 97.02% lines | [web job 135728310621](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266929/job/135728310621) |
| Main separate nocov pass | Three tests in three files passed | Same web job |
| Main ux-vault hosted coverage | 284 tests in seven files passed; portable parity's 148 tests took 68.833 seconds; package took 70.26 seconds; 96.37% statements, 93.3% branches, 99.68% functions, 98.66% lines | [rest-2 job 135728310636](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266929/job/135728310636) |
| Main full/lean Chromium | Full: 82 passed/one skipped. Lean: 70 passed/three skipped. | [full](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266929/job/135728310369), [lean](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266929/job/135728310404) |
| Main Nightly contract fuzz | 490 tests passed, zero failures/skips; workflow config specifies 100,000 fuzz runs | [fuzz job 135536698521](https://github.com/djshellshoxxx/GhostPay/actions/runs/44517348833/job/135536698521) |
| Main Nightly | Mythril runner exit 1; fuzz, Slither, Echidna, dependency audit and reproducibility jobs succeeded | [44517348833](https://github.com/djshellshoxxx/GhostPay/actions/runs/44517348833) |
| PR #302 | Beta, Integration, Hosting kit, CLI and Pages succeeded; primary CI queued at retrieval | [CI 44665648856](https://github.com/djshellshoxxx/GhostPay/actions/runs/44665648856) |
| PR #303 | Beta, Hosting kit, CLI and Pages succeeded; primary CI queued at retrieval | [CI 44667213187](https://github.com/djshellshoxxx/GhostPay/actions/runs/44667213187) |
| PR #305 | Beta succeeded; CLI cancelled; primary CI/Pages/Hosting queued at retrieval | [CI 44676042506](https://github.com/djshellshoxxx/GhostPay/actions/runs/44676042506) |
| PR #300 | Beta and Pages failed as described above; Hosting kit succeeded; primary CI queued | [CI 44662861818](https://github.com/djshellshoxxx/GhostPay/actions/runs/44662861818) |

The Nightly job log only establishes the analyzer runner's failure; its underlying report is uploaded as artifact `14539431787`. This lane did not download/triage that report, reproduce a security defect or establish exploitability. Treat it as an existing unresolved gate, not a new vulnerability.

The Pages successes on PRs include two applicable build/journey jobs with release-only gates, attestation, deployment and post-deployment smoke skipped. Those skips are expected for nonpublishing pull requests. They must not be relabeled as production release/deployment qualification.

Full normalized run/job records and exact URLs are in `evidence/hosted-ci-snapshot.json`. Pending states can advance; the repair worker must refresh them before integration.

### Initial local ux-vault interruption and reporter caveat

The coordinator's original current-session coverage run used one Vitest worker and ended after 281.32 seconds with process exit 1 and a `SIGKILL` worker error in `portable-parity.test.ts`. Six other files completed with 136 passing tests. The final text report counted 267 of 284 tests passed, while the JSON report nevertheless used `success: true`, zero failed tests and a passed file status for portable parity despite 17 of that file's assertions remaining pending. Vitest also warned that tests were still running while the JSON report was being generated. The partial statement/branch/function/line coverage of 46.84%/41.67%/50.31%/49.25% failed the configured thresholds.

This lane inspected the saved log and JSON and independently read the exact-main hosted comparison above. The hosted 284/284 pass shows the pinned source has completed this workload previously; it neither diagnoses the local worker termination nor turns the incomplete current run into a pass. The coordinator subsequently reported that a bounded isolated rerun passed all 148 portable-parity tests in 49.61 seconds and that a full-coverage retry remained in progress. That isolated rerun is coordinator-reported evidence, not a new execution by this lane or a completed full-coverage gate.

No consumer that trusts the JSON `success` field was located in the inspected application, scripts or workflows; existing CI relies on the npm process result. Record the initial attempt as incomplete and retain the reporter caveat, **not** an established GhostPay false-pass gate or product regression. Future workers must preserve process exit status, worker errors, completion counts and coverage thresholds when interpreting a partial machine-readable report. Local evidence: `qa-logs/ux-vault-tests.log` and `qa-logs/ux-vault-results.json` in the coordinator's scratch workspace.

## Quality coverage observations for successor

- **Known engine gap:** `apps/web/playwright.config.ts:16–23/35–41` uses Chromium for every project, including the iPhone/iPad descriptors. CI installs only Chromium (`.github/workflows/ci.yml:266`). Firefox, WebKit, real devices and native assistive technology remain unqualified; this is already disclosed in `apps/web/DEVIATIONS.md:258`, not a newly discovered compatibility failure.
- **Known accessibility incompletes:** each main full/lean run records 200 axe route/state observations and zero violations, but 80 observations with `label-content-name-mismatch` incomplete and 25 with `color-contrast` incomplete. These counts overlap states. The records explicitly require manual follow-up; zero violations alone does not clear them.
- **Documentation mismatch:** `apps/web/DEVIATIONS.md:241–243` says only the tag-archive test uses the nocov pass, although three tracked files match that configuration: tag archive, scanner benchmark and million-record scanner workload. This is a low-priority documentation correction, not a weakened coverage threshold; the real CI pass executes all three. Latest candidate documentation should be reconciled rather than blindly copying this old statement.
- **Integration trigger scope:** `.github/workflows/integration.yml:12–25` does not trigger the Docker integration workflow for a root-lockfile-only or core-crypto-only change. Primary CI and scheduled integration still cover their own scopes. Consider an explicit dependency-closure trigger inventory for future repairs; this is a coverage/process follow-up, not a reproduced application defect.
- The million-record scanner fixture uses generated RPC pages and 64 repeated-key records, and the source explicitly discloses that scope. Do not present it as one million distinct-key crypto operations or real remote endpoint capacity.

## Suggested repair sequence

1. Fix the confirmed SellerKeys busy-state supersession defect in a dedicated patch with focused UI regressions.
2. Fix final encoded-URI length validation once across the family builders; retain typed refusal and parser bounds.
3. Repair the exported decimal-option error contract separately.
4. Reconcile the active privacy dependency's wallet-attempt wiring before promoting #300, then qualify the complete browser journeys.
5. Refresh queued CI and triage the existing Mythril artifact using the established defensive review process. Preserve all gate distinctions.
6. Record actual engine/accessibility coverage and update stale test-inventory prose.

No readiness certification, merge, deployment, release or source modification is asserted by this report.



## Coordinator final local qualification update

After the initial interrupted run and the isolated 148-test pass, the full original
ux-vault suite was rerun with one worker and a 1,024 MiB V8 heap limit. It passed
all 284 tests across seven files in 206.16 seconds, exit 0, with the original
coverage thresholds: 96.37% statements, 93.3% branches, 99.68% functions and
98.66% lines. No test, deadline or threshold changed. The initial SIGKILL remains
in the evidence as an incomplete attempt; it does not negate this later complete
pass. Local web/SellerKeys and the original Vitest scanner run retain their own
failed/incomplete outcomes. See TEST_RESULTS.md.
