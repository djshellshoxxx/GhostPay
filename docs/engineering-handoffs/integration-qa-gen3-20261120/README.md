# Fresh integration QA — generation 3

## Frozen scope and current status

Independent worker: `/root/integration_qa_gen3`. Initial combined product source: `9e062b7150e74d1b20e34b0f120add660d9ef02e`. Canonical comparison baseline: `417f7c71daf8645e1432f2ec8f070110879b80bd` (PR #278). The review branch is `review/ghostpay-integration-qa-gen3-20261120`; its ownership commit changes documentation only.

The selected four-source integration has no additional blocking defect identified in this bounded review. The known unsupported-receipt-status defect remains present in the initial source and is assigned to the independent bug-hunt lane; this initial review is not approval to promote that intermediate candidate. Final combined web qualification is waiting for the coordinator's completed wallet repair and a serialized execution window.

This review does not include the separate privacy quick-hide feature or import actively advancing clipboard, masking, wallet-privacy, or catalog branches. Their owners and newer source must be reconciled before integration.

## Independent source-preservation result

`source-manifest.json` records exact Git object identities. Every selected source head is an ancestor of the combined candidate, and all **15 non-documentation changed files** are byte-identical to the appropriate source head:

| Source | Preserved scope | Files |
|---|---|---:|
| #295, including #290 | Primitive-string QR classification guards and cumulative regressions | 2 |
| #294 | Rejected-fragment idle-deadline repair and assembler regressions | 2 |
| #298 | Receipt-hash correlation, consumer regression, and compatible receipt fixtures | 6 |
| #292 | Pages artifact promotion gate, hostile-fixture clarification, and additional Sweep boundary tests | 5 |

There are no other non-documentation changes between the pinned canonical baseline and this initial candidate. Eight control scopes are exactly preserved: the existing network-authorization browser repair, the selected-signer fixture repair, the complete `.github` tree, root package manifest, lockfile, contracts tree, application lock implementation, and execution settings implementation. Whole-file replacement from an older sibling did not regress these controls.

The source histories and author commits remain reachable. Ownership-log resolution does not alter any of the selected product/test files. Earlier raw evidence remains tied to its original source; this review does not relabel older test or artifact results as newly executed results.

## Standards review

The governing sources are [AGENTS.md](../../../AGENTS.md) and [the AI workflow](../../ai/WORKFLOW.md). The changes retain the existing errors and validation boundaries, remain narrow, add regression coverage, and preserve independent work. No new dependency, contract, fee, workflow, release configuration, or active feature setting is introduced by these 15 files.

No additional documented-standard violation or actionable refactoring smell was established in the selected changes. The existing shared helpers remain appropriate; no speculative abstraction or style-only rewrite is proposed.

## Spec review

- **QR classification:** the guards reject non-string values before property lookup can invoke coercion. Existing secret/bearer precedence and every declared flag combination remain represented by the cumulative tests. The requirements are documented in [QR colors and classification](../../design/qr-colors.md).
- **QR assembly:** the rejected-conflict branch now leaves the last-activity timestamp unchanged, matching the assembler's unchanged-state contract. Accepted duplicates still refresh activity. Exact idle-deadline, completion, mismatch, malformed-input and reset behavior are retained. The package's original coverage gate remains in force.
- **Receipt correlation:** the response must contain a primitive shaped transaction hash that matches the submitted hash before its status is used. Invalid shape and valid-but-different identity retain distinct established error paths. The consumer regression preserves the original submitted journal entry/hash and refuses another send. The separately assigned unsupported-status defect is not silently treated as solved by hash correlation.
- **Pages promotion:** the existing independent verifier runs against staged bytes and the build's checksum inventory, with the expected source commit, before either final directory move. The real shell promotion block is tested under corruption, missing/extra files, symlink, duplicate checksum and wrong-source conditions. This establishes integrity checking within the existing private/stable-input boundary, not authentication of an arbitrary externally supplied manifest.
- **Security fixtures:** fixture construction remains intentionally hostile, and its rejection assertions remain intact. No analyzer suppression or gate weakening is introduced. The preceding independent security review owns the exact CodeQL annotation correspondence; a successful new hosted security analysis is still required.

No additional spec discrepancy was established in these integration changes. The known receipt-status finding and subsequent wallet findings remain with their assigned workers until final qualification.

## Executed verification at the initial source

Environment: Node `v24.22.3`, npm `11.19.1`, locked Vitest `5.1.0`. The repository permits Node >=22. The dependency tree was privately copied from the matching-lock coordinator checkout; workspace links resolve into this review checkout. Declaration output for 64 unchanged packages was copied only after checking package inputs. QR output was not reused and was rebuilt here. This is not a new clean installation or a complete rebuild of all libraries; `dependency-provenance.json` records the distinction.

All commands use original repository configurations and assertions. Tests run with one concurrent worker/file; the 768 MiB heap limit is a resource bound. Project timeouts, coverage thresholds and exclusions are unchanged. Each external command cap is recorded in `checks.json`; none was reached in this completed group.

| Check | Actual result |
|---|---|
| Original QR package coverage suite | **239 passed / 7 files**, zero failures or skips |
| QR coverage | Statements **97.57%**, branches **95.17%**, functions **100%**, lines **99.08%**; original thresholds passed |
| Original QR typecheck | Pass |
| Original QR typed ESLint | Pass |
| Original QR build | Pass; generated declarations and runtime output locally |
| All eight original Pages test files plus CSP bundle tests | **168 passed**, zero failed, cancelled or skipped |
| Exact source/control comparison | **15/15** selected input blobs and **8/8** control scopes match |

Commands, exit codes, timing, raw-log hashes and lossless compressed logs are recorded in `checks.json` and `logs/`. The Pages tests exercise helpers and local fixtures; they do not constitute an executed product browser journey, deployment or release artifact.

## Remaining qualification

The changed web QR classifier has not yet been executed by this worker. Final full web TypeScript/coverage and any browser/hosted qualification must use the final combined wallet source. Work is paused at the coordinator's request while other reviewers finish in the serialized execution window. No test that has not run is represented as passed.

No shared source branch or remote ref was mutated. Deployment, release, real funds, contract/fee changes, branch deletion, force push and gate changes remain outside this lane.
