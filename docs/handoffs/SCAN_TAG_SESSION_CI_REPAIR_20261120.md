# PR #317 exact-head CI regression repair — 2026-11-20

Cycle ID: `20261120T1600Z`. One ChatGPT coordinator ran sequential discovery, code analysis and development. No independent reviewer or concurrent subagent was available.

Base: PR #317 `1e9c5bd40c3d7c0a67564c8598f5cf4fbd7c1ceb` (main at discovery `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`). Branch: `automation/20261120T1600Z/bug/scan-tags-session-lifecycle`.
Ownership claim `3225d8a56441748528327e2012754cfdab05911a`. Tests first `241de08c8e8025aa7a677cbfab0ecc1c77ecac15`. Implementation `e9c8dd4243bd1b5dbe92006bee389a32187c37f0`.

Grounded failures from [exact-head CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44756638658):
- `ts-lint` job `136358604519`: `Scan.tags.scope.test.tsx:100` @typescript-eslint/require-await.
- `ts-test (web)` job `136358604858`: 1 of 3 new tag-scope regressions failed because the test expected replacement tags without re-unlocking after replacing a seller session; also the existing L1-04 test requires a role=alert after a pending unlock is invalidated by changing seller keys.
- All other 22 CI jobs succeeded, including full/lean browser E2E; separate Pages, Beta and Hosting workflows succeeded. That earlier head is still NOT full qualification.

Regression adjustment requires explicit fresh Unlock tags before showing replacement session data; it retains immediate no-stale-tag checks and all existing L1-04 assertions. The obsolete readback async act now awaits its original promise instead of using an await-less async closure.

Runtime preserves Tags component across seller-session revision **within the same chain** so an in-flight unlock can report the existing L1-04 error after its session guard fails. It subscribes to every session revision, immediately locks the vault, discards stale tag rows and revokes the authorized seller identity; it requires a new explicit unlock. Chain changes still force a component remount, avoiding prior-chain flashes. Display is denied unless the vault remains unlocked for the matching authorized seller identity. No keypair export, persistence, signing, chain configuration, cryptographic protocol, deployment or financial policy change.

Verification and limits:
- Original CI logs were examined directly. Two existing new regressions had passed, one failed. Source and tests were inspected and changed through authenticated GitHub connector.
- Local `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed: DNS could not resolve github.com. Node v22.16.0 and TypeScript were available, but local repo checkout, installed Vitest/React/ESLint and full module execution were unavailable. No current-head tests or CI are claimed passed.
- Require hosted exact-head Vitest incl L1-04 and three tag-scope cases, lint, typecheck, Pages and browser CI. Require truly independent review and coordination with PR #317 and #278 owners. If any test fails, preserve its evidence and repair without weakening assertions.
- Integration lock observed released generation 7, not acquired; this is stacked feature/bug repair only. Do not merge into main or deploy.

Next: inspect exact-head hosted runs, repair concrete failures, obtain independent source review, coordinate cherry-pick or adoption into PR #317 without overwriting it, then reconcile broader Scan changes through existing integration coordinator. No deployment, release, paid API, Codex, real funds or branch deletion.
