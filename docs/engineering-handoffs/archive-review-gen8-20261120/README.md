# Independent historical archive review — generation 8

## Decision

The recovery at `a4503e5c3a5b1e02bfd160f36f841dd6f5e66f58` is suitable for documentation-only integration with the inherited-link limitation below. No blocking source-fidelity, selection-boundary, provenance, or new local-link defect was found. This review does not qualify application behavior or a release.

The recovery commit adds exactly ten files under `docs/engineering-handoffs/archive-recovery-gen6-20261120/`. It does not modify runtime code, tests, configuration, workflows, live status, navigation, or existing ownership guidance. Its predecessor's ownership claim is a separate commit. All three archive headers, the new README, and the new handoff explicitly distinguish historical observations from current instructions and test/release claims.

Reviewed inputs are [the recovery report](../archive-recovery-gen6-20261120/README.md), [new provenance](../archive-recovery-gen6-20261120/provenance.json), and PR #259 source `4ff80733a3b36019e2f12fc21a8448e7666b6049`. Historical source sections were independently resolved from their original Git commits, rather than accepted solely from the recovery manifest.

## Independent verification

| Check | Actual result |
| --- | --- |
| Original manifest copies | All three are byte-identical to PR #259 and match their recorded blob identities, SHA-256 hashes, and sizes. |
| Archive files | All three original and three recovered hashes and sizes match. PR #139 and PR #153 remain byte-identical in full. |
| PR #140 selection | The recovered archive equals the original with exactly one 2,120-byte QR source-file block and its preceding separator removed; no other byte changes. |
| Source files and sections | All ten original source-file blob identities/hashes and all 158 original section hashes/ranges match. All original section identities are accounted for once. |
| Recovered bodies | All 157 recorded byte ranges contain the exact source-derived archived body; ranges do not overlap and each body appears once in its recovered archive. Distribution is 42 / 74 / 41 for PRs #139 / #140 / #153. |
| Omitted section | The complete QR section is retained at frozen candidate `53f4253b`, later candidate `a1e5090b`, and updated candidate `be12cd04`. |
| Historical link rebasing | All 43 recorded transformations match independently derived commit-pinned destinations; replaying only those link changes reproduces every archived section body. Target existence is qualified below. |
| Original publication records | All four available published trees and mapped parent lists match their records; all ten historical comparison-file hashes match the mapped comparison commit. |
| New local Markdown links | All 22 resolve in the committed recovery tree. |
| Later candidate documentation | The 30 changed documentation paths from `a1e5090b` through `be12cd043dbfc2f562368fd0ccc1a2a8c3f7a22f` yielded 147 raw, gzip-expanded, or decoded-JSON text payloads. None contains a complete recovered section under exact, whitespace-normalized, or inline-link-normalized comparison. |

The source base `ffd982a7aea2856c186b40ef236a39720a1b81f5` is an ancestor of frozen candidate `53f4253bd9afc33bea43a7bdfe95ae287e035bf7`. `git diff --check a4503e5c^ a4503e5c` passed.

## Inherited historical link limitation

Four historical link occurrences resolve to two paths absent from source commit `c5efadab9d9af6a0053f489ebe6c0c06e760d025`:

- `docs/handoffs/User-Guide.md`
- `docs/handoffs/Developer-Guide.md`

Both links occur in two archived sections from `docs/handoffs/CHATGPT_DOCS_MAINTENANCE_LATEST.md`, source ranges 72–79 and 213–221. The original prose discusses Wiki navigation but uses filenames relative to the handoff document. PR #259 correctly preserved that original relative-path meaning when pinning the links. The current recovery preserves the same bytes.

Therefore **43 correct link transformations do not establish 43 existing historical targets**: 39 target occurrences resolve in Git and four do not. The recovery report's statement that the destinations were checked against source paths should be read as transformation fidelity, not universal target existence. All 22 newly added local context links resolve. External URL availability and fragment anchors were not fetched or tested.

The immutable archives were not rewritten to repair their authors' historical links. This review records the finding separately so source fidelity and usable current navigation remain distinguishable. Root should retain this qualification with the integrated recovery.

## Evidence and reproducibility

[RESULT.json](RESULT.json) records the pinned inputs, counts, exact changed paths, removed block hash/range, publication checks, all local links, four inherited-link findings, and the later documentation delta. The final command exited **0**, with result `passed with inherited historical-link findings`:

```sh
python3 docs/engineering-handoffs/archive-review-gen8-20261120/verify_archive.py
```

[verify_archive.py](verify_archive.py) is the independently written, read-only data verifier. Its SHA-256 is recorded in the result. It reads Git objects, hashes bytes, resolves document paths, and expands the later delta's gzip evidence as data. It executes no historical command, application test, build, or network request.

[INITIAL-RESULT.json](INITIAL-RESULT.json) preserves the first result, exit **1**. That initial pass treated every historical target's existence as an assertion and exposed the four inherited absent-target occurrences. Source/body/hash checks passed. The final verifier reports those same occurrences explicitly as inherited findings rather than treating faithful archival preservation as a new integration defect. The initial failure has not been relabeled or discarded.

## Review limits and successor handoff

The predecessor's complete-candidate text/gzip/ZIP corpus scan was not repeated. Its absence result and normalization coverage remain attributed to that source-pinned scan. This review independently checked every selected source section and recovered body and examined only later changed documentation for new duplication. Neither review establishes that every individual sentence or related fact is novel.

The four original local publication commits remain unavailable; their local-versus-published tree equality is still an attributed historical claim. Published metadata and comparison-file hashes were independently checked. Application qualification, current security findings, release status, and active privacy work remain separate from this archival review.

Before publishing or merging a different tree, the coordinator or next fresh reviewer should compare the ten recovered blobs with `a4503e5c` and retain this link qualification. If new historical documents have appeared since `be12cd04`, inspect only that new delta for complete-section duplication. No archive body requires a correction from this review.
