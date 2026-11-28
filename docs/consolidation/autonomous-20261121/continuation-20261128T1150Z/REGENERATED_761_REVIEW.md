# Newly regenerated #761 composition review

Reviewer: /root/review_761. Final direct ref readback: **2026-11-28 12:07:09 UTC**.

## Result

**Source preservation approved for prospective tree `e8e52390e112ce80d098765229658e95ad40f566`.** This is a new read-only source review. No application, handler, unit, browser or chain test was run, and no lost historical execution log was recreated.

Current main remains `0934ea094cb1db90293b74d2d1e9d9324e09a883`; #761 remains `c5a4e07ce7129a525f857d7c5a4e35c44b92422e`. The computed current-main composition exactly matches the previously reported prospective tree. All **5,059 resulting leaf entries** are accounted for, with zero unexpected paths.

This source sign-off does not establish merge qualification. Exact-head hosted gates, current ownership/protection, coordinator lease and resulting-tree qualification remain necessary.

## Actual synthetic merge is stale

| Role | Commit | Tree |
| --- | --- | --- |
| Main | `0934ea094cb1db90293b74d2d1e9d9324e09a883` | `1ffed94d3568537da2d0d370136b53f3bb116b9d` |
| Candidate | `c5a4e07ce7129a525f857d7c5a4e35c44b92422e` | `2a1baa84d3665a81d80f223dbde8c9b85a74ce8c` |
| Common base | `70458ebe3ae4a5502d7c39ae25d37342dbde971b` | `bb661db29cf79d6838156aefaa34a0f620f49c9c` |
| GitHub synthetic merge | `1fdfc4d27cc1fd9c57c57d2d2cd66e81c1f5cf2b` | `2a1baa84d3665a81d80f223dbde8c9b85a74ce8c` |

The direct synthetic ref and PR metadata agree: its parents are **old main70458ebe plus candidatec5a4e07c**, not current main0934ea09. Its tree is exactly the candidate tree. Existing qualification of that synthetic merge cannot establish qualification of the current-main prospective tree.

GitHub compare names70458ebe as the merge base; it is also an actual parent of both main and candidate. Final direct reads of main, candidate and synthetic refs were unchanged. [PR #761](https://github.com/djshellshoxxx/GhostPay/pull/761); [actual synthetic commit](https://github.com/djshellshoxxx/GhostPay/commit/1fdfc4d27cc1fd9c57c57d2d2cd66e81c1f5cf2b).

## Complete source proof

All three recursive Git tree responses have `truncated: false`. Canonical Git object serialization reproduced every root and every supplied subtree hash before prospective composition:

| Source | Total entries | Leaves | Verified subtrees | Mismatches |
| --- | ---: | ---: | ---: | ---: |
| Main | 5,679 | 5,057 | 622 | 0 |
| Candidate | 5,681 | 5,059 | 622 | 0 |
| Common base | 5,679 | 5,057 | 622 | 0 |

The comparison covers each path, mode, object type and object ID. Main contributes four static-guide/application test changes and its ownership prefix. Candidate contributes exactly three paths:

| Candidate path | Preserved blob |
| --- | --- |
| `apps/web/src/components/PrivacyControls.donor300.test.tsx` | `7425cbe3842903fba5ffb57f446c6d77f1165337` |
| `docs/handoffs/QUICK_HIDE_300_DISPOSITION_20261127.md` | `92d1cd555516eb30a6f3cf3a8d5e39e413f893e9` |
| `docs/ai/ACTIVE_WORK.md` | Candidate `25e456c95e5d65e63b92bc064fa05adc5b6b9b7b`; prospective `a4779409bf6711a113730de79b908e495b364c86` |

Only ACTIVE_WORK overlaps. All four non-overlapping main changes and both candidate-added files survive exactly. All **5,052 untouched base leaves** remain identical across base, main, candidate and composition. Canonical resulting leaf-map SHA-256: `307bca8f8a3f1e9274815b6a23fb439c31bcb32bf06923da679dcfb557facdf1`.

The candidate changes no existing production source or workflow. Its fetched test and handoff preserve bounded shared-core privacy intent with synthetic drafts. No stopped product is developed or enabled by the three-path delta.

## Exact ownership union

Fetched source bytes reproduce their declared Git blob IDs. The registry equalities are:

- main = exact **11-line prefix** + complete base;
- candidate = complete base + exact **7-line suffix**;
- prospective = complete main + candidate suffix = main prefix + complete candidate.

The union blob is **`a4779409bf6711a113730de79b908e495b364c86`**. Both complete ownership records and every historical registry byte survive. The candidate retains #742's separate ownership and the original #300 donor head.

Root separately verified fetched source bytes and the registry union, then independently recomputed all three source tree identities and the prospective tree. Its `ROOT_SOURCE_BYTES_CHECK.json`, `ROOT_TREE_HASH_CHECK.json`, and `root_verify_tree.py` were preserved without modification.

## Scope and reproduction

Current-main AGENTS and STOP_WORK were reread before planning; WORKFLOW and HANDOFF followed. Their returned source bytes match the current-main tree. Stop-work and shared-core preservation remain binding.

The first execution of this review-artifact serializer incorrectly used a literal backslash-zero in a Git separator. The source-root identity assertion caught the error. Replacing it with `bytes([0])` produced the complete successful roundtrip and composition proof. The initial failure output is retained. No product code or test was involved.

Run `python verify_source_composition.py` in this directory to reproduce the proof from captured immutable objects. It performs no network fetch, repository source execution, Git commit/ref creation or product test.

Available evidence:

- `source-inputs.json`: all recursive tree entries, fetched registry/test/handoff content, current instructions and source pins.
- `composition-proof.json`: complete successful new object/leaf/union proof.
- `verify_source_composition.py`: deterministic verifier.
- `final-ref-readback.json`: final unchanged direct refs.
- `verifier-initial-attempt.json`: actual initial artifact-verifier failure.
- `ROOT_SOURCE_BYTES_CHECK.json`, `ROOT_TREE_HASH_CHECK.json`, `root_verify_tree.py`: preserved independent root evidence.
- `MANIFEST.json`: available file hashes and sizes.

Complete new input, verifier, proof, report and final-ref contents are cached in functions stores under `regen761_*_bytes_utf8` and corresponding structured keys. No source edit, remote mutation, lock acquisition or merge occurred. Unavailable historical test logs remain unavailable.
