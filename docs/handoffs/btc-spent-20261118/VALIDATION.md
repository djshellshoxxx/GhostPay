# Bitcoin spentness validation

This report distinguishes final combined-source qualification from earlier defect reproductions and
independent review selections. A passed earlier test does not qualify changed implementation.
Qualification is still running; the final disposition belongs in the packet README and PR #244.

## Exact source identity

| Item | Value |
| --- | --- |
| Repository / PR | `djshellshoxxx/GhostPay` / [#244](https://github.com/djshellshoxxx/GhostPay/pull/244) |
| Published branch | `chatgpt/btc-spent-private-scan-20261118` |
| Original #219 input | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` |
| Initial main | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Integrated main | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` |
| Reviewed local integration | `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a` |
| Reviewed published integration | `ef08170a83d86d194b8ce4186299e791027e461e` |
| Hosted PR test merge for that integration | `278b1d5afcbc5056fd096ea52e34feaaeedfdb4e` |
| Identical Git tree of those three commits | `0074dde6081e45188c45feb39503c64243ef99b8` |

Shell Git lacked push credentials. The authenticated repository connector transported each logical commit,
verifying each uploaded blob and completed tree against local Git. It preserved the original #219 commit in
ancestry, and advanced only the task branch, with an expected-head lease and no force push. The hosted test
merge tree was checked independently through GitHub's Git API. Commit IDs differ because transport and merge
metadata differ; the implementation trees above are identical.

The only conflict while integrating current main was the shared ownership registry. Both claims were retained.
Independent review confirmed that incoming release-hash and shared-transport changes do not replace Bitcoin's
own fetch/worker boundaries. The separately identified typing and provider-label corrections below follow
that integration. Packet edits after the latest correction are documentation/evidence only and must retain
an empty implementation diff against that source.

## Latest provider-label correction and qualification

Local commit `1977a50010e2d72476e0de67168b4f46715aab9c` and published commit
`981cc2f4395d2d76c499a5cd46387daaaa3a6b1f` have identical tree
`af61e24cb588fbf082915deac110c10cca008e70`. They change only the worker result guard and its regression file.
The old guard rejected `provider` without consent but accepted `local` or `unknown` with consent, even after
an authorized outspend request. A symmetric predicate now rejects either mismatch. Existing default-off
local/unknown results, mandatory light consent, error handling and teardown remain intact.

GitHub's latest advertised merge is `d46949b99709b5dae2b4edc3d8c4bb2d2ed50cac`, tree
`82d54202a4d1b71c88fc05d04ebb40ad720c26f3`, with parents main
`a36f48da526b818a5940a7a0ed2ae7303ef17056` and published fix `981cc2f4`. All 38 feature-file hashes match
the reviewed local and published fix. The newest main advance from `e454de6a` changes only two existing documentation files; complete `apps` and `packages` trees are unchanged. Independent compatibility review found no blocker.
This object comparison is separate from observing the checkout and outcome of each workflow execution.

- Failing-before run: two new cases failed because the promise resolved instead of rejecting; 20 tests were
  filtered by the targeted name. The committed test bytes match the reproduced red run.
- Passing-after run: **45 passed, 0 failed, 0 skipped**, three files, 19.73 seconds with Node 22.23.5 and
  Vitest 5.0.5. Both cases make an actual authorized bridge request before forging the completion label,
  then require `INVALID_RESPONSE`, tweak wiping, worker termination and handler detachment.
- Focused ESLint for the two changed files exited 0. Independent review of the committed source, test contract,
  hashes and red/green reports found no blocker; that reviewer did not claim an additional test execution.
- Existing main CI run **44486593963** is pending for the new head. No earlier execution is assigned to it.

The complete Bitcoin web directory was then executed on this latest source with the existing configuration:

```sh
node --max-old-space-size=1024 ../../node_modules/vitest/vitest.mjs run src/features/btc --maxWorkers=1 --no-file-parallelism --reporter=default --reporter=json --outputFile=/workspace/scratch/c20ffc46347e/integration-evidence/btc-directory-consent-final-vitest.json
```

From `apps/web`, this passed **244 tests, 0 failed, 1 existing live-bitcoind skip**, 245 total, across all
22 files (21 passed, one skipped). The missing regtest URL, seed and destination account for the existing skip;
none was added. UTC start `2026-11-19T08:23:01.156Z`, end `2026-11-19T08:27:06.874Z`; reported wrapper
duration 245.897 seconds, Vitest 244.92 seconds, exit 0. No coverage was collected or test-name filter applied.
All 118 source/configuration records and required workspace outputs stayed current and unchanged. The
canonical source-array SHA-256 is `7f8963c265c0a5d9097d32a001a9fc3df34d32e8a600f6069d3671d213c0d341`;
both raw manifest files hash to `e5598830e479a5c5daa0513513f88372813565d70f02325a031297ff1004bf2e`.
The evidence below embeds the complete result, manifest and log. This new-source feature pass does not
substitute for whole-web coverage or full/lean Chromium.

The documented `npm run typecheck -w @ghostpay/web` then passed, exit 0, with no TypeScript diagnostics.
It used Node 22.23.5, npm 11.9.0, TypeScript 5.9.3, the existing configuration and a 1 GiB Node heap cap.
UTC `2026-11-19T08:31:27.400Z`–`2026-11-19T08:32:18.485Z`, 51.085 seconds. All 18 required workspace
imports were available and the source/configuration records remained unchanged. This is fresh web typecheck
evidence; the earlier terminated attempts remain unsuccessful, and the whole-workspace hosted gate is separate.

The single documented whole-workspace `npm run lint` invocation then exited **137**, from
`2026-11-19T08:39:27.013Z` to `2026-11-19T08:50:12.705Z` (645.692 seconds). Its unchanged root script
started all 67 workspace lint scripts. CLI, confidential-amounts, external-pools-privacypools, hygiene and web
each recorded a lifecycle code-137 failure with `Killed` output. No ESLint rule errors were recorded; one unused
`eslint-disable` warning occurred in the unchanged generated `indexing_server_pb.ts`. The terminated workspaces
remain unqualified; absence of diagnostics before termination is not a pass. The cause is unverified.

Tooling was Node 22.23.5, npm 11.9.0, ESLint 10.15.0 and typescript-eslint 8.73.0, with a 1 GiB heap cap.
Before that single invocation, existing builds of `external-pools`, `pool-sdk` and `pool-prover` resolved 26
missing import uses; no missing prerequisite remained. No rule/configuration change or retry was made.
App/package/configuration comparisons and the 118-record manifest stayed unchanged. Exact commands, complete
log, prerequisite build log and result hashes are retained in the latest correction evidence below.

Fresh hosted CLI Ubuntu job [135431489686](https://github.com/djshellshoxxx/GhostPay/actions/runs/44486594006/job/135431489686)
confirms checkout `d46949b99709b5dae2b4edc3d8c4bb2d2ed50cac` and passed CLI build/typecheck, 570 unit
tests in 37 files, one build check and 21 compiled checks, all with zero skips. Its CLI coverage gate passed:
statements 98.61%, branches 97.33%, functions 99.07%, lines 99.49%. Observed Node 22.23.4 and npm 10.9.9.
This is current-merge CLI compatibility; Bitcoin/web coverage and browser acceptance remain distinct gates.
The full CLI workflow subsequently completed successfully: macOS also passed 570 tests without skips;
Windows passed 568 with its two platform skips. Each platform passed the one build check and 21 compiled
checks. All three log the same `d46949b9` checkout, Node 22.23.4 and npm 10.9.9. Windows coverage is
98.40% / 97.28% / 99.07% / 99.33% (statements/branches/functions/lines); macOS matches Ubuntu above.
These repeated platform executions are not added into a count of unique feature tests. No workflow artifacts
were produced. Per-platform commands, skip evidence and log hashes are under `latestConsentFix` in
[hosted-ci.json](evidence/hosted-ci.json).

Fresh Pages build [135431490079](https://github.com/djshellshoxxx/GhostPay/actions/runs/44486594015/job/135431490079)
and Integration [135431488263](https://github.com/djshellshoxxx/GhostPay/actions/runs/44486593825/job/135431488263)
both confirm checkout `d46949b9` and passed. Pages used Node 22.23.4/npm 10.9.9, removed previous library
outputs before rebuilding, passed 72 tooling tests with no skips, and completed the existing web typecheck,
lean Vite build, distribution scan, source secret scan and 16-file DEMO site verification. Artifact
[14513612413](https://github.com/djshellshoxxx/GhostPay/actions/runs/44486594015/artifacts/14513612413)
is 717,405 bytes, GitHub-reported SHA-256
`04e28f3cf3b759cb0f354e591bf8dcb551584e7f92f676604b331530490fb89a`.

Integration's actual test runtime log prints Node 22.23.4/npm 10.9.9. All nine Bitcoin regtest steps passed,
including send, scan, real-node block proofs, sweep and destination confirmation; existing EVM/Solana suites
also passed. Artifact [14514026496](https://github.com/djshellshoxxx/GhostPay/actions/runs/44486593825/artifacts/14514026496)
is 2,393,589 bytes, GitHub-reported SHA-256
`b2ebbb41eb732545dbb19b81cb3ed76c15353a0167450895fbc10034ac7d0102`.
These fresh current-merge results are retained under `latestConsentFix` in the Pages and integration evidence
files. They do not substitute for the main CI full/lean Chromium and Bitcoin/web coverage gates.

The fresh Pages browser job [135431490312](https://github.com/djshellshoxxx/GhostPay/actions/runs/44486594015/job/135431490312)
also passed **16 tests, zero failures/skips**, with actual checkout `d46949b9` confirmed. It separately builds
a test-manifest Pages artifact for local Anvil; this is lean compatibility, not Bitcoin runtime acceptance or
testing of a deployed site. Observed Node 22.23.4/npm 10.9.9; install logs identify Chrome/Headless Shell
156.0.8078.4, Playwright revision 1248. All case lines and raw-log identity are retained in
[hosted-pages-browser.json](evidence/hosted-pages-browser.json). Release/deploy/post-deploy jobs were skipped.

All five fresh supplemental workflows completed successfully. Beta passed 124 CLI acceptance checks and three
browser tests; Hosting kit passed 290 tests with six explicit environment/optional-execution skips, and its
separate web qualification passed one browser check. These are compatibility checks, not additional unique
Bitcoin tests. Beta's log does not print a Chromium version. Hosting web used Node 22.23.5, while Beta and the
kit used Node 22.23.4; all printed npm 10.9.9. Exact commands, six kit skip reasons, artifact metadata and
verification excerpts are under `latestConsentFix` in [hosted-ci.json](evidence/hosted-ci.json).

Exact commands, source hashes, logs and review boundaries are retained in
[worker-consent-label-fix.json](evidence/worker-consent-label-fix.json). This fixes a false disclosure label
on a malformed worker result; the demonstrated provider request was authorized. The existing UI passes a
fresh readonly-parameter object and aborts on revocation; no unrelated caller-mutation architecture was added.

## Earlier typing correction and qualification

Hosted whole-workspace lint failed at the reviewed integration with ten diagnostics in
`apps/web/src/features/btc/scanWorkerClient.ts`. Three explicit callback parameter types restore the intended
validated element types after `Array.isArray` narrowing. Local correction:
`10c3993d4d7a215c57b936ee2b1967741d247675`; published equivalent:
`4a878e302beac5cca52d20e17cdd756f3fbebb0d`; identical tree:
`6506216897d158f8fa31813dd1e69cf6739df920`.

The implementer reproduced all ten errors before changing the file. Afterward, all 28 changed web/e2e/security-key
files passed default scoped ESLint, and unchanged worker suites passed 29 tests (20 client/protocol and 9 source
bridge), with zero skips. TypeScript5.9.3 ES2022/ESNext output is byte-identical before/after:10,176 bytes,
SHA-256 `7d6dd13f1bd0e28209ad0667695045a3a6373d98810a5f9a20caeec572e4d853`. The independent reviewer reproduced
that equality and confirmed every runtime predicate remains intact. [Exact evidence](evidence/worker-typing-fix.json)
retains source hashes, red/green lint and the worker results.

Earlier CI results below remain attributed to their original merge commit. They are not relabelled as executions
at the corrected head. Fresh required checks will run on the corrected candidate plus its documentation packet;
the PR records the current head and final check status. No rules, coverage thresholds, test inputs or timeouts changed.

The corrected packet was published at `2364284a2717a22b895fcb7badeb2e7ae6bb0e48`, identical to local
`d593fde4bf49b28a99112579ea6c6c8d36270324` at tree `bd740c1913057a42b5b0a6cabb46a4cddef3dc9f`.
Main subsequently reached `e454de6abfefda70d82784fafc1d8949b277c334`; the advertised PR merge
`d169af429f2c3be6536118b280f849016292c85d` has tree `143c2be8d3a75ed1f68ed0b3d47bd8becee49d30` and
parents `e454de6abfefda70d82784fafc1d8949b277c334` and `2364284a2717a22b895fcb7badeb2e7ae6bb0e48`.
Git objects and all 38 feature-file hashes were checked independently. The incoming 22-file delta received
bounded compatibility review of the relevant shared runtime patches. This is not the branch's earlier identical tree, and no test result is
assigned to it until the actual executing workflow checkout is observed.

## Complete Bitcoin web selection before the provider-label correction

Local commit `d593fde4bf49b28a99112579ea6c6c8d36270324` and published commit
`2364284a2717a22b895fcb7badeb2e7ae6bb0e48` have identical tree
`bd740c1913057a42b5b0a6cabb46a4cddef3dc9f`. From `apps/web`, the full Bitcoin feature directory was tested
with Node 22.23.5 using:

```sh
node --max-old-space-size=1024 ../../node_modules/vitest/vitest.mjs run src/features/btc --maxWorkers=1 --no-file-parallelism
```

The recorded invocation also enabled default/JSON reporters and supplied an output-file path. It used the
existing Vite/Vitest configuration, without a test-name filter, assertion change or timeout change.

- **242 passed, 0 failed, 1 skipped, 0 todo**, across 22 files: 21 passed and one skipped.
- The existing skipped case is `regtest end to end (live bitcoind) detects the silent payment, sweeps it, and
  sees it spent afterwards`. Its required regtest URL, seed and destination were absent; no new skip was added.
- Started `2026-11-19T07:17:16.278Z`, finished `2026-11-19T07:24:00.063Z`; wrapper duration 403.771 seconds,
  Vitest duration 402.49 seconds; exit 0.
- All 118 recorded source/configuration records were unchanged during and after the run. The 16 required
  workspace output entry points were present and resolved from this checkout. Package sources were unchanged
  since their current-source builds; no stale outputs were copied from another checkout.
- No coverage was collected. This selection establishes the Bitcoin web feature regression result on the
  recorded source, not whole-web, browser, live-regtest or later worker-label qualification.

[The evidence](evidence/worker-typing-fix.json) embeds the result, complete source manifest and exact raw log.
The canonical manifest digest is SHA-256 `29cbc90221261f304a74c7a54285f2e232fbfab0e8431d2e7d7f67ac73444f12`,
over compact UTF-8 `JSON.stringify(sources)` with no trailing newline. The saved manifest wrapper has a
different, separately recorded file digest. Raw log SHA-256:
`dd94834e3aa5959ea5d4358c114db11070477363a93ebcdd4a4f5bca398991c3`.

## Hosted qualification before the provider-label correction

The successful Pages build log confirms actual checkout
`d169af429f2c3be6536118b280f849016292c85d` (tree `143c2be8d3a75ed1f68ed0b3d47bd8becee49d30`), combining
feature head `2364284a2717a22b895fcb7badeb2e7ae6bb0e48` with main
`e454de6abfefda70d82784fafc1d8949b277c334`. This is fresh execution evidence, separate from the earlier
`278b1d5a` merge. Each other workflow still requires its own observed checkout and result.

| Required check | Current recorded result |
| --- | --- |
| Clean workspace library build, Pages web typecheck/build/bundle scan and site verification | Passed in [Pages build job 135398966591](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476728338/job/135398966591). Node 22.23.5, npm 10.9.9. Verified 16-file DEMO site. |
| Pages tooling | 72 passed, 0 failed, 0 skipped in that build job. |
| Dependency tree, action pins and source secret scan | Passed in that build job. |
| Pages Chromium | [Job 135398966895](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476728338/job/135398966895): 16 passed, 0 failed/skipped; actual checkout `d169af42` confirmed. Lean Pages compatibility, not Bitcoin runtime acceptance. |
| Bitcoin regtest integration | [Job 135398967425](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476728321/job/135398967425): all 9 Bitcoin steps passed; actual checkout `d169af42` confirmed. Existing EVM/Solana suites also passed. |
| Whole-workspace lint/typecheck/build, Bitcoin/web coverage and full/lean Chromium | Main CI run 44476728502 was superseded after initial secrets/changes passed; the required matrix jobs were cancelled before execution. Fresh run 44486593963 belongs to the later provider-label correction. |

The fresh [Pages archive](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476728338/artifacts/14508312194)
is 717,418 bytes, SHA-256 `50075053f9f49a9c5a51dd99cf7e7e0c3fbfdf7c40e2ff8840fa37734a30c225`.
It is a lean DEMO site with payments disabled on every chain. Build and verification success does not establish
Bitcoin runtime behavior in a profile that deliberately excludes Bitcoin. The exact build log, commands and
artifact metadata are retained under `correctedCandidate` in [hosted-pages.json](evidence/hosted-pages.json).
The Pages workflow's release, deployment and post-deployment jobs were skipped for the PR. No site was published.

Fresh browser and integration logs are retained in [hosted-pages-browser.json](evidence/hosted-pages-browser.json)
and [hosted-integration.json](evidence/hosted-integration.json). The integration suite uses local containerized
nodes and verifies sending, scanning, block proofs, sweeping and the destination's confirmed receipt. Its nine
steps do not replace the new deterministic spentness, consent, resumption or full-profile browser cases.

The same `d169af42` checkout was independently confirmed in the successful supplementary workflow logs.
Beta acceptance passed three browser tests. CLI passed 570 tests on each of Ubuntu and macOS; Windows passed
568 with two explicit platform skips. These are repeated platform executions, not distinct feature-test totals.
The hosting kit reported 290 passed and six environment/optional-execution skips; its separate web qualification
job passed. Exact commands, toolchains and skip reasons are in `correctedAuxiliaryChecks` in
[hosted-ci.json](evidence/hosted-ci.json). They remain prior-source compatibility evidence.

## Whole-web local attempt and separate no-coverage phase

These executions used local `d593fde4bf49b28a99112579ea6c6c8d36270324`, published equivalent
`2364284a2717a22b895fcb7badeb2e7ae6bb0e48`, before the provider-label correction. Application, package and
configuration hashes remained unchanged. All required workspace outputs resolved from this checkout; the
existing `relayer-guard` build supplied the one missing output. Node 22.23.5 and Vitest 5.0.5 were used.

From `apps/web`, the existing coverage phase was invoked with a 1 GiB heap cap, one worker and JSON/default
reporters: `vitest run --coverage --maxWorkers=1 --no-file-parallelism`. There was no test-name filter or
configuration/deadline/coverage change. Started `2026-11-19T07:28:53.974Z`, it ended with child **SIGKILL** at
`2026-11-19T08:06:42.643Z`, after **2,268.667 seconds**; the wrapper returned exit 1. No final Vitest JSON,
LCOV report or coverage-threshold outcome was produced. The cause of the signal is unverified.

The partial log has completion records for 29 of 201 files; 172 have no completion record. Those completed
lines account for 929 passing assertions, two failed TRON assertions, 12 intentional native-integration skips,
and 25 unexecuted QR-classification tests following a failed-suite marker. The two named failures were
“warns that a never-used destination costs an activation fee” and “validates scanned destinations before filling
them.” Detailed TRON errors and QR suite failure details were not emitted before termination. Durations alone do not
establish their causes. A process observation 1.113 seconds after SIGKILL supplies no earlier CPU/memory evidence.

Read-only attribution found 28 directly relevant TRON/shared/configuration blobs and nine package trees
unchanged from integrated main. The broader static import graph does include changed BTC imports and 14
security-copy keys; those keys are not queried by the directly relevant TRON rendering path. No direct change
to the tested TRON behavior was found. This does not prove a baseline failure or environmental cause; no
TRON implementation, assertion or deadline was changed.

The separately executed existing `vitest.nocov.config.ts` phase passed **3 tests in 3 files, 0 failed/skipped**,
exit 0, from `2026-11-19T08:09:57.723Z` to `2026-11-19T08:10:54.425Z`; Vitest 55.89 seconds, wrapper 56.695
seconds. It covers scanner spam acceptance, scanner cost and archive fuzzing. This separate pass does not
make the composite `npm test` command a pass.

Anvil, Forge and Solc and the five policy contract artifacts were unavailable locally. `REQUIRE_ANVIL` stayed
unset, retaining the existing availability guards; these local runs do not establish hosted required-Anvil
qualification. Exact invocations, source checks, partial inventory and logs are in
[local-check-logs.json](evidence/local-check-logs.json).

## Toolchains

- Final local checks: Node `v22.23.5`, npm `11.9.0`, TypeScript `5.9.3`, Vitest and V8 coverage `5.0.5`,
  Playwright `1.64.1`. The repository lockfile and dependency declarations are unchanged.
- Hosted Pages build: Node `v22.23.4`, npm `10.9.9`. The Pages browser job used Node `v22.23.5`, npm `10.9.9`,
  Chromium Headless Shell `156.0.8078.4`, Playwright build `1248`. Hosted browser tools are installed by the
  existing workflow; these observed patch versions are recorded separately.
- Fresh corrected-merge Pages build: Node `v22.23.5`, npm `10.9.9`; its actual checkout is `d169af42` as recorded above.
- Fresh corrected-merge Pages browser: Node `v22.23.4`, npm `10.9.9`; installed Chromium `156.0.8078.4`,
  Playwright build `1248`. Fresh integration: Node `v22.23.4`, npm `10.9.9`, Bitcoin image `bitcoin/bitcoin:31.1`
  pinned by digest in the integration evidence. These are separate observed toolchains, not normalized patch versions.
- Earlier implementation/review checks: Node `v24.22.3`, npm `11.9.0`, Vitest `5.0.5`. These are recorded
  separately, not relabelled as final Node22 qualification.
- Local heavy commands use `NODE_OPTIONS=--max-old-space-size=1024` and one Vitest worker. No test deadline,
  assertion, inclusion rule or coverage threshold was changed.

## Recorded results on the reviewed integration source

| Check | Command or hosted job | Observed result |
| --- | --- | --- |
| Source secrets | `bash scripts/scan-secrets.sh` | Passed locally and in hosted CI/Pages. |
| Locale catalogs | `node scripts/i18n/check.mjs` | Passed: 4 catalogs, 0 errors, 451 informational warnings. Security copy intentionally uses the existing English fallback. |
| Translation-key use | `node scripts/i18n/extract.mjs` | Passed: 2,122 used, 0 missing, 143 unused catalog keys reported. |
| Pages tooling | `node --test scripts/pages/*.test.mjs` | 72 passed, 0 failed, 0 skipped, both locally and hosted. |
| Network egress | `node --test scripts/tests/network-egress-inventory.test.mjs scripts/tests/network-isolation-native.test.mjs` | 23 passed, 0 failed, 0 skipped locally. This includes accepted-main transport checks, not a substitute for Bitcoin consent tests. |
| Pages build and independent site verification | [Pages job 135384438424](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294261/job/135384438424) | Passed. Clean library build, web typecheck, lean bundle scan and verified 16-file DEMO site. |
| Pages Chromium on anvil | [Pages job 135384438580](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294261/job/135384438580) | 16 passed. No Bitcoin runtime in this intentionally lean profile. |
| Integration with Bitcoin regtest | [Integration job 135384438299](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294258/job/135384438299) | Passed; Bitcoin completed all 9 steps. Existing EVM and Solana suites also passed without feature changes to those paths. |
| Whole Bitcoin library and coverage | `npm test -w @ghostpay/btc-silent-payments -- --maxWorkers=1 --no-file-parallelism` | Local Node22: 566 passed, 1 existing header-stress timeout, 0 skipped; 32 files; exit 1; no coverage summary. Hosted gate pending. |
| Bitcoin package lint and typecheck | `npm run lint -w @ghostpay/btc-silent-payments`; `npm run typecheck -w @ghostpay/btc-silent-payments` | Both passed on Node22. All 89 tracked package hashes remained unchanged during the sequence. |
| Whole workspace typecheck | CI `npm run typecheck`, job 135386936883 | Passed. |
| Whole workspace ESLint | CI `npm run lint`, job 135386936856 | Failed: 10 unsafe-access/argument diagnostics in worker-result callback typing. Corrective narrowing and fresh qualification required. |
| Whole web suites and build | Existing CI commands | The earlier whole-web and build jobs were cancelled before execution when the corrected run superseded them. Fresh qualification is pending. |
| Lean Chromium | CI `e2e (lean)`, job 135386936908 | 71 passed, 5 intentional profile skips; the new no-Bitcoin surface/worker/traffic case passed. |
| Full Chromium | CI `e2e (full)` | The earlier full-profile job was cancelled before execution when the corrected run superseded it. Fresh qualification is pending. |

The verified Pages archive is [pages-site-278b1d5a](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472294261/artifacts/14505310987),
716,253 bytes, SHA-256 `73d56d8324fde6a51cdeedd2bf04ea986e0d7b26e3d9af19771baa9d81b61208`.
It contains the site, module report, served-file hashes and build evidence. It is a DEMO artifact with payments
disabled on every chain. The separate Pages browser job builds a test-manifest development artifact for local
anvil; it does not publish it.

## Earlier checks and failures retained

- Independent review executed 119 tests in 12 files: worker/oracle 46, package scanner/state 39, web
  spent/resume/store/secrets 29, final UI consent/session ownership 5. Exact source anchors and commands are in
  [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md). These selections had no skips.
- Coordinator Esplora suite: 38 passed. Header suite before the final shortened-chain edge: 31 passed.
  Final invalidation selection: 5 passed, 27 explicitly deselected by the targeted filter.
- Earlier whole Bitcoin coverage run at `6f5134de3443e36845fc9f150060d6a083aea86c`:
  566 passed, 1 failed, 0 skipped across 32 files. The existing 100,005-header reload stress test exceeded its
  unchanged 60-second deadline; no coverage summary was emitted. Package build, lint and typecheck passed.
- The subsequent whole header-source run passed 31 and hit the same class of existing 60-second stress timeout.
  The final targeted invalidation regressions passed. These failed broader attempts are not passes.
- Two earlier whole-web typecheck attempts were terminated with exit 137 before TypeScript diagnostics.
- The final local Node22 package run also exceeded the unchanged header stress-test deadline (163.402 seconds
  reported for the test body): 566 passed, 1 failed, 0 skipped; 406.316 seconds for the coverage command.
  [The report](evidence/btc-node22-final-report.json) and [embedded raw log](evidence/local-check-logs.json) retain
  that failure separately from hosted qualification. The package lint and typecheck commands exited 0.
- Independent read-only attribution found identical source blobs for the header stress test's complete six-file
  repository import path and seven dependency/configuration files across original #219, initial main, corrected
  source and the latest advertised merge. Its duration includes mining, initial validation, serialization and
  reload validation. This supplies no baseline timing or proven environmental cause; the failed local gate remains.
- The repeated local Node22 `build:libs` was stopped with exit 130 after the exact-tree hosted clean library
  build, web typecheck and Pages verification passed. It is not counted as a local build pass; this avoided
  continuing a redundant rebuild alongside the remaining local package tests.
- The superseded whole-web coverage run started at `69be50ee78ccb813ab326d83dfa8c1c1280bb764` on Node24.
  It reported five failures in the unchanged 66-test `Pay.test.tsx` file before being stopped with exit 130
  after the main integration. It did not finish coverage or start its no-coverage pass, so it supplies no full
  suite result. Its root causes are not established by this partial log.
- Local system Chromium failed at launch, before any page ran: `socket() failed: Operation not permitted`.
  The failure is recorded as an environment limitation; no browser pass is inferred from authored specs.

The failing-before/fixed-after regressions cover forged coinbase annotations, pre-aborted disclosure, incomplete
and historical coverage, duplicate/replayed spends, missing tip anchors, spent historical siblings, orphaned
evidence, shortened checked history, worker authorization, stale results and late header ownership. The
independent review identifies the corresponding fixes and retained tests.

## Deterministic performance and resource review

Command: `node --expose-gc docs/handoffs/btc-spent-20261118/benchmark.mjs` on Node `v22.23.5`.
Runtime source remains local `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a`; the measurement-only benchmark revision
is separately bound by SHA-256 `f03b0e453906d947b512c85fc6eb79593dec2f3cc26dc8d829cd496da20f239c` in
[benchmark-final.json](evidence/benchmark-final.json). Assertions and workload were preserved when adding
actual abort-to-completion timing and sampled heap. The previous unmodified measurement is retained separately.

| Fixture observation | Measured value |
| --- | --- |
| Completed blocks / input records / watched outpoints | 500 / 500,000 / 10,000 |
| Matched payment outputs / local spend events | 0 / 500 |
| In-memory source calls / outpoint network queries | 1,500 / 0 |
| Total processing | 5,031.958 ms |
| Abort after completed blocks / source calls | 10 / 30 |
| Abort to generator completion | 0.563 ms |
| Whole cancellation pass, including its ten blocks | 126.196 ms |
| Calls after abort | 0 |
| Heap baseline / maximum sampled at 500 block boundaries | 15,910,448 / 33,586,968 bytes |
| Maximum sampled increase from baseline | 17,676,520 bytes |
| Retained heap delta after GC | −1,412,560 bytes; GC noise, not a memory-improvement claim |

This is scanner input validation and watched-outpoint filtering with in-memory sources. It excludes networking,
full-block parsing, cryptographic payment detection and browser scheduling. The cancellation measurement is
generator completion, not browser worker termination latency. Block-boundary heap sampling is **not a true
peak-memory measurement**. It should not be generalized into production scan throughput or a mobile-memory guarantee.

Source review confirmed bounded advancement and historical recovery (500 blocks each per web call), at most
10,000 restored/current matches, and deduplication storage proportional to watched/matched outpoints. Existing
worker limits remain: 524,288 UTF-16 code units of serialized state text, 16 MiB per source response and four
pending source requests (canonical state text is ASCII).
The serialized-state limit can be reached before the match-count ceiling. These are safety bounds, not promised
capacity; the new actual-output-count regression prevents shared tweak buffers from bypassing the output cap.

## Profile and scope interpretation

Bitcoin belongs to the full web profile. Its runtime cases are intentionally skipped by lean, while the new
lean acceptance case must prove no Bitcoin controls, worker or provider traffic exists. Pages release/deploy
jobs are intentionally skipped for a PR; normal Pages validation still runs. A skip is never counted as a pass.

Local confirmed-block scanning can miss mempool spends and cannot establish globally best-chain visibility.
An authorized provider report remains unproven. External nodes, proxies, physical devices and a professional
external audit are not claimed. Overall release readiness, existing Mythril findings and unrelated release
gates remain separate. PR #238's overlapping BTC implementation needs explicit reconciliation in any future
general consolidation; PR #235 seller checkpoints remain outside this change set.
