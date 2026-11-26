# Remaining work

Ranked by fund-safety impact. "Release requirement" = must be done (or explicitly accepted by the owner) before a
Pages beta release. "Future" = not a current release requirement.

## Release requirements

1. ~~Merge PR #500 (M1)~~ Done: `c8e131c1` (2026-11-24).
2. **P1-LATE (stack #533→#546→#575, another agent; this session reviews and qualifies it):** the seller invoice card must show late/ambiguous candidates, pending-not-final payments
   and reorg-invalidated links instead of "No linked observation"; deliberate "accept late payment" with re-check under
   CAS. Plan: ESSENTIAL_FEATURE_MATRIX §P1-LATE.
3. **P0-KEYS (peer session, `claude/nifty-bohr-5ra2ap`):** independent payment-key export/restore extracted from #372;
   #372's red Mythril (10 findings) and Tor browser gates must be dispositioned for whatever is extracted.
4. **GP-PAGES-01 (owner decision):** the shared `*.github.io` origin lets sibling pages read, forge or block the
   wallet-attempt journal and lock (now persistent). A custom domain removes it.
5. **Close or retarget #450.** Its commits are in `main` via `8ddb3449`. It stays open only because its base was #449's branch.

## Follow-ups (not blocking)

- RCPT-L1/L2 in `packages/ux-receipts` (vacuous proxy test; double getter reads): fixed on the FC-04 branch (commit 752828f6, `verify.accessor-boundary.test.ts`), pending integration. The package has no app consumer yet.
- QA-I1: a confirmed in-app reset for a corrupt journal mirror (today: clear site data).
- JRNL-L1 residual: policy withdrawals still hold the journal lock across their own wallet prompt. Payments now
  wait at most 20 s and then refuse with a typed error.
- Merchant dashboard F04, receipt assurance F05, recurring invoices F10: dormant modules on #371 stacks. The peer
  session is qualifying the #371 base (M4-DORM371); each feature still lacks UI, browser tests and its missing
  dependencies (see ESSENTIAL_FEATURE_MATRIX).

## Future / owner decisions (not current release requirements)

- Real refund authority and execution (P1-REFUND). No refund path exists on the current contracts; it needs an accepted design.
- Policy-account lost-owner recovery (ADR-0028, unaccepted; contract change).
- A different browser, profile or device sharing the duplicate-payment guard. Static hosting cannot provide this
  without a backend.
