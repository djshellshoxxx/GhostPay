# FUTURE ONLY — Optional privacy-aware fiat conversion

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Let users inspect fiat conversion options without pretending that banks, liquidity providers or counterparties can be made private.

## Proposed user workflow

- App displays comparable user-requested signed quotes including network, fees and expiry
- Before handoff, user previews exactly which invoice/payment information may be shared
- Fiat delivery, crypto escrow and final receipt are tracked as distinct states

## Future requirements and interfaces

- No mandatory off-ramp provider, onboarding or remote account for core GhostPay
- No automatic quote-provider calls until user opts in
- Treat provider prices/receipts as untrusted and label source, timestamp, asset and payment finality
- Display reversible fiat settlement risk separately from blockchain settlement

## Privacy boundary and information that remains observable

- Fiat rails may identify parties and expose financial records; anonymity is not guaranteed
- Counterparty may learn phone/contact/bank details when users choose to share
- Cross-system timing and amounts may correlate movements

## Future acceptance and security tests

- Provider disabled means no provider connections
- Expired quote, provider outage and fee/currency mismatch fail closed
- UI never labels fiat irreversibly settled without verified independent evidence

## Dependencies and promotion criteria

Explicitly authorized external adapter, GhostBridge handoff, supported jurisdiction/regulatory assessment.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [fiat-display.md](../../remote/usability/specs/fiat-display.md)
- [03-fiat-price-feeds.md](../../specs/03-fiat-price-feeds.md)
