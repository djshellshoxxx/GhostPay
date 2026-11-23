# R57 — historical QR-surrogate repair donor, uncapped source reconciliation

At 2026-11-23 UTC, compared `repair/ghostpay-qr-surrogates-20261119` at immutable `ac7b7a11f00896d105fa7a06e44e218046bdc56c` against current main `eb59d93cffed7848c4aac37d0e9650b87239c6da` and current owner-head trees #372, #278, #310, #307, #367 and #290. All eight Git Trees API `recursive=1` payloads returned `truncated=false`. **No 300-file Compare cap affected these results.**

The donor contains **4,675 file blobs**. At the first matching source among main, #372, #278, #310, #307, #367, #290, there are 3,528 / 996 / 119 / 0 / 0 / 0 / 1 exact same-path, same-SHA matches respectively (**4,644 exact matches**). The other **31** are 19 executable code/test paths and 12 documentation, provenance and release files.

Of those 19 code/test paths, **17** have exact matching Git blobs on existing open PR heads #264/#269/#270 (and certain overlaps on #252). This includes QR kind, merchant identity, canonical JSON, build profile, network authorization, stealth export, Bitcoin spentness, settings and privacy tests. The two remaining historically differing executable blobs are:

| File | Donor SHA | Existing recovery PR #372 SHA | Untruncated line-level difference |
| --- | --- | --- | --- |
| `apps/web/src/lib/sweep.ts` | `3710a28fe7e90c618d0b57da1aeed9f2a9adf599` | `696538254255780dd790f847782804ea9d65a1ac` | Donor `let additionalFeeReserve = 0n` is replaced with owner `let additionalFeeReserve: bigint`, plus one comment clarifying session-review revalidation. No removed behavior observed in these three changed lines. |
| `apps/web/src/lib/sweep.nativeReview.test.ts` | `ead0a287483a65add77eb8ce1722cc05b235ec63` | `1a57ad6d116171cc64cab5293aa572a45d22daa2` | Owner explicitly rejects a nonstring fetch request body before `JSON.parse`, rather than coercing it with `String(init.body)`. This is the stricter runtime test. |

Both pairs were inspected using complete fetched blob content and line-level longest-common-subsequence comparison. Their intended tests and native-review behavior are in an **unmerged, owner-held** PR; the changed lines do not justify reintroducing the older donor implementation.

**Important unresolved remainder:** 12 differing historical docs/handoff/release blobs, including `docs/release/{BRANCH_CONSOLIDATION,DEPLOYMENT_READINESS,FEATURE_MATRIX,FINAL_HANDOFF,RELEASE_BLOCKERS,RELEASE_NOTES,SECURITY_AUDIT,TEST_RESULTS}.md`, `docs/release/PUBLICATION_MAP.json`, `docs/pages/README.md`, `docs/user/sweep-and-gas-privacy.md`, and `docs/ai/ACTIVE_WORK.md`. These need semantic provenance review before asserting that no unique useful documentation remains. **Therefore the donor stays unresolved in the ledger**. This is **not** a structural-finalization or mainline integration claim.

**Next actions:** review those 12 docs for nonduplicated current instructions and safety obligations; preserve qualifying facts additively, without restoring stale deployment or branch-ownership claims. Revalidate owner PRs #264/#269/#270/#372 at their exact new heads before any final disposition. Do not cherry-pick donor sweep code over stricter #372, bypass its Mythril/Tor gate, or merge without authorized owner lock and independent reviews.