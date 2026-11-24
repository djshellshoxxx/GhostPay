# Essential feature progress

One entry per milestone. Evidence: [REGRESSION_RESULTS.md](REGRESSION_RESULTS.md). Findings:
[SECURITY_FINDINGS.md](SECURITY_FINDINGS.md). Merges: [FEATURE_INTEGRATION_LOG.md](FEATURE_INTEGRATION_LOG.md).

## M1 — P0 durable cross-tab wallet-attempt journal and outcome recovery (PR #500)

- **Problem:** the invoice-payment journal was tab-scoped `sessionStorage`. A second tab, or a tab reopened after a crash,
  had an empty journal and could ask the wallet to pay the same invoice again. A recorded hash could not be resolved after
  reload or wallet disconnect (REC-P1-03, PR #455).
- **Recovered code (provenance kept, not rewritten):** #427 `e9404bad` → #440 `2b73dec3` → #441 `3c21b021` → #443
  `4e1fa095` (first-hash integrity, typed hash guard, read-back regressions), fast-forwarded.
- **New functionality:**
  - One journal per browser profile: an IndexedDB readwrite snapshot (`ghostpay-wallet-attempt-journal`) is
    authoritative, mirrored to `localStorage` key `ghostpay.wallet-attempts.v1` (shared with policy withdrawals), and all
    tabs serialize on the existing Web Lock `ghostpay:durable-wallet-attempts:v1`. Session-scoped records migrate once.
  - Order of a send: lock → final authority check → `unknown` record committed to IndexedDB → synchronous authority check
    → provider call. The lock is released before the wallet prompt. The returned hash is recorded under the lock again.
  - Records gain an optional call digest, observed nonce and user-linked replacement hashes. No calldata, amounts,
    invoice content or keys are stored.
  - `attemptStatus.ts`: RPC resolution of a recorded hash (pending, confirmed with canonical block hash, reverted,
    mismatch, replaced, nonce consumed, RPC error). Replacement hashes are verified (same sender and nonce) before they are stored.
  - WalletAttempts lists records from every tab live, checks status on a configured RPC and links replacements. Pay refuses a
    second send for a recorded invoice before the wallet is asked.
  - Fail-closed paths: missing Web Locks, missing IndexedDB, corrupt/oversize journal, storage quota, a wait of more
    than 20 s for the lock before a new request, IndexedDB open over 10 s. A returned hash is surfaced to the caller
    within 10 s even while another tab holds the lock (`WalletBroadcastError`). The write that records it waits for the
    lock without a time limit, so it lands once the lock frees, as long as this tab stays open. Closing the tab first leaves
    an `unknown` record that still blocks a repeat send.
- **Contributors:** this session (lead, Workers A/B/C/F) and commits `b9141125`, `b29ef7bc`, `3776d9bc`, `25005c51` pushed to
  the same branch from the owner's account by another agent. Those commits are kept, and the session reviewed them.
- **Not covered:** a different browser, profile or device; a private window; the opt-in embedded-iframe checkout
  (`VITE_EMBED_IFRAME`), whose storage and locks are partitioned from a top-level tab; site data cleared by the user; a
  payment made outside GhostPay. These are documented in the privacy docs and the user guide.
- **Status:** implementation complete on branch. Full web gates and anvil browser suite: see REGRESSION_RESULTS.
  Merge pending exact-head hosted CI.

## M3 — P1-LATE seller late-payment and reorg-safe invoice status (next)

- Scope and gaps pinned in [ESSENTIAL_FEATURE_MATRIX.md](ESSENTIAL_FEATURE_MATRIX.md) §P1-LATE. It starts after #500
  merges, because both touch `apps/web/locales/*`.

## Peer milestones (another Claude session, same owner)

- M2 P0-KEYS (branch `claude/nifty-bohr-5ra2ap`) and M4-DORM371 (`claude/nifty-bohr-5ra2ap-dormant-371`). Evidence goes in
  `docs/engineering/milestones/` on those branches.
