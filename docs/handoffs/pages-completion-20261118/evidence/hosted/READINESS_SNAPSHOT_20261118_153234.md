# Readiness snapshot — 2026-11-18 15:32:34 UTC

**PR238 remains incomplete: two CLI jobs succeeded, fifteen checks are queued and one is skipped. Main has one actual failed Mythril gate and other checks still incomplete.**

This read-only snapshot does not authorize a merge, deployment or release. Later source descendants need their own head/check snapshot.

## Exact source boundaries

| Scope | Commit / tree |
|---|---|
| Draft PR | [#238](https://github.com/djshellshoxxx/GhostPay/pull/238), head `9bad95e5cc0ee73f5adb8d2c587161074b21e080` |
| PR base and current main | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Actual hosted CLI checkout | Synthetic PR merge `f8cf77781311635e281d3c9e3d692ed17ee778b3` |
| Local source used for the completed full workspace suite | `e8c77e7e8699dd16b86b7a1ff90b834594d07105` |
| Equal full tree at local tested source, published head and synthetic merge | `81341de7972041b5f7ce53da76027846356fab90` |
| GitHub PR metadata | draft=true, mergeable=true, mergeable_state=unstable |

The synthetic merge's actual checkout appears in both retained CLI logs. Tree equality supports applying those CLI results to the published candidate's contents, while preserving the actual execution SHA. It does not cover later content changes.

## PR238 checks

18 total: **2 success, 15 queued, 1 skipped**. The separate legacy Snyk status is successful; it does not override queued checks.

| Check | State | Job |
|---|---|---|
| Release gates (typecheck, lint, unit, mocked lean browser suite) | skipped | [134882152741](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327361735/job/134882152741) |
| Pages artifact on anvil (browser) | queued | [134882148928](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327361735/job/134882148928) |
| Build and verify the Pages site | queued | [134882148383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327361735/job/134882148383) |
| CLI (macos-latest) | queued | [134882135548](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356184/job/134882135548) |
| CLI (ubuntu-24.04) | success | [134882135309](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356184/job/134882135309) |
| CLI (windows-latest) | success | [134882135056](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356184/job/134882135056) |
| validate | queued | [134882129370](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327355873/job/134882129370) |
| integration (anvil + bitcoind regtest + solana-test-validator) | queued | [134882129221](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356234/job/134882129221) |
| echidna | queued | [134882128343](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356205/job/134882128343) |
| beta acceptance (lib + cli + browser on anvil) | queued | [134882127629](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327355887/job/134882127629) |
| mythril | queued | [134882127619](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356205/job/134882127619) |
| qualify-ghostpay-web | queued | [134882126966](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327355938/job/134882126966) |
| kit | queued | [134882126266](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327355938/job/134882126266) |
| changes | queued | [134882125577](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327355717/job/134882125577) |
| secrets-and-egress | queued | [134882125138](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327355717/job/134882125138) |
| Analyze (actions) | queued | [134882101652](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327346169/job/134882101652) |
| Analyze (python) | queued | [134882101594](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327346169/job/134882101594) |
| Analyze (javascript-typescript) | queued | [134882101013](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327346169/job/134882101013) |

## Completed hosted CLI evidence

Both jobs used **Node 22.23.4 / npm 10.9.9**, distinct from the local full suite's Node 22.23.5 / npm 11.21.2. Both logs show actual unit execution with coverage, followed by compiled-CLI execution. Counts across OS jobs represent repeated platform qualification and must not be added to the local full-suite count of 12,402 passes.

| Platform | Unit tests | Compiled CLI | Build helper | Build / typecheck | Retained decoded log |
|---|---:|---:|---:|---|---|
| Ubuntu24.04 | 570 passed, 0 skipped | 21 passed | 1 passed | passed / passed | pr238-cli-ubuntu-134882135309.log |
| Windows | 568 passed, 2 skipped | 21 passed | 1 passed | passed / passed | pr238-cli-windows-134882135056.log |

Recorded invocations, in order:

```text
npm run test:cli-build
npm run build:cli
npm run typecheck -w @ghostpay/cli
npm test -w @ghostpay/cli -- --maxWorkers=2
npm run test:compiled -w @ghostpay/cli
```

The two Windows skips were not executed and are not passes. No browser qualification is inferred from these CLI jobs.

## Main checks, separate from candidate

37 total: **30 success, 5 queued, 1 in progress, 1 failure**. The previously running rest-0 shard completed successfully. Main's full browser job is successful; main's lean browser job is still in progress. These observations do not qualify the changed candidate browser behavior.

| Main check | State | Job |
|---|---|---|
| Analyze (javascript-typescript) | queued | [134914495373](https://github.com/djshellshoxxx/GhostPay/actions/runs/44336481691/job/134914495373) |
| Analyze (python) | queued | [134914495338](https://github.com/djshellshoxxx/GhostPay/actions/runs/44336481691/job/134914495338) |
| Analyze (actions) | queued | [134914495295](https://github.com/djshellshoxxx/GhostPay/actions/runs/44336481691/job/134914495295) |
| contracts | queued | [134912498523](https://github.com/djshellshoxxx/GhostPay/actions/runs/44292693611/job/134912498523) |
| ts-test (rest-2) | queued | [134830674322](https://github.com/djshellshoxxx/GhostPay/actions/runs/44292693611/job/134830674322) |
| e2e (lean) | in_progress | [134830674157](https://github.com/djshellshoxxx/GhostPay/actions/runs/44292693611/job/134830674157) |
| contract-analysis / mythril | failure | [134778851902](https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/job/134778851902) |
| e2e (full), main only | success | [134830673293](https://github.com/djshellshoxxx/GhostPay/actions/runs/44292693611/job/134830673293) |
| ts-test (rest-0), main only | success | [134830673639](https://github.com/djshellshoxxx/GhostPay/actions/runs/44292693611/job/134830673639) |

The complete set of 37 names, states, source SHAs and URLs is retained in READINESS_SNAPSHOT_20261118_153234.json.

The failed main Mythril job produced an untruncated artifact with **11 findings, 3 Medium and 8 Low**, on main dfc75ef2. See HOSTED_MYTHRIL_REVIEW_20261118.md and its JSON for the new-versus-historical finding identity comparison, direct trace/source counterevidence, real fee-token availability residual and still-failed gate. No scanner or workflow was rerun.

## Retained evidence and current limits

- READINESS_SNAPSHOT_20261118_153234.json includes all returned check rows and legacy statuses.
- The two decoded hosted CLI logs preserve checkout, tools, commands and test summaries.
- HOSTED_MYTHRIL_REVIEW_20261118.{md,json}, its offline parser and downloaded artifact preserve the main failure.
- package-tests-final.{md,json} records the separately completed local suite: 68/68 test-bearing workspaces, aggregate exit0, 12,402 passed and 79 skipped.
- ECHIDNA_COMPLETION_20261118.{md,json} records the existing completed campaign with all diagnostic caveats; NATIVE_QUALIFICATION_20261118.md remains its immutable historical predecessor.

The local browser launch restriction and isolated full-web lint exit137 remain separate unresolved qualification results in the coordinator/build packet. This snapshot does not convert queued hosted checks, skipped work or local blocked execution into success.

