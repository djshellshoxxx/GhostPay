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

## Status

- Done: consolidation, merge with main, payer outcome binding, hosted qualification.
- In progress: independent review of the stack diff.
- Next: address demonstrated review findings, acquire integration lock generation 21, merge #635, verify the main
  revision, release the lock, mark #533/#546/#575/#599/#625 and #590's outcome commit superseded.
- Blockers: none known.
