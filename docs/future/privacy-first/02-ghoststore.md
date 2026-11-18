# FUTURE ONLY — GhostStore: privacy-first static storefronts

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Enable merchant catalogs, digital goods and checkout without a GhostPay-operated commerce backend or customer database.

## Proposed user workflow

- Merchant signs a versioned static catalog with prices, accepted assets and product hashes
- Buyer chooses item and confirms signed invoice with exact chain and fee preview
- Successful finalized payment enables explicit digital fulfillment or a separately consented physical-shipping exchange

## Future requirements and interfaces

- Never trust displayed HTML price alone: verify signed invoice and product/price commitment
- Encrypted digital delivery packages may be distributed via untrusted content-addressed storage; keys delivered only after verified entitlement
- Fulfillment state is locally journaled and replay-idempotent, including unknown or reorg outcomes
- Stock limitations are disclosed: a purely static storefront cannot guarantee globally exclusive inventory

## Privacy boundary and information that remains observable

- Public catalogs reveal products, merchant identity and advertised prices
- Digital hosting can observe downloads; physical shipping requires disclosure to seller/carrier
- Purchases remain visible on-chain; a static shop does not imply anonymous fulfillment

## Future acceptance and security tests

- Reject tampered price, forged catalog, wrong chain and expired offers
- Payment-to-delivery binding survives reload without double delivery
- No mandatory customer account, analytics, remote commerce API or unapproved outbound calls

## Dependencies and promotion criteria

Payment verification, signed merchant profile, encrypted storage and fulfilled-entitlement spec.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [payment-buttons.md](../../remote/usability/specs/payment-buttons.md)
- [embed-snippet.md](../../remote/usability/specs/embed-snippet.md)
