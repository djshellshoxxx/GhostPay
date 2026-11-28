# Owner-scope reconciliation — 2026-11-28 04Z UTC

Continuation of [03Z full ledger](./owner-scope-reconciliation-20261128T03Z.json), exact parent `cc4a46bb127239ae5822a1f676f7687dfca20550`. Main `b890a76603b924829fdbe2b4fb2c5626f0cf4e36`; tree `05be8b5050b71daf5c7841d06cd983f715535db0`. Main check-runs observed 32/32 successful. Lease `162d4f55396774430d467cc49fec0b992eab4117`, coordination: release generation-77 lock after #759 merge b890a76603b924829fdbe2b4fb2c5626f0cf4e36; not acquired.

Both inventories paginated to termination: 859 unique branch refs, 153 unique open PRs, no newly discovered or missing refs versus the 03Z snapshot, two changed refs:
- audit/nov27-hosted-erc20-verification: 5b60776e68ef5df1786fb61fec21ac6070650667 -> aafef6a4d3c4f66fddee83b793801117434c9ae2
- integration/ghostpay-autonomous-ledger-20261121-5ceb: 56380dd7e68a24121c7c85b7c306c71f92284f15 -> cc4a46bb127239ae5822a1f676f7687dfca20550 (previous checkpoint publication)
All 34 frozen archive refs unchanged versus manifest-reconciled 03Z inventory; no original-source head changes observed. Non-atomic inventory, not exhaustive semantic classification; no verified global unresolved count.

## New source disposition
[PR #254 residual test reconciliation](https://github.com/djshellshoxxx/GhostPay/pull/254#issuecomment-7233701764), donor 2b4b1e912350cb18c630a68b5c1990426e29dbc0. Assertion-level comparisons of remaining ten cases complete at this bounded scope: cumulative 4 directly matched, 10 partial/related, 1 unproven. Historical full-profile PoC evidence only, not beta blockers; preserve source, do not port feature-specific coverage or expand chain scope without explicit authorization. No runtime equivalence claim. No source changes.

## Exact-head observed check runs
| PR | Head | Success | Queued | Failed | Skipped | Neutral |
|---|---|---:|---:|---:|---:|---:|
| 753 | 1d7bd4ea632b41fee8fcece68d9a8fadd2b0b9a0 | 42 | 0 | 0 | 3 | 0 |
| 761 | 559a95ed31c0fe744be17b322b8583ad0b2901d6 | 29 | 5 | 0 | 3 | 0 |
| 762 | 96784ca19a26681e5893f229e96ec6647375a7ea | 17 | 23 | 0 | 3 | 0 |
| 763 | 862cf5fc4edd12f654cf88fec41b8ce0621e5bd1 | 19 | 17 | 1 | 3 | 0 |
| 764 | aafef6a4d3c4f66fddee83b793801117434c9ae2 | 0 | 13 | 0 | 1 | 0 |
| 765 | 3e633f55e100fcb32eca7262919b9b8a413cbceb | 6 | 23 | 0 | 0 | 0 |
| 766 | e9b14cf2762ae3249edab9dc1ecd4b4c0d904301 | 11 | 2 | 0 | 3 | 0 |
| 767 | 701ae99245c71e6a9ab0f7f6ec3baeff41e108d7 | 6 | 9 | 0 | 3 | 1 |

Strict Mythril failure: https://github.com/djshellshoxxx/GhostPay/actions/runs/46090104304/job/140808781856. Keep gates and ownership. #767 already has separate bounded review 7232465730; no duplicate implementation/review. #659 merged; #614 held; #615 merged; #616/#617 closed unmerged; no revival of mixed products. All ten exclusions binding; shared EVM privacy/recovery and P14 protected. No native tests this cycle (git ls-remote DNS failure), branch-protection endpoint 403, no merge, deployment or lease acquisition. Full refreshed inventory data was processed but combined tool-call limit prevented a second full JSON publication; this additive delta is not a replacement for the earlier full ledger. Next: fresh exact-head checks, owner coordination and eligible donor reconciliation; no duplicate work.
