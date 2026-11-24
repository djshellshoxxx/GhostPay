# Regression results

Commands run in this session's container (Node 22, Foundry 1.8.5 with its SHA-256 checked, Chromium pre-installed).
Hosted CI results are linked by run ID. "Local" means this container, not GitHub.

## PR #500 (M1) — local, tree `f4f339cd` (code) / `6725a8b3` (docs only on top)

| Check | Command (in `apps/web`) | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit + coverage | `npm test` (`vitest run --coverage`, then the nocov pass) | 208 files passed, 2 skipped; **3040 passed, 13 skipped, 0 failed**; nocov 3/3; coverage 93.28 stmts / 89.43 branches / 94.73 funcs / 97.01 lines (thresholds 90/85/90/90) |
| Adversarial journal suite | `npx vitest run src/lib/walletJournal.adversarial.test.ts --coverage=false` | 141/141. Against the pre-fix sources of `f4f339cd`, 9 of them fail (QA-1, QA-3, QA-4, QA-5 ×3, lock wait, finish wait, IndexedDB open) |
| Journal-adjacent suites | `npx vitest run src/lib/walletJournal src/lib/duplicateAttemptJournal src/lib/attemptStatus src/features/policy src/components/WalletAttempts src/lib/payExec src/views/Pay --coverage=false` | 685 passed, 4 skipped |
| Anvil browser journey | `npm run e2e:devnet` | see below |
| Mocked browser suite | `npm run test:e2e -- --trace off` | see below |

Earlier failures on this branch, all fixed since (fixes listed per row):

- `b29ef7bc`: hosted beta acceptance (job 138105067481) failed 2 devnet tests. They asserted the old
  "…already exists in this tab." text. Fixed by `3776d9bc`.
- `3776d9bc`: `PolicyReceive.regression.test.tsx`, 2 of 3 failing. The test simulated another tab with a direct
  `localStorage` write that the authoritative IndexedDB snapshot then overrode. Fixed by `4d6770d4`; QA-4 (`f4f339cd`) also
  makes such a record safe.
- `58286528` (before `3a4870e6`): lint `prefer-promise-reject-errors` in `attemptJournalStorage.ts:35`, and
  `BtcView.headers.test.tsx:699` (the test assumed no IndexedDB). Fixed by `25005c51`/`3a4870e6`.
- Hosted `contracts` aggregate red on `b9141125` (job 138105067191): its needed jobs were *cancelled* by a newer push, not failed.

## Main after the #452 merge — `8ddb3449`

- Hosting kit push run 45126815282: success. CI push run 45126815201 was queued when last checked.

## Receipt stack #449 → #450 → #452 (`d0814403`) — independent review

- ux-receipts 146/146 passing. Coverage 99.75/98.28/98.07/99.67. Each PR's regression test fails on its parent and passes on its
  head. Exact-head hosted checks: 35 of 35 success or skipped.
