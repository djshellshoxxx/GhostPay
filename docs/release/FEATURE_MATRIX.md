# GhostPay 1.0 Beta feature matrix

Checkpoint: 2026-11-19. Candidate branch: `release/ghostpay-beta-qualification-20261119`. Candidate: `73124433c08c8ef6835f11d03709060c6eea7a3f`. Product checkpoint: `35978ab796b7c476eb35dd9ed634ca4ff86ff9b9`; the candidate also includes the current main audit record, a test-only serialized-transaction typing correction, the independently reviewed Pages artifact verifier, and documentation updates; current `main` is `c977b5d6723f6822c3b5d86cd6b231712c53c395`.

**Both release milestones are BLOCKED.** Source availability, focused regression results, complete candidate qualification and published acceptance are separate columns of evidence. This document does not certify an unexecuted workflow.

## Lean EVM scope

The product remains a static, non-custodial browser application. Users choose network endpoints and authorize network, secret-export, signing and broadcast operations. The demonstration must have no authenticated deployment manifests and must disable payments, scanning and sweeping. Mainnet remains forbidden for Pages. Bitcoin, Solana, TRON, policy accounts, confidential pools and server/relayer services remain preserved development work outside this release. Existing optional user-configured relayer client code is not a required GhostPay service.

| Workflow | Source and consolidation state | Evidence available | Remaining acceptance |
| --- | --- | --- | --- |
| Seller keys and encrypted backup | Existing key generation, authenticated export, import, encrypted backup and exact downloaded-file verification retained | Recovery implementations from the #238/#240 consolidation; current source references below | Exact-candidate browser generation, wrong password/file/account, interruption, refresh and restart |
| Independent master/payment-key recovery | Spec 18 formats and standalone decoder retained; #269 recovered with fresh export-specific network authorization | Export/scanning selection: 300 passing cases on recorded worker source; includes independent codec recovery, credentials and scope failures | Reproduce from exported bytes outside the original browser; verify signing-identity backup separately |
| Session lifecycle | Sleep-aware expiry, rollback checks, revocation and recovery-aware locking retained | Existing authority suites plus new network clock file: 106 passing cases; entry-session regression reproduced and repaired | Real suspension/restart/cross-tab acceptance on the final candidate |
| Invoice creation and review | Existing signed canonical invoices, links and QR flow retained; #270 array validation and #274 monotonic wait expiry included | Jitter: original 13-case suite passed; independent 34-case probe retained | Browser create/open/expiry, malformed invoices, signer trust and QR interaction |
| Buyer payment | Existing explicit wallet/network review, transaction checks and pending-state handling retained | Historical source evidence only for the complete buyer journey | Final-source local-chain browser payment, duplicate prevention, failed/uncertain/reload paths; real testnet later |
| Private scanning and reconciliation | Private checkpoints and encrypted discovery retained; #269 checkpoint selection/cancellation fixes; #270 rejects unsupported scanner schemes | Affected 300-case selection includes scan client, lifecycle and checkpoint tests; final fixture rerun: 20 passed | Bounded resume, reorg/evidence failures, independent receipt association and browser restart acceptance |
| Receipts | Seller-signed receipt flow and privacy defaults retained | Existing source and user guides | Finalized transaction association and browser receipt verification |
| Direct native sweep | #272 semantically merged with existing endpoint grants and destination ledger; helper review/session guards and exact native balance consent added | Component 71 passed after entry fix; helper/destination selection 131 passed; independent focused reruns | Explicit gas/fee review remains a product gap; final-chain browser journey and failure recovery |
| ERC-20 sweeping | Source retained; one-time address requires native gas | No full release acceptance claimed | Separate funded-gas acceptance; do not advertise as qualified native-sweep equivalent |
| Static Pages and help | Lean build, manifest refusal, banner, CSP/artifact checks and guides retained | Existing tooling; current build and exact artifact qualification tracked in TEST_RESULTS | Complete /GhostPay/ build, inventory/hashes, browser/accessibility and deployment smoke |
| Origin and release authority | ADR-0029 remains Proposed; dedicated-origin decision remains open | Source gate and hosting policy inspected | Owner decision, exact-source CI, signing/hosting configuration and external review |

A downloaded backup is not a verified backup. Verification must decrypt the actual file and compare its keys without replacing loaded keys. A master stealth-key export or per-payment export also does not automatically preserve every invoice-signing identity or application-history record; follow the distinct formats and restore procedures.

## What the numbers mean

Ten user-facing families above have existing source, and the ERC-20 row states a separate unqualified boundary. That inventory is not a feature-completion percentage. No full final-source browser acceptance run has completed in this environment: **0 of the 12 required end-to-end scenarios are verified here (0%)**. Chromium failed during process startup before assertions; this says nothing about whether those flows would pass in a supported browser environment.

For both demonstration and testnet beta, an overall readiness percentage is withheld because mandatory gates remain unsatisfied. The governing verdict is **BLOCKED**; see [RELEASE_BLOCKERS.md](RELEASE_BLOCKERS.md).

## User and developer guides

- [User guide](../user/README.md), [seller setup](../user/set-up-stealth-meta-address.md), [session security](../user/session-security.md).
- [Backup and independent payment-key recovery](../user/recover-stealth-payment-keys.md), [Spec 18](../specs/18-stealth-keypair-export.md), [portable formats](../specs/18-stealth-keypair-export-formats.md), [standalone recovery decoder](../../scripts/recovery/stealth-export-recover.mjs).
- [Buyer review and payment](../user/review-and-pay-an-invoice.md), [receive and scan](../user/receive-and-scan.md), [sweep and gas privacy](../user/sweep-and-gas-privacy.md).
- [Privacy limits](../user/privacy-limits.md), [seller privacy](../user/seller-privacy.md), [invoice signer pins](../user/invoice-signer-pins.md).
- [Developer guide](../developer/README.md), [security model](../developer/security-model.md), [Pages build/deployment guide](../pages/README.md).

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
