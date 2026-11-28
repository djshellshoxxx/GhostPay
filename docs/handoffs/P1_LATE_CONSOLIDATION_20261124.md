# P1-LATE consolidation: recovery checkpoint

Crash-resilient checkpoint for the durable payment recovery and reconciliation task. Update after each milestone.

- Assignment: finish GhostPay durable payment recovery and reconciliation, then consolidate existing branches, qualify
  and merge. Scope is limited to payment-attempt recovery, late-payment and chain-state reconciliation.
- Branch: `claude/p1-late-reconciliation` in the root checkout (a second worktree install would not fit on the disk).
- PR: [#635](https://github.com/djshellshoxxx/GhostPay/pull/635). Base main `c8e131c1`.
- Worker: Claude Code (local). Peer `ghostpay-backup-60` owns the seller-keystore backup stack; the only shared paths
  are additive locale keys, `pages-devnet.spec.ts` and `docs/ai/ACTIVE_WORK.md`.

## Already on main before this branch (#500, `c8e131c1`)

P0-JRNL durable cross-tab wallet-attempt journal and outcome recovery, P0-HASH first-hash integrity (#427→#443, #440's
branch is fully contained), P0-RCPT receipt envelope fixes, REV-L2 durable preflight (#545).

## Recovered into this branch

| Commit | Source | Content |
|---|---|---|
| stack tip `694383f7` | #533 → #546 → #575 → #599 → #625 | Seller late/pending/unverified/invalidated invoice states, explicit accept-late with RPC recheck under CAS, reorg withdrawal that keeps seller decisions, distinct-payment credit, retreating-tip rescan |
| `a828b192` | merge of main `c8e131c1` | `Scan.tsx`: main's `exportRpc` on the scan owner and the stack's `lateReview` state; `ACTIVE_WORK.md` keeps both sides |
| `0c2e4e00` | `4cf0d3bb` from #590 | Receipt hash and status bound to the submitted transaction; unmatched reverted receipt stays `unconfirmed` |

Left out of scope: #591/#604 opt-in invoice-draft recovery and offline controls; #528/#541 policy-lock release.

## Evidence

- Hosted CI on `0c2e4e00`: 40 pass, 0 fail, 4 skipped (deploy, post-deploy smoke, release gates, Graphify; none run on
  pull requests). Includes `ts-test (web)`, `ts-test (rest-0..2)`, `typescript`, `e2e (lean)`, `e2e (full)`,
  `Pages artifact on anvil (browser)`, CLI on ubuntu, macOS and Windows.
- Local: `npm ci --ignore-scripts` succeeded. `npm run build:libs` crashed twice with access violation 0xC0000005 in
  `tsc` (different workspace each time) under Node 26.13.1 on Windows. That is an environment fault, not a type
  error, and no local test result is claimed.

## Independent review and audit (session subagent, read-only, at `0c2e4e00`)

No high or medium findings. Pending, unverified, imported and invalidated evidence is never credited. Accept-late
saves only after a successful recheck under the CAS guard. `lateAcceptedAt` survives reorg invalidation.
Contradictory duplicates fail closed. Receipt hashes are bound to the submitted hash.

| Finding (low) | Disposition | Regression test (fails without fix) |
|---|---|---|
| Invoice card showed another invoice's exact or ambiguous proposal state (`ReconciliationLedger.tsx` `invoiceEvidenceStates`) | Fixed: state shown only on invoices the proposal names; `none` stays "possible payment" | `ReconciliationLedger.invoices.test.tsx` "shows a payment proposed for another invoice only on that invoice" |
| Accept-late recheck ignored a changed saved RPC or privacy route (`Scan.tsx`) | Fixed: shared `assertScanRoute` (same as stealth export) before and after each await; `lateReview` cleared with the scan owner | `Scan.test.tsx` "refuses a late-payment recheck after the saved RPC changes, without contacting the old route" |
| Policy payment showed "(confirmed)" from a receipt alone (`PolicyPay.tsx`) | Fixed: requires `verification === 'verified'` (L2-F3) | `PolicyPay.unverified.test.tsx` |
| Manual link of a record with no block time is credited as on-time | Kept by design: evidence is router-verified and final; the copy routes it to manual review; blocking it would leave the payment unlinkable (reissue/double-pay risk) | — |
| A failed recheck (even a transient RPC error) marks invoice-relevant records at or above that block unverified | Kept by design: fails closed with "Unverified observation. Scan again"; a rescan restores credit | — |

Security pass on the branch diff: no `innerHTML`/`eval`/`Math.random`/console logging, no new egress, dependencies or
workflow changes; secret material only in test fixtures; `bash scripts/scan-secrets.sh` OK.

## Fuzz coverage (seeded fast-check)

- `packages/ux-vault/src/reconciliation-amounts.fuzz.test.ts`: credit equals an independently written rule across
  mixed evidence states, provenance, legacy/on-time/late timing and acceptance (400 runs); noise never changes a summary
  (300); order and repeat delivery invariance (300); contradictory seller decision fails closed (50). Mutation check:
  crediting unaccepted late payments is caught with a minimal counterexample.
- `apps/web/src/lib/walletReceipt.fuzz.test.ts`: hostile `eth_getTransactionReceipt` and `eth_getTransactionByHash`
  answers (1500 runs each) give a typed `UserFacingError` or an answer bound to the submitted hash with binary status;
  both outcomes are asserted reachable. Mutation check: removing the receipt-hash binding is caught.

## Local results (Node 26.13.1, Windows, 4 GB RAM; single worker, no coverage)

- `ux-vault`: typecheck 0, lint 0, reconciliation tests 23/23.
- `apps/web`: typecheck 0, lint 0. Focused suites: see the next section.
- `PolicyView.guard.test.tsx` "fails closed when the attempt journal cannot be read" fails locally at the unchanged
  head `57819c4f` too (passes in hosted CI): local environment, not this change.

## CI flakes found on `fb141fa5` and main `f18e8c0c`

- Main CI failed `ts-test (web)`: an unhandled `ReferenceError: window is not defined` from `WalletAttempts.tsx` (mount-time
  journal migration settling after jsdom teardown). The web tests have no vitest globals, so RTL never auto-unmounts and
  the last mounted component outlives its test. Fixed in this feature's tests: `afterEach(cleanup)` in
  `WalletAttempts.status.test.tsx` and `WalletAttempts.test.tsx` (6/6 locally).
- PR CI failed `ts-test (rest-2)` once: `keystore.test.ts` expects every generated passphrase rated `strong`; the
  generator only redraws refused ones, so a rare draw rates `good` (0 of 100,000 local draws). Owned by the keystore
  backup claim and open #641, so not edited here; job rerun.

## Status

- Done: consolidation, merge with main, payer outcome binding, review fixes, fuzz tests.
- Next: focused web suite result, push, hosted CI, integration lock generation 21, merge #635, verify main, release
  the lock, mark #533/#546/#575/#599/#625 and #590's outcome commit superseded.
- Blockers: none known.
