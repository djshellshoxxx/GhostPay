# Private integration and recovered export acceptance

20 November 2026 (Pacific). Coordinator: `539818ee134f-root-r2`.

**A real private integration candidate now preserves #307, the #344 idle/backup/receipt/request-file stack, and #350 including current main. It passes 391 focused tests, both full and lean builds, whole-web typecheck and whole-web typed lint. Separately, [PR #361](https://github.com/djshellshoxxx/GhostPay/pull/361) recovers the existing standalone export interoperability test with 124 focused passes. Shared main, #307 and the held integration record remain unchanged.**

## Actual integration and source preservation

| Input | Exact source |
| --- | --- |
| Existing integration #307 | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |
| #344 idle, backup, receipt and request-file stack | `a88157b53d1e0925350d5c8db047eabb4365f4e9` |
| #350 Scan correction, including current main | `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8` |
| Main included through #350 | `aec179910c39081d820396409ff3139ff2264132` |

The candidate starts from #307. An ownership claim precedes two ordinary two-parent merges: #344 first, #350 second. Application code has no merge conflicts. Both conflicts are confined to `docs/ai/ACTIVE_WORK.md`; each resolution preserves both complete source-labelled registries and states that private merging does not transfer shared ownership.

The tested local application composition is `7ef2b91d0485d42caea97edbbda67b4b5a04580e`, tree `53106efd966f6f70d60be05b96905bd5bc583a74`. Later files in this evidence directory do not change application, package, workflow or test configuration source.

Fresh independent audit recomputes both mechanical merges and compares every path, mode, type and object ID, including deletions. It finds **zero nonregistry mismatches**: 4,195 entries at the first merge and 4,202 at the second. All **2,758 final application entries** exactly match an input donor. All input heads and current main remain ancestors.

| Behavior retained | Intended donor |
| --- | --- |
| Sleep-aware session authority and AppShell lifecycle checks | #344 |
| Newer SellerKeys backup preflight and durable-write ownership | #344, retaining #333 |
| Receipt archive identity and print controls | #344, retaining #335 |
| Real request-file decryption completion synchronization | #344 |
| Newer TRON scan cancellation and its complete test file | #307 |
| Bitcoin fee-floor/cap consistency and regressions | Current main through #350 |
| Repeated-announcement warning correction and regressions | #350 |

The TRON contribution is why substituting #344 wholesale for #307 would be incorrect. The actual merge retains it automatically.

[MERGES.json](MERGES.json) records the exact local parents, mechanical trees and resolved trees. [PUBLICATION_BASES.json](PUBLICATION_BASES.json) maps local execution commits to public API commits: metadata differs, every corresponding full tree is identical, and ordered merge topology is retained. [EXECUTION_HISTORY.bundle](EXECUTION_HISTORY.bundle) preserves the original local claim and merge history; its three published donor prerequisites are recorded in the adjacent index.

## Qualification on the combined source

Fresh original dependency installation and all-library build complete successfully after the workspace reset. Environment: Node 24.22.3, npm 11.19.1, Vitest 5.0.5, TypeScript 5.9.3 and Playwright 1.64.1. The unchanged lock SHA-256 is `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.

| Executed command or complete selection | Result |
| --- | --- |
| Original all-library build | Exit 0 |
| Whole-web TypeScript script | Exit 0 |
| Whole-web typed ESLint script, including source and browser tests | Exit 0 |
| Ten complete web regression files | **166 passed**, zero failures/skips |
| Complete TRON package with its original coverage gate | **107 passed**, ten files, exit 0 |
| Complete metadata-hardening package with its original coverage gate | **118 passed**, eleven files, exit 0 |
| Full production web build and postbuild scan | Exit 0 |
| Lean production web build and postbuild scan | Exit 0 |

The **391 tests** comprise those three selections on this combined application source. The web selection covers session idle locking, AppShell sleep/clock behavior, SellerKeys ownership/storage/recovery, receipt archive identity/regeneration, payment request files and Scan warning behavior. It uses complete files with one worker, without assertion, timeout, coverage-threshold or configuration changes.

TRON coverage reports 97.04% statements, 93.36% branches, 98.93% functions and 99.11% lines. Metadata-hardening reports 99.48% statements, 98.85% branches and 100% functions/lines. Those are package-specific results; the focused web invocation is not the whole-web coverage gate.

[EXECUTION.json](EXECUTION.json) indexes exact commands, source identities, exits, test counts and output hashes. [EXECUTION_LOGS.json.gz](EXECUTION_LOGS.json.gz) retains complete logs losslessly. The original full web coverage/nocoverage stages, repository-wide lint/typecheck, native full/lean browser checks, contracts and other applicable hosted gates remain required on the published composition. Successful donor runs do not substitute for them. No native browser execution is claimed in this restored environment.

## Existing successors now qualified or reconciled

Fresh independent source and hosted-evidence reviews establish:

- **#350**: all 24 jobs in [CI run 44845144737](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144737) pass. Its complete 39-check collection has 36 successes and three expected Pages publication-only skips; Snyk passes. Hosted web coverage records 2,820 passed/1 skipped and a separate original stage with three passes. Tested merge `46762f6668c96675b0dcf237619a3b61f87fc104` has the same tree as the reviewed head. The earlier independent 35-test evidence remains valid separate evidence.
- **#354**: all 24 jobs in [CI run 44857880987](https://github.com/djshellshoxxx/GhostPay/actions/runs/44857880987) pass, including web typecheck/lint and both browser profiles. Hosted web coverage has 4,210 passed/1 skipped plus four separate noncoverage passes. Full browser has 134 passed/2 skipped; lean has 121 passed/5 skipped. The repaired keyboard, changed-account and disclosure/quick-hide scenarios pass. Tested merge `3683ff2607ffee742e26a1096a68c7d803a0c907` has exact #354 tree `f97b2da334d0b245d6e912ad30ea49b01bf3e8b1`. The earlier local exit-137/socket limitations remain historical, while these hosted gates now have successful evidence.
- **#355**: the previously recommended reconciliation is already implemented at `0fb2831a1b89430c69896f6db57306cd5518e55f`. Above #354 it adds only the separate three-case quick-hide test, claim and handoff. All four canonical runtime/unit/browser files are exact to #354. Its successful browser jobs tested older merge `7438e932bf67b34751c75254117f3ee94a3374d2`; current merge `e7eb29ea6e653abaadd38bde5595cd93ad22e40f` and the head share the same tree `e76571b61bfa8afbb745054df7f78e3b39d771e1`. Remaining CI was incomplete at review.
- **#356**: the existing Settings correction remains the authoritative two-expectation successor. Its returned whole-web typecheck/lint and full/lean browser jobs pass; full CI remained incomplete at the retained review. No duplicate repair was created.
- **#359**: retains the existing one-line Promise-returning test-double correction above #345. Its broader CI remained queued at review. No extra policy implementation or duplicate lint fix was created.

The reviews are independent engineering reviews, not formal GitHub approvals. Formal review collections for #350/#354/#355 were empty. Accessible main metadata reported protection off and no rulesets; detailed protection access returned 403 and an effective-rules endpoint was unsupported. No complete administrative-policy audit is claimed.

## Distinct export acceptance recovered in #361

Spec18's implementation source #260 is absent from main/#307, but its relevant runtime and test safeguards are already retained in #354, with later expiry/session protections. Re-importing older runtime would discard subsequent work.

PR #346 supplies a distinct 7,476-byte test absent from #354/#355. It is now recovered byte-for-byte in [PR #361](https://github.com/djshellshoxxx/GhostPay/pull/361), public head `4ccb3db334de7d7cada305a11243c9e3efddc4f6`, based on #355:

- Donor: `37760c3655c48fa190c0f2324072cb506cf1b88d`.
- Exact test blob: `48322f29d828f3fbdf4645c39a461e4044635a52`.
- Independently reviewed local final head: `e678261f6527d487bfaeedc34a7ec957526c5fe9`.
- Exact public/local full tree: `0b09c320d2b9fc1e5cf222da1a57ac5bad885d7e`.

Its six complete files yield **124 passed / zero failures / zero skips**: one application-export interoperability case, 36 existing export/expiry cases, 65 codec/property cases and 22 standalone decoder cases. Original scoped typed lint, secret scan and full diff whitespace checks pass. A later coordinator whole-web TypeScript run on the same tree also exits zero; its separate log is retained here.

The test invokes the real application service at production scrypt cost, clears the application session, authenticates the exact encrypted output in a fresh filesystem-restricted decoder process, verifies redaction and wrong-chain refusal, and derives/signs an offline public challenge using the decoded synthetic payment key. The decoder source is inspected as offline; filesystem permission flags and a parent fetch stub are not claimed to be an independently verified operating-system network sandbox.

This verifies synthetic single-payment interoperability. Browser download, durable backup retention, third-party wallet UI import, actual spending, payment finality, automatic refunds and comprehensive fund-recovery guarantees remain separate acceptance questions. These 124 cases belong to #361's source; they are not added to the private integration candidate's 391 count.

[Complete #361 source and execution report](https://github.com/djshellshoxxx/GhostPay/blob/4ccb3db334de7d7cada305a11243c9e3efddc4f6/docs/consolidation/export-recovery-r2-20261121-539818/REPORT.md).

## Complete frozen inventory and new comparisons

The separately paginated endpoint observation assembled at `2026-11-21T04:34:40.741Z` contains **428 unique remote branch names and 127 unique open PRs**. It is not an atomic GitHub transaction. Five branch pages have counts 100/100/100/100/28; three PR pages have counts 50/50/27. Each final page is shorter than its requested size.

The previous 423-head evidence is reused only where head and target identities are identical: **421 heads / 842 comparisons**. Five added and two moved heads require **14 new comparisons**. No prior names are missing.

| Mechanical classification | Main | #307 |
| --- | ---: | ---: |
| Ancestor/equal | 189 | 199 |
| Documentation/nonapplication difference | 80 | 79 |
| All changed application blobs retained | 7 | 12 |
| Application semantic review required | **150** | **136** |
| Coordination metadata | 1 | 1 |
| Unrelated history | 1 | 1 |
| **Total** | **428** | **428** |

A fresh reviewer independently recomputes all 14 new comparisons, including both criss-cross comparisons with two best merge bases. Complete path unions, modes/types/blobs, absent/deleted paths, patch lists, trees, fingerprints and summaries agree. The reviewer also verifies all original 410 compact rows against their full details.

[SNAPSHOT.json](SNAPSHOT.json), [CAPTURE.json](CAPTURE.json), [EXTEND_CENSUS.py](EXTEND_CENSUS.py) and [CENSUS_EXTENSION.json](CENSUS_EXTENSION.json) retain the inputs, endpoint provenance, reproducible orchestration and compact results. Full new comparisons are in [CENSUS_EXTENSION_DETAILS.json.gz](CENSUS_EXTENSION_DETAILS.json.gz). The unchanged generator is pinned to `3433f7f098b5e61253a102a087dfb7e780dbb730`; previous evidence is pinned to `c7d0e589cca0bb1bbb6c93620808ec2b6aa1b22c`.

The 150/136 counts are differing branch-source classifications, not distinct missing features or merge readiness. The documentation/nonapplication class can contain tooling code outside apps/packages. Later publications, including #360, #361 and this private candidate, are outside the frozen denominator. New #360's UTF-16 query correction is separately owned and is not part of this composition.

## Preparation incident and remaining integration boundary

The old ephemeral workspace exhausted its bytes and was reset. At that point the export worker had committed only a local ownership claim; no test had been copied or run. Published sources and prior evidence were restored from exact commits. Both current worktrees received fresh original installations and builds. No pre-reset runtime proof is presented as verification of the restored candidates.

The durable integration record remains `held`, generation 11, owner `994a0d214fb9-root-r3`, at `c196151daf8233f96045fd205b2d899c9e8cc97d`. Its helper refuses takeover solely because of expiry. The private merges preserve source for qualification and owner handoff; they do not advance main/#307 or transfer this ownership.

Before shared-target promotion: refresh source heads and ownership, review the actual published composition, obtain all applicable successful gates, and preserve the privacy/export lane separately until its later reconciliation is independently qualified. No workflow dispatch, release, deployment, real transaction, forced update or branch deletion is included.
