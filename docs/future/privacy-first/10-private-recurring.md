# FUTURE ONLY — Privacy-first recurring invoices and subscriptions

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Extend existing recurring invoice components with local-only schedules and payer-controlled consentful renewals.

## Proposed user workflow

- Merchant keeps encrypted schedule, invoice template and optional contact aliases
- Due reminder is generated locally or exported through an explicitly selected channel
- Payer independently authorizes every renewal; merchants can pause/cancel locally

## Future requirements and interfaces

- Reuse already specified/implemented merchant-billing schedule functionality; this is a FUTURE privacy enhancement
- No mandatory subscription server, remote notification or merchant-controlled token pull
- Clear explicit deadline, schedule anchor, pause/resume and missed-payment states
- Any autonomous delegated authorization is out of scope pending separate cryptographic review

## Privacy boundary and information that remains observable

- Repeat time and amount patterns can link on-chain payments
- Email/chat reminder providers and merchants observe deliberately sent details
- Local scheduling does not eliminate recipient or payer linkage from published profiles

## Future acceptance and security tests

- No background billing or network traffic; every transfer needs consent
- Calendar edge cases, duplicate reminders and restarts deterministic
- Feature-disabled build does not contact notification providers

## Dependencies and promotion criteria

Existing merchant billing, encrypted local store, reminders and invoice verification.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [subscriptions.md](../../remote/usability/specs/subscriptions.md)
- [recurring.md](../../remote/usability/specs/recurring.md)
