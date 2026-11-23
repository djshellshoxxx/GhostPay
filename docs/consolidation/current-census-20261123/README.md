# GhostPay branch and pull request census — 2026-11-23

## Snapshot

Repository: `djshellshoxxx/GhostPay`
Default branch: `main`
Main SHA: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`

The branch endpoint was fully paginated after a fresh remote fetch: **591 branches** (pages of 100, 100, 100, 100, 100, 91, and 0). The pull request endpoint was fully paginated: **514 pull requests** (pages of 100, 100, 100, 100, 100, and 14): **280 open**, **234 closed**, **89 merged**, and **145 closed without a merge**. Exact branch heads and pull request head/base refs are in [BRANCH_HEADS.json](BRANCH_HEADS.json) and [PULL_REQUESTS.json](PULL_REQUESTS.json).

This refresh replaces earlier snapshots that reported 392 or 515 branches. It is an exhaustive *reference census*, not a fresh semantic disposition of all 591 branches. No branch is declared integrated based only on a related PR title or closure state. Semantic classification and unique-code recovery remain outstanding for the full inventory.

## Candidate integration: C1 93-PR batch

PR [#504](https://github.com/djshellshoxxx/GhostPay/pull/504), “C1: integrate 93 independently reviewed fix PRs,” is still an open draft at `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`, based on current main. Its diff is broad (353 files; 29,409 insertions and 323 deletions). At that exact head, 40 checks reported 32 success, 3 skipped, and 5 failures: the `typescript` aggregator, web unit tests, full and lean Playwright, and CodeQL.

The direct failures were investigated against source and hosted logs:

- Web unit test: the B-R6 fixture returned an EIP-712 domain-separator hash for ERC-20 transfer simulation instead of ABI `true`. The simulation guard correctly treated that non-boolean result as unavailable.
- Contextual-help browser test: the expected next focus target skipped the secondary RPC URL input already present in the DOM order.
- RPC layout browser test: the two columns' input baselines differed by 24 CSS pixels at 900px.
- CodeQL: seven high alerts were reported on legacy regex patterns; the source reviewer found those exact patterns unchanged from main. The flagged sources overlap active source/test ownership claims, so this wave did not edit them or dismiss the findings.

The repair stack is [#510](https://github.com/djshellshoxxx/GhostPay/pull/510) (focus-order assertion), [#512](https://github.com/djshellshoxxx/GhostPay/pull/512) (RPC grid alignment), and [#517](https://github.com/djshellshoxxx/GhostPay/pull/517) (valid ABI-bool fixture). PR #517 is based on #512 and contains all three repairs. Its exact head `fbd450936b2495026ff88a2eae08bfee02e92db6` reports **29 successful checks and 3 skipped**. The skipped checks include Pages deployment and post-deployment smoke; CodeQL is absent from this stacked PR's check list. This does not establish that a main-targeting candidate passes CodeQL or deployment gates.

Local reproduction at #504 failed the single B-R6 assertion as expected (1 failed, 54 skipped in the focused file); the same test passed at #517 (1 passed, 55 skipped). On #517, `npm ci` installed 722 packages, `npm run build:libs` passed, and the web production build/typecheck plus bundle scan passed with `NODE_OPTIONS=--max-old-space-size=1536`. Local Playwright did not execute: the workspace Chromium process failed with `socket() failed: Operation not permitted`. Hosted full and lean E2E checks passed at #517.

Do not mark #504 ready or merge it based on the stacked checks: obtain a main-targeting exact-head CodeQL result, independent review of the composed tree, current ownership reconciliation, and applicable Pages/deployment approval first. Keep the deployment and post-deployment checks skipped/unverified in the evidence record.

## Other verified leads

- PR [#500](https://github.com/djshellshoxxx/GhostPay/pull/500) remains an open draft at `d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea`, targeting durable cross-tab wallet-attempt recovery. It is the highest-priority fund-safety recovery lane identified in this wave. Its journal-locking, storage-failure, reload, replacement and receipt-reorg behavior still needs independent review and exact-head qualification. Absence from an RPC or a timeout must not clear an unknown attempt.
- PR [#515](https://github.com/djshellshoxxx/GhostPay/pull/515) is a test/evidence-only child of #274, not a separate jitter implementation. The source concern is whether a schedule that has reached `ready` must later become `expired`; the Pay flow refreshes before entering ready and `sendPayment` checks invoice expiry at the wallet boundary. No payment bypass was established. Keep this as a caller-contract/end-to-end review item rather than claiming a source exploit.
- PR [#93](https://github.com/djshellshoxxx/GhostPay/pull/93) is a different PR from the 93-PR C1 batch. It is closed without merge and is not evidence that 93 PRs landed in main.

The integration lock ref `automation/ghostpay-integration-lock` currently records generation 12 as released, but its recorded base is `eb59d93cffed7848c4aac37d0e9650b87239c6da`, older than this census main. This wave did not acquire or change the shared lock and did not write to main.

## Next executable cycle

1. Re-fetch main, all branches, pull requests, exact-head checks, and the integration-lock ref before reusing this snapshot.
2. Independently review the complete C1 composed tree, then qualify a single main-targeting candidate for CodeQL and every applicable build, unit, browser, Pages-artifact, and security gate.
3. Continue the critical recovery lane from #500 with the exact-head storage and cross-tab tests listed above.
4. Refresh semantic branch dispositions using exact heads and patch/ancestry plus source comparison. Prioritize branches with unique payment correctness, recovery, key lifecycle, invoice expiry, and browser compatibility changes.
5. Keep Pages deployment authorization and skipped live checks explicit; merge only when required checks, review, ownership and release gates are satisfied.

## Disposition for this wave

- Remote branches and PRs: fully enumerated at the snapshot above.
- Semantic dispositions refreshed: none in this wave; the census is not a completion claim.
- C1: not merge-qualified; child repairs have a green exact-head stack, while main-targeting CodeQL remains unresolved.
- Product changes in this wave: none; no unverified financial behavior was changed.
