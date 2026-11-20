# Final independent audit metadata validation

**Status: PASS. All original accounting items ACCT-01 through ACCT-05 are closed. No remaining in-scope metadata discrepancy or coverage blocker was found.**

Validated at 2026-11-20T07:14:36.185537+00:00. The source cut is **2026-11-20 06:51:27 UTC**.

## Validation boundary

This is an independent check of immutable identities, counts, declared read ranges, report references, counterpart lineage metadata, repository copies and canonical findings classification. It is **not an independent semantic reread of 222,767 lines**, a passing test run, or release/deployment approval. Complete-read/diff statements remain reviewer attestations; consistent metadata does not reconstruct or prove a historical reading event.

This validator used only read-only local Git object/metadata inspection and Python standard-library bookkeeping. It did not execute target source or tests, builds, installations, probes, remote queries, source edits or Git mutations.

## Final scope and completion

| Category | Paths | Path/blob versions | Version-lines | Pending |
|---|---:|---:|---:|---:|
| Production and build/configuration | 331 | 435 | 99,027 | 0 |
| Supporting resources | 5 | 8 | 10,469 | 0 |
| Tests and support | 435 | 549 | 113,317 | 0 |
| **Deduplicated combined scope** | **770** | **991** | **222,767** | **0** |

The source inventory has 443 rows and 109,496 version-lines. Source and test scopes share exactly one 46-line pair: `packages/contracts/test/utils/ERC5564Announcer.sol`, blob `d862ca8a8b63d0bf898f5df829b38a83dbcf4493`. The combined totals subtract it once. Neither inventory contains duplicate path/blob rows.

All 435 production, eight resource and 549 test/support versions have accepted evidence. Both consolidated pending lists are empty. Resource completion was checked independently of the production-only pending file.

## Pins, identities and evidence

- All 28 original pins and five additional final-cut pins are preserved: 33 distinct commits. `main` denotes `c977b5d6723f6822c3b5d86cd6b231712c53c395`; `main@final-cut` denotes `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Verified **21,352** distinct SHA/path/blob relationships and **21,328** listed ref memberships with no identity error.
- Recomputed Git hashes for **1,032** distinct blobs and checked declared line counts against the blob bytes.
- Checked **1,221** declared ranges and **1,007** consolidated evidence references. No malformed range, incomplete credited range field, dangling report selector or invalid object mapping was found.
- Accepted evidence contains **1,047** records and **1,031** distinct path/blob pairs. Incidental context outside the declared inventory does not increase the **991** scoped versions.
- Resolved **199** complete-diff records through explicit blob pointers, exact hashes in method prose, immutable report pin aliases or a unique full counterpart. Twenty reverse-diff base records resolve to their full-candidate records.

The original core path union was checked across all 33 pins. New hosting files follow their explicitly selected path/ref matrix. Thirty-seven selected hosting records also have identical blobs on older, unselected pins; those memberships are outside the final extension. Four older main hosting test counterparts are outside the modified/latest-test selection and are listed exactly in the JSON. No universal all-versions hosting-test review is claimed.

## Provenance repairs

The first 54 root attestations are superseded history. They represent 42 distinct pairs: five have separate explicit full-read records and the remaining 37 exactly match the round-8 refresh. Its 27 direct full reads cover 3,662 lines; ten dependent diffs cover 1,943 logical version-lines. The validator checked exact baseline IDs, path/blob/SHA fields, added/deleted ranges and unchanged mappings. All ten diffs reproduce under the report’s documented `difflib.unified_diff` algorithm.

The English baseline composes 322 root lines and 2,208 successor lines. The ranges are disjoint and cover all 2,530 baseline lines. All three derivative versions have complete changed-plus-inherited coverage, and their transitive inherited root ranges match computed lineage. This preserves the composed-review claim without recasting it as a second independent full-file read.

Round 8 contributes 56 hosting versions. The final helper report adds four full-read test/support versions totaling 601 lines; all four are in the final test inventory and ledger, with no remaining required reads.

The remaining historical AppShell ambiguity is closed by `review-appshell-provenance-round10.json`: a fresh full read of all 551 lines of blob `ae90814b2edb359cf1d72d0a728cfb619870933f`. The old browser row is explicitly superseded, and the consolidated ledger points to the fresh record. No historical parent was guessed.

## Original accounting discrepancies

| ID | Final status | Resolution |
|---|---|---|
| ACCT-01 | closed | The first 54 root attestations are superseded. Their 42 unique pairs are covered by five separate explicit full-read records plus 37 fresh records: 27 full reads and ten complete dependent diffs. All ten exact baseline pointers and diff lineage maps validate. |
| ACCT-02 | closed | All six portable-vault refs arrays contain actual frozen-ref names. The rationale is retained in scope_note. Membership was verified against the frozen Git trees, including matching final-cut pins. |
| ACCT-03 | closed | Final inventories, ledgers, both empty pending lists and repository JSON copies are synchronized. Historical Markdown bodies are preserved beneath authority banners. README, coverage.md and coverage-summary.json agree. |
| ACCT-04 | closed | Combined totals subtract the one shared 46-line announcer pair: 443 + 549 - 1 = 991 versions; 109496 + 113317 - 46 = 222767 version-lines. |
| ACCT-05 | closed | Browser review_method and exact report selectors are retained. Supplemental/context/full-read sections are ingested. All eight resources are explicitly reviewed. Independent identity/range/lineage checks accompany the status reconciler. |

## Canonical documents and repository copies

Validated **193** immutable source links representing **113** distinct commit/path targets. Every linked path exists at its pinned commit and every line anchor is within the source bounds. These checks use local Git objects; no website requests were made.

The canonical register has exactly seven production findings: `BROWSER-01`, `PN-01`, `PN-02`, `PN-03`, `PN-04`, `PN-05` and `SN-K01`. Severity totals are four Medium and three Low. Test/harness limitations remain in observations. `H9-TQ-01` is recorded there and does not inflate the production count. The correction about the existing Pay-route regression remains in the canonical findings.

Verified **38 JSON copies** against their scratch inputs and preserved original bodies in **23 historical Markdown reports**. README, coverage.md and coverage-summary.json agree with the final inventory. Canonical relative links were checked; the parent-owned validation.md wrapper is the sole deferred output link until this report is copied.

Tracked changes are confined to the audit directory and `docs/ai/ACTIVE_WORK.md`. No claim is made about work predating this checkout. Input SHA-256 hashes and detailed evidence-reference/lineage results are in the companion JSON.

## Remaining discrepancies and limits

**Remaining in-scope metadata discrepancies: 0. Pending source/resource/test versions: 0. Coverage blockers: 0. ACCT-01–05: closed.**

Completion applies to the declared finite cut and selected hosting path/ref matrix. Earlier lane pending arrays are historical and superseded by the final ledgers. Future remote changes, excluded optional products, third-party internals, live chain state and runtime behavior remain outside this metadata validation.
