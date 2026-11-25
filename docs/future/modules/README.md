# GhostPay modular future-feature specifications

> **Owner stop-work status (2026-11-25) — read first.** The owner directive in [`AGENTS.md`](../../../AGENTS.md)
> overrides this 2026-11-19 catalog. Archived (permanent stop work): **F01, F09, F13**. Deferred and excluded from beta and
> v1.0: **F02, F04, F08, F11, F12, F14**. The separate original **P07** exclusion also stands. None of these ten may be
> implemented, revived, merged as feature work, enabled or counted as outstanding release work. Shared-core privacy
> mechanisms stay in scope as `AGENTS.md` describes. The stop-work record is `docs/ai/STOP_WORK_20261125.md` (added by
> PR #667; until it merges, `AGENTS.md` is authoritative).
>
> **IDs here are the original module IDs of this catalog**, not the conversational inventory IDs used in the owner's
> clarification. For example, this catalog's **P14 is "Non-custodial shielded payment research"**. The in-scope
> conversational P14, RPC provider disclosure, is a different item. Do not map one numbering onto the other.

**40 independent feature branches; specifications only.** Prepared 2026-11-19 from source commit c977b5d6723f6822c3b5d86cd6b231712c53c395. Application sources are identical across these branches. A shared documentation foundation supplies this map and common contracts; each future branch adds its own specification and ownership claim. The index branch also collects all 40 specs for one-place review.

The owner requested branch/spec creation. Implementation, pricing, payment activation, release and deployment remain separate decisions. See [shared contracts](COMMON.md), [source traceability](SOURCES.md), and [machine-readable catalog](modules.json).

## Why 40 modules?

The 18 product proposals become F01–F18. Privacy Suite P01–P18 and its gateway addendum become P01–P19. Issue #288 supplies T01/T02; FEE01 owns their shared pricing/consent. Architecture 5a–5l maps into these modules. **5k is existing spec 18 and is not duplicated.**

Product/provider pairs have distinct ownership: F05 is the GhostProof journey, P12 its proof provider; F06 is backup orchestration, P05 owns persistence; F15 is configuration, P02/P03/P10 own network policy, scanning and submission. T01 executes transfers while P11 validates timing policy. FEE01 prices/authorizes; P17 settles private fee outputs; P19 operates an optional service.

## Branch and specification index

### Product workflows

| ID | Specification | Branch | Hard dependencies |
|---|---|---|---|
| F01 | [GhostTips private donations and tips](https://github.com/djshellshoxxx/GhostPay/blob/future/f01-ghosttips/docs/future/modules/F01-ghosttips/SPEC.md) | [future/f01-ghosttips](https://github.com/djshellshoxxx/GhostPay/tree/future/f01-ghosttips) | F03, P05 |
| F02 | [GhostStore static private storefronts](https://github.com/djshellshoxxx/GhostPay/blob/future/f02-ghoststore/docs/future/modules/F02-ghoststore/SPEC.md) | [future/f02-ghoststore](https://github.com/djshellshoxxx/GhostPay/tree/future/f02-ghoststore) | F03, F08, P05 |
| F03 | [Private payment links and QR exchange](https://github.com/djshellshoxxx/GhostPay/blob/future/f03-private-payment-links-spec/docs/future/modules/F03-private-payment-links/SPEC.md) | [future/f03-private-payment-links-spec](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec) | P04 |
| F04 | [Private local merchant dashboard](https://github.com/djshellshoxxx/GhostPay/blob/future/f04-merchant-dashboard/docs/future/modules/F04-merchant-dashboard/SPEC.md) | [future/f04-merchant-dashboard](https://github.com/djshellshoxxx/GhostPay/tree/future/f04-merchant-dashboard) | P05, P03 |
| F05 | [GhostProof selective-disclosure evidence workflow](https://github.com/djshellshoxxx/GhostPay/blob/future/f05-ghostproof/docs/future/modules/F05-ghostproof/SPEC.md) | [future/f05-ghostproof](https://github.com/djshellshoxxx/GhostPay/tree/future/f05-ghostproof) | P12, P05 |
| F06 | [Encrypted backup and independent recovery workflow](https://github.com/djshellshoxxx/GhostPay/blob/future/f06-encrypted-backups/docs/future/modules/F06-encrypted-backups/SPEC.md) | [future/f06-encrypted-backups](https://github.com/djshellshoxxx/GhostPay/tree/future/f06-encrypted-backups) | P05, P06 |
| F07 | [GhostPayouts private multi-recipient payouts](https://github.com/djshellshoxxx/GhostPay/blob/future/f07-ghostpayouts/docs/future/modules/F07-ghostpayouts/SPEC.md) | [future/f07-ghostpayouts](https://github.com/djshellshoxxx/GhostPay/tree/future/f07-ghostpayouts) | P05, P06, FEE01 |
| F08 | [GhostID independent merchant identities](https://github.com/djshellshoxxx/GhostPay/blob/future/f08-ghostid/docs/future/modules/F08-ghostid/SPEC.md) | [future/f08-ghostid](https://github.com/djshellshoxxx/GhostPay/tree/future/f08-ghostid) | P06, P05 |
| F09 | [GhostPOS private in-person checkout](https://github.com/djshellshoxxx/GhostPay/blob/future/f09-ghostpos/docs/future/modules/F09-ghostpos/SPEC.md) | [future/f09-ghostpos](https://github.com/djshellshoxxx/GhostPay/tree/future/f09-ghostpos) | F03, P03, P05 |
| F10 | [Private recurring invoices and subscriptions](https://github.com/djshellshoxxx/GhostPay/blob/future/f10-private-recurring/docs/future/modules/F10-private-recurring/SPEC.md) | [future/f10-private-recurring](https://github.com/djshellshoxxx/GhostPay/tree/future/f10-private-recurring) | P04, P05 |
| F11 | [GhostTeams encrypted merchant collaboration](https://github.com/djshellshoxxx/GhostPay/blob/future/f11-ghostteams/docs/future/modules/F11-ghostteams/SPEC.md) | [future/f11-ghostteams](https://github.com/djshellshoxxx/GhostPay/tree/future/f11-ghostteams) | P05, P06 |
| F12 | [GhostBridge optional P2P-Offramp handoff](https://github.com/djshellshoxxx/GhostPay/blob/future/f12-ghostbridge/docs/future/modules/F12-ghostbridge/SPEC.md) | [future/f12-ghostbridge](https://github.com/djshellshoxxx/GhostPay/tree/future/f12-ghostbridge) | P04, P06 |
| F13 | [Privacy-aware optional fiat conversion](https://github.com/djshellshoxxx/GhostPay/blob/future/f13-fiat-conversion/docs/future/modules/F13-fiat-conversion/SPEC.md) | [future/f13-fiat-conversion](https://github.com/djshellshoxxx/GhostPay/tree/future/f13-fiat-conversion) | P02, P11 |
| F14 | [Privacy-aware multi-chain route comparison](https://github.com/djshellshoxxx/GhostPay/blob/future/f14-multichain-routing/docs/future/modules/F14-multichain-routing/SPEC.md) | [future/f14-multichain-routing](https://github.com/djshellshoxxx/GhostPay/tree/future/f14-multichain-routing) | P02, P08, FEE01 |
| F15 | [Private RPC and scanning configuration workflow](https://github.com/djshellshoxxx/GhostPay/blob/future/f15-private-rpc/docs/future/modules/F15-private-rpc/SPEC.md) | [future/f15-private-rpc](https://github.com/djshellshoxxx/GhostPay/tree/future/f15-private-rpc) | P02, P03, P10 |
| F16 | [Per-client payment identity separation](https://github.com/djshellshoxxx/GhostPay/blob/future/f16-per-client-identities/docs/future/modules/F16-per-client-identities/SPEC.md) | [future/f16-per-client-identities](https://github.com/djshellshoxxx/GhostPay/tree/future/f16-per-client-identities) | P06, P05 |
| F17 | [Private sweeping and offline fund management](https://github.com/djshellshoxxx/GhostPay/blob/future/f17-private-funds/docs/future/modules/F17-private-funds/SPEC.md) | [future/f17-private-funds](https://github.com/djshellshoxxx/GhostPay/tree/future/f17-private-funds) | P05, P06, P08 |
| F18 | [Editable privacy presets and capability selection](https://github.com/djshellshoxxx/GhostPay/blob/future/f18-privacy-modes/docs/future/modules/F18-privacy-modes/SPEC.md) | [future/f18-privacy-modes](https://github.com/djshellshoxxx/GhostPay/tree/future/f18-privacy-modes) | P11, FEE01, P18 |

### Privacy platform providers

| ID | Specification | Branch | Hard dependencies |
|---|---|---|---|
| P01 | [HTTPS and Tor-compatible static hosting](https://github.com/djshellshoxxx/GhostPay/blob/future/p01-tor-onion-hosting/docs/future/modules/P01-tor-onion-hosting/SPEC.md) | [future/p01-tor-onion-hosting](https://github.com/djshellshoxxx/GhostPay/tree/future/p01-tor-onion-hosting) | P18 |
| P02 | [User-selected RPC policy and consent enforcement](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md) | [future/p02-rpc-policy](https://github.com/djshellshoxxx/GhostPay/tree/future/p02-rpc-policy) | Existing core only |
| P03 | [Local stealth discovery and private retrieval](https://github.com/djshellshoxxx/GhostPay/blob/future/p03-local-stealth-scanning/docs/future/modules/P03-local-stealth-scanning/SPEC.md) | [future/p03-local-stealth-scanning](https://github.com/djshellshoxxx/GhostPay/tree/future/p03-local-stealth-scanning) | P02, P06 |
| P04 | [Encrypted authenticated offline invoices](https://github.com/djshellshoxxx/GhostPay/blob/future/p04-encrypted-offline-invoices/docs/future/modules/P04-encrypted-offline-invoices/SPEC.md) | [future/p04-encrypted-offline-invoices](https://github.com/djshellshoxxx/GhostPay/tree/future/p04-encrypted-offline-invoices) | P06, P11 |
| P05 | [Encrypted local state and recovery primitives](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md) | [future/p05-encrypted-local-state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state) | P06 |
| P06 | [Independent key roles and scoped delegation](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) | [future/p06-key-role-separation](https://github.com/djshellshoxxx/GhostPay/tree/future/p06-key-role-separation) | Existing core only |
| P07 | [Optional encrypted device synchronization](https://github.com/djshellshoxxx/GhostPay/blob/future/p07-encrypted-device-sync/docs/future/modules/P07-encrypted-device-sync/SPEC.md) | [future/p07-encrypted-device-sync](https://github.com/djshellshoxxx/GhostPay/tree/future/p07-encrypted-device-sync) | P05, P06 |
| P08 | [Local payment linkability analysis](https://github.com/djshellshoxxx/GhostPay/blob/future/p08-linkability-analysis/docs/future/modules/P08-linkability-analysis/SPEC.md) | [future/p08-linkability-analysis](https://github.com/djshellshoxxx/GhostPay/tree/future/p08-linkability-analysis) | Existing core only |
| P09 | [Optional non-custodial gas service adapters](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md) | [future/p09-noncustodial-gas-services](https://github.com/djshellshoxxx/GhostPay/tree/future/p09-noncustodial-gas-services) | P02, P06, FEE01 |
| P10 | [Explicit private transaction submission](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md) | [future/p10-private-submission](https://github.com/djshellshoxxx/GhostPay/tree/future/p10-private-submission) | P02 |
| P11 | [Metadata minimization and bounded timing policy](https://github.com/djshellshoxxx/GhostPay/blob/future/p11-metadata-timing-policy/docs/future/modules/P11-metadata-timing-policy/SPEC.md) | [future/p11-metadata-timing-policy](https://github.com/djshellshoxxx/GhostPay/tree/future/p11-metadata-timing-policy) | Existing core only |
| P12 | [Selective-disclosure proof provider](https://github.com/djshellshoxxx/GhostPay/blob/future/p12-selective-disclosure-proofs/docs/future/modules/P12-selective-disclosure-proofs/SPEC.md) | [future/p12-selective-disclosure-proofs](https://github.com/djshellshoxxx/GhostPay/tree/future/p12-selective-disclosure-proofs) | P06 |
| P18 | [Telemetry minimization and release integrity](https://github.com/djshellshoxxx/GhostPay/blob/future/p18-telemetry-release-integrity/docs/future/modules/P18-telemetry-release-integrity/SPEC.md) | [future/p18-telemetry-release-integrity](https://github.com/djshellshoxxx/GhostPay/tree/future/p18-telemetry-release-integrity) | Existing core only |

### Research modules

| ID | Specification | Branch | Hard dependencies |
|---|---|---|---|
| P13 | [Confidential amount settlement research](https://github.com/djshellshoxxx/GhostPay/blob/future/p13-confidential-amounts/docs/future/modules/P13-confidential-amounts/SPEC.md) | [future/p13-confidential-amounts](https://github.com/djshellshoxxx/GhostPay/tree/future/p13-confidential-amounts) | P06 |
| P14 | [Non-custodial shielded payment research](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md) | [future/p14-shielded-payments](https://github.com/djshellshoxxx/GhostPay/tree/future/p14-shielded-payments) | P13, P06 |
| P15 | [User-controlled shielded exit research](https://github.com/djshellshoxxx/GhostPay/blob/future/p15-anonymous-withdrawals/docs/future/modules/P15-anonymous-withdrawals/SPEC.md) | [future/p15-anonymous-withdrawals](https://github.com/djshellshoxxx/GhostPay/tree/future/p15-anonymous-withdrawals) | P14 |
| P16 | [Shielded cross-chain transfer research](https://github.com/djshellshoxxx/GhostPay/blob/future/p16-shielded-cross-chain/docs/future/modules/P16-shielded-cross-chain/SPEC.md) | [future/p16-shielded-cross-chain](https://github.com/djshellshoxxx/GhostPay/tree/future/p16-shielded-cross-chain) | P14, P15 |
| P17 | [Privacy-preserving fee settlement outputs](https://github.com/djshellshoxxx/GhostPay/blob/future/p17-private-fee-outputs/docs/future/modules/P17-private-fee-outputs/SPEC.md) | [future/p17-private-fee-outputs](https://github.com/djshellshoxxx/GhostPay/tree/future/p17-private-fee-outputs) | P14, FEE01 |

### Optional service

| ID | Specification | Branch | Hard dependencies |
|---|---|---|---|
| P19 | [Optional self-hosted fee enforcement gateway](https://github.com/djshellshoxxx/GhostPay/blob/future/p19-optional-fee-gateway/docs/future/modules/P19-optional-fee-gateway/SPEC.md) | [future/p19-optional-fee-gateway](https://github.com/djshellshoxxx/GhostPay/tree/future/p19-optional-fee-gateway) | FEE01, P18 |

### Paid transfer workflows

| ID | Specification | Branch | Hard dependencies |
|---|---|---|---|
| T01 | [User-controlled staggered transfers](https://github.com/djshellshoxxx/GhostPay/blob/future/t01-staggered-transfers/docs/future/modules/T01-staggered-transfers/SPEC.md) | [future/t01-staggered-transfers](https://github.com/djshellshoxxx/GhostPay/tree/future/t01-staggered-transfers) | P05, P06, P11, FEE01 |
| T02 | [Self-controlled intermediary-address routing](https://github.com/djshellshoxxx/GhostPay/blob/future/t02-intermediary-routing/docs/future/modules/T02-intermediary-routing/SPEC.md) | [future/t02-intermediary-routing](https://github.com/djshellshoxxx/GhostPay/tree/future/t02-intermediary-routing) | P05, P06, P08, FEE01 |

### Shared fee policy

| ID | Specification | Branch | Hard dependencies |
|---|---|---|---|
| FEE01 | [Modular fee quotes, authorization and accounting](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md) | [future/fee01-modular-fee-policy](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) | P06 |

## Proposed build order

Dependency waves are not a release schedule. Same-wave modules can develop independently against agreed contracts. Optional integrations never become startup requirements.

1. P02, P06, P08, P11, P18.
2. F13, FEE01, P01, P03, P04, P05, P10, P12, P13.
3. F03, F04, F05, F06, F07, F08, F10, F11, F12, F14, F15, F16, F17, F18, P07, P09, P14, P19, T01, T02.
4. F01, F02, F09, P15, P17.
5. P16.

Refresh implementation/PR status before starting; retire gaps already delivered elsewhere. Research may remain unavailable without blocking independent local features.

## What each spec provides

- Scope, source provenance, concrete code reuse and remaining gaps.
- Module-owned interfaces, state, hard dependencies and optional ports.
- Failure/recovery, privacy exposure, input/resource limits, fees and decisions.
- Acceptance IDs, implementation slices, verification commands and migration/rollback.

Commands are planned implementation checks, not runtime tests claimed by this documentation task. Publication evidence is in [PUBLICATION.md](https://github.com/djshellshoxxx/GhostPay/blob/docs/ghostpay-future-module-specs-20261119/docs/future/modules/PUBLICATION.md).

## Instructions for subsequent workers

Read COMMON and the selected spec, then refresh main and active claims. Implement only when separately authorized. Keep one owner per provider API and submit provider changes before consumers. Never import a whole old branch to obtain one feature. Preserve disabled gates and independent recovery; record exact-source evidence before claiming completion.

## Concurrent F03 implementation lane

During publication, a separate worker created [future/f03-private-payment-links](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links) for active request-file implementation. Its observed head was dd665344d6290c109d2292093e01903e4770adff. This suite preserves that lane and gives F03 specifications their own branch, future/f03-private-payment-links-spec. Implementation status must be refreshed from that lane before starting F03 work.
