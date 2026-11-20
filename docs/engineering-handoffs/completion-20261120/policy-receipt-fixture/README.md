# Policy receipt fixture repair — generation 7

## Outcome

The shared `walletMirror` receipt fixture now includes `transactionHash` equal to the exact `0x` followed by 64 `9` characters returned by both `MockWallet.eth_sendTransaction` and the helper's transaction lookup. The existing receipt destination, status callback and block number are preserved. The original seven consumer suites pass: **7 files, 87 tests, exit 0**.

This is a one-field test fixture correction. No production code, assertion, expected policy result, deadline, timeout, configuration or runtime guard changed. Source pins in `SOURCE.json` demonstrate that all seven consumer files are byte-identical to the frozen baseline.

## Source and ownership

- Baseline: `53f4253bd9afc33bea43a7bdfe95ae287e035bf7`.
- Tested repair: `898d3361af4320dccca7743d960b32a94fb66922`.
- Branch: `fix/ghostpay-policy-receipt-fixture-20261120`.
- Only non-documentation delta: `apps/web/src/features/policy/fixtures.testutil.ts`.
- Minimal patch: `REPAIR.diff`; exact blob identities: `SOURCE.json`.
- Independent reviewer: coordinator `/root`, who checked the single-field source change and its exact correspondence with the wallet hash before focused validation completed.

Before editing, the worker inspected the separate active policy privacy branch at `037b6b896be70911bc715c868fa23bb83c35e47c` and wallet privacy branch at `f94feab3d92e443666553eda62ac6a202bca9704`. Both still had the incomplete receipt fixture, and their unique changes did not include a helper repair. Those branches were not mutated. The additive ownership claim records the authorized shared-helper scope.

## Observed baseline failure

Independent integration QA executed the original full web coverage command at the frozen baseline. It reached its existing external **900-second command cap** with **1,467 observed pass lines and 19 failures**: 12 in `send.test.ts` and 7 in `PolicyView.guard.test.tsx`. The process exited 124; it did not produce a complete suite or aggregate coverage result. The repository's per-test timeout remained 60,000 ms.

The baseline's missing `transactionHash` makes the reviewed receipt-validation guard reject the mock before tests can reach their intended approval, allowance, session, deadline and repeat-payment checks. The lossless upstream log is retained as `BASELINE-coverage-partial.log.gz`; `BASELINE-outcome.json` preserves QA's exact failure inventory and explicit limits. Its upstream `raw_log` value names QA's original location. `SOURCE.json` records the original file path and SHA-256 of the archived gzip.

A new baseline run was unnecessary because the exact unchanged-source failure transcript was available. No incomplete result is represented as a passing whole-suite check. QA separately reported that the original nocov pass completed 4 tests in 4 files; that separate pass is not included in this worker's 87-test count.

## Focused validation

Executed at the exact repair source with Node `v24.22.3` and `NODE_OPTIONS=--max-old-space-size=768`, from `apps/web`:

```sh
../../node_modules/.bin/vitest run \
  src/features/policy/send.test.ts \
  src/features/policy/PolicyView.guard.test.tsx \
  src/features/policy/PolicyView.scope.test.tsx \
  src/features/policy/PolicyView.network.test.tsx \
  src/features/policy/PolicyView.test.tsx \
  src/features/policy/PolicyView.more.test.tsx \
  src/features/policy/PolicyReceive.regression.test.tsx \
  --maxWorkers=1 --reporter=verbose
```

Result: **7 passed files, 87 passed tests, exit 0**, 37.34 seconds reported by Vitest. `FOCUSED-consumers.log.gz` contains the lossless complete output; `FOCUSED-result.json` records the exact command, source, environment and UTC timing. The original Vite/Vitest configuration and every existing assertion were preserved; coverage was not requested for this focused run.

The passing checks include reverted approvals, allowance readback, exact reviewed transactions, session and deadline revocation, unknown outcomes, repeat prevention, explicit clearing, deployment/network scope changes, and receive-side attempt preservation. Existing test names and assertions remain available in the unchanged sources.

Dependencies were privately copied from the coordinator's locked installation. All 2,223 tracked package inputs and the root manifests/configuration matched before reusing 65 package `dist` directories. All 68 workspace symlinks resolve inside this task checkout. `DEPENDENCIES.json` records the exact source checkout/head, lockfile digest, copied outputs and verified links. No dependency or package build output was committed.

## Handoff and limits

The focused test process ended and the worker released the exclusive execution window to the coordinator and integration QA immediately. This worker performs no further build or test execution. The coordinator owns integration, final full coverage/type/lint/build qualification and any publication. No remote or shared branch, contract, fee or deployment was changed.

The repair is ready for consolidation with its independent source review and focused passing evidence. The original full coverage result remains incomplete; this handoff does not establish aggregate coverage, a complete web suite, browser acceptance or release readiness.
