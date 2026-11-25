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

## Owner stop-work directive — expanded 2026-11-25
GhostPay's beta/v1.0 is a privacy payment and recovery client. This directive overrides older completion, consolidation, restart, feature, and worker instructions.

STOP WORK AND ARCHIVE INDEFINITELY: F02 GhostStore; F04 merchant dashboard/analytics; P07 encrypted device synchronization. Preserve the earlier permanent archival of F01 GhostTips, F09 GhostPOS, and F13 fiat conversion. Preserve the earlier deferral of F08 (F8) GhostID, F11 GhostTeams, F12 GhostBridge/P2P-Offramp integration, and F14 multi-chain routing. ALL TEN are excluded from beta and v1.0. No automatic resumption; a new explicit owner instruction is required for any future release.

Do not develop, complete, assign, repair feature-specific behavior, revive, merge feature work, enable, advertise, deploy, or count these features as outstanding beta work. Preserve original branches, commits, tests and research; do not delete or overwrite source refs. Treat `archive/owner-stop-20261125/` refs as frozen snapshots, never as automatic consolidation or feature-completion candidates. Close/archive feature-only PRs with recorded source heads; keep mixed PRs held until excluded feature changes are separated. Already integrated code stays dormant/disabled; verify release exclusion, preserving source and persisted-data compatibility. Existing archived features may receive only containment/exclusion work or a narrowly necessary shared-core privacy/payment/recovery repair, never feature completion.

Preserve ordinary invoice/payment status and reconciliation despite stopping the merchant dashboard; preserve backup/restore, recovery, and cross-tab payment integrity despite stopping P07 sync; preserve exact amount parsing despite stopping fiat conversion. F12 stops only GhostPay's integration with P2P-Offramp, not development of the separate P2P-Offramp repository. Do not start subscription, cross-chain, storefront, POS, team, or new hosted privacy-service programs as part of this beta.

Read current main AGENTS.md and docs/ai/STOP_WORK_20261125.md before planning, assigning, or merging, including when working on an old branch. Keep this task's original allowed operations: status-only tasks remain status-only and narrow tasks remain narrow. Prioritize already-authorized payment privacy, safe signing, recovery and release qualification within that scope. Perform only defensive source review and bounded local tests with synthetic fixtures; no autonomous attacks on deployed or third-party systems.

Canonical feature table, shared-core boundaries and archive record: [docs/ai/STOP_WORK_20261125.md](docs/ai/STOP_WORK_20261125.md). Product recommendations are separately labeled in [docs/product/PRIVACY_PAYMENT_BETA.md](docs/product/PRIVACY_PAYMENT_BETA.md).
