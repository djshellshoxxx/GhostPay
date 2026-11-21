# Dormant F04, F05 and F10 consolidation

## Outcome and source

This candidate consolidates three existing first implementation milestones on current main without enabling their application features. It preserves the original branches and their complete histories, repairs two concrete CI tooling failures and an inherited test-fixture CodeQL finding, and adds a source-level guard against accidental production imports.

The preserved donors are [F04 #322](https://github.com/djshellshoxxx/GhostPay/pull/322) at `066731b4d6d19d96469dd18fa082b264f3efed5d`, [F05 #323](https://github.com/djshellshoxxx/GhostPay/pull/323) at `ccd1b16dea7be84552f40d3bcd0f23b4224699d3`, and [F10 #324](https://github.com/djshellshoxxx/GhostPay/pull/324) at `4a48f2f09b1334036a6a88bab4e51f958cee46dd`. The initial composition preserved all 17 source/test blobs: five F04 files, six F05 files and six F10 files. The qualified follow-up preserves 16 of those files unchanged and intentionally corrects one F05 test fixture; all production module files retain identical Git modes, types and blob identities.

Initial composition preserved main `da6b05da5bb2e4293f38572da361980960d91911`. Source `751ca76d6b0b3a09b5712b01723b3c230978ef52` subsequently incorporates main `eb59d93cffed7848c4aac37d0e9650b87239c6da`, retaining the independently merged camera cancellation correction without conflict. Module files remain identical to their donors after that merge. All donor histories and both main inputs remain ancestors.

Follow-up `e210890e744540b070282bf768942174004f591d` changes only `apps/web/src/features/future/ghostproof/review.test.ts` outside documentation. It constructs the same unknown-root-field fixture explicitly and retains the original rejection assertions. The source and finding attribution, independent review and qualification boundaries are documented in [CODEQL_FOLLOWUP.md](CODEQL_FOLLOWUP.md).

## Preserved milestone boundaries

F04 supplies immutable merchant projections, exact amounts separated by chain and asset, canonical observation deduplication, explicit evidence binding and bounded local queries. Imported labels do not establish settlement. Real evidence-provider composition, encrypted persistence, dashboard UI, export consent, cross-tab recovery and device performance remain unfinished.

F05 supplies offline review of existing digest and signed receipt formats, separate assurance/trust/binding results and cancellable import sessions. It does not establish settlement, ownership, freshness, audience-bound proofs or zero-knowledge claims. Application session/UI integration, generation, export and actual provider acceptance remain unfinished.

F10 supplies strict staged plans, bounded due-period previews and single-use review of the earliest period. It does not issue or sign invoices, reserve funds, debit a wallet, store an outbox or send reminders. Durable reservation, cross-tab/crash recovery, authenticated artifacts, UI and browser acceptance remain unfinished.

All three modules remain disconnected from production routes. The 40-record module index preserves each donor's complete M1 status and all other 37 baseline records, top-level metadata and ordering. No feature is promoted to complete or release-approved by this consolidation.

## CI repair and dependency decision

F05 and F10's recorded CI failures came from two Node tooling assertions: the generated package map was stale, and the exact web dependency closure did not account for their new workspace edges. The combined source reproduced both failures before correction. Regenerating the map and explicitly recording the three affected packages in `WEB_PENDING_OWNER_REVIEW` resolves those discrepancies. The dependency analysis and remaining approval boundary are recorded in [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md).

The final guard at `5cc99b56c214134b27cb9279f79bbdeeb7efc239` inspects production JavaScript/TypeScript imports, including directory entry points, re-exports, dynamic/CommonJS imports, Vite root paths and loader suffixes, potentially activating globs and worker URL references. Its eight maintained cases and twelve cases including separate review probes passed. These are source-inspection results, not proof about emitted bundles. Full/lean artifact reachability is independently checked below. Browser and hosted qualification remain separate requirements.

## Observed validation and evidence

A clean offline `npm ci --ignore-scripts --no-audit --no-fund` and source library builds passed at `f324a7016b4d9697410326d22d89fd396dc44be2`. The three original module suites passed **212 tests**, with whole-web TypeScript and typed ESLint also passing at `5cc99b56c214134b27cb9279f79bbdeeb7efc239`. These results precede the camera merge and retain their exact source identities.

Independent structural review of `19be51424cb0009df5835171699a57a2b9fe19b6` against captured main `da6b05da` checked complete Git objects, registry preservation, module-index composition and all 671 external lock entries. No existing entry outside the expressly owned paths changed in that composition; external package entries and integrity data are unchanged. Independent defensive review approved the unchanged F04, F05 and F10 dormant milestones and their reused dependencies. The final isolation guard also received separate review after four reported gaps were corrected and the same negative controls passed.

Whole-web coverage passed at the camera-integrated source `751ca76d`: **3,027 tests passed, 13 skipped** across 206 passing and two skipped files. Coverage was 93.38% statements, 89.73% branches, 94.88% functions and 97.12% lines, satisfying the existing thresholds. The original separate no-coverage suite also passed all three files and all three tests. Local execution used Node 24.22.3; the hosted Node 22 and mandatory Anvil integration gates remain separately required.

The 13 existing skips comprise four policy Anvil cases, eight registry Anvil cases and one Bitcoin regtest case. The local environment lacks Anvil, the necessary contract artifacts and the default Solidity compiler; the Bitcoin regtest connection settings are unset. The conditional test sources and both test configurations are byte-identical to captured main. This result does not qualify the skipped integrations.

Both original full and lean TypeScript/Vite builds and bundle scanners passed at `751ca76d`. Their inventories contain 541 and 344 module entries respectively, with zero entries for the dormant modules or their three newly admitted workspace packages. An isolated checkout of main `eb59d93c`, using copied dependencies and identical-source built libraries, rebuilt both profiles: all 19 full artifact files and all 17 lean artifact files are byte-identical to the candidate, and normalized module inventories also match. This directly establishes unchanged emitted application bytes for the captured baseline.

The original repository-tooling selection ran 244 tests: 242 passed, two failed, none skipped. The failures were missing `cast` in the testnet fixture and inability to start `gpg-agent`; their complete failures remain in the evidence. The two dependency/map failures targeted by this change now pass. No assertion, gate, dependency version or skip was changed to hide the environment failures. Browser acceptance and exact-head hosted checks remain pending; prior donor workflow success is not substituted for this composition.

[EXECUTION.json](EXECUTION.json) indexes exact command, source, exit-status and log-digest receipts. [EVIDENCE.json.gz](EVIDENCE.json.gz) preserves the complete captured logs, review records and verification scripts with per-file byte counts and SHA-256 digests. Whole-diff whitespace checking reports 21 findings in eight original verification text logs, all byte-identical to donor objects. Those raw logs remain preserved; authored source whitespace passes. No deployment, release, main promotion or original-branch deletion is implied by this report.

## Shared integration ownership

The initial ownership claim recorded the then-visible generation-12 coordinator. A later refresh found corrective lock commit [`6edfcd4d`](https://github.com/djshellshoxxx/GhostPay/commit/6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79), which restores the prior generation-11 held record owned by `994a0d214fb9-root-r3`. Its message states that expiry-only acquisition was unsupported and prior-owner stop evidence was not established. This task has not changed that record. Main integration remains paused pending valid ownership reconciliation and qualification of the final candidate; expiration alone is not treated as release.

The isolated source publication preserves every complete local tree and ordered parent relationship. Authenticated API publication changes commit metadata, so [PUBLICATION.json](PUBLICATION.json) maps execution commits to their equivalent public commits. The original validated composition maps local source `751ca76d` to public source `5f90680e7a3ccc703d518268fd45124a3b466bed`, with identical tree `a2139c980bf1f6d83ce1233d2d512ba84e03f9df`. The map also records the later test-only follow-up. Fresh-fetch publication checks and current hosted results are reported on [PR #371](https://github.com/djshellshoxxx/GhostPay/pull/371); earlier execution receipts retain their original source identities.
