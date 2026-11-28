# Owner-scope reconciliation — 2026-11-28 05Z UTC

Prior ledger: 2650f2ccc6bf6dec5f200dd053a52f1df117e9ae (04Z); full inventory at cc4a46bb127239ae5822a1f676f7687dfca20550 (03Z). Main b890a76603b924829fdbe2b4fb2c5626f0cf4e36, tree 05be8b5050b71daf5c7841d06cd983f715535db0. Fully paginated snapshots: 859 distinct branches, 153 open PRs. Observed 34 archive refs; no archive writes. Lock observed 162d4f55396774430d467cc49fec0b992eab4117 (same released generation 77); no acquisition. Claims unchanged at 411c7213439fd88f7d16405d87e0afbb3f692230. Main push workflows CI, Hosting kit and dynamic Push on main completed success; 32 success checks plus one queued scheduled research validate job (46106434643). Not full nightly qualification.

## Independent new source review

#764 head aafef6a4d3c4f66fddee83b793801117434c9ae2, pinned verifier db6f3da67737346c28edf2ed9d8bae44e86bce56. [Published review](https://github.com/djshellshoxxx/GhostPay/pull/764#issuecomment-7234477571). Absent ledger produces cards: [] and ledgerLocked: false, indistinguishable from empty unlocked ledger. compareTabs ignores no-ledger return; new collector accepts that shape. Source-derived synthetic predicate replay accepted both absent and one absent, rejected closed. Requires presence/visibility and successful unlock/readback and expected registered invoice identities when persistence required. Preserve original evidence; coordinate #665 and #764 owners; not an established app failure or assertion that hosted trace contained absent ledgers. No native or browser execution.

## Observed exact-head checks

| PR | Head | Success | Pending | Failure | Skipped |
|---|---|---:|---:|---:|---:|
| 753 | 1d7bd4ea632b41fee8fcece68d9a8fadd2b0b9a0 |42|0|0|3|
| 761 | 559a95ed31c0fe744be17b322b8583ad0b2901d6 |33|3|0|3|
| 762 | 96784ca19a26681e5893f229e96ec6647375a7ea |22|18|0|3|
| 763 | 862cf5fc4edd12f654cf88fec41b8ce0621e5bd1 |21|15|1|3|
| 764 | aafef6a4d3c4f66fddee83b793801117434c9ae2 |7|6|0|1|
| 765 | 3e633f55e100fcb32eca7262919b9b8a413cbceb |6|23|0|0|
| 766 | e9b14cf2762ae3249edab9dc1ecd4b4c0d904301 |13|23|0|3|
| 767 | 701ae99245c71e6a9ab0f7f6ec3baeff41e108d7 |16|23|0|3|

Strict Mythril failure remains. #605 merged; #659 merged; #614 held; #615 merged; #616/#617 closed unmerged. All ten exclusions binding, shared core/P14 retained. No main merge, deployment or production edits. Native git ls-remote fails DNS. Combined call limit prevented renewed full JSON ledger publication and exact branch delta comparison; this checkpoint is incremental, not exhaustive semantic classification or verified global unresolved count. Next: coordinate #764/#665 qualification gap, await #761 exact-head gates, follow Mythril disposition and continue eligible donor review without duplicating other workers.
