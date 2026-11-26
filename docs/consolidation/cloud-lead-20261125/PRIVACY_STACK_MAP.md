# Privacy-UX / Pages-recovery stack recovery map (main = 32ae3977, 2026-11-25)

Read-only analysis. Conflict counts come from `git merge-tree --write-tree --name-only --merge-base=<own-base> origin/main <tip>`.
"code conflicts" excludes docs/ACTIVE_WORK.md, which conflicts in nearly every PR.

## Foundational finding
Main has NONE of the #372 privacy-mode foundation. These files exist at 055d33e0 and not on main:
`lib/privacyMode.tsx`, `components/SensitiveContent.tsx`, `PrivacyQuickHide.tsx`, `PrivateHistory.tsx`, `WalletDisclosure.tsx`,
`lib/walletDisclosure.ts`, `lib/useWalletPrivacy.ts`, and `scripts/tor/browser-acceptance.mjs`.
Main also has no `docs/privacy-release/`. So #569, #571, #589, #598, #612, #606, #609, #613, #630 and #632 cannot land
without #372 (519 commits, diverged from main by 901 commits) or a re-cut subset of it.
#587 touches only files that exist on main. #570 and #619 are not on #372 at all; their base f7690430 is on main.

## Chains (arrow = "is ancestor of", verified with merge-base --is-ancestor)
```
#372 head 055d33e0  (NOT on main; 519 commits)
  |-- #569 (10 own + 3 native-CI commits)  --> #613 (1 test)
  |-- #571 (13) --> #598 (1) --> #612 (1)
  |-- #587 (3)  --> #609 (1 test)
  `-- #589 (3 own + same 3 native-CI commits as #569)
         --> #606 (1 test) --> #630 (3: 1 test + 2 docs) --> #632 (3: 1 test + 2 docs; re-donates #613's fixture)
main f7690430 (on main)
  `-- #570 (6) --> #619 (4: 2 tests + 2 docs)
main 89b3572f (old main) + ~84-commit unmerged idle-session/Sweep/request-file/Tor consolidation (75 patches not on main by git cherry)
  `-- #544 (own = 5 commits 445c4dd4..4b077d2b; tests+docs)
         |--> #577 (2: signer retention fix + docs) --> #596 (1: native QA note + test typing)
         `--> #582 (5: browser freeze/Sweep idle tests + docs)
```
Shared commits: b660b2d8, 22569e2a and 5299580a (native Firefox/WebKit CI workflow, e2e fixtures) are in both #569 and #589.
A cherry-pick of either PR carries them.

## Table
| PR | own base | own commits | own non-doc files | unique behavior | on main? | conflicts with main (code) | overlap with active owners | recommendation |
|---|---|---|---|---|---|---|---|---|
| #570 | f7690430 (on main) | 6 (a61c4755 7209d363 ccf93d22 d229bbd4 25966864 55781533) | 52 files: errors.ts, relayerClient.ts, tagArchive.ts, notification.ts, transactionOutcome.ts, renderErrors.ts, payExec.ts, Pay.tsx, Solana/TronView, locales | #286 export/notification privacy: tag export filename no longer carries the date; invoice field path dropped from error text; relayer error code allowlist; approval-tx hash and unknown-outcome reference removed from messages; lock-screen title forced generic; React render-error logging scrubbed | PARTIAL. Done on main: bounded deployment diagnostic (deployment.ts:26 "the contract checks failed", 0a7b9037) and createRoot error handlers (main.test.tsx:28). NOT on main: `export.gpa` filename, DisplayMessage `invoiceMessage` (errors.ts:63 still present), `invalid_field`, notification GENERIC_TITLE (notification.ts:324 still custom label), approvedPaymentOutcome reference | 3 code: policy/PolicyCreate.tsx, policy/PolicyPay.tsx, main.tsx (+ACTIVE_WORK) | #664 (app.spec, pages-devnet.spec, BtcView, CreateInvoice, Pay); #584/#586/#610 (payExec, wallet, Pay, Pay.test); #553/#580 (Common.tsx); #585/#600 CreateInvoice; locales shared | RECOVER, minus deployment.ts and main.tsx hunks |
| #619 | #570 | 4 (8dc7bcaa 138b648a fc91f371 3107b816) | hardening.test.ts | tests for neutral deployment diagnostics (genuine and spoofed errors) | YES. Main has the code and a matching test (hardening.test.ts:195, 0a7b9037, #620) | 0 code | none | SUPERSEDED |
| #587 | 055d33e0 | 3 (cfa8131b f4042bf5 19a11f90) | TimestampRetentionControls.tsx, timestampRetentionPolicy.ts, reconciliation-portable.ts, ReconciliationLedger.tsx, reconciliationVault.ts, retentionRecovery.test.ts, reconciliation-retention.test.ts, e2e/invoice-timestamp-retention.spec.ts, 4 locales, securityKeys | #287: explicit, default-off, single-use-CAS cleanup of local invoice registration and receipt-archive timestamps (30/90/0 days). Vault document v4/v5 | NO. `previewTimestampCleanup` and `registeredAt: null` are absent from main; vault is still v3-only (reconciliation-portable.ts:88) | 6 files, all mechanical: 4 locales, ReconciliationLedger.tsx, securityKeys.ts/.test.ts. Vault code merges clean | none (locales/securityKeys shared with all) | RECOVER (owner to confirm the vault v4/v5 format bump; docs call it a v1.1 gate) |
| #609 | #587 | 1 (00078ed6) | scripts/tor/browser-acceptance.mjs, e2e spec | hosting browser qualification for retention | NO, needs #587 and the Tor script (absent on main) | 1 code | none | RECOVER-AFTER-#587 (test only) |
| #569 | 055d33e0 | 13 (10 own c30283d2..349488a5 + 3 native CI) | SensitiveContent.tsx, ConfirmAction.tsx (new), tags.ts, ReconciliationLedger.tsx, WalletAttempts.tsx, Pay.tsx, Scan.tsx, AppShell.tsx, Btc/Solana/TronView, ContextHelp, 12 e2e files, native-browser-qualification.yml | #286 masking: masked workflows detached from the document via portal while state is kept; vault lock revokes visible reveals; reveal timers keep running during confirmations; wallet change revokes reveals | NO. No privacyMode/SensitiveContent on main | 19 code files | #664 (BtcView, Pay); #580 (AppShell, Btc/Solana/Tron views); #672 (Scan.tsx, Settings privacy adjacent); #584/#586/#610 (Pay.tsx) | RECOVER-AFTER-#372 (OWNER-DECISION: re-cut #372's privacy-mode core) |
| #613 | #569 | 1 (17fa04b0) | e2e/accessibility.spec.ts +3 | Firefox reflow qualification | NO | 0 code | none | RECOVER-AFTER-#569; #632 carries the same fixture, so take only one |
| #571 | 055d33e0 | 13 (d3c86d29..63f40efa) | SessionPresentationBoundary.tsx (new), wallet.ts, duplicateAttemptJournal.ts, tags.ts, WalletAttempts.tsx, Pay.tsx, Scan.tsx, Sweep.tsx, CreateInvoice.tsx, RegistryView, useWalletPrivacy.ts | #286 account-switch and vault-lock: transient account data revoked, late wallet/vault results isolated, off-route private checkout retired, unwritten tx hash kept for the original wallet and retried | PARTIAL at best. Main has the attempt journal (#500, c8f892f2 lineage), but not the revoke-on-account-change presentation layer | 12 code | #664 (CreateInvoice, Pay, Sweep); #584/#586/#610 (duplicateAttemptJournal, wallet, Pay, Sweep, CreateInvoice); #553/#580/#585/#600 (CreateInvoice); #672 (Scan) | RECOVER-AFTER-#372 and OWNER-DECISION (heaviest overlap with destination-reuse owner) |
| #598 | #571 | 1 (86450d8d) | useWalletPrivacy.ts, Pay.tsx | keeps a public refusal reason after wallet invalidation | NO | 5 code | #664, #584/#586/#610 (Pay.tsx) | RECOVER-AFTER-#571 |
| #612 | #598 | 1 (e580fcac) | Pay.tsx (+13), lifecycle test | keeps the public wallet notice after encrypted cleanup | NO | 2 code | same Pay.tsx owners | RECOVER-AFTER-#598 |
| #589 | 055d33e0 | 6 (902464ad b0d435d7 697cb731 + 3 native CI) | walletCallSummary.ts (new), walletDisclosure.ts, WalletDisclosure.tsx, wallet.ts, payExec.ts, withdrawalJournal.ts, e2e/wallet-token-disclosure.spec.ts | #287 wallet disclosure: wallet request shows the decoded ABI call and exact fields; dispatch status bound to the exact request; stale review rejected | PARTIAL. The `onWalletRequest` after-dispatch callback is on main (payExec.ts:345, wallet.ts:388, #500). The disclosure layer is not (no `prepareWalletTransaction` or `summarizeWalletCall` on main) | 17 code (many are #372-absent files) | #584 (payExec.ts, wallet.ts) | RECOVER-AFTER-#372 |
| #606 | #589 | 1 (f941ac01) | devnet-journey/flows/pages-devnet specs, Pay.test | actual-handoff retry qualification tests | NO | 4 code | #664 (devnet-journey, pages-devnet), #584/#586/#610 (Pay.test) | RECOVER-AFTER-#589 (test only) |
| #630 | #606 | 3 (68d56e25 9f95198e c484f833) | Pay.signer.test.tsx +4 | signer-pin fail-closed assertion recovered from #386 | NO (Pay.signer.test absent on main) | 1 code | none | RECOVER-AFTER-#606 (test only) |
| #632 | #630 | 3 (cf4e452f 12921de8 0036fe16) | accessibility.spec.ts +2 | Firefox reflow fixture recovered from #613 | NO | 0 code | none | SUPERSEDED by #613 (duplicate fixture), otherwise RECOVER-AFTER-#630 |
| #544 | 45ece45d, inside an unmerged ~84-commit stack | 5 (445c4dd4 6705375d d4e950dc 0dfb203d 4b077d2b) | AppShell.idleClock.test.tsx, e2e/idle-session.spec.ts | tests: first invoice signature after idle sleep, wake-schedule fuzz | NO as written. Main has the original GP-PAGES-04 wall-clock idle lock (AppShell.tsx:137, 710ad0cb) but not the suspended-authority model (`isSessionSuspended` and `app.idle.suspended` absent) | 2 test files (idle-session.spec.ts modify/delete, idleClock.test.tsx) | none | OWNER-DECISION: only worth landing with its base idle stack |
| #577 | #544 | 2 (fb09d2a9 23639435) | AppShell.tsx, session.ts, securityKeys, 4 locales, App.test, pages-devnet.spec | payment-safety: a sole generated invoice-signing key is retained under the encrypted-recovery-only idle lock instead of being wiped (new `app.idle.keptSigner`) | NO. Main still wipes it on idle and shows `signerLost` (AppShell.tsx:159-160, en.json:304) | 1 code: AppShell.tsx (+securityKeys.test) | none | RECOVER-AFTER base idle stack (or hand-port the ~10-line AppShell/session change onto main's GP-PAGES-04 lock; UNVERIFIED that this is safe without suspension) |
| #582 | #544 | 5 (9d66ca31 fc6d43db 85908471 6d7efb7e 9303aecc) | e2e/idle-freeze.spec.ts, sweep.idleDeadline.test.tsx | tests: native tab freeze, delayed Sweep signing after idle | NO (neither file on main) | 0 code | #664 (Sweep) | RECOVER-AFTER-#544 (test only) |
| #596 | #577 | 1 (f637214e) | App.test.tsx (type spy), handoff doc | native qualification record | NO | 1 code (App.test) | none | RECOVER-AFTER-#577 (test only) |

## Main merges that absorbed related work (checked)
- #635 (aaa71a11), #500 (c8f892f2) and 0c2e4e00 cover the wallet-attempt journal and `onWalletRequest`. That absorbs only a slice of #589.
- #641 (60824005) is seller-keystore backup. It does not touch the idle suspension model.
- #640 and #620 cover help/Pages and the bounded deployment diagnostic, which supersedes #619 and part of #570.
- #657 (mobile restore) has no overlap with these stacks.

## Top recovery candidates (privacy/payment-safety value, low conflict)
1. **#570**: 6 commits. Independent of #372, 3 code conflicts, closes real #286 leaks (tag-export filename date, invoice field path in errors, relayer text, lock-screen title, approval hash). Commits: a61c4755 7209d363 ccf93d22 d229bbd4 25966864. Drop the deployment/main.tsx hunks.
2. **#587**: 3 commits (cfa8131b f4042bf5 19a11f90). Only mechanical locale/securityKeys/Ledger conflicts. It is the only #287 retention work. Needs an owner call on the vault v4/v5 format.
3. **#577**: 2 commits (fb09d2a9 23639435). It prevents silent loss of the sole invoice signer on idle. It is small but depends on the suspended-authority base.
4. **#589** with #606/#630: wallet request disclosure. Large value but needs #372 files.
5. **#569 / #571** (+#598/#612): masking and account-switch revocation. Highest user-facing privacy value, but gated on #372 and overlapping Pay.tsx owners.
6. Tests-only (#544, #582, #596, #609, #613, #632): recover only together with their code parents.

## Caveats / UNVERIFIED
- #544's base stack (Sweep consent #325, idle recovery, request-file F03, Tor hosting): which listed or unlisted PRs it derives from is UNVERIFIED. Own base is taken as 45ece45d.
- Conflict counts are against the #372 merge-base. Re-cutting the foundation changes them. Conflict file lists include docs/ACTIVE_WORK.md everywhere.
- Native-CI workflow commits (5299580a etc.): action SHA pinning is UNVERIFIED.
- No tests, builds or GitHub reads were run. Behavior claims come from diffs and grep on origin/main.
