# #761 source-composition proof regenerated

This addendum follows checkpoint commit `61558994d9c524204540fce4d0789b4e7379e457`. Its earlier availability records remain unchanged. **A new, available source-composition proof has now been generated from current GitHub objects.** Missing execution logs and the final full branch-census proof remain unavailable.

## Source pins and independent verification

- Current main: `0934ea094cb1db90293b74d2d1e9d9324e09a883`, tree `1ffed94d3568537da2d0d370136b53f3bb116b9d`.
- #761 head: `c5a4e07ce7129a525f857d7c5a4e35c44b92422e`, tree `2a1baa84d3665a81d80f223dbde8c9b85a74ce8c`.
- Common base: `70458ebe3ae4a5502d7c39ae25d37342dbde971b`.
- Newly recomputed prospective tree: **`e8e52390e112ce80d098765229658e95ad40f566`**, exactly matching the previously qualified composition recorded in the public review.
- Prospective leaf count: **5,059**.

The independent review worker retrieved the exact source inputs. Root independently verified all five file-blob hashes, reconstructed the three complete source tree identities from their leaf modes/types/SHAs, and applied the bounded three-path candidate delta to current main. All three reconstructed source trees match GitHub's tree identities. The combined tree matches `e8e52390...` exactly.

The separate reviewer also reproduced all 622 subtree identities per source with zero mismatches, verified preservation of all 5,052 untouched base leaves and approved source preservation for this exact composition. Final direct source-ref readback at 12:07:09 UTC confirmed main, candidate and the stale synthetic ref unchanged. This is independent AI-assisted source review, not formal GitHub/human approval or new test execution.

The candidate contributes only:

1. `apps/web/src/components/PrivacyControls.donor300.test.tsx` — exact blob `7425cbe3842903fba5ffb57f446c6d77f1165337`.
2. `docs/handoffs/QUICK_HIDE_300_DISPOSITION_20261127.md` — exact blob `92d1cd555516eb30a6f3cf3a8d5e39e413f893e9`.
3. `docs/ai/ACTIVE_WORK.md` — the only shared changed path. The current main's exact 11-line prefix and the candidate's exact seven-line append surround the unmodified common-base registry. The combined blob is `a4779409bf6711a113730de79b908e495b364c86`.

No production, dependency, contract, workflow or stopped-feature change is introduced by this composition. Parent records and source modes are preserved.

## Stale synthetic merge caveat

GitHub's observed synthetic PR merge is `1fdfc4d27cc1fd9c57c57d2d2cd66e81c1f5cf2b`, with the old candidate tree `2a1baa84...`; it does not represent the current-main composition. The regenerated proof derives `e8e52390...` separately from source objects. **Do not treat the stale synthetic ref as current-main hosted qualification.** Recheck its parents/tree, applicable exact-head checks and actual merge result under the existing integration protocol.

## Qualification and ownership boundaries

This is fresh source and Git-object verification. It does not rerun the earlier 43 mounted tests, 2,304 handler cases or hosted browser suites, and it does not recreate their missing logs. Their contemporaneous qualification statements remain linked in the preceding handoff. The new source proof binds the available prospective tree to the same previously recorded qualified tree.

At the separate 12:03:40 UTC readback, main remained `0934ea09...`; CodeQL and Hosting had succeeded, while CI, Pages and Nightly remained queued, with seven successful / 32 queued discovered checks. The latest inspected lock was generation 79 held by `claude-cloud-lead-ghostpay-6a`; expiration does not authorize takeover. No main merge, source-branch update, lock acquisition, deployment or new automation occurred here.

The existing #380 ledger receives this proof and publication receipt additively. The earlier 872-ref recovered snapshot and 876-ref reported-analysis limitation remain as documented; this bounded proof does not certify exhaustive consolidation.

## Reproducibility

The attached regenerated-proof archive contains the exact retrieved source records, source-specific reviewer report/proof, both root verification results, the independent root tree-hash script and a member hash manifest. Run `root_verify_tree.py` beside `source-inputs.json` to recompute the three source tree identities and the prospective tree without network access or application test execution.

Published evidence: [independent review](REGENERATED_761_REVIEW.md), [complete proof](REGENERATED_761_PROOF.json), [reproducible archive](regenerated-761-proof.tar.xz), [archive manifest](REGENERATED_761_MANIFEST.json), [earlier checkpoint publication receipt](PUBLICATION_RECEIPT.json), [post-publication gate snapshot](POST_PUBLICATION_GATES.json).
