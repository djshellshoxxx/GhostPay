> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay payment/tests static audit — wave 4

## Outcome and scope

Completed all **60 assigned path/blob versions across 51 source paths**, representing **13,509 target-version lines**. The review read **51 immutable blob bodies fully** and **nine complete variant diffs** against fully read baselines at the same path. There are **zero pending rows** and **no new production findings** from this bounded test/source-reference lane.

This is the exact pending set inherited from `payment_tests_wave3.json`. It completes the remaining 60 rows after that predecessor's 89 reviewed rows. It does not independently claim completion of other repository lanes or expanded branch coverage. Every original path, blob, reference list, line count and source inventory index is preserved in `payment_tests_wave4.json`.

The original 20-head membership was independently reconciled using `git ls-tree -r` against all 20 immutable selected commits. Every assigned path/blob membership matched, with no duplicate path/blob rows. Root owns the expanded 24-head reconciliation and the separately added `Common.clipboardPrivacy.test.tsx` blob. That additional body was not read or claimed here.

## Method and limitations

This was a static source review. Large bodies were read in contiguous, untruncated numbered ranges. Coverage was credited only after a complete body, or a complete same-path diff from a fully read baseline, had been inspected. Searches and inventories received no source-review credit. Target-version line counts include each assigned variant's full line count; they are not the number of unique lines displayed.

No project tests, analyzers, application code, Solidity compilation, local chains, browser flows, fuzzers, payloads, network probes or transactions were executed. The Anvil-related TypeScript test and reference Solidity wallet were read as text only. No source, test, configuration, repository notes, Git refs or remote content were modified. The only written files are this report and its companion coverage JSON outside the repository.

Existing assertions described below are evidence of authored test coverage. They are **not evidence of successful execution**, and this review makes no passing-test claim.

## Coverage by area

| Area | Path/blob versions | Target-version lines |
| --- | ---: | ---: |
| Broad payment and Sweep tests | 5 | 4,908 |
| Policy and registry tests | 12 | 2,361 |
| Camera importer tests | 6 | 1,270 |
| Receipt panel and codec tests | 8 | 963 |
| Invoice creation tests | 8 | 1,284 |
| Invoice, merchant, pairing, and format helpers | 10 | 1,240 |
| Shared and merchant component tests | 11 | 1,483 |
| **Total** | **60** | **13,509** |

The payment and Sweep tests cover persisted attempts, duplicate guards, wallet handoff and receipt-status transitions, replacement hashes, nonce/expiry ordering, session locks, native sends, OP Stack fee accounting and storage failures. The Policy and Registry suites cover ownership of asynchronous operations, session changes, network consent revocation, deployment checks, exports and stale input handling. These statements describe the test bodies inspected; they do not certify the corresponding production behaviors.

The camera suites cover consent, late media acquisition, visibility and lifecycle cancellation, multipart reconstruction and bounded imports. Receipt suites cover invoice/scan matching, signature and status handling, independent open/sign consent, archive scope, address privacy and localization. Invoice creation tests cover superseded operations, session replacement, branch-specific encryption defaults, buffers, backup confirmation, supported build constraints and registration consent. Merchant, identity and shared components cover pin and profile boundaries, parsing, exact amount handling, clipboard choices, disclosure ownership, error containment and accessibility behavior.

## Findings context and coverage refinements

### PT4-O1 — Existing Policy route recovery regression evidence supports the PS2-01 correction

`apps/web/src/features/policy/PolicyView.guard.test.tsx`, blob `9ccdadb0fd50fed4112e5abc399c0598ba26f93d`, lines **238–252**, contains a mounted Policy route sequence that sends, clears the recorded attempt through the journal UI, reviews again and expects a second wallet send. Lines **300–330** additionally cover the explicit clearing required after an unknown ERC-20 outcome and the separate approval/payment records.

This supplements the already known Pay route clear/retry regression in the predecessor report. The final audit should **not state that PS2-01 has no route recovery test**. The production missing-wallet-property finding is a separate source conclusion, and these unexecuted test bodies do not establish that affected privacy heads pass their assertions.

### PT4-O2 — PS2-04 remains qualified as an inactive Policy path; the assigned tests do not cover edits during the pending send

All assigned PolicyView suites have now been read. They exercise key/session changes, queued Web Locks, deployment verification, duplicate recovery and network capability revocation. The pending-network case in `apps/web/src/features/policy/PolicyView.network.test.tsx`, blob `bfcf526291cc81f624b97441cfc186997fa485ed`, lines **109–142**, revokes the network capability while a wallet recheck is suspended. It does not edit the payment terms during that interval.

No assigned mounted PolicyView case changes the transaction terms while the send handler is awaiting. This is a bounded test gap supporting the prior PS2-04 analysis, not a new production issue.

The latent/inactive qualification should remain explicit. `apps/web/src/features/policy/PolicyView.more.test.tsx`, blob `2d5df14501a00e9842d2aa055cf7b08e67209693`, lines **57–68**, restores the real verifier and expects an unpinned deployment to be refused. `apps/web/src/features/policy/policy.logic.test.ts`, blob `c9084fa2048ee270916a72e288a9800e7f1254fc`, lines **56–58**, asserts the checked-in pinned deployment set is empty.

### PT4-O3 — Receipt assertions do not validate the global print cascade in PS2-02

All eight assigned ReceiptPanel and receipt-codec variants are covered. Their assertions examine identity/signature/status rules, archive access, invoice or scan agreement, explicit local opening/signing consent, address privacy and localization. They do not exercise combined application print CSS or inspect rendered print output.

Consequently, these tests do not resolve the prior PS2-02 global `!important` print-rule finding. The Arabic PrintableBill localization case in `apps/web/src/components/SharedComponents.i18n.test.tsx`, blob `a48fbe04da171154ba009ce11132e30ffbcaf80f`, lines **135–147**, also inspects textual and direction attributes in the DOM; it does not test the combined print cascade. This is a coverage clarification, without a new finding or runtime claim.

### PT4-O4 — Common clipboard test variants are fully accounted for

All three assigned `apps/web/src/components/Common.test.tsx` blobs were covered. The fully read `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` variant contains the optional clipboard-clear assertion at lines **52–71**. A complete diff covered the equivalent `67a93df29f2df39dbe2f4489959e5e68835e7457` variant, and a separate complete diff covered the older `af9c2a77b7d1232b50f8861dd0793c2c0eebc240` variant without that added assertion. The latest separate clipboard privacy suite remains root-owned and is excluded here.

## Complete variant-diff ledger

Each baseline below was fully read by this worker. Every difference was inspected without truncation; there are no chained unread baselines.

| Source path | Covered variant blob | Fully read baseline blob |
| --- | --- | --- |
| `apps/web/src/lib/sweep.test.ts` | `f38c5b90985f705a8d4cfac87a897cd6ee394d1b` | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` |
| `apps/web/src/views/Sweep.test.tsx` | `17049ca012bd5bab662dd450668c64b11e7700dd` | `2be1f668375db2c95f6d184514350bc0913b8685` |
| `apps/web/src/components/ReceiptPanel.test.tsx` | `1ba3f5cce99b7a13d2b6cb21d728bf152d283353` | `8f14ca64dfef6668c59d280597dd252adf849bb0` |
| `apps/web/src/lib/receipts.test.ts` | `70e1c9aed859596389f5b43b93e0d6ff26f58bec` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` |
| `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` |
| `apps/web/src/lib/merchantIdentity.test.ts` | `c26773145f2fdc22ff05871157c34b7021a644f4` | `957027808890f366f337c375e52b5c081206dae7` |
| `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | `43d5b5c882abdfb392776dd13d772e972f13ab46` |
| `apps/web/src/components/Common.test.tsx` | `67a93df29f2df39dbe2f4489959e5e68835e7457` | `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` |
| `apps/web/src/components/Common.test.tsx` | `af9c2a77b7d1232b50f8861dd0793c2c0eebc240` | `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` |

The companion JSON is the authoritative per-version manifest, including original 20-head membership, inherited inventory indices, methods, line counts and final reviewed status for all 60 rows.

## Repository and handoff state

The final read-only metadata check observed checkout HEAD `3b7c60d3d67eed0f038108d60f362f5dbef33e39`. Source inspection used the immutable blobs in the assignment, independent of that checkout. `git status --short` listed only the untracked audit continuation note and audit lanes directory already present in the shared workspace; this worker did not touch them.

Root can merge the 60 completed rows with the predecessor's reviewed coverage and perform its expanded-head reconciliation. No successor is required for this assignment. No source finding was added, removed or dynamically reproduced in this wave; the observations above refine the existing audit's test-coverage wording.
