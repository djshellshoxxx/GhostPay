# Security artifact review — 2026-11-19

## Outcome and scope

**The exact PR #255 Mythril artifact contains 11 findings that remain open at the strict gate: eight Low and three Medium.** Its recorded inputs match the pinned PR source. The frozen candidate contains identical production and vendored Solidity sources and Foundry configuration. Existing disposition documents propose assessments of the corresponding historical records, but explicitly do not activate a finding exception. This review neither dismisses a finding nor accepts an exception.

**PR #264's CodeQL high alert remains unresolved, with applicability to the candidate unknown.** Its analysis jobs completed and uploaded SARIF, but the permitted connector responses do not expose the alert rule, source location, or dataflow. This review cannot establish that the alert is fixed or novel.

Reviewer: `recovery_completion`. This was an independent artifact, source-hash and log review. No analyzer, contract test, deployment, remediation, suppression, or approval mechanism was executed or changed. Archive members were inspected as data and never executed. The comparison target is frozen source **`e74ddd26b75912d770e05d51f0b9229756adc649`**, regardless of later coordinator commits.

## PR #255: immutable artifact and source binding

| Binding | Observed value |
|---|---|
| Pull request | [#255](https://github.com/djshellshoxxx/GhostPay/pull/255) |
| Exact head, requested and checked out | `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` |
| Workflow run / failed Mythril job | [44476066945](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476066945) / [135396814239](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476066945/job/135396814239) |
| Artifact | `14509646188`, `contract-analysis-mythril-ea47fa75eabb0be2045081ffeb120fc2bfae67ab` |
| ZIP bytes / SHA-256 | 54,042 / `f26634aa26eb718a808bb0cb755d30a29eaf3a2eb9eafa735de33f5b1c78e9e7` |
| Untruncated report bytes / SHA-256 | 283,170 / `4f6cc97b9c17d6ac60510d8545e8af8d4e63a0f1bcb70067f6ae00af62b07736` |
| Canonical source inventory SHA-256 | `00753c458c25149f934f812f3b2ddea61bc3f561de0a21b6e0b99c10f17fb275` |
| Compiler JSON SHA-256 | `a027494042667ca625518aa93fb205b1c82ce497b81c172b3363c69e2b3c0ddc` |
| Result | Metadata and manifest both record runner exit **1**; analysis outcome **failure** |

The ZIP hash matches the digest returned by GitHub's native artifact listing. The native download tool supplied a reusable file reference and advertised download URL; only that advertised file URL was used. Temporary transport references and signed URLs are omitted from the saved receipt. ZIP paths were checked for traversal, duplicates and symlinks before reading; reads were bounded. The original [ZIP](mythril-14509646188.zip) is retained.

Independent checks verified the report's full length and hash, compiler-configuration hash, canonical source-inventory hash, exact expected source-file inventory, and all 15 per-target stdout/stderr/completeness hashes. All **241** recorded input SHA-256 values match Git blobs at the exact PR head. All ten findings with a reported filename and line have their reported code snippet at that line. The remaining generated/modelled fallback record has no filename or line; no location was invented. See [validation](mythril-validation.json), [all source bindings](mythril-source-bindings.json), and [findings](mythril-findings.json).

### Candidate comparison

| Input group | Exact comparison with frozen candidate |
|---|---|
| Project Solidity | **10/10 identical** |
| Vendored OpenZeppelin Solidity | **226/226 identical** |
| `packages/contracts/foundry.toml` | Identical |
| `.github/workflows/contract-analysis.yml` | Different |
| `packages/contracts/scripts/run-mythril.sh` | Different |
| `packages/contracts/scripts/mythril-compat.py` | Different |
| `packages/contracts/scripts/capture-mythril-evidence.py` | Absent from candidate |

Thus the artifact reports findings on unchanged candidate contract/compiler-configuration inputs. This is **not** a native Mythril run using the candidate's workflow and tooling. The full artifact inventory has 237 identical inputs, three differing inputs and one absent input.

### Analyzer and completeness evidence

The manifest records Mythril **0.24.8**, compiler **0.8.28**, optimizer enabled with **200** runs, EVM **Cancun**, transaction depth **3**, default modules and **900 seconds per target**. The selected compiler is `/home/runner/.solcx/solc-v0.8.28`, SHA-256 `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`; its identity is repeated consistently for every analysis. The manifest separately records the PATH compiler and compatibility-launcher identities. Its executable hashes were checked for internal consistency, not against locally executed binaries.

All five target telemetry records say instrumentation ready, one report, no observed execution or creation timeout, no recorded exception and no error log. These are bounded-run completeness observations, not proof of exhaustive path coverage. The two zero-finding reports do not establish general contract safety. Structured `success: true` means Mythril produced a report; the strict runner still rejects findings.

| Target | Reported findings | Process exit |
|---|---:|---:|
| GhostPayRouter | 0 | 0 |
| GhostPaySweepRelayer | 1 | 1 |
| GhostPayPolicyRouter | 0 | 0 |
| PolicyAccount | 2 | 1 |
| PolicyAccountFactory | 8 | 1 |

### The 11 open findings

Locations below are relative to `packages/contracts`; `vendor/` abbreviates `lib/openzeppelin-contracts/contracts/`. The EXP/R labels identify corresponding records in existing disposition documents, not an activated exception.

| Existing label | SWC | Severity | Reported location | Reported class |
|---|---|---|---|---|
| EXP-1 | 116 | Low | `src/GhostPaySweepRelayer.sol:83` | Dependence on predictable environment variable |
| EXP-2 | 116 | Low | `src/PolicyAccount.sol:161` | Dependence on predictable environment variable |
| EXP-3 | 116 | Low | `src/PolicyAccount.sol:262` | Dependence on predictable environment variable |
| R4 | 110 | Low | Modelled fallback, bytecode address 30; no source filename/line | Exception State |
| R5 | 107 | Medium | `src/PolicyAccountFactory.sol:117` | State access after external call |
| R6 | 107 | Low | `vendor/utils/ReentrancyGuard.sol:99` | State access after external call |
| R7 | 113 | Low | `src/PolicyAccountFactory.sol:131` | Multiple Calls in a Single Transaction |
| R8 | 113 | Low | `src/PolicyAccountFactory.sol:132` | Multiple Calls in a Single Transaction |
| R9 | 107 | Medium | `vendor/proxy/Clones.sol:104` | State access after external call |
| R10 | 107 | Low | `vendor/token/ERC20/utils/SafeERC20.sol:227` | External Call To User-Supplied Address |
| R11 | 104 | Medium | `vendor/token/ERC20/utils/SafeERC20.sol:227` | Unchecked return value from external call |

The complete machine-readable record preserves function, bytecode address, source map, snippet and source SHA-256. R4's reported contract address is `0x72c68108a82e82617b93d1be0d7975d762035015`; it is an analyzer model identifier, not evidence of a live deployment.

### Existing disposition state

Pinned documents for older artifact **14290880802** contain authored and independently reviewed assessments of corresponding rule/location/PC records. The [expiry document](prior-dispositions/mythril-14290880802-expiry-dispositions.md) calls the three timestamp records intended deadline behavior. The [factory document](prior-dispositions/mythril-14290880802-factory-dispositions.md) proposes intended-behavior or model/detector-artifact assessments, with conditions. These are prior authors' assessments; this review does not independently reproduce or adopt their counterexample conclusions.

Those documents expressly retain the red gate and require a finding-specific approved mechanism before any exception. The [later factory review](prior-dispositions/mythril-closure-factory-20261118.md) likewise says owner approval of finding exceptions was not obtained through that lane. It retains fee-token freeze/liveness and waiver assumptions; the [timing packet](prior-dispositions/TIMING_ASSUMPTIONS.md) retains chain timing, cancellation and destination-semantics decisions. The exact pinned documents and hashes are recorded in [prior-dispositions.json](prior-dispositions.json).

The inspected PR runner still rejects any nonzero process exit, nonempty issue array, invalid report or incomplete telemetry. **All 11 findings remain open at that strict gate. No suppression or accepted exception is created by this receipt.**

## PR #264: CodeQL evidence and concrete access limit

| Binding | Observed value |
|---|---|
| Pull request / head | [#264](https://github.com/djshellshoxxx/GhostPay/pull/264) / `bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a` |
| Dynamic analysis run | [44487024101](https://github.com/djshellshoxxx/GhostPay/actions/runs/44487024101), attempt 1, `dynamic/github-code-scanning/codeql` |
| Failed aggregate check | [135456052088](https://github.com/djshellshoxxx/GhostPay/runs/135456052088), one **High** security alert |
| Successful analysis jobs | JavaScript/TypeScript `135432925616`; Actions `135432925356`; Python `135432925095` |
| CodeQL configuration seen in logs | CLI **2.27.4**; action commit `33d7b85da1a04171e211befe2c739303b9a4c066`; build mode `none` |
| Query-pack versions | JavaScript **2.5.0**; Actions **0.6.39**; Python **1.9.0** |

Each saved job log shows checkout of the exact head above, successful SARIF upload and completed upload processing. The overall analysis workflow reports success; the separate aggregate finding check reports failure. Successful analysis execution does not clear its alert.

The native artifact-list wrapper returned **an empty artifacts array** for the run. It is a first-page wrapper; this receipt makes no broader pagination claim. The connector's generic GitHub GET rejected the check-run annotations endpoint with HTTP 400 / `INVALID_ARGUMENT`: the endpoint is outside its permitted public repository routes. No alternative credentials, endpoint variants or access-control workaround were attempted.

All three available logs were inspected. They list executed/interpreted queries and successful SARIF upload, but do not identify a confirmed high-alert rule, source location, result dataflow or generated configuration content. Query names appearing in an execution log are not proof those queries produced the high alert. Consequently **whether the alert is already fixed in the frozen candidate or is novel remains unknown**. The existing build-import repair does not answer that question.

See [CodeQL review](codeql-review.json), [run metadata](codeql-run-metadata.json), [log hashes and transport lengths](codeql-log-transfer.json), and the three saved job logs. The aggregate high-alert summary is preserved in the coordinator's [concurrent PR review](../final-concurrent-pr-review.json); this receipt does not assert a new alert-state lookup beyond the permitted responses.

## Evidence handling and limits

An initial local verification command failed before process creation during a workspace outage. The saved ZIP survived; after restoration, the read-only Git/hash checks completed successfully. The outage is not treated as an analyzer or test outcome.

All writes for this task are confined to this evidence directory. No root commit was made. The receipt records the exact historical source/run/configuration reviewed; later candidate commits and whole-head security qualification remain separate. All artifact files are inventoried with SHA-256 in [receipt.json](receipt.json).
