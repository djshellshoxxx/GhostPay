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
