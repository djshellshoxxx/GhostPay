# FUTURE ONLY — GhostPOS: private in-person QR checkout

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Accept local retail payments without a mandatory centralized POS operator or buyer customer profile.

## Proposed user workflow

- Merchant prepares signed short-lived one-time QR at terminal
- Customer checks merchant fingerprint, asset, chain and total in their wallet
- Terminal independently verifies pending/paid/expired/partial states and stores encrypted local receipt

## Future requirements and interfaces

- Extend the existing POS reducer and QR payload constraints; preserve tested state rules
- Use unique sale/session ID, bounded TTL, signed invoice binding and independent finality verification
- Never treat screenshot or wallet 'submitted' notice as completed settlement
- Do not require camera telemetry, printer cloud, customer login or external transaction database

## Privacy boundary and information that remains observable

- In-person cameras/merchant observations and public chain data can still identify parties
- A reused public merchant profile links sales to the business
- Offline QR preparation is possible; offline on-chain confirmation is not

## Future acceptance and security tests

- Second and subsequent sales work without refresh; stale/replayed QR rejected
- Partial and overpaid amounts correctly reconciled after network restoration
- Offline mode cannot falsely display finality

## Dependencies and promotion criteria

QR scanner, signed invoice, payment reconciliation and operator testing.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [pos-terminal.md](../../remote/usability/specs/pos-terminal.md)
- [qr-scan.md](../../remote/usability/specs/qr-scan.md)
