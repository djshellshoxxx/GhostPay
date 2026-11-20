# GhostPay consolidation continuation — 20 November 2026

This continuation recovers unique branch behavior into reviewed candidates and completes bounded unfinished features in parallel. Source revisions remain separate from later qualification evidence. Main is still `aa3df1cb37274fae73af0ca957183c15c51b62d3`; no main merge or deployment is claimed here.

## Published work

| Work | Candidate and dependency | Actual local qualification |
| --- | --- | --- |
| Retention preference reconciliation on focus | [#327](https://github.com/djshellshoxxx/GhostPay/pull/327), on #326 | 51 tests; original web typecheck/lint |
| Complete ordered TRON block ranges | [#329](https://github.com/djshellshoxxx/GhostPay/pull/329), on #321 | 107 package tests and 50 web TRON tests in separate suites; original library/package/web checks and full production build |
| Sleep-aware, session-owned idle locking | [#331](https://github.com/djshellshoxxx/GhostPay/pull/331), on #325 | Complete original web gate: 3,155 passed, 13 existing skips, zero failures; original web typecheck/lint and lean build |
| Backup preflight and durable-write ownership | [#333](https://github.com/djshellshoxxx/GhostPay/pull/333), on #331 | 246 compatibility tests, including the separate 22-case GREEN set; original web typecheck/lint and lean production build |
| Receipt archive identity and pending-write ownership | [#335](https://github.com/djshellshoxxx/GhostPay/pull/335), on #333 | 57 tests across nine complete compatibility files, including the 13-case receipt set; original web typecheck/lint and lean production build |

A separate acceptance follow-up, [#336](https://github.com/djshellshoxxx/GhostPay/pull/336), repairs the inherited wallet-disclosure steps on #327. Original web typecheck/lint and static discovery pass; actual corrected hosted browser acceptance remains pending.

These reports retain expected regression failures before each correction, independent review, exact commands, dependency provenance and raw outputs:

- [Retention focus](https://github.com/djshellshoxxx/GhostPay/blob/9608ec996fb159f11b84b9baec0b48033a48a6a5/docs/privacy-release/evidence/retention-focus-20261120.md).
- [TRON range](https://github.com/djshellshoxxx/GhostPay/blob/cff631b5c32a86adfa2d79c342e497e91a8573a5/docs/consolidation/continuation-r2-20261120/TRON_RANGE_QUALIFICATION.md).
- [Idle recovery](https://github.com/djshellshoxxx/GhostPay/blob/f5e04a30bd538b5dba6202885c8e1c3cceb31fa3/docs/consolidation/idle-session-r2-20261120/REPORT.md).
- [Backup ownership](https://github.com/djshellshoxxx/GhostPay/blob/3172a93ceb8fce5a4343a93b453dcc0e68f09d87/docs/consolidation/backup-preflight-r2-20261120/REPORT.md).
- [Receipt identity](https://github.com/djshellshoxxx/GhostPay/blob/e31a090501b3f5e77afcee812323e6f69e1fd565/docs/consolidation/receipt-identity-r2-20261120/REPORT.md).

Test totals overlap across candidates and must not be added together. Static browser collection is not browser execution. Local builds are not releases or deployments.

## Complete idle web qualification and later-source boundaries

The complete original web gate passed on local `7417881ac7f243b50f7b5c1682c66a4e3f87c736`, tree-identical to frozen published #331 `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`. Coverage ran 3,152 passing cases with 13 existing skips; the original separate nocov stage ran three passing cases. The combined result is **3,155 passed, 13 skipped, zero failed**. All 13 skip identities match the earlier #307 baseline. The focused 575 cases overlap this suite and are not added to it.

Measured statement/branch/function/line coverage was **93.38% / 89.76% / 94.99% / 97.07%**, above the unchanged **90% / 85% / 90% / 90%** thresholds. The successful complete attempt ran from 18:46:06 to 19:11:16 UTC. Attempt 1 lost its process session without a final exit or test report; its original partial bytes are retained, with no verdict or count contribution. Attempt 2 started only after no runner remained and changed no source, assertions, configuration, skip list or threshold.

The original lean build and postbuild scan passed, producing 17 files totaling 2,492,248 bytes, with `GP_COMMIT` set to the published #331 head. The original large-chunk warning is preserved. [Complete evidence](https://github.com/djshellshoxxx/GhostPay/blob/ebc3fea4640e2a82585a6cfb73a97fbf0b907949/docs/consolidation/idle-session-r2-full-20261120/REPORT.md) is a separate docs-only child of frozen #331. The coordinator independently verified all 25 lossless artifact wrappers and exact public/local evidence-tree identity.

This full-suite result belongs to #331. Later #333 and #335 have their own focused compatibility and original typecheck/lint/build evidence; neither is represented as having run the complete web suite locally. Backup builds retain their actual local runtime commit in build metadata. Receipt qualification retains the initial failed typed lint attempt and its independently reviewed two-line test callback correction. Runtime and assertions were unchanged by that correction; the corrected 57-case compatibility set and all original gates passed. Receipt archive serialization is per panel, not a global queue.

## Independently qualified donors

[TRON cancellation #321](https://github.com/djshellshoxxx/GhostPay/pull/321) remains frozen at `87c3bf5a59f4d443c9e5cf81368162554a5315c3`: all 106 original package tests and package typecheck/lint/build passed. [Separate evidence](https://github.com/djshellshoxxx/GhostPay/blob/437cddb9e012786fe5f6cbcdc1536841aa4ce77a/docs/consolidation/continuation-r2-20261120/TRON_ABORT_QUALIFICATION.md) leaves its source unchanged. These tests overlap the 107-case range suite.

[Vault rekey revocation #328](https://github.com/djshellshoxxx/GhostPay/pull/328) remains frozen at `81598d93dd82cc440526c866d42b55be0657895b`: the tests-only failure was reproduced, then all 285 original ux-vault tests passed. Coverage was 96.37%/93.31%/99.68%/98.66% against unchanged 95%/90%/95%/95% thresholds. Original package typecheck/lint/build passed; independent review approved. [Lossless evidence](https://github.com/djshellshoxxx/GhostPay/blob/b9911c7228e95a3f8a6666d10aae50bcda08bd7d/docs/consolidation/continuation-r2-20261120/VAULT_REKEY_QUALIFICATION.md) is on a separate documentation branch.

[Optional BTC fee configuration #334](https://github.com/djshellshoxxx/GhostPay/pull/334) remains frozen at `9dcd2d88ff32060e519ef18e2d8753691b56abc1`. Two intended tests-only failures reproduced while 20 controls passed. All **118 original package tests across 11 files** then passed with zero skips. Coverage was **99.48% / 98.85% / 100% / 100%**, above unchanged **95% / 90% / 95% / 95%** thresholds. Original typecheck/lint/build passed. Independent review approved with a nonblocking missing arithmetic-overflow policy test; compatibility claims are limited to valid defaults and normal finite rounding/cap behavior. This is an optional testnet helper correctness fix, with no claim of a current lean Pages fund-loss effect. [Separate lossless evidence](https://github.com/djshellshoxxx/GhostPay/blob/aeb6cb376865443cb83af2a76fc6abfe7b7e4b7a/docs/consolidation/continuation-r2-20261120/FEE_FLOOR_QUALIFICATION.md) preserves all 14 original artifact wrappers and leaves the donor source unchanged.

## Branch comparison

The [frozen census](https://github.com/djshellshoxxx/GhostPay/blob/cff631b5c32a86adfa2d79c342e497e91a8573a5/docs/consolidation/continuation-r2-20261120/BRANCH_CENSUS.md) enumerated 387 refs at its recorded time, including 107 requiring semantic disposition. Later branches and #330's census use different observation times and scopes.

[R3](remaining-branches-r3.md) covers 12 refs/11 heads and identifies the backup behavior recovered in #333. Other scoped browser/payment/adapter behavior is retained or stronger; [historical evidence](historical-pay-r3.md) records the boundaries. Six workflow/dependency/contract heads are separately deferred.

[R4](remaining-semantics-r4.md) adds exact touched-code comparisons for 75 refs. These are mechanical comparisons, not 75 semantic approvals. Twelve scoped finding groups cover 17 donor heads. The JSON preserves the full 6,053,869-byte comparison losslessly with verified length and SHA-256.

Private scan journals, frame/origin guards, clipboard cleanup and native Sweep fee review remain in the broader required-v1/v1.1 stack. Reconciliation must preserve the smaller stack's newer idle, backup, Sweep authority, QR and amount behavior. Bitcoin #244/#254 retain differing consent/spentness designs; neither entire implementation was selected. Legacy-payment migration and persistent-record retention remain unresolved. F04/F05/F10 retain their owners in #322/#323/#324.

## Hosted and coordination gates

**Latest refresh: 19:47:05–19:47:08 UTC, after #336 publication.** [All twelve source/base pairs remain unchanged](LIVE_STATUS.md); every candidate retains pending work and none has the final TypeScript/contracts aggregates. #326 and #327 each have two failed acceptance jobs. #327’s completed jobs show the same missing-disclosure symptoms, and their tested merge tree equals #327’s frozen source. [Complete additional logs](PR327_HOSTED_FAILURES.json) preserve that actual immediate-base failure evidence. #336’s corrected browser jobs remain pending.

The [final eleven-candidate snapshot](hosted-gate-final-r2.md) reads checks at **19:32:20–19:32:21 UTC**, with source/base guards refreshed through **19:35:47 UTC**. Every candidate retains queued or running work. #326 has two actual browser assertion failures: [Pages artifact job 136457928140](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154719/job/136457928140) and [beta acceptance job 136457926770](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154517/job/136457926770). Setup, compilation and browser installation succeeded; the browser journeys failed while waiting for payment controls or the expected wrong-chain message. The full original logs are retained losslessly and independently byte-verified. These are failed jobs, not infrastructure-only gaps.

The final TypeScript/contracts aggregate checks are still absent. Passing Snyk statuses and individual completed jobs do not establish complete acceptance. #307's lean E2E job passed; #325's Pages, beta acceptance, hosting, CLI and Tor workflows passed, while general CI remained pending. Publishing/deployment skips follow the original conditional rules. Branch protection remains unenumerated; no queue cause is inferred. The [earlier nine-candidate snapshot](hosted-gate-review-r2.md) is preserved as dated historical evidence.

Dependency order remains #307 → #325 → #331 → #333 → #335; #321 → #329; required-v1.1 → #326 → #327 → #336. #328 and #334 are independent candidates on main. Shared-target integration requires fresh heads, all applicable completed gates, source review and coordinated ownership.

Main and control refs remained unchanged. The integration-control ref is `849b20733e6fd396a1ed354b284335019500946b`, released generation 8. Only the earlier release timestamp's canonical millisecond representation was repaired; its instant, owner and generation were preserved. No new lease was acquired and no main merge occurred.

## Hosted-failure correction and remaining work

The failed devnet drivers omitted the wallet disclosure decisions now required by the inherited runtime. [#336](https://github.com/djshellshoxxx/GhostPay/pull/336), published `410353a23631234aa888e46f38df22291c699a26`, recovers the three-file test-driver correction on frozen #327. Its qualified local source `420df3b55be2a4207950f312d2b0bd5b899602e2` maps to public `a09092574d98596dd139971250c81dcbb775859f` with identical tree `c47596d02196c1d2cb38040a2f52fe24bd4d3081`.

The correction preserves all 427 original assertion lines and uses the existing exact-method disclosure helper for 17 explicit decisions. Expiry/dry-run refusal remains before disclosure; duplicate and silently changed-network refusal follow the existing post-disclosure checks. Independent coordinator review approved the exact source. Original full web typecheck and typed lint passed in 23.924 and 58.531 seconds. An initial missing test-only workspace-link failure is preserved; the corrected dependency closure uses an offline exact-lock installation and the checkout's own source-matched compiled packages. No runtime, workflow, retry, timeout or skip policy changed.

Dedicated static collection discovers all 3 devnet and 16 Pages cases. Default full/lean lists discover 136/126 cases and overlap. These are discovery counts, not browser passes. [Source-pinned report and 28 lossless artifacts](https://github.com/djshellshoxxx/GhostPay/blob/410353a23631234aa888e46f38df22291c699a26/docs/consolidation/devnet-wallet-consent-r2-20261120/REPORT.md) retain the original failed jobs, prerequisite failure, passing local gates and review. The coordinator independently byte-verified all 563,200 original artifact bytes. Actual corrected browser acceptance is still required; the failed #326 jobs remain failed.

[Source mapping](SOURCE_MAP.json) verifies 26 ordered local/public commits across the five recovered feature candidates and this acceptance follow-up, including retained donor merge parents. [Broader-stack comparison](STACK_OVERLAP.json) records 67 paths changed by both stacks: 32 matching blobs/modes and 35 different final blobs. Those 35 are review points, not a count of merge conflicts. No broad merge or application simulation is claimed.

The remaining consolidation work is the deliberate reconciliation of broader required-v1/v1.1 behavior, the preserved Bitcoin consent/spentness alternatives and legacy-payment migration policy, persistent-record retention, and separately owned F04/F05/F10 work. Publication and local qualification do not mark those features complete or replace the unfinished hosted gates. Original donor branches remain available for provenance.
