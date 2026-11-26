# Policy wallet lock release handoff — 2026-11-23

## Source and finding

This isolated child task starts from PR #500 head `d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea`. The policy action sender awaited transaction preparation and the complete wallet send inside the global durable-attempt lock. Since wallet sending performs asynchronous account/chain rechecks before calling the provider, that held the global lock across the wallet prompt and prevented unrelated tabs from journaling work.

## Intended change

The policy sender keeps a fast duplicate check before transaction preparation, then prepares and performs wallet rechecks without the journal lock. A synchronous callback in `sendViaWallet` repeats the policy-action guard inside the lock immediately before `beginAttempt` and the provider call. The wallet request then remains pending outside the lock; hash persistence uses the existing journal-locked finish path.

## Verification status

- Focused tests passed: `withdrawalJournal.test.ts` and `walletJournal.durable.test.ts`, 20/20 tests.
- Web TypeScript check passed: `npm run typecheck --workspace @ghostpay/web`.
- Web production build and postbuild bundle scan passed. Existing Vite notices mention missing `help.css`, a Node HTTP module externalized by a package, an ineffective dynamic import, and a large app chunk; no build failure resulted.
- Scoped ESLint passed for the three changed TypeScript files; `git diff --check` passed.
- New regression keeps the policy wallet response pending and completes a second, distinct `sendViaWallet` transaction through the same lock manager before the policy response resolves. Existing same-action concurrency regression continues to assert only one provider send.
- Independent read-only review found no blocking correctness issue. The reviewer recommends a stronger real/test Web Locks integration case combining another wallet send and same-scope duplicate attempt; that remains follow-up coverage.
- Hosted CI and a real two-page browser test were not run. Main-target merge qualification remains pending.

## Boundaries

This branch does not change PR #500, main, deployment configuration, contracts or release gates. Refresh source heads and ownership before any integration decision.
