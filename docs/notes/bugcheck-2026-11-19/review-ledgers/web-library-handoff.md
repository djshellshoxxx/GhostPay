> Historical handoff, subsequently completed. Use ../source-coverage.json for final state.

# Fresh worker handoff — remaining web libraries

You are continuing a read-only GhostPay bugcheck audit. Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, and `docs/ai/HANDOFF.md` in the existing isolated checkout before work. Do not modify product files, switch shared checkouts, install shared packages, update refs, test on live chains, use funds, or build exploitation demonstrations. Root owns final repository notes. Use passive analysis and ordinary local fixture tests. Keep report evidence tied to exact commit/path/lines.

## Checkouts and evidence

- Main: `/workspace/scratch/72c433175c66/GhostPay-bugcheck`, pin `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Latest integration: `/workspace/scratch/72c433175c66/GhostPay-latest`, detached at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Privacy snapshot exists separately at `/workspace/scratch/72c433175c66/GhostPay-privacy`, pin `137628961463fc5abd8b7927b2efe6b18a0a206a`; privacy worker owns its variants unless root delegates.
- Full per-file JSON manifest: `/workspace/scratch/72c433175c66/web-library-audit.json`.
- Existing findings/dispositions: `/workspace/scratch/72c433175c66/web-library-findings.md`.
- Main `npm ci --offline --ignore-scripts` completed exit 0 under root. Root was building workspace dependencies; wait for readiness before running suites. No tests were run by this first worker.

## Exact remaining production source

Main:

1. `apps/web/src/lib/scanClient.ts`, all lines 1–751.
2. `apps/web/src/lib/scanPrivacy.ts`, lines **261–659**. Lines 1–260 were read, but feel free to reread for flow continuity. The attempted 261–490 tool output was truncated at context exhaustion, so it is not covered.
3. `apps/web/src/lib/sweep.ts`, all lines 1–746.

Latest integration: read the full new files and the full changed variant or entire diff after the main version is reviewed:

- `boundedRequest.ts`
- `frameGuard.ts`
- `invoiceSignerPins.ts`
- `invoiceVerification.ts`
- `networkAuthorization.ts`
- `networkOperation.ts`
- `networkSelection.ts`
- `paymentExportRpc.ts`
- `paymentKeyExport.ts`
- `privateScanLifecycle.ts`
- `privateScanStore.ts`
- `stealthExport.ts`
- `scanClient.ts`
- `scanPrivacy.ts`
- `sweep.ts`

All paths above are under `apps/web/src/lib`. `paymentKeyExport.testutil.ts` is a test helper, not counted production. Review adjacent tests for these modules to verify contracts and identify test gaps. Check existing `docs/reviews`, `docs/handoffs` and relevant research notes before reporting something as new.

The manifest contains exact line counts and blob IDs. Main has 58 production files: 55 completely read, one partially read and two unreviewed. Integration has 70: 55 covered by full main source plus complete modified diff (or identical Git blob), 15 remaining. Do not claim the whole audit complete until the remaining entries are actually reviewed. Keep per-file status accurate and persist it before context fills. Parent explicitly requested a fresh worker after context compaction; this handoff frees the first worker's slot.

## Context that may help finish the large modules

- Main `scanPrivacy.ts:1–260`: direct, tor-browser and local-proxy settings; endpoint validation; testnet-only indexer; `requireProxy + direct` blocks; local-proxy requires loopback; planning clamps getLogs range. `privatePathForbidsDirect` is true only for requireProxy plus local-proxy. Disclosure function starts at 248; the rest is unread.
- `scanCursorSlot` uses secret-derived HKDF slot v4, purges v1/v2/v3, caches derived slots only. Integration adds session guard plus expected public identity to prevent cached slots being used across locked/replaced keys.
- `scannerCore` keeps viewing scalar only; memoizes match work; cancellation wipes it; latest rejects unsupported schemes before work. `scanMatches` prioritizes router records and preserves distinct router announcements even for the same address. Review their integration with `scanClient` rather than redoing their full file reads.
- `scanSpam` bounds transfer estimates to eight requests / 10k logs and validates returned address/block. Main 30-day completeness bug is fixed latest and documented in findings.
- `pay.ts` + `payExec.ts` were fully reviewed. Built payments are bound through WeakMap to the exact review; final send rechecks expiry, buffers and wallet/session guards. Postbroadcast error paths retain the hash. Journals intentionally fail closed. Do not assume every retry block is a bug.
- Main/latest session and keyVault were reviewed. Latest session distinguishes backup-only retained keys from active authority, checks expiry at sensitive boundaries, tracks/wipes async copies, and atomically prepares replacements. The UI worker owns the AppShell idle-lock flow.
- Tags were fully read. The apparent asynchronous snapshot issue is guarded by AppShell synchronously locking the vault on session changes plus UI operation/session guards. No confirmed tag issue.
- In receipts, rejecting an invoice expired at receipt creation is an explicit tested/product rule, already discussed in prior documents.

## Reporting and testing

Write only concrete correctness/user-visible findings with prerequisite, impact, exact revision/path/line ranges, remediation direction and a benign local regression idea. Distinguish main affected/candidate fixed, current integration defects, and unresolved latest branches. Record no-tests-run unless you actually run and observe a test result. Root is separately reviewing newer amount-parser and simulation-response branches; don't duplicate those without coordination.

Read tool output in batches small enough to avoid truncation (usually under ~7000 tokens). Large i18n-use comment lines can be omitted from display because they are not behavior. If context runs low, persist exact remaining ranges and ask root for a fresh worker instead of declaring completion.
