> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay scan and custody test source review — wave 4

## Result

**All 34 assigned path-plus-blob rows are reviewed**, across 28 paths and the original 20 immutable heads. The review read 28 complete bodies (7,526 lines) and six complete deltas against those fully read bases. The target blobs total 11,201 lines. There are **zero pending and zero newly excluded rows** in this assignment. No new production finding was established.

The exact assignment is `scan_custody_tests_wave3_remaining.json`. Every original path, full blob, line count and head membership was preserved. Read-only Git tree metadata independently confirmed those memberships across all 20 inherited heads with zero mismatches; every target blob's line count was also checked. Root owns reconciliation to all 24 snapshots and the whole-audit completion claim.

This is defensive static source review. No project test, analyzer, benchmark, generated corpus, browser flow, network probe, exploit reproduction or payload construction was run. No repository source, tests, config, notes, Git state or remote data was changed. Test assertions establish intended behavior in source, not a passing runtime result. Searches, imports, inventories and clipped output do not count as full review; any clipped source interval was read again before its row was completed.

## Test evidence about existing findings

### SCAN-NET-02: same-tab session-only endpoint selection remains outside the reviewed regression path

The completed library scan tests supply primary and secondary RPC clients directly. The Scan UI tests seed endpoint settings in localStorage. In particular, the secondary success/refusal assertions in `apps/web/src/views/Scan.test.tsx` at blob `8b2fcf37b6c7670c20938018a3810265fd777152`, lines 285–316, cover a secondary that already exists in persisted settings. The complete newer delta does not add session-only selection.

The production privateScanStore UI branch is explicitly exercised by `apps/web/src/views/Scan.privateCheckpoint.test.tsx` at `a704ec91667f26d087cb732e273873a2b8514560`: its service fixture enables privateScanStore (lines 45–52), its setup writes a persisted primary URL (lines 64–69), and its settings-change case writes a replacement into localStorage and dispatches a StorageEvent (lines 185–207). No case saves same-tab session-only primary or secondary settings through the Settings UI and then enters private Scan. The aligned-window privacy tests likewise persist both endpoints directly.

Together with wave 3's settings/network source review, these completed assigned suites do not supply the missing integration regression for SCAN-NET-02. They support the distinction between endpoint use once selected and the selection boundary that loses ephemeral values. This is a test-coverage observation, not another vulnerability finding or a new reproduction.

Retain the parent-confirmed production scope and severity: Medium for loss of a requested independent secondary check when the primary remains usable; the missing-primary case fails visibly and closed. No forged payment or fund-loss conclusion is added. The authoritative production trace and affected-head list remain in `scan_network_wave2.json` and its report. Safe repair acceptance remains a current-revision in-memory snapshot that preserves session-only selections without persisting them, explicit refusal of an unavailable requested secondary, and cross-tab revision revocation.

### CUSTODY-02: receipt `issuedAt` is different from the timestamp fields already tested

`apps/web/src/lib/reconciliationVault.invoices.test.ts` at `c68a9d26ce94c836079a83dc2694929aa13e8ac9` creates archived receipts with ordinary `issuedAt = NOW + 120` values (lines 66–68). Its malformed decrypted-document cases (lines 366–388) and receipt archive cases (lines 402–443) cover several shape, signature, chain, count and provenance boundaries. They do not assert the positive-safe-integer-but-unrepresentable Date boundary for receipt `issuedAt`.

The same file tests canonical block timestamps at lines 391–399. `apps/web/src/lib/reconciliationLedger.test.ts` at `2d0157b553d8b05eb04dd457d9e698a39a3c6dc9`, lines 95–106, rejects invalid ledger recordedAt/blockTimestamp values, including the large recordedAt edge. Those are separate fields and do not resolve receipt date rendering. The earlier reconciliation UI review likewise used ordinary receipt dates.

Retain the existing bounded Low finding without duplication: authenticated same-seller/same-chain imported receipt data can reach a failing date formatter. The shared receipt ingress bound and resilient formatting remain the relevant repair and acceptance criteria. No reproduction or additional production scope was introduced.

### SCAN-NET-01: the latest thirty-day correction has direct regression source

`apps/web/src/lib/scanSpam.partial.test.ts` at `ceeba44eb5156581c4fa9c65b3104109306bff1e`, lines 10–37, explicitly asserts that ten days of scanned history is partial for a displayed thirty-day count, complete thirty-day history is not partial, a young chain need not precede genesis, and an unfinished scan remains partial. Its exact 12-head membership is retained in the JSON.

This closes the predecessor's pending test-source review for the existing correction. It is not an execution result. Keep the older/main-only finding distinct from the corrected latest branches.

## Other reviewed source boundaries

| Area | Source assertions and limits |
|---|---|
| IndexedDB adapters | Failed and blocked open recovery, late/stale callback handling, unexpected close recovery, selective InvalidState retry, quota commit refusal, and atomic prefix invalidation. In-memory IDB fakes are test fixtures; no browser storage was exercised. |
| Reconciliation ledger, matching and archives | Minimal verified-router records, strict seller/chain/recipient/shape/count checks, legacy read-only exports, explicit proposal confirmation, canonical time and expiry handling, historical provenance separation, encrypted storage, exact ciphertext CAS, reorg tombstones and saturation behavior. |
| Scan core and worker | Ownership checks, bounded malformed-wire corpus, deep-tag diagnostics, protocol errors, progress/cancellation, key wiping, memoized replay identity and import/network isolation assertions. Heavy corpus and timing files were read without execution. |
| Scan client | Router and public replay distinction, independent-provider disagreements, stable rollback and replay-tail anchors, durable invalidation ordering, finality replay, held cursors, backlog and warning bounds, fixed public request windows, cancellation, worker shutdown and key cleanup. |
| Private journal and lifecycle | Opaque encrypted slots, authenticated scope dimensions, authority downgrade on reload, malformed document refusal, exact CAS and tombstone ABA checks, reservation before scanning, tied key-vault/session identity guards, cross-tab invalidation and safe fixed errors. |
| Private checkpoint UI | Awaited durable page commits, old journal preservation on failure, explicit reset/reload, same-seller replacement rejection, profile/settings revision guards, cancellation during setup and commits, foreground automatic-check disarming, and retained incomplete-range warnings. |
| Scan UI and localization | Explicit scan/export actions, missing key/manifest/RPC/start checks, cross-chain/session cleanup, claimed-versus-verified distinctions, explicit receipt/ledger actions, reorg quarantine, aligned windows, private-path refusal/no fallback, foreground auto-check disclosure, and language changes without redispatch. |
| Payment exports initiated from Scan | Fresh action-bound network authority after cancelled or expired scan grants, offline public-record export, wrong-passphrase refusal, selection revision checks, explicit private/encrypted download, code-bearing destination refusal and export panel cleanup after key changes. |

The performance-observation source describes its synthetic in-memory RPC and CAS limits and does not use a wall-clock ratio as its acceptance gate. This review reports no performance measurements.

## Imported helpers and ownership

The newly encountered `apps/web/src/lib/paymentKeyExport.testutil.ts` has exact blob `6e3c2bb7232beeee5bc9aeee66dbbaa8e7c3dd0b` on all 11 importing heads. `custody_privacy_review.json` already records its complete 94-line source review. That coverage is inherited and is not counted again.

The shared apps/web test helper bodies (announcements, fakeManifest, mockRpc, render, fakeIndexedDb, inlineWorker, manifestChain and mockChain) are root-owned and have the predecessor's exact-blob closure disposition. ReconciliationMatch.testutil is included in this assignment and was fully read. Imported production key/session/receipt/chain/crypto modules retain their existing owner ledgers; imports confer no new source coverage. Locale catalogs remain root-owned. No paused Bitcoin, Solana, TRON or PIR server source was opened.

## Coverage and exact review ledger

| Measure | Count |
|---|---:|
| Assigned paths | 28 |
| Assigned path-plus-blob rows | 34 |
| Complete body reads | 28 |
| Complete delta reads | 6 |
| Complete-body source lines | 7,526 |
| Target-blob line sum, including variants | 11,201 |
| Pending rows | 0 |
| New exclusions | 0 |
| Original immutable heads independently checked | 20 |
| Identity or membership mismatches | 0 |

F means every line of the target body was read. D means the entire untruncated Git delta was read against the named fully read base; unchanged lines inherit that base. Target line totals include variants and are not executed-line or unique-semantic-line counts. Full original head SHA membership remains on every JSON row.

| Path | Full blob | Lines | Method | Head count |
|---|---|---:|---|---:|
| `apps/web/src/lib/idbStore.test.ts` | `ac35d25819dc2799b011b6e456d9fac05e1ab082` | 109 | F | 20 |
| `apps/web/src/lib/reconciliationLedger.test.ts` | `2d0157b553d8b05eb04dd457d9e698a39a3c6dc9` | 224 | F | 20 |
| `apps/web/src/lib/reconciliationMatch.test.ts` | `fcec62d5d4d2ff02e42b428a7e0a4b60c6c11933` | 215 | F | 20 |
| `apps/web/src/lib/reconciliationMatch.testutil.ts` | `e228abfe1c3b48b9d74c51899cd05c4a97f6af26` | 28 | F | 20 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `ada7cdbcd4f16163e15923f15f652dec0fcac7f6` | 129 | F | 9 |
| `apps/web/src/lib/reconciliationVault.invoices.test.ts` | `c68a9d26ce94c836079a83dc2694929aa13e8ac9` | 476 | F | 20 |
| `apps/web/src/lib/reconciliationVault.test.ts` | `a587e583e7ae8168a27fcdc7db414d614378290b` | 565 | F | 20 |
| `apps/web/src/lib/scanCheckpointPrivacy.test.ts` | `5a8984f59efedbad9c71eb2aea9e6379d3b55b63` | 137 | F | 20 |
| `apps/web/src/lib/scanClient.test.ts` | `c9f850561062eb011c0d97ca02d95898301fdd2b` | 1760 | F | 9 |
| `apps/web/src/lib/scanCursorSlot.test.ts` | `f83c257546972347ae3860d15c53c20388aeb7e6` | 312 | F | 9 |
| `apps/web/src/lib/scanMatches.test.ts` | `2973e6da0371537fa5198bc01998f83fc49bdd40` | 33 | F | 20 |
| `apps/web/src/lib/scanSpam.test.ts` | `762deed547d68f934999994d770369b2ee95c9ad` | 272 | F | 20 |
| `apps/web/src/lib/scannerCore.bench.nocov.test.ts` | `907f5f380fd846c46cd4737deb6aeae8878a2bc4` | 54 | F | 20 |
| `apps/web/src/lib/scannerCore.fuzz.test.ts` | `77ce0bd28772235418d9e241b0da84028068035f` | 38 | F | 20 |
| `apps/web/src/lib/scannerCore.spam.nocov.test.ts` | `671e4041953379c58270388eebb201fcec2dd541` | 194 | F | 20 |
| `apps/web/src/lib/scannerCore.test.ts` | `902cb6d07492fc8b08131d17b94d7d3fbc70c826` | 198 | F | 9 |
| `apps/web/src/views/Scan.autoRescan.test.tsx` | `1c52101fd63804fa5e80c540923d89a5606afc8e` | 157 | F | 20 |
| `apps/web/src/views/Scan.i18n.test.tsx` | `2892f973dcb48a6076eb38e768bd43082378becb` | 94 | F | 20 |
| `apps/web/src/views/Scan.privacy.test.tsx` | `5ca8631fb1f25658ae55e122d10e22027c0d5e51` | 92 | F | 9 |
| `apps/web/src/views/Scan.test.tsx` | `8b2fcf37b6c7670c20938018a3810265fd777152` | 696 | F | 9 |
| `apps/web/src/views/ScanPrivacy.i18n.test.tsx` | `bd5571c580d0fbfb882bf15d0e39c97e1ff60231` | 216 | F | 20 |
| `apps/web/src/lib/privateScanLifecycle.test.ts` | `8d8f2e22bdff1be59721a9ce1a7b8ad29eaeb4ad` | 190 | F | 11 |
| `apps/web/src/lib/privateScanPerformance.nocov.test.ts` | `548916051671c2645c584d5e459a583405db65cf` | 260 | F | 11 |
| `apps/web/src/lib/privateScanStore.test.ts` | `c39c51ef15e04127ea434ed6cbb98791c7eb851d` | 304 | F | 11 |
| `apps/web/src/lib/reconciliationVault.idb.test.ts` | `4c52b6fe0c7224ef4812ab6d31a07b401d721862` | 200 | D from `ada7cdbcd4f16163e15923f15f652dec0fcac7f6` | 11 |
| `apps/web/src/lib/scanClient.test.ts` | `297c6f0cbf22e8e351f42579c05dc4c79bdb6cc5` | 1995 | D from `c9f850561062eb011c0d97ca02d95898301fdd2b` | 11 |
| `apps/web/src/lib/scanCursorSlot.test.ts` | `3565f11dd4ef6cee70789fa26c9da22e4230a03d` | 404 | D from `f83c257546972347ae3860d15c53c20388aeb7e6` | 11 |
| `apps/web/src/lib/scanSpam.partial.test.ts` | `ceeba44eb5156581c4fa9c65b3104109306bff1e` | 37 | F | 12 |
| `apps/web/src/lib/scannerCore.test.ts` | `64d9d0d95a66da023f2968faa7bd97c7dbe66605` | 256 | D from `902cb6d07492fc8b08131d17b94d7d3fbc70c826` | 11 |
| `apps/web/src/views/Scan.privacy.test.tsx` | `146a90721ae039959af1ce4cd973c572394721f7` | 117 | D from `5ca8631fb1f25658ae55e122d10e22027c0d5e51` | 11 |
| `apps/web/src/views/Scan.privateCheckpoint.test.tsx` | `a704ec91667f26d087cb732e273873a2b8514560` | 440 | F | 11 |
| `apps/web/src/views/Scan.stealthExport.authorization.test.tsx` | `576a2c5ff4bc13b61181d554c7a59135070d1cb9` | 172 | F | 11 |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | `a386af69cb9c30910df93438cb8d589d16229980` | 124 | F | 11 |
| `apps/web/src/views/Scan.test.tsx` | `c25de17f75fcea631452b769aadede99a305f25f` | 703 | D from `8b2fcf37b6c7670c20938018a3810265fd777152` | 11 |

## Handoff

- Exact complete ledger: `/workspace/scratch/e1ba011306bd/scan_custody_tests_wave4.json`.
- This report: `/workspace/scratch/e1ba011306bd/scan_custody_tests_wave4.md`.
- Source assignment: `/workspace/scratch/e1ba011306bd/scan_custody_tests_wave3_remaining.json`.

No remaining-source manifest is needed for this assignment: all 34 inherited rows are complete. Root should merge the test-source dispositions and existing-finding interpretations, reconcile identical blobs into the expanded snapshot set, and retain separate ownership for global qualification and source boundaries.
