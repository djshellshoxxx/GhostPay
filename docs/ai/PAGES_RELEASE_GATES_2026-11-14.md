# GhostPay Pages beta: independent release-gate inventory (2026-11-14)

This document is a read-only integration/qualification deliverable. It does not certify a release.

## Source pin and ownership

- Parent: owner-controlled draft PR #157, `integration/consolidated-2026-11-14` at `c3e707ade896c5acfebdb5967f4de7c0445740e2`.
- This branch: `chatgpt/pages-release-gate-audit-20261114`, owning **only** this new document and its own registry row.
- #150 owns backup verification, idle lock, and IndexedDB recovery (incorporated into #157 ancestry).
- #158 owns `apps/web/src/lib/relayerClient.ts` and its tests; its corrected head is `9a84764e70603e5f4e0b7bac13bdb6eeec6e469b`. Its PR reports application CI 24/24 green.
- #159 owns `apps/web/src/lib/scanSpam.ts` and its tests; corrected head is `7b6c4983e5c0ba048edf97aaff7399bd77980234`. Corrected-head CI was pending in the PR description at inspection.
- No production source or another worker's branch was modified.

## Integration order / acceptance gates

| Gate | Action | Evidence required |
| --- | --- | --- |
| G1 | Recheck #157, #158, #159 heads and overlap | Exact SHA comparison; confirm whether #158 and #159 are already present |
| G2 | Review and integrate #158 bounded relayer streaming | Preserve 16 KiB early-cancel limit and regression; new combined-head tests |
| G3 | Review and integrate #159 off-filter Transfer log rejection | Wrong token and out-of-range block tests; new combined-head tests |
| G4 | Verify #150 backup and sleep-lock acceptance remains intact | Wrong passphrase, mismatched keys, abort, sleep/resume, IndexedDB blocked-open tests |
| G5 | Qualify final combined source | Typecheck, lint, unit shards, Playwright E2E, Pages verifier, local-chain acceptance, release integrity, secret scan; exact SHA recorded |
| G6 | Release prerequisites | Independent security review, owner-approved signing, public testnet manifests, actual wallet/device journeys, unresolved findings disposition |
| G7 | Pages deployment | Explicit owner authorization; post-deploy smoke against exact artifact, no claim of real-money safety |

## Release blockers and boundaries

- PR #157 is draft and unmerged at inspection; no deploy or audit is claimed.
- PR #158 is separately qualified, **not** automatically integrated into #157.
- PR #159 has a documented RED reproduction and corrective commit; passing corrected-head CI was not established by the PR description at inspection.
- Historical handoff `docs/handoffs/BETA_CANDIDATE_LATEST.md` lists SonarCloud D, policy-router privacy finding AUD24-01, unsigned release key, public testnet and physical wallet/device testing. Re-evaluate against final Pages scope; policy-account feature is deferred and should remain undeployed.
- A static Pages beta cannot guarantee a hosted relayer, private RPC, scheduled server work, or onchain anonymity.
- The default branch README explicitly says no contracts deployed, no hosting configured, and no independent audit as of that README snapshot. Do not infer the integration branch is deployed.

## Verification performed for this document

Read via GitHub connector: PR #157/#158/#159/#150 metadata, parent AGENTS.md, docs/ai/WORKFLOW.md, docs/ai/HANDOFF.md, docs/ai/ACTIVE_WORK.md, consolidation PR ledger, older beta handoff, and default README. No local tests or hosted CI were triggered for this documentation-only branch. PR descriptions are evidence of reported CI, not independently fetched run conclusions.

## Next code task

After checking live CI status, implement **no duplicate fix**: integrate #158/#159 in a new owner-approved combined head, or if both are already contained, select a fresh isolated regression from the remaining Pages acceptance gaps. Keep contract, CLI, relayer server, and native paths out of this Pages-only lane.
