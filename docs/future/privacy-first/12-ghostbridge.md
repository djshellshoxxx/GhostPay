# FUTURE ONLY — GhostBridge: optional private P2P-Offramp handoff

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Connect private crypto payments and P2P trades without making GhostPay dependent on a brokerage, escrow or centralized coordinator.

## Proposed user workflow

- User explicitly enables GhostBridge and requests 'Acquire crypto' or 'Convert'
- User reviews signed intent, exchange terms, asset/network, counterparty disclosures and fees
- External P2P-Offramp trade completes separately; GhostPay independently verifies its own payment status

## Future requirements and interfaces

- Separate versioned signed, domain-separated handoff messages; no shared viewing/spending keys
- Trade status must distinguish crypto escrowed, fiat claimed, fiat verified by user/evidence, and escrow released
- No silent funds movement or automatic fiat settlement claims
- Disabled GhostBridge must result in no P2P-Offramp endpoint requests

## Privacy boundary and information that remains observable

- Counterparties, banks and transfer services may learn identifying details
- Escrow and publicly visible chain movements remain linkable by amounts/timing
- No claim of atomic fiat-to-crypto payment across disparate systems

## Future acceptance and security tests

- Tampered, replayed, expired, wrong-chain and substituted quotes fail closed
- Resumable recovery and status reconciliation independent of partner availability
- Fiat settlement is never marked verified solely on the basis of on-chain transfer

## Dependencies and promotion criteria

Independent bridge SDK/versioned protocol plus qualified external escrow workflows.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [typed-sdk.md](../../remote/usability/specs/typed-sdk.md)
- [07-selective-disclosure-receipts.md](../../specs/ideas/07-selective-disclosure-receipts.md)
