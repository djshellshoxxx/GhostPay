> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay scanner and network test review — round 4 checkpoint

## Outcome

**Reviewed 35 of the 59 assigned immutable test/support versions: 25 distinct paths and 11,388 version-lines.** This consists of 25 complete blob reads and 10 counterparts reviewed through a complete read of the newer blob plus its entire exact diff. **Twenty-four untouched versions / 3,867 version-lines remain for a fresh worker.** This checkpoint deliberately stops before context exhaustion. It does not claim the entire assigned batch or the overall audit is complete.

No new actionable production security issue was established in this bounded test-support review. The established **SN-K01** cancellation issue remains owned by the predecessor and corrected in the combined candidate. Test-source evidence is consistent with that correction; no tests were run.

| Snapshot | Immutable commit |
|---|---|
| Frozen main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Combined candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |

The exact assignment was `scanner_tests_round4-assignment.json`. The authoritative output is `review-scanner-tests-round4.json`, with path, blob, assigned SHA, line count, reviewed ranges, review method, counterpart mapping, and main/candidate byte-identity flags. Assigned SHAs are retained even when they represent an earlier union ref. Coverage is credited by immutable path/blob identity, not by branch name or an assumed equivalence.

All credited source came from `git cat-file blob` or complete immutable `git diff --no-ext-diff --unified=3` output. One truncated scanClient chunk was repaired by reading the entire affected 550–715 span. Every covered row's `sha:path` resolved to the assigned blob, and each actual blob line count matched the assignment. Searches, inventories, and these metadata checks were not credited as source review.

No application, test, configuration or dependency file was changed. No target builds, tests, runtime code, proof of concept, live probe, network request, transaction, Git mutation or push was performed. The only writes were this worker's scratch report and ledger. This is a static defensive source review, not a test-pass result or release approval.

## Reviewed controls and their evidentiary limits

### Private checkpoint composition and replay

The private-checkpoint UI source contains cases for encrypted save/remount, refusal of legacy plaintext progress, failed durable writes, same-key session replacement, seller/deep-scan changes, corrupt and oversized history, changed RPC settings, changed network policy before its event, cancellation, idle lock, stalled RPC opening/readback, retained incomplete-coverage warnings, bounded warning history, write conflict and unchanged checkpoints. The scanClient source separately specifies awaiting checkpoint completion before progress, refusing failed saves, replaying saved discovery blocks, overlap deduplication, replay-plan bounds, cancellation during history replay and no durable advancement after interrupted work. Sources: [apps/web/src/views/Scan.privateCheckpoint.test.tsx:73–255](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.privateCheckpoint.test.tsx#L73-L255); [apps/web/src/views/Scan.privateCheckpoint.test.tsx:257–440](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.privateCheckpoint.test.tsx#L257-L440); [apps/web/src/lib/scanClient.test.ts:90–254](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.test.ts#L90-L254).

These use in-memory CAS, fake RPC data and an imported InlineWorker. They express the intended invariants but do not establish real IndexedDB scheduling, native Worker transfer/termination, cross-tab event timing or browser durability. Helper imports are not automatically counted as reviewed. The predecessor already owns the newer privateScanLifecycle/store source and tests; this checkpoint additionally reads the 188-line older lifecycle test variant, including tied-vault deletion and stale-context cases.

**Rejected hypothesis.** Some UI tests set a generic CAS gate before pressing Start, which initially suggested that the test might only stop at the empty-slot reservation. That hypothesis was rejected after tracing initialization: Scan opens and loads/reserves the vault in its effect before marking the private state ready, and the test helper waits for enabled Start before installing those gates. The later scan opens the existing slot, so the gate reaches its intended later write. This is not a finding or a recorded coverage defect. Sources: [apps/web/src/views/Scan.tsx:180–184](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L180-L184); [apps/web/src/views/Scan.tsx:213–269](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L213-L269); [apps/web/src/lib/privateScanStore.ts:314–324](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanStore.ts#L314-L324); [apps/web/src/views/Scan.privateCheckpoint.test.tsx:55–61](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.privateCheckpoint.test.tsx#L55-L61); [apps/web/src/views/Scan.privateCheckpoint.test.tsx:114–131](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.privateCheckpoint.test.tsx#L114-L131).

### Cancellation and provider evidence

The newer scanClient cases include cancellation of both primary and secondary bulk evidence batches, immediate key wiping, stalled read settlement, rollback corroboration, refusal of changing or mismatched anchors, and withholding durable checkpoints on disagreement. The newer scanPrivacy.clients cases add pre-aborted setup refusal, stale private-endpoint refusal and a guard after jitter before another request. These assertions support the intended SN-K01 correction; this review does not duplicate that known main-only issue as a new defect. Sources: [apps/web/src/lib/scanClient.test.ts:191–253](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.test.ts#L191-L253); [apps/web/src/lib/scanClient.test.ts:318–515](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.test.ts#L318-L515); [apps/web/src/lib/scanClient.test.ts:1757–1995](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.test.ts#L1757-L1995); [apps/web/src/lib/scanPrivacy.clients.test.ts:13–60](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.clients.test.ts#L13-L60).

The scanClient receipt fixtures specify transaction-bound evidence, finality tails, replay retention, separate router payment records, reorg rebuilding and suppression of actionable matches on provider discrepancies. Those are synthetic behavioral expectations, not a proof of the completeness or honesty of deployed providers. The secondary-comparison aggregate work-budget observation remains owned by the adapter lane described in the predecessor report.

### Indexer completeness is deliberately limited

One reviewed test rejects a missing header and separately removes an announcement while retaining otherwise valid headers. It expects the remaining one announcement to be returned successfully. This is direct test-source evidence of the existing design limit: validating header continuity and block identity does not prove that an indexer included every record. It is not a newly discovered candidate regression. Source: [apps/web/src/lib/scanPrivacy.test.ts:375–381](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.test.ts#L375-L381).

### Network authorization and bounded transport

The authorization tests specify exact selected endpoints, path-segment boundaries, fixed private fetch options, rejection of forged capabilities, action-specific export/balance scope, current settings/session checks, invalid clock refusal, idle expiry and late-body disposal. Service composition cases cover cached clients and retry boundaries after policy changes, including refusing an RPC client without an operation grant. Sources: [apps/web/src/lib/networkAuthorization.test.ts:34–125](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/networkAuthorization.test.ts#L34-L125); [apps/web/src/lib/networkAuthorization.test.ts:127–354](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/networkAuthorization.test.ts#L127-L354); [apps/web/src/lib/networkAuthorization.test.ts:401–482](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/networkAuthorization.test.ts#L401-L482); [apps/web/src/lib/defaultServices.authorization.test.ts:17–86](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/defaultServices.authorization.test.ts#L17-L86); [apps/web/src/lib/defaultServices.networkGuard.test.ts:22–61](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/defaultServices.networkGuard.test.ts#L22-L61).

The boundedRequest tests distinguish byte caps from declared lengths, exercise uncooperative fetch/read/cleanup, check deadline and backward-clock refusal, and specify fixed local errors. The relayer transport cases keep ambiguous timeouts distinct from confirmed refusal and restrict the compatibility retry. The native adapter files define loopback HTTP integration cases for endpoint choice and redirects. None were executed. The browser-realm file is explicitly jsdom, so its presence does not establish an actual browser end-to-end pass. Sources: [apps/web/src/lib/boundedRequest.test.ts:20–167](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/boundedRequest.test.ts#L20-L167); [apps/web/src/lib/transportCancellation.test.ts:31–144](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/transportCancellation.test.ts#L31-L144); [apps/web/src/lib/networkAuthorization.adapters.test.ts:52–93](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/networkAuthorization.adapters.test.ts#L52-L93); [apps/web/src/lib/transportNative.test.ts:28–67](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/transportNative.test.ts#L28-L67); [apps/web/src/lib/boundedRequest.browser.test.ts:1–15](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/boundedRequest.browser.test.ts#L1-L15).

### Performance source has a deliberately narrow meaning

The performance file defines one deterministic 272-announcement fixture, with 256 announcements in its preparatory scan and 80 expected in the later replay/incremental run. Preparation warms the same JavaScript process. RPC and CAS are in memory, and InlineWorker is used. The file expressly excludes browser IndexedDB latency, worker transfer/rendering, real-network latency and mobile throughput; it has no wall-clock ratio acceptance gate. No timings or measurements were produced by this review. Source: [apps/web/src/lib/privateScanPerformance.nocov.test.ts:15–23](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanPerformance.nocov.test.ts#L15-L23); [apps/web/src/lib/privateScanPerformance.nocov.test.ts:80–98](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanPerformance.nocov.test.ts#L80-L98); [apps/web/src/lib/privateScanPerformance.nocov.test.ts:201–260](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanPerformance.nocov.test.ts#L201-L260).

## Completed immutable coverage

Every row below is complete for the listed variant line counts. The JSON stores the full blob/SHA/range/method for each. The older 188-line privateScanLifecycle variant is a separate union version; its candidate counterpart was previously reviewed by the predecessor.

| Path | Reviewed variants | Version line counts |
|---|---:|---|
| `apps/web/src/lib/defaultServices.test.ts` | 3 | 47, 81, 81 |
| `apps/web/src/lib/scanCheckpointPrivacy.test.ts` | 1 | 137 |
| `apps/web/src/lib/scanClient.test.ts` | 3 | 1760, 1995, 1948 |
| `apps/web/src/lib/scanCursorSlot.test.ts` | 2 | 312, 404 |
| `apps/web/src/lib/scanMatches.test.ts` | 1 | 33 |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | 2 | 37, 85 |
| `apps/web/src/lib/scanPrivacy.i18n.test.ts` | 1 | 106 |
| `apps/web/src/lib/scanPrivacy.test.ts` | 2 | 458, 520 |
| `apps/web/src/lib/scanSpam.test.ts` | 1 | 272 |
| `apps/web/src/lib/boundedRequest.browser.test.ts` | 1 | 15 |
| `apps/web/src/lib/boundedRequest.test.ts` | 1 | 167 |
| `apps/web/src/lib/defaultServices.authorization.test.ts` | 1 | 86 |
| `apps/web/src/lib/defaultServices.networkGuard.test.ts` | 1 | 61 |
| `apps/web/src/lib/defaultServices.privacySelection.test.ts` | 2 | 72, 72 |
| `apps/web/src/lib/networkAuthorization.adapters.test.ts` | 1 | 93 |
| `apps/web/src/lib/networkAuthorization.profileConsistency.test.ts` | 1 | 44 |
| `apps/web/src/lib/networkAuthorization.test.ts` | 2 | 482, 356 |
| `apps/web/src/lib/networkOperation.test.ts` | 1 | 64 |
| `apps/web/src/lib/privateScanPerformance.nocov.test.ts` | 1 | 260 |
| `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts` | 1 | 24 |
| `apps/web/src/lib/scanSpam.partial.test.ts` | 1 | 37 |
| `apps/web/src/lib/transportCancellation.test.ts` | 1 | 144 |
| `apps/web/src/lib/transportNative.test.ts` | 1 | 67 |
| `apps/web/src/views/Scan.privateCheckpoint.test.tsx` | 2 | 440, 440 |
| `apps/web/src/lib/privateScanLifecycle.test.ts` | 1 | 188 |

## Exact untouched handoff

No source ranges in these variants are credited by this worker. The next worker should begin with the Scan view integration tests and their complete counterpart diffs, then the package tests and `packages/scan-source/src/testutil.ts`. No new production investigation is pending from this checkpoint. Root should reconcile identical blobs already reviewed by other lanes before assigning remaining work.

| Path | Blob | Assigned SHA | Lines |
|---|---|---|---:|
| `apps/web/src/views/Scan.autoRescan.test.tsx` | `1c52101fd63804fa5e80c540923d89a5606afc8e` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 157 |
| `apps/web/src/views/Scan.i18n.test.tsx` | `2892f973dcb48a6076eb38e768bd43082378becb` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 94 |
| `apps/web/src/views/Scan.privacy.test.tsx` | `5ca8631fb1f25658ae55e122d10e22027c0d5e51` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 92 |
| `apps/web/src/views/Scan.test.tsx` | `8b2fcf37b6c7670c20938018a3810265fd777152` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 696 |
| `apps/web/src/views/ScanPrivacy.i18n.test.tsx` | `bd5571c580d0fbfb882bf15d0e39c97e1ff60231` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 216 |
| `packages/net-transport/src/browser.test.ts` | `7c26ee3fbff011a3c46b99274a7a90eade242964` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 43 |
| `packages/scan-source/src/composite.test.ts` | `9246734a198f12adf9512da541dd247d13d3c08a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 145 |
| `packages/scan-source/src/indexer.test.ts` | `b4776a2a734b91fe83112cea38be58886761260a` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 109 |
| `packages/scan-source/src/pir2.test.ts` | `2f1740ea8289dfafa08a7614114eb2880c033570` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 113 |
| `packages/scan-source/src/range.test.ts` | `357c9d96c636c4df4d2698c1c2d34fcec4ec8bfd` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 100 |
| `packages/scan-source/src/testutil.ts` | `80abc5dffb35c837bb0d3ee6e793636d56bfedeb` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 133 |
| `packages/scan-source/src/validate.test.ts` | `84500028971740c8d42580be599aad4fc49e797e` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 60 |
| `packages/scan-source/src/window.test.ts` | `49244a63e4c0fc16793f6e429940fc153be37267` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 41 |
| `apps/web/src/views/Home.authorization.test.tsx` | `640023d9450771e5edfb69066f077c168e48d35d` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 85 |
| `apps/web/src/views/Scan.privacy.test.tsx` | `146a90721ae039959af1ce4cd973c572394721f7` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 117 |
| `apps/web/src/views/Scan.stealthExport.authorization.test.tsx` | `576a2c5ff4bc13b61181d554c7a59135070d1cb9` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 172 |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | `a386af69cb9c30910df93438cb8d589d16229980` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 124 |
| `apps/web/src/views/Scan.test.tsx` | `c25de17f75fcea631452b769aadede99a305f25f` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 703 |
| `packages/net-transport/src/browser.test.ts` | `5a11e91b46c0cd6fa6697673284affe315c7f380` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 50 |
| `packages/net-transport/src/selection.test.ts` | `018e3d754211e3f15bf1199b210ebfe7d0c6f6ba` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 75 |
| `packages/scan-source/src/composite.test.ts` | `4280a956a606315455c39b1b254a13b21aaf004c` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 145 |
| `packages/scan-source/src/padded.test.ts` | `94a8befe42447d02b44f47fe57ce9ab1120a9102` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 134 |
| `packages/scan-source/src/pir2.test.ts` | `99678e91f2a22a2d0e8ef74dbece3a040a300bde` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 121 |
| `packages/scan-source/src/range.test.ts` | `37eeeb47f674b5dc6e86569ddefcd7cb56b13eaa` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 142 |

The remaining count is **24 variants / 3,867 version-lines**. Imported helpers outside these explicit rows remain outside this worker's credited coverage unless another ledger establishes their review.
