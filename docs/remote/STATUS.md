# Remote extensions: check status

Branch: `claude/remote-extensions-5` (PR #6, merged with `claude/remote-extensions-1`). Real numbers from local runs on 2026-10-21 in the cloud sandbox (Node 22.22, forge 1.8.5, solc 0.8.28). Nothing skipped unless listed below.

## Packages and apps

Typecheck (`npm run typecheck -w <ws>`) and lint (`npm run lint -w <ws>`) exit 0 for every workspace below. Coverage is the vitest v8 `All files` row (stmts / branch / funcs / lines).

| Workspace | Tests passed | Test files | Coverage |
|---|---|---|---|
| packages/core-crypto | 54 | 7 | 98.95 / 98.01 / 100 / 98.75 |
| packages/invoice-schema | 174 | 7 | 99.36 / 99.27 / 100 / 99.48 |
| packages/chain-adapters | 216 | 10 | 98.45 / 98.45 / 95.87 / 99.5 |
| packages/btc-silent-payments | 299 | 18 | 97.71 / 95.82 / 98.5 / 99.4 |
| packages/policy-scheme | 60 | 5 | 98.06 / 95.89 / 100 / 99.67 |
| packages/relayer-guard | 137 | 4 | 100 / 96.46 / 100 / 100 |
| packages/secret-box | 31 | 2 | 100 / 100 / 100 / 100 |
| packages/tx-review | 145 | 4 | 99.57 / 98.66 / 100 / 100 |
| packages/address-safety | 71 | 3 | 100 / 97.08 / 100 / 100 |
| packages/ops-monitor | 52 | 5 | 99.35 / 95.74 / 100 / 100 |
| apps/relayer | 193 | 6 | 98.99 / 96.9 / 99.33 / 99.69 |
| apps/web | 320 | 29 | 95.69 / 91.51 / 92.71 / 97.47 |

Thresholds (95 / 90 / 95 / 95) are unchanged in every package.

## Contracts (packages/contracts)

- `forge test`: 23 suites, 377 passed, 0 failed, 0 skipped (~46 s).
- `forge fmt --check`: pass.
- `forge snapshot --check`: pass (377 tests).
- `forge coverage --ir-minimum`: **fails** on one test, reproduced locally and in CI: `test/audit/Sweep.audit.t.sol:SweepAuditTest.test_crossRelayerAndCrossChainReplayRejected` reverts `InvalidSignature()` under coverage instrumentation, while the same test passes under plain `forge test`. Cause not investigated; no test or contract was changed. 376 of 377 pass under coverage.

## Failures and flakiness

- `packages/core-crypto` `differential.test.ts` ("matches on 500 random key sets x 2 payments") timed out at its 60 s limit in a run that overlapped a concurrent `forge test`. Re-run alone: 54 / 54 pass in ~51 s. The test takes close to its limit on a loaded machine; the limit was not raised.
- CI on PR #6 (run on `dadbda8`): every job green except `contracts-coverage` (the failing test above); the `contracts` gate job fails because of it.

## Skipped / not run

- `apps/web` Playwright `test:e2e`: not run locally. It passed in CI on `dadbda8`.
- Inside suites: `apps/relayer/src/e2e.anvil.test.ts` and `packages/policy-scheme/src/anvil.test.ts` each contain a conditional skip. The relayer anvil test ran here with `ANVIL_BIN` set and `REQUIRE_ANVIL=1`; the test file does not read `REQUIRE_ANVIL`, so CI cannot force it to fail instead of skip.
- Echidna and mutation runs: not re-run for this refresh. See `docs/remote/mutation-results-local.md` for the earlier results.
- Slither: not run locally; it passed in CI on `dadbda8`.
