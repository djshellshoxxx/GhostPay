# FUTURE ONLY — Per-client payment and invoice identity separation

> **STATUS: FUTURE ONLY / NOT APPROVED / NOT SCHEDULED / NOT ACTIVE / NOT PART OF BETA.**
>
> This is an architectural proposal dated 2026-11-09. It contains no code, authorization to begin implementation, CI gates or release commitments. A similarly named existing component may already be partly implemented: verify the current repository before treating any requirement as missing.

## Purpose

Avoid trivially linking different customers' invoices by static meta-address and signing-key reuse.

## Proposed user workflow

- Merchant creates independent child identity per customer/project with optional local labels
- Each child signs invoices and receives independently derived stealth payments
- Backup and watch-only scan discover all active children with bounded scan workload

## Future requirements and interfaces

- No novel derivation coding until existing ADR is accepted and independently tested
- Child derivation MUST separate spend/view/invoice signing keys and preserve recoverable index allocation
- Define legacy keystore migration and single-writer child-index semantics
- Scans should include active and catch-up identities without permanent omission

## Privacy boundary and information that remains observable

- No protection against social disclosure or transaction graph/timing correlations
- Merchant public profile can still link their openly published child identities
- Same-client repeated invoices may remain intentionally linkable

## Future acceptance and security tests

- Independent vectors, collision/recovery tests and legacy migration validated
- Invoices from different children share no signer/meta bytes
- Restored device can find funds without leaking child list to a required service

## Dependencies and promotion criteria

Approved derivation ADR, independent cryptographic assessment, scanner and backup extensions.

**Activation gate:** Explicit owner authorization, source/PR conflict review, accepted design and privacy threat-model update, reproducible acceptance tests, independent security review where applicable, and separate deployment qualification. This specification must not be added to a current release blocker or automated development queue without a new decision.

## Related existing GhostPay design (not proof of production readiness)

- [03-per-client-meta-addresses.md](../../specs/ideas/03-per-client-meta-addresses.md)
- [14-embed-merchant-profile.md](../../specs/14-embed-merchant-profile.md)
