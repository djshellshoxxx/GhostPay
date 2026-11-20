# Continuous engineering handoff — 2026-11-19/20

Repository: https://github.com/djshellshoxxx/GhostPay. Canonical review entry: [draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278), branch `release/ghostpay-beta-qualification-20261119`. Coordinator branch: `integration/ghostpay-continuous-followup-20261119`.

**Release status: BLOCKED. Eight demonstrated runtime defects have been repaired and independently reviewed.** The follow-up also repairs two test synchronization defects exposed by the original full qualification runs and restores discovery of three existing composite actions to the existing weekly Dependabot job. Final exact-source hosted qualification and security/release clearance remain separate gates. No engineering fixed point or complete semantic audit of every historical branch is claimed.

## Source identity

- Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Original selected candidate: `c993bb2340942c85dbf10303b61f69a91c4944e0`.
- Initial reviewed implementation: `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`, tree `7a7b189be05b802d3545e8823230076125d7bbf6`.
- Verified published initial continuation: `d74af79ebabdc8cead843361c3497b46d8c421f9`, tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`, equivalent to local `3dc86fbc49e919e664230b63dae372ff79430fc5`. [PUBLICATION_VERIFICATION.json](PUBLICATION_VERIFICATION.json) records actual publication, rather than only staging.
- **Follow-up implementation and tests:** `2b7c015e28aa23f63ba39486ae7345983ce9ff97`, tree `cfb76c46e40ba32916e385083738036ed12e33af`. Subsequent receipts do not change these product/test inputs. [FOLLOWUP_QUALIFICATION.json](FOLLOWUP_QUALIFICATION.json) pins the six changed non-documentation blobs and actual checks.
- Read the live PR head and most recent publication receipt before a shared update. Git Data publication preserves exact trees and ordered parent relationships; connector-created metadata differs, with original local commit/author attribution retained in trailers and the publication map. A staged object alone is not a published branch.

All local source integrations preserved the reviewed blobs. Conflicts were confined to additive ownership claims and resolved by retaining both contributions. Shared updates use the cooperative integration lease and expected-head, non-forced branch movement. Main, source branches, release tags and deployment state remain outside this engineering update.

## Verified repairs and consolidation

| Change | Demonstrated missing behavior | Source and verification |
| --- | --- | --- |
| Build-profile validation, PR #280 | Unknown runtime profile values could select the wrong build profile | Original `c6d16c25`, local `50b790d5`; baseline regression, exact source comparison and independent security review |
| Partial scan qualifier, PR #281 | A scan shorter than 30 days could display counts without their partial qualifier | Original `be74b36e`, local `ae303a91`; original regression RED, affected scan tests GREEN |
| Merchant signer-pin JSON, PR #282 | Duplicate JSON member names were accepted in stored signer pins | Original `4c4b221e`, local `82d7f89c`; existing strict parser reused, meaningful baseline failure and independent review |
| QR kind validation, PR #285 | Unknown or inherited payload/frame classifications were not consistently rejected | Original `613f1d90`, local `b9e7940d`; malformed-kind RED/GREEN, fail-closed source review |
| Base64url runtime types, PR #289 | Non-string values could enter the public decoder path | Original `401b2e77`, local `17467d9a`; baseline 4 passed/1 failed, fixed 5 passed |
| Export session deadline | Raw-key download could complete after expiry but before delayed lock notification | `84f39e41`, integrated `fcb25666`; genuine export 3 RED/1 control to 4 GREEN, independent generation 2 replay plus silent-clear, reentrant-reset and throwing-observer probes |
| Manifest ownership | Same-chain invoice reentry or service replacement exposed an old loaded manifest and started an extra preflight | `95f28a04`, integrated `415f6c70`; 3 RED/1 retained cancellation control to 4 GREEN, independently repeated |
| Unpaid invoice tolerance | A nonzero invoice with no counted payment could become paid when tolerance covered the amount due | Exact recovered guard `d694ce1c`, integrated `182ae0e1`; baseline 28 passed/2 failed to 30 passed, independent generation 6 and seven additional boundary probes. This repairs the existing pure merchant API; no lean/CLI reconciliation caller or new payment flow is claimed |
| Existing action update discovery | Root-only Actions configuration omitted three nested composite-action manifests | `ed98fde7`, integrated `8f31941e`; current primary discovery semantics independently checked, exact semantic config comparison and 113 action pins passed. Existing weekly cadence, grouping, PR limit and npm config retained |
| Cooperative lease tooling, PR #261 | Integration lease CLI and real-Git guards were absent | Exact selective extraction `05c441b5`; 10 original tests passed and independently rerun. Metadata lease history remains separate from source |

The five upstream changes were individually reproduced before integration. Root initial selections were web 50 passed/5 failed to 73 passed, and base64url 4 passed/1 failed to 5 passed. These overlap subsequent suites and must not be summed. Original authors/provenance were preserved; broad source branches were not merged to recover these small changes.

### Qualification repairs

The initial browser repairs fixed ABI balance-word fixtures, obsolete refusal-message expectations and recovery tests that assumed suspended scan authority survived. They retain explicit backup reimport, a fresh scan and no-download/network boundaries. Hosted d74 confirmed those scenarios passed, leaving one invoice-replacement observation failure.

The remaining browser test captured a request count before the replacement manifest finished. A deterministic test using the real RPC/authorization pipeline establishes 9 requests while pending, then 15 when ready; the six reads belong to the new grant. Releasing the revoked old fetch adds none. Commit `89e163fc`, integrated `4b679218`, waits for the existing Continue control to become enabled before sampling. Every original request, chain, raw-transaction, unexpected-method and timeout assertion remains; exact method-list equality is added. Independent review `97fd030a`, integrated `2b7c015e`, reproduces the premature observation and passes an additional late-success revoked-fetch control. [Implementation](../continuous-20261120/preflight-observation/README.md) and [independent review](browser-followup-review/README.md) retain exact evidence. The hosted artifact has no request trace; precise request attribution comes from the controlled source reproduction.

The original full web run then exposed a signer fixture that queried Continue before the refreshed manifest rendered the review controls. Commit `f2b991f7` waits for that same button, still asserts it is disabled, retains the selected-seller mismatch and zero RPC/wallet assertions, and adds a mismatch check after the wait. Root baseline 10 passed/1 failed becomes 11 passed. The independent reviewer reproduces the failure and passes all 11 fixed cases. [Signer review](signer-fixture-followup-review/README.md) records the source and limits. No runtime or timeout change was needed for either follow-up fixture.

Two earlier lint-only fixture repairs preserve behavior: `a080c2db` uses Reflect.deleteProperty for intentional array holes, and `b2711401` removes an unused malformed-input test parameter. Original assertions remain.

## Discovery and remaining uncertainty

The mechanical census covers **299 branches and 282 PRs**: 177 branch heads already ancestors of main, 32 additional ancestors of the selected candidate, 89 other related heads and one unrelated gh-pages history. The PR snapshot has 73 open, 67 merged and 142 closed without merge; no tags were present. The [archaeology report](archaeology/REPORT.md), compressed full inventory and its digest preserve exact sampled heads, merge bases, paths and patch evidence.

Generation 5 refreshed the original 70 nonancestor rows whose fresh semantic fields were null: an initial 11-head matrix, followed by a bounded 59-head continuation. This provides live heads, all merge-base path unions and exact final blobs; it is **not 70 exhaustive new semantic audits**. [Generation 5 report](generation-5-remaining-uniqueness/REPORT.md) retains explicit UNKNOWN/FUTURE entries and the narrower behavior actually inspected. Only the merchant guard and composite-action discovery became confirmed recoveries in this pass.

Two viem/minor-update candidates already retain all 752 locked node_modules entries exactly (684 external packages and 68 workspace links). Current private scanning preserves the older checkpoint/replay behavior and adds bulk evidence, cancellation and action authority. The older policy remediation's broad legacy-payer guard conflicts with current tests that permit unrelated scoped payments while rejecting same-scope duplicates. These observations justify skipping those proposed changes; they do not certify all unrelated contents of broad historical branches.

Prior exact comparisons establish represented #269/#270/#274/#279, hosting #267, and stronger current scan/RPC/privacy implementations in prioritized candidates. #262 has two merge bases; naive triple-dot counts overstate missing work. Wholesale #264 would regress current export method/address binding and monotonic authority. Old #249 scanning and #251 direct-fallback assumptions are superseded. Recovery snapshots, unsupported major dependency migrations and uninspected broad histories remain scoped UNKNOWN. Non-EVM, policy, relayer, gas sponsorship and paid privacy work remain preserved future/optional modules. No source branch was deleted or PR closed to clear the inventory.

## Actual verification results

| Scope | Observed result and practical limit |
| --- | --- |
| Clean setup and initial combined build | Pinned Node 22.23.4/npm 10.9.11, unchanged lockfile, clean npm ci with ignore-scripts; all 65 libraries, full workspace typecheck/lint, full web build/bundle scan and a payments-disabled 16-file Pages artifact passed |
| Original invoice coverage | 804 tests/14 files passed; statements 98.07%, branches 97.60%, functions 100%, lines 99.29%; original thresholds retained. A behavior-preserving test parameter edit occurred while this run was active, then its five tests/lint reran; this is not an immutable final whole-tree receipt |
| Original local web coverage | **3837 passed, 1 failed, 13 skipped**, 269 files, exit 1. Failure is the now-repaired signer fixture. No full coverage-threshold pass inferred |
| Original web nocov | 4/4 passed, including the million-log scan, unchanged budgets |
| Combined follow-up | 13 tests/3 files passed; full web typecheck and lint passed; root merchant original coverage 30/30, statements 100%, branches 99.32%, functions/lines 100%; merchant library build and 113 action pins passed |
| Browser follow-up evidence | Implementer 10/10 source tests; independent 11/11 including late-success variation; controlled premature snapshot fails 9 versus 15. Selections overlap and are not aggregated |
| Independent merchant review | Original 30/30 coverage suite; seven added boundary probes, baseline five RED/two controls then seven GREEN; typecheck/lint/build passed |
| Initial independent source/tooling review | 23/23 changed blobs matched reviewed inputs; 15 control scopes unchanged; 112 Pages tooling and 10 real-Git lease tests passed, no skips. Native HTTP tests are not browser execution |
| Feature completeness | Nine maintained feature families mapped to reachable lean source/tests, 34 source pins and 48 focused tests passed. No additional required core feature defect demonstrated; real testnet/release acceptance remains separate |
| Native contract review | 64 original disposition tests with unchanged four 10,000-run fuzz budgets plus six exact-artifact/residual probes passed using pinned Forge 1.8.5/solc 0.8.28 |
| Dependency audit | Production audit zero reported vulnerabilities; full audit 17 low package entries from two advisories, exit 1. All affected entries are development-only in confidential-contract tooling and absent from the 374-record lean module report |
| Local browser | Chromium cannot start because socket creation is denied before assertions. No local browser pass claimed; original hosted suites are the execution gate |

Sources: [initial qualification](FINAL_LOCAL_QUALIFICATION.json), [follow-up qualification](FOLLOWUP_QUALIFICATION.json), and scoped worker receipts. Exact logs/digests retain failures and skips. Reused dependency installations and overlapping test selections are disclosed.

## Hosted checks and security gate

The initial published d74 continuation ran as synthetic merge `a7ceff94269cddfbc725677dd03737d96a449039`, verified to have the identical tree. [CI 44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383) completed the following source-specific observations:

- Full browser: **128 passed, 1 failed, 2 skipped**; lean browser: **115 passed, 1 failed, 5 skipped**. Both failures were the repaired premature request snapshot.
- Web unit suite: **3849 passed, 1 failed, 1 skipped**. Its single failure matches the repaired signer fixture. Other configured unit groups, TypeScript, lint, build, secret checks, native contract tests/static/coverage, Slither and reproducible lean builds passed.
- [Pages 44643709322](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709322), beta acceptance, integration, hosting, CLI and research workflows passed. Pages included its actual artifact browser check. Manual release/approval/deployment steps were skipped; no deployment occurred.
- Fresh follow-up full/lean browser and full unit/coverage results must come from the new published head. Earlier passing scopes do not turn d74 into a passing complete CI run or qualify a later whole tree.

[HOSTED_D74.json](HOSTED_D74.json) preserves the observed job snapshot. [HOSTED_BASELINE.json](HOSTED_BASELINE.json) separately records c993 baseline failures and source equivalence; those are historical evidence, not final results.

Strict Mythril remains unresolved. The completed c993 artifact contains **10 records: 3 Medium and 7 Low**, with all five instrumented targets complete. All 241 recorded source hashes match the unchanged candidate contracts. [Generation 4 assessment](generation-4-contract-review/ASSESSMENT.md) maps exact traces: seven constructor tuples reject implementation address 0x1, and three expiry payloads reject. The assessment also preserves a genuine design limit: failure of the immutable fee token's balanceOf view can prevent deployment at a prefunded counterfactual address; another factory does not recover that original address. Intentional fee-waiver behavior and timestamp/inclusion assumptions remain decisions for security/release clearance. No contract or analyzer failure gate was changed, and the 11-to-10 historical record change is not represented as a repaired vulnerability. Current later analyzer results must be recorded separately when completed.

[Dependency review](generation-5-dependency-review/ASSESSMENT.md) establishes why an automatic full-audit update is not a supported drop-in: current FHEVM tooling requires Hardhat 2 while the suggested ethers plugin upgrade requires Hardhat 3; elliptic's affected current version has no patched replacement. A nested cookie override is an optional separately qualified compatibility change, not an applied or proven-safe fix. Neither audit result is a general vulnerability-free guarantee.

## Generations, execution limits and next work

Six successive fresh worker generations contributed implementation, independent security/QA/completeness review, final source/tooling/contract assessment, remaining uniqueness/dependency assessment and independent merchant verification. A further native-agent spawn was refused by the execution thread limit. The browser and signer follow-ups therefore reused the already independent reviewer and are explicitly described as follow-up turns, not new fresh generations. Completed agents are not represented as continuously running. [TASK_LEDGER.json](TASK_LEDGER.json) records ownership, source, evidence, integration and unfinished scope.

1. Verify the latest candidate and owned lease, publish only reviewed follow-up inputs to existing draft PR #278, and retain exact tree/ordered-parent verification. Never force over a changed shared head.
2. Obtain the original full/lean browser and full unit/coverage results on that exact published candidate. Diagnose any new failure before altering source or tests. Preserve all failed prior runs and original gates.
3. Retain strict analyzer failure and finding-specific limits until the required security clearance/external review is actually satisfied. Inspect the later analyzer's exact artifact if it completes; do not infer its record count from c993.
4. Owner-controlled release prerequisites remain: ADR decision, dedicated origin and verified DNS/HTTPS, Pages environment/approval, authorized testnet deployment and manifest signing identity, real-wallet testnet payment/recovery/sweep acceptance, then approved release assets/tag. No real funds, public release or deployment is part of these internal checks.
5. Continue UNKNOWN branch work only where current behavior might be missing; establish uniqueness and useful integration value before another extraction. Preserve future scopes. No fabricated completion percentage or engineering fixed point.

The existing two-hour continuation automation is the durable successor mechanism. Read its live run and lease before overlapping a shared update; do not assume a scheduler has completed work merely because it is enabled. Update only its checkpoint after verified publication, preserving cadence and scope limits.

## Reproducible continuation commands

Use the pinned runtime and actual latest published source. The commands below describe required original checks, not claims that every command passed on every checkpoint:

```sh
git fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/pull/*/head:refs/remotes/pr/*' --tags
git switch --detach origin/release/ghostpay-beta-qualification-20261119
git rev-parse HEAD 'HEAD^{tree}'
node scripts/automation/integration-lock.mjs status
npm ci --ignore-scripts --no-audit --no-fund
npm run build:libs
npm run typecheck
npm run lint
npm run test --workspace @ghostpay/invoice-schema -- --maxWorkers=1
npm run test --workspace @ghostpay/merchant-ledger -- --maxWorkers=1
(cd apps/web && node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1)
(cd apps/web && node ../../node_modules/vitest/vitest.mjs run --config vitest.nocov.config.ts --maxWorkers=1)
node --test scripts/pages/*.test.mjs scripts/tests/integration-lock.test.mjs
npm run build --workspace @ghostpay/web
npm run ci:scan-secrets
npm run ci:check-actions
```

Run the configured hosted browser, Pages, beta acceptance and contract workflows in their original environments. A local payments-disabled Pages build is not signed testnet acceptance. Before a future cycle ends, retain exact source/results and executable successor steps without repeatedly restarting an active CI run solely for documentation.
