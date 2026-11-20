> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# Browser qualification source review

Status: complete. `qualification-review.json` records 61 exact path/blob dispositions: 56 complete source reads, one structural fixture read and four inactive-feature exclusions. No browser, test runner, wallet, transaction or reproduction was executed.

Coverage includes the core and Pages devnet journeys, browser mock services, recovery/export, invoice signer verification, scan/network authorization, reconciliation, idle locking, pairing and wallet-attempt recovery. Differing versions were read fully or through complete deltas against fully read bases. Dedicated BTC and standalone iframe suites remain outside EVM Pages scope; mixed core journeys were read in full.

## ROOT-Q01 — Pages devnet qualification omits its canonical ERC-20 checkout path

Informational, known qualification gap. `apps/web/e2e/pages-devnet.spec.ts` explains that the harness deploys different test tokens from the compile-time allowlist, so supported canonical ERC-20 checkout is not exercised. The same test separately asserts that gas-buffer policy is intentionally unavailable in lean because it requires invoice v2; this is a profile restriction, not a missing required lean feature. Unit tests and mocked token journeys exist. This is an end-to-end acceptance gap, not evidence that production token payment fails.

Future qualification should use mutually consistent deployed tokens, allowlists and signed manifests and verify supported token checkout. Record exact source/artifact identities and report any skipped scenario separately from a pass. This audit did not run or construct that scenario.

## Corrections and boundaries

- PS2-01 must not claim an absent route test: Pay route and core browser flow source already assert journal clear/retry. Those assertions were read, not run. The production caller omission still requires reconciliation.
- Settings persistence tests do not prove production Scan consumes same-tab ephemeral settings. SCAN-NET-02 is separately traced through the production caller chain.
- Ordinary receipt fixtures and a separate ledger timestamp bound do not close CUSTODY-02's receipt issue-time Date bound.
- Clock-control tests model events and elapsed time; source inspection does not qualify physical sleep, BFCache, external wallets or Tor Browser.
- Fixture signing keys and manifests do not establish deployment trust-root approval or live chain state.

The consolidated coverage ledger supersedes intermediate inventories. Historical execution claims remain attributed to their original repository reports, not this audit.
