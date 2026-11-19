# Live branch-disposition delta after recovery

**292 unique live branches** were observed through all three REST pages (100 / 100 / 92) at **2026-11-19 13:08:39 UTC**. Against the existing 287-branch ledger: **284 unchanged heads, 3 advanced heads, 5 new branches and 0 missing branches**. This is an additive delta; the original ledger is unchanged.

The original ledger was written at `2026-11-19T11:46:49Z` using a remote-ref snapshot at `2026-11-19 11:30:11 UTC`. [DELTA.json](DELTA.json) pins its published Git blob and SHA-256. The full normalized listing and page URLs are in [BRANCH_REFS.json](BRANCH_REFS.json).

## Head changes and disposition rules

Historical dispositions are retained only for the 284 unchanged exact heads. Every new or advanced head is explicitly **needs_review**. Proven ancestry and previously completed scoped reviews are recorded separately and do not qualify a whole branch or release. This refresh performed **zero full-branch semantic audits**, two bounded changed-head source triages, and eight exact ancestry comparisons covering six branches.

| Branch | Change versus prior ledger | Latest observed head | Disposition |
|---|---|---|---|
| `automation/ghostpay-integration-lock` | advanced | `6408563f5508` | needs_review |
| `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard` | new | `b5fc0991eb7c` | needs_review |
| `codex/ghostpay-consolidation-records-20261119` | advanced | `042b2ce3c79f` | needs_review |
| `codex/ghostpay-hosting-timestamp-main-20261119` | advanced | `57dff1ad7706` | needs_review |
| `release/ghostpay-beta-qualification-20261119` | new | `d7e66ff42b1c` | needs_review |
| `repair/ghostpay-276-artifact-races-20261119` | new | `8cbae85c95fa` | needs_review |
| `repair/ghostpay-analyzer-recovered-20261119` | new | `2ba065553dd4` | needs_review |
| `repair/ghostpay-native-fee-recovered-20261119` | new | `cbc96840c3dc` | needs_review |

## Narrow post-publication refresh

The coordinator published another candidate while the census was being recorded. A targeted ref refresh at **2026-11-19 13:11:58 UTC** and CI/ancestry observation at **2026-11-19 13:12:25 UTC** updates only the canonical/analyzer/native branch heads plus current main/lease. Other branch heads retain the full-census timestamp; this packet does not claim an atomic simultaneous snapshot.

Current published candidate: **`d7e66ff42b1caf4858a6152985d8afaaefaee572`**, [draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278). The recovered native branch `cbc96840c3dc4fede90afff55b4dfd94f66784da` and analyzer branch `2ba065553dd4fad13b8ad024ab6123dec418713b` are actual ancestors of that exact candidate according to separate GitHub comparisons. They are recorded as **unqualified candidate ancestry**. Main remains **`c977b5d6723f6822c3b5d86cd6b231712c53c395`**, unprotected. The cooperative lease at `6408563f55081ee941c2036086c025ebf63d2c96` is **released** (2026-11-19 11:41:48 UTC, generation 3); no ownership takeover is implied.

## Current source-specific CI

The candidate has nine Actions runs: three pending and six queued. Its fourteen materialized checks comprise thirteen queued and one skipped Pages deployment-only release gate. There is **no candidate Actions pass**. The successful legacy combined status reflects only Snyk and does not establish complete qualification. On current main, three CodeQL jobs show completed successful analysis steps while six nightly checks remain queued; successful analysis jobs do not establish clearance of existing security alerts.

[REMOTE_OBSERVATIONS.json](REMOTE_OBSERVATIONS.json) preserves the exact source heads, check/run/job URLs, metadata and limited recent-PR refresh. No failing candidate job was reported, so there is no candidate failure log to diagnose at this checkpoint. Queue causes are not established.

## Newly discovered product work

Draft [PR #279](https://github.com/djshellshoxxx/GhostPay/pull/279), `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0`, rejects unpaired UTF-16 surrogate code points before multipart QR encoding. The old TextEncoder path can otherwise replace input text. The small implementation diff and tests are preserved; the original worker reported standalone Unicode checks but no executed repository Vitest run. Root assigned focused independent qualification. **This packet does not mark PR #279 integrated or qualified.** It was created at 12:50:43 UTC, before the previous 12:51 bounded critical-PR refresh; it is newly discovered by this complete census, not evidence of a later source advance. No new Critical or fund-loss change since that bounded refresh was established.

PR #267's advanced head is an earlier main-reconciliation/provenance update from 11:30 UTC. PR #273 also advanced before the prior bounded refresh. Their changed heads require explicit disposition review; old labels are not silently carried forward. No new feature-development wave is proposed.

## Release status

**BLOCKED.** Branch census, exact source identity and preserved ancestry cannot replace complete source-matched CI, browser acceptance, required security review or owner/hosting/signing conditions. No source branch, PR state, main, tag, deployment or workflow was mutated by this read-only task.
