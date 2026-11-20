# Selective historical adapter safeguard recovery

## Source and scope

The historical census is pinned to main `dfc75ef2087fa6463ae59e0818abec01796c578d`
and PR #238 candidate `198aa5baff22272453733a0f3dcfcac0e0994eec`. This implementation is
separately based on `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`, after reviewed PR #241.
The census classifications have not been relabeled as if these later changes were already present.

Branch `claude/lucid-meitner-apalzc` advanced nineteen commits beyond the older head associated
with closed PR #164. Three narrow historical commits contain useful safeguards absent from the
pinned main and candidate. They were inspected and copied with `git cherry-pick -x` into
`integration/ghostpay-historical-fixes-20261118`; no whole historical branch was imported.

| Historical source | Recovered behavior | Local provenance |
|---|---|---|
| `e2fef011ca1195d6c5edaf4e1ea1055692462004` | Reject impossible calendar dates in deployment manifests; make non-finite RPC retry counts finite | `e8d3bd0d` |
| `b098b73a3a93bde331b7f49123e99d3406b6cb6f` | Ensure the NaN retry regression fails without hanging if the bug returns | `71c860e1` |
| `c37604d1b1cf561573270d6cc002418003f80b69` | Reject incomplete or noncontiguous TRON block ranges before scanning advances | `e6369f60` |

The price-decimal loop addition in `e2fef011` is **excluded from the final runtime diff**.
Current `quote.ts` already validates an integer price-decimal count in `0..30`, a stricter
bound than the historical loop's `0..36`. Commit `cd885251` removes the redundant loop
addition and retains the useful extreme-value regression. `quote.ts` is byte-identical to
the implementation base. This correction is also recorded in the history ledger.

The net runtime changes are confined to:

- `packages/chain-adapters/src/deployments.ts`
- `packages/chain-adapters/src/rpc.ts`
- `packages/tron-adapter/src/rpc.ts`

Four existing test files receive focused regressions. The TRON change only touches
`getBlockRange`; the PR #241 transport isolation implementation is unchanged. There are
no dependency or lockfile changes. The coordinator independently reviewed the final runtime
diff and reported it preserves the PR #241 transport protections.

## Regression evidence

The tested source revision is `cd885251980fc9bd8c9dcb7fe1a380d8fc3475f3`. For the failing
reproduction, only the three changed runtime files were temporarily restored from the
implementation base while retaining the new tests. A `finally` block restored the fixed
runtime, and a clean worktree check verified restoration before the passing runs.

| Baseline behavior | Observed failure |
|---|---|
| Manifest accepts `2026-02-30T00:00:00Z` after `Date.parse` normalizes it | Expected rejection did not occur |
| `retries: NaN` never satisfies the old stop condition | Transport was called 51 times; the test's deliberate HTTP 400 escape stopped it, and the expected count of one failed |
| TRON response omits an interior block | Scan resolved to an empty result instead of rejecting the incomplete range |
| TRON response omits the block list | Scan resolved to an empty result instead of rejecting the nonempty requested range |

The new price-decimal test passed on the baseline, corroborating the existing runtime guard.
The baseline chain-adapter selection had two failing and 120 passing tests; the TRON scan
selection had two failing and 25 passing tests.

## Environment and validation

Node `v24.22.3`, npm `11.9.0`. A separate dependency installation used this worktree's
unchanged lockfile and local workspace links: Vitest `5.0.5`, TypeScript `5.9.3`, and viem
`2.57.13`. It did not reuse the broader candidate's Vitest `5.1.0` dependency tree.

```sh
npm ci --ignore-scripts --no-audit --no-fund \
  --workspace @ghostpay/chain-adapters --workspace @ghostpay/tron-adapter \
  --include-workspace-root
npm run build -w @ghostpay/core-crypto -w @ghostpay/invoice-schema
npm test -w @ghostpay/chain-adapters -- --maxWorkers=1
npm test -w @ghostpay/tron-adapter -- --maxWorkers=1
```

Installation completed with 212 packages in 49 seconds. The two prerequisite library
builds passed. Both affected package test commands exited zero using their normal coverage
configuration and unchanged thresholds.

| Package | Test files | Tests | Statements | Branches | Functions | Lines |
|---|---:|---|---:|---:|---:|---:|
| chain-adapters | 26 passed | 552 passed, 22 skipped under the existing configuration | 97.35% | 96.48% | 99.01% | 98.93% |
| tron-adapter | 9 passed | 104 passed | 96.98% | 93.36% | 98.92% | 99.08% |

The first concurrent package typecheck attempt was killed with exit 137 while running
chain-adapters; it produced no TypeScript diagnostic. That attempt is not counted as a
pass. Package lint and final affected-package builds were not launched from the failed
command chain. The coordinator is qualifying the combined candidate and hosted CI; the
local package test results do not substitute for that source-specific matrix.

Raw local logs and a JSON record with SHA-256 checksums are under the session's
`audit-data/history-fixes-*` files. `HISTORICAL_ADAPTER_VALIDATION.json` preserves the
source, environment, commands' outcomes and log checksums alongside this handoff.

## Remaining historical scope

The branch's pool zero-value checks (`ea1f0b24` and `768b1f4c`) and source-scanner / queue
changes (`016fa252`) remain separate review items. Those broader paths were not imported
by this adapter recovery. The full census records each current and deleted historical
head independently; closing an old PR was not treated as evidence that later branch work
was already integrated.
