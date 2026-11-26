# Remaining work

Ranked by fund-safety impact. "Release requirement" = must be done (or explicitly accepted by the owner) before a
Pages beta release. "Future" = not a current release requirement.

## Release requirements

1. ~~Merge PR #500 (M1)~~ Done: `c8e131c1` (2026-11-24).
2. ~~P1-LATE (stack #533→#546→#575)~~ Done: merged via #635 as `aaa71a11` (2026-11-25), consolidating #533→#546→#575→#599→#625.
   Handoff: [`P1_LATE_CONSOLIDATION_20261124.md`](../handoffs/P1_LATE_CONSOLIDATION_20261124.md).
3. ~~P0-KEYS~~ Done on `main` `c7c6349c` (2026-11-26): Spec 18 codec, standalone decoder and single-payment export (#539),
   seller-keystore backup verification and restore (#641, #657), the GhostPay-independent keystore reader (#647), and
   archive export, master backup and in-app recovery (#707, successor of #622, merged by #718). Verified on `c7c6349c`:
   [`milestones/M2-P0-KEYS.md`](milestones/M2-P0-KEYS.md). Still open: Firefox/WebKit/mobile and third-party wallet
   import acceptance. #372 stays open; its red Mythril (10 findings) and Tor browser gates (KEYS-B1) must be
   dispositioned for anything further taken from it.
4. **GP-PAGES-01 (owner decision):** the shared `*.github.io` origin lets sibling pages read, forge or block the
   wallet-attempt journal and lock (now persistent). A custom domain removes it.
5. ~~Close or retarget #450~~ Done: closed as already integrated (2026-11-26). Its commits are in `main` via `8ddb3449`.

Release readiness on `4eb02bb3` (2026-11-26): [`RELEASE_READINESS_20261126.md`](RELEASE_READINESS_20261126.md). Automated
gates pass. Release still needs the owner decisions above, the Mythril gate disposition, exact-SHA Pages-on-anvil and beta
acceptance runs, and manual browser/device passes.

## Follow-ups (not blocking)

- ~~RCPT-L1/L2 in `packages/ux-receipts`~~ (vacuous proxy test; double getter reads): fix commit `752828f6` reached `main` through #690 (`1bea3df3`, 2026-11-25).
- QA-I1: a confirmed in-app reset for a corrupt journal mirror (today: clear site data).
- ~~JRNL-L1 residual~~ (policy withdrawals held the journal lock across their own wallet prompt): fixed on `main` by
  `c6f15cfe` (2026-11-25), see
  [`POLICY_JOURNAL_COMPLETION_20261125_8812.md`](../handoffs/POLICY_JOURNAL_COMPLETION_20261125_8812.md). A new attempt
  still waits at most 20 s for the journal lock and then refuses with a typed error.
- Merchant dashboard F04: stopped by owner directive (2026-11-25, [STOP_WORK](../ai/STOP_WORK_20261125.md)). Not a
  release blocker. Do not continue it.
- Receipt assurance F05 (#323) and recurring invoices F10 (#324): open and not on `main`; the 2026-11-23 snapshot in
  ESSENTIAL_FEATURE_MATRIX lists their missing UI, browser tests and dependencies. #371, which mixes them with F04, is held.

## Future / owner decisions (not current release requirements)

- Real refund authority and execution (P1-REFUND). No refund path exists on the current contracts; it needs an accepted design.
- Policy-account lost-owner recovery (ADR-0028, unaccepted; contract change).
- A different browser, profile or device sharing the duplicate-payment guard. Static hosting cannot provide this
  without a backend.
