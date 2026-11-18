# AI development workflow

1. **Discover:** Record default branch HEAD, current task branch HEAD, relevant PRs, active writers, existing tests and deployment target.
2. **Scope:** Define one deliverable, owned paths, dependencies, acceptance criteria and out-of-scope changes.
3. **Implement:** Use an isolated branch or worktree; write regression tests; make small coherent commits.
4. **Verify:** Run targeted tests, then applicable build/lint/integration checks. Report skipped checks explicitly.
5. **Integrate:** Recheck heads and conflicting PRs; do not overwrite another worker; request review and let required CI gate merging.
6. **Handoff:** Record exact SHAs, evidence, incomplete work, blockers and next independent task.

## Model routing
Use stronger reasoning models for architecture, cryptographic correctness, security, difficult bugs and integration. Use faster models for bounded docs, simple tests and mechanical cleanup, subject to review.

## Release discipline
For GitHub Pages, verify static build, browser wallet/provider behavior, failure states, network selection, accessibility, and documentation against actual source. Do not claim private RPC, relayer availability or scheduled backend work from static hosting.

## Conflict policy
If ownership is unclear, inspect active PRs and handoffs first. Prefer a nonoverlapping task rather than changing files claimed by another worker.
