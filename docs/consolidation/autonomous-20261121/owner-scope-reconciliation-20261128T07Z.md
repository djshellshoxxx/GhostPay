# Owner-scope reconciliation — 2026-11-28 07Z UTC

Prior ledger: 461283af75f00bf773fe7c2741231200c7465d6b (06Z); full inventory at cc4a46bb127239ae5822a1f676f7687dfca20550 (03Z). Live main b890a76603b924829fdbe2b4fb2c5626f0cf4e36, tree 05be8b5050b71daf5c7841d06cd983f715535db0. Current AGENTS.md and stop-work directive read; ten exclusions and core/P14 retention binding. #659 and #615 merged; #614 held; #616/#617 closed unmerged. Do not reopen excluded/mixed work.

Fully paginated 859 branch refs and 153 open PRs. Compared all names and SHAs with 03Z ledger: no new or missing refs; three changed: audit/nov27-hosted-erc20-verification 5b60776e68ef5df1786fb61fec21ac6070650667 -> 0ee71f2b4e82897ed0a0a1ab868f06c1d02ed5fd; audit/nov27-mythril-fee-read 862cf5fc4edd12f654cf88fec41b8ce0621e5bd1 -> 114675eb9ce1611deb0f853e8ceb0f9cdcb6c068; ledger 56380dd7e68a24121c7c85b7c306c71f92284f15 -> 461283af75f00bf773fe7c2741231200c7465d6b. Relative to 06Z only the two audit refs advanced (excluding ledger publication). All 34 frozen refs unchanged relative to verified 03Z census; existing original-source discrepancy unchanged. Lock 162d4f55396774430d467cc49fec0b992eab4117 released generation 77; claims 411c7213439fd88f7d16405d87e0afbb3f692230 unchanged. No lease acquired. Inventory is non-atomic, not semantic classification.

## Independent CI diagnosis
- #766 e9b14cf2762ae3249edab9dc1ecd4b4c0d904301: web job 140866597576 has 20 failures, 4772 passes, one skip, seven failed files. English catalog comparison confirms all 187 tips.* keys absent from explicit security/neutral classifications. Classify each by meaning, preserving native-review fallback for signing, secrets, recovery, RPC and consent; do not relax IN-3. Other 19 failures caused by global contextual-help toggle adding a checkbox, including a negative assertion for publication-consent absence before backup waiver. Scope queries by accessible consent name or registry-local region; preserve all assertions. Aggregate job 140891257563 is not a separate compiler failure. Full E2E missing-instructions failure remains separate. [Owner handoff](https://github.com/djshellshoxxx/GhostPay/pull/766#issuecomment-7235641842).
- #764 0ee71f2b4e82897ed0a0a1ab868f06c1d02ed5fd: exact delta against 3d98c346 records expected digests/amounts at registration readback, requires distinct digests, exact X/C membership and two matching visible/readback cards in both unlocked tabs. Five new negative controls cover substituted digests, shared digest, extra card, duplicate expectation, swapped intent amounts. Earlier predicate gap addressed in source. [W5 run 46117011984](https://github.com/djshellshoxxx/GhostPay/actions/runs/46117011984) succeeds both lanes, logs show 54/54 property tests per lane. API lists seller archive 15252692156 SHA-256 d5c0fb6a6c062f7a914402132e8824872ce306233a6a8a5806840ba256677f46 and payer 15252842083 SHA-256 9dc6cb964f5ab0621e60b2ff73363d8577236c94265874109c17ee50bd2cb7ce. Digests not independently recomputed this cycle; artifact membership and independent qualification disposition remain outstanding. Expected identities from registration readback, not independent link decoding. Evidence-only targets #762.
- #763 114675eb9ce1611deb0f853e8ceb0f9cdcb6c068: exact delta adds one gas-snapshot entry 1253200 and trailing newline only. [contracts-static](https://github.com/djshellshoxxx/GhostPay/actions/runs/46116798228/job/140892416543) succeeds; [strict Mythril](https://github.com/djshellshoxxx/GhostPay/actions/runs/46116798170/job/140892353542) in progress. Prior failure not waived.
- #765 and #767 all observed executed checks green; no inference of actual dedicated stress replay or independent approval.

## Exact-head check-run snapshots
| PR | Head | Success | Pending | Failure | Skipped |
|---|---|---:|---:|---:|---:|
|753|1d7bd4ea632b41fee8fcece68d9a8fadd2b0b9a0|42|0|0|3|
|761|559a95ed31c0fe744be17b322b8583ad0b2901d6|36|0|0|3|
|762|96784ca19a26681e5893f229e96ec6647375a7ea|42|0|0|3|
|763|114675eb9ce1611deb0f853e8ceb0f9cdcb6c068|38|1|0|3|
|764|0ee71f2b4e82897ed0a0a1ab868f06c1d02ed5fd|41|0|0|3|
|765|3e633f55e100fcb32eca7262919b9b8a413cbceb|31|0|0|0|
|766|e9b14cf2762ae3249edab9dc1ecd4b4c0d904301|35|0|3|3|
|767|701ae99245c71e6a9ab0f7f6ec3baeff41e108d7|41|0|0|3|

Generic exact-main check-run endpoint: 41 success; not all main push events or proof of nightly qualification. Native git ls-remote retry failed DNS (128). No native tests run by this worker, production changes, main merge, archive modifications, deployment or gate change. No newly resolved historical donor branch. Global semantic classification remains incomplete. Next: verify #764 artifacts/current review, strict #763 gate, #766 owner repair, coordinate eligible green candidates with their owners and only acquire lease when prerequisites permit; continue nonconflicting donor review.
