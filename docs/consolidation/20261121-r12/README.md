# GhostPay R12 — complete immutable-head reconciliation and engineering handoff

## Frozen scope (2026-11-21)

Repository: `djshellshoxxx/GhostPay`; unchanged `main` **`eb59d93cffed7848c4aac37d0e9650b87239c6da`**. Live branch pagination reached a terminal empty page: **100/100/100/100/68/0**. Independent matching Git refs returned **468** unique branch-name/head pairs; pinned in [BRANCH_HEADS.json](BRANCH_HEADS.json). The new R12 evidence branch was created *after* the snapshot and must not be miscounted as missing.

Source baseline: [R9 complete 447-branch comparisons](https://github.com/djshellshoxxx/GhostPay/blob/c493df9e210f6227471864a623ee536cc9483a3/docs/consolidation/20261121-r9/README.md) and its 26 immutable indexed compare files covering all 0–446. The R9 main SHA is identical. **446** exact branch-name/head pairs have not moved: reuse their source-pinned R9 comparisons, rather than re-run them or imply their capped paths are complete. **21** names added, **1** head moved, **0** removed. Every **22** new/moved exact SHA was compared against pinned main: see [Part 1](DELTA_PART_1.json) and [Part 2](DELTA_PART_2.json), including full returned per-file stats, merge bases, ahead/behind and cap flags. No delta comparison failed. This is exhaustive reconciliation of branch heads, **not** a claim of 468 semantically proven unique-code dispositions.

## Classification (path-level triage only)

| Category | Count |
| --- | ---: |
| Ancestry redundant / zero ahead | 191 |
| Ahead and uncapped with application/package changes | 140 |
| Ahead and uncapped with docs/other changes | 77 |
| Ahead and capped at GitHub 300-file response | 59 |
| Separate `gh-pages` no-common-ancestor history | 1 |
| **Total** | **468** |

Net new since R9: 15 source-looking, 2 documentation/coordination, 4 capped. The moved Firefox qualification branch was already capped and remains capped. Classification is **not** merge safety, code originality, or feature completeness. In particular, do not bulk-import broad privacy/BTC/browser integration trees.

## Changed branch head to existing PR mapping

All 22 changed/new heads already have an owning open PR; **do not create duplicate implementation PRs**.

| Branch | Owning PR | Ahead/behind | Triage |
| --- | --- | --- | --- |
| `audit/ghostpay-main-447-census-20261121-r9` | [#378](https://github.com/djshellshoxxx/GhostPay/pull/378) | 33/0 | Documentation/coordination |
| `automation/20261121/bug/display-text-expansion-bound-r1` | [#390](https://github.com/djshellshoxxx/GhostPay/pull/390) | 5/0 | Source/test candidate |
| `automation/20261121/bug/ux-links-max-lifetime-guard` | [#399](https://github.com/djshellshoxxx/GhostPay/pull/399) | 4/0 | Source/test candidate |
| `automation/20261121T0842Z/bug/payment-uri-query-boundaries` | [#379](https://github.com/djshellshoxxx/GhostPay/pull/379) | 13/44 | Source/test candidate |
| `automation/20261121T0900Z/qa/firefox-closed-details-reflow` | [#381](https://github.com/djshellshoxxx/GhostPay/pull/381) | 584/0 | Capped, inspect per commit |
| `automation/20261121T1033Z/bug/fiat-minor-units` | [#384](https://github.com/djshellshoxxx/GhostPay/pull/384) | 8/0 | Source/test candidate |
| `chatgpt/ghostpay-browser-selfchecks-20261121` | [#395](https://github.com/djshellshoxxx/GhostPay/pull/395) | 3/0 | Source/test candidate |
| `chatgpt/ghostpay-csv-leading-whitespace-20261121` | [#393](https://github.com/djshellshoxxx/GhostPay/pull/393) | 4/0 | Source/test candidate |
| `chatgpt/ghostpay-ledger-exponent-guard-20261121-0313` | [#388](https://github.com/djshellshoxxx/GhostPay/pull/388) | 4/0 | Source/test candidate |
| `chatgpt/ghostpay-rpc-layout-reflow-20261121-r1` | [#387](https://github.com/djshellshoxxx/GhostPay/pull/387) | 5/0 | Source/test candidate |
| `feat/f04-deliberate-local-export-20261121` | [#397](https://github.com/djshellshoxxx/GhostPay/pull/397) | 64/0 | Source/test candidate |
| `feature/f10-lifecycle-m2-20261121` | [#391](https://github.com/djshellshoxxx/GhostPay/pull/391) | 59/0 | Source/test candidate |
| `feature/f10-reviewed-preparation-m3-20261121` | [#396](https://github.com/djshellshoxxx/GhostPay/pull/396) | 64/0 | Source/test candidate |
| `feature/ghostpay-invoice-timestamp-retention-20261121-5ceb` | [#383](https://github.com/djshellshoxxx/GhostPay/pull/383) | 577/0 | Capped, inspect per commit |
| `fix/ghostpay-pasted-invoice-fragment-boundary-20261121` | [#389](https://github.com/djshellshoxxx/GhostPay/pull/389) | 7/0 | Source/test candidate |
| `fix/ghostpay-qr-capacity-unicode-surrogate-20261121` | [#392](https://github.com/djshellshoxxx/GhostPay/pull/392) | 4/0 | Source/test candidate |
| `fix/ghostpay-signer-pin-continue-20261121-r11` | [#386](https://github.com/djshellshoxxx/GhostPay/pull/386) | 587/0 | Capped, inspect per commit |
| `fix/ghostpay-webhook-signer-timestamp-width-20261121` | [#398](https://github.com/djshellshoxxx/GhostPay/pull/398) | 4/0 | Source/test candidate |
| `integration/ghostpay-autonomous-ledger-20261121-5ceb` | [#380](https://github.com/djshellshoxxx/GhostPay/pull/380) | 1/0 | Documentation/coordination |
| `qualify/ghostpay-native-browsers-20261121-5ceb` | [#373](https://github.com/djshellshoxxx/GhostPay/pull/373) | 579/0 | Capped, inspect per commit |
| `repair/ghostpay-btc-lifecycle-20261121-5ceb` | [#382](https://github.com/djshellshoxxx/GhostPay/pull/382) | 577/0 | Capped, inspect per commit |
| `test/ghostpay-policy-review-races-20261121-r1` | [#385](https://github.com/djshellshoxxx/GhostPay/pull/385) | 35/0 | Source/test candidate |

[OPEN_PR_HEADS.json](OPEN_PR_HEADS.json) records **160** open PRs through full REST pagination **100/60**, with immutable head/base SHA, draft and dependency data; 70 target non-main branches. Parent stacks are not independently mergeable to main merely because a child is green.

## Source and feature overlap findings

- F04 local CSV/JSON export is already on #397, a child of dormant module integration #371. Source `merchant-dashboard/export.ts` provides in-memory preview and explicit approval and describes **no file download, network access or signing**; its tests check exact atomic strings and single-use reviews. It does not establish production activation.
- F10 recurring M2 lifecycle is #391, and M3 single-use *prepared reference* is #396 stacked on #391, itself stacked on #371. M3 source explicitly requires later durable encrypted compare-and-swap (P05) before signing/export; do not treat `prepared` as issued, paid or durable. No background scheduler/custodial service is authorized.
- Current payment and parsing repairs are already assigned (#384, #389–#390, #392–#393, #398–#399). The changed source files must be qualified through their existing PRs, not re-created elsewhere.
- #386 → #381 → #373 → #372 remains a combined browser/privacy/custody qualification chain, not four independent mainline fixes.

## CI and review evidence

[CI_SNAPSHOT.json](CI_SNAPSHOT.json) preserves workflow runs tied to exact PR heads; queued/running are **not passing**. Among 10 sampled PRs, #384 and #368 had all recorded workflows green, but each had **zero recorded independent GitHub approvals** at review inspection. Other PRs have pending or failed gates. Do not self-approve or bypass a branch protection rule.

- [#386 native run 44897636269](https://github.com/djshellshoxxx/GhostPay/actions/runs/44897636269) failed Firefox lean/full (eight cascaded failures each after `Page crashed`, repeated Juggler errors and `RenderCompositorSWGL failed mapping default framebuffer`). The **WebKit lean** job also failed one distinct test: `e2e/idle-session.spec.ts:80` timed out at line 92 waiting for Seller keys nav to become click-stable after clock advance and browser history restore. Its job has **133 passed, 5 skipped, 1 failed**; inspect [trace artifact 14705345269](https://github.com/djshellshoxxx/GhostPay/actions/runs/44897636269/artifacts/14705345269). This is *not* proof of expired key exposure. A diagnostic source-pinned comment was added to #386; do not weaken privacy or idle-lock tests to silence the failures.
- Exact-head CI for #399, #393, #392, #388, #389, #398 remained queued/pending on sampled runs. Recheck before promotion.

## Integration lock, safety and next worker handoff

Observed [integration-lock.json](https://github.com/djshellshoxxx/GhostPay/blob/automation/ghostpay-integration-lock/integration-lock.json): status **held**, generation **11**, owner **`994a0d214fb9-root-r3`**. Time expiry alone does not authorize takeover. No main merge, force update, deployment, release, real-money transaction, key-handling change or runtime application change was performed. This is a docs-only child of canonical [#380](https://github.com/djshellshoxxx/GhostPay/pull/380), not a competing master ledger.

1. Refresh main, branch heads, PRs and lock state before integration. If main moves, redo comparisons to the new main; R9 inherited counts are not portable to a changed base.
2. Independently review this R12 evidence against R9 and the 22 exact SHA compares; after checks and approval, integrate child into #380. No automatic release.
3. Traverse 59 capped branches per commit and semantically match unique code to active owners. Protect 30-day privacy partial reporting, signer authority, recovery CAS, keys, browser-only/Tor/Pages properties.
4. Reproduce and repair the Firefox crash and WebKit idle-history timeout in the existing browser stack. Do not disable the test or assume test failure means production custody failure.
5. Qualify F04/F10 acceptance without activating dormant modules or implementing server-side recurring scheduling. Full local tests, browser, lint, build and independent security review still necessary.

**Execution limitation:** This round performed read-only GitHub source, commit comparison, PR, workflow and job-log verification, committed evidence and coordination, not local application test execution or a new runtime-code regression. An approved worker must perform those remaining gates on any application PR.
