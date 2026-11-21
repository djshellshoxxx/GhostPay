# Recovery and privacy composition — source freeze handoff

This is a bounded implementation handoff for the existing consolidation ledger.
It is not a second live census or a claim that the entire beta is merge-qualified.
The application snapshot is `89c9b8035afa29fc291944a00a23667c12bd2ecc`.
The following evidence-only commit preserves its application tree. Final execution
receipts belong to the coordinator's authoritative ledger and may follow separately.

## Preserved sources and current main

- Preserved integration parent #367: `50ccf5c8b396247b524e5115ebe51575ca79d318`.
- Incoming recovery/privacy parent #361: `4ccb3db334de7d7cada305a11243c9e3efddc4f6`.
- Current main actually merged into this tree:
  `eb59d93cffed7848c4aac37d0e9650b87239c6da`, through merge
  `cf6b95bd6bc656975fc860ff333335a01e57cc90`.
- The first source-preserving composition merge is `b2cd6a30`.

The #367 SHA is recorded without abbreviation in `SOURCE_PROVENANCE.json`, which
is the machine-readable source authority for every compared path. The current-main
merge restores all 39 census handoff files absent from #367 and preserves all 773
current-main ownership lines in order. That merge changes documentation only;
camera source is byte-identical to current main. `MAIN_PRESERVATION.json` records
the exact blobs and merge parents.

The scope expanded beyond the initially planned selective Spec 18 transplant
because #367 lacked the consent-scoped network authorization and Services API on
which the newer recovery implementation depends. Both existing feature histories
were preserved. The 17 manual conflict paths and their individual decisions are
recorded in `MANUAL_RESOLUTIONS.json`.

## Recovered behavior and corrections

The composition brings in existing independent payment-key export and recovery,
including encrypted payment-key files, master recovery, explicit raw-key export,
credential reauthentication, cancellation and expiry guards, exact saved-file
verification, and an offline decoder that does not import GhostPay packages.
The application-to-standalone interoperability test uses a real application export,
clears the originating session, and independently checks recovered signing authority.
No real-funds transaction was performed.

The existing F03 signed request-file interchange remains intact. Against #367,
`SellerKeys.tsx` adds only the two recovery-panel imports and mounts; its existing
durable-write ownership, unlock preflight, backup-operation cancellation and
sole-copy idle-recovery safeguards remain intact. Current fee/completeness,
wallet receipt validation and camera fixes were retained.

Additional bounded recoveries are explicit, not inferred from ahead commits:

| Recovery | Original source | Adopted scope |
| --- | --- | --- |
| #349 strict Sweep journals | `3433f7f098b5e61253a102a087dfb7e780dbb730` | Exact parser and duplicate-key regression blobs, recovered through `20515343` / `0941e237` |
| #328 rekey lock revocation | `81598d93dd82cc440526c866d42b55be0657895b` | Exact `vault.ts` guard and `vault.rekey-lock.test.ts`, source commits `f7bc60a1` and `68c77b7f`, recovered as `823f75b5` and `d0d147fd` |
| #339 / #347 / #341 hygiene evidence and ledger | `0e19ccc7d52b0d160fb756089e6a843a1d2831d7` | Six exact source/test blobs, recovered at `bd024ca0` |
| #353 / #356 partial Settings import regression | `82ab06f1bb6fc4b9df2b4ac87679a4029987a284` | Exact two-case donor test; the composed Settings implementation is corrected at `89c9b803`, with two additional retention/authority regressions |
| #244 optional Bitcoin provider consent | `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f` | Only source-change revocation of optional provider checks and the unchanged endpoint-edit regression body; the current disclosed mandatory light-scan checks are preserved |

The shared address-book vault guard prevents an asynchronous password replacement
from restoring authority after lock. Durable re-encryption may finish; access still
requires a fresh unlock. This does not assert a demonstrated current Pages exploit.

The hygiene recovery binds log evidence to the requested emitter and range, counts
one canonical event once, discards contradictory duplicates, and enables the local
destination ledger on the browser's supported EVM testnets. The narrower RPC-helper
allowlist stays unchanged. Provider evidence is not independent chain finality.

Executable and independent review found five defects in the composed source, now corrected:

1. The recovered relayer wire test imported a function from excluded server code.
   `1a864b61` instead exercises the actual retained HTTP server and asserts the
   padded refusal plus exactly one unpadded compatibility retry.
2. The browser trusted `client_queue_full` as a pre-broadcast refusal although its
   emitting server implementation was excluded. `1b24404f` removes that unsupported
   authority and tests that an unknown response preserves signing uncertainty.
3. `PRIVACY-BULK-EMPTY`: a public router announcement without a transaction hash
   caused individual RPC reads only when it matched the viewer, despite bulk mode.
   The isolated synthetic reproduction observed 5 calls for an unmatched viewer and
   7 for a matched viewer. `26dac00e` supplies explicit empty batches for both
   providers. Missing evidence remains claimed/unverified, with no live-read fallback.
   New primary-only and dual-provider regressions failed before and passed after.
4. The saved-settings effect reset every form field after a partial import. The
   exact existing #356 tests independently failed twice on `b85e8160`. `89c9b803`
   compares saved values field by field, preserves unrelated unsaved drafts and
   session-only endpoint choices, and retains explicit selected-section import
   application. Every saved-settings change still aborts and invalidates pending
   RPC tests, including privacy-only changes.
5. Bitcoin source edits retained optional per-output provider consent from the
   old endpoint. The exact #244 endpoint-edit case failed before correction.
   `89c9b803` revokes that optional choice on source changes. Current mandatory
   light-scan disclosure and checks remain intact; the donor's superseded separate
   light-mode checkbox model is not adopted.

The author executed the five Settings/Bitcoin regression cases before correction:
all five failed at `17811c4d`; all five passed at `89c9b803`. A fresh independent
reviewer then passed 109 existing and recovered boundary tests on the unchanged
corrected head. Synthetic fixtures made no request to a real provider.

The bulk fix is specifically an empty-target boundary repair. The existing capped
selection still always includes matched claims and randomly fills the remaining
budget; it does not promise unconditional traffic indistinguishability when the
public router transactions exceed the cap.

The donor's optional-address CLI receipt fixture correction is also recovered
exactly. It changes three fixture constructions, preserves all assertions and
imports no CLI runtime behavior.

## Explicit domain boundaries

The source snapshot changes 1,905 paths against #367: 1,404 documentation paths,
313 browser runtime/test/asset paths, 87 shared-package paths, 69 package/lockfiles,
28 tooling/asset paths, three workflows and one CLI compatibility test. The exact
classification and blobs are in `SOURCE_PROVENANCE.json`.

`EXCLUDED_NONPAGES.json` records **66 exact retained-parent exclusions and one
explicit test-only exception**. There is no application Solidity, relayer runtime
or CLI runtime delta against #367. Existing non-Pages runtime, contract, deployment,
analyzer and automation changes remain on their original source branches. Donor
ancestry must not be classified as adoption of those excluded implementations.
Compatible newer package versions are retained; a fresh lockfile installation was
used. No test timeout, assertion or coverage threshold was weakened.

The three retained workflow deltas add recovery-test discovery, verify cached
Solidity compiler integrity, and attest Pages artifact checksums before an already
gated manual publication. `UPSTREAM_SOLC.json` records the exact cache checksum
against the live official solc-bin manifest. No compiler binary was installed or
executed by that lookup. No publishing workflow, deployment or release was invoked.

## Execution and independent review at source freeze

Results are source-specific and must not be summed as distinct tests across
overlapping selections. Complete command lines and source hashes are retained in
the review receipts and the worker's execution logs.

| Executed check | Actual result and source |
| --- | --- |
| Fresh lockfile install and all-library build | Passed at the original composition; changed vault and hygiene packages rebuilt at `bd024ca0` |
| Payment, backup, session, F03 and merge-boundary selection | 16 files / 243 tests passed at `e5fc1f81` |
| Standalone independent recovery decoder | 22 passed, zero failed/skipped at `e5fc1f81` |
| Journal, wallet and actual relayer contract | 6 files / 170 tests passed at `1b24404f` after correcting the recorded failure |
| Independent recovery review | 451 tests passed across four groups; source-specific scope in `reviews/recovery-REVIEW.json` |
| Independent privacy correction review | 216 tests passed on exact `856044b1`; original failing reproduction retained; scope in `reviews/privacy-REVIEW.json` |
| Independent adopted hygiene and vault regression | 20 tests passed, zero skipped, exact `bd024ca0`; coordinator retains residual-review receipts |
| Full hygiene coverage with original thresholds | 7 files / 161 tests passed, zero skipped, `b85e8160`; 99.52% statements / 99.12% branches / 100% functions / 100% lines; the corrected application head leaves package source unchanged |
| Full vault coverage with original thresholds | 11 files / 354 tests passed, zero skipped, `b85e8160`; 97% statements / 94.24% branches / 99.5% functions / 98.89% lines; the corrected application head leaves package source unchanged |
| Full web coverage with original thresholds | 316 files passed / 2 skipped; 4,400 tests passed / 13 skipped, zero failed, `b85e8160`, exit 0; 93.51% statements / 90.41% branches / 95.57% functions / 97.28% lines; the final Settings/Bitcoin correction still requires its aggregate hosted gate |
| Independent final Settings/Bitcoin boundary qualification | 15 files / 109 tests passed, zero skipped, exact `89c9b803` before and after; final review receipt covers the 65 remaining assigned paths |
| Local repaired scan suite | 2 files / 109 tests passed; both new cases failed before correction |
| CLI optional-address compatibility | 19 tests and CLI typecheck passed at the repaired source |
| Web typecheck and original web ESLint | Original complete ESLint passed earlier; final web typecheck and typed ESLint of all five changed Settings/Bitcoin files passed at `89c9b803`; changed vault/hygiene packages also passed their original typecheck/lint |
| Whole-workspace ESLint | 67 workspace invocations passed at `1b24404f`, with one generated-file warning |
| Whole-workspace typecheck | 68 invocations; failed on three CLI fixture errors, subsequently corrected; final rerun pending |
| Full web build and bundle scan | Passed on exact `89c9b803` before and after, 19 scanned files; chunk-size, ineffective-dynamic-import and broad local connect-src notices remain recorded |
| Lean Pages build/site/checksum verification | Passed at `1b24404f`, 16 files, demo with payments disabled |
| Static profile/artifact/workflow/network-inventory guards | 79 tests passed at `1b24404f` |
| Production dependency tree, dependency audit and secret scan | Passed with unchanged dependency inputs; audit reported zero vulnerabilities |
| Locale and chain-matrix validation | Zero locale errors, 1,138 translation/length warnings; 14 chains / 9 tokens / 4 feeds |
| Native browser launch | Chromium blocked by required Unix-socket EPERM; pinned Firefox/WebKit binaries unavailable; no browser/mobile/Tor journey counted as passed |

**The initial full web coverage run failed and is not qualification evidence.**
During repair-worktree isolation an unexpected real cache directory made a guard
fail, but a subsequent install was nevertheless started. npm cleaned contents
through the still-shared dependency symlink before replacing it. The baseline run
then reported missing worker modules and a missing coverage-report asset. The log
records 56 completed files, 1,937 passing cases, eight skips and 261 worker errors;
the aggregate run failed. The original exact-lock install was restored, all repair
dependency/build reuse links were removed or materialized, and the repair now has
an independent fresh installation. Subsequent guarded orchestration stops on a
failed prerequisite. The failed run and setup logs remain preserved. Final complete
coverage was restarted on the isolated, frozen `b85e8160` source and passed with
4,400 passing cases and 13 explicit skips in 928.19 seconds. That earlier snapshot
does not include the final Settings/Bitcoin correction; the corrected source still
requires its aggregate hosted gate. No completed-subset or earlier-parent result
substitutes for it. The separate noncoverage performance/fuzz pass is also pending
at this receipt update.

The two initial scoped reviews left 65 explicitly enumerated runtime/tool paths
outside their coverage. A fresh independent reviewer inspected those paths and
the later hygiene/vault boundaries, found the two final defects above, reviewed
their corrections and executed 398 cases at `b85e8160` plus 109 boundary cases
at `89c9b803` independently. Those 507 executions are not asserted to be distinct.
No confirmed
finding remains unresolved within that assigned scope. The exact path-level
review limits remain in its receipt; this handoff grants no merge-wide approval.
Native-engine CI is a separately owned coordinator change and is not folded into
this application snapshot. The separate policy asset-coverage recovery is also
outside this worker's owned source.

## Publication and continuation

Root owns publication to a newly owned child branch, using the exact final tree
and recording local-to-remote commit mapping if GitHub object APIs reconstruct the
commit. Original parents and source branches remain preserved. Shared refs and the
integration lease were not changed by this worker. Root must finish aggregate
checks and independent review, reconcile lock ownership and live PR dependencies,
then use the existing required merge gates. No real-funds operation, release or
deployment occurred.
