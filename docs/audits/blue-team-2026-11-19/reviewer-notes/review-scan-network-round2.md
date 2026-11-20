> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay scan and network review — round 2

## Outcome

**The assigned production batch is complete: 36 distinct paths, 51 immutable path/blob versions, and 11,842 version-lines are accounted for.** Nine focused test files were read (10 path/blob versions, 1,560 version-lines). Changed counterparts were reviewed by a complete candidate read plus the entire exact diff; those counts do not claim an independent second full-file read. Every production row in this lane’s source-scope union is covered.

One low-severity issue is confirmed in frozen main and already corrected in the combined candidate: **SN-K01, additional scan RPC dispatches after Cancel**. No new unfixed candidate security finding was established in this bounded batch. This is a static source review, not release approval, cryptographic proof, or a test-pass claim.

No application, test, configuration or dependency files were changed. No target builds, tests, runtime code, proof of concept, live probes, transactions, exploitation, Git mutations or pushes were performed. Only this reviewer’s scratch notes and ledger were written.

| Snapshot | Immutable commit |
|---|---|
| Frozen main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Combined candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| Quick-hide source variant | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| Earlier recent source variant | `40b64e8f3a0f34f7b19235ba4655ef918687f22e` |

The broader 28-ref union is inherited from `source-scope.json`. Byte-identical copies across refs reuse the same path/blob coverage. A sibling branch missing a later candidate correction is not treated as proof of a new integrated regression.

## SN-K01 — Main continues dispatching scan RPCs after the user presses Cancel

**Severity:** low. **Confidence:** high. **Disposition:** known-in-candidate; fixed in the combined candidate. Root confirmed this was not already assigned to another canonical finding.

A normal scan can have several announcement windows or provider-limit subdivisions in progress. In frozen main, pressing Cancel aborts the view’s controller and terminates the worker, but the window decorator receives no cancellation signal. If cancellation happens while an optional jitter delay or preceding window request is pending, the continuation can still issue additional `getLogs` requests. The outer scan checks cancellation after the entire adapter fetch returns.

**Impact.** The already selected RPC can receive additional scan-range and timing activity after the user withdraws the action, and the UI may wait for that page work to settle. This is a cancellation/privacy-consent boundary defect. No changed destination, key disclosure, transaction submission or fund-loss path is established. The finding concerns requests that begin after cancellation; it does not claim that bytes already sent can be recalled.

### Source evidence

- [Main Cancel button](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Scan.tsx#L393-L395) aborts the action; [main client construction](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Scan.tsx#L199-L207) does not supply that signal.
- [Main worker teardown](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanClient.ts#L147-L160) is bound to abort, while [the adapter fetch](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanClient.ts#L267-L271) is awaited before cancellation is checked.
- [Main window options](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L341-L344) have no signal. [The jitter continuation](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L372-L378) proceeds into `inner.getLogs`; [recursive split processing](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L400-L420) and [the window loop](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L438-L458) have no action-cancellation check.
- [Candidate primary construction](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L442) and [secondary construction](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L488) pass signal and current-context guards. [Candidate dispatch](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L455-L467) checks after jitter; [split scheduling](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L494-L518) checks cancellation. [Candidate scoped RPCs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L185-L214) guard calls made internally by adapters and discard late results.

**Remediation direction.** Preserve these candidate checks during integration and maintain cancellation at every asynchronous boundary that can schedule another request. Keep the distinction between suppressing later requests and recalling a request already dispatched.

**Existing test-source evidence.** [Scheduler cases](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.scheduler.test.ts#L27-L105) cover pre-aborted work, cancelled head/log responses, provider-limit rejection, and cancellation during jitter. [Caller-cancellation cases](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.authorization.test.ts#L21-L93) cover bootstrap refusal, indexer abort propagation, no subsequent windows, and the post-jitter check. These complete files were read; no tests were run.

## Other observations and limits

### Private discovery history and stale writers

The v5 private scan store derives its slot and authenticated encryption context from the seller, chain, manifest/router/announcer, finality policy, deep-scan flag and configuration digest. It rejects malformed or oversized state, reserves empty contexts, and uses compare-and-swap writes plus random tombstones. Scope/session guards are checked around reads and commits. Restored matches are assigned `claimed`; stored receipt classifications are not reused. Sources: [apps/web/src/lib/privateScanStore.ts:136–196](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanStore.ts#L136-L196); [apps/web/src/lib/privateScanStore.ts:254–365](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanStore.ts#L254-L365); [apps/web/src/lib/privateScanLifecycle.ts:65–98](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/privateScanLifecycle.ts#L65-L98).

The view supplies saved discovery blocks for re-fetching, then awaits journal save before publishing advanced durable state. The scan reconstructs receipt status from fresh verification. The read store/lifecycle tests exercise corrupt ciphertext and authenticated malformed plaintext, concurrent writes, tombstone ABA, same-key session replacement, deleted-key-vault bindings, storage denial, and size limits. Source inspection supports these intended controls; actual IndexedDB/browser race behavior remains unexecuted. Sources: [apps/web/src/views/Scan.tsx:413–424](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L413-L424); [apps/web/src/views/Scan.tsx:538–551](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L538-L551); [apps/web/src/lib/scanClient.ts:290–352](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L290-L352); [apps/web/src/lib/scanClient.ts:492–509](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L492-L509).

### Transport, relayer and scan-source boundaries

The browser fetch transport validates endpoint form, bounds timeout and streamed bytes, rejects redirects, omits credentials/referrer, and exposes fixed local errors. The fetch adapter’s cancellation suppresses late results but cannot recall an already dispatched abstract transport call. Sources: [packages/net-transport/src/fetchTransport.ts:35–125](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/net-transport/src/fetchTransport.ts#L35-L125); [packages/net-transport/src/fetchAdapter.ts:24–53](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/net-transport/src/fetchAdapter.ts#L24-L53).

Relayer error classification in the candidate is allowlisted. Its one unpadded compatibility retry occurs only for the expected old-relayer parsing refusal; uncertain timeout/abort outcomes remain ordinary failures. The returned transaction hash is described as the relayer’s report, requiring the separate caller verification already reviewed by the payment lane. No new relayer finding was established. Source: [apps/web/src/lib/relayerClient.ts:54–84](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/relayerClient.ts#L54-L84); [apps/web/src/lib/relayerClient.ts:119–170](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/relayerClient.ts#L119-L170); [apps/web/src/lib/relayerClient.ts:213–218](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/relayerClient.ts#L213-L218).

The browser path offers RPC or indexer log sources. Indexer headers/block identities are cross-checked but the source explicitly remains unverified for complete log contents. Light/PIR/quorum helpers were read conservatively from the lexical closure; no browser activation of a light or PIR client was established in the reviewed path. Nonbrowser native/proxy/OHTTP net-transport implementations are outside this assigned closure. Sources: [apps/web/src/lib/scanPrivacy.ts:248–279](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L248-L279); [apps/web/src/lib/scanPrivacy.ts:640–672](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L640-L672); [packages/scan-source/src/indexer.ts:53–64](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/indexer.ts#L53-L64).

### Secondary comparison work budget — adapter lane owns the observation

The candidate wraps both RPC clients with abort/current-context checks, including calls inside `compareProviders`. It also caps uncached window dispatches at 4,096 per decorated `getLogs` call. That is not an aggregate request or log cap for the entire secondary comparison. The adapter reviewer owns the unranked availability-hardening observation; this lane does not duplicate it as a separate finding or claim measured amplification. Sources: [apps/web/src/lib/scanClient.ts:185–214](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L185-L214); [apps/web/src/lib/scanClient.ts:519–530](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L519-L530); [apps/web/src/lib/scanPrivacy.ts:455–467](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L455-L467); [apps/web/src/lib/scanPrivacy.ts:548–564](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L548-L564).

### Known privacy-estimate correction

The candidate’s partial-count flag checks coverage of the available 30-day span, while main checks seven days even though the display also includes a 30-day count. This is a known candidate correction to a deliberately rough heuristic, not a new candidate security finding. Sources: [apps/web/src/lib/scanSpam.ts:187–197](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanSpam.ts#L187-L197); [apps/web/src/lib/scanSpam.ts:187–197](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanSpam.ts#L187-L197).

## Coverage

`review-scan-network-round2.json` is authoritative for path, blob, SHA, total lines, actual completed ranges, and method. Production coverage is keyed by path/blob; a changed counterpart uses complete reviewed candidate source plus complete exact diff. Searches and inventories are not counted as review.

| Area | Distinct paths | Reviewed path/blob versions |
|---|---:|---:|
| Web scan/relayer runtime | 12 | 22 |
| Browser net-transport closure | 10 | 12 |
| scan-source closure | 14 | 17 |

### Fully read test files

| Path | Candidate lines | Main comparison |
|---|---:|---|
| `apps/web/src/lib/privateScanStore.test.ts` | 304 | new in candidate |
| `apps/web/src/lib/privateScanLifecycle.test.ts` | 190 | new in candidate |
| `apps/web/src/lib/scannerCore.test.ts` | 256 | complete candidate plus complete diff |
| `apps/web/src/lib/scannerCore.fuzz.test.ts` | 38 | byte-identical |
| `apps/web/src/lib/scannerCore.bench.nocov.test.ts` | 54 | byte-identical |
| `apps/web/src/lib/scannerCore.spam.nocov.test.ts` | 194 | byte-identical |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | 164 | new in candidate |
| `apps/web/src/lib/scanPrivacy.authorization.test.ts` | 94 | new in candidate |
| `apps/web/src/lib/scanPrivacy.transport.test.ts` | 68 | byte-identical |

## Fresh-worker handoff

No assigned production path/blob version remains unread. **70 of the predecessor’s 79 candidate test files remain unread in this lane.** The JSON additionally enumerates **123 pending union test/support variants** across those paths and all net-transport/scan-source package test sources. These are lane-local pending statuses: root should reconcile another worker’s identical reviewed blobs before assigning more work.

Next useful bounded batch:

1. `apps/web/src/views/Scan.privateCheckpoint.test.tsx`, `apps/web/src/lib/scanClient.test.ts`, and `apps/web/src/lib/scanCursorSlot.test.ts` for real view/runtime composition of private recovery and cancellation.
2. Remaining `scanPrivacy` client/selection/bulk-evidence tests, scan spam/match tests, Scan automatic rescan/privacy/export integration tests, then browser net-transport and scan-source tests.
3. The rest of the inherited payment test handoff. PN-01–PN-05 and the custody-owned #300 WalletAttempts defect remain owned by their original lanes; do not duplicate them.

Test helper implementations imported by the read tests (such as fake manifests, mock RPC and InlineWorker) were not automatically counted as reviewed. This report does not infer coverage from imports, test names, or previous CI. Exact pending paths and versions are in `pending_tests`; candidate inherited paths are also listed in `remaining_initial_candidate_tests`.
