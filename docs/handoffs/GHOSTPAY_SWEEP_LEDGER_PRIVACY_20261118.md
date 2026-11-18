# Sweep destination history privacy repair — 2026-11-18

## Source and scope

- Repository: `djshellshoxxx/GhostPay`.
- Base: PR #222, `2bc2098298d90928eb1acafad969f28316bb05fc`.
- Branch: `chatgpt/ghostpay-sweep-ledger-memory-20261118`.
- Worker: ChatGPT security review, Caveman workflow; independently reviewed by the privacy worker.
- Owned changes: sweep destination history source and tests, the two Sweep recording call sites,
  the existing destination-reuse warning in all four locales, and user guidance.

## Confirmed defect and repair

The base implementation unconditionally serialized `{ chainId, destination, sources }` into the
plaintext `ghostpay.sweepDestinations.v1` localStorage key after a sweep. The hygiene ledger's
`@security` contract identifies these address links as private data and requires encrypted-keystore
storage if they are persisted.

The browser now keeps this advisory history only in memory. It never reads or writes a persisted
address-link record. It attempts to remove only the old plaintext key without importing its contents;
denied storage access does not break a completed sweep or its advisory warning.

The ledger resets on app lock and seller-session changes, including a silent session clear detected
by the next access. Both asynchronous sweep call sites capture the current ledger epoch before
starting. An operation that finishes after a lock or key replacement cannot populate the new ledger.
Reads return a separate snapshot so callers cannot mutate the stored history.

Repeated destinations still warn without blocking within the active session. Warning text and user
guidance explicitly state that lock, key changes, and page reload clear the history and that earlier
sessions and other devices are not checked. The existing transaction outcome and duplicate-send
journal mechanisms are unchanged.

## Executed validation

Run from `apps/web` unless noted otherwise:

1. Baseline regression proof before the source repair:
   `../../node_modules/.bin/vitest run src/lib/sweep.destinations.privacy.test.ts --coverage=false --maxWorkers=1 -t 'does not persist|removes only|clears history|blocked cleanup'`
   — 6 failed, 3 filtered out. Failures demonstrated plaintext writes, importing legacy links,
   lock/session retention, and loss of warnings when storage was unavailable.
2. Focused new regressions after the repair:
   `../../node_modules/.bin/vitest run src/lib/sweep.destinations.privacy.test.ts --coverage=false --maxWorkers=1`
   — 9 passed, 0 skipped.
3. Complete affected suites:
   `../../node_modules/.bin/vitest run src/lib/sweep.test.ts src/lib/sweep.destinations.privacy.test.ts src/lib/appLock.test.ts src/views/Sweep.test.tsx --coverage=false --maxWorkers=1`
   — final rerun: 4 files, 171 tests passed, 0 skipped. This includes all 57 Sweep UI tests, a broadcast
   whose completion is delayed until after an app lock, and a storage wrapper without a removal method.
4. From the repository root:
   `node_modules/.bin/eslint --config eslint.config.js apps/web/src/lib/sweep.ts apps/web/src/lib/sweep.test.ts apps/web/src/lib/sweep.destinations.privacy.test.ts apps/web/src/views/Sweep.tsx apps/web/src/views/Sweep.test.tsx`
   — exit 0, no diagnostics.
5. From the repository root: `node scripts/i18n/check.mjs` — exit 0, with existing untranslated/review
   warnings. Translation review status was not changed or certified.
6. `git diff --check` — exit 0.
7. `NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/tsc -p tsconfig.json --noEmit`
   — exit 0. The first attempt caught the existing browser-storage wrapper's get/set-only structural
   type. The fix preserves that input shape and makes legacy removal optional; get/set remain unused.

The first focused UI run failed during scan setup before reaching the changed behavior. The privacy
worker ran the unchanged baseline test successfully in its worktree. Refreshing the six relevant
compiled package outputs from that worktree fixed the setup failure; their source trees were verified
byte-identical before copying. No tracked dependency, scan source, or scan test was changed to obtain
the passing result.

## Limits and integration

- This patch does not provide cross-session or cross-device reuse protection. Any future persisted
  history needs a separately reviewed, encrypted, explicitly opted-in design.
- Legacy removal is best effort; a browser that denies access can retain its old stored value. This
  implementation never reads or updates that value.
- The tests use local fixtures. Live wallet/provider acceptance, real transfers, deployment, full
  application build, and hosted CI were not executed for this patch in this worktree.
- Merge only after review and successful required checks on the actual integrated head. This patch
  does not waive the separate Mythril or other release gates.
