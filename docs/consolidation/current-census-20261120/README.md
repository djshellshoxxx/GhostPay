# GhostPay branch recovery: complete ancestry census and engineering handoff

Date: 2026-11-20. Repository: `djshellshoxxx/GhostPay`. Frozen comparison base: main `aa3df1cb37274fae73af0ca957183c15c51b62d3` (merged PR #311).

## What was actually completed

- Exhaustively paginated the GitHub branch search (five pages, final null cursor), originally **391** live refs. A later `git/matching-refs/heads` response returned **392**, including a newly published TRON-range qualification branch. All **392** are in [CENSUS.json](CENSUS.json), with observed head SHAs.
- Executed main-relative GitHub commit/changed-path comparison for **391** refs. GitHub rejects comparison of the remaining `gh-pages` ref because its publication history has **no common ancestor** with main. This is normal for an independently constructed Pages tree and must not be merged as a source branch.
- Classified the snapshot as **185 ancestry-redundant refs** (zero ahead), **68 docs/nonapplication-path diffs**, **138 application-source candidates requiring semantic review**, and **1 unrelated `gh-pages`**.
- The census has **zero pending branch-name comparisons**. It does **not** mean 138 code candidates are independently qualified, functionally unique or safe to merge.
- Captured all current branch head SHAs after the sweep, but earlier comparisons were made against **moving branch names**. The observed SHA may postdate a comparison on an actively updated branch. Recompare **exact head SHAs** before integration. GitHub compare may truncate changed-file results at 300; application path counts are lower bounds on large donors.

## Distinct recovery and active engineering candidates

| Candidate | Main-relative evidence | Action |
| --- | --- | --- |
| [#307](https://github.com/djshellshoxxx/GhostPay/pull/307), `integration/ghostpay-main-recovered-fixes-20261120` | 67 ahead, 0 behind; 193 changed paths, 77 application paths | Broad recovery candidate; inspect current CI and cross-feature conflicts before any merge |
| [#325](https://github.com/djshellshoxxx/GhostPay/pull/325), `integration/ghostpay-sweep-consent-20261120` | 84 ahead, 0 behind; 211 changed paths, 89 application paths | This PR is stacked on #307, not an independent main-target donor; preserve parent ordering |
| [#310](https://github.com/djshellshoxxx/GhostPay/pull/310), signed request files F03 | 9 ahead; 20 application paths | Reconcile with #307's overlapping invoice/owner registry work |
| [#322](https://github.com/djshellshoxxx/GhostPay/pull/322), merchant projections F04 | 15 ahead; 5 application paths | Preserve evidence-qualified amounts; complete exact-head review/tests |
| [#323](https://github.com/djshellshoxxx/GhostPay/pull/323), offline receipt assurance F05 | 14 ahead; 7 application paths | Preserve receipt trust vs settlement distinction; complete exact-head review/tests |
| [#324](https://github.com/djshellshoxxx/GhostPay/pull/324), recurring previews F10 | 13 ahead; 7 application paths | Preview must not issue invoices or move funds; complete exact-head review/tests |
| [#321](https://github.com/djshellshoxxx/GhostPay/pull/321), TRON cancellation | 4 ahead, 0 behind; `scan.ts` and separate regression test | Focused GP-BUG-13 fix; CI and independent review were not yet complete at last check |
| [#329](https://github.com/djshellshoxxx/GhostPay/pull/329), TRON complete-range validation, exact head `cff631b5c32a86adfa2d79c342e497e91a8573a5` | 9 ahead of main, 0 behind; 12 changed paths, 6 application paths; **5 commits ahead of #321 and 0 behind** | #329 is explicitly stacked on #321, adds fail-closed missing-height range validation and regressions; preserve the stack, then retarget after parent qualification |
| [#328](https://github.com/djshellshoxxx/GhostPay/pull/328), GP-BUG-10 vault lock | 3 ahead, 0 behind; `vault.ts`, new deterministic regression | New test-first code fix in this cycle; source-pinned handoff and awaiting exact-head CI |

Historical integration refs including `integration/ghostpay-accepted-20261102`, `integration/ghostpay-beta-consolidated-20261109`, `integration/ghostpay-main-unique-code-20261120`, `integration/ghostpay-qualified-fixes-20261118`, and `integration/ghostpay-historical-security-promotion-20261119` are ancestors (zero ahead). Their older trees should not be bulk-merged. Most `future/` feature/spec refs currently differ only in documentation/nonapplication files, except implementation branches F03, F04, F05 and F10.

## Integration and release constraints

- [#314](https://github.com/djshellshoxxx/GhostPay/pull/314) and [#319](https://github.com/djshellshoxxx/GhostPay/pull/319) overlap on backup operation ownership. #319 extends #314 by separating unlock cancellation from durable vault writes: do not integrate both copies independently.
- [#326](https://github.com/djshellshoxxx/GhostPay/pull/326) and [#327](https://github.com/djshellshoxxx/GhostPay/pull/327) are stacked retention changes. Preserve pending transactions, backups and sole-copy material under v1.1's deletion policy.
- Broad historical [#278](https://github.com/djshellshoxxx/GhostPay/pull/278) remains a divergent candidate with documented failed strict Mythril and CodeQL High gates; the material is preserved for selective recovery, not a wholesale merge.
- Privacy issues [#286](https://github.com/djshellshoxxx/GhostPay/issues/286) and [#287](https://github.com/djshellshoxxx/GhostPay/issues/287) are not complete. Clipboard and quick-hide are partial v1.0 elements; address reuse, invoice minimization, wallet disclosures and retention remain v1.1 acceptance requirements.
- At last live CI inspection, #328's five workflows were queued; #321's Pages, beta acceptance and CLI workflow succeeded but its CI and hosting workflow remained queued; #307's CI/Pages were queued. No complete pass or independent review is inferred.
- A separate coordinator owns the active integration lock; this audit and #328 did **not** merge to main, retarget someone else's PR, deploy, modify fees/contracts, or waive any gate.

## Next engineering handoff

1. Use [CENSUS.json](CENSUS.json) to select the **138** ahead-of-main application-path candidates. Group them by ancestry and overlapping PR family; prioritize current focused bug fixes, v1.0/v1.1 release requirements, then older unique functionality. The 300-file compare cap requires targeted source/blob comparisons for broad donors.
2. Refresh main and fetch **exact candidate head SHAs** before semantic patch/content comparisons. Confirm whether another branch's behavior is already incorporated or superseded. A positive ahead count is not itself proof of unique behavior.
3. Run tests and security checks on the *combined* candidate. Keep integration locks and owned paths intact. Merge only reviewed, verified, conflict-free code through approved PRs; preserve original branches and documentation provenance.
4. Resume GP-BUG-10 via [#328](https://github.com/djshellshoxxx/GhostPay/pull/328): test-first commit `68c77b7f9f108d54de0dd1592f432bb27603838e`; guarded production assignment `f7bc60a1b704392e70fe5918766f70a4ab53fb78`; handoff `docs/handoffs/VAULT_REKEY_LOCK_20261120.md`. The current invocation could not install full repository dependencies or run the committed Vitest suite locally. Treat hosted CI and independent source review as outstanding.

This is a completed **branch ancestry/changed-path census**, not a completed semantic code audit or a release-qualification certificate. No deployment or release is authorized.
