# Merchant-ledger duplicate-ID completion — 2026-11-24

## Source and disposition

This local main-targeting composition preserves the existing repair and its qualification history without reimplementing it. No product or test source was authored during this completion.

| Reference | Exact SHA |
| --- | --- |
| Live main, rechecked 2026-11-24T09:19:25Z | `706188000c38b3dde5a3a362370a530870aa7587` |
| Original #522 head | `907838ef75bbd0b08b4e23f3bbea9ac9b08403d4` |
| Qualified child #555 head | `3ae56a5e0b3df9ce57e9bbf2a44c82b56e432033` |
| Qualified child tree | `2fc5ef4489df9bc81c4b9a31b633b99213819d66` |
| New ownership claim | `ec9e8257f` |
| Locally qualified composition | `7561198dad27f96e4b11ec7e081913f65663b3c5` |
| Locally qualified composition tree | `c7bc2110d37252a696d38e38f39e4da861e3b205` |

Branch: `finish/merchant-ledger-completion-20261124`. Worker: `/root/unique_history`, delegated by the completion coordinator. The final handoff commit changes documentation only. Parent coordinator owns publication, independent composition review, integration authority and new exact-head hosted checks.

Both donor heads and current main are ancestors of the composition. The only merge conflict was `docs/ai/ACTIVE_WORK.md`: the donor's exact ten-line additive prefix was preserved alongside the current-main registry and this completion claim. Every nonblank line and its occurrence count from both parents was checked after resolution. There were no product conflicts.

## Discovery and ownership

Live read-only checks found #522 and #555 open and draft at the exact heads above. #555 targets #522's branch. Searches for merchant-ledger work and #522 successors found no newer competing implementation of this repair. Changed-file inventories for #504, #579, #535, #393, #388 and #550 exclude `export.ts` and `export.duplicate-invoice.test.ts`. The separate CSV/decimal repairs in #504/#393/#388 and merchant dashboard/GhostStore changes remain outside this lane. This was a bounded relevant-path check, not a claim of a new exhaustive repository census.

Main still has the adjacent-only duplicate check, source blob `00217cc059a213a9b6dc34f8aca29aed81a109ca`. The donor repair was therefore still unique and absent from main when the composition was prepared. Recheck live heads before publication or integration.

## Source review

`resolveAll()` first resolves each invoice, then sorts by creation time and ID. Equal IDs need not be adjacent when creation times differ. The donor replaces the adjacent comparison with a `Set<string>` covering all resolved rows and preserves the same typed `LedgerError('duplicate-invoice')`.

The sort, resolved values, exact bigint arithmetic, rounding and formatters are untouched. For valid string IDs, Set membership preserves the existing equality contract while detecting duplicates at any position. The existing map-before-validation order remains unchanged, and the input collection is not mutated. `resolveAll`, CSV, JSON, Xero CSV, IIF and tax aggregation all use the corrected common path. No browser, storage, network, payment or dependency behavior is added.

| Preserved source | Exact Git object |
| --- | --- |
| Complete `packages/merchant-ledger` tree, identical to #555 | `327253262637effd83a99e43a9998798a5aa9136` |
| `src/export.ts` | `28bfee80fecad995dcbe4db1c9426e08a39044b6` |
| `src/export.duplicate-invoice.test.ts` | `bc6e06175abc8370b0bfc43303a62d2727cf5ed4` |

The existing regression covers nonadjacent duplicates in both input orders, same-date and adjacent duplicates, every export/aggregation entry point, unique-record sort order, exact tax totals, deterministic output and empty input. Existing tests and thresholds are unchanged.

## Independent source review

The parent agent `/root`, independently of this completion worker and the original repair author, reviewed the exact Set repair and the complete `export.duplicate-invoice.test.ts` against main `706188000c38b3dde5a3a362370a530870aa7587`. The reviewer found no blocker: the change detects date-separated duplicate IDs across all six entry points while preserving sorting, amounts, typed errors and the valid-output controls. The reviewed product blobs are those pinned above and are unchanged by this review record.

## Native verification on the new composition

Executed at `7561198dad27f96e4b11ec7e081913f65663b3c5` using Node 24.22.3, npm 11.19.1, the repository's installed Vitest 5.0.5 and TypeScript 5.9.3. Reused the available dependency directory through a temporary local symlink; no install or lockfile change. The symlink was removed after verification.

| Executed command | Actual result |
| --- | --- |
| `npm test -w @ghostpay/merchant-ledger -- --maxWorkers=1` | 31/31 tests passed across two files; no failures or skips |
| `npm run typecheck -w @ghostpay/merchant-ledger` | Passed |
| `npm run lint -w @ghostpay/merchant-ledger` | Passed |
| `npm run build -w @ghostpay/merchant-ledger` | Passed, including its existing invoice-schema build dependency |
| `npm run ci:scan-secrets` | Passed |
| `npm run ci:check-actions` | Passed; 111 workflow references checked |
| `npm run ci:check-tx-origin` | Passed; 39 Solidity source files checked |
| `git diff --check` and exact donor-package comparison | Passed |

Coverage: statements 100% (176/176), branches 99.31% (144/145), functions 100% (40/40), lines 100% (152/152). Existing coverage configuration is unchanged. No new synthetic test harness or regenerated fixture was needed.

## Hosted evidence belongs to donor #555

Live Actions reads confirmed all five workflow groups succeeded for exact donor head `3ae56a5e0b3df9ce57e9bbf2a44c82b56e432033`. Job details were also read; these results do not qualify the newer composition head.

| Workflow | Run | Jobs |
| --- | --- | --- |
| CI | [45319585620](https://github.com/djshellshoxxx/GhostPay/actions/runs/45319585620) | 24 successful, including full and lean E2E, TypeScript checks and tests |
| Pages | [45319585975](https://github.com/djshellshoxxx/GhostPay/actions/runs/45319585975) | 2 successful: site build/verification and Pages artifact browser; 3 skipped: release-gates job, deployment and post-deployment smoke |
| Beta acceptance | [45319585618](https://github.com/djshellshoxxx/GhostPay/actions/runs/45319585618) | 1 successful |
| Hosting kit | [45319585621](https://github.com/djshellshoxxx/GhostPay/actions/runs/45319585621) | 2 successful |
| CLI operator qualification | [45319585631](https://github.com/djshellshoxxx/GhostPay/actions/runs/45319585631) | 3 successful: Ubuntu, Windows and macOS |

The [#522 qualification comment](https://github.com/djshellshoxxx/GhostPay/pull/522#issuecomment-7121181305) and [#555 description](https://github.com/djshellshoxxx/GhostPay/pull/555) separately record the prior native 31-test run and independent 1,000 generated cases at seed 522. Those are historical donor evidence, not additional executions by this worker.

## Remaining integration boundary

At preparation of this handoff, the local completion candidate had made no remote changes. After independent source review, the parent coordinator authorized publication of this candidate as a new branch and main-targeting draft PR only. The published commit must preserve current main and #555 as parents and exactly match the locally qualified tree plus documentation. Required hosted checks for the new composition remain pending until their actual results are observed. No shared merge, donor edit, integration lease change, deployment or release is authorized here. Preserve the main and donor histories and repeat the live ownership/head check before any protected integration.
