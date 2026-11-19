# Branch inventory

Baseline: `e454de6abfefda70d82784fafc1d8949b277c334`. Snapshot: 2026-11-19 07:42 UTC.
The complete clone included all accessible remote branches and tags. The connector enumeration
independently returned 265 remote branches, and changed paths were collected for all 50 open PRs.

| Classification | Count | Meaning |
|---|---:|---|
| Ancestor of main | 169 | The branch head is already reachable from the baseline main commit. |
| Divergent history | 94 | Requires dependency, patch and functional review before integration. |
| Unrelated history | 1 | `gh-pages`; not a source integration candidate. |
| Main | 1 | Baseline branch itself. |

All 94 divergent histories received nonmerge patch-equivalence comparisons; 13 had no unique nonmerge
patches. Merge-resolution changes and final-tree behavior still require review. This is not deletion approval.

Full source pins and ancestry are in [the census](data/branch-census-20261119T0742Z.json),
[PR ancestry](data/pr-ancestry-20261119T0742Z.json),
[changed-path ownership](data/open-pr-paths-20261119T0742Z.json), and
[the consolidation review](data/consolidation-review-20261119T0742Z.json).
These files are snapshots, not continuously refreshed status.

## Important relationships

- #245 and #247 are ancestors of #257. Prefer the already combined candidate rather than importing them twice.
- #239 and #240 are not equivalent: neither contains the other; each has six unique commits. Preserve atomicity,
  download, unload and BOM behavior while reconciling them through the existing recovery owner.
- #238 (`198aa5baff22272453733a0f3dcfcac0e0994eec`) conflicts with current main and has multiple merge bases.
  A naive three-dot comparison can hide integration differences.
- #248/#249/#251/#243/#254/#256 remain active owners of scan, privacy, transport, signer, Bitcoin and session work.
  Re-read live claims before choosing overlapping files.

No historical branch was deleted, closed, rebased or force-updated in this review.
