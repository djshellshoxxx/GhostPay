# Future-only GhostPay privacy-first feature catalog

> **FUTURE ONLY — PROPOSALS. NOT APPROVED, NOT SCHEDULED, NOT AN ACTIVE WORKSTREAM, NOT A BETA/RELEASE REQUIREMENT.**
>
> These documents are specifications for possible later privacy enhancements. **No feature implementation, activation, CI requirement, deployment, release or automated work is authorized.** Where the codebase already has a similarly named feature, these proposals describe *additional future privacy scope*, not the status of the existing feature.

## Principles and shared non-negotiable boundaries

1. Client-first, noncustodial, optional integrations. No mandatory GhostPay server, user account, analytics, customer database or remote key custody.
2. Encrypt sensitive local records and backup exports. Never transmit spending keys, viewing keys, signing seeds, private invoice details or contact aliases to RPC, relayers or hosting infrastructure.
3. Independently verify signed invoice intents, chain/network, fees and receipt finality; all external messages and settlement providers are untrusted at the boundary.
4. Disclose observable transaction amounts, payer addresses, timing, router, announcements, gas funding, sweeps, and interactions with relayers/wallet extensions, plus cross-chain and fiat counterparties.
5. Private transport mode is fail-closed; do not silently downgrade or claim Tor, stealth addresses, a fresh address or encryption means absolute on-chain anonymity.
6. All public formats are versioned, bounded, domain-separated, replay-resistant and backwards compatible where possible. New cryptography and real-value contract changes need accepted ADRs, independent vectors and review.
7. No work starts on these proposals without a **new explicit owner instruction**, updated code/PR comparison, scoped security and threat-model review, tests, and separate release authorization.

## Catalog

| No. | Future spec | Status |
|---|---|---|
| 01 | [GhostTips: privacy-first donations and tips](01-ghosttips.md) | **FUTURE ONLY** |
| 02 | [GhostStore: privacy-first static storefronts](02-ghoststore.md) | **FUTURE ONLY** |
| 03 | [Universal private payment links and QR](03-private-payment-links.md) | **FUTURE ONLY** |
| 04 | [Private local merchant dashboard](04-merchant-dashboard.md) | **FUTURE ONLY** |
| 05 | [GhostProof: selective-disclosure payment evidence](05-ghostproof.md) | **FUTURE ONLY** |
| 06 | [Encrypted offline backup and complete recovery](06-encrypted-backups.md) | **FUTURE ONLY** |
| 07 | [GhostPayouts: private multi-recipient payouts](07-ghostpayouts.md) | **FUTURE ONLY** |
| 08 | [GhostID: portable independent merchant identities](08-ghostid.md) | **FUTURE ONLY** |
| 09 | [GhostPOS: private in-person QR checkout](09-ghostpos.md) | **FUTURE ONLY** |
| 10 | [Privacy-first recurring invoices and subscriptions](10-private-recurring.md) | **FUTURE ONLY** |
| 11 | [GhostTeams: encrypted merchant collaboration](11-ghostteams.md) | **FUTURE ONLY** |
| 12 | [GhostBridge: optional private P2P-Offramp handoff](12-ghostbridge.md) | **FUTURE ONLY** |
| 13 | [Optional privacy-aware fiat conversion](13-fiat-conversion.md) | **FUTURE ONLY** |
| 14 | [Privacy-aware multi-chain routing](14-multichain-routing.md) | **FUTURE ONLY** |
| 15 | [Private scanning, RPC and broadcast paths](15-private-rpc.md) | **FUTURE ONLY** |
| 16 | [Per-client payment and invoice identity separation](16-per-client-identities.md) | **FUTURE ONLY** |
| 17 | [Privacy-first sweeping and offline fund management](17-private-funds.md) | **FUTURE ONLY** |
| 18 | [Selectable privacy modes and truthful disclosures](18-privacy-modes.md) | **FUTURE ONLY** |

## Existing work and status

The current code and active PRs take precedence for implementation status. Existing plans include [post-launch concepts](../../POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md), [usability specifications](../../remote/usability/specs/README.md), [privacy limits](../../user/privacy-limits.md), and [technical proposals](../../specs/ideas/README.md). This catalog does **not** change current milestones, existing tests, task queues, merge decisions or active automation scope.
