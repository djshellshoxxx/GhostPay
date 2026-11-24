# Wallet attempt status fixture recovery — 2026-11-24 UTC

## Exact source

- Task: finish the missed qualification failure in PR [#545](https://github.com/djshellshoxxx/GhostPay/pull/545), preserving the #500 durable-journal implementation.
- Isolated branch: `codex/recover-wallet-attempt-status-fixture-20261124`.
- Parent: `d1e167f1b5372f74506fc104220b9a03cb6a3e92`.
- Implementation commit: `a50120b47cfb7e412ee21c02d1a92d719944f460`.
- Changed test blob: `b3fb4cc4feafb3fe3e11d06b4d0490093096fcb1`.
- Production files, package manifests, dependencies, workflows and existing PR branches are unchanged.

## Observed failure and correction

Hosted [CI run 45311266153](https://github.com/djshellshoxxx/GhostPay/actions/runs/45311266153), web job `138198190848`, completed 3,057 tests successfully with one skipped, but failed because `WalletAttempts.status.test.tsx` left an asynchronous journal migration outstanding. Its rejection reached `WalletAttempts.tsx:104` after jsdom teardown: `ReferenceError: window is not defined`. This was an unhandled test-lifecycle error, not a failed payment assertion. The isolated original four-test file also passed locally; the hosted teardown race is the reproduction evidence, and a deterministic local reproduction of the original entire-CI failure is not claimed.

The status helper now observes and awaits the **real** production migration promise inside React `act` before making status assertions. Each test explicitly unmounts React and restores spies. No migration result is replaced or ignored in those four status cases.

Two deterministic cases keep migration unresolved until after the view unmounts, then resolve or reject it. Both await settlement before fixture teardown, assert zero RPC calls, and verify no error formatting callback runs after unmount. The existing mismatch, consumed-nonce, different-call replacement and same-call replacement assertions are preserved.

## Verification

Executed in this isolated checkout using Node 24.22.3 and dependencies installed from its committed lockfile:

- `npm ci --ignore-scripts --no-audit --no-fund`: passed; no manifest or lockfile changes. The initial copied dependency tree lacked the newly required protobuf package; it was replaced by this canonical install before final qualification.
- `npm run build:libs`: passed after the canonical install.
- From `apps/web`: `../../node_modules/.bin/vitest run --maxWorkers=1 src/components/WalletAttempts.status.test.tsx src/components/WalletAttempts.test.tsx src/lib/attemptStatus.test.ts src/lib/duplicateAttemptJournal.durable.test.ts src/lib/walletJournal.durable.test.ts src/lib/walletJournal.adversarial.test.ts`: **222/222 tests passed in six files**, zero unhandled errors. The final run includes the delayed-error callback assertions.
- `npm run typecheck -w @ghostpay/web`: passed. The later test-only addition was an error-formatting spy and assertion; final scoped typed ESLint passed as well.
- From `apps/web`: `../../node_modules/.bin/eslint --config ../../eslint.config.js src/components/WalletAttempts.status.test.tsx`: passed on the final test source.
- `npm run ci:scan-secrets`: passed.
- `git diff --check`: passed.

Full web coverage, browser suites and hosted CI were not rerun for this unpublished local child. Independent review and exact-head hosted qualification remain necessary before integration. The parent coordinator owns publication and integration. No shared branch was updated and no deployment occurred.

## Next missed recovery task: seller reconciliation #575

PR [#575](https://github.com/djshellshoxxx/GhostPay/pull/575) at `5a225f6cdaeeaf9c6dad8d8a11f3f437fff83727` continues #533 -> #546. Its Pages [run 45335829578](https://github.com/djshellshoxxx/GhostPay/actions/runs/45335829578) failed in job `138247553517` after 14 browser cases passed, with one failed and one unexecuted.

The failure is the clean-profile recovery case in `apps/web/e2e/pages-devnet.spec.ts:692`: after importing the encrypted reconciliation history, the ledger did not contain the expected `No linked observation.` text. The case has already performed a fresh chain rescan, then imported history. Investigate the rendered invoice status and the import/reconciliation rules before changing either implementation or assertion. Preserve the guarantee that imported labels alone do not establish verified payment credit. Native full/lean/Anvil qualification on #575 remains incomplete; do not call it finished because other workflows passed. This continuation did not edit #575 or its owned paths.

## Existing recovery work to preserve

These live successors were found during this recovery pass; do not recreate their implementations:

- #572 `28bba11cdaebc13edc4d100761ee00750c3f396f`: individual keypair export UI atop #542/#539, with #560 standalone decoder and recovered-spend coverage. Pages, CLI, Hosting kit and Beta acceptance succeeded; CI was queued at inspection.
- #573 `56fb25aa2ff098737dbc181fa88c0aac06425c8e`: sole-key protection and fresh-profile recovery atop #540/#530. Four workflow groups succeeded; CI was queued.
- #577 `2363943571de84bfd5da0b3f167699f34eb53ce7`: retained recovery-only invoice signer on the #544 idle-lock stack. Five workflow groups succeeded; CI was queued.
- #530, #540, #528, #541 and #544 had successful completed CI runs at inspection, despite earlier PR descriptions still calling those gates pending. None was treated as already merged to main.
