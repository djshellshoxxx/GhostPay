# Code audit generation 1: unique source and receipt status boundary

## Scope and source

Independent worker: `/root/code_audit_gen1`. Baseline: PR #278 at `417f7c71daf8645e1432f2ec8f070110879b80bd`; main at discovery: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. This audit evaluates the narrow source changes listed below and records overlapping local work. It is not an exhaustive audit of every GhostPay branch, a full security signoff, or merge approval.

The repository requires dedicated ownership, regression evidence, accurate test reporting, no overwrite of other workers, and fresh qualification before integration (`AGENTS.md`, `docs/ai/WORKFLOW.md`). The originating requirements are the individual candidate PRs and [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286). Source and merge-base records are in `branch-inputs.json`; exact changed-file blobs are in `source-blobs.json`.

## Consolidation decisions

| Candidate | Actual source result against the pinned baseline | Disposition |
| --- | --- | --- |
| #285 `89942105` | Both `qrKinds.ts` and `qrKinds.test.ts` are byte-identical to the baseline. Existing own-property checks reject unknown and inherited names. | Already present. Do not duplicate this source change. |
| #290 `ec546311` | Adds primitive-string guards before own-property lookup. This prevents runtime coercion hooks and boxed/array key values from reaching classification. Both runtime guards are absent from the baseline. | Unique narrow behavior; retain its regression coverage. |
| #295 `4493793a` | Descends from #290. Runtime `qrKinds.ts` is byte-identical to #290. Adds unverified-object coverage and the complete eight flag combinations for every declared payload mapping. | Prefer this cumulative source/test pair over separately replaying #290 and #295. Hosted qualification remains separate. |
| #294 `172695ef` | Moves `#lastActivity` after conflict validation in `Assembler.add`. Baseline refreshes the timer before rejecting an already-held index with different data. New tests distinguish rejected conflicts/mismatch/malformed data from valid duplicates. | Unique two-file fix. Preserve accepted-duplicate and exact-deadline semantics. Resolve only additive documentation conflicts if combining with a newer baseline. |
| #298 `acbf39ee` | `pollReceipt` adds a primitive, shaped `transactionHash` check and case-insensitive correlation before status interpretation. Baseline has no receipt-hash correlation. Other changed paths are matching fixtures/regressions. | Unique correctness repair. Its `wallet.ts` and `Pay.test.tsx` overlap the active wallet-privacy lane; coordinate integration. Receipt status finding below remains unfixed by #298. |
| #293 `6c648770`, #297 `04910f65` | #297 descends from #293 and changes only the clipboard test qualification plus documentation. Both runtime blobs (`clipboardPrivacy.ts`, `Common.tsx`) are identical between them. Neither complete Settings/persistence integration nor end-user activation exists in this published primitive. | #297 supplies the repaired tests for the same prototype. Do not mistake either PR for completion of issue #286, and do not replay the prototype over the actively developed replacement. |
| #292 `936d054e` | Its artifact gate and security fixture changes have distinct owners. | Security worker owns substantive review. This code audit records its paths, not approval. |

These decisions compare final source semantics and blobs, not merely absent commit IDs. The historical branches and source PRs remain intact.

## Recovered local work is actively owned

The original checkout contains additional source not yet reflected in the published PR bodies. `local-recovery-inputs.json` records the exact inspected snapshots, changed product paths, and handoff paths. Their source is substantially newer than the incomplete #293 primitive:

| Frozen local input | Demonstrated scope | Integration caution |
| --- | --- | --- |
| Clipboard `4da81d23` | Settings controls, bounded preference storage, shared copy ownership, SecretBackup cleanup, failed-copy ownership restoration, and preservation of Settings workflows during visual preference changes. | Includes imports from masking and catalog workers. Its helper/backup fixes are later than the copies in the frozen masking and wallet lanes. |
| Masking/history `8be15289` | Global visual masking, 30-second reveal, temporary private history, manual tag-lock revocation, isolated UI preference persistence, execution-settings identity preservation. | Source-pinned local receipt reports 196 selected tests and explicitly no executed browser assertions. This audit does not relabel those as its own tests. |
| Wallet privacy `1aa54b10` | Provider/account invalidation, stale connection guards, Pay/Registry authority preservation, and a returned-hash fallback when journal persistence fails. | Includes earlier clipboard/masking copies, so it must not overwrite their later repairs. |
| Strings `c44094de` | Shared privacy disclosures and critical source-English fallback keys. | Coordinate catalog merges; do not replace the whole catalogs from an older sibling. |
| Neutral-output review `a50cb268` | Narrow neutral export filename and address-free refusal text, retaining existing contract-code guards and recovery bytes. | Independent receipt reports 51 tests; this audit inspected the source/review but did not rerun them. |

During this cycle the coordinator observed the clipboard and policy/wallet branches advancing again. Treat every local lane as **actively owned**, not abandoned work. No product changes from these branches were imported, amended, reset, or remotely published by this worker. The frozen matrix is an overlap warning, not a recommendation to bulk-merge these heads. Reconfirm the current owner and latest exact SHA before taking any source.

## Standards review

The selected narrow fixes match the repository's minimal-change rule and preserve existing validation/error paths. No new documented-standard violation is established in #290/#295, #294, or #298's small production diffs. No style-only refactor is recommended.

The concrete integration risk is ownership and source regression: replaying #293 or whole older local privacy branches can replace newer reviewed helper and Settings repairs. The repository explicitly prohibits overwriting active workers. The source matrix above is the required basis for a coordinated extraction.

## Spec review: unsupported receipt status is called a revert

**Finding CA1 — low security severity, high correctness confidence.** `apps/web/src/lib/wallet.ts`, `pollReceipt`, accepts any value parsed by `parseQuantity`. It returns `success` only for `1n` and calls every other quantity `reverted`, including `0x2`, `0x3`, `0xf`, `0x10`, and `0xffffffffffffffff`. The same expression remains in #298 after its hash correlation guard.

[EIP-658](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-658.md) defines receipt failure as zero and success as one. The current [Ethereum execution API receipt schema](https://ethereum.github.io/execution-apis/api/methods/eth_getBlockReceipts/) describes the same two states. Unsupported values should produce the existing unexpected-receipt-shape error. Treating malformed data as a definite revert misreports an unverified payment state.

The actual consumer passes a returned receipt through `submitTx`; `buildReceipt` in `payExec.ts` maps a non-success receipt to a local `reverted` status. This finding does **not** establish theft, authentication of RPC evidence, or a duplicate-send bypass. Existing journal and post-broadcast protections require their own regression controls during repair.

The independent probe is archived as `wallet.receiptStatusAudit.test.ts.txt`. Execution outcomes and environment provenance are recorded in `verification.json`. No production fix was made by this audit worker.

### Execution outcome

The required local core-crypto, invoice-schema and chain-adapters build completed with exit zero. The independent eight-case probe **did not reach a reported test result**: the Node 24 run was interrupted with exit 130 while Vitest remained at collection, and the original configuration under the existing pinned Node 22.23.4/npm 10.9.11 toolchain reached an external 150-second cap with exit 124. Both logs are preserved. No timeout or project configuration was changed. The #298 variant was not run after these failures to complete collection. This is source-confirmed behavior with an archived, unexecuted regression expectation, not an executed RED/GREEN claim.

### Separate, deliberately unpromoted boundary

`pollReceipt` also accepts absent/null `to` by design of the current code and its original `wallet.test.ts` success assertion. The security worker independently identified that behavior. This review does not silently redefine that compatibility policy or label it a newly reproduced defect. A successor can assess whether every supported non-creation call should require a receipt destination, with explicit specification and compatibility evidence. The status-range fix can remain narrow.

## Limits

This audit does not claim full-suite coverage, browser execution, build/release qualification, cleared CodeQL alerts, external approval, a completed issue #286, or a production deployment. Candidate CI and active ownership must be refreshed before integration. Parent coordination and a fresh successor own implementation and combined qualification.
