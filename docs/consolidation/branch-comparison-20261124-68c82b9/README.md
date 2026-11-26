# GhostPay branch comparison and first qualified composition

## Snapshot and method

This is a pre-qualification, source-pinned record. It does not assert a main merge or hosted success for the new composition. Subsequent observed CI and merge status belong in the associated pull request.

- Repository: `djshellshoxxx/GhostPay`.
- Baseline main: `706188000c38b3dde5a3a362370a530870aa7587`.
- Frozen source composition: `9d8edf06da09dcb287a14b2aad26c439e9d7b7a5`, tree `608beb60c6aa2e1d764e430befde33630d60c061`.
- Census: 686 real remote branch refs. The symbolic `origin/HEAD` alias was excluded.
- Open-PR membership search: 346 distinct PRs in four creation-date pages (100, 100, 100, 46).

Every branch has a pinned head, all merge bases, uncapped ahead/behind counts where a merge base exists, and every merge-base-to-head changed path with file modes and source blobs. Each changed non-documentation entry is compared to the current-main blob. Candidate containment is proved by ancestry, not inferred from names. No source branch was deleted or rewritten.

The first mechanical partition is 206 heads included in main by ancestry, 7 whose changed non-documentation entries exactly match main, 86 documentation/coordination-only histories, 174 histories retained in selected pending integration heads, 212 further source-difference rows, and main itself. These are source dispositions, not feature-completion percentages.

`HISTORICAL_DISPOSITIONS.json` supplies an action and source/owner evidence for all 212 further rows. Its groups are 163 active owner/qualification obligations; 19 retained source/evidence cases; 13 stable-main semantic supersessions; 11 separate tooling/evidence/deployment cases; 5 explicit historical or unmapped source obligations; and one known reverted change. Open qualification obligations are retained explicitly rather than called redundant.

## First composition

The following original heads remain ancestors. The source composition adds 124 previously non-ancestral remote heads to the main lineage; this is a branch-history count, not a feature count.

| Input | Exact donor head | Preserved work |
|---|---|---|
| C1 #504 | `1a7447d58c08363209b6b9b67e9a6afad07d87f3` | Existing reviewed 93-PR fix consolidation and its later C1 repairs |
| #594 | `7d6d48eff443b604f384835c207adcfbe014b624` | Canonical-locale duplicate rejection |
| #568 | `c9ebbdd41368f65cab27c909a146dc7d0960553d` | Rounded fiat-output magnitude bound |
| #574 | `96d20f778e3f92fa26144c9f97525eae4b3290a1` | Invalid countdown guard and exact rollover coverage |
| #576 | `4ae333d3ffa85eb14c074a543bdc084370dd1e49` | POS state, clock, UI, parity and browser completion |
| Merchant-ledger completion | `78193fca9477c297a62937e4cdd032fdb15772c4` | #522/#555 nonadjacent duplicate invoice-ID rejection |
| #268 | `ddfc8cfafa44b09103ced821f160c1d37fdfe552` | Merchant-profile clock validation |
| #289 | `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` | Runtime base64url input guard; exact known successor fixture correction retained |
| #274 through #515 | `f2b262c2afe5d51c258e466d9be1d22798817135` | Monotonic expiry and independent boundary tests |
| #601 | `02d9b7149ad715a7c2c9229f5297f0aa0834c415` | Fee timing guards and complete payment-asset identity checks |
| #276 through #277 | `8cbae85c95fa707210704ee72bb4416b36e5a4d7` | Separate local Pages artifact integrity verifier and existing tests |

Production files merged automatically. Work-ownership conflicts were resolved by a three-way union, with both parents' nonblank line multiplicities checked. Raw historical logs retain their original bytes and whitespace. The only manual test correction removes the unused base64url fixture parameter, exactly matching successor blob `8d959c2b144182d0d0f576214dc7b761b7166c47` from `31c34319aeaa9dbc211b8ccc6bdf65fc3e755ea2`.

## Independent composition review

A separate read-only reviewer approved the frozen composition after checking every changed product/test/tool path. All 233 such paths are attributable to the inputs. All eleven donors and main are ancestors. Of C1's 214 product delta paths, 208 are exact; four retain the newer POS files, one retains the stronger fee preview, and the remaining formatting test is an additive union. No donor assertion was removed. All 14 files from main's recent package and schedule fixes remain exact, as do all nine raw C1 evidence logs. Every nonblank ownership line and its multiplicity from the twelve inputs remains present.

There are no changes to dependency manifests or lockfiles, Solidity contracts, workflows, deployment configuration, or infrastructure. The artifact verifier is a separate local tool; its addition does not claim a new automatic deployment gate.

## Qualification boundary

C1's original published head has six successful hosted workflow groups, including all 24 CI jobs. Those results qualify that original head only. The new combination requires its own build, affected tests, typecheck/lint, native browser checks and exact-head hosted CI. Source-review approval is not an execution result. The current task does not authorize deployment or activate proposed privacy mechanisms.

The final acceptance set includes all changed library behavior, POS reducer/example parity, real POS browser controls, formatter and scheduler boundaries, final payment expiry guards, and the existing Pages script tests. Original thresholds and assertions remain in place.

## Remaining source obligations

The report preserves rather than merges broad mixed-scope recovery, wallet journal, privacy, native/browser qualification and future-module branches. Their exact successor chains are recorded. Of particular note, the refund-lifecycle/settlement-policy source at `85cc394451313e24104ef7089379e720b4e70526` still needs trusted observation/finality and owner reconciliation. The old QR primitive-test donor retains a stateful regression obligation despite an overly broad prior supersession label. These are not represented as completed features.

## Evidence files

- `BRANCH_INDEX.tsv`: readable per-branch index.
- `BRANCH_COMPARISON.json.gz`: complete uncapped source comparison, compressed without discarding rows or paths.
- `BRANCH_COMPARISON.sha256`: SHA-256 of the uncompressed JSON.
- `HISTORICAL_DISPOSITIONS.json`: all 212 semantic/action overlays, with exact relationship targets.
- `OPEN_PR_SEARCH.json`: complete open-PR search membership at the capture.
- `PRESERVED_HEADS.json`: original remote heads incorporated by this composition.

To inspect the full JSON, use `gzip -dc BRANCH_COMPARISON.json.gz`. Its decompressed bytes match the recorded checksum. All evidence describes its stated source pins; future branch movement requires a new comparison.
