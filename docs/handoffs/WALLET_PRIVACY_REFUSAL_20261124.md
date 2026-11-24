# Wallet privacy refusal feedback — 2026-11-24

## Source and ownership

- Repository: `djshellshoxxx/GhostPay`; static browser beta.
- Original PR: [#571](https://github.com/djshellshoxxx/GhostPay/pull/571), observed head `63f40efac175e5ee49563326dbef930aafb14235`.
- Isolated successor: `resume/account-privacy-20261124`; worker `/root/reconcile_github_queue`, coordinator `/root`.
- Test-first ownership/regression commit: `f22746db2a7bcf424ac030ccf0264649e0328a03`.
- Runtime candidate: `828d9cb60818a59677756cb105de7b9b3f0dbf18` (independent review remains pending at this handoff).
- The original branch, other workers' claims, Tor fixture, dependencies, workflows, wallet submission helpers and persistence code are unchanged. Root owns publication and integration.

## Defect and correction

The existing final wallet reread detects a silent account or network change and synchronously invalidates the connected wallet before throwing. Pay's privacy callback correctly clears the wallet and prepared payment and advances the operation revision. That makes the old asynchronous error handler stale, so it cannot display the refusal reason. The browser correctly refuses to send but leaves the payer without an explanation.

`useWalletPrivacy` now supplies a small public cause to its callback: `wallet` for an observed or explicitly reread wallet invalidation, and `context` for app locks, session changes and explicit view invalidation. Pay keeps all existing cancellation and concealment behavior, and displays the already translated generic reconnect/review message for the wallet cause. It never revives the old operation or displays an address, provider payload or raw error. Other callers continue to ignore the callback argument.

The existing real-chain network-change journey now expects that generic reason and also verifies that the prepared-payment heading and send button disappear. Its zero-send, empty-journal and unchanged on-chain nonce assertions remain intact.

## Regression evidence

Two new Pay component cases change the account or network silently after preparing a payment. They execute the final reread through the actual Pay view and wallet helper, then require the refusal message, immediate concealment of the old account/prepared action, zero send/sign calls and no attempt-journal entry. Existing lifecycle cases remain unchanged. Hook cases also assert that wallet events and silent rereads report `wallet`, while lock/session invalidations report `context`.

The test-first candidate reproduced the missing behavior: the targeted RED run had 6 expected failures (two missing Pay explanations and four missing wallet-cause arguments), with 27 cases skipped by its name filter. Production code was unchanged at that checkpoint. The full final focused run has 33 passing tests, zero failures and zero skips across both files.

## Executed verification

Commands below run from `apps/web` unless noted otherwise. Direct runner paths avoid older executables in the reusable dependency cache.

| Check | Command / scope | Actual result |
| --- | --- | --- |
| Focused regression suite | `node ../../node_modules/vitest/vitest.mjs run src/lib/useWalletPrivacy.test.tsx src/views/WalletPrivacy.lifecycle.test.tsx --maxWorkers=1 --no-file-parallelism` | 2 files, 33 tests passed; final duration 11.80 s |
| Web typecheck | `node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | Passed, including the final build sequence |
| Typed lint | `node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src/lib/useWalletPrivacy.ts src/lib/useWalletPrivacy.test.tsx src/views/Pay.tsx src/views/WalletPrivacy.lifecycle.test.tsx e2e/devnet-journey.spec.ts` | Passed on all five changed TS/TSX files |
| Lean web production build | `GHOSTPAY_LOCAL_BUILD_PROFILE=lean node ../../node_modules/vite/bin/vite.js build` | Passed |
| Standard postbuild gates | `node scripts/apply-csp.mjs` and `node scripts/scan-bundle.mjs` | Passed; bundle scan checked 17 files |
| Secret scan | Repository root: `bash scripts/scan-secrets.sh` | Passed |
| Whitespace | Repository root: `git diff --check` | Passed |

Runtime: Node 24.22.3, TypeScript 5.9.3, Vitest 5.1.0, Vite 8.3.8, React 19.3.1, jsdom 30.1.3, plugin-react 6.3.0, testing-library/react 16.3.3, user-event 14.6.10, ESLint 10.15.0 and typescript-eslint 8.73.0. The final named runners match this source's declarations. The initial RED run used cached user-event 14.6.8; the final full GREEN run used declared 14.6.10. Dependencies were linked from external caches with isolated tool-version supplements; this was not a clean full-lock installation. All 19 web library dependencies and the additional relayer-guard declaration dependency were built from this checkout. An initial typecheck failed only because the latter declarations had not yet been built; it passed after that unchanged package build. No manifest or lockfile changed.

## Remaining qualification

The local real-chain browser journey was not executed: `anvil` and `forge` were unavailable. Its updated assertion must pass on the published candidate through the existing Beta/devnet workflow. The full web suite, full-profile production build and hosted exact-head CI were not run for this correction. The lean web build used the ordinary local postbuild configuration; it is not deployment acceptance.

The coordinator subsequently carried the existing #373 Settings confirmation fixture correction from `b660b2d8f3f84ddf72f684d13913f643f33f2eee`. The complete corrected `scripts/tor/browser-acceptance.mjs` blob is `835b8e0c609f4a59a1c856397784a5a406945a22`, identical to that reviewed predecessor. Its message exactly matches this branch's `settings.scanPrivacy.saved` English value. `node --check scripts/tor/browser-acceptance.mjs` passed. Origin, request, storage, header and failed-integrity assertions are unchanged. This fixture alone does not establish live Tor routing or Tor Browser support.

Independent source review, refreshed original-head/ownership checks and all applicable hosted gates remain necessary before integration. Nothing was merged or deployed.
