# Independent privacy and integration review

**Decision at corrected head `856044b1`: no blocking finding remains within this review's inspected scope.** The confirmed bulk-scan privacy regression was repaired and independently verified. The original regression failed before the fix and passes afterward; 216 focused tests pass at the corrected head. Overall integration remains subject to the remaining independent reviews and qualification gates. This receipt does not approve the entire branch for merging.

## Reviewed snapshot and scope

| Item | Exact value |
| --- | --- |
| Reviewer | `/root/recovery_integration/privacy_source_review` |
| Baseline worktree | `/workspace/scratch/5ceb6203640a/recovery-spec18` |
| Baseline source head | `1b24404fe045c512212c417b692246b4e8fb2814` |
| Baseline source tree | `4a34b34d2e562b592dd439339718294e986f5c0f` |
| Corrected worktree | `/workspace/scratch/5ceb6203640a/recovery-composition-fix` |
| Corrected source head | `856044b129d16a2ab882ce6cb3466639cdf7dc5d` |
| Corrected source tree | `66a4b8d53e967b2a6f82de860a766fefb5301df6` |
| Preserved PR #367 parent | `50ccf5c8b396247b524e5115ebe51575ca79d318` |
| PR #361 donor | `4ccb3db334de7d7cada305a11243c9e3efddc4f6` |
| Review depth | 28 complete source files, 29 changed-section reviews with relevant context, 7 additional context-only reads |
| Previous review remainder reduced | 117 paths to 65; 52 additional paths received substantive review |

`REVIEW.json` records the exact paths, review depth, source Git blob and SHA-256 for every inspected file. `RUNTIME_REMAINING.json` records the remaining scope; it does not assert that these paths are defective or that no other team member has inspected them. Context-only reads are not counted as complete reviews. The three workflow files are additional to the previous 117-path inventory.

Repository instructions and existing ownership records were read. No product source, shared ownership records, remote branches or pull requests were mutated by this reviewer. The parent retains implementation ownership and the root retains integration authority.

## Confirmed and repaired finding: PRIVACY-BULK-EMPTY

**Affected paths:** `apps/web/src/lib/scanClient.ts` and its evidence contract with `packages/chain-adapters/src/payments.ts`.

In bulk-evidence scan mode, `runScan` initializes evidence as `undefined` and only replaces it when `selectEvidenceTargets` returns at least one eligible transaction. A router announcement without a transaction hash is accepted by the existing public log parser but provides no eligible target. If that announcement matches the viewing key, `verifyClaimedPayment` interprets the absent batch as permission to use live reads. It requests the current head and the matched block before rejecting the absent transaction hash. An identical public page viewed with a nonmatching key does not make these per-match requests.

This violates the bulk-evidence privacy invariant: unavailable batch proof must remain unverified without switching to per-match network reads. It does not produce a falsely verified payment; the defect concerns disclosure through request selection.

### Executed failing regression

The isolated test runs the actual `runScan`, InlineWorker and normal mock RPC helper. It supplies the same synthetic router log at block 120 to an unrelated viewer and the intended viewer, with `bulkEvidence: 10` and no transaction hash. It verifies that only the intended viewer matches, that the resulting receipt remains `claimed`, and that both RPC request sequences are identical.

Observed at the pinned source head:

- The nonmatching scan made 5 RPC calls.
- The matching scan made 7 RPC calls.
- The two extra calls were `eth_blockNumber` and `eth_getBlockByNumber(120)`.
- The call-parity assertion failed: **1 file failed, 1 test failed, exit 1, 2.07 seconds**.
- Source head before and after was `1b24404fe045c512212c417b692246b4e8fb2814`.

The regression and unedited failure output are `src/bulk-empty-evidence.review.test.ts` and `bulk-empty-evidence.log`. Both hashes are recorded in `REVIEW.json`. This was an offline synthetic test, with no external RPC requests, broadcasts or real-funds activity.

Command, run from this review directory with the original application Vite/Vitest configuration and an isolated test root:

```sh
NODE_OPTIONS=--max-old-space-size=1024 /workspace/scratch/5ceb6203640a/recovery-spec18/node_modules/.bin/vitest run --config /workspace/scratch/5ceb6203640a/recovery-spec18/apps/web/vite.config.ts --root /workspace/scratch/5ceb6203640a/recovery-privacy-review-next --maxWorkers=1
```

### Independently verified correction

Commit `26dac00e09d45f03bacc0d7a00dc1039fdaea729` supplies an explicit empty `RouterEvidenceBatch` when there are no eligible targets, for both selected providers. The complete eight-line runtime delta was reviewed. Missing evidence preserves the unverified/claimed result without individual live reads. The placeholder does not add unnecessary head reads on an empty page. Existing nonempty-target behavior is preserved.

The new application regression `scanClient.bulkEvidence.test.ts` covers both primary-only and dual-provider call parity, verifies the match remains claimed, and checks zero evidence-request accounting. It was read in full. The independent original reproduction was retained unchanged, and a second copy changed only five relative source import prefixes to point at the corrected worktree. That copy passed: **1 file, 1 test, exit 0, 1.08 seconds**. Before and after the execution, HEAD was exactly `856044b129d16a2ab882ce6cb3466639cdf7dc5d`. The original failing test and log remain preserved.

The reviewer also executed the following existing test selections with their original project configurations, one worker, at the same unchanged corrected head:

| Selection | Result | Files | Runner duration |
| --- | --- | ---: | ---: |
| Independent original reproduction | 1 passed, 0 failed | 1 | 1.08 s |
| Web scan client, new empty-batch regression, reconciliation ledger and invoice matching | 140 passed, 0 failed | 4 | 6.42 s |
| Chain-adapter payment evidence and bulk cancellation | 45 passed, 0 failed | 2 | 1.25 s |
| Merchant ledger reconciliation | 30 passed, 0 failed | 1 | 0.682 s |
| **Total at corrected head** | **216 passed, 0 failed** | **8** | |

These cover bulk evidence, cancellation, reorganization and rollback handling, replay deduplication, payment verification and duplicate-sensitive reconciliation. Exact commands, working directories, environment options, before/after heads and log hashes are in `bulk-empty-evidence-fixed-result.json`, `affected-tests-fixed-result.json` and `REVIEW.json`. The expected failure before the fix is not counted as a passed gate. Coverage and the complete aggregate suite were not rerun by this reviewer.

## Other reviewed behavior

### Clipboard, display retention and private history

The clipboard implementation retains a digest for delayed cleanup, rechecks clipboard ownership before clearing and coordinates newer writes with an in-flight cleanup. Browser clipboard read/compare/write is not atomic; the implementation and tests acknowledge that limitation. Backup copy operations use ownership generations so an obsolete asynchronous operation cannot retain local authority after replacement or hiding.

The metadata retention registry receives presentation callbacks and binds single-use plans to revisions. Disposal and reentrant callbacks do not turn stale plans into authority over new previews. Included-payment proof previews follow the accepted display-retention specification; payment results, journals and recovery exports are outside that presentation cleanup. The global quick-hide control is a visual boundary and is not represented here as a general cancellation of mounted payment workflows.

Private scan storage derives an opaque slot from the viewing key and scope, authenticates encrypted documents, bounds payloads and wipes supplied secret buffers. Compare-and-swap revisions and transactional tombstones prevent stale handles from overwriting or reviving removed history. The lifecycle checks storage ownership around journal operations and persistence; BroadcastChannel delivery is not the sole enforcement mechanism. Restored observations do not regain verified status merely because they were persisted.

Address-reuse warnings use bounded in-memory observations and explicit saturation. Session, lock, provider, account and chain changes revoke the local observations; the warning path introduces neither persistence nor RPC requests. Metadata minimization and optional receipt address fields retain the signed invoice, asset, amount and transaction bindings. A signed receipt is not treated as independent proof of finality.

### Scan, transport and non-EVM integration boundaries

Relevant scan replay paths fail closed when historical verification is incomplete, unavailable or narrowed. Partial revalidation is not saved as complete. The bulk empty-batch defect above is the one confirmed blocker found in this review.

Transport claims preserve the distinction between configured profiles and verified network privacy. Range, padded and research PIR source changes retain cancellation/opt-in boundaries. The reviewed Solana and TRON changes defer address-specific balance or memo reads until explicit single-address Sweep review and retain balance checks before signing, signal checks and network-scope revocation. This is a changed-section review, not a full audit of those complete chain integrations or of unreviewed BTC and policy implementations.

An additional bounded review covered network-selection parsing, execution-settings equality, bounded HTTP requests, wallet-view authority, settings export/import, service contracts and the scan privacy delta. Bounded requests enforce a deadline over fetch and streamed body reads, capped response bytes and fixed error classes. They do not authorize endpoints themselves. The production authorization snapshot rejects malformed present scan/profile settings before dispatch, even though the compatibility UI parser normalizes invalid values. Settings export filters session-only and apparently credential-bearing RPC URLs. Trust-bearing import sections remain explicit choices, and stale previews are revalidated before apply. No additional blocker was confirmed in these inspected paths.

### Retained workflow changes

The complete Pages workflow and setup-forge action were inspected, along with the CI recovery-test discovery delta and surrounding execution context.

- The attestation job waits for site build, acceptance and release gates. Its elevated token permissions are scoped to that job, which performs no repository checkout or application-code execution.
- It downloads the expected artifact from the same workflow run, verifies the file inventory and hashes, then uses the pinned provenance action. Deployment now waits for attestation.
- Publishing remains conditional on the existing explicit manual dispatch criteria. No workflow was dispatched and no deployment was performed during this review.
- Recovery script tests are added to CI discovery without removing the existing test selections.
- The compiler cache guard verifies both conventional compiler locations and fails on a mismatch before restoring build cache. The parent independently retrieved the official moved `argotorg/solc-bin` manifest and reported an exact match for the pinned Solidity 0.8.28 hash. That lookup is parent-owned evidence; this reviewer did not fetch it or verify an installed compiler binary.

### Recovered test-only CLI correction and preserved exclusions

The PR #361 delta to `packages/cli/src/receipt-parity.test.ts` was inspected separately because broader workspace typechecking exposed three optional-address fixture errors. The donor uses three conditional spreads so intentionally absent `stealthAddress` fields remain absent while constructing and signing altered receipts. Wrong amount, chain and signer assertions remain. Commit `856044b129d16a2ab882ce6cb3466639cdf7dc5d` recovers exactly donor blob `0871cbfaab0dca9faf5fb662cc91d09e093c5fc9`; no CLI runtime behavior is introduced. The reviewer checked the complete delta and exact blob equality, while the integration worker owns the CLI test/typecheck execution evidence.

The exclusion ledger now records 66 preserved paths and this one explicit test exception. An independent check compared candidate, retained-parent and donor blobs: **201 comparisons, zero mismatches**. The result is in `exclusion-verification-fixed.json`. Before reusing the already built dependency tree for the focused tests, the reviewer independently compared all 75 tracked `package.json` and lockfile inputs across the frozen and corrected worktrees, including nested fixture manifests; all were byte-identical. That is compatibility evidence, not a fresh install or a dependency audit.

## Qualification limits and remaining work

The preceding worker's review of 44 paths and 451 tests remains a separate receipt under `recovery-security-evidence`. This review adds the source coverage described above, one executed failing-before regression and 216 passing tests at the corrected head. It does not adopt the preceding worker's tests as newly executed tests or approve all integration paths by association.

Whole-suite coverage, workspace typechecking, linting, builds, dependency and secret scans, hosted CI, browser compatibility and merge qualification remain the integration worker/root's gates. No browser, live Tor-network, deployed application or contract execution test was performed by this reviewer. Intentional exclusions of contract, relayer and CLI runtime changes must remain preserved.

The remaining 65 paths are enumerated explicitly in `RUNTIME_REMAINING.json`, including BTC and policy changes, additional UI/settings paths, Pages artifact scripts and supply-chain tooling. Transfer that inventory to fresh bounded reviewers where required. The authoritative engineering ledger should link or incorporate these receipts; these external receipts are not a competing progress ledger.

The parent has announced a subsequent isolated recovery of the existing PR #328 vault-rekey lock guard and a fresh install for that worktree. Those later changes are outside this receipt's exact-head disposition and require their own source and execution evidence. No later commit inherits an overall merge approval from this scoped review.
