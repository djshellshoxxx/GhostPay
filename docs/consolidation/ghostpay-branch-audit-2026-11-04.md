# GhostPay branch consolidation audit — 2026-11-04

This document records GitHub comparisons to main, not integrated code or executed tests.

| PR | Ahead | Behind | Compared files | Workstream |
|---|---:|---:|---:|---|
| #47 | 330 | 9 | 300+ (truncated) | lean checkout / prior consolidation |
| #52 | 6 | 6 | 3 | parallel QA agents |
| #60 | 337 | 9 | 300+ (truncated) | device pairing / QR |
| #65 | 337 | 9 | 300+ (truncated) | policy account guards |
| #68 | 352 | 9 | 300+ (truncated) | localization / gas buffer |
| #70 | 334 | 9 | 300+ (truncated) | announcer / scan cursor |
| #74 | 339 | 9 | 300+ (truncated) | BTC header chain |
| #78 | 457 | 2 | 300+ (truncated) | existing consolidation branch |
| #79 | 1 | 2 | 4 | agent workflow hardening |
| #81 | 1 | 2 | 4 | cloud engineering checkpoint |

GitHub returned only the first 300 compared files for the large branches; these are not complete file inventories. The high shared divergence strongly suggests overlapping ancestry but does not prove individual patches are present in #78.

## Proposed execution sequence

1. Inspect #78's exact head/base, consolidation ledger, CI and changed-file inventory. Treat it as the existing integration candidate; avoid parallel rewrites.
2. Compare #47 and feature PRs #59–#74 against #78, not just main, to identify missing unique changes. Preserve lean/full profile boundaries and payment verification invariants.
3. Reconcile security-critical payment verification, seller receipts, policy account guards, scanner cursors and BTC chain validation before UX enhancements. Require focused tests for chain, asset, amount, recipient, signer, and consent.
4. Review #60–#63 device pairing, embeds, backup and lean journey; #66–#68 localization; #69–#70 relayer and scan fixes; #73 responsive/a11y. Port only unique verified patches.
5. Keep automation PRs #51/#52/#79/#82 separate from application code consolidation. Validate spending, secrets, task isolation and merge gating before enabling schedules.
6. Consolidate research and docs (#54–#58, #75/#76) by deduplicating source-backed findings and preserving licenses and citations.
7. Run contract, frontend, browser, security and build checks against each integrated slice; retain exact commits, CI links and blocked checks.
8. Only merge the resulting integration branch when required CI and review gates permit. Do not close source PRs based only on apparent duplication.

This audit starts the reconciliation process but does not claim source merges, conflict resolution or successful tests.
