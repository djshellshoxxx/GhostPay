# Remote extensions: check status

Branch: `claude/remote-extensions-5` (PR #6, merged with `claude/remote-extensions-1`). Real numbers from local runs on 2026-10-21 in the cloud sandbox (Node 22.22, forge 1.8.5, solc 0.8.28). Nothing skipped unless listed below.

## Packages and apps

Typecheck (`npm run typecheck -w <ws>`) and lint (`npm run lint -w <ws>`) exit 0 for every workspace below. Coverage is the vitest v8 `All files` row (stmts / branch / funcs / lines).

| Workspace | Tests passed | Test files | Coverage |
|---|---|---|---|
Counts in the first two columns: full `npm test` run on integration SHA `1ca74abb`, 2026-11-14 (`@ghostpay/*` workspace totals). Coverage column: still the 2026-10-21 snapshot, not re-measured.

| Workspace | Tests passed | Test files | Coverage |
|---|---|---|---|
| packages/core-crypto | 75 | 9 | 98.95 / 98.01 / 100 / 98.75 |
| packages/invoice-schema | 715 | 12 | 99.36 / 99.27 / 100 / 99.48 |
| packages/chain-adapters | 465 | 22 | 98.45 / 98.45 / 95.87 / 99.5 |
| packages/btc-silent-payments | 493 | 30 | 97.71 / 95.82 / 98.5 / 99.4 |
| packages/policy-scheme | 95 | 6 | 98.06 / 95.89 / 100 / 99.67 |
| packages/relayer-guard | 167 | 5 | 100 / 96.46 / 100 / 100 |
| packages/secret-box | 47 | 3 | 100 / 100 / 100 / 100 |
| packages/tx-review | 160 | 5 | 99.57 / 98.66 / 100 / 100 |
| packages/address-safety | 76 | 4 | 100 / 97.08 / 100 / 100 |
| packages/ops-monitor | 99 | 7 | 99.35 / 95.74 / 100 / 100 |
| apps/relayer | 422 (+1 skipped) | 12 | 98.99 / 96.9 / 99.33 / 99.69 |
| apps/web | 2569 (+1 failed, +1 skipped) | 179 (1 failed) | 95.69 / 91.51 / 92.71 / 97.47 |

Thresholds (95 / 90 / 95 / 95) are unchanged in every package.

## Reruns and totals (2026-11-14, separate from the full run above)

- Full run, SHA `1ca74abb`: 11532 passed, 1 failed, 80 skipped (sum of workspace totals; `@ghostpay/confidential-contracts` printed no test totals).
- Full-run failure: `apps/web` `Settings.test.tsx` L1-01. Fixed in `1f57b167`; rerun of that file: 14/14 pass.
- `@ghostpay/confidential-contracts` (hardhat) did not run in the full run (compiler download blocked). Separate rerun with local solc 0.8.28: 37 passing, 9 pending.
- Base `36bcdb74`, same setup: 11507 passed, 2 failed, 84 skipped.
- Script tests `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs` (after CodeQL fix): 184 tests, 183 pass, 0 fail, 1 skipped.
- `forge coverage --ir-minimum --report summary` (forge 1.7.1 local, CI pins v1.8.5): 434 pass, 0 fail, total lines 73.41%.

## Contracts (packages/contracts)

- `forge test`: 23 suites, 377 passed, 0 failed, 0 skipped (~46 s).
- `forge fmt --check`: pass.
- `forge snapshot --check`: pass (377 tests).
- `forge coverage --ir-minimum`: 434 of 434 pass (local forge 1.7.1, 2026-11-14; not re-run on the CI-pinned v1.8.5). Earlier failure of `test/audit/Sweep.audit.t.sol:SweepAuditTest.test_crossRelayerAndCrossChainReplayRejected` (`InvalidSignature()` under coverage only) was a test-harness bug: the test saved `block.chainid` in a local, and via-IR (which `--ir-minimum` forces) treats `CHAINID` as movable and re-reads it at each use, so `vm.chainId(originalChain)` restored nothing and the final positive-path sweep ran on the wrong chain. Fix is test-only (`vm.getChainId()` plus explicit domain-separator, chain-id and positive-path assertions); no contract changed. The `.gas-snapshot` entry for this test predates the test change and must be regenerated with the pinned forge.

## Failures and flakiness

- `packages/core-crypto` `differential.test.ts` ("matches on 500 random key sets x 2 payments") timed out at its 60 s limit in a run that overlapped a concurrent `forge test`. Re-run alone: 54 / 54 pass in ~51 s. The test takes close to its limit on a loaded machine; the limit was not raised.
- CI on PR #6 (run on `dadbda8`): every job green except `contracts-coverage` (the failing test above); the `contracts` gate job fails because of it.

## Skipped / not run

- `apps/web` Playwright `test:e2e`: not run locally. It passed in CI on `dadbda8`.
- Inside suites: `apps/relayer/src/e2e.anvil.test.ts` and `packages/policy-scheme/src/anvil.test.ts` each contain a conditional skip. The relayer anvil test ran here with `ANVIL_BIN` set and `REQUIRE_ANVIL=1`; the test file does not read `REQUIRE_ANVIL`, so CI cannot force it to fail instead of skip.
- Echidna and mutation runs: not re-run for this refresh. See `docs/remote/mutation-results-local.md` for the earlier results.
- Slither: not run locally; it passed in CI on `dadbda8`.
