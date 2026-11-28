# Essential feature completion matrix

**Status update 2026-11-26 UTC, against `main` `194e225c`:** the Class column of the priority table below is current as of
that commit. Percentages were **not** re-estimated unless a row says otherwise. "Detail" and the rest of this file are the
2026-11-23 snapshot, kept as history; do not read them as the current state of `main`.

Snapshot: 2026-11-23 UTC. `main` = `eb59d93cffed7848c4aac37d0e9650b87239c6da` (no merges since 2026-11-21T06:16Z).
Percentages are **estimates** by the session coordinator from source inspection, not measured coverage.
All other-branch facts come from local `git` comparison of the exact heads below. Where a test count is quoted from a branch
handoff and was not re-run here, it says "reported".

Canonical trackers this file links to instead of duplicating: the P0 audit
[`docs/audits/fund-recovery-and-expiry-safety.md` on PR #455 (`74b9f855`)](https://github.com/djshellshoxxx/GhostPay/blob/74b9f855/docs/audits/fund-recovery-and-expiry-safety.md),
the consolidation ledger [`docs/handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md`](../handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md),
and the branch-disposition ledger on PR #471 (`docs/consolidation/20261123-r57/SEMANTIC_DISPOSITIONS.json` at `5afb4367`).

## Integration lock

Merges into `main` go one at a time under `integration-lock.json` on branch `automation/ghostpay-integration-lock`; read
that file for the current state. The lock protocol forbids acquiring an expired held lock without stop evidence from the
prior owner. The 2026-11-23 snapshot recorded generation 11 as held and expired, which blocked merges at that time. The
lock has been released and reused since (generation 20 for #500, generation 24 for #635).

## Priority ranking

Order: fund loss → recovery of funds/authority → primary payment flow → merchant essentials → privacy/integrity → cost.

| Rank | ID | Feature | Class | Est. % | Fund-safety impact |
|---|---|---|---|---|---|
| 1 | P0-JRNL | Payment attempt durability, cross-tab duplicate prevention, outcome recovery | COMPLETE (merged `c8e131c1`, PR #500) | 95 (open: REV-I5/I6, QA-I1, GP-PAGES-01) | Double payment of one invoice from a 2nd tab or after a crash; lost tracking after reload |
| 2 | P0-HASH | Wallet-attempt first-hash integrity (#427→#443) | COMPLETE (merged via #500, `c8e131c1`) | 100 | Replacement hash could overwrite the first submitted hash |
| 3 | P0-KEYS | Independent payment-key export/restore (#240/#269/#361 → #372) | COMPLETE on `main` `c7c6349c`: single-payment export, standalone decoder, seller-keystore verify/restore, independent keystore reader (#539, #641, #657, #647) and archive/master export with in-app recovery (#707, successor of #622, via #718); verified on `c7c6349c`, see `milestones/M2-P0-KEYS.md` | 100 of the extraction scope (2026-11-26); #372 remainder not taken | Funds unrecoverable without the original browser session |
| 4 | P0-RCPT | Receipt envelope fail-closed fixes (#449→#450→#452) | COMPLETE (merged `8ddb3449`); RCPT-L1/L2 fix `752828f6` merged via #690 | 100 | Malformed RPC envelope accepted as settlement evidence |
| 5 | P1-LATE | Late payment (broadcast before expiry, confirmed after) shown as paid/late, not lost | MERGED (`aaa71a11`, PR #635) | 40 (2026-11-23) | Seller treats a paid invoice as unpaid; payer pays twice |
| 6 | P1-REFUND | Refund authority/execution | MISSING by design (see below) | n/a | — |
| 7 | F04 | Merchant dashboard | STOPPED by owner directive 2026-11-25 ([STOP_WORK](../ai/STOP_WORK_20261125.md)) | 20 (2026-11-23) | Indirect (accounting) |
| 8 | F05 | Receipt assurance | PARTIAL | 25 | Indirect (dispute evidence) |
| 9 | F10 | Recurring invoices | PARTIAL | 35 | Duplicate issuance |
| — | P1-POLICY | Policy-account lost-owner recovery | DEFERRED (unaccepted ADR-0028, contract change) | n/a | Needs owner + contract design decision |

## Detail (2026-11-23 snapshot of `eb59d93`; historical)

### P0-JRNL — payment attempt durability and outcome recovery

- **Main:** `apps/web/src/lib/duplicateAttemptJournal.ts` (blob on `eb59d93`) uses tab-scoped `sessionStorage`;
  `sendViaWallet` writes an `unknown` record before `eth_sendTransaction` and a `submitted` hash after.
  Policy withdrawals (`apps/web/src/features/policy/withdrawalJournal.ts`) already use `localStorage` plus an exclusive
  Web Lock on the same key.
- **Gap (missing functionality, not integration):** no cross-tab or post-crash duplicate block for invoice payments;
  no way to resolve a recorded hash (pending/confirmed/reverted/replaced) after reload or wallet disconnect;
  no replacement-hash linkage. No other branch implements this (all 85 branches touching the journal or
  `WalletAttempts.tsx` were compared; #372 changes only UI reveal gating).
- **Owner:** this session, branch `claude/keen-volta-8ctx9x` (milestone M1). Progress and evidence:
  [ESSENTIAL_FEATURE_PROGRESS.md](ESSENTIAL_FEATURE_PROGRESS.md).
- **Acceptance:** at most one wallet request per invoice across tabs and restarts; hash never lost; RPC-verified status
  with canonical block hash; Pay refuses a second send; unit, fault-injection and anvil browser tests; full web gates.

### P0-HASH — first-hash integrity

- Source: #427 `automation/20261121T2235Z/bug/journal-hash-integrity` `e9404bad` → #440 `2b73dec3` → #441 `3c21b021`
  → #443 `repair/ghostpay-r31-journal-readback-test-typecheck-20261122` `4e1fa095`. Linear on `eb59d93`.
- Evidence: 35/35 hosted checks on `4e1fa095` completed success or skipped (CI run 44987782637 and siblings); local
  rerun here: 8 files / 68 tests passed (journal, wallet journal, WalletAttempts, policy journal/send).
- Disposition: carried into M1 by fast-forward (commits unchanged). Merge blocked only by the lock.

### P0-KEYS — independent key recovery

- Source: #372 `integrate/ghostpay-recovery-privacy-20261121-5ceb` `055d33e0` → #367 `50ccf5c8` → #307 `5a745d4b`;
  donors #240 `38d69832`, #269 `683f8587`, #361 `4ccb3db3`. `apps/web/src/lib/paymentKeyExport.ts` (475 lines) exists only there.
- Size: 2,186 files vs main (+505,914/−3,072, mostly evidence docs; ~12.2k source, ~26.3k test lines).
- Confirmed failures (hosted, reported in #455 and re-checked from job logs there): Mythril job 136771947984 (10 findings,
  artifact 14699233056), Tor browser job 136771948240 (`locator.waitFor` timeout at `scripts/tor/browser-acceptance.mjs:81`).
- Spec 18 extraction (milestone M2, peer session nifty-bohr) is on `main`: #539 (codec, decoder) and #707 (archive, master
  backup, in-app recovery; Worker A commits through `8c7ae937`, merged by #718 as `c7c6349c`). Post-merge verification on
  `c7c6349c`: codec 65/65, web 126/126, recovery scripts 48/48 with anvil, e2e full 2/2 and lean 9/9. Evidence:
  [`milestones/M2-P0-KEYS.md`](milestones/M2-P0-KEYS.md). #372's red gates did not apply (no contract, Tor or hosting-kit
  path in the extraction); they still gate anything further taken from #372.

### P0-RCPT — receipt envelope fixes

- #449 `ff8c800a` → #450 `5aa0194f` → #452 `d0814403`, `packages/ux-receipts/src/verify.ts`. Reported green CI on #450;
  #452 CI unverified. Needs independent review, then lock.

### P1-LATE — late payments

- Main: `packages/merchant-ledger/src/reconcile.ts` computes `latePaymentIds`; `packages/invoice-schema/src/expiry.ts`;
  `GhostPayRouter.sol` enforces only a per-call `deadline` and stores no invoice state.
- Seller web (main `8ddb3449`): registered `fixed_token` invoices join verified, final scan matches in
  `reconciliation-portable.ts` (`candidate` 315-323, `proposeInvoiceMatch` 331-356, `confirmProposal` 845-883). Block time
  at or after `expiresAt` gives ambiguous `late-observation` with no confirm path. Reorgs tombstone records as
  `invalidated-after-reorg` (`invalidateFrom` 961-1036). `merchant-ledger` `reconcile()` is not used by the web app.
- Gaps, worst first (milestone M3, this session):
  1. The invoice card (`ReconciliationLedger.tsx:680-707`) says "No linked observation" for an expired invoice that has
     a late or ambiguous candidate, so the seller may reissue and the payer pay twice.
  2. A payment not yet final shows nothing on the invoice for up to the finality depth (12–250 blocks, engineering defaults).
  3. A late payment cannot be deliberately accepted and linked.
  4. A reorg-invalidated link silently reopens the invoice, with no notice.
- Payer side: an expired invoice with a recorded attempt is handled by the M1 Pay pre-send block.

### P1-REFUND — refund and timeout semantics (what the architecture permits)

| Case | What actually happens | Supported outcome |
|---|---|---|
| Expired, unpaid | No funds moved | Terminal: expired. Pay refuses (`invoice-schema/expiry.ts`, `payExec.ts`) |
| Broadcast before expiry, mined after (GhostPay web payer) | `boundedDeadline` (`apps/web/src/lib/pay.ts:399-402`) caps the router `deadline` at `expiresAt − 1`; the router reverts when `block.timestamp > deadline` (`GhostPayRouter.sol:99`) | Terminal: reverted. No transfer, gas lost. Payer journal keeps the hash so the outcome can be resolved |
| Paid after expiry by a payer who set their own deadline (CLI/other wallet) | Router forwards if that deadline has not passed | Funds arrive. Seller ledger marks the match ambiguous `late-observation` by block time (`packages/ux-vault/src/reconciliation-portable.ts:353`); no automatic refund |
| Paid to seller stealth address | Final transfer to recipient-controlled key | Only a new voluntary transfer by the seller. Browser code cannot reverse it |
| Funds locked in a contract | Router holds nothing (no escrow); forced sends to router are unrecoverable by design | Not applicable |
| Failed/reverted tx | No transfer; gas spent | Terminal: reverted; may retry after explicit clear |
| Refund needing authorization | `packages/merchant-billing/src/refunds.ts` plans only; CLI refuses `execute` | MISSING by design; needs an accepted design |

Automatic refunds are **not implementable** on the current contracts and are not promised.

### F04 merchant dashboard

- #322 `future/f04-merchant-dashboard` `066731b4` → base #371 `consolidate/ghostpay-dormant-modules-1f782-20261121`
  `1de6e024` → #397 `a9f19eb2` (export consent) → #460 `ff60e1e4` (analytics). Code in
  `apps/web/src/features/future/merchant-dashboard/` (model 199, projection 220, select 42, export 188, analytics 169 lines).
- Tests: projection 28, export 8, analytics 8; export/analytics reported as Node stand-ins only.
- Missing: browser route/UI, search/filter screens, chain-evidence source (P03), encrypted persistence (P05), backup,
  cross-tab. Integration: lock; no browser tests.

### F05 receipt assurance

- #323 `future/f05-ghostproof` `ccd1b16d` → #371 → #457 `300c9d21` (docs). `ghostproof/review.ts` 199, `session.ts` 65.
- Tests: review 22, session 9 (reported 67/67 focused). Main already has `invoice-schema` receipts, `ux-receipts`
  verify, `ReceiptPanel`.
- Missing: chain finality (review returns `not-checked`), import UI, external receipt archive; P12 disclosure proof
  BLOCKED (spec only).

### F10 recurring invoices

- #324 `future/f10-private-recurring` `4a48f2f0` → #371 → #391 `20a353d2` (M2) → #396 `7079eedf` (M3) → #456 `9e8a619c` (M4).
  ~1,030 source lines (model, review, lifecycle, prepare, vault, browserVault), 81 tests reported.
- Known failure: M3 hosted lint failed; fixed on M4; M4 CI unverified.
- Missing: signed issuance (P04), delivered/paid states, UI, backup merge, real-browser multi-tab tests.
  The static client cannot run while the browser is closed; nothing may promise that.
