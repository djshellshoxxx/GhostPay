# GhostPay 1.0.0-beta.1 — prepared release notes

## Unreleased continuation — 2026-11-19

Draft PR #278 now stages five unique validation/privacy edge-case fixes, the final key-export session-deadline guard and a same-chain manifest freshness repair, with independent regression evidence. Browser fixtures retain their original security/request/download checks; developer lease tooling is selectively recovered. [Current handoff](../engineering-handoffs/continuous-20261119/README.md) governs exact source, verification and unresolved security/deployment requirements. These remain prepared notes: no release/tag/deployment is published.

## Previously prepared release notes

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

**Unpublished draft; not a release announcement.** Root and web application metadata are 1.0.0-beta.1. The proposed tag follows the existing `v1.0.0-beta.1` convention; no tag or Release has been created.

## Intended first milestone

A static, lean EVM demonstration with payments disabled. It provides browser-local seller keys, authenticated exports, encrypted backup, exact downloaded-file verification, restore, signed invoice creation/viewing and public help. No GhostPay-operated backend, account, database or relayer service is required. Testnet payment activation is a separate gated milestone; Pages mainnet stays disabled.

## Consolidated changes

- Retain reviewed recovery, sleep-aware sessions, private checkpoints and current authorization behavior from the #262/#270 lineage.
- Recover #269's fresh export-specific permission after authentication, original endpoint binding and scan/checkpoint cancellation corrections.
- Integrate #272's balance/quote lifecycle without losing network grants, destination history limits or uncertain-transaction recovery.
- Revoke obsolete review authority before key derivation, signing and transport; require explicit consent to the exact fresh native balance.
- Add native fee preparation and a separate one-use confirmation, with exact destination, gas/fee/reserve/net display, bounded expiry, replacement identity and fresh final transaction checks.
- Guard native manifest requests against review expiry, including errors returned after expiry.
- Reject invalid/rolled-back network-authority clocks and retain #274's monotonic invoice expiry.
- Preserve #276/#277 artifact verification with checked-byte, file-identity and invalid-UTF-8 protections.
- Strengthen strict analyzer completeness/evidence handling without accepting or suppressing findings.
- Preserve #275's actual-Anvil negative fixture and #279's rejection of lossy malformed-Unicode multipart QR input.
- Correct six complete-lint diagnostics without removing assertions, rules or coverage thresholds; update the sweep guide to match implemented review behavior.

## Security and privacy limitations

A backup is recoverable only after its actual bytes are verified; initiating a download is insufficient. Preserve the formats needed for keys, separate invoice-signing identity and history. JavaScript cannot guarantee erasure of every secret copy. Stealth addresses reduce routine address reuse but do not provide complete anonymity: RPC requests, public chain activity, destination reuse, gas funding and timing remain observable.

The demonstration cannot move funds. Testnet payments use test assets only after signed-manifest and acceptance gates. Native sweeping is the primary acceptance target; ERC-20 requires native gas and separate qualification. Optional relayer-client code does not imply a provided or mandatory GhostPay service. Tor reachability and final browser/platform acceptance are not established.

## Release record

| Item | State |
| --- | --- |
| Source | Candidate history and PUBLICATION_MAP identify exact implementation/publication trees |
| Pages archive / inventory | Pending final candidate build, integrity and reproducibility record |
| Test qualification | Fresh scoped results and failed/unexecuted checks in TEST_RESULTS; not full acceptance |
| Security findings | Historical analyzer/hosted/external gates remain open; see SECURITY_AUDIT |
| Live deployment | None performed by this lane |
| Tag/GitHub Release | Not created; all required conditions must pass first |

See [blockers](RELEASE_BLOCKERS.md), [deployment decisions](DEPLOYMENT_READINESS.md), [user guide](../user/README.md), [recovery](../user/recover-stealth-payment-keys.md) and [developer guide](../developer/README.md). Do not distribute this draft as a verified payments-enabled beta.
