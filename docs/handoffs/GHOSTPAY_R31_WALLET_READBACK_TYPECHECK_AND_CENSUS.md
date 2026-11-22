# GhostPay R31 — wallet journal read-back regression compile repair and consolidation handoff

**Cycle:** 2026-11-22 UTC. **Protected main:** `eb59d93cffed7848c4aac37d0e9650b87239c6da` (read through live GitHub branch endpoint). **Scope:** static, browser-only, noncustodial beta; no live wallet/funds, contracts, remote fonts, tracking, relayer, deployment, release or protected-main write.

## Parent and exact-source regression repair

- Original review test PR [#441](https://github.com/djshellshoxxx/GhostPay/pull/441) head `3c21b02194c97c41e6efaffead5520b10697f229`, based on [#440](https://github.com/djshellshoxxx/GhostPay/pull/440) `2b73dec30338e3c33a52d80d2ec7299879301b72`, itself based on [#427](https://github.com/djshellshoxxx/GhostPay/pull/427) `e9404bad766b3ee7d93f54f2172059b9566fcb57`. Do not collapse these without parent-chain review and qualifying combined CI.
- Original [#441 hosting run 44986951997](https://github.com/djshellshoxxx/GhostPay/actions/runs/44986951997) build job 137099544595 and [CI run 44986951996](https://github.com/djshellshoxxx/GhostPay/actions/runs/44986951996) typecheck job 137099544458 both report TypeScript TS2345 at lines 45 and 55 of `apps/web/src/lib/walletJournal.readbackRegression.test.ts`: supplied options `{ storage }` omit required `WalletAttemptOptions.kind`. Verified `WalletAttemptOptions` definition on the exact #441 head has required `kind: AttemptInput['kind']`.
- Isolated repair branch `repair/ghostpay-r31-journal-readback-test-typecheck-20261122` starts from exact #441 head. Ownership claim `304f05c2c2b3825db36dbf62f139b9945e1367d9`; source test-only correction commit `291026127bb0c21d4ead0eedd480bc4625da30ca`. Original test blob `4bc84e29b0478290ecfc907204e89b9a6204600b`; new blob `aed5135fdc123ff801b64ca1f5ace6e65fc17e72`.
- Both calls are now `sendViaWallet(wrappedSession, tx, undefined, { kind: 'transaction', storage })`. No test assertions, runtime logic, mocks, storage semantics, wallet provider, custody or dependency code changed. No new test cases needed: this repairs compilation of the two existing high-value read-back regressions.
- **Verification boundary:** GitHub-hosted exact-head CI and browser tests must complete before ready/merge. The local checkout cannot resolve github.com, so no local Vitest/Playwright run is claimed; source correction is statically type-consistent but not yet qualified at publication.

## Exhaustive R31 branch and PR reconciliation (before creation of this branch)

- Live GitHub REST branch pages: **100/100/100/100/100/9/0 = 509** (terminal empty page); unique names 509. Relative to [immutable R30 504-head JSON](https://github.com/djshellshoxxx/GhostPay/blob/745004a16dbb712a1085d3e7377d9abe951e9599/docs/consolidation/20261122-r30/BRANCH_HEADS.json): **504 exact unchanged**, five new, **zero moved or removed**:
  - `audit/ghostpay-r30-504-reconciliation-20261122` @ `745004a16dbb712a1085d3e7377d9abe951e9599`, main +4/0, docs-only, PR #438.
  - `automation/20261122/bug/ux-notify-manifest-purpose-whitespace` @ `c7a9f9148ceea15b89090b533f31054a77f17765`, main +4/0, isolated production+test, PR #439.
  - `automation/20261122T0438Z/bug/wallet-hash-type-guard` @ `2b73dec30338e3c33a52d80d2ec7299879301b72`, #427 +4/0, main +8/0, production+test, PR #440.
  - `review/427-440-wallet-journal-readback-regression` @ `3c21b02194c97c41e6efaffead5520b10697f229`, #440 +2/0, main +10/0, test-only, PR #441 (compile failures above).
  - `audit/ct-c-2-fee-event-forensics-20261121` @ `4bfaffa5d44f70e86cd63a026a6d919e95cc1d2b`, main +2/0, synthetic diagnostic, PR #442.
- Live REST open PR pages: **50/50/50/50/1 = 201**, 115 main-targeting, 86 stacked; 39 ready, 162 draft at source-freeze. Increment versus R30: five newly opened PRs #438–#442; all prior 196 retained open. Exact source comparisons made for all five new branches, with parent comparison for nested children. Older baseline `main` unchanged, so 504 unchanged branch classifications carry forward without falsely claiming a fresh 504-way semantic audit; **59 historically capped donors remain unqualified**.
- [#439](https://github.com/djshellshoxxx/GhostPay/pull/439) source changes only the supported PWA manifest purpose separator to ASCII whitespace, adds focused valid/invalid tests; five exact-head workflows success including [CI 44985041328](https://github.com/djshellshoxxx/GhostPay/actions/runs/44985041328).
- [#440](https://github.com/djshellshoxxx/GhostPay/pull/440) rejects non-string wallet completion hashes with the existing typed journal failure and adds malformed-hash regressions; five exact-head workflows success including [CI 44986249319](https://github.com/djshellshoxxx/GhostPay/actions/runs/44986249319). Parent #427 and review ownership must be retained.
- [#441](https://github.com/djshellshoxxx/GhostPay/pull/441) had failing TypeScript/build at exact head; do not promote parent unqualified. [#442](https://github.com/djshellshoxxx/GhostPay/pull/442) is synthetic-only fee-event diagnostic for [confidentiality issue #414](https://github.com/djshellshoxxx/GhostPay/issues/414); independent privacy review required, no conclusion of actual leak or correction to contract code.

## Integration lock and unresolved gates

- Live `automation/ghostpay-integration-lock` ref was `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` with `integration-lock.json` status `held`, generation 11, owner `994a0d214fb9-root-r3`. Do not override due to old expiration timestamp.
- [#372 recovery integration](https://github.com/djshellshoxxx/GhostPay/pull/372) remains blocked by unwaived Mythril issue reports (3 Medium, 7 Low in its prior artifact); child #436's Tor test fix does not waive Mythril.
- Require independent review, combined parent-child exact-head CI, custody/backup/recovery regression qualification, Firefox/WebKit browser checks, [#414](https://github.com/djshellshoxxx/GhostPay/issues/414) confidentiality disposition, and review of the 59 capped donor branches before integration.
- No merge, deployment, release, transaction, secret handling or mainline change in this task.
