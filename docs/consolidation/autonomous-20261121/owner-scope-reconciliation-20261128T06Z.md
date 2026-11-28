# Owner-scope reconciliation — 2026-11-28 06Z UTC

Prior ledger: 2634db6c61bc0a71eccb334716fe1a783bdb80df (05Z); full inventory at cc4a46bb127239ae5822a1f676f7687dfca20550 (03Z). Main b890a76603b924829fdbe2b4fb2c5626f0cf4e36, tree 05be8b5050b71daf5c7841d06cd983f715535db0. Fully paginated twice: 859 branches, 153 open PRs. Relative to 03Z: 0 new, 0 missing, 2 advanced refs: audit/nov27-hosted-erc20-verification 5b60776e68ef5df1786fb61fec21ac6070650667 -> 3d98c34668884c06dbab4ffbec035600fa257d39; this ledger 56380dd7e68a24121c7c85b7c306c71f92284f15 -> 2634db6c61bc0a71eccb334716fe1a783bdb80df. Frozen archive heads 34/34 match prior manifest reconciliation; original source heads 33/34 match, existing nodata/brave-meitner-974y9e discrepancy (expected 57505cb294cf1780036ff004d60e3fcb7b75917a, observed 0d548b9acb9236cb09c150e36be21596a01423d6) unchanged. No archive writes. Integration lock 162d4f55396774430d467cc49fec0b992eab4117, released generation 77; no lease acquired. Claims unchanged at 411c7213439fd88f7d16405d87e0afbb3f692230.

## New independent qualification work

- #764 observer 3d98c34668884c06dbab4ffbec035600fa257d39, unchanged harness db6f3da67737346c28edf2ed9d8bae44e86bce56. Owner's supplement fixes the prior ledger-presence gap and supersedes earlier artifacts. Actual extracted current comparison predicate executed with three synthetic shapes: distinct digests accepted, both tabs with substituted digests accepted, both tabs sharing one digest across two expected amounts accepted. The expected amounts and cross-tab agreement do not bind observed identities to successful registration. [New independent review](https://github.com/djshellshoxxx/GhostPay/pull/764#issuecomment-7235042011) requests registration-bound expected digest pairs, exact membership, distinct digests and negative controls; no production bug or actual invalid hosted trace established.
- #761 head 559a95ed31c0fe744be17b322b8583ad0b2901d6 all five workflow groups succeeded; exact web shard [140807700480](https://github.com/djshellshoxxx/GhostPay/actions/runs/46085851675/job/140807700480) explicitly shows 14/14 donor tests, 4,804 web tests passed, one skipped. Full and lean E2E and CodeQL passed. [Published qualification](https://github.com/djshellshoxxx/GhostPay/pull/761#issuecomment-7235056190); isolated candidate only; maintain draft and coordinator review of #742/#762/#766 interactions and security/release gates.
- #763 strict Mythril still fails. New contracts-static failure: [job 140828455013](https://github.com/djshellshoxxx/GhostPay/actions/runs/46090104254/job/140828455013) reports 446/446 native tests but missing gas-snapshot entry for new MythrilFactoryPostFeeReadTest::test_postFailurePayerReadOutageRollsBackAndSameDeploymentCanRetry(). [Owner handoff](https://github.com/djshellshoxxx/GhostPay/pull/763#issuecomment-7235057479); no threshold, contract or snapshot edits by this worker.
- #766 full-profile E2E: 208 passed, 4 skipped, one failed before selecting sweep on Scan after staging ERC20 match. Missing instruction inventory shows SUMMARY and BUTTON.btn; actual control identity not established. [Owner handoff](https://github.com/djshellshoxxx/GhostPay/pull/766#issuecomment-7235057930) requests evidence-based shared-core-only repair, preserving scope and test inventory. [Log](https://github.com/djshellshoxxx/GhostPay/actions/runs/46094147933/job/140866597393).

## Exact-head checks at observation

| PR | Head | Success | Pending | Failure | Skipped |
|---|---|---:|---:|---:|---:|
| 753 | 1d7bd4ea632b41fee8fcece68d9a8fadd2b0b9a0 |42|0|0|3|
| 761 | 559a95ed31c0fe744be17b322b8583ad0b2901d6 |36|0|0|3|
| 762 | 96784ca19a26681e5893f229e96ec6647375a7ea |42|0|0|3|
| 763 | 862cf5fc4edd12f654cf88fec41b8ce0621e5bd1 |34|2|2|3|
| 764 | 3d98c34668884c06dbab4ffbec035600fa257d39 |1|14|0|1|
| 765 | 3e633f55e100fcb32eca7262919b9b8a413cbceb |24|6|0|0|
| 766 | e9b14cf2762ae3249edab9dc1ecd4b4c0d904301 |23|12|1|3|
| 767 | 701ae99245c71e6a9ab0f7f6ec3baeff41e108d7 |25|14|0|3|

Generic exact-main check runs: 36 success, one in progress; not all push events nor a full nightly pass. #659 merged, #614 held, #615 merged, #616/#617 closed unmerged; do not reopen mixed/excluded work. All ten exclusions binding, shared core/P14 retained.

Native git ls-remote retry failed DNS exit 128; no native repo/browser tests executed here. No production edit, main merge, deployment, archive ref modification or security gate change. Global semantic dispositions not complete; no newly resolved donor branch this cycle. Next: coordinate #764/#665 registration-bound observation, strict #763 qualification and #766 failure with owners; preserve #761 and #753 qualified candidates while audit integration gates remain unresolved; resume nonconflicting donor review and semantic classification.