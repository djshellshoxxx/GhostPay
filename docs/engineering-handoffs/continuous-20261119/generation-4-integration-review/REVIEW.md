# Generation 4 independent combined-source review

## Verdict

**No source integration blocker found at `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`.** All 23 changed implementation, test and tooling files match their reviewed source commits exactly. The original Pages tooling suite passed **112 tests**, and the original integration-lock suite passed **10 tests**, with zero failures, cancellations or skips in either run.

This approves the reviewed integration for the draft candidate's normal qualification process. It does not establish full workspace, browser, contract-analysis or external security acceptance, and does not authorize deployment or release.

## Identity and independence

- Repository: https://github.com/djshellshoxxx/GhostPay.
- Candidate baseline: `c993bb2340942c85dbf10303b61f69a91c4944e0`.
- Combined source reviewed: `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`.
- Combined Git tree: `7a7b189be05b802d3545e8823230076125d7bbf6`.
- Reviewer: fresh agent `integration_review_gen4`, which did not implement these product or test changes.
- Isolated branch: `review/ghostpay-combined-gen4-20261119`; ownership claim: `6c259361`.
- The worktree started from the exact combined commit. This review writes only this evidence directory and its additive ownership record.

Live read-only repository checks still showed main at `c977b5d6723f6822c3b5d86cd6b231712c53c395` and the existing release branch at `c993bb2340942c85dbf10303b61f69a91c4944e0`; PR #278 was open and draft. This is a timestamped observation, not a promise about later refs. The coordinator owns subsequent publication and exact-head verification.

## Complete changed-file accounting

[source-manifest.json](source-manifest.json) independently enumerates every non-documentation path changed from the baseline, its final Git blob and SHA-256 digest, and its expected source commit/blob. The set comparison is exact: no changed application, package, test or script path is left unaccounted for.

| Family | Reviewed source retained | Integration assessment |
| --- | --- | --- |
| Build-profile fail-closed handling | Original #280 source and test | Recognized full values remain required; lean builds and malformed overrides cannot widen the profile. |
| Partial 30-day scan count | Original #281 source and test | The partial marker follows the available 30-day window and scan head. Existing seven-day level calculation is preserved. |
| Stored merchant pin parsing | Original #282 source and test | Uses the existing strict parser from an existing dependency; malformed or ambiguous storage remains unavailable. |
| QR runtime kind validation | Original #285 source and test | Own-key checks precede category/frame use; secret/bearer priority remains. |
| Base64url runtime input rejection | Original #289 product source; final `b2711401` test spelling | Non-string rejection precedes traversal. The unused test callback parameter removal changes no input or assertion. |
| Canonical-array lint repair | `a080c2db` test file | Both intentional configurable-property deletions remain; only their lint-compatible spelling changes. |
| Final export-result session authority | Product and original expiry test from `84f39e41`; final independent reviewer test from `767cebd1` | Deadline and session revision checks remain at result acceptance, including the reentrant replacement guard. |
| Current manifest generation | Product and two regression files from `95f28a04` | Loaded state belongs to the active chain/services generation; the exact reviewed scope and cleanup logic is retained. |
| Browser fixtures | Network/settings files from `95f28a04`; export spec/helper from `45a5dcf7` | ABI words, current refusal messages, suspended-authority expectations and explicit fresh recovery scan are retained. |
| Cooperative integration lease | Exact two-file extraction from #261, `61f2b372` | Metadata-only helper and original bare-Git race tests; no application hook, automatic deployment or branch-policy bypass is introduced. |

The upstream uniqueness and RED/GREEN experiments were already independently examined in the generation 2 and generation 3 reviews. This generation read those receipts and checks the final integration identities and interactions; it does not relabel their executions as its own.

## Boundary and interaction review

Fifteen explicit control scopes match the baseline, including the entire `.github`, `packages/contracts`, `packages/core-crypto` and `packages/net-transport` trees; root package/lock/config files; web package, Vite, nocov and Playwright configuration; and the session, network-authorization and payment-export RPC modules. The complete changed-file accounting also excludes any unrecorded configuration change. Original test timeouts, coverage thresholds, dependencies and workflow gates therefore remain in force.

The two new runtime repairs operate at different boundaries. The manifest hook prevents an obsolete chain/services result from starting provisional preflight; it does not create network authority. The export hook independently checks current session authority before accepting a pending result; it does not alter derivation, export formats or endpoint policy. Their combined source preserves the separately reviewed implementations without conflict resolution inside either module.

The browser invoice-replacement assertion still expects exactly two completed `eth_chainId` requests. Balance fixture changes supply ABI-encoded `uint256` results for `eth_call`; chain identifiers remain JSON-RPC quantities. Settings changes retain the existing no-extra-contact assertions and add persisted acknowledgement checks. The idle-lock test retains its no-download/no-success result, then explicitly verifies backup-only suspension and recovery before a positive control. The `fromStart` option is used only by that recovery control; existing scan-helper calls retain their previous behavior. No expected request count or configuration timeout was raised.

The lock helper provides cooperative writer exclusion. Its public owner/token state is not authentication, and the helper does not interpose on arbitrary ref updates. A publisher must separately assert current ownership, verify the target head, preserve review/CI gates and use the normal nonforce update. The metadata branch must remain separate from source history. This review performed no live lock transition or remote mutation.

## Fresh execution

| Original command, run from the isolated checkout | Result |
| --- | --- |
| `node --test scripts/pages/*.test.mjs` | Exit 0; 112 passed; 0 failed/cancelled/skipped/todo; four suites; 2,323.617203 ms. |
| `node --test scripts/tests/integration-lock.test.mjs` | Exit 0; 10 passed; 0 failed/cancelled/skipped/todo; 3,113.276128 ms. |

The Pages result includes real local HTTP serving tests, file/descriptor tampering cases, traversal and symlink refusal, HTML/CSP guards, exact-origin checks, testnet-only manifest handling and smoke-tool guards. It is **tooling and native HTTP evidence, not browser scenario execution**. The lock tests use actual temporary bare Git repositories and simultaneous receive barriers; their main/tag isolation assertions ran unchanged.

Runtime was the coordinator's pinned Node 22.23.4. The isolated checkout reused the root's installed dependency graph through a `node_modules` symlink; the smoke fixture's schema import therefore uses the root's compiled workspace library. This reviewer did not independently rebuild those dependencies. The coordinator owns the final clean library/application builds and full test matrix. The exact source, runtime, commands, result counts and compressed raw-log hashes are recorded in [checks.json](checks.json).

These 122 passing tests are two disjoint tooling groups. They must not be added to earlier overlapping runs and presented as a novel repository-wide acceptance count.

## Outstanding qualification and handoff

At the reviewed checkpoint, the central `TASK_LEDGER.json` still describes generation 1 tasks as in progress, and older release documents retain historical browser/Echidna/Mythril checkpoint language. The coordinator was notified to supersede those statements with the completed source-pinned reviews and final hosted results. This is a documentation reconciliation task; it does not justify replacing an unresolved security or release gate with a pass.

1. Retain this additive review and evidence with the combined source. If product/test/tooling files change after `c93f4644`, compare the new delta and obtain applicable independent verification.
2. Complete the unchanged full candidate type/lint/coverage/nocov/build checks and both hosted lean/full browser suites on the published candidate. Preserve actual failures and skipped results.
3. Keep the ten current Mythril records, strict analyzer exit and generation 4 contract assessment separate from any required external review. This reviewer made no finding-level contract disposition.
4. Reconcile the central task ledger, current handoff and release documents using exact source identities, workflow links and explicit external owner-controlled blockers.
5. Re-read live refs and cooperative lease ownership before any shared ref update. No main merge, deployment, release, funds movement, source branch cleanup or fee change was performed here.

No additional product defect or repair was needed for this scoped final integration review. This is not a claim of a repository engineering fixed point or a fresh semantic audit of every branch.
