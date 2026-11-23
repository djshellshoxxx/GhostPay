# R57 — complete historical Sweep-consent donor tree reconciliation

Observed at 2026-11-23T06:05–06:12 UTC using fresh authenticated GitHub API results. This is a **source/tree** disposition, not payment-safety acceptance and not a mainline merge.

## Immutable inputs

- Protected main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Historical donor `integration/ghostpay-sweep-consent-20261120` at `2748c9bfd55bd226c7801c15a7acdd955ab70339`.
- Existing owner drafts: [#367](https://github.com/djshellshoxxx/GhostPay/pull/367) `50ccf5c8b396247b524e5115ebe51575ca79d318`, [#307](https://github.com/djshellshoxxx/GhostPay/pull/307) `5a745d4b5fba69b66a9779f88aefc63c253a4f27`, [#310](https://github.com/djshellshoxxx/GhostPay/pull/310) `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`, and [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`.
- Additional checked draft [#278](https://github.com/djshellshoxxx/GhostPay/pull/278) `417f7c71daf8645e1432f2ec8f070110879b80bd`.
- All seven recursive `git/trees/<commit>?recursive=1` payloads returned `truncated=false`; no 300-file compare cap was used.

## Exhaustive path+blob result

The donor contains **4,084 blob paths**. For each path, locate an identical Git blob SHA in the current main or owner PR heads, in the following priority order:

| First matching source | Identical donor path+blob count |
| --- | ---: |
| Main | 3,841 |
| PR #367 | 233 |
| PR #307 | 7 |
| PR #310 | 1 |
| PR #278 and PR #372, additionally searched | 0 additional |
| **Total exact donor matches** | **4,082 / 4,084** |

Only two donor blob paths are not byte-identical in any of the compared trees:

1. `apps/web/src/views/SellerKeys.tsx`, donor blob `84c801a8e9eb1550a96802177045360988c85900`. Against PR #307 blob `b3f97d41e71e1b20587e4881fee33337dc87a8eb`, a full line-level LCS comparison yielded only nine added/removed lines: import `isSessionSuspended`; subscribe through `useSyncExternalStore`; and hide session-sensitive backup/archive controls when suspended. Every resulting guard expression was directly found in PR #372's current `SellerKeys.tsx` blob `c8c41466fcb6676b861fcd61159639dc28d5cf3c`. The latter additionally contains stricter independent vault-write ownership (`startVaultWrite`, `currentVaultWrite`, `finishVaultWrite`) and unlock-preflight cancellation (`finishUnlockPreflight`) absent from the older donor. Do not overwrite the stronger #372 lifecycle with donor code.
2. `docs/ai/ACTIVE_WORK.md`, donor blob `81b6b88a4686423ea6790fb4c3ed06cb4ddc68`: historical coordination/ownership narrative, not unique executable functionality. Preserve the donor Git ref and existing evidence rather than overwriting current claims.

Separately, a direct main-to-donor compare had 97 donor commits ahead and 86 main commits behind; these counts were **not** treated as 97 unique features. This complete-tree comparison resolves the historical donor's unique-source question.

## Disposition and integration boundary

**Historical donor: source represented/superseded by current main plus owner-held unmerged PRs.** It can be marked *structurally finalized* in the historical ledger, with `mainIntegrated=false`. Its recoverable functions are already in existing owner branches; there is no safe independent cherry-pick justified by this donor. In particular, #307 and #310 are open drafts with merge conflicts; #372 is an open stacked draft with outstanding security qualification. The integration lock remains held by another coordinator at generation 11. No review, browser, recovery, refund, contract-security or protected-main merge qualification is claimed.

If any source owner changes their PR HEAD, the blob relationships must be reverified before using this disposition to assert coverage. Keep the dependency and approval obligations open. Neither expiration nor a draft PR constitutes an automatic refund or guaranteed fund recovery.