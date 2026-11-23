# GhostPay R9 — exact-head branch reconciliation and integration handoff (2026-11-21 UTC)

## Fixed snapshot

- Repository: `djshellshoxxx/GhostPay`; comparison base `main` **`eb59d93cffed7848c4aac37d0e9650b87239c6da`**, reconfirmed after comparisons.
- Enumerated **447** branch names via `search_branches` pages **100, 100, 100, 100, 47, 0**, including terminal empty page; independently reconciled with Git `matching-refs/heads`: **447** commit SHA refs, no missing names. The new R9 documentation branch was created after this frozen ref snapshot.
- Source-pinned inventory: [BRANCH_HEADS.json](BRANCH_HEADS.json). Twenty-six indexed [COMPARE_*.json](.) evidence files cover **every index 0–446** (no gaps); each records the original immutable head SHA, merge base, ahead/behind, changed file paths, and returned diff stats.
- Comprehensive original-main 433-branch R7/R8 comparisons are retained on current `main`; R9 is a fresh full comparison against **new main** rather than an extrapolation from the old base.

## New exact-main comparison results

| Heuristic class | Branches | Meaning |
|---|---:|---|
| Ancestry-redundant (0 ahead) | **191** | No additional commits relative to this main |
| Positive ahead, code-like changed paths | **125** | Requires semantic and ownership review; not necessarily unique code |
| Positive ahead, non-code-looking changed paths | **75** | May include consequential configs/locales; never blanket-dismiss |
| Positive ahead, capped comparison | **55** | GitHub returned 300 files; inspect per-commit diffs before deciding |
| No common ancestor | **1** | `gh-pages`; separate published-site history, not a missing branch |
| **Total** | **447** | 191 + 125 + 75 + 55 + 1 |

**Important:** The path heuristic treats JSON/YAML as non-code-looking unless a comparison is capped, so category labels are prioritization hints only. The 255 positive-ahead branches have **not** all been adjudicated for semantic uniqueness, security, or merge safety. No source change is integrated merely because its branch is ahead.

[ROLLUP_PART_A.json](ROLLUP_PART_A.json) contains 0–229; [ROLLUP_PART_B.json](ROLLUP_PART_B.json) contains 230–446. No comparison was silently excluded: `gh-pages` correctly reports GitHub 404 `No common ancestor`.

## PR overlap snapshot

[OPEN_PR_OVERLAP.json](OPEN_PR_OVERLAP.json) inventories **139 open PRs** via paginated GitHub REST (50/50/39/0); all 139 PR head branches and head SHAs matched the frozen 447-branch refs. Do not create duplicate implementations when a branch is already under review. PR bases matter: child branches such as #375 → #374 → #368 → #362 → #357 must not be directly merged to main.

Of the 125 uncapped code-path candidates, **80** were exact heads of an open PR and **45** were not; many of the 45 are historical or already superseded. This is ownership association only, not a unique-code count. The other 55 capped branches need per-commit file review.

## Source-checked semantic dispositions

[SEMANTIC_TRIAGE.json](SEMANTIC_TRIAGE.json) includes exact branch heads and Git blob identities.

- **Fully source-redundant despite positive ahead counts:** `chatgpt/zero-codex/ux-guide-plain-object-20261111` (both source/test blobs), `chatgpt/zero-codex/cli-sentinel-value-20261111` (both), `chatgpt/zero-codex/merchant-schedule-horizon-20261111` (its changed test), `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` (its changed file), `chatgpt/zero-codex/onion-canonical-host-20261111` (both), and `chatgpt/zero-codex/ux-confirm-clock-boundary-20261111` (both). Main and donor returned **identical exact Git blob SHAs** for every listed changed path; do not reimport those historical changes.
- **Reject historical privacy regression:** `chatgpt/ghostpay-rpc-filter-guard-20261114` has a different `apps/web/src/lib/scanSpam.ts` blob. Its historical `anonymitySet.partial` checks only the **7-day** history boundary. Current main correctly marks 30-day counts partial until the available **30-day** history is scanned. The donor's RPC token/block refusal already exists on main; blindly cherry-picking would weaken privacy-estimate disclosure. The donor's changed test blob equals main.
- **Recoverable but already owned:** `recover/ghostpay-canonical-json-descriptors-20261121-r10` contains descriptor-based canonical-array validation missing from main. Existing PRs **#270** (superset) and **#265** (subset) own overlapping implementations. PR #270's older exact-head CI has 15 typed-lint errors, six browser failures per profile, and one policy Anvil test failure. Do not open a duplicate feature PR; repair/requalify the existing chain with independent review and preserved assertions.

The above are bounded comparisons only. They do not establish semantic dispositions for all remaining 447 heads.

## Engineering and CI checkpoint

- `main` remains `eb59d93cffed7848c4aac37d0e9650b87239c6da`, with earlier qualified camera privacy and branch-ledger merges #258/#366 already present.
- **PR #369** TRON selected-genesis conflict repair, exact `500ece7a7c99b566ecaad5a8dd0d54fd0022395a`: five hosted workflows passed; changed from draft to **ready for independent GitHub review** during this cycle. It remains a child of #340.
- **PR #370** payment URI runtime nonstring input rejection, exact `3d57d9881033f60786fecb3a71562af445441a3e`: five hosted workflows passed; changed from draft to **ready for independent GitHub review** during this cycle. It remains a child of #360.
- #345, #350, #368 have complete successful required workflows at their cited heads but still require applicable GitHub approval and dependency reconciliation.
- #371 (dormant F04/F05/F10): CI queued at last inspection, modules remain intentionally disconnected and not production enabled.
- #372 recovery/privacy composition: Tor static-hosting failed at the inspected head, core CI queued; #373 native Firefox/WebKit qualification has known browser failures/incomplete jobs. These are blockers, **not** passed gates.
- #376 Solana/TRON library and CLI recovery: CI/Pages were queued and CLI qualification in progress at last inspection; external protocol review remains open.
- Ownership: `automation/ghostpay-integration-lock:integration-lock.json` is **held**, generation **11**, by `994a0d214fb9-root-r3`. Do **not** treat expired timestamps as release; published protocol requires stopped-writer proof or owner release. No shared branch updates, mainline merges, deployments, or releases were performed in this cycle.

## Resume checklist for next independent worker

1. Refresh `main`, complete branch pagination, and exact Git refs. Recompare only moved/new heads first; preserve the R9 frozen baseline and explicitly identify subsequent `main` movements.
2. Review independent PR approvals and every new exact-head check before attempting merges. Do **not** bypass the held integration lock, branch protections, or parent dependencies.
3. For 55 capped comparisons, traverse per-commit changed files or partition merge-base ranges; do not mistake the first 300 returned files for a complete diff. Then semantically triage high-impact unowned candidates, including `45` uncapped code-like branches without an exact open-PR head.
4. Repair the existing #270 source/test/lint/browser qualification before reusing canonical-array work; retain main's 30-day privacy partial guard. For payments/recovery, require exact-head tests and independent review before main integration.
5. Complete accepted static browser-only v1.0/v1.1 beta functionality and noncustodial recovery safety. Preserve explicit wallet authority, private keys in user control, no analytics, no hosted custody, HTTPS/Tor support and fail-closed operations. Do not activate dormant modules without acceptance.
6. Local container checkout could not resolve `github.com`; **no local repository test, build, signing, or security suite was executed by the R9 census worker**. GitHub-hosted check conclusions are recorded with their exact PR head SHA; queued/skipped tests are not represented as passes.
7. Keep this ledger as a **review candidate**. Independently validate enumeration, index continuity, classification, snapshot/main drift and per-file statistics. A docs-only census passing CI is not approval of the remaining code candidates.

This is a source-pinned consolidation checkpoint, **not** a release sign-off or a claim that all unique code has been integrated.