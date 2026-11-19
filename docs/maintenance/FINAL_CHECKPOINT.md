# Final source-pinned execution checkpoint

This checkpoint records actual implementation, publication, review and remaining qualification work. The
assignment is **not fully complete**, and the application is **not release-ready**. No product acceptance is
inferred from documentation checks or from a source-preservation comparison.

## Repository state

The final API census completed at **2026-11-19T08:22:46Z**: **272 remote heads and 262 pull requests**
(58 open, 62 merged, 142 closed unmerged). Main remained
`a36f48da526b818a5940a7a0ed2ae7303ef17056`. The full earlier graph census is pinned at 08:08:41 UTC;
the final ref/PR list and exact check observations are in [final-checkpoint.json](final-checkpoint.json).
Later changes do not retroactively alter either recorded snapshot. Semantic review remains scoped to the
documented workstreams; no repository-wide functional-completeness claim is made.

The [bounded final delta](branch-delta-final.json) fetched all three new and four moved immutable heads. The other
265 refs were unchanged at the identical main baseline. Recomputed/carried-forward graph totals are **172
ancestor-contained heads including main, 87 non-ancestor heads with unique non-merge patches, and 13 non-ancestor
heads without unique non-merge patches**. All 272 heads are accounted for mechanically. Dispositions are 171
SAFE_TO_DELETE_AFTER_VERIFICATION, 16 ACTIVE_DEVELOPMENT, 18 RETAIN_FOR_REFERENCE, 15 REPAIR_THEN_MERGE,
25 DUPLICATE_OR_SUPERSEDED, 22 PARTIALLY_RECOVERABLE and 5 SECURITY_BLOCKED. These labels do not authorize deletion
or certify functional completeness. The #244 Bitcoin source also advanced to `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`.

Changed application heads rehearse cleanly against the pinned main except #260, whose only merge conflict is
`docs/ai/ACTIVE_WORK.md`. Its actual PR base remains #239. Preserve both worker claims if that stack is later
composed into main; a clean textual rehearsal does not replace current-head tests or semantic review.

The integration control ref advanced to `3ae60de55add2763aa7d7a44033d11b96df13adb`. Its owner
`20261119T073600Z-root` recorded **released** at **2026-11-19T08:16:59Z**. This supersedes the earlier
held-lease observation. This execution did not acquire, take over or release that lease. Its one-file control
history must never be merged into application source. A later coordinator must inspect current state and
follow the cooperative acquisition protocol before integration; release does not qualify any PR.

## Completed changes

| Deliverable | Exact source and result |
| --- | --- |
| Main integration performed here | [#214](https://github.com/djshellshoxxx/GhostPay/pull/214), merge `ffd982a7aea2856c186b40ef236a39720a1b81f5`: one audit-ledger file, 110 added lines, independently reviewed and qualified by applicable exact-head checks |
| Separate coordinator's main integration | [#216](https://github.com/djshellshoxxx/GhostPay/pull/216), merge `a36f48da526b818a5940a7a0ed2ae7303ef17056`; not counted as this execution's merge |
| Documentation and historical recovery | [#259](https://github.com/djshellshoxxx/GhostPay/pull/259), `4ff80733a3b36019e2f12fc21a8448e7666b6049`: 158 sections from 10 source files, preserved source ancestry/hashes and 123 checked relative links; 20 documentation paths |
| Recovery safeguard reconciliation | [#260](https://github.com/djshellshoxxx/GhostPay/pull/260), `f3bb7c662274c4a4394324c405b49517ad2b1461`; product source `789e63501c1628d602006dbd324a36f8a9c50d71`: canonical-byte/BOM refusal and event-time sole-copy unload protection, retaining #239 atomic replacement and retry behavior |
| Permanent maintenance records | [#263](https://github.com/djshellshoxxx/GhostPay/pull/263), branch `maintenance/ghostpay-branch-audit-20261119`; this addendum descends from published `d2029c3991373499845ea4b87b45ad7b74465c92`. The PR records its final published head/tree. |

Five new recovery regressions failed against #239 and all five passed against the reconciled runtime. Thirty-four
other cases were deselected by the same filter. The same cryptography, assertions, KDF costs and timeouts were
retained. Historical current-source tooling checks passed 43/43. Production dependency audit reported zero
vulnerabilities. These are bounded results: no whole feature or release acceptance was newly certified.

Full/focused dependency installation and the broader twelve-file recovery run exited 137. The successful focused
runtime diagnostics used 288 hash-verified cached packages and temporary JavaScript emission without typechecking
for nineteen libraries. Repository dependency declarations, build scripts and gates were not relaxed. Complete
install/typecheck/lint/build, combined coverage and full/lean browser qualification remain required.

## Concurrent candidates observed after the detailed census

| PR | Head at the final snapshot | Disposition and review limit |
| --- | --- | --- |
| [#261](https://github.com/djshellshoxxx/GhostPay/pull/261) | `61f2b3729fa4b78c90d43a1ecd8c351e9c22f577` | ACTIVE_DEVELOPMENT. Cooperative lock tooling and automation records; separately owned. Its reported ten lock tests are author evidence, not tests executed by this task. |
| [#262](https://github.com/djshellshoxxx/GhostPay/pull/262) | `b1757f5b797e05ec9549cf0fe897615196c02a1d` | ACTIVE_DEVELOPMENT. Broad feature consolidation; 913 changed paths at inspection. Targeted independent recovery-preservation review passed; whole-tree qualification remains open. |
| [#263](https://github.com/djshellshoxxx/GhostPay/pull/263) | `d2029c3991373499845ea4b87b45ad7b74465c92` before this addendum | ACTIVE_DEVELOPMENT. This documentation-only maintenance candidate; recheck final-head CI after publication. |
| [#264](https://github.com/djshellshoxxx/GhostPay/pull/264) | `bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a` | ACTIVE_DEVELOPMENT. Newly opened PR on the already inventoried master consolidation branch. Source ownership and current-head qualification remain separate; this task did not execute its combined suite. |

Independent comparison of #262 against #260's product source confirmed identical recovery and verification
components, all three related regression-test files, the complete atomic `install()` block, and the loaded-session
event-time `beforeunload` listener. The five added BOM/custody assertions are preserved. Additional session and
AppShell changes remain outside that comparison. This is source preservation, not an executed five-test pass on
#262. Account for this overlap when selecting between the broad candidates and #260; do not merge both blindly or
retire any source branch based on an unmerged candidate.

## Exact-head hosted qualification observations

The following check-run snapshot completed at **2026-11-19T08:21:41Z**. Pending includes queued and in-progress
checks. A check-run list may expand as workflows schedule downstream jobs. Counts are observations, not a claim
that all required checks have been enumerated or passed.

| PR / head prefix | Success | Skipped | Neutral | Pending | Failed |
| --- | ---: | ---: | ---: | ---: | ---: |
| #250 / `22af2074` | 28 | 3 | 0 | 7 | 0 |
| #255 / `ea47fa75` | 14 | 3 | 0 | 20 | 1 |
| #256 / `247c3353` | 11 | 3 | 0 | 2 | 1 |
| #257 / `4f14d6f1` | 17 | 3 | 0 | 17 | 0 |
| #259 / `4ff80733` | 3 | 12 | 1 | 4 | 0 |
| #260 / `f3bb7c66` | 0 | 1 | 0 | 5 | 0 |
| #263 / `d2029c39` before this addendum | 0 | 0 | 0 | 5 | 0 |

### #256 Pages browser failure

[Job 135419605025](https://github.com/djshellshoxxx/GhostPay/actions/runs/44483022090/job/135419605025)
failed step 9, `Pages artifact journey on anvil`, with **15 browser tests passed and one failed**. Dependency,
library, Foundry, Chromium and Pages artifact preparation had succeeded. The tested merge was
`53120a9b8e49c672a31a5a045e57e1c997701086`, combining #256 head `247c3353` with main `ffd982a7`.

The expiry case could not find `This invoice has expired. Nothing was sent.` at
`apps/web/e2e/pages-devnet.spec.ts:1021` after changing the clock and clicking Send. Its subsequent zero-wallet-request
and chain assertions did not execute. Source inspection suggests that the approximately 65-minute clock jump
crosses the default 15-minute idle deadline, allowing capture-phase locking to clear the invoice before the send
handler. The failing page's DOM/trace was not retained, so that cause remains an inference. This is not established
as an environmental failure or an expiry bypass.

Next owner action: reproduce only this case with retained DOM/trace, initialize the payer clock shortly before
expiry before loading the app, and cross expiry by a small interval that does not also cross the idle deadline.
Preserve all zero-wallet-request, nonce, router-expiry and idle-lock assertions. No speculative test weakening or
edit to the other owner's branch was made.

### Security and analyzer blockers

The current-head [#255 Mythril job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476066945/job/135396814239)
failed with exit 1. The historical record contains **11 findings: 3 Medium and 8 Low**. Those records are not eleven
independently confirmed exploits. This execution separately reproduced the main runner's duplicate-JSON masking
gap and #255's refusal of the same input. The Factory freeze residual and stricter configuration-bound acknowledgment
remain documented. No owner-approved exception was applied, no fee-recipient decision was made, and the proposed
disposition helper remains unwired to the strict gate.

The independent local #255 tooling batch remains **78/90 passed, 12 failed**, with one isolated repeat passed.
Timeout contention is suspected, not proven. Native Forge/Mythril execution and external release acceptance were
not performed by this reviewer. Current-source complete analyzer evidence and finding-specific disposition remain
necessary; neither the failed batch nor the failed hosted job can be relabeled as qualified.

## Exact next actions

1. Refresh main, source heads and cooperative lock state before choosing one integration owner and candidate.
2. Finish the applicable exact-head checks for #259/#250/#257. Promote only independently reviewed, qualified work
   through ordinary PR merges with expected-head checks; preserve main/source ownership and deployment controls.
3. Resolve #256's expiry/idle test interaction with a retained focused reproduction. Integrate the reviewed session,
   privacy, scan and recovery sources into one candidate, preserving #260's byte guards, atomic replacement and
   event-time custody checks. Reuse the demonstrated #262 overlap rather than duplicating the patch.
4. Complete #255's strict current-source analysis and residual-risk disposition. Preserve its chain/token-codehash/
   fee/recipient binding over older token-only acknowledgment code. Do not weaken or silently accept findings.
5. Run complete install, typecheck, lint, coverage, production static build and full/lean browser acceptance on the
   selected combined tree. Obtain authentic origin/manifest/runtime/wallet/device/Tor acceptance required by the
   release criteria. Production deployment remains outside this execution.
6. Refresh the inventory after each verified main merge. Review cleanup only after behavior and source preservation
   are established; no active or uniquely useful branch has been deleted.

The [unfinished-work register](UNFINISHED_FEATURES.md) tracks the remaining workstreams. This checkpoint does not
claim that every branch has received full semantic review, that all unfinished features are known or implemented,
or that source-level repairs alone complete their feature acceptance.
