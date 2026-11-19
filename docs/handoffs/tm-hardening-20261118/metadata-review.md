# Metadata privacy engineering review

Reviewer: `metadata_privacy` (AI-assisted engineering review, not an external audit).

## Source and scope

- Main observed: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- PR #222: `2bc2098298d90928eb1acafad969f28316bb05fc`.
- Working baseline: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`.
- Checkpoint owner: PR #235 `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1`.
- Assigned TM8, TM9, TM10, TM12, TM15. Read-only comparison preceded test additions.
- Product ownership: `ReceiptPanel.tsx`, `CreateInvoice.tsx`, scan-source `padded.ts` and `range.ts`, and associated tests.
- No checkpoint architecture, key protocol, signer pinning, transport engine, recovery, contract or deployment changes.

## Requirement dispositions at review start

| TM | Existing baseline protection and default | Remaining work or limitation |
|---|---|---|
| TM8 | #238 uses the #235 v4 HKDF slot namespace with session-bound key lending. Distinct seller identity, missing keys, silent replacement, legacy v1/v2/both-v3 removal and no unsafe legacy resume have dedicated tests. | Do not reintroduce #222's HMAC v3 migration: it shares a namespace with an incompatible earlier HKDF scheme. Cursor values remain plaintext and unauthenticated; metadata count/timing/block information is visible. Rerun owner acceptance; no redesign. |
| TM9 | `receiptSigningFields` omits `stealthAddress` by default; explicit checkbox opts in. Schema v1 accepts both historical address-bearing and minimized receipts. | Confirmed by source: checkbox state survives changes in match and seller although other receipt state resets. Add failing regressions and reset consent on those boundaries. Receipt tx hash still permits on-chain correlation even when address omitted. |
| TM10 | `CreateInvoice` initializes encryption enabled. Opt-out and passphrase workflow exist; existing real encryption/decryption tests cover both. No default plaintext local storage. | Session replacement preserves the plaintext opt-out and old invoice content because form state is component-scoped. Reproduce and reset privacy/form state on session changes, with late-result invalidation. Authoritative recommendation's per-invoice signer keys remain outside this handoff's explicit key-generation/protocol boundary. |
| TM12 | `bulkEvidence=0` default; bounded configured decoy count; transaction selection includes all matches; receipt and tx evidence validated with reorg/secondary checks. #238 adds cancellation checks and passes scan signal. Missing batch evidence never triggers lone matching-tx fallback. | Existing match retention can exceed the configured count: it is not a hard cap on all evidence requests. Repeated capped range queries can narrow matching transactions. Existing tests cover missing/orphaned/wrong-chain batches. Rerun; do not duplicate #238 cancellation code. |
| TM15 | `padBlocks=0` default; range helper expands both sides, aligns grid, bounds block zero/head, validates padding and returns exact queried items by default. Range source deduplicates parsed announcement identities. | Confirmed: forwarding AbortSignal alone does not prevent dispatch or return of stale data when backend ignores it. Add local guards before/after awaits. Window budget is checked after allocation: move arithmetic preflight before allocation, then test huge range safely after the fix. A browser padding value of 100000 can require far more than two additional windows; documentation must not promise two. |

## Initial regression attempts

All commands below use Node v24.22.3 and Vitest 5.1.0 unless superseded in the final evidence.

1. From `packages/scan-source`: `node ../../node_modules/vitest/vitest.mjs run src/padded.test.ts src/range.test.ts --maxWorkers=1`
   - **Exit 1**: padded suite **3 failed / 13 passed**. Every new cancellation regression failed because the promise resolved; includes pre-aborted call and abort while a non-cooperative last/early window is pending.
   - The range suite could not collect because `@ghostpay/pir-two-server` dist had not been built yet. This is a setup failure, not a product assertion.
2. From `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/components/ReceiptPanel.test.tsx src/views/CreateInvoice.privacy.test.tsx --maxWorkers=1`
   - **Exit 1; zero collected assertions**: `@ghostpay/secret-box` dist unavailable while the coordinator's library build was still in progress. Not counted as regression evidence.

## Completed failing-first corrections

| Finding | Failing regression | Correction |
|---|---|---|
| TM9 prior receipt address consent survives a different payment/seller | Both new `ReceiptPanel.test.tsx` replacement cases failed on the original runtime; remount control passed. | Reset `includeAddress` in the existing receipt match/signer identity reset effect. Preserve explicit consent across unchanged renders. Generated minimized JSON is verified and lacks address/key property. |
| TM10 plaintext opt-out and invoice content survive new seller session; late result surfaces old seller invoice | `CreateInvoice.privacy.test.tsx`: 3 failed / 1 passed on original runtime, including same-public-keys reinstall and different seller. | Give the existing invoice form a key for the loaded session lifetime. Replacement remounts all private form state and invalidates old mounted callbacks, preserving full/lean profile behavior within a session. No encryption, signing or key-generation protocol changes. |
| TM12/TM15 positive infinity enables maximum optional privacy traffic | New non-finite-options case failed with `bulkEvidence=500` on the original runtime. | Non-finite values now disable both options, preserving finite positive truncation/clamping. Update the existing infinity-padding expectation to this stricter invalid-value policy. |
| TM15 cancelled operations dispatch or return late windows | 7 cancellation regressions failed across `padded.test.ts` and `range.test.ts`; 25 controls passed. | Assert current cancellation before dispatch and after awaited head/window responses; refuse stale results using a fixed non-sensitive error. |
| TM15 request budget checked after potentially huge allocation | Source confirmed; original normal request-cap tests cover `TRUNCATED` before network. A deliberate original OOM was not attempted. | Arithmetic preflight before allocating windows. A new trillion-block / one-block-window case is run **only after the correction** and fails promptly with `TRUNCATED` and zero calls. This is post-fix acceptance, not claimed failing-first OOM evidence. |

## Executed verification

Commands are from the named workspace. Separate command executions overlap; counts are not additive unique coverage.

- `packages/scan-source`: `node ../../node_modules/vitest/vitest.mjs run src/padded.test.ts src/range.test.ts --maxWorkers=1`
  - Re-executed after dependency build, before product edits: **7 failed / 25 passed**, exit 1; `metadata-scan-red.log`.
  - Corrected source: **33 passed**, exit 0; `metadata-scan-green.log`.
- `packages/scan-source`: `node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1`
  - **80 passed**, original coverage gates passed, exit 0; `metadata-scan-coverage.log`.
  - Statements 98.81%, branches 95.86%, functions 100%, lines 100%.
- Root: `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/scan-source` and corresponding `npm run lint -w @ghostpay/scan-source`
  - Both **exit 0**; `metadata-scan-typecheck.log`, `metadata-scan-lint.log`.
- `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/components/ReceiptPanel.test.tsx src/views/CreateInvoice.privacy.test.tsx src/lib/scanPrivacy.bulkEvidence.test.ts --maxWorkers=1`
  - Before relevant product corrections: **3 failed / 11 passed**, exit 1; receipt pair and infinity normalization failures. The invoice file did not collect because Solana build output was not ready; not counted as invoice assertion evidence. `metadata-web-red.log`.
- `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/views/CreateInvoice.privacy.test.tsx --maxWorkers=1`
  - Dependency-complete failing-first invocation: **3 failed / 1 passed**, exit 1; `metadata-invoice-red.log`.
- `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/components/ReceiptPanel.test.tsx src/lib/scanPrivacy.bulkEvidence.test.ts --maxWorkers=1`
  - Corrected behavior: **14 passed**, exit 0; `metadata-receipt-settings-green.log`. This preceded the later conditional-address QR wording assertion.
- `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/views/CreateInvoice.privacy.test.tsx src/views/CreateInvoice.supported.test.tsx src/views/CreateInvoice.ordering.test.tsx src/components/ReceiptPanel.test.tsx src/lib/scanPrivacy.bulkEvidence.test.ts src/lib/scanPrivacy.test.ts --maxWorkers=1`
  - **65 passed / 1 failed**, exit 1. All invoice/receipt regressions and existing profile/ordering tests passed, including the new QR wording assertions. The only failure was the old test that explicitly expected positive-infinity padding to activate the maximum; corrected to disabled (0), then retested separately. `metadata-web-green.log` retains the failure honestly despite its filename.
- Root: `NODE_OPTIONS=--max-old-space-size=1536 node node_modules/eslint/bin/eslint.js --config eslint.config.js apps/web/src/components/ReceiptPanel.tsx apps/web/src/components/ReceiptPanel.test.tsx apps/web/src/views/CreateInvoice.tsx apps/web/src/views/CreateInvoice.privacy.test.tsx apps/web/src/lib/scanPrivacy.ts apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts`
  - **Exit 0**; `metadata-web-lint.log`.
- `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/lib/scanPrivacy.test.ts src/lib/scanPrivacy.bulkEvidence.test.ts --maxWorkers=1`
  - After correcting the obsolete infinity expectation: **42 passed**, exit 0; `metadata-finite-green.log`.
- `apps/web`: `NODE_OPTIONS=--max-old-space-size=1536 node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src/lib/scanPrivacy.test.ts`
  - **Exit 137, process killed without source diagnostic**; `metadata-finite-lint.log` is empty. The cause of the kill is unproven. Do not count this particular attempt as passing; the coordinator's final whole-web lint remains necessary.

The coordinator owns the complete web/typecheck/Pages/browser qualification after the agents finish. This reviewer does not relabel another source's CI or real-network tests as passed here.

## Compatibility and remaining limits

- Receipt wire version and historical signatures are unchanged; absent `stealthAddress` remains intentional schema behavior. A receipt tx hash still reveals public on-chain relationships.
- Invoice form reset is tied to session identity, including a reinstall with identical public keys; changing full/lean profile within the same session keeps the existing profile behavior. Per-invoice signer generation remains outside scope and is not claimed implemented.
- Generic `fetchPadded` has no universal record identity and intentionally retains distinct same-block items; the announcement-specific `createRangeSource` deduplicates using `normalizeSet`, tested by its pre-existing duplicate/malformed-record cases.
- Cancellation prevents new dispatch and stale-result acceptance; it cannot recall sent bytes or settle a backend promise that never completes. No new transport engine or deadline is introduced here.
- Extra padded grid windows can reach `2 * ceil(padBlocks/windowBlocks)` before provider-limit splitting. The 100000-block padding cap is a block bound, not a two-request cap. Bulk evidence target count likewise does not discard matches above the target; decoy selection is not a guarantee against repeated-range inference.

## TM15 active web scheduler acceptance correction

Independent acceptance review later found that the scan-source helper fixes above did not reach `createWindowedScanClient`, the active web scheduler. The parent authorized a narrow correction against local checkpoint `6464083bd75b9c6913bbea49c98be651026de7a5`. The full correction record is in `metadata-web-scheduler-review.md`; exact source hashes are in `metadata-web-scheduler-source.sha256`.

- Runtime changes: `apps/web/src/lib/scanPrivacy.ts` gains optional scan-signal guards before/after head, jitter, window and split scheduling; `Scan.tsx` passes its existing controller into primary and secondary clients. No transport deadline or checkpoint change.
- A per-invocation 4096 initial-window arithmetic preflight prevents unbounded allocation; the same cap bounds uncached dispatches including provider-limit split attempts. Head/block reads, other RPC and transport/indexer internal work are outside this cap. Concurrent invocations use separate counters.
- Regression files: new `scanPrivacy.scheduler.test.ts`, additions to `scanPrivacy.clients.test.ts` and `Scan.privacy.test.tsx`. The real primary and secondary Cancel probes each reproduced 9 calls instead of 1 before the fix.
- Initial focused command, from `apps/web`: `node ../../node_modules/vitest/vitest.mjs run src/lib/scanPrivacy.scheduler.test.ts src/lib/scanPrivacy.clients.test.ts src/views/Scan.privacy.test.tsx --maxWorkers=1` — **exit 1, 16 failed / 7 passed**; `metadata-web-scheduler-red.log`.
- Same command after runtime correction — **exit 1, 20 passed / 3 failed**; `metadata-web-scheduler-green.log`. Cancellation/UI/wiring cases passed. The three remaining budget assertions omitted the standard `INVALID_INPUT: ` error-message prefix; corrected without weakening the dispatch/count assertions.
- Final source command adds `src/lib/scanPrivacy.test.ts` to that selection — the log ultimately reports **62 assertions / 4 files passed**, including huge-range and concurrency acceptance. **A worker-termination timeout required Ctrl-C and process exit 130**, so the run is not a clean qualification pass. `metadata-web-scheduler-final.log` retains both facts; the totals flushed after interruption. Huge-range allocation was tested only after the safe preflight existed.
- `git diff --check` on the four tracked modified files exited 0. No new typed lint/typecheck or broad local run was started; root owns hosted final-source gates. No worker process remains active.
- Fresh #241 head `e8857bfa1ec93fafa9ff83f63f7430ef26a362c2` is merged as `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`; its 18 paths do not overlap the two scheduler runtime files and are not imported here. Separate scan endpoint/indexer policy and in-flight settlement limitations remain explicit.
- Independent `acceptance_review` read the frozen diff and reported no material runtime blocker. No additional independent execution or clean final hosted gate is claimed here.
