# Haiku workstream status and integration ledger

Coordinator snapshot: 2026-11-11 (UTC). Companion inventory: [PR_INVENTORY.md](PR_INVENTORY.md).

## Anchors

| Item | Ref | SHA |
|---|---|---|
| `main` (source of this branch) | `main` | `bd2652bf1853948594522140a6a0fe0cbe54e32b` |
| Beta integration candidate (PR #98 head) | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7` |
| PR #119 head (integrates #84 tip and #102–#111) | `claude/exciting-brown-7v69cr` | `07968599cd37a98b8fb7b212609bc343e62c5c94` |
| PR #118 head (relayer) | `claude/wonderful-thompson-ir89i9` | `c411a530f52ee4a48805b9656ae13730e44f52d7` |
| PR #114 head (core beta acceptance) | `claude/nice-ritchie-8vivls` | `1bf25be7c5405c0055c3bb99b0ceec8a2226fe23` |
| PR #113 head (hard lane) | `claude/vibrant-cori-scu18b` | `0641d41a4e869b9a1b16d25aa839070b4492bea1` |

## Execution model in this session

- Only one agent (this one) ran. No worker subagents were launched. Each workstream below is therefore either done here or listed as not started.
- Only `djshellshoxxx/GhostPay` was attached (push access). `djshellshoxxx/p2p-offramp` was the default working repo and was not changed.
- Repository state was read from the GitHub API and a bounded shallow clone. No CI run, test suite, or build was executed for any workstream in this session.

## Verified facts

- Open PRs: 75 (53 draft, 22 ready). Full table with head and base SHAs: [PR_INVENTORY.md](PR_INVENTORY.md).
- Ancestry verified (bounded fetch of PR #119 head): PR #84 tip and PR #102–#111 tips are ancestors of PR #119's head. Source changes from those PRs must not be ported again.
- Ancestry **not verified** for PR #113, #114 and #118 tips. They fall outside the fetched 300-commit window.
- Mergeability and CI check status **not retrieved** for any PR (API returned null for `mergeable_state`). Treat every PR as unqualified.
- `docs/CONSOLIDATION_STATUS.md` and `docs/CONSOLIDATION_PROGRESS.md` on `main` (dated 2026-10-22) describe migration as complete. The open-PR frontier shows later development. Those two docs are stale for integration purposes.

## Workstream disposition

| ID | Workstream | Status | Evidence / reason |
|---|---|---|---|
| H01 | Repository and PR inventory | **DONE (docs only)** | `docs/consolidation/PR_INVENTORY.md`. Mergeability/CI not included (NOT TESTED). |
| H02 | Consolidation duplication audit | NOT STARTED | Needs per-module diffs across #98/#113/#114/#117/#118/#119. Deferred to a dedicated pass. |
| H03 | Payment scanner regression tests | NOT STARTED | Needs `npm ci` and the scanner test harness. Build not yet verified. |
| H04 | Receipt and reconciliation qualification | NOT STARTED | Depends on H02 ownership decisions. |
| H05 | Relayer regression qualification | NOT STARTED | Source of behavior is PR #118, which is not verified in `main`. Escalation rules apply to nonce and spend logic. |
| H06 | Relayer operations and CLI | NOT STARTED | Depends on #118 integration state. |
| H07 | QR payload classification | NOT STARTED | Source is PR #117 (stacked on #113). |
| H08 | QR camera and multipart tests | NOT STARTED | Same source as H07. Physical-device qualification is out of scope here. |
| H09 | Device exchange and configuration tests | NOT STARTED | Same source as H07. |
| H10 | CLI/browser parity inventory | NOT STARTED | Requires reading `packages/cli` and `apps/web`; deliverable `docs/cli/FEATURE_PARITY_MATRIX.md`. |
| H11 | CLI usability and error handling | NOT STARTED | Depends on H10. |
| H12 | Real-chain acceptance maintenance | NOT STARTED | Source is PR #114. Local Anvil only; no public-network claims. |
| H13 | CI and workflow reliability | NOT STARTED | Read-only review of `.github/workflows` is possible; no edits made. |
| H14 | Dependency and build maintenance | NOT STARTED | PR #87 (npm major group) is a breaking-change review. Do not bundle with consolidation. |
| H15 | Security regression inventory | NOT STARTED | Read-only; findings must be escalated for crypto, signing and authorization. |
| H16 | Privacy evidence and documentation | NOT STARTED | Source is PR #116 (not on `main`). |
| H17 | README and docs synchronization | NOT STARTED | Depends on consolidation state. |
| H18 | GitHub Wiki organization | NOT STARTED | Source PRs #104 and #112. Wiki access not checked. |
| H19 | Specifications and TODO maintenance | NOT STARTED | Large; needs source-linked evidence per item. |
| H20 | Release packaging and verification | NOT STARTED | Must not publish or deploy. |
| H21 | Accessibility and responsive UI | NOT STARTED | Source PR #73 (device matrix). |
| H22 | i18n and error-message consistency | NOT STARTED | Source PRs #66–#68, #88. |
| H23 | Operational troubleshooting docs | NOT STARTED | Depends on H06 and H15. |
| H24 | Independent integration qualification | **BLOCKED** | Requires a stable candidate SHA, which does not exist yet. CI status not gathered. |

## Duplicate and overlapping work (from inventory only)

- PRs #102–#111 and the #84 tip are contained in PR #119 (verified). Once #119 is qualified, they are superseded.
- PRs #113 and #117: #117 is stacked on #113. Its changes are not yet compared against #113's head.
- PRs #118, #119 and #98 all target the beta integration branch. Overlap between #118's relayer work and #119's "20+ verified defects" is **not yet analyzed**.
- Many `claude/*`, `chatgpt/*`, `codex/*` and `gpt/*` branches have no PR (~150 refs). Not reviewed.

## Integration status

- No worker branches were merged.
- No candidate SHA has been qualified.
- `main` was not modified.

## Unresolved blockers

1. Per-PR CI status and mergeability were not retrieved. Required to qualify any PR.
2. Ancestry for #113, #114 and #118 needs a deeper or full-history fetch.
3. No test, lint or typecheck run has been performed for any GhostPay workstream in this session.
4. The stale `main` consolidation docs must be reconciled with the open-PR frontier before H17/H18/H19 can be finished.
5. Workstreams H02–H23 need separate bounded sessions or worker runs, each with its own branch and file ownership, to produce test evidence.

## Recommended next actions

1. Run H13 and H01's CI-status pass first, because they are read-only and unblock qualification.
2. Run H02 for #113/#114/#117/#118/#119 with a deeper fetch, then decide supersession.
3. Run H03 and H05 in separate branches after `npm ci` succeeds in a clean environment.
4. Keep H15 findings as escalations if they touch crypto, signing or authorization.
