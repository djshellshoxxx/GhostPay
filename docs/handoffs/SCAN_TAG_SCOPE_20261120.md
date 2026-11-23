# GP-BUG-03 — chain-scoped tag list: source-pinned continuation

Cycle: 2026-11-20 UTC; single sequential implementing coordinator. Main/base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Branch: `automation/20261120T1435Z/bug/chain-scoped-tags`.

## Finding and implementation
Audit #312, `docs/notes/bugcheck-2026-11-19/details/browser-state.md`: the previously displayed encrypted tag list stayed visible after switching from Base Sepolia to Ethereum Sepolia, and async vault reads were not scoped. Confirmed by the original auditors on main and the consolidated candidate. This cycle did not re-execute their original reproduction.

- Claim `1cb8ec66ff1cbef56b88ddbb9784e6a9ba08edbe`.
- First two component regressions `bb4a3ba54cd719c346a430156bc19cec7f786eb5` (committed before production change).
- Production fix `14c7bc51f822cf7dd76aac251a01a52c1e4339d1`: remount Tags by selected chain and public seller key scope; clear display before a scoped read; use a cleanup-guarded effect and session-revision check before accepting pending vault results; re-fetch already-unlocked tags on chain switch and return. Existing unlock/lock/wipe actions remain.
- Additional seller-session replacement regression `0a9eabbcaaaf461fcc3a5ee72219aac0184be583`.

Changed runtime path `apps/web/src/views/Scan.tsx`, blob `be2b4828502279c76625b29c60f593f2d1cfaf06`. New test path `apps/web/src/views/Scan.tags.scope.test.tsx`, blob `bb6f3f8731057e58fa047f55915158d17f6039e1`. Exact final commit appears in PR metadata. No changes to payments, contracts, deployment, dependencies, workflows or private-key handling.

## Acceptance and execution limits

Three authored jsdom/Vitest cases:
1. Base list disappears immediately on selecting Sepolia, Sepolia list loads, returning to Base reloads Base.
2. An intentionally delayed previous-chain vault read cannot overwrite the new chain's result.
3. Replacing the seller session on the same chain remounts the scoped list and cannot retain the old label.

These tests are authored/committed, **not locally executed**. Local read-only `git ls-remote https://github.com/djshellshoxxx/GhostPay.git refs/heads/main` failed: `Could not resolve host: github.com`. The local environment has Node 22 and TypeScript 5.8.3 but lacks the checkout, React, Vitest and Testing Library. Therefore no local unit, TypeScript, lint, browser, build or full-security pass is claimed. Hosted exact-head CI and an independent reviewer are required. The original audit's regression is not represented as a new test run.

## Integration / ownership

The metadata-only integration ref `automation/ghostpay-integration-lock` showed **released, generation 7** at inspection. This cycle deliberately did not acquire it, touch shared integration branches, main, or any prior owner's branch. PR #278 also changes Scan for private-scan features but at examined head `417f7c71` retains the unscoped Tags implementation; reconcile that work at final merge, preserving both. New branch is isolated and may merge only after checking newer heads, collisions, required independent review, exact-head CI, and downstream no-deploy behavior. `.github/workflows/pages.yml` publishes only an explicit `workflow_dispatch` on main with `deploy=true`; `release.yml` triggers only on `v*` tags. Repository Pages API/settings were not accessible and must not be assumed configured.

No hosted deployment, release, main merge, force-push, real-funds operation, extra worker, paid API, or security exception occurred.

## Successor

Read live PR, branch commit, current main, lock state and all hosted jobs first. Run committed `apps/web/src/views/Scan.tags.scope.test.tsx` in the repo's standard Vitest workspace command; inspect any failures and fix them test-first on this exclusively owned branch. Run typecheck/lint, relevant legacy Scan suites, hosted full+lean/browser/Pages and security checks. Independently review the exact final source; coordinate with the PR #278 owner to preserve the private-scan changes. Keep draft until all gates are satisfied. Unresolved Mythril and external beta acceptance remain separate blockers.
