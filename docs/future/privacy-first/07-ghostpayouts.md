# FUTURE ONLY — GhostPayouts: private multi-recipient payouts

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Offer contractor and contributor payments without a provider-held payroll database or reusable recipient identifiers.

## Proposed user workflow

- User locally prepares recipient payouts or imports validated CSV
- App displays exact per-recipient destination, chain, amount, fees and linkability
- Authorized signer approves; local journal follows each independent payout to finality

## Future requirements and interfaces

- Distinct recipient payment intents and idempotency keys; never retry an unknown on-chain outcome blindly
- Use independently derived stealth destinations where supported
- Batching is optional; never claim one bulk treasury transfer is unlinkable
- Offer watch-only approval preparation and offline signing compatible with signer boundaries

## Privacy boundary and information that remains observable

- Common sender, amount and timing can reveal all payouts as a group
- Gas funding, fee recipients and relayers learn metadata
- Fresh destinations do not make public transaction graphs confidential

## Future acceptance and security tests

- Retry/crash/partial success does not double-pay; address lookalike and decimal limits checked
- Payout CSV injection, incorrect chain and forged recipient rejected
- Explicit visibility comparison for individual versus bundled payouts

## Dependencies and promotion criteria

Transaction review, local reconciliation, signer abstraction and stealth compatibility.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [split-payouts.md](../../remote/usability/specs/split-payouts.md)
- [batch-csv-import.md](../../remote/usability/specs/batch-csv-import.md)
