# Branch inventory

## Current reconciliation — 20261120T0115Z

Initial live census: 79 open PRs, including the latest completed external automation's #293.
This cycle creates only isolated continuations of existing work; no other owner's branch was edited.

| Candidate | Exact head | Current disposition |
|---|---|---|
| #278 | 417f7c71daf8645e1432f2ec8f070110879b80bd | Existing integration owner; all eleven earlier priority fixes already accounted for |
| #292 | 936d054ed067d89c773310d42e33939c1129bbfa | Existing Pages gate owner reconciled current #278; old 814950a1 failure is historical |
| #293 | 6c648770f5647ca7993cc108ef9e5ede9b46b4c9 | Existing clipboard helper owner; incomplete Settings, lint/test defects repaired by dependent #297 |
| #297 | 04910f65dc0268e41519c4b1a44e83264272f0bf | New test-only correction, based exactly on #293; no duplicate helper |
| #298 | acbf39ee21ad35e9d14df958fa16fbcc2e230cae | New receipt correlation repair, based exactly on current #278 |
| #290 / #295 | ec546311 /4493793a | Existing runtime guard plus distinct prior-cycle coverage; #290 target conflict remains |
| #294 | 172695efb41665a4e50d335029e54184bbb5b328 | Existing QR deadline owner; target conflict remains |
| This checkpoint | Parent #296 a47648872e648fe7848a17080a5ffa1473e98e8b | Additive continuation of canonical #261 ledgers; no application consolidation |

Fresh source/target pins, mergeability, workflows and checks are in
[data/cycle-20261120T0115Z/exact-head-state.json](data/cycle-20261120T0115Z/exact-head-state.json).
Source pins and local/published tree mappings are in the two new committed handoffs.
Older #238/#262/#264/#249/#251/#222 Settings/AppShell overlap was inspected before assigning scope.
No overlapping active clipboard Settings implementation was found, but that work was deferred in
favor of transaction correctness and qualification. All original branches and unique changes remain.


## Current reconciliation — 20261120T0035Z

Main c977b5d6; initial source audit #278 d74af79e; initial inventory 73 open PRs.
Full pins and compared blobs are retained in the
[reconciliation snapshot](data/consolidation-review-20261120T0035Z.json).
The later [final refresh](data/final-state-20261120T0035Z.json) records newer heads separately.

| Candidate | Disposition at audited #278 d74af79e | Evidence requiring preservation |
|---|---|---|
| #258, #268, #274, #279 | Exact heads are ancestors; production/test blobs match | Existing handoffs and ownership history |
| #265 | Head is an ancestor; #270 retains regressions and strengthens validation | Preserve descriptor/accessor/Proxy handling |
| #280, #281, #282, #285 | Production/test blobs match although original heads are not ancestors | Four original handoffs absent there, recovered here |
| #289 | Production matches; test has existing lint repair 1c1369c1 | Original handoff recovered; original PR remains red |
| #261 | Lock script/test blobs match | Sixteen canonical automation ledger/data files absent there |
| #269, #270 | Heads are ancestors | Preserve subsequent refinements |
| #262 | Source consolidation overlaps #278 | 155 absent documentation/evidence paths and five differing documentation blobs |
| #264 | Broad candidate needs owner reconciliation | 96 absent documentation paths, 17 differing documentation blobs, 122 differing source paths |

None of the eleven original PR heads was an ancestor of observed main. Presence in an unmerged
candidate is not main integration. No original candidate or branch was closed/deleted by this cycle.

Concurrent #290 first appeared at aaa8a7e2 and advanced to ec546311; it supplies equivalent production
guards and absorbed overlapping tests. Our #291 at 17333ced was closed, with its branch retained.
The unpublished five-case supplement at 0c3893db is archived as patch/handoff evidence, not proposed
for duplicate integration. Final #295 at 4493793a contains only one added unverified-hook test and
the existing mapping test strengthened for all eight flag combinations, stacked on #290 ec546311.

External #278 advanced to 417f7c71 during final refresh. Its older d74af79e results remain historical;
new combined-source CI is pending. #290 now reports a merge conflict with its advanced target and
requires its owner to reconcile. This checkpoint remains a separate documentation delta on #261;
the older application baseline underneath #261 is not proposed as a replacement integration.

## Historical census — 2026-11-19 07:42 UTC

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
