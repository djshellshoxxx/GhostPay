# A2: dispositions of unmerged branches pushed since the 2026-11-24 stop-work window (read-only)

Prepared for the SECONDARY coordinator. Nothing in the repository was edited, pushed or commented on.

- **Snapshot:** `origin/main` = `b890a76603b924829fdbe2b4fb2c5626f0cf4e36` (#759, 2026-11-27 23:23Z). Refs fetched at about 2026-11-28 02:20Z and re-fetched at 02:35Z. The claim registry `origin/automation/ghostpay-work-claims` was at `afe21912` (02:31Z): PRIMARY P-COORD/P-M1..M4 plus SECONDARY S-COORD/S-REV-I6/S-SCAN-ROUTE.
- **Window:** `git for-each-ref --sort=-committerdate refs/remotes/origin`, excluding `archive/owner-stop-20261125/*`, `dependabot/*`, `automation/ghostpay-integration-lock`, `automation/ghostpay-work-claims`, `primary/*` and main.
  - **Table 1** applies the date filter to the committer-local date that the command prints: **168 branches**.
  - **Table 2** is an extra **63-branch edge band**. Their heads are 2026-11-23 local but 2026-11-24 in UTC, mostly -0700 evening pushes. I covered them so that the timezone reading cannot hide anything.
- **Per-branch method:** the script is `/workspace/secondary/a2/analyze.sh`, with raw per-branch output in `/workspace/secondary/a2/branches/*.txt`. For each branch it records:
  - `git merge-base --is-ancestor <branch> origin/main`
  - ahead and behind counts, plus `git cherry` (+/-)
  - `git merge-tree --write-tree origin/main <branch>`. Δpaths is the number of paths in which that merge result differs from main, so 0 means merging changes nothing.
  - unique commits
  - PR state: every open PR (`list_pull_requests state=open`), four pages of `state=all` sorted by update, and `head:` searches for branches with no PR in those pages
  - for non-ancestors, a source read of the remainder against main
- **Prior records reused, not repeated:** `docs/consolidation/branch-completion-20261127/closed-residual-dispositions.json` (61 closed-unmerged rows, 42 C / 14 D / 2 E / 3 F, against main `6b323a99`, re-validated at `7d29d39b`). Its row is cited as "record row #N". Inherited content dated 11-19 to 11-20 inside old stacks belongs to the earlier R7–R41 census and was not re-examined.

## Bottom line

1. **No branch in either window holds unique, authorised, unowned product code.** Every non-ancestor falls into one of these groups:
   - owned by an open PR, 10 of them active in the last ~24 h;
   - already on main by content, including squash or train merges;
   - a duplicate carrier;
   - blocked on an unmerged owner runtime (#248, #243);
   - archival docs;
   - deferred or stopped by the owner directive.
2. **Two authorised, unique *test* remainders exist, and both sit in open but stale PRs.** Neither can be ported until the owner of that PR agrees. These are candidates C1 and C2 below.
   - **C1 is ready to port.** I applied it to `b890a766` in a scratch worktree and it passes, lints and typechecks.
   - **C2 needs a fixture rewrite.**
3. **Cleanup the owners could do (no SECONDARY action):**
   - **#726** stays open, but its fix (`8e90e154`) reached main through the #724 repair train (merge `34ba63a2`).
   - **#614** (HOLD) has no code left that is not on main; only handoff docs differ.
   - **#751** was a duplicate carrier of #742 and #665 and is already closed.
4. **Governance discrepancy.** `docs/ai/STOP_WORK_20261125.md` on main lists **#636** (F04 merchant dashboard) among the closed and archived PRs. GitHub shows it **open**, and its branch carries commit `cc96fe1c`, which records an "owner F04 dormant-merge decision" (AGENTS.md / STOP_WORK edits). That decision is **not on main**. F04 is a stopped product, so SECONDARY should not act on it, but whoever keeps the archive record should know.

Bucket counts (Table 1 / Table 2):

| Bucket | Table 1 | Table 2 |
|---|---|---|
| Fully merged (head is an ancestor of main) | 110 | 34 |
| Superseded, on main by content, or duplicate | 18 | 10 |
| Owned by an open PR | 15 | 4 |
| Stopped, deferred, held, or outside beta scope | 11 | 13 |
| Archival docs only, or a claim with no code | 11 | 2 |
| Blocked on an unmerged owner runtime | 3 | 0 |

Five Table 1 rows are owned and also outside beta scope: #720, #653, #678, #643 and #602. I counted each once, in the second bucket.

Late addition after the snapshot: `automation/20261127/bug/browser-digest-deadline` (`701ae992`, pushed 2026-11-28 02:23Z) is a new BUG-only fix to `apps/web/src/lib/browserChecks.ts`. It has an ACTIVE_WORK claim and **open PR #767**, so it is owned and active.

## Actionable candidates (unique and authorised, but each needs ownership reconciliation first)

### C1: the 64 generated first-signature wake schedules (idle-lock property test) from #544

- **What it is.** One `it.each` block of 64 fast-check-sampled schedules (`seed: 544, numRuns: 64`) in `apps/web/src/AppShell.idleClock.test.tsx`. It comes from commit `4b077d2b13f956cfcf9bce1726f929cca40c7394` ("test(web): fuzz first-signature wake schedules…"). The block varies these inputs:
  - lock timeout, 1 to 240 min
  - full or lean profile
  - pre-sleep activity: focus, pageshow, keydown or pointerdown
  - wall, monotonic or both clocks advancing
  - a ±250 ms offset around the deadline
  - clock rollback
  - up to three wake events

  It asserts that the first Create-invoice signature either signs once with a valid signature, or calls the signer zero times and requires unlock.
- **Why it is authorised.** It covers the shared-core protection of vault and session isolation (idle lock). It is test-only, with no product, dependency or contract change. `fast-check` 4.10.2 is already a devDependency of `apps/web` (`apps/web/package.json:51`).
- **Why it is stranded.** `docs/handoffs/IDLE_RECOVERY_CORE_20261126.md:68-69` (the #689 port of #544/#577) says: "The donor's 64 generated wake schedules remain in its original ref and were not imported or run in this port." Main's describe block `GP-PAGES-04: first invoice signature after sleep` (`apps/web/src/AppShell.idleClock.test.tsx:445-501`) has the donor's refactored helpers (`readyToSign`, `fillInvoice`, `activate`, `expectLocked`, `expectSigned`) and only the two deterministic cases.
- **Owner.** **Open PR #544** (`test/ghostpay-first-sign-after-sleep`, non-draft, based on the #365 branch rather than main). Its last activity was 2026-11-24 06:00Z, and its four comments are all from 11-24. No ACTIVE_WORK entry or registry claim on any of the 40 most recently pushed branches mentions the wake schedules (grep for `wake schedule|#544|first-sign-after-sleep`).
  - #762 has a thematic neighbour: the claim `audit/nov27-idle-87060` ("Confirm the current IDLE-M1 owner decision … focused sole-copy browser acceptance"). It does not touch this file.
  - **Do not port silently.** Ask on #544 or get an owner hand-off first, as the closed-residual record does for #589 and #632.
- **Verified by running it.** Scratch worktree `/workspace/scratch/a2-branches` at `b890a766`, block appended inside the existing describe, plus `import fc from 'fast-check'`; 34 added lines.
  - `npx vitest run src/AppShell.idleClock.test.tsx --coverage=false --maxWorkers=1`: **134/134 passed** (70 existing + 64 new) in 12.5 s.
  - `npx eslint src/AppShell.idleClock.test.tsx`: exit 0.
  - `npx tsc -p tsconfig.json --noEmit` (apps/web): exit 0.
- **Value, stated honestly.** This is additive breadth (timeouts 1–240 min, event and clock combinations), not a new bug. I checked a mutant that changed `now.wall - activity.wall >= timeoutMs` to `>` (`apps/web/src/AppShell.tsx:213`): it fails 2 of the schedules, and it also fails 10 existing deterministic tests in the same files.
- **Conflicts.** None with main: the block applies cleanly at `b890a766`. No active open PR or PRIMARY/SECONDARY claim touches this file. Only the giant old-stack PRs #372, #383, #587 and #609 list it, as inherited content.
- **Port recipe.**
  1. Copy lines 503-535 of `git show 4b077d2b:apps/web/src/AppShell.idleClock.test.tsx` (the `const schedules = fc.sample(...)` block and its `it.each`).
  2. Paste them before the closing `});` of main's `GP-PAGES-04: first invoice signature after sleep` describe.
  3. Add the `fast-check` import.
  4. No other file is needed. The `armed(recoverable, profile, observeSettings, lockTimeoutMin)` and `resume('resume')` helpers already exist on main.

### C2: two-case Permit/approve wallet-disclosure browser spec (from #589, carried by #632)

- **What it is.** `apps/web/e2e/wallet-token-disclosure.spec.ts` (blob `51ce4023c64b008f9bb60f23dcf769791d5cf56c`, 70 lines). For both `eth_signTypedData_v4` (Permit) and `eth_sendTransaction` (approve), it checks four things:
  - the in-page review shows the exact method, account, token, router, amount and Permit/approve label;
  - nothing reaches the wallet before approval;
  - the request the wallet rejects equals the previewed JSON;
  - exactly one request is sent, and the rejection message is kept.
- **Why it is authorised.** It covers external wallet disclosure, one of the protected mechanisms named in the AGENTS.md owner clarification.
- **Not on main.** `git ls-tree -r origin/main` has no such blob or file. Main's only unit-level Permit-disclosure assertion is `apps/web/src/views/Pay.test.tsx:844` (methods equal `['eth_requestAccounts','eth_signTypedData_v4']`).
- **Owner.** **Open PR #632** (`automation/20261124T2237Z/qa/disclosure-firefox-reflow`, draft, last push 2026-11-24 22:37 -0700). Record row #589 E pins it there. `docs/GHOSTPAY_CONSOLIDATION_TRACKER.md` (P14 F3 section) says: "Its quiet timestamp does not release ownership." It therefore needs explicit reconciliation with #632's owner.
- **Effort and risk (inferred, not run).** The spec depends on helpers that main does not have:
  - `walletFixture.ts` / `injectWallet`, `approveWalletDisclosure` and the `rejectMethod` / `rejectedRequest` wallet controls are all absent on main.
  - Main uses `apps/web/e2e/walletDisclosure.ts` (`approveWalletDisclosures`, `shownWalletDisclosures`) and the inline `__e2eWallet` fixture in `flows.spec.ts:48-69`.

  A port means rewriting it onto main's fixture, the same way #742 ported #569 case 4 into `flows.spec.ts`. I did not run Playwright.
- **Conflicts.** It would be a new spec file, so there is no textual conflict. Possible thematic overlap: #766 (tooltips) touches `WalletDisclosure.tsx` presentation, and #742/#762 touch `WalletDisclosure.tsx` focus handling.

### Things I checked that are **not** candidates

- **#604 / #591 donor `payExec.test.ts` case.** "keeps a receipt with status %s unconfirmed when the transaction cannot be read back" is already covered on main. I made a mutant that let unverified 0x0 receipts be recorded as `reverted`. The donor case catches it, but so does main's `apps/web/src/views/Pay.test.tsx:597` (`keeps an unmatched receipt with status 0x0 unverified…`). Run in scratch; the mutant was reverted afterwards.
- **#546 `test/seller-accepted-late-reorg` and the claim-only `codex/invoice-expiry-recovery-devnet`.** Their behaviour is on main via #635: `retryFrom` / `lateAcceptedAt` in `packages/ux-vault/src/reconciliation-portable.ts:146,1065`, with tests at `apps/web/src/lib/reconciliationVault.invoices.test.ts:525-766`, and the same accepted-late reorg-and-reload browser case at `apps/web/e2e/core-journey.spec.ts:777`.
- **`automation/20261124T1637Z/bug/hostile-text-fresh-payer`.** Main solves the same sole-copy `beforeunload` problem a different way (`apps/web/e2e/app.spec.ts:118-145`).
- **`claude/fc05b-btc-hardening-20261125`.** Main carries the reviewed successor (`a86cc353` plus review commits `b39bfd8e`, `ebda107d`, `d22db6fa`, `cc1ca67f`, `b4c6b8fb`).
- **#720.** The `payERC20WithPermitAndBuffer` half is a contract change, which is outside the Pages-beta scope (AGENTS.md release focus). The L2-I4 manifest read-back half is claimed by PRIMARY as **P-M4**, so #720 is only a donor for that claim.
- **Out-of-window pointer.** **#254** (`chatgpt/btc-spentness-private-scan-20261118`, head 2026-11-19) lists 15 donor-only BTC test cases, and #760's tracker diff calls them "not yet owned". On 2026-11-28 01:11Z a ledger worker posted a triage on #254 (comment 7231489282). It states that "FC-05b is full-profile testnet/PoC, not approved one-EVM lean beta functionality" and keeps the donor open pending an owner decision. It is not a SECONDARY candidate unless the owner says otherwise.

## Table 1: committer-local date 2026-11-24 or later (168 branches)

Non-ancestors come first (58), then ancestors (110). "Ahead / Δpaths" is commits not on main, then the number of paths in which `merge-tree(main, branch)` differs from main.

| Branch | Head | Committer date | PR | Ahead / Δpaths | Classification | Evidence | Owner |
|---|---|---|---|---|---|---|---|
| `integration/ghostpay-autonomous-ledger-20261121-5ceb` | `56380dd7` | 2026-11-27 19:05:12 -0700 | #380 open (draft) | 64 / 87 | Owned, docs only | 64 commits, all consolidation-ledger docs (docs/consolidation, master ledger); no product delta | #380 open; hourly checkpoints, last push 2026-11-28 02:05Z (active) |
| `codex/beta-control-tooltips` | `e9b14cf2` | 2026-11-27 18:38:44 -0700 | #766 open | 2 / 57 | Owned, unique, in progress | 2 commits on b890a766: ControlTips + 187 keys/locale, presentation wrappers in 30+ lean views (57 files) | #766 open (Codex), pushed 2026-11-28 01:38Z; registry observed_external |
| `audit/nov27-hosted-erc20-verification` | `5b60776e` | 2026-11-27 18:08:38 -0700 | #764 open (draft, base #762) | 29 / 58 | Owned, unique, in progress | stacks on #762; adds ERC-20 browser workflow + nov27-w5-qualification.yml pinning #665 harness db6f3da6 | #764 open, pushed 2026-11-28 01:08Z |
| `fix/stress-runner-volume-crash` | `3e633f55` | 2026-11-27 18:03:48 -0700 | #765 open (draft) | 2 / 9 | Owned, unique, in progress | scripts/stress/* replay runner + redaction + node test (9 files) | #765 open, pushed 2026-11-28 01:03Z |
| `audit/nov27-six-finding-integration` | `96784ca1` | 2026-11-27 18:02:24 -0700 | #762 open | 25 / 48 | Owned, unique, in progress | contains #742 head 2b4826e0 (ancestor) + Pages origin/archive, idle, late-payment, export-inventory audit fixes (48 files) | #762 open, pushed 2026-11-28 01:02Z; ACTIVE_WORK claims audit/nov27-{pages,late,inventory,idle,origin}-87060 |
| `audit/nov27-mythril-fee-read` | `862cf5fc` | 2026-11-27 17:51:13 -0700 | #763 open | 1 / 3 | Owned, unique (test + disposition only) | packages/contracts/test/MythrilFactoryPostFeeRead.t.sol + docs/audits note; no contract source change | #763 open, pushed 2026-11-28 00:51Z |
| `test/quick-hide-donor-300-20261127` | `559a95ed` | 2026-11-27 17:03:35 -0700 | #761 open (draft) | 3 / 3 | Owned, unique test | PrivacyControls.donor300.test.tsx recovering #300 cases | #761 open, pushed 2026-11-28 00:03Z |
| `test/erc20-pages-recovery-20261127-27c1` | `1d7bd4ea` | 2026-11-27 16:40:00 -0700 | #753 open (draft) | 6 / 13 | Owned, unique, in progress | ERC-20 Pages devnet specs, membership gate script/test, workflow (13 files) | #753 open, pushed 2026-11-27 23:40Z |
| `nodata/optimistic-maxwell-epuo8f` | `07f35d7b` | 2026-11-27 22:12:31 +0000 | #760 open (draft); earlier #673/#686/#715 merged | 1 / 1 | Owned, docs only | 1 commit: tracker rec-2 close-out (maps #591/#604 donor cases to main successors) | #760 open, pushed 2026-11-27 22:12Z |
| `claude/loving-brown-v8dlp6` | `2b4826e0` | 2026-11-27 15:09:31 +0000 | #742 open (draft) | 21 / 16 | Owned, unique, in progress | LATE-L1 replay fix (reconciliation-portable.ts), #569/#355 masking ports, receipt-file wallet-change fix; head is an ancestor of #762 | #742 open, pushed 2026-11-27 15:09Z; also carried by #762/#764 |
| `nodata/beautiful-heisenberg-25ikdy` | `0439ca4c` | 2026-11-27 13:23:14 +0000 | #751 closed unmerged | 79 / 54 | Duplicate (no action) | merge-tree remainder = older copy of #742 + #665 harness + docs/handoffs/COMPLETION_QUALIFICATION_20261127.md; its draft/fuzz/ERC-20 parts landed via #728/#754 (ACTIVE_WORK on main: 'Port of ERC-20 anvil and remaining fuzz suites from #751') | none needed (#751 closed by owner 2026-11-27 14:04Z) |
| `automation/20261126T1728Z/bug/exact-payment-tolerance` | `e721985a` | 2026-11-27 03:23:26 -0700 | #726 open (draft) | 1 / 2 | Fully on main by content | fix head 8e90e154 is an ancestor of main via #724 repair-train merge 34ba63a2; remainder = ACTIVE_WORK + 5-line handoff addendum | #726 still open (automation worker); owner can close |
| `claude/vibrant-cori-scu18b` | `4f84e819` | 2026-11-26 17:27:52 +0000 | #720 open (draft); earlier #219 merged | 13 / 56 | Owned; contract half out of beta scope | router payERC20WithPermitAndBuffer (GhostPayRouter.sol, ADR-0030) = contract change; L2-I4 two-RPC manifest read-back overlaps PRIMARY claim P-M4 (manifest.ts/deployment.ts) | #720 open, last push 2026-11-26 17:27Z; manifest scope claimed by PRIMARY P-M4 |
| `nodata/elegant-tesla-kpeojx` | `db6f3da6` | 2026-11-26 15:41:49 +0000 | #665 open | 43 / 38 | Owned, unique (verification harness) | verification/independent-beta/* W5 black-box payer/seller verifier; pinned by #764 workflow (HARNESS db6f3da6) | #665 open, last push 2026-11-26 15:41Z; in active use by #764 |
| `claude/fc05b-main-20261126` | `69a4d3e1` | 2026-11-26 05:50:43 -0800 | #704 closed unmerged | 2 / 1 | Fully superseded | 2 main-merge commits; remainder ACTIVE_WORK only; closed-residual record row #704: 'Integrated through #718' | none needed (#704 closed) |
| `nodata/brave-meitner-974y9e` | `0d548b9a` | 2026-11-26 12:46:55 +0000 | #636 open (draft) | 24 / 49 | Deferred / stopped product (F04) | merchant dashboard stack; branch-local commit cc96fe1c records an 'owner F04 dormant-merge decision' that is NOT on main; STOP_WORK_20261125.md on main lists #636 as closed/archived, yet GitHub shows it open | #636 open (draft), last push 2026-11-26 12:46Z; archival only for SECONDARY |
| `nodata/inspiring-shannon-2ehl3u` | `c87fe94a` | 2026-11-26 12:42:48 +0000 | #722 open (draft) | 7 / 7 | Owned, unique docs/i18n | beta exclusion notice (docs/user/README, wiki) + es/ja/ar translation of English-seeded values; conflicts in ar/es/ja catalogs | #722 open (draft), last push 2026-11-26 12:42Z |
| `nodata/magical-volta-z6taog` | `6adf71f7` | 2026-11-26 10:27:56 +0000 | #639 open (draft) | 7 / 16 | Owned, unique docs | README name/command repairs across 16 READMEs | #639 open (draft), last push 2026-11-26 10:27Z |
| `nodata/brave-clarke-nwzz0s` | `8314b494` | 2026-11-26 09:30:33 +0000 | #702 closed unmerged | 4 / 2 | Obsolete docs (no action) | HANDOFF.md refresh pinned to 11-26 main; owner closed #702 as obsolete ('Regenerate from current main if still wanted'); main docs/ai/HANDOFF.md is a deliberate template | none needed (#702 closed) |
| `claude/serene-hawking-kjd54q` | `2021b0b4` | 2026-11-25 21:46:43 +0000 | #653 open (draft) | 9 / 34 | Out of beta scope (new backend) | new packages/light-indexer reference /v1/logs server + CI anvil lane; conflicts with 'no new backends/hosted dependencies' | #653 open (draft), last push 2026-11-25 21:46Z |
| `nodata/eloquent-shannon-gfv6t9` | `6dd97323` | 2026-11-25 16:15:06 +0000 | #678 open (draft); earlier #642 merged | 5 / 44 | Owned, dormant future module (P13) | packages/confidential-amounts QA/fuzz/fixes; package map: used by no app | #678 open (draft), last push 2026-11-25 16:15Z |
| `claude/fc-integration-20261125` | `d205fc30` | 2026-11-25 04:46:57 -0800 | #664 closed unmerged | 11 / 1 | Fully superseded | qualification candidate; remainder ACTIVE_WORK only; record row #664 C (all seven components on main, label via #712) | none needed (#664 closed) |
| `claude/feature-completion-20261125` | `c3ed8ef8` | 2026-11-25 04:35:00 -0800 | none (head: search 0) | 35 / 3 | Archival docs only | 35 docs commits: CAMPAIGN.md (378 lines) + BRANCH_INVENTORY.tsv (725 lines); FC work landed via #694/#688/#718 | none (no PR) |
| `claude/fc05b-btc-hardening-20261125` | `8ea606ff` | 2026-11-25 04:14:40 -0800 | #669 closed unmerged | 3 / 7 | Fully superseded | main carries the reviewed successor: a86cc353 'Merge PR #669' + b39bfd8e/ebda107d/d22db6fa/cc1ca67f/b4c6b8fb; merge-tree conflicts are older copies of BtcView.tsx/pendingSpend test | none needed (#669 closed) |
| `claude/w4-minimal-invoice-287-20261125` | `1c4a2903` | 2026-11-25 04:05:05 -0800 | none (head: search 0) | 1 / 2 | Fully superseded | single merge of #668 into #585/#600; only conflict residue (PaymentRequestDownload line); #668 and #695 merged | none (no PR) |
| `claude/w1-coordination-20261125` | `be2d70f2` | 2026-11-25 03:54:42 -0800 | none (head: search 0) | 2 / 1 | Archival docs only | docs/ai/coordination/HOME_TEAM_20261125.md (35 lines) handoff | none (no PR) |
| `automation/20261125T0841Z/qa/private-scan-presentation` | `1dcd5a25` | 2026-11-25 01:44:48 -0700 | #655 closed unmerged | 555 / 2010 | Blocked | fixture 7d5a3f0e edits Scan.privateCheckpoint.test.tsx for privateScanStore, absent on main; record row #655 F, pinned to open #248 | #248 open (draft, 2026-11-19) owns the runtime |
| `ledger/consolidation-snapshot-20261124-0418` | `2df4ab83` | 2026-11-25 01:04:45 -0700 | none (head: search 0) | 29 / 54 | Archival docs only | 29 census/ledger commits (28 not in #380's branch); docs/consolidation/autonomous-20261121/* | none (no PR); ledger owner continues on #380 |
| `automation/20261125T0637Z/qa/account-privacy-signer-pin` | `724afdcf` | 2026-11-24 23:39:03 -0700 | #652 closed unmerged | 552 / 2009 | Blocked | fixture f902207b edits Pay.signer.test.tsx / invoiceSignerPins, absent on main; record row #652 F, pinned to open #243 | #243 open (draft, 2026-11-19) |
| `nodata/gracious-pascal-vdb581` | `c13070f8` | 2026-11-25 05:54:08 +0000 | #643 open (draft) | 8 / 36 | Owned, standalone PoC | packages/metadata-hardening hardening (package map: used by none) | #643 open (draft), last push 2026-11-25 05:54Z |
| `automation/20261125/bug/pos-session-record-bound` | `a095a62d` | 2026-11-24 22:24:14 -0700 | #646 closed [ARCHIVED F09] | 4 / 4 | Stopped product (F09) | examples/pos-terminal session bound fix | #646 closed [ARCHIVED] |
| `automation/20261125T0437Z/qa/registry-history-live-region` | `3b7351c7` | 2026-11-24 21:39:32 -0700 | #645 closed unmerged | 549 / 2008 | Superseded by design | record row #645 C: public-shell architecture conceals rows on consent withdrawal | none needed (#645 closed) |
| `automation/20261124T2237Z/qa/disclosure-firefox-reflow` | `0036fe16` | 2026-11-24 15:38:26 -0700 | #632 open (draft) | 544 / 2018 | Owned, unique tests (stale) | carries #589's two-case Permit/approve wallet-disclosure browser spec (apps/web/e2e/wallet-token-disclosure.spec.ts, blob 51ce4023) absent on main; record row #589 E keeps it with #632 | #632 open (draft), last push 2026-11-24 22:37 -0700 |
| `automation/20261124T2037Z/qa/disclosure-signer-pin-gate` | `c484f833` | 2026-11-24 13:38:50 -0700 | #630 closed unmerged | 541 / 2016 | Blocked | same signer-pin fixture as #652; depends on #243; record row #630 F | #243 open (draft) |
| `automation/20261124T1637Z/bug/hostile-text-fresh-payer` | `662418ed` | 2026-11-24 09:39:34 -0700 | none (head: search 0) | 2 / 2 | Fully superseded | main fixes the same sole-copy beforeunload issue differently (apps/web/e2e/app.spec.ts:118-145 accepts exactly one beforeunload warning) | none (no PR) |
| `integration/near-finished-20261124` | `c03598fe` | 2026-11-24 08:04:57 -0700 | #614 open [HOLD] | 2 / 3 | Code fully on main; held | merge-tree delta = docs only (2 handoffs + ACTIVE_WORK); countdown/POS/QR/fiat parts merged via #574/#576/#605/#568 | #614 open [HOLD] per STOP_WORK; owner decision |
| `claude/nifty-bohr-5ra2ap-dormant-371` | `98065511` | 2026-11-24 14:35:36 +0000 | #621 open [HELD] | 56 / 77 | Held mixed stopped composition | dormant F04/F05/F10 modules + isolation tests (22 files) | #621 open [HELD] per STOP_WORK |
| `automation/20261124T1237Z/bug/deployment-diagnostic-fixture` | `3107b816` | 2026-11-24 05:40:33 -0700 | #619 closed unmerged | 4 / 2 | Fully superseded | test commits 138b648a/fc91f371 already on main by content; remainder = 17-line handoff + ACTIVE_WORK | none needed (#619 closed) |
| `automation/20261124T1037Z/bug/dashboard-idb-rejection` | `e564360a` | 2026-11-24 03:41:03 -0700 | #618 closed [ARCHIVED F04] | 16 / 32 | Stopped product (F04) | merchant dashboard fixture | #618 closed [ARCHIVED] |
| `integration/ghostpay-additional-reviewed-20261124-68c82b9` | `464a7cb4` | 2026-11-24 03:33:48 -0700 | #617 closed unmerged | 2 / 109 | Superseded (shared core) / stopped (POS, fiat) | record row #617 C/D; non-doc residue = seal.ts/view.ts conflict noise | none needed (#617 closed) |
| `integration/ghostpay-followup-fixes-20261124-68c82b9` | `7c498765` | 2026-11-24 03:19:20 -0700 | #616 closed unmerged | 1 / 34 | Superseded (shared core) / stopped (POS, fiat) | record row #616 C/D; seal.ts residue is a variable rename | none needed (#616 closed) |
| `qualification/near-finished-20261124` | `fc92ba53` | 2026-11-24 02:46:08 -0700 | none (head: search 0) | 1 / 4 | Archival docs only | 3 handoffs (countdown #574, POS #576, near-finished); subjects merged | none (no PR) |
| `qualification/20261124/resume-packages-565-568` | `9977a3b7` | 2026-11-24 02:43:58 -0700 | none (head: search 0) | 3 / 5 | Archival docs only | qualification JSON/handoffs for #565/#568 (both merged) | none (no PR) |
| `investigate/privacy-569-firefox-20261124` | `17fa04b0` | 2026-11-24 02:37:06 -0700 | #613 open (draft) | 545 / 2032 | Owned (stale) | native Firefox reflow qualification for #569; #569 dispositions on #742; fixture recovered by #632 | #613 open (draft), last push 2026-11-24 02:37 -0700 |
| `fix/20261124/encrypted-wallet-revocation-notice` | `e580fcac` | 2026-11-24 02:35:54 -0700 | #612 closed unmerged | 546 / 2007 | Superseded | record row #612 C via #691/#697 | none needed (#612 closed) |
| `resume/receipt-retention-tor-fixture-20261124` | `00078ed6` | 2026-11-24 02:28:13 -0700 | #609 open | 535 / 2008 | Deferred by owner | timestamp retention; #699 merged 'owner deferred persistent vault timestamp retention (#383 #587 #609)' | #609 open |
| `codex/recover-wallet-disclosure-qualification-20261124` | `f941ac01` | 2026-11-24 02:23:42 -0700 | #606 closed unmerged | 538 / 2015 | Superseded | record row #606 C via #677/#679 | none needed (#606 closed) |
| `finish/offline-completion-20261124` | `2f2c282e` | 2026-11-24 02:13:53 -0700 | #604 closed unmerged | 5 / 22 | Fully superseded | successor #717 merged via #728; #760 maps the donor-only cases; e.g. 0x0 unread receipt = Pay.test.tsx:597; apps/web->ux-core dependency deliberately not taken | none needed (#604 closed 2026-11-27) |
| `qualification/20261124/pages-599` | `8e0bbe97` | 2026-11-24 02:13:46 -0700 | none (head: search 0) | 1 / 3 | Archival docs only | Pages #599 qualification record; #599 branch is an ancestor of main | none (no PR) |
| `qualification/pr525-main-package-rollup-20261124` | `dc2bcf28` | 2026-11-24 02:05:51 -0700 | none | 1 / 1 | Archival docs only | 1 merge commit; remainder ACTIVE_WORK only | none (no PR) |
| `qualification/pr504-main-package-rollup-20261124` | `c09d15a3` | 2026-11-24 02:05:32 -0700 | none (head: search 0) | 1 / 1 | Archival docs only | 1 merge commit; remainder ACTIVE_WORK only | none (no PR) |
| `qualification/pr531-main-package-rollup-20261124` | `33497579` | 2026-11-24 02:04:53 -0700 | none | 1 / 1 | Archival docs only | 1 merge commit; remainder ACTIVE_WORK only | none (no PR) |
| `codex/recover-minimal-invoice-qualification-20261124` | `2d612e37` | 2026-11-24 02:02:39 -0700 | #603 closed unmerged | 1 / 3 | Superseded | record row #603 C; residue is a selector regex variant in CreateInvoice.ordering.test.tsx | none needed (#603 closed) |
| `finish/recurring-m4-qualification-20261124` | `8d8fe2f0` | 2026-11-24 02:00:03 -0700 | #602 open (draft) | 87 / 89 | Deferred / non-beta (F10 recurring) | 87 commits of F10 private-recurring M2-M4; AGENTS.md: do not start subscription programs in this beta; F10 is in held #371/#621 | #602 open (draft), last push 2026-11-24 02:00 -0700 |
| `resume/account-privacy-20261124` | `86450d8d` | 2026-11-24 01:55:26 -0700 | #598 closed unmerged | 545 / 2005 | Superseded | record row #598 C via #691/#697 | none needed (#598 closed) |
| `resume/recovery-native-20261124` | `f637214e` | 2026-11-24 01:45:34 -0700 | #596 closed unmerged | 99 / 231 | Superseded (own change); carries #544 remainder | record row #596 C; inherits 4b077d2b whose 64 generated wake schedules are not on main (see candidate C1); older inherited 11-19/11-20 content belongs to earlier census | none for #596; C1 remainder owned by open #544 |
| `claude/haiku-wave-3-2026-11-24` | `27447747` | 2026-11-24 01:48:54 +0000 | none (head: search 0) | 1 / 1 | Archival docs only | docs/handoffs/HAIKU-WAVE-3-2026-11-24.md prompt | none (no PR) |
| `claude/ghostpay-lean-core-milestone-t5lwox` | `87b5e4bf` | 2026-11-24 01:47:48 +0000 | #151 closed | 9 / 0 | Fully superseded | merge-tree(main, branch) == main tree (0 paths differ) | none needed (#151 closed) |
| `automation/20261127/bug/receipt-input-snapshot` | `d6c24db6` | 2026-11-27 15:25:52 -0700 | #759 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1 | none needed |
| `claude/consolidation-stack-20261126` | `f494229f` | 2026-11-27 12:32:40 -0800 | #718/#728/#758 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 8 | none needed |
| `claude/multipart-note-copy-20261126` | `c640d994` | 2026-11-27 10:56:57 -0800 | #712/#757 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 19 | none needed |
| `automation/20261127T1524Z/bug/deeplink-redirect-order` | `12533b2d` | 2026-11-27 10:26:12 -0700 | #756 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 35 | none needed |
| `claude/journal-fuzz-20261126` | `95c70612` | 2026-11-27 07:57:00 -0800 | #706/#755 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 41 | none needed |
| `claude/idle-sweep-freeze-tests-20261126` | `0d1f0086` | 2026-11-27 05:45:21 -0800 | #711/#754 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 63 | none needed |
| `finish/privacy-preview-resume-20261126-9d8f` | `8a519272` | 2026-11-27 03:03:06 -0800 | #724 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 111 | none needed |
| `claude/a11y-reflow-checkvisibility-20261126` | `67d1a50f` | 2026-11-27 02:22:56 -0800 | #714/#744 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 144 | none needed |
| `automation/20261127T0824Z/bug/share-checksum-warning` | `1111c62e` | 2026-11-27 01:25:50 -0700 | #752 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 163 | none needed |
| `automation/20261127T0420Z/bug/share-payment-label-ambiguity` | `cca4e590` | 2026-11-26 23:26:23 -0700 | #748 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 168 | none needed |
| `finish/p14-consolidation-handoff-20261127-d81a` | `bcbeb084` | 2026-11-26 22:42:21 -0700 | #750 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 174 | none needed |
| `finish/p14-indexer-completion-20261127-d81a` | `7a8e88d7` | 2026-11-26 21:49:50 -0700 | #749 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 179 | none needed |
| `finish/p14-caught-up-20261127-d81a` | `1308f185` | 2026-11-26 20:56:01 -0700 | #747 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 184 | none needed |
| `finish/core-branch-completion-20261127-d81a` | `84d95d62` | 2026-11-26 20:41:52 -0700 | #745 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 186 | none needed |
| `nodata/clever-meitner-6a8eg0` | `3f7fcd0a` | 2026-11-26 20:33:45 -0700 | #725/#729/#731/#733-737/#740/#741/#743/#746 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 189 | none needed |
| `automation/20261126T2118Z/bug/invoice-link-invalid-host` | `8fc4c2f5` | 2026-11-26 19:21:52 -0700 | #732 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 187 | none needed |
| `nodata/fervent-mendel-ybw0va` | `c0703d3a` | 2026-11-27 00:26:22 +0000 | #703/#719/#738 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 200 | none needed |
| `nodata/tender-mccarthy-a61kj6` | `bc1e1523` | 2026-11-26 17:24:18 -0700 | #723/#739 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 203 | none needed |
| `automation/20261126/bug/i18n-exact-extension-negotiation` | `1d9a6b05` | 2026-11-26 16:21:12 -0700 | #713 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 204 | none needed |
| `claude/nifty-bohr-5ra2ap` | `257c8dad` | 2026-11-26 19:50:28 +0000 | #539/#622/#727/#730 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 223 | none needed |
| `claude/offline-drafts-successor-20261126` | `367a3b30` | 2026-11-26 07:06:20 -0800 | #717 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 339 | none needed |
| `claude/p0-keys-m2b-successor-20261126` | `f7412688` | 2026-11-26 05:45:29 -0800 | #707 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 333 | none needed |
| `claude/w-match-cover-20261125` | `1b097132` | 2026-11-26 04:52:24 -0800 | #696 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 350 | none needed |
| `security/mythril-full-remediation-20261118` | `c060d3df` | 2026-11-26 12:25:46 +0000 | #220 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 347 | none needed |
| `claude/keen-volta-8ctx9x` | `a308b086` | 2026-11-26 11:46:57 +0000 | #500/#624/#716/#721 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 359 | none needed |
| `claude/global-masking-286-20261126` | `03ba9783` | 2026-11-26 02:34:11 -0800 | #708 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 357 | none needed |
| `nodata/zen-dirac-vkl84j` | `8a8d72de` | 2026-11-26 02:28:36 -0800 | #701 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 364 | none needed |
| `claude/account-privacy-audit-20261126` | `5092b254` | 2026-11-26 02:23:24 -0800 | #710 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 367 | none needed |
| `claude/keystore-recovery-followups-20261126` | `d739ecc4` | 2026-11-26 01:00:50 -0800 | #705 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 352 | none needed |
| `automation/20261126/bug/i18n-unsupported-locale-fallback` | `a75480ca` | 2026-11-26 01:00:45 -0800 | #700 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 358 | none needed |
| `automation/20261125/bug/template-import-epoch-bound` | `7c8773c1` | 2026-11-26 00:59:33 -0800 | #637 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 370 | none needed |
| `automation/20261124T2125Z/bug/schedule-negative-handled` | `d43205e6` | 2026-11-26 00:51:13 -0800 | #631 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 370 | none needed |
| `claude/auto-rescan-rearm-r2-20261126` | `5d86a6a2` | 2026-11-26 00:49:22 -0800 | #709 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 373 | none needed |
| `claude/privacy-minimal-invoices-successor` | `2e36a4b4` | 2026-11-25 23:42:45 -0800 | #695 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 376 | none needed |
| `claude/integrate-692-20261126` | `f45025b5` | 2026-11-25 21:57:02 -0800 | #698 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 394 | none needed |
| `claude/integrate-691-20261126` | `abeeb0cb` | 2026-11-25 21:56:47 -0800 | #697 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 409 | none needed |
| `claude/defer-vault-retention-20261126` | `e964973f` | 2026-11-25 21:22:47 -0800 | #699 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 418 | none needed |
| `claude/fc-round1-rest-20261126` | `a712edd3` | 2026-11-25 20:35:40 -0800 | #694 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 420 | none needed |
| `claude/w3-keystore-canonical-vector` | `af8314d1` | 2026-11-25 19:55:55 -0800 | #693 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 458 | none needed |
| `finish/policy-journal-lock-20261125-8812` | `c7b9badc` | 2026-11-25 20:18:30 -0700 | #692 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 441 | none needed |
| `finish/account-privacy-core-20261125-8812` | `6b4bbe17` | 2026-11-25 20:12:53 -0700 | #691 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 454 | none needed |
| `finish/idle-recovery-core-20261125-8812` | `0ae8a9d1` | 2026-11-25 19:33:08 -0700 | #689 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 456 | none needed |
| `finish/shared-payment-utilities-20261125-8812` | `62d8ff68` | 2026-11-25 19:08:48 -0700 | #690 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 460 | none needed |
| `finish/request-files-20261125-8812` | `521a917d` | 2026-11-25 18:47:00 -0700 | #688 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 477 | none needed |
| `finish/clipboard-rpc-20261125-8812` | `82d50755` | 2026-11-25 18:05:46 -0700 | #687 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 500 | none needed |
| `finish/privacy-profiles-d05-20261125-8812` | `db544fa5` | 2026-11-25 17:51:45 -0700 | #685 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 527 | none needed |
| `finish/in-scope-branches-20261125-8812` | `04b1a5ac` | 2026-11-25 17:35:44 -0700 | #684 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 537 | none needed |
| `automation/20261125T1241Z/containment/help-scope` | `4f674cdd` | 2026-11-25 15:40:57 -0700 | #671 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 597 | none needed |
| `automation/20261125T1635Z/coordinator/owner-scope-landing` | `f1ec3522` | 2026-11-25 13:37:02 -0700 | #680 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 596 | none needed |
| `claude/w3-sweep-consent-successor` | `4a2258d3` | 2026-11-25 12:03:30 -0800 | #683 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 604 | none needed |
| `claude/w3-provider-privacy-boundary` | `6985ec00` | 2026-11-25 11:32:23 -0800 | #672 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 623 | none needed |
| `claude/w-wallet-disclosure-ui-287-20261125` | `36b8a71b` | 2026-11-25 10:43:34 -0800 | #679 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 634 | none needed |
| `claude/w-ghostpay42-closeout-20261125` | `1daa15ae` | 2026-11-25 10:06:06 -0800 | #682 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 644 | none needed |
| `claude/w-wallet-disclosure-287-20261125` | `f038ae45` | 2026-11-25 10:03:54 -0800 | #677 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 639 | none needed |
| `claude/queue-candidate-20261125` | `e2c11634` | 2026-11-25 08:58:02 -0800 | #681 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 645 | none needed |
| `claude/w-reuse-287-20261125` | `1e7519ac` | 2026-11-25 07:33:44 -0800 | #674 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 666 | none needed |
| `claude/w-export-privacy-286-20261125` | `9680b013` | 2026-11-25 07:32:37 -0800 | #675 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 681 | none needed |
| `claude/w-retention-287-20261125` | `46543280` | 2026-11-25 07:24:50 -0800 | #676 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 689 | none needed |
| `claude/small-fix-20261125` | `e3e13854` | 2026-11-25 04:31:36 -0800 | #670 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 695 | none needed |
| `claude/w4-clipboard-286-main-20261125` | `74e0c61d` | 2026-11-25 04:01:45 -0800 | #668 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 697 | none needed |
| `claude/w1-reconcile-659-20261125` | `67a241c7` | 2026-11-25 03:24:13 -0800 | #667 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 708 | none needed |
| `claude/sec1-payer-key-warning` | `92ff6331` | 2026-11-25 03:21:09 -0800 | #666 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 709 | none needed |
| `claude/p0-keys-independent-recovery` | `6fd126db` | 2026-11-25 02:59:31 -0800 | #647 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 694 | none needed |
| `claude/fix-keystore-test-flakes` | `d79f4040` | 2026-11-25 02:48:29 -0800 | #660 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 699 | none needed |
| `claude/mobile-restore` | `ca0d292d` | 2026-11-25 02:48:24 -0800 | #657 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 702 | none needed |
| `backup/p0-keys-independent-recovery-da26b87e` | `da26b87e` | 2026-11-25 02:33:50 -0800 | none (backup ref) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 695 | none needed |
| `claude/fc04-hardening-tests-20261125` | `d0510887` | 2026-11-25 01:54:51 -0800 | #663 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 726 | none needed |
| `claude/fc05a-t-btc-text-20261125` | `22c3cb1d` | 2026-11-25 01:40:15 -0800 | #662 closed (folded into #694) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 710 | none needed |
| `claude/fc01-f03-request-file-20261125` | `3851f02b` | 2026-11-25 01:34:47 -0800 | #650 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 717 | none needed |
| `owner/privacy-beta-scope-20261125` | `ea94ba7c` | 2026-11-25 02:29:47 -0700 | #659 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 730 | none needed |
| `claude/fc03-t-chain-text-20261125` | `a2b14ca8` | 2026-11-25 01:23:44 -0800 | #661 closed (folded into #694) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 725 | none needed |
| `claude/priv-t02-rpc-disclosure` | `9aed3886` | 2026-11-25 02:15:06 -0700 | #658 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 720 | none needed |
| `claude/fc05a-btc-spentness-20261125` | `8e7b1915` | 2026-11-25 00:59:56 -0800 | #656 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 713 | none needed |
| `claude/fc02-sweep-consent-20261125` | `790de53e` | 2026-11-25 00:47:50 -0800 | #649 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 719 | none needed |
| `nodata/focused-meitner-07a9u7` | `a75ed0b1` | 2026-11-25 08:41:23 +0000 | #654 closed (folded into #688) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 716 | none needed |
| `backup/p0-keys-independent-recovery-021e4f25` | `021e4f25` | 2026-11-25 00:24:26 -0800 | none (backup ref) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 719 | none needed |
| `claude/fc03-chain-interop-20261125` | `a13ab24d` | 2026-11-25 00:08:49 -0800 | #648 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 726 | none needed |
| `claude/p1-late-reconciliation` | `205f8fd7` | 2026-11-25 00:02:44 -0800 | #635 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 714 | none needed |
| `docs/privacy-profile-decisions-20261124` | `be04d116` | 2026-11-24 23:22:37 -0700 | #651 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 761 | none needed |
| `nodata/amazing-dijkstra-rgkp6o` | `1ca40112` | 2026-11-25 06:03:42 +0000 | #640 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 750 | none needed |
| `nodata/peaceful-faraday-enxrin` | `94ab256e` | 2026-11-25 05:06:19 +0000 | #644 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 754 | none needed |
| `nodata/gracious-meitner-0yy6do` | `cefdbd9d` | 2026-11-25 03:25:06 +0000 | #638 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 763 | none needed |
| `automation/20261125T0120Z/bug/ux-links-handle-confusable-case` | `89810612` | 2026-11-24 18:25:06 -0700 | #634 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 762 | none needed |
| `automation/20261124/bug/nl-amount-locale-prefix-r11` | `4a13cffe` | 2026-11-24 16:26:04 -0700 | #633 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 762 | none needed |
| `automation/20261124-recovery-573/qa/beforeunload-fixture` | `4b1ed14c` | 2026-11-24 11:38:39 -0700 | #629 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1163 | none needed |
| `automation/20261124T1821Z/bug/ux-export-leading-bom` | `0fe0f06f` | 2026-11-24 11:27:42 -0700 | #628 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 762 | none needed |
| `automation/20261124/bug/i18n-accessible-name-surrogate-r11` | `005ca59c` | 2026-11-24 10:26:06 -0700 | #627 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 762 | none needed |
| `automation/20261124/bug/ux-intake-qr-clock-rollback-r11` | `4b6a36a9` | 2026-11-24 09:24:26 -0700 | #626 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 762 | none needed |
| `automation/20261124T1437Z/bug/scan-locale-vault-fixture` | `694383f7` | 2026-11-24 07:39:51 -0700 | #625 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1401 | none needed |
| `automation/20261124/bug/i18n-adjacent-quoted-literals-r11` | `9e41a4e4` | 2026-11-24 07:30:01 -0700 | #623 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1407 | none needed |
| `integration/all-branch-followups-20261124` | `23b307d5` | 2026-11-24 06:42:49 -0700 | #620 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 807 | none needed |
| `integration/all-branch-review-20261124` | `87bee078` | 2026-11-24 03:53:40 -0700 | #611 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 858 | none needed |
| `integration/ghostpay-branch-comparison-20261124-68c82b9` | `70970c3b` | 2026-11-24 02:52:16 -0700 | #615 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 948 | none needed |
| `codex/qr-exchange-browser-completion` | `74121278` | 2026-11-24 02:33:38 -0700 | #581 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1094 | none needed |
| `finish/destination-reuse-type-20261124` | `874d3809` | 2026-11-24 02:30:19 -0700 | #610 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1145 | none needed |
| `finish/receipt-print-completion-20261124` | `0d3d804b` | 2026-11-24 02:27:26 -0700 | #608 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1104 | none needed |
| `finish/merchant-ledger-completion-20261124` | `78193fca` | 2026-11-24 02:23:04 -0700 | #607 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1113 | none needed |
| `finish/qr-browser-qualification-20261124` | `73f521ba` | 2026-11-24 02:22:34 -0700 | #605 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1094 | none needed |
| `fix/pos-terminal-reliability-20261124` | `4ae333d3` | 2026-11-24 02:20:44 -0700 | #576 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1099 | none needed |
| `fix/countdown-394-main` | `96d20f77` | 2026-11-24 02:15:25 -0700 | #574 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1117 | none needed |
| `automation/20261124T0524Z/bug/ux-fiat-conversion-output-bound` | `c9ebbdd4` | 2026-11-24 02:15:12 -0700 | #568 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1114 | none needed |
| `finish/fee-quote-completion-20261124` | `02d9b714` | 2026-11-24 02:12:20 -0700 | #601 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1098 | none needed |
| `automation/20261124T0637Z/bug/tron-uri-input-snapshot` | `97cb9859` | 2026-11-24 01:57:27 -0700 | #593 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1148 | none needed |
| `resume/privacy-minimal-typecheck-20261124` | `c8f892f2` | 2026-11-24 01:55:54 -0700 | #600 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1148 | none needed |
| `resume/seller-reconciliation-20261124` | `0c7f680d` | 2026-11-24 01:55:53 -0700 | #599 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1404 | none needed |
| `feat/remaining-sensitive-clipboard-286` | `e68d32d7` | 2026-11-24 01:53:37 -0700 | #580 closed (folded into #668) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1156 | none needed |
| `fix/mobile-588-memo-assertion-20261124` | `a929b178` | 2026-11-24 01:50:19 -0700 | #597 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1150 | none needed |
| `codex/recover-wallet-attempt-status-fixture-20261124` | `534bb380` | 2026-11-24 01:44:49 -0700 | #595 closed (folded into #688) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1133 | none needed |
| `resume/ghostpay-i18n-completeness-20261124` | `7d6d48ef` | 2026-11-24 01:43:29 -0700 | #594 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1152 | none needed |
| `automation/20261124T0837Z/bug/tron-network-absence` | `9fdb87fe` | 2026-11-24 01:39:28 -0700 | none (head: search 0) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1146 | none needed |

## Table 2: UTC edge band (local 2026-11-23, UTC 2026-11-24; 63 branches)

| Branch | Head | Committer date | PR | Ahead / Δpaths | Classification | Evidence | Owner |
|---|---|---|---|---|---|---|---|
| `audit/ghostpay-r41-semantic-backfill-20261122-1400Z` | `d068ffd4` | 2026-11-23 18:05:38 -0700 | #471 open (draft) | 182 / 117 | Owned census docs | R41 semantic backfill (earlier census round) | #471 open (draft) |
| `codex/287-evm-payment-destination-reuse` | `17c5a2ee` | 2026-11-23 23:03:38 -0700 | #584 closed unmerged | 4 / 18 | Superseded | record row #584 C (reuse warnings via #674) | none needed (#584 closed) |
| `codex/287-wallet-request-preview` | `697cb731` | 2026-11-23 23:02:30 -0700 | #589 closed unmerged | 537 / 2014 | Partially superseded; test owned by #632 | record row #589 E: runtime via #677/#679; Permit/approve browser test only in #632 | #632 open |
| `codex/gp-pages-02-retain-suspended-signer` | `23639435` | 2026-11-23 22:37:46 -0700 | #577 closed unmerged | 98 / 230 | Superseded | record row #577 C via #697 | none needed (#577 closed) |
| `codex/invoice-expiry-recovery-devnet` | `e8b0f308` | 2026-11-23 22:28:07 -0700 | none (head: search 0) | 6 / 8 | Abandoned claim, no code | top commit e8b0f308 is an ACTIVE_WORK claim only, stacked on #546 | none (no PR) |
| `codex/offline-interrupted-invoice` | `49862e2d` | 2026-11-23 23:03:44 -0700 | #591 closed unmerged | 2 / 20 | Fully superseded | successor #717 merged; donor cases mapped by #760 | none needed (#591 closed) |
| `codex/spec-03-fiat-price-feeds` | `e9025d72` | 2026-11-23 23:01:07 -0700 | #592 open [HOLD] | 1 / 39 | Held (non-beta reference-rate qualification) | STOP_WORK lists #592 as held | #592 open [HOLD] |
| `feat/create-invoice-link-clipboard-286` | `21b1d68c` | 2026-11-23 19:21:54 -0700 | #549 closed unmerged | 384 / 1277 | Superseded | record row #549 C via #553/#668 | none needed (#549 closed) |
| `feat/f04-dashboard-totals-qualification` | `6366767f` | 2026-11-23 22:38:48 -0700 | #579 closed [ARCHIVED F04] | 13 / 31 | Stopped product (F04) | - | #579 closed [ARCHIVED] |
| `feature/287-receipt-timestamp-retention` | `19a11f90` | 2026-11-23 22:59:42 -0700 | #587 open (draft) | 534 / 2006 | Deferred by owner | #699 owner deferral | #587 open (draft) |
| `feature/f02-ghoststore-catalog-cart` | `974fe2ce` | 2026-11-23 19:26:47 -0700 | #550 closed [ARCHIVED F02] | 2 / 3 | Stopped product (F02) | - | #550 closed [ARCHIVED] |
| `feature/f11-ghostteams-invitation-review` | `10d995fa` | 2026-11-23 19:39:18 -0700 | #552 closed [ARCHIVED F11] | 1 / 3 | Stopped product (F11) | - | #552 closed [ARCHIVED] |
| `feature/f11-ghostteams-membership` | `9229a14c` | 2026-11-23 20:01:37 -0700 | #554 closed [ARCHIVED F11] | 2 / 5 | Stopped product (F11) | - | #554 closed [ARCHIVED] |
| `feature/f11-ghostteams-membership-commit` | `8ade4715` | 2026-11-23 21:13:28 -0700 | #562 closed [ARCHIVED F11] | 4 / 7 | Stopped product (F11) | - | #562 closed [ARCHIVED] |
| `feature/f13-offline-quote-terms` | `7020c7cb` | 2026-11-23 22:19:25 -0700 | #566 closed [ARCHIVED F13] | 1 / 3 | Stopped product (F13) | - | #566 closed [ARCHIVED] |
| `feature/p08-local-history-coverage` | `0419d360` | 2026-11-23 20:36:06 -0700 | #559 open (draft) | 8 / 7 | Owned dormant future module (P08) | hygiene historyCoverage; not imported by web | #559 open (draft) |
| `fix/286-account-vault-privacy` | `63f40efa` | 2026-11-23 23:03:27 -0700 | #571 closed unmerged | 544 / 2004 | Superseded | record row #571 C | none needed (#571 closed) |
| `fix/286-global-mask-document` | `c30283d2` | 2026-11-23 22:58:09 -0700 | #569 open (draft) | 544 / 2015 | Owned; dispositions done on #742 | MASKING_569_DISPOSITIONS_20261127.md on #742 | #569 open (draft) |
| `fix/364-responsive-pages` | `c1980912` | 2026-11-23 22:54:49 -0700 | #583 closed unmerged | 3 / 5 | Superseded (record C) | record row #583 C; earlier census marked its palette/visual remainder held_visual_failures | none needed (#583 closed) |
| `fix/f04-dashboard-refresh-focus` | `3085c87a` | 2026-11-23 19:53:17 -0700 | #543 closed [ARCHIVED F04] | 10 / 28 | Stopped product (F04) | - | #543 closed [ARCHIVED] |
| `fix/pages-offline-session` | `f01c69d2` | 2026-11-23 23:02:27 -0700 | #590 closed unmerged | 3 / 16 | Fully superseded | record row #590 E; its offline remainder went to #717, now merged | none needed (#590 closed) |
| `qa/286-export-notification-verification` | `64411f2c` | 2026-11-23 22:55:27 -0700 | none (head: search 0) | 2 / 1 | Archival CI scaffolding | one-off qualify-286-exports.yml for #570 (merged) | none (no PR) |
| `qa/286-integrated-mask-verification` | `d362c72e` | 2026-11-23 23:06:45 -0700 | none (head: search 0) | 546 / 2015 | Superseded | #372-stack masking QA; masking landed via #708, #569 dispositions on #742 | none (no PR) |
| `qualification/f02-merchant-catalog-auth-provider` | `08faa16e` | 2026-11-23 20:29:43 -0700 | #556 closed [ARCHIVED F02] | 5 / 6 | Stopped product (F02) | - | #556 closed [ARCHIVED] |
| `qualification/p06-existing-role-inventory-20261123` | `d2429260` | 2026-11-23 20:35:46 -0700 | #558 open (draft) | 11 / 7 | Owned dormant future module (P06) | keyRoleInventory unreferenced on main | #558 open (draft) |
| `test/ghostpay-first-sign-after-sleep` | `4b077d2b` | 2026-11-23 19:47:28 -0700 | #544 open (non-draft, base #365 branch) | 96 / 226 | Unique test remainder, owned by stale open PR | 64 fast-check wake schedules (AppShell.idleClock.test.tsx) not on main; docs/handoffs/IDLE_RECOVERY_CORE_20261126.md:68-69 'remain in its original ref and were not imported or run' | #544 open (non-draft), last activity 2026-11-24 06:00Z |
| `test/gp-pages-04-frozen-page-sweep-resume` | `9303aecc` | 2026-11-23 23:06:56 -0700 | #582 closed unmerged | 101 / 227 | Superseded | record row #582 C via #711/#718 | none needed (#582 closed) |
| `test/seller-accepted-late-reorg` | `711168f1` | 2026-11-23 19:55:32 -0700 | #546 closed unmerged | 5 / 8 | Superseded | retryFrom/lateAcceptedAt on main (packages/ux-vault/src/reconciliation-portable.ts:146,1065; apps/web/e2e/core-journey.spec.ts:777 same accepted-late reorg+reload case) via #635 | none needed (#546 closed) |
| `ui/merchant-dashboard-records` | `37a714cf` | 2026-11-23 21:18:56 -0700 | #564 closed [ARCHIVED F04] | 12 / 30 | Stopped product (F04) | - | #564 closed [ARCHIVED] |
| `audit/pages-tor-rpc-compat-20261124` | `20733b6a` | 2026-11-23 22:39:06 -0700 | #578 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1152 | none needed |
| `automation/20261123T1041Z/bug/solana-reference-snapshot` | `7e618aef` | 2026-11-23 21:39:29 -0700 | #507 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1143 | none needed |
| `automation/20261123T1440Z/bug/c1-rpc-input-subgrid` | `ad921a34` | 2026-11-23 21:07:48 -0700 | #512 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1081 | none needed |
| `automation/20261123T2221Z/bug/qr-svg-sparse-matrix` | `5741f0be` | 2026-11-23 21:16:51 -0700 | #525 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1146 | none needed |
| `automation/20261124/bug/merchant-decimal-uint256-roundtrip` | `5f280cab` | 2026-11-23 20:30:04 -0700 | #557 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1162 | none needed |
| `automation/20261124/bug/template-clock-rollback-r11` | `68a4e959` | 2026-11-23 21:28:52 -0700 | #565 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1149 | none needed |
| `automation/20261124/bug/vault-duplicate-group-kind-r11` | `41ddd0f2` | 2026-11-23 18:26:18 -0700 | #538 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1168 | none needed |
| `automation/20261124T0018Z/bug/ux-intake-japanese-script-extensions` | `1f3d230b` | 2026-11-23 17:23:31 -0700 | #536 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1168 | none needed |
| `automation/20261124T0037Z/coordinator/scan-source-rollup` | `ed9dbdb5` | 2026-11-23 17:39:17 -0700 | #537 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1160 | none needed |
| `backup/individual-stealth-keypair-export-20261123-28bba11c` | `28bba11c` | 2026-11-23 22:46:20 -0700 | none (backup ref) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1162 | none needed |
| `codex/286-private-export-surfaces` | `55781533` | 2026-11-23 22:51:11 -0700 | #570 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1147 | none needed |
| `codex/287-local-destination-reuse` | `f024ce3e` | 2026-11-23 23:04:48 -0700 | #586 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1148 | none needed |
| `codex/checkout-rev-l2-durable-preflight` | `d1e167f1` | 2026-11-23 19:17:15 -0700 | #545 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1134 | none needed |
| `codex/ghostpay-pages-manifest-command-20261123` | `e9e9d60d` | 2026-11-23 21:10:25 -0700 | #531 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1149 | none needed |
| `codex/ghostpay-policy-lock-release-20261123` | `ff274a08` | 2026-11-23 17:42:55 -0700 | #528 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1134 | none needed |
| `codex/gp-pages-02-recovery-proof` | `56fb25aa` | 2026-11-23 22:38:49 -0700 | #573 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1166 | none needed |
| `codex/individual-stealth-keypair-export` | `28bba11c` | 2026-11-23 22:46:20 -0700 | #572 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1162 | none needed |
| `codex/pages-follow-browser-language` | `0dd3bcd3` | 2026-11-23 19:41:57 -0700 | #551 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1161 | none needed |
| `codex/qualify-508-invoice-link` | `36a5b4e0` | 2026-11-23 19:31:25 -0700 | #547 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1165 | none needed |
| `codex/qualify-mobile-browser-engines` | `46150f4c` | 2026-11-23 23:10:17 -0700 | #588 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1151 | none needed |
| `codex/seller-keys-file-switch-browser` | `8daebb0f` | 2026-11-23 18:59:21 -0700 | #540 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1169 | none needed |
| `codex/stopped-scan-payment-export-acceptance` | `7bbd651d` | 2026-11-23 19:07:21 -0700 | #542 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1168 | none needed |
| `codex/verify-encrypted-payment-spend` | `2d79881a` | 2026-11-23 21:11:55 -0700 | #560 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1168 | none needed |
| `feature/287-minimal-invoice-sharing` | `b82be893` | 2026-11-23 23:08:01 -0700 | #585 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1149 | none needed |
| `feature/f08-offline-merchant-profile-review` | `923e1edf` | 2026-11-23 21:18:59 -0700 | #563 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1149 | none needed |
| `fix/seller-linked-payment-reconciliation` | `5a225f6c` | 2026-11-23 22:47:51 -0700 | #575 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1405 | none needed |
| `integrate/invoice-clipboard-286` | `068fbc36` | 2026-11-23 19:49:41 -0700 | #553 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1161 | none needed |
| `integration/ghostpay-canonical-array-followup-20261124` | `f0171888` | 2026-11-23 22:19:17 -0700 | #567 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1152 | none needed |
| `integration/ghostpay-package-fixes-20261124` | `01d4007d` | 2026-11-23 21:13:20 -0700 | #561 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1125 | none needed |
| `nodata/determined-allen-x5n560` | `1a7447d5` | 2026-11-23 21:09:31 -0700 | #504 merged | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1061 | none needed |
| `qualification/merchant-ledger-522-current-main` | `3ae56a5e` | 2026-11-23 20:26:18 -0700 | #555 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1161 | none needed |
| `qualification/pr531-main-fee-merge-20261124` | `f8621b33` | 2026-11-23 21:03:59 -0700 | none | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1163 | none needed |
| `test/receipt-print-action-532` | `cb977e4b` | 2026-11-23 20:01:27 -0700 | #548 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1158 | none needed |
| `verify/policy-prompt-two-tabs-20261124` | `f5bc0d6c` | 2026-11-23 19:03:43 -0700 | #541 closed (content on main) | 0 / 0 | Fully merged | head is an ancestor of main (`merge-base --is-ancestor`); behind 1133 | none needed |

## Reproduction

```bash
# window (local-date reading) and UTC edge band
git -C /workspace/GhostPay for-each-ref --sort=-committerdate refs/remotes/origin \
  --format='%(committerdate:iso8601) %(refname:short) %(objectname:short)'
bash /workspace/secondary/a2/analyze.sh        # Table 1 -> summary.tsv + branches/*.txt
bash /workspace/secondary/a2/analyze-edge.sh   # Table 2 -> summary-edge.tsv
python3 /workspace/secondary/a2/gen.py         # tables from summary*.tsv + prmap.py + notes.py
# C1 verification (scratch worktree only)
cd /workspace/scratch/a2-branches/apps/web && npx vitest run src/AppShell.idleClock.test.tsx --coverage=false --maxWorkers=1
```

Files: `/workspace/secondary/a2/{window.txt,window-edge.txt,summary.tsv,summary-edge.tsv,prmap.py,notes.py,branches/}`. The scratch worktree `/workspace/scratch/a2-branches` (detached at `b890a766`) still contains the uncommitted C1 block in `apps/web/src/AppShell.idleClock.test.tsx`. It is reference only and was never pushed.
