# GhostPay completion and consolidation checkpoint

## Candidate and scope

The product and test inputs are frozen at local `2149ad2814d9ae031b23322f87f74842af5dde78`. This supersedes the earlier `53f4253bd9afc33bea43a7bdfe95ae287e035bf7` freeze with one shared test-fixture field; production code and existing assertions are unchanged between those two checkpoints. Subsequent commits preserve documentation and evidence only. `SOURCE_INPUTS.json` records all 16 selected non-documentation blobs. Independent generation 4 checked the earlier 15 selected blobs, five source ancestors, and 16 protected scopes. The coordinator and integration QA independently checked the additional fixture repair. The current pull request body records the equivalent published commit and exact tree; commit metadata changes during connector publication do not change the verified file tree.

This is an isolated candidate based on canonical PR #278 (`417f7c71`), whose main base remains `c977b5d6`. Existing browser preflight and signer repairs are preserved. No main promotion, deployment, release, real-funds operation, contract change, fee activation or security-gate waiver occurred.

## Implemented and consolidated changes

| Scope | Source and resulting behavior |
| --- | --- |
| Runtime QR classification | Cumulative #295/#290 rejects non-string classification keys before coercion and retains complete flag controls. #285 already matched the canonical source and was not replayed. |
| Multipart QR expiry | #294 prevents rejected conflicting fragments from extending an assembly's idle deadline. |
| Receipt correlation | #298 requires a valid transaction hash matching the submitted hash before accepting receipt state. |
| Receipt status | Fresh generation 2 accepts only zero or one status; malformed statuses retain an uncertain verification outcome and the original submitted journal/hash. |
| Transaction representation | Fresh generation 3 saved regressions; the coordinator completed primitive-string validation for transaction hash and input/data. JSON arrays cannot be normalized into accepted fields. Correct strings, nullish fallback, and no-resend behavior remain. |
| Pages promotion | #292 verifies the exact staged artifact and source binding before promotion, retains independent custody regressions, and clarifies two adversarial fixtures without changing their bytes. |
| Policy test receipts | Generation 7 supplies the exact submitted transaction hash in the shared receipt fixture. Seven original consumer suites pass without changing their assertions, production validation, deadlines or configuration. |

The current failed canonical CodeQL check's two exact annotations were independently retrieved and matched those two test fixtures. Their clarifications preserve malformed input and rejection assertions. This explains the findings; the required CodeQL gate still needs successful analysis on the new candidate.

## New feature kept separate

[Draft PR #300](https://github.com/djshellshoxxx/GhostPay/pull/300) adds an accessible one-way **Alt+Shift+H** privacy quick-hide action. It uses an immutable snapshot of existing masking/history work as its explicit dependency. That existing implementation is credited to its original authors, and their actively changing branches remain untouched. Reconcile the feature's small shell integration with their newest qualified source before integration. The feature does not establish completion of issue #286.

Its author and fresh independent reviewer each passed the same 40 focused cases. Scoped typed lint passed. Fresh generation 9 subsequently passed the original full web TypeScript command once at 1024 MiB in 30.621 seconds; all non-documentation inputs match the published feature. Earlier exit-137 attempts and the later dependency-preflight failure remain separately recorded. Actual browser shortcut behavior and complete hosted qualification remain open. See [the separate feature qualification](../quick-hide-qa-gen9-20261120/README.md).

## Executed evidence at publication preparation

Counts below overlap and must not be added. All runs use original assertions and project gates. Resource flags bound concurrency and memory only.

- QR package: **239/239**, original coverage thresholds pass; typecheck, lint and build pass.
- Pages/CSP tooling: **168/168**, zero skips.
- Changed web QR classifier/frame tests: **87/87**.
- Receipt status: **8 baseline failures /112 controls**, then author **188/188** across four suites. Independent review completed all **122** cases in three files; its Pay UI file was interrupted and remains explicitly incomplete.
- Transaction fields: **12 baseline failures /125 controls**, then coordinator and fresh independent reviewer each **137/137** in the same two suites.
- Full combined web TypeScript: **passed** in the serialized 1024 MiB execution window at the earlier `53f4253b` freeze.
- Original full web coverage at `53f4253b`: **incomplete**, exit 124 at the 900-second external process cap. The lossless output contains 1,467 observed passing case lines and 19 failures, with no complete suite or aggregate coverage result. All 19 failures came from the shared policy receipt fixture's missing transaction hash.
- Repaired policy consumers at `898d3361`: **87/87 in seven files**, with existing assertions unchanged. This focused result resolves the observed fixture failures and does not replace full coverage qualification.
- Original web no-coverage selection: **4/4 in four files** at `53f4253b`.
- Corrected `2149ad28` development Pages build: **passed**, including full web TypeScript, bundling, original CSP/content/lean checks and staged-artifact integrity verification. A separate check of all **16** promoted site files against their hashes and exact source commit passed. The archived output explicitly records `release: false` and no payment-enabled chains.
- Full web lint: the earlier 1024 MiB attempt exhausted its JavaScript heap; one approved 1536 MiB retry ended with exit 137 before diagnostics. Neither is a pass. [Final corrected-source qualification](../integration-qa-gen3-20261120/CORRECTED-QUALIFICATION.md) retains both outcomes and the complete development artifact.

A broad library build was interrupted/killed in the deferred external-pools dependency. Before reusing declarations, the coordinator compared every tracked package input, with test exclusions only where the unchanged build configuration excludes tests. Sixty-four unchanged package outputs were reused; the changed QR package was built afresh. No clean whole-workspace build is claimed. Earlier resource failures are retained, including the 1024 MiB full-lint heap limit and separate feature typing failures.

## Fresh-worker handoffs

The cycle used distinct code-audit, security-audit, feature, bug-hunt, independent-review and integration-QA workers. One generation 3 worker ended after saving its regression commit; the coordinator finished that same narrow task and obtained fresh independent review. Completed workers are not described as continuing in the background.

Initial source review reports are under `../continuous-20261120/code-audit-gen1/` and `../security-gen1-20261120/`. Receipt and transaction repair evidence is in this directory. Independent later reviews are under `../security-review-gen2-receipt-20261120/` and `../security-review-gen4-20261120/`. The initial QR/Pages integration report is under the generation 3 QA directory.

The fresh remaining-source worker completed three bounded older UNKNOWN scopes: #151's lean-core proposals and #40's early security changes are already retained or superseded; no required runtime addition was established. #259 contains documentation-only history, whose complete-section comparison found 157 sections absent from the inspected candidate. The [selective recovery](../archive-recovery-gen6-20261120/README.md) and [fresh independent review](../archive-review-gen8-20261120/README.md) are retained on this evidence branch. All selected source/body hashes match; one already-retained QR section was omitted. Four historical link occurrences point to two paths already absent from their original source; those inherited limitations are recorded without editing archived text. Dated current-status guidance is not imported. Other unfinished/deferred branches remain preserved. This checkpoint does not claim an exhaustive new audit of every historical branch.

Fresh generation 8 independently verified all 16 corrected selected inputs, six source ancestors, 16 protected scopes and seven unchanged policy consumers, with no new blocking source issue in the bounded review. [Its report](../completion-review-gen8-20261120/README.md) does not claim new test execution or broad security certification. [Publication mapping](publication/MAPPING.json) and [readback verification](publication/VERIFICATION.json) preserve exact local/published trees and explicit snapshot-parent provenance.

## Next concrete steps

1. Read the exact published candidate head, required CI/security results and newest evidence-branch receipt. Preserve unresolved failures and source-specific limits.
2. Repair any actual failed assertion or build diagnostic on a distinct branch, then obtain independent review and exact-head qualification.
3. Finish/reconcile the actively owned issue #286 privacy implementation before attaching quick-hide to the current integration. Preserve sole-copy recovery material and existing transaction authority.
4. Complete original browser, coverage, static artifact, CodeQL and release/security requirements. Historical scanner findings, hosted checks on older heads and unit mocks do not qualify the current release.
5. Keep deployment, paid privacy, new fee behavior and real-funds operations outside this engineering cycle.
