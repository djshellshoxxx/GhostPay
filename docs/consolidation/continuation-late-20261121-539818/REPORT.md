# GhostPay continuation handoff

20 November 2026 (Pacific). Coordinator: `539818ee134f-root`.

**Two bounded successors are published, focused regressions are qualified, and the branch inventory is extended to a frozen 423-head snapshot. Main and the shared integration branch are unchanged. Consolidation remains open pending source-specific qualification and coordination ownership.**

## Published changes and evidence

| Work | Exact source | Result |
| --- | --- | --- |
| [Privacy successor #354](https://github.com/djshellshoxxx/GhostPay/pull/354) | `8ce7f1db452167311876bd0707778c2e9c64f3df`, parent #352 `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94` | Restores safe focus after disclosure; corrects keyboard traversal and changed-account cancellation browser expectations. 68 distinct focused tests pass. |
| [Settings successor #356](https://github.com/djshellshoxxx/GhostPay/pull/356) | `82ab06f1bb6fc4b9df2b4ac87679a4029987a284`, parent #353 `a8c10a965f726a6c2dc8eb7391f495df833b3e9b` | Corrects exactly two expected persisted relayer URL strings. 21 tests pass across three complete files. |
| [Independent Scan review #350](https://github.com/djshellshoxxx/GhostPay/pull/350) | `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8` | Existing duplicate-announcement correction reviewed; 35 tests pass across the helper and complete Scan component file. No new Scan source was authored here. |

These results are separate source-specific executions. They are not one combined integration test run. Both new PRs remain draft.

### Privacy qualification

The original presenter fails four new regression cases while nine pass. The repair passes all 13 presenter cases. A separate clean-worktree reviewer reproduces the same failing baseline and passing result. The complete presenter/controller/quick-hide selection passes 51 cases, and the complete wallet lifecycle file passes another 17: **68 distinct cases**, excluding the repeated independent replay.

The implementation rejects unusable openers, attempts valid opener focus, verifies that focus actually moved, and otherwise uses the existing neutral privacy control. Replacement-dialog focus ownership is preserved. The browser fixtures retain keyboard navigation checks and strengthen the zero-send assertions for a changed wallet account.

The original all-library build passes. The combined initial test attempt had a killed worker and is retained as a failed command. Whole-web compilation and scoped typed lint exited 137; native Chromium exited before assertions because `socket()` was denied. Those outcomes do not qualify compilation, lint or browser behavior on #354. Applicable hosted checks remain required.

[Complete privacy report, source review and lossless execution archive](https://github.com/djshellshoxxx/GhostPay/blob/8ce7f1db452167311876bd0707778c2e9c64f3df/docs/consolidation/privacy-browser-20261121-539818/REPORT.md).

### Settings qualification and coordinator review

Both original #353 cases reach the final explicit Save assertion, then fail because their expected relayer URLs contain a trailing slash. The established `checkRelayerUrl` implementation removes trailing slashes; the existing settings validation tests expressly assert that contract.

The correction removes only those two expected trailing slashes. Inputs, draft retention, storage assertions, production source, timeouts and gates are retained. The independent worker records **2 failures before correction**, then **21 passing tests / 0 failures / 0 skips** across the partial-import, settings validation and Settings exchange files. The required differing workspace packages build with original scripts.

The coordinator independently checked the complete patch against the parent, the normalization source and existing tests, every recorded source blob, and every complete execution-output hash. Full diff whitespace and repository secret scanning pass. The fetched public tree is exactly the reviewed local tree `419bf4cd527fca0e3bcfd27f6ff4a97599fa4098`; its sole parent is the original #353 head.

[Settings review](https://github.com/djshellshoxxx/GhostPay/blob/82ab06f1bb6fc4b9df2b4ac87679a4029987a284/docs/consolidation/continuation-20261120-539818/PR353_REVIEW.md) and [complete execution evidence](https://github.com/djshellshoxxx/GhostPay/blob/82ab06f1bb6fc4b9df2b4ac87679a4029987a284/docs/consolidation/continuation-20261120-539818/PR353_EXECUTION.json).

## Integration failure and existing qualified successor

The [#307 CI run](https://github.com/djshellshoxxx/GhostPay/actions/runs/44836230375) finishes **failed**. Its web test job reports **3,084 passed / 1 failed / 1 skipped**. The failure is:

`Pay request-file intake > uses the existing passphrase flow without previewing private fields`

At `Pay.requestFile.test.tsx:85`, the test cannot find the Review payment heading while the UI still shows Reading invoice / Opening invoice. The separate compiler, lint and full/lean browser jobs pass; the downstream TypeScript aggregate failure is not a separate compiler defect.

Existing [PR #344](https://github.com/djshellshoxxx/GhostPay/pull/344), head `a88157b53d1e0925350d5c8db047eabb4365f4e9`, already supplies the request-file test synchronization repair. Its [CI run](https://github.com/djshellshoxxx/GhostPay/actions/runs/44836839436) now finishes **success**, with **all 24 returned jobs successful**, including compiler, lint, contracts, full and lean browser checks, and aggregates. The web coverage stage has **3,184 passed / 1 skipped**, followed by the original separate noncoverage stage with **3 passed**. All 17 request-file cases pass, including the previously failing scenario. The returned Pages, Beta, Tor and Hosting workflows also pass.

Hosted jobs ran GitHub PR merge checkouts, not the bare branch heads:

| PR | Web job | Tested merge checkout |
| --- | --- | --- |
| #307 | `136643807136` | `a55b0d07f4df48488929d742c935886ac2ecbd91` |
| #344 | `136644173665` | `e9b1e3eb40f9e29ac78bf7bc65628d221354c155` |

[HOSTED_WEB_EXECUTION.json](HOSTED_WEB_EXECUTION.json) indexes source URLs, checkout pins, counts and hashes. [HOSTED_WEB_LOGS.json.gz](HOSTED_WEB_LOGS.json.gz) preserves both complete UTF-8 logs losslessly. These passes apply to those recorded checkouts; a later composition still requires its own gates.

## Frozen branch inventory

The inventory froze origin-tracking refs at **18:56:49 PST on 20 November 2026** (`2026-11-21T02:56:49Z`). It includes **423 unique names**, with all original 410 names retained. Their heads and both target SHAs are unchanged, so **820 exact head/target comparisons** are reused. The original generator's functions compute the 26 comparisons for 13 added heads. A separate reviewer independently recomputes those 26 comparisons and finds no discrepancy.

| Mechanical classification | Main | Integration #307 |
| --- | ---: | ---: |
| Ancestor or equal | 189 | 199 |
| Documentation/nonapplication difference | 79 | 79 |
| All changed application blobs retained | 7 | 12 |
| Application semantic review required | **146** | **131** |
| Coordination metadata | 1 | 1 |
| Unrelated history | 1 | 1 |
| **Total** | **423** | **423** |

Targets are main `aec179910c39081d820396409ff3139ff2264132` and #307 `5a745d4b5fba69b66a9779f88aefc63c253a4f27`. Every frozen pair matches an origin-tracking ref; local branches are not added separately.

The 146/131 counts measure differing branch source, not distinct missing features, defects, or merge readiness. Stacked branches can carry the same differences repeatedly. The snapshot includes #353 before its correction and #354; #356 and this later evidence publication are outside that denominator. It is a frozen fetched-ref inventory, not an atomic observation of every future GitHub ref.

[CENSUS_EXTENSION.json](CENSUS_EXTENSION.json) contains the compact index and summary. [CENSUS_EXTENSION_DETAILS.json.gz](CENSUS_EXTENSION_DETAILS.json.gz) contains all frozen heads and full new comparisons. The original generator and complete reused rows are pinned to commit `3433f7f098b5e61253a102a087dfb7e780dbb730`; the generator SHA-256 is `21073be46a1b54cab3541b30bc3ae0c1189d2eb9293c5791eb8e487b1e71dfac`. The extension's inline orchestration was not retained as a standalone script; its frozen inputs, outputs and exact generator provenance are retained.

## Parallel privacy work to preserve

[PR #355](https://github.com/djshellshoxxx/GhostPay/pull/355), head `f11792f7b9202512f0bf980a03f057e8a15836ae`, opened after #354 from the same #352 parent. Independent comparison finds equivalent runtime conditions and behavior, differing only in predicate order and a comment. Its actual PrivacyQuickHide/SensitiveContent composition adds useful hidden/inert focus regressions; #354 supplies additional fallback cases and both browser corrections.

Neither PR is a complete superset. Keep #354 frozen for its current qualification. At the later composition, retain #354's implementation and browser corrections and incorporate #355's distinct harness/test cases additively, preserving donor `2affd298c364c284d4d74f703fd4a612cc0f16d9` and both histories. Replacing either test file wholesale would lose coverage. This comparison was read-only; no combined source was created or qualified.

## Current gates and next action

The CI snapshot at **19:02:30 PST on 20 November 2026** is preserved in [CI_SNAPSHOT.json](CI_SNAPSHOT.json):

- #307: CI failed on the recorded request-file case.
- #344: all 24 CI jobs and all returned associated workflows successful.
- #350: CI queued; Pages, Beta, Hosting and CLI qualification successful.
- #354: CI and Pages queued; Beta in progress; Hosting successful.
- #356: returned CI, Pages, Beta, Tor and Hosting workflows queued.

Workflow/job reads are first-page snapshots. #344's returned 24-job collection is complete; the collections do not independently prove every repository protection requirement.

The shared integration record remains held at generation 11 by `994a0d214fb9-root-r3`, commit `c196151daf8233f96045fd205b2d899c9e8cc97d`. Its expired timestamp does not grant takeover under the repository's coordination rules. Main, #307, the lease, source branches, releases and deployment have not been changed by this continuation.

The integration owner can now use the successful #344 evidence, preserve its #331 → #333 → #335 → #344 stack, wait for applicable #350/#354/#356 checks, incorporate the distinct #355 tests once, and qualify the resulting composition before advancing a shared target. This handoff does not mark all features or branches consolidated. All independent workers for this continuation have finished; no background polling or execution is represented as active.
