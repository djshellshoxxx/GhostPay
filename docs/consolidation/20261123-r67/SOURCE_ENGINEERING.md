# GhostPay R67 — code fix, uncapped donor recovery, CI, and source pins

Checked UTC: 2026-11-23T15:15:18.865Z for exhaustive branch/PR/ref census. Baseline protected `main`: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`; consolidation PR #471 prior HEAD: `01a5769b285a1d5defa18f18b7859d1e44e8dfbf`. Versioned full [R67 census](SEMANTIC_DISPOSITIONS.json) records the **pre-publication** source-code HEAD `2bab915f07f66f55e3c140ee045519643ec5870d`; documentation commits are later self-publication and must not be mistaken for historical branch changes.

## Real code changes on isolated consolidation tooling

**Defect:** `scripts/consolidation/validate-ledger.mjs` required a source-pinned prior disposition before rewriting an already-finalized donor, and before finalizing a retired donor. It did **not** require the evidence to name the *destination* disposition. A reviewer could attach evidence that identified the old state yet failed to bind or explicitly acknowledge the new label (e.g. `included-in-main-by-ancestry` becoming `audit-or-documentation-only`). This is a provenance-integrity defect; no payment exploit or fund loss is claimed.

- Test-first commit: `0cb7294bd320419d279054cd65fe13130a5ecefa`, modifying only `scripts/tests/consolidation-ledger.test.mjs`. Adds missing-`newDisposition` regression checks in both changed-finalized-donor and finalized-retired-history cases, while keeping existing valid transitions.
- Fix commit: `2bab915f07f66f55e3c140ee045519643ec5870d`, modifying only `scripts/consolidation/validate-ledger.mjs`: require `proof.newDisposition === successor.disposition` for those two transition types. No older evidence dropped, no relaxation of high-risk or live-branch validation, and no application/payment files touched.
- The existing tests' source-pinned valid proof fixtures were updated with the actual destination, and wrong/missing destination evidence is now rejected. Earlier normal `unsafe` relabel handling already required this property.
- The test-only CI was queued/in progress when checked; the code-fix CI was queued or superseded. No RED-phase test execution or native Node application test success is claimed. **New exact-head CI must pass**. The previous R66 CI [45192368684](https://github.com/djshellshoxxx/GhostPay/actions/runs/45192368684) has now completed with **24/24 successful jobs** at exact `01a5769b285a1d5defa18f18b7859d1e44e8dfbf`. This result cannot be inherited by R67.

## Complete live census, versioned and independent

GitHub /branches pages: `100/100/100/100/100/79/0`; all Git refs matching heads returned **579** identities, independently matched **579/579 exact names and commit SHAs** with zero mismatches. GitHub /pulls pages: `100/100/68/0`, **268 open PRs**, **96 stacked** (non-main bases). Two new branches, both owned, are PR #512 at `2a6914c2a036856c939f746a88a3b6dc761860d7` and BUG-only PR #513 at `d181a89e67978ef375b08a60bf065506bc913171`. One advanced self-publication branch #471. No historical branch disappeared, main has not advanced, and no formerly finalized donor advanced. 317 historical live histories remain finalized; 262 live + 2 deleted-but-unmerged histories = **264 globally unresolved**, up two from R66. Full PR head/base/ownership/alias and branch SHA inventories are in [SEMANTIC_DISPOSITIONS.json](SEMANTIC_DISPOSITIONS.json). Historical divergence data is retained but not misrepresented as a freshly recalculated per-branch comparison.

## Additional direct source investigations (full Git objects; NOT truncated compare)

Recursive Git-tree inspection returned `truncated=false` for **all** six old donor trees and for current main and C1. Counts below are blob identities/paths, not counts of distinct deployable features. “Differing” means donor file blob differs from *both* main and C1 trees, and may still be older, incompatible or already superseded elsewhere.

| Historical branch (pinned source) | Donor blobs | Differing blobs against main and C1 | Paths absent from both |
| --- | ---: | ---: | ---: |
| `codex/ghostpay-security-audit-20261030` @ `63994db6cff8b3b3ca698427eee9e95904230546` | 3,184 | 643 | 31 |
| `ghostpay-sbom-repro-2026-10-27` @ `b5b04b999e84e7598dcb98adbf3c44e340223d05` | 3,072 | 687 | 39 |
| `chatgpt/ghostpay-idle-lifecycle-20261119` @ `7e6089e2e40a2a7daf93961eddef17d3fe8501fd` | 4,169 | 566 | 280 |
| `codex/ghostpay-private-scan-lint-20261119` @ `1b010ec910d04df105fd662cc360629cb0a2f5dd` | 4,535 | 992 | 618 |
| `codex/ghostpay-export-authorization-20261119` @ `b0abb726c138ad1df2f03b7b102c9bd9de318887` | 4,539 | 996 | 622 |
| `repair/ghostpay-qr-surrogates-20261119` @ `ac7b7a11f00896d105fa7a06e44e218046bdc56c` | 4,675 | 1,142 | 756 |

Main tree `e24909bd48515b76bd4110cea90f3a5ac95b239d`: 3,987 blobs. C1 #504 tree `2e069f2b5695ce0ce0d8cc92cbdfe8cdc35eecda`: 4,220 blobs. These are full tree comparisons, not GitHub compare's 300-file limit; they do **not** prove complete semantic review of every differing file. The six branches remain unresolved.

### Specific functional supersession (no duplicate port)

The legacy security-audit branch has an otherwise absent `scripts/tests/verify-release.test.mjs` blob `eaf6ad0f32a4c9e3125af36daf1b3d18780c0e88`. Source inspection confirms that its L7-M2 cases—rejecting a 3-argument release-verify invocation, rejecting a mismatched or empty manifest commit, and failing closed when neither Node nor Python can parse JSON—are now represented in current main's stricter `scripts/tests/release-verify.test.mjs` blob `4ef1353216a4e4503a6e4f49e3f73b437db8b730`, paired with current `scripts/verify-release.sh` blob `27c0734b8ceb55b909f3a3633161ff7155c1f874`. The legacy test **should not be imported wholesale** because its fixtures assume older, less strict release manifest rules. This is **one path-specific supersession**, not finalization of the donor's 643 differences.

### SBOM historical dependency boundary

`ghostpay-sbom-repro-2026-10-27` adds `scripts/tests/normalize-sbom.test.mjs` blob `50a3a4716c959701efc34d49f65b7699f2253dee` and `scripts/normalize-sbom.mjs` blob `086fb534b84cacd5a82615a9c4bb823a80b7f440` for proving archive-integrity before canonicalizing `file:vendor/...` SBOM references. Comparison with `ghostpay-offline-deps-2026-10-27` isolates the test and normalization delta. That older branch depends on the missing vendored `viem-2.22.14-ghostpay-deps2.tgz` plus matching lock entries, while main normalizer blob `49702429a8b6ee4de67c6ce9a5b4eddb4da29bb5` adds newer root-package-name normalization. Porting the old implementation over main would regress the new behavior or reintroduce an unqualified dependency. **Retain unresolved**, not redundant and not ready to merge.

### Active payment/privacy work

Owner-held PR #274 still has unique monotonic invoice-expiry rollback protection, while PR #289 has a strict runtime base64url guard but a known test lint failure. P0-A wallet journal #500, P0-B refund absence proof, C1 #504 and stacked browser fixes #510/#512, and BUG-only #513 remain with their owners. The idle/export/private-scan donor differences include genuine code not in main, but depend on unmerged key-export, network authorization and recovery modules; dependency-aware isolation and security qualification remain mandatory. No owner-held production file was modified by this run.

## Gate truth

Integration-lock ref `automation/ghostpay-integration-lock` still points to `082e754f44944ebb4be283f89176b966bf8f7b4f` (generation 12 released per retained source metadata). A released metadata lock alone does not confer main merge authorization. Branch-protection read remains **HTTP 403**, and no formal independent GitHub review or current exact-head R67 full/browser/payment security acceptance is established. **Zero production application commits, zero main merges, zero deployments/releases, zero real-funds operations, zero branch deletions/force pushes** in R67. Source and exact ledger are retained without declaring consolidation complete.
