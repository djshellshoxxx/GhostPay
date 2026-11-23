# GhostPay R64 — test-first ledger provenance fix and untruncated export donor recovery

**Checked UTC:** 2026-11-23T12:13:36.365Z. Main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Existing draft PR #471 pre-publication HEAD: `81e11a109247badf09ab3fbd9241c5c710ee6f65`.

## Actual source/test engineering

- Test-first commit `650c8805282b0bf078e241831cb8c79051cd5b1a` adds two regression definitions covering finalized-live and finalized-retired proof erasure.
- Implementation commit `81e11a109247badf09ab3fbd9241c5c710ee6f65` changes the existing `scripts/consolidation/validate-ledger.mjs` transition validator.
- Confirmed existing defect: direct V8 execution of the OLD exact source accepted a previously finalized donor whose entire evidence object was removed, despite unchanged SHA, disposition and summary counts.
- Repair is append-only: earlier evidence must survive unchanged recursively, either in-place or explicitly archived in `evidence.history[]` when a new SHA requires a new top-level requalification proof. Additive documentation is allowed; erasing, mutating or replacing older proof is not.
- **30/30** test definitions passed direct V8 execution of the exact updated JavaScript and committed test source. The full R62→R63 immutable-ledger transition also passed. The new R63→R64 ledger transition passed with `total=574, finalized=317, unresolved=257, openPRs=263, stackedPRs=94, globalUnresolved=259`.
- The R63 exact-head workflow [45163491780](https://github.com/djshellshoxxx/GhostPay/actions/runs/45163491780) completed **successfully** at `7dd3b4e645dda6e201800d1edc73739dff5029bd`. The newer R64 commit has no accepted CI claim. Native Node checkout, application, TypeScript, browser, integration, security and payment suites were **not run locally**; runtime could not resolve github.com.

## Complete historical donor delta, no compare cap

Compared full recursive Git trees (both `truncated=false`):
- `codex/ghostpay-private-scan-lint-20261119` — immutable donor `1b010ec910d04df105fd662cc360629cb0a2f5dd`, **4,535** file blobs.
- `codex/ghostpay-export-authorization-20261119` — immutable donor `b0abb726c138ad1df2f03b7b102c9bd9de318887`, **4,539** file blobs.

Exactly **4,525 shared paths** carry identical blob SHAs. Exactly **14 paths** differ: **10** shared paths with different blobs, plus **4** files only in export-authorization. Eleven differing paths are application source or tests; the other three are historical audit/workflow metadata.

The differing executable paths are:
1. `apps/web/src/lib/networkAuthorization.ts` and `.test.ts`
2. `apps/web/src/lib/paymentKeyExport.ts`
3. `apps/web/src/lib/privateScanLifecycle.test.ts`
4. `apps/web/src/lib/scanClient.ts` and `.test.ts`
5. `apps/web/src/views/Scan.tsx` and `Scan.privateCheckpoint.test.tsx`
6. New `apps/web/src/lib/paymentExportRpc.ts` and `paymentExportRpc.test.ts`
7. New `apps/web/src/views/Scan.stealthExport.authorization.test.tsx`

The three non-executable differences are `docs/ai/ACTIVE_WORK.md`, `docs/privacy/network-egress-inventory.json`, and new `docs/handoffs/payment-export-authorization-20261119/QUALIFICATION.md`.

**Security-relevant unique functionality:** `paymentExportRpc.ts` blob `78a2122759db2b1245b74cd965c4c4f20b539a15`, its test blob `8aadf1028cfcc92e1eb42371f6dcbe17c2085719`. The wrapper allows only `eth_getCode` for a verified 20-byte address at `latest`; it obtains an address-scoped one-use `payment-key-export` permission for the original chain/endpoint and validates session/cancellation around async calls, then disposes the network authorization. The module does **not exist** at exact protected main `8ddb344973e80b8e1eda6821e970ee6a2b808b29` or C1 PR #504 head `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` (GitHub source-path 404 verified).

This is **not** sufficient to cherry-pick in isolation. It imports types and runtime policy from donor-specific `networkAuthorization.ts`, `paymentKeyExport.ts` and scan services, requiring full dependency and owner-claim resolution, regression tests, browser qualification and independent security review before a narrowly scoped integration. Both donors remain unresolved, not prematurely finalized. A matching source path or a high ahead count is not evidence of mainline integration.

## Ownership and integration

- Main `8ddb344973e80b8e1eda6821e970ee6a2b808b29` unchanged; no protected-main merge performed.
- The coordination integration lock file at `082e754f44944ebb4be283f89176b966bf8f7b4f` is generation 12, **released**. This is not permission to merge.
- Main branch protection returned HTTP **403**; no independent review on PR #471. The lock and branch-protection state remain explicit gates.
- Existing P0-A wallet recovery [#500](https://github.com/djshellshoxxx/GhostPay/pull/500), P0-B refund lifecycle (owner-held, trusted-chain absence proof pending), BUG-only [#508](https://github.com/djshellshoxxx/GhostPay/pull/508) and broad C1 [#504](https://github.com/djshellshoxxx/GhostPay/pull/504) were not edited.
- C1 #504 had two failed browser scenarios in full and lean suites at hosted CI 45151780276; no claim it is currently merge-qualified.
- New branch #508 is owner-held. The deleted Dependabot histories #207/#210 remain unresolved.
- No deployment, real-funds test, release, forced update or deletion.

The 59 formerly capped donor histories continue to require individually source-pinned tree/ancestry review. This checkpoint does not claim to have integrated remaining unique code.
