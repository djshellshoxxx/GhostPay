# FUTURE ONLY — GhostTips: privacy-first donations and tips

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Let recipients accept one-time tips through self-hosted signed tip pages without accounts or public donor directories.

## Proposed user workflow

- Recipient creates locally signed tip profile, supported chains and amount presets
- Donor chooses amount, reviews destination/fingerprint, then authorizes wallet payment
- Recipient's local scanner verifies payment finality and creates an optional private receipt

## Future requirements and interfaces

- Statically hostable signed versioned tip profile with expiry and verified merchant key
- Fresh stealth destination per payment; no reusable destination published by the tipping UI
- Optional recipient-encrypted notes; no account database, donor telemetry or remote leaderboard
- Repeated tips reconcile by independent transaction proof, not untrusted client event

## Privacy boundary and information that remains observable

- A published tip identity can link all its public tip requests
- Donor wallet addresses, transferred amounts, timing and eventual withdrawals remain observable on public chains
- Messages are private only from parties without decryption access; a donor may disclose their own identity

## Future acceptance and security tests

- Independent client verifies signed profile, expiry and supported assets
- Multiple tips derive distinct destinations and reconcile without duplicated receipt
- No recipient or donor notes appear in URLs, logs, telemetry or wallet RPC requests

## Dependencies and promotion criteria

Invoice links, identity signing, scanning/reconciliation and verified chain deployments.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [quick-request.md](../../remote/usability/specs/quick-request.md)
- [03-per-client-meta-addresses.md](../../specs/ideas/03-per-client-meta-addresses.md)
