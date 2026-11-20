# Exact-source CI and CodeQL reconciliation

Repository: `djshellshoxxx/GhostPay`. Worker: `/root/live_ci_audit`, delegated by the remediation coordinator in workspace `a7189299ede1`. Branch: `review/ghostpay-ci-audit-20261120`. Final remote observation: **2026-11-20 00:33:32 UTC** (November 19 in Vancouver).

**Release verdict: BLOCKED — WITH PRECISE REMAINING REQUIREMENTS.** This work clarifies two intentionally malicious test fixtures and preserves current qualification evidence. It does not establish release readiness, close private security alerts, or authorize deployment.

## Source identity and ownership

- Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Existing canonical candidate: [PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278), `release/ghostpay-beta-qualification-20261119`, head `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- CI browser jobs checked out synthetic merge `a7ceff94269cddfbc725677dd03737d96a449039`. The GitHub commit API independently confirms that this merge and the associated PR head have identical tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`. See `evidence/hosted-source-trees.json` and the raw job logs.
- Claim: `ed941fb1`. Focused fixture implementation: `008ccdcf05b703cea51ffc4fdaa42fc279281d81`.
- The other continuous coordinator owns the merchant-ledger correction and active browser observation repair in workspace `0a7bc3583588`. This worker did not duplicate those changes, change any remote ref, rerun a workflow, merge a PR, dismiss an alert, or modify production/workflow/analyzer-policy code.

## Current mandatory qualification

The final snapshot is `evidence/final-qualification-snapshot.json`. Earlier observations are retained separately; they are not described as simultaneous or final.

| Workflow/check | Exact d74 result at the final observation | Remaining requirement |
| --- | --- | --- |
| [CI 44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383) | In progress. Lean/full browser jobs failed; web and rest-2 unit jobs still in progress. Contracts aggregate passed. No TypeScript aggregate pass exists. | Complete the full mandatory matrix after the independently owned browser repair and these fixture changes are integrated. |
| [Lean browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383/job/135981022990) | 115 passed, 1 failed, 5 skipped. | Invoice-replacement request observation at `network-authorization.spec.ts:172` expected 9 requests and observed 15. Current owner is investigating; this audit does not classify it as a proven authorization exploit. |
| [Full browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383/job/135981023128) | 128 passed, 1 failed, 2 skipped. | The same invoice-replacement assertion failed. No cancellation or skip is counted as passing. |
| [Pages 44643709322](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709322) | Site build and actual Anvil browser artifact job passed. Publishing-only release gates, attestation, deployment and live smoke jobs were skipped. | PR validation is not deployment qualification. The remediation coordinator separately owns independent-verifier gate integration. |
| [Contract analysis 44643709093](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709093) | Echidna passed; Mythril remained in progress. | **The exact d74 Mythril finding count is UNKNOWN.** The returned artifact inventory contains only Echidna artifact `14587494541`. No d74 Mythril artifact was available. Prior c993 results are not relabeled as current-head clearance. |
| [CodeQL check 135981137999](https://github.com/djshellshoxxx/GhostPay/runs/135981137999) | Failed with two reported High alerts. Three language analysis jobs passed. | Both exact annotations are assessed below; no post-clarification scanner result or private alert dismissal exists. Analysis execution success does not override the failed findings check. |
| [Beta acceptance 44643709101](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709101) | Success. | This is the configured local-Anvil acceptance, not external testnet acceptance. |
| [Integration 44643709159](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709159) | Success. | Retain exact-source evidence; new integrated source needs its applicable checks. |
| [CLI 44643709094](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709094) | Success. | Does not establish Pages browser or release readiness. |
| [Hosting 44643709382](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709382) | Success. | Does not replace dedicated-origin configuration or owner decisions. |

Within CI, the completed successful jobs include typecheck, lint, full build, production dependency audit, relayer tests, rest-0/rest-1/core/BTC/confidential unit groups, contract test/coverage/static/Slither/extra projects, secrets/egress and reproducible lean candidate. Web/rest-2 and the TypeScript aggregate remain unqualified at the stated observation. This is a snapshot, not an evergreen status.

## Two current CodeQL annotations

The public [annotations response](https://api.github.com/repos/djshellshoxxx/GhostPay/check-runs/135981137999/annotations?per_page=100) returned exactly two annotations. Both have title **Incomplete string escaping or encoding**. The current check reports them as High. The connector rejects this endpoint family; an ordinary public urllib request succeeded. Its normalized JSON is preserved in `evidence/codeql-135981137999-annotations.json`. A second request intended to capture raw HTTP bytes returned 403; the receipt explicitly distinguishes the normalized first response from unavailable raw HTTP bytes. Private repository-wide alerts were not obtained.

| Source | Actual data flow and bounded assessment | Minimal clarification |
| --- | --- | --- |
| `packages/chain-adapters/src/deployments.test.ts:96` | A fixed synthetic manifest is serialized, one top-level `__proto__` member is deliberately inserted, and the test requires `loadDeployment` to reject it. This expression is not an escaping routine and has no user/environment input. It remains a potential fixture false positive pending separate review and fresh CodeQL. | Construct the top-level malicious JSON member explicitly and append the known manifest serialization after its opening brace. Nested objects and the rejection assertion are unchanged. |
| `scripts/tests/privacy-csp-bundle.test.mjs:130` (alert #35) | A single constant-generated meta tag deliberately receives a duplicate `content` attribute, then the static scanner must reject the artifact. It does not sanitize or serve untrusted data. It remains a potential fixture false positive pending separate review and fresh CodeQL. | Append the duplicate attribute before the known fixture tag's final closing bracket. The malformed tag and scanner assertion are unchanged. |

The implementation changes **only these two test files plus the additive ownership note**. It does not suppress, exclude, dismiss, rename away, or otherwise relax the analyzer. No confirmed runtime custody/signing defect is claimed from these annotations. The complete repository's confirmed Critical/High/Medium counts remain unknown; this scope does not supply a complete private-alert inventory or mandatory external review.

## Exact execution and byte equivalence

All scoped executions used Node **22.23.4**, direct executable `/workspace/scratch/0a7bc3583588/toolchain/node_modules/node/bin/node`. Dependencies were a read-only link to the remediation coordinator's exact-lock installation. This worker does not claim a separate clean installation.

| Scope | Before clarification | After clarification |
| --- | --- | --- |
| Complete original CSP fixture file | 49 passed, 0 failed, 0 skipped | 49 passed, 0 failed, 0 skipped |
| Original deployment-manifest test file | 13 passed, 0 failed, 0 skipped | 13 passed, 0 failed, 0 skipped |
| Type-aware ESLint on changed TypeScript file | Not separately rerun before the edit | Exit 0 |
| Changed JS syntax and whitespace check | Not separately recorded before the edit | Exit 0 |
| Actual original/clarified fixture expressions | Not a runtime defect reproduction | Byte-identical in both cases |

The deployment selection explicitly disabled coverage for this one-file diagnostic. No full-package coverage qualification is claimed, and original thresholds/configuration remain unchanged. The CSP file uses the built-in Node runner and requires no coverage override.

`evidence/verify-fixture-equivalence.mjs` extracts actual fixture definitions/expressions from the base commit and current files using the TypeScript parser. It verifies exact bytes, the retained own top-level `__proto__` member, unchanged nested `deployTx`, and two CSP `content` attributes. Its first attempt had a reviewer-utility empty-array traversal error, corrected without product changes; that failure is preserved separately.

- Malicious manifest: 760 identical bytes; SHA-256 `a98b16b14e498d5598beb530caeaa0d1273e59ced23b19f8fff158bf7fd90281`.
- Malformed CSP tag: 250 identical bytes; SHA-256 `8d1df43e5446dde7b518b47c8f8fd1b399669c7f8ba8b7080afc7d18ef70386a`.
- Final deployment test blob: `9a35cce7f79ef3341e73ed2b8aa140653b97756b`.
- Final CSP test blob: `5ce6f210304b4c02b775a505e51ac4dd0eeba6a1`.

Commands, exit statuses, original/final source hashes, raw compressed test output and machine-readable test results are in `evidence/fixture-clarification-receipt.json` and adjacent files. Counts are overlapping before/after selections, not a sum of distinct product tests.

## Historical PR reconciliation

The read-only current inventory contained 73 open PRs. Seven targeted PRs were examined in detail: #262, #270, #272, #275, #276, #277 and canonical successor #278. None was merged or closed by this worker.

| PR | Retrieved exact-head disposition |
| --- | --- |
| #262 `40b64e8f...` | CI failed on 15 web lint diagnostics, the invalid policy Anvil fixture and six lean browser cases; strict Mythril failed. These are historical source results. Current #278 lint/rest-0 passes and reduced browser failure set show that recreating those old fixes would duplicate work. |
| #270 `73545f63...` | Same broad historical gaps plus two array-delete lint diagnostics. Candidate #278 already contains the relevant source and current lint/rest-0 pass. |
| #272 `63ff40d5...` | [CI 44510549246](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549246) passed. [Hosting 44510548951](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510548951) failed because apt downloads returned OS `Resource temporarily unavailable`, exit 100; the application browser smoke itself passed. Earlier same-head cancelled duplicate runs are not passes. |
| #275 `dc821780...` | Corrected policy fixture reached successful rest-0. Other historical lint/browser jobs remained failed. No duplicate policy-fixture implementation is needed. |
| #276 `f39a9dd3...` | [CI 44514415490](https://github.com/djshellshoxxx/GhostPay/actions/runs/44514415490) and [Pages 44514415390](https://github.com/djshellshoxxx/GhostPay/actions/runs/44514415390) passed. Artifact verifier has the stronger #277 successor. |
| #277 `8cbae85c...` | [CI 44516634489](https://github.com/djshellshoxxx/GhostPay/actions/runs/44516634489) and [Pages 44516634581](https://github.com/djshellshoxxx/GhostPay/actions/runs/44516634581) passed. Its stronger verifier is already present in #278; the current unclaimed gap was invocation in the build/promotion path, separately owned by the remediation coordinator. |
| #278 `d74af79e...` | Preserve this existing canonical candidate. Integrate only proven unique, independently reviewed fixes, then qualify its final exact source. |

Eight actual downloaded job logs are preserved as deterministic gzip files with uncompressed SHA-256 values in `evidence/downloaded-log-manifest.json`. They support the classifications above. Historical failures are not represented as failures of the two-file clarification.

## Handoff and remaining requirements

1. Independently review `008ccdcf` and the exact generated-input equivalence evidence. No worker is the independent reviewer of its own edit.
2. The integration coordinator must reconcile current ownership/head, integrate the scoped changes without replacing the active #278 candidate, and obtain fresh exact-source CodeQL and full mandatory CI. Existing d74 results cannot qualify later code.
3. Complete the separately owned browser observation repair and Pages verifier gate, preserve all failed/skipped/pending results, and verify actual final source/artifact identity.
4. Retrieve the completed **d74 or successor** Mythril artifact before asserting its exact current findings or strict disposition. Keep the mandatory external review and any remaining current Sonar/private-security requirements open.
5. Dedicated origin, owner release/manifest-signing decisions, deployment authorization, verified live artifact and real-wallet testnet acceptance remain separate release gates. This work enables no network, payment, mainnet, deployment or release capability.
