# GhostPay AI engineering instructions

Read this file before changing code. Read docs/ai/WORKFLOW.md and docs/ai/HANDOFF.md next. Inspect the current branch, commit SHA, open PRs, CI and relevant source before acting. Do not assume an old handoff is current.

## Release focus
Prioritize the static GitHub Pages browser beta. Do not introduce hosted relayers, server jobs, native applications, CLI, or contract changes under a Pages-only task. Preserve other work without broadening scope.

## Parallel work
Use a dedicated branch per task. Before edits, record worker, branch, base SHA, owned paths, and acceptance criteria in docs/ai/ACTIVE_WORK.md on the task branch. Treat claims in other branches and open PRs as active until verified otherwise. Do not overwrite another worker's changes. Reinspect heads before integration.

## Quality
Prefer minimal changes. Add regression tests for behavioral fixes; run relevant tests, build, lint and security checks when available. Report commands and actual outcomes; never claim unrun checks passed. No secrets in commits. Do not mark a feature complete without acceptance evidence.

## Integration
Do not force-push shared branches or merge failing changes. Check PR overlap, dependencies and release behavior. Keep handoffs source-pinned, concise and current.

## Owner stop-work directive — 2026-11-25 (overrides all earlier plans)
PERMANENTLY ARCHIVED: F01 GhostTips, F09 GhostPOS, F13 fiat conversion. Stop all feature development indefinitely; preserve history and donor refs only. Do not resume without explicit owner reversal.
DEFERRED: F08 (F8) GhostID, F11 GhostTeams, F12 GhostBridge, F14 multi-chain routing. Stop development now; excluded from beta and v1.0; no automatic resumption; explicit owner approval for a later release required.
For all seven: do not implement, complete, assign, revive, promote, merge feature work, enable, advertise, deploy or count as outstanding release work. Mark existing branches/PRs as archival or deferred; preserve history, do not delete refs. Mixed PRs must exclude feature-specific changes while preserving unrelated required functionality. Already integrated code must remain dormant and disabled, with no user-facing routes, controls, automatic activation or release exposure; exclude from shipped artifacts where feasible. Verify absence/disabled behavior before beta and v1.0 release. Only containment, release-exclusion verification and necessary shared-core safety maintenance are permitted, not feature development. Preserve core invoice/payment/recovery functionality. This directive supersedes older specs, handoffs, task queues, consolidation and completion instructions. Read current main AGENTS.md before any work, including on old branches.
