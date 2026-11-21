# GhostPay R11 — signer-pin fail-closed CI repair and 455-branch reconciliation (2026-11-21 UTC)

## Source pins and ownership
- Latest verified main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Dedicated child branch: `fix/ghostpay-signer-pin-continue-20261121-r11`, based on PR #381 head `df0e715686bc42d270617692a7e310a8b362e840`.
- Claim commit `5251b45c6a3253a7f63720e7e83958a662199c42`.
- Bounded test correction `5d5301eb323dd2ead39f8391354d530afe23b98d` in `apps/web/src/views/Pay.signer.test.tsx`; production code unchanged.
- Parents: #381 (Firefox reflow qualification) → #373 (native browsers) → #372 (recovery/privacy). This child must **not** go straight to main.
- Current shared integration lock `automation/ghostpay-integration-lock:integration-lock.json`: **held**, owner `994a0d214fb9-root-r3`, generation 11. Expiry is not authority to take over.

## Proven CI failure and isolated correction
- PR #381 exact head `df0e715686bc42d270617692a7e310a8b362e840`.
- Hosted CI [run 44892601797](https://github.com/djshellshoxxx/GhostPay/actions/runs/44892601797), `ts-test (web)` job `136813588470`: **4416 pass, 1 fail, 1 skip**, 319 passing test files. Its one failing assertion in `Pay.signer.test.tsx` is `getByRole('button', {name:'Continue'})` after the selected signer pin is revoked from another tab.
- The test first successfully observes the pinned-trust label disappearing, the fail-closed "Verification unavailable or interrupted" warning, and preservation of selected seller "Alice". Then it requires a disabled Continue button. At the observed failing moment the UI has no Continue button at all.
- Source inspection at the exact parent head: `apps/web/src/views/Pay.tsx` renders its invoice-input state if `parsed` or `review` is unavailable; its Continue button exists only in the review branch when `phase === 'review'`. Therefore either **absent** or **disabled** Continue is a valid fail-closed outcome. Requiring that an absent action exist is contrary to the safety invariant.
- The correction preserves every pre-existing trust-loss and selection assertion and replaces the brittle button-existence assumption with a positive invariant: `proceed === null || proceed.disabled`. An enabled stale Continue still fails the test. No production behavior, wallet authority, privacy, release gate, timeout, build threshold or workflow was relaxed.
- **No repository Vitest execution** occurred locally: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed because container DNS could not resolve github.com. The exact new PR head requires hosted tests, typecheck, lint and independent review. A source-only review is not a passing test.

## Independent native Firefox blockers remain
- On PR #381 [native run 44892601839](https://github.com/djshellshoxxx/GhostPay/actions/runs/44892601839), WebKit full and lean succeeded; Firefox full and lean failed with Juggler failures, renderer crashes and `Page crashed` in multiple routes. This test-only patch does **not** claim to repair those failures.
- On #381, Pages, Tor static hosting and Beta acceptance passed, while CI and Native browser qualification failed.
- PR #384 (amount parser) at `f3e5540777491559e79565cafe0978f5e8e30003` has five completed successful hosted workflows but still needs independent review before integration. It intentionally preserves GhostPay's existing signed 0/2 fiat exponent scheme, including KWD=2, rather than importing an incompatible ISO minor-unit migration.
- PR #385 (policy review race regressions) at `e441c5e67125b7e8cd4ace983a588b59b5e085c5` had CI in progress at inspection; child of #375, not an independent main merge.
- PRs #382/#383 (BTC lifecycle / invoice timestamp retention) passed CI but failed Tor static-hosting qualification; both remain children of #372 and require fixture/source reconciliation.

## Complete branch pagination and incremental comparisons
- Previous exhaustive R9 snapshot: [PR #378](https://github.com/djshellshoxxx/GhostPay/pull/378), exact ledger `c493df9e210f6227471864a623ee536cc9483a3a`, pinned **447** branch names and SHAs, individually compared against the still-unchanged main. Its 26 comparison files and rollups remain authoritative for unchanged heads.
- This run paginated the GitHub REST branches endpoint at `per_page=100`: **100 / 100 / 100 / 100 / 55 / 0** (terminal empty page), **455** distinct branches. Against the R9 exact branch-head file: **446 unchanged**, **8 new**, **1 moved**, **0 removed**. All nine additions/movements were compared to the exact `main` SHA above.
- Source-path heuristic rollup, retaining old unchanged-head classifications and updating only those nine: **191** zero-ahead, **128** positive-ahead code-like, **77** positive-ahead non-code-looking, **58** positive-ahead GitHub-300-file-capped, **1** unrelated `gh-pages` = **455**. This is a triage heuristic, **not** proof of semantic uniqueness or merge safety.

| New or moved branch (exact SHA) | Current-main comparison | Disposition |
| --- | --- | --- |
| `audit/ghostpay-main-447-census-20261121-r9` — `c493df9e210f6227471864a623ee536cc9483a3a` | +33 / -0, 33 changed docs paths | Already owned by ledger PR #378 |
| `automation/20261121T0842Z/bug/payment-uri-query-boundaries` — `31b943bbc5bc3c3fdd3d1aec0d3fb5fa3d35c8a2` | +13 / -44, 8 paths | Existing payment URI PR #379; reconcile branch divergence, no duplicate import |
| `automation/20261121T0900Z/qa/firefox-closed-details-reflow` — `df0e715686bc42d270617692a7e310a8b362e840` | +584 / -0, 300-file cap | Existing PR #381; browser failures unresolved |
| `automation/20261121T1033Z/bug/fiat-minor-units` — `f3e5540777491559e79565cafe0978f5e8e30003` | +8 / -0, 4 paths | Existing PR #384; five hosted checks green |
| `feature/ghostpay-invoice-timestamp-retention-20261121-5ceb` — `cfa8131bab9a012cd1ce970f4afa8de23adfdf80` | +577 / -0, 300-file cap | Existing stacked PR #383 |
| `integration/ghostpay-autonomous-ledger-20261121-5ceb` — `80dd9eb9669fba0171a037b0b690d17a7e2b655e` | +1 / -0, 26 docs paths | Existing coordination PR #380 |
| `repair/ghostpay-btc-lifecycle-20261121-5ceb` — `4fc5c3dceb682067d6ebc7da1759cbeadd20dddf` | +577 / -0, 300-file cap | Existing stacked PR #382 |
| `test/ghostpay-policy-review-races-20261121-r1` — `e441c5e67125b7e8cd4ace983a588b59b5e085c5` | +34 / -0, 55 paths | Existing stacked PR #385 |
| **Moved** `qualify/ghostpay-native-browsers-20261121-5ceb` — `b660b2d8f3f84ddf72f684d13913f643f33f2eee` (was `22569e2a83e3f8bc3c86982f69bbb1d90ca8356c`) | +579 / -0, 300-file cap | Parent PR #373; needs native browser CI/independent review |

Four of these incremental comparisons hit GitHub's 300-file cap. The original R9 55 capped candidates are not yet semantically exhausted; this snapshot updates that queue to 58, not to zero.

## Next execution
1. Verify exact-head CI for this test-only child; if green and independently reviewed, integrate into **#381**, then requalify #373 and #372 in order.
2. Investigate Firefox native crashes separately, preserving Chromium/WebKit and browser security assertions.
3. Review/promote #384 only after inspecting final diff and signed merchant-ledger minor-unit compatibility; obtain independent GitHub approval before merge.
4. Keep #380 as the existing authoritative ledger PR; publish this incremental checkpoint to its coordination discussion rather than creating a duplicate mainline census implementation.
5. Continue per-commit semantic review of the 58 capped candidates under separate ownership; no wholesale merge, lock takeover, deployment, release or live-funds testing.

This handoff is source evidence, not release qualification.
