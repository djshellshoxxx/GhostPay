# R37 — GhostPay branch consolidation and fee-preview collision repair

## Immutable source checkpoint

- Repository: https://github.com/djshellshoxxx/GhostPay
- Protected `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (confirmed Git ref)
- Integration lock: `automation/ghostpay-integration-lock:integration-lock.json`, status `held`, generation 11, owner `994a0d214fb9-root-r3`. No transfer, protected merge, deployment or release.
- R37 branch: `automation/20261122-r37/bug/ux-fees-asset-symbol-collision`; based directly on protected main. Do not merge without independent approval, full exact-head test qualification and valid integration ownership.
- Exhaustive R37 pre-PR GitHub inventories: [BRANCH_HEADS.json](../consolidation/20261122-r37/BRANCH_HEADS.json), [OPEN_PRS.json](../consolidation/20261122-r37/OPEN_PRS.json).
- Branch pagination: `100/100/100/100/100/29/0`; **529 SHA-bearing branch heads** reconciled against independent Git matching-refs with zero mismatch or extra refs. Versus immutable R33: 514 unchanged, 14 new (including this R37 branch), 1 advanced documentation branch, 0 removed. Previously classified historical heads inherited prior findings and were not all fully re-compared semantically.
- PR pagination: `100/100/20/0`; **220 open PRs** before this new PR (128 main-targeted, 92 stacked); all R33 206 PR head/base pairs unchanged, 14 new #448–#461, none missing.
- New branch compare evidence against exact main: #449/#451/#453/#454/#458/#459/#461 are independent narrow fixes/docs with 4–5 incremental commits; #450 inherits #449, #452 inherits #450; #456 and #460 inherit dozens of F04/F10/dormant-module ancestors, so their main-relative `ahead` counts are not independently mergeable features. The 59 previously capped donors remain unqualified.

## Scoped source-confirmed defect and completed commits

`packages/ux-fees/src/preview.ts` groups payer totals by `asset.id` and previously blocked same-id asset collisions only when decimals differed. Distinct validated `symbol` values with the same id/decimals were summed under one displayed asset and produced `canProceed: true`. This is a local preview display-integrity problem; no real-funds exploit has been demonstrated.

- Claim: `45db4e5c3761d8169e81468f59f44ae594fff022` (ACTIVE_WORK.md, owned paths, acceptance).
- Test-first commit: `d0c759f02e5b57e829a7a72fd0204b4db600f1be` (new `preview.asset-symbol-collision.test.ts`). Three negative scenarios: conflicting symbol in NETWORK, BUFFER and F-SECURE. Neighbors: identical asset aggregation, distinct assets, preexisting decimals mismatch.
- Production fix: `2e1aac80be1121d5055b30f769dadb780c380ab8`. One additional symbol-equality guard inside existing `fees.preview.warn.assetMismatch` block. No new dependency, fee schedule, payment signing, RPC, storage, protocol, custody, contract or deployment behavior.
- Branch-head ledger commits: `cbea4ba44f98404bc3c6128c660c0b8465218c86`, `0b01da8696c2b151b60f1dd77a9a0a13acc11cee`.
- Overlap checked: open #421/#423/#425 change sweep-timing source/test only; broad recovery/integration #278/#262/#264/#372 do not change `packages/ux-fees/src/preview.ts`. New R36 #458, #454, #461 change other UX packages. This is a targeted changed-file check, **not** a 220-PR exhaustive diff-intersection proof.
- Prior duplicate avoided: UX-links invalid lifetime option defect is already implemented in open [PR #399](https://github.com/djshellshoxxx/GhostPay/pull/399); it was not reimplemented.

## Verification and integration gates

- Test files and production code were committed through GitHub connector against the pinned branch; no local checkout was possible because `github.com` DNS resolution failed.
- At initial handoff, repository Vitest, TypeScript, lint, browser tests and exact-head CI **have not been executed or verified**. Reinspect actual hosted workflows after PR creation before qualifying this repair.
- Independent review is outstanding; a reviewer must assess whether matching asset id implies identical symbol/case as intended, and test same-id collisions across all fee lines.
- F04 merchant analytics: stacked draft #460 contains recoverable distinct analytics code/tests but is dormant; F10 M4 stacked draft #456 advanced to head `9e8a619cc2ce2688c16c89d16df4aeb7959bc627` with browser adapter and CAS code. Preserve owner work; require native browser/security qualification.
- Recovery #372 Mythril evidence, native Firefox/WebKit, Tor/privacy, confidentiality #414, and 59 historical donors remain outstanding.
- No main merge, deployment, release, fee recipient change or real-funds operation occurred.

## Next actions

1. Verify exact-head CI and inspect new regression test execution for this R37 PR. Remedy actual failures on this isolated branch, rather than claiming green from summary badges.
2. Obtain independent security/functional review before marking ready or merging. Check active PR paths and the integration-lock generation again before any integration.
3. Continue semantic recovery of remaining v1.0/v1.1 donors without overwriting newer privacy/custody logic. Publish source-pinned findings to #380 and relevant feature-owner PRs; never reimport #399 or other already-owned fixes.
