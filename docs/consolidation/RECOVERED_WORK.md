# Recovered work and provenance

Checkpoint: 2026-11-19 UTC. Latest verified main: [c977b5d6723f6822c3b5d86cd6b231712c53c395](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395).
Branch: codex/ghostpay-consolidation-records-20261119 ([PR #273](https://github.com/djshellshoxxx/GhostPay/pull/273)). Initial baseline: 14ded337a10c140d7a9f9a9238ec038587d925bb.

This checkpoint does not declare feature completeness or release qualification. Read [HANDOFF](HANDOFF.md), [TEST_RESULTS](TEST_RESULTS.md), [REMAINING_WORK](REMAINING_WORK.md) and [MAIN_MERGE_LOG](MAIN_MERGE_LOG.md) together.

## Completed recovery and new engineering

| Source | Contribution | Destination / status |
|---|---|---|
| #245 / #247 and two SOCKS hunks from #253 | Positive pool values, AST source-sink scanning and binary chunk guard. Major dependency train excluded. | #257 head 4f14d6f167c788f5ae2d019bc8482027495f3c6c merged as main 8f563764. #245/#247 closed by ancestry, not separate merge operations. |
| #250 head 22af2074a086d9957a18e310ef8572b28d1facd0 | Calendar validity, finite retry bounds, extreme-decimal regression and contiguous TRON ranges. | Preserved as initial #271 parent. Current #271 head 429a4de80b9ec53177b17d89d18ce8ec91a08814 includes current main. |
| a3442053ffe7d94238f0877cea5b429381ecfbd7 | Complete-range browser fixture and missing-genesis expectation. | Two selected test-path hunks in #271. Broad #262 was not merged. Three new omitted-height regressions retain strict privacy/integrity boundaries. |
| #231 / #252 head 4085622463411d3ba27f4efb7b73a70575170535 | Explicit balance consent, stale-read invalidation and corrected disclosure. | Preserved through #272 ancestry; original branches unchanged. #252's main conflict is additive ownership only. |
| New Sweep lifecycle repair | Quotes and relayed/direct/re-sign operations are bound to reviewed balance/context before handoff; post-handoff evidence retained. | Initial 9e4ec2da; extended a67d09750f13ae2cfee3a0ad7bdc3ccb6c28b4f0; current combined #272 head 63ff40d57af879a3d82166450f63aadb7bf0d5ff. |
| #259 head 4ff80733a3b36019e2f12fc21a8448e7666b6049 | #215/#216 histories, dated #139/#140/#153 sections, #223 provenance, Wiki and continuation guidance. | Recovered into #273 with original ancestry, source text and provenance retained. Application/workflow/dependency blobs remain current main's. |
| Complete fixed branch/PR census | 278 live branches, 267 PRs, 12 historical PR heads without a live branch, ancestry/patch/source-bound dispositions. | BRANCH_INVENTORY.md and census JSON. Later branches/heads remain a separate addendum. |
| cd4539d2b7f3f14c63227c74d88c032e1e1f360d | Exact six-addition/two-deletion policy negative-test fixture repair; no historical ABI changes copied. | Published draft #275 at dc821780e05483d1b35062a74b07be7ed9ca2f1c, parent73545f63112910d46002718354ab5e99f8652e1f. Independent source review and syntax/whitespace checks pass; unit/type/lint/Anvil qualification remains blocked. |
| Stale verification checklist | Current source has nine testnet token entries and four feeds; old text said two/no feeds. | Corrected from actual configuration and saved primary evidence; dated October retrieval limitations remain history, not current inventory. |

## Exact source publication

After the first runtime interruption, root reconstructed #271 through Git Data and required complete-tree equality: local 8df4846138f67d2efbc29c0a9fa980a10a9d3103 and remote 146e52481733fec5fc95580eb9d2d41a01a05df0 both use tree 28b3f3e73aa1bd94082cc936aa84a92dd03615f4. No missing source was invented.

After #257 merged, the sole #271/#272 conflict was ACTIVE_WORK.md. Both parent diffs were insertion-only. Complete inserted sections were retained at their base positions; an independent reviewer reproduced the resolved bytes. Every other incoming blob exactly matches main.

| Candidate | Current tree | Ordered parents |
|---|---|---|
| #271 | bc5087c6ed74c047c99fee2ccc7c2e217b8450bd | 146e52481733fec5fc95580eb9d2d41a01a05df0; 8f56376427c96881f49590920ff0bf8543ec81b4 |
| #272 | 6f204f08a0dda98f3d9c6428afec080de7dd0df5 | a67d09750f13ae2cfee3a0ad7bdc3ccb6c28b4f0; 8f56376427c96881f49590920ff0bf8543ec81b4 |

For #259, its continuation ledger retains the entire current-main body/suffix and adds a dated prefix. Its ownership file must not replace main wholesale: that would lose #257 claims. This candidate retains all complete claims and historical archive text.

## Outstanding unique contributions

- Compose #260/#239/#240 key export and atomic replacement with #256 immediate idle suspension. Existing #262/#264 resolved session/AppShell files preserve both; neither older whole-file version is sufficient.
- #265/#268 focused canonicalization/clock fixes overlap #270 and updated #262. Compare exact blobs and controls, not titles, before choosing one implementation.
- #267's timestamp boundary fix has independent original-suite evidence; native hosting/browser acceptance remains separate.
- New export authorization b0abb726 and private-scan lint 1b010ec9 are already ancestors of #269 at 683f8587. Proposed overlapping work was stopped after the ownership refresh; do not duplicate or overwrite those active sources.
- Historical cd4539d2b7f3f14c63227c74d88c032e1e1f360d repairs a policy negative-test fixture in eight changed lines. Recover only its own hunk; its complete file also contains unrelated older ABI changes. The bounded repair lane retains strict proof/encoder/contract rejection.
- #218 retains paused backend/CLI work and a small Pages refusal classification. Its title overstates sweep destination/quote-age work absent from the inspected paths. Preserve, do not bulk-activate.

The fixed 278 dispositions are 172 ancestry-contained, 55 open-PR qualification candidates, 12 patch-equivalent, 25 retained historical, seven policy/rejection holds and seven individually classified coordination/evidence/contained/runtime/paused/deployment/baseline rows. Mechanical identity is not proof every historical behavior survived. No branch/tag deletion or force push occurred. The lock control history never enters application ancestry.

Next action: finish exact-head qualification and follow REMAINING_WORK.md; retain all source provenance while integrating eligible batches.
