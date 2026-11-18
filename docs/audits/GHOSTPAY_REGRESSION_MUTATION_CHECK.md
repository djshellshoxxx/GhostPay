# GhostPay regression mutation check

Range: `a89a2e94..HEAD` of `claude/lucid-meitner-apalzc` (no merges). Method: revert only the non-test source hunk of each fix commit (tests kept), run the matching test file with coverage off, record result, restore tree. Nothing pushed.

| Fix (commit) | Mutation applied | Test file | Result | Verdict |
|---|---|---|---|---|
| scan-bundle regex-literal stripper (c0885a7a) | `git apply -R` of scan-bundle.mjs hunk (-27 lines) | apps/web/src/scanBundle.test.ts | FAILS (1: regex literal hides same-line sinks) | Strong |
| scan-bundle string-aware stripper (e77172cf) | Reverted both c0885a7a and e77172cf (the later commit builds on the earlier; reverting alone does not apply) | apps/web/src/scanBundle.test.ts | FAILS (1: URL string literal hides sinks) | Strong |
| scanSpam estimateSimilarTransfers off-filter logs (6e986e85) | Removed address and block-window checks | apps/web/src/lib/scanSpam.test.ts | FAILS (1: another token / out-of-window) | Strong |
| QrFrame large-dialog warning (00e93f7a) | Removed the 1-line fix | apps/web/src/components/QrFrame.largeWarning.test.tsx | FAILS (3: bearer, secret, caution) | Strong |
| check-tx-origin.sh split lines (be7e9671) | Removed 8-line fix | scripts/tests/check-tx-origin.test.mjs (node --test) | FAILS (1: test 8, split across lines) | Strong |
| i18n readability sentence counting ReDoS (62ccb311) | Restored old regex | packages/i18n/src/ux/readability.redos.test.ts | FAILS 3/3 runs (2.4-2.6 s vs 300 ms budget) | Strong; timing-based, ~8x margin, low flake risk |
| ops-monitor fetchBytes URL join ReDoS (62ccb311) | Restored old regex join | packages/ops-monitor/src/w3.test.ts | FAILS 3/3 runs (1.4-1.8 s vs 300 ms budget) | Strong; timing-based, ~5x margin, low flake risk |
| payer-sponsor per-chain lane + OUTCOME_UNKNOWN + loss charge (f37b06c1) | Reverted errors.ts, http.ts, service.ts | packages/payer-sponsor/src/sponsor/workerB.test.ts | FAILS (2: receipt-failure outcome and charge; no concurrent sends per chain) | Strong |
| pool-relayer maxQueue admission (5da91c2d) | Removed 17-line admission check | packages/pool-relayer/src/workerB.test.ts | FAILS (1: 503 queue_full) | Strong |
| pool-circuits zero-value rule (ea1f0b24) | Removed 5-line check | packages/pool-circuits/src/helpers.test.ts | FAILS (1: withdraw/ragequit zero) | Strong |
| chain-adapters deployments real-calendar date (e2fef011) | Reverted deployments.ts | packages/chain-adapters/src/deployments.test.ts | FAILS (1: bad date) | Strong |
| chain-adapters quote price.decimals bound (e2fef011) | Reverted quote.ts | packages/chain-adapters/src/quote.test.ts | FAILS (1: absurd decimals) | Strong |
| chain-adapters rpc NaN retries (e2fef011) | Reverted rpc.ts | packages/chain-adapters/src/rpc.test.ts | HANGS (suite did not finish in 90 s; first attempt ran past 10 min) | Detected, but as an unbounded loop, not a clean assertion failure; see note |
| tron-adapter getBlockRange fail-closed (c37604d1) | Reverted rpc.ts | packages/tron-adapter/src/scan.test.ts | FAILS (2) | Strong |

## Findings

- No fix has tests that stay green after its revert.
- Weakest signal: NaN retries. The mutated code loops forever, so the test "fails" by hanging rather than by assertion. The test would still block CI, but a bounded sleep/attempt counter in the test transport (throw after N calls) would give a clear failure instead of a hang.
- ReDoS tests are timing-based (300 ms budget, `performance.now`). The mutated runs took 5-9x the budget; fixed code runs in milliseconds. Flake risk is low on normal runners, and only a very slow or heavily loaded runner could trip the fixed path.

## Not mutated

- Docs-only commits.
- 38cb0bfa (test-only lint fix).
- 4b107609 (moves a non-workflow YAML out of `.github/workflows`; no unit test applies).
- 6e986e85 touches only scanSpam.ts in non-test source.
