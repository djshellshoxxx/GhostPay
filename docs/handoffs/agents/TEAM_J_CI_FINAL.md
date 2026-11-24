# Final checkpoint CI repair

- Workstream: privacy boundary and native-test provisioning; worker `/root/ci_finish`, using Caveman.
- Repository: `djshellshoxxx/GhostPay`; branch `codex/unified-ci-final`.
- Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`, with the same source tree as published checkpoint `55e8bf49feb854d37a55d36492b0710d1226b64c`.
- Source change: `91ef6b988eab533ff2204b33f00e107bda6569e6`; claim: `59214edc`.

## Findings and changes

The checkpoint's [CI run](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891) completed with four failing test jobs, plus the expected failed TypeScript aggregate. All native contract jobs, TypeScript typecheck/lint/build, relayer tests, lean candidate, core crypto, Bitcoin library, confidential contracts and the other two remainder shards passed.

1. [Web job](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891/job/133648134329): 2,686 tests passed, six failed, one skipped. Five failures were the Bitcoin locale fixtures assigned to the source-integration lane. The sixth was the unchanged global-fetch privacy invariant. `scanWorkerClient.ts` introduced an optional fallback to `globalThis.fetch`, even though its production caller already supplies `services.fetchFn`. The fallback is now removed. The transport is required by the type signature and checked at runtime before creating a worker. Tests that exercise only worker messages now explicitly supply their fixture transport. The audited three-file global-fetch allowlist is unchanged.
2. [Remainder shard 1](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891/job/133648134670): the chain-adapters package had 535 passing tests, one failing native-prerequisite assertion and four skipped native cases. Its new quote aggregator suite needs both Anvil and native solc. The workflow already compiles contracts with pinned Solidity 0.8.28, but only forwarded `ANVIL_BIN` to the remainder shard. It now checks and supplies the exact pinned `SOLC_BIN` too. `REQUIRE_ANVIL=1` remains mandatory. A shell fixture executes the actual workflow step and verifies both the successful compiler handoff and failure before tests when the compiler is absent.
3. [Lean browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891/job/133648133938): one failure among 64 tests, in the local reconciliation proposal flow. Assigned to `/root/browser_finish`.
4. [Full browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891/job/133648134065): seven failures among 74 tests: the same reconciliation flow, five skip-link focus expectations, and the invalid seller-pairing QR error expectation. Assigned to `/root/browser_finish`.

## Validation of source change

All commands below ran against the committed source change (or its identical staged content before commit).

| Command | Result |
|---|---|
| Web `vitest run src/privacyInvariants.test.ts --maxWorkers=1` before the fix | True red: one failure, 33 passes; reported the extra global-fetch site. |
| Web worker regression before the fix | True red: missing injected transport created the worker and returned `UNSUPPORTED`, rather than refusing it as `INVALID_INPUT`; eight existing tests passed. |
| `node --test --test-name-pattern='native workspace' scripts/tests/workflows.test.mjs` before the workflow fix | True red: the actual step did not supply the required compiler to the test process. |
| Web `vitest run src/privacyInvariants.test.ts src/features/btc/scanWorker.test.ts src/features/btc/scanWorkerSource.test.ts --maxWorkers=1` | 51 tests passed in three files; no skips. |
| `node --test scripts/tests/workflows.test.mjs` | Five tests passed; no skips. |
| `ANVIL_BIN=/tmp/ghostpay-analyzers/bin/anvil SOLC_BIN=/tmp/ghostpay-analyzers/bin/solc REQUIRE_ANVIL=1 vitest run src/quote.anvil.test.ts --maxWorkers=1` in `packages/chain-adapters` | Five native tests passed; no skips. |
| `actionlint .github/workflows/ci.yml` (1.7.7) | Passed. |
| ESLint for the two changed Bitcoin TypeScript files | Passed. |
| `git diff --check` | Passed. |
| Full web `tsc --noEmit` with a 1.5 GiB heap during concurrent workers | Process killed, exit 137; no typecheck pass claimed. Coordinator will run the final integrated source through hosted typecheck. |

No assertions or privacy allowlists were weakened. No coverage, full-suite, browser or release qualification claim is made for this isolated change. Independent reviewer `/root/final_review2` received the source commit. The coordinator owns the final candidate and refreshed CI.

## Integration

Cherry-pick `91ef6b988eab533ff2204b33f00e107bda6569e6`, then this handoff. The client signature change applies to the later oracle-enabled worker client as well; preserve those oracle additions. The existing production `BtcView` already passes the injected fetch function. Keep the coordinator's Bitcoin locale fixture repairs and subsequent security-message classification. All local test processes have completed.
