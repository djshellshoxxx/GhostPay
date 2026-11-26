# Small-residual PR triage (read-only)

Main = origin/main 32ae3977b6026991ae0591daf385d3c536e2132f. Method: per-PR merge-base, non-doc blobs differing from main, `git diff` PR-vs-main and mb-vs-PR, `git merge-tree --write-tree`, grep of main for equivalent logic. No builds or tests were run, so "tests pass" is UNVERIFIED everywhere.
"main drift?" = main changed the residual file since the merge-base. "web uses pkg" = non-test import from apps/web/src (chain-adapters 50 files, payment-uri 2 files, all others 0).

| PR | head | title | residual files | main drift? | code conflict? | verdict | scope flag | evidence |
|---|---|---|---|---|---|---|---|---|
| 51 | 5835736c1 | fix(ci): trust only owned GhostPay cloud PRs and pin merge head | .github/workflows/ghostpay-codex-cloud.yml | yes | YES | OBSOLETE | CI/automation, out of product scope | main already has owner check (`"\(.number) \(.head.sha) \(.user.login)"`, l.72), real CI job names (6bb35c66), exact-head review gate (36accea1) |
| 52 | 68dc5b502 | fix(ci): publish only lane-owned files, excluding downloaded patch artifacts | .github/workflows/ghostpay-parallel-agents.yml (new), scripts/tests/ghostpay-parallel-workflow.test.mjs (new) | no | no | OUT-OF-SCOPE | CI/automation agents | adds a 325-line API-funded parallel QA workflow; main has only ghostpay-parallel-review.yml |
| 82 | 122e51710 | fix: install complete manual autonomous agent workflow | .github/workflows/openai-agents.yml (+ agent-prompts conflict) | yes | YES (agent-prompts txt; workflow itself diverged: diff vs main -1339 lines across 20 files) | OUT-OF-SCOPE | CI/automation agents | file absent on main; PR is far behind main (pages.yml/release.yml rewritten) |
| 250 | 22af2074a | Recover historical adapter date, retry and TRON completeness safeguards | packages/chain-adapters/src/{deployments.test.ts,quote.test.ts,rpc.test.ts,rpc.ts} | yes | no | ON-MAIN | F13 (quote.test.ts is fiatToTokenAmount) | rpc.ts NaN-retries guard, calendar-date tests and runaway-cap test all on main (82e369bd, main is a superset). Only leftover: 4-line quote.test.ts decimals test, and main quote.ts l.283 already rejects bad price.decimals; #663 carries a superset of that test |
| 261 | 61f2b3729 | docs(automation): reconcile final review and published checkpoints | scripts/automation/integration-lock.mjs, scripts/tests/integration-lock.test.mjs | no | no | OUT-OF-SCOPE | automation tooling | files absent on main; blobs 47a74116 / f2ef3e9a identical in #261, #296, #299 |
| 296 | a47648872 | docs: record independent checkpoint verification | same two files as #261 | no | no | OUT-OF-SCOPE | automation tooling | identical blobs to #261 (duplicate code) |
| 299 | 77e01d9a7 | docs: record independent checkpoint review and failed CodeQL gate | same two files as #261 | no | no | OUT-OF-SCOPE | automation tooling | identical blobs to #261 (duplicate code) |
| 319 | 627ab977c | docs: preserve SellerKeys completion evidence and publication provenance | apps/web/src/views/SellerKeys.tsx, SellerKeys.operation.test.tsx | yes (heavy: 6 commits incl. b3d85b7d keystore stack) | YES (both) | OBSOLETE | none | src splits vaultBusy into unlockBusy/vaultWriteBusy; main already has that split (SellerKeys.tsx l.76,99-100) via pendingOperation refactor. 3 PR tests ("releases a superseded unlock...", "keeps an independent vault save busy...", "pending vault deletion busy...") absent on main; port only if owner wants them (UNVERIFIED they pass on main) |
| 384 | f3e554077 | docs(handoff): record source-backed ISO rollback and final fail-closed amount fix | apps/web/src/lib/format.ts, format.test.ts | yes | YES | ON-MAIN | none | parseUnits typeof/isInteger/0..36 guard is on main format.ts l.18 (f49cd29b) |
| 405 | 11117b9ff | docs(handoff): pin timestamp guard evidence and integration blockers | format.ts, format.test.ts | yes | YES | ON-MAIN | none | parseUnits + formatUnix guards on main (l.18, l.69; 15fabb4c "port #405/#416") |
| 409 | 8d55b4e39 | docs(handoff): pin cache-control reproduction, commits and outstanding gates | packages/ux-notify/src/cache-policy.ts, cache-policy.nocache.test.ts (new) | yes | YES (src) | ON-MAIN | none | `no-cache` rejection on main (fc81d8e3), PR src diff is only a deleted comment; main already has cache-policy.no-cache.test.ts. ux-notify not used by web |
| 416 | 5d3e21617 | docs(handoff): checkpoint #394 fix, lint gate evidence and exact source pins | format.ts, format.test.ts | yes | YES | ON-MAIN | none | parseUnits, formatCountdown (l.53) and formatUnix (l.69) guards all on main |
| 419 | 62dcc695a | docs(handoff): pin Unicode display boundary repair and verification gaps | apps/web/src/lib/displayText.ts, displayText.truncation.test.ts | yes | YES (add/add + content) | ON-MAIN | none | main handles surrogate cut at boundary (displayText.ts l.50-55, 2ccb0261, 8f56a104) and has its own truncation test |
| 442 | 4bfaffa5d | test(confidential): add synthetic event-field diagnostics for CT-C-2 | packages/confidential-contracts/test/fee-log.forensics.test.ts (new, +89) | no | no | UNIQUE-CLEAN | confidential router (not in stopped list) | test-only, file absent on main, no drift; not run (needs hardhat) UNVERIFIED |
| 466 | 87eb78767 | docs(audit): pin R39 second RED/GREEN repair, exact blobs and Mythril donor triage | scripts/consolidation/branch-disposition.mjs, scripts/tests/branch-disposition.test.mjs (new, +280) | no | no | OUT-OF-SCOPE | repo-audit tooling | consolidation script absent on main; only branch-disposition CSV/JSON/md evidence on main. Owner call |
| 528 | ff274a08d | Stack the wallet callback settlement fix under policy locking | apps/web/src/features/policy/withdrawalJournal.ts (+test), apps/web/src/lib/wallet.ts | yes (wallet.ts: 0c2e4e00, 9ae25773) | no | UNIQUE-CLEAN | none (policy withdrawals; shipped web) | adds `beforeAttemptStart` hook to sendViaWallet (+3 lines, applies cleanly) and drops holding the journal lock across `prepare()` (main still uses `journalLockHeld: true`, withdrawalJournal.ts l.56). Behaviour/design change to lock scope: needs semantic review before taking; tests UNVERIFIED |
| 558 | d24292603 | Record independent P06 source and fixture verification | apps/web/src/lib/keyRoleInventory.ts, .test.ts (new) | no | no | UNIQUE-CLEAN | dormant future module | referenced by no code on main; main BRANCH_INDEX marks it "dormant_future_module_awaiting_qualification, do not activate". Lives in apps/web but unreferenced |
| 559 | 0419d3609 | Record P08 coverage qualification and provider dependency | packages/hygiene/src/future/linkability/historyCoverage.ts, .test.ts (new) | no | no | UNIQUE-CLEAN | dormant future module (P08) | no main reference; hygiene not imported by web; awaiting owner acceptance per BRANCH_INDEX style |
| 595 | 534bb3808 | test(web): complete wallet migration fixture lifetime qualification | apps/web/src/components/WalletAttempts.status.test.tsx | yes | YES | UNIQUE-CONFLICT | none | main already has `afterEach(cleanup)` (cefd0191) and WalletAttempts.tsx guards `mounted`; PR adds migration-ownership fixture + "settles a delayed migration after unmount" test. Test-only, low value; would need manual merge |
| 616 | 7c4987650 | Integrate ten qualified package follow-ups with complete source ancestry | packages/ux-presets/src/seal.ts | yes | YES | ON-MAIN | none | known: superseded (main same logic) |
| 617 | 464a7cb4c | Preserve six additional reviewed fixes and compatible fiat regressions | apps/web/src/lib/qrKinds.ts, qrKinds.test.ts, packages/ux-presets/src/seal.ts | yes | (none reported) | ON-MAIN | none (title mentions fiat) | known: main same logic, stricter `=== true`; not re-derived beyond that |
| 623 | 9e41a4e47 | docs: pin adjacent quoted literal red-green evidence and gates | apps/web/src/i18n/message.ts, message.quoted-literals.test.ts (new) | no | no | UNIQUE-CLEAN | none | stringifyMessage `quote()` now merges adjacent `{`/`}`/`#` into one quoted run; main still emits `'{''}'`-style per char. Shipped (message.ts imported by RichText.tsx, Pay.tsx, Scan.tsx) |
| 626 | 4b6a36a94 | docs: record QR clock rollback regression and qualification gates | packages/ux-intake/src/qr.ts (+1/-1), qr.clock-rollback.test.ts (new) | no | no | UNIQUE-CLEAN | none | `nowMs < cur.startedAt` restarts QR assembly; main lacks it. ux-intake not used by web |
| 627 | 005ca59c5 | docs: record accessible-name repair evidence and pending gates | packages/i18n/src/ux/a11y.ts, a11y.surrogate-boundary.test.ts (new) | no | no | UNIQUE-CLEAN | none | avoids splitting a surrogate pair when truncating accessible name; main slices blindly. packages/i18n not used by web |
| 628 | 0fe0f06f1 | docs: source-pin CSV BOM regression evidence and remaining gates | packages/ux-export/src/text.ts, text.leading-bom.test.ts (new) | no | no | UNIQUE-CLEAN | possible F04 (CSV export for bookkeeping); UNVERIFIED | quoteField now quotes a leading U+FEFF; main does not. ux-export not used by web |
| 631 | bc8fa946c | docs: record source-pinned schedule regression evidence | packages/ux-schedule/src/schedule.ts, schedule.negative-handled.test.ts (new) | no | no | UNIQUE-CLEAN | HOLD: recurring schedule = stopped subscriptions | markHandled rejects negative occurrence; main allows. |
| 633 | 4a13cffec | docs: record exact Swiss locale amount regression qualification | packages/ux-intake/src/nlamount.ts, nlamount.locale-prefix.test.ts (new) | no | no | UNIQUE-CLEAN | none | separatorsForLocale walks `de-CH-x-y` prefixes and replaces all `_`; main only strips to first subtag and first `_`. ux-intake not used by web |
| 634 | 898106124 | docs: source-pinned handle diagnostic qualification | packages/ux-links/src/handle.ts, handle.confusable-case.test.ts (new) | no | no | UNIQUE-CLEAN | possible F08 GhostID / handles; owner check | CONFUSABLES lookup lowercased (case-folded confusables now detected). ux-links not used by web |
| 637 | 02d6a800e | docs: record exact template import repair evidence and pending gates | packages/ux-schedule/src/template.ts, template.import-epoch.test.ts (new) | no | no | UNIQUE-CLEAN | HOLD: ux-schedule (recurring payment templates/subscriptions) | rejects updatedAt > 8.64e15 in parseTemplates; main accepts an invalid Date epoch |
| 663 | d05108873 | docs: record FC-04 local validation results | packages/ux-receipts/src/verify.ts, verify.accessor-boundary.test.ts, packages/chain-adapters/src/quote.test.ts | no | no | UNIQUE-CLEAN | quote.test.ts part touches F13 fiat (test only, main code already guards) | checkChain reads adapter-controlled accessors once (TOCTOU-style snapshot), main re-reads f.* repeatedly. ux-receipts not used by web (chain-adapters is, but only a test changes) |
| 670 | e3e138543 | fix(payment-uri): reject dot path segments and drop default port from invoice-link origin (head is a merge of main; unique commit d4789570) | packages/payment-uri/src/invoice-link.ts, negative.test.ts, vectors.test.ts | no | no | UNIQUE-CLEAN | none | parseInvoiceLink refuses `.` segments and omits :443/:80 from origin so it compares with location.origin; absent on main. Shipped (payment-uri imported by 2 web files). Based on current main |
| 671 | d05b7fa0b | docs(handoff): record exact help containment source and pending qualification (unique commits d05b7fa0 d9213eda 5707996d 462abb0e 26bf59b6; which touch code: take help.html + e2e blobs from head) | apps/web/help.html, apps/web/e2e/static-help.spec.ts | no | no | UNIQUE-CLEAN | none; text aligns with owner directive (dashboard, subscriptions, POS marked Unsupported) | main help.html still says Planned for dashboard/subscriptions/POS; PR relabels them and adds e2e check. Shipped static page. Based on current main. e2e UNVERIFIED |

Notes
- #250/#663 quote.test.ts: #663's 6-line test is a superset of #250's 4 lines; both only add a test (main quote.ts already rejects out-of-range price.decimals).
- #261/#296/#299 are three PRs with byte-identical code; do not take more than one if the owner wants it at all.
- Merge-tree: conflict column counts only non-doc files; docs conflicts ignored.

## Verdict counts (32)
ON-MAIN 8 (250, 384, 405, 409, 416, 419, 616, 617); UNIQUE-CLEAN 15 (442, 528, 558, 559, 623, 626, 627, 628, 631, 633, 634, 637, 663, 670, 671); UNIQUE-CONFLICT 1 (595); OBSOLETE 2 (51, 319); OUT-OF-SCOPE 6 (52, 82, 261, 296, 299, 466);

## Recommended recovery bundle (UNIQUE-CLEAN, beta scope)
Shipped-app code first:
1. #670 payment-uri invoice-link dot segments and default port (cherry-pick d4789570; tests included).
2. #623 apps/web/src/i18n/message.ts adjacent quoted literals.
3. #671 apps/web help.html relabel + static-help e2e (cherry-pick its code commits, skip handoff docs).
4. #528 withdrawalJournal/wallet.ts (clean merge but needs semantic review of lock-scope change).
Standalone packages (not imported by web today):
5. #663 ux-receipts verify accessor snapshot (+ quote.test.ts decimals test, superset of #250).
6. #626 ux-intake qr clock rollback.
7. #633 ux-intake locale prefix.
8. #627 i18n a11y surrogate truncation.
9. #628 ux-export leading BOM (check F04 first).
10. #442 confidential-contracts fee-log forensics test.

## Owner/decision needed
- HOLD (stopped products): #631, #637 (ux-schedule = recurring/subscription); #634 (handles, possible F08 GhostID); #628 (CSV export, possible F04).
- Dormant future modules awaiting owner acceptance: #558 (keyRoleInventory), #559 (hygiene historyCoverage).
- #528: confirm the intended lock-scope design (journal lock no longer held across prepare()).
- #595: test-only, needs manual port if wanted. #319: close, src obsolete; owner may want its 3 SellerKeys tests ported.
- #466 audit tooling and #261/#296/#299 integration-lock (identical code): keep or close; automation, not product.
- #51, #52, #82: CI/agent workflows; #51 obsolete, #52/#82 out of beta scope.
- Close as superseded: #250, #384, #405, #409, #416, #419, #616, #617 (code already on main).
