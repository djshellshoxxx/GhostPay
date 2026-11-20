# GhostPay live branch census and continuation — 2026-11-20

## Snapshot and scope

- GitHub repository: `djshellshoxxx/GhostPay`.
- Exact baseline main: `aa3df1cb37274fae73af0ca957183c15c51b62d3` (merged #311).
- Exhaustively paginated GitHub branch search until the final null cursor: **5 pages, 391 live branch names**. The earlier scan had 389; the two additional branches are the separately created GP-BUG-10 fix and this audit branch.
- Machine-readable inventory: [CENSUS.json](CENSUS.json). It includes every enumerated branch, source-pinned per-ref compare values where checked, and an explicit pending state for all others.
- **74** branches have recorded main-relative comparisons; **317** remain un-compared at this checkpoint. Among compared refs: **24** application-source candidates, **40** documentation/nonapplication-only diffs, and **10** ancestry-redundant (zero ahead). The latter classification is only an ancestry result, not a statement about deletable branches.
- GitHub compare returns at most 300 changed-file rows for certain large donors. Counts of application-source paths are *lower bounds* on those donors, and ahead-by counts alone do **not** establish semantically unique changes.

## Notable verified comparison outcomes

1. Main-ahead integration candidate **#307** (`integration/ghostpay-main-recovered-fixes-20261120`): 67 ahead, zero behind; 193 changed paths, 77 application paths in the compare listing. Broad consolidation is still draft; exact-head CI and source review remain necessary.
2. Sweep consent candidate **#325** (`integration/ghostpay-sweep-consent-20261120`): 84 ahead, zero behind; 211 paths, 89 application paths. Separate integration; do not overwrite independent Sweep ownership.
3. Several old integration branches are now true ancestors of main: `integration/ghostpay-beta-consolidated-20261109`, `integration/ghostpay-accepted-20261102`, `integration/consolidated-2026-10-21`, `integration/consolidated-2026-11-14`, `integration/ghostpay-historical-security-promotion-20261119`, `integration/ghostpay-main-unique-code-20261120`, `integration/ghostpay-qualified-fixes-20261118`. Compare shows zero ahead. Do not recover their old snapshots wholesale.
4. Four future feature branches contain actual application implementation ahead of current main: `future/f03-private-payment-links` (9 ahead; 20 application paths), `future/f04-merchant-dashboard` (15; 5), `future/f05-ghostproof` (14; 7), and `future/f10-private-recurring` (13; 7). Their draft PRs **#310, #322, #323, #324** need separate qualification; they are not finished or safe to release merely because mergeable.
5. Remaining enumerated `future/` branches were checked against main and their current diff rows contain **no application-source paths**. They are primarily proposals/specifications, *not* implementable code donors yet. This does not mean their specifications or docs are worthless or already incorporated.
6. The small TRON fix **#321** is 4 ahead, zero behind, changes only `packages/tron-adapter/src/scan.ts` and an independent cancellation regression among its two application paths. Hosted CI and independent review were outstanding when inspected; the coordination lock belongs to another integration worker.
7. Focused bug fix **#328** now exists on `fix/ghostpay-vault-rekey-lock-revocation-20261120`: test-first commit `68c77b7f9f108d54de0dd1592f432bb27603838e`, source correction `f7bc60a1b704392e70fe5918766f70a4ab53fb78`, handoff `81598d93dd82cc440526c866d42b55be0657895b`. It corrects audit GP-BUG-10 without updating main. No local repo tests executed; exact-head hosted qualification required.

## Active PR overlap and recovery guardrails

- **#314 / #319:** backup operation control owners overlap. #319 extends #314 to separate unlock cancellation from durable vault writes. Do not merge both changes independently or replace #319 with the earlier incomplete fix.
- **#307 / #310:** overlap on signed invoice file and main ownership registry. #310's main reconciliation is distinct from #307's combined recovery candidate; compare runtime semantics and tests before combining.
- **#326 / #327:** retention focus PR #327 is stacked on retention completion #326. Preserve stack order and respect v1.1 retention's mandatory sole-copy and pending-record exclusions.
- **#278 / #302 / #264 / #262:** old broad feature consolidations have divergent ancestors and may include overlapping payment, recovery, contracts or CI behavior. Historical code and evidence are recoverable only selectively, not by merging old trees.
- **#300 / #293 / #286:** privacy quick-hide and clipboard cleanup are partial/stacked pieces of the v1.0 privacy release gate, not completion of all five requirements.
- **#287:** v1.1 privacy requirements are independent release gates (address reuse, minimized invoice metadata, external-wallet disclosure, retention). Neither v1.0 nor v1.1 should be marked qualified solely from open work branches.

## Continuing comparison and integration instructions

1. Resume from **317 pending branch compares** in [CENSUS.json](CENSUS.json). Compare refs to refreshed main; add ahead/behind, actual changed paths, and application-file evidence. Only after source content/patch equivalence review call a nonancestor branch a genuinely unique code donor.
2. Prioritize newer `automation/`, `repair/`, `fix/`, `chatgpt/` and `codex/` source branches; group duplicate PR families and existing ancestry first. Preserve original branches. For large differences, split by directories because the standard compare result may truncate at 300 paths.
3. Refresh the coordination lock, main, CI status and review threads before any integration. Selectively cherry-pick or port tested, non-overlapping application changes into a reviewed candidate; do not bulk merge branches with different base histories.
4. Exact-head tests, strict security analysis, full/lean browser and Pages gates must pass as applicable. Keep the static, noncustodial, browser-only beta and recovery-material protections unchanged. No manual release/deploy, force push, branch deletion, fee or contract deployment authorized by this record.

This snapshot is a **completed exhaustive branch-name census and a partial code-difference audit**, not a claim that all 391 branches have been semantically reviewed or that their remaining work has been merged.
