# Essential feature completion matrix

Snapshot: 2026-11-23 UTC. `main` = `eb59d93cffed7848c4aac37d0e9650b87239c6da` (no merges since 2026-11-21T06:16Z).
Percentages are **estimates** by the session coordinator from source inspection, not measured coverage.
All other-branch facts come from local `git` comparison of the exact heads below. Where a test count is quoted from a branch
handoff and was not re-run here, it says "reported".

Canonical trackers this file links to instead of duplicating: the P0 audit
[`docs/audits/fund-recovery-and-expiry-safety.md` on PR #455 (`74b9f855`)](https://github.com/djshellshoxxx/GhostPay/blob/74b9f855/docs/audits/fund-recovery-and-expiry-safety.md),
the consolidation ledger [`docs/handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md`](../handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md),
and the branch-disposition ledger on PR #471 (`docs/consolidation/20261123-r57/SEMANTIC_DISPOSITIONS.json` at `5afb4367`).

## Integration lock (governs every "merge readiness" cell)

`automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: status `held`, generation 11, owner
`994a0d214fb9-root-r3`, `expires_at` 2026-11-21T00:16:57Z. The lock protocol forbids acquiring an expired held lock
without stop evidence from the prior owner. One earlier expiry-only takeover (generation 12, coordinator `5ceb`) was
reverted. The R57 ledger records `takeoverPermitted=false`, `mainMergeAuthorized=false`. **A merge into `main` needs the
repository owner to release or reassign the lock.** This session does not take it over.

## Priority ranking

Order: fund loss → recovery of funds/authority → primary payment flow → merchant essentials → privacy/integrity → cost.

| Rank | ID | Feature | Class | Est. % | Fund-safety impact |
|---|---|---|---|---|---|
| 1 | P0-JRNL | Payment attempt durability, cross-tab duplicate prevention, outcome recovery | PARTIAL → in progress (M1) | 45 → see progress | Double payment of one invoice from a 2nd tab or after a crash; lost tracking after reload |
| 2 | P0-HASH | Wallet-attempt first-hash integrity (#427→#443) | COMPLETE on branch, BLOCKED (lock) | 95 | Replacement hash could overwrite the first submitted hash |
| 3 | P0-KEYS | Independent payment-key export/restore (#240/#269/#361 → #372) | BLOCKED | 75 | Funds unrecoverable without the original browser session |
| 4 | P0-RCPT | Receipt envelope fail-closed fixes (#449→#450→#452) | COMPLETE on branch, unreviewed | 90 | Malformed RPC envelope accepted as settlement evidence |
| 5 | P1-LATE | Late payment (broadcast before expiry, confirmed after) shown as paid/late, not lost | PARTIAL | 40 | Seller treats a paid invoice as unpaid; payer pays twice |
| 6 | P1-REFUND | Refund authority/execution | MISSING by design (see below) | n/a | — |
| 7 | F04 | Merchant dashboard | PARTIAL | 20 | Indirect (accounting) |
| 8 | F05 | Receipt assurance | PARTIAL | 25 | Indirect (dispute evidence) |
| 9 | F10 | Recurring invoices | PARTIAL | 35 | Duplicate issuance |
| — | P1-POLICY | Policy-account lost-owner recovery | DEFERRED (unaccepted ADR-0028, contract change) | n/a | Needs owner + contract design decision |

## Detail

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
- Class BLOCKED: code present, red gates and lock. Integration owned by the lock holder.

### P0-RCPT — receipt envelope fixes

- #449 `ff8c800a` → #450 `5aa0194f` → #452 `d0814403`, `packages/ux-receipts/src/verify.ts`. Reported green CI on #450;
  #452 CI unverified. Needs independent review, then lock.

### P1-LATE — late payments

- Main: `packages/merchant-ledger/src/reconcile.ts` computes `latePaymentIds`; `packages/invoice-schema/src/expiry.ts`;
  `GhostPayRouter.sol` enforces only a per-call `deadline` and stores no invoice state.
- Gap: payer side shows "expired" for an invoice whose recorded payment may still mine (addressed in M1 Pay pre-send
  block); seller web integration of late classification across reorgs is unverified (next milestone candidate).

### P1-REFUND — refund and timeout semantics (what the architecture permits)

| Case | What actually happens | Supported outcome |
|---|---|---|
| Expired, unpaid | No funds moved | Terminal: expired. Pay refuses (`invoice-schema/expiry.ts`, `payExec.ts`) |
| Broadcast before expiry, mined after | Router forwards funds at inclusion if call `deadline` not passed | Paid-late. Payer keeps hash; seller reconciles as late. No automatic refund |
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
