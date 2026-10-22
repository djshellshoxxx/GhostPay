# Preserved source-branch test and harness baselines

This directory holds exact, non-executable copies of regression and security harness sources that do not fit the current target API or should not silently enter its default test glob. The original remote refs remain authoritative. Every snapshot path is nested below its source ref name and then retains the original repository path.

| Source | Pinned ref | Preserved source |
|---|---|---|
| Extension 1 | `origin/claude/remote-extensions-1` `39cce4663d98c7da06775441a301040af51907ed` | Six Stryker-killer test files under `docs/remote/assurance/stryker-killers/`. |
| Extension 2 | `origin/claude/remote-extensions-2` `df150cbdb58203789f5afc3050e75d92c655fa49` | Relayer hardening/network-safety tests and Solidity/Python mutation harness sources. The old `CircuitBreaker` test contract is superseded by `GuardedBreaker`; these are behavior-review inputs. |
| Extension 3 | `origin/claude/remote-extensions-3` `cdfc2ba228d76dd7605921736ed33891d1b14b0b` | Earlier Registry UI/read-back fixtures and contract round-3b/Halmos harnesses. Current target has redesigned registry/read-back flows; these snapshots are comparison inputs, not evidence that the old tests run against the new APIs. |
| Extension 4 | `origin/claude/remote-extensions-4` `4ffb7a99b222f58fde51726e06df90a6e9863b6d` | Round-4 relayer, keystore, session, scan-reorg, and chain/BTC regression tests. Match each security property to current tests before closing the disposition. |
| Extension 5 | `origin/claude/remote-extensions-5` `1337f6c121463aa70107bdd065ea88ed30ec3584` | Absent killer/regression tests and `address-safety` token parser source. These tests document properties; ext5's relayer-guard, secret-box, address-safety and tx-review production deltas still need a current-API port/review. |

The copied ext5 donation package is active source at `packages/donation/`, not a snapshot. It remains optional and unwired. The package's own tests, typecheck and build were run independently; this does not establish root workspace or application integration.

No result JSON, Mythril report, mutation score, or other generated/unverified assurance claim is copied here. Source-branch files remain available on their pinned refs for independent reproduction.

Historical test snapshots use a `.source` suffix so default test discovery does not execute files against the wrong branch APIs. The contents are unchanged; strip the suffix only when deliberately adapting a snapshot into a current test suite.
