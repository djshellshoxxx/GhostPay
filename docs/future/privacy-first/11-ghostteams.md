# FUTURE ONLY — GhostTeams: encrypted merchant collaboration

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Support local-first organization operations without sharing master spending keys or mandatory staff accounts.

## Proposed user workflow

- Owner prepares scoped signed invitations for invoice drafting, reconciliation or payout review
- Authorized member receives encrypted work material and only the allowed capabilities
- Owner revokes future access, rotates keys and exports auditable local activity

## Future requirements and interfaces

- Distinct view, invoice-author, payout-propose and payout-sign authority types; capability expiry and domain separation
- No shared hot seed across employees; watch-only members cannot sign
- Optional encrypted relay must not hold plaintext keys or merchant books
- Role changes and encrypted sync conflicts are versioned and signed

## Privacy boundary and information that remains observable

- A revoked member can retain plaintext previously received; no retroactive deletion guarantee
- Relays and collaborators may observe timing and communication metadata
- Shared balances may reveal customer relationships within a team

## Future acceptance and security tests

- Unauthorized role escalation, replay and signature tampering rejected
- Watch-only accounts cannot initiate spending
- Revocation and offline merge conflict behavior tested with adversarial cases

## Dependencies and promotion criteria

Scoped signer boundary, encrypted sharing, local vault and audited key management.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [multisig-merchant.md](../../remote/usability/specs/multisig-merchant.md)
- [profiles.md](../../remote/usability/specs/profiles.md)
