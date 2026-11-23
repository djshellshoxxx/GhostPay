# R38 — source-pinned GhostPay consolidation and beta handoff

Date: 2026-11-22 UTC. Protected main: eb59d93cffed7848c4aac37d0e9650b87239c6da. No mainline integration, force push, deploy or release.

## Reconciliation

- BRANCH_HEADS.json freezes 531 branch names/SHAs from REST pages 100/100/100/100/100/31/0; independent GET /git/matching-refs/heads returned exactly 531 names and hashes, with zero mismatches or extra refs. The census precedes subsequent commits on this documentation branch.
- Against immutable R37 snapshot a3ac91c8f38b99c25749ba1a87ba308c9f1f5a2e: 528 unchanged, two new (R38 docs claim and OP Stack #463), one advanced (#462 code+ledger), zero removed. Unchanged historical source classification is inherited, not re-proven by this round. Fresh compare: #463 eight ahead/zero behind main (four paths), #462 six ahead/zero behind (six paths), no divergent base.
- OPEN_PRS.json freezes 222 open PRs from REST pages 100/100/22/0, 130 targeting main and 92 stacked; 167 drafts/55 ready. R37 inventory comparison: two new #462 and #463, zero changed existing head/base and zero closed, three old PR draft-to-ready transitions (#454, #458, #461). Newly added #462/#463 were subsequently promoted from draft during R38.
- Main remains eb59d93cffed7848c4aac37d0e9650b87239c6da. The 59 historically capped donor histories are NOT qualified: GitHub compare exposes only up to 300 paths for very large histories; no wholesale donor merge is justified.

## Verified R38 code/CI advancement

Exact-head code and regression-test diff inspections; five hosted workflow groups each successful, and each CI workflow has 24/24 successful jobs. Submitted COMMENT-only source reviews and marked the following four PRs ready for independent approval:

| PR | SHA | CI run | Review | Source effect |
| --- | --- | --- | --- | --- |
| [#462](https://github.com/djshellshoxxx/GhostPay/pull/462) | a3ac91c8f38b99c25749ba1a87ba308c9f1f5a2e | [45012680007](https://github.com/djshellshoxxx/GhostPay/actions/runs/45012680007) | [6011911989](https://github.com/djshellshoxxx/GhostPay/pull/462#pullrequestreview-6011911989) | Block same-ID/different-symbol fee total collision |
| [#463](https://github.com/djshellshoxxx/GhostPay/pull/463) | 149300330d59642e1e97b76231ac1bea3200a973 | [45013872920](https://github.com/djshellshoxxx/GhostPay/actions/runs/45013872920) | [6011912164](https://github.com/djshellshoxxx/GhostPay/pull/463#pullrequestreview-6011912164) | Contain malformed OP Stack transaction serialization before fee oracle query |
| [#458](https://github.com/djshellshoxxx/GhostPay/pull/458) | dd8f82d9ed3ae5f2c0c342de833a6b419a0d3a54 | [45011648630](https://github.com/djshellshoxxx/GhostPay/actions/runs/45011648630) | [6011912311](https://github.com/djshellshoxxx/GhostPay/pull/458#pullrequestreview-6011912311) | Reject no-cache responses from cache-first offline persistence |
| [#461](https://github.com/djshellshoxxx/GhostPay/pull/461) | 0d5fb9c93e9f7b46725c1cf1cab01cb8975b2691 | [45012366201](https://github.com/djshellshoxxx/GhostPay/actions/runs/45012366201) | [6011912444](https://github.com/djshellshoxxx/GhostPay/pull/461#pullrequestreview-6011912444) | Reject deleted preset ciphertext after prior in-instance observation |

These reviews do not count as independent approvals, and the code was not freshly executed in this environment: git clone is unavailable because github.com DNS resolution fails. Hosted CI completion is verified at the exact immutable PR heads.

## Feature and security blockers

- F04 [#460](https://github.com/djshellshoxxx/GhostPay/pull/460), stacked on export [#397](https://github.com/djshellshoxxx/GhostPay/pull/397): ff60e1e45cac1348d554f94ea24717285ecc5608 adds local evidence-qualified analytics; [CI 45011762331](https://github.com/djshellshoxxx/GhostPay/actions/runs/45011762331) has 24/24 passed and other hosted groups are green. It is still a dormant, non-integrated draft with explicitly unevaluated coverage. Canonical evidence ingestion, encrypted storage linkage, on-lock clearing and browser acceptance remain prerequisites.
- F10 [#456](https://github.com/djshellshoxxx/GhostPay/pull/456), stacked on M3, head 9e8a619cc2ce2688c16c89d16df4aeb7959bc627: [CI 45012216264](https://github.com/djshellshoxxx/GhostPay/actions/runs/45012216264) 16 successful, eight failed; TS2769 at apps/web/src/features/future/private-recurring/vault.test.ts:34 prevents typecheck and downstream browser build. Owner was notified [here](https://github.com/djshellshoxxx/GhostPay/pull/456#issuecomment-7077842759). No edit to owned feature source during this audit. Feature remains dormant without signing, recovery/backup migration or cross-device exactly-once guarantees.
- Broad recovery [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) has 576 ahead/zero behind main but its GitHub compare file listing is capped at 300; v1.1 and v1.0 older donors are respectively 429/119 and 428/119 ahead/behind main and also have capped compare listings. Preserve newer P0 failure uncertainty and do not import relayer/CLI/contracts into static browser beta.
- [#414](https://github.com/djshellshoxxx/GhostPay/pull/414) confidentiality investigation, #372 contract Mythril, Tor/Firefox/WebKit recovery acceptance and independent security review remain blockers. Receipt fixes #449 -> #450 -> #452 are stacked; isolated CI does not prove their combined integration.
- Integration lock file automation/ghostpay-integration-lock/integration-lock.json is held at generation 11 by 994a0d214fb9-root-r3. An expired timestamp does not grant ownership. No protected-branch merge, live-funds transaction, release or deployment.

## Next worker

First check the current main/ref and integration lock, then exact-head CI and independent review on #462/#463/#458/#461. Do not equate COMMENT with approval or ready-for-review with merge qualified. Ask the F10 owner to repair TS2769, then rerun failed CI; qualify F04 proof and unlocked browser behavior. Continue uncapped history and semantic file triage of the 59 capped donors, updating the BRANCH_HEADS and OPEN_PRS delta without duplicating code. Keep the Pages-only noncustodial, privacy-safe release boundary.
