> Historical accounting snapshot. The residual work and metadata corrections recorded below were subsequently resolved; see [validation.md](validation.md) and the final coverage ledgers.

# GhostPay original-scope accounting validation

## Result

The immutable scope and recorded identities are consistent. The reports available at **2026-11-20 06:53:04 UTC** claim complete coverage for **396/396 production/resource versions** and **509/535 test versions**. Exactly **26 test versions / 3,053 lines remain unreviewed** at that snapshot. They must remain pending until a completed successor report arrives.

There is a separate provenance repair before an unqualified completion claim: **37 deduplicated root path/blob pairs / 5,605 lines** have only the initial generic “full source read, or full counterpart…” method, without a separate unambiguous direct-read record or named counterpart chain. Root has elected to refresh-read these. The exact immutable assignment is in `audit-root-provenance-residual.json`.

This is an accounting review, not an independent reread of the approximately 210,000 source lines. I checked manifests, review attestations, immutable identities, line counts, complete-range declarations, selected diff bookkeeping, and canonical source links. I did not run target code, tests, builds, installers, servers, probes, transactions, or Git mutations, and did not edit source or test files.

## Frozen boundary and counts

The review validates the original 28-ref union, with main `c977b5d6723f6822c3b5d86cd6b231712c53c395` and candidate `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. It does not certify the later final-cut extension being handled separately by root. The JSON report records report hashes and the exact accounting snapshot.

| Category | Scoped path/blob versions | Version-lines | Claimed complete in available reports |
|---|---:|---:|---:|
| Production | 389 | 89,481 | 389 |
| Supporting resources | 7 | 10,303 | 7 |
| Tests/support | 535 | 110,958 | 509 |
| Combined, deduplicated | 930 | 210,696 | 904 |

The source and test scopes overlap at one 46-line pair: `packages/contracts/test/utils/ERC5564Announcer.sol`, blob `d862ca8a8b63d0bf898f5df829b38a83dbcf4493`. Category totals may be shown separately; a combined unique total must subtract this pair. The 931 category-membership sum is not 931 distinct reviewed objects.

The manifests contain no duplicate path/blob keys and no included/excluded overlap. Their selected-path union has no missing or extra blob variant across the 28 frozen trees. This validates finite extraction for the selected paths; it does not establish that every possible repository path belongs in this limited scope.

## Immutable validation performed

- All **18,208 distinct scope SHA:path queries** resolved to the recorded blobs. All actual ref names in listed memberships resolved correctly.
- **951 distinct immutable scope/exclusion/closure blobs** had matching recorded line counts, and their recomputed Git blob SHA-1 identities matched.
- The report validation checked **970 representative SHA:path queries** and **953 distinct report blob line counts** with no mismatch. Every accepted direct row's numeric ranges cover its whole recorded file without gaps or out-of-bounds lines.
- No malformed JSON or duplicate JSON object key was identified in the reports examined.
- The report ingestion yields 946 accepted records and 927 distinct path/blob pairs, including 23 supplemental pairs outside the selected source/test scope. Nineteen duplicate attestations do not increase coverage.
- The conservative closure contains 270 candidate files and 899 edges. Its twelve files outside source scope exactly match the twelve explicit exclusions. The closure itself warns about overinclusion, profile guards, and absent emitted-chunk evidence.

**Static closure cannot prove emitted bundle contents.** No actual bundle was generated or inspected by this validation.

## Full-baseline and diff accounting

All 20 main/base credits in `review-core-packages.json` have changed-range records that exactly match the complete immutable zero-context Git diff, including added and deleted sides. The candidate full-read rows are present. Explicit counterpart hashes in the general report scan all resolve to an already credited row; that existence check does not by itself prove the historical read order or replace the root provenance repair.

The four English-resource versions have legitimate composed coverage:

| English blob | Total lines | Basis |
|---|---:|---|
| `f37853282e922f1817b948d5bada66dc84c3ad34` | 2,530 | Root's 322 explicitly partial lines plus the successor's 2,208 disjoint remaining lines |
| `cc7464eac7f565bff3f08849e82b0533c176cd09` | 2,262 | 2,245 unchanged target lines plus 17 changed target lines; the complete diff also covers 285 changed/deleted base lines |
| `b35b0ee93bca647a80ddd12d1a49dee86845409b` | 2,549 | 2,528 unchanged target lines plus 21 changed target lines; 2 changed base lines |
| `a8e46fafce5cacc633239ef044ce1c91ed766870` | 2,513 | All target lines inherited by equality; the complete diff deletes 17 base lines |

The root partial ranges exactly match the English worker's inherited ranges. Their disjoint union is the entire 2,530-line base. Independently recomputed unchanged, changed-target, and transitively inherited ranges match every reported interval and the Git diff. These are composed review credits; no independent full-file reread of all four versions is claimed.

## Discrepancies and repair guidance

### ACCT-01 — Root method ambiguity

The initial 54 root records deduplicate to 42 pairs. Five have separate explicit full-read evidence: Vite config, localBuildProfile, candidate errors.ts, quick-hide WalletAttempts, and duplicateAttemptJournal. The remaining 37 pairs have no separate accepted evidence in the reports checked. Refresh-read a full baseline and any complete dependent diffs, or preserve exact prior full-read evidence, then name the baseline blob per dependent row. Do not infer prior chronology from two rows carrying the same either/or label.

### ACCT-02 — Six test `refs` fields contain a descriptive label

The following test paths use `Portable core vault test dependency` where actual ref names are expected:

| Path under packages/ux-vault/src | Actual matching frozen refs |
|---|---:|
| keystore-portable-memory.test.ts | 16 |
| memory.testutil.ts | 28 |
| portable-parity.test.ts | 28 |
| reconciliation-amounts.test.ts | 28 |
| stealth-export-portable.property.test.ts | 16 |
| stealth-export-portable.test.ts | 16 |

Their representative SHA:path identities and line counts are valid, and no variant is missing. Move the prose to a scope note and use the exact computed membership lists in the JSON validation results.

### ACCT-03 — Derived artifacts and repository copies are stale

At the recorded snapshot, scratch reconciled tests show 476 reviewed / 59 pending, although the completed reports support 509 / 26. There are 33 stale statuses caused by arriving reports. The repository copy of source-scope still has 389 rows (382 production plus 7 resources), while scratch has 396 (389 plus 7). The repository coverage copy still records 339 reviewed production rows, 43 pending production rows, and 7 pending resources.

After the final work is complete, regenerate all consolidated ledgers, pending lists, counts and final repository copies together. Historical lane handoff lists may remain as history, but the final report must identify the consolidated ledger as authoritative. This validator has not rewritten the scope or reconciler.

### ACCT-04 — Combined-total overlap

Subtract the 46-line announcer pair from any combined unique total. This is a dual-purpose source/test entry, not a missing review or an extra finding.

### ACCT-05 — Reconciler evidence preservation and validation

The browser-custody special case keeps `notes` as its method and loses the more precise `review_method`. Preserve both, particularly for counterpart/diff provenance. The reconciler trusts accepted statuses and does not itself validate immutable mappings, bounds, complete range coverage, or lineage. The independent checks above found no current mapping or range defect, but the script alone is not a semantic-review gate.

`coverage-pending.json` selects production only. An empty production-pending list does not establish resource completion. Supplemental complete-read sections are ignored; every currently scoped pair in those sections already has credit elsewhere, so this causes no present missing scoped credit.

## Canonical findings and observations

All **175 immutable GitHub source links** in the canonical findings and observations resolve in the local Git object store. All anchors are within the correct file's bounds. The checks cover 100 distinct SHA:path targets. This does not claim external HTTP reachability or independently re-prove every semantic assertion.

The canonical register has exactly seven production findings: BROWSER-01, PN-01 through PN-05, and SN-K01; four medium and three low. Test qualification, prior hardening, maintenance, and trust-boundary observations remain separate. No classification contradiction was identified in the canonical documents reviewed.

BROWSER-01 correctly includes the later Pay route regression correction and expressly supersedes the earlier implication that the route test was absent. Preserve that correction when carrying forward raw lane reports. The additional English `help.receiptFile` wording is recorded under PN-05, not counted as a new finding.

No runnable exploit, crafted attack payload, or live reproduction procedure was identified in the canonical documents or reproduction-related report fields inspected. No reproduction was attempted. Repeated CP-K paragraphs in observations.md are editorial duplication only.

## Handoff

Root should close the 37-pair provenance assignment, incorporate the final 26-test successor report, normalize the six refs metadata rows, and regenerate final artifacts after its separately authorized final-cut extension. Do not substitute this original-scope snapshot for that later validation. This pass adds no production finding and supplies no test-pass or deployed-security claim.
