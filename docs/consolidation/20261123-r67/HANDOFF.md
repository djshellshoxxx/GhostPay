# GhostPay R67 — durable engineering handoff

**Census checked at:** 2026-11-23T15:15:18.865Z (independent live branches, Git refs and all open PRs). **R67 source report published:** `47e2c212683ce1b4f65b43bd270a158687a2a2ad`. **Final handoff publication:** this commit; it is a self-publication update *after* the immutable pre-publication census, not a new donor classification.

**Protected main:** `8ddb344973e80b8e1eda6821e970ee6a2b808b29` (unchanged). **Existing draft PR:** [#471](https://github.com/djshellshoxxx/GhostPay/pull/471) on `audit/ghostpay-r41-semantic-backfill-20261122-1400Z`; do not merge while approvals and tests are outstanding. **R67 source code HEAD before documents:** `2bab915f07f66f55e3c140ee045519643ec5870d`; R66 predecessor `01a5769b285a1d5defa18f18b7859d1e44e8dfbf`.

## Delivered in this run

1. **Test-first source engineering on self-owned consolidation tooling:** committed regression tests `0cb7294bd320419d279054cd65fe13130a5ecefa`, then fix `2bab915f07f66f55e3c140ee045519643ec5870d`. Historical finalized and retired donor requalification now requires evidence that names both the prior and destination disposition; missing/wrong destination should fail. Affects only `scripts/tests/consolidation-ledger.test.mjs` and `scripts/consolidation/validate-ledger.mjs`; no payment/product code changed.
2. **Exhaustive immutable census:** 579 branches paged `100/100/100/100/100/79/0`; independently matched all **579 Git refs** with zero name/SHA discrepancies. 268 open PRs paged `100/100/68/0`, of which **96 stacked**. Preserved 317 finalized live histories, 262 unresolved live histories, and 2 deleted-but-unmerged unresolved histories = **264 global unresolved**. New branches: C1 browser layout repair [#512](https://github.com/djshellshoxxx/GhostPay/pull/512) and dedicated BUG-only merchant-label [#513](https://github.com/djshellshoxxx/GhostPay/pull/513). They remain owner-held. Only other advanced ref is this publication branch.
3. **Full Git-tree donor investigation:** six donor trees and comparison main/C1 trees all had `truncated=false`. Documented blob identities/counts and distinct unmerged code, without claiming that historic commits represent safe features. Confirmed prior audit's L7-M2 test is superseded by main's stricter release-verify regression suite; donor itself remains unresolved. Historical SBOM/archive canonicalizer depends on absent vendored viem archive and cannot be imported unchanged. See [SOURCE_ENGINEERING.md](SOURCE_ENGINEERING.md).
4. **Versioned ledger published:** [SEMANTIC_DISPOSITIONS.json](SEMANTIC_DISPOSITIONS.json), pre-publication census at PR471 HEAD `2bab915f...` published in commit `c4fa089779458190d36bbcf1289e01bf6ed2e923`. Prior R66 evidence and every historical classification preserved. No new donor was marked finalized or main-integrated.

## CI and verification truth

- Exact-head **R66** CI [45192368684](https://github.com/djshellshoxxx/GhostPay/actions/runs/45192368684) is now **completed success, 24/24 jobs**, pinned only to `01a5769b285a1d5defa18f18b7859d1e44e8dfbf`.
- R67 test-only head `0cb7294b...` workflow runs #45202790840 in progress / #45202807090 queued when checked. No observed RED phase.
- R67 code-fix head `2bab915f...` workflow #45202851658 cancelled after superseding commit, other PR workflow #45202834323 queued. Neither is application acceptance.
- R67 ledger commit `c4fa0897...`: new CI #45203178718 pending and PR workflow #45203163821 queued at 15:15 UTC. Later source and handoff publication require **new exact-head status inspection**. Native repository checkout and full Node/build/browser/security test execution were not available in this run; do not inherit earlier results, claim green based on queue, or weaken gates.

## Ownership and mandatory integration gates

- Integration lock branch immutable ref `082e754f44944ebb4be283f89176b966bf8f7b4f` unchanged; generation 12 released according to prior state. This is not permission to merge. GitHub branch-protection read returns HTTP 403 through connected permissions. Independent formal approval and relevant browser/security checks remain unverified.
- **Product work still in others' branches:** P0-A wallet attempt #500; P0-B canonical finalized chain absence and refund safety; C1 #504 and children #510/#512; BUG-only #513; payment expiry PR #274; base64url PR #289 (known lint failure); clipboard #293/#297; key export/network authorization and private-scan donor dependencies. No owned paths modified or discarded.
- Main remains unchanged. **No application-code integration, main merge, deployment, release, real-funds call, branch deletion, lock theft, or force push.** Validator integration exists only in unmerged draft #471, not in protected main.

## Precise executable next cycle

1. Inspect exact final PR #471 HEAD and corresponding all-required hosted CI. If new validator tests are failing, inspect the logs, reproduce root cause, commit a narrowly scoped fix to the **same owned branch** and check its resulting exact SHA; do not claim the previous R66 passes transfer.
2. Refresh main/lock/AGENTS/workflow/handoff/active leases; paginate all heads+open PRs again. Independently confirm Git refs; preserve retired histories and prior R67 finalizations; reconcile the self-publication SHA first.
3. Prioritize actual, owner-approved recovery of PR #274 (monotonic invoice expiry) and #289 (base64url runtime guard after lint repair) with relevant unit/TypeScript/build/browser checks, then P0 trusted-finalized absence and export-key dependencies. Avoid editing owner-held files or resurrecting stale donor implementations.
4. For remaining historical broad branches, use **full Git-tree ancestry and file blob evidence**, isolate uniquely useful functionality under appropriate ownership, test it, and qualify a focused PR. No import solely because a donor has a large ahead/file count.
5. Obtain genuine formal independent approval, exact resulting SHA CI, browser/recovery/security acceptance, branch-protection and lock authorization before any protected-main merge. Re-census after actual merge; only stop when every branch is accounted for and zero safe eligible unique code remains.

**Incomplete:** 264 global unresolved histories at the frozen R67 census, owner-held payment-safety integrations still pending.
