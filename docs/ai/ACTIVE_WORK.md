# Browser self-check: mobile WebKit qualification (2026-11-26 UTC)

Worker: Claude Code session on branch `nodata/fervent-mendel-ybw0va` (restarted from main `8c0b110d`). The two
earlier self-check entries below are complete: #703 merged as `6c3acdd5` and #719 merged as `5b65ca3a`. Owned paths:
`apps/web/playwright.mobile.config.ts` (testMatch and grep only), the path filter of
`.github/workflows/mobile-browser-qualification.yml`, one row of `docs/handoffs/MOBILE_BROWSER_QUALIFICATION.md`, the
follow-up list in `docs/handoffs/BROWSER_SELF_CHECKS_COMPLETION_20261126.md`, this entry. Acceptance: the existing
`browser-checks.spec.ts` passes unchanged in the four mobile engine projects (two WebKit, two Chromium) for lean and
full builds in hosted CI; no other spec, workflow step, permission or dependency changes.

# REV-I5: roll back an unsent wallet attempt when the journal mirror write fails after the IndexedDB commit — 2026-11-26 UTC

Worker: Claude session 01KtKj8kHRL9fZ7vjE4teVQN; branch `nodata/tender-mccarthy-a61kj6` (restarted from main `8c0b110d` after #723
merged). Owned paths: the attempt bookkeeping in `apps/web/src/lib/wallet.ts` around `beginAttempt` (no change to the lock,
the journal format or `duplicateAttemptJournal.ts`), one new regression next to the existing mirror-failure case in
`apps/web/src/lib/walletJournal.adversarial.test.ts`, the REV-I5 row of `docs/engineering/SECURITY_FINDINGS.md`. Reuses the
existing QA-5 rollback (`removeUnsentAttempt`). Not claimed: REV-I6, QA-I1, LATE-M1 (needs an owner design decision on a
vault-presence marker), LATE-L1. Acceptance: the regression fails on main and passes with the fix; no wallet request is
ever started for the rolled-back record; a record whose request reached the provider is never removed; web typecheck,
lint, full tests; hosted CI; merge under the integration lock.

---

# P14 finding F1: scan checkpoint ownership (mitigates stale-run overwrites of a newer checkpoint) — 2026-11-26 UTC

Worker: Claude session 01KtKj8kHRL9fZ7vjE4teVQN; branch `nodata/tender-mccarthy-a61kj6` (base main `601f2095`). Owned paths:
`apps/web/src/lib/scanClient.ts` (checkpoint save guard and `localCheckpointStore.save` only), new
`apps/web/src/lib/scanClient.checkpointOwnership.test.ts`, the two PRIV-06 `it.fails` cases in
`apps/web/src/lib/scanClient.checkpoint.test.ts`, the replay-tail recording wrapper in `apps/web/src/lib/scanClient.test.ts`
(forwards the new `expected` argument), the F1 rows of `docs/research/privacy-evidence-matrix-2026-11-10.md`,
`apps/web/DEVIATIONS.md` (if needed) and `docs/handoffs/SCAN_CHECKPOINT_OWNERSHIP_20261126.md`. Overlap: #696 edits other
regions of `scanClient.ts` (cover lookups); rebase/merge whichever lands second. Also owned: the `checkpointSeen` argument
in `apps/web/src/views/Scan.tsx` (one line) and one regression in `apps/web/src/views/Scan.test.tsx`. Not claimed: F2-F4,
other `Scan.tsx` changes; #725 owns `scanCursorSlot.ts`. Also `apps/web/src/i18n/LanguagePicker.test.tsx` (test timing only:
the #696 hunk ported verbatim plus the same wait in the sibling case; it failed this PR's hosted `ts-test (web)`).
Acceptance: both PRIV-06 expected-fail regressions pass as plain tests; a scan that owns the slot can still move its own
checkpoint backward (reorg, replay, user restart); non-persisting stores keep today's behaviour; seeded multi-writer store
fuzz; web typecheck, lint, tests and build; full hosted CI; independent review; merge only under the integration lock.

---
# Browser self-check: IndexedDB availability probe (2026-11-26 UTC)

Worker: Claude Code session on branch `nodata/fervent-mendel-ybw0va` (restarted from main `e7e98109` after #703
merged). Follow-up recorded in `docs/handoffs/BROWSER_SELF_CHECKS_COMPLETION_20261126.md`. Owned paths: the same
self-check files as the #703 entry plus `apps/web/src/test/memoryIndexedDb.ts` (additive `deleteDatabase` and
`databases` for tests only). Acceptance: a fourth local check opens a uniquely named temporary IndexedDB database,
writes and reads one non-secret record, closes and deletes it; refused or missing IndexedDB reports unavailable, a
wrong read, failed delete or no response within the deadline reports failed; nothing is left behind; no change to
any existing IndexedDB store, vault, record format or network behaviour.

# Stack #718: P13 backup test fixture correction (2026-11-26 UTC)

Worker: newghostpay-4e (coordinator); branch `claude/consolidation-stack-20261126`. CI run 45832769192 failed once at
`packages/confidential-amounts/src/future/p13/store.test.ts` because the "corrupt" record could equal the valid one
(about 1 run in 64); the stack was held for a fixture correction. Owned path: that test only. The edit now changes a
middle character to a different one and asserts it differs; every reject and no-write assertion is kept. No P13 runtime,
dependency, contract or activation change. Acceptance: full hosted CI and independent re-review on the new head.

# #706 journal model fuzzing — newghostpay-4e/features2 (2026-11-26 UTC)

Worker: newghostpay-4e/features2, successor after a machine crash. Branch `claude/journal-fuzz-20261126`, local head
`17d55c90` plus this change, merged with main `e7e98109`. Owned paths: `apps/web/src/lib/duplicateAttemptJournal.fuzz.test.ts`,
#706's other paths and this entry. #710 (separate worker) also edits `duplicateAttemptJournal.ts` and adds
`returned.fuzz`/`returned.stress` tests; this change edits no production file.
Acceptance: the 2026-11-26T07:03:35Z review points (independent expected-state model, exact membership, deterministic
sensitivity checks, schema refusal separated from schema-valid edits); every hosted check green at the exact head;
independent review.

## Post-#691/#692 journal fuzzing and audit fix — 2026-11-26 (ghostpay-backup-60)

- Worker: Claude Code session `ghostpay-backup-60`. Branch `claude/journal-fuzz-20261126`, base main `e1d0eb0f7c8688ae280f774f36e01e08d2435deb`.
- Owns: `apps/web/src/lib/duplicateAttemptJournal.fuzz.test.ts` (new seeded model fuzz: never-overwrite hash, duplicate refusal, malformed journal fails closed; a seeded mutant that overwrites hashes is caught), `apps/web/src/lib/duplicateAttemptJournal.clearUnsaved.test.ts` (new), the `clearAttempt` guard in `duplicateAttemptJournal.ts`, one new error key in four catalogs plus `securityKeys.ts`, and two rows in `docs/engineering/SECURITY_FINDINGS.md` (JRNL-L4 fixed; IDLE-M1 recorded as an accepted-design residual risk awaiting an owner decision, not changed).
- Acceptance: the new regression is red before and green after; neighboring journal, policy, wallet-attempt and i18n suites pass; lint is clean; hosted CI is green on the exact head. No change to idle/recovery behavior, thresholds, dependencies, workflows or contracts.

# #707 integration with main `e7e98109` — newghostpay-4e/features2 (2026-11-26 UTC)

Worker: newghostpay-4e/features2, successor of the workers below after a machine crash. Branch
`claude/p0-keys-m2b-successor-20261126`, head `9d373b2b` merged with main `e7e98109` (#624, docs only; the sole conflict
was this file, resolved as a union). Owned paths: #707's owned paths below and this entry.
Acceptance: every hosted check green at the exact head; independent review.

# #707 CI repair — newghostpay-7d/features (2026-11-26 UTC)

Worker: newghostpay-7d/features, successor of the cut-off ghostpay-78 worker below. Branch
`claude/p0-keys-m2b-successor-20261126`, head `13bb8ffc`. Owned paths: #707's owned paths below and this entry.
Change: removed the `exact` role-query option (TS2769, which failed the web build in four hosted checks) from
`SellerKeys.stealthExport.test.tsx`; a string accessible name already matches exactly, so the assertion is unchanged.
Acceptance: every hosted check green at the exact head.

# #707 completion — ghostpay-78 worker (2026-11-26 UTC)

Worker: ghostpay-78 worker, finishing PR #707 after its session ended. Branch `claude/p0-keys-m2b-successor-20261126`,
head `45e4b222` merged with main `194e225c`. Owned paths: #707's owned paths below; the new recovery control's accessible
name (`stealthExport.open.verify`, and `stealthExport.verify.differentFile` that names it) in the four catalogs and the
specs/tests that reference it; review fixes in #707's own new source.
Acceptance: hosted e2e (full/lean), Pages-on-anvil and all other checks green at the exact head; the established
"Verify backup" keystore control keeps its name and every existing spec passes unchanged.

# M2b P0-KEYS successor — #622 onto current main (2026-11-26 UTC)

Worker: Claude Code session `ghostpay-backup-60` (successor; the #622 cloud coordinator `nifty-bohr` is not reachable locally and ghostpay-42 confirmed no driver). Branch `claude/p0-keys-m2b-successor-20261126` = #622 head `8c7ae937a3ef056cd646c5f2d955f803a5ecb2ce` (ancestry kept, original ref untouched) merged with main `e1d0eb0f`.
Owned paths: #622's owned paths (entry below) and the merge resolution: four catalogs (union of #622's 44 keys and main), `SellerKeys.tsx` (StealthExportRecovery kept visible because recovery is allowed while idle-suspended; the archive stays hidden while suspended, per main), this entry.
Acceptance: #622's acceptance below, plus #689 idle suspension: no export or master-key load may bypass suspended authority or the sole-copy replacement confirmation; fresh hosted CI on the exact head; independent review.

# M2b P0-KEYS — archive, master backup and in-app recovery on top of main's individual export (2026-11-24 UTC)

Worker: Claude Worker A (core implementation) under coordinator `session_01Tj2YczsZkZSBgfB5BugRcS` (nifty-bohr).
Branch: `claude/nifty-bohr-5ra2ap`; exact base main `03695a7b`. Source: PR #372 head `055d33e0` (Spec 18) plus this
worker's earlier extraction `d7a11357` (kept on `backup/m2-d7a11357`). Extends main's `07722292` individual export; does
not replace it or its adaptations (`ExportRpc.assertCurrent`, no displayed file names, full credential reset).
Owned paths: additive parts of `apps/web/src/lib/paymentKeyExport.ts` (archive, master backup, recovered-key holders,
open/verify) and new tests beside it; `apps/web/src/components/StealthExport{Archive,Master,Recovery}.tsx` and new
component tests; minimal generalisation of `StealthExportVerification.tsx`; additive mounts in `apps/web/src/views/Scan.tsx`
(archive) and `SellerKeys.tsx` (master backup, open export; PRs #573/#530 also edit SellerKeys: mounts only); matching
locale/security keys; a new archive/recovery e2e spec; `docs/engineering/milestones/M2-P0-KEYS.md`.
Not owned: WalletAttempts*, duplicateAttemptJournal*, reconciliation*, Sweep, relayer, contracts, other docs/engineering files.
Acceptance: encrypted all-discovered archive and master backup behind re-authentication; recovery of any
ghostpay-stealth-* file in a fresh session; tampered/wrong-passphrase/oversize/wrong-chain/unknown-format refused; secrets
wiped; lock/session/chain cancellation; full web, ux-vault and recovery gates; no new endpoint or fallback client.

# Accessibility reflow counts rendered controls only (2026-11-26 UTC)

Continued by worker `newghostpay-7d/small` after the claiming worker was cut off: reviewed the uncommitted one-line predicate change, committed it unchanged and opened the PR. Hosted CI is the gate; no Playwright run on this machine.

Worker: ghostpay-78 worker; branch `claude/a11y-reflow-checkvisibility-20261126` from main `194e225c`. Ports the reflow predicate from open #632/#613 (their other contents untouched; those PRs keep their owners). Owned paths: the `assertReflow` control filter in `apps/web/e2e/accessibility.spec.ts` and this entry.
Acceptance: the filter uses `element.checkVisibility()` (as main's `responsive-pages.spec.ts` already does) so controls inside a closed `<details>` with stale layout rectangles are not counted; every rendered control is still checked against the same viewport bounds and width rule; no assertion, viewport, tolerance, axe rule or timeout changes; full hosted CI (full/lean e2e, mobile) green at the exact head.

# Multi-part QR note names the renamed import control (2026-11-26 UTC)

Worker: ghostpay-78 worker; branch `claude/multipart-note-copy-20261126` from main `194e225c`. Ports d205fc30 from closed #664 (`claude/fc-integration-20261125`). Owned paths: the `create.qr.multipartNote` value in `apps/web/locales/{en,es,ja,ar}.json` and this entry.
Acceptance: the note quotes main's exact `requestFile.summary` label "Scan an invoice QR or open a request file" in all four catalogs; only the quoted label changes; `node scripts/i18n/check.mjs` reports 0 errors; the CreateInvoice multi-part test passes; full hosted CI green at the exact head.

# GP-PAGES-04 idle deadline and real page freeze qualification, successor of #582 (2026-11-26 UTC)

Worker: ghostpay-78 worker; branch `claude/idle-sweep-freeze-tests-20261126` from main `194e225c` (#582 `test/gp-pages-04-frozen-page-sweep-resume` stays open and untouched; it was stacked on #544's old base).
Owned paths: new `apps/web/src/lib/sweep.idleDeadline.test.tsx`, new `apps/web/e2e/idle-freeze.spec.ts`, this entry. Test-only; no product, workflow or dependency change.
Acceptance: a delayed final Sweep simulation returning at 59,999 ms signs and hands off once, while 60,000 and 60,001 ms reach neither `signDigest` nor the handoff; a real Chromium freeze (CDP `Page.setWebLifecycleState`) for 59,999/60,000/60,001 ms and an early resume followed by a delayed periodic check lock or keep authority accordingly in the existing desktop e2e project (full and lean); hosted CI green at the exact head.

# #637 completion — template import epoch bound (2026-11-26 UTC)

Worker: ghostpay-78 worker; branch `automation/20261125/bug/template-import-epoch-bound` (existing #637 head `02d6a800`) merged with main `194e225c` (no rebase). Owned paths: #637's existing files (`packages/ux-schedule/src/template.ts`, `packages/ux-schedule/src/template.import-epoch.test.ts`, its handoff), the ACTIVE_WORK union resolution and this entry.
Acceptance: `parseTemplates` rejects `updatedAtMs` above 8.64e15 (the same bound `readClock` enforces), keeps inclusive endpoints and ordinary round trips; `@ghostpay/ux-schedule` tests pass; full hosted CI green at the exact head before the PR is marked ready. No merge, no other branches.

# GP-BUG — Template import accepts nonrepresentable epoch timestamps (2026-11-25 UTC)

Worker: sequential bug-only coordinator; no independent verifier. Branch `automation/20261125/bug/template-import-epoch-bound`; base `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
Owned paths: `packages/ux-schedule/src/template.ts`, new `packages/ux-schedule/src/template.import-epoch.test.ts`, additive claim here, and `docs/handoffs/UX_SCHEDULE_TEMPLATE_IMPORT_EPOCH_20261125.md`.
Discovery: 249 open PRs enumerated and all changed-file lists inspected for these paths; none edits them. Previous template clock rollback PR #565 is merged; preserve its monotone updates. Existing template.test.ts remains untouched. Recheck inventory before any integration.
Reproduction: exact production blob ffaf6827ff814f40303a5127490caba98ea4c554; parseTemplates accepts 8640000000000001 for both timestamps even though readClock rejects it and JS Date cannot represent it. Minimal acceptance: reject timestamps beyond the same inclusive epoch upper bound as readClock with bad_time; retain valid epoch endpoints, normal imports, monotonic ordering, and atomic list validation. No Pages reachability or funds impact claimed.
Integration lease generation 20 released, not acquired. GitHub DNS blocked native checkout; use isolated source-hash-matched reproduction and hosted exact-head CI; independent review required before merge. No deployment or shared branch edits.

# #631 completion — negative handled timestamp (2026-11-26 UTC)

Worker: ghostpay-78 worker; branch `automation/20261124T2125Z/bug/schedule-negative-handled` (existing #631 head `bc8fa946`) merged with main `194e225c` (no rebase). Owned paths: #631's existing files (`packages/ux-schedule/src/schedule.ts`, `packages/ux-schedule/src/schedule.negative-handled.test.ts`, its handoff), the ACTIVE_WORK union resolution and this entry.
Acceptance: `markHandled` rejects negative and non-integer occurrence timestamps; nonnegative monotonic behavior unchanged; `@ghostpay/ux-schedule` tests pass; full hosted CI green at the exact head before the PR is marked ready. No merge, no other branches.

# GP-BUG — Negative handled timestamp breaks recurring schedule evaluation (2026-11-24 UTC)

Worker: sequential BUG-ONLY coordinator, isolated branch `automation/20261124T2125Z/bug/schedule-negative-handled`; base `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
Owned paths: `packages/ux-schedule/src/schedule.ts`, new `packages/ux-schedule/src/schedule.negative-handled.test.ts`, this additive ownership claim and `docs/handoffs/UX_SCHEDULE_NEGATIVE_HANDLED_20261124.md`. All 243 open PR changed-file inventories at discovery checked; none contains either product or regression path; no conflicting claim identified in main ACTIVE_WORK. Recheck before integration.
Evidence: source blob a8161275fd2efd3c4f47a90a90cf9c4d24016e1c: markHandled accepts negative safe integers, producing lastHandledMs=-1 from a new schedule, whereas evaluateRecurrence rejects negative lastHandledMs. Source-body V8 probes show two failures and four controls passing. Acceptance: test-first rejection of negative timestamps for both fresh and already-handled schedules; preserve nonnegative monotonic behavior and normal evaluation. No funds, runtime changes outside this helper, deployment, or dependency changes. Generation-20 integration lease released, not acquired. Local git DNS unavailable; hosted CI and separate independent review remain mandatory. No direct browser reachability claimed.

# #710 independent review follow-up and merge train #704 (2026-11-26 UTC)

Worker: `newghostpay-4e/train2`, continuing the uncommitted work of `newghostpay-7d/train` after a host crash.
Branches `claude/account-privacy-audit-20261126` (from head `f53e82f1`), `claude/global-masking-286-20261126` (from
`5996aa49`) and `claude/fc05b-main-20261126` (train, from `bfbf6200`). Owned paths for the follow-up: the
terminal-marker lines of `apps/web/src/views/Pay.tsx`, `apps/web/src/views/WalletPrivacy.lifecycle.test.tsx`,
`apps/web/src/components/PrivacyControls.tsx`, `apps/web/src/components/QrFrame.tsx` and their tests,
`docs/handoffs/ACCOUNT_PRIVACY_AUDIT_20261126.md`, this file's registry rebuild and this entry.
`duplicateAttemptJournal.ts` is not changed.
Acceptance: the review findings reproduce in failing tests and pass after the fixes, the existing pending/done
no-extra-send cases and durable journal evidence are kept, `ACTIVE_WORK.md` differs from main by additions only,
full hosted CI passes on the exact train head. No deployment, contracts, live wallets or funds.

# FC-05b onto current main: Bitcoin retained-sweep and session pending-spend guards, superseding #669 (2026-11-26 UTC)

Worker: Claude Code session `ghostpay-42`, continuing the orphaned FC round-1 PRs (entry below). Branch
`claude/fc05b-main-20261126` (PR #704), base main `a9d2a033`, main merged in at `019d5d18`, `e1d0eb0f`, `6c3acdd5`. Input: #669 exact head `8ea606ff`, merged
`--no-ff` as `a86cc353`. Donor branch and PR untouched. #669's CHANGES-REQUIRED review of the pending-spend guard
(M1/L1/L2/M2) is addressed in `d22db6fa` (red tests), `ebda107d` (fix) and `b39bfd8e` (independent re-review fixes).
Owned: `apps/web/src/features/btc/BtcView.tsx` and its pendingSpend/retainedSweep tests, the
`btc.scan.pendingSpend` key in four locales and `securityKeys.ts`, #669's scanner/state/worker test additions, the
FC-05b consolidation note, the Bitcoin case of `chainViews.i18n.test.tsx` "keeps an earlier broadcast reference separate", this entry. Stop-work check: full profile only, testnet proof of concept, sweep fund safety.
No F14 routing or chain-scope change. Acceptance: M1/L2/M2 tests red at `a86cc353` and green at the head; hosted CI
green at the exact head; merge through the shared lock queue.

# #286 item 1: global sensitive-data masking onto current main (2026-11-26 UTC)

Worker: Claude Code session `ghostpay-68`. Branch `claude/global-masking-286-20261126`, base main
`e1d0eb0f7c8688ae280f774f36e01e08d2435deb`. Main has no masking module; the donor line (#569 `c30283d2` over #373,
diverged 2026-11-20 by 319 files) is a mixed historical composition and is not merged. Narrow hand port of its masking
mechanism (`privacyMode.tsx`, `SensitiveContent.tsx`, `PrivacyControls.tsx`, `PrivacyQuickHide.tsx`; spec
`docs/privacy-release/v1-01-masking.md` on that line) with `Recovered-from:` trailers; donor refs untouched.
Owned paths: new `apps/web/src/lib/privacyMode.tsx`, `apps/web/src/components/{SensitiveContent,PrivacyControls,PrivacyQuickHide}.tsx`
and their tests; the provider/boundary hunks in `apps/web/src/AppShell.tsx`; the masked body of the wallet request
review in `apps/web/src/components/WalletDisclosure.tsx`; one reveal-revocation line in `apps/web/src/lib/useWalletPrivacy.ts`;
additive `privacyUx.*` catalog keys and a security-key group; user doc `docs/user/privacy-masking.md`; this entry and a handoff.
Not owned: Settings model/`settings.ts` (the preference is a separate store so toggling never invalidates in-flight
payment or Sweep consent bound to saved settings), clipboard (#687), account/vault revocation (#691), private history
gate (#691), exports (#675), BTC/Solana/TRON PoC views, Pay/Sweep/Scan internals.
Acceptance: default off; when on, masked routes, the live region and the wallet request review are absent from the
live document (text, attributes, form values, accessibility tree), not merely blurred; reveal is deliberate, expires
within 30 s on both clocks, fails closed on clock rollback and is revoked by navigation, lock, session change, hidden
tab, page exit and wallet invalidation; drafts and sole-copy keys survive masking; unreadable or invalid saved
preference fails closed to masked; light fuzz of the reveal clock model; web typecheck/lint/tests; hosted CI incl.
full/lean browser on the exact head. No dependency, workflow, contract, network or deployment change.

# Account/vault/session privacy: light fuzz, stress, QA and bug/security audit (2026-11-26 UTC)

Worker: Claude Code session `ghostpay-68`, on the owner's instruction after reviewing #697/#698 (APPROVE sent to the
integration coordinator `ghostpay-backup-60`). Branch `claude/account-privacy-audit-20261126`, base #698 head
`f45025b5f2cfa27f938c10c35490b42768b8ae0a` (= #692 `c7b9badc` + #691 `6b4bbe17` + main `019d5d18`); rebased onto main
after #697/#698 land. Does not push to or move the #697/#698 integration branches or any donor ref.
Owned paths: new fuzz/stress test files beside `apps/web/src/lib/duplicateAttemptJournal.ts`,
`apps/web/src/lib/useWalletPrivacy.ts` and `apps/web/src/components/SessionPresentationBoundary.tsx`; a narrow fix in a
#691/#692 runtime file only for a defect confirmed by a failing test (reported to the coordinator first); this entry and
`docs/handoffs/ACCOUNT_PRIVACY_AUDIT_20261126.md`.
Acceptance: bounded fast-check properties (existing pinned dev dependency, no new packages) and stress cases pass; any
confirmed defect gets a failing-then-passing regression; assertions, coverage thresholds, timeouts and release gates
unchanged; affected web typecheck/lint/tests pass locally and full hosted CI passes on the exact head. No deployment,
contracts, live wallets or funds.

# Seller keystore recovery: audit follow-ups after the #693 close-out (2026-11-26 UTC)

Worker: Claude Code session `newghostpay-77`; branch `claude/keystore-recovery-followups-20261126`, base main `e1d0eb0f`.
Why: #693 verified complete (no regression). The close-out review and a follow-on audit of the same restore path found
three gaps (a prompt bug, a restore step that could pass without running, a path filter that missed the spec's inputs).
Owned paths: `scripts/recovery/stealth-export-recover.mjs` (terminal passphrase prompt only), its tests in
`scripts/recovery/seller-keystore-recover.test.mjs`, the `paths` filter of
`.github/workflows/mobile-browser-qualification.yml`, the wrong-passphrase step of
`apps/web/e2e/devices-mobile-restore.spec.ts`, the header comment of test-only
`packages/ux-vault/src/keystore-portable.vectors.testutil.ts`, this entry. No application, codec, format, vector or
dependency change.
Acceptance: the prompt fix has a regression test that fails without it; the WebKit phone/tablet workflow, with the
changed restore spec, runs on the exact head; hosted CI green.

# BUG — deterministic unsupported-locale formatter fallback (2026-11-25 local / 2026-11-26 UTC)

Worker: GhostPay bug-only sequential worker. Branch `automation/20261126/bug/i18n-unsupported-locale-fallback`; base `a9d2a033c1055c59765b388a02512c6285764dae`. Owned paths: `packages/i18n/src/ux/format.ts`, new `packages/i18n/src/ux/format.unsupported-locale.test.ts`, this additive claim, new `docs/handoffs/I18N_UNSUPPORTED_LOCALE_FALLBACK_20261126.md`. Scope: existing documented English fallback for unsupported number/date locales; no new feature, amount parsing, fiat integration, network, payment, dependency or release changes. All 223 open PR file inventories from the initial date-partitioned search plus three newly published PRs (#697–699) checked without an overlap in `packages/i18n/src/ux/`; no direct formatter claim in main ACTIVE_WORK. Recheck before integration. Acceptance: test-first deterministic injected non-English default and native source-matched reproduction, preserve supported/invalid locale and RangeError behavior; exact-head CI, independent review and legitimate integration lease required. Baseline isolated Node 22.16.0 with LANG=de_DE.UTF-8: 8/12 probes pass, four fallback failures; four source Git blobs hash-verified. Generation 40 integration lease observed released, not acquired. No other branch writes or merge.

# Security remediation PR #220 — refresh onto main `e7e98109` (2026-11-26 UTC)

Worker: Claude session 01KtKj8hxPXds2YXGcbiFzEw; branch `security/mythril-full-remediation-20261118` (base `5467c158`, merged
with main `e7e98109`). Owned paths: agent path policy and runner pins in `.github/workflows/*` and
`.github/actions/setup-forge/action.yml`, `scripts/tests/ghostpay-{automation-hardening,parallel-review-workflow}.test.mjs`,
`packages/confidential-contracts` (A-3 no-copy forward + ReturnBombStealth test), `packages/core-crypto/src/viewing-key-boundary.test.ts`,
the `confirm()` doc comment in `packages/ux-flow/src/reconcile.ts` (no code change), `packages/contracts/DEVIATIONS.md` P3 note,
`docs/audits/security-remediation-20261118.md` and `docs/audits/data/mythril-local-20261118/`. `packages/contracts/src` untouched.
Not claimed: `classifyAmount` tolerance validation (reported on #220 by the owner account), D-1 payer binding, #213/#217/#212 scopes.
Acceptance: regression tests fail before / pass after each fix; full hosted CI green on the exact head except the base-wide Mythril gate.

---

# #701 review upkeep (2026-11-26 UTC)

Worker: `newghostpay-4e/reviewer2`; branch `nodata/zen-dirac-vkl84j` (#701), merged with main `e7e98109`. Owned paths:
this record's "Remaining items" correction, one wording correction in the earlier ghostpay-71 entry below, the
ACTIVE_WORK union and this entry. Docs only.

# ghostpay-78 worker: #701 account-privacy verification record refresh (2026-11-26 UTC)

Worker: ghostpay-78 worker; branch `nodata/zen-dirac-vkl84j` (#701), base main `194e225c`. Owned paths:
`docs/handoffs/ACCOUNT_PRIVACY_INDEPENDENT_VERIFICATION_20261126.md`, this entry. Acceptance: re-verified that
`e1d0eb0f^{tree}` equals `f45025b5^{tree}` (`3dc2d133`), that #697 and #698 are merged and that the recorded push CI runs
concluded success; main merged in without rebase; docs-only; full hosted CI green on the exact head.

# Docs #624 refresh — engineering trackers against main `194e225c` (2026-11-26 UTC)

Worker: `newghostpay-7d/small`, continuing the cut-off docs worker on branch `claude/keen-volta-8ctx9x`. Owned paths:
`docs/engineering/ESSENTIAL_FEATURE_MATRIX.md`, `ESSENTIAL_FEATURE_PROGRESS.md`, `FEATURE_INTEGRATION_LOG.md`,
`REMAINING_WORK.md` and this entry. The cut-off worker's uncommitted matrix edit was a file of NUL bytes only (no text
to recover), so it was rewritten from the last commit. Docs only; facts checked against git history and GitHub PR and
run records.

# W4 — #287 privacy-minimal invoice links and exports, successor of #585/#600 on main (2026-11-26 UTC)

Worker: W4 (`ghostpay-backup-60`); branch `claude/privacy-minimal-invoices-successor` from #600 `c8f892f2` (contains #585 `b82be893`; ancestry kept, originals untouched) merged with main `0afab048`.
Why: the previous W4 (feature-completion-06's subagent) exited before continuing #585/#600; ghostpay-42 and newghostpay-ae confirmed no driver.
Owned paths: #585/#600's files and the merge resolution in `apps/web/src/views/CreateInvoice.tsx` link row (main's auto-clearing Copy, #585's exact-link .txt download and #688's request-file download, all three kept), this entry.
Acceptance: minimal mode omits memo and item breakdown after totals are computed; payment and verification fields, canonical serialization, signatures and envelopes unchanged; downloads carry the exact signed link; full hosted CI on the exact head.

# PR #585 native typecheck resumption — 2026-11-24 UTC

Worker: `/root/recover_local_workers`, coordinated by `/root`. Isolated successor branch `resume/privacy-minimal-typecheck-20261124`; exact saved parent #585 `b82be893d3d360064222fafcce8cef2033cd23a5`, main observed `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own only the invalid role-query option in `apps/web/src/views/CreateInvoice.ordering.test.tsx`, this additive claim, and `docs/handoffs/PR585_NATIVE_TYPECHECK_20261124.md`.

Acceptance: reproduce TS2769 from the unsupported `exact` option, remove only that option after verifying the string accessible-name matcher remains exact, retain every privacy-minimal and stale-result assertion, and run focused native tests plus full web typecheck and scoped typed lint. Preserve all production code, dependencies, schemas and signing/payment behavior. #586, #571, Pay paths and original owner branches remain outside this assignment. Root owns independent review and publication. No merge, deployment or real-funds operation.

---

# Issue 287 invoice metadata minimization

Worker Codex, branch `feature/287-minimal-invoice-sharing`, base `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own the metadata choice in the Pages invoice builder, Create Invoice and merchant template issuer, their disclosure copy and tests, plus the v1.1 release matrix entry. Keep #553’s clipboard action and #570’s existing export surfaces with their owners. Acceptance covers normal and minimal signed links, local file export and import, absent descriptive fields, preserved payment terms, stale-result invalidation, and tamper rejection in the existing verifier.

---
# Browser self-check feature completion (2026-11-26 UTC)

Worker: Claude Code session on branch `nodata/fervent-mendel-ybw0va`, base main `019d5d18`. Consolidates the
existing self-check footer: #395 (`1edc524e`), #402 (`3c9b96d0`) and #412 (`087ecf7e`) are all ancestors of main; no
other open PR or branch touches these paths. Owned paths: `apps/web/src/lib/browserChecks{,.test}.ts`,
`apps/web/src/components/BrowserChecks{,.test}.tsx`, the `.browser-checks` rules in `apps/web/src/styles/app.css`,
`app.checks.*` keys in `apps/web/locales/*.json` and `apps/web/src/i18n/securityKeys.ts`, an additive footer test in
`apps/web/src/AppLean.test.tsx`, new `apps/web/e2e/browser-checks.spec.ts`, the self-check rows in
`apps/web/help.html` and `apps/web/privacy.html`, `docs/handoffs/BROWSER_SELF_CHECKS_COMPLETION_20261126.md`, this entry.
Acceptance: distinct passed/failed/unavailable states, per-check explanations for unsupported capabilities, safe
handling of absent or throwing browser APIs, same footer in full and lean shells, truthful help/privacy text; web
unit tests, typecheck, lint and build pass. No change to integrity verification, cryptography, signing, wallets,
payments, network egress or release gates.

# Owner decision: persistent vault timestamp retention deferred (2026-11-26 UTC)

Recorded by Claude Code session `ghostpay-42`. The owner deferred the persistent half of #287 item 4 until after the
v1.0 beta: invoice-registration and receipt-archive timestamp cleanup in the encrypted reconciliation vault (#383 →
#587 → #609). Reason: a v3 → v4/v5 vault format change that older app builds and the CLI cannot open, applied to
recovery-critical data, for a small privacy gain. No worker may claim or implement it without new owner approval. The
donor branches and PRs stay open and untouched. The on-screen presentation half is on main (#676). Spec:
`docs/specs/19-local-metadata-retention.md`. #287 stays open (v1.1).

# Orphaned FC round-1 PRs onto current main: FC-03 and FC-05a (2026-11-26 UTC)

Worker: Claude Code session `ghostpay-42`, on the owner's instruction to finish the orphaned feature-completion PRs
(coordinator `feature-completion-06` exited before merging candidate #664). Branch: `claude/fc-round1-rest-20261126`,
base main `1bea3df3`. Inputs merged with `--no-ff` at their exact reviewed heads: #648 FC-03 `a13ab24d`, #661 FC-03-T
`a2b14ca8`, #656 FC-05a `8e7b1915`, #662 FC-05a-T `22c3cb1d` (each green at its own head; reviews APPROVE or
APPROVE-WITH-NITS, recorded in `docs/consolidation/feature-completion-20261125/CAMPAIGN.md` on the coordinator branch).
Already landed by others: #650 (in #688), #663 (in #690), #649 (as #683 by W3). Not in this branch: FC-05b #669, which
has an unaddressed CHANGES-REQUIRED review on its pending-spend guard; it follows as a separate PR after this lands.
Stop-work check: no F14 routing, bridging or chain selection; FC-03 adds mainnet refusals to existing PoC libraries,
FC-05a reduces Bitcoin provider disclosure (consent-only spent checks). Owned: this branch only; donor branches untouched.
Acceptance: hosted CI green at the exact head; merge through the shared lock queue.

# W3 follow-up to #647: one canonical v1 seller keystore vector (2026-11-26 UTC)

Worker: W3 (`ghostpay-backup-60`); branch `claude/w3-keystore-canonical-vector`; base main `1bea3df3` (#647 merged via #684).
Owned paths: `packages/ux-vault/src/keystore-portable.vectors.testutil.ts` and `keystore-portable.vectors.test.ts` (test-only), this entry.
Change: the ux-vault known-answer, fuzz and mobile-restore e2e tests read #647's canonical `test-vectors/seller-keystore-v1.json` instead of a second hard-coded v1 file (agreed with #647's author). No production, vector or format change.
Acceptance: affected unit tests and the device-restore e2e pass in hosted CI on the exact head.

# SEC-1 follow-up — in-app payment-key warnings name the payer (2026-11-25 UTC)

Worker: Claude Code session `ghostpay-15` (the PR #647 session). Branch `claude/sec1-payer-key-warning`, base main
`aaa71a112d90fd39f59b40de9f139e9cfdc62d61`. Finding (from the #647 audit): in scheme 1 the payer chose the ephemeral
secret, so the payer knows the tweak and can compute the master spending key from a revealed one-time key. The
in-app warnings cover only viewing-key holders. Owned paths: the values of `stealthExport.details.futureDeposits` and
`stealthExport.raw.confirm.body` in `apps/web/locales/{en,es,ja,ar}.json` (all four hold the same English today), new
`apps/web/src/i18n/stealthExportPayerWarning.test.ts`, this entry. Not owned: StealthExport components (#622 and
earlier owners), other locale keys. Acceptance: both warnings name the payer and say never to send the key; no
catalog keeps a stale English copy; the i18n check has 0 errors; i18n and StealthExportPayment tests pass.

---

# W3 — successor of #649 (FC-02 Sweep balance consent) with stale-consent binding (2026-11-25 UTC)

Worker: W3 (`ghostpay-backup-60`); branch `claude/w3-sweep-consent-successor`, from #649 head `790de53e` (ancestry kept; original branch untouched) merged with main `e2c11634`.
Why: #649 (all hosted checks green at 790de53e) and its combined candidate #664 lost their driver when feature-completion-06 exited; ghostpay-42 and newghostpay-ae confirmed nobody else took it.
Owned paths: #649's files (`apps/web/src/views/Sweep.tsx`, `Sweep.privacy.test.tsx`, `Sweep.quoteLifecycle.test.tsx`, `Sweep.test.tsx`, `lib/scanPrivacy.ts` disclosure line, e2e journeys), the merge resolution with #674/#675 in Sweep, one additive `sweep.balanceRead.settingsChanged` key, this entry.
W3 addition: a balance read is consented to for the saved RPCs and scan privacy settings Sweep opened with; if another tab changed them, nothing is sent (checked at the click and again after the RPC lookup) and a late balance is discarded. #675's live-region rule is kept: the new message names no address, amount or hash.
Acceptance: #649's tests plus two stale-consent regressions; full hosted CI on the exact head.

# FC-02 — Sweep balance consent and quote/signing lifecycle onto current main (2026-11-25)

- Worker: fc02 (Claude Code implementation worker, feature-completion campaign). Branch `claude/fc02-sweep-consent-20261125`, base `origin/main` `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f`. Donor: PR #534 head `5c93c3b172cd002f1cdc68232b1a0f3335aadb76` (merged with `git merge --no-ff`; #252 `4085622463411d3ba27f4efb7b73a70575170535` and selected #272 commits `ab40d79a`, `9e4ec2da`, `a67d0975` stay in history).
- Owned paths: `apps/web/src/views/Sweep{,.test,.privacy.test,.quoteLifecycle.test}.tsx`, `apps/web/src/lib/scanPrivacy{,.test}.ts`, `apps/web/locales/*.json`, `apps/web/src/i18n/securityKeys.ts`, e2e specs `core-journey`, `devnet-journey`, `pages-devnet`, `sweep`, this entry, and `docs/consolidation/feature-completion-20261125/FC-02-sweep-consent.md`. Not touching #586 or #610 work.
- Acceptance: Sweep balance refresh only after explicit consent; any change to quote, amount, destination, chain or account invalidates the pre-broadcast signing context; post-handoff evidence retained; current-main Sweep/scanPrivacy behavior preserved; focused tests, typecheck and lint pass; hosted CI pending until reported.

# W3 — EVM provider/privacy boundary: fail-closed scan privacy settings and per-request route checks (2026-11-25 UTC)

Worker: W3 (Claude Code session `ghostpay-backup-60`, home team per `%USERPROFILE%\GhostPay-coordination\TEAM.md`); branch `claude/w3-provider-privacy-boundary`; base main `32ae3977`.
Builds on, without taking over: #658 (RPC disclosure evidence), #228 (dispatch-time own-node guard idea; not on main), #649/#664 (Sweep balance consent, owned by feature-completion-06).
Owned paths (milestone 1): `apps/web/src/lib/scanPrivacy.ts`, new `apps/web/src/lib/scanPrivacy.integrity.test.ts`, the scan-start wiring in `apps/web/src/views/Scan.tsx` (route guard only), additive `scanPrivacy.*` keys in the four locales and `apps/web/src/i18n/securityKeys.ts`, this entry and `docs/handoffs/W3_PROVIDER_PRIVACY_BOUNDARY_20261125.md`.
Acceptance (M1): saved scan privacy settings that are present but not exactly valid, or a storage read that throws, never fall back to Direct; scanning is blocked with a review message, the second RPC is skipped and Sweep stays on-request until the user saves valid settings.
Acceptance (M2): every scan request (custom endpoint transport including retries and chain re-checks, the app RPC client, the indexer fetch and the second RPC) re-checks the saved scan privacy settings and the RPC URLs it started with, before sending and after the answer; a change in this or another tab stops the scan with a typed error and discards the delayed answer. Submitted hashes, checkpoints and recovery records are not touched.
Out of scope: wallet-extension traffic (explained, not controlled), Tor/proxy certification, new transports, F14 routing.

# External wallet disclosure gate on main (#287 item 3; owner gate 4) — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`. Branch `claude/w-wallet-disclosure-287-20261125`, base main `e6faa19b`. Previous claimant `feature-completion-06` ("FC-07") exited without a branch; ghostpay-backup-60 (W3) and ghostpay-42 informed.
Donors (ported by hand, branches untouched): the disclosure parts of #372 `8c196d12` and `8ce7f1db`, and #589 `902464ad`/`697cb731` + #606 `f941ac01` (head of `codex/recover-wallet-disclosure-qualification-20261124`). Not ported: their retention (ghostpay-42, #676), invoice metadata (W4) and addressReuse (superseded by #674) files, and the donor-only connect hardening (extra `eth_accounts` re-read).
PR A (this branch): `apps/web/src/lib/walletDisclosure*.ts`, `apps/web/src/lib/walletCallSummary*.ts`, an optional `disclosure` gate in `apps/web/src/lib/wallet.ts` (`connectWallet`, `sendViaWallet`, `signTypedDataViaWallet`, `walletAuthority`, new `observeWalletLifecycle`), `apps/web/src/lib/wallet.disclosure.test.ts`, the `wallet.disclosure.*` catalog keys and security-key group. No call site passes a gate yet, so app behavior is unchanged.
PR B (next, separate PR): `components/WalletDisclosure.tsx` provider and dialog, AppShell wiring, Pay/Registry call sites and their tests and e2e fixtures. W3 owns the docs/scan wording on wallet-extension RPC traffic.
Not owned: #675 (`WalletBroadcastError`/`PostBroadcastError` messages), the payment-attempt journal internals, Sweep, scan.
Acceptance: without a gate, identical requests and call sequences (existing wallet, payExec, pay, policy, journal and Pay/Registry view suites pass); with a gate, nothing reaches the wallet before an explicit approval, the exact reviewed bytes are sent, the approval is re-checked immediately before the provider call and never after a returned hash, wallet changes cancel an open review; full hosted CI; independent review; merge through the lock queue.

---

# Local destination-reuse warnings consolidated onto main (#287 item 1) — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`. Branch `claude/w-reuse-287-20261125`, base main `32ae3977`. Slice assigned by coordinator `feature-completion-06`.
Donors (merged with `--no-ff`, original branches untouched): #586 `codex/287-local-destination-reuse` `f024ce3e` -> #610 `finish/destination-reuse-type-20261124` `874d3809`.
Not merged: #584 `codex/287-evm-payment-destination-reuse` `17c5a2ee`, a sibling design that writes fingerprints into the fund-safety payment-attempt journal; superseded by #586's separate advisory history, which cannot veto or alter a payment. #341 (GP-BUG-06) fixes the hygiene `DestLedger`, which main's web app does not use; not applicable to main.
Owned paths: `apps/web/src/lib/destinationReuse*.ts`, `apps/web/src/lib/destinationWalletScope*.ts`, `apps/web/src/components/DestinationReuseNotice.tsx`, the reuse hunks only in `apps/web/src/views/{Pay,Sweep}.tsx` and their tests, the one meta-address hint in `CreateInvoice.tsx` (not the Copy-link row, which W4 owns), reuse keys in `apps/web/locales/*.json` and `securityKeys.ts`, the reuse section of `docs/user/privacy-limits.md`, the reuse case in `apps/web/e2e/flows.spec.ts`, this entry and a handoff.
Not owned: Sweep balance consent (FC-02, #664), CreateInvoice clipboard and minimal invoices (W4), the payment-attempt journal, scan code.
Acceptance: advisory only (never blocks or authorizes a wallet action); no RPC, explorer, wallet or telemetry request; no raw address stored; bounded salted session history; denied or full storage degrades to an "unavailable" notice; web typecheck, lint, unit tests, lean build, Playwright reuse case and full hosted CI pass; independent review; merge through the integration lock queue.


# P13 confidential amounts — protocol-neutral client core — 2026-11-25

Worker: Claude Code session `nodata/eloquent-shannon-gfv6t9` (P13 only).
Branch: `nodata/eloquent-shannon-gfv6t9`; base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`
with `future/p13-confidential-amounts` `8846d555` merged for spec ancestry.
Owned paths: new `packages/confidential-amounts/src/future/p13/**`, new
`packages/confidential-amounts/browser/**`, additive edits to `packages/confidential-amounts/`
`package.json`, `README.md`, `DEVIATIONS.md`, new `docs/future/modules/P13-confidential-amounts/IMPLEMENTATION.md`,
`docs/handoffs/P13_CONFIDENTIAL_AMOUNTS_20261125.md`, lockfile entry for the new workspace dependency, this claim.
Acceptance: strict amount/asset validation, exact arithmetic, data models, invoice compatibility,
secret lifecycle, encrypted records with recovery export/import, default-off gate, unsupported-operation
results and disclosures, each with tests; existing 88 package tests unchanged and passing.
Out of scope: contracts (incl. the unmerged router return-bomb fix `cd544529`), apps/web wiring,
settlement activation, deployment, fees, new cryptographic primitives, other modules' files.

# P13 future specification — 2026-11-19

Worker: ChatGPT specification team; coordinator owns publication.
Branch: `future/p13-confidential-amounts`.
Source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`; docs foundation: `524aa18bdcd307a3129bbb7a6b7e74838819331e`.
Owned path: `docs/future/modules/P13-confidential-amounts/SPEC.md` and this additive claim.
Acceptance: source-grounded modular contract, dependencies, failure/recovery,
privacy/fee limits, acceptance cases and planned checks; verified remote spec.
Documentation only: no implementation, main merge, deployment, activation or fee decision.
Existing source and other ownership claims are preserved.

# Future module specifications — 2026-11-19

Worker: ChatGPT coordinator with independent roadmap, branch and architecture reviewers.
Branch: `docs/ghostpay-future-module-specs-20261119`.
Base commit: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: new `docs/future/modules/**` and this additive claim.
Scope: 40 separate module specifications covering the 18 products, P01–P19,
T01/T02 and shared FEE01; preserve aliases and existing spec18 priority.
Acceptance: all source IDs covered, hard dependency graph acyclic, real code
reuse documented, independent branch/spec publication verified, documentation-only
diffs. No implementation, main merge, deployment, activation, fee decisions or release
changes. Feature branches append their own claim before their specification commit.

# Issue #287 item 4 · local metadata retention controls, presentation slice (2026-11-25 UTC)

Worker: Claude Code session `ghostpay-42` (main checkout). Branch: `claude/w-retention-287-20261125`, base main
`32ae3977`. Claim confirmed with no overlap by `newghostpay-ae` (#670, #674 address reuse) and `ghostpay-backup-60`
(W3, #672; it keeps the `saveScanPrivacy` handler in Settings.tsx). Ported, not merged, from the diverged 2026-11-20
privacy candidate line (`Recovered-from:` trailers); donor branches stay untouched.
Owned paths: `apps/web/src/lib/metadataRetention*`, `lib/useInvoicePreviewRetention.ts`,
`components/MetadataRetentionControls*`, the retention hunks in `CreateInvoice.tsx`, `PaymentRequestQr.tsx`, `Pay.tsx`
and `Settings.tsx`, the `retention.*` catalog keys and `metadataRetention` security group, spec 19.
Not owned: invoice metadata minimization and CreateInvoice's Copy-link row (W4), persistent timestamp retention in
the reconciliation vault (#383/#587/#609; a later slice), merchant template issuer (full profile, deferred-adjacent).
Acceptance: default-off preferences; preview, count and explicit confirmation; stale plans clear nothing; only
presentation copies close and every saved record stays; hosted CI green at the exact head; merge via the shared queue.
Status (2026-11-25 18:03Z): **merged** as PR #676 (`e2c11634`) through candidate #681 (42 pass, 0 fail at the exact
head), lock generation 29 (released `62a6ea30`). Open follow-ups: persistent timestamp cleanup in the reconciliation
vault (#383/#587/#609; vault format change shared with the CLI, owner decision pending).

# payment-uri invoice-link browser-canonical origin and path — 2026-11-25 UTC

Worker: Claude Code (local). Branch `claude/small-fix-20261125`, base main `aaa71a11`.
Owned paths: `packages/payment-uri/src/invoice-link.ts`, additive cases in `packages/payment-uri/src/{negative,vectors}.test.ts`, `packages/payment-uri/DEVIATIONS.md` item 10, this entry. No `apps/web` changes.
Acceptance: `parseInvoiceLink`/`buildInvoiceLink` reject whole `.` path segments like `..`, and `origin` omits the scheme's default port; package tests, typecheck and lint pass.

---

# Seller-key restoration on phones, tablets and other devices (2026-11-25 UTC)

Worker: Claude Code session `ghostpay-backup-60`; branch `claude/mobile-restore`; base main `60824005b89611aea2b16d3355378eebf072eedb`.
Resumes the mobile qualification stack with ancestry: #588 `46150f4c` → #597 `a929b178` (all hosted checks green at a929b178). Original branches untouched.
Owned paths: new `apps/web/e2e/devices-mobile-restore.spec.ts`, its `testMatch` entry in `apps/web/playwright.mobile.config.ts`,
restore rows in `docs/handoffs/MOBILE_BROWSER_QUALIFICATION.md` and `docs/qr/PHYSICAL_DEVICE_ACCEPTANCE.md` (D4 to D6),
the device-restore section of `docs/user/product-guide.md`, and this entry. No production, crypto-format or workflow-gate changes.
Acceptance: in Chromium (Pixel, Galaxy Tab, and the default-config iPhone/iPad descriptors) and native WebKit (iPhone SE, iPad Mini) profiles, a fresh device restores the fixed v1 vector keystore and refuses damage and a wrong passphrase. The restored keys survive vault save, reload and unlock. The encrypted backup QR from a separate desktop context restores the same identity, as one code and as out-of-order multi-part codes. Hosted mobile qualification (lean and full) and full CI pass. Physical-device cases stay pending until recorded.

# P0-KEYS — GhostPay-independent recovery of the seller keystore backup (2026-11-25 UTC)

Worker: Claude Code session (Opus 5.5), local worktree `.claude/worktrees/p0-keys-recovery`. Branch
`claude/p0-keys-independent-recovery`, exact base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
Gap: the reference recovery script reads only the Spec 18 `ghostpay-stealth-*` files. The seller keystore
(`ghostpay-keystore.json`, v1, scrypt + AES-256-GCM) can only be opened by GhostPay code itself. This adds an
independent reader so that file can be verified and used to recover one-time payment keys without GhostPay code,
the original browser profile, device or storage. The keystore format and the app are unchanged.
Owned paths: additive seller-keystore reader and `--expected-meta-address` in
`scripts/recovery/stealth-export-recover.mjs`; new `scripts/recovery/seller-keystore-recover.test.mjs` and
`scripts/recovery/seller-keystore-recover.fuzz.test.mjs`; new
`test-vectors/generate-seller-keystore.mjs`, `test-vectors/seller-keystore-v1.json` and their README entry; new
`docs/specs/18-seller-keystore-v1-format.md`; additive sections in `docs/user/recover-stealth-payment-keys.md`; new
`apps/web/e2e/independent-keystore-recovery.spec.ts`; this claim; new
`docs/handoffs/P0_KEYS_INDEPENDENT_KEYSTORE_RECOVERY_20261125.md` (checkpoint).
Not owned (other workers' scope, not edited): #641, merged into main at `60824005`, seller-keystore verify/restore UI and codec (`SellerKeys.tsx`,
`session.ts`, `keyVault.ts`, `keystore*.ts`, `portable-errors.ts`, `recovery.spec.ts`, `pages-devnet.spec.ts`,
`product-guide.md`, locales); #622 archive, master backup and in-app Spec 18 recovery (`paymentKeyExport*`,
`StealthExport*`, `Scan.tsx`); #635 late reconciliation; #636 merchant dashboard; #588 mobile engines.
Acceptance: the reader accepts every keystore GhostPay writes (fixed vector and freshly written files from the built
`@ghostpay/ux-vault` codec, including production N=2^17), and the codec accepts the vector. The reader recovers the same
one-time keys as the Spec 18 master-backup vectors. Wrong passphrase, tampering, truncation, oversize, unsupported
versions and another seller's backup are refused with fixed codes. No seller secret is printed; the passphrase is
never read from argv or the environment. Recovery runs in an isolated directory with only the script and two noble
packages readable. A browser-downloaded keystore is decoded after its profile is closed. No new dependency,
primitive, endpoint or contract change.

# W4 — clipboard cleanup (#553 + #580) onto current main — 2026-11-25 UTC

Worker: Claude Code W4 (feature-completion), branch `claude/w4-clipboard-286-main-20261125`. Base: #580 head
`e68d32d7e424daf7264165987868eb6b891048b2` (contains #553 `068fbc36b80311c107dfd3619d631fca794fac58`) merged with main
`aaa71a112d90fd39f59b40de9f139e9cfdc62d61`. Donor branches and PRs #553/#580 stay unchanged; superseded only once this merges.
Owned paths: the merge resolution (`apps/web/src/AppShell.tsx` imports, this file), fixes for defects reproduced on the
merged head inside the stack's existing paths (`apps/web/src/lib/clipboardPrivacy*`, `apps/web/src/components/{Common,SecretBackup,SensitiveClipboard}*`,
the clipboard preference in `apps/web/src/{lib/settings*,views/Settings.tsx}`, clipboard locale keys, `apps/web/e2e/{invoice-link,sensitive}-clipboard.spec.ts`,
`docs/privacy/clipboard-actions.md`), and a new handoff. W4 also coordinates the Create Invoice copy-link row for the
related #585/#600 privacy-minimal invoice continuation (next task) so both compose with FC-01 #650's request-file download.
Not owned: #664/#650/#649/#656/#661–#663 branches, Pay/wallet/journal, recovery, provider policy, verification directories.
Acceptance: opt-in (default Off) cleanup applies to every programmatic copy; newer or different clipboard contents are never
erased; invoice totals, canonical signatures and verification unchanged; merged head passes focused clipboard suites, web
typecheck/lint where memory allows (skips recorded), and full hosted CI; handed to W1 for integration (no lock taken, no merge).

---

# P1-LATE stack consolidation onto main — 2026-11-24 UTC

Worker: Claude Code (local, `claude/p1-late-reconciliation`). Base: stack tip PR #625 `694383f7` (contains #533 → #546 → #575 → #599) merged with main `c8e131c1`.
Own only the merge resolution (`apps/web/src/views/Scan.tsx` scan-owner state, this file), fixes for failures reproduced on the merged head inside the stack's existing owned paths, and `docs/handoffs/P1_LATE_CONSOLIDATION_20261124.md`. All donor branches stay unchanged; their PRs are superseded only after this merges.
Acceptance: the merged head passes web/ux-vault/cli typecheck, lint and tests locally and the full hosted CI; never show an unverified or late payment as confirmed; integration lock acquired before merge.

---

# Resumed seller browser qualification — 2026-11-24 UTC

Worker: root. Branch: `resume/seller-reconciliation-20261124`. Parent: PR #575 at `5a225f6cdaeeaf9c6dad8d8a11f3f437fff83727`. Main observed: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
Own the imported-history assertions in `apps/web/e2e/pages-devnet.spec.ts`, the mismatched-observation fixture in `apps/web/src/lib/reconciliationVault.invoices.test.ts`, this claim, and a new handoff. Resume the existing task after the reported interruption. Preserve parent branches and all production code.
Acceptance: imported historical records display the current unverified state and no credited amount summary; saving the freshly verified observation produces one link and one distinct observation. Preserve the existing encrypted-backup, duplicate, sweep and network checks. Local fixtures only; hosted browser qualification remains required.

---

# Seller payment reconciliation on the #533 → #546 stack

Worker: Codex. Branch `fix/seller-linked-payment-reconciliation` starts at #546 `711168f18e5d808df4e3153da8898cd86fae5266`. Main inspected at `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
Own the linked-payment retry and duplicate-observation handling in the portable reconciliation vault, its invoice regressions, the seller assertions in flows.spec.ts and pages-devnet.spec.ts, and the CLI history test fixture that uses that vault. Extend the scanClient.ts page-finality/checkpoint logic and its local scanClient.test.ts fixtures for a retreating tip. Update the reconciliation ADR. The Scan privacy localization fixture has a separate worker and candidate. Leave both parent branches and its test untouched.
Acceptance: count only distinct verified linked payments, revisit unresolved linked inclusions, withhold credit through interruptions, preserve seller decisions on invalidation, and prove repeated reconciliation and reload against local fixtures. No hosted blockchain, deployment or shared-branch integration.

## FC-01 independent qualification (2026-11-25)

Worker: Claude Code session `focused-meitner-07a9u7`. Branch `nodata/focused-meitner-07a9u7`, a descendant of the FC-01
head `5543c2a3670ceffc43fd7751edeab74feac4f3e4` (main `5dc05bd6b73effef3d6fd3443a2e2fdde1103d3a`). The owner `fc01`
was still pushing when this started, so its branch is not edited and integration stays with that owner. Owned
paths: this subsection, `docs/consolidation/feature-completion-20261125/FC-01-f03-request-file-QUALIFICATION.md` (the owner keeps
`FC-01-f03-request-file.md`) and the new
browser regression `apps/web/e2e/payment-request-file-attempt.spec.ts` (file entry versus the #500 journal). No
production source change. Acceptance: the affected local gates, the six request-file browser scenarios on fresh full and lean
builds, union and hunk checks against main and the donor, an independent review, and hosted CI recorded against
exact SHAs. The handoff is left ready for the owner's integration.

# FC-03 — Solana/TRON meta-address and memo interoperability alignment (2026-11-25 UTC)

- Worker: fc03. Branch: `claude/fc03-chain-interop-20261125`. Base: `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` (origin/main). Donor: PR #376 head `f717157271fe494eb8094e504e9fec8276d51fcc`, merged with `--no-ff`.
- Owned paths: the donor's 34 source paths (Solana/TRON libraries, adapters, CLI inspection), this claim, `docs/consolidation/feature-completion-20261125/FC-03-chain-interop.md`, plus follow-up paths `packages/solana-stealth/README.md`, `packages/solana-stealth/src/meta-address.ts`, `packages/solana-stealth/src/stealth.test.ts` and `docs/remote/chain-ports/solana-impl.md`.
- Excluded: apps/web, contracts, workflows, root manifests/lockfile.
- Acceptance: Solana/TRON/CLI workspace tests, typecheck and lint pass with coverage thresholds held; web and library vectors agree; TRON build stays fail-closed (`MEMO_NOT_BOUND`); no mainnet enablement. Testnet/proof-of-concept only.

# FC-05a — Bitcoin spent-output detection and private-scan consent (2026-11-25 UTC)

- Worker: fc03 session (feature-completion campaign), task FC-05a. Branch: `claude/fc05a-btc-spentness-20261125`. Base: `60824005b89611aea2b16d3355378eebf072eedb` (origin/main). Donor: PR #244 head `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f` (contains #219 `9617e857`), merged `--no-ff`. PR #254 is NOT merged (FC-05b).
- Owned paths: `apps/web/src/features/btc/**`, `packages/btc-silent-payments/src/scan/**`, `apps/web/e2e/btc-spent-consent.spec.ts`, `apps/web/e2e/btc-worker.spec.ts`, the donor's locale/securityKeys hunks, this claim, `docs/consolidation/feature-completion-20261125/FC-05a-btc-spentness.md`.
- Acceptance: unknown never becomes spent or sweepable without complete canonical header-covered coverage; consent revocation stops network use; chain change invalidates evidence; non-BTC paths equal current main unless the feature needs them; `spend.preview.network.test.ts` still present and passing. Full profile only, testnet, proof of concept.

# GP-PAGES-02 seller-keystore backup verification and restoration consolidation (2026-11-24 UTC)

Worker: Claude Code session `ghostpay-backup-60`; branch `claude/backup-recovery`; base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
Donors (ancestry kept, original branches untouched): #530 `88f7d1b4` → #540 `8daebb0f` → #573 `56fb25aa` → #629 `4b1ed14c`.
Owned paths: `apps/web/src/views/SellerKeys.tsx` and its tests, `apps/web/src/lib/{session,keyVault,keystore}.ts` and tests,
`apps/web/src/AppShell.tsx` (leave-page guard only), `packages/ux-vault/src/{keystore-portable,portable-errors}.ts`,
additive locale/securityKeys entries, `apps/web/e2e/{recovery,app}.spec.ts`, additive `pages-devnet.spec.ts` cases,
`docs/user/product-guide.md` restore section, `docs/pages/RELEASE_MATRIX.md` rows for GP-PAGES-02 and this entry.
Not owned: payment recovery (#635, `claude/p1-late-reconciliation`), Spec 18 payment-key exports (#622), idle-lock
suspended-signer path (#544/#365/#577/#596), `flows.spec.ts`, `core-journey.spec.ts`, Pay/wallet/journal files.
Conflict rule: main's #314 operation ownership (verification shares the single operation slot) is kept; #530's
independent verification controller is not. Verify is disabled while an unlock is pending instead of cancelling it.
Acceptance: keystore codec typed errors, panel-local verification status that never survives a seller change or a
file switch, typed deletion of an unrelated or locked vault, leave-page warning without a verified external copy,
fresh-profile restoration and derived-address consistency; focused unit, typecheck, lint, build and hosted CI.

---

# REV-L2 — checkout with a stale payment-attempt mirror

Codex, branch `codex/checkout-rev-l2-durable-preflight`, stacked on #500 at
`ad67862f63590fe38410d21b88ebf0e05329da47`. Main checked at
`8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Scope on this child is
`apps/web/src/views/Pay.tsx` and the existing checkout browser test and fixtures
(`apps/web/e2e/{flows.spec,flowMocks,helpers}.ts`). A pending payment in
IndexedDB must prevent permit, approval and payment wallet requests from a
second tab with a stale mirror. A distinct invoice must reach its wallet.
#500 owns journal integration and #528 owns policy-action lock lifetime.

# GhostPay cross-tab recovery qualification

- Coordinator branch: codex/ghostpay-cross-tab-qualification. main: 8ddb344973e80b8e1eda6821e970ee6a2b808b29; #500: d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea; #528: cfe735754fa486768e02802ffe9734c94bb47f75, direct child of #500. Their main merge base is eb59d93cffed7848c4aac37d0e9650b87239c6da.
- #500 owner claim covers journal, wallet, Pay, outcome resolver and UI; #528 covers policy contention. This qualification uses isolated continuations pending coordination, with no edits to existing remote branches. Preserve other ownership entries and avoid refund, key export and release work.
- Live lock 082e754 shows generation 12 released. Public main rule endpoints showed no enabled branch protection or applicable rules. Refresh both before integration. The current main conflict is in the additive ownership log.
- Known gaps to investigate: #528 has full/lean/Anvil browser failures and #500 has no hosted PR workflow runs returned. Inspect send and reconciliation boundaries, migration, and #500 Pay integration. Add real two-page browser coverage, run focused and workspace gates plus bundle/privacy/security checks, and obtain an independent review before integration.
# M1 P0 — durable cross-tab wallet-attempt journal and transaction-outcome recovery (2026-11-23 UTC)

- Worker: Claude Code lead coordinator (session `keen-volta-8ctx9x`) with delegated specialist workers A (implementation), B (security), C (adversarial QA), D (browser/anvil QA), F (independent review). Branch `claude/keen-volta-8ctx9x`, base `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da` fast-forwarded to the PR #427→#440→#441→#443 stack head `4e1fa095` (provenance commits kept, not rewritten).
- Owned paths: `apps/web/src/lib/duplicateAttemptJournal.ts`, `apps/web/src/lib/attemptStatus.ts` (new), `sendViaWallet` in `apps/web/src/lib/wallet.ts`, nonce observation in `apps/web/src/lib/payExec.ts`, additive changes in `apps/web/src/components/WalletAttempts.tsx` and the pre-send block in `apps/web/src/views/Pay.tsx`, shared lock constant in `apps/web/src/features/policy/withdrawalJournal.ts`, matching tests/i18n/e2e journal readers, and `docs/engineering/*`.
- Problem (audit REC-P1-03, PR #455): the payment journal is tab-scoped `sessionStorage`; a second tab or a tab reopened after a crash can pay the same invoice again, and a recorded hash cannot be resolved after reload.
- Acceptance: one durable journal (`localStorage`, key shared with policy withdrawals) serialized by the existing Web Lock; at most one wallet request per invoice across tabs; no await between final authority check, journal write and provider call; hash never lost; RPC-verified status resolution (pending/confirmed with canonical block hash/reverted/mismatch/replaced/nonce-consumed/rpc-error); Pay refuses a second send for a recorded invoice; unit, fault-injection and anvil browser evidence; full web gates.
- Coordination: #372 also edits `WalletAttempts.tsx` (privacy reveal gating); this change stays additive there. The integration lock (`automation/ghostpay-integration-lock`, generation 11, owner `994a0d214fb9-root-r3`, expired 2026-11-21T00:16Z) is not taken over by this branch; merge needs owner authorization.

# R31 scoped regression repair: wallet journal read-back test type-check (2026-11-22 UTC)

- Worker: consolidation coordinator; task branch `repair/ghostpay-r31-journal-readback-test-typecheck-20261122` stacked on PR #441 at exact `3c21b02194c97c41e6efaffead5520b10697f229`, which itself stacks on #440 and #427.
- Owned paths: isolated correction to `apps/web/src/lib/walletJournal.readbackRegression.test.ts`; append-only claim here; new docs handoff. Do not change parent's branches, app runtime, signing, contract, custody, release or configuration.
- Defect evidence: exact-head #441 Actions ts-typecheck job 137099544458 and hosting build job 137099544595 report TS2345 at test lines 45 and 55 because `WalletAttemptOptions.kind` is required but omitted by both test calls.
- Acceptance: add the mandatory `kind: 'transaction'` only at both options call sites, keep existing wallet mock, post-broadcast read-back failure cases and strong error assertions intact; qualify exact child head with hosted TypeScript/build/test checks. Do not claim independent approval; leave stack unmerged until prior PRs and gate checks qualify.

# GP-BUG-20261122-JH — reject malformed wallet completion hashes with a typed journal error

Cycle and worker: `20261122T0438Z` / one sequential ChatGPT coordinator (bug implementation, bounded source audit, and integration triage); no separate native agent, independent verifier, or Caveman runtime available.
Task branch: `automation/20261122T0438Z/bug/wallet-hash-type-guard` stacked on the exact existing PR #427 head `e9404bad766b3ee7d93f54f2172059b9566fcb57` (main baseline `eb59d93cffed7848c4aac37d0e9650b87239c6da`).
Owned paths: `apps/web/src/lib/duplicateAttemptJournal.ts`, new isolated regression `apps/web/src/lib/duplicateAttemptJournal.hashType.test.ts`, additive ownership claim in this file, and `docs/handoffs/ATTEMPT_JOURNAL_HASH_TYPE_20261122.md`.
Finding and reproduction: `finishAttempt(attempt, hash)` calls `hash.toLowerCase()` before validating its runtime type. Non-string wallet/provider results (for example a number or null) raise an untyped JS TypeError rather than the journal's existing fail-closed `UserFacingError`. Strings with malformed bytes already reject correctly. The original code path is unambiguous from source; verify the regression separately before repair. No demonstrated browser exploit or funds-loss path is claimed.
Acceptance: a test-first failure for malformed runtime hashes, smallest compatible typed-input guard using the existing journal error, unchanged valid hash normalization and first-submitted-hash integrity, no writes on invalid completions, no dependencies or runtime policy expansion. Check focused and hosted CI, independent review, and lock/CI/Pages gates before any merge.
Ownership: explicitly continuing parent PR #427 on an isolated child; #278/#307/#372 and recent #435/#438/#437/#436/#429/#434 changed-file inventories did not own this path in bounded checks. No full historical semantic census is claimed. Integration ref `automation/ghostpay-integration-lock` is **held** at generation 11 by another coordinator (`994a0d214fb9-root-r3`); expiry does not authorize takeover. No shared updates or main merge.
Verification: connected GitHub sources/CI are accessible, but local git clone DNS resolution is unavailable; no repository tests claimed until executed on an exact head.

---

# GP-BUG-20261121-JH — wallet attempt hash integrity

Cycle/worker: `20261121T2235Z`; one coordinator executing sequential audit, regression, repair and consolidation; no independent native worker available.
Branch: `automation/20261121T2235Z/bug/journal-hash-integrity` based on main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/lib/duplicateAttemptJournal.ts`, new `apps/web/src/lib/duplicateAttemptJournal.hashIntegrity.test.ts`, an additive entry in this file, and `docs/handoffs/ATTEMPT_JOURNAL_HASH_INTEGRITY_20261121.md`.
Evidence: source blob `b8c2ec1915b833a5b78286b9b9caca1c247e827c`: `finishAttempt` discards an existing id and writes the caller-supplied hash, even if the same id was previously marked submitted with a different hash; repeated callbacks can erase the first recorded tx hash. Exported-helper defensive correctness defect; application-level duplicate callback reachability is not established.
Acceptance: preserve the first persisted hash on conflicting repeat completion (fail closed), allow idempotent same-hash completion, fail closed on an existing id with changed action identity, and retain late hashes after explicit clear/replacement as existing tests require. New failing regression before product repair, exact-head hosted CI and truly independent review before any merge. No keys, contracts, dependencies, hosted components or production settings.
Ownership reconciliation: inspected #278/#293/#307/#372/#390/#416/#419/#422 changed filenames; none claims this source path; main ACTIVE_WORK has no matching path claim. Full open-PR path census was not possible. Recheck before integration.
Integration: metadata branch `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, generation 11, status held by `994a0d214fb9-root-r3`. This cycle does not own the lock and must not merge/shared-update.
---

# Individual stealth-payment export recovery — 2026-11-24 UTC

Worker: `/root/ui_data_review`; coordinator `/root`. Isolated branch
`integration/individual-export-recovery-20261124`, base
`0b60dba235710f12847532dd9d0f74f12f7298c6`. Reuse the completed
`react-pages-diagnostics` worktree; preserve its former branch and commit
`71884c053814c20286e6c612a674219770efafa5`. Recover original PR #572 head
`28bba11cdaebc13edc4d100761ee00750c3f396f` with ancestry. Current base includes
the selected print continuation `fc961443233734ee988da7834d7a3193aed9c0fe`.

Owned paths: the donor's complete 38-path individual export, portable codec,
recovery CLI, existing vectors/tests/docs and additive recovery Node-test glob;
conflict reconciliation in Scan, locale/security catalogs and this registry;
only the reviewed inaccurate synchronous-deadline comment correction;
`docs/handoffs/INDIVIDUAL_EXPORT_RECOVERY_20261124.md` and the source-pinned
read-only `docs/handoffs/RESPONSIVE_PALETTE_ELIGIBILITY_20261124.md` assessment.
If exact hosted evidence shows the native spending cases do not execute, send
the coordinator the precise plan before adding the unchanged required raw-key
suite to the existing Forge-equipped rest-1 CI lane. No earlier gate may be
removed or weakened.

Acceptance: preserve current Scan/session/keyVault guards, portable KDF cleanup,
all existing tests, selected print/QR source, catalogs and manifests. Run full
vault coverage/typecheck/lint/build; new and existing web consumer suites;
recovery Node tests; web typecheck/lint; i18n; full/lean builds; and unchanged
native checks with normally available tools. Retain denied-capability limits,
required exact-head hosted full/lean browser gates, independent source review
and source-pinned receipts. No donor, coordinator checkout, remote ref or palette
family changes; no new vulnerability reproduction, deployment or live payments.

Completion: source `079a153aadd2c3f2ac8e87a9dab2daf8f0fc00de`, tree
`b7c3a7784d20f5e538caaf9e6bcb7bf0f445f565`, independently source-approved.
Original #572 is second parent of merge `05d818e7fc85bfc9a2e5ccaf0cfa874ee0df2110`.
Vault 375/14 and web consumers 311/27 passed; recovery Node 23 and workflow guards
5 passed; vault/web static checks, i18n, full/lean builds and bundle scans passed.
The original required native check failed its missing Anvil/Cast prerequisite;
no spending cases executed locally. Coordinator approved the same-rest-0
REQUIRE_ANVIL=1 recovery invocation, preserving the original Node command and all
other gates. Fresh combined hosted spending/browser acceptance and final full-web
coverage remain with the coordinator. Exact receipts and retained initial failure
are in `docs/handoffs/INDIVIDUAL_EXPORT_RECOVERY_20261124.md` and its compact
`individual-export-recovery-20261124/` evidence. No root checkout or remote changes.

# QR exchange interrupted qualification completion — 2026-11-24

Worker: `9723b6705f45-root`, branch `finish/qr-browser-qualification-20261124`.
Parent: PR #581 `41a598b8433e10a95598c72c2a23027e63010024`; main `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
Owned scope: this additive claim, focused QR browser fixtures and an evidence handoff. Production QR changes are retained from #581; do not overwrite donor branches.
Acceptance: independently run QR package validation and Create → PNG → Pay browser journeys, camera fallback/cleanup, and reject wrong-family/damaged input with synthetic fixtures. Fix confirmed in-scope qualification failures while preserving production and release gates. Record exact executable evidence and pending checks. No release deployment or real funds. Recheck branch heads before publication/integration.
# Receipt and bill print completion on current main — 2026-11-24 UTC

Worker: `/root/remote_inventory` under coordinator `9723b6705f45`. Isolated branch `finish/receipt-print-completion-20261124`; original #548 tip `cb977e4b31047e65ccbe8835c8e45e1cff3cfc84`, parent #532 `51c04326ff9258861621b94ce2ab06f44bba8301`; fresh main `2d83de0b7f5bba0fafc0c25d19d1fcb382edf719` (contains #561 after prior main `f76904301cff0b24d65ea4e31cbf37d470db4d95`). Own this isolated integration, its additive ownership and `docs/handoffs/RECEIPT_PRINT_COMPLETION_20261124.md`. Preserve all original donor commits and branches; reconcile main without rewriting reviewed print source.

Acceptance: exact donor ancestry and source preservation; independent review of selected-document print isolation, cleanup/cancellation, secret-QR exclusions, pagination and dark-paper output; native focused unit tests, applicable TypeScript/lint, full/lean static builds and browser print/PDF checks where available. Only synthetic invoice/payment fixtures; no physical printer, network payments or deployment. Current source overlap is the existing donor stack; no new print successor or resumed print owner was found in the live PR inventory. Main's intervening package changes do not touch print source. The offline worker owns browser port 4173 until explicitly released by the coordinator.

Qualification follow-up: the unchanged donor passed 54 focused unit tests and all 17 print browser cases in each full/lean profile. Supplementary raster inspection reproduced near-black printed page margins under explicit dark theme with `printBackground: true`, even though the receipt body was white. Coordinator authorized a minimal print-only repair. Extend this isolated claim to `apps/web/src/styles/print.css` and additive assertions in `apps/web/e2e/print-targets.spec.ts`; preserve original assertions and all payment/receipt behavior. Require a failing root-canvas regression and before/after PDF evidence, then focused independent re-review. Port 4173 was released to the coordinator before this follow-up; fixture-only checks use no preview server.

Completion: qualified code `e722f239be6aab9af3907089547c8dfd301f0029`, independently reviewed by `/root/unique_history`. Two added dark-canvas tests failed before repair and passed after the print-only root override; original assertions retained. Final native browser suite passed 19/19 full and 19/19 lean, units 54/54, full/lean TypeScript/build/bundle scans, typed lint and secret scan passed. Actual PDF readbacks confirm isolated signed facts, four-page bill continuation, secret/control exclusion and white dark-theme margins. Main `706188000c38b3dde5a3a362370a530870aa7587` was reconciled at `75c6d4ad183dd649dbbfd04b1310f81632b48ddc`; the qualified web tree is unchanged. See `docs/handoffs/RECEIPT_PRINT_COMPLETION_20261124.md`. Port 4173 was released. Publication is limited to this worker's new branch and main-targeting draft; fresh hosted exact-head checks remain required. Original branches, shared refs and leases are preserved.

---

# GP-BUG — Template clock rollback breaks persistence (2026-11-24 UTC)

Worker: sequential BUG-ONLY coordinator, round 11; no independent verifier available. Isolated branch `automation/20261124/bug/template-clock-rollback-r11`; base `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
Owned paths: `packages/ux-schedule/src/template.ts`, new `packages/ux-schedule/src/template.clock-rollback.test.ts`, additive claim here and `docs/handoffs/UX_SCHEDULE_TEMPLATE_CLOCK_20261124.md`. Existing `template.test.ts` is owned by #224/#238/#262/#264/#278/#372 and will not be edited. Current open PR census (314 PRs, all changed-file lists checked for template/schedule paths) found no owner of the production/new test path. Recheck before integration.
Observed failure: create at 1000 ms, edit at 900 ms returns success with updatedAtMs 900; parseTemplates of that record returns bad_time. Isolated exact-blob Node 22/TS 5.8 baseline 11/14 assertions passed. Acceptance: regression first, preserve monotone edit timestamps across clock corrections, keep normal forward updates, patch validation, strict import validation and broken-clock errors; no scheduler behavior, transactions, dependencies, deployment or release changes. Integration lease generation 15 released, not acquired. Independent review and full exact-head hosted CI required; local full checkout DNS unavailable.
# GP-BUG — Solana reference snapshot baseline reconciliation (2026-11-24 UTC)

Cycle `20261124T0437Z`, one sequential coordinator continuing its existing isolated PR #507 (no independent workers or approval). Branch `automation/20261123T1041Z/bug/solana-reference-snapshot`; expected prior head `5ad9937cdac8f4d75a2dcb4e9a6e62e8fe079705`; fresh main `f76904301cff0b24d65ea4e31cbf37d470db4d95`; common base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owned paths: additive claim and existing Solana handoff; preserve exact donor production and eight-case regression blobs. Main advanced 19 commits including scan-source #537 and fee corrections. Compare and incorporate current main into this isolated candidate, retaining donor ancestry and all main claims without replacing main or any other branch. Acceptance: both parents retained, exact donor product/test bytes unchanged, current main tree preserved except the four owned paths, no duplicate PR, fresh hosted CI and independent review required. The earlier Core run 45314127729 was still queued at inspection; four other workflow groups passed, not qualification of the refreshed candidate. Existing lock generation 15 released at observation, not acquired; no protected/shared integration or main merge. No deployment, real funds, workflow/configuration edits, paid agents or gate changes.
## Final reviewed additions to the first composition — 2026-11-24

Worker `chatgpt-68c82b9dbbbb-all-branch-consolidation` consumes #601 at `02d9b7149ad715a7c2c9229f5297f0aa0834c415` and the narrow #276/#277 artifact-verification stack at `8cbae85c95fa707210704ee72bb4416b36e5a4d7` after separate read-only review. Preserve #601's stronger payment-asset consistency check and its ten-case regression; its timing source/tests already match C1. Preserve the two exact offline artifact-verifier files from #277. The verifier adds a separate local check and does not alter deployment gates. These are the final planned product inputs for the first composed candidate; tests and independent composition review follow on the frozen source.

## Reviewed extension of current-main composition — 2026-11-24

# GP-BUG — Solana Pay reference count regression extension (2026-11-24 UTC)

Cycle: 20261124T0237Z; sequential coordinator continuing its existing isolated PR #507, branch `automation/20261123T1041Z/bug/solana-reference-snapshot`. Exact prior qualified head `f8e40f9d773333c123ed93db2a256b4b2ee75dde`, main base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. No independent subagent or approval. Preserve prior commits and claims.

Owned paths: additive claim here; existing `packages/payment-uri/src/solana.reference-snapshot.test.ts`; additive handoff `docs/handoffs/SOLANA_REFERENCE_SNAPSHOT_20261123.md`. Production source unchanged. The original five tests only exercised the up-front array length cap, not the in-loop bound with an inconsistent iterator. Node 22 source-body reproduction showed the old two-pass builder serializing nine distinct valid-length keys after checking eight. Add deterministic changing-iterator and overlong-iterator cases plus exact-eight acceptance; verify typed rejection and parse round-trip, no funds/network. Existing parent CI is green; new head needs fresh CI. No shared integration, deployment, or changes to other PRs; generation 13 released observed, not acquired. The same lane is deliberately continued instead of opening a competing PR.

---

# GP-BUG — Solana Pay references must be validated once (2026-11-23)
Worker `chatgpt-68c82b9dbbbb-all-branch-consolidation` also consumes source-pinned C1 #504 (`1a7447d58c08363209b6b9b67e9a6afad07d87f3`) after all six published-head workflow groups passed, plus independently reviewed #268, #289 and #274 through test child #515. C1's source-pinned independent reviews remain recorded in its original ledger. The new composition preserves newer POS behavior and countdown boundary coverage; donor CI is not presented as qualification of this new composition. The original #289 test receives only its already-reviewed successor correction from `31c34319aeaa9dbc211b8ccc6bdf65fc3e755ea2`. All original heads remain ancestors, and original branch refs remain unchanged. Raw historical evidence logs retain their original whitespace; product diff whitespace is checked separately.

## Current-main branch comparison and focused integration — 2026-11-24

Worker: `chatgpt-68c82b9dbbbb-all-branch-consolidation`; branch: `integration/ghostpay-branch-comparison-20261124-68c82b9`; base: `706188000c38b3dde5a3a362370a530870aa7587`.

Scope: compare every fetched remote branch against current main, preserve existing source histories, and integrate reviewed eligible Pages fixes. The first composition consumes completed donor heads #594, #568, #574, #576 and the merchant-ledger completion successor to #522/#555. The original donor branches remain owned by their original workers and are read-only inputs.

Owned paths: additive branch comparison and qualification evidence under `docs/consolidation/branch-comparison-20261124-68c82b9/`, this additive registry entry, and conflict resolution on this isolated integration branch. Product changes are limited to independently reviewed donor changes until an evidenced repair is required.

Acceptance: full remote-ref census with no symbolic alias counted; verify main ancestry, exact source matches and pending successor relationships; preserve all donor heads; run affected workspace tests/build/typecheck/lint, applicable browser checks and existing repository guards; independently review the final composition; refresh live heads and obtain the integration lease before any main merge. Hosted CI must qualify the published candidate. No deployment, new future privacy activation, contract changes or remote financial operations are included.

Status: composing the first focused group. No integration lease or hosted success is claimed.
# GP-BUG — Reject nonadjacent duplicate invoice IDs in ledger exports (2026-11-23)

Worker: single ChatGPT BUG-ONLY coordinator; sequential author and test executor, not independent review.
Branch: `automation/20261123T2018Z/bug/merchant-ledger-duplicate-invoice-export`; exact main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/merchant-ledger/src/export.ts`, new `packages/merchant-ledger/src/export.duplicate-invoice.test.ts`, this additive claim and new `docs/handoffs/MERCHANT_LEDGER_DUPLICATE_EXPORT_20261123.md`.
Evidence: resolveAll promises duplicate IDs are rejected, but compares adjacent entries after sorting primarily by creation timestamp. Three valid synthetic invoices (duplicate ID, other ID, duplicate ID) at successive timestamps escape detection; CSV/JSON/Xero/IIF/tax summary accept the duplicate. Exact source and its three runtime dependency blobs hash-matched locally; Node 22/TS 5.8.3 isolated checks 6/13 pass before repair. No wallet, contract, network or funds.
Acceptance: commit failing regression first; use a Set of IDs to reject duplicates anywhere without changing deterministic date/id sort or existing valid export results. Run isolated red/green plus hosted exact-head qualification; do not claim full repo tests. All 276 open PR file inventories through #521 inspected for export source and new test path; no collision. Existing ledger test/decimal/CSV paths are excluded (including #504). PR #390 exact head CI succeeded, no review and nonmergeable; owner untouched. Lock generation 12 released, not acquired. No merge without independent review, required checks and legitimate integration authorization; no deploy/release.

---

# Merchant-ledger duplicate-ID completion — 2026-11-24 UTC

Worker: `/root/unique_history`, delegated by the current completion coordinator. Branch: `finish/merchant-ledger-completion-20261124`; base main `706188000c38b3dde5a3a362370a530870aa7587`. Preserve qualified child #555 `3ae56a5e0b3df9ce57e9bbf2a44c82b56e432033` and original #522 `907838ef75bbd0b08b4e23f3bbea9ac9b08403d4` as ancestors.
Owned changes: this additive registry entry, local ancestry-preserving integration, and `docs/handoffs/MERCHANT_LEDGER_COMPLETION_20261124.md`. Preserve the donor's exact `packages/merchant-ledger/src/export.ts` and `export.duplicate-invoice.test.ts` blobs; no new product implementation or tests are planned.
Live discovery: #522 and #555 heads remain unchanged; #555 has five successful hosted workflow groups. Current main still has the adjacent-only duplicate check. Bounded live successor search and changed-file inventories for #504, #579, #535, #393, #388 and #550 found no competing owner of these two files; #504's separate CSV/decimal changes remain outside this lane.
Acceptance: resolve only additive ownership metadata conflicts, preserve both histories and current-main changes, review all six existing export/aggregation entry points, execute the existing merchant-ledger package tests/coverage/typecheck/lint/build using available dependencies, and distinguish donor hosted evidence from new composition verification. No installation, remote mutation, shared integration lease change, deployment, contracts, wallets, or funds. Parent coordinator owns publication, independent composition review and required exact-head integration gates.

---

# GP-BUG — Template clock rollback breaks persistence (2026-11-24 UTC)

- Cycle and worker: `20261123T1041Z`; one sequential GitHub-connected engineering coordinator, no independent native subagent/verifier.
- Branch: `automation/20261123T1041Z/bug/solana-reference-snapshot`, exact base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Claimed paths: `packages/payment-uri/src/solana.ts`, new `packages/payment-uri/src/solana.reference-snapshot.test.ts`, additive claim in this file, `docs/handoffs/SOLANA_REFERENCE_SNAPSHOT_20261123.md`.
- Finding: `buildSolanaPay` uses `new Set(refs)` to check uniqueness, then iterates the mutable references a second time to serialize. Getter-backed array entries can yield distinct values during validation and a duplicated reference during serialization. This violates the builder/parser round-trip guarantee and bypasses the max-8-unique-reference invariant on mutable input.
- Acceptance: demonstrate baseline duplicate-ref URI with changing array element getter; add Vitest regressions for one-read stable references, rejected duplicates/too many references, valid normal roundtrip and no unrelated behavior changes; construct URI only from validated canonical reference snapshots. Run source-equivalent Node 22 repro and applicable exact-head GitHub CI; report native test limitations. No deployed funds/contract/custody/network/policy changes.
- Coordination: C1 [PR #504](https://github.com/djshellshoxxx/GhostPay/pull/504) currently owns a large combined integration; its changed-file inventory did not include `packages/payment-uri/src/solana.ts`. Historical broad #278/#372 edit shared payment-uri tests but not this source/new test path. Claims may change; recheck before integration. The repository integration lock was *released* at generation 12 at inspection; this worker **does not acquire it**. Do not merge to main or modify C1 integration. Independent review and exact-head required CI are pending.
# TRON payment URI optional-input snapshot — 2026-11-24 UTC

Cycle `20261124T0637Z`; one sequential ChatGPT coordinator (no delegated verifier). Isolated branch `automation/20261124T0637Z/bug/tron-uri-input-snapshot`, main/base `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own only `packages/payment-uri/src/tron.ts`, new `packages/payment-uri/src/tron.input-snapshot.test.ts`, this additive claim, and `docs/handoffs/TRON_URI_INPUT_SNAPSHOT_20261124.md`. The local builder reads each present optional amount/token/label/message twice, unlike the existing adjacent builder repairs; changing local accessor values make serialization depend on a second observation. Acceptance: each supplied optional field is read once, initial values round-trip with a synthetic Nile fixture, absent values remain omitted, malformed ordinary inputs remain rejected; preserve current network defaults and existing errors. This is local API determinism, not a claim of an external exploit. C1 #504 (all four file pages), #507, #496/#499/#502 and recent PR titles/bodies inspected; no identified TRON URI ownership conflict. Do not touch those branches. No contract, deployment, dependency, real-funds or policy changes. Generation 15 integration lock observed released, not acquired. Exact-head hosted checks and independent verification required before integration.

---

# C1-R11 — repair Sweep test RPC's ERC-20 simulation response (2026-11-23 UTC)

Cycle/worker: `20261123T1637Z` / one sequential integration coordinator, bug investigator and implementer; native subagents unavailable and no independent verification claimed.
Isolated branch: `automation/20261123T1637Z/bug/c1-sweep-simulation-fixture`, exact base: draft PR #512 head `2a6914c2a036856c939f746a88a3b6dc761860d7`; dependency #504 → #510 → #512 → this child. Current main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: additive claim in this file; `apps/web/src/views/Sweep.test.tsx` (test RPC fixture and narrowly scoped assertion only); new `docs/handoffs/C1_SWEEP_SIMULATION_FIXTURE_20261123.md`. Do not modify production Sweep/txGuard, owner integration branches, contracts, wallet keys, deployment settings or shared ledgers.
Finding: #512 exact-head hosted web-unit job 137773795613 fails B-R6 at `Sweep.test.tsx:784` because `extra()` routes a successful ERC-20 transfer `eth_call` to a fabricated EIP-712 domain separator rather than a canonical ABI `bool true` result. `simulateCall` correctly marks that nonboolean result `unavailable`, so the skipped-dry-run warning is truthful but the test's assumption that a dry run succeeded is not. This is a deterministic test-fixture defect, not a verified production vulnerability.
Acceptance: restore a realistic canonical success response to the fixture's transfer selector, preserve `dryRunBlind` failure, assert transfer simulation actually happens, preserve B-R6's displayed warning for unavailable calls and absent warning for successful calls; no assertion weakening, coverage changes or production behavior changes. Run source-based baseline reproduction and available exact-head hosted CI, report any unrun local tests honestly. Require external independent verification and legitimate integration-lock ownership before merging into any shared target.
Ownership/lock: #504 integrator owns broad combined source, #512 child source remains untouched. Integration metadata branch `automation/ghostpay-integration-lock` read at `082e754f44944ebb4be283f89176b966bf8f7b4f`, generation 12 released; no lock acquired and no merge authorized by this isolated work.

---

# C1 browser keyboard focus regression repair — 2026-11-23T12:39Z

- Cycle/coordinator: `20261123T1239Z`; one sequential ChatGPT agent, no native subprocess agents or independent review.
- Isolated branch: `automation/20261123T1239Z/bug/c1-context-help-focus`, exact base PR #504 head `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`; upstream integration target is PR #504 owner branch `nodata/determined-allen-x5n560`. Main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Do not update parent branch directly.
- Scope: `apps/web/e2e/contextual-help.spec.ts`, this additive claim, and `docs/handoffs/C1_CONTEXT_HELP_FOCUS_20261123.md` only. Parent #504 owns the combined integration; coordinate by focused child PR, no upstream merge, lease transfer or workflow edits.
- Confirmed baseline: exact-head Core CI [45151780276](https://github.com/djshellshoxxx/GhostPay/actions/runs/45151780276) failed `e2e (full)` and `e2e (lean)` keyboard focus test. PR #504 added a secondary RPC input in DOM order between the primary's help button and the `Test Base Sepolia` button. Current test expects focus to skip that input after a single Tab; this is stale, not proof of broken tab navigation.
- Acceptance: retain tooltip Escape/Enter, accessible description, focus and dismissal assertions; after one Tab assert secondary URL field receives focus and tooltip closes; after another Tab assert Test Base Sepolia gets focus. Preserve both RPC controls and do not relax/skip E2E. Obtain hosted exact-head browser confirmation and independently reviewed integration before marking verified. Other C1 failures (Sweep test and 900px RPC alignment) remain explicitly outside this branch.
- Verification plan: exact-source code review; targeted syntax/static check if execution environment permits; hosted full/lean E2E and tests; record unrun checks without inference. PR should remain DRAFT while other C1 CI failures and integration-lock owner approval remain outstanding.
- Integration lock: `automation/ghostpay-integration-lock` read as generation 12 `released`, owner `claude-keen-volta-8ctx9x` at this observation; this worker has not acquired it. No protected/main ref update, release, deployment or real-funds action.

---

# C1 — combined fast-track integration of reviewed fix PRs (2026-11-23)

Worker: Claude lead coordinator `claude-determined-allen-x5n560` with 11 independent Claude reviewer subagents (read-only; they did not author any integrated change). Branch `nodata/determined-allen-x5n560`; base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Scope: merge (no-ff, original heads, provenance kept) 93 independently reviewed open PR heads plus one hand port (#416), resolve only `docs/` conflicts by union, and add integrator-owned lint/type repairs where PRs never received hosted CI. Ledger and dispositions: `docs/handoffs/CLAUDE_CONSOLIDATION_C1_20261123.md`.
Owned paths: this claim, that handoff, and integrator repair commits on this branch only (`packages/hygiene/src/buffer.runtime-types.test.ts`, `packages/ux-export/src/types.ts`, `packages/ux-guide/src/checklist.ts`, `packages/qr-exchange/src/camera.attach-boundary.test.ts`, `apps/web/src/components/ReceiptPanel.archive.regeneration.test.tsx`, `apps/web/src/lib/format*.ts`). No donor branch is edited, force-pushed or deleted.
Excluded by design: P0-A payment-recovery stack (#427, #440, #441, #443, #500; owner `claude-keen-volta-8ctx9x`), P0-B refund/expiry work (#455 audit; no implementation branch found), dependency bumps, large consolidations and feature stacks (F03/F04/F05/F10, Tor), and PRs reviewed CHANGES/REJECT (#316, #389, #442).
Acceptance: local affected typecheck, lint and tests (Foundry 1.8.5 anvil present) green on the combined head; exact-head hosted CI green; integration lock acquired (generation 13) before merging to main and released after; post-merge main CI observed.

---

# GP-BUG R11 — reject missing entries in tip-page suggested amounts (2026-11-23)

Worker: ChatGPT BUG-ONLY coordinator; sequential implementation and self-review, no independently submitted verifier. Task branch `automation/20261123T0742Z/bug/ux-links-sparse-tip-presets-r11`; exact verified live main base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/ux-links/src/tip.ts` (baseline Git blob `4ec5184bd2379c5bf06065f029b7cf637e27fa42`), NEW `packages/ux-links/src/tip.sparse.test.ts`, additive ownership entry here, and NEW `docs/handoffs/UX_LINKS_SPARSE_TIP_PRESETS_R11_20261123.md`. Existing `tip.test.ts` remains unmodified; broad open PRs #224/#238/#262/#264/#278/#372 change it.
Finding: `buildTipPageModel` validates the `suggested` array length but uses `Array.map`, which skips absent indices. Sparse one-, two-, and three-entry arrays therefore return page models with missing suggested amounts rather than failing with existing `LinkError('TIP')`. Source-line evidence from `tip.ts`; Node 22 standalone source-equivalent red reproduction: 3/3 missing-element regressions fail before the guard.
Acceptance: regression committed before production change, reject holes at any index with existing TIP/suggested error; valid dense ordered presets, URI generation and bounds remain unchanged. Hosted exact-head CI + applicable native browser checks; independently submitted review and legitimate integration-lock ownership required before merging. No new features/dependencies, contracts, custody/funds, network attacks, deployment or release.
Ownership reconciliation: inspected changed-file inventories of ALL 255 currently open PRs (#500 down to #51), zero ownership collisions on the production file and new test path. Use separate targeted test to avoid test-file owners. PR #390 remains externally owned. Generation-12 integration metadata lock was observed `released` at `082e754f44944ebb4be283f89176b966bf8f7b4f`; no lock acquisition or integration rights are inferred.
# GP-BUG — QR camera stream cleanup on attachment failure (2026-11-23)

Worker: GhostPay BUG-ONLY automation coordinator (single sequential source/runtime verifier; no independent reviewer available).
Branch: `automation/20261123-r12/bug/qr-camera-attach-cleanup`; exact live main base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned files: `packages/qr-exchange/src/camera.ts`, new `packages/qr-exchange/src/camera.attach-boundary.test.ts`, this additive registry claim, and new `docs/handoffs/QR_CAMERA_ATTACH_BOUNDARY_20261123.md`. Existing `camera.test.ts` and other workers' branches remain untouched.
Observed defect: after getUserMedia resolves a track-bearing stream, a throwing `video.srcObject` setter is outside the try/catch cleanup boundary; `startCamera` rejects with the platform error and leaves tracks running. Source-body-matched Node/V8 reproduction on main blob `d849dfa89a64837e9ede9eca2c03fa3064cafcf5` observed one attachment failure, zero stops and zero play calls. Ordinary attachment and playback succeeded.
Acceptance: commit a failing dedicated regression before source repair; stop only the acquired stream on failed attachment and return existing `CAMERA_UNAVAILABLE`, without touching another stream, normal acquisition/play behavior, scanner, protocols or devices. Verify source-body-matched red/green and neighboring failure/abort cases; exact-head hosted CI and independent review still required; keep PR draft, no merge without legitimate integration lock and all checks.
Ownership: fetched live main, AGENTS/workflow/handoff/registry, PR #390 status/reviews/workflows; inspected changed file lists for all 257 open PRs through #502 across three pages, with no active PR owning the selected camera source or new test path. Integration metadata generation 12 is released at `082e754f44944ebb4be283f89176b966bf8f7b4f`; no implied merge authority.
# Canonical invoice array follow-up

Owner: this consolidation pass. Branch: `integration/ghostpay-canonical-array-followup-20261124`. Base: `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Owned paths on this isolated branch: this claim and `packages/invoice-schema/src/json.ts` and `json.test.ts`. Donor: `fbcf69223a524b8e3d74fb093dfc71d8b91bdc27`.

Acceptance: preserve canonical outputs for ordinary dense arrays and run invoice-schema tests, typecheck, lint and build with the donor's descriptor snapshot. PR #504 carries the earlier sparse-array change. Land #504 first and refresh this draft against its merge before integration.

---
## Pages HTTPS and Tor/RPC compatibility review

Worker: Codex, branch `audit/pages-tor-rpc-compat-20261124`, main base
`f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own this additive entry,
`docs/pages/tor-rpc-compatibility.md` and `apps/web/e2e/https-rpc-compatibility.spec.ts`.
Trace the lean Pages asset graph and RPC dispatch, exercise synthetic invoice and
scan settings, and distinguish application results from live Tor qualification.
Network transport, wallet, scanner, hosted onion acceptance and release controls
remain with their existing owners (#241, #308, #320, #363, #436).

## Issue #286 · private export and notification surfaces

Worker: Codex on `codex/286-private-export-surfaces`, based on main `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own the Pages download boundary, policy/adapter/schema error presentation, React and i18n diagnostics, the ux-notify lock-screen formatter, and associated regressions and qualification notes. Keep clipboard, masking, idle-lock, serialization, import and recovery workers' changes separate. Acceptance requires fixed filenames and lock-screen copy, public diagnostics and titles, and exact preservation of explicitly exported bytes. Hosted checks and independent review gate integration.

## Issue #286 item 5 · privacy-safe exports and notifications onto current main (2026-11-25 UTC)

Worker: Claude Code session `ghostpay-42` (main checkout). Branch: `claude/w-export-privacy-286-20261125`, base main
`32ae3977`, donor #570 `codex/286-private-export-surfaces` @ `55781533` merged with `--no-ff` (not rebased).
Assigned by the feature-completion coordinator (`feature-completion-06`) after its shared-core privacy triage.
Owned paths: the Pages download boundary (`apps/web/src/components/Common.tsx` download helpers), the call sites'
fixed file names, donor #570's error/announcement/diagnostic surfaces, `packages/ux-notify` lock-screen title, and
their regressions and docs. Not owned: clipboard (W4 #668), CreateInvoice's Copy-link row, privacy-minimal invoices
(W4), masking (#569), vault/session isolation (#571/#655), RPC disclosure (W3), wallet disclosure (FC-07), address
reuse (newghostpay-ae).
Acceptance: no address, hash, amount, invoice detail, date or key in any suggested download name; exported bytes
unchanged and importable; recovery file names stay recognizable; no secret in notifications, alerts, live regions,
titles, URLs or console; hosted CI green at the exact head; independent review; merge via the shared queue.
Status (2026-11-25 18:03Z): **merged** as PR #675 (`236501fe`) through candidate #681 (42 pass, 0 fail at the exact
head), lock generation 29 (released `62a6ea30`). Donor #570 is superseded by #675.


# Scan-source consolidation candidate — 2026-11-24 UTC

Coordinator: 20261124T0037Z, one sequential ChatGPT coordinator; no delegated workers or independent approval. Branch `automation/20261124T0037Z/coordinator/scan-source-rollup`, exact parent #527 `482d6ab973389083126dd8794f2b21d096a04977`, main/merge base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Own only this isolated branch, the additive claim and `docs/handoffs/SCAN_SOURCE_ROLLUP_20261124.md`. Preserve all donor commits from #520, #523 and #527; no new production edits or donor branch writes. The parent stack passed all five hosted workflow groups; main-targeting qualification and independent review remain required. Acceptance: main-relative comparison preserves exact three source/test blobs, no unrelated changes, main-targeting draft with explicit supersession-for-integration (not closing donor PRs), no shared ref update. No integration lock acquired; generation 12 was released at observation. No merge, deployment, release, real funds or policy changes.

---

# 20261123T2235Z — range scan record-isolation integration regression

Worker: one sequential coordinator/test author; no native independent verifier. Branch `automation/20261123T2235Z/test/scan-range-record-isolation` based on #523 exact head `36cf79d0ce4a31f79a5799af2f8f5e30bd244029`; main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owned paths: new `packages/scan-source/src/range.announcement-boundary.test.ts`, this additive claim, and new `docs/handoffs/SCAN_RANGE_RECORD_ISOLATION_20261123.md`. No production edits. #520/#523 own validator source/test; #222/#249/#238/#262/#264/#278/#372 own range source and existing range tests. Do not edit those paths or their branches.

Acceptance: demonstrate that a malformed individual record does not interrupt a multi-window range scan, that valid records before and after it remain in deterministic order with precise skipped accounting and unchanged coverage, and that a real backend rejection remains a rejection. Use synthetic testnet fixtures only, no network or real funds. Exact-head hosted CI and independent review required. Lock generation 12 released, not acquired. No shared integration or deployment.

---

# Scan-source proxy fixture lint follow-up — 2026-11-23T20:41Z

Cycle 20261123T2041Z; one sequential coordinator (no independent worker). Isolated child `automation/20261123T2041Z/bug/scan-proxy-test-lint` of PR #520 at `74164baa0c0781955383794d5243f5ed25e46ae4`, main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owned paths: `packages/scan-source/src/validate.test.ts`, this additive claim, and new `docs/handoffs/SCAN_PROXY_FIXTURE_LINT_20261123.md`. No production edits; preserve #520's original head and all regression assertions.
Acceptance: resolve hosted lint job 137928103881 at line 31 (unsafe Reflect.get return) by typing the proxy result as unknown; retain throwing metadata and revoked proxy scenarios; requalify exact-head lint and all applicable CI. No gate changes, deployment, real funds or shared integration. Lock observed released generation 12, not acquired. Independent review outstanding. Recent PRs #522/#521/#519/#518/#516, C1 #504, #517, #380/#471 and dependency updates #493/#492 checked for test-path overlap; none found.

---

# R-Scan-20261123 — fail closed on unreadable untrusted announcement records

Worker: sequential GhostPay engineering coordinator (one execution; no independent native workers or reviewer available).
Cycle: `20261123T1840Z`. Isolated branch: `automation/20261123T1840Z/bug/scan-announcement-getters`. Exact base main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: this additive claim, `packages/scan-source/src/validate.ts`, additive tests in `packages/scan-source/src/validate.test.ts`, and `docs/handoffs/SCAN_ANNOUNCEMENT_ACCESSOR_BOUNDARY_20261123.md`.
Dependencies: none; do not edit or merge C1 #504 or its children #510→#512→#517. Repository integration lock `automation/ghostpay-integration-lock` last read released generation 12; no lock acquired and no authority to integrate main.
Finding: exported `parseAnnouncement(raw: unknown)` promises never to throw on hostile records, but reads nine record properties directly. An input accessor or revoked Proxy throws, aborting the scan instead of dropping that malformed record. Reproduction must be a failing regression before repair.
Acceptance: getter/trap and revoked-Proxy cases return `undefined` without throwing; all raw fields, including optional transactionHash, are read no more than once; normal records, malformed optional hashes, canonical IDs and count/drop semantics remain unchanged. No crypto, backend, contract, deployment, dependency or real-funds edits. Hosted exact-head typecheck, lint, unit/browser gates and independent verification required before merge; do not interpret standalone checks as full qualification.
# Qualify native QR image decoding on PR #508

Worker: Codex, branch `codex/qualify-508-invoice-link`, based on #508 at `1cf9ec458bdd193f186499ac30ac3f7b207cfe0c`. Main at preflight: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Scope on this child branch: this entry and `packages/qr-exchange/src/readers.platform-candidates.test.ts`. The R14 owner retains the decoder and parent branch.
Acceptance: mock one detection list with empty text before a signed invoice link, then a list with two usable links. Assert the exact returned link in each case and run the qr-exchange package suite.
Follow-up on #547 at `4befc6434635f28ce9fd11822e819d5367f727d7`: Codex owns fuzz coverage in the same test file on this qualification branch. Check ordering, text-length boundaries, all-unusable lists and bitmap cleanup against generated detector results.

# GP-BUG R14 — Select a usable platform QR candidate (2026-11-23)

Worker: GhostPay BUG-ONLY scheduled coordinator, sequential implementer and source reviewer; no independent verifier assigned. Branch: `automation/20261123T1121Z/bug/qr-reader-platform-candidates-r14`, base live main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/qr-exchange/src/readers.ts`, new `packages/qr-exchange/src/readers.platform-candidates.test.ts`, this additive registry claim, and new `docs/handoffs/QR_PLATFORM_CANDIDATES_R14_20261123.md`. Do not alter `readers.test.ts` or another worker's branch.
Observed source defect: `decodeQrImage` considers only `found[0]?.rawValue` from the platform BarcodeDetector; when the first recognized code has an empty or overlong decoded text but a later detected code is valid, it returns null, leaving a legitimate scannable QR unread. Source `readers.ts` blob `caea9b8a3bbfeb9e626814e5db3882e22e568921`.
Acceptance: regression FIRST for multi-result native scan (bad first/valid second, valid-first ordering), preserve existing single valid/invalid result and empty-result jsQR behavior, perform the smallest selection fix. Test exact-head hosted CI; separate native-browser/independent review required. Never claim full local Vitest without native checkout.
Ownership preflight: live open PR listing and changed-file checks including #238/#246/#248–254/#261/#262/#264/#270/#278/#294/#302/#307/#310/#365/#372/#390/#504 and relevant recent bug PRs show no direct `readers.ts` claim in examined sets; complete 262-open-PR file audit remains a merge gate. Existing #294/#302/#307 own `assembler.ts`; do not touch. Main integration lease `automation/ghostpay-integration-lock` generation 12 is released, not held by this worker. No lock acquisition or main merge.
No new features, UI, dep, contracts, funds, real-world traffic, release or deployment.
# GP-BUG — QR camera stream cleanup on attachment failure (2026-11-23)

Worker: GhostPay BUG-ONLY automation coordinator (single sequential source/runtime verifier; no independent reviewer available).
Branch: `automation/20261123-r12/bug/qr-camera-attach-cleanup`; exact live main base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned files: `packages/qr-exchange/src/camera.ts`, new `packages/qr-exchange/src/camera.attach-boundary.test.ts`, this additive registry claim, and new `docs/handoffs/QR_CAMERA_ATTACH_BOUNDARY_20261123.md`. Existing `camera.test.ts` and other workers' branches remain untouched.
Observed defect: after getUserMedia resolves a track-bearing stream, a throwing `video.srcObject` setter is outside the try/catch cleanup boundary; `startCamera` rejects with the platform error and leaves tracks running. Source-body-matched Node/V8 reproduction on main blob `d849dfa89a64837e9ede9eca2c03fa3064cafcf5` observed one attachment failure, zero stops and zero play calls. Ordinary attachment and playback succeeded.
Acceptance: commit a failing dedicated regression before source repair; stop only the acquired stream on failed attachment and return existing `CAMERA_UNAVAILABLE`, without touching another stream, normal acquisition/play behavior, scanner, protocols or devices. Verify source-body-matched red/green and neighboring failure/abort cases; exact-head hosted CI and independent review still required; keep PR draft, no merge without legitimate integration lock and all checks.
Ownership: fetched live main, AGENTS/workflow/handoff/registry, PR #390 status/reviews/workflows; inspected changed file lists for all 257 open PRs through #502 across three pages, with no active PR owning the selected camera source or new test path. Integration metadata generation 12 is released at `082e754f44944ebb4be283f89176b966bf8f7b4f`; no implied merge authority.

---

# BUG-ONLY R13 — reject duplicate Accept-Language q parameters (2026-11-23)

Worker: one ChatGPT coordinator, sequential source review and regression-first implementation; no independent verifier available. Branch: `automation/20261123T1035Z/bug/i18n-duplicate-language-q-r13`; base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/i18n/src/negotiate.ts`, new `packages/i18n/src/negotiate.duplicate-q.test.ts`, this additive claim, and new `docs/handoffs/I18N_DUPLICATE_LANGUAGE_Q_R13_20261123.md`.
Observed defect: `parseAcceptLanguage('en;q=0;q=1,fr;q=0.5')` incorrectly permits `en` because successive valid `q` parameters overwrite one another. Multiple qweights on one language range are malformed; accepting the last value can revive a q=0-excluded language. Acceptance: reject an entry with duplicate qweights, retain all normal single-q, q=0, quality ordering, header/entry caps and invalid-entry handling. No new features, dependencies, UI, network, contracts, fund interaction, release, or deployment.
Ownership: inspected live open PR inventory including broad source PRs #278/#262/#264/#307/#372 and #504, and targeted i18n/security PRs #368/#249/#211/#218/#219/#222/#310/#224; none modified selected files. Not a claim of exhaustive 260-PR path review. Reinspect before integration. PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882` succeeded 5 workflows; no independent review; head dirty against current main; owner untouched. Integration lock `automation/ghostpay-integration-lock` generation 12 released; no lock ownership acquired. Require exact-head CI, appropriate browser checks, independent review and legitimate integration authorization before merge.
# BUG-ONLY R11 — merchant payment button invalid runtime labels (2026-11-23)

Worker: single ChatGPT repair coordinator, no independent reviewer. Isolated branch: `automation/20261123-r11/bug/merchant-button-invalid-label`, exact main base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`; source blob `packages/merchant-hooks/src/button.ts` = `386adf476b05b9010b3e757ff960489107d80258`.
Owned paths: this additive registry entry; `packages/merchant-hooks/src/button.ts`; new `packages/merchant-hooks/src/button.runtime-label.test.ts`; new `docs/handoffs/MERCHANT_BUTTON_RUNTIME_LABEL_R11_20261123.md`. Do not edit pre-existing shared `hooks.test.ts` (PRs #398/#504) or another branch.
Observed bug: `buildPaymentButton` documents `HooksError('bad-label')` for untrusted invalid labels but a nonstring runtime label reaches `label.replace` and throws native TypeError. Exact main source Git blob reconstructed locally with matching `git hash-object`; a Node.js 22/TypeScript 5.8.3 isolated execution with link dependencies doubled returned TypeError for null, undefined, number, boolean and array (5 failed expected-error assertions; valid/escape/cap/empty/bad-link 5 passed). No real requests, wallet or payment interaction.
Acceptance: commit a failing dedicated Vitest regression first, then one type guard producing existing `HooksError('bad-label')` while preserving malformed-link precedence and valid text escaping, Unicode cap and whitespace/control handling; execute source-matched directed and neighboring checks; hosted exact-head CI and applicable Pages browser gate required before promotion. No new dependencies, redesign, features, refactors, contracts, network attack, deployment or release.
Ownership: complete 267-PR changed-file inventory (open snapshot #512 down to #51, pages 1–3) checked for the two paths: no collision; adjacent existing `hooks.test.ts` owned by #398 and #504 and left untouched. Recheck heads before integration. Integration metadata branch `automation/ghostpay-integration-lock`, generation 12 status `released`; not acquired. PR #390 separately rechecked: exact head `b655bc273a6704c9c140287b8adcdf4085b91882`, all five workflow groups successful, no submitted independent reviews, `mergeable=false`; owner branch unchanged.
# GP-BUG — Isolate natural-language amount locale descriptors (2026-11-23)

Worker: ChatGPT BUG-ONLY coordinator, sequential author and verifier; independent review pending.
Branch: `automation/20261123T1924Z/bug/nl-amount-locale-snapshot`; base main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/ux-intake/src/nlamount.ts`, new `packages/ux-intake/src/nlamount.locale-snapshot.test.ts`, this additive claim, new `docs/handoffs/NL_AMOUNT_LOCALE_SNAPSHOT_20261123.md`. Existing nlamount.test.ts is owned by broad PRs and is untouched.
Observed: the public mutable return of separatorsForLocale is the actual static table record shared by multiple locales. A caller editing one result changes subsequent English/English-US/Japanese lookups; isolated source-derived V8 reproduction passed 3/6 checks before and 6/6 with a detached result. This breaks deterministic locale interpretation of subsequent amount text. No transactions or funds used.
Acceptance: commit regression first; return a detached descriptor while preserving exact and fallback tags and unknown-tag behavior. Tests must cover parsing after a caller mutates a previous descriptor. No new feature, dependency, policy or payment behavior changes. Local full checkout unavailable (DNS); report isolated execution separately from exact-head hosted CI.
Ownership: 275 open PR changed-file inventories through #520 checked, no selected source or dedicated test path collisions; existing registry has no nlamount claim. Integration lease generation 12 released at 082e754f44944ebb4be283f89176b966bf8f7b4f, not acquired. No main integration, deployment, release or edits to other branches.
# GP-BUG — strict CSV parser accepts ragged records (2026-11-23)

Worker: sequential ChatGPT BUG-ONLY coordinator, no independent verifier. Branch: `automation/20261123T2123Z/bug/ux-export-ragged-parser`; exact base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/ux-export/src/parser.ts`, new `packages/ux-export/src/parser.rectangular.test.ts`, additive claim here, and new `docs/handoffs/UX_EXPORT_RAGGED_PARSER_20261123.md`.
Finding: exported parseCsv documents rejection of ragged rows but returns them unchecked; only parseLedgerCsv independently calls assertRectangular. Exact baseline parser/text/errors blobs locally matched and Node 22 isolated reproduction failed four ragged-row assertions (8/12 passing). No financial behavior or actual account data involved.
Acceptance: commit failing tests before fix; call existing assertRectangular on complete parsed records before return, preserving existing syntax/limit error precedence, empty input, valid quoted/empty fields, and typed row-index errors. No new dependencies or refactor. All 278 open PR changed-file inventories in snapshot through #523 inspected, no collision on parser paths; main and newest PR heads rechecked before branch creation. Existing claims retained. PR #390 exact head b655bc273a6704c9c140287b8adcdf4085b91882, 36 successful/3 skipped checks, zero submitted reviews, nonmergeable, owner untouched. Integration lease generation 12 released at 082e754f44944ebb4be283f89176b966bf8f7b4f; no ownership acquired. Draft only pending independent review and exact-head CI. No deploy or release.
# GP-BUG R11 — anchor attribute-name boundary in static markup audit (2026-11-23)

Worker: GhostPay BUG-ONLY automation coordinator; sequential author and test review, not an independent verifier. Branch: `automation/20261123-r11/bug/metadata-anchor-attribute-boundaries`; exact base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths on this branch: `packages/metadata-hardening/src/web.ts`, new `packages/metadata-hardening/src/web.anchor-attributes.test.ts`, additive claim in this document, and new `docs/handoffs/METADATA_ANCHOR_ATTRIBUTES_R11_20261123.md`. No changes to shared branches or existing `web.test.ts`.
Observed defect: `findUnsafeAnchors` uses `\\btarget` and `\\brel` attribute regexes. A hyphen preceding `target` or `rel` is a word boundary, so `data-target="_blank"` is treated as a real `target`, and `data-rel="noopener noreferrer"` can mask an absent real `rel`. A source-equivalent Node 22 probe reproduced both incorrect outcomes (2/5 directed cases failed on original source). This is a local markup-audit correctness flaw; no real-world exploit claimed.
Acceptance: regressions first for data-/aria- prefixed lookalike attributes, preserve genuine target/rel cases and mixed case/whitespace; require real attribute names preceded by whitespace; verify before/after directed probe, exact-head hosted CI and applicable browser checks; leave draft pending independent review and legitimate integration lock ownership. No new dependencies, release, contract/fund interactions, network attacks, deployment or broad refactoring.
Ownership preflight: snapshot of 259 open PRs (including broad #278/#372/#504) on 2026-11-23; changed-file checks on #404, #365, #249, #367, #243, #278, #372, #504 found no claim on `web.ts` or the new test path. The #504 fast-track integration PR does edit sibling `guard.ts`, so no files owned by it are changed here. This is targeted—not a complete 259-file-list census; recheck conflicts before integration.
Integration metadata lock ref `automation/ghostpay-integration-lock` observed at `082e754f44944ebb4be283f89176b966bf8f7b4f` (generation 12, released); this is not an acquisition or merge grant. PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882` has five successful exact-head Actions workflow groups, 39 check runs success/skipped and no submitted independent review; owner branch untouched.
# BUG-ONLY R11 — Reject fabricated CryptoKey records before preset operations (2026-11-23)

Worker: one ChatGPT sequential implementer/reviewer (no separate independent verifier available). Isolated branch: `automation/20261123/bug/ux-presets-real-cryptokey-r11`; exact baseline main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/ux-presets/src/seal.ts`, NEW `packages/ux-presets/src/seal.cryptokey-boundary.test.ts`, NEW `docs/handoffs/UX_PRESETS_CRYPTOKEY_AUTHENTICITY_R11_20261123.md`, and additive claim only in this file. No other owned paths. All 263 open PR changed-file inventories (100+100+63 snapshot, through #508) checked; none touches either selected production or dedicated test path. Recheck before integration; older claims remain respected.
Confirmed source-executed failure: `resolveKey()` accepts an ordinary object mimicking `CryptoKey` fields (`type: secret`, AES-GCM/256 `algorithm`, encrypt/decrypt `usages`) and returns `ok`, despite no native key object. The next encryption/decryption cannot use that result. Source Git blob: `4f444ee01734d4135887d0a45c401c67b02295da`; observed via extracted original function body in V8 with TypeScript annotations removed. No RPC, funds, contracts or real wallet involved.
Acceptance: commit a failing Vitest regression before modifying `seal.ts`; reject plain fabricated records with the existing `bad-key` result; preserve genuine WebCrypto AES-GCM-256 key acceptance, 32-byte import and wrong-key rejection. Check targeted source-exact before/after reproduction and hosted exact-head GitHub CI; do not claim local full repository tests without a checkout. No dependencies/features/UX change. Require independent review, browser checks if applicable and legitimate integration lease ownership before merge. PR #390 remains owner controlled; its exact-head five workflow groups GREEN, no submitted independent review, mergeable=false, no edits in this cycle. Generation-12 lock is released but never acquired by this worker. No merge, release or deployment.
# GP-BUG R12 — gracefully reject unreadable injected fiat quotes (2026-11-23)

Worker: single BUG-ONLY automation coordinator. Task branch: `automation/20261123/bug/ux-fiat-quote-accessor-r12`; current main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Claimed production path: `packages/ux-fiat/src/view.ts`; dedicated regression path: `packages/ux-fiat/src/view.quote-accessor.test.ts`; additive claim in this registry and new `docs/handoffs/UX_FIAT_QUOTE_ACCESSOR_R12_20261123.md`. Preserve other contributors' files and branches.

Confirmed defect: injected `RateQuote` contains a throwing property getter (asset/fiat/rate/timestampMs/source). `computeFiatView` states that it never throws and must return `invalid` for a malformed quote, yet uncaught `parseRate` property reads throw and escape the display computation. Verbatim `view.ts` source at Git blob `74f791587a6eba3cce0e7a4be98d7085196ffc4b`, compiled with isolated dependency doubles, produced five thrown getter cases and an unaffected valid case under Node 22.16.0/TS 5.8.3. No full checkout or native repository Vitest claim; github.com DNS unavailable locally.

Acceptance: regression-first deterministic getter/Proxy cases, mapped to existing `bad-rate-format` invalid state; preserve good quote, ordinary malformed quote, no-rate, and stale/future semantics. Smallest exception boundary around parser for untrusted quote. No new interfaces, dependencies, networking, payment, custody, contract, release or deployment work. Preflight reviewed all 265 open PR changed-file inventories (snapshot through PR #510); none owns either selected path. PR #390 stays owner-controlled, five exact-head workflows passed with independent review absent and mergeable=false. Integration metadata lock `automation/ghostpay-integration-lock` generation 12 released at SHA `082e754f44944ebb4be283f89176b966bf8f7b4f`, not acquired. Required gates: exact-head hosted CI/browser if applicable, genuine independent review, updated ownership and legitimate integration lease before merge.
# BUG-ONLY — Japanese shared-script letters (2026-11-24 UTC)

Worker: GhostPay bug-repair coordinator, sequential author/test review (no independent reviewer). Branch `automation/20261124T0018Z/bug/ux-intake-japanese-script-extensions`; base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/ux-intake/src/text.ts`, new `packages/ux-intake/src/text.japanese-script.test.ts`, this additive branch-only ownership claim, and new `docs/handoffs/UX_INTAKE_JAPANESE_SCRIPT_20261124.md`.
Observed failure: source blob 46dff62739d960f78f0a1519b884faf4b22b1d73, Git-hash-matched Node 22 / TypeScript 5.8.3 reproduction, 7/11 passed. Japanese prolonged-sound and iteration letters are Script=Common with Hiragana/Katakana script extensions; treated as Other and falsely classified mixed. Acceptance: test-first valid Japanese examples and neighboring true mixed-script and control cases; minimal Kana Script_Extensions matching, no API or dependencies change. Snapshot of 290 open PR changed-file inventories found no owned source/test overlap; recheck before integration. PR #390 exact head all five workflow groups succeeded, zero reviews, nonmergeable; no changes. Lock generation 12 released, not acquired. Draft only, no main merge, fund, deployment or release.
# GP-BUG — Preserve independent duplicate-group warnings (2026-11-24 UTC)

Worker: ChatGPT BUG-ONLY coordinator, sequential author and runtime verifier; independent review pending.
Branch: `automation/20261124/bug/vault-duplicate-group-kind-r11`; exact base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/ux-vault/src/confusables.ts`, new `packages/ux-vault/src/confusables.group-kind.test.ts`, this additive claim, new `docs/handoffs/UX_VAULT_DUPLICATE_GROUP_KIND_20261124.md`. No edits to existing tests or other workers' refs.
Observed failure: findDuplicateGroups pools exact-address and duplicate-label group signatures into one suppression set. Same-label contacts with distinct edge-matching addresses lose their lookalike-address warning; exact-address duplicates with distinct confusable labels lose their confusable-label warning. Isolated Node reproduction 7/9 passed, two incorrect suppressions. Acceptance: suppress each redundant group only when its corresponding exact category has identical contact membership; preserve ordering, same-category suppression, unrelated groups and individual candidate checks. Commit focused regression before production repair.
Ownership: inspected all 292 open PR changed-file inventories in snapshot through #537; no confusables source or focused test claim. Rechecked main and new PR delta. PR #390 exact head b655bc273a6704c9c140287b8adcdf4085b91882 five workflow groups green, Snyk green, no review; owner ref untouched. Integration lease generation 12 released at 082e754f44944ebb4be283f89176b966bf8f7b4f; not acquired. No merge before independent review and all exact-head gates. No network, funds, release, deployment or new features/dependencies.
# GP-BUG — Merchant decimal uint256 round-trip (2026-11-24 UTC)

Worker: sequential ChatGPT bug-only coordinator; no independent verifier available. Branch: `automation/20261124/bug/merchant-decimal-uint256-roundtrip`, exact base `e0cb4681e453af77bb10be45ba61b4d19579f41b`.
Owned paths: `packages/merchant-billing/src/money.ts`, new `packages/merchant-billing/src/money.uint256-roundtrip.test.ts`, this additive claim, new `docs/handoffs/MERCHANT_DECIMAL_UINT256_20261124.md`.
Evidence: hash-matched full money.ts and errors.ts compiled with TypeScript 5.8.3 and run on Node 22.16.0: 21/26 checks passed; five valid round trips fail (42-digit integer and uint256 maximum at decimals 0/6/18/36). Root cause: decimal integer regex capped at 41 digits, while parseAmount enforces the actual uint256 bound. Acceptance: regression first; allow up to 78 integer digits, keep overflow, precision and malformed input rejection; no contract, network, funds, dependencies, release or deployment changes.
Ownership: open-PR inventory inspected for money paths, including new #555; #414 disappeared from the live list and returned 404. No collision observed. Recheck before merge. PR #390 head b655bc273a6704c9c140287b8adcdf4085b91882: 36 successful, three skipped checks; Snyk success, no reviews, dirty merge state; owner untouched. Integration lease generation 13 released at 48330313f2cea71f28b8198b73929a0061bbe5ff; not acquired. Draft only pending exact-head CI and independent review.

## Individual payment keypair export

Codex, `codex/individual-stealth-keypair-export`, based on #542 at `7bbd651def1aa064f31ed91e272d07f629d3b871` above #539. Integrate the single-payment controls and their authorization helpers from #372 into this child for the recovery coordinator. Scope covers the Scan payment row, its export components and focused tests. Preserve #542's existing browser test. Acceptance requires a synthetic public record, encrypted file and deliberately confirmed raw key, independently matching the selected address, cancellation and leak checks. The archive, master backup, broader network changes and release decisions stay with their existing owners.

## Stopped-scan single-payment export acceptance

Worker: Codex. Branch `codex/stopped-scan-payment-export-acceptance`, based on #539 at `caef97781b407b105c8dce177c76dd515462e94e`. Owned paths are this additive claim and `apps/web/e2e/stopped-scan-payment-export.spec.ts`. The #539 coordinator owns the runtime extraction from #372. Use the existing synthetic RPC fixtures and normal browser controls to discover a payment, cancel the running scan, reauthenticate, download the encrypted single-payment keypair and independently derive the selected address without logging private key material. Keep the parent and donor branches untouched.

# Verify spending from an encrypted single-payment backup

Worker: Codex, branch `codex/verify-encrypted-payment-spend`, based on recovery PR #539 at `caef97781b407b105c8dce177c76dd515462e94e`. Main at inspection was `e0cb4681e453af77bb10be45ba61b4d19579f41b`.

Scope: a proposed addition to `scripts/recovery/raw-key-anvil.test.mjs` on this child branch, plus recovery availability and test instructions in the Spec 18 guide and references. Preserve the raw-key control. Use the existing exporter and standalone decoder to recover a single synthetic payment and spend on a loopback chain with an independent wallet tool. Check the authenticated chain, sender, receipt and resulting balances. Document which recovery controls exist on this extraction. Also cover conflicting header-inspection and private-key display flags in the standalone decoder and its existing CLI tests. Header inspection must never reveal a key. The Scan and Seller Keys integration stays with #539 and its browser acceptance with #542.

---

# M2 P0-KEYS — independent payment-key export/recovery onto main (2026-11-23)

Worker: Claude coordinator `session_01Tj2YczsZkZSBgfB5BugRcS` (nifty-bohr) with a core-implementation subagent; independent security/QA review subagents before PR is marked ready.
Branch: `claude/nifty-bohr-5ra2ap`; exact base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Source: PR #372 head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` (Spec 18 K01–K06 commits `5c0a12cc`, `2e4a76c9` and later fixes). Selective, source-pinned extraction; #372 and its parents stay untouched.
Owned paths: `packages/ux-vault/src/stealth-export-portable*` and its export entries; `apps/web/src/lib/{stealthExport,paymentKeyExport}*`; `apps/web/src/components/StealthExport*`; additive export authorization in `apps/web/src/lib/keyVault.ts` and `apps/web/src/lib/session.ts`; export mounts in `apps/web/src/views/{Scan,SellerKeys}.tsx`; matching locale/security keys; `scripts/recovery/*`; `docs/handoffs/P0_KEYS_SPEC18_EXTRACTION_20261123.md`.
Not owned: M1 journal paths claimed by `claude/keen-volta-8ctx9x` (PR #500), privacy/network-authorization lineage of #372, Sweep, relayer, contracts, hosting kit.
Acceptance: encrypted single/archive/master export and raw-key export behind re-authentication; recovery of any export in a fresh session; standalone decoder recovers signing authority with GhostPay session cleared (anvil-backed); tampered/wrong-passphrase/oversize/wrong-chain inputs refused; existing main RPC client only (no new endpoint, no fallback); full web + ux-vault gates; independent review; merge only under the integration lock.

# GP-PAGES-02 seller recovery and sole-copy safeguards

Worker: Codex on `codex/gp-pages-02-recovery-proof`, based on #540 at `8daebb0fa4a1cc1f771dbe724dede67f00028298` (child of #530). Main was `f76904301cff0b24d65ea4e31cbf37d470db4d95` at discovery. #539/#560 own individual payment exports. #577 retains the sole invoice signer inside #544's existing recovery-only idle state. This branch uses #260's close/reload guard and the existing Pages/Anvil restoration journey. Both changes go through their respective owners.

Owned paths: AppShell's beforeunload check, Seller Keys vault deletion and tests, corresponding security strings, the Pages recovery journey and recovery documentation. Acceptance: a download alone keeps the leave-page warning armed, a failed or unrelated file installs nothing, typed destructive confirmation protects a locked vault, same-meta/different-signer deletion fails closed, and the restored profile signs from the original payment address. No release, deployment or owner-branch writes.

---

# Seller Keys file-switch browser regression

Worker: Codex, branch `codex/seller-keys-file-switch-browser`, based on PR #530 at `88f7d1b496a1452f062d472d78e99b5401c61e35`. Main at discovery: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.

Owned paths: `apps/web/e2e/recovery.spec.ts` and this entry. Exercise the owner's existing verification UI with two genuine synthetic seller exports. After unlocking A and verifying A's file, selecting B must remove the success before another submission. B's own passphrase must produce the seller mismatch while A's public identity and serialized IndexedDB vault remain intact. Target #530's branch for owner integration.

---

# GP-PAGES-02 — selected seller keystore recovery verification (2026-11-23)

Worker and integrator: Codex. Branch: `codex/ghostpay-keystore-verification-20261123`. Refreshed main base: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.

Scope: `apps/web/src/views/SellerKeys.tsx`, the existing v1 codec in `packages/ux-vault/src/keystore-portable.ts`, localized messages, regression tests and this handoff. Main already authenticates a bounded encrypted keystore, derives and compares seller identities and clears transient key bytes in `apps/web/src/lib/session.ts`. The selected file lacks a reliable result, typed format/key diagnostics and focused recovery-safety assertions. Verification must preserve loaded keys and saved vault ciphertext, with only matching files qualifying as a verified external copy.

Coordination: Related open #365 `45ece45defd2a26cfb7f471ea4654ba4d1d2266e` and #504 `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` carry the operation-ownership lineage from #314/#333. Preserve those branches and avoid porting their unrelated save/unlock/export changes. #260 `f3bb7c662274c4a4394324c405b49517ad2b1461` reconciles the separate Spec 18 stealth-payment export work from #239/#240. Integration lock `082e754f44944ebb4be283f89176b966bf8f7b4f` was released at generation 12. No shared integration planned.

Acceptance: real v1 export round-trip and identity match, unchanged vault, safe typed failures, cancelled plaintext cleanup and distinct per-file UI states. Run focused and repository typecheck, lint, build, browser, bundle and committed-secret checks. Obtain independent exact-head review.

---

# R35 — reject throwing chain-lookup accessors (2026-11-22)

Worker: one sequential ChatGPT engineering coordinator/reviewer (no native subagents or independent verifier). Branch: `automation/20261122T0838Z/bug/receipt-accessor-failclosed`, based on PR #450 exact head `5aa0194f1a27ab3d6ba96a28e62fe604d8d8451d`; original parent untouched. Main observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: additive claim here, `packages/ux-receipts/src/verify.ts`, new `packages/ux-receipts/src/verify.accessor-boundary.test.ts`, and `docs/handoffs/UX_RECEIPT_ACCESSOR_BOUNDARY_R35.md`.
Finding: PR #450 rejects malformed lookup values but reads `res.status`, `res.facts` and evidence getters outside the lookup exception handler. A resolved malicious or broken adapter object with a throwing property/get trap can make `verifyReceipt` reject instead of returning the existing `unavailable` result. The exported ChainVerifier is a local injected adapter; no external exploit is claimed.
Acceptance: deterministic regression-first cases for throwing status/facts/confirmed/amount/sender/recipient accessors and proxy property traps; all degrade to `unavailable`/`self_consistent_unverified`, while valid found and not-found behavior is unchanged. Use a bounded exception isolation around post-lookup facts processing; no network, custody, contract, protocol or dependency changes. Run bounded executable reproduction and hosted exact-head CI, preserve unrun tests honestly, require independent reviewer and integration lock before merging.
Ownership: deliberate child of active PR #450, which itself stacks on #449. Do not edit either parent branch. Other broad owner claims remain active. Integration metadata lock generation 11 belongs to another coordinator; expiry is not takeover authority. No main/shared-branch merge, release or deployment.

---

# R34 — malformed receipt chain-lookup boundary (2026-11-22)

Worker: GhostPay consolidation R34, sequential author/test reviewer (not independent approval).
Branch: `automation/20261122-r34/bug/ux-receipts-lookup-boundary`; exact parent: PR #449 `ff8c800a495f1cc4d2df704d321b3d22e6f67a78`; PR target: `automation/20261122-r5/bug/ux-receipts-invalid-chain-facts` (stacked). Parent fixes invalid `facts.confirmed`; this child handles separate malformed *top-level* adapter responses and nonstring optional evidence, without replacing the parent fix.
Owned paths on this isolated child: `packages/ux-receipts/src/verify.ts` (additive guards after parent's existing checks), `packages/ux-receipts/src/verify.lookup-boundary.test.ts` (new), `docs/handoffs/UX_RECEIPT_LOOKUP_BOUNDARY_R34.md` (new), and this additive ownership note. Notify parent owner; preserve existing claims. Do not edit parent's branch, drop commits, merge into main or deploy.
Acceptance: regression tests fail on parent for resolved null/nonobject lookup and malformed sender/recipient facts; invalid evidence must return `unavailable`, `self_consistent_unverified`, `chain_unavailable`; preserve true/false confirmations, not-found, matching and mismatch cases. Run exact-head hosted CI; require external review, settled parent, and release lock transfer before any merge. Exclude relayer, contracts, production deployments and real funds.
Integration lock: held, generation 11, owner `994a0d214fb9-root-r3` (rechecked 2026-11-22). Never self-transfer.

---

# GP-BUG — Receipt verifier must not trust malformed chain confirmation evidence (2026-11-22)

Worker: ChatGPT BUG-ONLY coordinator, sequential reproduction/implementation, no independent verifier available.
Branch: `automation/20261122-r5/bug/ux-receipts-invalid-chain-facts`; exact base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-receipts/src/verify.ts`, new `packages/ux-receipts/src/verify.invalid-facts.test.ts`, additive claim in this file, new `docs/handoffs/UX_RECEIPT_CHAIN_FACTS_20261122.md`. Do not modify `receipt.test.ts` or other branches.
Observed defect: injected `ChainVerifier.lookup` resolving `{ status: 'found', facts: { confirmed: 'yes', amountBase: '1500000' } }` can produce a `chain_confirmed` verdict despite a nonboolean confirmation field; a missing/null `facts` object may throw instead of degrading to `unavailable`. Root cause: runtime callback result is assumed to satisfy its static TypeScript type; `!f.confirmed` is a truthiness check.
Acceptance: test-first regressions for malformed found facts (nonboolean confirmed, null/missing facts), preserve exact valid true/false confirmation and matching behavior; minimal guard returning `unavailable` for malformed evidence; run available source-equivalent runtime checks and hosted exact-head package/CI; no new dependencies, network, funds, release, deployment or interfaces. Do not claim repository Vitest without checkout.
Ownership: all 207 open PR changed-file lists from snapshot through #448 inspected; no claim on these specific source/new test paths. PR #390 checked separately: head `b655bc273a6704c9c140287b8adcdf4085b91882`, 5 completed successful workflow groups, 0 GitHub reviews; no edits to owner branch. Generation-11 integration lock remains externally held by `994a0d214fb9-root-r3`; leave draft and unmerged until legitimate ownership transfer and independent review.
# GP-BUG-20261121 — reject malformed pasted invoice fragment boundaries

Worker: ChatGPT bug-only bounded fix, 2026-11-21. Branch: `fix/ghostpay-pasted-invoice-fragment-boundary-20261121`; exact base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/lib/fragment.ts`, `apps/web/src/lib/fragment.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, and `docs/handoffs/PASTED_FRAGMENT_BOUNDARY_20261121.md`.
Reproduction: the current `extractFragment` returns `#gpi=v1.abc#other` and `#gpi=v1.abc?tracking=1` instead of refusing malformed invoice text. It also accepts an arbitrary prefix (`garbage#gpi=v1.abc`). The QR path already uses stricter validation. Acceptance: accept bare invoice fragment and valid pasted https invoice URL with optional URL query before fragment; reject trailing fragment syntax, untrusted prefixes and malformed links; preserve existing valid behavior; test-first RED then focused GREEN. No new features, dependencies, protocols or deployment changes. Do not touch shared integration lock or merge pending exact-head CI, independent review and ownership qualification.
# Pages scan: distinguish duplicate router callbacks from distinct router announcements (2026-11-21 UTC)

Cycle and coordinator: `20261121T0033Z-root`, one sequential assistant; no native subordinate workers or independent verifier available.
Task branch: `automation/20261121T0033Z/bug/router-duplicate-warning`, base main `aec179910c39081d820396409ff3139ff2264132`.
Owned paths: `apps/web/src/lib/scanMatches.ts`, `apps/web/src/lib/scanMatches.test.ts`, this additive task claim, and `docs/handoffs/SCAN_MATCH_DUPLICATE_ROUTER_20261121.md`. No other worker's branch or shared ledger is updated.
Finding (bounded source audit, unverified in browser): `sharedRouterAddresses` marks the same router announcement twice as a shared one-time address, even though its contract requires two different router records; an asynchronous duplicate/update should not be counted as a second record. Existing `placeScanMatch` usually deduplicates the live UI, so this is a defensive P3 false-positive warning correction, not a payment/cryptographic vulnerability.
Acceptance: a deterministic regression with duplicate announcement ID and same address does not trigger a shared-address warning, even after status refresh; two distinct router announcement IDs with the same address still trigger it. Preserve all public-scan replay filtering, one-time address identity, chain scope, and existing tests; no key, RPC, transaction, deployment or dependency changes.
Ownership reconciliation: recent overlapping UI PRs #278/#307/#317/#318 and current #341/#345, plus #262/#264 and #302, were inspected for changed paths; none currently modifies `scanMatches.ts` or `scanMatches.test.ts` (bounded PR sample, not full historical inventory). Recheck before integration. The durable integration lease on `automation/ghostpay-integration-lock` is **held by another coordinator, generation 11**, last read 2026-11-20T23:16:57Z; do not claim, release or merge any protected/shared branch.
Verification: add test before production fix, execute source-equivalent deterministic check only if original suite is unavailable, and preserve test/CI/independent-review limitations exactly. Existing `SECURITY.md` requirements apply. Draft PR only.
# Payment URI runtime type boundary — 2026-11-21 UTC

- Cycle/coordinator: `20261121T0638Z`; one assistant running sequential source-audit, regression, implementation and verification phases. No independent worker or verifier available.
- Branch: `automation/20261121T0638Z/bug/payment-uri-runtime-types`, source base `2844ec6c22fe179987585679a934e10033ff3384` (existing draft PR #360). This is an **isolated dependent follow-on** to #360, not a modification of its owner branch. Current main last inspected at `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/payment-uri/src/query.ts`, new `packages/payment-uri/src/query-runtime-types.test.ts`, this branch-local additive ownership claim, and `docs/handoffs/PAYMENT_URI_RUNTIME_TYPES_20261121.md`. No other paths.
- Dependencies / ownership: PR #360 owns malformed UTF-16 encoding on this same file, and all of its exact-head CI completed successfully. Preserve that implementation and stack on its exact head; integration coordinator retains shared-branch ownership. Do not merge to protected/shared targets. Repository metadata integration lock is **held at generation 11** by `994a0d214fb9-root-r3`, not this cycle; expiry does not permit takeover.
- Evidence: exported `pctEncode(s: string)` has no JavaScript runtime type guard. Before this fix, RegExp.test coerces undefined/null/number/boolean/array, and TextEncoder.encode coerces again: a runtime `undefined` yields the empty string, `null` yields `null`, `42` yields `42`, and `['note']` yields `note`. Locally reproduced with Node 22 on 2026-11-21. No supported browser exploit or payment redirection established; exported API correctness and input fidelity only.
- Acceptance: test-first typed `INVALID_INPUT` refusal of runtime-invalid nonstrings, including propagation through `buildQuery`; preserve all valid UTF-8, proper astral characters and #360's malformed-surrogate `INVALID_ENCODING` refusal. No changes to keys, validators, protocol, contracts, fees, dependencies, deployments, other product surfaces or security gates.
- Verification: run executable local source-equivalent checks if full checkout remains DNS-blocked; rely on hosted exact-head CI for actual repository tests. No self-review represented as independent approval. Maintain source-pinned handoff and draft dependent PR.

---

# 2026-11-21 04:40 UTC — payment URI UTF-16 encoding fidelity (isolated)

- Cycle / coordinator: `20261121T0440Z` / single ChatGPT operator; sequential reproduction, implementation and self-review. **No independent native agent** is available; independent approval is outstanding.
- Branch: `automation/20261121T0440Z/bug/payment-uri-utf16-failclosed`, exact base `aec179910c39081d820396409ff3139ff2264132` (`main`).
- Owned paths: `packages/payment-uri/src/query.ts`, new `packages/payment-uri/src/query-surrogate.test.ts`, additive claim here, and dedicated `docs/handoffs/PAYMENT_URI_UTF16_20261121.md`. No other source paths.
- Source finding: public `pctEncode` forwards malformed UTF-16 strings to `TextEncoder`, which silently replaces unpaired high/low surrogate code units with U+FFFD. Exported `buildQuery` inherits this behavior. This is a defensive exported-API fidelity issue; current Solana/Bitcoin/TRON builders validate display text first, so no browser fund-loss or direct Pages exploit is asserted.
- Acceptance: test-first rejection with existing typed `INVALID_ENCODING` for isolated high and low surrogates including embedded cases; intact surrogate pairs and ordinary Unicode preserve exact percent encoding and decoding. No wire change for valid inputs, dependencies, contract, hosting, workflow, relayer, policy or custody changes. Run actual checks if accessible, otherwise distinguish the native reproduction from repository tests. Obtain independent review before merging.
- Coordination: current main and #307's `query.ts` match; #313 owns `decimal.ts`, not `query.ts`. #307's broad branch and existing PRs remain independently owned. Durable integration lock `automation/ghostpay-integration-lock` is held at generation 11 by another owner; **no shared integration or main update** authorized in this cycle. Recheck ownership/head/CI before future integration.
# Merchant-ledger formatting precision validation — 2026-11-21 (isolated)

Worker: one ChatGPT engineering coordinator, sequential test-first implementation and self-review; independent GitHub review required.
Branch: `chatgpt/ghostpay-ledger-exponent-guard-20261121-0313`, based on `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`. No integration lock acquired.
Owned paths: `packages/merchant-ledger/src/decimal.ts`, `packages/merchant-ledger/src/ledger.test.ts`, this additive ownership claim, and `docs/handoffs/MERCHANT_LEDGER_EXPONENT_GUARD_20261121.md`.
Finding: exported `formatMinor` accepts negative / noninteger / nonfinite / unsupported exponents and can emit mathematically incorrect formatted money or untyped runtime exceptions, while adjacent `currencyExponent` already bounds supported exponents to integers 0..18. Source-equivalent Node 22 RED harness confirmed `formatMinor(123n, -1)` fails the required typed refusal assertion on unmodified main. The harness is not repository Vitest.
Acceptance: reject invalid `formatMinor` exponent with `LedgerError('bad-exponent')` before `padStart`, preserve formatted output for every valid exponent 0..18 including negative amounts, add focused Vitest regression cases, run available verification and obtain hosted exact-head CI. Preserve all existing GhostPay 0/2 signed minor-unit conventions; no currency policy/schema, custody, contracts, web payment or deployment change.
Ownership: no exact-path claims found in the current main ACTIVE_WORK registry; scoped PR text search did not reveal an active `formatMinor` repair. Reinspect active PRs and new heads before integration. Repository integration lock generation 11 is held by another coordinator, so do not merge to main or take over the lock.
# GP-DISPLAY-COMPOSE-01 — compose bounded display expansion and surrogate-safe input truncation (2026-11-21)

Cycle/coordinator: 20261121T2033Z, one assistant acting sequentially (source-audit, test, implementation and verification); no independent native reviewer/worker.
Exclusive new branch: `automation/20261121T2033Z/integration/display-text-boundaries`, base `b655bc273a6704c9c140287b8adcdf4085b91882` (source of open PR #390). Dependency: open PR #419 head `62dcc695ae3ff9d8c109ced97dd357fe29ed3fd3`. Both branches retained untouched; no shared integration.
Owned in this isolated composition: `apps/web/src/lib/displayText.ts`, new `apps/web/src/lib/displayText.truncation.test.ts` adapted from #419, this additive ownership entry, and new `docs/handoffs/DISPLAY_TEXT_COMBINED_BOUNDARIES_20261121.md`. No existing PR branch, contract, wallet, schema, or workflow edits.
Motivation: PRs #390 and #419 both edit `safeText`. #390 caps rendered marker expansion at 4096 UTF-16 units, while #419 prevents a valid surrogate pair becoming an artificial lone surrogate at the raw truncation cut. Naively applying #419's lone-surrogate-at-4095 test to #390 would assert a marker beyond the new output limit. Composite must retain both constraints, show genuine unmatched surrogates when whole marker fits, and truncate without partial markers if not.
Acceptance: introduce regression-first combined tests demonstrating the unpatched #390 false fabricated marker and a test for both capped hostile expansion and true unmatched-surrogate semantics; preserve all #390 behavior plus all compatible #419 coverage, flags, NFC and Unicode output limits. Then minimally repair the raw clipping boundary. Obtain exact-head hosted CI and genuinely independent reviewer before any merge.
Integration lock `automation/ghostpay-integration-lock`, generation 11, status HELD by another coordinator (last observed `994a0d214fb9-root-r3`): do not take over, update lock, integrate to main/shared targets, deploy or release. Exact CI and source-owner SHAs must be reread next cycle.
Local checkout blocked by github.com DNS; do not claim repository Vitest/lint/build/browser without hosted execution evidence. No paid agent/Caveman runtime.

---
# GP-BUG — Bound rendered invoice display text after marker expansion (2026-11-21)

Worker: ChatGPT bug-only coordinator (sequential implementation and review; independent verifier pending).
Branch: `automation/20261121/bug/display-text-expansion-bound-r1`; exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/lib/displayText.ts`, new `apps/web/src/lib/displayText.boundary.test.ts`, this additive registry claim, and `docs/handoffs/DISPLAY_TEXT_EXPANSION_20261121.md`. Do not alter the existing `displayText.test.ts` claimed by broad open PRs #278/#372.
Finding: `safeText` truncates raw input to 4096 UTF-16 units but its hostile-codepoint escapes and mixed-script markers expand the returned render text beyond the documented output bound. A zero-width input of 4096 chars renders 32768 chars on the exact main algorithm; source-equivalent Node 22 reproduction fails the <=4096 assertion.
Acceptance: commit failing regression first; cap returned text after expansion without splitting visible escapes or surrogate pairs, preserve all ordinary short content, control/newline behavior, and detection flags; add no functionality/dependencies/schema changes. Execute isolated source-equivalent red/green plus existing available checks, requiring hosted exact-head CI and independent qualified review before any merge.
Coordination: current main has a separate, externally held generation-11 integration lock; do not acquire it, merge to main, deploy, release, or overwrite another worker. Recheck open PR heads, CI, review and lock before integration. Native checkout currently cannot resolve github.com, so no local repository Vitest pass is claimed.
# GP-BUG-20261121-QR — reject lossy malformed UTF-16 in QR capacity checks

Worker: ChatGPT, bounded bug-only test-first repair. Base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Branch `fix/ghostpay-qr-capacity-unicode-surrogate-20261121`. Owned paths: `packages/ux-links/src/qr.ts`, `packages/ux-links/src/uri.test.ts`, additive claim in this file, `docs/handoffs/UX_LINKS_QR_UTF16_20261121.md`.
Reproduction: `checkQrCapacity('\u005cuD800')` treats a lone surrogate as three U+FFFD UTF-8 bytes and returns a scannable capacity, but the original payload cannot round-trip. Node 22 TextEncoder/Decoder proof confirms silent replacement on both lone-surrogate classes. Acceptance: test-first QR-coded errors for unpaired high/low surrogates, including mixed strings; preserve valid emoji pairs and byte capacities; no new QR feature, protocol, dependency, payment behavior, threshold, or deployment changes. Require hosted exact-head CI, independent review and integration-owner qualification before merging to main. Scope check of active PRs #248/#262/#278/#307/#309/#365/#372/#384/#385/#389 found no direct edits to owned paths; recheck before merge.
# Merchant-ledger CSV formula-prefix defensive correctness — 2026-11-21

Worker: one ChatGPT engineering assistant; independent reviewer not yet available.
Branch: `chatgpt/ghostpay-csv-leading-whitespace-20261121`; immutable base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/merchant-ledger/src/csv.ts`, new `packages/merchant-ledger/src/csv.formula-prefix.test.ts`, this additive claim and `docs/handoffs/MERCHANT_LEDGER_CSV_FORMULA_PREFIX_20261121.md`.
Finding: current `sanitizeText` recognizes formula operators after only ASCII spaces, and tabs/CR only if at position zero. Mixed leading spaces/tab, line feed or a leading BOM before formula text is emitted unprefixed by `sanitizeText` and `textCell`. The source-equivalent Node 22 RED probe confirmed five expected prefix failures. These are potential spreadsheet-import boundary ambiguities; no live Excel exploit is established.
Acceptance: prefix a literal apostrophe on formula operators after leading whitespace (ASCII spaces, tabs, CR, LF, BOM), and on any field beginning with a line break/tab/CR within the leading whitespace run; preserve previously handled inputs, UTF-8 data and RFC 4180 quoting. Tests prove the five new cases and preserve benign text and already-protected formula prefixes. No changes to invoice protocol, network, custody, fees or deployment. Commit regression before production guard; verify exact-head CI and obtain separate review before integration.
Ownership: main `docs/ai/ACTIVE_WORK.md` does not claim the exact source/test paths, and examined current broad PRs #278/#307/#372 do not modify `csv.ts`; refresh overlap before integration. Shared integration lock generation 11 is held by another coordinator and is not available for takeover. No main merge until exact owner reconciled and all gates pass.
# GP-BUG-20261121-WH — align webhook timestamp signer with header parser

Worker: ChatGPT, bug-only bounded test-first repair. Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`; branch `fix/ghostpay-webhook-signer-timestamp-width-20261121`. Owned: `packages/merchant-hooks/src/webhooks.ts`, `packages/merchant-hooks/src/hooks.test.ts`, additive `docs/ai/ACTIVE_WORK.md`, new `docs/handoffs/WEBHOOK_TIMESTAMP_WIDTH_20261121.md`.
Confirmed mismatch: `signWebhook` accepts any safe nonnegative integer timestamp (up to 16 decimal digits); `parseHeader` in `verifyWebhook` allows only 1..12 digits. Thus `t=1000000000000` can be signed but never verified by the same package. Acceptable fix: signer must reject timestamps its own parser cannot accept, preserving current header protocol, messages and ordinary timestamps; test RED first, then repair. No webhook feature additions, dependency/contract/API changes, deployments or funds. Active PR file ownership of broad #262/#278/#307/#365/#372 and focused #389/#392 checked with no conflicts; fresh ownership/CI/review required before merge.
# GP-BUG-14 — reject invalid requestFromUri lifetime overrides (2026-11-21)

Worker: one ChatGPT bug-only engineer. Dedicated branch: `automation/20261121/bug/ux-links-max-lifetime-guard`; exact base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Owned paths: `packages/ux-links/src/request.ts`, NEW `packages/ux-links/src/request.max-lifetime.test.ts`, branch-local additive claim in `docs/ai/ACTIVE_WORK.md`, and `docs/handoffs/UX_LINKS_MAX_LIFETIME_20261121.md`. Do not edit existing `packages/ux-links/src/request.test.ts` (owned by open PRs #224/#238/#262/#264/#278/#372).

Finding: `requestFromUri()` compares future expiry to `opts.maxLifetime ?? MAX_LIFETIME_SECONDS` without validating numeric override; `NaN`, `Infinity`, and runtime-invalid strings can make far-future invoices bypass the intended upper bound. Scope is defensive runtime-number validation only; preserve valid default and custom positive limits, exact link parsing, balances, addresses, and expiry status. API contract: `docs/remote/usability/specs/ux-links-request.md` R5. Accept only nonnegative safe-integer limits, preserving zero as a strict bound. Required: test-first regression, existing LinkError code `REQUEST`, focused and workspace CI where available, independent review and fresh ownership before any main merge.

Ownership audit: all 156 open PRs inventoried (2026-11-21 UTC); none modifies `packages/ux-links/src/request.ts`; PR #392 changes other UX-link files. Main `ACTIVE_WORK.md` contains no matching claim. Existing source/tests and main SHA verified before branch creation. Local shell cannot resolve github.com; no actual checkout available. No merge authorization, no deployment, no contract or protocol changes.
# GP-BUG — 256-bit EVM amount noise boundary (2026-11-21)

Worker: scheduled GhostPay BUG-ONLY repair coordinator, single sequential reviewer and implementer; no independent native verifier available.
Branch: `automation/20261121/bug/large-amount-noise-bound-r1`, from exact main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/metadata-hardening/src/guard.ts` (only CSPRNG bound correction), new `packages/metadata-hardening/src/amounts.large-noise.test.ts`, existing `packages/metadata-hardening/src/catalogue.test.ts` (only adjust the original upper-bound regression to the corrected 256-bit contract, plus explicit old-64-bit-bound acceptance), additive claim in this registry, and dedicated `docs/handoffs/AMOUNT_NOISE_256BIT_20261121.md`. No other production files claimed.
Finding: existing MH-AMT-2 `addAmountNoise` accepts an EVM base-unit bigint and 0..100 bps, but passes its surplus bound into `randomBelow`, which refuses values above 2^64; a valid 2000 ETH-equivalent amount with 100 bps yields a 20e18 maximum surplus, above 2^64, and raises `INVALID_INPUT` instead of applying the documented bounded CSPRNG overpayment. This is a testnet-only exported package API correctness bug; no current Pages caller or real-funds impact established.
Acceptance: test-first red regression on supported testnet with public deterministic amounts and injected in-memory RNG, smallest existing random-sampler upper-bound correction supporting EVM uint256-sized input without bias, retain rejection beyond uint256, all original smaller-number sampling and error behavior unchanged, no dependencies, browser changes or new feature. Exact-head hosted package/tests/CI and independent review required; no claim of local Vitest execution if unavailable.
Coordination: sampled current active/open PR path inventories including broad #278/#262/#264/#307/#372/#371 and #401, none changes the two claimed source/test paths; recheck at promotion. Shared integration lock generation 11 is HELD by external coordinator `994a0d214fb9-root-r3`; expiry alone is not release. No shared lock mutation, main merge, deployment, transactions, or other workers' branches.
Status: test-first repair published as draft [PR #404](https://github.com/djshellshoxxx/GhostPay/pull/404), with initial red regression `4f2b4419b91c3b9a88c4655be9a9f6832c688c4a`, minimal CSPRNG source fix `1a1f081c9a73aa6dafd76d80f8b262f1e099403c`, updated neighboring boundary assertion `cecf558151ee0f4a6a7dfb23c15da4547789150b` and safe fixture `e70b906c33be057ff11a4f595be9fb4229344314`. Source-equivalent Node red/green reproduced; no repository-local Vitest, exact-head hosted CI or independent approval claimed. Recheck final-head hosted jobs, current ownership and external generation-11 held lock before promotion; no main merge.
# POS static-parity expiry boundary CI repair — 2026-11-21 R16

Worker: GhostPay consolidation continuation, source-based sequential implementation; no independent reviewer.
Branch: `fix/ghostpay-pos-parity-expiry-r16-20261121`, child of PR #406 at `506604288e31c195c852fa2e8896e131da34bc3b`; base `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `examples/pos-terminal/parity.test.mjs`, this append-only ACTIVE_WORK claim, new `docs/handoffs/POS_PARITY_EXPIRY_R16_20261121.md`. No production source files.
Evidence: exact-head CI workflow `44907818620` failed in job `136868286519` at parity test line 59: status `paid` versus expected `expired`. Existing test starts at 100s with TTL 60s, so expiry is 160s, not 130s. `packages/merchant-hooks/src/pos.runtime.test.ts` independently uses a 30s TTL and correctly checks 130s.
Acceptance: repair static parity boundary assertions to test expiry exactly at 160s and successful payment immediately before 159s, preserving full library/static mirror equality; leave all custody, wallet, transaction and runtime behavior unchanged. Requalify hosted CI on the child PR, integrate only after independent review and current integration-lock approval. No deployment/release.

---

# 2026-11-21 — Merchant POS runtime clock/amount hardening (GP issue #400, R14)

Worker: scheduled GhostPay branch-consolidation engineer; one sequential implementer and self-auditor, no independent GitHub reviewer. Branch: `automation/20261121/bug/pos-runtime-guard-r14`, exact source main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/merchant-hooks/src/pos.ts`, new `packages/merchant-hooks/src/pos.runtime.test.ts`, `examples/pos-terminal/pos-logic.js`, `examples/pos-terminal/parity.test.mjs`, this additive ownership entry, new `docs/handoffs/POS_RUNTIME_GUARDS_R14_20261121.md`. No other files claimed.
Reproduced bug evidence: issue #400, source blob `976b988020f73bb26d1191036fdab65c1b65d55b`: NaN now creates unexpiring session; dueMinor number passes bigint comparison, payment amount number may throw implicit TypeError. Static mirror `pos-logic.js` must stay in parity. Verify invalid NaN/Infinity/unsafe/negative clocks, too-large sum, malformed amount types, malformed awaiting expiresAt, valid TTL and amount controls. Reject malformed inputs with `HooksError` codes; preserve terminal absorption, expiry boundary, no new backend/contract/checkout surface.
Ownership: checked #307/#372/#371/#278/#262/#264/#398/#401/#403/#395/#404/#405/#265 changed filenames; none changes the claimed source/mirror/test paths; #398 changes existing `hooks.test.ts`, intentionally avoided. Other branches or newer PR heads must be rechecked before integration.
Integration lock: `automation/ghostpay-integration-lock` generation 11 status HELD, owner `994a0d214fb9-root-r3`; expiry is not authority to override. No main merge/deploy/release. Require exact-head hosted CI, package parity, independent review, parent aggregate qualification.
Plan: commit regression first, then targeted production/mirror repair, capture actual CI results, and publish source-pinned handoff. Do not claim local repository Vitest execution if unavailable.
# GP-BUG-R10 — reject explicit HTTPS default/empty ports in intake deep links (2026-11-21)

Worker: GhostPay bug-only coordinator, sequential implementation; no separate native verifier.
Branch: `automation/20261121/bug/deeplink-explicit-port-r10`; exact baseline main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-intake/src/deeplink.ts`, new `packages/ux-intake/src/deeplink.ports.test.ts`, this additive branch-only claim, and `docs/handoffs/DEEPLINK_EXPLICIT_PORT_20261121.md`.
Observed defect: `parseDeepLink()` documents rejection of explicit HTTPS ports but checks `new URL(raw).port`; WHATWG URL normalizes explicit `:443`, `:0443`, and empty `:` to an empty port, so forbidden URL forms are accepted. Node v22.16.0 source-equivalent authority-check reproduction confirmed three failures and plain/nondefault-port controls.
Acceptance: commit failing regressions before the smallest production change; reject explicit authority ports even when canonicalized away, preserve clean unported URLs, credential rejection, nondefault-port rejection, route/fragment/host handling, custom-scheme behavior; no network calls, new dependencies, features, fee/contract/fund changes.
Ownership: paginated all 182 open PRs and inspected each changed-file inventory on 2026-11-21; no PR owned either `deeplink.ts` or proposed new regression path. Broad PRs #238/#262/#264/#278/#372 claim other `ux-intake` test/package paths but not these. Reinspect on integration.
Review/lock: PR #390 at `b655bc273a6704c9c140287b8adcdf4085b91882` has 36 successful, 3 skipped, no failed hosted check runs and zero independent reviews; #419 and stacked #422 touch its displayText integration. Metadata-only `automation/ghostpay-integration-lock` is held by unrelated owner `994a0d214fb9-root-r3`, generation 11, and expired timestamp is not release authority. No main merge/deploy/release, no override of owners.
# GP-BUG-R11 — EVM truncated receipt address comparison (2026-11-21)

Worker: one sequential ChatGPT bug-repair coordinator; no independent code reviewer or native browser executor is available within this cycle.
Task branch: `automation/20261121/bug/receipt-evm-truncated-tail-r11` based exactly on main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned source: `packages/ux-receipts/src/address.ts`; new isolated regression `packages/ux-receipts/src/address.case.test.ts`; this additive registry claim and new `docs/handoffs/RECEIPT_TRUNCATED_EVM_CASE_20261121.md` only. The preexisting `core.test.ts` is explicitly not owned.
Defect evidence: upstream `address.ts` blob `455ecae74f2339f0fd88fe8160aadbaab21719d0` was copied byte-for-byte (Git blob hash matched) and compiled using installed TypeScript 5.8.3; Node 22 reported `matchesAddress(redactAddress('0xAbCdEf0123456789abcdef0123456789ABCDEF01', {head:6,tail:4}), actual) === false`. The helper lowercases the actual 0x address, but not the isolated uppercase suffix following `...`.
Acceptance: test first for mixed-case EVM truncations, including short heads, both 0x/0X, non-EVM case-sensitive controls and mismatched tails; then repair only the comparison. No chain, receipt, API, dependency, deployment, fund or UI change. Preserve full-address behavior and all existing validations.
Ownership: main ACTIVE_WORK has no claim for `packages/ux-receipts/src/address.ts`. Verified changed-file inventories of open broad PRs #238/#262/#264/#278/#372 (which own `core.test.ts`), plus #307/#371/#246/#260/#259/#250/#249/#248/#244/#240/#239 and current #343/#380/#408/#419/#422/#423/#424/#425: no PR modifies the proposed source or new test path. Further head reconciliation required before integration.
Integration: durable metadata `automation/ghostpay-integration-lock/integration-lock.json` is held by external owner `994a0d214fb9-root-r3` at generation 11. No lease acquisition, release, protected main merge or modification to another owner's branch. Draft PR remains unqualified without exact-head CI, applicable browser verification and a genuinely independent review.
# GP-BUG — Onboarding PHRASE_REVIEWED attempt-counter bypass (2026-11-21)

Worker: ChatGPT bug-only coordinator, sequential implementation/review; no genuinely independent verifier currently available.
Branch: `automation/20261121/bug/onboarding-review-gate-r1`; exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-guide/src/onboarding.ts`, new `packages/ux-guide/src/onboarding.review-gate.test.ts`, this additive registry claim, and `docs/handoffs/ONBOARDING_REVIEW_GATE_20261121.md`. Existing `onboarding.test.ts` remains untouched.
Finding: During the backup quiz, the public reducer accepts PHRASE_REVIEWED even when no post-failure phrase review was requested; this clears accumulated wrong-attempt count and lets callers bypass the documented three-failure mandatory review. The normal UI sends the event after review is requested, but the reducer must uphold its own state invariant.
Acceptance: first commit a failing regression proving PHRASE_REVIEWED does not clear quiz attempts before the forced review gate, then add the smallest reducer guard; after three failed attempts an authorized review acknowledgment must still clear the gate. Preserve create/import flow and persistence semantics, no new features or dependencies. Report isolated runtime verification separately from repository Vitest/CI.
Ownership: 187 current open PR changed-file inventories inspected on 2026-11-21; none changes any `packages/ux-guide/src/` file (several touch package.json only). Reinspect before any eventual integration. Mainline generation-11 lock reported externally held; do not take ownership or merge. PR #390 at b655bc273a6704c9c140287b8adcdf4085b91882 had 36 successful, three skipped exact-head checks, no independent GitHub reviews; untouched.
# GP-BUG-22 — reject unsupported runtime pending-reference kinds (2026-11-21)

Worker: single ChatGPT bug-repair operator; sequential source review, regression and verification; **no independent verifier**.
Branch: `automation/20261121/bug/ux-connect-pending-kind-r12`; exact base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-connect/src/compat.ts`, new `packages/ux-connect/src/compat.pending-ref.test.ts`, this additive branch-local claim, and new `docs/handoffs/UX_CONNECT_PENDING_REF_KIND_20261121.md`.
Finding: `parsePendingRef` accepts a valid bytes32 hash with arbitrary runtime `kind` values (e.g. `transactionHash`, `null`) and returns `ok: true`, although the exported pending-reference model supports only `txHash`, `safeTxHash`, and `userOpHash`. Exact-source-based isolated Node 22 reproduction failed the rejection expectation. Preserve valid paths, normalization, and malformed-hash handling.
Ownership: all 188 open PR changed-file inventories inspected on current main; none changed `packages/ux-connect/src/`. Recheck if new PRs appear. A separate integration lock is held at generation 11 by `994a0d214fb9-root-r3`, and must not be changed or assumed released on expiry.
Acceptance: fail a committed regression before the smallest fix; check rejected unexpected kinds and all three valid kinds plus adjacent hash validation; record exact source/commit hashes and hosted CI; no dependencies, new features, wallet submissions, network interactions, or merging without exact-head CI, independent review, browser gates where applicable, and legitimate lock ownership. Native repository checkout unavailable due to DNS failure; do not claim local Vitest.
Status: implemented regression-first on branch (regression `dda3af1f7908f7838aed784be6482d54f30dabcc`; repair `5d192528ecdc4cb240b084e862baa8f452401801`); published [draft PR #430](https://github.com/djshellshoxxx/GhostPay/pull/430), pending exact-head CI, independent review, applicable browser gates and legitimate integration lock release/transfer.
# GP-BUG-20261122-IMPORT — preserve reviewed settings exchange input (2026-11-22 UTC)

Cycle: `20261122T0239Z`; one coordinator running sequential discovery, regression, fix and audit. No native subagents or independent verifier available.
Task branch: `automation/20261122T0239Z/bug/settings-exchange-incoming-snapshot`, stacked on PR #431 at `11b71fc9b0c66007e1d8c8700a53cfeb226d840d`, which itself is based on main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/lib/settingsExchange.ts`, new `apps/web/src/lib/settingsExchange.incomingSnapshot.test.ts`, this additive claim, and `docs/handoffs/SETTINGS_EXCHANGE_INCOMING_SNAPSHOT_20261122.md`.
Finding and scope: `previewSettingsExchange` retains the caller's mutable `incoming` object; a subsequent source-object mutation can alter an already displayed import without recomputing its diff or trust decision. The prior PR #431 snapshots the *current* settings basis, not imported data. Repair only this bounded settings-import snapshot correctness defect; do not alter key custody, policy, contracts, services, endpoints, workflow or release configuration.
Acceptance: separate mutable caller data from the reviewed preview, including preferences, both RPC URL maps and pinned signer list. Applying an unchanged review must use the displayed values despite later caller edits. Add test-first regressions and preserve existing trust confirmation, imported validation and mixed-section semantics; exact-head CI plus independent review before any merge.
Ownership: reuse PR #431 as exclusive stacked dependency; do not touch the parent branch, shared ledgers, PR #372 recovery work or PR #286 privacy work. Metadata integration lock observed HELD generation 11 by `994a0d214fb9-root-r3` at ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; no takeover or shared integration. Reinspect before later merge.
Tests: initially pending; local GitHub clone DNS fails, therefore use only clearly labelled isolated source-equivalent Node replay and hosted exact-head CI once PR exists.

---

# GP-BUG-20261122-SE — stale settings-exchange preview after in-place mutation

Cycle/worker: `20261122T0035Z`, one ChatGPT coordinator with sequential source audit, reproduction, regression, implementation and review. No independent native worker available.
Branch: `automation/20261122T0035Z/bug/settings-exchange-stale-basis`; exact base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/lib/settingsExchange.ts`, new `apps/web/src/lib/settingsExchange.mutableBasis.test.ts`, this additive ownership claim, and `docs/handoffs/SETTINGS_EXCHANGE_MUTABLE_BASIS_20261122.md`. Existing `settingsExchange.test.ts` is not modified.
Finding: `previewSettingsExchange` sets `basis: current` by reference, while `applySettingsExchange` relies on comparing the current settings with `preview.basis`. In-place edits to the same object (including nested RPC maps and pinned signer arrays) alter the basis too, bypassing the stale-preview check. A bounded Node 22 source-equivalent reproduction confirmed the missed change. No browser exploit is claimed.
Acceptance: snapshot the comparison-relevant settings at preview creation, including nested maps and signer list; reject a stale preview after in-place mutation, preserve unchanged application and existing selections; add regression before fix. No new trust policy, third-party dependencies, keys, contracts, services, URLs or deployments.
Ownership reconciliation: checked main and active broad PR #278/#293/#307/#372 and recent #356/#427, plus historical #117 (closed): no active changed-file claim observed for this source path in the bounded review. Recheck before integration. Lock branch at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` held generation 11 by `994a0d214fb9-root-r3`; this cycle will not take it over or integrate.
Verification gate: test-first regression, exact-head hosted checks, independent verifier and fresh deployment/branch protection review before merging.
# GP-BUG-20261122-01 — reject malformed UTF-16 in meta-address fingerprint (isolated)

Worker: single ChatGPT BUG-ONLY coordinator; no separate independent reviewer exists in this execution.
Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`; branch `automation/20261122T0123Z/bug/meta-fingerprint-surrogate`.
Owned paths: `packages/address-safety/src/meta.ts`, `packages/address-safety/src/meta.test.ts`, this additive ownership claim, and `docs/handoffs/META_FINGERPRINT_UTF16_20261122.md` only.
Evidence: original `meta.ts` blob `dd5230c5a4416bd0f2d5a3a7e79e982eca38487f`; an unpaired UTF-16 surrogate and U+FFFD yield identical UTF-8 bytes through replacement encoding, so this text fingerprint does not distinguish the exact input strings. Independent Node 22 TextEncoder/SHA-256 source-equivalent reproduction recorded; full library execution not claimed yet.
Acceptance: commit a failing regression before source fix; reject any unpaired high or low surrogate with existing `AddressSafetyError`; preserve valid astral pairs, ASCII and existing 4096-unit limit; no changes to hash algorithm, output, external dependencies, or addresses that are valid Unicode. Native repository tests where available; hosted exact-head CI and independent review required before integration.
Ownership: examined changed-file lists for the 190 open PRs across GitHub REST pages 1 and 2; no PR modifies `meta.ts` or `meta.test.ts`. Existing broad PRs #372/#278/#264/#262/#238/#224 own `text.test.ts`/package metadata, which this task does not edit. Recheck newly opened/updated PRs before any integration.
Integration: generation-11 `automation/ghostpay-integration-lock` is `held` by `994a0d214fb9-root-r3`; no lock takeover, main write, or merge authorized.
# GP-BUG — canonical tag filters find saved address-book contacts (2026-11-21 Pacific / 2026-11-22 UTC)

Worker: ChatGPT bug-only coordinator, sequential implementation and source-equivalent verification; independent review pending.
Branch: `automation/20261122/bug/search-tag-normalization-r1` from exact main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-vault/src/search.ts`, new `packages/ux-vault/src/search.tag-normalization.test.ts`, this additive claim and `docs/handoffs/SEARCH_TAG_NORMALIZATION_20261122.md`. The preexisting `packages/ux-vault/src/contacts.test.ts` is owned by broad active PRs and remains untouched.
Finding: stored contact tags pass through `normalizeTag`, which uses NFKC before case folding, but `searchContacts` filters normalize tags only by trim/lowercase. Valid user tag `ＷＯＲＫ` stores as `work` while filtering for `ＷＯＲＫ` returns no contact. The exact `search.ts` source blob `568db97dc1400374b24d3418fbd0f5f173224bc3` was reproduced locally with Node 22.
Acceptance: regression-first test showing saved and queried canonically equivalent tags match; minimal filter normalization repair; preserve AND semantics, network filters, query matching, sorting, and original tag-storage rules. Do not implement features, alter schemas, add dependencies or change other writers' paths.
Owner reconciliation: all 192 open PR changed-file inventories inspected at discovery (created-ascending and -descending ranges joined), zero overlap with source or new regression path; recheck current heads before integration. Generation-11 integration lock held by another coordinator; its expiry is not a license to take ownership.
Verification: focused source-equivalent Node red/green, actual focused hosted Vitest, lint, typecheck and CI required before integration; no local clone, repository Vitest or native browser test claimed while github.com DNS remains unresolved. Independent review and legitimate integration approval pending.
# GP-BUG — Reject unpaired UTF-16 in schedule names and memos (2026-11-22)

Worker: GhostPay bug-only automation, sequential single operator (independent reviewer not available).
Isolated branch: `automation/20261122-r4/bug/ux-schedule-invalid-utf16`; exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-schedule/src/validate.ts`, new `packages/ux-schedule/src/validate.unicode.test.ts`, this additive registry claim, and new `docs/handoffs/UX_SCHEDULE_UNPAIRED_UTF16_20261122.md`. Existing `template.test.ts` belongs to #238/#262/#264/#278/#372 and remains untouched.
Finding: on exact main Git blob `cb9b63207586651282ad8bf46237e58431cfdd98`, `validText` accepts lone high/low UTF-16 surrogates as names/memos. These values do not round-trip through UTF-8; `TextEncoder` replaces them with U+FFFD. The validator is used by `createTemplate`, `validateSnapshot`, and persisted-template import. Executing the hash-matched source on Node 22 reproduced acceptance and replacement; not a Vitest run.
Acceptance: test-first regression for leading/trailing/embedded lone surrogates, preserve valid paired astral Unicode, ordinary text, lengths and existing control/bidi rejects; smallest source change, no new dependencies, UI, APIs, payment or wallet interactions. Check exact-head hosted CI, maintain separate review and integration lock gates.
Ownership: enumerated all 204 open PRs (#445 through #51) and inspected per-PR changed-path inventories; zero claims on the two owned source/test paths (other `ux-schedule` work only in `recurrence.*` and `template.test.ts`). The durable generation-11 main integration lock remains held by a different coordinator. Do not acquire it or merge, deploy, release, or force-push shared branches.
# GP-QR-CLASSIFY-UTF16-01 — reject unpaired UTF-16 in scanned/pasted QR text (2026-11-22)

Cycle/worker: `20261122T0641Z` / one coordinator running sequential source audit, test-first correction, and evidence phases; no native independent reviewer or parallel worker available.
Branch: `automation/20261122T0641Z/bug/qr-classify-surrogate-input`; exact base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/lib/qrClassify.ts`, new `apps/web/src/lib/qrClassify.unpaired-surrogate.test.ts`, this task-branch-only claim, and `docs/handoffs/QR_CLASSIFY_UNPAIRED_SURROGATE_20261122.md`. No other paths or integration targets are claimed.
Finding: current classifier's text/UTF-8 cap and forbidden-control check allow raw isolated UTF-16 surrogate units to reach the settings JSON envelope detector; JSON parsing accepts a literal isolated surrogate, although `TextEncoder` lossily converts it to U+FFFD and the existing QR encoder rejects it. This is a bounded intake-classification correctness issue, not a demonstrated funds-loss or key-exposure exploit.
Acceptance: reject isolated high/low surrogate inputs with the existing fixed `unknown/malformed` reason, including recognised settings-shaped JSON; preserve valid supplementary Unicode pairs and normal accepted QR families; never return payload data or add dependencies; add regression-first Vitest tests. Run source-equivalent Node checks and exact-head hosted CI where available. Scope does not include signer/expiry policy, QR source rewriting, or broadened backend products.
Ownership: targeted open-PR query for `qrClassify`/malformed Unicode QR classifier returned none; broader consolidations remain active and unqualified, so recheck file overlap and head SHAs before any integration. Integration metadata branch `automation/ghostpay-integration-lock` observed `held`, generation 11, owner `994a0d214fb9-root-r3`; expiry is not release authority. No shared ledger, lock, or main edits allowed here.
# GP-BUG — Strict custom-profile identification for imported settings (2026-11-22)

Worker: ChatGPT bug-only coordinator, sequential implementation and source-equivalent verifier; no independent native reviewer.
Branch: `automation/20261122-r6/bug/ux-guide-detect-exact-settings`; exact main baseline: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-guide/src/profiles.ts`, new `packages/ux-guide/src/profiles.exact.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim and `docs/handoffs/UX_GUIDE_PROFILE_EXTRA_KEYS_20261122.md` only.
Finding: `detectProfile` documents exact settings equality but compares only the eight known settings. Imported settings with additional own JSON fields are mislabeled as standard profiles instead of `custom`. Baseline source-equivalent Node 22 reproduction fails the expected `custom` assertion.
Acceptance: test-first regression demonstrating extra own settings fields are non-exact; retain exact built-in profile matches and custom classification of modified/missing fields; smallest production fix; no changes to questionnaire scores, defaults or public APIs. The inventory of 209 open PRs found no path collisions with the two source/test files; recheck before integration.
Coordination: metadata-only generation-11 lock is held by another coordinator (`994a0d214fb9-root-r3`); do not alter lock, main, other workers' branches or release. GitHub exact-head CI, independent review, and any applicable browser qualification required before any merge.
# GP-BUG — non-string raw address parser throws instead of returning bad-address (2026-11-22)

Worker: ChatGPT BUG-ONLY sequential coordinator; no independent reviewer is available in this run.
Branch: `automation/20261122-r7/bug/ux-intake-address-runtime-types` based exactly on main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-intake/src/address.ts`, new focused `packages/ux-intake/src/address.runtime.test.ts`, this additive registry claim on the isolated branch, and new `docs/handoffs/UX_INTAKE_ADDRESS_RUNTIME_TYPES_20261122.md`.
Observed defect: exported `validateAddress` throws JavaScript TypeError for null, undefined, numbers, arrays, objects, bigint, and symbols supplied from untyped runtime callers. `packages/ux-intake/src/result.ts` expressly promises non-throwing results for untrusted inputs. The original main source blobs of address.ts (`f7754728d475b1c791de771727d5647c64797b43`) and result.ts (`74a6a294caef828e72f5b48e2a1a86491b23f677`) were hash-verified and reproduced with Node 22 plus a module-resolution-only .js-to-.ts import shim; no repository Vitest execution is claimed.
Acceptance: commit a failing regression first; return the existing typed `bad-address` error for runtime nonstrings without changing valid EVM/bech32 results; smallest source change, no dependencies, no real network, funds, wallets or new features. Record source-equivalent red/green, exact commit/CI evidence, and independent-review/browser requirements before merge.
Ownership: inspected active broad PRs #278/#264/#262/#372 and integrations #307/#302/#246 plus #424 and newest #452–#445, none claiming address.ts or the new address.runtime.test.ts; live open-PR inventory counted 211 and must be rechecked for newly published overlap. Related #424 owns deeplink.ts, not address.ts. The separately held generation-11 integration lease is not transferred to this worker; do not merge, deploy or release.
Status: isolated ownership claim recorded before test or production changes; regression, repair, verification and review pending.
# GP-BUG R36 — fail closed on malformed fiat separator descriptors (2026-11-22)

Worker: ChatGPT GhostPay consolidation, isolated sequential implementation; not an independent reviewer.
Branch: `automation/20261122-r36/bug/ux-fiat-runtime-separators`, based on protected main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-fiat/src/format.ts`, new `packages/ux-fiat/src/format.runtime.test.ts`, additive branch-local `docs/ai/ACTIVE_WORK.md`, new `docs/handoffs/UX_FIAT_SEPARATOR_BOUNDARY_R36.md`.
Baseline source: `format.ts` Git blob `ef6adf3fb5833d9746eb272813e7c4f5bc2c1409`. Existing `parseFiatInput` dereferences `fmt.groupSeparator/decimalSeparator` then `d.length` without checking malformed runtime objects; null/missing/nonstring separators can throw instead of returning the existing `bad-format` Result. It also does not enforce the length <=2 separator constraint already enforced by `formatFiatParts`.
Acceptance: regression first; malformed descriptor/missing/nonstring/overlength separators return existing typed `bad-format` without throwing; valid US/DE/grouping and exact BigInt parsing unchanged; no network, wallet, custody, rate policy, UI or new feature changes.
Coordination: 31 most recent PRs #423–#453 (except non-PR numbers) and broad integrations #372/#371/#307/#302/#246/#278/#264/#262 plus #397/#310/#344/#390/#380 were sampled by changed-file inventories; broad #372/#278/#264/#262 contain `ux-fiat/src/fiat.test.ts` but not owned `ux-fiat/src/format.ts`; do not overwrite their tests. This is **not an exhaustive 212-PR file overlap audit**. No valid integration lease: externally held generation-11 lock; do not merge, deploy, or release.
Status at claim: source inspection only; regression/test/implementation/qualification pending. Host CI and independent review required. 
# GP-R36-C — HTTP no-cache must not enter cache-first store (2026-11-22)

Worker: GhostPay consolidation coordinator (single executor; not an independent reviewer). Base: eb59d93cffed7848c4aac37d0e9650b87239c6da; isolated branch: `automation/20261122-r36-consolidation/bug/no-cache-response`.
Owned paths: `packages/ux-notify/src/cache-policy.ts`, new `packages/ux-notify/src/cache-policy.no-cache.test.ts`, additive branch-local `docs/ai/ACTIVE_WORK.md`, and `docs/handoffs/UX_NOTIFY_CACHE_NOCACHE_R36C.md`.
Finding: `shouldStoreResponse` presently allows `Cache-Control: no-cache` into a cache-first static asset bucket; a cache-first read cannot honor mandatory revalidation. Existing static cache policy only rejects `no-store` and `private`. This is a source-confirmed HTTP freshness-correctness concern, not a demonstrated real-world privacy exploit.
Acceptance: test-first regression for no-cache directives and neighboring public/private/no-store behavior; reject no-cache from cache-first storage; leave allowlist and all other caching rules intact; no dependencies, network calls, API, contract, wallet, funds or deploy changes. Existing broad #372/#278/#264/#262, related #433/#439 and current #453–#455 changed-file lists sampled; none changes cache-policy.ts or the new test path. Other open PRs remain to be cross-checked at integration. Integration generation-11 lock belongs to another coordinator; no main merge authorized. Hosted exact-head CI, native/browser qualification and genuine independent review remain required.
# GP-BUG R8 — preset storage missing-blob rollback after observed data (2026-11-22)

Worker: single ChatGPT bug-only coordinator; no separate native verifier available.
Branch: `automation/20261122-r8/bug/ux-presets-missing-blob`; exact current-main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-presets/src/store.ts`, new `packages/ux-presets/src/store.missing-blob.test.ts`, this append-only claim and dedicated `docs/handoffs/UX_PRESET_MISSING_BLOB_20261122.md`.
Finding: after successfully persisting/reading a revision, `load()` treats a subsequently missing encrypted blob (`storage.get(slot) === null`) as a fresh empty store, although other in-instance rollback/tampering rejects without writes; another save can silently replace remembered presets. This is a local encrypted preset persistence correctness/data-loss hazard, not a demonstrated fund loss or remote exploit.
Acceptance: regression first demonstrating missing ciphertext after a successful write cannot be listed as an empty store or overwritten, return existing uniform decrypt-failed error until original ciphertext is restored; preserve genuinely new empty-store initialization and normal save/read/replace/remove operations. Minimize source change, no dependencies or feature expansion.
Coordination: refreshed live main and 219 open PR metadata (2026-11-22); targeted changed-file checks of broad PRs #278/#262/#264/#302/#307, adjacent #417 and recent #447–#460 had no ownership on intended source/test; full remaining 219-PR filename inventory still in progress and must be completed before qualification/merge. Externally held generation-11 integration lease; no acquisition/merge/release. No local repository checkout available due GitHub DNS failure; do not claim repository Vitest from source-equivalent checks. Require exact-head all-required CI, independent review, native browser where applicable and ownership recheck before merge.
# GP-BUG — Reject non-string CSV amount parser inputs (2026-11-22; bug-only r10)

Worker: ChatGPT GhostPay bug-repair coordinator, sequential; independent review remains required.
Branch: `automation/20261122/bug/ux-export-parse-nonstring-r10`; base: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (verified live main).
Owned paths: `packages/ux-export/src/amount.ts`, NEW `packages/ux-export/src/amount.runtime-types.test.ts`, this append-only claim, and NEW `docs/handoffs/UX_EXPORT_PARSE_UNTYPED_20261122.md`.
Reproduction: base Git blob `4b10f141d29651eacfceee7af80b539c6e8c0c75` (`amount.ts`) and error blob `6d10133c45cc817fb7c95952f58b2a7b5a6f33cb` were matched in an isolated TypeScript compilation. `parseUnits(7 as never, 2)` silently returned `700n`; `parseUnits(['1'] as never, 2)` returned `100n`; null/undefined generated TypeError rather than typed ExportError.
Acceptance: add focused failing regression first, then one type guard to refuse every non-string before implicit regex coercion, retaining original canonical string parsing and ExportError('INVALID_AMOUNT'). Run isolated exact-source RED/GREEN with neighboring cases, then rely on exact-head hosted CI and independent review before any integration.
Ownership: queried live open-PR inventory and relevant changed-file lists (including #220, #238, #243, #246, #251, #262, #264, #278, #310, #372, #390, #407, #444, #465, #466); no source/test-path conflict found in inspected subset; full paginated per-file inventory remains to be completed before merge. Integration lock generation 11 is held by a different coordinator; do not acquire, merge or deploy. Do not update or replace any other worker's branch.
# GP-BUG-20261122-R11 — reject untyped ux-flow base64url decoder inputs

- Worker: this isolated GhostPay bug-only engineering round; no separate reviewer established.
- Branch: `automation/20261122T1426Z/bug/ux-flow-b64url-runtime-types`; source baseline: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-flow/src/base64url.ts`, new `packages/ux-flow/src/base64url.runtime.test.ts`, this additive claim, and `docs/handoffs/UX_FLOW_BASE64URL_RUNTIME_TYPES_20261122.md` only.
- Confirmed reproduction: Git-blob-matched main `base64url.ts` (`619e46e7db73be17896943db1be0031e18a82a95`) and `errors.ts` (`1539db553c5609a85170d8f9d3e75b3d00c5b65a`) compiled with TypeScript / Node 22.16.0. A non-string number or Symbol produced an empty success, a crafted object decoded bytes, and null/undefined raised native TypeError instead of typed `FlowError('PROOF_ENCODING')`.
- Scope: fix the exported strict decoder only; preserve every canonical valid byte/string decode and existing proof behavior. No dependencies, interfaces, new features, contracts, deployment or release.
- Acceptance: regression first and RED before one-line type guard; GREEN on source-hash-matched repaired code, neighboring canonical/invalid encodings; hosted exact-head checks and independent review still required.
- Ownership preflight: current open PRs #278/#262/#264/#238/#307/#372/#380/#246/#289/#407/#220/#371/#470/#467 and focused recent work did not touch the two owned code paths. This is a targeted sample, **not** an exhaustive all-PR file scan. Recheck ownership before merge.
- Integration lock: generation-11 is externally held per current coordinator checkpoints; no lock takeover or merge authorized.
# GP-BUG — Reject non-plain objects in public store hasOnlyKeys helper (2026-11-22)

Worker: one ChatGPT bug-only coordinator. No separate independent verifier available in this session.
Task branch: `automation/20261122/bug/store-onlykeys-plain-r1`, based exactly on live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-core/src/store.ts`, new `packages/ux-core/src/store.onlykeys-prototype.test.ts`, this additive registry claim, and new `docs/handoffs/UX_CORE_HASONLYKEYS_PROTOTYPE_20261122.md`. Do not modify any other path.
Evidence: exported `hasOnlyKeys` is documented as accepting a plain object with only approved own keys, but on frozen main its `Object.keys`-only guard accepts `new Date(0)`, a `Map`, and an object with an inherited property, because each has no unapproved enumerable *own* key. Isolated Node reproduction observed all three returning true. This lets a caller incorrectly trust a non-record object as a schema record.
Acceptance: commit failing Vitest regression before the smallest prototype guard; reject Date, Map, nonplain/inherited-prototype objects; preserve ordinary plain objects and null-prototype dictionaries and deny unapproved own keys. Check actual source hashes, run available isolated Node checks and hosted CI, and record unrun workspace/browser checks. No dependency, payment, feature, build, or contract changes.
Ownership: all 232 open PR changed-file inventories at the 2026-11-22 snapshot were inspected for `store.ts`, `theme.ts`, and `merge.ts`; none included `store.ts`. Recheck before any merge. Integration lock generation 11 remains recorded as externally held; do not take over or merge/deploy/release. Independent review required for qualification.
# GP-BUG — reject unsupported parseUnits rounding modes (2026-11-22)

Worker: GhostPay BUG-ONLY coordinator; sequential test-first repair; independent reviewer not available in this worker. Branch: `automation/20261122/bug/ux-fiat-parse-rounding-r12`; exact main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned source: `packages/ux-fiat/src/decimal.ts`; new dedicated regression: `packages/ux-fiat/src/decimal.rounding-validation.test.ts`; additive ownership registry and `docs/handoffs/UX_FIAT_PARSE_ROUNDING_20261122.md`. Existing `fiat.test.ts` is owned by other open PRs and must remain untouched.
Observed defect: `parseUnits('1.25', 1, 'round' as never)` accepts an unsupported mode and silently selects half-even, returning `12n`, and invalid modes on exact decimals are accepted as successes. This differs from the package's existing `bad-rounding` behavior in `toFiatMinor` / `fromFiatMinor`. Source under test: Git blob `6476b0ff8f2676ed75aea5c972f7d546b4c136bd`; locally reconstituted source blob hash matched, TypeScript 5.8.3 standalone strict compile and Node 22.16.0 repro, no repository Vitest claimed.
Acceptance: commit failing regression first, reject invalid supplied rounding modes with existing `bad-rounding` result; preserve absent-mode and seven valid modes; repeat isolated source-hash-matched checks; hosted exact-head CI and separate review required. No new behavior/dependencies/fee/wallet/contract changes, deployment, release or direct main merge. Exhaustive PR file inventory at initial snapshot: 233 open PRs, no source or new-test path collision; broad #224/#238/#262/#264/#278/#372 own `fiat.test.ts`. Main integration metadata generation 11 remains held by external owner `994a0d214fb9-root-r3` at `6edfcd4d`. Do not take over or merge.
# GP-BUG — single-clock cancellation of scheduled payment (2026-11-22)

Worker: GhostPay BUGS-ONLY automation, sequential implementation and self-check; independent verifier not available.
Branch: `automation/20261122/bug/ux-schedule-cancel-single-clock-11`; verified `main` base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-schedule/src/scheduled.ts`, new `packages/ux-schedule/src/scheduled.cancel-clock.test.ts`, this additive registry claim, and `docs/handoffs/UX_SCHEDULE_CANCEL_CLOCK_20261122.md`. Existing `scheduled.test.ts` is untouched.
Observed existing defect: `cancel()` samples the injected clock in `tick()` and again for `stateChangedAtMs`. A clock crossing the expiry boundary between calls produces a `cancelled` record timestamped after its maximum age even though the state machine would classify that instant `expired`. This differs from `confirm()` which binds validation and timestamp to one clock sample.
Acceptance: first commit failing regression for advancing injected clocks; replace duplicate read with one captured clock sample; preserve valid pending/due cancellations, expired/terminal rejection, explicit acknowledgement and all other state-machine behavior. No new functionality or dependency, wallet, chain, deployment, release or merge. Tests and full native browser/CI require exact-head hosted qualification. Recheck ownership and external integration lock before any future merge.
Ownership audit: all 236 open PR changed-file inventories at the discovery snapshot examined; no PR touched either owned path. Existing broad PRs #238/#262/#264/#278/#372 touch other ux-schedule metadata/tests but not these two paths. Active main integration lease is held by another coordinator, no acquisition or protected integration.
# 2026-11-22 — GP-R11 palette action snapshot integrity

- Cycle/worker: `20261122T1834Z/palette-action`; one sequential coordinator/implementer, no independent native worker available.
- Isolated branch: `automation/20261122T1834Z/bug/palette-action-snapshot`, exact main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-core/src/palette.ts`, new `packages/ux-core/src/palette.action-copy.test.ts`, this additive claim, and new `docs/handoffs/PALETTE_ACTION_SNAPSHOT_R11_20261122.md`. Other writers' files and branches are untouched.
- Reproduction: `createRegistry().register()` freezes command and copied keywords but retains the original mutable nested `action`. Mutating the caller's action after validation changes the registered navigation/action type. Node 22 isolated copied-control-flow demonstration reproduced this behavior; no deployed exploit was established.
- Acceptance: copy and freeze each validated action on registration; no change to command matching, navigation, shortcut handling, or built-ins; regression-first tests for both caller mutation and mutation through registry-returned references; typecheck/lint/web workspace qualification; independent review before merge.
- Ownership review: GitHub PR search for palette/shortcut returned no open palette-specific PR; broad active PRs #278, #372, #238 and #307 do not change the owned production path. Search is scoped, not a full open-PR ownership guarantee. The central integration lock remains held at generation 11 by `994a0d214fb9-root-r3`; no attempt to take it, edit protected targets, merge or deploy.
# GP-BUG — fail closed on sparse pre-send checklist safety arrays (2026-11-22)

Worker: ChatGPT BUG-ONLY automation round 12, single implementer; no independent verifier available.
Branch: `automation/20261122-r12/bug/guide-sparse-checklist`; base live main SHA: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-guide/src/checklist.ts`, new `packages/ux-guide/src/checklist.sparse.test.ts`, this additive branch-only ownership claim, `docs/handoffs/UX_GUIDE_CHECKLIST_SPARSE_20261122.md`.
Evidence: `validInput` uses JavaScript `Array.every` on `knownAddresses`, `wallet.ownAddresses`, and `acknowledged`. Sparse array holes are skipped, so malformed runtime safety inputs are incorrectly accepted and the pre-send checklist can report `canSend: true`. Existing docstring promises a fail-closed `input_invalid` blocker. Scope is only sparse-array validation, with unchanged valid dense inputs, lookalike warnings and other checklist behavior.
Acceptance: first commit failing Vitest regressions, then a minimal fix that visits holes rather than silently skipping them; source-equivalent control-flow proof and exact-head hosted CI; independent review needed before any integration. No features, contract, fund, dependency, release or deployment changes.
Ownership: before claim, complete changed-file inventory of all 239 open PRs across 3 pages was inspected. No PR changes either proposed source or dedicated regression path. Existing ux-guide PRs #451 (profiles.ts), #429 (onboarding.ts) are distinct and will not be modified.
Dependency: PR #390 at `b655bc273a6704c9c140287b8adcdf4085b91882` has all 5 exact-head hosted workflows green but no submitted independent review; leave its owner branch unchanged. Integration lock generation 11 `held` by `994a0d214fb9-root-r3`, ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; no takeover or merge.
Status: claimed, failing regression and repair pending.
# GP-BUG — Reject pre-epoch CSV timestamps in exported date parser (2026-11-22)

Worker: GhostPay bug-only automated engineering round (single implementer, independent reviewer unavailable).
Branch: `automation/20261122T2123Z/bug/export-pre-epoch-date-guard`; base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-export/src/time.ts`, new `packages/ux-export/src/time.pre-epoch.test.ts`, this additive ownership record, dedicated `docs/handoffs/UX_EXPORT_PRE_EPOCH_DATE_20261122.md`.
Finding: `parseTimestamp` for ISO and date formats accepts otherwise valid dates before Unix epoch and returns negative milliseconds, contrary to `assertTimestamp`, `formatTimestamp`, and the documented `0..9999-12-31` timestamp domain. Exact live-main `time.ts` blob `85006680a6011b05685c04df504d56fb078c065b` matched an isolated TypeScript/Node 22 source reproduction: `1969-12-31` (date) returned -86400000 and `1969-12-31T23:59:59.999Z` (ISO) returned -1.
Acceptance: commit failing regression test before source fix; return the existing `ExportError('INVALID_DATE')` for negative ISO/date instants, retain 1970 boundary and all valid formats/ranges; no extra contract or dependencies. Run source-hash-matched isolated red/green and nearby cases; exact-head hosted CI and separate review required before merge.
Coordination: inspected all 241 live open PR changed-file inventories (three pages of 100/100/41) before claim: none modifies `time.ts` or a `time.*` test filename. Do not overwrite broad export PR ownership elsewhere. PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882` has five completed-success hosted workflow groups, with zero submitted independent GitHub reviews; its owner branch remains untouched. Integration metadata ref `automation/ghostpay-integration-lock` head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` is marked held by other owner, generation 11. No merge, lease takeover, deployment or release.
# 2026-11-22T22:32Z — UX privacy sparse-records typecheck repair (isolated child)

- Cycle/worker: `20261122T2232Z` / single coordinator, sequential CI diagnosis, focused repair, self-audit and documentation; independent verifier not available in this environment.
- Branch: `automation/20261122T2232Z/bug/policy-sparse-test-typecheck`, exact parent PR #482 head `e5705abded6761c2b53cde2343210372e2264ef7`; stacked on #482, which depends on #437. Main observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-privacy/src/policy.sparse-records.test.ts`, additive claim in `docs/ai/ACTIVE_WORK.md`, dedicated `docs/handoffs/UX_PRIVACY_SPARSE_POLICY_TYPECHECK_20261122.md`. Production `policy.ts` and parent branches are not owned by this cycle.
- Reproduced hosted CI failure: PR #482 Core CI run 45067893449, job 137348097253, TS2379 at line 79 due explicit `guardianThreshold: undefined` with `exactOptionalPropertyTypes: true`; aggregate `typescript` job 137352632714 fails because the needed typecheck job failed. All web tests, lint and browser jobs passed on the parent candidate; they do not qualify this child.
- Acceptance: change only the test fixture to omit `guardianThreshold` when testing the absence case; retain the negative nonempty threshold assertion and all five sparse-array regressions; no TypeScript flag weakening, `as any`, production alteration or unrelated changes. Run focused exact-TypeScript-options reproduction and hosted exact-head CI, then seek truly independent review before merge.
- Integration metadata: `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, generation 11 `held` by `994a0d214fb9-root-r3`. No lease takeover or protected integration permitted. Confirm no deployment triggers before any merge.
- Security: the separate 10-record Mythril findings (3 Medium/7 Low) and external release clearance remain open and unmodified; no contract, key, fee or real-funds work.
# 2026-11-23T00:32Z — theme CSS snapshot TOCTOU correction (isolated)

- Cycle/worker: `20261123T0032Z` / single ChatGPT coordinator in sequential audit, regression, implementation and self-check phases. Native parallel workers/independent reviewer unavailable.
- Branch: `automation/20261123T0032Z/bug/theme-css-snapshot`; exact base `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`; source `packages/ux-core/src/theme.ts` blob `920c6d6d9ba185d7e25fdf36ae1dc6e0e170e293`, existing tests blob `e5187b1e340e29476f9a6a9e27d080aa2aaea33a`.
- Owned paths: `packages/ux-core/src/theme.ts`, new `packages/ux-core/src/theme.snapshot.test.ts`, this additive claim, and new `docs/handoffs/THEME_CSS_SNAPSHOT_20261123.md`; no other source files.
- Finding: `cssFor` validates caller-supplied theme object/token values and then rereads their properties to construct CSS; accessor-backed or subsequently mutated inputs can switch from safe `#rrggbb`/id to unvalidated selector/CSS text after the check. This violates the documented injection-proof output guarantee for direct JS callers. JSON-parsed themes have inert properties, so exploitation via ordinary JSON import is not established.
- Acceptance: capture own theme metadata and token entries exactly once before validation and CSS output; use the same validated copy for all CSS; return typed refusal for throwing accessors; add RED regressions for changing colour/id getters plus valid and error controls; preserve built-in themes, contrast checks, CSS format, and import behavior. No dependency, workflow, signing, contract, wallet or production config change.
- Active ownership: checked source paths of PRs #238/#262/#264/#278/#293/#307/#372/#418/#437/#471/#479/#482/#485/#487; none changed these two exact theme paths. Recheck current PRs/heads before any integration. PRs #278/#372 remain broad owners of unrelated sources.
- Integration lock: ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, generation 11 `held` by another coordinator; no takeover or merge, even after expiry.
- Verification: local `git ls-remote` cannot resolve github.com. Use actual hosted exact-head tests; source-equivalent Node demonstration is not repository Vitest. Independent review is mandatory before merge.
# GP-BUG — Fix overflow-distorted amount-blur crowd labels (2026-11-22)

Worker: ChatGPT BUG-ONLY hourly engineering run (single coordinator; no independent verifier available).
Branch: `automation/20261122T1818Z/bug/amount-blur-crowd-overflow-r11`, starting exact live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/amount-blur/src/meter.ts`, new `packages/amount-blur/src/meter.overflow.test.ts`, this additive work claim and `docs/handoffs/AMOUNT_BLUR_CROWD_OVERFLOW_20261122.md`. No other runtime source/test changes authorized.
Observed failure: with finite `eventsPerDay=Number.MAX_VALUE`, `windowDays=2`, `amountBuckets=Number.MAX_VALUE`, `estimateCrowd` computes `Infinity` because it multiplies before dividing; the mathematically representable estimate is 2 and its label must be `tiny` rather than `larger`. On unrepresentable estimates, the existing typed `INVALID_INPUT` failure contract must be preserved instead of returning an infinite A. Verified in Node 22 standalone arithmetic; native repo checkout is unavailable.
Acceptance: regression committed before production repair; preserve all finite ordinary inputs and threshold labels; avoid overflow-distorted labels when the true result is representable; reject truly infinite estimates with existing error code; no dependencies, feature work, network, payments, deployments or CI changes. Preserve existing `meter.test.ts` owned by no one, untouched.
Ownership: paginated 247 open PRs and their actual changed-file inventories checked at selection. None owns any `packages/amount-blur/src/` paths; broad PRs #238/#262/#264/#278/#372 only change amount-blur package.json, not source. Reconfirm before integration. PR #390 at `b655bc273a6704c9c140287b8adcdf4085b91882` has all five workflow groups green and zero submitted independent reviews; do not modify its owner branch.
Integration: externally held generation-11 `automation/ghostpay-integration-lock` lease observed at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; no lock takeover/merge. Exact-head required CI, applicable browser validation and independent review remain gates.
# GP-BUG-RATE-TOCTOU — snapshot untrusted fiat quote fields (2026-11-23 UTC)

- Worker/coordinator: single ChatGPT worker `20261123T0237Z-root`; sequential audit, repair and self-check only; no independent verifier available.
- Isolated branch: `automation/20261123T0237Z/bug/fiat-rate-quote-snapshot`, exact base/main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-fiat/src/rate.ts`, new `packages/ux-fiat/src/rate.snapshot.test.ts`, additive entry in this file and `docs/handoffs/UX_FIAT_RATE_SNAPSHOT_20261123.md`.
- Dependency/ownership: checked changed paths on #413, #454, #475, #278, #372, #488, #489, #490; none changes `rate.ts` or the new test. Existing broad feature/PR claims remain active; recheck before integration. #454 and #413 own `format.ts` and #475 owns `decimal.ts` and remain untouched.
- Reproduction: `parseRate` validates quote properties and rereads `asset`, `fiat`, `source`, `timestampMs` into returned `ParsedRate`. Getter-backed quotes can change between validation and return, accepting an invalid display label/time. Failing getters can throw native exceptions. Node 22 source-equivalent probe reproduced the changed-label case; direct browser exploit not claimed.
- Acceptance: read each quote property once into inert primitive snapshot, validate and return the exact same values; return existing typed `bad-rate-format` for throwing accessors; preserve all plain-JSON/decimal bounds behavior; regression tests for changing label/time and throwing getter, plus plain quote. No dependencies, new services, RPC requests, contracts, keys, fee-policy or deployment changes.
- Lock: observed external held integration lock `automation/ghostpay-integration-lock` generation 11, owner `994a0d214fb9-root-r3` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`. Expiry does not confer ownership. No shared merges or tracking edits on main.
- Verification status: local clone blocked by `Could not resolve host: github.com`. Source-equivalent Node tests are not repository Vitest, lint, build or browser tests. Exact-head hosted qualification and independent approval required.
# GP-BUG R12 — accept canonical HTTPS origins with maximum DNS host and explicit port (2026-11-23 UTC)

Worker: ChatGPT BUG-ONLY coordinator, sequential test-first repair (no independent review asserted).
Branch: `automation/20261123/bug/ux-flow-origin-port-length-r12`; exact `main` base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-flow/src/ret.ts`, new `packages/ux-flow/src/ret.origin-port.test.ts`, this additive registry entry, and new `docs/handoffs/UX_FLOW_ORIGIN_PORT_LENGTH_20261123.md`. Do not edit preexisting `ret.test.ts` or other worker files.
Reproduction: `canonicalOrigin()` claims to accept exact WHATWG `new URL(x).origin` strings, but its pre-parse `253 + 8` size cap excludes a valid 253-character DNS host with explicit five-digit HTTPS port (267 characters total). On Node v22.16.0, `new URL(origin).origin === origin`, but GhostPay rejects it as null; this also disables valid return-to-merchant origins in `isAllowedReturn()` / `buildReturnUrl()`. This is a source-equivalent reproduction, not a repository Vitest run.
Acceptance: commit a failing regression BEFORE production repair; correct only this origin-length arithmetic while preserving the bounded input policy, protocol/authority/userinfo checks and existing short-origin behavior; run baseline repaired regression and adjacent cases with actual results recorded; request hosted exact-head CI and independent review before merge. No new features, network calls, real funds, contracts, dependencies, or deployment.
Coordination: all 250 open PR changed-file inventories were checked at discovery; no existing PR changes either owned source or new test file (broad #238/#246/#262/#264/#278/#372 included). PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882` has five successful hosted workflows but no submitted independent review; do not touch its branch. Separate integration metadata branch `automation/ghostpay-integration-lock` is status `held` generation 11 by owner `994a0d214fb9-root-r3`; never take over or merge without explicit legitimate lock ownership. Native checkout of github.com fails due DNS resolution.
# GP-BUG-R11 — Reject explicit default/empty ports in invoice-link classifier (2026-11-23)

Worker: GhostPay BUG-ONLY sequential automation; independent reviewer unavailable pending qualification.
Branch: `automation/20261123/bug/intake-invoice-default-port-r11`; source baseline main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; source blob `72edfb42a2a4df5d4b7def55a966d756f7b821ef`.
Owned: `packages/ux-intake/src/payload.ts`, new `packages/ux-intake/src/payload.default-port.test.ts`, additive claim in this file, and `docs/handoffs/INTAKE_INVOICE_DEFAULT_PORT_20261123.md`.
Observed failure: `classifyPayload` accepts invoice URLs with explicit `:443`, `:0443`, or empty `:` despite its explicit no-port contract because WHATWG `URL.port` canonicalizes these to an empty string. Node 22.16 URL reproduction verified canonicalization. Use failing Vitest regression before minimal fix, retain allowed no-port, credential, other-port, host/path, and bare-fragment behavior. `parseDeepLink` is already owned separately by PR #424, so do not change its files.
Ownership: live open PR inventory paginated 100+100+51=251 and all 251 changed-file inventories queried; neither owned code/test path appeared. PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882` has five successful hosted workflows but zero submitted independent reviews, so left unchanged. Metadata integration lease generation 11 status held by unrelated owner `994a0d214fb9-root-r3`; expiration is not authority to take over. No merge, deployment, fund interaction, or release. Hosted exact-head CI, independent review, and applicable browser qualification remain hard gates.
# GP-BUG-R12 — avoid caching JWT-shaped long opaque query values (2026-11-23 UTC)

Worker: ChatGPT BUG-ONLY coordinator, single sequential implementation; independent verifier not yet available.
Branch: `automation/20261123/bug/notify-jws-query-cache-r12` from live main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-notify/src/urlsafety.ts`, new `packages/ux-notify/src/urlsafety.jwt-query.test.ts`, additive claim here, and `docs/handoffs/NOTIFY_JWS_QUERY_CACHE_20261123.md`. Do not edit existing `cache-policy.ts` or its tests, or any competing worker branch.
Failure evidence: verified untouched source blob `9d2f5e1854641629c1321fb65fe64242a45f920a` with `git hash-object`; Node 22.16.0 replay of compiled source returned false for a 3-segment, 72-character synthetic JWS in a neutral query parameter (e.g. `?v=header.payload.signature`), although the cache planner explicitly excludes long opaque query values. Ordinary base64url strings without dots are caught; the dot-separated equivalent is not. This permits a cache-first decision for an otherwise allowlisted immutable asset with a query-contained JWS.
Acceptance: commit failing focused Vitest regression before smallest scoped fix, reject long three-segment JWS-shaped query values including percent-encoded separators, preserve ordinary versions, small values and existing keys, run source-hash-matched Node checks and hosted GitHub CI; require independent review and browser qualification if applicable before merge.
Ownership: scanned complete changed-file inventories of 253 live open PRs (100+100+53) with no other PR modifying these two owned paths. Adjacent ux-notify source is owned by PRs #465, #458/#409, #439 and #433, and remains untouched. PR #390 exact-head five workflow groups passed but has no submitted independent review; its branch is owner-controlled and unchanged.
Integration: generation-11 lease previously reported externally held; do not acquire, merge, deploy, or release. Reinspect lease and exact-head CI prior to any future integration.
# GP-BUG-11 — reject invalid runtime embed snippet option records (2026-11-23)

Worker: one ChatGPT bug-only coordinator; no separate independent verifier available.
Branch: `automation/20261123-r11/bug/ux-flow-embed-option-record`; starting `main` SHA `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-flow/src/embed.ts`, new `packages/ux-flow/src/embed.options-shape.test.ts`, this additive ownership claim, and new `docs/handoffs/UX_FLOW_EMBED_OPTION_RECORD_20261123.md` only.
Observed baseline: `makeSnippet(link, appOrigin, null)` evaluates `Object.keys(null)` before its option validation, throwing native `TypeError` instead of the documented `FlowError('BAD_OPTION')`. Non-record option primitives or arrays also bypass the type contract. This is a malformed-options runtime correctness bug, not new functionality.
Acceptance: first commit a deterministic regression failing on the original source, then reject non-record runtime option shapes with existing `BAD_OPTION` while retaining valid options, emitted snippets, link restrictions and escaping. No dependencies, redesign, fund/contract/network changes or deployment. Use source-exact or source-equivalent Node reproduction when checkout unavailable; hosted exact-head CI and independent qualified review required before integration.
Coordination: refreshed 254 open PR changed-file inventories; none owned either selected source or dedicated regression path when checked. Existing #390 externally owned: five workflows green at `b655bc273a6704c9c140287b8adcdf4085b91882`, independent review pending. Integration lease `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, held generation 11 by another coordinator; do not acquire or merge.
# PR #340 current-main integration — 2026-11-20 Pacific

Worker: `/root/tron_refresh`; coordinator: `5ceb6203640a-root` (integration lease generation 12).
Isolated branch: `repair/ghostpay-tron-main-20261121-5ceb`.
Starting head: `b86a3e6affe8b71c6f13d16783accad446271ba4`, the verified #342 merge into #340.
Target main snapshot: `aec179910c39081d820396409ff3139ff2264132`.
Owned paths: merge resolution in `apps/web/src/features/tron/chain.hardening.test.ts`,
this additive claim, and `docs/handoffs/TRON_CURRENT_MAIN_20261121.{md,json}`.
Acceptance: preserve both source histories; retain selected Nile/Shasta genesis validation,
main's strict incomplete-range rejection and cancellation checks, and all original assertions;
resolve only incompatible test API calls/expectations; run focused TRON tests, TypeScript,
lint and static build; obtain independent review and new exact-head hosted qualification.
No remote writes, workflow changes, new chain support, live RPC/funds, deployment or release.
The coordinator owns publication to the existing #340 branch and all merge decisions.
# Policy-scheme Anvil test gate repair (2026-11-21 UTC)

Worker: same sequential ChatGPT engineer, appended scope on owned draft #385 child branch `test/ghostpay-policy-review-races-20261121-r1`. Parent #375 head pinned `2e0aff8490086a54fadd52c2fa4d802605b7920e`.
New owned path: `packages/policy-scheme/src/anvil.test.ts` (test-only fixture correction); existing `PolicyPay.reviewRaces.test.tsx`, prior ownership record and handoff retained. No production, contracts, fees, CI thresholds or parent branch changes.
Source-pinned RED: parent hosted [CI run 44883454132](https://github.com/djshellshoxxx/GhostPay/actions/runs/44883454132), job ts-test (rest-0) `136786458558`, has 109 passing tests and one failed real Anvil cross-check at `anvil.test.ts:312`. Historical test builds ERC-20 typed data with a native-only Merkle proof, which newly restored `eip712.ts` correctly rejects as `INVALID_PROOF` before calldata encoding. Acceptance: make the test assert this earlier client-side rejection, preserve a separate encoder proof-mismatch refusal and a real deployed contract revert with valid signed data yet mismatched proof. No disabling, skipping or relaxing contract/Anvil checks. Run exact-head hosted Anvil test, all relevant CI and independent source review. Local git DNS still blocked. Generation-11 lock remains held; no direct main merge.

---

# GP-BUG-07 follow-up: pending edit and mined-approval review races (2026-11-21 UTC)

Worker: ChatGPT sequential engineer, no independent approving reviewer. Task branch `test/ghostpay-policy-review-races-20261121-r1` starts at PR #375 exact head `2e0aff8490086a54fadd52c2fa4d802605b7920e`, itself stacked #375 → #374 → #368 → #362 → #357 and inheriting #345's review-revocation repair. Baseline current main observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: a new `apps/web/src/features/policy/PolicyPay.reviewRaces.test.tsx`, this append-only claim, and `docs/handoffs/POLICY_REVIEW_RACE_COVERAGE_20261121.md`. Existing production source/tests and parents are untouched.
Acceptance: deterministic MockWallet/jsdom tests for editing payee/token while an account recheck is pending, re-review invalidation, and an ERC-20 approval already mined followed by an edited amount before the payment wallet request. Require no unauthorized payment wallet request and clear residual-allowance messaging; do not assume a browser can revoke a wallet request already delivered. Do not weaken CI/gates, add dependencies, network endpoints, contracts, deployment, custody or fee logic.
Verification: exact-head hosted focused Vitest, web lint/typecheck, full relevant CI and independent review required; do not claim local execution or approval without evidence. This is a stacked draft child of #375, not an independent mainline merge. Generation-11 integration lock remains held by another coordinator; do not mutate it or any parent/main branch.

---

# Policy validation restoration — 2026-11-21 UTC

Owner: `/root/policy_validation_restore`, coordinator `5ceb6203640a-root`.
Branch: `recover/ghostpay-policy-validation-20261121-5ceb`; exact parent `e1ab03ca7b07c225ae42d0c16fb79b97f0a1f95c`.
Owned paths: `packages/policy-scheme/src/{derive,eip712,limits,router}.ts`, narrowly required exports/docs and supported-format tests; `apps/web/src/features/policy/{pay,send}.ts`, narrowly required supported-input fixtures; additive claim and dedicated handoff.
Scope: selectively restore existing defensive input-consistency and secret-lifetime guards. Preserve the parent asset coverage, exact seller identity, wallet authority, privacy, and transaction-journal behavior. No contracts, protocol, fees, custody, deployment or live-funds changes.
Acceptance: static defensive source review, final-source supported-format compatibility, original TypeScript/lint/build and permitted existing final-source suites. No vulnerable-revision execution, exploit reconstruction, newly designed adversarial payloads or attack testing. Any unexecuted regression is recorded, never classified as passed. Existing assertions/gates are not removed or weakened.
Ownership: isolated child only. The current generation-11 lease remains held by `994a0d214fb9-root-r3`; no remote/main/parent writes or lock transition. Root will separately review and publish any exact-source draft.

---

# Policy withdrawal-asset coverage recovery — 2026-11-21 UTC

Owner: `/root/policy_asset_recovery`, coordinator `5ceb6203640a-root`.
Branch: `recover/ghostpay-policy-asset-coverage-20261121-5ceb`; starting head `18d0442a156106abe2309f8a6e82358aab37961a` (#368 policy recovery/security-key chain).
Inputs to preserve: #345 `ccc8c3521511e2a2b9b66ef11f12723d87ce5f44` pending-review revocation; current main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths in this isolated composition: `packages/policy-scheme/src/{record,index}.ts` and focused coverage tests; `apps/web/src/features/policy/{pay.ts,PolicyPay.tsx,PolicyCreate.tsx,PolicyAssetCoverage.test.tsx}` and focused payment coverage tests; the associated new security keys in `apps/web/src/i18n/securityKeys{,.test}.ts` and `apps/web/locales/{en,es,ar,ja}.json`; this additive claim and `docs/handoffs/POLICY_ASSET_COVERAGE_20261121_5CEB.{md,json}`.
Acceptance: reproduce missing client-side withdrawal-asset coverage checks using existing #211 source/regressions, recover only bounded guard/presentation/test hunks, preserve exact seller identity, pending-review revocation and original gates, independently review and qualify. No contract, custody, fee, deployment, release or real transaction changes.
Ownership: live generation-11 metadata lease remains held by `994a0d214fb9-root-r3`; this worker does not acquire it or modify any remote/main/parent ref. Existing owners and records are retained. Broader recovery and native-browser workers own separate worktrees.

---

# GP-BUG-08 follow-up — policy record downloads and catalog parity (2026-11-20 Pacific)

- Worker: `/root`, with independent `round2_recovery_review`, `round2_checks`, and `round2_claims` workers.
- Branch: `fix/ghostpay-policy-recovery-followup-20261121-r1`; parent PR #357 head `e871eccc1238b7145cd1d0a667afb393c373cf83`; main observed at `aec179910c39081d820396409ff3139ff2264132`.
- Owned paths: `apps/web/src/features/policy/PolicyCreate.tsx`, new `PolicyCreate.recordDownloads.test.tsx`, existing `PolicyView.more.test.tsx` and `PolicyView.recordIdentity.test.tsx` in that directory, the single `policy.create.alreadySaved` entry in `apps/web/locales/{ar,es,ja}.json`, this additive claim, and dedicated follow-up evidence under `docs/handoffs/`.
- Evidence: #357's exact-head `ts-check` builds successfully but fails catalog parity with three missing keys. Independent review identifies identical export filenames for equal-policy/equal-spending-key records with different viewing keys. The prior recovery fixture imports the exact record it then claims to restore, conflicting with the intended duplicate-record message.
- Acceptance: preserve seller identity and duplicate-record safeguards; bind filenames to the full canonical meta-address; verify distinct filenames, repeat stability and exact serialized bytes; exercise genuine recovery using another saved record's nonzero limits root and separate duplicate-recovery feedback; verify each seller key independently; restore catalog parity without changing draft metadata, fallback rules or release gates.
- Coordination: preserve #357's author branch. #355, #356 and #359 already own the separate focus, Settings and pending-send repairs. Shared integration remains held by coordinator `994a0d214fb9-root-r3` at generation 11. This task does not acquire that lease or modify main/shared candidates. Publish a scoped draft successor after independent review.
- Status: implementation and scoped verification complete; independent source review passed. Evidence is retained in `docs/handoffs/gpbug08-recovery-followup-20261121/`. Draft successor prepared; hosted checks on its published head and any eventual combined integration remain separate gates.

---

# PolicyPay pending-edit test lint qualification — 2026-11-21 UTC

Worker: single sequential ChatGPT continuation; no independent reviewer. Branch: `fix/ghostpay-policy-pendingedit-lint-20261121-r1` stacked only on PR #345 at `9a10d335d048b197e90d257a5322ff5d5260572d` (base `main` `aec179910c39081d820396409ff3139ff2264132`).
Owned paths: additive `docs/ai/ACTIVE_WORK.md` claim, `apps/web/src/features/policy/PolicyPay.pendingEdit.test.tsx` mechanical test-mock correction, and `docs/handoffs/POLICY_PENDING_EDIT_LINT_20261121.md`. Do not edit parent PR or integration lock.
Evidence: PR #345 CI run https://github.com/djshellshoxxx/GhostPay/actions/runs/44842199985, ts-lint job `136687978951`, fails only `@typescript-eslint/require-await` at `PolicyPay.pendingEdit.test.tsx:53` because `createRpc: async () => rpc` has no await. All other 22 listed CI jobs passed, but do not infer new-head qualification.
Acceptance: replace the unnecessary async wrapper with a Promise-returning callback of identical asynchronous contract; retain all wallet/amount-change regression assertions and production source unchanged. Do not weaken ESLint/tests/CI, add dependencies, change network, deploy, merge or release. Verify focused test, lint, CI and independent review before integrating into #345.
Overlap: parent PR #345 owns original file; this child is intentionally stacked on it, not a competing independent main PR. Integration lock generation 11 held by another coordinator; do not acquire/modify. Handoff with source-pinned exact SHAs required.

---

# GP-BUG-07 — policy review revocation during pending wallet send (2026-11-20)

Worker: automated GhostPay continuation, one sequential engineer (not independently reviewed). Branch: `automation/20261120/bug/policy-review-revocation-r1`; exact base main `aec179910c39081d820396409ff3139ff2264132`.
Owned paths: `apps/web/src/features/policy/PolicyPay.tsx`, new `apps/web/src/features/policy/PolicyPay.pendingEdit.test.tsx`, additive `docs/handoffs/POLICY_REVIEW_REVOCATION_20261120.md` and this ownership record.
Finding: GP-BUG-07 / MV-02 in PR #312 confirms that a reviewed policy payment may continue to the wallet after visible form edits while an earlier send is awaiting an account recheck. Scope is optional policy full-profile code; production Pages lean build and policy deployment pins do not expose this feature.
Acceptance: synchronous form-edit/re-review invalidation of the authority captured with the original review; last wallet authority check refuses before any new wallet request; retain existing session/deployment/transaction/deadline checks and post-approval recovery messaging. Add mock-wallet/browser regression; do not introduce contracts, relayers, new chain support, dependencies or deployments.
Overlap: broad PR #278 (head `417f7c71daf8645e1432f2ec8f070110879b80bd`) also touches PolicyPay and has not implemented a review-revision guard in the inspected head. Do not bulk-merge either donor; patch-equivalence and conflict review required before integration. No separate focused GP-BUG-07 PR was found. No shared integration lock acquisition or main mutation.
Status: claimed; implementation, full CI, review and qualification pending.
# Settings RPC responsive layout — 2026-11-21 (isolated)

Worker: current ChatGPT coordinator; no independent subagent or external reviewer is claimed.
Branch: `chatgpt/ghostpay-rpc-layout-reflow-20261121-r1`; base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/views/Settings.tsx`, `apps/web/src/styles/app.css`, a new focused `apps/web/e2e/settings-rpc-reflow.spec.ts`, this append-only claim, and `docs/handoffs/SETTINGS_RPC_REFLOW_20261121.md`.
Finding: at viewport widths of at least 40rem, the shared `.row` applies four columns (2fr 1fr 1fr auto) to a primary RPC URL, Test button, status, and secondary RPC URL, leaving both URL controls compressed. Scope accepted under issue #364.
Acceptance: both RPC URL inputs have usable nonoverlapping widths on desktop, remain stacked and within 320px screens, and maintain keyboard/DOM ordering and test/status behavior; add focused Playwright checks and execute exact-head CI before qualification. Do not redesign unrelated controls, change endpoint validation/network calls, introduce dependencies, or deploy.
Ownership: independent branch only. Repository generation-11 integration lock held by another coordinator; no shared-lock takeover, main merge, release, or deployment authorized here. Overlap with broad existing PRs must be rechecked before integration.
Verification: test-first RED/GREEN via hosted CI where available; local repository checkout and browser execution unavailable due github.com DNS failure. Do not claim unrun checks.
# Browser self-check test-only lint repair — 2026-11-21 R16

Worker: consolidation continuation, sequential source review/repair; no independent reviewer available.
Branch: `fix/ghostpay-browser-selfchecks-lint-r16-20261121`, stacked on existing PR #402 exact head `3c9b96d0a10a976cb2143a8a62bbd4e31fc9f565`; frozen main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `apps/web/src/components/BrowserChecks.test.tsx`, `apps/web/src/lib/browserChecks.test.ts`, this additive ownership claim and `docs/handoffs/BROWSER_SELFCHECK_LINT_R16_20261121.md`; no production changes. Parent #402 remains unmodified.
Evidence: hosted CI `44903445539` `ts-lint` job `136853147319` reports exactly four `@typescript-eslint/require-await` errors: async act callbacks at lines 50,52 and async digest mocks at lines 64,73. All other jobs passed, but aggregate CI failed. Acceptance: maintain asynchronous React act flush and WebCrypto Promise contract, remove lint errors without disabling rules, preserve existing integrity/storage failure assertions. No wallet, custody, relayer, contracts, deployment or third-party work. Require exact-head CI + independent review; shared generation-11 integration lock held by another owner, no main merge.

---

# 2026-11-21 — Workstream I exact-optional TypeScript build repair (stacked on #395)

Worker: GhostPay branch-consolidation continuation; sequential scoped CI reproduction and repair; no independent reviewer assumed.
Branch: `fix/ghostpay-browser-selfchecks-optionals-r13-20261121`; immutable parent #395 head `1edc524e69554e4a45017858c7e3e25c46dae419`, latest main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths on **this isolated child only**: `apps/web/src/lib/browserChecks.ts`, `apps/web/src/lib/browserChecks.test.ts`, `docs/handoffs/BROWSER_SELF_CHECK_OPTIONAL_TYPE_R13_20261121.md`, append-only ownership entry here.
Finding: #395 Hosting kit run 44899184722 job 136831267457 fails TypeScript TS2375: under exactOptionalPropertyTypes `browserCheckEnvironment` returns `digest: undefined` / `storage: undefined` despite interface optional properties excluding explicit undefined. Beta acceptance run 44899184813 fails at Playwright server startup (exit 2), likely same build failure; not yet independently proven.
Acceptance: omit optional provider properties when unavailable; preserve fail-closed statuses and no network/custody behavior; add deterministic regression for absent WebCrypto and denied storage; require focused Vitest, typecheck, lint, build, hosted CI and independent review before merging **into #395 only**. Never take held generation-11 integration lock, merge main, deploy or release.

---

# Pages browser self-check footer — 2026-11-21

Worker: one ChatGPT implementation coordinator; independent review is not yet available.
Branch: `chatgpt/ghostpay-browser-selfchecks-20261121`, based on main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: new `apps/web/src/lib/browserChecks.ts`, `apps/web/src/lib/browserChecks.test.ts`, `apps/web/src/components/BrowserChecks.tsx`, `apps/web/src/components/BrowserChecks.test.tsx`, bounded import/footer addition to `apps/web/src/AppShell.tsx`, scoped `apps/web/src/styles/app.css` CSS, additive `apps/web/locales/{en,es,ja,ar}.json` keys, this additive ownership claim, and `docs/handoffs/BROWSER_SELF_CHECKS_20261121.md`.
Scope: startup and resumed/runtime local capability checks, displayed at the bottom of every shared browser-app view with a mobile-friendly disclosure. Distinguish checks of secure context, WebCrypto SHA-256 known answer and temporary storage round trip from independent client artifact verification, chain/funds safety and recovery guarantees. No network requests or telemetry, no wallet, key or payment changes.
Acceptance: deterministic test-first success/failure/storage-cleanup coverage; stale asynchronous run must not supersede newer result; accessible/mobile footer on all routes, all shipped locales; applicable tests/build/lint/CI must pass at final source before integration. Record skipped checks and review requirements; do not merge with unqualified or actively owned large branches.
Overlap/reconciliation: broad PR #278 touches AppShell and locales; PR #307 touches locales and CSS. Integration PR #380 owns the overarching ledger. This branch claims only scoped additive changes and must be reconciled by integration owner. No integration lock acquired and no main merge attempted.

# Solana/TRON interoperability recovery — 2026-11-21 UTC (HISTORICAL: donor claim, its branch lease is not active; superseded by the FC-03 claim at the top of this file)

Worker: `/root/chain_interop_recovery`, delegated by coordinator `5ceb6203640a-root`.
Owned branch: `recover/ghostpay-chain-interop-20261121-5ceb`.
Verified live main/base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/chain-solana/**`, `packages/chain-tron/**`,
`test-vectors/meta-address-sol-tron-v1.json`, and the three relevant CLI files
`packages/cli/src/chain-commands.test.ts`, `packages/cli/src/commands/chain.ts`,
`packages/cli/src/payment-context.ts`; additive claim and a source-pinned handoff.
Task: selectively recover existing #211 G5/G5b compatibility and safe request
construction changes, preserving exact current browser-facing adapter sources.
Current #211 head `a92658b1ef6b95ff0145b2e1933d0047d51289d5` says its workers
finished; its original branch remains reserved and unchanged. #218 remains an
open historical CLI owner, but its three relevant files match current main.
No existing PR or other worktree is modified. #369 owns separate web TRON adapter
paths, which are outside this recovery.
Acceptance: documented Solana/TRON formats and deterministic shared reference
vectors agree with the browser packages; unsupported unbound TRON construction
refuses; CLI reports the supported Solana cluster and fixed legacy-format errors.
Run corrected-source package/CLI coverage, ordinary interoperability properties,
typecheck, lint and builds. Preserve original assertions and exact donor SHAs.
Do not execute vulnerability reproductions, construct exploits or send real
payments. No contracts, fees, custody, dependencies or network policy changes.
The generation-11 integration lease remains held by `994a0d214fb9-root-r3`.
This worker has no remote-write, merge, deployment or release authority. Root
owns independent review, new owned publication and final shared integration gates.

---

# GP-BUG-13 — stop buffered TRON scan yields after cancellation (2026-11-20)

Cycle/worker: `20261120T1635Z`, one ChatGPT coordinator running sequential implementation and audit; no separate native verifier available.
Branch: `automation/20261120T1635Z/bug/tron-scan-abort` based on main commit `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
Owned paths: `packages/tron-adapter/src/scan.ts`, new `packages/tron-adapter/src/scan.cancellation.test.ts`, an additive `docs/ai/ACTIVE_WORK.md` claim, and a dedicated `docs/handoffs/TRON_SCAN_ABORT_20261120.md`. No other files are claimed.
Evidence: GP-BUG-13/MC-01 in existing read-only bugcheck PR #312; abort during iteration of a buffered page permits a second matched payment after signal cancellation. Prior audit exercised two synthetic native payments without network access on main/integration.
Acceptance: preserve all valid native and TRC-20 detection, validation and pagination; return typed `ABORTED` rather than any further result after cancellation, including after delayed page or receipt readbacks and between same-page yields; add deterministic test-first Vitest regressions, with no real RPC/network or private keys; keep no-fee/non-custodial Pages behavior. No new dependencies, policy changes or contract edits.
Ownership reconciliation: current integration PR #307 does not change TRON adapter scan source/tests; broad PRs #278/#262/#264 own `scan.test.ts` but not the `scan.ts` production file. Use a new focused test file to avoid their test ownership. Recheck all heads before any future integration. The durable integration lock is **held by another coordinator at generation 8**; do not acquire, update its metadata, or merge into main.
Verification: run focused tests and applicable CI when available; record every not-run check and independent review requirement. Preserve unfinished work on a draft PR.
# Cycle 20261120T1840Z — receipt archive identity (isolated)

- Coordinator/worker: one ChatGPT assistant, sequential implementation, bug audit, and source review. No separate native verifier available; no independent approval claimed.
- Branch: `automation/20261120T1840Z/bug/receipt-archive-identity`; frozen main base `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Source owner: `apps/web/src/components/ReceiptPanel.tsx` plus **new** `apps/web/src/components/ReceiptPanel.archive.regeneration.test.tsx`; additive section in this registry; `docs/handoffs/RECEIPT_ARCHIVE_IDENTITY_20261120.md`.
- Finding: existing GP-BUG-01 / COMP-OPEN-01 from audit PR #312; signing receipt B after clearing invoice binding can inherit receipt A's `archive=done`, and an in-flight archive of A can claim completion on B. Baseline verified from source; prior audit recorded a failing signed-receipt component reproduction. No payments or keys outside synthetic/test scope.
- Dependencies and ownership: broad PR #307 and earlier #278 change receipt source for printing and validation; do not change their branches. This narrow branch targets main, must be reconciled with their newer print code by the integration coordinator. Inspected open PR #321/#325/#331 and the latest issues. Integration metadata `automation/ghostpay-integration-lock` was released generation 8 at claim; no protected integration/merge authorized.
- Acceptance: test first for both completed-A-before-B and delayed-A-finishes-after-B; real signed A/B signatures differ; B's Archive button remains available; delayed A cannot mark B archived; immutable A stays associated with its own vault write. Do not alter archive/policy data, custody, signing, error messages, dependencies, contracts, workflows, protection or deployment.
- Verification gates: focused original Vitest, web TypeScript/lint and exact-head hosted CI plus independent review required before merge. Local checkout may be unavailable because GitHub DNS is blocked; never claim an unexecuted suite passed.
# Cycle 20261120T2036Z — BTC silent-payment preview network guard (isolated)

- Coordinator/worker: ChatGPT automation cycle 20261120T2036Z; sequential consolidation, test-first bug repair, source audit, and handoff. No independent native subagent available and self-review is not an independent approval.
- Branch: `automation/20261120T2036Z/bug/btc-preview-network`; base main `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Owned paths: `packages/btc-silent-payments/src/spend.ts`, new `packages/btc-silent-payments/src/spend.preview.network.test.ts`, additive `docs/handoffs/BTC_PREVIEW_NETWORK_20261120.md`, and this additive claim.
- Finding: GP-BUG-17 / BTC-SPEND-API-1 from audit #312: `previewSweep` accepts a correctly encoded silent-payment address belonging to the opposite Bitcoin network while transaction signing rejects it. Public-input API mismatch; existing browser checks the address before preview, so no browser funds-loss claim.
- Acceptance: failing regression on pinned main for wrong-network testnet and mainnet silent payment destinations, valid matching-network previews unchanged, strict address decoder called before fee/amount return, no change to signing, fee policy, custody, RPC, contract or deployment; exact-head repository Vitest/typecheck/lint and independent verification before integration.
- Current ownership/dependencies: main `aa3df1cb37274fae73af0ca957183c15c51b62d3`, broad #278 and #307 retain BTC source; #330 ancestry census is not a semantic clearance. Recent PR #334 owns `packages/metadata-hardening/src/btc.ts`, not this module; no PR search hits for `GP-BUG-17` / `previewSweep`. Integration metadata ref `automation/ghostpay-integration-lock` read as released generation 8, not acquired; no shared merge planned.
- Execution: GitHub connector available; local `git ls-remote` fails DNS for github.com. Tests are not claimed as executed until actually run. Preserve this branch and exact source evidence for successor verification.
# Hygiene evidence test lint repair — 2026-11-20 (Pacific)

Worker: `/root/hygiene_lint_repair`, delegated by coordinator `9a4ab6c3d117-root`.
Branch: `test/ghostpay-hygiene-lint-20261120-9a4ab6`.
Exact source/base: existing authoritative PR #339 at `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4`.
Live discovery: `main` remains `aec179910c39081d820396409ff3139ff2264132`; integration PR #307 remains `5a745d4b5fba69b66a9779f88aefc63c253a4f27`; #339's branch still points to the exact base. Independent evidence worker `hygiene_qualification` owns source-preserving qualification of that base and reported seven typed-ESLint errors in the existing evidence-boundary test.
Owned paths: only `packages/hygiene/src/verify.evidence-boundary.test.ts`, additive content in this registry, and new `docs/consolidation/autonomous-20261120-9a4ab6/HYGIENE_LINT_*` evidence. This isolated stacked correction preserves #339's ownership and history; it does not claim or change that shared branch.
Acceptance: remove only unnecessary type assertions and replace the no-await async RPC fixture with an equivalent promise-returning fixture; preserve every existing assertion, test case, production source, configuration, dependency, timeout and coverage threshold. Run original package lint, unchanged full coverage and typecheck on the corrected source with explicit dependency provenance. Original source-preserving package build may be reused because production sources/build inputs remain identical; document that boundary. Record actual failures and passes. Obtain independent source review before coordinator publication/integration.
Coordination: the evidence-only worker released its heavy-job slot after original build passed. No shared integration lease, source branch, deployment, release or live financial action. No remote writes by this worker.
Status: correction `5c0b698a16a9b3303357a90b4e80d674b8da3c0b` passes original typed lint, all 149 unchanged coverage tests and package typecheck. Original build evidence is reused only because every build input is unchanged and the changed test is excluded. Lossless results and exact source/dependency provenance are in `HYGIENE_LINT_*`; independent coordinator source review approved exact correction `5c0b698a`; publication and composed-head hosted CI remain pending. No remote writes.

---
## GP-BUG-02 receipt and bill print integration — 2026-11-23

- Coordinator: Codex engineering continuation. Branch: `codex/ghostpay-receipt-print-integration-20261123`.
- Base: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Integrate #316 at `e0c583be2514b44af7f3b15619fb8160358f1470` without changing its branch. Preserve both ACTIVE_WORK logs.
- Scope: original print hook, bill/receipt UI and styles, tests, and the integration note. Acceptance: selected bill or receipt renders alone in both Pages browser profiles, controls and sensitive output remain hidden, screen rendering remains intact. Run the original regression coverage and exact-head web, CI and Pages checks.
- Coordination: #504 overlaps ReceiptPanel.tsx and app.css. Its archive behavior must survive eventual composition. Recovery #372 already contains #316. No new change to their source, reserved features, releases or deploys.

## GP-BUG-02 second receipt browser qualification

- Worker: Codex. Branch `test/receipt-print-action-532` stacks on #532 at `51c04326ff9258861621b94ce2ab06f44bba8301`. Observed main at `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Owned paths: `apps/web/e2e/print-targets.spec.ts`, the verified-payment fixture in `apps/web/e2e/flowMocks.ts`, and this entry.
- Acceptance: with two signed receipts and an unselected bill mounted, click the second receipt's Print receipt button. Its transaction must be visible in print media while the first receipt and bill are hidden in both full and lean Pages profiles.
- Follow-up QA by Codex on #548, from `92b36b3fb7f9d26650b026fc77329112f0251f77`. Extend this qualification with repeatable print selection, cancellation and target replacement sequences, and inspect actual Chromium PDFs. Scope includes the print-target hook tests, print CSS and browser regression when an output defect is reproduced.

# Receipt print isolation continuation — 2026-11-20

Worker: ChatGPT lead `/root`, with independent `print_isolation_review` worker.
Branch: `fix/receipt-print-isolation-312-20261120`.
Base: PR #316 `56b76e8fbae0aa0d3e9c9394616d4aa600d70fb7`, based on main
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; original finding GP-BUG-02 in #312.
Owned paths: `apps/web/src/styles/{app,print}.css`, printable bill/receipt component
print wiring and focused tests, a shared print-target lifecycle helper and its tests,
`apps/web/e2e/print-targets.spec.ts`, this additive registry entry and the existing
`docs/handoffs/RECEIPT_PRINT_TARGETS_20261120.md` continuation.
Acceptance: reproduce the original invisible receipt in Chromium print media;
select only the clicked receipt or bill; exclude other receipts, wallet UI, receipt
JSON/actions and secret QR; clean up after print/cancel, exceptions and unmount;
preserve normal screen output; pass focused regression tests, typecheck, lint,
static Pages build/bundle checks and independent review. Preserve the prior PR's
history and inspect its live head before publishing a continuation. No deployment,
contract, dependency, fee, wallet/signing or unrelated feature changes.
Status: implementation and independent source review complete; 53 focused tests,
typed lint, original-head regression comparison, lean Vite/bundle scan and secret
scan passed. Final hosted browser/typecheck/full CI remain pending; local Chromium
was socket-blocked and full-web TypeScript exited 137. Existing PR #316 hosted
CI/Pages/Beta acceptance/Hosting kit are green only at the starting base.

# Receipt/bill print-target isolation — 2026-11-20T12:41Z

Worker: ChatGPT automation cycle 20261120T1241Z, sequential implementer/auditor (no independent worker available).
Branch: `automation/20261120T1241Z/bug/receipt-print-css`; exact main base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/src/styles/print.css` and new `apps/web/e2e/print-targets.spec.ts`, plus a source-pinned `docs/handoffs/RECEIPT_PRINT_TARGETS_20261120.md` and this additive ownership entry. Do not modify adjacent active source branches.
Evidence: GP-BUG-02 in PR #312, independently source-confirmed; `print.css` applies `body * {visibility:hidden!important}` globally whereas `app.css` receipt override lacks `!important`. A bill sheet is mounted only during bill printing; a receipt print target is otherwise suppressed.
Acceptance: reproduce both print modes with print-media computed styles in a browser fixture; ensure receipt is visible without a bill, bill is visible without a receipt, and bill remains exclusive when both exist; all other UI stays print-hidden; retain sensitive-data print restrictions; source review against exact main files; run available tests or record unexecuted checks; preserve the branch as draft pending hosted qualification and separate review. No contracts, workflows, dependencies, Pages settings or deployments.
Status: implementation and six print-media fixture cases committed. Exact-source static/PostCSS syntax checks passed; repository Playwright, typecheck, lint, hosted CI and independent verification remain outstanding. Lock metadata is separate; no shared integration or protected-main merge attempted.

# Main unique-code consolidation — 2026-11-19 (Pacific)

Worker: `150ffd7f8079-root`, with independent `prior_consolidation`, `release_review`, and `latest_fixes_review` source reviewers.
Branch: `integration/ghostpay-main-unique-code-20261120`; base main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
User authorization: consolidate branches with unique code into GhostPay main.
Owned paths: additive branch provenance under `docs/consolidation/main-unique-code-20261120/`, this additive registry, and exact reviewed source/test contributions from PRs #279, #280, #281, #282 and #285. Preserve every existing registry section and donor parent. PR #267 was separately merged after exact-head checks passed.
Acceptance: compare donor source blobs and ancestry; retain all current main files except the five reviewed independent fixes; validate the combined candidate with existing CI; merge only qualified changes. Preserve blocked broad donors, runtime/payment safeguards, deployment triggers, dependency versions and security gates. No branch deletion or force update.
Execution: local executor unavailable; use connected GitHub source/CI tools. No local test execution is claimed.
Status: ownership recorded before source integration; integration lease generation 7.

---

# Pages multipart QR malformed Unicode guard — 2026-11-19

- Cycle/worker: `20261119T124337Z` / single ChatGPT coordinator with sequential bug, audit and documentation phases; no parallel or independent verifier available.
- Branch: `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard`; base `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `apps/web/src/lib/qrMultipart.ts`, `apps/web/src/lib/qrMultipart.test.ts`, this isolated claim and `docs/handoffs/QR_MULTIPART_SURROGATE_20261119.md`.
- Discovery: single QR `makeQr` rejects unpaired UTF-16 surrogates, but multipart `TextEncoder` silently replaces them with UTF-8 U+FFFD. Node 22 reproduction: `\uD800` encodes as `EF BF BD` while valid astral pairs round-trip unchanged.
- Acceptance: test-first rejection of isolated high/low surrogates and mixed strings by `toMultipart` and `multipartIfNeeded`; valid paired Unicode text still encodes and decodes; no QR/format/protocol change for valid payloads; no dependencies added; exact-head CI and separate review before merge.
- Coordination: inspected changed-file inventories of active PRs #238, #240, #243, #244, #246, #249–#252, #254–#256, #258, #260–#262, #264–#265, #267–#278; neither owned QR file appeared (bounded sample, not an exhaustive review of all open PRs). Broad #278 and recovery integration remain externally owned. Metadata lock generation 3 observed released at `6408563f55081ee941c2036086c025ebf63d2c96`; no shared lock acquired, no merge planned.

---

# 2026-11-19 · Fail-closed runtime build profile guard (isolated)

Coordinator and implementer: one ChatGPT assistant, sequential phases; no independent verifier spawned.
Cycle: `20261119-c977`; isolated branch: `automation/20261119-c977/bug/build-profile-failclosed`.
Base observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: `apps/web/src/lib/buildProfile.ts`, `apps/web/src/lib/buildProfile.test.ts`, this append-only claim, and isolated `docs/handoffs/BUILD_PROFILE_FAILCLOSED_20261119.md`.
Dependency/ownership: active consolidation PRs #246/#262/#264/#278 and QR #279 checked; none changes the two source/test paths as of branch creation. Existing metadata integration lock is released generation 3. The external GhostPay automation has a concurrently in-progress run; no integration or shared-ledger writes authorized for this branch.
Finding: `resolveProfile` narrows when exactly `lean`, but unexpected runtime values (outside the TypeScript union) are treated as `full` when all other values are `full`. This differs from the fail-closed `profileFromDefine` logic. No real-world exploit established.
Acceptance: test first; invalid explicit/shell/build values must resolve to lean, normal 3-source truth table unchanged; no feature widening, dependencies, workflows or build setting changes; record actual test execution and CI constraints; independent verification needed before merge.

---

# Run 20261119T1640Z — privacy-set 30-day coverage correctness

Worker: one ChatGPT coordinator, with sequential implementation and audit phases; no independent subagent.
Base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`; isolated branch: `automation/20261119T1640Z/bug/scan-privacy-partial-30d`.
Owned paths: `apps/web/src/lib/scanSpam.ts`, new `apps/web/src/lib/scanSpam.partial.test.ts`, and `docs/handoffs/SCAN_SPAM_PARTIAL_30D_20261119.md`. The claim is recorded here before source edits.
Finding: `anonymitySet()` reports 7-day and 30-day public announcement counts but calculates `partial` from only the 7-day lower bound. If a scan began ten days ago, the 30-day displayed count is incomplete yet the warning is absent.
Acceptance: a test that fails on baseline for incomplete 30-day coverage; 7-day/30-day counts remain unchanged; the `partial` flag marks incomplete 30-day history and gaps to head, but does not spuriously mark full available genesis history incomplete. Run available focused checks and report exact limits; avoid changing privacy policy, protocol, network access or real funds.
Dependencies/ownership: checked active #278/#264/#246/#238/#244/#251/#248/#249/#222/#219/#250/#269/#270/#279/#280 changed-file inventories; none owns `scanSpam.ts` or new focused test. Recheck before PR. The metadata integration lock was last observed released generation 3; no protected integration requested.
Status: claimed; implementation pending.

---

# Merchant key-pin strict JSON hardening — 2026-11-19 cycle 20261119T183817Z

- Worker: one ChatGPT operator (sequential source, test, and audit phases; no independent subordinate).
- Task branch: `automation/20261119T183817Z/bug/merchant-pin-duplicate-json`.
- Base `main` SHA: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned files: `apps/web/src/lib/merchantIdentity.ts`, `apps/web/src/lib/merchantIdentity.test.ts` and an isolated handoff `docs/handoffs/MERCHANT_PIN_STRICT_JSON_20261119.md`.
- Finding: ambiguous persisted signer-pin JSON (duplicate `v` or `signer` members) is accepted by `JSON.parse` as its final key value, despite the trusted-pin fail-closed contract. This is defensive local-storage validation; no remote compromise or fund-loss exploit claimed.
- Acceptance: reject duplicate-key and forbidden-key pin records as `unavailable`, never silently treat them as `absent`; valid persisted pins continue to be read, saved and removed; regression committed before source repair.
- Dependencies: reuse existing exported `parseStrictJson` (invoice-schema), no protocol/schema changes.
- Ownership check: open PRs including #238, #246, #262, #264, #278 and all current work listed through #281 inspected for these two files; none claimed them. Recheck heads before integration.
- Integration metadata ref remains outside this branch. No shared ledger or protected-branch update authorized from this worker.

---

# QR kind handling fail-closed — 2026-11-19 cycle 20261119T204728Z

- Worker: one ChatGPT coordinator, sequential implementation and read-only audit phases (no independent subagent; not independently approved).
- Task branch: `automation/20261119T204728Z/bug/qr-kind-failclosed`; exact base main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `apps/web/src/lib/qrKinds.ts`, `apps/web/src/lib/qrKinds.test.ts`, `docs/handoffs/QR_KIND_FAILCLOSED_20261119.md`, and this additive ownership claim only.
- Evidence: `kindForPayload` looks up a runtime key in a regular JavaScript object; for unknown keys it can return `undefined` or inherited properties such as `constructor`, while `unverified: true` can classify an unknown payload as caution. `qrKindClass` constructs arbitrary classes for unknown kinds.
- Acceptance: reject unrecognized runtime payload types and frame kinds before returning handling policies or CSS; preserve all valid QR kind/rule behaviors and print policy; commit a failing regression first, then fix; execute bounded Node proof and report exact CI and independent review gaps.
- Ownership: core active PRs #238/#243/#246/#251/#252/#255/#258/#261/#262/#264/#265/#268/#270/#274/#278/#279/#280/#281/#282 were inspected for these files; no direct overlap observed. Recheck at merge. No other branch or shared integration updates.
- Status: claimed; no merge, deployment, release, or production change authorized from this isolated worker.
# Cycle 20261120T1600Z — PR317 exact-head regression repair

Worker: one ChatGPT implementation/verification lane; no concurrent independent verifier.
Branch: `automation/20261120T1600Z/bug/scan-tags-session-lifecycle`, based on PR #317 head `1e9c5bd40c3d7c0a67564c8598f5cf4fbd7c1ceb`; target is PR #317 owner, not main.
Owned paths: `apps/web/src/views/Scan.tsx`, `apps/web/src/views/Scan.tags.scope.test.tsx`, and a cycle-specific handoff. No other PR files claimed.
Evidence: [CI run 44756638658](https://github.com/djshellshoxxx/GhostPay/actions/runs/44756638658) shows the branch's new session-replacement test failing (requires fresh session re-unlock), pre-existing L1-04 error announcement disappearing after keyed remount, and lint `require-await` at test line 100.
Acceptance: preserve immediate no-stale-tag display and chain switching; preserve the L1-04 locked-vault/error assertion after pending unlock invalidation; require new-session re-unlock before loading tags; remove lint violation without relaxing assertions. Hosted exact-head CI and independent review before merging.
Integration lock observed released generation 7, not acquired; PR #278 owns overlapping broader Scan work and must be reconciled by its coordinator. No main changes or deployment.

---

# Focused hosting main reconciliation — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-hosting-main-reconcile-20261119`.
Starting PR #267 head: `c3a693e87053fbe91219f8edfe159a5ec0a37a34`.
Qualified main input: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: additive `docs/ai/ACTIVE_WORK.md` reconciliation and new evidence under
`docs/consolidation/hosting-timestamp-reconciliation-20261119/`. Incoming qualified
main source/test changes are preserved exactly; no runtime source or gate edits.
Acceptance: first preview merge conflicts; preserve main and focused ancestry;
retain all existing ownership sections; keep the complete 80-file hosting-kit tree
and its three reviewed timestamp source/test blobs exact; inspect the full resulting
source/config diff and run only checks needed for a concrete reconciliation risk.
Historical hosted kit/browser outcomes remain pinned to the earlier checkout;
new-head CI/build/browser qualification is coordinator-owned and remains pending.
No remote writes, force operations, mainnet, deployment or parallel heavy checks.
Status: claim recorded before merge; merge-tree preview found only this registry.

# Focused hosting timestamp promotion — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-hosting-timestamp-main-20261119`.
Base: `14ded337a10c140d7a9f9a9238ec038587d925bb`, independently verified as GitHub main.
Owned paths: the three reviewed source/test files from
`38fe7fdaf151ef433be9721af8fea7cbcdea89c4` under `tools/portable-hosting-kit/`,
the unchanged historical evidence in `docs/consolidation/hosting-timestamp-20261119/`,
new provenance in `docs/consolidation/hosting-timestamp-main-20261119/`, and this
additive claim. Acceptance: cherry-pick the exact reviewed fix without importing
feature-candidate ancestry; verify all three blobs and the complete kit tree match
the tested product; preserve every prior main claim; identify differences in root
configuration/lockfiles and record evidence limits honestly. Obtain independent
recovery-worker review. No other runtime, dependency, workflow, threshold, deployment
or remote changes. The coordinator owns publication and hosted qualification.
Status: exact `-x` cherry-pick product `f4464e57bc6743800c2564ddb71bb5b06f64eb35`;
complete kit tree and three product blobs equal the reviewed original. Historical
evidence copied byte-for-byte; root lock differences remain explicit. Recovery-worker
source review found no introduced blocker. No new runtime replay is claimed.
Provenance: `docs/consolidation/hosting-timestamp-main-20261119/PROVENANCE.md`.

# Automation cycle 20261119T2243Z — strict base64url decoder runtime input

- Worker: one ChatGPT operator (development, separate read-only audit and integration review sequentially; no independent subagent).
- Isolated branch: `automation/20261119T2243Z/bug/base64url-runtime-input`; baseline `main` `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `packages/invoice-schema/src/base64url.ts`, `packages/invoice-schema/src/base64url.test.ts`, and `docs/handoffs/BASE64URL_INPUT_TYPE_20261119.md`; this claim is appended to `docs/ai/ACTIVE_WORK.md` on this branch only.
- Reproduction: public strict decoder accepts a numeric value as empty bytes (and array-like objects can supply length/charCodeAt); non-string input is outside its contract. A null value raises a native TypeError rather than fixed Base64UrlError.
- Acceptance: all non-primitive-string values fail with `Base64UrlError`, including number, undefined/null, arrays, boxed strings and array-like objects; canonical valid inputs and existing test vectors unchanged. No secret-bearing error messages or protocol change.
- Ownership: sampled open #238/#262/#264/#265/#268/#269/#270/#278/#285; none list direct modification of base64url files. Recheck live heads before integration. Never edit other workers' branches.
- Dependencies: existing invoice schema test package, no new dependency. Full exact-head hosted CI and independent review required; no shared integration lock acquired, no main merge.
# Browser amount parsing boundary — 2026-11-20T02:43Z (isolated cycle)

Worker: one ChatGPT engineering worker acting sequentially (no independent native verifier available).
Branch: `automation/20261120T0243Z/worker/format-units-validation`.
Exact main base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`; source blob `apps/web/src/lib/format.ts` `18dad7e4235c922bb7f197312317cc86557a12c2`.
Owned paths: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`, and a new task-specific handoff. The only shared file modified is this branch-local, additive claim.
Problem: exported `parseUnits` returns a huge base-unit amount for unsupported decimals 37, and throws native RangeError/TypeError for fractional decimals or non-string inputs, contrary to its documented undefined-on-unexpected contract. Node 22.16 reproduced on an exact blob-matched local copy. Normal typed callers are not alleged to exploit this.
Acceptance: bad runtime decimal parameters and non-string inputs return undefined; valid 0..36 decimal parsing remains byte-/value-compatible; tests committed before production fix, followed by focused execution and TypeScript checks when feasible. No amount-policy, transaction, wallet, cryptography, dependency, workflow, release or gate changes.
Ownership: manual privacy coordinator owns issue #286 / PR293 and generation-6 repository lock; #278 is active broad integration. This lane touches neither and will not integrate into shared branches or main. Recheck owner/CI before any future integration.

---
# Cycle 2026-11-20T04:34Z — ERC-20 simulation return-value validation

- Coordinator/worker: ChatGPT scheduled engineering cycle, sequential bug implementation/audit; no independent verifier asserted.
- Branch: `automation/20261120T0434Z/bug/erc20-simulation-result`, base/main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, owned paths: `apps/web/src/lib/txGuard.ts`, `apps/web/src/lib/txGuard.test.ts`, `docs/handoffs/ERC20_SIMULATION_RESULT_20261120.md` and this additive claim.
- Existing dependencies: draft PR #278 (consolidation), PR #302 (QR/receipt fixes), PR #293 (privacy); none of their inspected changed-file inventories touches `txGuard.ts` or its test. Recheck heads before any integration.
- Context: external coordinator holds integration lock generation 6 (ref `automation/ghostpay-integration-lock`, observed SHA `2b4f3327fdcda482e919c0c68595e32f345d0dba`). This cycle must not alter integration/main or the metadata-only lock.
- Finding: `simulateCall(..., expectBool=true)` treats an arbitrary even-length hexadecimal return or noncanonical ABI Boolean (e.g. 32-byte word 2) as successful. The API promises 'unavailable' for unrecognized responses and a fixed error for canonical encoded false.
- Acceptance: failing regression for noncanonical Boolean payloads; preserve canonical false refusal, canonical true success and legacy empty response acceptance; scope limited to advisory dry-run result classification, no payment policy/contract changes; targeted checks and independent approval still required for merge.
- Status: task branch created before implementation; integration/deployment prohibited.

# Automation cycle 20261119T2243Z — strict base64url decoder runtime input

- Worker: one ChatGPT operator (development, separate read-only audit and integration review sequentially; no independent subagent).
- Isolated branch: `automation/20261119T2243Z/bug/base64url-runtime-input`; baseline `main` `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `packages/invoice-schema/src/base64url.ts`, `packages/invoice-schema/src/base64url.test.ts`, and `docs/handoffs/BASE64URL_INPUT_TYPE_20261119.md`; this claim is appended to `docs/ai/ACTIVE_WORK.md` on this branch only.
- Reproduction: public strict decoder accepts a numeric value as empty bytes (and array-like objects can supply length/charCodeAt); non-string input is outside its contract. A null value raises a native TypeError rather than fixed Base64UrlError.
- Acceptance: all non-primitive-string values fail with `Base64UrlError`, including number, undefined/null, arrays, boxed strings and array-like objects; canonical valid inputs and existing test vectors unchanged. No secret-bearing error messages or protocol change.
- Ownership: sampled open #238/#262/#264/#265/#268/#269/#270/#278/#285; none list direct modification of base64url files. Recheck live heads before integration. Never edit other workers' branches.
- Dependencies: existing invoice schema test package, no new dependency. Full exact-head hosted CI and independent review required; no shared integration lock acquired, no main merge.

---
# Pages artifact verifier race repair — 2026-11-19

Worker: `clock_hosting_review`, assigned by the consolidation coordinator.
Branch: `repair/ghostpay-276-artifact-races-20261119`.
Parent: PR #276 `f39a9dd36c09f8b02d937c5f3d19676d334976d6`.
Owned paths: `scripts/pages/verify-pages-artifact.mjs`, its original test file,
this additive claim, and `docs/handoffs/agents/PAGES_ARTIFACT_RACE_REPAIR_20261119.md`.
The original PR #276 branch remains read-only. This isolated follow-up retains
all six parent test groups and its original producer/workflow behavior.
Acceptance: reproduce the commit-read and symlink-swap false successes before
repair; parse commit metadata from the bytes whose hash passed; reject observed
file/inventory changes with validated regular-file descriptors and no-follow
opens; verify failure cleanup and the documented stable-input/platform boundary.
Coordinator-authorized review extension: reject directory-entry and manifest
bytes that do not round-trip through UTF-8, retaining valid Unicode filenames.
Run only dependency-free Node tests and source checks, obtain independent review,
and publish a draft with exact source/test pins. No real artifact, hosted CI,
deployment, main integration, or arbitrary concurrent-filesystem immunity claim.

# Historical security promotion — 2026-11-19

Worker: `history_census`; branch: `integration/ghostpay-historical-security-promotion-20261119`.
Base/main: `e454de6abfefda70d82784fafc1d8949b277c334`.
Owned integration: exact PR245 `baa032547a16196005dccc30a247acd55d4f62c6` and
PR247 `20207a930336da95e78ad1d6f4987b3c74fc535a`, preserving both source parents,
all ownership claims and their existing evidence. Resolve registry append collisions only;
the focused main does not contain the broader master scanner changes.
Optional source-only guard: the two net-harness source/test hunks from PR253
`303ba1114fd78426162c4728f1778f66d64088f4`, excluding its major dependency train.
Acceptance: merged pool helpers/witness fixtures and AST source scanner equal reviewed
candidate source; untouched main content remains intact; bounded affected checks and
exact dependency provenance recorded. No circuit, contract, protocol, release or gate change,
no active source-branch overwrite, no remote mutation. Coordinator owns final publication/CI.

# Historical pool repair main reconciliation — 2026-11-19

Worker: actions_repair, assigned by the pre-merge reconciliation coordinator.
Branch: `repair/ghostpay-history-pool-values-20261118-local`.
Starting local head: `a85896ab6bb1b60eee9c9ad4ddc0e43d9ede9645`; reviewed tree:
`7f85edb78d56c9c981ba1bc3745c3f3ccbeb07d8`. Merge target: main
`e454de6abfefda70d82784fafc1d8949b277c334`, independently observed after PR #242 merged.
Owned scope: this additive claim, preservation of the existing pool repair while
merging current main, and scoped validation evidence. Preserve both source histories,
all ownership sections, and the reviewed pool implementation/test blobs. Run the
19 helper tests on Node 22 and obtain independent integration-diff review. Source
conflicts require inspection; publication and hosted qualification remain coordinator-owned.

# Historical scanner repair main reconciliation — 2026-11-19

Worker: actions_repair, assigned by the pre-merge reconciliation coordinator.
Branch: `repair/ghostpay-history-scanner-20261118-local`.
Starting local head: `3db24b5496a2d1979a55757a2b83eb8dd362614b`; reviewed tree:
`96e15f7544b592bac8da065ad64188f56b0d9f4d`. Merge target: main
`e454de6abfefda70d82784fafc1d8949b277c334`, independently observed after PR #242 merged.
Owned scope: this additive claim, preservation of the existing AST scanner repair
while merging current main, and scoped validation evidence. Preserve both source
histories, all ownership sections, and the reviewed scanner implementation/test blobs.
Run all 88 scanner/privacy tests on Node 22, scan the resulting eligible production
sources, and obtain independent integration-diff review. Source conflicts require
inspection; publication and hosted qualification remain coordinator-owned.

# Automation cycle 20261119T095600Z — merchant profile clock validation

Worker: single ChatGPT implementation phase (no parallel independent verifier).
Branch: `automation/20261119T095600Z/bug/merchant-profile-clock`.
Base main SHA: `14ded337a10c140d7a9f9a9238ec038587d925bb`.
Owned source: `packages/invoice-schema/src/merchantProfile.ts`, `packages/invoice-schema/src/merchantProfile.test.ts`; cycle-specific handoff only.
Finding: GP-AUD-208-01 in draft PR #266; signed profile may bypass expiry when caller provides NaN/undefined.
Acceptance: valid signed profile rejects invalid clocks deterministically; finite valid clocks preserve existing expiry boundaries; test is committed before implementation; run available checks and report unexecuted checks. Do not alter cryptographic signature or invoice formats.
Dependencies: audit #266; PR #265 owns separate json canonicalization. No shared integration lock acquired or merges authorized from this worker.
# R68 independent invoice-expiry scheduler test qualification — 2026-11-23 UTC

Worker: GhostPay branch-consolidation engineer, source-pinned read-only audit of owner PR #274 with isolated test-only contribution.
Source/PR base: `automation/20261119T104800Z/bug/jitter-expiry-rollback` @ `a4c6f945adef0438bfd0b347fb7c11057e3973ce`. Target branch: `audit/ghostpay-r68-jitter-expiry-qualification-20261123`.
Owned paths: new `apps/web/src/lib/jitter.expiry-qualification.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, new `docs/consolidation/20261123-r68/JITTER_EXPIRY_REVIEW.md` only. Existing `jitter.ts` and `jitter.test.ts` belong to PR #274 and MUST NOT be edited on its owner branch.
Acceptance: deterministic targeted Vitest cases covering fractional monotonic invoice-expiry boundary after wall rollback, direct Send-now, forward-wall expiry and nonfinite clocks; no network, funds, secret or signing activity. Run exact-head hosted checks. Independent browser/payment and approval gates still apply.
Important unresolved question: PR #274's `ready` status is terminal and does not re-evaluate invoice expiry after readiness. Owner notified at https://github.com/djshellshoxxx/GhostPay/pull/274#issuecomment-7106602537; source owner must decide contract. Test-only contribution does not claim to repair stale-ready behavior.
No main merge, owner-file overwrite, force-push, deployment or release.

---

# Cycle 20261119T104800Z — browser jitter expiry clock rollback (isolated)

Coordinator: ChatGPT direct GitHub connector; execution one sequential assistant, no second independent reviewer/subagent.
Worker/role: bug repair and regression author.
Branch: `automation/20261119T104800Z/bug/jitter-expiry-rollback` (base main `14ded337a10c140d7a9f9a9238ec038587d925bb`).
Owned paths: `apps/web/src/lib/jitter.ts`, `apps/web/src/lib/jitter.test.ts`, `docs/handoffs/JITTER_EXPIRY_ROLLBACK_20261119.md`; claim on this branch only.
Dependencies: current `main`; #246/#262/#264 and recent focused #269–#272 inspected for modified-path overlap (none of these touched jitter source/tests). No other active worker's branch will be edited.
Acceptance: a scheduled invoice must not become ready solely because the system wall clock moves backward while a monotonic delay elapses; normal waiting/ready/expired/cancel behavior and sendNow behavior preserved. Commit regression test first, then minimal implementation; report actual checks and exact-head hosted gates.
Out of scope: money movement, backend, contracts, relayer, production deployment, UI policy or product decisions. No shared integration/ref update/merge without valid lock ownership and required independent verification.
Status: regression committed first at `2b7cedbd`, repaired at `dbe6e975`, and source-blob-identity Node verification passed (two RED-on-base/GREEN-on-fix scenarios, seven existing controls); isolated source TypeScript check passed. Repository Vitest/lint/build, exact-head hosted CI and independent verification remain pending. See `docs/handoffs/JITTER_EXPIRY_ROLLBACK_20261119.md` (handoff commit `3503075a`).

---

# Bitcoin spent-output/private-scan completion — 2026-11-18

Worker: ChatGPT coordinator and three independent engineering/review lanes.
Branch: `chatgpt/btc-spent-private-scan-20261118`.
Base: initial main `dfc75ef2087fa6463ae59e0818abec01796c578d`, combined with unchanged PR #219
`9617e8572f9bc414410bd937b0e7718d0c5bd55c` at `e27ce7f60fb0e21788f09df0f188b3b3490bcad2`.
Integrated main `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` after independent compatibility
review; only this registry overlapped, and both ownership records are preserved.
User explicitly authorizes continuation of #219 only; PR #238 overlaps BTC paths and remains a read-only
comparison/dependency. PR #235 seller checkpoint architecture and other feature owners are out of scope.

| Lane | Owned paths | Acceptance |
| --- | --- | --- |
| btc_state | `apps/web/src/features/btc/scan.ts`, Bitcoin scan/state regressions; `packages/btc-silent-payments/src/scan/{scanner,state,resume}*` as needed | Reproduce/fix incomplete evidence, historical, persisted-match and reorg defects; preserve status contract and bounded local scans; no provider checks without consent. |
| btc_ui | `apps/web/src/features/btc/BtcView*`, `scanWorker*`, `scan.worker.ts`, Bitcoin e2e; BTC-only locale/security-key additions | Explicit/revocable consent, light-mode constraint, stale-session rejection, accurate unknown/incomplete UI and deterministic browser acceptance. |
| btc_review | Read-only scanner/source/worker/privacy audit; `docs/handoffs/btc-spent-20261118/INDEPENDENT_REVIEW.md` | Independently identify/reproduce source defects and review final fixes, source-pin evidence; no external-audit claim. |
| coordinator | Bitcoin Esplora/oracle/header source safeguards and regressions; `docs/ai/ACTIVE_WORK.md`, `docs/handoffs/btc-spent-20261118/*`, Spec 12/BTC deviations/user docs | Acceptance matrix, preserve #219 work, qualified integration, bounded validation and performance evidence, reviewable PR. |

No main merge, deployment, publication, transaction signing/construction changes, unrelated dependencies,
contracts, general checkpoint architecture, or broad consolidation. Tests retain all release gates.

# Browser network isolation: unowned transport gaps — 2026-11-18

Worker: ChatGPT lead with separate transport implementer and independent privacy reviewer.
Branch: `codex/ghostpay-browser-isolation-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (live `main`).
Owned paths: `packages/net-transport/src/fetchTransport.ts`, `fetchAdapter.ts` and new focused
transport isolation tests; `packages/solana-stealth/src/rpc.ts`, `packages/tron-adapter/src/rpc.ts`
and new `rpc.isolation.test.ts` tests (chain adapter worker); `apps/web/src/lib/release.ts`, its
focused tests, a new browser network isolation spec; new machine-readable egress inventory
and scoped isolation documentation; new `scripts/tests/network-egress-inventory.test.mjs` and
independently authored `scripts/tests/network-isolation-native.test.mjs` QA. Both chain RPC files were checked against all 39 open
PRs, including new recovery #239 (`d2c64522`); no current PR changes either file.
Acceptance: reproduce and fix unintended redirect egress, cancelled/stale request dispatch,
unbounded transport failure and untrusted error disclosure in these paths; prove no fallback,
bounded failure and fixed error messages with controlled fixtures and browser requests. Record
source-pinned findings, exact checks and unresolved integration dependencies.
Status: implemented and independently re-reviewed in draft PR #241. Hosted first-head typecheck,
unit/integration suites and lean browser acceptance passed; 11 lint errors were corrected with their
adversarial assertions preserved. Final-head checks and the separately owned policy integration are
tracked in `docs/handoffs/BROWSER_NETWORK_ISOLATION_2026-11-18.md` and the PR.

Active inputs remain read-only: privacy #222 (`2bc20982`), own-node #228 (`685fe1a3`), Sweep
consent #231 (`d9ff3868`), browser fixtures #233 (`67cf835d`), integration #238 (`198aa5ba`),
recovery/keypair exports and Mythril remediation. Their UI, service policy, settings, scan,
Sweep, catalogs, consolidation ledgers and release gates are not owned by this task. The
five lower-level transport files were compared against these heads and are unchanged; this
lane extends existing adapters without a second policy engine. Recheck all heads before PR.

# Pages idle-clock integration — 2026-11-18

Worker: ChatGPT coordinator, with independent privacy-review implementation and source review.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/AppShell.tsx`, `apps/web/src/AppShell.idleClock.test.tsx`, and the idle-clock handoff.
Acceptance: reproduce clock rollback on current main, retain sleep-aware wall-time checks, add monotonic expiry,
preserve sole-copy key recovery policy, pass focused shell tests and scoped lint, then require exact-head CI.
The test file is imported from the separate review lane; product edits start after this claim. PR #209's frame and
unload changes remain on its own branch. No deployment, signing, publication, mainnet, or release-gate changes.

# Repository consolidation — 2026-11-18 (active)

Status (coordinator update): every worker lane below has completed and been integrated after review; the worker
branches were local only and are not pushed. Integrated as: specs `b20e1c98`; cigates `15c302cd`; mythril-expiry
`1fa4179f` (+ review `3f10fcaf`); tagarchive `0dda9ca1`; mythril-factory `afbce0a6` (+ review `1e1121b3`); reimport
`84b4e605` (+ `86b6e9e5`, `4a3d47d8`); echidna `81aa5e68`. Coordinator fixes: bundle scanner `b441cc64`/`5ddb042a`,
audit test `bbd24cd0`, blocked keystore download `cfb482f9`. Remaining work is coordinator-owned: final CI evidence,
census at the final head and the promotion packet. Open draft PR #204 (another session, base `main`) conflicts in
`.github/workflows/ci.yml` and `CLAUDE.md` and is not part of this consolidation.

Coordinator: Claude Code session (integration owner). Integration branch: `nodata/wizardly-allen-qwol6u`, created from
unified `beb525dd` (tree `36177d29`), main ancestry merged at `f5e10f84` (tree unchanged), Pages #200 lineage merged at
`d39e304a`. The coordinator alone owns this branch, the consolidation ledgers under `docs/handoffs/consolidation-20261118/`,
`package-lock.json`, this registry and the merge sequence. Worker branches are local task branches based on `d39e304a`;
each commits only inside its owned paths and is integrated by the coordinator after review.

| Worker branch | Owned paths | Acceptance |
|---|---|---|
| `consolidation/20261118-reimport` | `apps/web/e2e/core-journey.spec.ts`, keystore import/session lifecycle source and focused tests only as diagnosis requires | Establish the cause of the #201/#202 verified-keystore reimport timeout with synthetic secrets; minimal regression-backed fix; original stale-session assertions and #202 control both execute and pass. |
| `consolidation/20261118-tagarchive` | full-profile `TagArchive` component and its focused test | Port #193 blocked-click regression; cleanup on throwing click; success and failure messaging verified; lean bundle untouched. |
| `consolidation/20261118-specs` | `docs/specs/**`, `docs/future/privacy-architecture/**` | Integrate #190/#191; spec 18 canonical; privacy 5k corrected; unrelated future specs remain proposed. |
| `consolidation/20261118-cigates` | `.github/workflows/release.yml`, `contract-analysis.yml`, `nightly.yml`, workflow tests/runbook | Source-matched analyzer success becomes an enforced promotion condition; missing/skipped/cancelled evidence fails. |
| `consolidation/20261118-echidna` | `packages/contracts/test/echidna/**`, Echidna config/corpus/runner tests | Demonstrate >= 3 successful native policy withdrawals without lowering the threshold or weakening properties. |
| `consolidation/20261118-mythril-expiry` | new expiry-focused contract tests, expiry disposition record | Individual dispositions for the three expiry-timestamp Mythril records. |
| `consolidation/20261118-mythril-factory` | new factory-focused contract tests, factory disposition record | Individual dispositions for the eight factory/OpenZeppelin call-path Mythril records. |

Out of scope for every worker: protected-main merge, deployment, release signing/publication, Wiki publication, branch
deletion, real funds, new custody/authority surfaces, and spec 18 key-export implementation (next phase).

The ChatGPT "zero-codex" rotation automation is an active external writer on `chatgpt/zero-codex/*` branches (observed
pushes 2026-11-18 01:39-01:44 UTC). Those branches are read-only inputs here; heads are rechecked before integration.

> Current coordination status (2026-11-16): all listed source lanes have completed and their reviewed changes are integrated through `2962554d`. The claims below preserve history. Final hosted candidate qualification and development artifact verification are coordinator-owned; current gates are recorded in [the authoritative ledger](../handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md).

## Team H dedicated BTC scan worker — 2026-11-16

Worker: btc_worker, Caveman. Branch: `codex/unified-btc-worker`; base `a94989ce`.
Owned paths: BTC scan worker/client/protocol, scan.ts, BtcView and focused tests, browser acceptance, worker handoff.
Acceptance: responsive cancel through worker termination; bounded messages; ephemeral scan key copies; checkpoint acknowledgments preserve encrypted CAS commits; restored matches require fresh validation; no spend secret sent to worker or secrets sent over network/storage. No mainnet enablement or release claim.

## Team A hosted-CI reconciliation repair — 2026-11-16

Worker: ci_reconciliation agent, Caveman. Branch: `codex/unified-ci-reconciliation`.
Base: `8298fc24296194f05b686b44bec542d10276c8d3`.
Owned paths: CLI reconciliation source/test/helper files and `apps/web/src/components/ReconciliationLedger.invoices.test.tsx`; related reconciliation sources only after coordination.
Acceptance: reproduce hosted CLI and web matching failures, preserve canonical block-time semantics, repair their cause, pass focused and broader affected tests, typecheck/lint, independent review and source-pinned handoff. No dependency, BTC or other web-test ownership.
Status: completed at product source `e79821d3`, compiled fixture `612d3c35`. Full CLI 570/570, compiled acceptance 21/21, native devnet acceptance 124/124, browser ledger 36/36 and independent time regressions 9/9 passed. Coverage, typechecks, scoped lint and build passed. See `docs/handoffs/agents/TEAM_A_CI_RECONCILIATION.md`.

## Team H encrypted BTC scan continuity — 2026-11-16

Worker: btc_persistence agent, Caveman. Branch: `codex/unified-btc`; base `f783f14e`.
Owned paths: `apps/web/src/features/btc/scan*`, `BtcView*`, wallet documentation and scoped tests; package scan-state interfaces only if required.
Acceptance: opt-in encrypted wallet/network-scoped IndexedDB state; per-block crash/cancel resume; canonical reorg rollback; no persistent secret/tweak bytes; restored outputs require fresh source/header validation before sweeping; stale-session and cross-tab writes fail closed. Reuse existing HKDF/AES-GCM and transactional CAS patterns. No mainnet enablement or external-node qualification claim.

# Unified completion coordinator — 2026-11-16

Owner: root coordinator. Branch: `codex/ghostpay-unified-completion`; base `0c4c3c8d951a9d6e71affcdaa26478911c8037f1`.
Owned paths: integration conflicts, locale/security catalogs, master completion ledger, final evidence and handoffs.
Acceptance: preserve source ancestry and verified behavior; classify new identity/privacy disclosures; run combined-head checks and record remaining gates. Worker branches own their separate modules; no protected-main merge, deployment, signing or release.

## Historical and worker claims

## Ops-monitor W3 streamed artifact cap — 2026-11-16

Worker: current Codex child agent. Branch: `codex/ghostpay-ops-response-cap-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `packages/ops-monitor/src/fetcher.ts`, focused fetcher tests, this registry, task handoff.
Acceptance: enforce release-artifact byte cap while streaming; refuse oversized declared lengths without consuming the
body; cancel rejected streams without waiting on a remote cancel promise; preserve exact-limit bytes, malformed/missing
length handling and UTF-8 bytes split across chunks.
Status: implemented. Full package suite passes 113/113 with 98.01% statements, 93.59% branches, 97.72% functions and
99.78% lines; package typecheck/build and focused ESLint pass. Full package lint terminated with exit 137; external
HTTP receiver acceptance was not run.
## Team A unified reconciliation review — 2026-11-16

Worker: reconciliation agent, Caveman workflow. Branch: `codex/unified-reconciliation`.
Base: `27852ba898968a08f7d7c448fac8b19058189281` (PR #186).
Owned paths: chain-adapters logs/rpc/scanVerify and tests; vault reconciliation modules/tests; web scanner and reconciliation libraries/tests.
Acceptance: canonical header timestamps survive scanning and encrypted persistence; provider disagreement, reorg, imported history, duplicate conflicts and finality remain fail-closed; exact bigint arithmetic is preserved. Run targeted tests, correct reproduced defects, and provide a source-pinned handoff. No public-chain writes or release qualification claim.

## Historical and worker claims

## Canonical block-time reconciliation — 2026-11-16

Worker: canonical-time implementation agent. Branch: `codex/ghostpay-canonical-time-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: chain-adapter block references and announcement scanner; portable reconciliation record/matcher;
reconciliation tests and related security-key/locale entries if new message key is needed; this registry and handoff.
Acceptance: only timestamp from a canonical block header matching announcement block number/hash can establish
invoice timing; new verified late-scanned pre-expiry payments can match; post-expiry payments remain ambiguous;
legacy/imported records without block timestamp never become exact through wall-clock fallback; optional field keeps
old vault data readable; reorg and backup/import behavior remain sound.
Status: implementation and regression coverage complete. `git diff --check` and locale JSON/key parity pass; `npm ci --ignore-scripts --no-audit --no-fund` exited 137, so focused tests, typechecks and build cannot run here (Vitest and TypeScript unavailable).

## Unified registry ENS lookup — 2026-11-16

Worker: Team B registry. Branch: `codex/unified-registry`. Base: `365a1c38`.
Owned paths: chain-adapters registry and ENS helpers/tests/index exports; web registry view/tests;
`docs/handoffs/agents/TEAM_B_REGISTRY_UNIFIED.md`.
Acceptance: explicit ENS lookup uses only the selected, already-validated Ethereum or Sepolia RPC;
normalizes names, validates returned addresses and meta-addresses, never follows offchain gateways,
and rejects stale UI results. No cross-chain fallback or delegated signing/sending UI is added.
Locale additions are coordinated with the integration owner.
## Unified Team D — verified matrix — 2026-11-16

Worker: matrix; branch `codex/unified-matrix`; base `365a1c38`.
Owned paths: `packages/chain-adapters/config/matrix.json`, `scripts/check-chain-matrix.mjs`,
`scripts/lib/chain-matrix.mjs`, companion tests, release gate wiring and operator matrix documentation.
Acceptance: all configured chains/tokens/feeds have provenance-aware cells; malformed or mismatched data fails;
release verification refuses every enabled chain with an unverified required cell. Existing development configuration
remains available. No deployment addresses, code hashes, source attestations or runtime verification are invented.
Status: implementation in progress; external deployment/RPC acceptance remains pending.
## Unified observability review and completion — 2026-11-16

Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source.
Status: matrix implemented at `aa1d5153`; quote-decimal agreement implemented at `39f79175`. Targeted checks passed; final combined web typecheck/CI and external deployment/RPC acceptance remain pending.
Follow-on ownership: `packages/chain-adapters/src/quote.ts` and tests; `apps/web/src/lib/pay.ts` and tests.
Acceptance: configured feed decimals must agree with the RPC result before any quote/payment request is produced;
generic standalone `readPrice` callers may omit the expected-decimals parameter.
## Team B/I template issuance follow-on — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `e84e72d9`.
Owned paths: merchant template issuer component/helper/tests, merchant profile panel, SDK v2/tests,
`invoiceCreate.ts` exact-second expiry support and tests, related specification/user docs. Catalogs remain coordinator-owned.
Acceptance: only a matching loaded signer with verified backup or prior explicit waiver may create a new signed
invoice from a verified template; exact minor amount, chain/token allowlists, requested expiry and stale-state guards
must hold. Optional amount requests require signed `allowAmount`; they never edit an existing payer invoice.

## Team B/I unified merchant embedding — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `365a1c38`.
Owned paths: `App.tsx`, merchant-profile components and tests, `embedHost.ts` and tests,
`merchantIdentity.ts` and tests, embedding documentation. Catalog changes belong to the coordinator.
Acceptance: explicit HTTPS loading with bounded/cancellable fetch; verified signed profile presentation;
user-confirmed source-origin/full-key pins, mismatch warnings without silent replacement; signed template display
without changing or authorizing an invoice. Remains excluded from the lean Pages profile.
Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source. Completed through `364efaf3902351886eb2baa739e8e0dc70101617`: bounded webhook lifecycle, rejection detector, exact gas/loss/fee and quote counters, latency histograms, log severity and native authenticated scrape. Full relayer gate 443/443 with zero skips; coverage, typecheck, build and full lint pass. Independent agent review found no blocker. Provider-disagreement and stale-feed detectors remain dependent on absent provider/feed inputs. See `docs/handoffs/agents/TEAM_C_UNIFIED.md`.

# Active AI work registry

## Registry bundle egress correction — 2026-11-16

Worker: Team B registry. Branch: `codex/fix-registry-bundle-egress`. Base: `53d2163be5f7eaa8592750649d54df06b133b80c`.
Owned paths: `packages/chain-adapters/src/registryEns.ts`, its tests, this claim and the correction handoff.
Acceptance: preserve selected-RPC-only ENS behavior while eliminating the viem PublicClient/default-chain dependency
graph; reproduce the unchanged full and lean bundle guards before correction, then pass both real builds and scans.
No host allowlist, source guard, security policy, RPC default or test threshold may be weakened.

## Relayer observability spec 07 completion — 2026-11-16

Worker: current Codex worker. Branch: `codex/ghostpay-observability-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `apps/relayer/src/config.ts`, `server.ts`, `runtime.ts`, `alerts.ts`, `metrics.ts`, `metricsServer.ts`,
their focused tests, `apps/relayer/README.md`, `docs/operators/relayer-monitoring.md`, this registry.
Acceptance: add opt-in loopback metrics listener, authenticated `/metrics` and `/v1/stats`, signed HMAC-SHA256
alerts with 15-minute per-event/chain dedupe, and safe shutdown. Preserve request-path behavior. Add endpoint,
signature, privacy, SSRF and shutdown tests.
Handoff: local implementation committed on this branch. `git diff --check` passes. `npm ci --ignore-scripts --no-audit --no-fund` exits 137. Targeted Vitest cannot load `vitest/config`; typecheck lacks `tsc`; lint lacks `eslint`. No test suite, typecheck, lint, real Prometheus scrape, or receiver acceptance completed. Keep spec 07 partial until real scrape and receiver acceptance pass. Exact source pin is in task handoff.

## Merchant identity localization and security classification — 2026-11-16

Worker: current Codex session using Caveman workflow. Branch: `codex/ghostpay-caveman-followup-20261116`, base
`4ee9dd770826e705cb8c2437a53cf6714a003635`.
Owned paths: `apps/web/locales/{es,ja,ar}.json`, `apps/web/src/i18n/securityKeys.ts`,
`apps/web/src/i18n/securityKeys.test.ts`, this registry.
Acceptance: match all source catalog keys in locale drafts; classify merchant identity verification disclosures as
security-critical so unreviewed translations cannot replace English; pass catalog and security-key regressions.
Status: locale/security source fix implemented. GitHub logs confirmed 12 locale-key validation errors and the exhaustive security-key census failure on the 4ee9dd77 candidate. Reviewed #178 recovery: current source already revokes its Blob URL and removes the anchor on click or append failure; current tests cover both paths, so #178 source change is superseded. Local dependency installation is unavailable (npm ci exits 137); catalog shape and diff checks remain available. Exact-head hosted CI is still required.

## Registry builder acceptance — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-registry-lifecycle-20261116`, base `7a208005`.
Owned paths: web `features/registry/registry.anvil.test.ts`, this record, continuation evidence.
Acceptance: the recovered builders execute against the local reference registry; a valid delegated registration works,
replay fails, nonce invalidation rejects a previously signed update and fresh authorization succeeds. No public-chain
transaction, wallet signing UI or production contract modification.
Completed: five native Anvil/reference-registry tests passed with zero skips, web typecheck and focused lint passed.
Local reference compiler is solc 0.8.38; hosted pinned-compiler checks remain required.

## Merchant profile stream cap — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-profile-cap-20261116`, base `beb99464`.
Owned paths: web `embedHost.ts`, `embedHost.test.ts`, `e2e/reconciliation.spec.ts`, and this record.
Profile tests: 47 plus 77 integration/privacy cases passed; web typecheck/full lint passed.
Also scope the reconciliation browser assertion to the invoice identity paragraph after the amount summary added a
second nested hint. Preserve the digest, language-change, backup import and lock assertions. Baseline #182 browser
CI reproduced the strict-selector failure; final browser execution remains required.
Acceptance: enforce the existing 8192-byte profile limit during streaming, cancel rejected responses without waiting
on remote cancellation, preserve signed-profile verification and fetch privacy options, and test exact boundaries,
lying/missing length headers and split UTF-8. No UI/network enablement or new endpoint is introduced.

## Custody recovery — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-custody-caveman-20261116`, base `47f92f6f`.
Owned paths: `keystore-portable.ts`, web `keyVault.ts`, `keyVault.test.ts`, `keystore.test.ts`, and the SellerKeys comment.
Recover the two isolated custody fixes from `dded4c02` and `f12f9418`, reproduce their regressions against the published
candidate, then qualify normalized password policy and verified-copy checks before integration. No other local branch
payload is imported. Recovery source and final checks must be recorded in the continuation handoff.

## Caveman continuation — 2026-11-16

- Worker: current Codex session, sequential implementation and review.
- Branch: `codex/ghostpay-caveman-completion-20261116`.
- Published base: `b4be8866f6ff883fbbedc49be88b5b251a7d270e` (#179). Recovery inputs: #180 and #181.
- Owned paths: `packages/ux-vault/src/reconciliation-amounts*`, `portable.ts`; web invoice summary and reconciliation ledger components/tests; associated locale/security keys; registry builder verification; relevant completion documentation.
- Acceptance: exact bigint invoice totals from explicit live final-at-scan links; scope-wide conflict rejection and deduplication; no inferred linking or settlement claim; UI wiring and translation safeguards; package builds, regression/property tests, typecheck and lint. Validate recovered analyzer and registry helpers before publishing.
- Status: implemented; final hosted checks pending. Existing source branches remain unchanged. This record supersedes no other worker claim.

The same branch also owns integration review of #164's `payer-sponsor`, `pool-relayer`, QR warning and source-gate
changes. Acceptance includes preserving both sets of linear-parser regressions and rejecting invalid queue limits.

This file is a coordination template, not a live lock service. Always inspect open PRs and branch heads before relying on it.

| Worker | Branch | Base SHA | Owned paths | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- |
| Codex browser cleanup worker | `codex/ghostpay-download-cleanup-20261116` | `f6728033258edf203f35fe1a064660fb6ff233ce` (test-only #178) | `apps/web/src/components/Common.tsx`; `apps/web/src/components/Common.test.tsx`; this registry | Failed downloads preserve the thrown error and release the Blob URL and temporary anchor; successful downloads retain the deferred revocation window | Implemented; test-only `1ed3926b` reproduced 2 failures / 12 passes, corrected suite 14/14 passes and targeted ESLint passes. Combined-tree typecheck/build/CI still required. |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | Integrated locally; coordinator owns final combined-head verification |

| Codex historical preflight review | `codex/ghostpay-policy-preflight-20261116` | `d239d520294513114e686bd2d2e94422436fb327` | Read-only policy send/journal assessment; this registry and consolidation ledger | Verify whether historical remediation is safely recoverable; run current behavior tests | Complete: historical patch already intentionally rejected; 37/37 focused tests passed |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | In progress |
| Codex linear parser worker | `codex/ghostpay-linear-parsers-20261116` | `30733000` | `packages/i18n/src/ux/readability.ts`; readability regression tests; `packages/ops-monitor/src/fetcher.ts`; fetcher regression tests; this registry | Remove confirmed polynomial regex paths while preserving sentence and URL semantics; pass adversarial-input regressions and seeded equivalence checks | Implemented. Test-only `28a94f25` reproduced both performance failures. Corrected full suites: i18n 213/213, ops-monitor 106/106, coverage gates pass; 2,000 seeded equivalence cases pass; both typechecks and i18n lint pass. Ops-monitor lint terminated by local memory limits (exit 137); CI required. |

Incoming Pages #173–#177 records are preserved in their source history; their fixes are integrated here for combined-head validation. This branch owns only consolidation, not the original workers’ branches.

Workers should update their task-branch copy and communicate ownership through the PR description. Do not treat absence from this table as proof a path is free.

| Fuzz harness QA | `codex/ghostpay-fuzz-harness-20261116` | `d26418c2539619fb75783a82886a96971142d226` | `packages/contracts/scripts/run-echidna.sh`, `scripts/tests/echidna-runner.test.mjs` | Reject missing/duplicate/unknown property results and abnormal exits; require all real properties passed and all canaries failed; validate with offline executable fixtures | Complete: 13/13 offline runner regressions passed; bash syntax and diff checks passed; real Echidna campaign not run |
| protocol_qa | codex/ghostpay-protocol-qa-20261116 | d26418c2539619fb75783a82886a96971142d226 | packages/ux-vault/src/reconciliation-portable.ts; apps/web/src/lib/reconciliationMatch.test.ts; apps/web/src/lib/reconciliationVault.invoices.test.ts | Imported historical annotations cannot reserve a current invoice; verified live links still reserve it; encrypted import/confirmation and bounded property regressions pass | Implemented; 3 regressions RED before fix, 28 matching/vault tests GREEN, 150 property cases, typecheck/lint passed; full coverage retry pending after worker SIGKILL |
| spec-acceptance worker | codex/ghostpay-pages-runtime-acceptance-20261116 | 30733000 | apps/web/e2e/pages-devnet.spec.ts; apps/web/e2e/devnet/pages.ts if needed; docs/handoffs/GHOSTPAY_SPEC_STATUS_2026-11-16.md | Built Pages artifact handles same-nonce cancellation without false payment success or duplicate send; seller profile survives browser-process restart with encrypted vault, checkpoint and reconciliation intact | in progress |
| security_notes | codex/ghostpay-security-20261116 | d26418c2539619fb75783a82886a96971142d226 | PolicyReceive.tsx; PolicyReceive.regression.test.tsx; policyTime.ts/test; relayer config.ts/config.test.ts/ops.test.ts/README.md | Preserve fresh withdrawal-attempt discovery, render arbitrary chain timestamps without throwing, require explicit development/test mode for ephemeral relayer state; targeted regressions and lint/typecheck | implemented; targeted verification complete; independent review requested |
| security_notes | codex/ghostpay-security-20261116 | 1acb7b79 | packages/cli/src/invoice-parity.test.ts; packages/payer-hiding-contracts/test/GhostPayErc4337.t.sol; security remediation note | Assert disabled-chain inspection classification and fuzz EntryPoint rejection of inverted paymaster windows without deposit expenditure | implemented; 11 CLI tests and 10,000 inverted-window fuzz cases passed |
| Mythril gate QA | `codex/ghostpay-mythril-gate-20261116` | `b4be8866` | `packages/contracts/scripts/run-mythril.sh`; `scripts/tests/mythril-runner.test.mjs`; this registry | Reject abnormal tool exits and malformed/incomplete reports; preserve pinned analyzer invocation; prove gates with offline executable fixtures | Complete: test-only `5e7c23c3` reproduced 9 failures / 10 passes; corrected Mythril fixtures 19/19 and existing Echidna fixtures 13/13 pass; bash syntax and diff checks pass. No real symbolic-analysis run claimed. |

## Coordinator status — 2026-11-16

All scoped worker patches above are integrated locally and source-reviewed in PR #179. The coordinator owns
final combined-head CI and the completion task ledger. Earlier in-progress statuses describe original worker
claims; they do not imply that those source branches were modified or that release gates passed.

| Codex registry builder worker | `codex/ghostpay-registry-recovery-20261116` | `b4be8866f6ff883fbbedc49be88b5b251a7d270e` | `packages/chain-adapters/src/registryDelegation.ts`; companion tests; `src/index.ts` export; scoped spec audit note | Match canonical ERC-6538 calldata; validate registrants/keys/signature bytes; retain opaque ERC-1271 signatures; no sends, signing, pins or UI enablement | Recovered from recorded source after environment loss. 40 focused tests/3 files and 200 seeded cases passed locally. Typecheck/lint killed137; build/export and recovered-tree verification pending. |

## Unified independent security and authority review — 2026-11-16

Worker: Team J (`security_inventory`). Branch: `codex/unified-audit`. Base: `365a1c38770ba02826d7e039dbeef44e5a966323`.
Owned paths: this claim and `docs/handoffs/agents/TEAM_J_UNIFIED.md`; product edits require coordinator notification first.
Acceptance: independently inspect PR #184, execute supported security gates, inventory authority-model and external-adapter blockers, and reconcile relevant historical branch provenance without claiming an external audit.
Team B/I milestone: implementation `4655bab8` is committed. Final focused integration has 116 passing tests and
web typecheck/focused lint pass, using coordinator catalog overlay `cb6a3de3`. Independent reviewers found and
rechecked pin concurrency, stale consent and remote iframe corrections. Browser acceptance is added but unrun.
See `docs/handoffs/agents/TEAM_B_UNIFIED.md`; coordinator owns final combined-head qualification.

## BlindBit gRPC-Web adapter — 2026-11-16

Worker: fresh Team H transport, Caveman workflow. Branch: `codex/unified-blindbit-grpc`; base `492cc20d`.
Owned paths: new btc-silent-payments scan gRPC-Web adapter/generated schema/tests, index export, package dependency/lock additions, transport provenance and handoff. Existing scan state/BTC UI remain owned by Team H persistence.
Acceptance: explicit HTTPS endpoint, no wallet key request fields, bounded/cancellable unary frames, strict protobuf/domain validation, network/hash agreement, exact satoshi amounts, pinned MIT provenance. Live proxy/oracle qualification remains external.

Follow-up: coordinator authorized the isolated `packages/contracts/scripts/run-echidna.sh` and
`scripts/tests/echidna-runner.test.mjs` correction after the checksum-pinned native 2.2.7 campaign completed
300,021 Router calls and emitted final `passing` property statuses rejected by the prior parser. Require the
completed configured call budget while retaining abnormal-exit, complete-inventory and failing-canary checks.
Independent review requested from `final_review`; no contract or analyzer setting changes.

Hosted follow-up authorized by coordinator: extract Echidna/Mythril into a read-only, path-scoped PR and reusable
workflow called by nightly; preserve analyzer settings, failing outcomes and bounded source-pinned report artifacts.
Owned additional paths: `.github/workflows/{nightly,contract-analysis}.yml`, contract script compatibility/report
helpers and `scripts/tests/contract-analysis-workflow.test.mjs`. No dispatch, publication, release or deployment.

Team B/I follow-on: `5d36ac5d` implements merchant-key-authorized template issuance and signed-permission amount
requests. Final focused integration: 115 tests passed; full web typecheck/focused lint passed. Independent final review
is source-pinning this commit. Profile-only automatic checkout remains a documented destination/fee/pricing/signature
schema or signing-transport decision; it is not a missing local merchant signing path anymore.
## Coordinator hosted-CI regression repair — 2026-11-16

Worker: root, Caveman. Branch: `codex/ghostpay-unified-completion`; base `8298fc24296194f05b686b44bec542d10276c8d3`.
Owned paths: `apps/web/src/lib/relayerClient.ts`, its tests, and `tagArchive.test.ts`.
Acceptance: reconcile browser pre-broadcast classifications with the current public relayer API; preserve unknown-response refusal safety; guarantee the archive-corruption fixture changes ciphertext; run focused regressions and independent review. CLI and ledger fixtures are owned by ci_reconciliation separately.

## Dependency remediation — 2026-11-16

Owner: dependency agent, Caveman workflow. Branch: `codex/unified-dependencies`; base `ab5039a3da0a1653df85b8ecbda6973947827547`.
Owned paths: workspace package manifests, package-lock and dependency evidence/handoff.
Acceptance: fix confirmed compatible security updates, preserve runtime/protocol pins unless necessary, audit exact resulting lock and verify affected tooling. Do not force major migrations to conceal remaining findings.
Status: implementation `379fe300` preserves all production lock records; complete audit is 17 low findings, production audit zero. npm 10 clean install, five dependency integration checks, affected lint, Hardhat compile/typecheck and 39 router/chain-guard tests pass. Full FHE fuzz and npm 11 clean install exited 137 locally and remain unqualified. See `docs/handoffs/agents/TEAM_J_DEPENDENCIES_UNIFIED.md`.
## Team D optional quote protections — 2026-11-16

Worker: price_gates, Caveman. Branch: `codex/unified-price-gates`; base `b0b7afa9de68510b821cc702a0f82847a205495b`.
Owned paths: `packages/chain-adapters/src/quote.ts`, quote tests, spec-03 status and this handoff. No dependency, relayer signed-quote ABI or web caller edits.
Acceptance: configured sequencer outage/grace, fresh reference-feed deviation and USD peg checks fail closed with exact bigint boundaries; standalone conversion rejects malformed price precision; no invented feed addresses or activation claims. Required production pins, external feed tests and relayer protocol integration remain separately recorded.
## Fresh final integration review — 2026-11-16

Owner: final_review, Caveman workflow. Branch: `codex/unified-final-review`; initial review base `f5142b19a6868f155b682eed50f606603cb68b97`, documentation worktree base `53d2163b`.
Owned paths: `docs/handoffs/agents/UNIFIED_FINAL_REVIEW.md` and this claim only. Product sources remain read-only.
Acceptance: inspect cross-module authority, runtime export/build-profile, network and concurrency boundaries of the integrated candidate and newly completed workers; pin findings to source, verify corrections independently where practical, and distinguish source review from release or external audit qualification.

Milestone: reviewed the pinned sources in `docs/handoffs/agents/UNIFIED_FINAL_REVIEW.md`; no additional blocking source defect found. Independent focused merchant tests 21/21 and Echidna parser fixtures 22/22 passed. Coordinator owns final combined-source qualification. Follow-up dependency remediation is outside this milestone until its source is ready.

Follow-up: reviewed the dedicated BTC worker, dependency remediation, CLI canonical-time propagation, relayer refusal classification and optional price guards at the exact revisions in the handoff. Worker network/artifact and late-response cleanup findings were corrected before clearance. Independent additional selections passed: worker/bridge 16/16, dependency tooling 5/5, CLI timing 9/9 and quote guards 19/19. All clearance is source-scoped; final combined-head gates and external acceptance remain coordinator responsibilities.

Current follow-up: hosted analyzer workflow source cleared at `6fb739ed` with 5/5 independent helper/workflow tests; pure Bitcoin output proof helper cleared at `a4496071` with 34/34 tests after coinbase exclusion. Relayer feed/provider source cleared at `87f3dd50` with 29/29 independent tests after correcting a feed-validity deadline lost across nonce/signing awaits. Integrated Bitcoin source/light-mode product source cleared at `d9ba1253` after mandatory proof integration and bounded tweak cleanup, with 34/34 independent tests and a final 12/12 worker rerun. Coordinator-owned critical locale integration and combined artifact/browser gates remain separate.

## Team H source selection, full-block cross-check and light inclusion proofs — 2026-11-16

Worker: btc_sources, Caveman. Branch: `codex/unified-btc-sources`; base `25bbf1e3c87b9b2d8feeeeaca804027511b18608`.
Owned paths: Bitcoin view, scan source composition, typed worker oracle bridge and focused tests; spec-12 source status and handoff. Root owns locale catalogs and security-key classification.
Acceptance: optional user-selected BlindBit HTTP or HTTPS gRPC-Web data must agree with every locally verified Esplora block before results or checkpoints are accepted; exact network and full-index capabilities; no worker network API or keys in source requests; bounded/cancellable transport; source edits invalidate prior work; encrypted history is freshly revalidated. Preserve own Esplora mode A and stronger full-block Merkle/witness checks. No mainnet enablement, invented endpoints, hosted scan-key mode or SPV-only claim.


Scope continuation: parent explicitly authorized light oracle scans with mandatory per-match raw-transaction/Merkle proof against checked headers, current outspend checks, optional full second-source agreement and accurate omission/privacy limitations. No separate direct-bitcoind adapter is required for the existing own-node Esplora architecture.

Team H source status: implementation `d5632c9e` plus review follow-up `d9ba1253` complete and independently source-cleared. Scoped oracle/UI/transport/policy tests and all 17 chain-view outcomes pass; final web typecheck/scoped lint/full+lean build and unchanged bundle guards pass sequentially. Root owns critical locale merge and combined artifact/browser gates. Handoff: `docs/handoffs/agents/TEAM_H_SOURCES_UNIFIED.md`.

## Team C/D configured source checks — 2026-11-16

Worker: relayer_sources, Caveman. Branch: `codex/unified-relayer-sources`; base `ccd7721a797ae8b1d73adfd8568c7227d5a356c9`.
Owned paths: `apps/relayer` source/config/tests, operator monitoring documentation and this handoff. No dependency or signed-quote schema changes.
Acceptance: opt-in canonical-header agreement compares two actual configured providers; configured registry-feed pricing fails closed on stale/invalid rounds without fixed fallback; quote expiry cannot exceed feed validity; truthful bounded telemetry; source-pinned tests and independent review. Existing fixed pricing remains a separately documented legacy mode.
Status: final source `87f3dd50`; independent review and 29 focused tests passed. Full native-inclusive relayer gate passes 475/475 with original coverage thresholds, full lint/typecheck/build. Quote ABI remains unchanged; production source pins, live acceptance and signed round-identity schema remain explicit gates. See `docs/handoffs/agents/TEAM_C_SOURCES_UNIFIED.md`.

## Team G escrow supporting model — 2026-11-16

Worker: escrow_support, Caveman. Branch: `codex/unified-escrow-support`.
Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
Owned paths: `scripts/experimental/milestone-escrow/**`, spec 17 implementation status,
escrow reuse/research documentation, and `docs/handoffs/agents/TEAM_G_ESCROW_SUPPORT.md`.
Acceptance: isolated, unaccepted deterministic stage model; explicit dispute/release variants;
exact conservation, domain/replay, timing, terminal-state and canonical replay evidence;
decision table with custody/dispute/recovery consequences; independent review.
No guardian-model duplication, product import, Solidity custody contract, admin authority,
dependency change, UI activation, deployment or claim that spec 17 is complete.

Milestone complete: source `307f9008`; standalone 19/19 tests, model 100% line/branch/function
coverage, and independent source/test review by `final_review2`. All 42 state/action pairs and
15,444 bounded transition attempts are covered. Handoff: `docs/handoffs/agents/TEAM_G_ESCROW_SUPPORT.md`.
Authority decisions and product escrow implementation remain blocked; no fund path was enabled.

## Team I final hosted browser repairs — 2026-11-16

Worker: browser_finish, Caveman workflow. Branch: `codex/unified-browser-final`; base `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
Owned paths: browser reconciliation fixtures, skip-link focus and pairing error behavior/tests; browser handoff. No locale, BTC source, relayer or native registry edits.
Acceptance: explain checkpoint55e8 hosted browser failures from exact logs; preserve canonical payment authority and all accessibility/rejection assertions; fix source bugs with focused regression evidence; record local browser launch limits honestly.

Team I browser repair milestone: source `9642e75a` repairs skip-link order and canonical RPC test evidence; 77 focused DOM tests, typecheck and scoped lint passed. Pairing generic-status browser failure remains explicitly pending hosted rerun with stronger diagnostics and unchanged original assertion. See `docs/handoffs/agents/TEAM_I_BROWSER_FINAL.md`.

## Fresh final delta review — 2026-11-16

Owner: final_review2, Caveman workflow. Branch: `codex/unified-final-delta-review`; base `191bbce3c30d94b8f48f767b7ab77ec739e62b9a`.
Owned paths: `docs/handoffs/agents/UNIFIED_FINAL_DELTA_REVIEW.md` and this claim. Product sources are read-only.
Acceptance: independently review new delegated registry signing, isolated escrow supporting harness, corrected worker fetch injection/CI setup, browser regression repairs, and oracle critical-message integration. Preserve prior reviewed-source evidence and separate execution, external acceptance, and final-candidate gates. Record findings at exact source pins and execute bounded focused regressions when available.

Review milestone: source-scoped delta review complete in `docs/handoffs/agents/UNIFIED_FINAL_DELTA_REVIEW.md`. Independent workflow 5/5, worker/privacy 51/51, locale 12/12, delegated helper 53/53, native registry 9/9, escrow model 19/19 and browser DOM 34/34 passed. Hosted pairing rejection status remains pending actual browser rerun; final combined qualification remains coordinator-owned.
# Qualified source promotion — 2026-11-18

Worker: ChatGPT integration coordinator. Branch: `integration/ghostpay-qualified-fixes-20261118`.
Base: `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` (reviewed PR #241 merged into main).
Owned paths: integration of already independently reviewed #237, #227, #234 and #235; their nonconflicting source/tests;
this registry and `docs/consolidation/master-20261118/QUALIFIED_GROUP.md`.
Acceptance: preserve all source parents and worker claims, qualify the combined tree against current main, independently review,
then merge only with successful applicable checks. Existing strict Mythril release failure remains explicit and unchanged.
No deployment, release, branch deletion or shared-branch rewrite.



## Sweep balance query consent — 2026-11-18

Worker: ChatGPT recovery reviewer, Caveman workflow. Branch: `chatgpt/ghostpay-sweep-balance-consent-20261118`.
Base: refreshed `main` at `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/views/Sweep.tsx`, `Sweep.privacy.test.tsx`, necessary balance-query messages in
`apps/web/locales/{en,es,ja,ar}.json` and their `apps/web/src/i18n/securityKeys.ts` classification, this claim,
and `docs/handoffs/agents/SWEEP_BALANCE_CONSENT_20261118.md`. The integration owner also approved explicit read-button
clicks in the shared `Sweep.test.tsx` setup and existing `e2e/{sweep,core-journey,pages-devnet,devnet-journey}.spec.ts`
sweep setup points; existing signing and payment assertions remain unchanged.
Acceptance: opening Sweep never requests a balance; one explicit click makes one balance-read invocation;
ordinary rerenders, errors and selection changes do not repeat it; changing the payment, asset, provider or session
invalidates pending results and requires a new click. Preserve the required-private-path warning and the existing
sweep controls. Disclose what the Settings RPC learns. Do not import #222's destination ledger or experimental features.
Scope distinction: the existing RPC transport has its own bounded retries; this task does not claim to change that
shared transport policy. Exact-head hosted CI and independent integration review remain required.

Milestone: runtime repair `d03d529f5b785dcd129b302d122b191d3d066214` passes 120 focused tests, whole-web typecheck
at a 1536 MiB heap cap, scoped lint and locale validation. Independent privacy review reports no remaining source
blocker and independently passes 72 consent/signing tests. Final E2E setup additions are reviewed and linted only;
browser execution and exact-head hosted CI remain required. See `docs/handoffs/agents/SWEEP_BALANCE_CONSENT_20261118.md`.
## Beta acceptance log artifact capture — 2026-11-18

Worker: recovery_review, Caveman workflow. Branch: `chatgpt/ghostpay-beta-log-artifact-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (main).
Owned paths: `.github/workflows/beta-acceptance.yml`; this claim;
`docs/handoffs/agents/BETA_LOG_ARTIFACT_20261118.md`.

Acceptance: trace the observed missing artifact in run `44279444368`, job `134715943959`, to the retained
log paths and the exact pinned upload action behavior; enable hidden-file inclusion only for the existing
`scripts/beta/.state/*.log` upload. Preserve the path, artifact name, retention, permissions, failure behavior,
acceptance commands and every existing gate. Run existing relevant workflow/action checks and inspect the
exact diff; add no setting-mirroring test. No product/dependency change, new infrastructure, deployment,
workflow rerun, publication or upload of state JSON/private fixture material.

Status: workflow source `05a3b45bda60d18a6922c0897d48bd8984bad377` adds only the requested boolean
input. Existing workflow checks pass 6/6 with no skips; action-pin check passes all 111 references;
`git diff --check` passes. Coordinator and privacy reviewer independently cleared that exact workflow
source after checking the pinned upstream filter, retained logs and unchanged upload scope. No new test,
dependency, build, upload or rerun. Hosted artifact existence remains unverified; early failures can still
precede log creation, and the earlier browser acceptance failure remains red. Evidence and integration
limits: `docs/handoffs/agents/BETA_LOG_ARTIFACT_20261118.md`.

# Historical source-sink scanner reconciliation — 2026-11-18


# Historical pool input guard recovery — 2026-11-18

Worker: history_review, coordinated by the pre-merge repair lead.
Branch: `repair/ghostpay-history-pool-values-20261118-local`.
Base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (refreshed main).
Owned paths: `packages/pool-circuits/src/inputs.ts`, `src/helpers.test.ts`, `test/witness.test.ts`,
the package `DEVIATIONS.md`, this claim and a scoped merge-readiness handoff.
Acceptance: recover the existing historical nonzero-input guards from
`ea1f0b244f0adf4794e55cda6dc7dbd1e5f4039c` and property regression from
`768b1f4cc86638e747cb1553297d012973c4cbb0`; reproduce the present helper/contract
mismatch, preserve valid positive values and full withdrawals, and qualify the
minimal repair independently. All 44 open PR file lists were checked; none
changes the two owned source/test paths. The existing pool circuit constraints,
proof artifacts, contracts, crypto, dependencies, deployment and security gates
remain outside this scope. The coordinator owns publication and integration.

Owned paths: `apps/web/scripts/scan-bundle.mjs`, its `.d.mts` declaration,
`apps/web/src/scanBundle.test.ts`, this claim and a source-pinned scanner handoff.
Acceptance: reproduce the source scanner's false negatives after nested template,
regex and JSX text; reconcile only the TypeScript AST source-sink check from
historical `016fa2521f7cd7c1cfbe763aaf658e32f6e27be6`; retain current built-artifact,
HTML, CSP, deployment and release-boundary checks unchanged. Add behavioral
regressions, use already-declared TypeScript without dependency changes, fail on
unparsable source, and independently review before integration.
Ownership check: open PRs #209 and #238 still contain the old comment stripper;
their separately owned hosting/HTML/deployment changes are preserved. Original
branches remain read-only. No workflow, contract, paid-automation or deployment changes.

Status: implementation `b22d71475e84519af7fdad9a5571452e088bc4ae` has reproduced
regressions (4 failed / 15 passed before correction; 19/19 after), package
typecheck/lint/build, secret scan and action pins passing. Available full package
coverage passes 23 tests at 100% statements/branches/functions/lines; 59 existing
artifact-dependent tests remain skipped because wasm/zkeys are absent. Node 22.23.5
also passes all 19 helper tests. See the source-pinned handoff under
`docs/consolidation/merge-readiness/HISTORICAL_POOL_VALUES_20261118.md`.
## PR 231 standalone pre-merge disclosure repair — 2026-11-18

Worker: ChatGPT pre-merge lead; independent CI/privacy review by ci_inventory.
Branch: `repair/ghostpay-pr-231-20261118`.
Source: #231 `d9ff386807de724eb1a1c4d400c882df0fc20bb7` (full head verified in the handoff).
Target: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (main).
Owned paths: `apps/web/src/lib/scanPrivacy.ts`, its existing `scanPrivacy.test.ts`
regressions, `docs/consolidation/merge-readiness/PR231.md` and this claim.
Acceptance: reproduce the two exact hosted disclosure-equivalence failures;
extract only the scanPrivacy correction from `d6016a822f3bf238506ea5b426380bceb9d1ee83`;
retain every balance-consent/session guard and disclosure assertion; verify the
actual combined main/source tree. #222/#238 and their active source branches
are read-only. All source commits remain ancestors. Both sides of the only
merge conflict (independent ACTIVE_WORK claims) are retained. No contract,
dependency, cryptographic or gate changes.

## Shared invoice signer-policy extraction — 2026-11-18

Worker: recovery_review, Caveman workflow. Branch: `chatgpt/ghostpay-invoice-validation-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (main). Source reviewed:
PR #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`, #209
`b5e2ea3e5030b56c79063eb1f91c8a634ee5d740`, and #211
`a92658b1ef6b95ff0145b2e1933d0047d51289d5`.

Owned paths: `packages/invoice-schema/src/{envelope.ts,errors.ts,pinnedSigner.test.ts}`;
`packages/invoice-schema/{README.md,DEVIATIONS.md}`; `packages/ux-core/src/{errors.ts,errors.test.ts}`;
this claim; `docs/handoffs/agents/INVOICE_VALIDATION_20261118.md`.

Acceptance: reproduce the missing opt-in `requirePinnedSigner` contract on main before implementation;
restore only the shared parser guard and fixed typed error/catalog entries; verify real signatures,
plaintext/encrypted/passphrase paths, invalid-signature precedence, default compatibility and
unchanged format/schema/decryption failures. Run affected package tests/typecheck/lint/build and
existing browser-consumer regressions with matching compiled packages. Document that no current
browser caller opts into this policy and that default unpinned-seller review remains unchanged.
No CLI, relayer, backend, experimental, dependency, cryptographic-format or browser trust-policy
changes. Independent source review and exact-head hosted CI remain integration gates; no publication
or browser-execution claim from this worker.

Status: additive API implementation and local review complete at product/test source
`079222115f494d966f1f25be31ffca4d66346461`; regression commit `e3a34d4081aa63d05f36c2e82961299fadaf3f76`
reproduces 10 signer-policy failures and 1 catalog failure against main. Full invoice-schema 728/728 and
ux-core 119/119 pass with original coverage thresholds; affected package typecheck/lint/build pass.
Existing Pay/Receipt tests pass 153/153 at `964b60d6`, before the sole final catalog identity-wording
correction. Privacy reviewer independently passes 13 signer + 15 catalog tests at final source;
coordinator independently passes the same 13 signer cases. Both source reviews find no blocker.
These independent counts overlap author coverage. No browser/default enforcement, cryptographic format,
optional backend or experimental changes. Exact-head hosted CI and browser acceptance remain separate.
Evidence and integration limits: `docs/handoffs/agents/INVOICE_VALIDATION_20261118.md`.



## Main-targeted Pages checkpoint v4 extraction — 2026-11-18

Worker: ChatGPT privacy_review, Caveman surgical-patch.
Branch: `chatgpt/ghostpay-pages-checkpoint-v4-20261118`; base main
`dfc75ef2087fa6463ae59e0818abec01796c578d`. Reviewed #222-lane source input:
`1dd0fa6152f67010dd38db35d46d102130b583f3`, preserved with its handoff at
`f90499d2925a965b73533da2650c60ca9ea119ed`.
Owned paths: `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanClient.test.ts`,
`apps/web/src/lib/scanCursorSlot.ts`, `apps/web/src/lib/scanCursorSlot.test.ts`,
`apps/web/src/lib/scanCheckpointPrivacy.test.ts`,
`apps/web/src/lib/scannerCore.spam.nocov.test.ts`, checkpoint row only in
`docs/threat-model/PRIVACY_THREAT_MODEL.md` and the browser-profile row only in
`docs/threat-model/THREAT_MODEL.md` (coordinator-approved), this claim and
`docs/handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md`.
Acceptance: extract only identity-bound v4 checkpoint persistence/lending and the
relevant regressions onto main; preserve main scanner body, evidence/reorg/finality
checks and application behavior. No #222 bulk-evidence feature, transport/BTC/contract
or dependency changes. Reproduce main's legacy behavior before product edits; run
focused/full scanClient tests, million-announcement resume, whole-web typecheck and
scoped lint; request independent source/test review. Record both source lanes, old
record rescan and privacy/storage limits. No remote mutation, duplicate PR, merge,
deployment or local browser-pass claim.
Status: completed at main product/test source
`7c37de5154ac18e06725ecde6d194185b2e820f2`. Main RED commit
`1d8e61776b2e28a4a4d2e082399eefe58148ea7c` reproduced 5 failures/2 controls.
Full scanner/privacy/helper selection passed 110/110; million-announcement resume
passed 1/1; full-web typecheck1536MiB and scoped lint passed. Independent recovery_review
found no blocking source issue and reran 20 privacy/helper plus 3 pending-corroboration
lifecycle cases at the exact source. Main scanner bytes before persistence are unchanged
except the helper import; no #222 bulk-evidence code was copied. Public/unauthenticated
cursor values, deliberate legacy rescan, existing same-key-restore AbortSignal dependency,
sole-copy idle-retention policy and lack of cross-tab locking remain explicit.
See `docs/handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md`. Publication and combined
candidate qualification remain coordinator-owned; no duplicate #222-lane PR.

# Historical pool input guard recovery — 2026-11-18

Worker: history_review, coordinated by the pre-merge repair lead.
Branch: `repair/ghostpay-history-pool-values-20261118-local`.
Base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (refreshed main).
Owned paths: `packages/pool-circuits/src/inputs.ts`, `src/helpers.test.ts`, `test/witness.test.ts`,
the package `DEVIATIONS.md`, this claim and a scoped merge-readiness handoff.
Acceptance: recover the existing historical nonzero-input guards from
`ea1f0b244f0adf4794e55cda6dc7dbd1e5f4039c` and property regression from
`768b1f4cc86638e747cb1553297d012973c4cbb0`; reproduce the present helper/contract
mismatch, preserve valid positive values and full withdrawals, and qualify the
minimal repair independently. All 44 open PR file lists were checked; none
changes the two owned source/test paths. The existing pool circuit constraints,
proof artifacts, contracts, crypto, dependencies, deployment and security gates
remain outside this scope. The coordinator owns publication and integration.

Status: implementation `b22d71475e84519af7fdad9a5571452e088bc4ae` has reproduced
regressions (4 failed / 15 passed before correction; 19/19 after), package
typecheck/lint/build, secret scan and action pins passing. Available full package
coverage passes 23 tests at 100% statements/branches/functions/lines; 59 existing
artifact-dependent tests remain skipped because wasm/zkeys are absent. Node 22.23.5
also passes all 19 helper tests. See the source-pinned handoff under
`docs/consolidation/merge-readiness/HISTORICAL_POOL_VALUES_20261118.md`.

# Historical source-sink scanner reconciliation — 2026-11-18

Worker: actions_repair, Caveman investigate-first; parent owns publication and integration.
Branch: `repair/ghostpay-history-scanner-20261118-local`.
Base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (refreshed main).
Owned paths: `apps/web/scripts/scan-bundle.mjs`, its `.d.mts` declaration,
`apps/web/src/scanBundle.test.ts`, this claim and a source-pinned scanner handoff.
Acceptance: reproduce the source scanner's false negatives after nested template,
regex and JSX text; reconcile only the TypeScript AST source-sink check from
historical `016fa2521f7cd7c1cfbe763aaf658e32f6e27be6`; retain current built-artifact,
HTML, CSP, deployment and release-boundary checks unchanged. Add behavioral
regressions, use already-declared TypeScript without dependency changes, fail on
unparsable source, and independently review before integration.
Ownership check: open PRs #209 and #238 still contain the old comment stripper;
their separately owned hosting/HTML/deployment changes are preserved. Original
branches remain read-only. No workflow, contract, paid-automation or deployment changes.

# SellerKeys superseded operation state — 2026-11-20 08:35 UTC

- Cycle and worker: `20261120T0835Z` / coordinator acting as sequential bug-repair worker; no independent agent or review is claimed.
- Branch: `automation/20261120T0835Z/bug/sellerkeys-operation-supersession`; base `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; originally reported source `apps/web/src/views/SellerKeys.tsx` blob `437c684af1fac0f759607bb3fe4f8e37238a3d89`.
- Owned paths: `apps/web/src/views/SellerKeys.tsx`, new `apps/web/src/views/SellerKeys.operation.test.tsx`, this additive claim and `docs/handoffs/SELLERKEYS_OPERATION_SUPERSESSION_20261120.md`.
- Finding: existing QA-01 from PR #309. An export superseded by backup verification strands `busy`; verification superseded by export strands `verifyBusy`. Preserve active-controller/generation checks; do not change persistent vault save/delete lifetimes or key custody.
- Dependencies/other owners: PR #309 documentation-only evidence; PR #278 recovery integration, PR #293 privacy and ongoing integration PRs #306/#307 are separate, active branches. Do not edit those branches or shared ledgers.
- Acceptance: deterministic held-operation regressions for both action orders and late settlement; correct controls after cancellation; no stale status; normal operation and explicit cancellation unchanged; source review, focused tests and hosted qualification on exact candidate. No production deployment or main merge.
- State: ownership registered before product or regression changes; code/test execution and independent review not yet claimed.

## QA-01 operation ownership completion — 2026-11-20

- Worker: `/root` implementation, with independent component-test, browser-test and source-review workers.
- Task branch: `fix/ghostpay-309-operation-ownership-20261120`; continuation of PR #314 at `740efcf061c1ca97a562b85be742dd59f3ad0911`, based on main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Owned paths: `apps/web/src/views/SellerKeys.tsx`, `apps/web/src/views/SellerKeys.operation.test.tsx`, `apps/web/e2e/backup-ownership.spec.ts`, this additive claim and the existing SellerKeys supersession handoff.
- Scope: complete QA-01 from #309, preserving #314's export/verification repair and covering superseded unlocks. Tie cancellable busy state to the active controller, keep durable save/delete ownership independent, and prevent stale completions from changing a newer operation.
- Acceptance: both export/verification orders with delayed success and rejection; unlock supersession; explicit cancel, idle/session changes and unmount; pending durable writes retain their busy state; existing own-import/unlock completion remains valid; targeted component suites, TypeScript, lint, static Pages build and a delayed-operation browser journey pass.
- Other active recovery/privacy/integration PRs remain separately owned. Inspect live heads before publication; any continuation of #314 must be a verified fast-forward. No deployment, release or broader consolidation is part of this repair.
- State: ownership recorded before edits. PR #314's existing hosted checks passed, but independent source review found unlock ownership incomplete. New verification results will be recorded after execution.
- Continuation result: controller-owned cancellable state and independently owned durable writes implemented; refreshed main `aa3df1cb37274fae73af0ca957183c15c51b62d3` preserved. Final local SellerKeys selection passed 74/74 across seven files, scoped TypeScript and targeted lint passed, and the lean build/postbuild passed. Two new browser journeys are committed but local Chromium launch is blocked; full-project TypeScript and hosted browser qualification remain gates. The source-pinned supersession handoff records exact scope and limits. PR #314 is continued through a leased fast-forward; no main merge or deployment.

## QA-02 payment URI builder length — 2026-11-20 UTC (automation cycle)

- Worker: sequential ChatGPT bug-repair coordinator; no subordinate or independent worker claimed.
- Isolated branch: `automation/20261120T0641Z/bug/payment-uri-aggregate-length`; exact base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Finding: QA-02 / CORE-QA-01, source-pinned read-only QA at PR #309 (source `c977b5d6723f6822c3b5d86cd6b231712c53c395`), applies unchanged to base.
- Owned paths: `packages/payment-uri/src/query.ts`, `bitcoin.ts`, `solana.ts`, `tron.ts`, new `builder-length.test.ts`, and `docs/handoffs/PAYMENT_URI_LENGTH_20261120.md`. This ownership registry entry is additive.
- Dependencies: existing `splitUri` cap `MAX_URI_LENGTH=2048`; no other owner found via current open-PR metadata and scoped search; refresh before integration. No contract, wallet, relayer or main changes.
- Acceptance: builders never return a URI that their matching parser rejects solely for exceeding 2048 encoded characters; reject overlength as typed `TOO_LONG`; preserve valid vectors, NFC text, token/reference/amount semantics; test below/at/above cap and original QA examples. Do not merge without full hosted qualification, independent review, fresh ownership and deployment-gate checks.
- Evidence at claim: repository Git checkout unavailable (GitHub DNS resolution failed); no repository tests run yet. Only scoped GitHub source inspected. Scope intentionally excludes unrelated findings QA-01/QA-03 and QC-01.


## TRON range completeness recovery — 2026-11-20 continuation R2

- Worker: `/root/branch_recovery_r2`; coordinator: `994a0d214fb9-root`.
- Branch: `integration/ghostpay-tron-range-20261120-r2`; exact base: `87c3bf5a59f4d443c9e5cf81368162554a5315c3` (PR #321, itself based on main `aa3df1cb37274fae73af0ca957183c15c51b62d3`).
- Owned product paths: `packages/tron-adapter/src/rpc.ts` limited to `getBlockRange`; `packages/tron-adapter/src/scan.test.ts`; `apps/web/src/features/tron/fixtures.testutil.ts`; `apps/web/src/features/tron/chain.hardening.test.ts`. Owned evidence: `docs/consolidation/continuation-r2-20261120/` and this additive claim.
- Acceptance: a requested block range must contain every requested height in order before scanner results or account/memo lookups proceed. Missing first, middle, last, or all blocks must fail with the existing typed invalid-response error. Preserve valid complete ranges, native/TRC-20 scanning, cancellation checks from #321, current RPC privacy isolation, parser bounds and original assertions.
- Provenance: selectively recover missing source from PR #271 head `429a4de80b9ec53177b17d89d18ce8ec91a08814`, retaining original completeness contribution `22af2074a086d9957a18e310ef8572b28d1facd0` and fixture/regression correction `146e52481733fec5fc95580eb9d2d41a01a05df0`.
- Ownership reconciliation: #271/#250 and broad #278/#262/#264 remain preserved donors. Root explicitly assigned this isolated recovery after current source/PR inspection. No existing donor branch is mutated. #321 owns `scan.ts` and its new cancellation test; those files remain unchanged. Other workers own retention and current CI triage. Root owns publication, shared refs, merge decisions and coordination metadata.
- Sequence: save full live branch census and this claim; commit recovered tests/fixture before runtime; execute controlled RED checkpoint through coordinator scheduling; restore only the missing range check; run applicable qualification and independent review. No dependency installation/copy or broad workflow rerun is part of this worker's initial scope.
- Evidence at claim: #271 has 36 successful hosted checks, three deployment-only skips and one beta failure during browser OS-package installation (Ubuntu mirror connection/resource failures, apt exit100). No beta assertions ran. Its prior successful source tests do not qualify this new composition. #321 current checks remain incomplete.


## TRON range completeness independent qualification — 2026-11-20

- Worker: `/root/range_qualification_r2`; coordinator: `/root`.
- Branch: `integration/ghostpay-tron-range-20261120-r2`. Frozen application/test input: `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272`, tree `46c186bfb4f7e15b384c9a0ba361790d8c7e6876`.
- Owned changes: additive qualification status here and `docs/consolidation/continuation-r2-20261120/TRON_RANGE_QUALIFICATION.{md,json}` only. Product source and previous ownership records are immutable inputs.
- Acceptance: read the independent source approval; verify the supplied RED evidence; rebuild matching libraries; execute original package coverage/typecheck/lint/build, all web TRON test files, full web TypeScript/typed lint, and the full-profile production build with original postbuild scan. Record exact commands, source, dependency reuse, results, limits and hashes. Preserve every original threshold and assertion.
- State at claim: source review approved by `/root/ci_triage_r2`; original library build is running in a separate clean detached qualification worktree. No GREEN or complete qualification result is asserted by this claim.
- Boundaries: no source/dependency/workflow changes, browser attempt, live RPC/funds, deployment, remote publication or shared-ref/lease mutation. Root owns publication and promotion.


Qualification completion: application/test source `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272` passed all eleven recorded gates once. Package coverage: 107/107; web TRON selection: 50/50; zero skips. Full web typecheck/lint and full-profile production build/postbuild scan passed. Independent source approval preceded GREEN. Exact commands, RED evidence, raw output bytes/hashes, dependency/cache provenance and all 19 build-artifact hashes are preserved in `docs/consolidation/continuation-r2-20261120/TRON_RANGE_QUALIFICATION.{md,json}`. Source remains unchanged; only documentation follows the qualified checkpoint. Hosted/browser/full-web-suite boundaries remain open. Worker processes stopped and heavy slot released; root owns publication and promotion.

## Late-payment handling — Pages seller reconciliation (2026-11-23)

- Worker: Codex. Isolated branch: `codex/ghostpay-late-payment-20261123`. Base: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Owned paths on this branch: seller reconciliation matcher, encrypted vault, Scan and invoice registry/create UI, narrowly scoped web locale keys and regression tests, and `docs/handoffs/LATE_PAYMENT_20261123.md`.
- Continue the M3 source analysis from `6b6a030c598b0beeb3d38846e753a8b2249e96d6` without modifying the M1 wallet-attempt paths or its owner's branch. No shared integration under this claim.
- Acceptance: canonical timing and existing transfer finality; durable visible provisional, accepted and invalidated evidence; explicit local seller decision; replacement warning; regression and affected Pages qualification on the resulting commit.

## Accepted late payment after a reorg

Worker: Codex on `test/seller-accepted-late-reorg`, stacked on PR #533 at `90e3fff019d14d8df4c610daf2080a32140686de`.
Own the late-payment case in `apps/web/e2e/core-journey.spec.ts` and this claim. Exercise the existing seller scanner and encrypted ledger through a confirming-block replacement, rescan, and page reload. Check the same invoice loses its paid status and the same payment retains its original seller decision.

Follow-up QA on `qa/accepted-late-reorg-546`, based on the #546 head `7391b31e37d319e79a21b0aa9af89f6900e41241`, for integration into the same PR. Exercise generated reorg, rescan and reload sequences, transient canonical-header loss, and unchanged-block controls. Paths in scope are the existing core browser journey, invoice vault regressions, and the seller reconciliation/scanner code for failures reproduced by those tests.

 
## 2026-11-24 — scan locale reconciliation fixture qualification
- Worker: sequential ChatGPT cycle 20261124T1437Z; branch `automation/20261124T1437Z/bug/scan-locale-vault-fixture`; exact #599 parent `0c7f680d0791668a68c3a92d7d4ba44087dcf2b8`; main observed `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
- Owned paths: `apps/web/src/views/ScanPrivacy.i18n.test.tsx`, this additive claim and `docs/handoffs/SCAN_LOCALE_VAULT_FIXTURE_20261124.md`. Explicit continuation of #599; preserve #575/#546/#533 and their original branches. No product, storage policy, or deployment edits.
- Evidence: #599 native web job 138355406523 fails at checkpoint count > 0. Its Scan awaits actual reconciliation vault persistence before allowing checkpoint advancement; this jsdom test lacks the browser IndexedDB fixture. Reuse the existing Scan.test.tsx in-memory ciphertext CAS adapter and actual guarded vault. Preserve all locale, no-replay, checkpoint and settings assertions.
- Acceptance: native web tests, typed lint/typecheck, fresh hosted acceptance and independent review of this exact child. Local checkout DNS blocked; no local native test pass claimed. Bounded ownership checks found no same-file change in 14 relevant PR inventories, no exact-path claim on main, no #599 child returned by search. Integration lock observed released at generation 20; not acquired; no shared integration.
## 2026-11-19T08:36Z — isolated JSON canonicalization correctness repair

- Worker: ChatGPT single sequential development/audit phase, cycle `20261119T083600Z`; no concurrent subagent and no independent review claimed.
- Branch: `automation/20261119T083600Z/bug/json-canonical-array`, exact base `14ded337a10c140d7a9f9a9238ec038587d925bb` (main observed at branch creation).
- Owned paths: `packages/invoice-schema/src/json.ts`, `packages/invoice-schema/src/json.test.ts`, and this own-branch claim only. Other owners' heads, docs/automation ledgers, contract, CLI and deployment code remain untouched.
- Finding: the exported `canonicalize` array code uses `Array.map` (which skips holes); a sparse array can silently canonicalize to a different array or invalid JSON. Reject unsupported sparse/extra-property array input rather than returning unrepresentative signed/serialized bytes.
- Acceptance: failing regression against baseline for holes and non-index/symbol own properties; minimal dense-array-preserving validation; regressions green, existing tests and TypeScript/lint when feasible; exact-head hosted CI, independent reviewer and lock-aware integration required before any merge.
- Conflicts/dependencies: PR #262/#264 touch `receipts.ts` but not the two owned `json*.ts` files at inspected heads; those large candidates remain active. PR #258/#261 CI is pending. Integration lock ref is released at observed `3ae60de55add2763aa7d7a44033d11b96df13adb`; no shared integration authorized by this task.
## QA-03 typed decimal-option guard — 2026-11-20 UTC (same bounded cycle)

- Worker: sequential ChatGPT API-correctness lane; branch `automation/20261120T0641Z/bug/payment-uri-decimal-options`, base `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Source: QA-03 / CORE-QA-02, documentation-only [PR #309](https://github.com/djshellshoxxx/GhostPay/pull/309) and current unchanged `packages/payment-uri/src/decimal.ts` blob `8d8ceb070d29d511a1080861f878bbc6d367798f`.
- Owned paths: `packages/payment-uri/src/decimal.ts`, new `decimal-options.test.ts`, additive claim, `docs/handoffs/PAYMENT_URI_DECIMAL_OPTIONS_20261120.md`. Separate from sibling QA-02 URI-length PR; do not edit its branch or owned paths.
- Acceptance: public parseDecimal accepts integer precision 0–77 consistently with toAtomic/formatAtomic; rejects fractional, nonfinite, negative, overly large and nonnumeric runtime precision options with stable typed INVALID_AMOUNT before BigInt exponentiation; preserve exact decimal roundtrips and fixed 8/18 scale behavior. Test first, no new feature or policy decisions.
- No native delegation or independent approval; local repo checkout was unavailable due blocked GitHub DNS. Require hosted real test/typecheck/lint and independent verification before merge. No shared ledger/main/lock/deployment changes.

# QC-01 encrypted reconciliation actionability — 2026-11-20

Worker/cycle: GhostPay scheduled cycle 10, sequential bug-test and integration triage; no independent worker delegated.
Branch: `automation/20261120T1042Z/bug/ledger-actionable-activation`.
Verified base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` (main before this isolated task); tracking input blob: `c3b3f28796557d98536bf5220d5eb923a53eb935`.
Owned paths: `apps/web/src/components/ReconciliationLedger.test.tsx`, additive this ownership claim, isolated `docs/handoffs/LEDGER_ACTIONABILITY_20261120.md`.
Dependency/source: QA-309 QC-01 evidence in `docs/qa/2026-11-19-readonly/HANDOFF.md` on PR #309. No production logic or cryptographic policy change.
Acceptance: replace the two presence-only activation clicks with explicit enabled-state synchronization; add deterministic delayed readState regression proving no premature activation, one activation after the button becomes actionable, and imported historical data remains untrusted. Preserve original provenance assertions, avoid sleeps/timeout changes and test-product regressions.
Conflicts checked: open PR #306/#307/#310/#314 changed-file lists do not include this test; separate source owners preserved. Do not integrate or merge into main without external independent review and full exact-head CI; no deployment.
Status: ownership recorded before test modifications; repository tests not yet run.
# GP-BUG-03 — Chain-scoped encrypted tag list (2026-11-20)

Cycle: `20261120T1435Z`; worker: sequential coordinator acting as isolated bug implementer (no independent verifier available).
Branch: `automation/20261120T1435Z/bug/chain-scoped-tags`; exact base/main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/src/views/Scan.tsx`, new `apps/web/src/views/Scan.tags.scope.test.tsx`, additive `docs/ai/ACTIVE_WORK.md` claim, and a new `docs/handoffs/SCAN_TAG_SCOPE_20261120.md`.
Finding: GP-BUG-03, source-pinned audit #312; `Tags` retains an old chain's cached list when the chain picker changes and a stale `vault.list` result can repopulate the wrong view.
Acceptance: old-chain tags vanish synchronously on chain change; current chain list reloads while unlocked; asynchronous old-chain completion cannot overwrite current-chain data; returning to the earlier chain fetches its list; seller identity/session replacement cannot display an old list. Use real component tests with controlled local vault readbacks; preserve existing unlock, lock, wipe, session checks and no-network behavior.
Dependencies: main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`, existing audit PR #312 and unmerged broader #278. #278 changes Scan for private scanning but still contains this bug at inspected head `417f7c71`; do not edit its branch. Avoid work in #293's privacy/Settings and #316's print areas. Any merge requires new-head verification and integration-lease ownership. No deployment/release/funds.
Validation plan: test-first Vitest/jsdom; TypeScript, lint, web tests, full+lean hosted browser CI, independent review. Git CLI currently cannot resolve github.com, so local repository tests may be unavailable; report actual execution honestly.

---

# Runtime decode/query parameter boundaries — 2026-11-21 08:42 UTC

- Cycle/coordinator: `20261121T0842Z`, single assistant; distinct sequential audit/implementation/verification phases, with no independent native worker available.
- Branch: `automation/20261121T0842Z/bug/payment-uri-query-boundaries`; base `3d57d9881033f60786fecb3a71562af445441a3e` (existing PR #370), itself dependent on #360. This is a bounded continuation, not a rewrite of either parent's code. Latest separately observed main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned files: `packages/payment-uri/src/query.ts`, new `packages/payment-uri/src/query-boundaries.test.ts`, this additive branch-only ownership claim, `docs/handoffs/PAYMENT_URI_QUERY_BOUNDARIES_20261121.md`. Do not alter parent branches or shared ledgers.
- Finding: `pctDecode` and `parseQuery` allow invalid JS runtime inputs to throw raw `TypeError` rather than the existing typed `INVALID_INPUT`. Exported `buildQuery` interpolates unvalidated dynamic keys, permitting a malformed or key-injecting query even though `parseQuery` refuses the key grammar. This is defensive exported-library correctness; no demonstrated Pages wallet exploit or funds-loss claim.
- Acceptance: test-first typed rejection for nonstring decode/query inputs, fail-closed query-builder key validation using the parser's existing KEY grammar, preserve valid RFC3986 Unicode encodings, repeatable known keys, EIP ABI parameter keys, existing malformed UTF-16 handling, and no change to accepted valid URIs. No contracts, keys, services, dependency, fee, policy, release, workflow or hosting changes.
- Ownership/integration: #360 and #370 own earlier encoder fixes; this branch stacks on exact #370 source. Broad recovery/privacy #372/#373 is independently active and untouched. Existing integration lock is held at generation 11 by `994a0d214fb9-root-r3`; this run does not acquire or change it and may not merge shared targets.
- Verification requirement: focused executable regression, typecheck, lint, build, hosted exact-head qualification and independent reviewer before promotion; document any unavailable checks accurately. Keep as draft if unqualified.


---

# GP-BUG — UndoQueue maxPending nonfinite/fractional option validation (2026-11-21)

Worker: GhostPay BUG-ONLY repair round, sequential bug implementer; no separate native verifier. Branch: `automation/20261121/bug/undo-maxpending-bound-r2` at main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.

Owned paths: `packages/ux-flow/src/undo.ts`, new `packages/ux-flow/src/undo.option-bounds.test.ts`, append-only ownership entry here, and new `docs/handoffs/UNDO_MAXPENDING_BOUND_20261121.md`. No other source ownership.

Observed defect: `UndoQueue` constructor validates `maxPending < 1` but accepts `NaN`, `Infinity` and fractional `1.5`; with `NaN` a threshold comparison `pending >= maxPending` is never true, disabling the queue cap. Source blob before changes `2e261040b9e2d11c0bd482c2622580d5ff41dbe4`; Node 22 source-equivalent reproduction only, not repository Vitest. Test-first regression must be committed before fix.

Acceptance: reject nonfinite/fractional maximum-pending options using existing `FlowError('BAD_OPTION')`; preserve positive-integer queue limits, cancellations, snapshots and ordinary transitions; no dependencies, protocol, fee, wallet or contract changes.

Ownership: checked changed-file inventory for all 166 currently open GitHub PRs in two pages, no claim of the two source/test paths; older broad #278/#372 touch package manifest, not these paths. Recheck before integration. External integration metadata branch held at generation 11 by `994a0d214fb9-root-r3`; do not acquire, overwrite or merge while held. Exact-head hosted CI, applicable browser/native checks and genuine independent review must qualify before merge. No local checkout assumed.

---

# GP-BUG-R4 — fiat separator round-trip failure (2026-11-21)

- Worker: one isolated bug-repair coordinator, no independent verifier available. Branch: `automation/20261121/bug/fiat-overlapping-separator-r4`; exact starting main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths only: `packages/ux-fiat/src/format.ts`, new `packages/ux-fiat/src/format.separator.test.ts`, this additive ownership entry, and new `docs/handoffs/FIAT_SEPARATOR_ROUNDTRIP_20261121.md`. Do not change shared existing `fiat.test.ts` (broad PRs #278/#372 include it).
- Observed defect: `formatFiatParts` accepts groupSeparator `'..'` and decimalSeparator `'.'`, and renders 1,234.56 minor-equivalent as `1..234.56`; `parseFiatInput` rejects that emitted text as multiple decimal separators. Source blob `ef6adf3fb5833d9746eb272813e7c4f5bc2c1409`; isolated Node 22 source-equivalent reproduction RED (not repository Vitest).
- Acceptance: regression committed before source change; parse existing valid rendered multi-character group separators by longest complete token, preserve normal US/DE grouping and explicit malformed-input rejection. Scope only the existing pure fiat formatter/parser; no payment interactions, dependencies, feature additions, deployment, broad refactors or shared branches.
- Ownership: at discovery, live open-PR title/body search for `ux-fiat` returned none; exhaustive per-file pagination of broad #278 (1,495 files) and #372 (1,907 files) found `fiat.test.ts` but not `format.ts` or new focused test. Sampled other broad #302/#307/#367/#371 and recent #390/#395/#404/#407/#409 without overlaps. Recheck all relevant heads before merge. Integration metadata ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` reports generation-11 held by another coordinator: no merge/lock changes authorized.


## GP-BUG-R5 — reject unsupported ux-export summary period options (2026-11-21)

- Worker: GhostPay Bug Repair Rounds, one sequential ChatGPT implementation/review coordinator; **no separate independent verifier available**.
- Branch: `automation/20261121/bug/summary-period-runtime-guard-r5`, based on live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-export/src/summary.ts`, new `packages/ux-export/src/summary.period-boundary.test.ts`, this **append-only** registry section, and `docs/handoffs/SUMMARY_PERIOD_RUNTIME_BOUND_20261121.md`. The existing `summary.test.ts` remains untouched.
- Evidence: exported `periodKey` falls through to daily UTC grouping for unsupported period values, while `summarize` never checks `options.period` (including for empty rows). This silently returns wrong summary buckets instead of the existing `INVALID_OPTION` error for unsupported options.
- Acceptance: regression first reproduces unsupported runtime string/null/undefined/numeric periods being accepted; minimal `ExportError('INVALID_OPTION')` guard in both entry points; preserve five valid period groupings, status/amount/date semantics, CSV and aggregation. No new API, dependency, interface, contract, wallet, RPC, deployment or release change.
- Ownership: read **all 173** live open PR changed-file inventories (2026-11-21) and found **no** changes under `packages/ux-export/src/`. Refresh exact heads/conflicts before any eventual integration. PR #390 remains externally owned and unchanged; generation-11 metadata-only integration lease belongs to another coordinator and **must not be acquired or used to merge**.
- Verification: repository checkout is unavailable from this executor because `git ls-remote` cannot resolve `github.com`; record isolated source-equivalent Node verification distinctly from actual hosted GitHub CI. Native browser checks and separate review remain required as applicable.


---

# GP-BUG-R6 — pay-again EVM address case-only false block (2026-11-21)

Worker: single ChatGPT bug-repair coordinator; no independent verifier available in this run.
Branch: `automation/20261121/bug/payagain-evm-address-case-r6`; exact base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-presets/src/payAgain.ts`, new `packages/ux-presets/src/payAgain.address-case.test.ts`, additive `docs/ai/ACTIVE_WORK.md` and new `docs/handoffs/PAYAGAIN_EVM_CASE_20261121.md`. No other files claimed.
Failure: `derivePayAgain` uses string inequality for address-change blocking, so the same 20-byte EVM account differing only in hex letter case is classified as changed and blocks a repeat draft. The host has already validated the resolved address. Preserve exact/case-sensitive comparison on non-EVM addresses and noncanonical hex text.
Acceptance: commit a failing deterministic regression before the minimal production repair; compare 0x + 40-hex-digit addresses case-insensitively *only* for `eip155:` chains; distinct EVM addresses must remain blocking and non-EVM addresses case-sensitive. Preserve never-auto-send, required review, fee/risk flags. Node source-equivalent checks and exact-head hosted CI, independent review and native browser verification (if applicable) documented separately.
Ownership: inspected all 175 then-open PR file inventories; no PR changed `packages/ux-presets/src/payAgain.ts` or `payAgain.address-case.test.ts`. Existing broad PRs #238/#262/#264/#278/#372 own only `validate.test.ts` and/or package metadata; leave their files untouched. Recheck before integration.
Integration lock: `automation/ghostpay-integration-lock` at generation 11, status `held` by `994a0d214fb9-root-r3` (observed blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`), not this worker. No main merge or lease mutation.


---

# GP-BUG-R7 — stale reachability incorrectly summarized as OK (2026-11-21)

- Coordinator: one ChatGPT bug-only worker; no separate verifier currently available.
- Branch: `automation/20261121/bug/netstate-stale-summary-r7`; exact main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-core/src/netstate.ts`, new `packages/ux-core/src/netstate.stale.test.ts`, this strictly additive ownership claim, and new `docs/handoffs/NETSTATE_STALE_SUMMARY_20261121.md`. No other source or test is claimed.
- Confirmed source defect to reproduce: `effective()` marks old successful probes `stale`, but `summarize()` can continue returning `overall: 'ok'` for expired RPC/relayer evidence; a stale former clock skew can also mask the stale condition. Preserve existing statuses and priorities; do not introduce a new UI state.
- Acceptance: test-first regression for stale-only RPC, mixed fresh/stale RPC, stale relayer, and stale clock-skew; expected existing `overall: 'unknown'` rather than false `ok`/obsolete skew. Preserve fresh OK, real unreachable/degraded precedence, no new dependencies/network/feature changes.
- Ownership: all 173 open PR changed-filename inventories checked this cycle; none changes either owned `netstate` path. Broad PRs #238/#262/#264/#278/#372 change other `ux-core` paths only. Recheck before integration.
- Lock: separate `automation/ghostpay-integration-lock` branch has `status: held`, generation 11, owner `994a0d214fb9-root-r3` (the recorded expiry is in the past; no authority to steal/release). Never merge without legitimate coordination.
- Verification: exact base production Git blob `3082d56ff1ecabf73ab4fb65e69c318053095954`. Full Git checkout is unavailable locally (github.com DNS fails); separate source-equivalent Node checks and hosted exact-head CI only. No independent review claimed.

---

# GP-BUG-18 — Weekly recurrence must stop at MAX_YEAR (2026-11-21)

Worker: GhostPay Bug Repair Rounds cycle 8; one sequential coordinator, no independent verifier identity or native repo checkout available.
Task branch: `automation/20261121/bug/ux-schedule-weekly-maxyear-r8` created from exact live main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths only: `packages/ux-schedule/src/recurrence.ts`, new `packages/ux-schedule/src/recurrence.year-boundary.test.ts`, additive claim in this file, and `docs/handoffs/WEEKLY_RECURRENCE_MAX_YEAR_20261121.md`.
Source baseline: recurrence.ts Git blob `df6d0c8d3ee1918ed79055446b7a80832daca260`.
Observed source-equivalent Node 22 reproduction: weekly rule anchored 2200-12-28 with Thursday weekday yields 2201-01-01; Friday also yields 2201-01-02; the library's MAX_YEAR is 2200 and daily/monthly rules stop there. Root cause: weekly outer loop tests `base < maxDays` without bounding `base + wd` in its inner weekday loop.
Acceptance: failing regression committed before production change; no weekly occurrence on or after 2201-01-01; all valid 2200 final-week occurrences preserved, historical valid weekday schedules untouched; no new dependencies, protocols, payment interaction or feature work. Reproduce with source-equivalent checks and exact-head hosted CI; no false claims of local Vitest. Keep draft for independent review and held generation-11 integration lock. 178 open PRs' changed-file inventories were checked (pages 1 and 2); none changed the two owned source/test paths. PRs #372/#278/#264/#262/#238/#224 own nearby package manifests/template tests, not this bounded recurrence fix. Recheck before merge.


---

# BUG-ONLY cycle R9 — sweep-timing invalid urgency policy (2026-11-21)

- Worker: autonomous GhostPay bug-repair coordinator, single sequential implementation/review; no independent verifier available.
- Branch: `automation/20261121/bug/ux-fees-urgency-validation-r9`; exact base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths exclusively: `packages/ux-fees/src/timing.ts`, new `packages/ux-fees/src/timing.urgency-validation.test.ts`, this additive branch-local claim, and `docs/handoffs/UX_FEES_URGENCY_RUNTIME_VALIDATION_20261121.md`.
- Reproduction: source blob `cafc7f958424f87ad867b852607bd2d6ed87a912` treats invalid runtime urgency `'emergency'` like normal urgency and produces `wait` for 1..100-gwei history/current 90 gwei, instead of rejecting malformed caller input. The documented strict input validation and `'normal' | 'urgent'` contract require invalid enum values to be refused.
- Acceptance: failing regression committed before fix; reject unsupported urgency with existing `UxFeesError`/INVALID_INPUT, retain normal/default `wait`, valid urgent `ok`, and other advice/fee/privacy behavior. No new features, dependency, contracts, transport, deployment, release, or real traffic.
- Ownership: 179 live open PR file inventories inspected in batches on 2026-11-21, zero changed paths under `packages/ux-fees/src/`; broad #278/#264/#262/#372 touch its package.json only. Reinspect before integration. The metadata-only generation-11 integration lock remains held by another coordinator; no lock takeover or main merge authorized.
- Verification: only source-branch-equivalent reproduction executed before publication, not local repository Vitest. Hosted exact-head CI and independent review pending.

---

# GP-BUG R11 — notification label surrogate-safe truncation (2026-11-22 UTC)

- Worker: scheduled bug-only coordinator, single executor; no independent reviewer available in this run.
- Branch: `automation/20261122T0218Z/bug/notify-label-surrogate-cut-r11`; exact baseline `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-notify/src/redact.ts`, newly created `packages/ux-notify/src/redact.surrogate.test.ts`, this append-only task record, and `docs/handoffs/NOTIFICATION_LABEL_SURROGATE_CUT_20261122.md`.
- Confirmed pre-fix behavior: `sanitizeLabel('a'.repeat(39) + '🚀', 40)` and `sanitizeLabel('x'.repeat(23) + '📬', 24)` return an isolated high surrogate from UTF-16 `.slice(0,max)`; these modes are reached by notification params and lock-screen label respectively.
- Acceptance: regression first, then smallest fix to prevent cutting a valid surrogate pair; preserve the UTF-16 unit cap, control/bidi stripping, whitespace folding, ordinary ASCII, and full pairs within the cap. No new dependencies, API changes, host calls, feature work or release.
- Coordination: 191 open PR metadata entries inspected at discovery; changed-path checks of targeted recent and broad PRs showed #238/#262/#264/#278/#372 own `redact.test.ts` but not the production file or new isolated test; #409 separately owns `cache-policy.ts`; full 191 changed-path inspection was not completed, so reconcile remaining ownership before any integration. Do not modify others' branches.
- Gate: integration-lock branch `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` is a separately held generation-11 lease. Never take over, merge or deploy from this task. Exact-head CI, browser applicability, independent review and owner clearance required.

---

# GP-BUG-14 — reject threshold with zero guardians (2026-11-22)

Worker: ChatGPT GhostPay BUGS-ONLY automation run 20261122T0326Z; one sequential implementer; no independent verifier available.
Branch: `automation/20261122T0326Z/bug/ux-privacy-empty-guardians-threshold`, exact frozen main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-privacy/src/policy.ts`, new `packages/ux-privacy/src/policy.guardian-threshold.test.ts`, this append-only registry entry and `docs/handoffs/UX_PRIVACY_EMPTY_GUARDIANS_THRESHOLD_20261122.md`. Existing `policy.test.ts` belongs to broad PRs #238/#262/#264/#278/#372 and remains untouched.
Reproduction: on main `validateFriendlyPolicy` accepts `guardians: []` with `guardianThreshold: 1` because the branch for an empty array skips threshold validation, and the missing-guardians check runs only when the property is absent. This violates the interface's threshold range of 1..guardian count; `describePolicy` and `toSchemePolicyInput` accept the inconsistent draft.
Acceptance: test-first failure for empty-list threshold 0/1/2 and successful empty-list-without-threshold and populated valid guardians; return the existing INVALID_THRESHOLD issue and reject through existing describe/convert paths. No policy-scheme/contracts, protocol, UI, wallet, dependencies or deployment edits. Hosted exact-head CI and independent review before merge.
Ownership evidence: current main and PR inventory 195 open as checked at task start; large PRs #238/#246/#262/#264/#278/#307/#372 and recent scoped PRs have no changes to `policy.ts`; broad PRs own `policy.test.ts`. Shared generation-11 integration lease held externally, do not merge to main.
Runtime: native checkout unavailable (github.com DNS does not resolve); do not claim local Vitest. Hosted CI required.

---

# GP-BUG — PWA manifest icon purpose whitespace (2026-11-22)

Worker: single automated GhostPay BUG-ONLY engineering coordinator; no genuine separate verifier in this execution.
Branch: `automation/20261122/bug/ux-notify-manifest-purpose-whitespace`; exact base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-notify/src/manifest.ts`, new `packages/ux-notify/src/manifest.purpose-whitespace.test.ts`, additive `docs/ai/ACTIVE_WORK.md`, and new `docs/handoffs/UX_NOTIFY_MANIFEST_PURPOSE_WHITESPACE_20261122.md` only.
Finding: `checkIcons` uses `purpose.split(' ')` for a space-separated manifest keyword list. Two ASCII spaces yield an empty token, causing an otherwise valid `maskable  any` icon to be rejected as `invalid_icon_purpose`/ `icon_purpose`. Tabs and ASCII newlines, also valid whitespace separators, likewise fail. This is observable with pure validation; no service worker/network/funds involved.
Acceptance: test-first regression for multiple ASCII whitespace separators while keeping empty/unknown purposes rejected, exact same valid icon-size requirements and existing manifest behavior; smallest source edit, source-hash-matched reproduction where possible, hosted CI, independent review before integration. No feature implementation, new dependencies, contract, deployment or release.
Ownership: inspected the pre-publication 196-open-PR inventory from #438 plus changed-file inventories for broad PRs #238/#262/#264/#278/#307/#372/#367/#365/#371/#395/#249/#248/#251/#254/#270/#274/#276/#302/#310/#324: no `packages/ux-notify/src/manifest.ts` ownership found. PR #409 owns nearby `cache-policy.ts` and #433 owns `redact.ts`; neither is touched. Continue checking live PR heads before integration. Shared integration lock generation 11 held by another coordinator; do not write/merge main.

---

# GP-BUG-R3 — reject duplicate CSV ChunkWriter header (2026-11-22 UTC)

- Coordinator: one ChatGPT automation worker; no independent verifier available. Branch: `automation/20261122T0522Z/bug/ux-export-header-once-r3`; baseline main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-export/src/encoder.ts`, new `packages/ux-export/src/encoder.header-once.test.ts`, this additive branch-local claim, and `docs/handoffs/UX_EXPORT_HEADER_ONCE_20261122.md`. Do not edit other workers' branches or files.
- Reproduced existing behavior from main `encoder.ts` blob `b54cdede86aee5802045e73461a65e18bf3311e9`: public `ChunkWriter.header()` can run twice, emitting a repeated CSV header in one export despite its documented first-call-only contract. Source-equivalent Node 22 replay: `id\\r\\none\\r\\nid\\r\\n`; no exception. This is not a repository Vitest run.
- Acceptance: commit a failing new Vitest regression before the source fix; reject a second header with existing `INVALID_OPTION` error before mutating writer state, preserve first header/rows/chunking/BOM/size limits, use no new dependencies. Verify with hosted exact-head CI and applicable checks; independent review and held generation-11 integration lease are required to merge.
- Ownership at claim: checked PR #390 exact-head status (five successful workflows, no recorded independent reviews); inspected #415 (`summary.ts` only) and source-file paths for broad #238/#239/#240/#246/#256/#269/#278/#302/#303/#307/#315/#346/#361/#365/#367/#371/#372/#397, none claimed `packages/ux-export/src/encoder.ts`. The R30 196-open-PR metadata census and newly opened #438–#443 are also noted; full fresh all-PR path re-scan not claimed. Do not merge or take integration lock.


---

# R37 — Block ambiguous fee-preview asset symbols (2026-11-22)

- Worker: branch consolidation coordinator, isolated from concurrent automation workers.
- Branch: `automation/20261122-r37/bug/ux-fees-asset-symbol-collision`; exact base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-fees/src/preview.ts`, new `packages/ux-fees/src/preview.asset-symbol-collision.test.ts`, this additive claim, and `docs/handoffs/UX_FEES_ASSET_SYMBOL_COLLISION_R37.md`.
- Source-confirmed problem: preview asset totals are grouped by `asset.id` but the collision check only blocks mismatched decimals; different validated ASCII symbols sharing the same id and precision can be silently summed and the fee preview can say `canProceed: true` with misleading payer totals. Existing tests cover unequal decimals only.
- Acceptance: test first for symbol-only id collisions in network, router buffer and flat security-fee lines; preserve identical assets, distinct ids and current existing decimal-collision rule. Extend only the existing block warning `fees.preview.warn.assetMismatch`. No signing, network, contract, key, fee-rule, or custody changes.
- Ownership: relevant recent #421/#423/#425 modify only timing paths. Broad #278/#262/#264/#372 file inventories do not include `packages/ux-fees/src/preview.ts`; check all active PR overlaps again before merge. Integration lock `automation/ghostpay-integration-lock` is held generation 11 by another coordinator; no lock transfer, shared merge, deployment, or release authorized.
- Verification: exact-head hosted CI required; no native repository Vitest run is claimed because GitHub DNS blocks local clone. Independent review required before integration.


## Pages automatic language changes on an open page

- Worker: Codex, branch `codex/pages-follow-browser-language`, base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Owned paths: `apps/web/src/i18n/context.tsx`, `apps/web/src/i18n/LanguagePicker.test.tsx`, and this entry.
- Acceptance: with Automatic selected, a browser language change updates the on-screen language and document direction without reloading. A manual selection or an explicit embedding language list keeps precedence. Returning to Automatic uses the current browser preference.
- Fuzz follow-up on PR #551 at `664f8c448a6efb715396ae616e8509024de54d9a`: same Codex worker and remote branch. Also owns `apps/web/src/i18n/LanguagePicker.fuzz.test.tsx`. Exercise browser language lists and fallback, manual choice, and out-of-order catalog success/failure through the picker. Keep fixes in the existing provider.

---

# 2026-11-22 — OP Stack fee serialization fail-closed boundary (isolated)

- Cycle/worker: `20261122T1036Z`, one GitHub-connector engineering coordinator; sequential source audit, regression and repair phases, without native delegation or independent review.
- Isolated branch: `automation/20261122T1036Z/bug/opstack-serialization-boundary`; exact baseline `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da` (web fee source blob `2f55a4af5b36ff10f279c66e0b13dcf83e87b1bb`).
- Owned files: `apps/web/src/lib/opStackFee.ts`, new `apps/web/src/lib/opStackFee.serialization.test.ts`, additive claim in `docs/ai/ACTIVE_WORK.md`, and `docs/handoffs/OPSTACK_SERIALIZE_ERROR_20261122.md`. No shared integration or other branch edits.
- Discovery: `sweepFeeReserve` serializes its untrusted transaction fields *before* entering the existing try/catch; invalid EIP-1559 fields therefore bypass its fixed, user-facing fee-unavailable error. Valid unsigned transaction / oracle behavior must remain unchanged; never sign or quote a fee when serialization fails.
- Acceptance: commit regression tests first for malformed OP Stack transaction fields without making an RPC call, typed localized failure and ordinary non-OP zero reserve; then move serialization inside the existing catch; qualify focused Vitest and applicable CI without weakening checks. No contract, wallet custody, fee formula, gas multiplier, chain allowlist, or policy change.
- Ownership audit: inspected active #372/#278/#264/#262/#349/#307/#380/#454/#455/#461/#462/#452/#449/#450/#274 changed-file lists (including broad stacks); none changed `opStackFee.ts`. This is a *bounded* check, not the full 206+ active-PR semantic audit. Search of open PR descriptions for `opStackFee`, `sweepFeeReserve`, or `GasPriceOracle` returned none. Recheck before integration.
- Durable integration lock observed `held`, generation 11, owner `994a0d214fb9-root-r3`, lock ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; expiry never grants takeover. No main merge or deployment authorized.
- Status at claim: claimed before product-source edits; independent review and full-workspace execution pending.


---
## GP-BUG-ROUND-9 — reject restored notification sequence rewind (2026-11-22)
Worker: sequential ChatGPT BUG-ONLY coordinator, no independent verifier available.
Isolated branch: `automation/20261122/bug/notify-snapshot-seq-r9`; exact main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-notify/src/notification.ts`, new `packages/ux-notify/src/notification.snapshot-seq.test.ts`, additive claim here and `docs/handoffs/UX_NOTIFY_SNAPSHOT_SEQUENCE_20261122.md`.
Finding: untrusted snapshot `seq` can be less than an existing `n<id>` record; restoring it causes the next queue push to reuse a live id, so get/dismiss/read operations may address the wrong item.
Acceptance: commit an explicit failing regression first; reject sequence rewind as existing `record_id` error, preserve legitimate empty/monotonic snapshots and normal queue flow; run available Node reproduction and exact-head GitHub CI; do not claim absent local Vitest/browser checks.
Ownership inventory: 223 live open PRs in REST pages 100/100/23, changed-file lists checked for both owned runtime/test paths, no collisions found. Current main coordination template checked; no claim on these paths.
Integration: independently held generation-11 lock remains external, no merge/lock mutation/release/deployment; independent review and exact-head CI remain required.

---
## GP-BUG-R11 — Reject invalid WalletConnect request clocks (2026-11-22)
Worker: single ChatGPT BUG-ONLY coordinator; no separate independent verifier available.
Branch: `automation/20261122/bug/wcsession-request-clock-r11`; base live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned files: `packages/ux-connect/src/wcsession.ts`, new `packages/ux-connect/src/wcsession.clock.test.ts`, this **append-only** ownership record, and `docs/handoffs/WC_REQUEST_CLOCK_20261122.md`.
Source baseline `wcsession.ts` Git blob `4dc521ec53e5d386217fe495b6c6a7a232734ee3`.
Observed issue: `buildRequest` accepts non-finite, negative, fractional, or unsafe JavaScript millisecond clocks; especially NaN allows an expired session through and stores a pending request with NaN expiry that `sweepExpired` never expires. Minimal scope: validate injected `nowMs` as a non-negative safe integer using the existing typed `invalidParams` error before checking session expiry. Preserve valid request IDs, timeouts, origin/chain/method/params policy and pending immutability.
Acceptance: commit failing regression **before** source edit; test bad clocks, expiry, valid boundary and subsequent `sweepExpired`; reproduce from source-equivalent logic; after repair run targeted available checks and hosted exact-head CI, not claim repository tests without checkout. No dependencies, contracts, traffic, funds, deployment, release or main integration.
Ownership: paginated 228 open PR inventory checked at discovery, all 228 changed-file inventories checked for `wcsession.ts` or the new test (0 direct collisions). #430 owns `compat.ts` not this file; broad #278/#264/#262/#372 also do not change either owned path. Other-worker held integration lock (generation 11) is not owned or modified; leave PR draft until all gates and independent review are met.
Status: claimed, regression and repair not yet committed.

---

# GP-QR-SVG-01 — snapshot validated QR matrix before SVG interpolation (2026-11-22 UTC)

- Cycle and worker: `20261122T1440Z`, one sequential root coordinator/implementer; native independent workers unavailable in this invocation.
- Isolated branch: `automation/20261122T1440Z/bug/qr-svg-matrix-snapshot`; exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `apps/web/src/lib/qr.ts`, new `apps/web/src/lib/qrSnapshot.test.ts`, additive claim here, and `docs/handoffs/QR_SVG_MATRIX_SNAPSHOT_20261122.md`.
- Finding: `qrSvgText` interpolates `qrViewSize(m)` into SVG attributes before `qrPath(m)` validates `m.size`. A getter returning a string on its first access and a valid size on later accesses produces an SVG with caller-influenced extra attributes, despite the intended numeric-only SVG contract. A getter/Proxy-backed `dark` may also change between validation and drawing. Source-equivalent Node 22 reproduction, not evidence of remote/browser exploit. No external ingress confirmed.
- Acceptance: regression-first tests showing the baseline failure; read size and module booleans into an independent bounded snapshot once before SVG interpolation; preserve output for normal matrices and malformed-input errors; run focused checks, keep static Pages behavior, no new dependencies or policies. Do not touch the previously owned QR-classifier, multipart, invoice/secret/recovery paths.
- Ownership and integration: checked #278/#262/#264/#372 and recent focused QR #447 along with #293/#390/#449/#450/#452/#463/#468/#472 changed-file lists, no `qr.ts` ownership observed in bounded check. Other uninspected PRs remain potentially active; recheck before integration. Integration lock `automation/ghostpay-integration-lock` held generation 11 by `994a0d214fb9-root-r3` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: never take over from expiry; no shared/main merges.


---

# GP-QR-SVG-02 — repair exact-head QR snapshot regression lint (2026-11-22 UTC)

- Cycle/worker: `20261122T1640Z`, one root coordinator executing source analysis, targeted repair and qualification sequentially; no delegated or independent reviewer in this run.
- Isolated task branch: `automation/20261122T1640Z/bug/qr-snapshot-lint` stacked strictly on existing draft PR #473 head `f05504b5bcd62aa59c715f7c43934ca88107187a`; current main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: existing `apps/web/src/lib/qrSnapshot.test.ts` test-only lint correction; additive ownership claim in this file; dedicated handoff `docs/handoffs/QR_SVG_SNAPSHOT_LINT_20261122.md`. Parent #473 production and branch remain unchanged.
- Evidence: exact-head CI workflow 45034528113, job 137245225818 `ts-lint` fails at `qrSnapshot.test.ts:38:9` with `@typescript-eslint/no-unsafe-return` (raw GitHub Actions log inspected). The `typescript` aggregate fails downstream; all three relevant browser/web unit/typecheck jobs passed, but CI as a whole is RED.
- Acceptance: make the Proxy fallback's `Reflect.get` return explicitly `unknown` without modifying its runtime behavior or suppressing any ESLint rule; preserve all four PR #473 regression scenarios. Obtain exact-head green lint/CI, independent review and ownership/merge gates before integration. No contracts, wallet, keys, dependencies, deployment, security gates or app behavior touched.
- Integration lock: `automation/ghostpay-integration-lock` held generation 11 by `994a0d214fb9-root-r3` at ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`. Expiry is not takeover permission. No shared/main integration authorized without fresh ownership validation.


---

# GP-BUG-BOOK-SPARSE-R13 — reject missing handle-book entries (2026-11-22)

- Worker: GhostPay BUG-ONLY automation, one sequential implementer; no separate native verifier available.
- Branch: `automation/20261122/bug/ux-links-book-sparse-entries-r13`, exact main base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-links/src/book.ts`, new `packages/ux-links/src/book.sparse-entries.test.ts`, this append-only claim, and new `docs/handoffs/UX_LINKS_BOOK_SPARSE_ENTRIES_20261122.md`.
- Observed defect: `validateBook` iterates user-supplied `entries` with `Array.forEach`, which skips array holes, so malformed runtime state can be silently accepted and later serialized without the missing records. Only an actual dense array should pass. No assertion of a network exploit.
- Acceptance: failing regression committed before repair; reject sparse arrays with typed BOOK errors, preserve empty/dense book validation, JSON serialization and collision rules; minimal source change; run isolated source-equivalent tests plus hosted GitHub CI. No new dependencies or changes to wallet, contracts, payments, release or deployment.
- Ownership: inspected all 235 open PR changed-file inventories across three paginated GitHub pages on 2026-11-22; #399 owns `request.ts`, #392 owns `qr.ts`, and broad #238/#262/#264/#278/#372 own existing tests/package metadata, but none changed `book.ts` or the new regression path. Active registry claims and heads must be rechecked before integration.
- Integration: metadata-only lock generation 11 at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` remains held by external owner `994a0d214fb9-root-r3` (expired timestamp is not authorization). No acquisition, merge or deployment.


---

# GP-BUG-R11 — Reject non-bigint runtime buffer-dust inputs (2026-11-22)

- Worker: GhostPay BUG-ONLY automation, single coordinator; no genuinely separate independent reviewer available.
- Branch: `automation/20261122-r11/bug/hygiene-bufferdust-runtime-types`; exact live-main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Exclusive owned paths: `packages/hygiene/src/buffer.ts`, new `packages/hygiene/src/buffer.runtime-types.test.ts`, this additive ownership claim and new `docs/handoffs/HYGIENE_BUFFERDUST_RUNTIME_TYPES_20261122.md`. Existing `buffer.test.ts` remains untouched.
- Reproduction: exact original Git blobs `buffer.ts@b315a0c8feb0325bf16bd495b764f5c559da4494` and `errors.ts@bd65796a7d14831d16aadd57f7009428b5d8bfef`, locally compiled with TypeScript 5.8.3 and executed under Node 22.16.0. `bufferDust(false, 2n, 3n)` and `bufferDust(NaN, 2n, 3n)` silently returned `0n`; numeric/string paid values and non-bigint gas/price inputs threw untyped native `TypeError` instead of `HygieneError('INVALID_INPUT')`.
- Acceptance: commit a failing focused regression before source repair; reject all non-bigint runtime inputs with existing `INVALID_INPUT` code; preserve non-negative bigint dust subtraction, saturation and existing negative-input errors. No new dependencies, new features, real network/fund interaction, deployment, release or merge without all qualification gates.
- Ownership: inspected changed-file inventories of all 238 PRs open in 2026-11-22 live three-page snapshot; none changed either owned source/test path. PR #372 owns `hygiene/src/ledger.ts` and was explicitly avoided. Reinspect at later integration.
- Coordination: check PR #390 exact-head workflows and separate review gate; integration ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` remains `held` generation 11 by another coordinator. Do not acquire, release or merge.
# GP-POLICY-SPARSE — fail closed on missing array entries (2026-11-22)

Cycle/worker: 20261122T2038Z, one ChatGPT coordinator working sequentially (no native independent verifier). Isolated branch: `automation/20261122T2038Z/bug/policy-sparse-records`.
Exact parent: existing approved-for-development (not integration-approved) draft PR #437 head `9e72c9820ed457f18c2635e17da629216eedbbdf`, stacked to preserve its guardian-threshold repair. Current main observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths on this child branch only: `packages/ux-privacy/src/policy.ts`, new `packages/ux-privacy/src/policy.sparse-records.test.ts`, additive entry in this file, and `docs/handoffs/UX_PRIVACY_SPARSE_POLICY_RECORDS_20261122.md`. The parent PR and existing `policy.test.ts` must not be edited.
Finding: `validateFriendlyPolicy` uses `forEach` for three runtime arrays; JavaScript silently skips sparse holes, potentially accepting policies with missing spend-limit, allowlist or guardian entries. Later `describePolicy` and scheme conversion can throw or display inconsistent row counts.
Acceptance: demonstrate red regression before the fix, reject holes using the existing typed `INVALID_LIMITS`, `INVALID_ADDRESS`, `INVALID_GUARDIANS` policy issues; preserve dense and empty list behavior, threshold and `NOT_ENFORCED` warnings; no contract edits, dependencies, services, deployments or real funds.
Coordination: stacked on parent #437, never rewrite it. Large active PRs #278/#372 and prior #437 source claims remain separately owned. Current integration metadata ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` says held generation 11 by another coordinator; expiry does not release ownership. No shared target updates or merges. Exact-head hosted validation and genuine independent review remain mandatory.

---

# GP-BUG-R11 — vault backup base64url noncanonical pad-bit aliases (2026-11-22)

- Worker: scheduled sequential BUG-ONLY coordinator; no independent verifier available in this execution.
- Task branch: `automation/20261122-r11/bug/ux-vault-base64url-padbits`, forked from live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-vault/src/bytes.ts`, new `packages/ux-vault/src/bytes.canonical.test.ts`, this additive ownership claim, and dedicated `docs/handoffs/UX_VAULT_BASE64URL_PADBITS_20261122.md`. Do not modify existing envelope/backup test files or other workers' changes.
- Reproduction before repair: Git-blob matched `bytes.ts` SHA `9226a2d55abaf930c9d5a358e348f4d69944f479`; Node 22.16.0 with TypeScript 5.8.3 accepts `Zh` and `Zi` as the same byte as canonical `Zg`, `AB` as `AA`, `AR` as `AQ`, and `-_9` as `-_8`. The strict decoder and printable vault-backup inverse do not reject unused nonzero trailing sextet bits. No network or funds used.
- Scope: minimal correction to reject noncanonical trailing base64url bits with existing typed `VaultError('INVALID_INPUT')`; preserve all canonical no-padding encodings, empty bytes, and round-trips. Add dedicated failing regression before source fix and run source-hash-matched standalone checks plus hosted CI. No dependencies, schema changes or new features.
- Ownership: all 242 open PRs at the 2026-11-22 snapshot (three 100/100/42-page REST lists) were individually inspected for the two claimed paths; no direct overlap found. Recheck before integration.
- Shared integration lease: `automation/ghostpay-integration-lock` commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, metadata blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: generation 11 held by `994a0d214fb9-root-r3`, not this worker, despite expired timestamp. No lease acquisition, merge, deployment or release authorized.


---

# GP-BUG-R12 — receipt canonical JSON sparse arrays (2026-11-22)

Worker: ChatGPT automated BUG-ONLY repair round, sequential source/reproduction/check/review phases; no independent verifier delegated or claimed.
Base live main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; isolated branch `automation/20261122-r12/bug/ux-receipts-canonical-sparse`.
Claimed paths: `packages/ux-receipts/src/canonical.ts`, new `packages/ux-receipts/src/canonical.sparse.test.ts`, additive ownership entry here, and new `docs/handoffs/UX_RECEIPTS_CANONICAL_SPARSE_20261122.md`. No shared sources or pre-existing receipt tests may be overwritten.
Discovery candidate: `canonicalJson` uses Array.map(), which skips sparse holes. A one-hole array is serialized identically to [] and multiple holes can produce invalid JSON; violates the existing valid canonical-JSON and reproducibility contract. Confirm runtime behavior and source SHA before implementing.
Acceptance: commit a failing Vitest regression before the smallest implementation change; reject missing array slots using existing `ReceiptError('NOT_CANONICALIZABLE')`, preserve dense arrays/null-prototype objects/nested valid data, and verify deterministic JSON output. Run exact source-matched standalone tests and hosted CI; do not claim workspace/browser tests without evidence.
Coordination: inspected live main, AGENTS/WORKFLOW/HANDOFF/ACTIVE_WORK, #390 exact-head CI/reviews, held generation-11 integration lease; initial broad PR checks #238/#246/#262/#264/#278/#372 and most recent PRs found no collision on proposed paths. Complete all-current-PR changed-path reconciliation before publication or integration. Independent approval and integration-lock ownership remain outstanding; do not merge, deploy, release, transact or alter others' branches.



---

# 2026-11-23 — QR SVG sparse matrix rejection

Worker: sequential ChatGPT BUG-ONLY coordinator; no separate independent verifier. Branch `automation/20261123T2221Z/bug/qr-svg-sparse-matrix` from `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/qr-exchange/src/generate.ts`, new `packages/qr-exchange/src/generate.sparse.test.ts`, new `docs/handoffs/QR_SVG_SPARSE_MATRIX_20261123.md`, and this additive claim only. All 279 open PR file inventories in the initial snapshot through #524 checked; no collision on generate paths. Newer open PRs checked before branch creation. Adjacent owner PRs remain untouched.
Observed source-matched Node reproduction: Array.every skips sparse slots, so an incomplete QR matrix emits a misleading SVG rather than BAD_INPUT (4/10 cases fail). Acceptance: test-first hole rejection at first/middle/last/all slots, preserve dense boolean matrices and dimension/type checks. No change to QR generation, dependencies, funds, contracts, release or deployment. Full hosted CI and independent review required; integration lease generation 12 released, not acquired. PR #390 exact head green; independent review absent; no owner branch edits.
---

# GP-BUG-20261123-HWSIGNER — reject non-bigint transaction amounts at signing boundary

- Worker: scheduled BUG-ONLY coordinator; branch `automation/20261123T0021Z/bug/hwsigner-bigint-boundary`, base live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-connect/src/hwsigner.ts`, new `packages/ux-connect/src/hwsigner.runtime-amounts.test.ts`, this additive claim, and new `docs/handoffs/UX_CONNECT_HWSIGNER_BIGINT_20261123.md`. Existing `hwsigner.test.ts`, `hex.ts` and other PR paths are read-only.
- Observed defect on source-equivalent Node 22 replay: `validateTxRequest()` permits numeric or null transaction amount/gas/fee values, including `value: 1.5`, because JavaScript relational comparisons coerce non-bigint operands; an invalid request can reach signing display instead of returning the typed error. Original source blob `4e2ee2e68452808b969195dc3d7fdbca359b82f6`.
- Acceptance: commit a failing regression before production changes; reject non-bigint value/gasLimit/maxFeePerGas/maxPriorityFeePerGas via existing Result errors; preserve all valid bigint requests and transaction review text; replay isolated regression and nearby edge cases, then depend on exact-head hosted checks, native browser qualification if applicable, and genuinely independent review. No signing or real funds.
- Ownership: all 245 open PR identifiers inventoried as of this run and changed-file inventories checked for `hwsigner.ts` plus new test; no direct collision found. Existing broad PRs #278/#262/#264/#372 did not own either file. Recheck live PR heads before merge.
- Integration: generation-11 metadata lease at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` remains `held` by another coordinator. No lock takeover, shared work integration, deployment, release or merge permitted.

---

# GP-BUG-R11 — Reject malformed CSV column specifications (2026-11-23)

- Worker: GhostPay BUG-ONLY repair round 11, one assistant; no independent verifier.
- Branch: `automation/20261123/bug/export-column-holes-r11`; exact `main` base `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-export/src/types.ts`, new `packages/ux-export/src/types.column-spec.runtime.test.ts`, this additive ACTIVE_WORK section, and `docs/handoffs/UX_EXPORT_COLUMN_SPEC_R11_20261123.md`.
- Observed pre-fix defect: sparse `ColumnSpec[]` input reaches `resolveColumns()`'s `Array.map()` which skips absent indexes, so it returns sparse `ResolvedColumn[]` instead of the documented `INVALID_OPTION`; exported CSV can acquire silent unnamed/empty cells. Null/wrong-shaped descriptors can leak native TypeError rather than the package's typed ExportError.
- Acceptance: regression committed first; reject missing, null and malformed columns with existing `INVALID_OPTION`; dense valid custom/default columns, CSV shape, header escaping and normal round trips unchanged. No new dependencies, policies, fund interactions, deployment, or release.
- Ownership: recheck all active PR changed-file inventories before integration. Known focused export PRs #415/#444/#467/#483 own only summary/encoder/amount/time files, respectively. Initial direct inventory sample of PRs #489–#461 showed no owner of this source. Broad active branches and PRs remain reserved; no authority to overwrite them.
- Qualification: source-matched Node/TypeScript replay if available, hosted exact-head CI, lint, build and native browser checks; independent review and integration lease verification required before merge.
- Integration: metadata ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, status `held`, owner `994a0d214fb9-root-r3`, generation 11. Do not mutate lease or merge.


---

# EIP-3770 custom registry fail-closed validation — 2026-11-23 UTC

- Cycle/coordinator: `20261123T0441Z-root`; one sequential ChatGPT implementer/auditor, no delegated native worker or independent approval claimed.
- Isolated branch: `automation/20261123T0441Z/bug/eip3770-registry-guard`; exact starting main `eb59d93cffed7848c4aac37d0e9650b87239c6da` (tree `d8aa628cbc531c6969bdf0af621795ceacfc00c3`).
- Exclusive owned paths: `packages/payment-uri/src/eip3770.ts`, new `packages/payment-uri/src/eip3770.registry.test.ts`, this append-only claim, and new `docs/handoffs/EIP3770_CHAIN_REGISTRY_20261123.md`. No ownership of other payment URI files, contracts, Pages configuration, existing PRs or shared consolidation ledgers.
- Bounded discovery: main EIP-3770 parser checks registry key ownership but returns unvalidated mapped numeric chain IDs; builder reverse-looks up mapping values without checking that the requested ID or registry key is valid. Runtime wrong-type/invalid custom registry data may therefore create invalid chain-address results. No externally reachable exploit or funds impact established. Existing open payment-uri PRs #370/#379/#313/#360 own `query.ts` or `decimal.ts`, not `eip3770.ts`; recheck all competing heads before merging.
- Acceptance: committed failing regression before production correction; reject zero/negative/fractional/NaN/infinite/unsafe or wrong-type custom chain IDs, and names invalid under the EIP-3770 short-name grammar with existing `PaymentUriError('INVALID_CHAIN_ID')`; preserve default registry and valid custom numeric round trips. No new dependencies, policy, egress, signing, keys, contract or deployment changes.
- Integration: repository lock at `automation/ghostpay-integration-lock` head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, generation 11 status `held` by another coordinator; expiry alone is not authority to acquire or merge. Keep isolated draft and require fresh exact-head hosted CI plus genuinely independent review.
- Initial verification: none claimed before regression commit. Local GitHub DNS unavailable; use sourced code in a bounded Node runtime harness when possible, explicitly labeled not repository Vitest.


---

# EIP-681 URI amount snapshot — 2026-11-23 UTC (isolated)

- Cycle/root: `20261123T0635Z-root`. One sequential coordinator/implementer; no native delegate or independent verification available.
- Branch: `automation/20261123T0635Z/bug/eip681-amount-snapshot`; exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Exclusive owned paths: `packages/payment-uri/src/eip681.ts`, new `packages/payment-uri/src/eip681.amount-snapshot.test.ts`, this append-only section, and new `docs/handoffs/EIP681_AMOUNT_SNAPSHOT_20261123.md`. Other versions, contracts, workflows and other workers' PRs remain untouched.
- Finding under validation: `buildEip681Native` / `buildEip681Erc20` validate a mutable object's amount once but re-read the property when serializing. Getter-backed runtime objects can make a checked positive bigint become 0, negative, invalid type or another unchecked number. No observed deployed exploit or funds impact claimed.
- Acceptance: first commit failing regression cases, then snapshot `value` and `amount` exactly once before validation and formatting; preserve valid native/ERC20 outputs and typed PaymentUriError for invalid initial amounts; run feasible checks with actual outcomes and do not call standalone stubs repository tests. Separate independent review and exact-head CI required before merge.
- Coordination: Current main and previously open EIP-3770 #496, other payment-uri PRs checked; no EIP-681 file ownership was identified by bounded PR-title and known changed-path checks (not exhaustive). Integration lock `automation/ghostpay-integration-lock` is held by other owner `994a0d214fb9-root-r3` at generation 11. No lock takeover, shared-ledger updates or protected merges.

---

# 2026-11-23T0840Z — Bitcoin URI checked-input snapshot

Coordinator: one sequential ChatGPT engineer (no native subagents or independent verifier). Branch `automation/20261123T0840Z/bug/bitcoin-uri-input-snapshot`, base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned source `packages/payment-uri/src/bitcoin.ts`, new focused test `packages/payment-uri/src/bitcoin.input-snapshot.test.ts`, isolated handoff `docs/handoffs/BITCOIN_URI_INPUT_SNAPSHOT_20261123.md`, and this additive claim.
Finding candidate: `buildBitcoinUri` re-reads `amountSats` during validation and serialization, so getter-backed input can exceed the 21-million BTC bound after validation; `parseBitcoinUri` rereads `expectedNetwork` after compatibility validation, permitting a returned network that conflicts with the address. No external exploit asserted.
Acceptance: fail-first tests and minimal single-read snapshots, preserve normal BIP-21/321 behavior/errors, exact-head CI, source-pinned handoff; no dependencies, contracts, relayers, deployments, real funds, force-push, or security waiver. Independent reviewer and authorized integration lock required for merge.
Ownership checks: changed-file inventories of active Bitcoin/recovery PRs #372, #382, #371, #367, #365, #307, #262, #264, #278 and recent payment-uri #496/#499 have no overlap with this owned source/new test path (bounded, not exhaustive). Shared metadata integration-lock at ref `082e754f44944ebb4be283f89176b966bf8f7b4f` is released generation 12; this cycle has NOT acquired it and must NOT merge.

---

# C1 RPC input baseline alignment — 2026-11-23 14:40 UTC

- Cycle/coordinator: `20261123T1440Z`; single ChatGPT coordinator, sequential audit/implementation/verification roles; no native delegation or independent approval claimed.
- Isolated branch: `automation/20261123T1440Z/bug/c1-rpc-input-subgrid`; exact base: PR #510 head `e205b107b57794fd96a8302d54d2df3cb273e9e9`; parent PR #510 targets C1 #504 head `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`; main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Owned paths: only `apps/web/src/styles/app.css`, this append-only claim and new `docs/handoffs/C1_RPC_GRID_SUBGRID_20261123.md`. The prior #510 focus test change remains untouched. Existing #387 responsive RPC layout is in C1 #504; this child specifically extends it and must not overwrite #387 or #504.
- Failure evidence: exact-head parent #510 hosted Core CI 45176792342 e2e full job 137700068533 and lean job 137700068369 both report `apps/web/e2e/settings-rpc-reflow.spec.ts:26` at 900 CSS px, with primary/secondary input y-difference 24px versus required <12px. The test at 320px passes. Contextual focus regression fixed in #510 is no longer failing.
- Acceptance: preserve two wide, readable RPC columns and existing help/hint controls; align their input baselines despite differing label heights using shared row sizing at wide viewports, keep 320px stacked/nonoverflow layout; no test weakening, new deps, contract or custody changes; run exact-head hosted full+lean browser and static Pages validation; independent review and integration ownership required before merge.
- Integration lock: read `automation/ghostpay-integration-lock` commit `082e754f44944ebb4be283f89176b966bf8f7b4f`, generation 12 status `released`; no lock acquisition or shared integration by this branch. Workflow `pages.yml` pull-request validation does not deploy; publication requires separate manual dispatch on main. No deployment/release/main merge authorized.
- Remaining unrelated C1 failure: web Sweep dry-run warning test fails independently; retain, do not silence.



## Fee quote completion rollup — 2026-11-24

- Worker: `/root/unique_history`, delegated by the unique-branch completion coordinator.
- Branch: `finish/fee-quote-completion-20261124`; starting leaf PR #425 `ec3c7d9bf304fd9e837eaf7da9bbc0cf3fdb3ce3`; current main `f76904301cff0b24d65ea4e31cbf37d470db4d95`; independent donor PR #462 `a3ac91c8f38b99c25749ba1a87ba308c9f1f5a2e`.
- Owned work: reconcile original #421/#423/#425 timing validation history and #462 symbol-collision history with current main in this isolated branch; preserve all existing registry records; add `docs/handoffs/FEE_QUOTE_COMPLETION_20261124.md`. No donor branch writes or novel fee behavior.
- Acceptance: source and test blobs match the donor leaves; main's #514 near-tie savings fix stays exact; all ux-fees package tests with original coverage thresholds, package typecheck, typed lint, and build pass; independent review and exact published-head CI remain coordinator gates.
- Coordination: #561 owns six unrelated package fixes. #504 and responsive child #583 already carry the fee donors as part of broader work; this branch only qualifies the focused fee package on current main. #548 owns receipt printing. Original parent/donor work remains intact; shared integration lease, GitHub publication, merge, deployment and release are coordinator-owned.
- Qualification finding: #462 only compares fee-line identities with payer totals. Direct, unenforceable and zero-fee routes omit the payment-asset fee line, so the original payment identity is unchecked. Own new `packages/ux-fees/src/preview.payment-asset-identity.test.ts` and the smallest additional `preview.ts` guard needed to reject these collisions. Preserve the donor tests and timing source exactly; record any additional source change separately.
---

# GP-BUG R16 — nonnegative near-tie fee savings (2026-11-23)

Worker: single automated BUG-ONLY coordinator, sequential source inspection, test and repair. No independent verifier available in this run.
Branch: `automation/20261123-r16/bug/ux-fees-neartie-savings`; source base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: this additive claim; `packages/ux-fees/src/cheapest.ts`; new `packages/ux-fees/src/cheapest.tie-savings.test.ts`; new `docs/handoffs/UX_FEES_NEARTIE_SAVINGS_R16_20261123.md`.
Finding: existing tie-break allows a preferred or faster chain up to 1% more costly than the minimum; `savingsVsNext = metric(next) - metric(winner)` becomes negative when the next ranked chain is cheaper. This contradicts the nonnegative savings treatment already used for `savingsVsCurrent` and misstates a user-visible quote.
Acceptance: test first for preference and speed tie-breaks reporting nonnegative zero savings, preserve a positive saving for an actual cheaper winner and unchanged ordering/suggestion logic. Minimal clamp of the existing calculated saving, no new fields or features. Record exact source evidence, hosted CI and all unrun checks; request separate review. Do not change other PR branches or merge/release/deploy/fund-interact.
Preflight: live main, AGENTS.md/WORKFLOW.md/HANDOFF.md/ACTIVE_WORK.md, #390 exact-head green 5 workflows and 39 checks with zero submitted reviews; #390 mergeable=false; generation-12 metadata lease released at inspected commit `082e754f44944ebb4be283f89176b966bf8f7b4f` (no authority inferred). Prior 267-PR ownership snapshot plus fresh 2026-11-23 open-PR search and changed-file inspections of active broad donors (#238/#246/#262/#264/#278/#504), fee PRs (#421/#423/#425/#462) found no `cheapest.ts` claim. Full fresh 268-PR file-list scan was not completed, so recheck before integration.

## Issue #286 — merge and fuzz the Create Invoice copy action

Worker: Codex on `integrate/invoice-clipboard-286`, from main
`e0cb4681e453af77bb10be45ba61b4d19579f41b`. Main-targeted integration of
#293 (6c648770), #297 (04910f65), and #549 (21b1d68c). Own only the clipboard
helper and its CopyButton integration, invoice-link preference and translations,
their tests, and this claim. Preserve the owners' existing branch histories.
Exercise the real button with a mock clipboard, fake time, and seeded copy and
completion orderings, including an in-flight same-link recopy at the old deadline.
Verify default-off, unchanged-link clearing, and preservation of newer clipboard text.

## Issue 286 remaining clipboard actions

Worker: Codex, branch `feat/remaining-sensitive-clipboard-286`. Base: PR #553 at `068fbc36b80311c107dfd3619d631fca794fac58`. Main observed at `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own the shared copy button, confirmed backup copy and associated lock hooks, shared clipboard helper, Settings copy, tests and clipboard documentation on this branch. #553 retains Create Invoice ownership. Reconcile relevant clipboard behavior from broad donor #372 without importing its second preference or other beta features.

Acceptance: every programmatic copy uses #553's saved Off/30/60-second preference and helper. Only matching readable text may be cleared. Cover denied and missing APIs, newer/repeated copies, component unmount, preference revocation and pending native writes with controlled clocks and synthetic clipboards. Preserve backup reveal, auto-hide, confirmation and local recovery. Release qualification requires independent review and testing on an integrated candidate.

## Finish #580 clipboard regression typing — 2026-11-24

Worker: `/root` in the near-finished branch completion task. Isolated branch:
`finish/clipboard-580-20261124`, based on #580 exact head
`b634e816a403ac6b07a6685bac575ca683a17cb5`. Main observed at
`f76904301cff0b24d65ea4e31cbf37d470db4d95`.

Owned paths: the mock return types in `apps/web/src/lib/clipboardPrivacy.test.ts`,
this additive ownership record, and a dedicated completion handoff. The original
#580 source remains in history. The #553 branch and all production clipboard code
are unchanged. Any continuation of #580 requires its observed head to match.

Acceptance: reproduce the two `no-misused-promises` failures from hosted job
138271835214, retain the actual promise signatures in the mock fixture, pass typed
lint and the existing five helper/component suites without changing assertions,
and obtain independent review. Refresh exact heads before publication. Hosted
qualification remains a separate gate; no release or deployment is included.
# R37 — Block ambiguous fee-preview asset symbols (2026-11-22)

- Worker: branch consolidation coordinator, isolated from concurrent automation workers.
- Branch: `automation/20261122-r37/bug/ux-fees-asset-symbol-collision`; exact base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Owned paths: `packages/ux-fees/src/preview.ts`, new `packages/ux-fees/src/preview.asset-symbol-collision.test.ts`, this additive claim, and `docs/handoffs/UX_FEES_ASSET_SYMBOL_COLLISION_R37.md`.
- Source-confirmed problem: preview asset totals are grouped by `asset.id` but the collision check only blocks mismatched decimals; different validated ASCII symbols sharing the same id and precision can be silently summed and the fee preview can say `canProceed: true` with misleading payer totals. Existing tests cover unequal decimals only.
- Acceptance: test first for symbol-only id collisions in network, router buffer and flat security-fee lines; preserve identical assets, distinct ids and current existing decimal-collision rule. Extend only the existing block warning `fees.preview.warn.assetMismatch`. No signing, network, contract, key, fee-rule, or custody changes.
- Ownership: relevant recent #421/#423/#425 modify only timing paths. Broad #278/#262/#264/#372 file inventories do not include `packages/ux-fees/src/preview.ts`; check all active PR overlaps again before merge. Integration lock `automation/ghostpay-integration-lock` is held generation 11 by another coordinator; no lock transfer, shared merge, deployment, or release authorized.
- Verification: exact-head hosted CI required; no native repository Vitest run is claimed because GitHub DNS blocks local clone. Independent review required before integration.

---

## QR exchange browser completion

- Worker: Codex on `codex/qr-exchange-browser-completion`, based on main `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
- Integrate the existing QR-only candidate heads #547 (including #508), #503 and #525 on this isolated branch. Original worker branches remain independently owned.
- Own camera candidate selection and runtime fallback in `packages/qr-exchange/src/readers.ts`, associated QR unit tests, and the browser regression for generated invoice images in `apps/web/e2e`. Qualify the existing image, generation, validation and permissions paths in both Pages profiles.
- Acceptance: preserve first usable native result order, decode generated invoices with unavailable or failing native QR support, reject unsupported/damaged input, stop tracks, and require the existing explicit invoice review. No changes to payment execution or feature gates.
## QR SVG sparse-cell qualification, 2026-11-24 UTC

Worker `codex-fe9aff486805` is qualifying the existing #525 change at `06973f60031c49c4e8004cffea77b5627bb81632` on main `f76904301cff0b24d65ea4e31cbf37d470db4d95` in `qualify/qr525-sparse-cells-20261124`. Owned files are `packages/qr-exchange/src/generate.ts` and `generate.sparse.test.ts` beside it. Resolve both hosted lint errors, check that missing SVG cells are rejected and verify valid coordinates with the package suite. Return the tested work to #525.


## Resume #581 rendered invoice QR qualification — 2026-11-24 UTC

- Worker: `/root/qr_completion`; coordinator `/root`. Isolated branch `finish/qr-581-20261124`, exact parent `41a598b8433e10a95598c72c2a23027e63010024`; main inspected at `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Original candidate and donor branches remain unchanged.
- Owned paths: the existing `apps/web/e2e/qr-invoice-image.spec.ts` acceptance test, a minimal QR rendering or image-read repair only if demonstrated necessary by the failing rendered image, associated narrow regressions, this additive claim and `docs/handoffs/QR_INVOICE_IMAGE_COMPLETION_20261124.md`. Existing other worker source is preserved.
- Evidence: exact-head hosted full and lean browser jobs fail image import with “No QR code was found in that image”; the requested signature preview never appears. Full job 138275808118 has 83 passes, one failure and one skip. Preserve the chain, signature, explicit review, damaged-image, wrong-family and zero-external-request assertions.
- Acceptance: reproduce using the actual SVG rendered by Create invoice and the native browser raster decoder, correct the smallest proven failure, and pass the affected full and lean QR browser journeys with synthetic invoices. Relevant typecheck, lint, QR tests and source review remain required. No payment execution, dependency, release, deployment, network-policy or contract changes. Root owns publication and integration.
- Narrowed implementation scope after the paired browser reproduction: only `apps/web/src/components/QrView.tsx`. Three fresh synthetic invoices each failed to import when the responsive SVG snapped its fractional module geometry with `crispEdges`, and each completed the unchanged acceptance journey when the same SVG used `geometricPrecision`. The original end-to-end assertions and all decoder, signature, generation and export source remain unchanged.


## #581 version-23 software decoder correction — 2026-11-24 UTC

- Worker `/root/qr_completion`; coordinator `/root`; isolated branch `finish/qr-581-20261124` starts this correction at `81b6fd577e8f80cfc2a2f62bbc3a16e2e88741d4`, preserving the qualified responsive SVG fix. Root approved a bounded static vendor correction after independent native reproduction.
- Owned paths: `packages/qr-exchange/src/readers.ts`, new `src/readers.version23.test.ts` and `src/vendor.provenance.test.ts`, new `src/vendor/jsqr-1.4.0.mjs` with explicit type declaration/license/provenance, package build configuration for static JavaScript emission, scoped README/DEVIATIONS, this registry entry and a new source-pinned handoff. No dependency manifest or lockfile changes.
- Finding: pinned jsQR 1.4.0 has version-23 alignment centers `[6, 30, 54, 74, 102]` while the independent generator uses `[6, 30, 54, 78, 102]`. Its public software decoder rejects multiple pristine valid version-23-L payloads, including accepted v2 settings exports. Original distribution SHA-256 is `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.
- Distribution follow-up authorized by root: own `apps/web/public/licenses/jsqr-1.4.0.txt` and its exact provenance assertion. The production minifier omits source comments, so retain the package banner and add a static full-license notice copied by both existing Pages profiles; verify emitted notice bytes without changing build gates or minifier settings.
- Acceptance: record deterministic failures against the original public reader, keep adjacent versions/ECC/Unicode/blank/error cases, use a static ESM copy with the sole semantic table change and auditable mechanical wrapper conversion, preserve Apache attribution, prove exact vendor provenance and normal package build/types/lint/coverage, and qualify the final current-main composition in full and lean browser profiles. No runtime evaluation, dynamic code construction, node_modules mutation, dependency update, signing, payment, network-policy, contract or deployment change. Root owns remote publication and lease-protected integration; independent reviewer remains read-only.
## Bounded QR software decoder completion — 2026-11-24

- Worker: `/root/unique_history`, delegated by the branch completion coordinator. Branch `finish/qr-decoder-20261124`, parent #581 `41a598b8433e10a95598c72c2a23027e63010024`.
- Own `packages/qr-exchange/vendor/` (exact pinned jsqr 1.4.0 bundle, Apache license, narrow type declaration and provenance), lazy-reader import, package file inclusion, new deterministic decoder regression/provenance tests, and `docs/handoffs/QR_DECODER_COMPLETION_20261124.md`. Parent owns browser qualification and rollup.
- Scope: correct the version-23 alignment center 74 to 78; retry only the two adjacent valid QR dimensions when the locator returns a side congruent to 3 modulo 4, bounded to 21..177. Preserve original extraction, error correction, payload parsing and validation. Keep pinned npm jsqr as the untouched provenance/control dependency.
- Acceptance: baseline-reproducing tests for version 23 and fractional-raster version 25 plus valid neighbors; no unbounded search; vendor bytes equal pinned upstream plus exactly the two documented corrections; package coverage/typecheck/lint/build pass, independent source and browser review before integration. No installed dependency mutation, remote writes, feature gates, deployment, payment signing or real funds.

---

## Package fix consolidation, 2026-11-24 UTC

Worker `codex-fe9aff486805` owns integration on `integration/ghostpay-package-fixes-20261124`, based on `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Preserve the six original PR heads and their records. Integration covers language negotiation (#506), payment button labels (#513), the NFC message size limit (#518), billing CSV end-of-file handling (#519), locale separators (#521), and strict CSV row width (#524). Verify each original source and test blob, run the five affected workspace suites and their build, lint and type checks, then submit the combined tree to the existing CI and review gates.
# GP-BUG R11 — NDEF encoder NaN maxBytes bypass (2026-11-23)
Worker: autonomous BUG-ONLY repair round, single coordinator; no independent reviewer claimed.
Branch: `automation/20261123T1719Z/bug/nfc-nan-limit-r11`; exact starting main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/merchant-hooks/src/nfc.ts`, new `packages/merchant-hooks/src/nfc.nan-max.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, and new `docs/handoffs/NFC_NAN_MAX_BYTES_R11_20261123.md`. Existing `hooks.test.ts`, package metadata, and other workers' branches are excluded.
Observed source bug: `encodeNdefUri` computes `Math.min(NaN, 8192)` as NaN; `total > max` then returns false for NDEF messages larger than the documented hard 8192-byte cap. Valid HTTPS `#gpi=v1.` links can be longer than 8192. The flaw was reproduced in an isolated Node 22 source-line-equivalent probe, without NFC hardware, funds, network traffic or browser claims.
Acceptance: regression-first rejection of a large valid payment link with NaN `maxBytes`; preserve exact 8192-byte boundary, 8193 refusal, custom finite caps and ordinary round trips. Smallest typed `too-large` guard, GitHub hosted CI exact-head, independent review, ownership and integration gates. No dependencies, contracts, payment behavior, release, deployment or merge without held legitimate integration authority.
Ownership preflight: live open PR count 272 (2026-11-23); relevant #513 owns `button.ts`, #406 `pos.ts`; broad #278/#264/#262 do not modify `nfc.ts`. Other PR file inventories remain incompletely checked; do not merge until exhaustive collision audit.
Integration metadata lock: generation 12 previously released at `082e754f44944ebb4be283f89176b966bf8f7b4f`; no acquisition claimed.
# GP-BUG R11 — quoted empty final CSV record silently dropped (2026-11-23)

Worker: single sequential BUG-ONLY engineering coordinator; no independent verifier engaged.
Branch: `automation/20261123-r11/bug/merchant-csv-empty-quoted-eof`; immutable main base: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/merchant-billing/src/csv.ts`, new `packages/merchant-billing/src/csv.quoted-empty-eof.test.ts`, this additive registry entry, and `docs/handoffs/MERCHANT_CSV_QUOTED_EMPTY_EOF_R11_20261123.md`. Existing `csv.test.ts` is owned by broad integration PRs and remains untouched.
Defect: exact Git blob `3c9b5c50c69881188d2aadd386a68f77a3cbce37` drops an explicit empty quoted final one-column record: `parseCsv('name\\n""')` incorrectly returns `[['name']]`, while the same record followed by newline throws the documented `CSV blank line`. A standalone Node 22 local source-matched copy verified the hash and both behaviors; not repository Vitest.
Acceptance: commit failing Vitest regression before fix, make a minimal EOF bookkeeping correction, preserve valid empty fields in multicolumn CSV, quoted nonempty fields, terminal CRLF/LF and all existing limits; run isolated source-matched regression and hosted exact-head CI. No new features, dependencies, payment/fund interactions, deployment or release. No native browser qualification is claimed unless applicable evidence exists.
Ownership preflight: 273 open PRs visible in three REST pages (100/100/73); targeted changed-file inspections including #278/#264/#262/#238/#372/#224/#504/#324/#371/#397 and other relevant PRs show no direct ownership of `csv.ts` or the new test. This is a focused preflight, not a complete changed-file census; recheck before integration.
Integration metadata ref `082e754f44944ebb4be283f89176b966bf8f7b4f`, generation 12, status `released`, was not acquired. PR #390: exact head `b655bc273a6704c9c140287b8adcdf4085b91882`, 36 successful / 3 skipped checks, five workflows success, zero independent reviews, nonmergeable. Other worker branches untouched. Keep new PR draft until independent review, full CI, ownership clearance and legitimate held lock.


# All-branch comparison and focused remaining repairs

Worker: `chatgpt-f80482f352bc` (`/root`), with independent source reviewers.
Branch: `integration/all-branch-review-20261124`.
Base main: `706188000c38b3dde5a3a362370a530870aa7587`.
Date: 2026-11-24.

Compare every live branch (683 at the initial fetch) with current main, preserve
donor histories, identify existing successors, and qualify useful remaining work.
The first isolated implementation batch carries original PRs #289, #505, #507,
#509, #511, #516, #529, #536, #538, #557 and #593. None is an ancestor of current
C1 #504. All selected source paths except #289 have no changed-path overlap in
the 345-open-PR census. The identical #289 guard is already copied into later
recovery/privacy stacks; integrate it once without replacing their broader work.

## Owned paths

- `packages/invoice-schema/src/base64url{,.test}.ts`
- `packages/metadata-hardening/src/web{,.anchor-attributes.test}.ts`
- `packages/payment-uri/src/solana.ts`, `solana.reference-snapshot.test.ts`,
  `tron.ts`, `tron.input-snapshot.test.ts`
- `packages/ux-presets/src/seal{,.cryptokey-boundary.test}.ts`
- `packages/ux-fiat/src/view{,.quote-accessor.test}.ts`
- `packages/ux-notify/src/reminder-bridge{,.accessor.test}.ts`
- `apps/web/src/lib/sanitize{,.marker-script.test}.ts`
- `packages/ux-intake/src/text{,.japanese-script.test}.ts`
- `packages/ux-vault/src/confusables{,.group-kind.test}.ts`
- `packages/merchant-billing/src/money{,.uint256-roundtrip.test}.ts`
- Additive `docs/ai/ACTIVE_WORK.md` claim and this evidence directory.

## Acceptance

Preserve valid payment URI serialization, invoice encoding, native WebCrypto
keys, ordinary fiat/reminder behavior, text warnings and bounded billing amounts.
Retain each donor's regression coverage. Run affected package test/coverage,
typecheck, lint and build gates and the web checks applicable to the combined
tree. Correct demonstrated integration or test defects. Record exact heads,
paths, reviews, commands and outcomes. Refresh main, original heads and ownership
before promotion, satisfy required hosted CI, and follow the repository
integration-lock protocol.

Existing active continuations (#504/#525/#531, #568/#574, #601/#604, privacy,
recovery, QR/mobile, seller reconciliation and wallet-journal stacks) remain
under their owners. This batch does not change their branches. Historical
hosted/native/CLI/contract and future privacy work remains preserved for scope
and qualification review. Deployment and release are outside this task.

---

# GP-BUG R11 — scheduled reminder validator accessor failure (2026-11-23)

Worker: ChatGPT GhostPay BUG-ONLY repair round R11 (single sequential implementer; no independent verifier). Branch: `automation/20261123-r11/bug/reminder-accessor-result` from verified live main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.

Owned paths: `packages/ux-notify/src/reminder-bridge.ts`, new `packages/ux-notify/src/reminder-bridge.accessor.test.ts`, this additive claim on task branch, and new `docs/handoffs/UX_NOTIFY_REMINDER_ACCESSOR_R11_20261123.md`. Existing `reminder-bridge.test.ts` and other workers' branches/files remain untouched.

Observed defect: `validateScheduledReminder(unknown)` throws native errors when an imported reminder's own enumerable getters or Proxy ownKeys trap throws, despite the package's documented `Result`-returning, never-throws validator contract. Exact main source Git blob `6ac8ab6abaa38b97869c92ed52da96935418f5a6`, V8/TypeScript source-matched reproduction: 8 unexpected exceptions, 4 valid/error neighboring checks passed. Untrusted input is local/injected; no remote exploitation claimed.

Acceptance: commit failing regression first covering throwing version/id/due/label/amount/priority/grace getters and ownKeys proxy, then smallest exception-isolation repair that yields `{ok:false,error:'reminder_shape'}` and preserves valid/bad-field codes; run source-matched Node 22 reproduction, request hosted exact-head CI and independent review where available. No new features, dependencies, payment/contract behavior, RPC, real-world traffic, deployment or release. Check PR ownership before writes and again before integration; relevant broad PRs #238/#246/#262/#264/#278/#504 and recent bug PRs found no selected-path overlap. Full 270-open-PR file census not yet asserted. Integration metadata lease generation 12 is `released`, **not acquired**. Leave draft/unmerged pending all required CI, browser applicability, independent review and legitimate lock transfer.

---

# GP-BUG — Avoid false mixed-script notices from generated display markers (2026-11-23)

Worker: single ChatGPT BUG-ONLY coordinator; sequential author/test review, not independent approval. Branch: `automation/20261123-r11/bug/sanitize-marker-mixed-script`; exact base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.

Owned paths: `apps/web/src/lib/sanitize.ts`, new `apps/web/src/lib/sanitize.marker-script.test.ts`, this additive claim, and new `docs/handoffs/WEB_SANITIZE_MARKER_SCRIPT_20261123.md`. Leave existing hardening/Common tests and PR #390/#419/#422 displayText.ts owner branches untouched. All 283 open PR changed-file inventories in the snapshot through #528 were checked; no sanitize.* ownership collision. Main ACTIVE_WORK contains no claim on these paths. Recheck before any merge.

Observed failure: generated ASCII Unicode-marker letters make otherwise Greek or Cyrillic words appear mixed-script. Exact base blob e5c281aa7f8105b71ef93ea407e8dfa454892317 was hash-matched, compiled with TypeScript 5.8.3 and executed on Node 22.16.0; 6/10 directed assertions passed, 4 failed. Common.SafeText renders the false warning. Acceptance: commit red regression before production change; detect mixed scripts on original input, retain marker text/count, genuine mixed-script warnings and ordinary input. No dependency, fund, network, deployment or interface changes. Full checkout DNS unavailable; require exact-head hosted CI, applicable browser verification, independent review and legitimate integration lease before merge. PR #390 exact head all five workflow groups and Snyk succeeded, no submitted review, nonmergeable; leave owner branch alone. Integration lock generation 12 released, not acquired.


# Narrow historical adapter recovery

Extend worker `chatgpt-f80482f352bc`'s isolated branch claim to
`packages/chain-adapters/src/deployments{,.test}.ts` and
`packages/chain-adapters/src/rpc{,.test}.ts` before edits.

Independent historical source review found these existing changes absent from
main `706188000c38b3dde5a3a362370a530870aa7587` and C1 #504. Preserve the combined
newer implementations already carried in the larger #372 recovery/privacy stack:

- `2e61af277030d76f765b320b9f3e0e81e1a6cddd`: deployment calendar-date validation
  and existing regressions, from the #250/#271 lineage.
- `1bf1ac709a1147395d2f47dcdc5eab6a5ffc517b`: bounded RPC retries and explicit
  credential/referrer/cache policy, with existing transport regressions. The
  original privacy contribution is `fbda6b132aa3b1bc6bfc3b22b2835f5f8b297cbc` from
  #220; the finite retry contribution is from #250/#271.

Use selective cherry-picks with source attribution to avoid importing unrelated
feature and contract changes. Preserve valid manifests, RPC response parsing,
cancellation, endpoints and normal retries. Include the chain-adapters workspace
in combined tests, typecheck, lint and build. Hosted integration qualification
still applies to the final combined tree.

The original #289 regression has one unused callback argument. Apply the exact
one-line correction already present in recovered commit
`31c34319aeaa9dbc211b8ccc6bdf65fc3e755ea2`; no assertion changes are needed.
# Existing QR and TRON input follow-ups — 2026-11-24

- Worker: `/root/ui_data_review`; integration coordinator: `/root`.
- Isolated branch: `integration/input-followups-20261124`; exact base: `79c7ff73efbaf9efde5ec8cfc0e8fff08d4fad0b`.
- Owned paths: `apps/web/src/lib/qrKinds.ts`, `apps/web/src/lib/qrKinds.test.ts`, `docs/design/qr-colors.md`, `packages/payment-uri/src/tron.ts`, `packages/payment-uri/src/tron.network-option.test.ts`, this additive claim, the original QR follow-up handoff and a new recovery handoff.
- Recover only the existing missing QR primitive-validation follow-up from `17333ceda784ecdf5734a666ef57ee1d1e599296` and TRON network-option follow-up from `9fdb87fe59748a7463e4de5b92dc0ff3396ea7ce`. Preserve current optional-field snapshots from #593 and every previously reviewed source change.
- Acceptance: preserve all recognized QR mappings, secret/bearer flag precedence, frame classes and existing tests; preserve omitted/undefined TRON network defaults, supported explicit networks and single-read option selection. Import existing tests and relevant documentation without changing donor branches. Run the applicable existing unit suites and static checks on this composition; record actual outcomes and limits.
- Boundaries: no new attack harness or vulnerability reproduction, no remote ref mutation, deployment, funds, endpoints, dependency changes or activation of additional payment networks. Root owns independent review, combined qualification, integration lease and promotion.


## Submitted refund reservation recovery — 2026-11-24

Worker: `historical_review`, delegated by the all-branch integration coordinator.
Branch: `integration/refund-reservation-20261124`.
Exact base: `79c7ff73efbaf9efde5ec8cfc0e8fff08d4fad0b`.

Owned paths: `packages/merchant-billing/src/refunds.ts`,
`packages/merchant-billing/src/refunds.uncertain.test.ts`,
`docs/remote/usability/specs/refunds.md`, this additive claim, and
`docs/handoffs/REFUND_RESERVATION_RECOVERY_20261124.md`.

Recover the existing ordinary unit regressions from
`aa0bee225464ebf42b88351ea71c54b21e497a59` and the submitted-refund reservation
correction from `46d8e17fc70cb5bda89afbb4a942c2158871e992`, both on
`nodata/practical-johnson-e0fbpm` at
`85cc394451313e24104ef7089379e720b4e70526`. Keep donor attribution and the
original branch untouched. Its larger unfinished lifecycle, policy, authority,
storage, and execution work is outside this recovery.

Acceptance: submitted plans cannot transition to failed or release their
reserved amount; never-submitted plans can still fail; existing confirmation,
idempotency, and cumulative-cap behavior remains intact. Preserve the donor
assertions without adding attack or vulnerability reproduction tests. Correct
comments and the existing refund specification to state that this plan-only API
does not verify chain evidence or resolve submitted failures. Run the existing
merchant-billing suite with coverage, build, typecheck, and lint using checkout-local
workspace dependencies. Record actual results and environment limits. The root
coordinator owns independent review, combined qualification, and promotion; this
worker performs no remote mutation or merge.
# All-branch residual: live Automatic browser language — 2026-11-24

Worker `chatgpt-f80482f352bc` owns the integration-only composition of PR #551,
source head `0dd3bcd33f843e89980baf1ea98372fb58521f01`, into
`integration/all-branch-review-20261124` at local `f7f0367bdf680a4a45884908ebca98e78d3f9723`
(main `706188000c38b3dde5a3a362370a530870aa7587`). Source paths are
`apps/web/src/i18n/context.tsx`, `LanguagePicker.test.tsx`, and
`LanguagePicker.fuzz.test.tsx`. The original owner branch remains unchanged.
The browser-language event subscription and readable-primary-language fallback
are absent from main and C1 #504. Preserve manual language choices, embedding
overrides, catalog cancellation/order, document direction and persistence.
Retain donor tests; run the full existing web localization suites, web typecheck,
lint, and both build profiles. Require independent source review and applicable
hosted qualification before main integration. This extends the existing claim;
it does not claim a new native-browser pass in this restricted environment.

# All-branch residual: pasted invoice boundaries — 2026-11-24

Worker `chatgpt-f80482f352bc` owns integration of PR #389, source head
`b5045aec476833a5c87f1d733521dcd76e1843d1`, on the existing all-branch review
branch after `405418c5a0a53d0a5216d748a9c11ac638091180`. Owned source and test
paths: `apps/web/src/lib/fragment.ts` and `fragment.test.ts`. Preserve every
existing fragment-clearing behavior and donor assertion. Reconcile the donor's
HTTPS-only pasted-link check with current SDK `LinkOptions` and `checkBase`,
which explicitly support clean HTTP and HTTPS invoice links: accept either URL
scheme while checking the actual complete invoice hash and refusing embedded
whitespace. Pay's QR importer retains its separate HTTPS/deployment restriction.
Add positive HTTP compatibility tests and run the fragment, Pay and localization
regressions, web typecheck/lint and both production builds. Independent source
review and hosted qualification remain required. Do not change donor refs.

## Merchant-profile clock and payment-URI precision recovery — 2026-11-24

Worker: `historical_review`, delegated by the all-branch integration coordinator.
Branch: `integration/package-clock-decimal-recovery-20261124`.
Exact base: `84e5128dbe86d2061106e5e167e3272b5dee8958`.

Owned production and regression paths: `packages/invoice-schema/src/merchantProfile.ts`,
`packages/invoice-schema/src/merchantProfile.test.ts`,
`packages/payment-uri/src/decimal.ts`, and
`packages/payment-uri/src/decimal-options.test.ts`. Also own additive claim union
here, preservation of the two donor handoffs, and
`docs/handoffs/PACKAGE_CLOCK_DECIMAL_RECOVERY_20261124.md`.

Recover full original #268 head `ddfc8cfafa44b09103ced821f160c1d37fdfe552` and
#313 head `c48c9917708ea86ea1a82a9d5d44f3add9876c98` into this isolated branch.
Their merge-base deltas contain only these production/regression paths, claims,
and handoffs. Preserve all donor commits and existing regression assertions;
resolve only the additive claim registry by union. The existing open
integration/privacy stacks retain this code but neither frozen main
`706188000c38b3dde5a3a362370a530870aa7587` nor the selected base has adopted it.
The coordinator explicitly assigned this narrow recovery; donor branches and
other worktrees stay unchanged.

Acceptance: invalid verification clocks return the existing merchant-profile
format error before expiry evaluation; valid and expired profiles retain their
existing outcomes. Payment-URI decimal parsing validates the supported integer
precision domain through its existing typed error channel and preserves valid
round trips. Retain existing ordinary regressions; add no attack cases or
exploit work. Run both complete package suites with coverage, build, typecheck,
and lint against workspace links into this checkout. Record exact source heads,
actual results, and limitations. Root owns independent review, combined
qualification, and promotion; no remote mutation or main/shared-branch merge by
this worker.
## QA-03 typed decimal-option guard — 2026-11-20 UTC (same bounded cycle)

- Worker: sequential ChatGPT API-correctness lane; branch `automation/20261120T0641Z/bug/payment-uri-decimal-options`, base `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Source: QA-03 / CORE-QA-02, documentation-only [PR #309](https://github.com/djshellshoxxx/GhostPay/pull/309) and current unchanged `packages/payment-uri/src/decimal.ts` blob `8d8ceb070d29d511a1080861f878bbc6d367798f`.
- Owned paths: `packages/payment-uri/src/decimal.ts`, new `decimal-options.test.ts`, additive claim, `docs/handoffs/PAYMENT_URI_DECIMAL_OPTIONS_20261120.md`. Separate from sibling QA-02 URI-length PR; do not edit its branch or owned paths.
- Acceptance: public parseDecimal accepts integer precision 0–77 consistently with toAtomic/formatAtomic; rejects fractional, nonfinite, negative, overly large and nonnumeric runtime precision options with stable typed INVALID_AMOUNT before BigInt exponentiation; preserve exact decimal roundtrips and fixed 8/18 scale behavior. Test first, no new feature or policy decisions.
- No native delegation or independent approval; local repo checkout was unavailable due blocked GitHub DNS. Require hosted real test/typecheck/lint and independent verification before merge. No shared ledger/main/lock/deployment changes.
# All-branch residual: amount, expiry and simulation compatibility — 2026-11-24

Worker `chatgpt-f80482f352bc/ui_data_review` owns the integration-only recovery on
`integration/web-residuals-20261124`, based on
`84e5128dbe86d2061106e5e167e3272b5dee8958`. Original donor branches and the live
near-finished integration owner remain unchanged. Sources are PR #301
`7523da612ba365451f1d5c2dbc01d0bdeedbe8c7`, PR #274
`a4c6f945adef0438bfd0b347fb7c11057e3973ce` with its test-only qualification PR #515
`f2b262c2afe5d51c258e466d9be1d22798817135`, and PR #305
`87cf6c603338ad64ec02300fe42b96c3e0a205b9`.

Owned source and existing test paths: `apps/web/src/lib/format.ts`,
`format.test.ts`, `jitter.ts`, `jitter.test.ts`,
`jitter.expiry-qualification.test.ts`, `txGuard.ts`, and `txGuard.test.ts`.
Also own additive registry reconciliation, the donors' existing source-pinned
handoffs/review, and `docs/handoffs/WEB_RESIDUALS_RECOVERY_20261124.md`.

Acceptance: preserve the current integration and all donor regression coverage;
recover the missing amount runtime contract, monotonic invoice expiry, and
canonical ERC-20 simulation-result classification. Inspect the separate
`formatCountdown` changes held by PR #614 without modifying or importing that
owner's branch. Run existing focused and relevant Pay, fee, amount and schedule
suites, full web typecheck, and scoped typed lint with workspace-local package
resolution. No new negative payloads, baseline reproductions, dependency changes,
remote mutation, release or deployment. Root owns independent combined review,
final builds and hosted qualification before main integration.

Recovery qualification: source `6dc8be59520bdaf01ddadd3338f32c19ebfd958c`
preserves all four original donor heads and exact source/test blobs. Existing
20-file selection passed 512/512 tests with zero skips; full web typecheck,
scoped typed lint and whitespace checks passed. The separate #614 formatter
change composes cleanly at source level without importing or modifying that
owner's branch. Commands, dependency provenance, evidence hashes and remaining
combined gates are recorded in `docs/handoffs/WEB_RESIDUALS_RECOVERY_20261124.md`.
# All-branch reviewed composition — 2026-11-24

Worker `chatgpt-f80482f352bc` extends the existing isolated integration claim to
the exact #615 source at `70970c3b739dcba51c0fb6cd0b1b75f73f6aae95` and the
seven linear string-processing repairs recorded in
`docs/consolidation/all-branches-20261124/COMPOSITION.md`. Starting local source
is `d6abd6a40f857a0a51d186fb5c49dc3a741b7af9`, main `706188000c38b3dde5a3a362370a530870aa7587`.
Preserve original branches, current-main behavior, all recovered guards and
their regression coverage. This is preparation and qualification of an expanded
candidate, not permission to merge with pending or failing hosted checks.

## PR #568 registry integration qualification, 2026-11-24 UTC

Worker `/root/branch_inventory` owns only the additive registry conflict resolution on isolated branch `finish/fiat-568-registry-20261124`, coordinated by `/root`. Local starting commit `518a812731ee5281cf80cd08eee4b31216464bc1` has tree `f46350ea01dd29b3186ae080498cf35894b99728`, verified identical to actual main `706188000c38b3dde5a3a362370a530870aa7587`. Integrate original donor `c6817a2e46a684cc29450fc0bc18d48fc6e9f500` without changing its branch or source/test blobs. Owned authored path: `docs/ai/ACTIVE_WORK.md` only; preserve both complete registry additions and original donor ancestry. Acceptance: exact donor source/test/handoff blob preservation, every existing main registry line preserved in order, native ux-fiat tests, whitespace and committed-secret checks. Independent review and publication remain with `/root`; this claim grants no ownership of production files, other workers' branches, shared integration metadata, or release settings. Original full/lean hosted evidence is recorded separately from this docs-only composition.

---

# GP-BUG — bound forward fiat conversion output (2026-11-24 UTC)

Worker: sequential BUG-ONLY coordinator; no separate independent verifier. Branch `automation/20261124T0524Z/bug/ux-fiat-conversion-output-bound`; exact base main `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Owned paths: `packages/ux-fiat/src/convert.ts`, new `packages/ux-fiat/src/convert.overflow.test.ts`, this additive claim and `docs/handoffs/UX_FIAT_CONVERSION_OUTPUT_BOUND_20261124.md`.

Finding: `toFiatMinor` returns an ok result exceeding the package's 78-digit amount ceiling even though `checkAmount`, formatter and reverse conversion reject that same result. Exact-source isolated reproduction: 10/13 expected-boundary assertions before, 13/13 with a candidate output check. Confirm test-first on this branch, then minimal output-bound repair; preserve valid exact arithmetic/rounding and reverse conversion. Synthetic fixtures only; no payment, policy, network, contract, dependencies, deployment or release changes.

Ownership: all 317 open PR changed-file inventories from the date-partitioned snapshot through #567 were retrieved; neither production nor new test path was present. Broad #278/#372/#238/#262/#264 own existing fiat.test.ts; #504 owns decimal/format/rate files and their focused regressions; #511 owns view.ts and its focused test. No edits to these. Main active-work registry had no ux-fiat convert claim. Integration lock generation 15 released at observed ref 4d130107dc2d92b73c6ec73d902ed5a925dc37a6; not acquired. PR #390 exact head b655bc273a6704c9c140287b8adcdf4085b91882 has five successful workflow groups and Snyk, zero reviews and mergeable=false; leave owner branch unchanged. Draft only until hosted exact-head CI, applicable browser verification and independent review complete.
## Resumed catalog completeness validation — 2026-11-24

- Worker: `/root`, resuming the interrupted credit-exhaustion handoff.
- Branch: `resume/ghostpay-i18n-completeness-20261124`; base main: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
- Owned paths: `packages/i18n/src/completeness.ts`, new `packages/i18n/src/completeness.duplicate-locale.test.ts`, this additive claim, and `docs/handoffs/I18N_COMPLETENESS_RESUMED_20261124.md`.
- Scope: make the completeness checker reject duplicate locale identifiers after canonicalisation, matching the existing runtime `createI18n` contract. Preserve distinct regional catalogs and canonical output.
- Ownership: all 343 current open PRs were paginated and their complete changed-file lists inspected. No PR changes `completeness.ts` or the new regression path. Existing i18n claims cover negotiation, formatting, readability, or package versions and remain untouched. Main's ownership registry has no completeness claim.
- Acceptance: reproduce the overwrite on the unchanged base; verify base and non-base duplicates, regional/script case variants, both insertion orders, identical catalogs, typed errors and valid distinct-locale controls; run the complete native package coverage suite, build, typecheck and pinned lint; obtain independent review and retain exact source evidence.
- Boundaries: no payment, cryptographic, network, deployment, workflow, dependency-manifest, shared-ref or existing-owner changes. Hosted CI and integration remain separate gates.
## PR #574 registry integration qualification, 2026-11-24 UTC

Worker `/root/branch_inventory` owns only the additive registry conflict resolution on isolated branch `finish/countdown-574-registry-20261124`, coordinated by `/root`. Local starting commit `518a812731ee5281cf80cd08eee4b31216464bc1` has tree `f46350ea01dd29b3186ae080498cf35894b99728`, verified identical to actual main `706188000c38b3dde5a3a362370a530870aa7587`. Integrate original donor `43889d6a36ae869187c1b860fce72e0252f55028` without changing its branch or source/test blobs. Owned authored path: `docs/ai/ACTIVE_WORK.md` only; preserve both complete registry additions and original donor ancestry. Acceptance: exact donor formatter/test blob preservation, every existing main registry line preserved in order, native formatter/countdown/scheduler tests, whitespace and committed-secret checks. Independent review and publication remain with `/root`; this claim grants no ownership of production files, other workers' branches, shared integration metadata, or release settings. Original full/lean hosted evidence is recorded separately from this docs-only composition.
## Issue #394 — countdown formatting on main

Codex owns the countdown hunk in `apps/web/src/lib/format.ts`, the countdown cases in `apps/web/src/lib/format{,.countdown}.test.ts`, and this entry on `fix/countdown-394-main` (base `f76904301cff0b24d65ea4e31cbf37d470db4d95`). Reuse the guard and tests from #416, also carried by #504. Verify invalid durations, valid rollovers, and the Pay expiry path on this isolated main-based branch.
## POS #576 current-main integration qualification, 2026-11-24 UTC

Worker `/root/branch_inventory` owns only additive registry resolution and isolated qualification on `finish/pos-576-main-20261124`, coordinated by `/root`. Local starting commit `518a812731ee5281cf80cd08eee4b31216464bc1` has tree `f46350ea01dd29b3186ae080498cf35894b99728`, identical to published main `706188000c38b3dde5a3a362370a530870aa7587`. Integrate original #576 head `a2c9bdf08549d53f27a1e57bd868f8c37c789ec0` with ancestors #411 `482d36ad436f4b27b2d86ff9a2c22daf150000ad` and #406 `506604288e31c195c852fa2e8896e131da34bc3b`; preserve all three original branches and all reviewed POS source/test blobs. Owned authored path: `docs/ai/ACTIVE_WORK.md` only. Acceptance: retain both complete registry additions and all main package fixes including payment-button labels and NFC bounds, preserve donor ancestry, pass native merchant-hooks tests and POS reducer parity, pass all five original POS browser scenarios with one worker using exact routed example assets, and pass whitespace/committed-secret checks. No full web build or behavioral edits are planned. Root independently verifies provenance and controls review/publication; no ownership of other workers' source, branches, shared metadata, or release settings is claimed.
## POS terminal reliability and parity

Worker: Codex, branch `fix/pos-terminal-reliability-20261124`, based on #411 at `482d36ad436f4b27b2d86ff9a2c22daf150000ad` (includes #406). Main at preflight: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
Own the child branch's POS reducer and static example, POS-specific tests and documentation, and this additive claim. Preserve both parent branches. Acceptance: exercise creation, payment observation, expiry, cancellation, completion and new-sale reset in both implementations. Verify rejected inputs cannot corrupt the session and amounts remain exact, using bounded generated cases and the actual terminal controls.
Browser regression ownership includes the new `apps/web/e2e/pos-terminal.spec.ts`, which serves the actual example files to Chromium.
# All-branch remaining reviewed follow-ups — 2026-11-24

Worker `chatgpt-f80482f352bc` owns integration on the existing all-branch branch
of #525 `5741f0bea3e3b4a510220f193aae8276dda94a00` (dense QR SVG matrices),
#531 `e9e9d60dacb6458796f3e1b5d704f1afdca62ae0` (restore the documented
deployment validation command), and #567 `f0171888c95b48005a6809aedf1e625bf86dfe83`
(canonical array data-descriptor snapshot). Starting source is `7a68a4e70aab7348bcbce670e76a873ce8ad75c6`.
Own only the donor source/test paths and additive coordination evidence. #525
and #531 have successful original-head hosted checks; the combined candidate
still needs its own gates. #567 supersedes C1's earlier array guard and keeps
the existing dense/sparse array assertions, adding descriptor snapshots. Before
resolving its two known source conflicts, confirm the current files still match
C1 and review the full donor delta. Preserve all other current source, tests,
claims and original refs. No dependency upgrade or deployment is authorized here.


## QR SVG sparse-cell qualification, 2026-11-24 UTC

Worker `codex-fe9aff486805` is qualifying the existing #525 change at `06973f60031c49c4e8004cffea77b5627bb81632` on main `f76904301cff0b24d65ea4e31cbf37d470db4d95` in `qualify/qr525-sparse-cells-20261124`. Owned files are `packages/qr-exchange/src/generate.ts` and `generate.sparse.test.ts` beside it. Resolve both hosted lint errors, check that missing SVG cells are rejected and verify valid coordinates with the package suite. Return the tested work to #525.

## B03 Pages manifest validator integration — 2026-11-23

- Coordinator: Codex engineering continuation. Branch: `codex/ghostpay-pages-manifest-command-20261123`.
- Base: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owned changes on this branch: `apps/web/package.json`, `apps/web/src/validateDeploymentsScript.test.ts`, and the B03 handoff in `docs/handoffs/PAGES_MANIFEST_COMMAND_20261123.md`.
- Recover the already-authored narrow donor `9669766c21f57c28f201586a116517af341706e0`. Broad PR #212, head `4894d0d8d94333dffa8ae3937a4d8314f27c686f`, has an equivalent implementation. Preserve its source and ownership. The C1 candidate #504 at `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` does not contain the command.
- Acceptance: the documented workspace command runs the existing build-time validator. Synthetic fixtures cover valid, unsigned, keyless and wrongly signed manifests. Verify the command and focused test, then affected web typecheck, lint, Pages artifact build and repository checks. Real deployment evidence and release signing remain owner dependencies.

### B03 workspace map repair

Codex owns the generated `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md` update on local branch `codex/pr-531-workspace-map-repair`, based on PR #531 at `855c5ce0778d2f59e1fe8016d64e3b39ab3c4850`. Acceptance requires the repository map check to pass and the workspace validator to accept a test-signed manifest and reject an unsigned one.
# Linear amount formatting and wallet error taxonomy — 2026-11-24 UTC

Worker: ChatGPT ownership_review, delegated by the current all-branch integration coordinator. Isolated branch `fix/linear-format-taxonomy-20261124`; exact base `84e5128dbe86d2061106e5e167e3272b5dee8958`. Coordination: C1 #504 at `1a7447d58c08363209b6b9b67e9a6afad07d87f3` owns the broader integration. This separately authorized child changes only the seven source operations identified by the public CodeQL annotations, without changing that owner's branch or claims. No main or remote writes.

Owned source paths: `packages/payment-uri/src/decimal.ts`; `packages/ux-connect/src/hex.ts`; `packages/ux-connect/src/hwsigner.ts`; `packages/ux-export/src/amount.ts`; `packages/ux-fees/src/amount.ts`; `packages/ux-fiat/src/decimal.ts`; `packages/ux-privacy/src/policy.ts`. Own additive ordinary-compatibility regression `packages/ux-connect/src/hwsigner.message-lines.test.ts`, this appended registry entry, and `docs/handoffs/LINEAR_FORMAT_TAXONOMY_20261124.md`.

Acceptance: replace the six flagged trailing-zero formatter operations with linear suffix scans, preserving each existing decimal bound, zero-decimal handling, allowed negative amounts, export trim mode and typed errors. Replace the flagged wallet-message expression with equivalent linear per-line substring searches, preserving LF/CR/U+2028/U+2029 dot boundaries, substring matching and existing taxonomy priority. Run the six affected packages' complete existing coverage suites, typechecks, lint and builds with bounded worker counts and worktree-local workspace links. New tests cover ordinary compatibility only; no stress inputs or vulnerability reproduction. No suppressions, alert dismissal, policy/workflow/dependency changes, hosted/native activation or lifecycle work. Public CodeQL check 138228881370 reported seven high-severity alerts; neither existing fractional bounds nor this static change is a claim of confirmed exploitability or of a green CodeQL rerun. Independent review and combined qualification remain with the root coordinator.


## JSON sparse-fixture syntax correction — 2026-11-24

Worker: ChatGPT historical_review, delegated by the all-branch integration coordinator. Isolated branch `fix/json-fixture-syntax-20261124`; base `a107d993c1aed73827d853924ea36036f083400f`; main at preflight `706188000c38b3dde5a3a362370a530870aa7587`.

Owned paths: the two existing sparse-fixture deletion statements in `packages/invoice-schema/src/json.test.ts`, this appended claim, and `docs/handoffs/JSON_FIXTURE_SYNTAX_20261124.md`. Parent coordination owns the broader #567 integration and final qualification.

Acceptance: replace only those two deletion statements with equivalent fixture operations that satisfy `@typescript-eslint/no-array-delete`; preserve every existing assertion and production file; run invoice-schema lint, typecheck, and the focused existing JSON suite. No new cases, suppressions, dependency/configuration changes, or unrelated cryptographic reruns. Root checkout, donor branches, and remote refs remain untouched.
## Fiat view expectation reconciliation — 2026-11-24

Worker `chatgpt-f80482f352bc/ui_data_review` owns the successor on
`integration/fiat-view-expectations-20261124`, based directly on
`a107d993c1aed73827d853924ea36036f083400f`. The coordinator selected C1's existing
inner-parser diagnostic after reviewing PR #616 at
`7c4987650faf32322d7ded48ad669130aba7e63b`. The earlier production-message
alternative remains untouched on `integration/fiat-message-20261124` at
`57fb4b2b012fd7777d8f7f6310760c3b1232f516`; it is not part of this successor.

Owned paths: `packages/ux-fiat/src/view.quote-accessor.test.ts`, this additive
claim, and `docs/handoffs/FIAT_VIEW_EXPECTATIONS_20261124.md`. Acceptance: change
only the two expected message literals to the parser's existing diagnostic;
retain exact whole-object assertions, all six accessor/proxy cases, all normal
controls and every production byte including the outer catch. Run the complete
ux-fiat coverage suite, typecheck and typed lint. No new cases, payloads,
reproductions, dependencies, remote changes or edits to the root checkout.

Successor qualification: `ca0cc1054aadeaeb645292f954becfeeeb626400` changes exactly
two expected message literals and no production bytes. Full ux-fiat coverage
passed 88/88 tests with zero skips; package typecheck and typed lint passed.
The previous alternative branch remains unchanged. Source pins, two-layer flow
and evidence are in `docs/handoffs/FIAT_VIEW_EXPECTATIONS_20261124.md`.


## Narrow residual library and QR-print recovery — 2026-11-24

Worker: `/root/ownership_review`, delegated by the all-branch coordinator.
Branch: `integration/narrow-residual-recovery-20261124`. Exact base:
`fb12a3302d9a85aa8777805bbdaab1bf2770ea16`, tree
`8086add0f3c77a80ae953e45d50b179244261248`.

Owned paths: `apps/web/src/lib/qrKinds.ts`, `qrKinds.test.ts`;
`packages/hygiene/src/ledger.ts`, `ledger.browser-chains.test.ts`, and the
chain-policy statement in `packages/hygiene/README.md`;
`packages/merchant-ledger/src/reconcile.ts`, `ledger.test.ts`; this additive
claim and `docs/handoffs/NARROW_RESIDUAL_RECOVERY_20261124.md`.

Recover only scoped source and existing ordinary regressions: #410 commits
`8ca59c6e1e1b7dc6bcfdf8d24c31fe68214103a1` and
`6c645477f8c91d6f0f54b6bb21c6a2710a947b80`; #341 commits
`26d2ba95a045bb60d9344cb3e4a84224c2b74b50` and
`0284eead8822306c625981d5095e983f8364cb93`; only the merchant-ledger hunk
and paired regression from #220 commit
`6db114920589a38dbbb5d52f45bb7a52be98d9b6` if current semantics confirm it.
Do not merge old whole branches or alter donor refs.

Acceptance: preserve current QR primitive guards, mappings and print-size
limits while treating only literal true as passphrase protection. Keep the
pure destination ledger compatible with enabled testnet metadata plus Anvil,
without widening other PoC RPC/derivation guards or activating any browser
caller. For merchant reconciliation, preserve counted/late/zero-due and
tolerance semantics while preventing positive unpaid invoices from becoming
paid from tolerance alone. Inspect public contracts and existing regression
overlap first; reject incompatible or superseded hunks explicitly.

Run both full affected package suites with coverage, typecheck, lint and build,
plus relevant existing web tests and static/build checks using workspace links
into this checkout. No vulnerability reproduction, stress inputs, dependency,
workflow, contract, hosted-service or RPC changes. The QR composition worker
owns reader/vendor/QrView/license/provenance paths; it is notified of the
separate qrKinds scope. Root owns independent review, combined qualification,
publication and integration.

Current-contract review extension: also own the R4 status wording in
`docs/remote/usability/specs/reconciliation.md`. The independent read-only
review confirmed no counted payment must not settle a positive invoice; R4's
old arithmetic shorthand omitted that condition and the corresponding expired
case. Clarify the specification with the narrowly recovered ledger guard,
without altering types, observed-payment acceptance or zero-due behavior.
## Canonical QR continuation composition — 2026-11-24

Worker `chatgpt-f80482f352bc/ui_data_review` owns isolated branch
`integration/qr-composition-20261124`, based on
`fb12a3302d9a85aa8777805bbdaab1bf2770ea16`. Sources are original #581
`74121278a08eaf4eddd85651a4518ef657aeeb16` and #605
`73f521bad57c24e44fe5c69fbdeecd1d2da2fec1`, both refreshed at those exact live
heads before integration. Original owner branches and root checkout stay intact.

Owned paths: the donors' QR reader/module, renderer, emission configuration,
license, provenance and existing QR test/support paths; additive ownership and
handoff documentation. Specifically retain #581's static ESM distribution,
`QrView` rendering, browser notice and interoperability tests, then recover
#605's existing bounded locator retry and seven dense-image cases. Keep one
runtime decoder copy. Preserve every existing guard and assertion; reconcile
full-source provenance expectations explicitly with both existing corrections.
Do not import unrelated dependency or workflow changes.

Acceptance: original heads retained where feasible, all existing QR coverage
thresholds and relevant ordinary web tests pass, package typecheck/typed
lint/build pass, full and lean web builds plus original bundle scans pass.
Verify emitted vendor and browser-license provenance. No new stress or
vulnerability reproduction tasks, native-browser sandbox workarounds, remote
mutation, root merge or publication. Existing local Chromium Unix-socket
restriction remains a qualification limit; final hosted/browser gates and
independent combined review remain with root.

Completed at source `50aab6f36031bca1afb366f73901dbbaef548179`, tree
`fc6739726cd37b22653eba2e0f12814023d3afa6`. Both original donor heads are merge
ancestors; the canonical ESM factory retains both exact corrections and one
runtime copy. Full QR coverage passed 270 tests in 14 files, all package checks
passed, and 348 focused web tests in 24 files passed with zero skips. Changed
web typed lint and both full/lean typecheck/build/bundle scans passed. Independent
review approved this exact source. No manifest/lock changes, remote mutation or
native-browser workaround. Detailed evidence and outstanding hosted/browser
limits: `docs/handoffs/QR_CONTINUATION_COMPOSITION_20261124.md`.


# Reviewed QR and narrow residual composition — 2026-11-24

Worker `chatgpt-f80482f352bc` owns isolated branch `integration/all-branch-followups-20261124`, based on local core `20709d681f3f090f4826ac5f78895c3645a7d674` (tree identical to published PR611 `87bee07895679deaef345c3dd4aaf2e8f8651f1c`). This registry resolution records the integration boundary for two previously claimed and qualified inputs: QR composition `274855b6ebcc3d190ad53d4242a151ebff55a45d` and narrow residual recovery `cdb95ab42340efb8ad37feeb18f7d7f8b3442ef8`.

Retain their exact production/test/license/provenance files and all original claims. Root owns only this additive conflict resolution, combined qualification and follow-up evidence. Both parent registries retain every ordered nonblank line and multiplicity. No authored production change is planned. Qualification covers the three affected package suites, the union of relevant web suites, typecheck/lint/build and original full/lean bundle scans. Independent source review and exact-head hosted/native checks remain required before a coordinated main merge. Preserve one decoder runtime and the existing lockfile, workflows, RPC bounds and experimental helper chain guard. No deployment, source-branch deletion or unrelated old-stack adoption is included.


## Portable keystore owned-buffer cleanup recovery — 2026-11-24

Worker: `/root/ownership_review`, delegated by the all-branch coordinator.
Branch: `integration/portable-keystore-cleanup-20261124`. Exact base
`3e927a9c41f08c42f753786c541b4f8bcfb30d10`, tree
`dbbeff91379c9b6d2e6d6460ee802481965cea20`.

Owned paths: `packages/ux-vault/src/keystore-portable.ts`, existing donor
`packages/ux-vault/src/keystore-portable-memory.test.ts`, this additive claim
and `docs/handoffs/PORTABLE_KEYSTORE_CLEANUP_20261124.md`.

Recover only the source and four existing ordinary lifecycle regressions from
`9bad95e5cc0ee73f5adb8d2c587161074b21e080`. The current production blob
`59e998e772e26be386aea4b8369d5240222ea1f9` exactly matches the donor parent.
The existing custody guard/normalization work remains intact. No whole donor
branch or historical ownership registry import; donor refs stay unchanged.

Acceptance: zero only locally owned normalized passphrase and derived-key byte
buffers after asynchronous derivation/import finish or reject. Preserve v1
format, KDF parameters/ceilings, NFKC normalization, AES-GCM, key permissions,
all validation/error guards and caller-owned data. Do not claim immutable
JavaScript strings can be erased. Run complete ux-vault coverage, build,
typecheck and lint with local workspace links, plus existing web keystore,
key-vault, session and backup consumer suites. No new stress/security
reproduction, remote/root-worktree write, hosted/native feature or dependency
change. Root owns independent review, final composition and hosted gates.


## PIR separator and reconciliation harness compatibility — 2026-11-24

Worker `/root/ownership_review`, delegated by the all-branch coordinator.
Branch `integration/pir-idb-compatibility-20261124`, exact base
`20d12d860bed893d1c29215ea4f4131bdc75a5d7`, tree
`d74b4fe326564b347d8b4738ab872e39a6a3906c`.

Owned paths: `packages/pir-two-server/src/client.ts`, the ordinary URL/path
compatibility case in `client.test.ts`,
`apps/web/scripts/test-reconciliation-idb.mjs`, this additive claim and
`docs/handoffs/PIR_IDB_COMPATIBILITY_20261124.md`.

Recover only donor `d37b0ab37d0e9968bda21c57bd18d78c2897487d`'s terminal
separator scan and existing ordinary endpoint/path compatibility test. Exclude
its timing/stress case and unrelated Settings fixture. Preserve host/scheme and
chain validation, all interior path bytes, transport options/errors, endpoints,
PIR protocol/padding and server interfaces.

Recover only donor `6e48ce51ac6b550c998d0331fc7692621dcf174d`'s current
`invalidateFrom(block, observations, canonicalHash)` call and stored-height
assertion. Preserve current executable selection, two-tab refresh, exact-CAS,
stale-session and local-egress assertions. Inspect CI wiring; report missing or
blocked native qualification honestly without weakening or changing workflows.

Acceptance: run complete PIR package coverage/build/typecheck/lint, JavaScript
syntax validation and existing reconciliation unit/IndexedDB-adapter suites.
A blocked native attempt is not a test pass. No stress/security reproduction,
dependency, browser-policy, workflow, root-worktree or remote modifications.
The coordinator owns independent review, composition and hosted gates.

## Bounded React and Pages diagnostics recovery — 2026-11-24

Worker `/root/ui_data_review` owns isolated branch
`integration/react-pages-diagnostics-20261124`, based on
`3e927a9c41f08c42f753786c541b4f8bcfb30d10`. Source pins are
`ec7dd86db9b20ab906582c35fcb370b043e44ec4`,
`e73fdb16f81f2e4811931585f59c041441ba1c78`,
`153965f2298150987b2673e49f4e8ff180d279a6`,
`5a502e55ee18889bdca75ae9cddf9e585ef48782`, and only the fixed-marker observer
hunk of `c8e0a703df3cacd7c0ee9092c08dd053f40cecce`.

Owned paths: `apps/web/src/main.tsx` and `main.test.tsx`;
`scripts/pages/smoke.mjs`, `smoke-walk.mjs`, `smoke-walk.test.mjs`,
`smoke-render-errors.test.mjs`, `fixtures/smoke-invoice.txt`; this additive
registry entry and a source-pinned handoff. Recover the existing fixed-public-
label React callbacks together with the Pages observer and bounded navigation/
fixture harness. Preserve current URL/origin guards, explicit smoke failures,
all existing tests, current nine-view navigation and existing application
initialization. Do not copy a historical smoke snapshot wholesale.

Acceptance: existing main and Pages unit checks pass, relevant web static and
full/lean build checks pass, source preservation is reviewed independently, and
the actual hosted invocation and missing gates are reported accurately. No new
attack/stress scenarios, broad privacy stack, dependencies, workflow changes,
native-browser workarounds, remote writes or edits to the root checkout. Root
owns final combined qualification, hosted gates and publication.

Qualified source `16088cfb621fd8b2fe9610b50a34a9c686ea3036`, tree
`6a754776ef65b5cc9c1aadea4db5f54c644993fe`, passed 105 Pages Node checks and
62 focused web tests with zero skips. Full web lint passed after retrying an
unchanged command with a 2048 MiB heap; full/lean typecheck/build/scans and the
16-file clean-tree Pages artifact verification passed. Independent review
approved the exact source. The Node smoke harness is synthetic; the actual
nine-view Chromium walk remains unrun and is only invoked post-deployment by
current workflows, not by a PR browser job. No workflows or origin policies
were changed. Receipts and remaining limits:
`docs/handoffs/REACT_PAGES_DIAGNOSTICS_20261124.md`.


## Release fixture-key boundary recovery — 2026-11-24

Worker `chatgpt-f80482f352bc`, coordinating the user-authorized branch integration, owns the recovery of the four-file unit from `21fdd4350d1a4a2fa04198d7e11e922cd7f3da31` on isolated integration branch `integration/all-branch-followups-20261124`, base `ac2e7ef6a0c712d82a6a8efa4ad9d1e9cba64d28`. Independent `historical_review` confirmed exact donor-parent fit, compatible current callers, and the coupled release/development environment contract before source selection.

Owned source: `apps/web/scripts/validate-deployments.mjs`, its `.d.mts` declaration, `apps/web/src/releaseKeyDenylist.test.ts`, and the two coordinated hunks in `scripts/pages/build-pages.sh`. Preserve all existing parser, signature, origin, shared-origin, clean-tree and bundle guards. No other runtime, dependencies, workflow or release-channel changes.

Qualification: original and current build-validator unit suites, web typecheck/lint, shell syntax, a clean release-mode refusal of the existing synthetic fixture key, a successful development fixture build through the sanitized environment, and final combined no-manifest Pages qualification. Use synthetic fixtures only. No deployment, real signing material, donor ref changes or main merge. Final hosted gates and integration lease remain required.


## Hosted native IndexedDB qualification wiring — 2026-11-24

Worker `/root/ownership_review`, delegated by the all-branch coordinator.
Branch `integration/native-idb-ci-20261124`; exact base
`4a4237d052ac1ebb54e434f67ff49a55877ffb84`, tree
`46dc6a2a7f35dfc950c850cda0a2385aee191c37`.

Own only an additive step in `.github/workflows/ci.yml`'s existing e2e job,
this additive claim and `docs/handoffs/NATIVE_IDB_CI_20261124.md`. After the
existing Playwright Chromium installation and browser suite, run the unchanged
`apps/web/scripts/test-reconciliation-idb.mjs` once on matrix profile `full`,
setting `GHOSTPAY_CHROMIUM` from Playwright's managed `chromium.executablePath()`.
Preserve every existing step/action, matrix leg, permission, setting, required
check, cache and failure/artifact behavior; native failure must fail the job.

Run existing relevant workflow/static guard tests, YAML parsing, shell syntax
and action-pin checks. Do not add a test that only mirrors the new step and do
not claim native success from this restricted local environment. No browser
installation or workaround here, workflow cancellation, deployment, root
working-tree or remote write.

Separately inspect and document an exact plan for running recovered Pages
smoke source `16088cfb621fd8b2fe9610b50a34a9c686ea3036` against the built
Pages site in the site job using the existing static server and managed
Chromium. That source is not at this base. Do not change Pages workflow or
smoke source in this task; return the plan for coordinator review first.

### Approved Pages scope extension

After reviewing the exact bounded plan, the coordinator authorized two additive
steps in `.github/workflows/pages.yml`'s existing site job: install managed
Chromium and run the unchanged recovered smoke against the already built site
using the existing loopback static server. This branch now also owns those two
steps. The coordinator has composed the recovered smoke source in the root
followup; this branch must leave that source unchanged. Preserve all existing
Pages steps, deployment conditions, permissions, caches and artifact handling.
Bound startup and smoke time, clean up only the new server process, propagate
all native failures, and add no browser-success claim from local static checks.
Re-run existing Pages tooling and workflow tests, YAML, shell and pin guards.
## Selected receipt and bill print recovery — 2026-11-24

Worker `/root/ui_data_review` owns isolated branch
`integration/receipt-print-recovery-20261124`, based on
`74e51b7197258cba1e2db98bfb698307ef741d7c`. Recover original #608 head
`0d3d804b3f53ad8b463117824ca1fd1b3332d798` by merge, retaining its #532/#548
ancestry and existing native print/PDF evidence as historical qualification.

Owned paths: `apps/web/src/lib/usePrintTarget.ts` and its test;
`src/components/PrintableBill.tsx`, `PrintableBill.test.tsx`, `ReceiptPanel.tsx`
and `ReceiptPanel.test.tsx`; `src/styles/app.css` and `print.css`;
`apps/web/e2e/flowMocks.ts` and `print-targets.spec.ts`; the donor's two print
handoffs, this additive registry and a source-pinned recovery handoff.

Apply only the four reviewed ReceiptPanel print hunks to the current component,
retaining all archive generation/in-flight guards and regression cases. Remove
only the legacy seven-line print block from current app.css, keeping newer
screen styles. Union ownership conflicts. Preserve current QR policies,
geometry/decoder, existing tests, workspace manifests, dependencies and gates.

Acceptance: complete original donor tests plus current archive-regeneration and
QR-policy tests pass; full web typecheck, typed lint and full/lean builds/scans
pass; obtain independent composed-source review. Existing hosted full/lean
native print coverage remains mandatory. Do not turn historical native evidence
into a new-head browser pass; the known local Chromium restriction remains.
No new attack/stress cases, root edits, remote changes or publication. Root
owns integration with the separately qualifying follow-up and hosted gates.

Completed at source `856503289d7e38e377dafef864f46ac55e1d218a`, tree
`4cc62ec6e5bb05a8619d054f76cfd48a7c4856db`, retaining #608/#548/#532 ancestry.
Only the four reviewed receipt print hunks and legacy seven-line CSS removal
are applied to overlapping current product files; archive/QR guards and all
tests/configuration remain. Independent source review approved this tree.
All 81 focused tests in nine files passed with zero skips; full web typecheck,
typed lint and full/lean builds plus original scans passed. Native print/PDF
coverage remains mandatory on the exact combined head in existing full/lean CI;
no new-head native pass is claimed. Source pins and receipts:
`docs/handoffs/RECEIPT_PRINT_RECOVERY_20261124.md`.


## Final selected branch recovery composition — 2026-11-24

Worker `chatgpt-f80482f352bc` coordinates the user-authorized every-branch integration on `integration/all-branch-followups-20261124`, base `0b60dba235710f12847532dd9d0f74f12f7298c6`. Own the additive composition of the independently reviewed #563 offline profile viewer and #572 individual payment-key export units, final source-pinned qualification, and `docs/consolidation/all-branch-followups-20261124/`. Preserve the separately authored source and tests, existing print/QR/session/clock guards, original ownership records, dependency graph and every existing required CI gate.

Only resolve overlapping locales, additive workflows, registries and the specifically reviewed current-source integration points. Preserve all new native acceptance jobs and no-skip enforcement. Record every current branch at a stated observation, retain earlier immutable census evidence, and distinguish selected unique work, equivalent/superseded behavior, dependent continuations and concrete held gaps.

Acceptance: independent exact-source reviews, applicable combined coverage/build/lint/static checks, exact local/remote Git tree identity, and actual hosted native/security/integration gates. Publish the reviewable candidate and merge eligible changes only after fresh main/head checks and the cooperative integration lease. No donor ref deletion, force push, deployment or live-funds operation is part of this work.

## F08 bounded offline profile viewer recovery — 2026-11-24

Worker `/root/ownership_review`, delegated by the all-branch coordinator.
Branch `integration/f08-offline-review-recovery-20261124`; exact base
`83c503f970044e1708b3a7493ee7284cd59e0844`, tree
`db8e94d9b37382dbe83a8a577248b39f6a7b4256`. Reuse this worker's completed
isolated native-CI worktree to avoid duplicating source on the nearly full disk.

Merge original PR #563 head `923e1edfb9ac34f8b6855d8ac8516cd835070afd`, retaining
its original component, 15-case unit suite, two-scenario browser spec, opt-in
merchant-panel mount, four locale additions and security-key classification.
Union every ownership claim. Preserve every current locale value and metadata,
the stronger merchant-profile clock guard, all existing tests and default/lean
feature boundaries. No donor branch, provider, payment or deployment change.

Owned integration paths are the donor's ten web code/test paths, this additive
claim, and `docs/handoffs/F08_OFFLINE_PROFILE_RECOVERY_20261124.md`. Also own a
dedicated additive read-only native job in `.github/workflows/ci.yml`, separate
from ordinary E2E jobs and their artifact identity. The proposed three-mode
job and additive automated-merge enforcement are submitted to the coordinator
for structural review before finalization. Any approved enforcement is limited
to appending the new required check names in
`.github/workflows/ghostpay-codex-cloud.yml` and its existing gate-list test.

Acceptance: current focused suites, full web typecheck/lint, i18n validation
and extraction, and original scanned full/lean builds including opt-in full and
lean-with-flag. Hosted native execution must positively qualify the applicable
donor scenario in every mode; skipped positive scenarios do not count as a
pass. Flags stay local to each invocation. Preserve all original workflows and
tests, no global feature activation, root-worktree/remote write, or fabricated
GhostID/P05/P06/catalog-provider completion. Root owns independent review,
publication, final composed-head hosted gates and integration.

Coordinator approved the exact three-scenario native job and additive cloud
merge enforcement before implementation. The three new required names are
`ghostid-native (default-full)`, `ghostid-native (opt-in-full)` and
`ghostid-native (lean-with-flag)`; every previous required name is retained.

Qualification found that the existing automation-hardening suite's all-green
fixture still lists only the five old checks. Claim its `GATES` fixture in
`scripts/tests/ghostpay-automation-hardening.test.mjs` for the necessary additive
three-name alignment; preserve all existing tests and expected outcomes. The
observed failures were missing native checks, as the strengthened gate requires.

---

# F08 — offline customer review of a signed merchant profile

- Worker: Codex. Branch: `feature/f08-offline-merchant-profile-review`. Base: `e0cb4681e453af77bb10be45ba61b4d19579f41b`. F08 specification: `50ea73dcf3d4e9593da780ffb34bdfce60a90a15`.
- Scope: browser-local import of an existing v1 public profile and comparison with an independently supplied full signer key. The full-build preview is opt-in. The lean client and existing payment and pin paths keep their own behavior.
- Owned paths: `apps/web/src/features/future/ghostid/`, a conditional mount in `apps/web/src/components/MerchantProfilePanel.tsx`, additive locale and security classification keys, focused browser coverage, and the F08 handoff.
- Acceptance: authentic profile and matching key, distinct key conflict, no comparison from a prefix, rejection of changed, expired, oversized or malformed files, safe replacement of an in-flight selection, and offline operation without modifying stored pins. Verify the feature gate in the default full and lean builds.


## Bounded final compatibility additions — 2026-11-24

Worker `chatgpt-f80482f352bc` coordinates the user-authorized remaining eligible branch recoveries after core PR611 merged at `cc090bf80bbf35c1db81ecbe6acae694a518bed0`. Base application composition is `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`, whose complete web qualification and evidence archive are now finished.

Own the additive integration of independently reviewed #377 scoped development-cookie dependency repair, #358 exact-object comparator, #468 offline report formatter, and #578 HTTPS/RPC browser compatibility spec. Scope includes their original bounded manifests/lock record, tooling/tests, compatibility spec, contract documentation and source-pinned handoffs. Preserve all application/package implementation, existing assertions, every unrelated lock record, current CI gates and both parents' ownership records. No new scheduled automation, analyzer execution, provider activation or default feature activation.

Acceptance: exact donor/current-source comparisons, matching dependency-resolution and ordinary original tests where applicable, separate historical/native evidence, and fresh combined hosted qualification before normal merge under the integration lease. Preserve the frozen698-row index and add a later selection/promotion appendix rather than rewriting its observation.
## Read-only coordination and analyzer-evidence tooling recovery — 2026-11-24

Worker: `/root/ownership_review`, delegated by the all-branch consolidation coordinator. Isolated branch: `integration/readonly-tooling-recovery-20261124`; exact base: `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` (tree `8add357748674afb128926a797982badb54bac6b`). Reuses the clean completed portable-keystore worktree; the original branch remains at `20d12d860bed893d1c29215ea4f4131bdc75a5d7`.

Owned paths: `scripts/coordination/reconcile-claims.mjs`, its canonical `.test.mjs` and input-contract documentation; `scripts/tests/reconcile-claims.test.mjs`; `scripts/audit/mythril-evidence.mjs` and its contract documentation; `scripts/tests/mythril-evidence.test.mjs`; this additive claim and a new `docs/handoffs/READONLY_TOOLING_RECOVERY_20261124.md`. Original donor heads #358 `c9e53c2c5908cbb64c104d096ce84773cf804ccc` and #468 `cb63ec21cbac15b0a665b61ada37a9f0662ff79a` are read-only recovery sources; their refs and ownership are unchanged.

Acceptance: independently inspect both helpers against current contracts; preserve the exact canonical donor code/tests where compatible, explicitly distinguish the reconciliation v1 input from the current refresh/2 schema, and retain the Mythril summary's positional-only association and unresolved-finding semantics. Execute original ordinary Node fixtures and existing offline runner compatibility tests; record actual exits, source pins, untouched application/workflow/dependency inputs, and separate author testing from independent review. No analyzer, exploit/stress reproduction, full web tests, dependency installation, live census claim, automatic schema adapter, root/followup/main edit, remote write, CI gate weakening or finding clearance. Existing scratch evidence inventory and packager are outside scope and remain unchanged.
---

# Bounded HTTPS/RPC compatibility qualification recovery — 2026-11-24

Worker `/root/ui_data_review`, isolated branch
`integration/https-rpc-compatibility-recovery-20261124`, base
`bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` (tree
`8add357748674afb128926a797982badb54bac6b`). The completed individual-export
branch and its final `7331ee05ad2d77e9fe86e538a8820f4b819e9dcc` head remain
unchanged. The coordinator explicitly authorized this separate recovery.

Owned paths are only the original #578 native specification
`apps/web/e2e/https-rpc-compatibility.spec.ts`, its source-pinned transport note
`docs/pages/tor-rpc-compatibility.md`, this additive claim, and the new
`docs/handoffs/HTTPS_RPC_COMPATIBILITY_RECOVERY_20261124.md` with receipts.
Donor `20733b6a8ebc6a2598d5baff2eed62d58a0a7675` is one bounded commit above
an ancestor of the selected source; preserve that original history if the
reviewed three-path merge remains clean apart from registry union.

Acceptance: preserve the entire authored loopback TLS / selected synthetic RPC
test and its assertions, verify its current UI/helpers and full/lean discovery,
run full web typecheck/lint and relevant existing ordinary unit suites, and
record actual original-head hosted native evidence separately from fresh
combined acceptance. Reuse existing exact dependencies. No application source,
manifest, workflow or gate changes, browser installation, known-blocked local
Chromium retry, external service interaction, root edits or remote writes.
Root owns independent final source review, publication and fresh combined
full/lean hosted native acceptance before integration.
## 2026-11-24 — scoped cookie development-tooling recovery

- Worker: `/root/historical_review`; coordinator: `/root`.
- Branch: `integration/scoped-cookie-recovery-20261124`; worktree: `/workspace/scratch/f80482f352bc/native-idb-ci`.
- Base: `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`; exact original #377 donor: `d3c2228c53cbda4ee650ec91776af8bb1c02674d`.
- Owned paths: root `package.json`, `package-lock.json`, `scripts/tests/dependency-tooling.test.mjs`, original `docs/handoffs/COOKIE_DEPENDENCY_20261121.md`, and this claim/registry union only.
- Acceptance: recover the version-scoped `@sentry/node@5.30.0` cookie override and its ordinary compatibility case; retain all five prior tooling assertions, all 814 other lock records, and current application/contract/workflow source. Verify actual cookie resolution before counting tests as override qualification; use the existing six tooling cases, thirty router cases, contract typecheck and compilation when exact prerequisites are available. Record unavailable prerequisites and require fresh hosted gates without substituting an old cookie installation.
- Environment: reuse this completed clean worktree while preserving the F08 branch; do not modify root checkout, shared dependency/cache files, Node resolution flags or remote refs. Avoid a duplicate full install under the current disk constraint. Evidence is recorded separately in `/workspace/scratch/f80482f352bc/cookie-recovery-qualification`.
- Status: source review confirms exact donor preimages and one development-only lock-record change. Qualification preparation is in progress; no new passing runtime/native result is claimed.


# Scoped cookie dependency repair — 2026-11-21 UTC

- Worker: `/root/dependency_cookie_repair`; coordinator: `/root`.
- Branch: `repair/ghostpay-cookie-dependency-20261121-5ceb`; base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`, verified live before work.
- Owned paths: root `package.json`, `package-lock.json`, scoped additions to `scripts/tests/dependency-tooling.test.mjs`, this additive claim, and `docs/handoffs/COOKIE_DEPENDENCY_20261121.md`. No application, contract, workflow, protocol or custody changes.
- Acceptance: isolate the vulnerable development-only cookie dependency below Sentry with a compatible pinned override; preserve all unrelated and production dependency records; verify ordinary parser/API compatibility, existing tooling tests, affected compile/typecheck when available, installation and exact before/after audits. Do not reconstruct vulnerabilities or execute attack scenarios.
- Coordination: parent explicitly assigned this isolated dependency scope. Historical dependency remediation is already represented in main; current PR #210 retains cookie 0.4.2, while major trains #87/#253 remove it through broader upgrades and remain separate. Preserve all donor branches. The generation-11 integration lease remains held by another owner; expiry never permits takeover. No shared ref, lock, merge, deployment or release action is owned here.
- Status: claimed before source or dependency edits. Independently reviewed exact-source and hosted qualification remain required.

Cookie milestone: product `8519a14c41e473b712df427f8ea4924247bb0f95` changes one development lock record; six tooling tests and 30 existing router tests pass with no skips, clean npm 11 install, compile/typecheck and production audit pass. Full audit remains failed with 15 low Elliptic-derived nodes. See `docs/handoffs/COOKIE_DEPENDENCY_20261121.md`; independent review, hosted gates and integration ownership remain unresolved.


### 2026-11-24 cookie recovery completion

`/root/historical_review` qualified source `5a2038d6f5fd0e01f663a09d9dcaa75742754c07`, tree `445c977595f679857506f3eacee8825b2a563613`, on `integration/scoped-cookie-recovery-20261124`. Original #377 is an actual merge parent; all three product/test blobs remain donor-exact and all 814 other lock records remain unchanged. Private exact-lock workspace-only npm ci installed 334 packages; actual Sentry consumers use cookie 0.7.2. Six tooling and thirty router cases passed with zero skips; contract typecheck and native 36-file compilation passed. Production lock audit is zero; full lock audit retains 15 low findings and exit 1. Independent `/root/ui_data_review` source approval is recorded. Original F08 branch, shared dependencies/caches, root checkout and all remotes remain untouched. Handoff: `docs/handoffs/COOKIE_DEPENDENCY_20261121.md`; source-pinned raw receipts: `/workspace/scratch/f80482f352bc/cookie-recovery-qualification`. Fresh exact-final-head hosted gates and final promotion remain with coordinator.


## Final census neutral deployment diagnostic recovery — 2026-11-24

Worker `chatgpt-f80482f352bc` coordinates the bounded recovery discovered in the 699-ref cutoff at 2026-11-24 13:14:56 UTC. Branch `integration/all-branch-followups-20261124`; base `7852931fecc8bdd2ab17e3e70813f36e502c50b0`. Own only additive composition of `apps/web/src/lib/deployment.ts`, `deployment.test.ts`, and `hardening.test.ts` from #570/#619, plus original ownership records, source-pinned handoff and final report. The author works independently from the same base; the source review is separate.

Acceptance: retain exact reviewed donor postimages, ordinary original tests and successful/no-RPC/secondary/checking/disabled-payment behavior; replace variable adapter diagnostic detail only with fixed public reasons. Preserve all other application, dependency and workflow entries. Qualify affected existing suites, typecheck/lint and fresh full combined hosted checks. Do not import the broad #570 privacy/export stack or add its whole head as a merge parent.
## 2026-11-24 — bounded neutral deployment diagnostic recovery

- Worker: `/root/historical_review`; independent reviewer: `/root/ownership_review`; coordinator: `/root`.
- Branch: `integration/neutral-deployment-diagnostic-20261124`; worktree: `/workspace/scratch/f80482f352bc/native-idb-ci`.
- Base: `7852931fecc8bdd2ab17e3e70813f36e502c50b0`; selected donor #619: `3107b816144b4a6fe43f197fbdc323b5d8d80628`.
- Owned source paths: `apps/web/src/lib/deployment.ts`, `apps/web/src/lib/deployment.test.ts`, `apps/web/src/lib/hardening.test.ts`; also this additive claim, `docs/handoffs/DEPLOYMENT_DIAGNOSTIC_RECOVERY_20261124.md` and its adjacent source-pinned qualification/archive directory.
- Acceptance: recover only exact compatible donor postimages for the fixed neutral reason and actual ChainAdapterError classification, the ordinary existing diagnostic regression, and corrected existing hardening case. Preserve no-RPC/checking/verified/disabled-payment behavior, every unrelated assertion and all base entries outside owned paths. Run the two directly affected suites plus existing manifest/service compatibility suites, full web typecheck and typed lint. No new test, stress case or vulnerability reproduction.
- Reachability: current consumers of these exported utility functions are their two test files; the live app's separate manifest readback path stays unchanged. No new caller or broader privacy/export functionality is introduced.
- Environment: restore this checkout's retained web dependency links and refresh only owned build outputs from source-identical current package outputs. Those existing web dependencies contain old cookie 0.4.2; this task makes no exact whole-lock installation or cookie-override qualification claim. Preserve the completed cookie branch and its private installation/receipts.
- Scope exclusions: no complete #619/#570 parent merge, unrelated privacy/export code, root worktree/main/remote edit, or broad/native/browser rerun. Fresh combined hosted acceptance remains with coordinator.


### 2026-11-24 bounded deployment diagnostic completion

`/root/historical_review` qualified `e65214c2f13bd7724aec42032e6cfcb40e87aba5`, tree `088fa581964a891a793bdeaef879a42bf1c20725`, on `integration/neutral-deployment-diagnostic-20261124`. The three selected source/test files remain exact #619 postimages. All 45 existing focused cases passed in four files with zero skips; full web typecheck and typed lint passed. Independent `/root/ownership_review` source approval is recorded. The helper currently has only test callers, and the live manifest readback path is unchanged. Reused web dependencies retain cookie 0.4.2, so these results make no whole-lock/cookie-override installation claim. The completed cookie branch/private qualification remains preserved; no root/main/remote changes were made. Handoff: `docs/handoffs/DEPLOYMENT_DIAGNOSTIC_RECOVERY_20261124.md`; source-pinned raw evidence is adjacent. Final combined hosted acceptance and promotion remain with the coordinator.

## Interrupted payer verification on Pages

Worker: Codex on `fix/pages-offline-session` from main `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Own payment result presentation and exported receipt classification in Pay and payExec, their regression fixtures, and browser coverage for interrupted receipt verification. Coordinate with `codex/offline-interrupted-invoice`, which owns draft recovery, the offline notice and review retry. Reuse existing receipt-correlation work from #298/#302 where applicable. Verify unknown outcomes through disconnect, reconnect and same-tab reload, including zero wallet replay. Keep existing release gates.



## #573 browser fixture continuation — 2026-11-24

- Worker: sequential ChatGPT recovery QA; isolated branch `automation/20261124-recovery-573/qa/beforeunload-fixture`; exact parent `56fb25aa2ff098737dbc181fa88c0aac06425c8e`; main observed `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
- Own only the hostile-text test in `apps/web/e2e/app.spec.ts`, this additive claim and a new source-pinned handoff. #573 owns the actual sole-copy guard; #622 owns archive/master recovery and does not touch this test. No existing branch edits or shared integration.
- RED evidence: CI run 45334789740, jobs 138303654258 (lean) and 138303654348 (full), both abort at `openFresh` navigating to about:blank. The hostile-text test dismisses every dialog, including the intentional beforeunload warning newly introduced by #573.
- Acceptance: explicitly accept only the expected beforeunload at deliberate fresh navigation, assert it occurred exactly once, continue recording/rejecting every unexpected dialog, retain the exact hostile-text/inert markup/no-XSS assertions. No production, workflow, timeout or security-gate changes. Exact-head hosted full/lean replay and independent review required.

## Issue 364 — Pages visual and responsive qualification

Worker: Codex. Branch: `fix/364-responsive-pages`. Base: C1 #504 at `1a7447d58c08363209b6b9b67e9a6afad07d87f3` (main `f76904301cff0b24d65ea4e31cbf37d470db4d95`). Reuse #387/#512; do not edit the parent branch. Own shared app/static presentation styles, theme assets and references, affected layout regressions and a scoped handoff. Verify supported navigation, RPC controls, local assets, contrast, focus and reduced motion at 320/375/768/1280/1920 CSS pixels and native 200% zoom. Payment logic, deployment and other issue workstreams are outside this claim.

# Issue 364 static help, privacy and Circuit Drift documentation — 2026-11-25 (isolated)

- Worker: single lead agent in this session (no delegated writers; read-only source-verification agents only). Owner of issue #364 documentation scope per the user's request on 2026-11-25.
- Branch: `nodata/amazing-dijkstra-rgkp6o`; base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
- Consolidated: PR #583 (`fix/364-responsive-pages`, head `c1980912`) commits `268115be`, `f1a25a18`, `c1980912` cherry-picked as `7de6f2f0`, `90816802`, `99c54bef`. PR #583 is superseded by this branch once merged; it is not closed by this worker.
- Owned paths: `apps/web/help.html`, `apps/web/privacy.html`, the `<noscript>` block of `apps/web/index.html`, `apps/web/public/help.css`, `apps/web/public/appearance.css`, `apps/web/e2e/static-help.spec.ts`, `apps/web/e2e/responsive-pages.spec.ts` (test-harness fix only), `docs/handoffs/HELP_DOCS_364_20261125.md`, and this claim.
- Not touched: application logic, views, lib, state, contracts, relayer, build profile scripts, deployments, workflows. Payment recovery, encrypted backups, merchant accounting, invoice interoperability and POS owners keep their branches.
- Fix: `responsive-pages.spec.ts` counted a 304 revalidation as a failed asset. 304 now passes; failures (4xx/5xx) still fail. Reproduced with a same-context navigation probe.
- Acceptance: static help and privacy pages cover EL5, EL10 and technical explanations, buyer/seller diagrams with text equivalents, backup and recovery, wallet connection, invoices and receipts, merchant status, RPC/network configuration, privacy matrix, glossary, and disclosure-based contextual help. Every feature carries an implemented, experimental, planned or unsupported label checked against source. Responsive at 320/375/768/1280/1920 CSS px and 200% zoom, no horizontal overflow, no remote fonts or scripts, CSP unchanged, axe clean on help and privacy pages, existing unit and e2e tests green.
- Verification plan: vitest for the touched components, `static-help` and `responsive-pages` Playwright specs on desktop plus mobile projects, typecheck, lint, build with scan-bundle, `node scripts/check-*` guards that cover help assets. Independent review before merge.

## POS terminal session lifecycle completion — 2026-11-25 UTC

Worker: Claude Code cloud session, branch `nodata/gracious-meitner-0yy6do`, base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Preflight: #406 and #576 (issue #400 guards, POS reliability) are merged; open #411 is a stale ancestor of main; open #614 is docs-only. A scan of every remote branch found no POS source blob newer than main. F09 GhostPOS (`future/f09-ghostpos`) remains specification-only and is not implemented here.
Owned paths: `examples/pos-terminal/**` (new `pos-session.js`, `session.test.mjs`; `index.html`, `pos.js`, `pos.css`, `README.md`), `apps/web/e2e/pos-terminal.spec.ts` (additive scenarios; existing five scenarios unchanged), the POS parity line in `.github/workflows/ci.yml`, this entry, new `docs/handoffs/POS_TERMINAL_COMPLETION_20261125.md`. Not modified: `packages/merchant-hooks`, `packages/merchant-ledger`, `packages/invoice-schema`, `examples/pos-terminal/pos-logic.js` reducer semantics.
Acceptance: pure lifecycle module with deterministic clock, mock storage and synthetic feed/mock-wallet fixtures covering creation, amount validation and exact precision, presentation, expiry/countdown, cancellation/reset, feed-sourced completion (strict webhook-event validation matching `parseWebhookEvent`, cumulative-to-delta, replay dedup, invoice/currency binding, late rejection, ledger `reconcile` agreement), customer display model, persistence/restore without the bearer link, corrupt-storage recovery; terminal UI keypad, customer screen, live status and focus handling; Playwright desktop and touch-tablet scenarios; existing parity and e2e unchanged and passing.


## Sweep balance consent integration — 2026-11-23

- Coordinator: Codex engineering continuation. Branch: `codex/ghostpay-sweep-balance-integration-20261123`.
- Base: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Preserve PR #252 donor `4085622463411d3ba27f4efb7b73a70575170535` as a parent and reconcile additive work claims.
- Acceptance: require an explicit action before an RPC balance read for a one-time address, preserve selected-provider policy and discard late results on selection, provider, session or lock changes. Run the existing Sweep, privacy, and lean-browser acceptance tests.
- PR #272 is a follow-on. The recovery stack #361/#372/#373 already contains #252. Preserve their code and branch ownership and reconcile current C1 and reserved workstreams before integration.
## Sweep quote and relayed signing lifecycle correction — 2026-11-19

Worker: independent ChatGPT review agent, coordinated by the main consolidation agent.
Branch: `review/ghostpay-sweep-quote-lifecycle-20261119`.
Base: `4085622463411d3ba27f4efb7b73a70575170535` (PR #252).
Owned paths: `apps/web/src/views/Sweep.tsx`, `Sweep.quoteLifecycle.test.tsx`,
and `docs/handoffs/agents/SWEEP_QUOTE_LIFECYCLE_20261119.md`.
Acceptance: prevent stale quotes and stale relayed submissions after a balance,
recipient, payment, provider, session, mode, manifest or transport change; retain
submitted and uncertain-outcome evidence after irreversible handoff; preserve
explicit balance consent and existing vault, session, fee and journal guards.
The original stale quote was reproduced against exact source. The full component
regressions, typecheck, lint and hosted checks remain qualification gates.
The execution environment became unavailable during dependency setup. The
reconstructed candidate is an unqualified draft, not a completed acceptance claim.
Existing #231/#252 and broad #262/#264 remain unchanged. Main integration belongs
to the root coordinator. No deployment, release or real transaction is authorized
by this worker claim.

Sweep integration follow-up: Independent review found that #252 alone lets a
balance refresh invalidate displayed context while a prior direct sweep waits
for the vault or RPC. Add the reviewed #272 lifecycle and regression commits
`ab40d79a4452e618dd3f6f462fde2829f5ba7e05`,
`9e4ec2da024ef9a706e9d6cefa988d0a5dd9f7ac` and
`a67d09750f13ae2cfee3a0ad7bdc3ccb6c28b4f0`. Keep unrelated donor changes in
their existing branches. Verify the refresh, stale handoff and post-handoff
evidence cases on the composed tree.

## Mobile browser workflow qualification — 2026-11-23 Pacific

Codex owns branch `codex/qualify-mobile-browser-engines` from main `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Scope is an additive mobile Playwright configuration, mobile-specific regression coverage and an evidence handoff. Reuse existing signed-invoice, injected-wallet, backup, layout and camera tests. Exercise touch navigation and raster QR imports. Preserve the QR and recovery workers' source paths and #373's separate native-engine branch. Record actual browser/OS, device-emulation scope and physical checks still open.

## Mobile qualification resume: exact memo assertion — 2026-11-24 Pacific

Worker: `/root/missed_work_census`, assigned by the resumed-work coordinator. Isolated branch: `fix/mobile-588-memo-assertion-20261124`, based on PR #588 at `46150f4ce0a34da0e23dda36642ba9463ff1e4a1`. The owner branch stays unchanged. Owned paths are `apps/web/e2e/devices-mobile-workflows.spec.ts`, this additive claim, and `docs/handoffs/MOBILE_588_MEMO_ASSERTION_20261124.md`.

Hosted mobile run `45338469535` failed in both profiles. All four devices reached the payment review after QR import, then failed the exact standalone memo-text selector; the production memo paragraph includes its label. Acceptance: reproduce that assertion failure, assert the exact labeled memo in its visible paragraph, and rerun the existing mobile scenarios in available Chromium and WebKit engines. Preserve the review-before-open assertion, camera-denial route, file chooser and backup round trip. Do not change QR/payment production source, parent branches, release gates or deployment. Record runtime limitations and exact source evidence. Integration remains coordinator-owned.

Completion evidence at test-source commit `7d112a5678496d851e8ec22d6603fbb4dec971cf`: original assertion reproduced two failures in the lean Chromium phone/tablet projects; repaired source passed 24/24 selected mobile tests in lean and 24/24 in full across Chromium and native WebKit. Six virtual-camera cases per profile require full Chromium and remain hosted qualification; the first local all-case attempt is explicitly interrupted after one unsupported-camera failure. The changed test passed typed lint, both web builds/typechecks/bundle scans passed, and the secret/whitespace checks passed. Additive evidence is owned under `docs/handoffs/mobile-588-evidence-20261124/`. The coordinator independently reviewed the test correction and found it preserves exact payload verification. Parent branch and production source remain unchanged; no merge or deployment.

## Cloud consolidation lead `ghostpay-6a` — 2026-11-25 UTC

- Worker: Claude Code cloud session `ghostpay-6a` (no home-PC access; peers unreachable by message, so coordination is through this registry, the lock ref and PR text).
- Branch: `nodata/optimistic-maxwell-epuo8f`; base main `32ae3977b6026991ae0591daf385d3c536e2132f`.
- Respects: FC campaign (`claude/feature-completion-20261125`, #664, FC-05b #669), W1 (#667, sole merger of W2–W4), W4 (#668, #287 minimal invoices), W5 (#665, exclusive `verification/independent-beta/**`), `ghostpay-15` (#647), `newghostpay-ae` (#670), backup-60, the shared main-merge queue and `automation/ghostpay-integration-lock`. Never takes or renews another holder's lock; joins the queue at its tail.
- Owned paths (new unless noted): `docs/GHOSTPAY_CONSOLIDATION_TRACKER.md`; `apps/web/scripts/stoppedProducts.mjs`, `scripts/release/verify-release-exclusions.mjs`, `scripts/tests/release-exclusions.test.mjs`; additive guard lines in `apps/web/scripts/localBuildProfile.mjs` and `apps/web/scripts/localBuildProfile.test.mjs`; one additive verification step in `scripts/pages/build-pages.sh`; this entry.
- Unit REL-EXCL (directive §11, STOP_WORK "exact emitted-artifact exclusion remains a release check"): fail the lean/Pages build and the emitted-artifact check if any module of a stopped or deferred product (F01/F02/F04/F08/F09/F11/F12/F13/F14/P07, `src/features/future/**`) is rendered. Containment only: no product code changed, enabled or removed; shared-core mechanisms untouched.
- Unit TRACKER: one consolidated, source-pinned inventory of all open PRs (A–K classes) reusing prior censuses (`docs/consolidation/branch-comparison-20261124-68c82b9`, FC `BRANCH_INVENTORY.tsv`, archive manifest) instead of repeating them.
- Acceptance: new script tests pass; lean web build passes with the guard and fails on a planted stopped-product module; full/lean web typecheck, lint and affected tests pass; hosted CI green at exact head. No dependency, workflow, contract, deployment or product-feature change. No main merge outside the lock queue.

# GP-BUG — Preserve adjacent ICU quoted literals (2026-11-24 UTC)

Worker: sequential BUG-ONLY coordinator, isolated branch `automation/20261124/bug/i18n-adjacent-quoted-literals-r11`; base `03695a7bbb2ad178a729da612bc578ed9a42c4d7`. Own only `apps/web/src/i18n/message.ts`, new `apps/web/src/i18n/message.quoted-literals.test.ts`, additive registry claim and `docs/handoffs/I18N_ADJACENT_QUOTED_LITERALS_20261124.md`. All 237 open PR filename inventories in the dated snapshot through #622 were inspected; no selected source or new test path collision. Six existing broad PRs own message.test.ts; leave it untouched. Main registry had no matching production claim. Existing bigint plural arithmetic issue is separate and out of scope.

Observed failure: stringifyMessage(parseMessage("'{}'")) emits adjacent quote boundaries interpreted as an escaped apostrophe, changing literal {} to {'}. Four of eight direct parser/serializer round-trip probes failed on exact-ref source (type annotations erased for isolated JS execution). Acceptance: regression commit first, group adjacent quoted syntax and apostrophes, preserve ordinary text, literal apostrophes, plural pound, interpolation and nested markup. No dependencies, features, funds, deployment or release. PR #390 already merged, exact head five workflow groups and Snyk succeeded; no submitted review found. Integration lease generation 19 released, not acquired. Full checkout DNS blocked; fresh hosted CI and genuine independent review required before any merge.

---

# GP-BUG — QR intake assembly clock rollback (2026-11-24 UTC)

Worker: sequential BUG-ONLY coordinator (no separate verifier available); isolated branch `automation/20261124/bug/ux-intake-qr-clock-rollback-r11`; base `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
Owned paths: `packages/ux-intake/src/qr.ts`, new `packages/ux-intake/src/qr.clock-rollback.test.ts`, this additive branch-only claim and `docs/handoffs/UX_INTAKE_QR_CLOCK_ROLLBACK_20261124.md`. All 238 open PR changed-file lists at discovery were inspected in bounded batches; no overlap on production or proposed new test path; registry inspected for matching claims. Recheck before integration.
Observed defect: a backward injected clock (1000 -> 999) retains the old incomplete assembly, either mixing old parts or rejecting a new session. Acceptance: test-first two failing rollback cases, discard stale parts on backwards clock, preserve exact TTL boundary, normal progress, duplicate and conflict behavior. No QR format, crypto, payment, dependencies, deployment or release changes. Generation 20 integration lease released, not acquired. Source-hash-matched isolated V8 probes only; full checkout DNS unavailable. Native hosted CI and independent review required before merge.

# GP-BUG — accessible name truncation splits Unicode characters (2026-11-24)

Worker: sequential bug-only coordinator, isolated branch `automation/20261124/bug/i18n-accessible-name-surrogate-r11`, base `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Own `packages/i18n/src/ux/a11y.ts`, new `packages/i18n/src/ux/a11y.surrogate-boundary.test.ts`, this additive claim, and `docs/handoffs/I18N_ACCESSIBLE_NAME_SURROGATE_20261124.md`. All 239 open PR changed-file inventories checked, no matching a11y source/test paths; no matching main ownership claim found. Existing tests untouched. Source blobs `6cb723a259bfa65992e1c3045d473f83125c1e11` and `c378304ba02359d6bf28efa9b81affe326251e1d` hash-verified: 4/6 baseline probes pass, 2 produce lone high surrogates; proposed fix 6/6. Acceptance: failing test commit first, retain 160-unit cap and ellipsis, preserve whole code points at the truncation boundary, unchanged ordinary names. No dependency, feature, payment, release or deployment changes. Generation 20 lease released, not acquired; independent review and applicable exact-head hosted gates outstanding.

## GP-BUG — preserve Swiss locale prefix in amount parsing (2026-11-24)

Worker: sequential ChatGPT BUG-ONLY coordinator; independent verifier unavailable.
Branch: `automation/20261124/bug/nl-amount-locale-prefix-r11`, exact base `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
Owned paths: `packages/ux-intake/src/nlamount.ts`, new `packages/ux-intake/src/nlamount.locale-prefix.test.ts`, this additive claim, new `docs/handoffs/NL_AMOUNT_LOCALE_PREFIX_20261124.md`. Previous locale snapshot #521 is merged; do not edit the existing nlamount.test.ts owned by #224/#238/#262/#264/#278/#372. All 245 discovered open PR file inventories inspected: no collision for production or new test path. Rechecked live main and today's open PR IDs before claim. No lock acquisition: generation 20 released at 4fe0656517a03cb7a39d4e248187c76ffaa3238a.
Observed: with the accepted locale tag de-CH-1996 (or de_CH_1996), lookup falls straight to generic de and reads 1.234 USDC as 1234 USDC instead of 1.234 USDC. Exact de-CH works. Source-hash-matched isolated V8 probes reproduced the mismatch; synthetic parser values only, no real wallet/fund or external service operations. Acceptance: regression commit first, prefer most-specific known locale prefix before language fallback, normalize accepted underscore separators, preserve existing locale grammar, ordinary tags, immutable returned descriptors and unknown/malformed rejection. Require fresh hosted gates and independent review; do not merge or deploy while gates are unresolved.

## Issue #287 — local EVM destination reuse

Worker: Codex, branch `codex/287-local-destination-reuse`, base `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
Scope: destination-history helper/tests, checkout final review, seller sweep destination and successful submission, warning catalog entries, focused browser coverage and v1.1 evidence. The invoice's reusable meta-address is not a payment destination. Compare actual destinations locally within the current account and chain. Verify same and different invoices, address normalization, deliberate sweeps, account changes, reload, storage failure and nonblocking review. Keep payment journals, signing, release and custody gates with their existing owners.

## PR #586 typed notice completion — 2026-11-24

- Worker: `/root/local_handoffs`; coordinator: `/root`. Isolated branch: `finish/destination-reuse-type-20261124`; source parent: `f024ce3e0eab91df40bfd5a75aee2a56d9158e5a` (PR #586), tree `b86ab0da102ab4f7b366acdd23847d8c016958d3`.
- Owned source: only the `FinalPreview` notice prop annotation in `apps/web/src/views/Pay.tsx`; additive ownership and `docs/handoffs/DESTINATION_REUSE_TYPE_COMPLETION_20261124.md`. Acceptance: reproduce hosted TS2322 locally, admit the existing `wallet-changed` notice already supported by the receiving component, prove emitted JavaScript unchanged, and run available focused checks with existing dependencies only.
- Coordination: #584 (`17c5a2ee3828d0132cfdf21e4c966ca7550d07f2`) and #586 are siblings of `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Their journal-backed and separate session-storage histories are alternative mechanisms; neither is adopted as the other's successor. Active wallet/account/privacy owners retain their listeners, authority, signing and transaction semantics. No other branch, test assertion, storage mechanism, catalog or runtime body is edited by this lane.
- Boundaries: no dependency installation, main integration, remote writes, deployment, browser/real-wallet acceptance claim or release-gate change. This narrow repair does not resolve the address-reuse architecture choice or close #287.

Completion: qualified source `3de310900e0261bbfbc00fa30383ca9afcd094c7` passed the original full web typecheck, seven existing focused tests and scoped typed lint. Pay's emitted JavaScript is byte-identical to #586. Root independently approved the one-line prop annotation and subsequently authorized this worker to publish a draft child targeting `codex/287-local-destination-reuse`, preserving #586 ancestry and #584 unchanged. This bounded publication authorization supersedes only the original claim's no-remote-writes boundary; no main integration, shared lease, deployment or gate change is authorized. Source-pinned evidence: `docs/handoffs/DESTINATION_REUSE_TYPE_COMPLETION_20261124.md`.


## 2026-11-25 Pacific — complete reviewed in-scope branches

- Worker: ChatGPT coordinator `/root`, with independent read-only source reviewers.
- Branch: `finish/in-scope-branches-20261125-8812`; base `8aca5a06a9435dd30e40378ba606da3c68f94863`.
- Donors: #680 `f1ec352245d8a9bcb9a201a50db0569b1ec31652`, #671 `4f674cdd71706d1c2566f8cb67cc8421fdc89d6a`, #673 `e2bd32c55155f345e52630910135bf32ed1318a0`. Preserve all donor commits and refs.
- Own only this isolated candidate, additive coordination/handoff records and necessary merge resolutions. All donor nonlog postimages must remain exact; any new behavioral fix needs a separate scoped claim and review.
- Acceptance: preserve latest main and all ownership entries; retain mandatory shared-core privacy including P14; finish scope/help containment, release-artifact exclusion and the four donor QR/i18n fixes; targeted existing tests, affected typecheck/lint, static Pages build, available browser acceptance, independent source review and fresh combined hosted CI.
- Integration: re-read main/donor heads and the cooperative lock; use legitimate lock acquisition and ordinary ancestry-preserving merge only after applicable gates pass. No archive-ref deletion, contract change, chain expansion, wallet transaction, release or deployment.


## Owner scope landing continuation — 2026-11-25 UTC

- Worker: sequential ChatGPT consolidation coordinator, cycle `20261125T1635Z`. Isolated branch `automation/20261125T1635Z/coordinator/owner-scope-landing`; main `694857731aa96d224ba6f83d2e4cf28d77bc35e3`; existing W1 donor #667 `67a241c7589fd97b085c83efd4bfca4147a4114d`, preserving #659 ancestry.
- Owned paths: additive ownership claim and exactly the seven documentation/manifest postimages plus the two additive owner/W1 claims from #667. No source, workflows, package, contract, archive-ref or tracker changes. Existing #659/#667 branches remain untouched.
- Acceptance: exact donor blobs for all seven paths, complete main ownership file retained byte-for-byte as prefix, original freeze/W1 entries retained once, only eight changed paths relative to pinned main. Fresh CI/CodeQL and independent review required; no deployment or main merge authorized by this checkpoint. Lease generation 28 released at preflight; no shared lease acquired.


## Owner privacy-beta scope freeze — 2026-11-25

- Worker/coordinator: ChatGPT `/root`; independent read-only scope and privacy reviews: `/root/stop_inventory` and `/root/privacy_product`.
- Branch: `owner/privacy-beta-scope-20261125`; base main: `595a184b381980a440165832f51a83e8dfd3e8a8`.
- Owner authorization: stop and archive GhostStore, GhostTeams, GhostTips, merchant dashboard, GhostID, GhostPOS, GhostBridge/P2P-Offramp integration, fiat conversion and P07; retain the earlier F14 stop. Preserve branches, commits and already integrated source; keep stopped products dormant for beta.
- Owned paths: `AGENTS.md`, `CLAUDE.md`, the scope notice in `README.md`, `docs/ai/STOP_WORK_20261125.md`, `docs/ai/ACTIVE_WORK.md` (this additive entry), `docs/future/privacy-first/README.md`, `docs/archive/feature-freeze-20261125.json`, and `docs/product/PRIVACY_PAYMENT_BETA.md`. No application, contract, dependency or workflow changes.
- Acceptance: canonical ten-feature directive with shared-core boundaries; exact preserved branch/PR heads; feature-only PRs archived and mixed PRs held; existing integrated code preserved; source-grounded privacy proposal clearly separated from authorized implementation and current release qualification. Verify changed-file scope, links, archive SHA/ref consistency and secret scan; do not claim runtime/build/browser qualification from documentation changes.
- Parallel ownership: `/root/scope_tracker` owns only the external completion tracker Page. This coordinator owns five existing worker-prompt updates and repository/PR archival metadata. No deployment or publication authorization is implied.

Scope-freeze verification: all 34 new archive refs equal their recorded commits and all 34 original refs are unchanged; 17 feature-only PRs are closed and four mixed/adjacent PRs held. Five saved worker prompts retain schedules and explicitly exclude the archive namespace. Tracker sequence 32 archived 23 launch prompts without changing checkbox states. Independent `/root/scope_tracker` read-only review approved scope, claims, links, counts and preserved commit objects with no material issues. `git diff --check` and `bash scripts/scan-secrets.sh` passed. Documentation/metadata only; no new runtime/build/browser/privacy-audit qualification claimed. Normal PR/CI integration remains the next step.

## W1 reconciliation of #659 with newer main — 2026-11-25

- Worker: Claude Code W1 coordinator (local session `ghostpay-58`). Branch: `claude/w1-reconcile-659-20261125` = #659 head `ea94ba7cf2dd5865da4199ed04294f9a71496798` merged with main `aaa71a112d90fd39f59b40de9f139e9cfdc62d61`. The #659 branch itself is unchanged.
- Owned paths: the merge resolution of `AGENTS.md` and reconciliation lines in #659's own files (`CLAUDE.md`, `README.md` scope notice, `docs/ai/STOP_WORK_20261125.md`, `docs/future/privacy-first/README.md`, `docs/product/PRIVACY_PAYMENT_BETA.md`) plus this entry. `docs/archive/feature-freeze-20261125.json` is a dated record and stays unchanged.
- Acceptance: keep both the ten-product stop (#659) and main's mandatory shared-core privacy clarification (`c365dc41`, verbatim). F02/F04 read as archived indefinitely and deferred/disabled for beta/v1.0; P07 stays a separate exclusion; P14 RPC disclosure is in scope and is not F14. Documentation only; no application, contract, dependency or workflow change. Merge only after the integration lock is free and current-head required checks pass.


## 2026-11-25 — owner freeze: static help release-scope containment

- Worker: sequential ChatGPT coordinator, cycle `20261125T1241Z`; branch `automation/20261125T1241Z/containment/help-scope`; exact base `32ae3977b6026991ae0591daf385d3c536e2132f`.
- Owner instruction: ten archived/deferred products excluded from beta/v1.0. Main AGENTS was read; main STOP_WORK file is not yet present (404); read the reviewed #659/#667 candidate documents. No archived-feature development. F04 ordinary per-invoice status/reconciliation and F09 ordinary private QR remain core. No subscriptions program.
- Own only `apps/web/help.html`, additive `apps/web/e2e/static-help.spec.ts` regression, this claim, and `docs/handoffs/HELP_STOP_SCOPE_20261125.md`. #640 has already merged the #583 responsive/static-help work; #640 explicitly states #583 can be closed. Recent #639/#651/#664/#665/#666/#667/#668 changed-file reads show no overlap with these two paths. Do not touch existing PR branches or archived refs.
- Evidence: current help blob `750aee1b39d95b6e6d8a0364ab29d8b96bb6cc54` labels the aggregate dashboard and POS as Planned and tells readers to wait for features; subscriptions are also shown as planned in the app. This is obsolete after the explicit stop directive. Acceptance: show excluded status truthfully, no implied restart, preserve ordinary invoice ledger, all original help tests and content unrelated to this scope. Add exact visible-row regression, retain existing status legend and accessibility gates. No runtime/route/config/dependency/workflow edits, no deploy or real funds. Pages PR workflow validates only; deployment is manual on main. Fresh exact-head hosted checks and independent review required; no integration lock acquired by this cycle.


### Same candidate — preserve PR #666 payment-key export warning

Independent source review also approved #666 `92ff633176760a513a37cb12e3ef96b0e0cb9d80`. Carry its ancestry, its exact catalog regression and its two exact warning values in all four locale catalogs; retain every other current-main catalog value and its original SEC-1 ownership claim. This is existing payment/recovery safety wording, with no key derivation or export-behavior changes. Acceptance adds the existing export-warning/catalog/component tests and locale validation on the combined tree.


### Same candidate — finish PR #647 independent seller-keystore recovery

Independent source review approved #647 `6fd126dbb4d3377ff3cf7d97cfcb426a1e22fee3`. Preserve all ten nonlog donor files byte-for-byte and its existing recovery ownership entries; resolve only the additive work-log conflict. This completes existing independently useful backup verification and payment-key recovery without GhostPay app code. Acceptance: ordinary offline backup compatibility/CLI tests, current application build and locale checks already recorded for the unchanged app tree, source-composition review and fresh combined hosted CI. No new formats, crypto primitives, network discovery, transactions, deployment or product activation.


## Privacy profiles D05 completion — November 25, 2026 Pacific

- Worker: ChatGPT `/root/artifact_review`, assigned by the unfinished-branch coordinator. Isolated branch `finish/privacy-profiles-d05-20261125`, base candidate `04b1a5acf6b48313178af85a3217512e57453dd5`; worktree `/workspace/scratch/8812b4211518/GhostPay-d05`.
- Preserve donor ancestry with normal merges: #644 `94ab256e5285f4009f915be18415bf0146a1242f` and the selected decision record #651 `be04d1167aeb24025f5a4970833ebb2dbb98af70`. Both published heads rechecked unchanged; current main is `8aca5a06a9435dd30e40378ba606da3c68f94863`. Resolve only additive ownership-log conflicts; original branches remain untouched.
- Own only the selected D05 follow-up in `packages/privacy-profiles/src/presets.ts`, its directly affected package tests/snapshots and package README/DEVIATIONS/COMPLETION documentation, this additive claim and `docs/handoffs/PRIVACY_PROFILES_D05_COMPLETION_20261125.md`.
- Acceptance: Shielded automatically proposes buffer-funded exit gas only; Maximum keeps its existing advanced preference order; explicit sponsored and EIP-7702 edits retain applicability, capability and consent checks; legacy config and all other preset behavior stay unchanged. Focused regression plus full package typecheck, lint, build and coverage tests must pass without weakening gates or assertions.
- Scope: standalone configuration library only. No app integration, execution, provider activation, fees, dependency changes, other packages or workflow edits. No further policy decision is needed for D05; #651 already selected it. Existing donor claims and historical evidence remain intact.
- Publication: local commits and source-pinned handoff only for independent coordinator review. No push, remote mutation, main merge, lock acquisition, deployment or release by this worker. Keep candidate #684 and its active CI untouched.

## 2026-11-25 — privacy-profiles standalone completion (issue 284 / F18 package slice)

- Worker: Claude Code session (single worker, one read-only reviewer agent). Local branch `worktree-privacy-profiles-completion`, published to `nodata/peaceful-faraday-enxrin`. Base/main: `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Checked 2026-11-25: of the open PRs that mention the package, only draft #278 touches it, and only the devDependency versions in `packages/privacy-profiles/package.json` (vitest 5.1.0); this work does not edit that file.
- Owned paths: `packages/privacy-profiles/**` (src, tests, snapshots, README, DEVIATIONS, COMPLETION) and this additive claim. Not touched: `packages/metadata-hardening`, confidential amounts, contracts, payment execution, `apps/web`, `packages/privacy-pipeline`.
- Acceptance: five presets (adds Shielded), versioned config with migration and strict parse, consent review and immutable snapshots, truthful capability descriptions, definition self-validation, fail-closed input guards; typecheck, lint, build and coverage thresholds (95/90/95/95) pass; nothing claimed beyond the package.
- Out of scope and unclaimed: F18 app layer in `apps/web`, FEE01 quotes, live capability observations, reconciling the pipeline package rules copy.


## Privacy-profile configuration decisions — November 24, 2026 Pacific

- Worker: ChatGPT `/root`, session `20d1eadb5dc2`; two read-only configuration reviewers.
- Branch: `docs/privacy-profile-decisions-20261124`; base main: `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f`.
- Owned paths: new `docs/handoffs/PR644_CONFIGURATION_DECISIONS_20261124.md` and this additive claim only.
- User scope: resolve the configuration choices left by PR #644. Inspect #644 at `94ab256e5285f4009f915be18415bf0146a1242f`, the legacy profile specification, issue #284 and full F18 specification at `5c0f12c5d3373d81ab3fda9095bc3c64b8bd777a`.
- Acceptance: every named open choice has an explicit selected policy, a distinction between existing behavior and follow-up work, and measurable integration criteria. Verify source references, option/rule names, document links, whitespace and secrets. No runtime test result is implied by a documentation check.
- Ownership: #644's Claude Code worker owns `packages/privacy-profiles/**`; draft #278 separately touches its devDependencies. Preserve those files and branches. The record covers decisions only, with no application integration, provider activation, fee policy, main merge, deployment or release.
- Status: decision record complete. Source/path/identifier/link checks, staged whitespace check and secret scan passed; final read-only review approved the documentation scope after a terminology correction. Publish as a draft from this isolated branch; no package implementation or integration claim.
# Coordinator continuation: completed clipboard handoff and P14 evidence — 2026-11-26 UTC

- Worker: ChatGPT coordinator delegate `branch_triage`; branch `finish/clipboard-p14-20261126`; base the published #685 head `db544fa5e2e28129d6e8e53bb293d72dc08b8c02`.
- Authorization: the owner's instruction to finish unfinished approved-scope GhostPay branches and the lead coordinator's explicit delegation to compose #668 and #658. This is integration of delivered work, not reassignment of W4's next privacy-minimal-invoice task or W5's independent verifier.
- Inputs: #668 `74e0c61dd0edddc7bcbc1a963d7f4e2481cdcda1` (W4's completed clipboard handoff to W1, preserving #553/#580 ancestry) and #658 `9aed3886693270524beb118685e5947469899c43` (P14 descriptive RPC disclosure evidence, reviewed by W1). Both live heads rechecked before composition. Original branches remain unchanged.
- Owned paths: merge reconciliation in this additive registry and `docs/handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md`; a new source-pinned integration handoff; only necessary, independently reviewable composition repairs in these inputs' existing clipboard and descriptive-evidence paths. Preserve all current base records, newest locale additions, shared-core scope and both donor histories.
- Acceptance: normal ancestry-preserving merges; ordinary focused clipboard/backup and descriptive P14 regressions, relevant typecheck/lint and secret/whitespace checks; no new feature behavior, fuzz/mutation or vulnerability-reproduction campaign. Root owns independent final review, publication, fresh hosted CI and the integration lock. No remote mutations by this delegate.
- Boundaries: preserve #685 privacy-profile choices; leave W4 minimal invoices, W5 `verification/independent-beta/**`, original donor refs, excluded/deferred products, dependencies and workflows untouched. The P14 addition supplies synthetic evidence only and makes no anonymity, audit, deployed or completeness claim.
- Result: composed source `222d0708d4a05fb94e4b7b94f14e0811a1ad9b76`, tree `1ce5d98a9b977982ea01e31d09eca519db85e320`, retains both donor ancestries. Focused checks passed (170 web tests and 11 deterministic evidence tests; four randomized properties unrun), both affected typechecks and lint passed, and independent AI source review approved. See `docs/handoffs/CLIPBOARD_P14_INTEGRATION_20261126.md` for exact commands, environment prerequisite, reconciliation and remaining hosted gates. Root retains publication and lock ownership.

# PRIV-T02 RPC disclosure instrumentation and scan-privacy qualification (2026-11-25 UTC)

Worker: Claude Code lead (`priv-lead`) with delegated workers; coordinator branch `claude/priv-t02-rpc-disclosure`; base main `60824005b89611aea2b16d3355378eebf072eedb`.
Child branches (isolated worktrees, merged by the lead only): `claude/priv-t01-indexer-omission` (PRIV-04), `claude/priv-t07-light-evidence` (PRIV-05), `claude/priv-checkpoint-safety` (PRIV-06).
Owned paths: new `apps/web/src/test/rpcDisclosure*.ts`, new `apps/web/src/lib/scanDisclosure*.test.ts`, new `packages/scan-source/src/*.omission.test.ts` and `*.evidence.test.ts`, new `apps/web/src/lib/scanClient.checkpoint*.test.ts`, `docs/research/privacy-evidence-matrix-2026-11-10.md`, `docs/research/privacy-rpc-call-graph.md`. Additive-only changes to `packages/scan-source/src/{light,types,index}.ts` if a typed evidence representation is justified.
Not owned: `apps/web/src/lib/scanClient.ts` and `scannerCore.ts` runtime (many open PRs touch scan paths, e.g. #625, #635, #653); any change there is reported with a failing regression test first and coordinated. No production telemetry, no new runtime dependency, no change to payment verification.
Acceptance: test-only instrumentation over the existing transport boundaries recording classes not values; scenarios A to J; indexer omission and truncation tests that never expect an undetectable omission to be detected; light-client evidence bounded; checkpoint safety regressions; matrix updated only with evidence actually produced; focused tests, typecheck, lint, hosted CI on the exact head.

# Coordinator continuation: request-file completion — 2026-11-26 UTC

- Worker: ChatGPT `/root/artifact_review`, delegated by the unfinished-branch coordinator. Dedicated branch `finish/request-file-completion-20261126`; isolated worktree `/workspace/scratch/8812b4211518/GhostPay-request-files`; base the stable clipboard/P14 candidate `222d0708d4a05fb94e4b7b94f14e0811a1ad9b76`, itself descending from published #685 `db544fa5e2e28129d6e8e53bb293d72dc08b8c02`.
- Inputs: #650 `3851f02b04325d417a52b80cc107290f1f434597` and #654 `a75ed0b14e26a0035f3922625d3b1ee3b06447da`, both freshly rechecked. Preserve both by normal merges and keep every original branch and ownership record. The coordinator confirmed succession after the feature-completion driver exited; #650 records explicit owner approval for the signed invoice request-file slice. Current main `29d21c1b2d8f8431115d99338db1667dc585ac16` instructions remain binding.
- Own only additive merge reconciliation in this registry and `apps/web/src/i18n/securityKeys.ts`; the bounded app-lock cancellation follow-up in `apps/web/src/components/CameraImporter.tsx` and directly affected ordinary lifecycle tests; the real-passphrase timing fix in `apps/web/src/views/Pay.requestFile.test.tsx`; and a new `docs/handoffs/REQUEST_FILE_COMPLETION_20261126.md`. Preserve donor request-file behavior, latest 180-second interop timeout, clipboard policy, P14 evidence, existing locale values and current-main payment/recovery checks.
- Acceptance: app lock aborts pending camera/paste/image work, stops tracks, clears partial transfer state and prevents automatic restart while keeping D1's textarea node and draft text; real scrypt remains exercised with a bounded per-case wait and total timeout; ordinary focused tests, affected typecheck/lint/build, source preservation, whitespace and secret checks pass. No assertion or coverage weakening.
- Boundaries: approved request-file interchange and shared-core local privacy only; no broader F03 product, excluded/deferred feature activation, wallet/send/journal redesign, KDF weakening, dependency/workflow change, mutation/fuzz/exploit campaign or deployment. Root owns independent review, publication, combined hosted CI and integration. This worker makes local commits only and no remote mutations.

# FC-01 — F03 signed invoice request-file interchange onto current main

Worker `fc01`, branch `claude/fc01-f03-request-file-20261125`, base main
`f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f`; donor PR #310 head
`dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`, merged with `--no-ff`. Owned paths: the F03 request-file
components, `requestFileInterop.test.ts`, `Pay.requestFile.test.tsx`, `Pay.invoiceQr.test.tsx`, F03 hunks of
`apps/web/src/views/{Pay,CreateInvoice}.tsx`, F03 keys in `securityKeys.ts` and the four locale catalogs,
`apps/web/e2e/payment-request-file.spec.ts`, `packages/invoice-schema/{src/requestFile*,src/index.ts,README.md}`, and
`docs/consolidation/feature-completion-20261125/FC-01-f03-request-file.md`. Journal and attempt code are excluded.
Acceptance: file selection never connects a wallet or submits payment; opened requests pass the existing
signature, signer, passphrase, expiry and review flow and the #500 pre-send checks; hosted CI green.

# F03 current-main reconciliation — 2026-11-20

Coordinator: ChatGPT `/root`; fresh integration reviewer: `f03_main_reconciliation_review`.
Task branch: `continuation/f03-main-reconciliation-20261120`.
Feature input: `1de98f6c9371010883253450446e6f7294da84fa` (`future/f03-private-payment-links`, PR #310).
Main input: `aa3df1cb37274fae73af0ca957183c15c51b62d3`; common base:
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Separate source-pinned audit evidence remains
at `9a0e268034ee2321c5e333c35a3aa1825b1c8f63` on `audit/f03-browser-qualification-20261120`.

Owned changes: combine the additive ownership registries and add
`docs/future/modules/F03-private-payment-links/round3/` reconciliation evidence/handoff.
The reviewer owns only `round3/RECONCILIATION_REVIEW.md`; all source is read-only for it.
Incoming main source/tests/docs are preserved exactly, as is the adopted F03 memo-test blob
`085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f`. No unrelated source repair is authorized by this
claim. Extend ownership before any demonstrated regression requires a fix.

Acceptance: verify actual heads and merge preview, retain every incoming/base ownership entry,
confirm main ancestry and the exact union of both inputs, inspect the small shared QR/build/profile
and payment-URI integration surface, run appropriate focused regression gates, and obtain fresh
independent review. The preview conflicts only in `docs/ai/ACTIVE_WORK.md`. Publish with an
expected-head lease and retain actual-current-head full/lean browser qualification. Existing
1de98f6c CI observations remain historical after any integration; no pass transfers automatically.
No force update, merge to main, live transaction or deployment.

Status: reviewed integration `f0968b9541dbd3234a6b0516023773845c04c4e4`, exact-tree API
equivalent `7c30385a44d1cac76e9137eea9fc522865ac53f0`. Fresh source/standards/spec checks
report zero findings. All 15 local commands passed: payment-URI 206 tests/coverage, package
build/typecheck/lint, shared-web/F03/QR 294 tests, whole-web typecheck, scoped typed lint,
full/lean static builds and original scans, both six-case collections, and scoped publication
checks. Command records distinguish raw/normalized console bytes and preserve source pins.
See `round3/QUALIFICATION.md` under this feature for the executed gates and successor prompt.
Actual new published-head full/lean browser execution and required CI remain pending.

# PR #310 invoice-file memo browser checks — 2026-11-20

Worker: ChatGPT `/root`; independent read-only reviewer: `/root/memo_review`.
Task branch: `fix/pr310-invoice-file-memo`; publication target: existing PR #310
branch `future/f03-private-payment-links`.
Base: `976d26ee791836c176431c8a5d0b825486f78caf`; observed main:
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/e2e/payment-request-file.spec.ts`, this additive claim,
and `docs/handoffs/PR310_MEMO_BROWSER_CHECKS_20261120.md`.
Acceptance: match complete labeled memo text in the payment-review region;
ensure locked and superseded memo absence checks detect labeled text; pass all
six invoice-file browser cases in both original full and lean configurations,
web typecheck and scoped typed lint; retain all existing assertions and gates.
Evidence: CI run `44692101562`, full job `136181689920` and lean job `136181689927`,
each failed the same four memo checks. Reinspect the PR head before publication.
Scope: test assertions only; preserve the F03 implementation and other workers.
Status: independent source review, full web typecheck, scoped typed lint, original
full/lean collection (six cases each), secret scan and whitespace check pass.
Local Chromium is blocked before assertions by socket permissions; hosted full/lean
browser qualification is required. See `docs/handoffs/PR310_MEMO_BROWSER_CHECKS_20261120.md`.

# F03 payment request interchange — 2026-11-19

Coordinator: ChatGPT `/root`; workers: `request_codec`, `request_browser`, `request_qa`.
Branch: `future/f03-private-payment-links`.
Base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` (fresh origin/main clone).
Authorization: the owner explicitly requested selection and implementation of one future feature,
continuation of an existing branch if present, and fresh independent audits after completion.
Git branch inventory and connector search found no existing F03 branch at discovery.
Owned paths: new invoice-schema request-file module/tests/exports; new browser request-file
components/tests; minimal CreateInvoice/Pay integration; additive English catalog entries;
F03 specification, user guide, audit and handoff documents. No dependency, contract or fee changes.
Acceptance: the same signed envelope round-trips unchanged through URL, QR and bounded JSON file;
local explicit import preserves signature, signer, chain, expiry and payment review; stale reads
cannot replace current intent; affected-package gates, browser checks and fresh audits pass.
Existing invoice, QR and privacy work is preserved. No main merge or deployment is authorized.

Fresh audit generation: `f03_audit_standards`, `f03_audit_spec`, `f03_audit_privacy`.
Reviewed implementation: `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.
Owned audit paths: respectively `docs/future/modules/F03-private-payment-links/audits/`
`STANDARDS.md`, `SPEC.md`, and `PRIVACY_SECURITY.md`. Production source is read-only
for all three auditors. Acceptance: full selected-feature source review, actual evidence limits,
concrete findings and independent follow-up on coordinator repairs. Root owns serial broad gates.
Audit repair: `f03_audit_spec` additionally owns focused app-lock regression additions in
`apps/web/src/views/Pay.requestFile.test.tsx`; root owns the minimal production repair.
Existing implementation is frozen until the new regression demonstrates the reported omission.
Catalog qualification repair: `f03_audit_standards` additionally owns additive `requestFile.*`
entries in `apps/web/locales/{ar,es,ja}.json`, using the existing unreviewed-English fallback
convention, and its report follow-up. The 45 missing-key failures are recorded before edits.
No existing translation or reviewed-security digest may change. Root owns final catalog check;
the separate specification/privacy workers independently review this bounded repair.
Status: selected implementation and fresh audits complete. The shared medium app-lock finding
is repaired with four independently RED/GREEN regressions; combined focused suite 114/114 and
full invoice-schema 813/813 with original coverage thresholds pass. Final product checkpoint
`e543d25fc7f3b65460518f4b3df4c513d34a1215` is published as exact-tree equivalent
`bd128598f1b4c5291dad5c003a4775ad47bbb888` in draft PR #310. Catalog, typed lint, typecheck,
full/lean static builds and original bundle scans pass. Actual Chromium execution remains
blocked locally and hosted checks remain pending. See the source map, audit reports, evidence
and successor prompt in `docs/future/modules/F03-private-payment-links/{QUALIFICATION,HANDOFF}.md`.

## Request-file claim reconciliation addendum — 2026-11-26 UTC

The #650 merge also conflicts at the existing CopyButton/download adjacency in `apps/web/src/views/CreateInvoice.tsx` after clipboard integration. This coordinator owns only that conflict resolution: retain the clipboard `autoClearAfterMs` prop and add the donor's request-file download control immediately after it. No other CreateInvoice behavior is reassigned or changed.

## Request-file download-name integration addendum — 2026-11-26 UTC

Worker: ChatGPT `/root/artifact_review`, branch `finish/request-file-completion-20261126`,
following the bounded claim above and the independent source review of `68753b5898a9407aa85ea4ce27baee8c6acdf687`.
Additional owned paths: `apps/web/src/lib/downloadNames.ts` and
`apps/web/src/components/PaymentRequestDownload.test.tsx`, only to retain the documented,
fixed, value-free `ghostpay-request.gpr.json` name through the real shared download helper.
Acceptance: an ordinary component-to-anchor regression must fail before the allowlist repair
and pass afterward; preserve all fallback sanitization and existing download behavior.
The parent coordinator authorized this integration repair. No other filename or download
policy is changed. Clipboard/P14 source and its completed `66dc4af9f97c3f8898abee1c063921d08291dad9`
handoff are preserved by normal merge before these edits.

The filename repair additionally owns `apps/web/src/lib/downloadNames.test.ts` solely to
reconcile its exact fixed-name/call-site audit with the documented `.gpr.json` name and
the new request-file call. Existing fallback checks remain intact; the randomized property
is preserved without being run as part of this bounded qualification.

## Completed coordination handoff adoption — 2026-11-26 UTC

Worker/branch: ChatGPT `/root/artifact_review`, `finish/request-file-completion-20261126`.
The parent coordinator independently approved docs-only PR #686 at
`487fb19b046966cd2f89ad0b83c17bcb66feea73` for this candidate. Owned path:
`docs/GHOSTPAY_CONSOLIDATION_TRACKER.md`, only its normal-merge adoption and the correction
of #673's hosted-check count from all 42 green to 39 successful checks and three intentional
skips. Preserve all other donor content and ancestry. No product or integration gate changes.

## Wallet-attempt fixture handoff adoption — 2026-11-26 UTC

Worker/branch: ChatGPT `/root/artifact_review`, `finish/request-file-completion-20261126`.
Base implementation: `7d7b25d4c4079f680c499736d399cdcf3bd13f73`. The parent coordinator
accepted the newly explicit #686 handoff of test-only PR #595 at
`534bb3808d0f37dd2e6c1f4aaca7c529d9b2432c`; its #545 parent is already integrated.
Owned paths: `apps/web/src/components/WalletAttempts.status.test.tsx`, additive ownership
and the donor `docs/handoffs/WALLET_ATTEMPTS_STATUS_FIXTURE_20261124.md` for normal-merge
preservation. Port only the awaited real IndexedDB migration, spy restoration and two
delayed-settlement-after-unmount cases into the current fixture; preserve current #675
live-region/hash privacy assertions and retain exactly one cleanup. Acceptance: run the
whole composed fixture, typed lint and typecheck; obtain independent composition review.
This explicit handoff supersedes the older ownership note only for this bounded test slice.
No production wallet, journal, status or transaction behavior is changed.

# Recover PR #545 wallet status fixture qualification — 2026-11-24 UTC

Worker: `/root/resume_payment_safety`, delegated by the missed-worker recovery coordinator.
Branch: `codex/recover-wallet-attempt-status-fixture-20261124`.
Exact parent: PR #545 `d1e167f1b5372f74506fc104220b9a03cb6a3e92`; #500 remains the journal owner.
Owned paths: `apps/web/src/components/WalletAttempts.status.test.tsx`, this additive claim, and `docs/handoffs/WALLET_ATTEMPTS_STATUS_FIXTURE_20261124.md`.
Scope: repair the test lifecycle that allowed an asynchronous journal migration rejection to update React after the jsdom environment was destroyed. Hosted CI run `45311266153`, job `138198190848` passed all 3,057 tests but failed on that unhandled rejection.
Acceptance: deterministic migration completion and rejection coverage, explicit component cleanup, unchanged status assertions and production code, focused native Vitest and typed ESLint, source-pinned handoff. Preserve #545/#500/#528/#541 branches and integration ownership. No deployment, shared-branch write, new dependencies, real wallets or real funds.

---

## Request-file completion qualification — 2026-11-26 UTC

Worker: ChatGPT `/root/artifact_review`; branch `finish/request-file-completion-20261126`.
Completed source: `28c45149da4bc0b6f2fc6e82cfcd09b185dc4ff3`, tree
`89a3c3604005633b74ddfea98b3e567543bd2ab8`; bounded source repair commit
`7d7b25d4c4079f680c499736d399cdcf3bd13f73`. Clipboard/P14 `66dc4af9`, #650 `3851f02b`,
#654 `a75ed0b1`, #686 `487fb19b` and #595 `534bb380` ancestry is retained normally.

App-lock cancellation preserves the same QR textarea/draft, fixed request downloads keep
the documented value-free name, and real-scrypt acceptance has a bounded 120-second wait
inside a 180-second case. The original 180-second interop donor remains exact. The #595
fixture preserves all six status/privacy cases, adds its two delayed migration cases and
has one cleanup. #686's sole donor correction records 39 successful checks and three skips.

Fresh evidence: 12 new regressions failed before repair and passed afterward; 241 focused
web + 85 request-file codec/interop + 26 composition tests passed (352 distinct selected
cases). One existing filename fuzz property was deliberately unrun. Library builds,
web/invoice-schema typecheck/lint, composed fixture typed lint, catalog validation
(0 errors, 853 fallback warnings), full build and lean build/postbuild scan passed.
The full browser command reached the server, but all 13 cases failed before assertions
because the installed Chromium launcher refers to a missing executable. Lean collected
the same 13 cases without an execution retry. No browser pass is asserted. Secret scan
passed. Independent source review approved both repair and composed pins; hosted combined
CI and actual full/lean browser acceptance remain mandatory before parent integration.

Handoff: `docs/handoffs/REQUEST_FILE_COMPLETION_20261126.md`. No remote mutation,
activation of an excluded product, dependency/workflow change or live transaction was performed by this worker.

## Core idle suspension and sole-signer recovery continuation — 2026-11-26 UTC

- Worker: ChatGPT `/root/branch_triage`, delegated by the unfinished-branch coordinator.
  Isolated branch `finish/idle-recovery-core-20261126`; canonical F03 base
  `39cece11afac78212d9f7331aeb1ab1a5fe8d427` (tree
  `529af494cdd8713b2dd0478f3f528260291bd830`).
- Authorized core donors: #365 `45ece45defd2a26cfb7f471ea4654ba4d1d2266e`,
  #544 `4b077d2b13f956cfcf9bce1726f929cca40c7394`, and #577
  `2363943571de84bfd5da0b3f167699f34eb53ce7`. Preserve their original refs.
  Port only independently required session suspension and encrypted recovery; do not
  merge mixed #372 history, restore excluded products, or call a mixed branch completed.
- Owned paths: `apps/web/src/lib/session.ts`, `apps/web/src/lib/keyVault.ts`,
  `apps/web/src/AppShell.tsx` idle clock/suspension routing and navigation hunks,
  `apps/web/src/views/SellerKeys.tsx` suspension visibility hunks, focused session/vault,
  AppShell/App and SellerKeys regression tests, additive idle/recovery catalog keys in
  `apps/web/locales/{en,ar,es,ja}.json` and `apps/web/src/i18n/securityKeys{,.test}.ts`,
  directly affected idle-policy user documentation, this record and a source-pinned handoff.
- Shared-path agreement: `/root/artifact_review` owns account/privacy presentation
  revocation and only AppShell's boundary import/provider mounting. It will not change
  this worker's session/vault APIs, idle effect or suspended routing. Final composition
  receives independent `/root/help_review` review before root publication.
- Acceptance: revoke active key authority synchronously at expiry; retain a sole signer
  or unconfirmed backup in boxed memory for encrypted save/export/verification only;
  resume ordinary authority only through normal import/unlock; keep stale async results
  invalid, clock and replacement generations isolated, and current beforeunload protection.
  Preserve `verifyCredentialForCurrentSession`, raw export credential checks, full vault
  identity checks, current backup operation ownership, wallet disclosure, clipboard,
  payment, retention and privacy guards. Retain existing regression coverage and the
  earlier credential-specific idle cases as well as newer recovery tests.
- Qualification: bounded ordinary synthetic lifecycle and regression cases, affected
  library builds, web typecheck/lint and catalog checks. No fuzz/mutation/exploitation
  campaign, deployed target, real funds, dependency/workflow/contract change or remote
  publication. Parent owns fresh hosted gates, integration lock and remote merge.

## Core account and vault presentation revocation continuation — 2026-11-26 UTC

- Worker: ChatGPT `/root/artifact_review`, delegated by the unfinished-branch coordinator.
  Isolated branch `finish/privacy-revocation-core-20261126`; canonical F03 base
  `39cece11afac78212d9f7331aeb1ab1a5fe8d427`, with the independently owned idle/recovery
  checkpoint `9816c7c030bd35ec35ec94ff43382ef324fac800` composed before edits.
- Source donors: #571 `63f40efac175e5ee49563326dbef930aafb14235`, #612
  `e580fcac85e1e7fc2a42a4c7ea7d5a581418aab8`, #645
  `3b7351c7f289dc8d4f928a9cefd408d9fcfbb8d7`, #652
  `724afdcf557178d8b78d841b681f50e99d41935f`, and #655
  `1dcd5a25130b9db6afc4d224c619cd4dbcf0307c`. Mixed #372
  `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` is a source reference only; preserve all
  donor refs and do not merge excluded-product or unreviewed dependency history.
- Owned implementation: `apps/web/src/components/SessionPresentationBoundary.tsx`,
  `apps/web/src/lib/useWalletPrivacy.ts`, wallet lifecycle and returned-outcome retention
  in `lib/wallet.ts` and `lib/duplicateAttemptJournal.ts`, account-scoped
  `components/WalletAttempts.tsx`, vault access notifications in `lib/tags.ts`, and
  presentation cleanup in `views/{Pay,CreateInvoice,Scan,Sweep}.tsx`,
  `components/ReconciliationLedger.tsx`, and `features/registry/RegistryView.tsx`.
  `features/policy/PolicyPay.tsx` is limited to passing the existing connected wallet to
  the shared history component; no policy feature behavior or activation is in scope.
  AppShell ownership is only the boundary import/provider mount; session/keyVault APIs,
  idle handlers and suspended routing remain `/root/branch_triage`'s work.
- Supporting scope: focused ordinary regression fixtures adjacent to those paths,
  additive localized revocation/history text in `apps/web/locales/{en,ar,es,ja}.json`
  with security classification, this additive ownership log, and source-pinned
  `docs/handoffs/ACCOUNT_PRIVACY_CORE_COMPLETION_20261126.md`.
- Acceptance: revoke old account/vault/session presentation and async authority before
  stale results repaint; preserve D1 QR input, existing disclosure and cryptographic
  checks, #635 payment outcomes, #683 Sweep controls, clipboard and retention behavior.
  Keep returned hashes recoverable only to the matching connected account/chain and
  duplicate-blocking until actual durable journal completion. Preserve the current
  Web Lock/IndexedDB/mirror journal, nonce/replacement union and unknown blockers.
  Keep encrypted history and durable bytes intact. Adapt donor assertions to current
  interfaces with all substantive no-send, concealment and recovery checks retained.
- Dependency closure, workflows, contracts and product activation stay unchanged;
  in particular no `@ghostpay/ux-core` dependency or reachability allowlist extension.
  Qualify with bounded synthetic regressions, affected builds, typecheck, lint and
  retention/release checks. No fuzz/mutation/exploitation campaigns or live transactions.
  This worker performs no remote mutation; parent owns independent final review, fresh
  hosted CI, integration lock and publication.

### Idle recovery acceptance and tag-vault boundary addendum — 2026-11-26 UTC

The same worker owns `apps/web/e2e/idle-session.spec.ts` and the sole-signer idle
case in `apps/web/e2e/pages-devnet.spec.ts`, preserving ordinary deterministic
browser acceptance from the pinned donors without merging their older infrastructure.
Collection/typecheck is local evidence only; browser execution remains a parent gate.
The continuation also owns `apps/web/src/lib/tags.ts` and a focused
`apps/web/src/lib/tags.idleSession.test.ts`: the supplied viewing-key buffer must be
wiped even if the new synchronous expiry check rejects before a storage read, and
tag unlock must use empty-session-capable active authority rather than a recovery-only
revision guard. Preserve existing tag formats, stores, retention and tests.

### Idle recovery local handoff — 2026-11-26 UTC

Scoped source `14aa1742a7c4f60fbbb851b55581e532e8961e57`, tree
`0ad292f2b8eeda5b7d2ca3c3df7a343d843742de`, passed 241 selected ordinary unit
cases, a focused rerun of the restored signer-only banner assertions, web TypeScript,
catalog validation (0 errors; 853 draft/fallback warnings) and secret/whitespace
checks. Initial typed lint required the correction recorded immediately below. Fourteen browser cases were collected only. `/root/help_review`
approved this exact implementation/tree. Full/lean browser execution, devnet acceptance,
combined privacy-interface review, fresh hosted checks and integration remain with root.
See `docs/handoffs/IDLE_RECOVERY_CORE_20261126.md`. Original mixed donor refs remain
preserved; no whole-backlog or excluded-feature completion is asserted.

Final qualification follow-on: `2936c8e3f91c99b4d86c29f5071f4d0566c938aa`, tree
`90ca16eb10eb520dfdaafde6d3648b4bc789090c`. Strict lint exposed two unsafe-return
errors in the donor test's untyped signer spy; the one-line `vi.fn<() => void>()`
correction then passed the exact sole-signer case, web TypeScript and typed ESLint
over all changed TS/TSX files with completed zero-exit processes. Runtime source
remains identical to `0e301a14`; `/root/help_review` extended approval to this exact
final source/tree after checking that no assertions or production code changed.


## Coordinator request-file hosted browser qualification — 2026-11-25 (8812)

- Worker: /root coordinator; branch: fix/request-file-browser-qualification-20261125-8812.
- Base: published request-file candidate 39cece11afac78212d9f7331aeb1ab1a5fe8d427 (PR #688).
- Owns: apps/web/e2e/app.spec.ts, apps/web/e2e/devices-mobile-workflows.spec.ts,
  apps/web/e2e/payment-request-file-attempt.spec.ts, this additive record and
  docs/handoffs/REQUEST_FILE_BROWSER_QUALIFICATION_20261125.md.
- Observed gate: hosted lean job 139628238899 failed four cases on the retired QR
  disclosure label and one case because the request-file wallet fixture had not
  adopted the current real wallet-disclosure interaction. Full profile is also red.
- Acceptance: use the current request-file/QR section label, drive the real wallet
  disclosure controls in both mock-wallet tabs, preserve every existing privacy,
  camera-denial, invoice-review and duplicate-payment assertion, and require fresh
  full/lean hosted browser success. Record actual local lint/typecheck/collection.
- Scope: browser fixtures only; no runtime, policy, dependency, timeout, workflow,
  deployment, excluded-product activation or donor-ref change. Existing idle and
  privacy continuation owners keep their separately claimed runtime paths.

### Request-file hosted browser correction result — 8812

At local source 5fa157f509ca2e5bda198bf4b13e427273987bbd, the three claimed browser
fixtures use the current QR/request summary and the existing real wallet-disclosure
interaction. Original privacy and duplicate-payment assertions and time limits remain.
Typed lint and full web typecheck passed; Playwright collected 20 cases without browser
execution. Both initial hosted profiles had the same five fixture failures, documented
in docs/handoffs/REQUEST_FILE_BROWSER_QUALIFICATION_20261125.md. Independent source
review and fresh hosted combined/full/lean qualification remain the promotion gates.


### Core presentation concealment regression delegation — 2026-11-26 UTC

- Worker: ChatGPT `/root/artifact_review/concealment_tests`, delegated by
  `/root/artifact_review`; branch `finish/privacy-concealment-tests-20261126`.
  Source base `6cea65ce4aa7db69ace0733eceef1b3b8b6df28c`, the composed privacy
  continuation, with existing owned runtime changes preserved.
- Own only new focused fixtures: `apps/web/src/lib/tags.revocation.test.ts`,
  `apps/web/src/views/Scan.tags.revocation.test.tsx`,
  `apps/web/src/components/ReconciliationLedger.revocation.test.tsx`,
  `apps/web/src/views/CreateInvoice.revocation.test.tsx`, and
  `apps/web/src/views/Sweep.revocation.test.tsx`, plus this additive record.
- Acceptance: access/session/app-lock changes conceal decrypted history, tags and
  drafts; obsolete asynchronous results cannot repaint a later access interval;
  encrypted durable bytes and already-recorded sweep outcomes remain intact, with
  no additional transaction or RPC action caused by revocation.
- Ordinary deterministic synthetic regressions only. No production changes,
  dependency/workflow change, experimental activation, fuzz/mutation campaign,
  remote mutation or broad mixed-donor merge. Parent owns implementation review,
  combined qualification and integration.

### Core presentation concealment regression result — 2026-11-26 UTC

At test source `14ca56a7d548c151b39a66524827d67fed9f600b` / tree
`23c1c5970390fffdefe2833b66463eb7d0ab67ea`, five new fixtures add 21 ordinary
synthetic cases without changing production source or existing assertions:

- TagVault (3): access notifications occur after key install/erase, observer errors
  do not interrupt lock, obsolete unlocks stay revoked, and encrypted bytes survive.
- ReconciliationLedger (3): manual/idle lock clears decrypted rows, backup drafts
  and errors; a late vault-open result is locked; encrypted and legacy records remain.
- CreateInvoice (5): manual/idle lock and session replacement discard draft fields
  and passphrases; late construction success/failure does not restore the old invoice.
- Scan (4): locked tags and drafts disappear; old find/list/save completions cannot
  overwrite a later access interval; saved encrypted tag records remain recoverable.
- Sweep (6): presentation revocation scrubs the detached credential field, clears
  selection and destination, cancels a pending balance read, and preserves submitted
  or uncertain handoff outcomes. Explicit reselection, balance read and destination
  entry still leave signing blocked by the retained outcome; no second send occurs.

Qualification completed with zero exits on that source: the five fixtures together
passed 21/21 with coverage disabled, full web TypeScript passed, and typed ESLint
over those fixtures passed. `git diff --check` passed. Dependencies were installed
locally with `npm ci --ignore-scripts --no-audit --no-fund`; unchanged package builds
were copied from the parent worktree based on the same package source. The initial
five test failures were exact-label selector mistakes, corrected without runtime or
acceptance changes. No production gap was found within this bounded test scope.
Browser execution, full-suite/coverage qualification, independent implementation
review and hosted checks remain with the parent/coordinator. No remote changes or
additional donor merges were performed by this delegated worker.


## Shared policy journal lock completion — 2026-11-25 Pacific (8812)

Worker: root `chatgpt-8812-branch-completion`. Branch `finish/policy-journal-lock-20261125-8812`; base privacy checkpoint `e8857e0292dd06bed85a17ba49d9f6701979e83c`, pending its separate final source review. Current main is `84b80260b9c16b928e440dd81750d9bfb6cdb2b4`; canonical idle prerequisite is `4af78c8cd3eafe12b20170ccfd3a0313bf0c9fc5` with shared utility #690 ancestry.

Owner seam expressly agreed with `/root/artifact_review`: this task owns only `WalletAttemptOptions.beforeAttemptStart` and its synchronous invocation immediately before `beginAttempt` inside the authoritative journal transaction in `apps/web/src/lib/wallet.ts`. Retained-hash completion, lifecycle and disclosure changes remain with the privacy worker. Also own `apps/web/src/features/policy/withdrawalJournal.ts` and its existing test file, an additive handoff, original donor handoff adoption and directly affected JRNL-L1 status documentation. No other wallet, journal, payment or private-presentation source changes.

Donor: #528 `ff274a08de2a84bcbdf0e373fb607666543554a2`. Its unique current-history delta is limited to these three source/test files and two documentation files. The source snapshot is older than current disclosure/receipt/late-hash controls: retain those newer controls and invoke the hook from captured `attemptOptions`, never substitute the historical wallet file. Prepare and recheck outside the global journal lock, use the existing bounded browser lock manager, and run the synchronous duplicate-policy guard inside the durable begin transaction.

Acceptance: preserve exact current disclosure, transaction snapshot, asynchronous authority, late-hash durability, post-send ownership and receipt-correlation behavior; refuse duplicates and stale sessions before provider invocation; prove another independent send progresses while a policy prompt remains open and bounded lock refusal makes no provider call. Preserve original refs, assertions and all other claims. Use bounded synthetic ordinary regressions, affected typecheck/lint/build and actual full/lean browser qualification; no mutation/fuzz campaign, new dependency, contract change, activation, release or real funds. Final approved privacy and canonical idle/utility inputs must be adopted normally before publication. Independent review, fresh exact-composition hosted CI and cooperative integration lock remain mandatory.

## PR #500 policy wallet lock release — 2026-11-23

- Worker: `/root` (coordinator and implementation owner); isolated from the PR branch.
- Branch: `codex/ghostpay-policy-lock-release-20261123`; base: PR #500 exact head `d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea`.
- Owned paths: `apps/web/src/lib/wallet.ts`, `apps/web/src/features/policy/withdrawalJournal.ts`, its focused test, this claim, and `docs/handoffs/POLICY_WALLET_LOCK_RELEASE_20261123.md`.
- Finding: `sendPolicyAction` awaited `prepare()` and then the full wallet send under the global attempt journal lock. The full wallet send also performs asynchronous account/chain rechecks before provider invocation, so holding the non-reentrant lock through it blocked unrelated journal work during wallet prompts.
- Planned correction: perform the existing fast duplicate check before prepare; prepare and wallet rechecks outside the global lock; repeat the policy duplicate guard synchronously inside `sendViaWallet`'s journal-locked start callback immediately before durable attempt creation/provider invocation. Keep the attempt write and provider invocation atomic under the lock; release it while the wallet request is pending; hash persistence still reacquires the journal lock.
- Acceptance: focused policy and durable wallet journal tests passed (20/20); web typecheck, production build/postbuild scan, scoped ESLint, and diff check passed. The regression proves a distinct wallet send completes through the same lock manager while the policy prompt remains unresolved; existing same-action coverage still proves one provider invocation. Independent review found no blocker and recommends real two-page Web Locks integration coverage. Hosted qualification remains outstanding. No deploy, main merge, or mutation of PR #500. See `docs/handoffs/POLICY_WALLET_LOCK_RELEASE_20261123.md`.

## 2026-11-26 UTC — chatgpt-8812 policy browser continuation (#541)

- Owner: chatgpt-8812-branch-completion. Additive continuation of the completed #541 handoff alongside #528; original refs preserved.
- Scope: apps/web/e2e/flows.spec.ts, apps/web/e2e/policy-action.fixture.ts, and the policy completion handoff. Preserve every current invoice/disclosure/stale-mirror case and helper; retain the two-tab policy regression using the current production journal.
- Gates: independent current-composition review, bounded ordinary local checks and fresh hosted full/lean browser qualification before integration. No production fixture exposure, dependency or workflow changes.

## Policy-prompt browser verification

- Worker: Codex, branch `verify/policy-prompt-two-tabs-20261124`, stacked on #528 at `ff274a08de2a84bcbdf0e373fb607666543554a2`. Current #500 is `ad67862f63590fe38410d21b88ebf0e05329da47`. #528 branched at `a23a9f994709e021c479adb0bcc10afcd79fea4b`.
- Owns the new case in `apps/web/e2e/flows.spec.ts` and its test-only policy fixture. Reuse the injected wallet, invoice checkout and two same-origin pages. While the first policy prompt is pending, the other page must send an unrelated invoice and refuse a duplicate of the policy action. The existing owners retain the journal and integration branches.

## Coordinator idle invoice-expiry browser qualification — 2026-11-26

- Worker: `/root/branch_triage`; branch: `fix/idle-expiry-fixture-20261126`.
- Base: canonical idle candidate `2a70c04124cba1d8c2d5145ef5a4ba4bcb6c2911`
  (PR #689); preserve original local `6e7147d1` and all donor refs.
- Owns: `apps/web/e2e/core-journey.spec.ts`, `apps/web/e2e/pages-devnet.spec.ts`,
  this additive claim and `docs/handoffs/IDLE_EXPIRY_BROWSER_QUALIFICATION_20261126.md`.
- Observed gate: the Pages invoice-expiry case and the full/lean core invoice-expiry
  case advance the browser wall clock beyond the default 15-minute idle deadline.
  The newly synchronous idle guard revokes the prepared flow before its Send handler
  can display the separate invoice-expiry refusal. Hosted idle cases otherwise passed.
- Acceptance: isolate those invoice-expiry fixtures with the supported 240-minute idle
  setting through the real Settings UI; retain each original clock jump, expiry/refusal
  assertion, no-wallet-send/journal/submission assertion, on-chain refusal check and
  timeout. Preserve all idle cases and production guards. Avoid per-load RPC fixture
  initialization resetting the selected setting before the relevant payment flow.
- Qualification: exact changed-file typed lint, web typecheck, bounded browser-case
  collection and source preservation checks locally; execution requires fresh hosted
  full/lean/Pages gates. No local browser, fuzz/mutation/reproduction campaign, dependency,
  workflow, runtime or contract change. Root owns independent review and publication.

Root additionally authorizes normal adoption of the independently reviewed shared
utility candidate #690, `62d8ff681b3ce3916d7aa4639c73437856ef8e48`, into this
continuation. Reconcile only the additive ownership record, retain both histories,
all seven exact utility source/test blobs and unchanged idle runtime, and record the
combined source pin before renewed hosted qualification. No utility source changes.


## Shared payment utility completion — 2026-11-25 Pacific (8812)

Worker: `chatgpt-8812-branch-completion` (root). Dedicated branch: `finish/shared-payment-utilities-20261125-8812`. Exact base: canonical request-file candidate `521a917da4dabe02d5e0075e750c7b4ec10e7d5f`; current main observed `edcca81906c304499c436083dec3b598680de188`.

Owned scope: ordinary payment-history CSV text in `packages/ux-export/src/text.ts` and its new leading-BOM regression; local payment-handle diagnostics in `packages/ux-links/src/handle.ts` and its new confusable-case regression; payment receipt evidence snapshot and bounded regression in `packages/ux-receipts/src/verify.ts` and `verify.accessor-boundary.test.ts`; the existing exact-amount boundary regression in `packages/chain-adapters/src/quote.test.ts`; additive source-pinned handoff and donor documentation reconciliation. Donors: #628 `0fe0f06f1f7cd1dde2c4dc849702f0ab4cd509cd`, #634 `898106124f7fc2ae90916a8d62348d0d4dd5e120`, #663 `d05108873af1ab79edee9c22fe01b0a22cf3a213`.

These are independently useful shared payment text, identity-warning and selective-disclosure utilities. This task does not change tip/donation, storefront, dashboard analytics, GhostID profiles, or any stopped-product path. Existing packages remain unmounted; no new dependency, product activation, workflow, protocol, contract or release change. Preserve every current assertion, all source refs, all other ownership claims and the current dependency-closure gate.

Ownership reads: all three exact PR heads remain draft with completed original-worker handoffs; current comments and reviews contain no live edit claim or separate human gate. The current session idle/privacy workers own unrelated app/session paths. Acceptance: independently review the exact composition, execute the bounded existing regression and compatibility suites and affected typecheck/lint/build, confirm no app/package manifest or excluded-product change, then fresh actual-composition hosted CI and legitimate cooperative lock before ordinary integration. Original generated/property campaigns are preserved, not run locally.

---

# GP-BUG — CSV leading BOM data preservation (2026-11-24 UTC)

Worker: sequential BUG-ONLY repair coordinator. Branch `automation/20261124T1821Z/bug/ux-export-leading-bom`; exact main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Owned paths: `packages/ux-export/src/text.ts`, new `packages/ux-export/src/text.leading-bom.test.ts`, this additive branch-local claim and `docs/handoffs/UX_EXPORT_LEADING_BOM_20261124.md`. All 240 open PR changed-file lists inspected; no `packages/ux-export/src/text.*` overlap. #616/#617 own encoder paths and #220 owns reconcile.ts; do not touch those paths or branches. Generation 20 lease released at `4fe0656517a03cb7a39d4e248187c76ffaa3238a`, not acquired. Source-matched parser/quoteField probes show initial U+FEFF is dropped from valid custom header when optional file BOM is disabled. Acceptance: preserve leading U+FEFF by quoting the field; keep ordinary, embedded BOM, delimiter/quote handling and explicit file BOM behavior; failing regression before fix, exact-head hosted CI and independent review before integration. No deployment, feature changes or fund/contract interactions.

---

# GP-BUG — uppercase confusable local handle diagnostic (2026-11-25 UTC)

Worker: sequential BUG-ONLY coordinator, isolated branch `automation/20261125T0120Z/bug/ux-links-handle-confusable-case`; base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Owned paths: `packages/ux-links/src/handle.ts`, new `packages/ux-links/src/handle.confusable-case.test.ts`, append-only ownership entry here, and new `docs/handoffs/UX_LINKS_HANDLE_CONFUSABLE_CASE_20261125.md`.

Evidence: baseline source Git blob `c325f1ee544da5f9f75ac7bc400b961deee63033`, recomputed from exact fetched UTF-8 bytes. Capital Cyrillic A and Greek Omicron/Rho are rejected with NON_ASCII instead of the documented CONFUSABLE_NON_ASCII diagnostic, while lower-case counterparts receive the specific reason. All remain rejected; no spoof acceptance, payment impact, or direct Pages reachability asserted. Acceptance: regression first, minimum case-aware lookup in the existing confusable map, preserve ASCII acceptance, reserved checks and ordinary Unicode rejection. Existing handle.test.ts belongs to #224/#238/#262/#264/#278/#372 and is untouched. All 246 discovered open PR changed-file lists checked; no owner of the production or new regression path; active registry checked. Recheck before integration. Integration lease generation 20 released, not acquired. Local checkout DNS blocked; exact source harness only, native CI and separate independent review required. No protocol, feature, dependency, fund or deployment changes.


# FC-04 hardening regression tests and receipt follow-ups (2026-11-25)

- Worker: fc02 (Claude Code), branch `claude/fc04-hardening-tests-20261125`, base `origin/main` `595a184b381980a440165832f51a83e8dfd3e8a8`. Owned paths: `packages/chain-adapters/src/quote.test.ts`, `packages/ux-receipts/src/verify.ts`, `packages/ux-receipts/src/verify.accessor-boundary.test.ts`, `docs/consolidation/feature-completion-20261125/FC-04-hardening-tests.md`, this entry.
- Acceptance: recover the missing #271 quote decimals regression test; close RCPT-L1 and RCPT-L2 test-first; keep coverage thresholds; local only until the coordinator approves a push.

### Idle invoice-expiry fixture qualification result — 2026-11-26

Combined source `18bfb7f937013af77736e5c80a8310d9114b5ffd`, tree
`40923721a273d5d390749e6f240ab7a8b300cb06`, retains both ownership histories,
all seven exact utility donor blobs, all idle runtime and every original expiry,
no-send, clock and timeout assertion. Web TypeScript, both changed-file typed lint,
15 core/idle plus one Pages case collection, whitespace and committed-secret scan
all completed successfully. No browser execution is claimed locally. See
`docs/handoffs/IDLE_EXPIRY_BROWSER_QUALIFICATION_20261126.md` for the original hosted
failure evidence, real Settings isolation and remaining independent/hosted gates.

### Returned-outcome fixture compatibility addendum — 2026-11-26 UTC

Root explicitly delegates `apps/web/src/lib/walletJournal.adversarial.test.ts` to
`/root/artifact_review` on the existing privacy branch, base `28f7b3c0b46f5fa360389a1986f51304302901d2`.
Own only the ordinary default-browser post-send persistence cases and bounded-return
fixture isolation. Preserve actual IndexedDB/mirror unknown-state assertions, every
no-send/duplicate-blocking assertion and all seeded scheduling cases unchanged.
Drain retained fixture outcomes through actual successful persistence after restoring
the local synthetic fault; do not reset or weaken production retention. Run named
ordinary affected cases only, with no new seeded/fuzz/mutation campaign. Root owns the
separate policy-lock continuation and will adopt this reviewed compatibility patch.

## Account/vault presentation revocation local result — 2026-11-26 UTC

Worker `/root/artifact_review`, branch `finish/privacy-revocation-core-20261126`.
Runtime `28f7b3c0b46f5fa360389a1986f51304302901d2`, tree
`f37b883abaa3e447555ccef664accd4d117ef2f8`, retains canonical idle/utility candidate `4af78c8c` and the
independent 21-case concealment delegation by normal merges. Only additive claims
conflicted. `/root/help_review` approved exact source, assertions and composition.

Final ordinary qualification passed 1,011/1,011 cases in 61 fixtures, changed-file
strict lint, dependency builds, full/lean web TypeScript/build/artifact scans, four
unchanged reachability checks and catalogs (0 errors; 874 fallback warnings). Root
then identified fourteen journal fixture failures in its policy integration run;
fixture-only `994be97cfb8fc28237b0f99648ca818758129498` preserves raw durable unknown
state, distinguishes the returned overlay and finishes actual persistence between
fixtures. Root independently approved that exact repair; 14/14 named ordinary cases,
typed lint and final full web TypeScript passed. Its remaining 128 cases were not run.

See `docs/handoffs/ACCOUNT_PRIVACY_CORE_COMPLETION_20261126.md` for source pins,
initial failures, corrections and remaining gates. Global/manual masking and older
selected-seller foundations are not included. No dependency/workflow/contract/chain
expansion, excluded-product activation, live transaction or remote mutation occurred.
Root owns the reviewed #689 fixture follow-on, fresh combined hosted/coverage/browser
gates, final evidence review, cooperative lock and integration. #528/#604 stay separate.

## Pages expiry clock-origin fixture correction — 2026-11-26

- Worker: `/root/help_review`; branch: `fix/pages-expiry-clock-origin-20261126`.
- Base: canonical PR #689 head `4af78c8cd3eafe12b20170ccfd3a0313bf0c9fc5`.
  Root explicitly handed off this remaining hosted Pages failure; the prior idle
  fixture worker is assisting read-only and the privacy worker owns separate paths.
- Owns: `apps/web/e2e/pages-devnet.spec.ts`, this additive claim/results entry and
  `docs/handoffs/PAGES_EXPIRY_CLOCK_QUALIFICATION_20261126.md`.
- Evidence: Pages run `45741328280`, job `139646779828`, tested merge
  `11fd6dcb3fa6f041d7eccccdcc1a153f4b58fc03` (this head into main `84b80260`).
  Sixteen cases passed; expiry stopped at the Send click after the clock jump,
  with pointer interception followed by a detached button. The final expiry
  assertion was not reached. Both mocked browser profiles now pass the expiry
  case and all fourteen idle cases (full 182 passed / 2 skipped; lean 170 / 4).
- Acceptance: diagnose from actual hosted logs and exact source; correct only the
  expiry fixture's clock setup, preserve every current assertion, clock jump,
  timeout, wallet disclosure and idle case, and add a clock-origin assertion if
  needed to distinguish wall-clock expiry from a fixture-created monotonic rollback.
  No runtime, dependency, workflow, manifest, contract or excluded-product change.
- Qualification: bounded local clock diagnostics, exact-file typed lint, web
  typecheck, browser-case collection, source preservation and secret/whitespace
  checks. The local browser is unavailable; do not reinstall or probe it. Actual
  corrected-source browser qualification requires fresh hosted CI. Root owns
  independent review and publication; this worker will not publish or merge.

### Pages clock-origin fixture result — 2026-11-26

Reviewed source `cb2e5c5ce81b895817ca8da3b1590f2bf04f46a1` and normal current-main
composition `97f026a7fe92062e97e86ab5a8ae633377cf0b64` share tree
`ef5f6462918ca57f50d5b6af4fc492d107565f91`. Only four Pages fixture lines were
added; every original source line and all other fixtures are retained. Web
TypeScript, exact-file typed lint, collection of 17 Pages and 14 idle cases,
preservation, secret and whitespace checks completed with zero exits. A bounded
actual-Playwright clock diagnostic confirmed the monotonic-origin mechanism; it
did not execute the browser. Root independently approved the source. See
`docs/handoffs/PAGES_EXPIRY_CLOCK_QUALIFICATION_20261126.md`. Final evidence review
and fresh corrected-source hosted CI remain required.

### Account privacy final dependency composition — 2026-11-26 UTC

Normal merge `f451c6206f2e0434ec8386b6ca1602a3c82ed969`, tree
`1f88c12e9247d692ec9d9724892937b1ad0c72b3`, adopts canonical corrected idle #689
`0ae8a9d1812c28acdc894b3a3ac12b82ef38aaff`. All current ownership text and the 38
incoming lines are preserved, and both incoming non-log blobs are exact. Approved
privacy runtime remains unchanged from 28f; only the reviewed four-line Pages fixture
and its evidence are added. Fresh combined hosted gates remain the coordinator's work.

## Policy journal completion qualification — 2026-11-26 UTC

- Worker: chatgpt-8812-branch-completion, branch `finish/policy-journal-lock-20261125-8812`.
- Independently approved runtime/default-manager repair: `3c9835afe838a710101ce66eb23a7e492530d328`. Final source composition `f79117395fe04098d1aebd09a36fdacefb955212`, tree `2c3956b95d4bae5fbe0726a2803a7c359737910b`, normally adopts canonical privacy `f8145c1c` and corrected idle `0ae8a9d1`.
- #528 and #541 whole legitimate donor ancestry retained; current disclosure, frozen arguments, authoritative transaction journal and retained-hash behavior preserved. All current browser suite lines retained.
- Initial broad check: 314 passes, 14 fixture failures; reviewed privacy compatibility repair994be97 adopted. Final selected policy/journal follow-up: 26 passes, 128 unrelated cases unselected. Default-manager regression failed before correction and passed afterward.
- Final full web typecheck, changed-file typed lint, full/lean production builds and 20/18-file postbuild scans passed. Unchanged reachability gate4/4; two browser cases collected only. Secret and whitespace checks passed.
- Source and composition independently approved. Final evidence handoff: `docs/handoffs/POLICY_JOURNAL_COMPLETION_20261125_8812.md`; narrow final evidence review and fresh hosted full/lean/Pages qualification remain required before cooperative-lock integration. No release, deployment or live transaction.


## Policy dependency qualification follow-up — 2026-11-26

Worker `/root`, branch `finish/policy-journal-lock-20261125-8812`, canonical base
`c6f15cfeddaa508c9df646d336ae1b071b3f5b69`. Own additive ledger/handoff updates
and normal adoption of corrected canonical privacy #691
`6b4bbe17b436344b05d2942ccb0633de43e43fa0`. Preserve every approved policy runtime
and unit-test blob and the complete appended #541 browser case while adopting
all six reviewed privacy fixtures. Require independent exact-composition review
and fresh hosted gates before cooperative-lock integration. No new runtime,
dependency, contract, workflow, timeout or gate change.


## Account privacy / idle combined qualification — coordinator, 2026-11-26

- Worker: `/root`, session `8812`; branch `fix/account-privacy-qualification-20261126-8812`.
- Base: canonical #691 `f8145c1cb8d806f1d8b134c159eb00f595e6769a`, which already contains #689 `0ae8a9d1` and main `1bea3df3`.
- Owned paths: additive coordinator ledger and `docs/handoffs/ACCOUNT_PRIVACY_BROWSER_QUALIFICATION_20261126.md`; compose only independently reviewed TagArchive and owner-history browser fixture commits on their existing owners' source pins.
- Acceptance: preserve the recovery-only idle model, owner/chain history concealment, real wallet disclosure, original duplicate/no-extra-send/recovery assertions and the Pages monotonic clock correction. No runtime, dependency, workflow, timeout or release gate change is authorized by this composition claim.
- Qualification: review exact combined blobs and donor ancestry, use the workers' bounded test/lint/type results, then publish a nonforce #691 follow-up and require fresh actual-composition hosted checks. #689 is integrated only through a green combined #691, never claimed independently green. Root owns publication and cooperative-lock integration; original mixed source refs remain unchanged.

## Tag archive idle suspension fixture correction — 2026-11-26 (8812)

- Worker: `/root/branch_triage`; isolated branch `fix/tag-archive-idle-fixture-20261126`.
- Base: canonical privacy #691 `f8145c1cb8d806f1d8b134c159eb00f595e6769a`.
- Root handed off hosted #689 web job `139653073679`: C-R11 expects the tag archive
  form after idle, while the current session is correctly suspended for backup-only
  recovery. Own only `apps/web/src/components/TagArchive.test.tsx`, this additive
  claim/result and `docs/handoffs/TAG_ARCHIVE_IDLE_FIXTURE_20261126.md`.
- Preserve every existing passphrase value/attribute assertion, sole-copy retention,
  backup-only restrictions and current active-session controls. Add explicit normal
  restoration before assertions that require the active archive form; no runtime,
  dependency, workflow, contract, timeout or security-assertion weakening.
- Qualification: exact hosted-log/source inspection, independent locked install,
  bounded ordinary fixture plus web typecheck/typed lint. No browser, fuzz, mutation
  or exploitation campaign. Root independently reviews and integrates the pin with
  its separate #691 browser-fixture correction; no publication by this worker.

TagArchive local result: fixture source `d012ac99f2b6e94ca6ff1a3ec46ac4b5c30fb497`
retains every original assertion and all other cases, with no runtime changes.
The whole ordinary fixture passed 9/9; exact-file typed lint and full web TypeScript
both exited 0. The existing one-minute idle and 61-second advance are unchanged.
Root independently approved the exact fixture source with no finding. See
`docs/handoffs/TAG_ARCHIVE_IDLE_FIXTURE_20261126.md`. Root owns combined #691
qualification and integration; no remote mutation occurred here.

## Account-scoped history browser fixtures — 2026-11-26

- Worker: `/root/help_review`; branch: `fix/account-history-browser-fixtures-20261126-8812`.
- Base: canonical PR #691 head `f8145c1cb8d806f1d8b134c159eb00f595e6769a`.
  Root explicitly delegates the two existing history/reconnect browser cases;
  root's additive #541 policy case remains on the separate #692 branch.
- Owns: the two affected cases and narrowly required fixture helpers in
  `apps/web/e2e/flows.spec.ts`, this additive claim/results entry and
  `docs/handoffs/ACCOUNT_HISTORY_BROWSER_QUALIFICATION_20261126.md`.
- Evidence: source inspection found history assertions after account/session
  replacement or reload without the newly required matching account/network
  recovery, plus an invoice continuation after the private capability was cleared.
  Original #691 hosted run `45743729535` remains in progress at claim time;
  no hosted failure or corrected browser pass is asserted before logs are available.
- Acceptance: assert concealed history before explicit matching-owner recovery
  through current wallet disclosures, explicitly reopen the saved invoice for a
  retry, and retain durable hashes, receipt binding, cross-account duplicate
  refusal, confirmed clear, and every no-extra-send assertion and timeout.
  No production, dependency, workflow, contract, chain or excluded-product change.
- Qualification: exact-file typed lint, web typecheck, browser-case collection,
  original-assertion preservation and secret/whitespace checks. No browser install
  or launch locally; fresh hosted qualification and independent root review are
  required. This worker will not publish or merge.

### Owner-scoped devnet fixture extension — 2026-11-26

Root additionally delegates the same source-proven post-reload history assumptions
in `apps/web/e2e/devnet-journey.spec.ts` (submitted and pending reload cases) and
`apps/web/e2e/pages-devnet.spec.ts` (native payment reload case). Extend ownership
only to those existing cases and their narrow local recovery helpers. Conceal
history until real matching-owner/network recovery; preserve all nonce, balance,
hash, receipt, duplicate-refusal and no-extra-send assertions, the exact #689
four-line clock-origin correction, and all fourteen idle cases. These additional
fixture paths have no production changes. Qualify their typed lint/typecheck and
case collection; actual browser execution remains a fresh hosted gate.

### Silent wallet-recheck browser notice — 2026-11-26

Root additionally delegates the existing devnet wrong-chain/final-send case after
actual job `139654655573` failed its old network-only message assertion. Source
inspection confirms `recheckWallet` revokes the wallet before throwing, and Pay
retains the intentional public account/network/provider-change cause notice while
dropping stale operation state. Both existing plain-invoice silent network/account
component regressions passed (2 selected, 26 unselected) before any fixture edit.
Own only that case's obsolete notice assertion and added revocation assertions;
retain its chain change, no-send, empty-journal, nonce checks and all timeouts.
No production correction is needed or authorized by this finding.

### Account-history browser fixture local result — 2026-11-26

Fixture source `36917b8920cd6ac478b2efaf15fd4195fc91a6f7`, tree
`5a9a89efc8f6bf56424921c166c974d466054788`, changes three e2e files only.
The independently reviewed history correction `0305cd2c` is retained; the only
additional assertion replacement follows the proven silent-recheck cause notice.
All original no-send, durable-outcome, receipt, nonce, balance and timeout checks
remain, with stronger concealment/revocation assertions and real wallet disclosure.
Web typecheck, affected-file typed lint, secret/whitespace checks and collection
completed with zero exits: full flows12 + idle14, lean flows11, devnet3, Pages17.
Two existing silent-mismatch component cases passed; 26 others were unselected.
No browser bodies ran locally. Actual original #691 hosted failures and the
combined #689/#691 dependency plan are recorded in
`docs/handoffs/ACCOUNT_HISTORY_BROWSER_QUALIFICATION_20261126.md`. Root owns final
independent review, the separate TagArchive composition, fresh hosted qualification
and integration. No runtime, dependency, workflow, contract or chain change.

## Wallet disclosure/discovery qualification fixtures — 2026-11-26

- Worker: `/root/help_review`, delegated by root on coordinator branch
  `fix/account-privacy-qualification-20261126-8812`; composed base
  `ea9ddeecc2e4ab1dca56a4bf467747c67235b0e7`.
- Owns: `apps/web/src/lib/walletDisclosure.callsites.test.ts`,
  `apps/web/src/lib/walletDiscovery.hardening.test.ts`, additive results here and
  the already-claimed coordinator handoff. Runtime stays unchanged.
- Actual #691 web job `139655022034` reported 4 failures, 4,053 passes, 2 expected
  failures and 1 skip. The composed TagArchive donor covers one failure. The other
  three are the old three-file connection inventory, its literal-only disclosure
  spelling check, and the exact discovery object missing `requireLifecycleEvents`.
- Source confirms the fourth call in WalletAttempts passes its actual disclosure
  hook by shorthand; EIP-6963 metadata deliberately requires lifecycle events.
  Preserve exhaustive four-file enumeration and require a real hook-backed final
  disclosure option, including the reviewed shorthand. Preserve exact metadata
  equality and all oversized-input limits; add only the required lifecycle field.
- Qualification: bounded source-gate and named metadata cases, affected-file typed
  lint, web typecheck and final composition review. No browser, generated/mutation
  campaign, production change, remote mutation or integration by this worker.

### Combined account privacy / idle qualification result — 2026-11-26

Root delegated coordinator review and the newly observed wallet-test reconciliation
to `/root/help_review`. Source `ed5ea96e17333f5ec71380882ce56abb753362a3`, tree
`3be592cc3f82a713aa3c93d10041c57a9162b3cc`, preserves both normal donor ancestries,
all four exact prior fixture blobs, both handoffs and the complete ownership history.
Independent TagArchive review found no issue; all 53 original assertion/idle/timeout
lines remain. Runtime/configuration, every idle case and the Pages clock case are exact.
The two additional wallet tests preserve exhaustive four-file consent inventory,
hook-backed options, exact metadata equality and bounds. The local baseline failed
3 selected cases; the corrected selection passed 8, with 30 unselected. Typed lint
and full web TypeScript completed exit 0. Root independently approved that exact
follow-on. Actual hosted failures, donor results, no-local-browser limits and fresh
combined #691 requirements are recorded in
`docs/handoffs/ACCOUNT_PRIVACY_BROWSER_QUALIFICATION_20261126.md`. No production,
dependency, workflow, contract or chain change, remote mutation or integration occurred.

Policy dependency adoption result: normal source composition `0cfe4e3c` keeps
the approved runtime/unit blobs and complete policy browser case, while adopting
all corrected #691 fixtures. Only additive ownership text required reconciliation.
Fresh exact-composition hosted qualification and the integration lock remain
required; no new local test run or browser execution is claimed.

## Integration coordinator: #691 then #692 onto current main — 2026-11-26 (ghostpay-backup-60)

- Worker: Claude Code session `ghostpay-backup-60`, sole integration coordinator for #691 and #692 under the owner's integration instruction.
- Branches: `claude/integrate-691-20261126` = #691 head `6b4bbe17b436344b05d2942ccb0633de43e43fa0` (contains corrected #689 `0ae8a9d1812c28acdc894b3a3ac12b82ef38aaff` and #690) merged with main `a9d2a033` (#693 `0afab048`, #694); `claude/integrate-692-20261126` = #692 head `c7b9badcfaff027e9847f65d10f021111809c48e` merged with the #691 integration head. Source refs of #689/#691/#692 and all donor refs stay unchanged; the older #689 intermediate is not merged separately.
- Owns: these two integration branches and this additive entry. No runtime, test, threshold, workflow, dependency or contract edits unless a real combination conflict needs one.
- Actual overlap with main: four locale catalogs and `apps/web/src/i18n/securityKeys.ts` (additive BTC spent-status group); git auto-merged, JSON validated. ACTIVE_WORK union.
- Acceptance: focused idle, account-revocation, journal-persistence and concurrency regressions; fresh exact-head hosted CI (typecheck, lint, unit, full/lean e2e, Pages, beta) on each combined head; independent composition review; integration lock acquired immediately before each merge with main and heads refreshed. No deployment, contracts or live transactions.

## Independent account-privacy composition verification — 2026-11-26 (ghostpay-71)

- Worker: Claude Code session `ghostpay-71`, branch `nodata/zen-dirac-vkl84j`, base main `019d5d18c8992f63fe77740f75ad04d86d3d9b07`.
- Owns only this additive entry and `docs/handoffs/ACCOUNT_PRIVACY_INDEPENDENT_VERIFICATION_20261126.md`. Docs only.
- Does not own, edit, merge, mark ready or take the integration lock for #691/#692/#697/#698; `ghostpay-backup-60` remains their sole integration coordinator (claim above). Original donor refs and #697/#698 heads are untouched.
- Acceptance: record exact pins, remaining-difference analysis, actual local and hosted evidence for composition #698 `c2427b6f657b8ffd2c595ddb9dd47420480aa239` on main `019d5d18`, and the precise remaining integration steps. No runtime, test, threshold, dependency, workflow, contract or deployment change.
- Result (2026-11-26): the coordinator merged #697 (`045ac2d3`) and #698 (`e1d0eb0f`) under lock generation 42. Resulting main tree `3dc2d13377e22fe12a1664559c7af6c5f381b257` is identical to the composition verified here; no source difference or defect remains. Main push CI on `e1d0eb0f` was still queued when first read; it later concluded success (run 45769417481, 07:35 UTC).

## Orphaned-branch consolidation worker: scan checkpoint store refuses suspended sessions — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `601f20955b435eede448c6d82d8315705d7e381d`.
- Feature 1 (one at a time): recover the unmerged commit `bbdc9a944` (also `d5fe06e7a`, carried by about 60 dormant `automation/*` and `claude/*` donor refs, never merged) onto current main. Main's `sessionViewingKey`/`sessionHolding` in `apps/web/src/lib/scanCursorSlot.ts` still match the key id while the sole-copy session is idle-suspended, so the cached checkpoint store keeps reading, writing and clearing, and an uncached name derivation throws instead of refusing.
- Owns only `apps/web/src/lib/scanCursorSlot.ts`, `apps/web/src/lib/scanCursorSlot.test.ts` and this entry. No other path, dependency, workflow, contract or chain change. Donor refs are untouched.
- Not claimed: #689/#691/#692 idle and account-privacy scopes (merged), #718 stack, #609, #707, the integration lock (held by `claude-newghostpay-7d`, generation 48); no merge is attempted until that lock is free.
- Acceptance: the four regression tests recovered from `bbdc9a944` fail on main `601f2095` and pass with the fix; web typecheck, lint and tests for the affected workspace pass; hosted CI green on the exact head; the lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: QR assembler idle deadline ignores rejected chunks — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `cdddda0bf7beea89ed46c180050a3387336621c8` (feature 1 merged as #725; integration lock generation 52 acquired and released).
- Feature 2 (one at a time): recover the unmerged donor commits `118ae827a` and `3f135bc46` (also `6b683651e`), carried by dormant `evidence/*` and `automation/*` donor refs. On main, `Assembler.add` in `packages/qr-exchange/src/assembler.ts` refreshes `#lastActivity` before it checks for `CHUNK_CONFLICT`, so a repeated CRC-valid conflicting chunk keeps an incomplete multi-part QR assembly alive indefinitely. The refresh now follows the conflict check; rejected chunks leave the idle deadline unchanged.
- Owns only `packages/qr-exchange/src/assembler.ts`, `packages/qr-exchange/src/assembler.test.ts` (donor tests plus one seeded model test) and this entry. No dependency, workflow, contract or chain change. Donor refs are untouched.
- Acceptance: the donor conflict test and the seeded model test fail on main `cdddda0b` and pass with the fix; qr-exchange package tests (14 files) and affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: Sweep signing revalidates the reviewed sweep — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `6209ba4377f858693b54df9d4354c02cc35c4348` (features 1 and 2 merged as #725 and #729; integration lock generations 52 and 53 acquired and released).
- Feature 3 (one at a time): recover the unmerged donor commits `6ed5c66b5` (also `f2344b379`), `cc192b1e2`, `a603603d` (also `0f22c370`) and the tests `91af62ee2`, `8d7adf85d`, `43199c3fa`, carried by dormant `automation/*` donor refs. On main, `relayedSweep` and `directSweep` in `apps/web/src/lib/sweep.ts` derive the one-time key and sign without revalidating the review the user approved, so a review that was cancelled or changed during an RPC read still reaches the local signature (the view only refuses at the pre-handoff hook), and a native sweep signs whatever `eth_getBalance` returns instead of the reviewed amount. A session that locks before authorization escapes `guard` as an unhandled rejection.
- Adaptation: the donor `Sweep.tsx` hunk that gated `setError` on unchanged scopes is not taken, because main intentionally shows the "review changed" message (`sweep.reviewChanged`) after such a change.
- Owns only `apps/web/src/lib/sweep.ts`, `apps/web/src/lib/sweep.test.ts`, `apps/web/src/lib/sweep.reviewAuthority.test.ts` (new), `apps/web/src/views/Sweep.tsx`, `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` and this entry. No dependency, workflow, contract, chain, relayer or locale change. Donor refs are untouched.
- Acceptance: the 17 recovered tests fail on main `6209ba43` and pass with the fix; all sweep unit and view tests pass; affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: remove the legacy runtime-fetch unsigned-dev manifest loader — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `6e4d2b69cb3f280c7843ace8a059f4fe1ed49ec1` (features 1 to 3 merged as #725, #729 and #731; integration lock generations 52, 53 and 55 acquired and released).
- Feature 4 (one at a time): recover the unmerged donor commit `c66b63a04` (also `2f0b2de51`, SEC-14 / D-09), carried by dormant `automation/*` and `claude/*` donor refs. On main, `apps/web/src/lib/manifest.ts` still exports `loadManifest`, a runtime fetch of `./deployments/<id>.json` verified with the legacy text scheme that accepts unsigned testnet manifests as `unsigned-dev` and `console.warn`s. Its only callers are tests; the app uses `loadBundledManifest`. It is removed, and `scan-bundle` now fails any build whose JS carries the acceptance warning or the legacy signing domain.
- Adaptation: the donor test imported `stripComments` from `scan-bundle.mjs`, which main no longer exports (AST scanner since `81614e56`); the test now strips comments with the TypeScript printer. The `unsigned-dev` member stays in the `ManifestState` type for the views' warning of injected test states.
- Owns only `apps/web/src/lib/manifest.ts`, `apps/web/src/lib/manifest.test.ts`, `apps/web/scripts/scan-bundle.mjs`, `apps/web/src/scanBundle.test.ts`, the audited-`fetch()` list in `apps/web/src/privacyInvariants.test.ts` (three sites become two) with its two references in `docs/threat-model/` and this entry. No dependency, workflow, contract, chain, relayer or locale change. `@ghostpay/chain-adapters` keeps its `verifyTextManifestSignature` export for the relayer and ops-monitor. Donor refs are untouched.
- Acceptance: the 3 recovered tests fail on main `6e4d2b69` and pass with the change; a real `vite build` passes the extended `scan-bundle` gate; affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: CLI errors no longer echo pasted payment links or raw catalog keys — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `01c72bd586f0f2cfe023857273642f3ee6dedaf6` (features 1 to 4 merged as #725, #729, #731 and #733; integration lock generations 52, 53, 55 and 56 acquired and released).
- Feature 5 (one at a time): recover the unmerged donor commit `b8e235d78` (R11-4, ported from an unpushed 2026-11-11 commit), which exists only on the dormant donor ref `claude/exciting-brown-7v69cr`. On main, `READ_FAILED` and `WRITE_FAILED` in `packages/cli` quote the whole path option value, so a bearer payment link (`#gpi=` fragment) pasted where a file name belongs lands in stderr and in the JSON error, and `i18n check` prints catalog keys and locale names raw, so a catalog key with terminal escape sequences can drive the terminal. Error text now shows only the quoted basename of a plain local path; URL-like values, fragments, queries, control or format characters and over-long names are replaced by a generic phrase, and `i18n check` escapes keys and locale names.
- Owns only `packages/cli/src/io.ts`, `packages/cli/src/ctx.ts`, `packages/cli/src/commands/i18n.ts`, `packages/cli/src/untrusted-echo.test.ts` (new), a README note in `packages/cli/README.md` and this entry. No dependency, workflow, contract, chain, web or relayer change. Donor refs are untouched. The other `claude/exciting-brown-7v69cr` commits (R11-1 flag positions, R11-3 malformed observations, reconcile propose, relayer and relayer-guard changes) are not claimed here.
- Acceptance: 7 of the 8 recovered tests fail on main `01c72bd5` and all pass with the change; CLI package tests (38 files) and affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: reconcile propose reports only freshly verified records as verified — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `b044dd452a932d3446c6155bf97e977b707c4c00` (features 1 to 5 merged as #725, #729, #731, #733 and #734; integration lock generations 52, 53, 55, 56 and 57 acquired and released).
- Feature 6 (one at a time): recover the unmerged donor commit `0d387b42b` (R11-2, ported from an unpushed 2026-11-11 commit), which exists only on the dormant donor ref `claude/exciting-brown-7v69cr`. On main, `reconcile propose` in `packages/cli` builds proposals from stored plus current records but exports a proposal with `paymentVerifiedAtReview: true` for a stored record that was not among the observations verified in this run, and its listing reports `currentChainVerified: true` beside such a record. `reconcile confirm` still refuses it, so no state changes, but the report is untruthful about what was verified against the chain. `propose --out` now refuses such a record (`CURRENT_EVIDENCE_REQUIRED`, exit 1, no file written), and the listing sets `currentChainVerified` per proposal, true only for freshly verified records, with the top-level flag true only when every listed proposal is.
- Owns only `packages/cli/src/commands/reconcile.ts`, `packages/cli/src/reconcile-stored-only.test.ts` (new), a README paragraph in `packages/cli/README.md` and this entry. No dependency, workflow, contract, chain, web or relayer change. Donor refs are untouched. The R11-1 global-switch commit on that ref is not claimed here.
- Acceptance: the 4 recovered tests fail on main `b044dd45` and pass with the change; CLI package tests (39 files) and affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: CLI honours global switches only in flag positions — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `56bc550b27cb48fc88c6d1740e174cb2d9144d59` (features 1 to 6 merged as #725, #729, #731, #733, #734 and #735; integration lock generations 52, 53, 55, 56, 57 and 58 acquired and released).
- Feature 7 (one at a time): recover the unmerged donor commit `6abf7c324` (R11-1, ported from an unpushed 2026-11-11 commit), which exists only on the dormant donor ref `claude/exciting-brown-7v69cr`. On main, `run()` in `packages/cli` removes `--help`, `-h` and `--version` from anywhere in argv before the command options are parsed, including where the token is the value of a value-taking option. `webhook verify --header --help --json` on a forged body therefore prints help with `ok: true` and exits 0 without checking the HMAC, and the same holds for every command (for example `invoice verify --pin --help`), so a script that trusts the exit status accepts an unverified document. `run()` now resolves the command from the leading words first and hands the rest to `parseArgs` with the command's own option spec; a global switch is recognised only in a flag position, a `--` token directly after a value-taking option is a missing value (exit 2, as main already does for other `--` tokens), `-h` there is that option's value, and nothing after `--` is a switch.
- Owns only `packages/cli/src/args.ts`, `packages/cli/src/run.ts`, `packages/cli/src/global-switches.test.ts` (new), a README note in `packages/cli/README.md` and this entry. No dependency, workflow, contract, chain, web or relayer change. Donor refs are untouched.
- Acceptance: 382 of the 390 recovered test cases fail on main `56bc550b` and all pass with the change; CLI package tests (40 files, 979 tests) and affected typecheck, lint and tests pass; hosted CI including the CLI operator qualification on Linux, macOS and Windows green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: recover two missing regression tests (final account reread, invoice paste focus) — 2026-11-26 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `8c0b110d8043b8895aae1422226ac6cafdab40a2` (features 1 to 7 merged as #725, #729, #731, #733, #734, #735 and #736; integration lock generations 52, 53, 55, 56, 57, 58 and 59 acquired and released).
- Feature 8 (one at a time, test-only): recover two regression tests that exist only on dormant donor refs and cover behavior already correct on main. (1) `80d237fe6`: `apps/web/src/lib/wallet.finalAccount.test.ts` pins that the final wallet account reread (`recheckWallet`) rejects a silently changed account before sending, touching the attempt journal or requesting a typed-data signature, and still sends and records one attempt when the account is unchanged. Adapted to main: this node-environment file has no `navigator.locks`, so the success case passes the repo's `createTestLocks()` manager to `sendViaWallet`. A mutation check (turning the refusal at `wallet.ts:402` into a `return`) turns the two refusal tests red. (2) `b1176b395`: `apps/web/e2e/focus-scope.spec.ts` pins the accepted focus scope of the AppShell `[view, fragment]` effect (SEC-30 / R-04): a rejected paste keeps focus on Read, a successful load focuses `main`; it passes against current source in the desktop project.
- Owns only `apps/web/src/lib/wallet.finalAccount.test.ts` (new), `apps/web/e2e/focus-scope.spec.ts` (new) and this entry. No production, dependency, workflow, contract or chain change. Donor refs are untouched.
- Acceptance: both tests pass on main `8c0b110d`; the wallet test fails under the mutation above; affected typecheck, lint and tests pass; hosted CI (including e2e full and lean) green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: close the review gaps in the merged CLI fixes (R11-1, R11-2, R11-4) — 2026-11-27 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `34a7341dd7cbfa162a842c710f72ac9d0593c5df` (features 1 to 8 merged as #725, #729, #731, #733, #734, #735, #736 and #737; integration lock generations 52, 53, 55 to 60 acquired and released).
- Feature 9 (one at a time): recover the unmerged donor commit `158bfdf89` ("close the gaps an independent review found in R11-1, R11-2, R11-4"), which exists only on the dormant donor ref `claude/exciting-brown-7v69cr` and fixes holes in the CLI fixes merged as #734, #735 and #736. (1) R11-1, major: when no command matches the leading words, `run()` still scanned the rest of argv for switches, so a mistyped command with an attacker-chosen header value (`webhok verify --header --version --json`, `webhook verifyy --header --help`, `split --total 10 --share --version`, `sandbox chain --seed --help`) printed version or help with `ok: true` and exit 0; only a switch directly behind the words now counts, and the unknown command is reported (exit 2). (2) R11-2, minor: the top-level `currentChainVerified` of `reconcile propose` was true for an empty listing; it is now true only when at least one proposal is listed and every listed proposal is freshly verified. (3) R11-4, minor: `displayPath` echoed `gpi=v1...` (a link fragment pasted without its `#`), other `key=value` text and the last segment of a network path; `=` is no longer an accepted name character and `//host/...` and UNC paths are withheld. README states the rule and the deliberate change that a command line with an error reports the error even when it also asks for help. Follow-up on the same head after an independent scoped review on #734 and #740: `displayPath` also withholds basenames shaped like secret material (a run of 32 or more hex characters, with or without `0x` and when nested, or a long mixed-case base64url token), covered for `READ_FAILED` and `WRITE_FAILED` in human and JSON modes with synthetic values; error codes and ordinary file names are unchanged.
- Owns only `packages/cli/src/run.ts`, `packages/cli/src/io.ts`, `packages/cli/src/commands/reconcile.ts`, the three CLI test files `global-switches.test.ts`, `reconcile-stored-only.test.ts` and `untrusted-echo.test.ts`, the README rule in `packages/cli/README.md` and this entry. No dependency, workflow, contract, chain, web or relayer change. Donor refs are untouched. The R11-3 commit on that ref has no failing test on main and is not claimed.
- Acceptance: the 9 new test cases fail on main `34a7341d` and all pass with the change; CLI package tests (40 files, 991 tests) and affected typecheck, lint and tests pass; hosted CI including the CLI operator qualification on Linux, macOS and Windows green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: saved Sweep attempt journal parsed with the strict JSON parser — 2026-11-27 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `b8f1c2eef09a823a931ac5c4cff9ae443b82acdb` (features 1 to 9 merged as #725, #729, #731, #733, #734, #735, #736, #737 and #740; integration lock generations 52 to 63 acquired and released by this worker).
- Feature 10 (one at a time): recover the product change of the unmerged donor commit `81674a63f`, carried by the open draft evidence PR #349 (base `integration/ghostpay-main-recovered-fixes-20261120`, 59,904 added lines of census evidence, last activity 2026-11-21) and not on main. On main, `readSweepAttempts` in `apps/web/src/lib/sweepAttemptJournal.ts` parses the saved Sweep attempt journal with `JSON.parse`, which silently accepts duplicate keys (also escaped duplicates such as `"status"` twice), so a record can say one thing to the validator and another to a later reader. The adjacent wallet journal already uses the shared strict parser. The reader now uses `parseStrictJson` from `@ghostpay/invoice-schema` and keeps the existing `SweepJournalUnavailableError` and the original saved bytes when the state is malformed.
- Owns only `apps/web/src/lib/sweepAttemptJournal.ts` (3 lines), `apps/web/src/lib/sweepAttemptJournal.strictJson.test.ts` (new) and this entry. No dependency (invoice-schema is already a web dependency), workflow, contract, chain, locale, fee, signing or storage-format change. PR #349 and its donor refs are untouched; the evidence paths in it are not recovered here.
- Acceptance: 11 of the 12 recovered tests fail on main `b8f1c2ee` and all pass with the change; the 22 related journal, sweep and wallet test files pass; affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.

## Orphaned-branch consolidation worker: idle-freeze fixture waits for DevToolsActivePort — 2026-11-27 (Claude session 01KtKj8j9nvFsJc4iTJPUGGm)

- Worker: orphaned-branch consolidation worker, branch `nodata/clever-meitner-6a8eg0`, base main `3c324239cd2c0c4d22c547afcc0f67d5e154cc8f` (features 1 to 10 merged as #725, #729, #731, #733, #734, #735, #736, #737, #740 and #741; integration lock generations 52 to 64 acquired and released by this worker).
- Feature 11 (one at a time, test infrastructure, not from a donor): the `nativePage` fixture of `apps/web/e2e/idle-freeze.spec.ts` (added by `fdb85e71`, merged through #718; its only entry in this ledger is the original owner entry, no open PR or branch claims it) launches Chromium with `--remote-debugging-port=0` and reads `DevToolsActivePort` once, immediately after `launchServer` resolves. Chromium can publish that file slightly later, so the read intermittently fails with `ENOENT` before any page exists. Observed on hosted CI twice on this worker's own PRs (run 45889530142 `e2e (full)` on #731 and run 45913336841 `e2e (lean)` on #740, both signature `idle-freeze.spec.ts:24 ENOENT … DevToolsActivePort`, 180 or 192 other tests passing), each time costing a re-run and hours of runner queue. The fixture now waits, bounded (15 s, 50 ms poll), for the file to exist with a numeric port on its first line; any error other than `ENOENT`, or no port within the bound, still fails the fixture. No freeze assertion, test case, timeout of the test or workflow is changed.
- Owns only `apps/web/e2e/idle-freeze.spec.ts` (fixture helper) and this entry. No product, dependency, workflow or config change.
- Acceptance: a deterministic simulation shows the single immediate read fails with `ENOENT` while the helper recovers from a late and from an empty file and still fails loudly for a file never written and for a non-`ENOENT` error; the spec passes 32 of 32 locally (4 cases x 8 repeats); eslint passes; affected typecheck, lint and tests pass; hosted CI green on the exact head; the integration lock is acquired immediately before merge.
